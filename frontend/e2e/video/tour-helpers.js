/**
 * Aides à la lisibilité des prises vidéo.
 *
 * Trois besoins que Playwright ne couvre pas :
 * - il enregistre une vidéo **muette**, d'où les légendes incrustées ;
 * - il ne dessine **pas le curseur**, d'où le halo posé sur la cible avant un clic,
 *   sans quoi les clics seraient invisibles à l'écran ;
 * - il ne produit aucun repère temporel, d'où le journal `.chapters.json` qui note
 *   l'instant de chaque chapitre — c'est lui qui permet, après coup, d'écrire les
 *   chapitres du mp4 sans avoir à retrouver les transitions à l'œil.
 *
 * La vidéo reste volontairement SANS VOIX OFF : les légendes portent le propos.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const CAPTION_ID = '__tour_caption__'

const HERE = new URL('.', import.meta.url).pathname
/** Journal des chapitres de la prise. Consommé par build-video.mjs. */
export const CHAPTERS_LOG = `${HERE}.chapters.json`

const state = { t0: null, chapters: [] }

/** Démarre l'horloge de la prise. À appeler en TOUT PREMIER dans le test. */
export function startTimeline() {
  state.t0 = Date.now()
  state.chapters = []
  mkdirSync(HERE, { recursive: true })
  flush()
}

const elapsed = () => (state.t0 == null ? 0 : Date.now() - state.t0)

function flush() {
  writeFileSync(CHAPTERS_LOG, JSON.stringify({ chapters: state.chapters }, null, 2))
}

/** Marque le début d'un chapitre à l'instant courant. */
export function chapter(title) {
  state.chapters.push({ title, atMs: elapsed() })
  flush()
}

/**
 * Attend que les cartes visibles soient dessinées.
 *
 * Piège à éviter : tester « aucun indicateur de chargement » juste après un clic
 * renvoie VRAI avant même que la carte ne soit montée. On attend donc d'abord le
 * canvas Mapbox, puis la disparition de l'indicateur.
 */
export async function waitForMaps(page, timeoutMs = 30_000) {
  const started = Date.now()
  await page
    .locator('canvas.mapboxgl-canvas')
    .first()
    .waitFor({ timeout: timeoutMs })
    .catch(() => {})

  while (Date.now() - started < timeoutMs) {
    const busy = await page.evaluate(() =>
      [...document.querySelectorAll('*')].some(
        e =>
          e.children.length === 0 &&
          e.textContent?.includes('Chargement de la carte') &&
          e.offsetParent
      )
    )
    if (!busy) return true
    await page.waitForTimeout(400)
  }
  return false
}

/**
 * Visibilité d'une cible, avec ALERTE si elle manque.
 *
 * Un `if (await x.isVisible())` nu autour d'une explication la fait disparaître en
 * silence : c'est ainsi que tout le passage sur le Favori s'est volatilisé d'une prise
 * sans que rien ne le signale. Ici, une cible absente laisse une trace dans la sortie
 * du run, et le défaut se voit sans avoir à échantillonner des images.
 */
export async function seen(locator, label) {
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) console.warn(`[guide] ABSENT — passage ignoré : ${label}`)
  return visible
}

/** Affiche une légende en bas de l'écran pendant `ms`. */
export async function caption(page, text, ms = 3200) {
  await page.evaluate(
    ({ id, text }) => {
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('div')
        el.id = id
        Object.assign(el.style, {
          position: 'fixed',
          left: '50%',
          bottom: '48px',
          transform: 'translateX(-50%)',
          maxWidth: '70%',
          padding: '14px 22px',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.94)',
          color: '#fff',
          font: '500 16px/1.5 Inter, system-ui, sans-serif',
          textAlign: 'center',
          zIndex: '2147483647',
          boxShadow: '0 10px 30px rgba(0,0,0,.35)',
          opacity: '0',
          transition: 'opacity .35s ease',
          pointerEvents: 'none',
        })
        document.body.appendChild(el)
      }
      el.textContent = text
      requestAnimationFrame(() => {
        el.style.opacity = '1'
      })
    },
    { id: CAPTION_ID, text }
  )
  await page.waitForTimeout(ms)
}

export async function clearCaption(page) {
  await page.evaluate(id => {
    const el = document.getElementById(id)
    if (el) el.style.opacity = '0'
  }, CAPTION_ID)
  await page.waitForTimeout(400)
}

/** Entoure la cible d'un halo, puis le retire — rend le clic visible. */
export async function highlight(page, locator, ms = 900) {
  const box = await locator.boundingBox()
  if (!box) return
  await page.evaluate(box => {
    const ring = document.createElement('div')
    Object.assign(ring.style, {
      position: 'fixed',
      left: `${box.x - 6}px`,
      top: `${box.y - 6}px`,
      width: `${box.width + 12}px`,
      height: `${box.height + 12}px`,
      border: '3px solid #6366f1',
      borderRadius: '12px',
      boxShadow: '0 0 0 6px rgba(99,102,241,.22)',
      zIndex: '2147483646',
      pointerEvents: 'none',
      transition: 'opacity .3s ease',
    })
    document.body.appendChild(ring)
    setTimeout(() => {
      ring.style.opacity = '0'
      setTimeout(() => ring.remove(), 350)
    }, 800)
  }, box)
  await page.waitForTimeout(ms)
}

/**
 * Cible choisie hors caméra par `scout.spec.js` et consommée par `guide.spec.js`.
 * Chemin absolu : les specs ne partagent pas forcément le même cwd.
 */
export const SCOUT_FILE = `${HERE}.scout.json`

/** Lit la cible du repérage, ou `null` si le scout n'a pas tourné. */
export function readScout() {
  try {
    return JSON.parse(readFileSync(SCOUT_FILE, 'utf8'))
  } catch {
    return null
  }
}
