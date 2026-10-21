/**
 * Un immeuble peut être partagé : `Commercial.immeubles` renvoie ceux dont la personne
 * est membre. Les stats personnelles ne doivent compter que les portes dont elle est
 * l'auteur du dernier passage (équivalent web de `isPorteFaitePar` du mobile).
 */

/**
 * Le dernier passage de la porte a-t-il été fait par `viewer` ?
 * @param {{dernierCommercialId?: number|null, dernierManagerId?: number|null}} porte
 * @param {{type: 'COMMERCIAL'|'MANAGER', id: number}} viewer
 * @returns {boolean}
 */
export function isPorteFaitePar(porte, viewer) {
  const acteurId = viewer.type === 'MANAGER' ? porte.dernierManagerId : porte.dernierCommercialId
  return acteurId != null && Number(acteurId) === Number(viewer.id)
}

/**
 * Ne garde que les portes faites par `viewer`. Sans `viewer`, la liste est inchangée.
 * @param {Array} portes
 * @param {{type: 'COMMERCIAL'|'MANAGER', id: number}|null|undefined} viewer
 * @returns {Array}
 */
export function portesFaitesPar(portes, viewer) {
  if (!viewer || viewer.id == null) return portes
  return portes.filter(porte => isPorteFaitePar(porte, viewer))
}
