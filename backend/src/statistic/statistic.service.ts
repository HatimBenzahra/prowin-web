import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { calculateStatsForStatus } from '../porte/porte-status.constants';
import {
  ContratsValidesAggregate,
  ContratsValidesPoint,
  CreateStatisticInput,
  OwnerActivityStatistic,
  ProspectionPipeline,
  RepriseStats,
  StatsEffort,
  StatsPeriodComparison,
  StatsPeriodTotals,
  UpdateStatisticInput,
  ZoneStatistic,
  TimelinePoint,
  TeamLastStatusActivity,
} from './statistic.dto';
import { UserStatus } from '../enumeration-Status/user-status.enum';
import {
  AGE_BUCKETS,
  ageBucketIndex,
  declaredDoorCount,
  effectiveTypeHabitat,
  median,
  periodKeyFor,
  previousRange,
  roundRate,
  type PeriodGranularity,
} from './statistic.metrics';

type StatsScopeType = 'all' | 'commercials' | 'managers';
type StatsOwnerType = 'commercial' | 'manager';

interface AccessibleActivityOwners {
  commercialIds: number[];
  managerIds: number[];
  commercialNames: Map<number, string>;
  managerNames: Map<number, string>;
}

@Injectable()
export class StatisticService {
  constructor(private prisma: PrismaService) {}

  private productionUserWhere() {
    return {};
  }

  private mergeWhere(...conditions: any[]) {
    const filteredConditions = conditions.filter(
      (condition) => condition && Object.keys(condition).length > 0,
    );

    if (filteredConditions.length === 0) return {};
    if (filteredConditions.length === 1) return filteredConditions[0];
    return { AND: filteredConditions };
  }

  private productionCommercialWhere(where: any = {}) {
    return this.mergeWhere(where, this.productionUserWhere());
  }

  private productionManagerWhere(where: any = {}) {
    return this.mergeWhere(where, this.productionUserWhere());
  }

  private productionDirecteurWhere(where: any = {}) {
    return this.mergeWhere(where, this.productionUserWhere());
  }

  private productionStatisticOwnerWhere() {
    return {
      AND: [
        {
          OR: [
            { commercialId: null },
            { commercial: this.productionUserWhere() },
          ],
        },
        {
          OR: [
            { managerId: null },
            { manager: this.productionUserWhere() },
          ],
        },
        {
          OR: [
            { directeurId: null },
            { directeur: this.productionUserWhere() },
          ],
        },
      ],
    };
  }

  private productionImmeubleOwnerWhere() {
    return {
      AND: [
        {
          OR: [
            { commercialId: null },
            { commercial: this.productionUserWhere() },
          ],
        },
        {
          OR: [
            { managerId: null },
            { manager: this.productionUserWhere() },
          ],
        },
      ],
    };
  }

  private assignmentIsProductionOwner(
    assignment: { userId: number; userType: string },
    commercialIds: Set<number>,
    managerIds: Set<number>,
    directeurIds: Set<number>,
  ) {
    if (assignment.userType === 'COMMERCIAL') {
      return commercialIds.has(assignment.userId);
    }
    if (assignment.userType === 'MANAGER') {
      return managerIds.has(assignment.userId);
    }
    if (assignment.userType === 'DIRECTEUR') {
      return directeurIds.has(assignment.userId);
    }
    return false;
  }

  private async isProductionRoleUser(userId: number, userRole: string) {
    switch (userRole) {
      case 'admin':
        return true;
      case 'directeur':
        return Boolean(
          await this.prisma.directeur.findFirst({
            where: this.productionDirecteurWhere({ id: userId }),
            select: { id: true },
          }),
        );
      case 'manager':
        return Boolean(
          await this.prisma.manager.findFirst({
            where: this.productionManagerWhere({ id: userId }),
            select: { id: true },
          }),
        );
      case 'commercial':
        return Boolean(
          await this.prisma.commercial.findFirst({
            where: this.productionCommercialWhere({ id: userId }),
            select: { id: true },
          }),
        );
      default:
        return false;
    }
  }

  private normalizeScopeType(scopeType?: string): StatsScopeType {
    const normalized = (scopeType || 'all').toLowerCase();
    if (normalized === 'commercials' || normalized === 'managers') {
      return normalized;
    }
    return 'all';
  }

  private normalizeOwnerType(ownerType?: string): StatsOwnerType | undefined {
    const normalized = ownerType?.toLowerCase();
    if (normalized === 'commercial' || normalized === 'manager') {
      return normalized;
    }
    return undefined;
  }

