/**
 * Fichier centralisé pour la gestion des statuts de porte (Frontend)
 *
 * Ce fichier contient :
 * - L'enum StatutPorte (synchronisé avec le backend)
 * - Les métadonnées UI de chaque statut (labels, couleurs, icônes)
 * - Les helpers pour faciliter l'utilisation des statuts
 *
 * Pour ajouter un nouveau statut :
 * 1. Ajouter la valeur dans StatutPorte
 * 2. Ajouter la configuration dans STATUS_CONFIG
 * 3. Le système UI s'adaptera automatiquement
 *
 * IMPORTANT: Ce fichier doit être synchronisé avec :
 * - backend/src/porte/porte-status.constants.ts (même enum)
 * - backend/prisma/schema.prisma (même enum)
 */

import {
  Eye,
  CheckCircle2,
  XCircle,
  Calendar,
  UserX,
  MessageCircle,
  RotateCcw,
} from 'lucide-react'

/**
 * Enum des statuts possibles pour une porte
 * DOIT être synchronisé avec le backend
 */
export const StatutPorte = {
  NON_VISITE: 'NON_VISITE',
  CONTRAT_SIGNE: 'CONTRAT_SIGNE',
  REFUS: 'REFUS',
  RENDEZ_VOUS_PRIS: 'RENDEZ_VOUS_PRIS',
  ABSENT: 'ABSENT',
  ARGUMENTE: 'ARGUMENTE',
  NECESSITE_REPASSAGE: 'NECESSITE_REPASSAGE',
}

/**
 * Type de configuration UI pour un statut
 * @typedef {Object} StatusUIConfig
 * @property {string} value - La valeur du statut
 * @property {string} label - Le label en français pour l'UI
 * @property {string} description - Description du statut
 * @property {string} themeColor - Nom de la couleur du thème (primary, success, danger, etc.)
 * @property {import('lucide-react').LucideIcon} icon - L'icône Lucide React
 * @property {boolean} requiresRdvDateTime - Si ce statut nécessite une date/heure de RDV
 */

/**
 * Configuration UI centralisée de tous les statuts
 *
 * Cette configuration définit l'apparence et le comportement de chaque statut dans l'UI
 */
export const STATUS_CONFIG = {
  [StatutPorte.NON_VISITE]: {
    value: StatutPorte.NON_VISITE,
    label: 'Non visité',
    description: 'Porte non visitée - statut par défaut',
    themeColor: 'neutral',
    icon: Eye,
    requiresRdvDateTime: false,
  },

  [StatutPorte.CONTRAT_SIGNE]: {
    value: StatutPorte.CONTRAT_SIGNE,
    label: 'Contrat signé',
    description: 'Contrat signé - succès commercial',
    themeColor: 'success',
    icon: CheckCircle2,
    requiresRdvDateTime: false,
  },

  [StatutPorte.REFUS]: {
    value: StatutPorte.REFUS,
    label: 'Refus',
    description: 'Refus du prospect',
    themeColor: 'danger',
    icon: XCircle,
    requiresRdvDateTime: false,
  },

  [StatutPorte.RENDEZ_VOUS_PRIS]: {
    value: StatutPorte.RENDEZ_VOUS_PRIS,
    label: 'RDV pris',
    description: 'Rendez-vous planifié avec le prospect',
    themeColor: 'primary',
    icon: Calendar,
    requiresRdvDateTime: true,
  },

  [StatutPorte.ABSENT]: {
    value: StatutPorte.ABSENT,
    label: 'Absent',
    description: 'Personne absente - pas de réponse à la porte',
    themeColor: 'info',
    icon: UserX,
    requiresRdvDateTime: false,
  },

  [StatutPorte.ARGUMENTE]: {
    value: StatutPorte.ARGUMENTE,
    label: 'Argumenté',
    description: 'Refus après discussion et argumentation commerciale',
    themeColor: 'warning',
    icon: MessageCircle,
    requiresRdvDateTime: false,
  },

  [StatutPorte.NECESSITE_REPASSAGE]: {
    value: StatutPorte.NECESSITE_REPASSAGE,
    label: 'Repasse – décisionnaire absent',
    description: 'Décisionnaire absent, repasse à prévoir (ni refus ni échec)',
    themeColor: 'neutral',
    icon: RotateCcw,
    requiresRdvDateTime: false,
  },
}

/**
 * Helper: Obtenir la configuration d'un statut
 * @param {string} status - Le statut
 * @returns {StatusUIConfig}
 */
export function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG[StatutPorte.NON_VISITE]
}

/**
 * Helper: Liste de tous les statuts disponibles
 * @returns {string[]}
 */
export function getAllStatuses() {
  return Object.values(StatutPorte)
}

/**
 * Helper: Obtenir le label d'un statut
 * @param {string} status - Le statut
 * @returns {string}
 */
export function getStatusLabel(status) {
  return getStatusConfig(status).label
}

/**
 * Helper: Obtenir l'icône d'un statut
 * @param {string} status - Le statut
 * @returns {import('lucide-react').LucideIcon}
 */
export function getStatusIcon(status) {
  return getStatusConfig(status).icon
}

/**
 * Helper: Obtenir la couleur du thème pour un statut
 * @param {string} status - Le statut
 * @returns {string}
 */
export function getStatusThemeColor(status) {
  return getStatusConfig(status).themeColor
}

