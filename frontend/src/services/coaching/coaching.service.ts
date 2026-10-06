import { graphqlClient } from '../core/graphql'

// Sélection commune : tout ce qu'affiche le modal coaching.
const COACHING_FIELDS = `
  id
  recordingId
  porteId
  userId
  managerId
  s3KeyOriginal
  statutPorte
  status
  quality
  score
  scoreBeforeMalus
  malus
  violations { productSlug productLabel severity quote sheetSays planSays why }
  productAlerts { productSlug productLabel type quote reference referenceKind reason }
  productVerification { status products { productSlug productLabel status reason } }
  detectedProducts
  productMapping { key presentedByCommercial evidence }
  confidence
  summary
  strengths
  improvements
  recommendations
  subScores { key label weight applicable score }
  criterionResults { stepKey criterionKey title status maxPoints score weightStep evidence comment }
  transcriptDurationSec
  transcriptionAttempts evaluationAttempts stageStartedAt nextRetryAt
  transcriptionStartedAt transcriptionCompletedAt evaluationStartedAt evaluationCompletedAt
  error
  planSlug
  planVersion
  createdAt
  updatedAt
  subjectName
  subjectRole
  subjectId
  favori
`

const BY_S3_KEYS = `
  query CoachingByS3Keys($s3Keys: [String!]!) {
    coachingByS3Keys(s3Keys: $s3Keys) { ${COACHING_FIELDS} }
  }
`
const GET_ANALYSIS = `
  query CoachingAnalysis($id: Int!) {
    coachingAnalysis(id: $id) { ${COACHING_FIELDS} }
  }
`
const LIST_ANALYSES = `
  query CoachingAnalyses($filter: CoachingAnalysesFilter) {
    coachingAnalyses(filter: $filter) {
      items { ${COACHING_FIELDS} }
      total
    }
  }
`
const RELAUNCH = `
  mutation RelaunchCoachingAnalysis($id: Int!, $retranscribe: Boolean = false) {
    relaunchCoachingAnalysis(id: $id, retranscribe: $retranscribe) { ${COACHING_FIELDS} }
  }
`
const ACTIVE_PLAN = `
  query ActiveSalesPlan {
    activeSalesPlan {
      slug
      title
      version
      scoringScale
      steps {
        key
        label
        weight
        appliesWhen
        criteria { key label points evidenceRequired appliesWhen }
      }
    }
  }
`
const PRODUCT_SHEETS = `
  query CoachingProductSheets {
    coachingProductSheets {
      id
      slug
      label
      productKey
      version
      facts
      forbidden { say severity }
      rawMarkdown
    }
  }
`

const CONFIG_FIELDS = `
  coachableStatuts allStatuts minAutoDurationSec
  synthesisCronSchedule synthesisCronFrequency synthesisCronHour
  synthesisCronMinute synthesisCronWeekday synthesisCronLastRunAt
`
const COACHING_CONFIG = `
  query CoachingConfig {
    coachingConfig { ${CONFIG_FIELDS} }
  }
`
const COACHING_STATS = `
  query CoachingStats {
    coachingStats {
      pending processing ready failed inexploitable total avgScore
    }
  }
`
const COACHING_QUEUE = `
  query CoachingQueue {
    coachingQueue {
      id status s3KeyOriginal
      subjectName subjectRole subjectId
      statutPorte durationSec createdAt
    }
  }
`
const MANAGEMENT_LIST = `
  query CoachingManagementList($filter: CoachingManagementFilter) {
    coachingManagementList(filter: $filter) {
      items {
        s3Key porteId
        subjectName subjectRole subjectId
        statutPorte durationSec
        adresse porteNumero porteEtage
        favori
        analysisId analysisStatus quality score
      }
      total
    }
  }
`
const COACHABLE_SUBJECTS = `
  query CoachableSubjects {
    coachableSubjects { subjectId subjectName subjectRole }
  }
`
const STEP_AVERAGE_FIELDS = `key label weight score nbAnalyses`
const COACHING_SCOREBOARD = `
  query CoachingScoreboard($startDate: DateTime, $endDate: DateTime) {
    coachingScoreboard(startDate: $startDate, endDate: $endDate) {
      scoreMoyenEquipe
      scoreMoyenEquipePrecedent
      nbAnalyses
      stepsEquipe { ${STEP_AVERAGE_FIELDS} }
      rows {
        subjectId
        subjectName
        subjectRole
        nbAnalyses
        scoreMoyen
        scoreMin
        scoreMax
        scoreMoyenPrecedent
        deltaScore
        nbLowConfidence
        nbInexploitable
        derniereAnalyseAt
        steps { ${STEP_AVERAGE_FIELDS} }
      }
    }
  }
`
const LAUNCH_MANY = `
  mutation LaunchCoachingAnalyses($s3Keys: [String!]!) {
    launchCoachingAnalyses(s3Keys: $s3Keys)
  }
`
const SET_FAVORI = `
  mutation SetCoachingFavori($porteId: Int!, $favori: Boolean!) {
    setCoachingFavori(porteId: $porteId, favori: $favori)
  }
`
const GET_FAVORI = `
  query CoachingFavori($porteId: Int!) {
    coachingFavori(porteId: $porteId)
  }
`
const SYNTHESIS_FIELDS = `
  subjectType subjectId status
  analyse strengths improvements priorities
  trend scoreMoyen nbAnalyses
  periodStart periodEnd
  error generatedAt
`
const GET_SYNTHESIS = `
  query CoachingSynthesis($subjectType: String!, $subjectId: Int!) {
    coachingSynthesis(subjectType: $subjectType, subjectId: $subjectId) { ${SYNTHESIS_FIELDS} }
  }
`
const GENERATE_SYNTHESIS = `
  mutation GenerateCoachingSynthesis($subjectType: String!, $subjectId: Int!) {
    generateCoachingSynthesis(subjectType: $subjectType, subjectId: $subjectId) { ${SYNTHESIS_FIELDS} }
  }
`
const SET_COACHABLE = `
  mutation SetCoachableStatuts($statuts: [String!]!) {
    setCoachableStatuts(statuts: $statuts) { ${CONFIG_FIELDS} }
  }
`
const SET_MIN_DURATION = `
  mutation SetMinAutoDurationSec($seconds: Int!) {
    setMinAutoDurationSec(seconds: $seconds) { ${CONFIG_FIELDS} }
  }
`
const SET_SYNTHESIS_CRON = `
  mutation SetSynthesisCron($frequency: String!, $hour: Int!, $minute: Int!, $weekday: Int) {
    setSynthesisCron(frequency: $frequency, hour: $hour, minute: $minute, weekday: $weekday) { ${CONFIG_FIELDS} }
  }
`

