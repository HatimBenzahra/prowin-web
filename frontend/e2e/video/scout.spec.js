import { test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { SCOUT_FILE } from './tour-helpers.js'

/**
 * Repérage préalable — PAS filmé (projet `scout`, `video: 'off'`).
 *
 * Il choisit la cible du guide et l'écrit dans `.scout.json` : un commercial qui a
 * une synthèse coaching, et surtout le bâtiment contenant l'échange le PLUS LONG.
 *
 * Pourquoi c'est nécessaire : sur staging, l'immense majorité des audios durent 5 à
 * 48 secondes, et une porte tirée au hasard affiche « Échange trop court ou
 * inexploitable » — ni score, ni résumé, ni plan de vente. Le seul échange
 * réellement analysé peut se trouver au 10e bâtiment de la liste. Sonder à l'image
 * imposerait une dizaine d'ouvertures de modale dans la vidéo ; on le fait donc ici,
 * hors caméra, et le guide va droit au but.
 */

/** « Porte 503 — audio 16:21 » → 981 secondes. */
function durationOf(title) {
  const m = /audio\s+(\d+):(\d{2})/.exec(title || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

test('scout', async ({ page }) => {
  await page.goto('/commerciaux')
  await page.waitForLoadState('domcontentloaded')
  // On attend le CONTENU, pas un état réseau : les données arrivent en GraphQL après
  // le montage, et `networkidle` n'est jamais atteint sur une app qui interroge le
  // serveur en continu (c'est ce qui faisait échouer le repérage par intermittence).
  await page.locator('a[href^="/commerciaux/"]').first().waitFor({ timeout: 30_000 })

  const hrefs = []
  for (const a of await page.locator('a[href^="/commerciaux/"]').all()) {
    const h = await a.getAttribute('href')
    if (h) hrefs.push(h)
  }

  let best = null

  for (const href of hrefs) {
    await page.goto(href)
    await page.waitForLoadState('domcontentloaded')
    await page
      .getByRole('tab', { name: 'Bâtiments' })
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {})
    await page.waitForTimeout(1200)

    // Sans synthèse coaching, la fiche ne permet pas de raconter la liaison
    // porte → bilan global : on passe au sujet suivant.
    const hasCoaching = await page
      .getByRole('button', { name: /session.*analysée/i })
      .first()
      .isVisible()
      .catch(() => false)
    if (!hasCoaching) continue

    const rows = page.locator('table tbody tr')
    const count = await rows.count()

    for (let i = 0; i < count; i++) {
      await rows.nth(i).click()
      await page.waitForTimeout(900)
      const dialog = page.locator('[role="dialog"]').first()

      const address = (await dialog.locator('h2, [role="heading"]').first().textContent()) || ''
      const hasLongPill = await dialog
        .getByRole('button', { name: /> 3min/ })
        .first()
        .isVisible()
        .catch(() => false)

      for (const tile of await dialog.locator('button[title*="audio"]').all()) {
        const doorTitle = await tile.getAttribute('title')
        const secs = durationOf(doorTitle)
        if (!best || secs > best.seconds) {
          best = {
            href,
            rowIndex: i,
            address: address.trim(),
            doorTitle,
            seconds: secs,
            hasLongPill,
          }
        }
      }

      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    if (best && best.seconds >= 180) break // un échange > 3 min suffit : on arrête là
  }

  writeFileSync(SCOUT_FILE, JSON.stringify(best, null, 2))
  console.log(`scout → ${JSON.stringify(best)}`)
})
