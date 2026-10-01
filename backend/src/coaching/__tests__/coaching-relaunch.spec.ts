import { NotFoundException } from '@nestjs/common';
import { CoachingService } from '../coaching.service';

/** Relancer doit rejouer sur le plan ACTIF, pas sur la version périmée épinglée. */
describe('relaunch — version de plan', () => {
  const active = { id: 10, version: 10 };

  const build = (analysis: any, existing: any = null) => {
    const updated: any[] = [];
    const created: any[] = [];
    const prisma: any = {
      coachingAnalysis: {
        findUnique: jest.fn(({ where }) =>
          where.id ? analysis : existing,
        ),
        updateMany: jest.fn((args) => {
          updated.push(args);
          return { count: 1 };
        }),
        upsert: jest.fn(async (args) => {
          created.push({ data: args.create });
          return { id: 999 };
        }),
      },
    };
    const query: any = { getAnalysis: jest.fn((id: number) => ({ id })) };
    const salesPlans: any = { getActiveVersion: jest.fn(() => active) };
    const service = new CoachingService(
      prisma,
      salesPlans,
      {} as any, // config
      query,
      {} as any, // intake
      { references: jest.fn(async () => ({ plan: { version: 10 }, products: [] })) } as any,
    );
    return { service, prisma, updated, created };
  };

  const base = {
    id: 1,
    source: 'prowin',
    tenantId: '',
    status: 'READY',
    updatedAt: new Date('2026-01-01'),
    s3KeyOriginal: 'rec/a.mp4',
    salesPlanVersionId: 1,
    recordingId: 5,
    porteId: 7,
    userId: 3,
    managerId: null,
    statutPorte: 'ARGUMENTE',
    transcript: 'bonjour, on est France Téléphone',
    transcriptDurationSec: 120,
  };

  it('crée une analyse sur le plan actif quand la ligne est sur une version périmée', async () => {
    const { service, created } = build(base);
    const res = await service.relaunch(1);

    expect(created).toHaveLength(1);
    expect(created[0].data.salesPlanVersionId).toBe(active.id);
    expect(created[0].data.status).toBe('PENDING');
    expect(created[0].data.transcript).toBeUndefined();
    expect(created[0].data.manual).toBe(true);
    expect(res.id).toBe(999);
  });

  it('ne touche pas la ligne d’origine — elle reste l’historique de son référentiel', async () => {
    const { service, updated } = build(base);
    await service.relaunch(1);
    expect(updated).toHaveLength(0);
  });

  it('remet simplement en file quand la ligne est déjà sur le plan actif', async () => {
    const { service, updated, created } = build({
      ...base,
      salesPlanVersionId: active.id,
    });
    await service.relaunch(1);

    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0].where.id).toBe(1);
    expect(updated[0].data.status).toBe('PENDING');
    expect(updated[0].data.attempts).toBe(0);
  });

  it('efface le transcript de la cible pour une réanalyse explicite', async () => {
    const { service, updated } = build(base, {
      id: 42,
      status: 'READY',
      transcript: 'transcript plus récent',
    });
    await service.relaunch(1);

    expect(updated).toHaveLength(1);
    expect(updated[0].where.id).toBe(42);
    expect(updated[0].data.transcript).toBeNull();
  });

  it('refuse de relancer sans plan de vente actif', async () => {
    const { service } = build(base);
    (service as any).salesPlans.getActiveVersion = jest.fn(() => null);
    await expect(service.relaunch(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ne réinitialise pas une analyse distante déjà en cours sur le plan actif', async () => {
    const { service, updated, created } = build({ ...base, salesPlanVersionId: active.id, remoteManaged: true, status: 'ANALYZING' });
    expect((await service.relaunch(1)).id).toBe(1);
    expect(updated).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});
