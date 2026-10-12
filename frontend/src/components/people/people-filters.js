/**
 * Filtrage de la vue Grille des pages personnes.
 *
 * La vue tableau applique ses propres filtres en interne (`customStatusFilter`,
 * `searchKey`). La vue Grille a donc besoin des mêmes règles, écrites une seule fois
 * pour les trois pages.
 */

/**
 * @param {Array} people - Lignes déjà mappées (nom, prenom, status)
 * @param {{ search?: string, status?: string }} filters - `status: 'all'` ne filtre pas
 */
export function filterPeople(people, { search = '', status = 'all' } = {}) {
  let result = people || []

  if (status && status !== 'all') {
    result = result.filter(person => person.status === status)
  }

  const needle = search.trim().toLowerCase()
  if (needle) {
    result = result.filter(person =>
      `${person.prenom || ''} ${person.nom || ''}`.toLowerCase().includes(needle)
    )
  }

  return result
}
