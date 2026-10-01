/** Readiness is reference coverage, never a certificate that every claim is true. */
export function productComplianceMessage(analysis) {
  if (analysis.productAlerts?.length)
    return { warning: true, text: 'Points produit à clarifier — alertes informatives, sans malus.' }
  const status = analysis.productVerification?.status
  if (
    status === 'unavailable' &&
    analysis.productVerification.products?.length === 0 &&
    !analysis.detectedProducts?.length
  )
    return { warning: false, text: 'Aucune offre présentée — comparaison produit non requise.' }
  if (status === 'partial')
    return {
      warning: true,
      text: 'Aucun écart détecté — vérification partielle : grille de base ou variantes incomplètement vérifiées.',
    }
  if (status === 'unavailable')
    return {
      warning: true,
      text: 'Aucun écart détecté — comparaison produit indisponible ou non requise ; références insuffisantes.',
    }
  if (status === 'verified')
    return {
      warning: false,
      text: 'Aucun écart détecté dans le contexte vérifié — fiche et grille certifiée disponibles pour les produits identifiés.',
    }
  return { warning: false, text: 'Aucun écart détecté — vérification non renseignée.' }
}
