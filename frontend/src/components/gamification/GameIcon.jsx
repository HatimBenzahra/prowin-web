/**
 * GameIcon — rend une icône de gamification (pack Game Icons, CC BY 3.0) en SVG inline.
 *
 * Les SVG sont monochromes (`fill="currentColor"`) : la couleur est donnée par la
 * couleur de texte de l'élément parent (classe Tailwind `text-*`), via `currentColor`.
 * Source de vérité du mapping clé → fichier : `src/assets/gamification-icons/manifest.json`.
 */

// Import inline (chaîne SVG brute) — natif Vite, aucune dépendance.
const BADGE_RAW = import.meta.glob('../../assets/gamification-icons/badges/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const TIER_RAW = import.meta.glob('../../assets/gamification-icons/tiers/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const toKeyMap = glob => {
  const map = {}
  for (const path in glob) {
    const key = path.split('/').pop().replace('.svg', '')
    map[key] = glob[path]
  }
  return map
}

const BADGE_ICONS = toKeyMap(BADGE_RAW)
const TIER_ICONS = toKeyMap(TIER_RAW)

/**
 * @param {object} props
 * @param {string} props.name       Clé de l'icône (ex. 'trophy', 'rocket', 'gold').
 * @param {'badges'|'tiers'} [props.group]  Registre à utiliser (défaut 'badges').
 * @param {number} [props.size]      Taille en px (défaut 24).
 * @param {string} [props.className] Classes du wrapper — mettre ici la couleur `text-*`.
 * @param {string} [props.title]     Libellé accessible (sinon décoratif).
 */
function GameIcon({ name, group = 'badges', size = 24, className = '', title }) {
  const raw = (group === 'tiers' ? TIER_ICONS : BADGE_ICONS)[name]
  if (!raw) return null

  // L'icône Iconify sort en `width="1em" height="1em"` → on la fait remplir le wrapper.
  const html = raw.replace('width="1em" height="1em"', 'width="100%" height="100%"')

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, lineHeight: 0 }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default GameIcon
