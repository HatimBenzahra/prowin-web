import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { prodImmeubleWhere } from '../enumeration-Status/prod-immeuble-where.util';
import { CreateCommercialInput, UpdateCommercialInput } from './commercial.dto';
import { UserType } from '../zone/zone.dto';

@Injectable()
export class CommercialService {
  constructor(private prisma: PrismaService) {}

  private async ensureAccess(
    commercialId: number,
    userId: number,
    userRole: string,
  ) {
    const commercial = await this.prisma.commercial.findUnique({
      where: { id: commercialId },
      select: {
        id: true,
        managerId: true,
        directeurId: true,
      },
    });

    if (!commercial) {
      throw new NotFoundException('Commercial not found');
    }

    if (userRole === 'admin') {
      return commercial;
    }

    if (userRole === 'directeur' && commercial.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'manager' && commercial.managerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'commercial' && commercial.id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return commercial;
  }

  async create(data: CreateCommercialInput) {
    // Si un managerId est fourni, récupérer automatiquement le directeurId du manager
    let directeurId = data.directeurId;

    if (data.managerId && !directeurId) {
      const manager = await this.prisma.manager.findUnique({
        where: { id: data.managerId },
        select: { directeurId: true },
      });

      if (manager?.directeurId) {
        directeurId = manager.directeurId;
      }
    }

    return this.prisma.commercial.create({
      data: {
        ...data,
        directeurId,
      },
      include: {
        manager: true,
        directeur: true,
      },
    });
  }

  async findAll(userId?: number, userRole?: string) {
    // Vérifier que les paramètres sont définis (userId peut être 0 pour les admins)
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    switch (userRole) {
      case 'admin':
        return this.prisma.commercial.findMany({
          include: {
            manager: true,
            directeur: true,
            immeubles: true,
            statistics: true,
          },
        });

      case 'directeur':
        return this.prisma.commercial.findMany({
          where: {
            directeurId: userId,
          },
          include: {
            manager: true,
            directeur: true,
            immeubles: true,
            statistics: true,
          },
        });

      case 'manager':
        // Commerciaux assignés au manager
        return this.prisma.commercial.findMany({
          where: {
            managerId: userId,
          },
          include: {
            manager: true,
            directeur: true,
            immeubles: true,
            statistics: true,
          },
        });

      case 'commercial':
        // Le commercial lui-même
        return this.prisma.commercial.findMany({
          where: {
            id: userId,
          },
          include: {
            manager: true,
            directeur: true,
            immeubles: true,
            statistics: true,
          },
        });

      default:
        return [];
    }
  }

  async findOne(
    id: number,
    userId: number,
    userRole: string,
    excludeTestUsers = false,
  ) {
    await this.ensureAccess(id, userId, userRole);

    const commercial = await this.prisma.commercial.findUnique({
      where: { id },
      include: {
        manager: true,
        directeur: true,
        // Immeubles dont il est membre (créés par lui ou partagés avec lui).
        immeublesMembre: {
          ...(excludeTestUsers
            ? { where: { immeuble: prodImmeubleWhere } }
            : {}),
          include: {
            immeuble: {
              include: {
                portes: true,
              },
            },
          },
        },
        statistics: true,
      },
    });
    if (!commercial) {
      return null;
    }

    const { immeublesMembre, ...rest } = commercial;
    return {
      ...rest,
      immeubles: immeublesMembre.map((membre) => membre.immeuble),
    };
  }

  async update(data: UpdateCommercialInput, userId: number, userRole: string) {
    const { id, ...updateData } = data;

    await this.ensureAccess(id, userId, userRole);

    // Si le managerId est modifié, mettre à jour automatiquement le directeurId
    let directeurId = updateData.directeurId;

    if (
      updateData.managerId !== undefined &&
      updateData.managerId !== null &&
      !directeurId
    ) {
      const manager = await this.prisma.manager.findUnique({
        where: { id: updateData.managerId },
        select: { directeurId: true },
      });

      if (manager?.directeurId) {
        directeurId = manager.directeurId;
      }
    }

    return this.prisma.commercial.update({
      where: { id },
      data: {
        ...updateData,
        ...(directeurId !== undefined && { directeurId }),
      },
      include: {
        manager: true,
        directeur: true,
      },
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    await this.ensureAccess(id, userId, userRole);

    return this.prisma.commercial.delete({
      where: { id },
      include: {
        manager: true,
        directeur: true,
      },
    });
  }

  async getCurrentZone(commercialId: number) {
    const zoneEnCours = await this.prisma.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId: commercialId,
          userType: UserType.COMMERCIAL,
        },
      },
      include: {
        zone: true,
      },
    });