export class CoachingService {
  /** Analyses existantes pour un lot de clés S3 (map côté UI). */
  static async byS3Keys(s3Keys: string[]): Promise<any[]> {
    if (!s3Keys?.length) return []
    try {
      const data = await graphqlClient.request(BY_S3_KEYS, { s3Keys })
      return data.coachingByS3Keys || []
    } catch (error) {
      console.error('Erreur coachingByS3Keys:', error)
      return []
    }
  }

  /** Liste paginée d'analyses (filtrable par commercial, statut…). */
  static async analyses(filter: any): Promise<{ items: any[]; total: number }> {
    try {
      const data = await graphqlClient.request(LIST_ANALYSES, { filter })
      return data.coachingAnalyses || { items: [], total: 0 }
    } catch (error) {
      console.error('Erreur coachingAnalyses:', error)
      return { items: [], total: 0 }
    }
  }

  static async get(id: number): Promise<any | null> {
    try {
      const data = await graphqlClient.request(GET_ANALYSIS, { id })
      return data.coachingAnalysis || null
    } catch (error) {
      console.error('Erreur coachingAnalysis:', error)
      return null
    }
  }

  static async relaunch(id: number, retranscribe = false): Promise<any> {
    const data = await graphqlClient.request(RELAUNCH, { id, retranscribe })
    return data.relaunchCoachingAnalysis
  }

  /** Liste de gestion : enregistrements coachables (paginée, filtrable). */
  static async managementList(filter: any): Promise<{ items: any[]; total: number }> {
    try {
      const data = await graphqlClient.request(MANAGEMENT_LIST, { filter })
      return data.coachingManagementList || { items: [], total: 0 }
    } catch (error) {
      console.error('Erreur coachingManagementList:', error)
      return { items: [], total: 0 }
    }
  }

  /** Lance l'analyse manuelle (ignore le filtre durée) sur un lot de clés S3. */
  static async launchMany(s3Keys: string[]): Promise<number> {
    const data = await graphqlClient.request(LAUNCH_MANY, { s3Keys })
    return data.launchCoachingAnalyses ?? 0
  }

  /** Marque/démarque une porte (enregistrement/coaching) comme favorite. */
  static async setFavori(porteId: number, favori: boolean): Promise<boolean> {
    const data = await graphqlClient.request(SET_FAVORI, { porteId, favori })
    return data.setCoachingFavori ?? false
  }

  /** État favori d'une porte (source de vérité DB). */
  static async getFavori(porteId: number): Promise<boolean> {
    try {
      const data = await graphqlClient.request(GET_FAVORI, { porteId })
      return data.coachingFavori ?? false
    } catch {
      return false
    }
  }

