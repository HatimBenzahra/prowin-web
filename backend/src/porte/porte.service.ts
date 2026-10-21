import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreatePorteInput, UpdatePorteInput, StatutPorte } from './porte.dto';
import {
  StatisticSyncService,
  acteursDesPortes,
} from '../statistic/statistic-sync.service';
import { ImmeubleAccessService } from '../immeuble/immeuble-access.service';
import { getAllStatuses } from './porte-status.constants';
import { shouldIncrementRepassages } from './porte.repassage';

@Injectable()
export class PorteService {
  constructor(
    private prisma: PrismaService,
    private statisticSyncService: StatisticSyncService,
    private immeubleAccess: ImmeubleAccessService,
  ) {}

  /**
   * Auteur d'un passage terrain : seuls un commercial ou un manager prospectent.
   * Une correction directeur/admin ne change pas l'auteur du dernier passage.
   */
  private acteurPassage(
    userId: number,
    userRole: string,
  ): {
    dernierCommercialId: number | null;
    dernierManagerId: number | null;
  } | null {
    switch (userRole) {
      case 'commercial':
        return { dernierCommercialId: userId, dernierManagerId: null };
      case 'manager':
        return { dernierCommercialId: null, dernierManagerId: userId };
      default:
        return null;
    }
  }

  /**
   * Auteur retenu pour une correction directeur/admin : l'auteur du dernier
   * passage reste inchangé ; à défaut (porte jamais attribuée), le créateur de
   * l'immeuble, pour que la porte compte pour quelqu'un.
   */
  private auteurCorrection(porte: {
    dernierCommercialId: number | null;
    dernierManagerId: number | null;
    immeuble: { commercialId: number | null; managerId: number | null };
  }): {
    dernierCommercialId: number | null;
    dernierManagerId: number | null;
  } | null {
    if (porte.dernierCommercialId !== null || porte.dernierManagerId !== null) {
      return {
        dernierCommercialId: porte.dernierCommercialId,
        dernierManagerId: porte.dernierManagerId,
      };
    }
    if (porte.immeuble.commercialId !== null) {
      return {
        dernierCommercialId: porte.immeuble.commercialId,
        dernierManagerId: null,
      };
    }
    if (porte.immeuble.managerId !== null) {
      return {
        dernierCommercialId: null,
        dernierManagerId: porte.immeuble.managerId,
      };
    }
    return null;
  }

  /**
   * Portes de l'agenda personnel : un commercial ne voit que celles dont il est
   * l'auteur du dernier passage (pas celles d'un coéquipier sur un immeuble
   * partagé). Les autres rôles gardent leur périmètre.
   */
  private acteurPorteWhere(
    userId: number,
    userRole: string,
  ): Prisma.PorteWhereInput {
    return userRole === 'commercial' ? { dernierCommercialId: userId } : {};
  }

  /** Une porte créée déjà prospectée compte pour son créateur. */
  private withActeurCreation(
    createPorteInput: CreatePorteInput,
    userId: number,
    userRole: string,
  ) {
    const prospectee =
      createPorteInput.statut !== undefined &&
      createPorteInput.statut !== StatutPorte.NON_VISITE;
    const acteur = prospectee ? this.acteurPassage(userId, userRole) : null;
    return { ...createPorteInput, ...acteur };
  }

  async create(
    createPorteInput: CreatePorteInput,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : on ne peut créer une porte que sur un immeuble accessible.
    await this.immeubleAccess.ensureImmeubleAccess(
      createPorteInput.immeubleId,
      userId,
      userRole,
    );
    return this.prisma.porte.create({
      data: this.withActeurCreation(createPorteInput, userId, userRole),
    });
  }

  async findAll(userId: number, userRole: string) {
    // Anti-IDOR : ne renvoyer que les portes des immeubles accessibles.
    return this.prisma.porte.findMany({
      where: {
        immeuble: this.immeubleAccess.accessWhere(userId, userRole),
      },
      include: {
        immeuble: true,
      },
    });
  }

  async findOne(id: number, userId: number, userRole: string) {
    return this.immeubleAccess.ensurePorteAccess(id, userId, userRole);
  }

  /**
   * Prénom de l'auteur du dernier passage (champ `Porte.dernierActeurPrenom`).
   * `findUnique` : Prisma regroupe ces appels en une requête sur une liste de portes.
   */
  async findDernierActeurPrenom(porteId: number): Promise<string | null> {
    const porte = await this.prisma.porte.findUnique({
      where: { id: porteId },
      select: {
        dernierCommercial: { select: { prenom: true } },
        dernierManager: { select: { prenom: true } },
      },
    });
    return (
      porte?.dernierCommercial?.prenom ?? porte?.dernierManager?.prenom ?? null
    );
  }

