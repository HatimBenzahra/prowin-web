import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreatePorteInput, UpdatePorteInput, StatutPorte } from './porte.dto';
import { StatisticSyncService } from '../statistic/statistic-sync.service';
import { getAllStatuses } from './porte-status.constants';
import { shouldIncrementRepassages } from './porte.repassage';

@Injectable()
export class PorteService {
  constructor(
    private prisma: PrismaService,
    private statisticSyncService: StatisticSyncService
  ) {}

  private validateImmeubleOwnership(
    immeuble: any,
    userId: number,
    userRole: string,
  ) {
    if (userRole === 'admin') {
      return;
    }

    if (userRole === 'commercial' && immeuble.commercialId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'manager') {
      const ownsImmeuble =
        immeuble.managerId === userId ||
        immeuble.commercial?.managerId === userId ||
        immeuble.zone?.managerId === userId;

      if (!ownsImmeuble) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (userRole === 'directeur') {
      const ownsImmeuble =
        immeuble.manager?.directeurId === userId ||
        immeuble.commercial?.directeurId === userId ||
        immeuble.zone?.directeurId === userId;

      if (!ownsImmeuble) {
        throw new ForbiddenException('Access denied');
      }
    }
  }

  private async ensureImmeubleAccess(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.prisma.immeuble.findUnique({
      where: { id: immeubleId },
      include: {
        commercial: {
          select: { id: true, managerId: true, directeurId: true },
        },
        manager: {
          select: { id: true, directeurId: true },
        },
        zone: {
          select: { id: true, managerId: true, directeurId: true },
        },
      },
    });

    if (!immeuble) {
      throw new NotFoundException('Immeuble not found');
    }

    this.validateImmeubleOwnership(immeuble, userId, userRole);

    return immeuble;
  }

  private async ensurePorteAccess(
    porteId: number,
    userId: number,
    userRole: string,
  ) {
    const porte = await this.prisma.porte.findUnique({
      where: { id: porteId },
      include: {
        immeuble: {
          include: {
            commercial: {
              select: { id: true, managerId: true, directeurId: true },
            },
            manager: {
              select: { id: true, directeurId: true },
            },
            zone: {
              select: { id: true, managerId: true, directeurId: true },
            },
          },
        },
      },
    });

    if (!porte) {
      throw new NotFoundException('Porte not found');
    }

    this.validateImmeubleOwnership(porte.immeuble, userId, userRole);

    return porte;
  }

  private buildImmeubleAccessFilter(userId: number, userRole: string) {
    switch (userRole) {
      case 'admin':
        return {};

      case 'directeur':
        return {
          OR: [
            { commercial: { directeurId: userId } },
            { manager: { directeurId: userId } },
            { zone: { directeurId: userId } },
          ],
        };

      case 'manager':
        return {
          OR: [
            { managerId: userId },
            { commercial: { managerId: userId } },
            { zone: { managerId: userId } },
          ],
        };

      case 'commercial':
        return {
          commercialId: userId,
        };

      default:
        return { id: -1 };
    }
  }

  async create(createPorteInput: CreatePorteInput, userId: number, userRole: string) {
    // Anti-IDOR : on ne peut créer une porte que sur un immeuble accessible.
    await this.ensureImmeubleAccess(createPorteInput.immeubleId, userId, userRole);
    return this.prisma.porte.create({
      data: createPorteInput,
    });
  }

  async findAll(userId: number, userRole: string) {
    // Anti-IDOR : ne renvoyer que les portes des immeubles accessibles.
    return this.prisma.porte.findMany({
      where: {
        immeuble: this.buildImmeubleAccessFilter(userId, userRole),
      },
      include: {
        immeuble: true,
      },
    });
  }

  async findOne(id: number, userId: number, userRole: string) {
    return this.ensurePorteAccess(id, userId, userRole);
  }

  async findByImmeuble(
    immeubleId: number,
    userId: number,
    userRole: string,
    skip?: number,
    take?: number,
    etage?: number,
  ) {
    await this.ensureImmeubleAccess(immeubleId, userId, userRole);

    const where: any = { immeubleId };
    if (etage) {
      where.etage = etage;
    }

    return this.prisma.porte.findMany({
      where,
      orderBy: [{ etage: 'asc' }, { numero: 'asc' }],
      skip,
      take,
    });
  }

  async update(
    updatePorteInput: UpdatePorteInput,
    userId: number,
    userRole: string,
  ) {
    const { id, ...data } = updatePorteInput;

    // 1. Récupérer l'état actuel pour détecter les changements
    const currentPorte = await this.ensurePorteAccess(id, userId, userRole);

    const oldStatut = currentPorte.statut;

    // 2. Compter les passages sur une porte laissée absente.
    //    Règle et tests : `porte.repassage.ts`.
    if (
      shouldIncrementRepassages({
        nouveauStatut: data.statut,
        statutActuel: currentPorte.statut,
        derniereVisite: data.derniereVisite,
      })
    ) {
      data.nbRepassages = (currentPorte.nbRepassages || 0) + 1;
    }

    // 3. Mettre à jour la porte
    const updatedPorte = await this.prisma.porte.update({
      where: { id },
      data,
      include: {
        immeuble: true,
      },
    });

    // 4. Mettre à jour le timestamp de l'immeuble (tri du plus récent au plus ancien)
    await this.prisma.immeuble.update({
      where: { id: updatedPorte.immeubleId },
      data: { updatedAt: new Date() },
    });

    // Synchroniser les statistiques si le statut OU le nbContrats a changé.
    // Modifier nbContrats sur une porte CONTRAT_SIGNE doit aussi mettre à jour
    // les stats agrégées (contratsSignes = somme des nbContrats par jour).
    const statutChanged = data.statut && data.statut !== oldStatut;
    const contratsChanged =
      data.nbContrats !== undefined &&
      data.nbContrats !== currentPorte.nbContrats;
    if (statutChanged || contratsChanged) {
      try {
        await this.statisticSyncService.syncCommercialStats(updatedPorte.immeubleId);
      } catch (error) {
        // Log l'erreur mais ne fait pas échouer la mise à jour de la porte
        console.error('Erreur sync statistiques:', error);
      }

    }

    if (statutChanged && data.statut) {
      // Enregistrer dans l'historique si le statut a changé
      try {
        // Déterminer si c'est un commercial ou un manager qui fait la modification
        const immeuble = await this.prisma.immeuble.findUnique({
          where: { id: updatedPorte.immeubleId },
          select: { commercialId: true, managerId: true },
        });

        await this.prisma.statusHistorique.create({
          data: {
            porteId: id,
            statut: data.statut,
            commentaire: data.commentaire || null,
            rdvDate: data.rdvDate || null,
            rdvTime: data.rdvTime || null,
            duree: data.duree ?? null,
            commercialId: userRole === 'commercial' ? userId : immeuble?.commercialId,
            managerId: userRole === 'manager' ? userId : immeuble?.managerId,
          },
        });
      } catch (error) {
        // Log l'erreur mais ne fait pas échouer la mise à jour de la porte
        console.error('Erreur enregistrement historique:', error);
      }
    }

    return updatedPorte;
  }

  async remove(id: number, userId: number, userRole: string) {
    await this.ensurePorteAccess(id, userId, userRole);

    return this.prisma.porte.delete({
      where: { id },
    });
  }

  async createPortesForImmeuble(
    immeubleId: number,
    nbEtages: number,
    nbPortesParEtage: number,
    userId: number,
    userRole: string,
  ) {
    await this.ensureImmeubleAccess(immeubleId, userId, userRole);

    const portes: any[] = [];

    for (let etage = 1; etage <= nbEtages; etage++) {
      for (let porte = 1; porte <= nbPortesParEtage; porte++) {
        portes.push({
          numero: `${etage}${porte.toString().padStart(2, '0')}`,
          etage,
          immeubleId,
          statut: 'NON_VISITE',
          nbRepassages: 0,
        });
      }
    }

    return this.prisma.porte.createMany({
      data: portes,
      skipDuplicates: true,
    });
  }

  async getStatistiquesPortes(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : vérifier l'accès à l'immeuble avant d'exposer ses statistiques.
    await this.ensureImmeubleAccess(immeubleId, userId, userRole);
    const whereClause = { immeubleId };

    // Utiliser groupBy pour compter tous les statuts dynamiquement
    const portesGrouped = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: whereClause,
      _count: {
        statut: true,
      },
      _sum: {
        nbContrats: true,
      },
    });

