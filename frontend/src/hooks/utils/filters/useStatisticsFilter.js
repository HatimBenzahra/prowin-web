import { useMemo } from 'react'
import { filterPortesByDate } from './useDateFilter'
import { buildingDoorCount, effectiveTypeHabitat } from '@/constants/domain/habitat'
import { portesFaitesPar } from '@/utils/business/immeuble-membres'

function sortPortesByRecentCreation(portes) {
  return [...portes].sort((a, b) => {
    const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity
    const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity
    const timestampA = Number.isFinite(createdAtA) ? createdAtA : -Infinity
    const timestampB = Number.isFinite(createdAtB) ? createdAtB : -Infinity

    if (timestampA !== timestampB) {
      return timestampB - timestampA
    }

    return String(b.id || '').localeCompare(String(a.id || ''), 'fr', {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

/**
 * Hook pour calculer les statistiques personnelles filtrées par date
 * IMPORTANT: Calcule les stats à partir des PORTES filtrées, pas des statistiques
 * @param {Object} user - Utilisateur (manager ou commercial)
 * @param {string} appliedStartDate - Date de début appliquée
 * @param {string} appliedEndDate - Date de fin appliquée
 * @param {{type: string, id: number}} [viewer] - Ne compte que les portes qu'il a faites
 * @returns {Object} Statistiques personnelles calculées
 */
export function usePersonalStats(user, appliedStartDate, appliedEndDate, viewer) {
  // Collecter toutes les portes de l'utilisateur
  const allPortes = useMemo(() => {
    if (!user?.immeubles) return []
    return user.immeubles.reduce((acc, immeuble) => {
      if (immeuble.portes) {
        return [...acc, ...immeuble.portes]
      }
      return acc
    }, [])
  }, [user?.immeubles])

  // Filtrer les portes par date et par auteur
  const filteredPortes = useMemo(() => {
    return portesFaitesPar(filterPortesByDate(allPortes, appliedStartDate, appliedEndDate), viewer)
  }, [allPortes, appliedStartDate, appliedEndDate, viewer])

  // Calculer les totaux à partir des portes filtrées
  const personalStats = useMemo(() => {
    // Somme des nbContrats pour toutes les portes avec statut CONTRAT_SIGNE
    const totalContratsSignes = filteredPortes
      .filter(p => p.statut === 'CONTRAT_SIGNE')
      .reduce((sum, p) => sum + (p.nbContrats || 1), 0)
    const totalRendezVousPris = filteredPortes.filter(p => p.statut === 'RENDEZ_VOUS_PRIS').length
    const totalRefus = filteredPortes.filter(p => p.statut === 'REFUS').length
    const totalAbsents = filteredPortes.filter(p => p.statut === 'ABSENT').length
    const totalArgumentes = filteredPortes.filter(p => p.statut === 'ARGUMENTE').length
    const totalPortesProspectes = filteredPortes.filter(p => p.statut !== 'NON_VISITE').length

    // Compter les immeubles uniques visités
    const immeublesVisitesSet = new Set(
      filteredPortes.filter(p => p.statut !== 'NON_VISITE').map(p => p.immeubleId)
    )
    const totalImmeublesVisites = immeublesVisitesSet.size

    // Compter les immeubles uniques prospectés
    const immeublesProspectesSet = new Set(
      filteredPortes.filter(p => p.statut !== 'NON_VISITE').map(p => p.immeubleId)
    )
    const totalImmeublesProspectes = immeublesProspectesSet.size

    return {
      totalContratsSignes,
      totalImmeublesVisites,
      totalRendezVousPris,
      totalRefus,
      totalAbsents,
      totalArgumentes,
      totalPortesProspectes,
      totalImmeublesProspectes,
    }
  }, [filteredPortes])

  return { filteredStats: filteredPortes, personalStats }
}

/**
 * Restreint et ordonne les lignes de la table bâtiments.
 *
 * Deux règles, extraites du hook pour être testables :
 *
 * 1. **Avec une période active**, un bâtiment sans aucune porte concernée n'a rien à
 *    dire sur cette période. Le garder noyait la liste sous des lignes à zéro, ce qui
 *    donnait l'impression que le filtre ne touchait que les KPI.
 * 2. **Le tri suit la dernière activité**, pas la date de création : un bâtiment créé
 *    il y a trois mois mais prospecté aujourd'hui doit remonter en tête.
 *
 * @param {Array} rows - Lignes déjà calculées (avec `portesInRange` et `lastActivityAt`)
 * @param {boolean} hasDateFilter
 */
export function scopeAndSortImmeubleRows(rows, hasDateFilter) {
  const scoped = hasDateFilter ? (rows || []).filter(row => row.portesInRange > 0) : rows || []

  return [...scoped].sort((a, b) => {
    const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0
    const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
    return bTime - aTime
  })
}

/**
 * Hook pour préparer les données des immeubles avec statistiques calculées
 * @param {Array} immeubles - Tableau des immeubles
 * @param {string} appliedStartDate - Date de début appliquée
 * @param {string} appliedEndDate - Date de fin appliquée
 * @param {{type: string, id: number}} [viewer] - Stats comptées sur ses portes uniquement
 *   (la couverture reste calculée sur toutes les portes du bâtiment)
 * @returns {Array} Données des immeubles formatées pour le tableau
 */
export function useImmeublesTableData(immeubles, appliedStartDate, appliedEndDate, viewer) {
  return useMemo(() => {
    if (!immeubles) return []

    const hasDateFilter = Boolean(appliedStartDate || appliedEndDate)

    const rows = immeubles.map(immeuble => {
      // Utiliser les portes de l'immeuble directement (chargées avec l'immeuble)
      const portesImmeubleUnfiltered = immeuble.portes || []
      // Filtrer les portes par date
      const portesImmeuble = filterPortesByDate(
        portesImmeubleUnfiltered,
        appliedStartDate,
        appliedEndDate
      )
      const totalDoors = buildingDoorCount(immeuble)
      const portesCouverture = portesImmeuble
      // Les compteurs ne portent que sur les portes faites par le viewer (immeuble partagé)
      const portesImmeubleStats = portesFaitesPar(portesImmeuble, viewer)

      // Calculer les statistiques à partir des portes
      const visitedAt = portesImmeubleStats.reduce((latest, porte) => {
        const visit = porte.derniereVisite || porte.updatedAt
        if (!visit) return latest
        return !latest || new Date(visit) > new Date(latest) ? visit : latest
      }, null)
      // Somme des nbContrats pour toutes les portes avec statut CONTRAT_SIGNE
      const contratsSignes = portesImmeubleStats
        .filter(p => p.statut === 'CONTRAT_SIGNE')
        .reduce((sum, p) => sum + (p.nbContrats || 1), 0)
      const rdvPris = portesImmeubleStats.filter(p => p.statut === 'RENDEZ_VOUS_PRIS').length
      const refus = portesImmeubleStats.filter(p => p.statut === 'REFUS').length
      const absent = portesImmeubleStats.filter(p => p.statut === 'ABSENT').length
      const argumente = portesImmeubleStats.filter(p => p.statut === 'ARGUMENTE').length
      const repassages = portesImmeubleStats.reduce((sum, p) => sum + (p.nbRepassages || 0), 0)
      const portesProspectees = portesImmeubleStats.filter(p => p.statut !== 'NON_VISITE').length
      const portesProspecteesBatiment = portesCouverture.filter(
        p => p.statut !== 'NON_VISITE'
      ).length
      const couverture =
        totalDoors > 0 ? Math.round((portesProspecteesBatiment / totalDoors) * 100) : 0

      // Préparer les données des portes pour cette immeuble pour l'affichage imbriqué
      // Note: On réutilise la structure attendue par le tableau (status, rdvDate, etc)

      const formatDateTime = dateString => {
        if (!dateString) return null
        return new Date(dateString).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      }

      const doors = sortPortesByRecentCreation(portesImmeuble).map(porte => {
        const porteVisit = porte.derniereVisite || porte.updatedAt || null

        return {
          ...porte,
          id: porte.id,
          porteId: porte.id,
          immeubleId: porte.immeubleId || immeuble.id,
          tableId: `door-nested-${porte.id}`,
          number: porte.numero,
          etage: `Étage ${porte.etage}`,
          status: porte.statut.toLowerCase(),
          visitedAt: formatDateTime(porteVisit),
          rdvDate: formatDateTime(porte.rdvDate),
          rdvTime: porte.rdvTime || null,
          lastVisit: formatDateTime(porteVisit),
        }
      })

      return {
        id: immeuble.id,
        address: immeuble.adresse,
        type: effectiveTypeHabitat(immeuble),
        typeHabitat: immeuble.typeHabitat,
        floors: immeuble.nbEtages,
        doors_per_floor: immeuble.nbPortesParEtage,
        total_doors: totalDoors,
        couverture: couverture,
        contrats_signes: contratsSignes,
        rdv_pris: rdvPris,
        refus: refus,
        absent: absent,
        argumente: argumente,
        repassages: repassages,
        portes_prospectees: portesProspectees,
        createdAt: immeuble.createdAt,
        visitedAt: formatDateTime(visitedAt),
        doors, // Liste des portes pour l'affichage imbriqué
        // Champs internes de tri / filtrage, non affichés :
        // dernière activité réelle dans la période, et volume de portes concernées.
        lastActivityAt: visitedAt || immeuble.createdAt || null,
        portesInRange: portesImmeubleStats.length,
      }
    })

    return scopeAndSortImmeubleRows(rows, hasDateFilter)
  }, [immeubles, appliedStartDate, appliedEndDate, viewer])
}

/**
 * Hook pour collecter toutes les portes filtrées par date
 * @param {Array} immeubles - Tableau des immeubles
 * @param {string} appliedStartDate - Date de début appliquée
 * @param {string} appliedEndDate - Date de fin appliquée
 * @param {{type: string, id: number}} [viewer] - Ne garde que les portes qu'il a faites
 * @returns {Array} Toutes les portes filtrées
 */
export function useFilteredPortes(immeubles, appliedStartDate, appliedEndDate, viewer) {
  return useMemo(() => {
    if (!immeubles) return []

    // Collecter toutes les portes de tous les immeubles
    const allPortesUnfiltered = immeubles.reduce((acc, immeuble) => {
      if (immeuble.portes) {
        return [...acc, ...immeuble.portes]
      }
      return acc
    }, [])

    // Filtrer par date si nécessaire
    return sortPortesByRecentCreation(
      portesFaitesPar(
        filterPortesByDate(allPortesUnfiltered, appliedStartDate, appliedEndDate),
        viewer
      )
    )
  }, [immeubles, appliedStartDate, appliedEndDate, viewer])
}
