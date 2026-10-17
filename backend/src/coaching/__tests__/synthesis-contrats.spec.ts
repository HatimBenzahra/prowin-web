import { SnapshotBuilderService } from '../synthese-globale/snapshot-builder.service';
import { buildSynthesisSystemPrompt } from '../synthese-globale/synthesis-prompt';

const at = (day: string) => new Date(`${day}T12:00:00`);
const offre = (nom: string, points: number) => ({
  nom,
  categorie: 'Cat',
  badgeProductKey: null,
  points,
});

/**
 * Le bilan couvre la période coachée : comparer quelques jours de sessions à des mois
 * d'historique WinLead+ produisait « 1 116 ventes pour une valeur de 12 033 ».
 */
describe('synthèse — contrats de la période coachée', () => {
  const prisma = {
    commercial: {
      findUnique: jest.fn().mockResolvedValue({
        nom: 'Test',
        prenom: 'Ana',
        createdAt: at('2026-09-28'),
      }),
    },
    coachingAnalysis: {
      findMany: jest.fn().mockResolvedValue(
        ['2026-10-01', '2026-10-03'].map((day, i) => ({
          id: i + 1,
          score: 70,
          band: 'ok',
          statutPorte: 'REFUS',
          summary: null,
          strengths: [],
          improvements: [],
          criterionResults: [],
          violations: [],
          malus: 0,
          transcriptDurationSec: 60,
          porteId: null,
          userId: 1,
          s3KeyOriginal: '',
          createdAt: at(day),
          recording: { createdAt: at(day) },
        })),
      ),
    },
    statusHistorique: {
      findMany: jest.fn().mockResolvedValue([
        {
          porteId: 3,
          statut: 'CONTRAT_SIGNE',
          duree: 0,
          createdAt: at('2026-09-01'),
        },
        { porteId: 2, statut: 'REFUS', duree: 0, createdAt: at('2026-10-01') },
        {
          porteId: 1,
          statut: 'CONTRAT_SIGNE',
          duree: 0,
          createdAt: at('2026-10-02'),
        },
      ]),
    },
    contratValide: {
      findMany: jest.fn().mockResolvedValue([
        // Historique antérieur à ProWin : un client, trois offres.
        ...[1, 2, 3].map(() => ({
          externalProspectId: 1,
          periodDay: '2026-03-10',
          dateValidation: at('2026-03-10'),
          offre: offre('A', 50),
        })),
        // Période coachée : un client avec un pack de trois offres, un client sans offre résolue.
        {
          externalProspectId: 2,
          periodDay: '2026-10-02',
          dateValidation: at('2026-10-02'),
          offre: offre('A', 10),
        },
        {
          externalProspectId: 2,
          periodDay: '2026-10-02',
          dateValidation: at('2026-10-02'),
          offre: offre('B', 10),
        },
        {
          externalProspectId: 2,
          periodDay: '2026-10-02',
          dateValidation: at('2026-10-02'),
          offre: offre('C', 15),
        },
        {
          externalProspectId: 3,
          periodDay: '2026-10-02',
          dateValidation: at('2026-10-02'),
          offre: null,
        },
      ]),
    },
    zoneEnCours: { findFirst: jest.fn().mockResolvedValue(null) },
    quartier: { findMany: jest.fn().mockResolvedValue([]) },
    porte: { findMany: jest.fn().mockResolvedValue([]) },
  };

  let snapshot: Awaited<ReturnType<SnapshotBuilderService['buildSnapshot']>>;
  beforeAll(async () => {
    snapshot = await new SnapshotBuilderService(prisma as never).buildSnapshot(
      'commercial',
      1,
    );
  });

  it('ne compte que les contrats de la période des sessions', () => {
    expect(snapshot.contrats.periode).toEqual({
      debut: '2026-10-01',
      fin: '2026-10-03',
    });
    expect(snapshot.contrats.contratsValides).toBe(4);
  });

  it('compte une vente par client, pas par offre du pack', () => {
    expect(snapshot.contrats.ventesValidees).toBe(2);
  });

  it('exprime le mix en points gamification et signale les offres non résolues', () => {
    expect(snapshot.contrats.pointsTotal).toBe(35);
    expect(snapshot.contrats.pointsMoyenParVente).toBe(17.5);
    expect(snapshot.contrats.contratsSansOffre).toBe(1);
  });

  it('compare les signatures déclarées et les ventes de la même période', () => {
    expect(snapshot.contrats.signesDeclares).toBe(1);
    expect(snapshot.contrats.tauxValidation).toBe(2);
  });

  it('garde l’historique à part, en contexte', () => {
    expect(snapshot.contrats.historique).toEqual({
      depuis: '2026-03-10',
      ventesValidees: 3,
      contratsValides: 7,
    });
  });

  it('rapporte la moyenne par jour aux seuls jours de terrain ProWin', () => {
    expect(snapshot.activite.baselines.contratsParJourActif).toBe(1.3);
  });

  it('demande des ventes et des points, jamais une « valeur »', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('contrats.ventesValidees');
    expect(prompt).toContain('PAS des euros');
    expect(prompt).not.toMatch(/pour une valeur de/);
  });
});
