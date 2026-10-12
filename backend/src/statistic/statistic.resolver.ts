import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { StatisticService } from './statistic.service';
import { StatisticSyncService } from './statistic-sync.service';
import {
  Statistic,
  ContratsValidesAggregate,
  CreateStatisticInput,
  ProspectionPipeline,
  StatsEffort,
  StatsPeriodComparison,
  UpdateStatisticInput,
  ZoneStatistic,
  TimelinePoint,
  TeamLastStatusActivity,
  OwnerActivityStatistic,
} from './statistic.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Statistic)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatisticResolver {
  constructor(
    private readonly statisticService: StatisticService,
    private readonly statisticSyncService: StatisticSyncService,
  ) {}

  @Mutation(() => Statistic)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createStatistic(
    @Args('createStatisticInput') createStatisticInput: CreateStatisticInput,
  ) {
    return this.statisticService.create(createStatisticInput);
  }

  @Query(() => [Statistic], { name: 'statistics' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findAll(
    @Args('commercialId', { type: () => Int, nullable: true }) commercialId: number | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.findAll(commercialId, user.id, user.role);
  }

  @Query(() => Statistic, { name: 'statistic' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findOne(@Args('id', { type: () => Int }) id: number, @CurrentUser() user: any) {
    return this.statisticService.findOne(id, user.id, user.role);
  }

  @Mutation(() => Statistic)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  updateStatistic(
    @Args('updateStatisticInput') updateStatisticInput: UpdateStatisticInput,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.update(updateStatisticInput, user.id, user.role);
  }

  @Mutation(() => Statistic)
  @Roles('admin', 'directeur')
  removeStatistic(@Args('id', { type: () => Int }) id: number, @CurrentUser() user: any) {
    return this.statisticService.remove(id, user.id, user.role);
  }

  @Query(() => [ZoneStatistic], { name: 'zoneStatistics' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getZoneStatistics(@CurrentUser() user: any) {
    return this.statisticService.getZoneStatistics(user.id, user.role);
  }

  @Query(() => [TeamLastStatusActivity], { name: 'teamLastStatusActivities' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  teamLastStatusActivities(@CurrentUser() user: any) {
    return this.statisticService.getTeamLastStatusActivities(user.id, user.role);
  }

  @Mutation(() => String, { name: 'recalculateAllStats' })
  @Roles('admin', 'directeur')
  async recalculateAllStats() {
    const result = await this.statisticSyncService.recalculateAllStats();
    return `Recalcul terminé: ${result.updated} mis à jour, ${result.errors} erreurs`;
  }

  @Query(() => String, { name: 'validateStatsCoherence' })
  @Roles('admin', 'directeur', 'manager')
  async validateStatsCoherence() {
    const result = await this.statisticSyncService.validateStatsCoherence();
    if (result.invalid.length === 0) {
      return `✅ Toutes les ${result.valid} statistiques sont cohérentes`;
    } else {
      return `⚠️ ${result.valid} cohérentes, ${result.invalid.length} incohérentes: ${JSON.stringify(result.invalid)}`;
    }
  }

  @Mutation(() => String, { name: 'syncCommercialStats' })
  @Roles('admin', 'directeur', 'manager')
  async syncCommercialStats(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: any,
  ) {
    await this.statisticService.ensureCanSyncCommercialStats(
      immeubleId,
      user.id,
      user.role,
    );
    await this.statisticSyncService.syncCommercialStats(immeubleId);
    return `✅ Statistiques synchronisées pour l'immeuble ${immeubleId}`;
  }

  @Query(() => [TimelinePoint], { name: 'statsTimelineByCommercial' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  statsTimelineByCommercial(
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.statsTimelineByCommercial(
      commercialId,
      user.id,
      user.role,
      startDate,
      endDate,
    );
  }

  @Query(() => [TimelinePoint], { name: 'statsTimeline' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  statsTimeline(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.statsTimeline(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
      startDate,
      endDate,
    );
  }

  @Query(() => [OwnerActivityStatistic], { name: 'statsActivityByOwner' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  statsActivityByOwner(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.statsActivityByOwner(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
      startDate,
      endDate,
    );
  }

  @Query(() => StatsPeriodComparison, { name: 'statsPeriodComparison' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  statsPeriodComparison(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.statsPeriodComparison(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
      startDate,
      endDate,
    );
  }

  @Query(() => StatsEffort, { name: 'statsEffort' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  statsEffort(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.statsEffort(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
      startDate,
      endDate,
    );
  }

  @Query(() => ContratsValidesAggregate, { name: 'contratsValidesAggregate' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  contratsValidesAggregate(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @Args('startDate', { type: () => Date, nullable: true }) startDate: Date | undefined,
    @Args('endDate', { type: () => Date, nullable: true }) endDate: Date | undefined,
    @Args('granularity', { type: () => String, nullable: true }) granularity: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.contratsValidesAggregate(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
      startDate,
      endDate,
      granularity,
    );
  }

  /** Stock de travail en cours — sans filtre de période, un stock se lit au présent. */
  @Query(() => ProspectionPipeline, { name: 'prospectionPipeline' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  prospectionPipeline(
    @Args('scopeType', { type: () => String, nullable: true }) scopeType: string | undefined,
    @Args('ownerType', { type: () => String, nullable: true }) ownerType: string | undefined,
    @Args('ownerId', { type: () => Int, nullable: true }) ownerId: number | undefined,
    @CurrentUser() user: any,
  ) {
    return this.statisticService.prospectionPipeline(
      user.id,
      user.role,
      scopeType,
      ownerType,
      ownerId,
    );
  }

  @Mutation(() => String, { name: 'syncManagerStats' })
  @Roles('admin', 'directeur', 'manager')
  async syncManagerStats(
    @Args('managerId', { type: () => Int }) managerId: number,
    @CurrentUser() user: any,
  ) {
    await this.statisticService.ensureCanSyncManagerStats(
      managerId,
      user.id,
      user.role,
    );
    await this.statisticSyncService.syncManagerStats(managerId);
    return `✅ Statistiques synchronisées pour le manager ${managerId}`;
  }
}
