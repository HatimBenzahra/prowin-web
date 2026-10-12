/**
 * Montage final : prend l'enregistrement de Playwright + le journal de chapitres
 * (`.chapters.json`) et produit le mp4 diffusable.
 *
 *   node e2e/video/build-video.mjs [chemin/video.webm] [--publish]
 *
 * Sans argument, prend le dernier `video.webm` du projet `tour`.
 *
 * `--publish` livre EN PLUS les trois fichiers que l'application consomme, dans
 * `src/assets/guide/` : la vidéo allégée (1280×720), sa vignette et le sommaire.
 * Ils passent donc par le bundler comme tout autre asset — et NON par `public/`, servi
 * hors pipeline, où le serveur refusait les fichiers fraîchement synchronisés.
 * Les trois sortent de la même prise, donc restent forcément en accord — un sommaire
 * recopié à la main finirait par mentir sur les instants.
 *
 * La vidéo est SANS SON, volontairement : les légendes incrustées portent le propos.
 * `-an` est donc explicite, pour qu'une piste vide ne se glisse pas dans le fichier.
 *
 * Les chapitres sont écrits en métadonnées mp4 dans une seconde passe en `-c copy` :
 * inutile de réencoder l'image pour ajouter des repères.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const LOG = `${HERE}.chapters.json`
const OUT_DIR = `${HERE}out`
const OUT = `${OUT_DIR}/guide-prowin.mp4`
const OUT_CHAPTERS = `${OUT_DIR}/guide-chapters.json`
const ASSETS_DIR = `${HERE}../../src/assets/guide`
const PUBLISH = process.argv.includes('--publish')

const ff = (args, opts = {}) =>
  execFileSync('ffmpeg', ['-y', ...args], { stdio: 'ignore', ...opts })
const probe = (file, entries) =>
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', file])
    .toString()
    .trim()

/**
 * Dernier video.webm du projet `tour`, du plus récent au plus ancien.
 *
 * Le filtre sur le suffixe `-tour` n'est PAS cosmétique : Playwright enregistre aussi
 * une vidéo pour `auth-setup` et `scout`. Sans lui, une prise ratée laissait la vidéo
 * d'authentification (3 s) comme « plus récente », et le montage écrasait le mp4
 * valide par 3 secondes de rien.
 */
function findLatestRecording() {
  const root = join(HERE, '..', '..', 'test-results')
  if (!existsSync(root)) return null
  const found = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (name === 'video.webm' && /-tour$/.test(basename(dir)))
        found.push({ p, mtime: st.mtimeMs })
    }
  }
  walk(root)
  return found.sort((a, b) => b.mtime - a.mtime)[0]?.p ?? null
}

const cliSource = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const source = cliSource ?? findLatestRecording()
if (!source || !existsSync(source)) {
  console.error('Aucun enregistrement trouvé. Lance la prise, ou passe le chemin du video.webm.')
  process.exit(1)
}

const chapters = existsSync(LOG) ? (JSON.parse(readFileSync(LOG, 'utf8')).chapters ?? []) : []
const videoMs = Math.round(Number(probe(source, 'format=duration')) * 1000)
console.log(`source   : ${source}`)
console.log(`vidéo    : ${(videoMs / 1000).toFixed(1)}s`)

// Le guide complet dure plusieurs minutes. Une source plus courte signale une prise
// interrompue : on s'arrête AVANT d'écrire, pour ne pas remplacer un mp4 valide par
// un fragment. Passer le chemin en argument permet de forcer un cas particulier.
const MIN_SOURCE_MS = 120_000
if (videoMs < MIN_SOURCE_MS && !cliSource) {
  console.error(
    `Prise trop courte (${(videoMs / 1000).toFixed(1)}s < ${MIN_SOURCE_MS / 1000}s) : ` +
      `enregistrement probablement interrompu. Sortie inchangée.`
  )
  process.exit(1)
}

// ── Réencodage en h264, sans piste audio ───────────────────────────────────────
const muxed = `${OUT_DIR}/.silent.mp4`
ff([
  '-i',
  source,
  '-an',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  muxed,
])

// ── Chapitres, en copie ────────────────────────────────────────────────────────
/**
 * Un chapitre de quelques secondes n'est pas une cible de navigation : il encombre
 * le sélecteur sans servir. On absorbe donc les tronçons trop courts dans le
 * précédent (le premier, s'il est court, cède sa place au suivant).
 */
const MIN_CHAPTER_MS = 20_000
const kept = []
chapters.forEach((c, i) => {
  const end = i + 1 < chapters.length ? chapters[i + 1].atMs : videoMs
  if (end - c.atMs >= MIN_CHAPTER_MS) kept.push(c)
  else if (kept.length === 0 && chapters[i + 1]) chapters[i + 1].atMs = c.atMs
  else console.log(`  chapitre absorbé (${((end - c.atMs) / 1000).toFixed(0)}s) : ${c.title}`)
})

if (kept.length) {
  const meta = `${OUT_DIR}/.chapters.txt`
  const lines = [';FFMETADATA1']
  kept.forEach((c, i) => {
    const end = i + 1 < kept.length ? kept[i + 1].atMs : videoMs
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${c.atMs}`,
      `END=${Math.max(c.atMs + 1, end)}`,
      `title=${c.title}`
    )
  })
  writeFileSync(meta, `${lines.join('\n')}\n`)
  ff(['-i', muxed, '-i', meta, '-map_metadata', '1', '-c', 'copy', OUT])
  unlinkSync(meta)
  console.log(`chapitres: ${kept.length}`)
} else {
  ff(['-i', muxed, '-c', 'copy', OUT])
  console.warn('chapitres: aucun (le spec a-t-il appelé chapter() ?)')
}
unlinkSync(muxed)

// ── Sommaire : ce que l'application lira ───────────────────────────────────────
const chapterData = {
  durationSec: Number((videoMs / 1000).toFixed(1)),
  chapters: kept.map(c => ({ title: c.title, atSec: Number((c.atMs / 1000).toFixed(1)) })),
}
writeFileSync(OUT_CHAPTERS, `${JSON.stringify(chapterData, null, 2)}\n`)

if (PUBLISH) {
  // Version allégée pour le web : 720p et compression plus forte. Le fichier est
  // commité et entre dans l'image Docker, donc chaque mégaoctet compte — les légendes
  // incrustées restent lisibles à cette taille.
  const webMp4 = `${ASSETS_DIR}/guide-prowin.mp4`
  ff([
    '-i',
    OUT,
    '-an',
    '-vf',
    'scale=1280:-2',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    webMp4,
  ])
  // Vignette prise APRÈS le début : la première image est une page encore vide.
  ff([
    '-ss',
    '12',
    '-i',
    OUT,
    '-frames:v',
    '1',
    '-vf',
    'scale=960:-2',
    `${ASSETS_DIR}/guide-poster.jpg`,
  ])
  writeFileSync(`${ASSETS_DIR}/guide-chapters.json`, `${JSON.stringify(chapterData, null, 2)}\n`)
  console.log(
    `publié   : src/assets/guide/guide-prowin.mp4 (${(statSync(webMp4).size / 1e6).toFixed(1)} Mo)` +
      `, guide-poster.jpg, guide-chapters.json`
  )
}

const streams = probe(OUT, 'stream=codec_type').split('\n')
console.log(
  `\n→ ${OUT}\n  ${Number(probe(OUT, 'format=duration')).toFixed(1)}s · ` +
    `${(statSync(OUT).size / 1e6).toFixed(1)} Mo · ` +
    `piste audio : ${streams.includes('audio') ? 'OUI (inattendu)' : 'aucune'}`
)
