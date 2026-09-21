import {
  Field,
  Float,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType()
export class CoachingSubScoreDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) weight: number;
  @Field() applicable: boolean;
  @Field(() => Float, { nullable: true }) score?: number | null;
}

@ObjectType()
export class CoachingCriterionResultDto {
  @Field() stepKey: string;
  @Field() criterionKey: string;
  @Field() title: string;
  @Field() status: string;
  @Field(() => Int) maxPoints: number;
  @Field(() => Float) score: number;
  @Field(() => Int) weightStep: number;
  @Field(() => [String]) evidence: string[];
  @Field(() => String, { nullable: true }) comment?: string;
}

/**
 * Écart de conformité produit : ce que le commercial a dit du produit, face à ce
 * que sa fiche décrit. Le front affiche les deux côte à côte.
 */
@ObjectType()
export class CoachingViolationDto {
  @Field() productSlug: string;
  @Field(() => String, { nullable: true }) productLabel?: string | null;
  @Field() severity: string; // 'grave' | 'modere'
  @Field() quote: string; // ce que le commercial a dit
  @Field() sheetSays: string; // la ligne de la fiche que ça contredit
  @Field() planSays: string; // la ligne du plan de vente que ça contredit aussi
  @Field(() => String, { nullable: true }) why?: string | null;
}

/** Ce que la passe 0 a retenu, offres seulement évoquées comprises, pour le diagnostic. */
@ObjectType()
export class CoachingMappedProductDto {
  @Field() key: string;
  @Field() presentedByCommercial: boolean;
  @Field() evidence: string;
}

@ObjectType()
export class CoachingAnalysisDto {
  @Field(() => Int) id: number;
  @Field(() => Int, { nullable: true }) recordingId?: number | null;
  @Field(() => Int, { nullable: true }) porteId?: number | null;
  @Field(() => Int, { nullable: true }) userId?: number | null;
  @Field(() => Int, { nullable: true }) managerId?: number | null;
  @Field() s3KeyOriginal: string;
  @Field(() => String, { nullable: true }) statutPorte?: string | null;
  @Field() status: string;
  @Field(() => String, { nullable: true }) quality?: string | null;
  @Field(() => Float, { nullable: true }) score?: number | null; // score FINAL (après malus)
  @Field(() => Float, { nullable: true }) scoreBeforeMalus?: number | null;
  @Field(() => Float, { nullable: true }) malus?: number | null; // points retirés (positif)
  @Field(() => [CoachingViolationDto]) violations: CoachingViolationDto[];
  @Field(() => [String]) detectedProducts: string[]; // offres PRÉSENTÉES par le commercial
  @Field(() => [CoachingMappedProductDto]) productMapping: CoachingMappedProductDto[];
  @Field(() => Float, { nullable: true }) confidence?: number | null;
  @Field(() => String, { nullable: true }) summary?: string | null;
  @Field(() => [String]) strengths: string[];
  @Field(() => [String]) improvements: string[];
  @Field(() => [String]) recommendations: string[];
  @Field(() => [CoachingSubScoreDto]) subScores: CoachingSubScoreDto[];
  @Field(() => [CoachingCriterionResultDto])
  criterionResults: CoachingCriterionResultDto[];
  @Field(() => String, { nullable: true }) transcript?: string | null;
  @Field(() => Float, { nullable: true }) transcriptDurationSec?: number | null;
  @Field(() => String, { nullable: true }) error?: string | null;
  @Field() planSlug: string;
  @Field(() => Int) planVersion: number;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  // Sujet de l'analyse (commercial ou manager qui a enregistré).
  @Field(() => String, { nullable: true }) subjectName?: string | null;
  @Field(() => String, { nullable: true }) subjectRole?: string | null; // 'commercial' | 'manager'
  @Field(() => Int, { nullable: true }) subjectId?: number | null;
  @Field() favori: boolean; // porte marquée favorite
}

@ObjectType()
export class PaginatedCoachingAnalyses {
  @Field(() => [CoachingAnalysisDto]) items: CoachingAnalysisDto[];
  @Field(() => Int) total: number;
}

/** Un audio en attente ou en cours de traitement (pile interrogeable). */
@ObjectType()
export class CoachingQueueItemDto {
  @Field(() => Int) id: number;
  @Field() status: string;
  @Field() s3KeyOriginal: string;
  @Field(() => String, { nullable: true }) subjectName?: string | null;
  @Field(() => String, { nullable: true }) subjectRole?: string | null;
  @Field(() => Int, { nullable: true }) subjectId?: number | null;
  @Field(() => String, { nullable: true }) statutPorte?: string | null;
  @Field(() => Float, { nullable: true }) durationSec?: number | null;
  @Field() createdAt: string;
}