  private normalizeDate(date?: Date): Date | undefined {
    if (!date) return undefined;
    const value = new Date(date);
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  private buildNameMap(
    users: Array<{ id: number; nom?: string | null; prenom?: string | null }>,
    fallback: string,
  ) {
    return new Map(
      users.map((user) => [
        user.id,
        `${user.prenom || ''} ${user.nom || ''}`.trim() ||
          `${fallback} #${user.id}`,
      ]),
    );
  }

  private async getAccessibleActivityOwners(
    userId: number,
    userRole: string,
  ): Promise<AccessibleActivityOwners> {
    switch (userRole) {
      case 'admin': {
        const [commercials, managers] = await this.prisma.$transaction([
          this.prisma.commercial.findMany({
            where: this.productionCommercialWhere(),
            select: { id: true, nom: true, prenom: true },
          }),
          this.prisma.manager.findMany({
            where: this.productionManagerWhere(),
            select: { id: true, nom: true, prenom: true },
          }),
        ]);

        return {
          commercialIds: commercials.map((commercial) => commercial.id),
          managerIds: managers.map((manager) => manager.id),
          commercialNames: this.buildNameMap(commercials, 'Commercial'),
          managerNames: this.buildNameMap(managers, 'Manager'),
        };
      }

      case 'directeur': {
        const directeur = await this.prisma.directeur.findFirst({
          where: this.productionDirecteurWhere({ id: userId }),
          select: { id: true },
        });
        if (!directeur) {
          return {
            commercialIds: [],
            managerIds: [],
            commercialNames: new Map(),
            managerNames: new Map(),
          };
        }

        const managers = await this.prisma.manager.findMany({
          where: this.productionManagerWhere({ directeurId: userId }),
          select: { id: true, nom: true, prenom: true },
        });
        const managerIds = managers.map((manager) => manager.id);

        const commercials = await this.prisma.commercial.findMany({
          where: this.productionCommercialWhere({
            OR: [{ directeurId: userId }, { managerId: { in: managerIds } }],
          }),
          select: { id: true, nom: true, prenom: true },
        });

        return {
          commercialIds: commercials.map((commercial) => commercial.id),
          managerIds,
          commercialNames: this.buildNameMap(commercials, 'Commercial'),
          managerNames: this.buildNameMap(managers, 'Manager'),
        };
      }

      case 'manager': {
        const [commercials, managers] = await this.prisma.$transaction([
          this.prisma.commercial.findMany({
            where: this.productionCommercialWhere({ managerId: userId }),
            select: { id: true, nom: true, prenom: true },
          }),
          this.prisma.manager.findMany({
            where: this.productionManagerWhere({ id: userId }),
            select: { id: true, nom: true, prenom: true },
          }),
        ]);
        if (managers.length === 0) {
          return {
            commercialIds: [],
            managerIds: [],
            commercialNames: new Map(),
            managerNames: new Map(),
          };
        }

        return {
          commercialIds: commercials.map((commercial) => commercial.id),
          managerIds: managers.map((manager) => manager.id),
          commercialNames: this.buildNameMap(commercials, 'Commercial'),
          managerNames: this.buildNameMap(managers, 'Manager'),
        };
      }

      case 'commercial': {
        const commercial = await this.prisma.commercial.findUnique({
          where: { id: userId },
          select: { id: true, nom: true, prenom: true, status: true },
        });
        const commercials =
          commercial?.status === UserStatus.UTILISATEUR_TEST
            ? []
            : commercial
              ? [commercial]
              : [];

        return {
          commercialIds: commercials.map((item) => item.id),
          managerIds: [],
          commercialNames: this.buildNameMap(commercials, 'Commercial'),
          managerNames: new Map(),
        };
      }

      default:
        return {
          commercialIds: [],
          managerIds: [],
          commercialNames: new Map(),
          managerNames: new Map(),
        };
    }
  }

  private buildStatusHistoryOwnerWhere(
    accessibleOwners: AccessibleActivityOwners,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
  ) {
    const normalizedScope = this.normalizeScopeType(scopeType);
    const normalizedOwnerType = this.normalizeOwnerType(ownerType);

    if (normalizedOwnerType && ownerId) {
      if (
        normalizedOwnerType === 'commercial' &&
        accessibleOwners.commercialIds.includes(ownerId)
      ) {
        return { commercialId: ownerId };
      }
      if (
        normalizedOwnerType === 'manager' &&
        accessibleOwners.managerIds.includes(ownerId)
      ) {
        return { managerId: ownerId };
      }
      return { id: -1 };
    }

    if (normalizedScope === 'commercials') {
      return accessibleOwners.commercialIds.length
        ? { commercialId: { in: accessibleOwners.commercialIds } }
        : { id: -1 };
    }

    if (normalizedScope === 'managers') {
      return accessibleOwners.managerIds.length
        ? { managerId: { in: accessibleOwners.managerIds } }
        : { id: -1 };
    }

    const ownerFilters: any[] = [];
    if (accessibleOwners.commercialIds.length) {
      ownerFilters.push({ commercialId: { in: accessibleOwners.commercialIds } });
    }
    if (accessibleOwners.managerIds.length) {
      ownerFilters.push({ managerId: { in: accessibleOwners.managerIds } });
    }

    if (ownerFilters.length === 0) {
      return { id: -1 };
    }

    return ownerFilters.length === 1 ? ownerFilters[0] : { OR: ownerFilters };
  }

  private buildStatusHistoryDateWhere(startDate?: Date, endDate?: Date) {
    const validStart = this.normalizeDate(startDate);
    const validEnd = this.normalizeDate(endDate);

    if (!validStart && !validEnd) {
      return {};
    }

    return {
      createdAt: {
        ...(validStart ? { gte: validStart } : {}),
        ...(validEnd ? { lte: validEnd } : {}),
      },
    };
  }

  private createTimelinePoint(dateKey: string): TimelinePoint {
    return {
      date: new Date(dateKey),
      rdvPris: 0,
      portesProspectees: 0,
      contratsSignes: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      repassages: 0,
    };
  }

  private accumulateStatusStats(
    target: {
      contratsSignes: number;
      rendezVousPris?: number;
      rdvPris?: number;
      refus: number;
      absents: number;
      argumentes: number;
      repassages: number;
      nbPortesProspectes?: number;
      portesProspectees?: number;
    },
    status: string,
    count: number,
  ) {
    const statusStats = calculateStatsForStatus(status, count);

    target.contratsSignes += statusStats.contratsSignes;
    target.refus += statusStats.refus;
    target.absents += statusStats.absents;
    target.argumentes += statusStats.argumentes;
    target.repassages += status === 'NECESSITE_REPASSAGE' ? count : 0;

    if (target.rendezVousPris !== undefined) {
      target.rendezVousPris += statusStats.rendezVousPris;
    }
    if (target.rdvPris !== undefined) {
      target.rdvPris += statusStats.rendezVousPris;
    }
    if (target.nbPortesProspectes !== undefined) {
      target.nbPortesProspectes += statusStats.nbPortesProspectes;
    }
    if (target.portesProspectees !== undefined) {
      target.portesProspectees += statusStats.nbPortesProspectes;
    }
  }

  private async assertStatisticAccess(
    statisticId: number,
    userId: number,
    userRole: string,
  ) {
    const statistic = await this.prisma.statistic.findUnique({
      where: { id: statisticId },
      include: {
        commercial: {
          select: { id: true, managerId: true, directeurId: true },
        },
        manager: {
          select: { id: true, directeurId: true },
        },
      },
    });

    if (!statistic) {
      throw new NotFoundException('Statistic not found');
    }

    if (userRole === 'admin') {
      return statistic;
    }

    if (
      userRole === 'commercial' &&
      statistic.commercialId !== userId
    ) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'manager') {
      const ownsStatistic =
        statistic.managerId === userId ||
        statistic.commercial?.managerId === userId;

      if (!ownsStatistic) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (userRole === 'directeur') {
      const ownsStatistic =
        statistic.manager?.directeurId === userId ||
        statistic.commercial?.directeurId === userId;

      if (!ownsStatistic) {
        throw new ForbiddenException('Access denied');
      }
    }

    return statistic;
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

  async create(data: CreateStatisticInput) {
    return this.prisma.statistic.create({
      data,
      include: {
        commercial: true,
        manager: true,
      },
    });
  }

  async findAll(commercialId?: number, userId?: number, userRole?: string) {
    // Construire les conditions de filtrage
    let whereConditions: any = {};

    // Si commercialId est spécifié, filtrer par commercial
    if (commercialId) {
      whereConditions.commercialId = commercialId;
    }

    // Si userId et userRole sont fournis, appliquer la filtration par rôle
    if (userId && userRole) {
      if (!(await this.isProductionRoleUser(userId, userRole))) {
        return [];
      }

      switch (userRole) {
        case 'admin':
          // Pas de filtrage supplémentaire pour admin
          break;

        case 'directeur':
          // Statistiques des commerciaux ET managers du directeur
          whereConditions.OR = [
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

        case 'manager':
          // Statistiques des commerciaux du manager ET ses propres statistiques
          whereConditions.OR = [
            {
              commercial: {
                managerId: userId,
              },
            },
            {
              managerId: userId,
            },
          ];
          break;

        case 'commercial':
          // Statistiques du commercial lui-même
          whereConditions.commercialId = userId;
          break;

        default:
          return [];
      }
    }

    return this.prisma.statistic.findMany({
      where: this.mergeWhere(
        whereConditions,
        this.productionStatisticOwnerWhere(),
      ),
      include: {
        commercial: true,
        manager: true,
      },
    });
  }

  async findOne(id: number, userId: number, userRole: string) {
    await this.assertStatisticAccess(id, userId, userRole);

    return this.prisma.statistic.findUnique({
      where: { id },
      include: {
        commercial: true,
        manager: true,
      },
    });
  }

  async getTeamLastStatusActivities(
    userId: number,
    userRole: string,
  ): Promise<TeamLastStatusActivity[]> {
    if (!(await this.isProductionRoleUser(userId, userRole))) {
      return [];
    }

    let commercialWhere: any = {};
    let managerWhere: any = {};

    switch (userRole) {
      case 'admin':
        break;
      case 'directeur':
        commercialWhere = { directeurId: userId };
        managerWhere = { directeurId: userId };
        break;
      case 'manager':
        commercialWhere = { managerId: userId };
        managerWhere = { id: userId };
        break;
      case 'commercial':
        commercialWhere = { id: userId };
        managerWhere = { id: -1 };
        break;
      default:
        return [];
    }

    const [commercials, managers] = await this.prisma.$transaction([
      this.prisma.commercial.findMany({
        where: this.productionCommercialWhere(commercialWhere),
        select: { id: true, nom: true, prenom: true },
      }),
      this.prisma.manager.findMany({
        where: this.productionManagerWhere(managerWhere),
        select: { id: true, nom: true, prenom: true },
      }),
    ]);

    const commercialIds = commercials.map((commercial) => commercial.id);
    const managerIds = managers.map((manager) => manager.id);

    const [commercialActivities, managerActivities] =
      await this.prisma.$transaction([
        this.prisma.statusHistorique.findMany({
          where: { commercialId: { in: commercialIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['commercialId'],
          include: {
            porte: {
              select: {
                id: true,
                numero: true,
                immeubleId: true,
                immeuble: { select: { adresse: true } },
              },
            },
            commercial: { select: { id: true, nom: true, prenom: true } },
          },
        }),
        this.prisma.statusHistorique.findMany({
          where: { managerId: { in: managerIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['managerId'],
          include: {
            porte: {
              select: {
                id: true,
                numero: true,
                immeubleId: true,
                immeuble: { select: { adresse: true } },
              },
            },
            manager: { select: { id: true, nom: true, prenom: true } },
          },
        }),
      ]);

    return [
      ...commercialActivities.map((activity) => ({
        userId: activity.commercialId!,
        userType: 'commercial',
        userName:
          `${activity.commercial?.prenom || ''} ${activity.commercial?.nom || ''}`.trim() ||
          `Commercial #${activity.commercialId}`,
        statut: activity.statut,
        changedAt: activity.createdAt,
        porteId: activity.porteId,
        porteNumero: activity.porte.numero,
        immeubleId: activity.porte.immeubleId,
        immeubleAdresse: activity.porte.immeuble?.adresse,
      })),
      ...managerActivities.map((activity) => ({
        userId: activity.managerId!,
        userType: 'manager',
        userName:
          `${activity.manager?.prenom || ''} ${activity.manager?.nom || ''}`.trim() ||
          `Manager #${activity.managerId}`,
        statut: activity.statut,
        changedAt: activity.createdAt,
        porteId: activity.porteId,
        porteNumero: activity.porte.numero,
        immeubleId: activity.porte.immeubleId,
        immeubleAdresse: activity.porte.immeuble?.adresse,
      })),
    ].sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  }

  async update(
    data: UpdateStatisticInput,
    userId: number,
    userRole: string,
  ) {
    const { id, ...updateData } = data;

    const statistic = await this.assertStatisticAccess(id, userId, userRole);

    if (userRole !== 'admin') {
      if (
        updateData.commercialId &&
        updateData.commercialId !== statistic.commercialId
      ) {
        throw new ForbiddenException('Cannot reassign statistic owner');
      }

      if (
        updateData.managerId &&
        updateData.managerId !== statistic.managerId
      ) {
        throw new ForbiddenException('Cannot reassign statistic owner');
      }
    }

    return this.prisma.statistic.update({
      where: { id },
      data: updateData,
      include: {
        commercial: true,
        manager: true,
      },
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    await this.assertStatisticAccess(id, userId, userRole);

    return this.prisma.statistic.delete({
      where: { id },
      include: {
        commercial: true,
        manager: true,
      },
    });
  }

  async getZoneStatistics(
    userId?: number,
    userRole?: string,
  ): Promise<ZoneStatistic[]> {
    if (
      userId &&
      userRole &&
      !(await this.isProductionRoleUser(userId, userRole))
    ) {
      return [];
    }

    // =====================================================
    // ZoneEnCours + HistoriqueZone
    // =====================================================

    // 1. Récupérer toutes les assignations en cours
    const currentAssignments = await this.prisma.zoneEnCours.findMany({
      include: {
        zone: true,
      },
    });

    // 2. Récupérer tout l'historique des assignations
    const historyAssignments = await this.prisma.historiqueZone.findMany({
      include: {
        zone: true,
      },
    });

    const [productionCommercials, productionManagers, productionDirecteurs] =
      await this.prisma.$transaction([
        this.prisma.commercial.findMany({
          where: this.productionCommercialWhere(),
          select: { id: true },
        }),
        this.prisma.manager.findMany({
          where: this.productionManagerWhere(),
          select: { id: true },
        }),
        this.prisma.directeur.findMany({
          where: this.productionDirecteurWhere(),
          select: { id: true },
        }),
      ]);
    const commercialIdsByZoneScope = new Set(
      productionCommercials.map((commercial) => commercial.id),
    );
    const managerIdsByZoneScope = new Set(
      productionManagers.map((manager) => manager.id),
    );
    const directeurIdsByZoneScope = new Set(
      productionDirecteurs.map((directeur) => directeur.id),
    );

    // 3. Créer un Set de toutes les zones qui ont été prospectées
    let allZoneIds = new Set<number>();
    currentAssignments
      .filter((assignment) =>
        this.assignmentIsProductionOwner(
          assignment,
          commercialIdsByZoneScope,
          managerIdsByZoneScope,
          directeurIdsByZoneScope,
        ),
      )
      .forEach((assignment) => allZoneIds.add(assignment.zoneId));
    historyAssignments
      .filter((assignment) =>
        this.assignmentIsProductionOwner(
          assignment,
          commercialIdsByZoneScope,
          managerIdsByZoneScope,
          directeurIdsByZoneScope,
        ),
      )
      .forEach((assignment) => allZoneIds.add(assignment.zoneId));

    // 4. Filtrer les zones selon le rôle de l'utilisateur
    if (userId && userRole && userRole !== 'admin') {
      const authorizedZoneIds = new Set<number>();

      switch (userRole) {
        case 'commercial':
          // Un commercial ne voit que les zones où il a été assigné
          currentAssignments
            .filter(
              (a) =>
                a.userId === userId &&
                a.userType === 'COMMERCIAL' &&
                commercialIdsByZoneScope.has(a.userId),
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) =>
                h.userId === userId &&
                h.userType === 'COMMERCIAL' &&
                commercialIdsByZoneScope.has(h.userId),
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));
          break;

        case 'manager':
          // Un manager voit les zones où lui ou ses commerciaux ont été assignés
          // Récupérer les IDs des commerciaux du manager
          const managerCommercials = await this.prisma.commercial.findMany({
            where: this.productionCommercialWhere({ managerId: userId }),
            select: { id: true },
          });
          const commercialIds = managerCommercials.map((c) => c.id);

          // Zones du manager lui-même
          currentAssignments
            .filter(
              (a) =>
                a.userId === userId &&
                a.userType === 'MANAGER' &&
                managerIdsByZoneScope.has(a.userId),
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) =>
                h.userId === userId &&
                h.userType === 'MANAGER' &&
                managerIdsByZoneScope.has(h.userId),
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));

          // Zones des commerciaux du manager
          currentAssignments
            .filter(
              (a) =>
                commercialIds.includes(a.userId) &&
                a.userType === 'COMMERCIAL',
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) =>
                commercialIds.includes(h.userId) &&
                h.userType === 'COMMERCIAL',
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));
          break;

        case 'directeur':
          // Un directeur voit les zones où lui, ses managers ou ses commerciaux ont été assignés
          // Récupérer les IDs des managers du directeur
          const directeurManagers = await this.prisma.manager.findMany({
            where: this.productionManagerWhere({ directeurId: userId }),
            select: { id: true },
          });
          const managerIds = directeurManagers.map((m) => m.id);

          // Récupérer les IDs des commerciaux du directeur
          const directeurCommercials = await this.prisma.commercial.findMany({
            where: this.productionCommercialWhere({
              OR: [{ directeurId: userId }, { managerId: { in: managerIds } }],
            }),
            select: { id: true },
          });
          const directeurCommercialIds = directeurCommercials.map((c) => c.id);

          // Zones du directeur lui-même
          currentAssignments
            .filter(
              (a) =>
                a.userId === userId &&
                a.userType === 'DIRECTEUR' &&
                directeurIdsByZoneScope.has(a.userId),
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) =>
                h.userId === userId &&
                h.userType === 'DIRECTEUR' &&
                directeurIdsByZoneScope.has(h.userId),
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));

          // Zones des managers du directeur
          currentAssignments
            .filter(
              (a) => managerIds.includes(a.userId) && a.userType === 'MANAGER',
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) => managerIds.includes(h.userId) && h.userType === 'MANAGER',
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));

          // Zones des commerciaux du directeur
          currentAssignments
            .filter(
              (a) =>
                directeurCommercialIds.includes(a.userId) &&
                a.userType === 'COMMERCIAL',
            )
            .forEach((a) => authorizedZoneIds.add(a.zoneId));
          historyAssignments
            .filter(
              (h) =>
                directeurCommercialIds.includes(h.userId) &&
                h.userType === 'COMMERCIAL',
            )
            .forEach((h) => authorizedZoneIds.add(h.zoneId));
          break;

        default:
          return [];
      }

      // Utiliser uniquement les zones autorisées
      allZoneIds = authorizedZoneIds;
    }