/**
 * Helper: Vérifier si un statut nécessite une date/heure de RDV
 * @param {string} status - Le statut
 * @returns {boolean}
 */
export function requiresRdvDateTime(status) {
  return getStatusConfig(status).requiresRdvDateTime
}

/**
 * Helper: Obtenir les classes CSS de couleur pour un statut (version simple)
 * Retourne directement les classes Tailwind sans utiliser le thème
 *
 * @param {string} status - Le statut
 * @returns {string} Les classes CSS Tailwind
 */
export function getStatusColor(status) {
  // Normaliser le statut en majuscules
  const normalizedStatus = status?.toUpperCase()

  switch (normalizedStatus) {
    case StatutPorte.CONTRAT_SIGNE:
      return 'bg-green-100 text-green-800'
    case StatutPorte.REFUS:
      return 'bg-red-100 text-red-800'
    case StatutPorte.RENDEZ_VOUS_PRIS:
      return 'bg-blue-100 text-blue-800'
    case StatutPorte.ABSENT:
      return 'bg-blue-100 text-blue-800'
    case StatutPorte.ARGUMENTE:
      return 'bg-orange-100 text-orange-800'
    case StatutPorte.NECESSITE_REPASSAGE:
      return 'bg-yellow-100 text-yellow-800'
    case StatutPorte.NON_VISITE:
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Helper: Obtenir les classes CSS de couleur pour un statut
 * Utilisé pour générer les classes Tailwind avec les couleurs du thème
 *
 * @param {string} status - Le statut
 * @param {Object} themeColors - Les couleurs du thème (de useCommercialTheme)
 * @returns {string} Les classes CSS
 */
export function getStatusColorClasses(status, themeColors) {
  const config = getStatusConfig(status)
  const colorKey = config.themeColor

  // Gérer le cas spécial de primary qui utilise textLight
  if (colorKey === 'primary') {
    return `${themeColors[colorKey].bgLight} ${themeColors[colorKey].textLight}`
  }

  return `${themeColors[colorKey].bgLight} ${themeColors[colorKey].text}`
}

/**
 * Helper: Obtenir les classes CSS de bordure pour un statut
 * Utilisé pour générer les classes Tailwind avec les couleurs du thème
 *
 * @param {string} status - Le statut
 * @param {Object} themeColors - Les couleurs du thème (de useCommercialTheme)
 * @returns {string} Les classes CSS
 */
export function getStatusBorderClasses(status, themeColors) {
  const config = getStatusConfig(status)
  const colorKey = config.themeColor
  
  if (colorKey === 'primary') {
    return themeColors[colorKey].border || 'border-blue-500'
  }
  
  return themeColors[colorKey].border || 'border-gray-200'
}

/**
 * Helper: Générer les options de statut pour les composants de formulaire
 * Utilisé par les selects, dropdowns, etc.
 *
 * @param {Object} themeColors - Les couleurs du thème (de useCommercialTheme)
 * @param {string[]} [excludeStatuses] - Statuts à exclure (optionnel)
 * @returns {Array<{value: string, label: string, color: string, icon: import('lucide-react').LucideIcon}>}
 */
export function getStatusOptions(themeColors, excludeStatuses = []) {
  return getAllStatuses()
    .filter((status) => !excludeStatuses.includes(status))
    .map((status) => {
      const config = getStatusConfig(status)
      return {
        value: config.value,
        label: config.label,
        color: getStatusColorClasses(status, themeColors),
        borderColor: getStatusBorderClasses(status, themeColors),
        icon: config.icon,
      }
    })
}

/**
 * Helper: Obtenir le badge HTML pour un statut
 * Utilisé dans les tableaux et cartes
 *
 * @param {string} status - Le statut
 * @param {Object} themeColors - Les couleurs du thème
 * @returns {{label: string, colorClasses: string, Icon: import('lucide-react').LucideIcon}}
 */
export function getStatusBadgeData(status, themeColors) {
  const config = getStatusConfig(status)
  return {
    label: config.label,
    colorClasses: getStatusColorClasses(status, themeColors),
    borderClasses: getStatusBorderClasses(status, themeColors),
    Icon: config.icon,
  }
}

/**
 * Helper: Obtenir la couleur HSL pour un statut (pour les charts)
 * Retourne une couleur HSL correspondant aux classes Tailwind
 *
 * @param {string} status - Le statut
 * @returns {string} La couleur en format HSL
 */
export function getStatusChartColor(status) {
  const normalizedStatus = status?.toUpperCase()

  switch (normalizedStatus) {
    case StatutPorte.CONTRAT_SIGNE:
      return 'hsl(142 76% 36%)' // Vert (green-800)
    case StatutPorte.REFUS:
      return 'hsl(0 84% 60%)' // Rouge (red-800)
    case StatutPorte.RENDEZ_VOUS_PRIS:
      return 'hsl(213 94% 68%)' // Bleu (blue-800)
    case StatutPorte.ABSENT:
      return 'hsl(199 89% 48%)' // Bleu ciel (blue-800)
    case StatutPorte.ARGUMENTE:
      return 'hsl(25 95% 53%)' // Orange (orange-800)
    case StatutPorte.NECESSITE_REPASSAGE:
      return 'hsl(45 93% 47%)' // Jaune (yellow-800)
    case StatutPorte.NON_VISITE:
      return 'hsl(0 0% 45%)' // Gris (gray-800)
    default:
      return 'hsl(0 0% 45%)' // Gris par défaut
  }
}
