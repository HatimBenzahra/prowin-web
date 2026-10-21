import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { prodImmeubleWhere } from '../enumeration-Status/prod-immeuble-where.util';
import { CreateManagerInput, UpdateManagerInput } from './manager.dto';

@Injectable()
export class ManagerService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateManagerInput) {
    return this.prisma.manager.create({
      data,
      include: {
        directeur: true,
        commercials: true,
      },
    });
  }

  async findAll(userId?: number, userRole?: string) {
    // Si pas de filtrage explicite, retourner tous les managers
    if (userId === undefined || !userRole) {
      return this.prisma.manager.findMany({
        include: {
          directeur: true,
          commercials: true,
        },
      });
    }

    switch (userRole) {
      case 'admin':
        return this.prisma.manager.findMany({
          include: {
            directeur: true,
            commercials: true,
            statistics: true,
          },
        });

      case 'directeur':
        return this.prisma.manager.findMany({
          where: {
            directeurId: userId,
          },
          include: {
            directeur: true,
            commercials: true,
            statistics: true,
          },
        });

      case 'manager':
        return this.prisma.manager.findMany({
          where: {
            id: userId,
          },
          include: {
            directeur: true,
            commercials: true,
          },
        });

      default:
        return [];
    }
  }

  async findOne(id: number, userId: number, userRole: string) {
    // Admin can access all managers
    if (userRole === 'admin') {
      return this.prisma.manager.findUnique({
        where: { id },
        include: {
          directeur: true,
          commercials: true,
          zones: true,
        },
      });
    }

    // Get the manager
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      include: {
        directeur: true,
        commercials: true,
        zones: true,
      },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    // Directeur can only access their own managers
    if (userRole === 'directeur' && manager.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Manager can only access themselves
    if (userRole === 'manager' && manager.id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return manager;
  }

  /** Expose les immeubles dont chaque commercial est membre en `immeubles`. */
  private withImmeublesMembre<
    C extends { immeublesMembre: { immeuble: unknown }[] },
  >(commercials: C[]) {
    return commercials.map(({ immeublesMembre, ...commercial }) => ({
      ...commercial,
      immeubles: immeublesMembre.map(
        (membre): C['immeublesMembre'][number]['immeuble'] => membre.immeuble,
      ),
    }));
  }

  /**
   * Récupère les données personnelles du manager (pour son espace commercial personnel)
   * Retourne UNIQUEMENT ses propres immeubles et statistiques
   */
  async findPersonal(
    id: number,
    userId: number,
    userRole: string,
    excludeTestUsers = false,
  ) {
    // Options d'include/where construites dynamiquement selon excludeTestUsers,
    // réutilisées par les branches admin et non-admin ci-dessous.
    // Immeubles des commerciaux par appartenance (créés par eux ou partagés).
    const commercialsImmeublesInclude = {
      ...(excludeTestUsers ? { where: { immeuble: prodImmeubleWhere } } : {}),
      include: { immeuble: { include: { portes: true } } },
    };
    const zonesImmeublesInclude = excludeTestUsers
      ? { where: prodImmeubleWhere }
      : true;
    // Immeubles dont le manager est membre (créés par lui ou partagés avec lui).
    const managerImmeublesWhere = excludeTestUsers
      ? { AND: [{ membres: { some: { managerId: id } } }, prodImmeubleWhere] }
      : { membres: { some: { managerId: id } } };

    // Admin can access all
    if (userRole === 'admin') {
      const manager = await this.prisma.manager.findUnique({
        where: { id },
        include: {
          directeur: true,
          commercials: {
            include: {
              immeublesMembre: commercialsImmeublesInclude,
            },
          },
        },
      });

      if (!manager) {
        return null;
      }

      // Récupérer UNIQUEMENT les immeubles dont le manager est membre
      const immeubles = await this.prisma.immeuble.findMany({
        where: managerImmeublesWhere,
        include: {
          portes: true,
        },
      });

      // Récupérer UNIQUEMENT les propres statistiques du manager
      const statistics = await this.prisma.statistic.findMany({
        where: { managerId: id },
      });

      // Récupérer les zones assignées au manager
      const zones = await this.prisma.zone.findMany({
        where: { managerId: id },
        include: {
          immeubles: zonesImmeublesInclude,
        },
      });

      return {
        ...manager,
        commercials: this.withImmeublesMembre(manager.commercials),
        immeubles,
        statistics,
        zones,
      };
    }

    const manager = await this.prisma.manager.findUnique({
      where: { id },
      include: {
        directeur: true,
        commercials: {
          include: {
            immeublesMembre: commercialsImmeublesInclude,
          },
        },
      },
    });

    if (!manager) {
      return null;
    }

    // Directeur can only access their own managers
    if (userRole === 'directeur' && manager.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Manager can only access themselves
    if (userRole === 'manager' && manager.id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Récupérer UNIQUEMENT les immeubles dont le manager est membre
    const immeubles = await this.prisma.immeuble.findMany({
      where: managerImmeublesWhere,
      include: {
        portes: true,
      },
    });

    // Récupérer UNIQUEMENT les propres statistiques du manager
    const statistics = await this.prisma.statistic.findMany({
      where: { managerId: id },
    });

    // Récupérer les zones assignées au manager
    const zones = await this.prisma.zone.findMany({
      where: { managerId: id },
      include: {
        immeubles: zonesImmeublesInclude,
      },
    });

    return {
      ...manager,
      commercials: this.withImmeublesMembre(manager.commercials),
      immeubles,
      statistics,
      zones,
    };
  }

  /**
   * Récupère toutes les données du manager pour la page équipe
   * Retourne ses commerciaux avec leurs immeubles et statistiques
   * SÉPARATION: personalStatistics (manager seul) vs teamStatistics (commerciaux) vs statistics (total)
   */
  async findFull(id: number, userId: number, userRole: string) {
    // Récupérer le manager avec ses relations
    const managerData = await this.prisma.manager.findUnique({
      where: { id },
      include: {
        directeur: false,
        zones: {
          include: {
            immeubles: {
              where: prodImmeubleWhere,
              include: {
                portes: true,
              },
            },
            statistics: true,
          },
        },
        commercials: {
          include: {
            statistics: true,
            immeubles: {
              where: prodImmeubleWhere,
              include: {
                portes: true,
              },
            },
          },
        },
      },
    });

    if (!managerData) {
      return null;
    }

    // Authorization check (not for admin)
    if (userRole !== 'admin') {
      // Get full manager with directeur info for authorization
      const managerForAuth = await this.prisma.manager.findUnique({
        where: { id },
        select: { directeurId: true },
      });

      // Directeur can only access their own managers
      if (userRole === 'directeur' && managerForAuth?.directeurId !== userId) {
        throw new ForbiddenException('Access denied');
      }

      // Manager can only access themselves
      if (userRole === 'manager' && id !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }

    // Récupérer les propres immeubles et statistiques du manager séparément
    const managerImmeubles = await this.prisma.immeuble.findMany({
      where: { AND: [{ managerId: id }, prodImmeubleWhere] },
      include: {
        portes: true,
      },
    });

    const managerStatistics = await this.prisma.statistic.findMany({
      where: { managerId: id },
    });

    // Agréger les immeubles des commerciaux + les propres immeubles du manager
    const commercialImmeubles =
      managerData.commercials?.flatMap(
        (commercial: any) => commercial.immeubles || [],
      ) || [];
    const aggregatedImmeubles = [...managerImmeubles, ...commercialImmeubles];

    // Agréger les statistiques des commerciaux
    const commercialStatistics =
      managerData.commercials?.flatMap(
        (commercial: any) => commercial.statistics || [],
      ) || [];

    // Toutes les statistiques combinées (pour compatibilité)
    const aggregatedStatistics = [
      ...managerStatistics,
      ...commercialStatistics,
    ];

    return {
      ...managerData,
      immeubles: aggregatedImmeubles,
      statistics: aggregatedStatistics, // Toutes les stats (compatibilité)
      personalStatistics: managerStatistics, // NOUVEAU: Stats du manager uniquement
      teamStatistics: commercialStatistics, // NOUVEAU: Stats de l'équipe uniquement
    };
  }

  async update(data: UpdateManagerInput, userId: number, userRole: string) {
    const { id, ...updateData } = data;

    // Admin can update any manager
    if (userRole === 'admin') {
      return this.prisma.manager.update({
        where: { id },
        data: updateData,
        include: {
          directeur: true,
          commercials: true,
        },
      });
    }

    // Get the manager to validate ownership
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      select: { directeurId: true },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    // Directeur can only update their own managers
    if (userRole === 'directeur' && manager.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.manager.update({
      where: { id },
      data: updateData,
      include: {
        directeur: true,
        commercials: true,
      },
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    // Admin can delete any manager
    if (userRole === 'admin') {
      return this.prisma.manager.delete({
        where: { id },
        include: {
          directeur: true,
          commercials: true,
        },
      });
    }

    // Get the manager to validate ownership
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      select: { directeurId: true },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    // Directeur can only delete their own managers
    if (userRole === 'directeur' && manager.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.manager.delete({
      where: { id },
      include: {
        directeur: true,
        commercials: true,
      },
    });
  }
}
