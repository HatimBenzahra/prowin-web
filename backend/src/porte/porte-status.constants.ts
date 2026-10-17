/**
 * Fichier centralisé pour la gestion des statuts de porte
 *
 * Ce fichier contient :
 * - L'enum StatutPorte (source unique de vérité)
 * - Les métadonnées de chaque statut (comportement dans les statistiques)
 * - Les helpers pour faciliter l'utilisation des statuts
 *
 * Pour ajouter un nouveau statut :
 * 1. Ajouter la valeur dans l'enum StatutPorte
 * 2. Ajouter la configuration dans STATUS_CONFIG
 * 3. Mettre à jour le schema.prisma
 * 4. Créer et exécuter une migration Prisma
 */

/**
 * Enum des statuts possibles pour une porte
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

/**
 * Type pour la configuration d'un statut
 */
export interface StatusMetadata {
  /** Le statut enum */
  value: StatutPorte;

  /** Description du statut */
  description: string;

  /** Si ce statut compte dans les portes prospectées */
  countAsProspected: boolean;

  /** Si ce statut incrémente le compteur de contrats signés */
  incrementContratsSignes: boolean;

  /** Si ce statut incrémente le compteur de rendez-vous pris */
  incrementRendezVousPris: boolean;

  /** Si ce statut incrémente le compteur de refus */
  incrementRefus: boolean;

  /** Si ce statut nécessite une date/heure de RDV */
  requiresRdvDateTime: boolean;
}

/**
 * Configuration centralisée de tous les statuts
 *
 * Cette configuration définit le comportement de chaque statut dans le système,
 * notamment pour le calcul des statistiques
 */
export const STATUS_CONFIG: Record<StatutPorte, StatusMetadata> = {
  [StatutPorte.NON_VISITE]: {
    value: StatutPorte.NON_VISITE,
    description: 'Porte non visitée - statut par défaut',
    countAsProspected: false,
    incrementContratsSignes: false,
    incrementRendezVousPris: false,
    incrementRefus: false,
    requiresRdvDateTime: false,
  },

  [StatutPorte.CONTRAT_SIGNE]: {
    value: StatutPorte.CONTRAT_SIGNE,
    description: 'Contrat signé - succès commercial',
    countAsProspected: true,
    incrementContratsSignes: true,
    incrementRendezVousPris: false,
    incrementRefus: false,
    requiresRdvDateTime: false,
  },

  [StatutPorte.REFUS]: {
    value: StatutPorte.REFUS,
    description: 'Refus du prospect',
    countAsProspected: true,
    incrementContratsSignes: false,
    incrementRendezVousPris: false,
    incrementRefus: true,
    requiresRdvDateTime: false,
  },

  [StatutPorte.RENDEZ_VOUS_PRIS]: {
    value: StatutPorte.RENDEZ_VOUS_PRIS,
    description: 'Rendez-vous planifié avec le prospect',
    countAsProspected: true,
    incrementContratsSignes: false,
    incrementRendezVousPris: true,
    incrementRefus: false,
    requiresRdvDateTime: true,
  },

  [StatutPorte.ABSENT]: {
    value: StatutPorte.ABSENT,
    description: 'Personne absente - pas de réponse à la porte',
    countAsProspected: true,
    incrementContratsSignes: false,
    incrementRendezVousPris: false,
    incrementRefus: false,
    requiresRdvDateTime: false,
  },

  [StatutPorte.ARGUMENTE]: {
    value: StatutPorte.ARGUMENTE,
    description: 'Refus après discussion et argumentation commerciale',
    countAsProspected: true,
    incrementContratsSignes: false,
    incrementRendezVousPris: false,
    incrementRefus: true,
    requiresRdvDateTime: false,
  },

  [StatutPorte.NECESSITE_REPASSAGE]: {
    value: StatutPorte.NECESSITE_REPASSAGE,
    description: 'Repasse – décisionnaire absent (ni refus ni échec)',
    countAsProspected: true,
    incrementContratsSignes: false,
    incrementRendezVousPris: false,
    incrementRefus: false,
    requiresRdvDateTime: false,
  },
};

/**
 * Helper: Obtenir la configuration d'un statut
 */
export function getStatusConfig(status: StatutPorte): StatusMetadata {
  return STATUS_CONFIG[status];
}

/**
 * Helper: Liste de tous les statuts disponibles
 */
export function getAllStatuses(): StatutPorte[] {
  return Object.values(StatutPorte);
}

/**
 * Helper: Liste des statuts qui comptent comme prospectés
 */
export function getProspectedStatuses(): StatutPorte[] {
  return getAllStatuses().filter(
    status => STATUS_CONFIG[status].countAsProspected
  );
}

/**
 * Helper: Vérifier si un statut compte comme prospecté
 */
export function isProspectedStatus(status: StatutPorte): boolean {
  return STATUS_CONFIG[status].countAsProspected;
}

/**
 * Helper: Vérifier si un statut nécessite une date/heure de RDV
 */
export function requiresRdvDateTime(status: StatutPorte): boolean {
  return STATUS_CONFIG[status].requiresRdvDateTime;
}

/**
 * Helper: Calculer les statistiques pour un ensemble de statuts
 * Utilisé par le service de synchronisation des statistiques
 */
export interface StatusStats {
  contratsSignes: number;
  rendezVousPris: number;
  refus: number;
  absents: number;
  argumentes: number;
  nbPortesProspectes: number;
}

export function calculateStatsForStatus(
  status: StatutPorte | string,
  count: number
): StatusStats {
  // Convertir le statut en string pour gérer les enums Prisma
  const statusKey = status as StatutPorte;
  const config = STATUS_CONFIG[statusKey];

  // Si la config n'existe pas, retourner des stats vides
  if (!config) {
    return {
      contratsSignes: 0,
      rendezVousPris: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      nbPortesProspectes: 0,
    };
  }

  return {
    contratsSignes: config.incrementContratsSignes ? count : 0,
    rendezVousPris: config.incrementRendezVousPris ? count : 0,
    refus: config.incrementRefus ? count : 0,
    absents: statusKey === StatutPorte.ABSENT ? count : 0,
    argumentes: statusKey === StatutPorte.ARGUMENTE ? count : 0,
    nbPortesProspectes: config.countAsProspected ? count : 0,
  };
}
