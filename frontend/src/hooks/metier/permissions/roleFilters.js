/**
 * Utilitaires centralisés pour le filtrage des données selon les rôles
 */

// Types de rôles supportés
export const ROLES = {
  ADMIN: 'admin',
  DIRECTEUR: 'directeur',
  MANAGER: 'manager',
  COMMERCIAL: 'commercial',
}

// Permissions par rôle et par entité
export const PERMISSIONS = {
  [ROLES.ADMIN]: {
    dashboard: { view: true, add: false, edit: false, delete: false },
    commerciaux: { view: true, add: true, edit: true, delete: true },
    managers: { view: true, add: true, edit: true, delete: true },
    directeurs: { view: true, add: true, edit: true, delete: true },
    zones: { view: true, add: true, edit: true, delete: true },
    immeubles: { view: true, add: true, edit: true, delete: true },
    statistics: { view: true, add: true, edit: true, delete: true },
    'gps-tracking': { view: true, add: false, edit: false, delete: false },
    ecoutes: { view: true, add: true, edit: true, delete: true },
    coaching: { view: true, add: true, edit: true, delete: true },
    gestion: { view: true, add: true, edit: true, delete: true },
    gamification: { view: true, add: true, edit: true, delete: false },
    kiosk: { view: true, add: true, edit: true, delete: true },
  },
  [ROLES.DIRECTEUR]: {
    dashboard: { view: true, add: false, edit: false, delete: false },
    commerciaux: { view: true, add: true, edit: true, delete: true },
    managers: { view: true, add: true, edit: true, delete: true },
    directeurs: { view: false, add: false, edit: false, delete: false },
    zones: { view: true, add: true, edit: true, delete: false },
    immeubles: { view: true, add: true, edit: true, delete: false },
    statistics: { view: true, add: false, edit: false, delete: false },
    'gps-tracking': { view: true, add: false, edit: false, delete: false },
    ecoutes: { view: true, add: true, edit: true, delete: true },
    coaching: { view: true, add: true, edit: true, delete: true },
    gestion: { view: true, add: false, edit: true, delete: false },
    gamification: { view: true, add: false, edit: true, delete: false },
    kiosk: { view: true, add: false, edit: true, delete: false },
  },
  [ROLES.MANAGER]: {
    dashboard: { view: false, add: false, edit: false, delete: false },
    commerciaux: { view: false, add: false, edit: false, delete: false },
    managers: { view: false, add: false, edit: false, delete: false },
    directeurs: { view: false, add: false, edit: false, delete: false },
    zones: { view: false, add: false, edit: false, delete: false },
    immeubles: { view: false, add: false, edit: false, delete: false },
    statistics: { view: false, add: false, edit: false, delete: false },
    'gps-tracking': { view: false, add: false, edit: false, delete: false },
    ecoutes: { view: false, add: false, edit: false, delete: false },
    gestion: { view: false, add: false, edit: false, delete: false },
    gamification: { view: false, add: false, edit: false, delete: false },
  },
  [ROLES.COMMERCIAL]: {
    dashboard: { view: false, add: false, edit: false, delete: false },
    commerciaux: { view: false, add: false, edit: false, delete: false },
    managers: { view: false, add: false, edit: false, delete: false },
    directeurs: { view: false, add: false, edit: false, delete: false },
    zones: { view: true, add: false, edit: false, delete: false },
    immeubles: { view: true, add: false, edit: false, delete: false },
    statistics: { view: true, add: true, edit: true, delete: false },
    'gps-tracking': { view: false, add: false, edit: false, delete: false },
    ecoutes: { view: false, add: false, edit: false, delete: false },
    gestion: { view: false, add: false, edit: false, delete: false },
    gamification: { view: false, add: false, edit: false, delete: false },
  },
}

/**
 * Filtre les commerciaux selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterCommercials = commercials => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return commercials || []
}

/**
 * Filtre les managers selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterManagers = managers => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return managers || []
}

/**
 * Filtre les directeurs selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterDirecteurs = directeurs => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return directeurs || []
}

/**
 * Filtre les zones selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterZones = zones => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return zones || []
}

/**
 * Filtre les immeubles selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterImmeubles = immeubles => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return immeubles || []
}

/**
 * Filtre les statistiques selon le rôle de l'utilisateur
 * Note: Le filtrage est maintenant géré par le backend via JWT
 * Cette fonction retourne simplement les données reçues
 */
export const filterStatistics = statistics => {
  // Le backend filtre déjà les données selon les permissions JWT
  // On retourne simplement ce qu'on a reçu
  return statistics || []
}

/**
 * Vérifie si l'utilisateur a une permission spécifique
 */
export const hasPermission = (userRole, entity, action) => {
  return PERMISSIONS[userRole]?.[entity]?.[action] || false
}

/**
 * Génère une description dynamique selon le rôle
 */
export const getEntityDescription = (entity, userRole) => {
  const descriptions = {
    commerciaux: {
      [ROLES.ADMIN]: "Tous les commerciaux de l'entreprise avec leurs informations et performances",
      [ROLES.DIRECTEUR]: 'Commerciaux de votre division avec leurs informations et performances',
    },
    managers: {
      [ROLES.ADMIN]: "Tous les managers de l'entreprise avec leurs rangs",
      [ROLES.DIRECTEUR]: 'Managers de votre division avec leurs équipes',
    },
    directeurs: {
      [ROLES.ADMIN]: "Tous les directeurs de l'entreprise",
      [ROLES.DIRECTEUR]: 'Vos informations en tant que directeur',
    },
    zones: {
      [ROLES.ADMIN]: "Toutes les zones géographiques de l'entreprise",
      [ROLES.DIRECTEUR]: 'Zones géographiques de votre division',
      [ROLES.COMMERCIAL]: 'Vos zones géographiques assignées',
    },
    immeubles: {
      [ROLES.ADMIN]: "Tous les bâtiments gérés par l'entreprise",
      [ROLES.DIRECTEUR]: 'Bâtiments gérés par votre division',
      [ROLES.COMMERCIAL]: 'Vos bâtiments',
    },
    statistics: {
      [ROLES.ADMIN]: "Statistiques de tous les commerciaux de l'entreprise",
      [ROLES.DIRECTEUR]: 'Statistiques des commerciaux de votre division',
      [ROLES.COMMERCIAL]: 'Vos statistiques personnelles',
    },
    ecoutes: {
      [ROLES.ADMIN]: "Écoutes et enregistrements de tous les commerciaux de l'entreprise",
      [ROLES.DIRECTEUR]: 'Écoutes et enregistrements des commerciaux de votre division',
      [ROLES.COMMERCIAL]: "Pas d'accès aux écoutes",
    },
  }

  return descriptions[entity]?.[userRole] || `Gestion des ${entity}`
}