    // 4. Récupérer les détails des zones
    const zones = await this.prisma.zone.findMany({
      where: {
        id: { in: Array.from(allZoneIds) },
      },
    });

    // 5. Calculer les statistiques agrégées pour chaque zone
    const zoneStatistics: ZoneStatistic[] = await Promise.all(
      zones.map(async (zone) => {
        // NOUVELLE LOGIQUE: Compter directement les portes des immeubles dans cette zone
        // Ceci donne les vraies statistiques de la zone, pas les stats agrégées des commerciaux

        // Compter les portes par statut pour cette zone
        const portesGroupedByStatut = await this.prisma.porte.groupBy({
          by: ['statut'],
          where: {
            immeuble: {
              ...this.productionImmeubleOwnerWhere(),
              zoneId: zone.id,
            },
          },
          _count: {
            statut: true,
          },
          _sum: {
            nbContrats: true,
          },
        });

        // Calculer les stats à partir des portes
        let totalStats = {
          contratsSignes: 0,
          immeublesVisites: 0,
          rendezVousPris: 0,
          refus: 0,
          immeublesProspectes: 0,
          portesProspectes: 0,
        };

        // Utilisation du helper centralisé pour calculer les stats
        portesGroupedByStatut.forEach((group) => {
          const count = group._count.statut;
          const totalContrats = group._sum.nbContrats || 0;
          const statusStats = calculateStatsForStatus(group.statut, count);

          if (group.statut === 'CONTRAT_SIGNE') {
             totalStats.contratsSignes += totalContrats;
          } else {
             totalStats.contratsSignes += statusStats.contratsSignes;
          }
          
          totalStats.rendezVousPris += statusStats.rendezVousPris;
          totalStats.refus += statusStats.refus;
          totalStats.portesProspectes += statusStats.nbPortesProspectes;
        });

        // Compter les immeubles visités (au moins une porte non NON_VISITE)
        const immeublesVisites = await this.prisma.immeuble.count({
          where: {
            ...this.productionImmeubleOwnerWhere(),
            zoneId: zone.id,
            portes: {
              some: {
                statut: {
                  not: 'NON_VISITE',
                },
              },
            },
          },
        });

        totalStats.immeublesVisites = immeublesVisites;
        totalStats.immeublesProspectes = immeublesVisites;

        // Compter le nombre unique de commerciaux et managers assignés à cette zone
        const usersInZone = new Set<number>();

        // Utilisateurs des assignations actuelles
        const zoneCurrentAssignments = currentAssignments.filter(
          (a) =>
            a.zoneId === zone.id &&
            this.assignmentIsProductionOwner(
              a,
              commercialIdsByZoneScope,
              managerIdsByZoneScope,
              directeurIdsByZoneScope,
            ),
        );
        zoneCurrentAssignments.forEach((assignment) => {
          usersInZone.add(assignment.userId);
        });

        // Utilisateurs de l'historique
        const zoneHistory = historyAssignments.filter(
          (h) =>
            h.zoneId === zone.id &&
            this.assignmentIsProductionOwner(
              h,
              commercialIdsByZoneScope,
              managerIdsByZoneScope,
              directeurIdsByZoneScope,
            ),
        );
        zoneHistory.forEach((history) => {
          usersInZone.add(history.userId);
        });

        // Les totaux finaux
        const totalContratsSignes = totalStats.contratsSignes;
        const totalImmeublesVisites = totalStats.immeublesVisites;
        const totalRendezVousPris = totalStats.rendezVousPris;
        const totalRefus = totalStats.refus;
        const totalImmeublesProspectes = totalStats.immeublesProspectes;
        const totalPortesProspectes = totalStats.portesProspectes;

        // Calculs des taux
        const tauxConversion =
          totalRefus + totalRendezVousPris + totalContratsSignes > 0
            ? (totalContratsSignes /
                (totalRefus + totalRendezVousPris + totalContratsSignes)) *
              100
            : 0;

        const tauxSuccesRdv =
          totalImmeublesVisites > 0
            ? (totalRendezVousPris / totalImmeublesVisites) * 100
            : 0;

        // Performance globale (somme des 2 taux)
        const performanceGlobale = tauxConversion + tauxSuccesRdv;

        return {
          zoneId: zone.id,
          zoneName: zone.nom,
          totalContratsSignes,
          totalImmeublesVisites,
          totalRendezVousPris,
          totalRefus,
          totalImmeublesProspectes,
          totalPortesProspectes,
          tauxConversion: Math.round(tauxConversion * 100) / 100,
          tauxSuccesRdv: Math.round(tauxSuccesRdv * 100) / 100,
          nombreCommerciaux: usersInZone.size,
          performanceGlobale: Math.round(performanceGlobale * 100) / 100,
        };
      }),
    );