  /** Synthèse globale d'un commercial / manager (ou null si jamais générée). */
  static async getSynthesis(
    subjectType: 'commercial' | 'manager',
    subjectId: number,
  ): Promise<any | null> {
    try {
      const data = await graphqlClient.request(GET_SYNTHESIS, { subjectType, subjectId })
      return data.coachingSynthesis || null
    } catch (error) {
      console.error('Erreur coachingSynthesis:', error)
      return null
    }
  }

  /** Sujets coachables (commerciaux/managers actifs) pour le filtre déroulant. */
  static async coachableSubjects(): Promise<any[]> {
    try {
      const data = await graphqlClient.request(COACHABLE_SUBJECTS)
      return data.coachableSubjects || []
    } catch (error) {
      console.error('Erreur coachableSubjects:', error)
      return []
    }
  }

  /** Lance (ou relance) la génération de la synthèse. Renvoie l'état courant. */
  static async generateSynthesis(
    subjectType: 'commercial' | 'manager',
    subjectId: number,
  ): Promise<any | null> {
    const data = await graphqlClient.request(GENERATE_SYNTHESIS, { subjectType, subjectId })
    return data.generateCoachingSynthesis || null
  }

  /** Analyse coaching d'une porte (la plus récente), pour le modal de la porte. */
  static async byPorte(porteId: number): Promise<any | null> {
    try {
      const data = await graphqlClient.request(LIST_ANALYSES, {
        filter: { porteId, take: 1 },
      })
      return data.coachingAnalyses?.items?.[0] || null
    } catch (error) {
      console.error('Erreur coachingAnalyses(porte):', error)
      return null
    }
  }

  /** File interrogeable : audios en attente / en cours (sujet + durée). */
  static async queue(): Promise<any[]> {
    try {
      const data = await graphqlClient.request(COACHING_QUEUE)
      return data.coachingQueue || []
    } catch (error) {
      console.error('Erreur coachingQueue:', error)
      return []
    }
  }

  /** Config du coaching (statuts coachables + durée min auto + statuts possibles). */
  static async getConfig(): Promise<{
    coachableStatuts: string[]
    allStatuts: string[]
    minAutoDurationSec: number
  } | null> {
    try {
      const data = await graphqlClient.request(COACHING_CONFIG)
      return data.coachingConfig || null
    } catch (error) {
      console.error('Erreur coachingConfig:', error)
      return null
    }
  }

  static async setCoachableStatuts(statuts: string[]): Promise<any | null> {
    const data = await graphqlClient.request(SET_COACHABLE, { statuts })
    return data.setCoachableStatuts
  }

  /** Durée minimale (secondes) d'un audio pour l'analyse auto. */
  static async setMinAutoDurationSec(seconds: number): Promise<any | null> {
    const data = await graphqlClient.request(SET_MIN_DURATION, { seconds })
    return data.setMinAutoDurationSec
  }

  /** Planif du cron de synthèse (rythme + heure). */
  static async setSynthesisCron(
    frequency: string,
    hour: number,
    minute: number,
    weekday: number,
  ): Promise<any | null> {
    const data = await graphqlClient.request(SET_SYNTHESIS_CRON, {
      frequency,
      hour,
      minute,
      weekday,
    })
    return data.setSynthesisCron
  }

  /** État de la file + KPIs (dashboard). */
  static async stats(): Promise<any | null> {
    try {
      const data = await graphqlClient.request(COACHING_STATS)
      return data.coachingStats || null
    } catch (error) {
      console.error('Erreur coachingStats:', error)
      return null
    }
  }

  static async activePlan(): Promise<any | null> {
    try {
      const data = await graphqlClient.request(ACTIVE_PLAN)
      return data.activeSalesPlan || null
    } catch {
      return null
    }
  }

  /** Fiches produit actives — onglet Produits en lecture seule. */
  static async productSheets(): Promise<any[]> {
    try {
      const data = await graphqlClient.request(PRODUCT_SHEETS)
      // Le client GraphQL maison peut renvoyer data:null : le défaut ne couvre
      // que undefined, d'où le || [].
      return (data?.coachingProductSheets || [])
    } catch (error) {
      console.error('Erreur coachingProductSheets:', error)
      return []
    }
  }

  /**
   * Comparatif de scoring coaching entre intervenants sur une période.
   * Les bornes sont optionnelles : sans elles, toute l'historique est prise et
   * il n'y a pas de période précédente à comparer.
   */
  static async scoreboard(startDate?: string, endDate?: string): Promise<any | null> {
    try {
      const data = await graphqlClient.request(COACHING_SCOREBOARD, { startDate, endDate })
      return data.coachingScoreboard || null
    } catch (error) {
      console.error('Erreur coachingScoreboard:', error)
      return null
    }
  }
}

export default CoachingService
