import { AxiosError, AxiosHeaders } from 'axios';
import { SESSIONS_BUDGET_CHARS, fitSessions } from '../synthese-globale/snapshot-builder.service';
import { describeFailure } from '../synthese-globale/synthesis.service';

/** Une session réaliste : ~5 000 caractères avec ses critères, comme en prod. */
const session = (i: number) => ({
  date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
  score: 70,
  resume: `Résumé ${i}`,
  forces: ['Bonne accroche'],
  axes: ['Conclure'],
  criteres: Array.from({ length: 30 }, (_, c) => ({ titre: `Critère ${c}`, verdict: 'atteint', commentaire: 'x'.repeat(120), preuves: ['citation'] })),
});

describe('budget de la synthèse', () => {
  it('garde tout le détail quand il tient dans le budget', () => {
    const sessions = [session(1), session(2)];
    expect(fitSessions(sessions)).toEqual(sessions);
  });

  it('détaille les plus récentes et résume les autres, sous le budget', () => {
    const result = fitSessions(Array.from({ length: 58 }, (_, i) => session(i)));
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(SESSIONS_BUDGET_CHARS);
    expect(result).toHaveLength(58);
    expect(result[0].criteres).toBeDefined();
    expect(result[57]).toEqual({ date: expect.any(String), score: 70, resume: 'Résumé 57' });
  });

  it('retire les plus anciennes si même les résumés débordent', () => {
    const result = fitSessions(Array.from({ length: 80 }, (_, i) => session(i)), 2_000);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(2_000);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(s => !('criteres' in s))).toBe(true);
    expect(result[0].resume).toBe('Résumé 0');
  });

  it("affiche une cause lisible quand le modèle refuse la demande", () => {
    const refused = new AxiosError('Request failed with status code 400', '400', undefined, undefined, { status: 400, statusText: 'Bad Request', headers: {}, config: { headers: new AxiosHeaders() }, data: {} });
    expect(describeFailure(refused)).toBe('Le modèle a refusé la demande (contenu trop volumineux ou invalide).');
    expect(describeFailure(new Error('autre'))).toBe('autre');
  });
});
