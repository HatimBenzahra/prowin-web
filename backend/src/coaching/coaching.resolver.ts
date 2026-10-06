import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { requestBearer } from '../auth/request-bearer';
import type { BearerRequestContext } from '../auth/request-bearer';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CoachingService } from './coaching.service';
import { CoachingConfigService } from './coaching-config.service';
import { CoachingQueryService } from './lecture/coaching-query.service';
import { SalesPlanService } from './referentiels/sales-plan.service';
import { ProductSheetService } from './referentiels/product-sheet.service';
import {
  ActiveSalesPlanDto,
  CoachingAnalysesFilter,
  CoachingAnalysisDto,
  PaginatedCoachingAnalyses,
  CoachingConfigDto,
  CoachingStatsDto,
  CoachingQueueItemDto,
  CoachingManagementFilter,
  CoachingScoreboardDto,
  PaginatedCoachingManagement,
  CoachableSubjectDto,
  ProductSheetDto,
} from './coaching.dto';

@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachingResolver {
  constructor(
    private readonly coaching: CoachingService,
    private readonly config: CoachingConfigService,
    private readonly query: CoachingQueryService,
    private readonly salesPlans: SalesPlanService,
    private readonly productSheets: ProductSheetService,
  ) {}

  @Query(() => CoachingAnalysisDto)
  @Roles('admin', 'directeur')
  coachingAnalysis(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<CoachingAnalysisDto> {
    return this.query.getAnalysis(id);
  }

  @Query(() => PaginatedCoachingAnalyses)
  @Roles('admin', 'directeur')
  coachingAnalyses(
    @Args('filter', { nullable: true }) filter?: CoachingAnalysesFilter,
  ): Promise<PaginatedCoachingAnalyses> {
    return this.query.listAnalyses(filter ?? {});
  }

  @Query(() => [CoachingAnalysisDto])
  @Roles('admin', 'directeur')
  coachingByS3Keys(
    @Args({ name: 's3Keys', type: () => [String] }) s3Keys: string[],
  ): Promise<CoachingAnalysisDto[]> {
    return this.query.byS3Keys(s3Keys);
  }

  @Query(() => [CoachingQueueItemDto])
  @Roles('admin', 'directeur')
  coachingQueue(): Promise<CoachingQueueItemDto[]> {
    return this.query.coachingQueue();
  }

  @Query(() => Boolean)
  @Roles('admin', 'directeur')
  coachingFavori(
    @Args('porteId', { type: () => Int }) porteId: number,
  ): Promise<boolean> {
    return this.coaching.getCoachingFavori(porteId);
  }

  @Query(() => PaginatedCoachingManagement)
  @Roles('admin', 'directeur')
  coachingManagementList(
    @Args('filter', { nullable: true }) filter?: CoachingManagementFilter,
  ): Promise<PaginatedCoachingManagement> {
    return this.query.coachingManagementList(filter ?? {});
  }

  @Query(() => [CoachableSubjectDto])
  @Roles('admin', 'directeur')
  coachableSubjects(): Promise<CoachableSubjectDto[]> {
    return this.query.coachableSubjects();
  }

  /**
   * Fiches produit actives — alimente l'onglet Produits en lecture seule.
   * Même périmètre d'accès que le reste du coaching : admin + directeur.
   */
  @Query(() => [ProductSheetDto])
  @Roles('admin', 'directeur')
  async coachingProductSheets(): Promise<ProductSheetDto[]> {
    const rows = await this.productSheets.listActiveSheets();
    return rows.map((row) => {
      const sheet = this.productSheets.toParsedSheet(row);
      return {
        id: row.id,
        slug: sheet.slug,
        label: sheet.label,
        productKey: sheet.productKey,
        version: row.version,
        facts: sheet.facts,
        forbidden: sheet.forbidden.map((f) => ({
          say: f.say,
          severity: f.severity,
        })),
        rawMarkdown: row.rawMarkdown,
      };
    });
  }

  @Query(() => ActiveSalesPlanDto, { nullable: true })
  @Roles('admin', 'directeur')
  async activeSalesPlan(
    @Args('slug', { nullable: true }) slug?: string,
  ): Promise<ActiveSalesPlanDto | null> {
    const version = await this.salesPlans.getActiveVersion(slug);
    if (!version) return null;
    const plan = this.salesPlans.toParsedPlan(version);
    return {
      slug: version.slug,
      title: version.title,
      version: version.version,
      scoringScale: plan.scoringScale,
      steps: (plan.steps ?? []).map((s) => ({
        key: s.key,
        label: s.label,
        weight: s.weight,
        appliesWhen: s.appliesWhen,
        criteria: (s.criteria ?? []).map((c) => ({
          key: c.key,
          label: c.label,
          points: c.points,
          evidenceRequired: c.evidenceRequired === true,
          appliesWhen: c.appliesWhen ?? s.appliesWhen,
        })),
      })),
    };
  }

  @Query(() => CoachingConfigDto)
  @Roles('admin', 'directeur')
  coachingConfig(): Promise<CoachingConfigDto> {
    return this.config.getConfig();
  }

  @Query(() => CoachingStatsDto)
  @Roles('admin', 'directeur')
  coachingStats(): Promise<CoachingStatsDto> {
    return this.query.getStats();
  }

  /** Comparatif de scoring coaching entre intervenants, sur une période. */
  @Query(() => CoachingScoreboardDto)
  @Roles('admin', 'directeur')
  coachingScoreboard(
    @Args('startDate', { type: () => Date, nullable: true }) startDate?: Date,
    @Args('endDate', { type: () => Date, nullable: true }) endDate?: Date,
  ): Promise<CoachingScoreboardDto> {
    return this.query.coachingScoreboard(startDate, endDate);
  }

  @Mutation(() => CoachingConfigDto)
  @Roles('admin', 'directeur')
  async setCoachableStatuts(
    @Args({ name: 'statuts', type: () => [String] }) statuts: string[],
  ): Promise<CoachingConfigDto> {
    await this.config.setCoachableStatuts(statuts);
    return this.config.getConfig();
  }

  @Mutation(() => CoachingConfigDto)
  @Roles('admin', 'directeur')
  async setMinAutoDurationSec(
    @Args({ name: 'seconds', type: () => Int }) seconds: number,
  ): Promise<CoachingConfigDto> {
    await this.config.setMinAutoDurationSec(seconds);
    return this.config.getConfig();
  }

  @Mutation(() => CoachingAnalysisDto)
  @Roles('admin', 'directeur')
  launchCoachingAnalysis(
    @Args('s3Key') s3Key: string,
    @Context() context: BearerRequestContext,
  ): Promise<CoachingAnalysisDto> {
    return this.coaching.launch(s3Key, requestBearer(context));
  }

  @Mutation(() => Int)
  @Roles('admin', 'directeur')
  launchCoachingAnalyses(
    @Args({ name: 's3Keys', type: () => [String] }) s3Keys: string[],
    @Context() context: BearerRequestContext,
  ): Promise<number> {
    return this.coaching.launchMany(s3Keys, requestBearer(context));
  }

  @Mutation(() => Boolean)
  @Roles('admin', 'directeur')
  setCoachingFavori(
    @Args('porteId', { type: () => Int }) porteId: number,
    @Args('favori') favori: boolean,
  ): Promise<boolean> {
    return this.coaching.setCoachingFavori(porteId, favori);
  }

  @Mutation(() => CoachingAnalysisDto)
  @Roles('admin', 'directeur')
  relaunchCoachingAnalysis(
    @Args('id', { type: () => Int }) id: number,
    @Context() context: BearerRequestContext,
    @Args('retranscribe', { type: () => Boolean, nullable: true, defaultValue: false }) retranscribe = false,
  ): Promise<CoachingAnalysisDto> {
    return this.coaching.relaunch(id, requestBearer(context), retranscribe);
  }
}
