import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  WinleadPlusUser,
  MappingSuggestion,
  MappingResult,
  ConfirmMappingInput,
  RemoveMappingInput,
  Offre,
  SyncOffresResult,
  BatchUpdateOffrePointsInput,
  BatchUpdateOffreBadgeProductKeyInput,
  BadgeDefinitionType,
  CreateBadgeDefinitionInput,
  UpdateBadgeDefinitionInput,
  SeedBadgesResult,
  CommercialBadgeType,
  AwardBadgeInput,
  BatchAwardBadgesInput,
  AwardBadgesResult,
  RankSnapshotType,
  ComputeRankingInput,
  ContratValideType,
  SyncContratsResult,
  OffreDistributionEntry,
  ContractRankingStatus,
} from './gamification.dto';
import { BadgeCategory, RankPeriod } from '@prisma/client';
import { MappingService } from './mapping.service';
import { OffreService } from './offre.service';
import { BadgeService } from './badge.service';
import { RankingService } from './ranking.service';
import { ContratService } from './contrat.service';
import { EvaluationService } from './evaluation.service';
import { WinleadPlusAuthService } from './winleadplus-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GamificationResolver {
  constructor(
    private readonly mappingService: MappingService,
    private readonly offreService: OffreService,
    private readonly badgeService: BadgeService,
    private readonly rankingService: RankingService,
    private readonly contratService: ContratService,
    private readonly evaluationService: EvaluationService,
    private readonly winleadPlusAuth: WinleadPlusAuthService,
  ) {}

  // ============================================================================
  // MAPPING — Users WinLead+ et suggestions
  // ============================================================================

  @Query(() => [WinleadPlusUser], { name: 'winleadPlusUsers' })
  @Roles('admin', 'directeur')
  async getWinleadPlusUsers(): Promise<WinleadPlusUser[]> {
    const token = await this.winleadPlusAuth.getServiceToken();
    return this.mappingService.getWinleadPlusUsers(token);
  }

  @Query(() => [MappingSuggestion], { name: 'mappingSuggestions' })
  @Roles('admin', 'directeur')
  async getMappingSuggestions(): Promise<MappingSuggestion[]> {
    const token = await this.winleadPlusAuth.getServiceToken();
    return this.mappingService.getMappingSuggestions(token);
  }

  @Mutation(() => MappingResult, { name: 'confirmMapping' })
  @Roles('admin', 'directeur')
  async confirmMapping(
    @Args('input') input: ConfirmMappingInput,
  ): Promise<MappingResult> {
    const result = await this.mappingService.confirmMappings(input.mappings);
    return {
      success: result.mapped > 0,
      message: `${result.mapped} mapping(s) enregistré(s), ${result.skipped} ignoré(s)`,
      mapped: result.mapped,
      skipped: result.skipped,
    };
  }

  @Mutation(() => MappingResult, { name: 'removeMapping' })
  @Roles('admin', 'directeur')
  async removeMapping(
    @Args('input') input: RemoveMappingInput,
  ): Promise<MappingResult> {
    const success = await this.mappingService.removeMapping(
      input.prowinId,
      input.type,
    );
    return {
      success,
      message: success
        ? 'Mapping supprimé avec succès'
        : 'Échec de la suppression du mapping',
      mapped: 0,
      skipped: success ? 0 : 1,
    };
  }

  // ============================================================================
  // OFFRES — Synchro, lecture, modification des points
  // ============================================================================

  @Query(() => [Offre], { name: 'offres' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getOffres(
    @Args('activeOnly', { type: () => Boolean, defaultValue: true })
    activeOnly: boolean,
  ): Promise<Offre[]> {
    const offres = await this.offreService.getOffres(activeOnly);
    return offres.map((o) => ({
      ...o,
      description: o.description ?? undefined,
      logoUrl: o.logoUrl ?? undefined,
      prixBase: o.prixBase ?? undefined,
      features: o.features ? JSON.stringify(o.features) : undefined,
      rating: o.rating ?? undefined,
      badgeProductKey: o.badgeProductKey ?? undefined,
    }));
  }

  @Mutation(() => SyncOffresResult, { name: 'syncOffres' })
  @Roles('admin', 'directeur')
  async syncOffres(): Promise<SyncOffresResult> {
    const token = await this.winleadPlusAuth.getServiceToken();
    const result = await this.offreService.syncOffres(token);
    return {
      success: true,
      message: `${result.created} offre(s) créée(s), ${result.updated} mise(s) à jour`,
      created: result.created,
      updated: result.updated,
      total: result.total,
    };
  }

  @Mutation(() => Offre, { name: 'updateOffrePoints' })
  @Roles('admin', 'directeur')
  async updateOffrePoints(
    @Args('offreId', { type: () => Int }) offreId: number,
    @Args('points', { type: () => Int }) points: number,
  ): Promise<Offre> {
    const offre = await this.offreService.updateOffrePoints(offreId, points);
    return {
      ...offre,
      description: offre.description ?? undefined,
      logoUrl: offre.logoUrl ?? undefined,
      prixBase: offre.prixBase ?? undefined,
      features: offre.features ? JSON.stringify(offre.features) : undefined,
      rating: offre.rating ?? undefined,
      badgeProductKey: offre.badgeProductKey ?? undefined,
    };
  }

  @Mutation(() => MappingResult, { name: 'batchUpdateOffrePoints' })
  @Roles('admin', 'directeur')
  async batchUpdateOffrePoints(
    @Args('input') input: BatchUpdateOffrePointsInput,
  ): Promise<MappingResult> {
    const result = await this.offreService.batchUpdateOffrePoints(input.offres);
    return {
      success: result.updated > 0,
      message: `${result.updated}/${result.total} offre(s) mise(s) à jour`,
      mapped: result.updated,
      skipped: result.total - result.updated,
    };
  }

  // ============================================================================
  // BADGES — Catalogue, CRUD, seed
  // ============================================================================

  @Query(() => [BadgeDefinitionType], { name: 'badgeDefinitions' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getBadgeDefinitions(
    @Args('category', { type: () => BadgeCategory, nullable: true })
    category?: BadgeCategory,
    @Args('activeOnly', { type: () => Boolean, defaultValue: true })
    activeOnly?: boolean,
  ): Promise<BadgeDefinitionType[]> {
    const badges = await this.badgeService.getBadgeDefinitions(
      category,
      activeOnly,
    );
    return badges.map((b) => this.toBadgeType(b));
  }

  @Query(() => BadgeDefinitionType, { name: 'badgeDefinition', nullable: true })
  @Roles('admin', 'directeur')
  async getBadgeDefinition(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<BadgeDefinitionType | null> {
    const b = await this.badgeService.getBadgeDefinition(id);
    if (!b) return null;
    return this.toBadgeType(b);
  }

  @Mutation(() => BadgeDefinitionType, { name: 'createBadgeDefinition' })
  @Roles('admin', 'directeur')
  async createBadgeDefinition(
    @Args('input') input: CreateBadgeDefinitionInput,
  ): Promise<BadgeDefinitionType> {
    const b = await this.badgeService.createBadgeDefinition(input);
    return this.toBadgeType(b);
  }

  @Mutation(() => BadgeDefinitionType, { name: 'updateBadgeDefinition' })
  @Roles('admin', 'directeur')
  async updateBadgeDefinition(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateBadgeDefinitionInput,
  ): Promise<BadgeDefinitionType> {
    const b = await this.badgeService.updateBadgeDefinition(id, input);
    return this.toBadgeType(b);
  }

  @Mutation(() => SeedBadgesResult, { name: 'seedBadges' })
  @Roles('admin', 'directeur')
  async seedBadges(): Promise<SeedBadgesResult> {
    const result = await this.badgeService.seedBadges();
    return {
      success: true,
      message: `${result.created} badge(s) créé(s), ${result.skipped} déjà existant(s)`,
      created: result.created,
      skipped: result.skipped,
      total: result.total,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /** Convertit un BadgeDefinition Prisma (null) → GraphQL (undefined) */
  private toBadgeType(b: any): BadgeDefinitionType {
    return {
      ...b,
      description: b.description ?? undefined,
      iconUrl: b.iconUrl ?? undefined,
      condition: b.condition ? JSON.stringify(b.condition) : undefined,
    };
  }

  /** Convertit un ContratValide Prisma (null + offre relation) → GraphQL (undefined + offre resolved fields) */
  private toContratType(c: any): ContratValideType {
    return {
      ...c,
      commercialId: c.commercialId ?? undefined,
      managerId: c.managerId ?? undefined,
      offreExternalId: c.offreExternalId ?? undefined,
      offreId: c.offreId ?? undefined,
      dateValidation: c.dateValidation ?? undefined,
      dateSignature: c.dateSignature ?? undefined,
      statutContrat: c.statutContrat ?? c.metadata?.statutContrat ?? undefined,
      metadata: c.metadata ? JSON.stringify(c.metadata) : undefined,
      offreNom: c.offre?.nom ?? undefined,
      offreCategorie: c.offre?.categorie ?? undefined,
      offreFournisseur: c.offre?.fournisseur ?? undefined,
      offreLogoUrl: c.offre?.logoUrl ?? undefined,
      offrePoints: c.offre?.points ?? undefined,
    };
  }

  // ============================================================================
  // BADGES COMMERCIAUX — Attribution, liste, révocation
  // ============================================================================

  @Query(() => [CommercialBadgeType], { name: 'commercialBadges' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getCommercialBadges(
    @Args('commercialId', { type: () => Int }) commercialId: number,
  ): Promise<CommercialBadgeType[]> {
    const badges = await this.badgeService.getCommercialBadges(commercialId);
    return badges.map((cb) => ({
      id: cb.id,
      commercialId: cb.commercialId ?? undefined,
      managerId: cb.managerId ?? undefined,
      badgeDefinitionId: cb.badgeDefinitionId,
      periodKey: cb.periodKey,
      awardedAt: cb.awardedAt,
      metadata: cb.metadata ? JSON.stringify(cb.metadata) : undefined,
      badgeDefinition: cb.badgeDefinition
        ? this.toBadgeType(cb.badgeDefinition)
        : undefined,
    }));
  }

  @Query(() => [CommercialBadgeType], { name: 'managerBadges' })
  @Roles('admin', 'directeur', 'manager')
  async getManagerBadges(
    @Args('managerId', { type: () => Int }) managerId: number,
  ): Promise<CommercialBadgeType[]> {
    const badges = await this.badgeService.getManagerBadges(managerId);
    return badges.map((cb) => ({
      id: cb.id,
      commercialId: cb.commercialId ?? undefined,
      managerId: cb.managerId ?? undefined,
      badgeDefinitionId: cb.badgeDefinitionId,
      periodKey: cb.periodKey,
      awardedAt: cb.awardedAt,
      metadata: cb.metadata ? JSON.stringify(cb.metadata) : undefined,
      badgeDefinition: cb.badgeDefinition
        ? this.toBadgeType(cb.badgeDefinition)
        : undefined,
    }));
  }

  @Mutation(() => AwardBadgesResult, { name: 'awardBadge' })
  @Roles('admin', 'directeur')
  async awardBadge(
    @Args('input') input: AwardBadgeInput,
  ): Promise<AwardBadgesResult> {
    const result = await this.badgeService.awardBadge(input);
    return {
      success: result.awarded,
      message: result.awarded
        ? `Badge attribué (id: ${result.id})`
        : 'Badge déjà attribué pour cette période',
      awarded: result.awarded ? 1 : 0,
      skipped: result.awarded ? 0 : 1,
      total: 1,
    };
  }

  @Mutation(() => AwardBadgesResult, { name: 'batchAwardBadges' })
  @Roles('admin', 'directeur')
  async batchAwardBadges(
    @Args('input') input: BatchAwardBadgesInput,
  ): Promise<AwardBadgesResult> {
    const result = await this.badgeService.batchAwardBadges(input.awards);
    return {
      success: result.awarded > 0,
      message: `${result.awarded} badge(s) attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.total,
    };
  }

  @Mutation(() => MappingResult, { name: 'revokeBadge' })
  @Roles('admin', 'directeur')
  async revokeBadge(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<MappingResult> {
    const success = await this.badgeService.revokeBadge(id);
    return {
      success,
      message: success ? 'Badge révoqué' : 'Échec de la révocation',
      mapped: 0,
      skipped: success ? 0 : 1,
    };
  }

  // ============================================================================
  // RANKING — Classement
  // ============================================================================

  @Query(() => [RankSnapshotType], { name: 'ranking' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getRanking(
    @Args('period', { type: () => RankPeriod }) period: RankPeriod,
    @Args('periodKey') periodKey: string,
    @Args('includeContratFinie', { type: () => Boolean, defaultValue: false })
    includeContratFinie: boolean,
    @Args('contractStatuses', {
      type: () => [ContractRankingStatus],
      nullable: true,
      defaultValue: [ContractRankingStatus.VALIDE],
    })
    contractStatuses: ContractRankingStatus[],
  ): Promise<RankSnapshotType[]> {
    const snapshots = await this.rankingService.getRanking(
      period,
      periodKey,
      includeContratFinie,
      contractStatuses,
      await this.winleadPlusAuth.getServiceToken(),
    );
    return snapshots.map((s) => {
      const tier = this.rankingService.resolvePointTier(s.points);
      return {
        id: s.id,
        commercialId: s.commercialId ?? undefined,
        managerId: s.managerId ?? undefined,
        period: s.period,
        periodKey: s.periodKey,
        rank: s.rank,
        points: s.points,
        contratsSignes: s.contratsSignes,
        rankTierKey: tier.key,
        rankTierLabel: tier.label,
        metadata: s.metadata ? JSON.stringify(s.metadata) : undefined,
        computedAt: s.computedAt,
        commercialNom: s.commercial?.nom,
        commercialPrenom: s.commercial?.prenom,
        managerNom: s.manager?.nom,
        managerPrenom: s.manager?.prenom,
      };
    });
  }

  @Query(() => [OffreDistributionEntry], { name: 'offreDistribution' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getOffreDistribution(
    @Args('periodMonth') periodMonth: string,
  ): Promise<OffreDistributionEntry[]> {
    return this.rankingService.getOffreDistribution(periodMonth);
  }

  @Query(() => [RankSnapshotType], { name: 'commercialRankings' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getCommercialRankings(
    @Args('commercialId', { type: () => Int }) commercialId: number,
  ): Promise<RankSnapshotType[]> {
    const snapshots =
      await this.rankingService.getCommercialRankings(commercialId);
    return snapshots.map((s) => {
      const tier = this.rankingService.resolvePointTier(s.points);
      return {
        id: s.id,
        commercialId: s.commercialId ?? undefined,
        period: s.period,
        periodKey: s.periodKey,
        rank: s.rank,
        points: s.points,
        contratsSignes: s.contratsSignes,
        rankTierKey: tier.key,
        rankTierLabel: tier.label,
        metadata: s.metadata ? JSON.stringify(s.metadata) : undefined,
        computedAt: s.computedAt,
      };
    });
  }

  @Query(() => [RankSnapshotType], { name: 'teamRanking' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getTeamRanking(
    @Args('period', { type: () => RankPeriod }) period: RankPeriod,
    @Args('periodKey') periodKey: string,
    @CurrentUser() user: any,
  ): Promise<RankSnapshotType[]> {
    const managerId = await this.rankingService.resolveTeamManagerId(
      user.id,
      user.role,
    );
    if (managerId == null) return [];

    const snapshots = await this.rankingService.getTeamRanking(
      managerId,
      period,
      periodKey,
    );
    return snapshots.map((s) => {
      const tier = this.rankingService.resolvePointTier(s.points);
      return {
        id: s.id,
        commercialId: s.commercialId ?? undefined,
        period: s.period,
        periodKey: s.periodKey,
        rank: s.rank,
        points: s.points,
        contratsSignes: s.contratsSignes,
        rankTierKey: tier.key,
        rankTierLabel: tier.label,
        metadata: s.metadata ? JSON.stringify(s.metadata) : undefined,
        computedAt: s.computedAt,
        commercialNom: s.commercial?.nom,
        commercialPrenom: s.commercial?.prenom,
      };
    });
  }

  @Mutation(() => MappingResult, { name: 'computeRanking' })
  @Roles('admin', 'directeur')
  async computeRanking(
    @Args('input') input: ComputeRankingInput,
  ): Promise<MappingResult> {
    const result = await this.rankingService.computeRanking(
      input.period,
      input.periodKey,
    );
    return {
      success: true,
      message: `Classement ${input.period}/${input.periodKey}: ${result.computed} participants classés`,
      mapped: result.computed,
      skipped: 0,
    };
  }

  // ============================================================================
  // OFFRES — Badge Product Key mapping
  // ============================================================================

  @Mutation(() => Offre, { name: 'updateOffreBadgeProductKey' })
  @Roles('admin', 'directeur')
  async updateOffreBadgeProductKey(
    @Args('offreId', { type: () => Int }) offreId: number,
    @Args('badgeProductKey', { nullable: true }) badgeProductKey?: string,
  ): Promise<Offre> {
    const offre = await this.offreService.updateOffreBadgeProductKey(
      offreId,
      badgeProductKey ?? null,
    );
    return {
      ...offre,
      description: offre.description ?? undefined,
      logoUrl: offre.logoUrl ?? undefined,
      prixBase: offre.prixBase ?? undefined,
      features: offre.features ? JSON.stringify(offre.features) : undefined,
      rating: offre.rating ?? undefined,
      badgeProductKey: offre.badgeProductKey ?? undefined,
    };
  }

  @Mutation(() => MappingResult, { name: 'batchUpdateOffreBadgeProductKey' })
  @Roles('admin', 'directeur')
  async batchUpdateOffreBadgeProductKey(
    @Args('input') input: BatchUpdateOffreBadgeProductKeyInput,
  ): Promise<MappingResult> {
    const result = await this.offreService.batchUpdateOffreBadgeProductKey(
      input.offres,
    );
    return {
      success: result.updated > 0,
      message: `${result.updated}/${result.total} offre(s) mise(s) à jour`,
      mapped: result.updated,
      skipped: result.total - result.updated,
    };
  }

  // ============================================================================
  // CONTRATS VALIDÉS — Synchro et lecture
  // ============================================================================

  @Mutation(() => SyncContratsResult, { name: 'syncContrats' })
  @Roles('admin', 'directeur')
  async syncContrats(): Promise<SyncContratsResult> {
    const token = await this.winleadPlusAuth.getServiceToken();
    const result = await this.contratService.syncContrats(token);
    return {
      success: true,
      message: `${result.created} contrat(s) créé(s), ${result.updated} mis à jour, ${result.skipped} ignoré(s)`,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      total: result.total,
    };
  }

  @Query(() => [ContratValideType], { name: 'contratsByCommercial' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async getContratsByCommercial(
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @Args('contractStatuses', {
      type: () => [ContractRankingStatus],
      nullable: true,
      defaultValue: [ContractRankingStatus.VALIDE],
    })
    contractStatuses: ContractRankingStatus[],
  ): Promise<ContratValideType[]> {
    const contrats = await this.contratService.getContratsByCommercial(
      commercialId,
      contractStatuses,
      await this.winleadPlusAuth.getServiceToken(),
    );
    return contrats.map((c) => this.toContratType(c));
  }

  @Query(() => [ContratValideType], { name: 'contratsByManager' })
  @Roles('admin', 'directeur', 'manager')
  async getContratsByManager(
    @Args('managerId', { type: () => Int }) managerId: number,
    @Args('contractStatuses', {
      type: () => [ContractRankingStatus],
      nullable: true,
      defaultValue: [ContractRankingStatus.VALIDE],
    })
    contractStatuses: ContractRankingStatus[],
  ): Promise<ContratValideType[]> {
    const contrats = await this.contratService.getContratsByManager(
      managerId,
      contractStatuses,
      await this.winleadPlusAuth.getServiceToken(),
    );
    return contrats.map((c) => this.toContratType(c));
  }

  // ============================================================================
  // ÉVALUATION — Attribution automatique des badges
  // ============================================================================

  @Mutation(() => AwardBadgesResult, { name: 'evaluateBadges' })
  @Roles('admin', 'directeur')
  async evaluateBadges(): Promise<AwardBadgesResult> {
    const result = await this.evaluationService.evaluateAll();
    return {
      success: true,
      message: `${result.evaluated} commercial(aux) évalué(s): ${result.awarded} badge(s) attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.evaluated,
    };
  }

  @Mutation(() => AwardBadgesResult, { name: 'evaluateTrophees' })
  @Roles('admin', 'directeur')
  async evaluateTrophees(
    @Args('quarter') quarter: string,
  ): Promise<AwardBadgesResult> {
    const result = await this.evaluationService.evaluateTrophees(quarter);
    return {
      success: true,
      message: `Trophées ${quarter}: ${result.awarded} attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.awarded + result.skipped,
    };
  }

  @Mutation(() => AwardBadgesResult, { name: 'evaluatePerformanceRanking' })
  @Roles('admin', 'directeur')
  async evaluatePerformanceRanking(
    @Args('month') month: string,
  ): Promise<AwardBadgesResult> {
    const result =
      await this.evaluationService.evaluatePerformanceRanking(month);
    return {
      success: true,
      message: `Performance ranking ${month}: ${result.awarded} badge(s) attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.awarded + result.skipped,
    };
  }

  @Mutation(() => AwardBadgesResult, { name: 'evaluateConversionRanking' })
  @Roles('admin', 'directeur')
  async evaluateConversionRanking(
    @Args('weekKey') weekKey: string,
  ): Promise<AwardBadgesResult> {
    const result =
      await this.evaluationService.evaluateConversionRanking(weekKey);
    return {
      success: true,
      message: `Conversion ranking ${weekKey}: ${result.awarded} badge(s) attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.awarded + result.skipped,
    };
  }

  @Mutation(() => AwardBadgesResult, { name: 'evaluateTransformationRanking' })
  @Roles('admin', 'directeur')
  async evaluateTransformationRanking(
    @Args('month') month: string,
  ): Promise<AwardBadgesResult> {
    const result =
      await this.evaluationService.evaluateTransformationRanking(month);
    return {
      success: true,
      message: `Transformation ranking ${month}: ${result.awarded} badge(s) attribué(s), ${result.skipped} déjà existant(s)`,
      awarded: result.awarded,
      skipped: result.skipped,
      total: result.awarded + result.skipped,
    };
  }
}
