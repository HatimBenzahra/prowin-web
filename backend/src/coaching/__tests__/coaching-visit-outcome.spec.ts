import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoachingService } from '../coaching.service';
import { CoachingQueryService } from '../lecture/coaching-query.service';

/** Correction du résultat de visite : périmètre, validation, traçabilité. */
describe('updateCoachingVisitOutcome', () => {
  function fixture(analysis: any = {}) {
    const row: any = {
      id: 9, source: 'prowin', tenantId: '', status: 'READY', userId: 3, managerId: null, visitResult: 'REFUS_CLIENT', nonSaleReason: 'PRIX',
      productStatuses: [
        { key: 'purea', label: 'Purificateur', status: 'REFUSE', opportunity: null, naReason: null, naDetail: null, evidence: [] },
        { key: 'mondial-tv', label: 'Mondial TV', status: 'NON_PRESENTE', opportunity: 'oubliee', naReason: null, naDetail: null, evidence: [] },
      ],
      ...analysis,
    };
    const prisma: any = {
      coachingAnalysis: { findUnique: jest.fn(async () => row), update: jest.fn(async ({ data }: any) => Object.assign(row, data)) },
      commercial: { findUnique: jest.fn(async () => ({ managerId: 20, directeurId: 30 })) },
      manager: { findUnique: jest.fn(async () => ({ id: 20, directeurId: 30 })) },
    };
    const service = new CoachingService(prisma, {} as any, {} as any, { getAnalysis: async () => row } as any, {} as any, {} as any);
    return { service, prisma, row };
  }

  it.each([
    ['admin', 1],
    ['directeur', 30],
    // Limite connue : le directeur n'est pas restreint à son équipe (comme le comparatif).
    ['directeur', 31],
    ['manager', 20],
  ])('%s #%s corrige et la correction est tracée', async (role, id) => {
    const f = fixture();
    await f.service.updateVisitOutcome(9, { visitResult: 'A_RELANCER', nonSaleReason: null }, { id, role, email: `${role}@prowin.fr` });
    expect(f.row).toMatchObject({ visitResult: 'A_RELANCER', nonSaleReason: null, outcomeOverriddenBy: `${role}@prowin.fr` });
    expect(f.row.outcomeOverriddenAt).toBeInstanceOf(Date);
  });

  it.each([
    ['manager', 21],
    ['commercial', 3],
  ])('%s hors périmètre est refusé', async (role, id) => {
    const f = fixture();
    await expect(f.service.updateVisitOutcome(9, { visitResult: 'VENTE' }, { id, role })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.coachingAnalysis.update).not.toHaveBeenCalled();
  });

  it('un manager ne corrige jamais ses propres ventes ; son directeur le peut', async () => {
    const f = fixture({ userId: null, managerId: 20 });
    await expect(f.service.updateVisitOutcome(9, { nextAction: 'RAPPEL' }, { id: 20, role: 'manager' })).rejects.toBeInstanceOf(ForbiddenException);
    await f.service.updateVisitOutcome(9, { ribStatus: 'NON' }, { id: 30, role: 'directeur' });
    expect(f.row.nextAction).toBeUndefined();
    expect(f.row).toMatchObject({ ribStatus: 'NON', outcomeOverriddenBy: 'directeur#30' });
  });

  it('refuse la correction d’une analyse non terminée', async () => {
    const f = fixture({ status: 'ANALYZING' });
    await expect(f.service.updateVisitOutcome(9, { nextAction: 'RAPPEL' }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.coachingAnalysis.update).not.toHaveBeenCalled();
  });

  it('une vente suppose au moins un produit accepté, après application de la correction', async () => {
    const f = fixture();
    await expect(f.service.updateVisitOutcome(9, { visitResult: 'VENTE' }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(f.service.updateVisitOutcome(9, { visitResult: 'VENTE_MULTI_PRODUITS' }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    await f.service.updateVisitOutcome(9, { visitResult: 'VENTE', productStatuses: [{ key: 'purea', status: 'ACCEPTE' }] }, { id: 1, role: 'admin' });
    expect(f.row).toMatchObject({ visitResult: 'VENTE' });
    expect(f.row.productStatuses[0].status).toBe('ACCEPTE');
    // Retirer le seul produit accepté d'une vente est refusé aussi.
    await expect(f.service.updateVisitOutcome(9, { productStatuses: [{ key: 'purea', status: 'REFUSE' }] }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une valeur hors contrat et une analyse d’une autre app', async () => {
    await expect(fixture().service.updateVisitOutcome(9, { visitResult: 'GAGNE' }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(fixture({ source: 'v2' }).service.updateVisitOutcome(9, {}, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('corrige un statut produit ; un produit proposé n’est plus une opportunité oubliée', async () => {
    const f = fixture();
    await f.service.updateVisitOutcome(9, { productStatuses: [{ key: 'mondial-tv', status: 'ACCEPTE' }] }, { id: 1, role: 'admin' });
    expect(f.row.productStatuses[1]).toMatchObject({ key: 'mondial-tv', status: 'ACCEPTE', opportunity: null });
    expect(f.row.productStatuses[0]).toMatchObject({ key: 'purea', status: 'REFUSE' });
    await expect(f.service.updateVisitOutcome(9, { productStatuses: [{ key: 'inconnu', status: 'ACCEPTE' }] }, { id: 1, role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('coachingProductStats', () => {
  const ps = (key: string, status: string, opportunity: string | null = null) => ({ key, label: key.toUpperCase(), status, opportunity, naReason: null, naDetail: null, evidence: [] });
  const rows = [
    { id: 1, userId: 3, managerId: null, visitResult: 'VENTE_MULTI_PRODUITS', nonSaleReason: null, productStatuses: [ps('purea', 'ACCEPTE'), ps('tv', 'ACCEPTE')] },
    { id: 2, userId: 3, managerId: null, visitResult: 'REFUS_CLIENT', nonSaleReason: 'PRIX', productStatuses: [ps('purea', 'REFUSE'), ps('tv', 'NON_PRESENTE', 'oubliee')] },
    // Une vente ne porte pas de cause de perte, même si un motif traîne.
    { id: 3, userId: 4, managerId: null, visitResult: 'VENTE', nonSaleReason: 'PRIX', productStatuses: [ps('purea', 'PRESENTE'), ps('tv', 'MENTIONNE')] },
    { id: 4, userId: 4, managerId: null, visitResult: 'A_RELANCER', nonSaleReason: 'CONJOINT_ABSENT', productStatuses: [ps('purea', 'NON_APPLICABLE'), ps('tv', 'NON_PRESENTE', 'volontairement_non_presente')] },
    // Sans résultat de visite connu, pas de cause de perte non plus.
    { id: 6, userId: 4, managerId: null, visitResult: null, nonSaleReason: 'BUDGET', productStatuses: [ps('purea', 'NON_APPLICABLE'), ps('tv', 'NON_APPLICABLE')] },
    // Utilisateur de test : exclu des statistiques.
    { id: 5, userId: 99, managerId: null, visitResult: 'REFUS_CLIENT', nonSaleReason: 'BUDGET', productStatuses: [ps('purea', 'ACCEPTE')] },
  ];
  const prisma: any = {
    coachingAnalysis: { findMany: jest.fn(async () => rows) },
    commercial: {
      findMany: jest.fn(async ({ where, select }: any) => (select.status === undefined && select.nom === undefined
        ? where.id.in.filter((id: number) => id !== 99).map((id: number) => ({ id }))
        : where.id.in.map((id: number) => ({ id, nom: `Nom${id}`, prenom: 'P' })))),
    },
    manager: { findMany: jest.fn(async () => []) },
  };
  const query = new CoachingQueryService(prisma, {} as any, {} as any);

  it('agrège proposition, transformation, oublis, produits par visite et causes de perte', async () => {
    const stats = await query.coachingProductStats(new Date('2026-10-01'), new Date('2026-10-31'));
    expect(prisma.coachingAnalysis.findMany.mock.calls[0][0].where).toMatchObject({ status: 'READY', quality: { not: 'INEXPLOITABLE' } });
    expect(stats.nbVisites).toBe(5);
    // Dénominateur par produit : visites où il n'était pas NON_APPLICABLE.
    expect(stats.products).toEqual([
      { key: 'purea', label: 'PUREA', nbVisites: 3, nbProposes: 3, nbAcceptes: 1, nbOublies: 0, tauxProposition: 100, tauxTransformation: 33.3 },
      { key: 'tv', label: 'TV', nbVisites: 4, nbProposes: 1, nbAcceptes: 1, nbOublies: 1, tauxProposition: 25, tauxTransformation: 100 },
    ]);
    expect(stats.produitsParVisite).toBe(0.4);
    expect(stats.parIntervenant).toEqual([
      { subjectId: 3, subjectName: 'P Nom3', subjectRole: 'commercial', nbVisites: 2, nbProduitsVendus: 2, produitsParVisite: 1 },
      { subjectId: 4, subjectName: 'P Nom4', subjectRole: 'commercial', nbVisites: 3, nbProduitsVendus: 0, produitsParVisite: 0 },
    ]);
    expect(stats.causesPerte).toEqual([{ reason: 'PRIX', count: 1 }, { reason: 'CONJOINT_ABSENT', count: 1 }]);
  });
});

describe('visites non évaluables hors des moyennes de score', () => {
  it('le comparatif et la moyenne du tableau de bord ignorent la bande non_evaluable', async () => {
    const rows = [
      { id: 1, userId: 3, managerId: null, score: 80, quality: 'ANALYZED', band: 'correct', subScores: [], createdAt: new Date() },
      { id: 2, userId: 3, managerId: null, score: 40, quality: 'LOW_CONFIDENCE', band: 'non_evaluable', subScores: [], createdAt: new Date() },
      // Analyse antérieure au recalibrage : bande null, score retenu.
      { id: 3, userId: 3, managerId: null, score: 70, quality: 'ANALYZED', band: null, subScores: [], createdAt: new Date() },
    ];
    const prisma: any = {
      coachingAnalysis: {
        findMany: jest.fn(async () => rows),
        groupBy: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({ _avg: { score: 75 } })),
      },
      commercial: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: number) => ({ id, nom: 'N', prenom: 'P' }))) },
      manager: { findMany: jest.fn(async () => []) },
    };
    const query = new CoachingQueryService(prisma, { getActive: async () => null } as any, {} as any);
    const board = await query.coachingScoreboard();
    expect(board.scoreMoyenEquipe).toBe(75);
    expect(board.rows[0]).toMatchObject({ nbAnalyses: 2, scoreMin: 70, scoreMax: 80 });
    await query.getStats();
    expect(prisma.coachingAnalysis.aggregate.mock.calls[0][0].where).toMatchObject({ OR: [{ band: null }, { band: { not: 'non_evaluable' } }] });
  });
});
