import { effectiveTypeHabitat, getHabitatMeta, TypeHabitat } from '@/constants/domain/habitat'

/**
 * Construit les données de la façade (étages empilés haut→bas, portes enrichies
 * du signal audio) à partir d'un immeuble brut, de ses portes et d'une map
 * porteId → segment audio. Source unique réutilisée par la page immeuble ET la
 * modale bâtiment de la page commercial.
 *
 * @param {Object|null} immeuble - immeuble brut (typeHabitat, nbEtages, nbMaisonsPrevu, nbPortesParEtage, adresse)
 * @param {Array} portes - portes brutes (etage, numero, statut, ...)
 * @param {Map<number, {durationSec?: number}>} segmentMap - segment par porteId
 * @returns {{ type: string|null, address: string, planTitle: string, planSubtitle: string, floors: Array }}
 */
export function buildFacadeFloors(immeuble, portes, segmentMap = new Map()) {
  if (!immeuble) {
    return { type: null, address: '', planTitle: 'Plan du bâtiment', planSubtitle: '', floors: [] }
  }

  const type = effectiveTypeHabitat(immeuble)
  const meta = getHabitatMeta(type)
  const list = portes || []
  const address = immeuble.adresse || ''
  const nbEtages = immeuble.nbEtages ?? 0
  const nbMaisons = immeuble.nbMaisonsPrevu ?? 0
  const nbPortesParEtage = immeuble.nbPortesParEtage ?? 0

  const mapPorte = (porte, floorLabel) => {
    const segment = segmentMap.get(porte.id) || null
    return {
      porteId: porte.id,
      number: porte.numero,
      nomPersonnalise: porte.nomPersonnalise || null,
      status: (porte.statut || '').toLowerCase(),
      rdvDate: porte.rdvDate || null,
      rdvTime: porte.rdvTime || null,
      // `derniereVisite` d'abord : c'est l'heure du passage. `updatedAt` bouge aussi
      // sur une simple correction (commentaire, favori…) et n'est qu'un repli.
      lastVisit: porte.derniereVisite || porte.updatedAt || null,
      comment: porte.commentaire || null,
      nbContrats: porte.nbContrats || 0,
      nbRepassages: porte.nbRepassages || 0,
      floorLabel,
      audioDurationSec: segment?.durationSec ?? null,
      hasAudio: Boolean(segment),
      coachingFavori: porte.coachingFavori ?? false,
    }
  }

  let floors = []
  if (type === TypeHabitat.MAISON) {
    const label = meta.unitLabel
    floors = [
      { floor: 1, label, totalDoors: list.length, doors: list.map(p => mapPorte(p, label)) },
    ]
  } else {
    const unitCount = type === TypeHabitat.PAVILLON ? nbMaisons : nbEtages
    floors = Array.from({ length: unitCount }, (_, index) => {
      const unitNumber = index + 1
      const label = `${meta.unitLabel} ${unitNumber}`
      const portesUnit = list.filter(p => p.etage === unitNumber)
      return {
        floor: unitNumber,
        label,
        totalDoors: portesUnit.length,
        doors: portesUnit.map(p => mapPorte(p, label)),
      }
    }).sort((a, b) => b.floor - a.floor)
  }

  const planSubtitle =
    type === TypeHabitat.MAISON
      ? 'Maison individuelle · 1 porte'
      : type === TypeHabitat.PAVILLON
        ? `${nbMaisons} maison${nbMaisons > 1 ? 's' : ''} · 1 porte par maison`
        : `${nbEtages} étage${nbEtages > 1 ? 's' : ''} · ${nbPortesParEtage} portes/étage`

  return { type, address, planTitle: meta.planTitle, planSubtitle, floors }
}

const toDate = value => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** « 14:32 » — heure locale du navigateur. */
export function formatHeureVisite(value) {
  const date = toDate(value)
  return date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null
}

/** « Lundi 9 novembre 2026 ». */
export function formatJourVisite(value) {
  const date = toDate(value)
  if (!date) return null
  const label = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** « 09/11/2026 à 14:32 » — format court pour une tuile ou un lecteur audio. */
export function formatDateHeureCourte(value) {
  const date = toDate(value)
  if (!date) return null
  const jour = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${jour} à ${formatHeureVisite(date)}`
}

const dayKeyOf = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * Les portes de la façade rangées par jour de dernier passage, le plus récent en
 * tête, et dans chaque jour de la plus récente à la plus ancienne. Les portes sans
 * date de passage (jamais visitées) ferment la liste dans un groupe à part.
 *
 * Une ligne par porte : c'est son **dernier** état, pas l'historique de ses passages.
 *
 * @param {Array<{doors: Array}>} floors - sortie de `buildFacadeFloors`
 * @returns {Array<{key: string, label: string, doors: Array}>}
 */
export function buildChronologie(floors = []) {
  const dated = []
  const undated = []
  for (const floor of floors) {
    for (const door of floor.doors || []) {
      const date = toDate(door.lastVisit)
      if (date) dated.push({ door, date })
      else undated.push(door)
    }
  }

  dated.sort((a, b) => b.date.getTime() - a.date.getTime())

  const groups = []
  for (const { door, date } of dated) {
    const key = dayKeyOf(date)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = { key, label: formatJourVisite(date), doors: [] }
      groups.push(group)
    }
    group.doors.push(door)
  }

  if (undated.length > 0) {
    groups.push({ key: 'sans-date', label: 'Sans date de passage', doors: undated })
  }
  return groups
}
