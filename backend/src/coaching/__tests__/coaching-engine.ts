import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Sources du moteur coaching (repo prowin-coaching), chargées par certaines suites.
 * Par défaut le repo voisin de prowin_V1/ (PRO_WIN/coaching/src) ; surchargeable
 * via COACHING_ENGINE_SRC (CI, autre poste).
 */
export const COACHING_ENGINE_SRC =
  process.env.COACHING_ENGINE_SRC ??
  // __tests__ → backend/ (3 niveaux), puis backend/ → PRO_WIN/ (4 niveaux).
  resolve(__dirname, '../../..', '../../../../coaching/src');

export const coachingEngineAvailable = existsSync(COACHING_ENGINE_SRC);

/**
 * `describe` si le moteur est présent, sinon `describe.skip` avec un message
 * explicite : sans le repo voisin (en CI), la suite est sautée au lieu d'échouer.
 * Les `require()` du moteur doivent donc rester dans les tests ou un `beforeAll`,
 * jamais au niveau du module ni dans le corps du `describe`.
 */
export function describeWithEngine(name: string, fn: () => void): void {
  if (coachingEngineAvailable) {
    describe(name, fn);
    return;
  }
  console.warn(
    `[coaching] Suite « ${name} » sautée : moteur coaching introuvable (${COACHING_ENGINE_SRC}). ` +
      'Définir COACHING_ENGINE_SRC pour la lancer.',
  );
  describe.skip(`${name} (moteur coaching absent)`, fn);
}
