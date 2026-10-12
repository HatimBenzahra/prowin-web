import CommercialDetailView from './CommercialDetailView'

/**
 * Fiche détail d'un commercial (espace ADMIN/DIRECTEUR).
 * Refonte : vue d'ensemble (4 chiffres clés) + onglets Performance / Terrain / Coaching.
 * Toute la logique vit dans `useCommercialDetailsLogic` ; le rendu dans `CommercialDetailView`.
 */
export default function CommercialDetails() {
  return <CommercialDetailView />
}
