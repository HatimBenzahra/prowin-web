import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { requestBearer } from '../auth/request-bearer';
import type { BearerRequestContext } from '../auth/request-bearer';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CoachingService } from './coaching.service';
import { CoachingConfigService } from './coaching-config.service';
import { CoachingQueryService } from './lecture/coaching-query.service';
import {
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
  CoachingProductStatsDto,
  CoachingProductStatusInput,
  CoachingJournalFilter,
  CoachingJournalPageDto,
} from './coaching.dto';
@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachingResolver {
  constructor(
    private readonly coaching: CoachingService,
    private readonly config: CoachingConfigService,
    private readonly query: CoachingQueryService,
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

  /** Journal des écoutes, paginé par jours entiers (curseur `before`). */
  @Query(() => CoachingJournalPageDto)
  @Roles('admin', 'directeur')
  coachingJournal(
    @Args('filter', { nullable: true }) filter?: CoachingJournalFilter,
  ): Promise<CoachingJournalPageDto> {
    return this.query.coachingJournal(filter ?? {});
  }

  @Query(() => [CoachableSubjectDto])
  @Roles('admin', 'directeur')
  coachableSubjects(): Promise<CoachableSubjectDto[]> {
    return this.query.coachableSubjects();
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

  /** Statistiques produit (proposition, transformation, oublis, causes de perte). */
  @Query(() => CoachingProductStatsDto)
  @Roles('admin', 'directeur')
  coachingProductStats(
    @Args('startDate', { type: () => Date, nullable: true }) startDate?: Date,
    @Args('endDate', { type: () => Date, nullable: true }) endDate?: Date,
  ): Promise<CoachingProductStatsDto> {
    return this.query.coachingProductStats(startDate, endDate);
  }

  /** Correction du résultat de visite pré-rempli par l'IA (périmètre vérifié par le service). */
  @Mutation(() => CoachingAnalysisDto)
  @Roles('admin', 'directeur', 'manager')
  updateCoachingVisitOutcome(
    @Args('analysisId', { type: () => Int }) analysisId: number,
    @CurrentUser() user: { id: number; role: string; email?: string | null },
    @Args('visitResult', { type: () => String, nullable: true })
    visitResult?: string | null,
    @Args('nonSaleReason', { type: () => String, nullable: true })
    nonSaleReason?: string | null,
    @Args('nextAction', { type: () => String, nullable: true })
    nextAction?: string | null,
    @Args('ribStatus', { type: () => String, nullable: true })
    ribStatus?: string | null,
    @Args('signatureStatus', { type: () => String, nullable: true })
    signatureStatus?: string | null,
    @Args('productStatuses', {
      type: () => [CoachingProductStatusInput],
      nullable: true,
    })
    productStatuses?: CoachingProductStatusInput[] | null,
  ): Promise<CoachingAnalysisDto> {
    return this.coaching.updateVisitOutcome(
      analysisId,
      {
        visitResult,
        nonSaleReason,
        nextAction,
        ribStatus,
        signatureStatus,
        productStatuses,
      },
      user,
    );
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

  /** Archive (« non intéressant ») ou désarchive un audio du journal des écoutes. */
  @Mutation(() => Boolean)
  @Roles('admin', 'directeur')
  setCoachingArchive(
    @Args('s3Key') s3Key: string,
    @Args('archived') archived: boolean,
    @CurrentUser() user: { id: number; role: string; email?: string | null },
  ): Promise<boolean> {
    return this.coaching.setCoachingArchive(s3Key, archived, user);
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
    @Args('retranscribe', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
    })
    retranscribe = false,
  ): Promise<CoachingAnalysisDto> {
    return this.coaching.relaunch(id, requestBearer(context), retranscribe);
  }
}