  async findByImmeuble(
    immeubleId: number,
    userId: number,
    userRole: string,
    skip?: number,
    take?: number,
    etage?: number,
  ) {
    await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

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
    const currentPorte = await this.immeubleAccess.ensurePorteAccess(
      id,
      userId,
      userRole,
    );

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

    // 3. Mettre à jour la porte. Un nouveau passage (changement de statut ou
    //    `derniereVisite` posée, cf. `porte.repassage.ts`) repart d'une date vierge :
    //    la date d'un ancien RDV ne doit pas survivre sur une repasse, ni une date
    //    de repasse effacée par le commercial.
    const statutChanged = data.statut && data.statut !== oldStatut;
    const nouveauPassage = statutChanged || Boolean(data.derniereVisite);
    // Un changement de statut = un passage attribué à son auteur réel (même règle
    // que l'historique) : la porte compte désormais dans ses statistiques.
    // Correction directeur/admin : l'auteur du dernier passage est conservé.
    const acteur =
      this.acteurPassage(userId, userRole) ??
      this.auteurCorrection(currentPorte);
    const passage = statutChanged && acteur ? { ...data, ...acteur } : data;
    const updatedPorte = await this.prisma.porte.update({
      where: { id },
      data: nouveauPassage
        ? {
            ...passage,
            rdvDate: data.rdvDate ?? null,
            rdvTime: data.rdvTime ?? null,
          }
        : passage,
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
    const contratsChanged =
      data.nbContrats !== undefined &&
      data.nbContrats !== currentPorte.nbContrats;
    if (statutChanged || contratsChanged) {
      try {
        // Auteur actuel ET précédent : une porte repassée par un autre membre
        // sort des stats de l'un pour entrer dans celles de l'autre.
        await this.statisticSyncService.syncActeursStats(
          acteursDesPortes([currentPorte, updatedPorte]),
        );
      } catch (error) {
        // Log l'erreur mais ne fait pas échouer la mise à jour de la porte
        console.error('Erreur sync statistiques:', error);
      }
    }

    if (statutChanged && data.statut) {
      // Enregistrer dans l'historique si le statut a changé
      try {
        // Seul l'auteur du passage est enregistré : l'acteur terrain, ou pour
        // une correction directeur/admin l'auteur conservé (cf. auteurCorrection).
        await this.prisma.statusHistorique.create({
          data: {
            porteId: id,
            statut: data.statut,
            commentaire: data.commentaire || null,
            rdvDate: data.rdvDate || null,
            rdvTime: data.rdvTime || null,
            duree: data.duree ?? null,
            commercialId: acteur?.dernierCommercialId ?? null,
            managerId: acteur?.dernierManagerId ?? null,
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
    const porte = await this.immeubleAccess.ensurePorteAccess(
      id,
      userId,
      userRole,
    );

    const deleted = await this.prisma.porte.delete({
      where: { id },
    });
    await this.statisticSyncService.syncAuteursPortesSupprimees([porte]);
    return deleted;
  }

  async createPortesForImmeuble(
    immeubleId: number,
    nbEtages: number,
    nbPortesParEtage: number,
    userId: number,
    userRole: string,
  ) {
    await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

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
    await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );
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
    getAllStatuses().forEach((status) => {
      statusCounts[status] = 0;
    });

    // Remplir avec les vrais comptages
    portesGrouped.forEach((group) => {
      statusCounts[group.statut] = group._count.statut;
    });

    // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats au lieu du simple count
    const contratsSignesGroup = portesGrouped.find(
      (g) => g.statut === StatutPorte.CONTRAT_SIGNE,
    );
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

    const portesParEtage = etagesGrouped.map((group) => ({
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
      await this.immeubleAccess.ensureImmeubleAccess(
        immeubleId,
        userId,
        userRole,
      );
      whereClause.immeubleId = immeubleId;
    } else if (userRole === 'admin') {
      // Admin peut voir toutes les portes modifiées
    } else {
      const accessibleImmeubles = await this.prisma.immeuble.findMany({
        where: this.immeubleAccess.accessWhere(userId, userRole),
        select: { id: true },
      });

      if (!accessibleImmeubles.length) {
        return [];
      }

      whereClause.immeubleId = {
        in: accessibleImmeubles.map((i) => i.id),
      };
      Object.assign(whereClause, this.acteurPorteWhere(userId, userRole));
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
    const filter = this.immeubleAccess.accessWhere(userId, userRole);
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
        ...this.acteurPorteWhere(userId, userRole),
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
    await this.immeubleAccess.ensurePorteAccess(porteId, userId, userRole);
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
  async createCapped(
    createPorteInput: CreatePorteInput,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : on ne peut créer une porte que sur un immeuble accessible.
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      createPorteInput.immeubleId,
      userId,
      userRole,
    );
    if (
      createPorteInput.etage < 1 ||
      createPorteInput.etage > immeuble.nbEtages
    ) {
      throw new BadRequestException(
        `Étage ${createPorteInput.etage} invalide (1 à ${immeuble.nbEtages}).`,
      );
    }
    const count = await this.prisma.porte.count({
      where: {
        immeubleId: createPorteInput.immeubleId,
        etage: createPorteInput.etage,
      },
    });
    if (count >= immeuble.nbPortesParEtage) {
      throw new BadRequestException(
        `L'étage ${createPorteInput.etage} a déjà atteint sa capacité (${immeuble.nbPortesParEtage} portes).`,
      );
    }
    return this.prisma.porte.create({
      data: this.withActeurCreation(createPorteInput, userId, userRole),
    });
  }

  async getStatusHistoriqueByImmeuble(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    // Anti-IDOR : vérifier l'accès à l'immeuble.
    await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );
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
