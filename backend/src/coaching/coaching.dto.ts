import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CoachingSubScoreDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) weight: number;
  @Field() applicable: boolean;
  @Field(() => Float, { nullable: true }) score?: number | null;
}

/** Citation d'une preuve, horodatée quand le transcript l'est. */
@ObjectType()
export class CoachingEvidenceRefDto {
  @Field() quote: string;
  @Field(() => Float, { nullable: true }) startSec?: number | null;
  @Field(() => Float, { nullable: true }) endSec?: number | null;
}

@ObjectType()
export class CoachingCriterionResultDto {
  @Field() stepKey: string;
  @Field() criterionKey: string;
  @Field() title: string;
  // maitrise | correct | partiel | faible | absent | non_applicable | non_evaluable,
  // découverte : obtenue_question | obtenue_spontanement | manquante ; legacy : atteint.
  @Field() status: string;
  @Field(() => Int) maxPoints: number;
  @Field(() => Float) score: number;
  @Field(() => Int) weightStep: number;
  @Field(() => [String]) evidence: string[];
  @Field(() => String, { nullable: true }) comment?: string;
  // Recalibrage 2026 : absents des analyses antérieures.
  @Field(() => Int, { nullable: true }) level?: number | null; // 0-4
  @Field(() => String, { nullable: true }) naReason?: string | null;
  @Field(() => String, { nullable: true }) naDetail?: string | null;
  @Field(() => String, { nullable: true }) dimension?: string | null; // qualite | plan | conformite
  @Field(() => String, { nullable: true }) kind?: string | null; // standard | discovery
  @Field(() => String, { nullable: true }) timing?: string | null; // on_time | late | reordered_justified
  @Field(() => [CoachingEvidenceRefDto], { nullable: true }) evidenceRefs?:
    | CoachingEvidenceRefDto[]
    | null;
}

/** Statut d'un produit du catalogue sur la visite (proposition, refus, oubli…). */
@ObjectType()
export class CoachingProductStatusDto {
  @Field() key: string;
  @Field() label: string;
  @Field() status: string; // NON_PRESENTE | MENTIONNE | PRESENTE | REFUSE | ACCEPTE | NON_APPLICABLE
  @Field(() => String, { nullable: true }) opportunity?: string | null; // oubliee | volontairement_non_presente
  @Field(() => String, { nullable: true }) naReason?: string | null;
  @Field(() => String, { nullable: true }) naDetail?: string | null;
  @Field(() => [String]) evidence: string[];
}

@InputType()
export class CoachingProductStatusInput {
  @Field() key: string;
  @Field() status: string;
}

@ObjectType()
export class CoachingIndicatorsDto {
  @Field(() => Float, { nullable: true }) qualiteCommerciale?: number | null;
  @Field(() => Float, { nullable: true }) respectPlan?: number | null;
  @Field(() => Float, { nullable: true }) conformite?: number | null;
}

@ObjectType()
export class CoachingAnalysisConfidenceDto {
  @Field() level: string; // haute | moyenne | faible
  @Field(() => [String]) reasons: string[];
}

/** Un calcul annoncé au client, recalculé par le moteur. */
@ObjectType()
export class CoachingCalculationCheckDto {
  @Field() quote: string;
  @Field(() => [String]) inputs: string[];
  @Field() expression: string;
  @Field(() => Float, { nullable: true }) announced?: number | null;
  @Field(() => Float, { nullable: true }) recomputed?: number | null;
  @Field() status: string; // coherent | incoherent | non_verifiable
  @Field() comment: string;
}

@ObjectType()
export class CoachingContradictionDto {
  @Field() topic: string;
  @Field() quoteA: string;
  @Field() quoteB: string;
  @Field() comment: string;
}

