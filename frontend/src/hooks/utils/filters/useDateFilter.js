import { useState } from 'react'

/**
 * Hook pour gérer les filtres de date et filtrer les données par période.
 *
 * `initialRange` permet à un appelant de démarrer sur une période déjà appliquée.
 * C'est indispensable quand des requêtes dépendent des bornes : les poser dans un
 * `useEffect` après le montage fait partir un premier jeu de requêtes **sans
 * bornes** (donc sur tout l'historique) dont le résultat est aussitôt jeté.
 *
 * @param {{ start?: string, end?: string }} [initialRange] Bornes `YYYY-MM-DD`
 * @returns {Object} Objet contenant les états et fonctions de filtrage
 */
export function useDateFilter({ start = '', end = '' } = {}) {
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(end)
  const [appliedStartDate, setAppliedStartDate] = useState(start)
  const [appliedEndDate, setAppliedEndDate] = useState(end)

  /**
   * Valide les filtres.
   *
   * Accepte des dates explicites, indispensable pour les presets : ils posent les
   * dates et appliquent dans le même geste. Sans ce paramètre, l'appel se faisait via
   * une closure capturée avant la mise à jour d'état et appliquait les anciennes
   * valeurs. Sans argument, on applique le brouillon courant — comportement inchangé
   * pour le bouton « Appliquer ».
   *
   * @param {string} [nextStart]
   * @param {string} [nextEnd]
   */
  const handleApplyFilters = (nextStart, nextEnd) => {
    const start = nextStart !== undefined ? nextStart : startDate
    const end = nextEnd !== undefined ? nextEnd : endDate

    // On aligne aussi le brouillon, sinon le panneau réafficherait les anciennes
    // valeurs alors que la période appliquée a changé.
    setStartDate(start)
    setEndDate(end)
    setAppliedStartDate(start)
    setAppliedEndDate(end)
  }

  // Fonction pour réinitialiser les filtres
  const handleResetFilters = () => {
    setStartDate('')
    setEndDate('')
    setAppliedStartDate('')
    setAppliedEndDate('')
  }

  return {
    startDate,
    endDate,
    appliedStartDate,
    appliedEndDate,
    setStartDate,
    setEndDate,
    handleApplyFilters,
    handleResetFilters,
  }
}

/**
 * Filtre les statistiques par période
 * @param {Array} statistics - Tableau des statistiques à filtrer
 * @param {string} start - Date de début (format ISO)
 * @param {string} end - Date de fin (format ISO)
 * @returns {Array} Statistiques filtrées
 */
export function filterStatisticsByDate(statistics, start, end) {
  if (!statistics || !statistics.length) return []
  if (!start && !end) return statistics

  return statistics.filter(stat => {
    const statDate = new Date(stat.createdAt)
    if (start) {
      const startDateTime = new Date(start)
      startDateTime.setHours(0, 0, 0, 0)
      if (statDate < startDateTime) return false
    }
    if (end) {
      const endDateTime = new Date(end)
      endDateTime.setHours(23, 59, 59, 999) // Inclure toute la journée de fin
      if (statDate > endDateTime) return false
    }
    return true
  })
}

/**
 * Filtre les portes par date de dernière visite
 * @param {Array} portes - Tableau des portes à filtrer
 * @param {string} start - Date de début (format ISO)
 * @param {string} end - Date de fin (format ISO)
 * @returns {Array} Portes filtrées
 */
export function filterPortesByDate(portes, start, end) {
  if (!portes || !portes.length) return []
  if (!start && !end) return portes

  return portes.filter(porte => {
    const dateToCheck = porte.derniereVisite || porte.updatedAt || porte.createdAt
    if (!dateToCheck) return false
    const porteDate = new Date(dateToCheck)
    if (start) {
      const startDateTime = new Date(start)
      startDateTime.setHours(0, 0, 0, 0)
      if (porteDate < startDateTime) return false
    }
    if (end) {
      const endDateTime = new Date(end)
      endDateTime.setHours(23, 59, 59, 999)
      if (porteDate > endDateTime) return false
    }
    return true
  })
}
