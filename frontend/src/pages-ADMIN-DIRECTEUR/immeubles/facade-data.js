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
      lastVisit: porte.updatedAt || porte.derniereVisite || null,
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