@ObjectType()
export class CoachingPhaseTimingDto {
  @Field() stepKey: string;
  @Field(() => String, { nullable: true }) timing?: string | null;
  @Field(() => [String]) evidence: string[];
  @Field() comment: string;
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
  @Field() planSays: string; // citation informative du plan ; vide si le plan est silencieux
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
export class CoachingProductAlertDto {
  @Field() productSlug: string;
  @Field(() => String, { nullable: true }) productLabel?: string | null;
  @Field() type: string;
  @Field() quote: string;
  @Field() reference: string;
  @Field() referenceKind: string;
  @Field() reason: string;
}

@ObjectType()
export class CoachingProductVerificationItemDto {
  @Field() productSlug: string;
  @Field() productLabel: string;
  @Field() status: string;
  @Field() reason: string;
}

@ObjectType()
export class CoachingProductVerificationDto {
  @Field() status: string;
  @Field(() => [CoachingProductVerificationItemDto])
  products: CoachingProductVerificationItemDto[];
}

@ObjectType()
export class CoachingAnalysisDto {
  @Field(() => Int, { nullable: true }) transcriptionAttempts?: number;
  @Field(() => Int, { nullable: true }) evaluationAttempts?: number;
  @Field(() => String, { nullable: true }) stageStartedAt?: string | null;
  @Field(() => String, { nullable: true }) transcriptionStartedAt?:
    | string
    | null;
  @Field(() => String, { nullable: true }) transcriptionCompletedAt?:
    | string
    | null;
  @Field(() => String, { nullable: true }) evaluationStartedAt?: string | null;
  @Field(() => String, { nullable: true }) evaluationCompletedAt?:
    | string
    | null;
  @Field(() => String, { nullable: true }) nextRetryAt?: string | null;
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
  @Field(() => [CoachingProductAlertDto])
  productAlerts?: CoachingProductAlertDto[];
  @Field(() => CoachingProductVerificationDto)
  productVerification?: CoachingProductVerificationDto;
  @Field(() => [String]) detectedProducts: string[]; // offres PRÉSENTÉES par le commercial
  @Field(() => [CoachingMappedProductDto])
  productMapping: CoachingMappedProductDto[];
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

