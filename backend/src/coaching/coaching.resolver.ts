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
  ProductSheetVersionDetailDto,
  ReferenceVersionDto,
  SalesPlanVersionDetailDto,
} from './coaching.dto';
import { SalesPlanVersion, ProductSheetVersion } from '@prisma/client';

type AuthenticatedUser = { id: number; role: string; email?: string | null };

/** Auteur d'un import : l'e-mail Keycloak, sinon le rôle et l'id du compte. */
const importAuthor = (user: AuthenticatedUser): string =>
  user.email?.trim() || `${user.role}#${user.id}`;

const SHORT_HASH = 12;

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

  /** Fiches produit actives — onglet Produits. Même accès que le reste du coaching. */
  @Query(() => [ProductSheetDto])
  @Roles('admin', 'directeur')
  async coachingProductSheets(): Promise<ProductSheetDto[]> {
    const rows = await this.productSheets.listActiveSheets();
    return rows.map((row) => this.toSheetDto(row));
  }

  @Query(() => ActiveSalesPlanDto, { nullable: true })
  @Roles('admin', 'directeur')
  async activeSalesPlan(
    @Args('slug', { nullable: true }) slug?: string,
  ): Promise<ActiveSalesPlanDto | null> {
    const version = await this.salesPlans.getActiveVersion(slug);
    return version ? this.toPlanDto(version) : null;
  }

  @Query(() => [ReferenceVersionDto])
  @Roles('admin', 'directeur')
  async salesPlanVersions(
    @Args('slug') slug: string,
  ): Promise<ReferenceVersionDto[]> {
    return (await this.salesPlans.listVersions(slug)).map(versionMeta);
  }

  @Query(() => [ReferenceVersionDto])
  @Roles('admin', 'directeur')
  async productSheetVersions(
    @Args('slug') slug: string,
  ): Promise<ReferenceVersionDto[]> {
    return (await this.productSheets.listVersions(slug)).map(versionMeta);
  }

  @Query(() => SalesPlanVersionDetailDto)
  @Roles('admin', 'directeur')
  async salesPlanVersion(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<SalesPlanVersionDetailDto> {
    const row = await this.salesPlans.getVersion(id);
    return {
      ...this.toPlanDto(row),
      ...versionMeta(row),
      rawMarkdown: row.rawMarkdown,
    };
  }

  @Query(() => ProductSheetVersionDetailDto)
  @Roles('admin', 'directeur')
  async productSheetVersion(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<ProductSheetVersionDetailDto> {
    const row = await this.productSheets.getVersion(id);
    return { ...this.toSheetDto(row), ...versionMeta(row) };
  }

  /** Publie une nouvelle version du plan : les prochaines analyses seront notées avec. */
  @Mutation(() => ActiveSalesPlanDto)
  @Roles('admin')
  async importSalesPlan(
    @Args('markdown') markdown: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveSalesPlanDto> {
    return this.toPlanDto(
      await this.salesPlans.importPlan(markdown, importAuthor(user)),
    );
  }

  @Mutation(() => ActiveSalesPlanDto)
  @Roles('admin')
  async activateSalesPlanVersion(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<ActiveSalesPlanDto> {
    return this.toPlanDto(await this.salesPlans.activateVersion(id));
  }

  @Mutation(() => ProductSheetDto)
  @Roles('admin')
  async importProductSheet(
    @Args('markdown') markdown: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductSheetDto> {
    return this.toSheetDto(
      await this.productSheets.importSheet(markdown, importAuthor(user)),
    );
  }

  @Mutation(() => ProductSheetDto)
  @Roles('admin')
  async activateProductSheetVersion(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<ProductSheetDto> {
    return this.toSheetDto(await this.productSheets.activateVersion(id));
  }

  /** Retire une fiche : la conformité de ce produit n'est plus jugée. */
  @Mutation(() => Boolean)
  @Roles('admin')
  deactivateProductSheet(@Args('slug') slug: string): Promise<boolean> {
    return this.productSheets.deactivateSheet(slug);
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
    @Args('retranscribe', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
    })
    retranscribe = false,
  ): Promise<CoachingAnalysisDto> {
    return this.coaching.relaunch(id, requestBearer(context), retranscribe);
  }

  private toPlanDto(version: SalesPlanVersion): ActiveSalesPlanDto {
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

  private toSheetDto(row: ProductSheetVersion): ProductSheetDto {
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
  }
}

type VersionRow = Pick<
  SalesPlanVersion,
  'id' | 'version' | 'createdAt' | 'importedBy' | 'isActive' | 'contentHash'
>;

/** Métadonnées d'une version, hash raccourci : de quoi la reconnaître. */
function versionMeta(row: VersionRow) {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    importedBy: row.importedBy,
    isActive: row.isActive,
    contentHash: row.contentHash.slice(0, SHORT_HASH),
  };
}