    return zoneEnCours?.zone || null;
  }

  /**
   * Calcule le classement d'un commercial dans son équipe dashboard commerial
   * Points: 50 par contrat signé, 10 par RDV pris, 5 par immeuble visité
   */
  async getTeamRanking(commercialId: number, userId: number, userRole: string) {
    // Vérifier l'accès
    const commercial = await this.ensureAccess(commercialId, userId, userRole);

    if (!commercial.managerId) {
      return {
        position: 1,
        total: 1,
        points: 0,
        trend: null,
        managerNom: null,
        managerPrenom: null,
        managerEmail: null,
        managerNumTel: null,
      };
    }

    // Récupérer les informations du manager
    const manager = await this.prisma.manager.findUnique({
      where: { id: commercial.managerId },
      select: {
        nom: true,
        prenom: true,
        email: true,
        numTelephone: true,
      },
    });

    // Récupérer tous les commerciaux de l'équipe (même manager)
    const teamCommercials = await this.prisma.commercial.findMany({
      where: {
        managerId: commercial.managerId,
      },
      include: {
        statistics: true,
      },
    });

    if (teamCommercials.length === 0) {
      return {
        position: 1,
        total: 1,
        points: 0,
        trend: null,
        managerNom: manager?.nom || null,
        managerPrenom: manager?.prenom || null,
        managerEmail: manager?.email || null,
        managerNumTel: manager?.numTelephone || null,
      };
    }

    // Fonction pour calculer les points d'un commercial
    const calculatePoints = (stats: any[]) => {
      const totals = stats.reduce(
        (acc, stat) => ({
          contratsSignes: acc.contratsSignes + (stat.contratsSignes || 0),
          rendezVousPris: acc.rendezVousPris + (stat.rendezVousPris || 0),
          immeublesVisites: acc.immeublesVisites + (stat.immeublesVisites || 0),
        }),
        { contratsSignes: 0, rendezVousPris: 0, immeublesVisites: 0 },
      );

      return (
        totals.contratsSignes * 50 +
        totals.rendezVousPris * 10 +
        totals.immeublesVisites * 5
      );
    };

    // Calculer les points de chaque commercial
    const teamWithPoints = teamCommercials.map((c) => ({
      id: c.id,
      points: calculatePoints(c.statistics || []),
    }));

    // Trier par points décroissants
    teamWithPoints.sort((a, b) => b.points - a.points);

    // Trouver la position du commercial actuel
    const currentIndex = teamWithPoints.findIndex((c) => c.id === commercialId);
    const currentPosition = currentIndex + 1;
    const currentPoints = teamWithPoints[currentIndex]?.points || 0;

    // Calculer la position médiane pour déterminer la tendance
    const medianIndex = Math.floor(teamWithPoints.length / 2);
    const medianPosition = medianIndex + 1;
    const medianPoints = teamWithPoints[medianIndex]?.points || 0;

    // Déterminer la tendance : 'up' si au-dessus de la médiane, 'down' si en dessous, null si égal
    let trend: string | null = null;
    if (currentPosition < medianPosition) {
      trend = 'up';
    } else if (currentPosition > medianPosition) {
      trend = 'down';
    } else if (currentPoints > medianPoints) {
      trend = 'up';
    } else if (currentPoints < medianPoints) {
      trend = 'down';
    }

    return {
      position: currentPosition,
      total: teamWithPoints.length,
      points: currentPoints,
      trend,
      managerNom: manager?.nom || null,
      managerPrenom: manager?.prenom || null,
      managerEmail: manager?.email || null,
      managerNumTel: manager?.numTelephone || null,
    };
  }
}