  // Recalibrage 2026 : null sur les analyses antérieures.
  @Field(() => Float, { nullable: true }) executionScore?: number | null;
  @Field(() => Float, { nullable: true }) outcomeScore?: number | null;
  @Field(() => String, { nullable: true }) outcomeCategory?: string | null;
  @Field(() => String, { nullable: true }) outcomeComment?: string | null;
  @Field(() => [String]) outcomeEvidence?: string[];
  @Field(() => String, { nullable: true }) visitResult?: string | null;
  @Field(() => String, { nullable: true }) nonSaleReason?: string | null;
  @Field(() => String, { nullable: true }) nextAction?: string | null;
  @Field(() => String, { nullable: true }) ribStatus?: string | null;
  @Field(() => String, { nullable: true }) signatureStatus?: string | null;
  @Field(() => String, { nullable: true }) outcomeOverriddenBy?: string | null;
  @Field(() => String, { nullable: true }) outcomeOverriddenAt?: string | null;
  @Field(() => [CoachingProductStatusDto])
  productStatuses?: CoachingProductStatusDto[];
  @Field(() => CoachingIndicatorsDto, { nullable: true })
  indicators?: CoachingIndicatorsDto | null;
  @Field(() => String, { nullable: true }) band?: string | null; // maitrise | correct | coaching | insuffisant | non_evaluable
  @Field(() => CoachingAnalysisConfidenceDto, { nullable: true })
  analysisConfidence?: CoachingAnalysisConfidenceDto | null;
  @Field(() => [CoachingCalculationCheckDto])
  calculationChecks?: CoachingCalculationCheckDto[];
  @Field(() => [CoachingContradictionDto])
  contradictions?: CoachingContradictionDto[];
  @Field(() => [CoachingPhaseTimingDto]) phaseTiming?: CoachingPhaseTimingDto[];
  // Niveau du commercial et score attendu à ce niveau (null pour un manager).
  @Field(() => String, { nullable: true }) commercialNiveau?: string | null;
  @Field(() => Int, { nullable: true }) objectiveScore?: number | null;
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
  @Field(() => Float, { nullable: true }) scoreMoyenEquipePrecedent?:
    | number
    | null;
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
  @Field(() => String, { nullable: true }) band?: string | null;
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

/** Statut d'un produit sur la visite, réduit à ce qu'affiche le journal. */
@ObjectType()
export class CoachingJournalProductDto {
  @Field() key: string;
  @Field() status: string;
}

@ObjectType()
export class CoachingJournalAnalysisDto {
  @Field(() => Int) id: number;
  @Field() status: string;
  @Field(() => String, { nullable: true }) quality?: string | null;
  @Field(() => Float, { nullable: true }) score?: number | null;
  @Field(() => String, { nullable: true }) band?: string | null;
  @Field(() => Float, { nullable: true }) executionScore?: number | null;
  @Field(() => Float, { nullable: true }) outcomeScore?: number | null;
  @Field(() => String, { nullable: true }) visitResult?: string | null;
  @Field(() => String, { nullable: true }) nonSaleReason?: string | null;
  @Field(() => [CoachingJournalProductDto])
  productStatuses: CoachingJournalProductDto[];
}

/** Un audio du journal des écoutes : 1 audio = 1 porte (celle du premier segment). */
@ObjectType()
export class CoachingJournalRowDto {
  @Field() s3Key: string;
  @Field(() => Int, { nullable: true }) recordingId?: number | null;
  @Field() createdAt: string;
  @Field() day: string; // YYYY-MM-DD, heure de Paris
  @Field(() => Float, { nullable: true }) durationSec?: number | null;
  @Field(() => Int, { nullable: true }) subjectId?: number | null;
  @Field(() => String, { nullable: true }) subjectName?: string | null;
  @Field(() => String, { nullable: true }) subjectRole?: string | null;
  @Field(() => Int) porteId: number;
  @Field() porteNumero: string;
  @Field(() => Int) porteEtage: number;
  @Field(() => String, { nullable: true }) statutPorte?: string | null;
  @Field(() => Int) immeubleId: number;
  @Field() adresse: string;
  @Field() favori: boolean;
  @Field() archived: boolean;
  @Field(() => String, { nullable: true }) archivedAt?: string | null;
  @Field(() => CoachingJournalAnalysisDto, { nullable: true })
  analysis?: CoachingJournalAnalysisDto | null;
}

/** Une page du journal : des jours ENTIERS, du plus récent au plus ancien. */
@ObjectType()
export class CoachingJournalPageDto {
  @Field(() => [CoachingJournalRowDto]) rows: CoachingJournalRowDto[];
  @Field(() => [String]) days: string[];
  @Field() hasMore: boolean;
  // Curseur de la page suivante, à repasser tel quel dans `before`.
  @Field(() => String, { nullable: true }) nextBefore?: string | null;
}

@InputType()
export class CoachingJournalFilter {
  @Field(() => Date, { nullable: true }) dateFrom?: Date | null;
  @Field(() => Date, { nullable: true }) dateTo?: Date | null;
  // Curseur : seuls les audios strictement antérieurs.
  @Field(() => Date, { nullable: true }) before?: Date | null;
  @Field(() => Int, { nullable: true, defaultValue: 5 }) days?: number;
  @Field(() => Int, { nullable: true }) commercialId?: number | null;
  @Field(() => Int, { nullable: true }) managerId?: number | null;
  // Un bâtiment peut exister en plusieurs fiches (même adresse) : tous ses ids.
  @Field(() => [Int], { nullable: true }) immeubleIds?: number[] | null;
  @Field(() => String, { nullable: true }) search?: string | null; // adresse du bâtiment, sans casse ni accents
  @Field(() => [String], { nullable: true }) statutPorte?: string[] | null;
  @Field(() => [String], { nullable: true }) visitResult?: string[] | null;
  @Field(() => [String], { nullable: true }) band?: string[] | null;
  @Field(() => String, { nullable: true }) productKey?: string | null;
  @Field(() => Boolean, { nullable: true }) productAcceptedOnly?:
    | boolean
    | null;
  @Field(() => Boolean, { nullable: true }) favorisOnly?: boolean | null;
  @Field(() => Boolean, { nullable: true }) nonAnalysesOnly?: boolean | null;
  // 'hide' (défaut) : sans les archivés ; 'only' : seulement eux.
  @Field(() => String, { nullable: true }) archived?: string | null;
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
  @Field(() => String, { nullable: true }) synthesisCronLastRunAt?:
    | string
    | null;
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

/** Un produit du catalogue sur la période : proposé, vendu, oublié. */
@ObjectType()
export class CoachingProductRateDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) nbVisites: number; // visites où le produit était applicable
  @Field(() => Int) nbProposes: number; // PRESENTE + REFUSE + ACCEPTE
  @Field(() => Int) nbAcceptes: number;
  @Field(() => Int) nbOublies: number; // opportunité oubliée
  @Field(() => Float, { nullable: true }) tauxProposition?: number | null; // % des visites où il était applicable
  @Field(() => Float, { nullable: true }) tauxTransformation?: number | null; // % des propositions
}

@ObjectType()
export class CoachingSubjectSalesDto {
  @Field(() => Int) subjectId: number;
  @Field() subjectName: string;
  @Field() subjectRole: string;
  @Field(() => Int) nbVisites: number;
  @Field(() => Int) nbProduitsVendus: number;
  @Field(() => Float, { nullable: true }) produitsParVisite?: number | null;
}

@ObjectType()
export class CoachingLossCauseDto {
  @Field() reason: string;
  @Field(() => Int) count: number;
}

/** Statistiques produit des visites analysées (statuts produit du recalibrage). */
@ObjectType()
export class CoachingProductStatsDto {
  /** Visites analysées portant des statuts produit (analyses antérieures exclues). */
  @Field(() => Int) nbVisites: number;
  @Field(() => [CoachingProductRateDto]) products: CoachingProductRateDto[];
  @Field(() => Float, { nullable: true }) produitsParVisite?: number | null;
  @Field(() => [CoachingSubjectSalesDto])
  parIntervenant: CoachingSubjectSalesDto[];
  @Field(() => [CoachingLossCauseDto]) causesPerte: CoachingLossCauseDto[];
}
