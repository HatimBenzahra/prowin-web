import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { prodImmeubleWhere } from '../enumeration-Status/prod-immeuble-where.util';
import { calculateStatsForStatus } from '../porte/porte-status.constants';
import { ImmeubleService } from '../immeuble/immeuble.service';
import { CreateZoneInput, UpdateZoneInput, UserType } from './zone.dto';
import { centroid, enclosingRadiusMeters, parseRing } from './zone.geometry';

@Injectable()
export class ZoneService {
  constructor(
    private prisma: PrismaService,
    private immeubleService: ImmeubleService,
  ) {}

  /**
   * Calcule les statistiques d'un utilisateur pour une zone pendant une période donnée
   */
  // Dans backend/src/zone/zone.service.ts, remplacer la fonction calculateUserStatsForZone

  private async calculateUserStatsForZone(
    userId: number,
    userType: UserType,
    zoneId: number,
    startDate: Date,
    endDate: Date,
  ) {
    //on calcule directement depuis les portes des immeubles de la zone
    let portesWhere: any = {
      immeuble: {
        zoneId: zoneId,
      },
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    switch (userType) {
      case UserType.COMMERCIAL:
        portesWhere.immeuble.commercialId = userId;
        break;

      case UserType.MANAGER:
        // Portes des immeubles du manager OU de ses commerciaux
        portesWhere.immeuble.OR = [
          { managerId: userId },
          {
            commercial: {
              managerId: userId,
            },
          },
        ];
        break;

      case UserType.DIRECTEUR:
        // Portes des immeubles sous la responsabilité du directeur
        portesWhere.immeuble.OR = [
          {
            commercial: {
              directeurId: userId,
            },
          },
          {
            manager: {
              directeurId: userId,
            },
          },
        ];
        break;
    }

    // Grouper les portes par statut
    const portesGrouped = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: portesWhere,
      _count: {
        statut: true,
      },
    });

