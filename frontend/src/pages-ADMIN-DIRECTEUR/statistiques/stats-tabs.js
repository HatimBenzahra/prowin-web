/**
 * Onglets de la page Statistiques et données dont chacun a besoin.
 *
 * Les deux vivent ensemble volontairement : les requêtes des onglets fermés ne
 * partent pas (`enabled` de `useApiCall`), donc déclarer un onglet sans déclarer ses
 * besoins l'afficherait vide, sans erreur ni chargement. Le test qui accompagne ce
 * fichier interdit cet oubli.
 */

/** Un onglet = une question. L'ordre est celui de la barre d'onglets. */
export const TABS = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'activite', label: 'Activité' },
  { value: 'contrats', label: 'Contrats' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'equipe', label: 'Équipe' },
  { value: 'territoire', label: 'Territoire' },
]

/** Onglet ouvert au chargement de la page. */
export const DEFAULT_TAB = 'pipeline'

/**
 * Requêtes propres à chaque onglet, par leur nom court côté `useStatistiquesLogic`.
 *
 * N'y figurent pas les données du bandeau permanent (`statsPeriodComparison`,
 * `contratsValidesAggregate`) : elles alimentent la rangée de KPI, affichée quel que
 * soit l'onglet, et sont donc toujours chargées.
 */
export const TAB_QUERIES = {
  pipeline: ['pipeline'],
  activite: ['timeline', 'effort'],
  contrats: ['timeline'],
  coaching: ['ownerActivity', 'scoreboard'],
  equipe: ['ownerActivity', 'scoreboard'],
  territoire: ['zoneStats'],
}

/** Toutes les requêtes différables, tous onglets confondus. */
export const DEFERRABLE_QUERIES = [
  'pipeline',
  'timeline',
  'effort',
  'ownerActivity',
  'zoneStats',
  'scoreboard',
]