@ObjectType()
export class CoachingStatsDto {
  @Field(() => Int) pending: number; // en file
  @Field(() => Int) processing: number; // transcription + analyse en cours
  @Field(() => Int) ready: number; // analysés
  @Field(() => Int) failed: number; // échecs
  @Field(() => Int) inexploitable: number;
  @Field(() => Int) total: number;
  @Field(() => Float, { nullable: true }) avgScore?: number | null;
}

/** Score moyen d'une étape du plan de vente, pour un sujet. */
@ObjectType()
export class CoachingStepAverageDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) weight: number;
  /** Moyenne des scores d'étape (0-100) sur les analyses où elle est applicable. */
  @Field(() => Float, { nullable: true }) score?: number | null;
  /** Nombre d'analyses où l'étape était applicable — fiabilité de la moyenne. */
  @Field(() => Int) nbAnalyses: number;
}

/**
 * Une ligne du comparatif de scoring coaching : un commercial ou un manager,
 * son score moyen sur la période, son évolution, et son profil par étape.
 */
@ObjectType()
export class CoachingScoreboardRowDto {
  @Field(() => Int) subjectId: number;
  @Field() subjectName: string;
  @Field() subjectRole: string; // 'commercial' | 'manager'

  /** Analyses exploitables (score non nul) retenues sur la période. */
  @Field(() => Int) nbAnalyses: number;
  @Field(() => Float, { nullable: true }) scoreMoyen?: number | null;
  @Field(() => Float, { nullable: true }) scoreMin?: number | null;
  @Field(() => Float, { nullable: true }) scoreMax?: number | null;

  /** Score moyen sur la période précédente de même durée, et son écart. */
  @Field(() => Float, { nullable: true }) scoreMoyenPrecedent?: number | null;
  @Field(() => Float, { nullable: true }) deltaScore?: number | null;

  /** Qualité des échanges analysés — contextualise la fiabilité du score. */
  @Field(() => Int) nbLowConfidence: number;
  @Field(() => Int) nbInexploitable: number;

  /** Profil par étape du plan de vente : là où le comparatif devient actionnable. */
  @Field(() => [CoachingStepAverageDto]) steps: CoachingStepAverageDto[];

  @Field(() => String, { nullable: true }) derniereAnalyseAt?: string | null;
}

/** Comparatif de scoring coaching sur une période. */
@ObjectType()
export class CoachingScoreboardDto {
  @Field(() => [CoachingScoreboardRowDto]) rows: CoachingScoreboardRowDto[];

  /** Score moyen toutes analyses confondues — la ligne de référence de l'équipe. */
  @Field(() => Float, { nullable: true }) scoreMoyenEquipe?: number | null;
  @Field(() => Float, { nullable: true }) scoreMoyenEquipePrecedent?: number | null;
  @Field(() => Int) nbAnalyses: number;

  /** Étapes du plan actif, dans l'ordre — axes du comparatif. */
  @Field(() => [CoachingStepAverageDto]) stepsEquipe: CoachingStepAverageDto[];
}

/** Un enregistrement coachable dans l'interface de gestion. */
@ObjectType()
export class CoachingManagementItemDto {
  @Field() s3Key: string;
  @Field(() => Int) porteId: number;
  @Field(() => String, { nullable: true }) subjectName?: string | null;
  @Field(() => String, { nullable: true }) subjectRole?: string | null;
  @Field(() => Int, { nullable: true }) subjectId?: number | null;
  @Field(() => String, { nullable: true }) statutPorte?: string | null;
  @Field(() => Float, { nullable: true }) durationSec?: number | null;
  @Field(() => String, { nullable: true }) adresse?: string | null;
  @Field(() => String, { nullable: true }) porteNumero?: string | null;
  @Field(() => Int, { nullable: true }) porteEtage?: number | null;
  @Field() favori: boolean;
  @Field(() => Int, { nullable: true }) analysisId?: number | null;
  @Field(() => String, { nullable: true }) analysisStatus?: string | null;
  @Field(() => String, { nullable: true }) quality?: string | null;
  @Field(() => Float, { nullable: true }) score?: number | null;
}

@ObjectType()
export class PaginatedCoachingManagement {
  @Field(() => [CoachingManagementItemDto]) items: CoachingManagementItemDto[];
  @Field(() => Int) total: number;
}

