import guideVideo from '@/assets/guide/guide-prowin.mp4'
import guidePoster from '@/assets/guide/guide-poster.jpg'
import guideManifest from '@/assets/guide/guide-chapters.json'

/**
 * Assets et helpers du guide vidéo.
 *
 * Les trois fichiers passent par le bundler, comme `@/assets/logo.svg` et
 * `@/assets/gamification-icons/manifest.json` déjà en place : la vidéo et la vignette
 * ressortent en URL horodatée dans `dist/assets`, le sommaire est inliné à la
 * compilation.
 *
 * Ils étaient d'abord dans `public/`, servi HORS pipeline de build — un chemin qui ne
 * se comporte pas comme les autres assets, et sur lequel le serveur renvoyait 403 sur
 * les fichiers nouvellement synchronisés. Passer par `src/assets` supprime ce cas
 * particulier, et supprime du même coup les requêtes réseau qu'il imposait : le
 * sommaire est désormais une valeur, disponible dès le premier rendu.
 *
 * Les trois sont produits ensemble par `e2e/video/build-video.mjs --publish`, donc
 * toujours en accord — un sommaire recopié à la main finirait par mentir sur les
 * instants.
 */

export const GUIDE_VIDEO = guideVideo
export const GUIDE_POSTER = guidePoster

/** `[{ title, atSec }]`, du début à la fin. */
export const GUIDE_CHAPTERS = guideManifest.chapters ?? []
export const GUIDE_DURATION_SEC = guideManifest.durationSec ?? 0

/** `495.4` → `"8 min 15"`. Durée annoncée, pas un chronomètre. */
export function formatGuideDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return ''
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (!minutes) return `${seconds} s`
  return seconds ? `${minutes} min ${String(seconds).padStart(2, '0')}` : `${minutes} min`
}

/** `83` → `"1:23"`, pour la liste des chapitres. */
export function formatChapterStart(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Instant du premier chapitre dont le titre correspond, ou `0`.
 *
 * Recherche par TITRE et non par indice : les chapitres trop courts sont absorbés au
 * montage, donc leur position varie d'une prise à l'autre. Sert aux liens profonds
 * (« Comment ça marche ? » sur la synthèse coaching ouvre le chapitre coaching).
 */
export function findChapterStart(chapters, pattern) {
  const match = (chapters || []).find(chapter => pattern.test(chapter.title ?? ''))
  return match ? match.atSec : 0
}
