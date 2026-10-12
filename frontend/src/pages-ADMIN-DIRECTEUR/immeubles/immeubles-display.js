/**
 * Présentation partagée entre la vue tableau et la vue cards de la page Bâtiments.
 * Extraire ces règles garantit qu'un même bâtiment n'apparaisse jamais dans deux
 * couleurs selon la vue.
 */

/**
 * Couleur de la barre de couverture, aux seuils historiques de la page.
 * @param {number} couverture - Pourcentage de portes prospectées
 * @returns {string} Classe de fond Tailwind
 */
export function couvertureBarClass(couverture) {
  if (couverture >= 80) return 'bg-emerald-500'
  if (couverture >= 40) return 'bg-blue-500'
  if (couverture > 0) return 'bg-amber-500'
  return 'bg-muted'
}

/**
 * Options de tri de la vue cards (le tableau a son tri par colonne).
 * `date` est en tête et par défaut : il laisse l'ordre chronologique déjà produit en
 * amont, au lieu de l'écraser. Les autres modes ordonnent à l'intérieur d'une journée.
 */
export const CARD_SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'couverture_desc', label: 'Couverture décroissante' },
  { value: 'couverture_asc', label: 'Couverture croissante' },
  { value: 'contrats_desc', label: 'Contrats signés' },
  { value: 'portes_desc', label: 'Nombre de portes' },
  { value: 'address_asc', label: 'Adresse (A→Z)' },
]

/**
 * Trie une liste de bâtiments déjà mappés pour la vue cards.
 *
 * Le mode `date` — et tout mode inconnu — renvoie la liste telle quelle : elle arrive
 * déjà ordonnée par le champ de date actif. Un ordre d'entrée signifiant vaut mieux
 * qu'un tri surprise.
 * @param {Array} rows
 * @param {string} mode - Une des valeurs de CARD_SORT_OPTIONS
 */
export function sortCardRows(rows, mode) {
  const sorted = [...(rows || [])]
  switch (mode) {
    case 'couverture_desc':
      return sorted.sort((a, b) => b.couverture - a.couverture)
    case 'couverture_asc':
      return sorted.sort((a, b) => a.couverture - b.couverture)
    case 'contrats_desc':
      return sorted.sort((a, b) => b.contrats_signes - a.contrats_signes)
    case 'portes_desc':
      return sorted.sort((a, b) => b.total_doors - a.total_doors)
    case 'address_asc':
      return sorted.sort((a, b) => (a.address || '').localeCompare(b.address || '', 'fr'))
    case 'date':
    default:
      return sorted
  }
}

/** Clé de jour en composantes locales, pour ne pas décaler d'un fuseau. */
function localDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Libellé d'une journée : « Aujourd'hui », « Hier », sinon la date en clair, avec
 * l'année seulement si elle diffère de l'année en cours.
 */
export function dayGroupLabel(date, now = new Date()) {
  if (localDayKey(date) === localDayKey(now)) return "Aujourd'hui"

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (localDayKey(date) === localDayKey(yesterday)) return 'Hier'

  const options = { weekday: 'long', day: 'numeric', month: 'long' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  const label = date.toLocaleDateString('fr-FR', options)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Regroupe les bâtiments par journée sur le champ de date actif.
 *
 * L'ordre des groupes suit l'ordre d'apparition des lignes, donc la direction du tri
 * amont : « récemment » donne les journées les plus récentes d'abord, « anciennement »
 * l'inverse, sans paramètre supplémentaire.
 * @param {Array} rows
 * @param {string} dateField - 'createdAt' ou 'updatedAt'
 * @param {Date} [now]
 */
export function groupRowsByDate(rows, dateField, now = new Date()) {
  const groups = new Map()

  for (const row of rows || []) {
    const raw = row?.[dateField]
    const date = raw ? new Date(raw) : null
    const valid = date && !Number.isNaN(date.getTime())
    const key = valid ? localDayKey(date) : 'sans-date'

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: valid ? dayGroupLabel(date, now) : 'Date inconnue',
        data: [],
      })
    }
    groups.get(key).data.push(row)
  }

  return Array.from(groups.values())
}

/**
 * Taille d'un lot de cards. Multiple de 2, 3 et 4 pour que les rangées restent
 * complètes quelle que soit la largeur de la grille.
 */
export const CARD_PAGE_SIZE = 24

/**
 * Découpe une liste en lots cumulés : `batches` lots visibles, le reste masqué.
 * Le tri est appliqué en amont, donc le premier lot est toujours le plus pertinent
 * selon le tri choisi — c'est ce qui rend ce découpage acceptable.
 * @param {Array} rows
 * @param {number} batches - Nombre de lots à afficher (>= 1)
 */
export function paginateRows(rows, batches) {
  const all = rows || []
  const limit = CARD_PAGE_SIZE * Math.max(1, batches)
  return {
    visible: all.slice(0, limit),
    hasMore: all.length > limit,
    total: all.length,
  }
}

/** Filtre sur l'adresse, insensible à la casse et aux espaces de bord. */
export function filterByAddress(rows, term) {
  const needle = (term || '').trim().toLowerCase()
  if (!needle) return rows || []
  return (rows || []).filter(row => (row.address || '').toLowerCase().includes(needle))
}
