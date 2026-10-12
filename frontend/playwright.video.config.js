import { defineConfig, devices } from '@playwright/test'

/**
 * Configuration dédiée à l'enregistrement de captures vidéo de parcours.
 *
 * Distincte de `playwright.config.js` pour trois raisons :
 * - elle pointe sur **staging** et non sur le serveur de dev local, donc aucun
 *   `webServer` à démarrer et aucune base de données requise ;
 * - `video: 'on'` avec une taille fixe, pour un rendu constant ;
 * - un seul worker et aucun retry : une prise doit être linéaire et reproductible.
 *
 * Les identifiants viennent de `e2e/.env.test`, chargé par `--env-file` :
 *   node --env-file=e2e/.env.test node_modules/.bin/playwright test --config=playwright.video.config.js
 */
const VIEWPORT = { width: 1600, height: 900 }

export default defineConfig({
  testDir: './e2e/video',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Une prise explicative dépasse largement les 30 s d'un test : le guide complet
  // fait plusieurs minutes, légendes comprises.
  timeout: 600_000,

  use: {
    // La prise se fait FENÊTRE OUVERTE, sur le vrai GPU. Mapbox GL exige WebGL, et le
    // Chromium headless n'en fournit aucun (sonde : contexte `webgl` à `null`, d'où un
    // cadre vide à la place de la carte). Le WebGL logiciel de SwiftShader ne suffit
    // pas non plus : les tuiles arrivent bien en 200 mais `onLoad` ne se déclenche
    // jamais et la carte reste sur « Chargement de la carte… » (mesuré : 1 carte
    // bloquée en logiciel, 0 sur le vrai GPU).
    //
    // `VIDEO_HEADLESS=1` rebascule en headless avec WebGL logiciel, pour un
    // enregistrement sans écran — en acceptant que les cartes n'y figurent pas.
    headless: Boolean(process.env.VIDEO_HEADLESS),
    launchOptions: process.env.VIDEO_HEADLESS
      ? {
          args: [
            '--enable-unsafe-swiftshader',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--ignore-gpu-blocklist',
          ],
        }
      : {},
    baseURL: process.env.VIDEO_BASE_URL ?? 'https://staging.pro-win.app',
    ignoreHTTPSErrors: true,
    viewport: VIEWPORT,
    video: { mode: 'on', size: VIEWPORT },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'auth-setup',
      testDir: './e2e',
      testMatch: /auth\.setup\.js/,
    },
    {
      // Repérage de la cible du guide, volontairement NON filmé : sonder les
      // bâtiments à l'image imposerait une dizaine d'ouvertures de modale dans la
      // vidéo. Voir scout.spec.js.
      name: 'scout',
      testMatch: /scout\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        storageState: 'e2e/.auth/admin.json',
        video: 'off',
      },
      dependencies: ['auth-setup'],
    },
    {
      name: 'tour',
      testIgnore: /scout\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['scout'],
    },
  ],
})
