import ManagerDetailView from './ManagerDetailView'

/**
 * Fiche détail d'un manager (espace ADMIN/DIRECTEUR).
 * Refonte : vue d'ensemble + onglets Bâtiments / Perf & prospection / Équipe / Terrain / Écoutes.
 * Logique dans `useManagerDetailsLogic` ; rendu dans `ManagerDetailView`.
 */
export default function ManagerDetails() {
  return <ManagerDetailView />
}