    // Trier par performance globale décroissante
    return zoneStatistics.sort(
      (a, b) => b.performanceGlobale - a.performanceGlobale,
    );
  }

  async ensureCanSyncCommercialStats(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    await this.ensureImmeubleAccess(immeubleId, userId, userRole);
  }

  async ensureCanSyncManagerStats(
    managerId: number,
    userId: number,
    userRole: string,
  ) {
    const manager = await this.prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, directeurId: true },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    if (userRole === 'admin') {
      return;
    }

    if (userRole === 'directeur' && manager.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'manager' && manager.id !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async ensureCommercialAccess(
    commercialId: number,
    userId: number,
    userRole: string,
  ) {
    const commercial = await this.prisma.commercial.findUnique({
      where: { id: commercialId },
      select: { id: true, managerId: true, directeurId: true, status: true },
    });

    if (!commercial || commercial.status === UserStatus.UTILISATEUR_TEST) {
      throw new NotFoundException('Commercial not found');
    }

    if (userRole === 'admin') {
      return;
    }

    if (userRole === 'commercial' && commercial.id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'manager' && commercial.managerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (userRole === 'directeur' && commercial.directeurId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  async statsTimelineByCommercial(
    commercialId: number,
    userId: number,
    userRole: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimelinePoint[]> {
    await this.ensureCommercialAccess(commercialId, userId, userRole);

    const validStart =
      startDate && !isNaN(new Date(startDate).getTime())
        ? new Date(startDate)
        : undefined;
    const validEnd =
      endDate && !isNaN(new Date(endDate).getTime())
        ? new Date(endDate)
        : undefined;

    const history = await this.prisma.statusHistorique.findMany({
      where: {
        commercialId,
        ...(validStart || validEnd
          ? {
              createdAt: {
                ...(validStart ? { gte: validStart } : {}),
                ...(validEnd ? { lte: validEnd } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        statut: true,
        createdAt: true,
        porteId: true,
        porte: {
          select: { nbContrats: true },
        },
      },
    });

    const grouped = new Map<string, TimelinePoint>();

    history.forEach((entry) => {
      const dayKey = entry.createdAt.toISOString().slice(0, 10);
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, this.createTimelinePoint(dayKey));
      }

      // Pour CONTRAT_SIGNE, on multiplie par porte.nbContrats (une porte
      // peut représenter plusieurs contrats signés à la fois). Pour les
      // autres statuts, on compte 1 par évènement.
      const count =
        entry.statut === 'CONTRAT_SIGNE'
          ? entry.porte?.nbContrats || 1
          : 1;
      const current = grouped.get(dayKey)!;
      this.accumulateStatusStats(current, entry.statut, count);
    });

    return Array.from(grouped.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  async statsTimeline(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimelinePoint[]> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const ownerWhere = this.buildStatusHistoryOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );
    const dateWhere = this.buildStatusHistoryDateWhere(startDate, endDate);

    const history = await this.prisma.statusHistorique.findMany({
      where: {
        ...ownerWhere,
        ...dateWhere,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        statut: true,
        createdAt: true,
        porte: {
          select: { nbContrats: true },
        },
      },
    });

    const grouped = new Map<string, TimelinePoint>();

    history.forEach((entry) => {
      const dayKey = entry.createdAt.toISOString().slice(0, 10);
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, this.createTimelinePoint(dayKey));
      }

      const count =
        entry.statut === 'CONTRAT_SIGNE'
          ? entry.porte?.nbContrats || 1
          : 1;
      this.accumulateStatusStats(grouped.get(dayKey)!, entry.statut, count);
    });

    return Array.from(grouped.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  async statsActivityByOwner(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<OwnerActivityStatistic[]> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const normalizedScope = this.normalizeScopeType(scopeType);
    const normalizedOwnerType = this.normalizeOwnerType(ownerType);
    const ownerWhere = this.buildStatusHistoryOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );
    const dateWhere = this.buildStatusHistoryDateWhere(startDate, endDate);

    const history = await this.prisma.statusHistorique.findMany({
      where: {
        ...ownerWhere,
        ...dateWhere,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        commercialId: true,
        managerId: true,
        statut: true,
        createdAt: true,
        porte: {
          select: { nbContrats: true },
        },
      },
    });

    const grouped = new Map<string, OwnerActivityStatistic>();

    const resolveOwner = (entry: {
      commercialId: number | null;
      managerId: number | null;
    }): { id: number; type: StatsOwnerType; name: string } | null => {
      if (normalizedOwnerType === 'commercial' && entry.commercialId) {
        return {
          id: entry.commercialId,
          type: 'commercial',
          name:
            accessibleOwners.commercialNames.get(entry.commercialId) ||
            `Commercial #${entry.commercialId}`,
        };
      }

      if (normalizedOwnerType === 'manager' && entry.managerId) {
        return {
          id: entry.managerId,
          type: 'manager',
          name:
            accessibleOwners.managerNames.get(entry.managerId) ||
            `Manager #${entry.managerId}`,
        };
      }

      if (normalizedScope === 'commercials' && entry.commercialId) {
        return {
          id: entry.commercialId,
          type: 'commercial',
          name:
            accessibleOwners.commercialNames.get(entry.commercialId) ||
            `Commercial #${entry.commercialId}`,
        };
      }

      if (normalizedScope === 'managers' && entry.managerId) {
        return {
          id: entry.managerId,
          type: 'manager',
          name:
            accessibleOwners.managerNames.get(entry.managerId) ||
            `Manager #${entry.managerId}`,
        };
      }

      if (entry.managerId && !entry.commercialId) {
        return {
          id: entry.managerId,
          type: 'manager',
          name:
            accessibleOwners.managerNames.get(entry.managerId) ||
            `Manager #${entry.managerId}`,
        };
      }

      if (entry.commercialId) {
        return {
          id: entry.commercialId,
          type: 'commercial',
          name:
            accessibleOwners.commercialNames.get(entry.commercialId) ||
            `Commercial #${entry.commercialId}`,
        };
      }

      if (entry.managerId) {
        return {
          id: entry.managerId,
          type: 'manager',
          name:
            accessibleOwners.managerNames.get(entry.managerId) ||
            `Manager #${entry.managerId}`,
        };
      }

      return null;
    };

    history.forEach((entry) => {
      const owner = resolveOwner(entry);
      if (!owner) return;

      const key = `${owner.type}:${owner.id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          userId: owner.id,
          userType: owner.type,
          userName: owner.name,
          contratsSignes: 0,
          rendezVousPris: 0,
          refus: 0,
          absents: 0,
          argumentes: 0,
          repassages: 0,
          nbPortesProspectes: 0,
          tauxConversion: 0,
          points: 0,
          lastActivityAt: undefined,
        });
      }

      const count =
        entry.statut === 'CONTRAT_SIGNE'
          ? entry.porte?.nbContrats || 1
          : 1;
      const current = grouped.get(key)!;
      this.accumulateStatusStats(current, entry.statut, count);
      current.lastActivityAt = entry.createdAt;
    });

    return Array.from(grouped.values())
      .map((item) => {
        const opportunities =
          item.contratsSignes + item.rendezVousPris + item.refus;
        return {
          ...item,
          tauxConversion:
            opportunities > 0
              ? Math.round((item.contratsSignes / opportunities) * 1000) / 10
              : 0,
          points:
            item.contratsSignes * 50 +
            item.rendezVousPris * 10 +
            item.argumentes * 4 +
            item.nbPortesProspectes * 2,
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.contratsSignes - a.contratsSignes ||
          b.rendezVousPris - a.rendezVousPris,
      );
  }

  // ==========================================================================
  // Pilotage : comparaison de périodes, effort, contrats validés
  // ==========================================================================

  private emptyPeriodTotals(
    startDate?: Date,
    endDate?: Date,
  ): StatsPeriodTotals {
    return {
      startDate,
      endDate,
      contratsSignes: 0,
      rendezVousPris: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      repassages: 0,
      nbPortesProspectes: 0,
      nbPortesDistinctes: 0,
      nbIntervenants: 0,
      nbJoursActifs: 0,
      tauxConversion: 0,
      tauxContact: 0,
      tauxRdv: 0,
    };
  }

  private roundRate(value: number) {
    return roundRate(value);
  }

  /**
   * Agrège les évènements `StatusHistorique` d'une plage en totaux comparables.
   *
   * Les taux sont dérivés ici et nulle part ailleurs : `tauxConversion` sur les
   * opportunités (signé + RDV + refus), `tauxContact` et `tauxRdv` sur les portes
   * prospectées. `nbPortesDistinctes` distingue « 40 passages » de « 40 portes ».
   */
  private async aggregatePeriodTotals(
    ownerWhere: any,
    startDate?: Date,
    endDate?: Date,
  ): Promise<StatsPeriodTotals> {
    const history = await this.prisma.statusHistorique.findMany({
      where: {
        ...ownerWhere,
        ...this.buildStatusHistoryDateWhere(startDate, endDate),
      },
      select: {
        statut: true,
        createdAt: true,
        porteId: true,
        commercialId: true,
        managerId: true,
        porte: { select: { nbContrats: true } },
      },
    });

    const totals = this.emptyPeriodTotals(startDate, endDate);
    const portes = new Set<number>();
    const owners = new Set<string>();
    const jours = new Set<string>();

    history.forEach((entry) => {
      const count =
        entry.statut === 'CONTRAT_SIGNE' ? entry.porte?.nbContrats || 1 : 1;
      this.accumulateStatusStats(totals, entry.statut, count);

      portes.add(entry.porteId);
      jours.add(entry.createdAt.toISOString().slice(0, 10));
      if (entry.commercialId != null) {
        owners.add(`commercial:${entry.commercialId}`);
      } else if (entry.managerId != null) {
        owners.add(`manager:${entry.managerId}`);
      }
    });

    totals.nbPortesDistinctes = portes.size;
    totals.nbIntervenants = owners.size;
    totals.nbJoursActifs = jours.size;

    const opportunites =
      totals.contratsSignes + totals.rendezVousPris + totals.refus;
    const contactes = opportunites + totals.argumentes;

    totals.tauxConversion =
      opportunites > 0
        ? this.roundRate((totals.contratsSignes / opportunites) * 100)
        : 0;
    totals.tauxContact =
      totals.nbPortesProspectes > 0
        ? this.roundRate((contactes / totals.nbPortesProspectes) * 100)
        : 0;
    totals.tauxRdv =
      totals.nbPortesProspectes > 0
        ? this.roundRate(
            (totals.rendezVousPris / totals.nbPortesProspectes) * 100,
          )
        : 0;

    return totals;
  }

  /** Cf. `statistic.metrics.ts` — logique et tests y vivent. */
  private previousRange(startDate?: Date, endDate?: Date) {
    return previousRange(startDate, endDate);
  }

  async statsPeriodComparison(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<StatsPeriodComparison> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const ownerWhere = this.buildStatusHistoryOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );

    const previous = this.previousRange(startDate, endDate);
    const [current, previousTotals] = await Promise.all([
      this.aggregatePeriodTotals(ownerWhere, startDate, endDate),
      previous
        ? this.aggregatePeriodTotals(
            ownerWhere,
            previous.startDate,
            previous.endDate,
          )
        : Promise.resolve(undefined),
    ]);

    return { current, previous: previousTotals };
  }

  private median(values: number[]): number {
    return median(values);
  }

  /**
   * Effort terrain mesuré, depuis `StatusHistorique.duree` (renseignée par le
   * mobile). `nbPassagesSansDuree` est exposé pour que l'UI puisse dire sur
   * quelle part de l'activité la mesure porte réellement — un temps moyen
   * calculé sur 10 % des passages ne vaut pas un temps moyen sur 90 %.
   */
  async statsEffort(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<StatsEffort> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const ownerWhere = this.buildStatusHistoryOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );

    const history = await this.prisma.statusHistorique.findMany({
      where: {
        ...ownerWhere,
        ...this.buildStatusHistoryDateWhere(startDate, endDate),
      },
      select: {
        duree: true,
        statut: true,
        porte: { select: { nbContrats: true } },
      },
    });

    const durees: number[] = [];
    let nbPassagesSansDuree = 0;
    let contratsSignes = 0;
    let rendezVousPris = 0;

    history.forEach((entry) => {
      if (entry.duree != null && entry.duree > 0) {
        durees.push(entry.duree);
      } else {
        nbPassagesSansDuree += 1;
      }

      if (entry.statut === 'CONTRAT_SIGNE') {
        contratsSignes += entry.porte?.nbContrats || 1;
      } else if (entry.statut === 'RENDEZ_VOUS_PRIS') {
        rendezVousPris += 1;
      }
    });

    const dureeTotaleSec = durees.reduce((sum, value) => sum + value, 0);
    const nbPassagesMesures = durees.length;

    return {
      nbPassagesMesures,
      nbPassagesSansDuree,
      dureeTotaleSec,
      dureeMoyenneParPassageSec: nbPassagesMesures
        ? Math.round((dureeTotaleSec / nbPassagesMesures) * 10) / 10
        : 0,
      dureeMedianeParPassageSec:
        Math.round(this.median(durees) * 10) / 10,
      dureeParContratSignesSec: contratsSignes
        ? Math.round((dureeTotaleSec / contratsSignes) * 10) / 10
        : undefined,
      dureeParRdvSec: rendezVousPris
        ? Math.round((dureeTotaleSec / rendezVousPris) * 10) / 10
        : undefined,
      passagesParHeure: dureeTotaleSec
        ? Math.round((nbPassagesMesures / (dureeTotaleSec / 3600)) * 10) / 10
        : 0,
    };
  }

  /**
   * Contrats validés back-office (`ContratValide`) agrégés sur la plage.
   *
   * On filtre sur `dateValidation` (le fait générateur côté back-office) et on
   * regroupe via les clés de période déjà stockées, pour ne pas recalculer un
   * découpage calendaire côté applicatif.
   *
   * `buildStatusHistoryOwnerWhere` est réutilisé tel quel : il ne produit que des
   * clauses sur `id` / `commercialId` / `managerId`, trois champs que
   * `ContratValide` porte aussi. Le périmètre de visibilité est donc identique à
   * celui de l'activité terrain, ce qui est la condition pour comparer les deux.
   */
  async contratsValidesAggregate(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
    startDate?: Date,
    endDate?: Date,
    granularity?: string,
  ): Promise<ContratsValidesAggregate> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const ownerWhere = this.buildStatusHistoryOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );

    const validStart = this.normalizeDate(startDate);
    const validEnd = this.normalizeDate(endDate);
    const dateWhere =
      validStart || validEnd
        ? {
            dateValidation: {
              ...(validStart ? { gte: validStart } : {}),
              ...(validEnd ? { lte: validEnd } : {}),
            },
          }
        : {};

    const normalizedGranularity: PeriodGranularity =
      granularity === 'month' || granularity === 'week' ? granularity : 'day';

    // Les colonnes `periodDay/Week/Month` de `ContratValide` ne sont pas utilisées
    // pour le regroupement : `periodWeek` est fausse aux bords d'année (cf.
    // `isoWeekKey` dans `statistic.metrics.ts`). On regroupe donc depuis
    // `dateValidation`, avec le même helper que le reste du pilotage. Le filtrage
    // reste sur `dateValidation`, qui est indexée.
    const rows = await this.prisma.contratValide.findMany({
      where: { ...ownerWhere, ...dateWhere },
      select: {
        dateValidation: true,
        dateSignature: true,
      },
    });

    const byPeriod = new Map<string, number>();
    const delais: number[] = [];
    let nbSansDateSignature = 0;

    rows.forEach((row) => {
      const key = periodKeyFor(row.dateValidation, normalizedGranularity);
      byPeriod.set(key, (byPeriod.get(key) || 0) + 1);

      if (!row.dateSignature) {
        nbSansDateSignature += 1;
        return;
      }
      const delaiMs =
        row.dateValidation.getTime() - row.dateSignature.getTime();
      // Un délai négatif signale une donnée incohérente côté source : on
      // l'écarte plutôt que de tirer la médiane vers le bas.
      if (delaiMs >= 0) delais.push(delaiMs / 86400000);
    });

    const series: ContratsValidesPoint[] = Array.from(byPeriod.entries())
      .map(([periodKey, contratsValides]) => ({ periodKey, contratsValides }))
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

    const previous = this.previousRange(startDate, endDate);
    const totalPrevious = previous
      ? await this.prisma.contratValide.count({
          where: {
            ...ownerWhere,
            dateValidation: {
              gte: previous.startDate,
              lte: previous.endDate,
            },
          },
        })
      : undefined;

    return {
      total: rows.length,
      totalPrevious,
      series,
      delaiMedianValidationJours: delais.length
        ? Math.round(this.median(delais) * 10) / 10
        : undefined,
      nbSansDateSignature,
    };
  }

  // ==========================================================================
  // Pipeline : le stock de travail en cours
  // ==========================================================================

  /**
   * Restreint les bâtiments au périmètre visible par l'appelant.
   *
   * `Porte` ne porte pas de propriétaire : c'est l'`Immeuble` qui référence le
   * commercial ou le manager. On traverse donc la relation plutôt que de dupliquer
   * une notion de propriété sur la porte.
   */
  private buildImmeubleOwnerWhere(
    accessibleOwners: AccessibleActivityOwners,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
  ) {
    const normalizedScope = this.normalizeScopeType(scopeType);
    const normalizedOwnerType = this.normalizeOwnerType(ownerType);

    if (normalizedOwnerType && ownerId) {
      if (
        normalizedOwnerType === 'commercial' &&
        accessibleOwners.commercialIds.includes(ownerId)
      ) {
        return { commercialId: ownerId };
      }
      if (
        normalizedOwnerType === 'manager' &&
        accessibleOwners.managerIds.includes(ownerId)
      ) {
        return { managerId: ownerId };
      }
      return { id: -1 };
    }

    if (normalizedScope === 'commercials') {
      return accessibleOwners.commercialIds.length
        ? { commercialId: { in: accessibleOwners.commercialIds } }
        : { id: -1 };
    }

    if (normalizedScope === 'managers') {
      return accessibleOwners.managerIds.length
        ? { managerId: { in: accessibleOwners.managerIds } }
        : { id: -1 };
    }

    const filters: any[] = [];
    if (accessibleOwners.commercialIds.length) {
      filters.push({ commercialId: { in: accessibleOwners.commercialIds } });
    }
    if (accessibleOwners.managerIds.length) {
      filters.push({ managerId: { in: accessibleOwners.managerIds } });
    }

    if (filters.length === 0) return { id: -1 };
    return filters.length === 1 ? filters[0] : { OR: filters };
  }

  /**
   * État courant du travail de prospection.
   *
   * Volontairement **sans filtre de période** : un stock se lit à l'instant présent.
   * « Combien de portes attendent un repassage » n'a pas de sens sur les 30 derniers
   * jours — la question est combien il en reste maintenant.
   */
  async prospectionPipeline(
    userId: number,
    userRole: string,
    scopeType?: string,
    ownerType?: string,
    ownerId?: number,
  ): Promise<ProspectionPipeline> {
    const accessibleOwners = await this.getAccessibleActivityOwners(
      userId,
      userRole,
    );
    const immeubleWhere = this.buildImmeubleOwnerWhere(
      accessibleOwners,
      scopeType,
      ownerType,
      ownerId,
    );

    const immeubles = await this.prisma.immeuble.findMany({
      where: immeubleWhere,
      select: {
        id: true,
        typeHabitat: true,
        nbEtages: true,
        nbPortesParEtage: true,
        nbMaisonsPrevu: true,
        portes: {
          select: {
            id: true,
            statut: true,
            rdvDate: true,
            derniereVisite: true,
          },
        },
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const bucketCounts = AGE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: 0,
    }));

    const repassages = { total: 0, plusAncienJours: undefined as number | undefined };
    const rdv = {
      total: 0,
      aujourdhui: 0,
      aVenir: 0,
      enRetard: 0,
      sansDate: 0,
      plusEnRetardJours: undefined as number | undefined,
    };
    const conclusions = {
      contratsSignes: 0,
      argumentes: 0,
      refus: 0,
      total: 0,
    };
    let nonVisitees = 0;

    const habitatMap = new Map<
      string,
      {
        batiments: number;
        portesCreees: number;
        capaciteDeclaree: number;
        prospectees: number;
        aTraiter: number;
      }
    >();

    for (const immeuble of immeubles) {
      const effectif = effectiveTypeHabitat(immeuble);

      const habitat =
        habitatMap.get(effectif) ??
        {
          batiments: 0,
          portesCreees: 0,
          capaciteDeclaree: 0,
          prospectees: 0,
          aTraiter: 0,
        };
      habitat.batiments += 1;
      habitat.capaciteDeclaree += declaredDoorCount(immeuble);

      for (const porte of immeuble.portes) {
        habitat.portesCreees += 1;
        if (porte.statut !== 'NON_VISITE') habitat.prospectees += 1;

        switch (porte.statut) {
          case 'NON_VISITE':
            nonVisitees += 1;
            break;

          case 'ABSENT':
          case 'NECESSITE_REPASSAGE': {
            repassages.total += 1;
            habitat.aTraiter += 1;

            const reference = porte.derniereVisite;
            if (reference) {
              const days = Math.floor(
                (Date.now() - reference.getTime()) / 86400000,
              );
              bucketCounts[ageBucketIndex(days)].count += 1;
              if (
                repassages.plusAncienJours === undefined ||
                days > repassages.plusAncienJours
              ) {
                repassages.plusAncienJours = days;
              }
            }
            break;
          }

          case 'RENDEZ_VOUS_PRIS': {
            rdv.total += 1;
            habitat.aTraiter += 1;

            if (!porte.rdvDate) {
              rdv.sansDate += 1;
              break;
            }
            if (porte.rdvDate < startOfToday) {
              rdv.enRetard += 1;
              const days = Math.floor(
                (startOfToday.getTime() - porte.rdvDate.getTime()) / 86400000,
              );
              if (
                rdv.plusEnRetardJours === undefined ||
                days > rdv.plusEnRetardJours
              ) {
                rdv.plusEnRetardJours = days;
              }
            } else if (porte.rdvDate <= endOfToday) {
              rdv.aujourdhui += 1;
            } else {
              rdv.aVenir += 1;
            }
            break;
          }

          case 'CONTRAT_SIGNE':
            conclusions.contratsSignes += 1;
            conclusions.total += 1;
            break;

          case 'ARGUMENTE':
            conclusions.argumentes += 1;
            conclusions.total += 1;
            break;

          case 'REFUS':
            conclusions.refus += 1;
            conclusions.total += 1;
            break;
        }
      }

      habitatMap.set(effectif, habitat);
    }

    const habitat = [...habitatMap.entries()]
      .map(([typeHabitat, stock]) => ({
        typeHabitat,
        ...stock,
        couverture: stock.capaciteDeclaree
          ? this.roundRate((stock.prospectees / stock.capaciteDeclaree) * 100)
          : 0,
      }))
      .sort((a, b) => b.capaciteDeclaree - a.capaciteDeclaree);

    return {
      repassages: { ...repassages, buckets: bucketCounts },
      rdv,
      conclusions,
      nonVisitees,
      habitat,
      reprise: await this.repriseStats(immeubleWhere),
    };
  }

  /**
   * Devenir des portes déjà passées par `ABSENT` : combien ont été conclues.
   *
   * On part de l'historique pour identifier les portes ayant connu `ABSENT`, puis on
   * lit leur statut **actuel** sur `Porte`. Le taux répond à « le repassage
   * paye-t-il ? », pas à « combien de passages faut-il ? » — cette seconde question
   * exigerait que l'historique consigne aussi les passages sans changement de statut.
   */
  private async repriseStats(immeubleWhere: any): Promise<RepriseStats> {
    const absentHistory = await this.prisma.statusHistorique.findMany({
      where: { statut: 'ABSENT', porte: { immeuble: immeubleWhere } },
      select: { porteId: true },
      distinct: ['porteId'],
    });

    const porteIds = absentHistory.map((row) => row.porteId);
    if (porteIds.length === 0) {
      return {
        portesPasseesParAbsent: 0,
        portesConclues: 0,
        portesEncoreAbsentes: 0,
        tauxReprise: 0,
      };
    }

    const grouped = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: { id: { in: porteIds } },
      _count: { _all: true },
    });

    const byStatut = new Map(
      grouped.map((row) => [row.statut as string, row._count._all]),
    );
    const portesConclues =
      (byStatut.get('CONTRAT_SIGNE') ?? 0) +
      (byStatut.get('ARGUMENTE') ?? 0) +
      (byStatut.get('REFUS') ?? 0);
    const portesEncoreAbsentes = byStatut.get('ABSENT') ?? 0;

    return {
      portesPasseesParAbsent: porteIds.length,
      portesConclues,
      portesEncoreAbsentes,
      tauxReprise: this.roundRate((portesConclues / porteIds.length) * 100),
    };
  }
}
