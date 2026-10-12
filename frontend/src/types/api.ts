/**
 * @fileoverview TypeScript definitions for GraphQL API
 * Generated from backend schema.gql
 * Provides type safety for all API interactions
 */

// =============================================================================
// Base Types
// =============================================================================

export interface BaseEntity {
  id: number
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Entity Types (matching GraphQL schema exactly)
// =============================================================================

export interface Directeur extends BaseEntity {
  nom: string
  prenom: string
  adresse: string
  email: string
  numTelephone: string
  status: UserStatus
}

export interface Manager extends BaseEntity {
  nom: string
  prenom: string
  email?: string | null
  numTelephone?: string | null
  directeurId?: number | null
  status: UserStatus
  directeur?: Directeur | null
  commercials?: Commercial[]
  zones?: Zone[]
  immeubles?: Immeuble[]
  statistics?: Statistic[]
  personalStatistics?: Statistic[]
  teamStatistics?: Statistic[]
}

export interface Commercial extends BaseEntity {
  nom: string
  prenom: string
  email: string
  numTel: string
  age: number
  managerId?: number | null
  directeurId?: number | null
  status: UserStatus
  immeubles: Immeuble[]
  zones: Zone[]
  statistics: Statistic[]
}

export interface Zone extends BaseEntity {
  nom: string
  /**
   * Anneau fermé `[[lng, lat], ...]` pour les zones polygone (nouveau modèle).
   * `null` pour les zones cercle héritées (repli sur xOrigin/yOrigin/rayon).
   */
  polygon?: number[][] | null
  xOrigin: number
  yOrigin: number
  rayon: number
  directeurId?: number | null
  managerId?: number | null
  commercials?: ZoneCommercialRelation[]
  immeubles?: Immeuble[]
}

/**
 * Type de bâtiment (synchronisé avec l'enum backend TypeHabitat).
 * IMMEUBLE = étages × portes ; MAISON = 1 foyer ; PAVILLON = N maisons.
 */
export type TypeHabitat = 'IMMEUBLE' | 'MAISON' | 'PAVILLON'

export interface Immeuble extends BaseEntity {
  adresse: string
  typeHabitat?: TypeHabitat
  nbEtages: number
  nbPortesParEtage: number
  nbMaisonsPrevu?: number | null
  commercialId?: number | null
  managerId?: number | null
  zoneId?: number | null
  quartierId?: number | null
  ascenseurPresent?: boolean
  digitalCode?: string | null
  latitude?: number | null
  longitude?: number | null
  portes?: Porte[]
}

/**
 * Quartier (regroupement de bâtiments) — version allégée (id + nom) utilisée
 * côté web pour le filtre / regroupement de la page Bâtiments.
 */
export interface Quartier {
  id: number
  nom: string
}

export interface Statistic extends BaseEntity {
  commercialId?: number | null
  managerId?: number | null
  immeubleId?: number | null
  zoneId?: number | null
  contratsSignes: number
  immeublesVisites: number
  rendezVousPris: number
  refus: number
  absents: number
  argumentes: number
  nbImmeublesProspectes: number
  nbPortesProspectes: number
}

export interface ZoneCommercialRelation extends BaseEntity {
  commercialId: number
  zoneId: number
}

export interface ZoneStatistic {
  zoneId: number
  zoneName: string
  totalContratsSignes: number
  totalImmeublesVisites: number
  totalRendezVousPris: number
  totalRefus: number
  totalImmeublesProspectes: number
  totalPortesProspectes: number
  tauxConversion: number
  tauxSuccesRdv: number
  nombreCommerciaux: number
  performanceGlobale: number
}

export interface TeamLastStatusActivity {
  userId: number
  userType: 'commercial' | 'manager'
  userName: string
  statut: string
  changedAt: string
  porteId: number
  porteNumero: string
  immeubleId?: number | null
  immeubleAdresse?: string | null
}

export interface TimelinePoint {
  date: string
  rdvPris: number
  portesProspectees: number
  contratsSignes: number
  refus: number
  absents: number
  argumentes: number
  repassages: number
}

export interface OwnerActivityStatistic {
  userId: number
  userType: 'commercial' | 'manager'
  userName: string
  contratsSignes: number
  rendezVousPris: number
  refus: number
  absents: number
  argumentes: number
  repassages: number
  nbPortesProspectes: number
  tauxConversion: number
  points: number
  lastActivityAt?: string | null
}

/** Totaux d'activité d'une plage, calculés depuis `StatusHistorique`. */
export interface StatsPeriodTotals {
  startDate?: string | null
  endDate?: string | null
  contratsSignes: number
  rendezVousPris: number
  refus: number
  absents: number
  argumentes: number
  repassages: number
  nbPortesProspectes: number
  nbPortesDistinctes: number
  nbIntervenants: number
  nbJoursActifs: number
  tauxConversion: number
  tauxContact: number
  tauxRdv: number
}

/** Période courante + période précédente de même durée, pour les deltas. */
export interface StatsPeriodComparison {
  current: StatsPeriodTotals
  previous?: StatsPeriodTotals | null
}

/** Effort terrain mesuré depuis `StatusHistorique.duree`. */
export interface StatsEffort {
  nbPassagesMesures: number
  nbPassagesSansDuree: number
  dureeTotaleSec: number
  dureeMoyenneParPassageSec: number
  dureeMedianeParPassageSec: number
  dureeParContratSignesSec?: number | null
  dureeParRdvSec?: number | null
  passagesParHeure: number
}

export interface ContratsValidesPoint {
  periodKey: string
  contratsValides: number
}

/** Contrats validés back-office agrégés sur la plage. */
export interface ContratsValidesAggregate {
  total: number
  totalPrevious?: number | null
  series: ContratsValidesPoint[]
  delaiMedianValidationJours?: number | null
  nbSansDateSignature: number
}

export interface PipelineAgeBucket {
  label: string
  count: number
}

export interface RepassageStock {
  total: number
  buckets: PipelineAgeBucket[]
  plusAncienJours?: number | null
}

export interface RdvStock {
  total: number
  aujourdhui: number
  aVenir: number
  enRetard: number
  sansDate: number
  plusEnRetardJours?: number | null
}

export interface ConclusionStock {
  contratsSignes: number
  argumentes: number
  refus: number
  total: number
}

export interface HabitatStock {
  typeHabitat: string
  batiments: number
  portesCreees: number
  capaciteDeclaree: number
  prospectees: number
  aTraiter: number
  couverture: number
}

export interface RepriseStats {
  portesPasseesParAbsent: number
  portesConclues: number
  portesEncoreAbsentes: number
  tauxReprise: number
}

/** Stock de travail de prospection à l'instant présent (pas un flux de période). */
export interface ProspectionPipeline {
  repassages: RepassageStock
  rdv: RdvStock
  conclusions: ConclusionStock
  nonVisitees: number
  habitat: HabitatStock[]
  reprise: RepriseStats
}

/* Ces unemarations sont pour classifier les utilisateurs d'un utilisateur actif a celui non actif et aussi de separer les comptes de testes */
export enum UserStatus {
  ACTIF = 'ACTIF',
  CONTRAT_FINIE = 'CONTRAT_FINIE',
  UTILISATEUR_TEST = 'UTILISATEUR_TEST',
}

/**
 * Enum des statuts de porte (TypeScript)
 * IMPORTANT: Doit être synchronisé avec :
 * - @/constants/domain/porte-status (configuration UI)
 * - backend/src/porte/porte-status.constants.ts (backend)
 * - backend/prisma/schema.prisma (database)
 */
export enum StatutPorte {
  NON_VISITE = 'NON_VISITE',
  CONTRAT_SIGNE = 'CONTRAT_SIGNE',
  REFUS = 'REFUS',
  RENDEZ_VOUS_PRIS = 'RENDEZ_VOUS_PRIS',
  ABSENT = 'ABSENT',
  ARGUMENTE = 'ARGUMENTE',
  NECESSITE_REPASSAGE = 'NECESSITE_REPASSAGE',
}

export interface Porte extends BaseEntity {
  numero: string
  nomPersonnalise?: string | null
  etage: number
  immeubleId: number
  statut: StatutPorte
  nbRepassages: number
  nbContrats: number
  rdvDate?: string | null
  rdvTime?: string | null
  commentaire?: string | null
  derniereVisite?: string | null
}

// =============================================================================
// Input Types for Mutations
// =============================================================================

export interface CreateDirecteurInput {
  nom: string
  prenom: string
  adresse: string
  email: string
  numTelephone: string
  status?: UserStatus
}

export interface CreateManagerInput {
  nom: string
  prenom: string
  email?: string
  numTelephone?: string
  directeurId?: number
  status?: UserStatus
}

export interface CreateCommercialInput {
  nom: string
  prenom: string
  email: string
  numTel: string
  age: number
  managerId?: number
  directeurId?: number
  status?: UserStatus
}

export interface CreateZoneInput {
  nom: string
  /**
   * Anneau fermé `[[lng, lat], ...]`. Le backend dérive et persiste
   * xOrigin/yOrigin/rayon : ne pas les envoyer pour une zone polygone.
   */
  polygon?: number[][]
  xOrigin?: number
  yOrigin?: number
  rayon?: number
}

export interface CreateImmeubleInput {
  adresse: string
  nbEtages: number
  nbPortesParEtage: number
  commercialId?: number
  managerId?: number
  zoneId?: number
  ascenseurPresent?: boolean
  digitalCode?: string
  latitude?: number
  longitude?: number
}

export interface CreateStatisticInput {
  commercialId?: number
  managerId?: number
  immeubleId?: number
  zoneId?: number
  contratsSignes: number
  immeublesVisites: number
  rendezVousPris: number
  refus: number
  nbImmeublesProspectes: number
  nbPortesProspectes: number
}

export interface CreatePorteInput {
  numero: string
  nomPersonnalise?: string
  etage: number
  immeubleId: number
  statut?: StatutPorte
  nbRepassages?: number
  nbContrats?: number
  rdvDate?: string
  rdvTime?: string
  commentaire?: string
  derniereVisite?: string
}

// =============================================================================
// Update Input Types
// =============================================================================

export interface UpdateDirecteurInput {
  id: number
  nom?: string
  prenom?: string
  adresse?: string
  email?: string
  numTelephone?: string
  status?: UserStatus
}

export interface UpdateManagerInput {
  id: number
  nom?: string
  prenom?: string
  email?: string
  numTelephone?: number
  directeurId?: number
  status?: UserStatus
}

export interface UpdateCommercialInput {
  id: number
  nom?: string
  prenom?: string
  email?: string
  numTel?: string
  age?: number
  managerId?: number
  directeurId?: number
  status?: UserStatus
}

export interface UpdateZoneInput {
  id: number
  nom?: string
  /**
   * Anneau fermé `[[lng, lat], ...]`. Le backend dérive et persiste
   * xOrigin/yOrigin/rayon : ne pas les envoyer pour une zone polygone.
   */
  polygon?: number[][]
  xOrigin?: number
  yOrigin?: number
  rayon?: number
}

export interface UpdateImmeubleInput {
  id: number
  adresse?: string
  nbEtages?: number
  nbPortesParEtage?: number
  commercialId?: number
  managerId?: number
  zoneId?: number
  ascenseurPresent?: boolean
  digitalCode?: string
  latitude?: number
  longitude?: number
}

export interface UpdateStatisticInput {
  id: number
  commercialId?: number
  managerId?: number
  immeubleId?: number
  zoneId?: number
  contratsSignes?: number
  immeublesVisites?: number
  rendezVousPris?: number
  refus?: number
  nbImmeublesProspectes?: number
  nbPortesProspectes?: number
}

export interface UpdatePorteInput {
  id: number
  numero?: string
  nomPersonnalise?: string
  etage?: number
  statut?: StatutPorte
  nbRepassages?: number
  nbContrats?: number
  rdvDate?: string
  rdvTime?: string
  commentaire?: string
  derniereVisite?: string
}

// =============================================================================
// GraphQL Response Types
// =============================================================================

export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    locations?: Array<{
      line: number
      column: number
    }>
    path?: Array<string | number>
  }>
}

// =============================================================================
// API Error Types
// =============================================================================

export interface ApiError {
  message: string
  statusCode?: number
  timestamp?: string
  path?: string
}

export class ApiException extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: ApiError[]
  ) {
    super(message)
    this.name = 'ApiException'
  }
}