    const totalPortes = await this.prisma.porte.count({ where: whereClause });

    // Créer un objet avec tous les compteurs initialisés à 0
    const statusCounts: Record<string, number> = {};
    getAllStatuses().forEach(status => {
      statusCounts[status] = 0;
    });

    // Remplir avec les vrais comptages
    portesGrouped.forEach(group => {
      statusCounts[group.statut] = group._count.statut;
    });

    // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats au lieu du simple count
    const contratsSignesGroup = portesGrouped.find(g => g.statut === StatutPorte.CONTRAT_SIGNE);
    const totalContratsSignes = contratsSignesGroup?._sum?.nbContrats || 0;

    // Statistiques par étage
    const etagesGrouped = await this.prisma.porte.groupBy({
      by: ['etage'],
      where: whereClause,
      _count: {
        _all: true,
      },
      orderBy: {
        etage: 'asc',
      },
    });

    const portesParEtage = etagesGrouped.map(group => ({
      etage: group.etage,
      count: group._count._all,
    }));

    return {
      totalPortes,
      contratsSigne: totalContratsSignes, // Somme des nbContrats au lieu du count de portes
      rdvPris: statusCounts[StatutPorte.RENDEZ_VOUS_PRIS],
      absent: statusCounts[StatutPorte.ABSENT],
      argumente: statusCounts[StatutPorte.ARGUMENTE],
      refus: statusCounts[StatutPorte.REFUS],
      nonVisitees: statusCounts[StatutPorte.NON_VISITE],
      necessiteRepassage: statusCounts[StatutPorte.NECESSITE_REPASSAGE],
      portesVisitees: totalPortes - statusCounts[StatutPorte.NON_VISITE],
      tauxConversion:
        totalPortes > 0
          ? ((totalContratsSignes / totalPortes) * 100).toFixed(2)
          : '0',
      portesParEtage, // NEW
    };
  }

  async findModifiedToday(
    immeubleId?: number,
    userId?: number,
    userRole?: string,
  ) {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('Access denied');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const whereClause: any = {
      updatedAt: {
        gte: today,
        lt: tomorrow,
      },
      statut: {
        not: StatutPorte.NON_VISITE, // Exclure les portes non visitées
      },
    };

    if (immeubleId) {
      await this.ensureImmeubleAccess(immeubleId, userId, userRole);
      whereClause.immeubleId = immeubleId;
    } else if (userRole === 'admin') {
      // Admin peut voir toutes les portes modifiées
    } else {
      const accessibleImmeubles = await this.prisma.immeuble.findMany({
        where: this.buildImmeubleAccessFilter(userId, userRole),
        select: { id: true },
      });

      if (!accessibleImmeubles.length) {
        return [];
      }

      whereClause.immeubleId = {
        in: accessibleImmeubles.map((i) => i.id),
      };
    }

    return this.prisma.porte.findMany({
      where: whereClause,
      include: {
        immeuble: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findRdvToday(userId: number, userRole: string) {
    const filter = this.buildImmeubleAccessFilter(userId, userRole);
    let immeubleIds: number[] | undefined;

    if (userRole !== 'admin') {
      const accessibleImmeubles = await this.prisma.immeuble.findMany({
        where: filter,
        select: { id: true },
      });

      if (!accessibleImmeubles.length) {
        return [];
      }

      immeubleIds = accessibleImmeubles.map((i) => i.id);
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Format YYYY-MM-DD

    return this.prisma.porte.findMany({
      where: {
        statut: StatutPorte.RENDEZ_VOUS_PRIS,
        rdvDate: {
          gte: new Date(todayStr),
          lt: new Date(new Date(todayStr).getTime() + 24 * 60 * 60 * 1000),
        },
        ...(immeubleIds && { immeubleId: { in: immeubleIds } }),
      },
      include: {
        immeuble: {
          include: {
            zone: true,
          },
        },
      },
      orderBy: {
        rdvTime: 'asc',
      },
    });
  }

  // ============= STATUS HISTORIQUE METHODS =============

  /**
   * Récupère l'historique complet des statuts d'une porte
   * Trié du plus récent au plus ancien
   */
  async getStatusHistoriqueByPorte(
    porteId: number,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : vérifier l'accès à la porte (via son immeuble).
    await this.ensurePorteAccess(porteId, userId, userRole);
    return this.prisma.statusHistorique.findMany({
      where: { porteId },
      include: {
        commercial: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
        manager: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Récupère l'historique des statuts d'un immeuble
   */
  async createCapped(createPorteInput: CreatePorteInput, userId: number, userRole: string) {
    const immeuble = await this.prisma.immeuble.findUnique({
      where: { id: createPorteInput.immeubleId },
      select: {
        id: true,
        nbPortesParEtage: true,
        nbEtages: true,
        commercialId: true,
        managerId: true,
        zoneId: true,
        commercial: {
          select: { id: true, managerId: true, directeurId: true },
        },
        manager: {
          select: { id: true, directeurId: true },
        },
        zone: {
          select: { id: true, managerId: true, directeurId: true },
        },
      },
    });
    if (!immeuble) {
      throw new NotFoundException(`Immeuble ${createPorteInput.immeubleId} introuvable`);
    }
    // Anti-IDOR : valider l'ownership de l'immeuble cible avant création.
    this.validateImmeubleOwnership(immeuble, userId, userRole);
    if (createPorteInput.etage < 1 || createPorteInput.etage > immeuble.nbEtages) {
      throw new BadRequestException(
        `Étage ${createPorteInput.etage} invalide (1 à ${immeuble.nbEtages}).`,
      );
    }
    const count = await this.prisma.porte.count({
      where: { immeubleId: createPorteInput.immeubleId, etage: createPorteInput.etage },
    });
    if (count >= immeuble.nbPortesParEtage) {
      throw new BadRequestException(
        `L'étage ${createPorteInput.etage} a déjà atteint sa capacité (${immeuble.nbPortesParEtage} portes).`,
      );
    }
    return this.prisma.porte.create({ data: createPorteInput });
  }

  async getStatusHistoriqueByImmeuble(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : vérifier l'accès à l'immeuble.
    await this.ensureImmeubleAccess(immeubleId, userId, userRole);
    return this.prisma.statusHistorique.findMany({
      where: {
        porte: {
          immeubleId,
        },
      },
      include: {
        porte: {
          select: {
            id: true,
            numero: true,
            etage: true,
          },
        },
        commercial: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
        manager: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