@InputType()
export class CoachingManagementFilter {
  @Field(() => Int, { nullable: true, defaultValue: 0 }) skip?: number;
  @Field(() => Int, { nullable: true, defaultValue: 15 }) take?: number;
  @Field(() => String, { nullable: true }) statut?: string;
  @Field(() => String, { nullable: true }) search?: string;
  @Field({ nullable: true }) favorisOnly?: boolean;
  @Field(() => Int, { nullable: true }) subjectId?: number; // filtre par commercial/manager
  @Field(() => String, { nullable: true }) durationTier?: string; // 'lt1' | '1to3' | 'gt3'
  @Field({ nullable: true }) notAnalyzedOnly?: boolean; // uniquement les non-analysés
}

/** Sujet coachable (pour le menu déroulant de filtre). */
@ObjectType()
export class CoachableSubjectDto {
  @Field(() => Int) subjectId: number;
  @Field() subjectName: string;
  @Field() subjectRole: string;
}

/** Synthèse globale d'un commercial / manager (hors pipeline audio). */
@ObjectType()
export class CoachingSynthesisDto {
  @Field() subjectType: string;
  @Field(() => Int, { nullable: true }) subjectId?: number | null;
  @Field() status: string;
  // Analyse détaillée (liste de tirets fouillés) + listes forces/axes/priorités.
  @Field(() => [String]) analyse: string[];
  @Field(() => [String]) strengths: string[];
  @Field(() => [String]) improvements: string[];
  @Field(() => [String]) priorities: string[];
  @Field(() => String, { nullable: true }) trend?: string | null;
  @Field(() => Float, { nullable: true }) scoreMoyen?: number | null;
  @Field(() => Int) nbAnalyses: number;
  // Période couverte par les sessions jugées (plus ancienne → plus récente).
  @Field(() => String, { nullable: true }) periodStart?: string | null;
  @Field(() => String, { nullable: true }) periodEnd?: string | null;
  @Field(() => String, { nullable: true }) error?: string | null;
  @Field(() => String, { nullable: true }) generatedAt?: string | null;
}

@ObjectType()
export class CoachingConfigDto {
  @Field(() => [String]) coachableStatuts: string[];
  @Field(() => [String]) allStatuts: string[];
  @Field(() => Int) minAutoDurationSec: number; // durée min (s) pour l'analyse auto
  @Field() synthesisCronSchedule: string; // libellé lisible de la planif
  @Field() synthesisCronFrequency: string; // 'daily' | 'weekly' | 'off'
  @Field(() => Int) synthesisCronHour: number;
  @Field(() => Int) synthesisCronMinute: number;
  @Field(() => Int) synthesisCronWeekday: number; // 0=dim..6=sam
  @Field(() => String, { nullable: true }) synthesisCronLastRunAt?: string | null;
}

@ObjectType()
export class SalesPlanCriterionDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) points: number;
  @Field() evidenceRequired: boolean;
  @Field() appliesWhen: string;
}

@ObjectType()
export class SalesPlanStepDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) weight: number;
  @Field() appliesWhen: string;
  @Field(() => [SalesPlanCriterionDto]) criteria: SalesPlanCriterionDto[];
}

@ObjectType()
export class ActiveSalesPlanDto {
  @Field() slug: string;
  @Field() title: string;
  @Field(() => Int) version: number;
  @Field(() => Int) scoringScale: number;
  @Field(() => [SalesPlanStepDto]) steps: SalesPlanStepDto[];
}

@InputType()
export class CoachingAnalysesFilter {
  @Field(() => Int, { nullable: true, defaultValue: 0 }) skip?: number;
  @Field(() => Int, { nullable: true, defaultValue: 20 }) take?: number;
  @Field(() => Int, { nullable: true }) userId?: number;
  @Field(() => Int, { nullable: true }) managerId?: number;
  @Field(() => Int, { nullable: true }) porteId?: number;
  @Field(() => String, { nullable: true }) status?: string;
}

/** Fiche produit active, pour l'onglet Produits en lecture seule. */
@ObjectType()
export class ProductSheetForbiddenDto {
  @Field() say: string;
  @Field() severity: string; // 'grave' | 'modere'
}

@ObjectType()
export class ProductSheetDto {
  @Field(() => Int) id: number;
  @Field() slug: string;
  @Field() label: string;
  @Field() productKey: string;
  @Field(() => Int) version: number;
  @Field(() => [String]) facts: string[];
  @Field(() => [ProductSheetForbiddenDto]) forbidden: ProductSheetForbiddenDto[];
  @Field() rawMarkdown: string;
}