    // Calculer les immeubles visités
    const immeublesVisites = await this.prisma.immeuble.count({
      where: {
        zoneId: zoneId,
        ...(userType === UserType.COMMERCIAL
          ? { commercialId: userId }
          : userType === UserType.MANAGER
            ? {
                OR: [
                  { managerId: userId },
                  { commercial: { managerId: userId } },
                ],
              }
            : {
                OR: [
                  { commercial: { directeurId: userId } },
                  { manager: { directeurId: userId } },
                ],
              }),
        updatedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculer les totaux à partir des portes
    const stats = {
      totalContratsSignes: 0,
      totalImmeublesVisites: immeublesVisites,
      totalRendezVousPris: 0,
      totalRefus: 0,
      totalImmeublesProspectes: immeublesVisites,
      totalPortesProspectes: 0,
    };

    // Utilisation du helper centralisé pour calculer les stats
    portesGrouped.forEach((group) => {
      const count = group._count.statut;
      const statusStats = calculateStatsForStatus(group.statut, count);

      stats.totalContratsSignes += statusStats.contratsSignes;
      stats.totalRendezVousPris += statusStats.rendezVousPris;
      stats.totalRefus += statusStats.refus;
      stats.totalPortesProspectes += statusStats.nbPortesProspectes;
    });

    return stats;
  }

  /**
   * Récupère tous les commerciaux sous un manager
   */
  private async getCommercialsUnderManager(
    managerId: number,
    tx?: any,
  ): Promise<number[]> {
    const prisma = tx || this.prisma;
    const commercials = await prisma.commercial.findMany({
      where: { managerId },
      select: { id: true },
    });
    return commercials.map((c) => c.id);
  }

  /**
   * Récupère tous les managers et commerciaux sous un directeur
   */
  private async getTeamUnderDirector(
    directeurId: number,
    tx?: any,
  ): Promise<{ managers: number[]; commercials: number[] }> {
    const prisma = tx || this.prisma;

    // Récupérer tous les managers du directeur
    const managers = await prisma.manager.findMany({
      where: { directeurId },
      select: { id: true },
    });
    const managerIds = managers.map((m) => m.id);

    // Récupérer tous les commerciaux directement sous le directeur
    const directCommercials = await prisma.commercial.findMany({
      where: { directeurId },
      select: { id: true },
    });

    // Récupérer tous les commerciaux sous les managers de ce directeur
    const managersCommercials = await prisma.commercial.findMany({
      where: { managerId: { in: managerIds } },
      select: { id: true },
    });

    // Combiner tous les commerciaux (éviter les doublons avec Set)
    const allCommercialIds = new Set([
      ...directCommercials.map((c) => c.id),
      ...managersCommercials.map((c) => c.id),
    ]);

    return {
      managers: managerIds,
      commercials: Array.from(allCommercialIds),
    };
  }

  /**
   * Assigne un utilisateur à une zone (fonction interne, sans cascade)
   */
  private async assignSingleUserToZone(
    zoneId: number,
    userId: number,
    userType: UserType,
    tx: any,
  ) {
    // 1. Récupérer l'assignation en cours de cet utilisateur (s'il en a une)
    const currentAssignment = await tx.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId,
          userType,
        },
      },
    });

    // 2. Si une assignation existe, la déplacer vers l'historique
    if (currentAssignment) {
      // Calculer les stats pour la période d'assignation
      const stats = await this.calculateUserStatsForZone(
        userId,
        userType,
        currentAssignment.zoneId,
        currentAssignment.assignedAt,
        new Date(),
      );

      // Créer l'entrée historique
      await tx.historiqueZone.create({
        data: {
          zoneId: currentAssignment.zoneId,
          userId,
          userType,
          assignedAt: currentAssignment.assignedAt,
          unassignedAt: new Date(),
          ...stats,
        },
      });

      // Supprimer l'assignation en cours
      await tx.zoneEnCours.delete({
        where: { id: currentAssignment.id },
      });
    }

    // 3. Créer la nouvelle assignation en cours
    const newAssignment = await tx.zoneEnCours.create({
      data: {
        zoneId,
        userId,
        userType,
      },
      include: {
        zone: true,
      },
    });

    return newAssignment;
  }

  /**
   * Fonction unifiée pour assigner une zone à un utilisateur (commercial ou manager).
   * Gère l'historique des assignations et n'assigne QUE l'utilisateur cible.
   *
   * Règle métier : assignation individuelle, sans cascade. Assigner un manager
   * n'assigne pas ses commerciaux ; c'est au manager de répartir sa zone
   * lui-même (flux mobile). Le web (admin/directeur) assigne chaque cible
   * explicitement.
   */
  async assignZoneToUser(
    zoneId: number,
    userId: number,
    userType: UserType,
    requestUserId?: number,
    requestUserRole?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Vérifier que la zone existe
      const zone = await tx.zone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new NotFoundException('Zone not found');
      }

      // 2. Authorization check (if auth params provided)
      if (requestUserId && requestUserRole && requestUserRole !== 'admin') {
        if (
          requestUserRole === 'directeur' &&
          zone.directeurId !== requestUserId
        ) {
          throw new ForbiddenException('Can only assign zones you own');
        }
        if (requestUserRole === 'manager' && zone.managerId !== requestUserId) {
          throw new ForbiddenException('Can only assign zones you own');
        }
      }

      // 3. Assigner uniquement l'utilisateur cible (pas de cascade).
      return this.assignSingleUserToZone(zoneId, userId, userType, tx);
    });
  }

  /**
   * Dérive le centre (xOrigin/yOrigin) et le rayon englobant (mètres) d'un
   * polygone GeoJSON. Traduit toute erreur de géométrie en BadRequestException.
   */
  private deriveCircleFromPolygon(polygon: number[][]): {
    xOrigin: number;
    yOrigin: number;
    rayon: number;
  } {
    try {
      const ring = parseRing(polygon);
      const center = centroid(ring);
      return { ...center, rayon: enclosingRadiusMeters(center, ring) };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'polygon invalide',
      );
    }
  }

  /**
   * Résout le type et le nom (snapshot) du créateur d'une zone selon son rôle.
   * admin → type null + libellé 'Admin' ; utilisateur introuvable → nom null.
   */
  private async resolveCreatedBy(
    userId?: number,
    userRole?: string,
  ): Promise<{
    createdById: number | null;
    createdByType: UserType | null;
    createdByName: string | null;
  }> {
    if (userId === undefined) {
      return { createdById: null, createdByType: null, createdByName: null };
    }

    if (userRole === 'admin') {
      return {
        createdById: userId,
        createdByType: null,
        createdByName: 'Admin',
      };
    }

    const select = { prenom: true, nom: true };
    let createdByType: UserType | null = null;
    let user: { prenom: string; nom: string } | null = null;

    switch (userRole) {
      case 'manager':
        createdByType = UserType.MANAGER;
        user = await this.prisma.manager.findUnique({
          where: { id: userId },
          select,
        });
        break;
      case 'directeur':
        createdByType = UserType.DIRECTEUR;
        user = await this.prisma.directeur.findUnique({
          where: { id: userId },
          select,
        });
        break;
      case 'commercial':
        createdByType = UserType.COMMERCIAL;
        user = await this.prisma.commercial.findUnique({
          where: { id: userId },
          select,
        });
        break;
    }

    return {
      createdById: userId,
      createdByType,
      createdByName: user ? `${user.prenom} ${user.nom}` : null,
    };
  }

  async create(data: CreateZoneInput, userId?: number, userRole?: string) {
    const { polygon, xOrigin, yOrigin, rayon, ...rest } = data;

    // Un manager ne crée que des zones qui lui appartiennent : on force managerId
    // à son id (écrase toute valeur cliente). admin/directeur : comportement inchangé.
    if (userRole === 'manager' && userId !== undefined) {
      rest.managerId = userId;
    }

    // Snapshot du créateur (qui a créé la zone) pour l'historique.
    const createdBy = await this.resolveCreatedBy(userId, userRole);

    // Zone polygonale : on calcule et persiste xOrigin/yOrigin/rayon depuis le polygone.
    if (polygon !== undefined && polygon !== null) {
      return this.prisma.$transaction(async (tx) => {
        const zone = await tx.zone.create({
          data: {
            ...rest,
            ...createdBy,
            polygon,
            ...this.deriveCircleFromPolygon(polygon),
          },
        });
        // Auto-guérison : rattache/détache les immeubles concernés par ce
        // nouveau tracé (membership purement géométrique). Réutilise le même
        // cœur que le backfill admin — pas de duplication du lancer de rayon.
        await this.immeubleService.reresolveAllImmeubleZones(tx);
        return zone;
      });
    }

    // Zone cercle (chemin historique) : xOrigin/yOrigin/rayon sont requis.
    if (xOrigin === undefined || yOrigin === undefined || rayon === undefined) {
      throw new BadRequestException(
        'Une zone requiert soit un polygon, soit xOrigin, yOrigin et rayon.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const zone = await tx.zone.create({
        data: { ...rest, ...createdBy, xOrigin, yOrigin, rayon },
      });
      await this.immeubleService.reresolveAllImmeubleZones(tx);
      return zone;
    });
  }

  async findAll(userId?: number, userRole?: string) {
    // Vérifier que les paramètres sont définis (userId peut être 0 pour les admins)
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    // Filtrage selon le rôle
    switch (userRole) {
      // Admin et directeur : visibilité sur TOUTES les zones de l'organisation
      // (les zones créées par l'admin doivent être visibles par les directeurs).
      case 'admin':
      case 'directeur':
        return this.prisma.zone.findMany({
          include: {
            immeubles: { where: prodImmeubleWhere },
          },
        });

      case 'manager':
        // Zones assignées au manager
        return this.prisma.zone.findMany({
          where: {
            managerId: userId,
          },
          include: {
            immeubles: { where: prodImmeubleWhere },
          },
        });

      case 'commercial':
        // Zones assignées au commercial via ZoneEnCours
        const zoneEnCours = await this.prisma.zoneEnCours.findUnique({
          where: {
            userId_userType: {
              userId,
              userType: UserType.COMMERCIAL,
            },
          },
          select: {
            zoneId: true,
          },
        });

        if (!zoneEnCours) {
          return [];
        }

        return this.prisma.zone.findMany({
          where: {
            id: zoneEnCours.zoneId,
          },
          include: {
            immeubles: { where: prodImmeubleWhere },
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
    const immeublesInclude = excludeTestUsers
      ? { where: prodImmeubleWhere }
      : true;

    // Admin can access all zones
    if (userRole === 'admin') {
      const zone = await this.prisma.zone.findUnique({
        where: { id },
        include: {
          immeubles: immeublesInclude,
        },
      });

      if (!zone) {
        throw new NotFoundException('Zone not found');
      }

      return zone;
    }

    // Get the zone
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        immeubles: immeublesInclude,
      },
    });

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    // Directeur : accès en lecture à TOUTES les zones (aligné sur findAll).

    // Manager can only access their own zones
    if (userRole === 'manager' && zone.managerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Commercial can only access zones they are assigned to
    if (userRole === 'commercial') {
      const assignment = await this.prisma.zoneEnCours.findUnique({
        where: {
          userId_userType: {
            userId,
            userType: UserType.COMMERCIAL,
          },
          zoneId: id,
        },
      });

      if (!assignment) {
        throw new ForbiddenException('Access denied');
      }
    }

    return zone;
  }

  /**
   * Vérifie que le demandeur a le droit de consulter les zones d'un utilisateur cible.
   * - le demandeur peut toujours consulter les siennes (même id ET même type que son rôle)
   * - admin : tout le monde
   * - directeur : les managers et commerciaux de son équipe
   * - manager : ses commerciaux
   * - commercial : uniquement lui-même
   */
  private async assertZonesForUserAccess(
    userId: number,
    userType: UserType,
    requestUserId: number,
    requestUserRole: string,
  ) {
    // Un utilisateur peut toujours consulter ses propres zones (id + type cohérents avec son rôle)
    const roleUserType: Record<string, UserType> = {
      commercial: UserType.COMMERCIAL,
      manager: UserType.MANAGER,
      directeur: UserType.DIRECTEUR,
    };
    if (
      userId === requestUserId &&
      roleUserType[requestUserRole] === userType
    ) {
      return;
    }

    switch (requestUserRole) {
      case 'admin':
        return;

      case 'directeur': {
        const team = await this.getTeamUnderDirector(requestUserId);
        if (userType === UserType.MANAGER && team.managers.includes(userId)) {
          return;
        }
        if (
          userType === UserType.COMMERCIAL &&
          team.commercials.includes(userId)
        ) {
          return;
        }
        break;
      }

      case 'manager': {
        if (userType === UserType.COMMERCIAL) {
          const commercialIds =
            await this.getCommercialsUnderManager(requestUserId);
          if (commercialIds.includes(userId)) {
            return;
          }
        }
        break;
      }
    }

    throw new ForbiddenException('Access denied');
  }

  /**
   * Source de vérité unifiée des zones à afficher pour un utilisateur, quelle que
   * soit la façon dont elles ont été assignées (ZoneEnCours ou FK directe).
   * - COMMERCIAL : zones où il est assigné via ZoneEnCours
   * - MANAGER    : ses zones (FK managerId) OU zones assignées via ZoneEnCours
   * - DIRECTEUR  : ses zones (FK directeurId) OU zones assignées via ZoneEnCours
   */
  async getZonesForUser(
    userId: number,
    userType: UserType,
    requestUserId: number,
    requestUserRole: string,
  ) {
    await this.assertZonesForUserAccess(
      userId,
      userType,
      requestUserId,
      requestUserRole,
    );

    const where: Prisma.ZoneWhereInput =
      userType === UserType.COMMERCIAL
        ? { zoneEnCours: { some: { userId, userType: UserType.COMMERCIAL } } }
        : userType === UserType.MANAGER
          ? {
              OR: [
                { managerId: userId },
                {
                  zoneEnCours: { some: { userId, userType: UserType.MANAGER } },
                },
              ],
            }
          : {
              OR: [
                { directeurId: userId },
                {
                  zoneEnCours: {
                    some: { userId, userType: UserType.DIRECTEUR },
                  },
                },
              ],
            };

    const zones = await this.prisma.zone.findMany({
      where,
      include: {
        immeubles: true,
        // Restreint à l'assignation de l'utilisateur courant pour exposer sa
        // date d'assignation (filtrage côté mobile par date d'assignation).
        zoneEnCours: {
          where: { userId, userType },
          select: { assignedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // On n'expose que le champ assignedAt (date d'assignation de l'utilisateur
    // courant) plutôt que le tableau zoneEnCours brut.
    return zones.map(({ zoneEnCours, ...zone }) => ({
      ...zone,
      assignedAt: zoneEnCours[0]?.assignedAt ?? null,
    }));
  }

  async assignToCommercial(
    zoneId: number,
    commercialId: number,
    userId: number,
    userRole: string,
  ) {
    // Validate authorization before assignment
    await this.validateZoneAssignmentAuth(zoneId, userId, userRole, 'manager');
    // Utiliser la nouvelle fonction unifiée
    return this.assignZoneToUser(zoneId, commercialId, UserType.COMMERCIAL);
  }

  async assignToManager(
    zoneId: number,
    managerId: number,
    userId: number,
    userRole: string,
  ) {
    // Only admin and directeur can assign to manager
    await this.validateZoneAssignmentAuth(
      zoneId,
      userId,
      userRole,
      'directeur',
    );
    // Utiliser la nouvelle fonction unifiée
    return this.assignZoneToUser(zoneId, managerId, UserType.MANAGER);
  }

  private async validateZoneAssignmentAuth(
    zoneId: number,
    userId: number,
    userRole: string,
    minRole: 'admin' | 'directeur' | 'manager',
  ) {
    // Admin can always assign
    if (userRole === 'admin') return;

    // Get the zone
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    // Check based on minimum required role
    if (minRole === 'directeur') {
      if (userRole !== 'admin' && userRole !== 'directeur') {
        throw new ForbiddenException('Access denied');
      }
      if (userRole === 'directeur' && zone.directeurId !== userId) {
        throw new ForbiddenException('Can only assign zones you own');
      }
    } else if (minRole === 'manager') {
      if (!['admin', 'directeur', 'manager'].includes(userRole)) {
        throw new ForbiddenException('Access denied');
      }
      if (userRole === 'directeur' && zone.directeurId !== userId) {
        throw new ForbiddenException('Can only assign zones you own');
      }
      if (userRole === 'manager' && zone.managerId !== userId) {
        throw new ForbiddenException('Can only assign zones you own');
      }
    }
  }

  /**
   * Désassigne un utilisateur de sa zone actuelle
   * Met l'assignation dans l'historique avec les stats calculées
   */
  async unassignUser(
    userId: number,
    userType: UserType,
    requestUserId: number,
    requestUserRole: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Récupérer l'assignation en cours
      const currentAssignment = await tx.zoneEnCours.findUnique({
        where: {
          userId_userType: {
            userId,
            userType,
          },
        },
      });

      if (!currentAssignment) {
        throw new NotFoundException(
          'No active zone assignment found for this user',
        );
      }

      // Authorization check
      if (requestUserRole !== 'admin') {
        const zone = await tx.zone.findUnique({
          where: { id: currentAssignment.zoneId },
        });
        if (!zone) {
          throw new NotFoundException('Zone not found');
        }

        if (
          requestUserRole === 'directeur' &&
          zone.directeurId !== requestUserId
        ) {
          throw new ForbiddenException('Can only unassign from zones you own');
        }
        if (requestUserRole === 'manager' && zone.managerId !== requestUserId) {
          throw new ForbiddenException('Can only unassign from zones you own');
        }
      }

      // Calculer les stats pour la période d'assignation
      const stats = await this.calculateUserStatsForZone(
        userId,
        userType,
        currentAssignment.zoneId,
        currentAssignment.assignedAt,
        new Date(),
      );

      // Créer l'entrée historique
      await tx.historiqueZone.create({
        data: {
          zoneId: currentAssignment.zoneId,
          userId,
          userType,
          assignedAt: currentAssignment.assignedAt,
          unassignedAt: new Date(),
          ...stats,
        },
      });

      // Supprimer l'assignation en cours
      await tx.zoneEnCours.delete({
        where: { id: currentAssignment.id },
      });

      return {
        success: true,
        message: 'User unassigned from zone successfully',
      };
    });
  }

  async unassignFromCommercial(
    zoneId: number,
    commercialId: number,
    requestUserId: number,
    requestUserRole: string,
  ) {
    // Utiliser la nouvelle fonction de désassignation
    return this.unassignUser(
      commercialId,
      UserType.COMMERCIAL,
      requestUserId,
      requestUserRole,
    );
  }

  /**
   * Récupère l'assignation en cours d'un utilisateur
   */
  async getCurrentAssignment(
    userId: number,
    userType: UserType,
    requestUserId: number,
    requestUserRole: string,
  ) {
    // Authorization: users can only query their own assignment or their subordinates'
    if (requestUserRole !== 'admin') {
      if (requestUserRole === 'commercial' && userId !== requestUserId) {
        throw new ForbiddenException('Can only view your own assignment');
      }

      // Manager can view their commercials' assignments
      if (requestUserRole === 'manager' && userType === UserType.COMMERCIAL) {
        const commercial = await this.prisma.commercial.findUnique({
          where: { id: userId },
          select: { managerId: true },
        });
        if (commercial?.managerId !== requestUserId) {
          throw new ForbiddenException(
            'Can only view your commercials assignments',
          );
        }
      } else if (requestUserRole === 'manager' && userId !== requestUserId) {
        throw new ForbiddenException('Access denied');
      }

      // Directeur can view their managers' and commercials' assignments
      if (requestUserRole === 'directeur') {
        if (userType === UserType.MANAGER) {
          const manager = await this.prisma.manager.findUnique({
            where: { id: userId },
            select: { directeurId: true },
          });
          if (manager?.directeurId !== requestUserId) {
            throw new ForbiddenException(
              'Can only view your managers assignments',
            );
          }
        } else if (userType === UserType.COMMERCIAL) {
          const commercial = await this.prisma.commercial.findUnique({
            where: { id: userId },
            select: { directeurId: true },
          });
          if (commercial?.directeurId !== requestUserId) {
            throw new ForbiddenException(
              'Can only view your commercials assignments',
            );
          }
        } else if (userId !== requestUserId) {
          throw new ForbiddenException('Access denied');
        }
      }
    }

    return this.prisma.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId,
          userType,
        },
      },
      include: {
        zone: true,
      },
    });
  }

  /**
   * Récupère l'historique des assignations d'un utilisateur
   */
  async getUserZoneHistory(
    userId: number,
    userType: UserType,
    requestUserId: number,
    requestUserRole: string,
  ) {
    // Same authorization logic as getCurrentAssignment
    if (requestUserRole !== 'admin') {
      if (requestUserRole === 'commercial' && userId !== requestUserId) {
        throw new ForbiddenException('Can only view your own history');
      }

      if (requestUserRole === 'manager' && userType === UserType.COMMERCIAL) {
        const commercial = await this.prisma.commercial.findUnique({
          where: { id: userId },
          select: { managerId: true },
        });
        if (commercial?.managerId !== requestUserId) {
          throw new ForbiddenException(
            'Can only view your commercials history',
          );
        }
      } else if (requestUserRole === 'manager' && userId !== requestUserId) {
        throw new ForbiddenException('Access denied');
      }

      if (requestUserRole === 'directeur') {
        if (userType === UserType.MANAGER) {
          const manager = await this.prisma.manager.findUnique({
            where: { id: userId },
            select: { directeurId: true },
          });
          if (manager?.directeurId !== requestUserId) {
            throw new ForbiddenException('Can only view your managers history');
          }
        } else if (userType === UserType.COMMERCIAL) {
          const commercial = await this.prisma.commercial.findUnique({
            where: { id: userId },
            select: { directeurId: true },
          });
          if (commercial?.directeurId !== requestUserId) {
            throw new ForbiddenException(
              'Can only view your commercials history',
            );
          }
        } else if (userId !== requestUserId) {
          throw new ForbiddenException('Access denied');
        }
      }
    }

    return this.prisma.historiqueZone.findMany({
      where: {
        userId,
        userType,
      },
      include: {
        zone: true,
      },
      orderBy: {
        unassignedAt: 'desc',
      },
    });
  }

  /**
   * Récupère l'historique des assignations d'une zone
   */
  async getZoneHistory(zoneId: number) {
    return this.prisma.historiqueZone.findMany({
      where: {
        zoneId,
      },
      orderBy: {
        unassignedAt: 'desc',
      },
    });
  }

  /**
   * Récupère tous les utilisateurs actuellement assignés à une zone
   */
  async getZoneCurrentAssignments(
    zoneId: number,
    userId: number,
    userRole: string,
  ) {
    // Authorization: verify access to zone
    if (userRole !== 'admin') {
      const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new NotFoundException('Zone not found');
      }

      if (userRole === 'directeur' && zone.directeurId !== userId) {
        throw new ForbiddenException(
          'Can only view assignments for your zones',
        );
      }
      if (userRole === 'manager' && zone.managerId !== userId) {
        throw new ForbiddenException(
          'Can only view assignments for your zones',
        );
      }
    }

    return this.prisma.zoneEnCours.findMany({
      where: {
        zoneId,
      },
      include: {
        zone: true,
      },
    });
  }

  /**
   * Récupère TOUT l'historique des assignations de zones
   * Avec filtrage selon le rôle de l'utilisateur
   */
  async getAllZoneHistory(userId?: number, userRole?: string) {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    // Filtrage selon le rôle
    switch (userRole) {
      case 'admin':
        return this.prisma.historiqueZone.findMany({
          include: {
            zone: true,
          },
          orderBy: {
            unassignedAt: 'desc',
          },
        });

      case 'directeur':
        // Historique des zones du directeur
        return this.prisma.historiqueZone.findMany({
          where: {
            zone: {
              directeurId: userId,
            },
          },
          include: {
            zone: true,
          },
          orderBy: {
            unassignedAt: 'desc',
          },
        });

      case 'manager':
        // Historique des zones du manager
        return this.prisma.historiqueZone.findMany({
          where: {
            zone: {
              managerId: userId,
            },
          },
          include: {
            zone: true,
          },
          orderBy: {
            unassignedAt: 'desc',
          },
        });

      case 'commercial':
        // Historique des zones du commercial uniquement
        return this.prisma.historiqueZone.findMany({
          where: {
            userId: userId,
            userType: UserType.COMMERCIAL,
          },
          include: {
            zone: true,
          },
          orderBy: {
            unassignedAt: 'desc',
          },
        });

      default:
        return [];
    }
  }

  /**
   * Récupère TOUTES les assignations en cours
   * Avec filtrage selon le rôle de l'utilisateur
   */
  async getAllCurrentAssignments(userId?: number, userRole?: string) {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    // Filtrage selon le rôle
    switch (userRole) {
      case 'admin':
        return this.prisma.zoneEnCours.findMany({
          include: {
            zone: true,
          },
          orderBy: {
            assignedAt: 'desc',
          },
        });

      case 'directeur':
        // Assignations des zones du directeur
        return this.prisma.zoneEnCours.findMany({
          where: {
            zone: {
              directeurId: userId,
            },
          },
          include: {
            zone: true,
          },
          orderBy: {
            assignedAt: 'desc',
          },
        });

      case 'manager':
        // Assignations des zones du manager
        return this.prisma.zoneEnCours.findMany({
          where: {
            zone: {
              managerId: userId,
            },
          },
          include: {
            zone: true,
          },
          orderBy: {
            assignedAt: 'desc',
          },
        });

      case 'commercial':
        // Assignations des zones du commercial uniquement
        return this.prisma.zoneEnCours.findMany({
          where: {
            userId: userId,
            userType: UserType.COMMERCIAL,
          },
          include: {
            zone: true,
          },
          orderBy: {
            assignedAt: 'desc',
          },
        });

      default:
        return [];
    }
  }

  /**
   * Vérifie qu'un utilisateur a le droit de consulter les prospections d'une zone.
   * Même logique que getZoneStatistics :
   * - admin : tout
   * - directeur : ses zones OU les zones où son équipe (managers/commerciaux) a été assignée
   * - manager : ses zones OU les zones où ses commerciaux ont été assignés
   * - commercial : les zones où il a été assigné (en cours ou historique)
   */
  private async assertZoneProspectionAccess(
    zoneId: number,
    userId: number,
    userRole: string,
  ) {
    if (userRole === 'admin') return;

    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const wasAssigned = async (
      userIds: number[],
      userTypes: UserType[],
    ): Promise<boolean> => {
      if (userIds.length === 0) return false;
      const where = {
        zoneId,
        userId: { in: userIds },
        userType: { in: userTypes },
      };
      const current = await this.prisma.zoneEnCours.findFirst({ where });
      if (current) return true;
      const history = await this.prisma.historiqueZone.findFirst({ where });
      return history !== null;
    };

    switch (userRole) {
      case 'directeur': {
        if (zone.directeurId === userId) return;
        const team = await this.getTeamUnderDirector(userId);
        if (
          await wasAssigned(
            [userId, ...team.managers, ...team.commercials],
            [UserType.MANAGER, UserType.COMMERCIAL, UserType.DIRECTEUR],
          )
        ) {
          return;
        }
        break;
      }

      case 'manager': {
        if (zone.managerId === userId) return;
        const commercialIds = await this.getCommercialsUnderManager(userId);
        if (
          await wasAssigned(
            [userId, ...commercialIds],
            [UserType.MANAGER, UserType.COMMERCIAL],
          )
        ) {
          return;
        }
        break;
      }

      case 'commercial': {
        if (await wasAssigned([userId], [UserType.COMMERCIAL])) {
          return;
        }
        break;
      }
    }

    throw new ForbiddenException('Access denied');
  }

  /**
   * Liste les prospections (changements de statut horodatés) des portes d'une zone.
   * Source : StatusHistorique dont porte.immeuble.zoneId === zoneId, trié du plus
   * récent au plus ancien.
   */
  async getZoneProspections(zoneId: number, userId: number, userRole: string) {
    await this.assertZoneProspectionAccess(zoneId, userId, userRole);

    const historiques = await this.prisma.statusHistorique.findMany({
      where: {
        porte: {
          immeuble: {
            zoneId,
          },
        },
      },
      include: {
        porte: {
          select: {
            id: true,
            numero: true,
            immeuble: {
              select: {
                id: true,
                adresse: true,
              },
            },
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

    return historiques.map((h) => ({
      immeubleId: h.porte.immeuble.id,
      immeubleAdresse: h.porte.immeuble.adresse,
      porteId: h.porte.id,
      porteNumero: h.porte.numero,
      commercialId: h.commercial?.id ?? null,
      commercialNom: h.commercial
        ? `${h.commercial.prenom} ${h.commercial.nom}`
        : null,
      managerId: h.manager?.id ?? null,
      managerNom: h.manager ? `${h.manager.prenom} ${h.manager.nom}` : null,
      statut: h.statut,
      date: h.createdAt,
      dureeSec: h.duree ?? null,
    }));
  }

  async update(data: UpdateZoneInput) {
    const { id, polygon, ...updateData } = data;

    return this.prisma.$transaction(async (tx) => {
      let zone;

      // Nouveau polygone fourni : recalcule et persiste xOrigin/yOrigin/rayon.
      if (polygon !== undefined && polygon !== null) {
        zone = await tx.zone.update({
          where: { id },
          data: {
            ...updateData,
            polygon,
            ...this.deriveCircleFromPolygon(polygon),
          },
        });
      } else if (polygon === null) {
        // polygon explicitement null : la zone redevient un cercle (colonne
        // remise à NULL), xOrigin/yOrigin/rayon existants sont conservés.
        zone = await tx.zone.update({
          where: { id },
          data: { ...updateData, polygon: Prisma.DbNull },
        });
      } else {
        // polygon absent : chemin cercle inchangé.
        zone = await tx.zone.update({
          where: { id },
          data: updateData,
        });
      }

      // Auto-guérison : après tout changement de zone (tracé ou périmètre
      // cercle), ré-attache/détache les immeubles concernés. Membership
      // purement géométrique, même cœur que le backfill admin.
      await this.immeubleService.reresolveAllImmeubleZones(tx);

      return zone;
    });
  }

  async remove(id: number) {
    // Use a transaction to ensure all deletions succeed or fail together
    return this.prisma.$transaction(async (prisma) => {
      // Delete all statistics related to this zone
      await prisma.statistic.deleteMany({
        where: { zoneId: id },
      });

      // Note: ZoneEnCours and HistoriqueZone are deleted automatically
      // via cascade delete (onDelete: Cascade in schema)

      // Finally, delete the zone itself
      return prisma.zone.delete({
        where: { id },
      });
    });
  }
}
