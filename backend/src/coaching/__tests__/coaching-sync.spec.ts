import { CoachingSyncService } from '../coaching-sync.service';
import { CoachingService } from '../coaching.service';
import { CoachingStatus, Prisma } from '@prisma/client';

function fixture() {
  let row: any = { id: 7, source: 'prowin', tenantId: '', status: 'PENDING', remoteManaged: true, remoteLeaseToken: null, remoteLeaseUntil: null, remoteNextSyncAt: null, remoteSyncAttempts: 0, attempts: 0, remoteRequestKey: 'generation-1', s3KeyOriginal: 'audio', salesPlanVersionId: 23, recordingId: 40, updatedAt: new Date(), transcript: null };
  const references = { plan: { markdown: 'plan', contentHash: 'hash', criteria: {}, version: 4 }, products: [] };
  const delegate = {
    findUniqueOrThrow: jest.fn(async () => ({ ...row, salesPlanVersion: { id: 23, contentHash: 'hash', rawMarkdown: 'plan', version: 4 } })),
    findUnique: jest.fn(async () => ({ ...row })),
    findMany: jest.fn(async () => [{ id: 7 }]),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (where.remoteLeaseToken && where.remoteLeaseToken !== row.remoteLeaseToken) return { count: 0 };
      if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 };
      if (where.remoteManaged === true && (!row.remoteManaged || ['READY', 'FAILED'].includes(row.status) || row.remoteLeaseUntil > new Date() || row.remoteNextSyncAt > new Date())) return { count: 0 };
      if (where.remoteManaged === false && row.remoteManaged) return { count: 0 };
      for (const [key, value] of Object.entries(data)) row[key] = value === Prisma.DbNull ? null : typeof value === 'object' && value !== null && 'increment' in value ? (row[key] ?? 0) + (value as any).increment : value;
      return { count: 1 };
    }),
    upsert: jest.fn(async ({ create }: any) => { row = { ...row, ...create }; return { id: 7, remoteRequestKey: row.remoteRequestKey }; }),
  };
  const prisma: any = { coachingAnalysis: delegate, coachingConfig: { findUnique: async () => null }, recording: { findUnique: async () => ({ id: 40 }) }, recordingSegment: { findFirst: async () => null } };
  const input: any = { references: jest.fn(async () => references), request: jest.fn(async (r: any, refs: any) => ({ ...refs, requestKey: r.remoteRequestKey, audio: { key: r.s3KeyOriginal, url: 'https://signed.invalid/secret' } })) };
  const result = (request: any): any => ({ requestKey: request.requestKey, source: 'prowin', tenantId: '', audioKey: 'audio', status: 'READY', ...references, transcript: 'Conversation utile '.repeat(50), durationSec: 180, confidence: 0.87, score: 65, scoreBeforeMalus: 80, malus: 15, summary: 'Résumé', subScores: [], strengths: [], improvements: [], recommendations: [], criterionResults: [], violations: [], detectedProducts: [], productMapping: [], productSheetVersions: [] });
  const api: any = { isConfigured: () => true, timeoutMs: 1_800_000, compute: jest.fn(async (r: any) => result(r)) };
  const worker = () => new CoachingSyncService(prisma, api, input);
  const query: any = { getAnalysis: async (id: number) => ({ id }) };
  const service = new CoachingService(prisma, { getActiveVersion: async () => ({ id: 23, version: 4 }) } as any, {} as any, query, api, input);
  return { worker, api, input, delegate, service, row: () => row, set: (data: any) => Object.assign(row, data), result };
}

describe('local durable calculation queue', () => {
  it('persists a complete synchronous result with local IDs and local quality', async () => {
    const f = fixture(); await f.worker().sync(7);
    expect(f.row()).toMatchObject({ id: 7, recordingId: 40, salesPlanVersionId: 23, remoteAnalysisId: null, status: 'READY', score: 65, confidence: 0.87, quality: 'ANALYZED' });
    expect(f.row().remoteResultSnapshot).not.toHaveProperty('id');
    expect(JSON.stringify(f.row().remotePlanSnapshot)).not.toContain('secret');
  });
  it('retries transport failures after restart, pinned references and stable request key', async () => {
    const f = fixture(); f.api.compute.mockRejectedValueOnce(new Error('secret credential'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'PENDING', remoteSyncAttempts: 1, remoteSyncError: 'Calcul coaching échoué' });
    await f.worker().sync(7); expect(f.api.compute).toHaveBeenCalledTimes(1);
    f.set({ remoteNextSyncAt: new Date(0) }); await f.worker().poll();
    expect(f.row().status).toBe('READY'); expect(f.input.references).toHaveBeenCalledTimes(1);
    expect(f.api.compute.mock.calls[0][0].requestKey).toBe(f.api.compute.mock.calls[1][0].requestKey);
  });
  it('deduplicates concurrent workers and recovers an expired lease', async () => {
    const f = fixture(); await Promise.all([f.worker().sync(7), f.worker().sync(7)]);
    expect(f.api.compute).toHaveBeenCalledTimes(1);
    f.set({ status: 'ANALYZING', remoteLeaseToken: 'dead', remoteLeaseUntil: new Date(0) });
    await f.worker().sync(7); expect(f.row().status).toBe('READY');
  });
  it('pins tariff values and verification metadata across retries even if the live catalog changes', async () => {
    const f = fixture();
    const product = { versionId: 91, prices: [{ label: 'Orbit Compact', price: 37.42 }], priceVerification: { status: 'verified', source: 'winleadplus_api', checkedAt: '2026-10-01T01:00:00.000Z', comment: 'Grille courante vérifiée lors du snapshot' } };
    f.input.references.mockResolvedValue({ plan: f.result({}).plan, products: [product] });
    f.api.compute.mockRejectedValueOnce(new Error('transport failed')).mockImplementation(async (q: any) => ({ ...f.result(q), products: q.products }));
    await f.worker().sync(7);
    f.input.references.mockResolvedValue({ plan: f.result({}).plan, products: [{ ...product, prices: [{ label: 'Orbit Compact', price: 51.68 }] }] });
    f.set({ remoteNextSyncAt: new Date(0) }); await f.worker().sync(7);
    expect(f.row().status).toBe('READY');
    expect(f.input.references).toHaveBeenCalledTimes(1);
    expect(f.api.compute.mock.calls[1][0].products).toEqual([product]);
    expect(f.api.compute.mock.calls[1][0].products).toEqual(f.api.compute.mock.calls[0][0].products);
  });
  it('rejects changed plan content and product provenance before saving scores', async () => {
    for (const mutate of [(r: any) => r.plan.markdown = 'wrong', (r: any) => r.products = [{ versionId: 999 }], (r: any) => r.tenantId = 'other']) {
      const f = fixture(); f.api.compute.mockImplementation(async (q: any) => { const r = JSON.parse(JSON.stringify(f.result(q))); mutate(r); return r; });
      await f.worker().sync(7); expect(f.row().status).toBe('PENDING'); expect(f.row().score).toBeUndefined();
    }
  });
  it('a superseded lease owner cannot write completion', async () => {
    const f = fixture(); f.api.compute.mockImplementation(async (q: any) => { f.set({ remoteLeaseToken: 'new', status: 'PENDING' }); return f.result(q); });
    await f.worker().sync(7); expect(f.row().status).toBe('PENDING'); expect(f.row().score).toBeUndefined();
  });
  it('labels the short/noisy dataset locally, retaining the raw score', async () => {
    const f = fixture(); f.api.compute.mockImplementation(async (q: any) => ({ ...f.result(q), transcript: 'bruit', durationSec: 19.760, score: 5 }));
    await f.worker().sync(7); expect(f.row()).toMatchObject({ score: null, quality: 'INEXPLOITABLE', remoteResultSnapshot: { score: 5 } });
  });
  it('bounds failures and expired-lease recovery; never recomputes terminal rows automatically', async () => {
    const f = fixture(); f.api.compute.mockRejectedValue(new Error('down'));
    for (let i = 0; i < 3; i++) { f.set({ remoteNextSyncAt: null }); await f.worker().sync(7); }
    expect(f.row().status).toBe('FAILED'); await f.worker().sync(7); expect(f.api.compute).toHaveBeenCalledTimes(3);
    f.set({ status: 'ANALYZING', remoteLeaseUntil: new Date(0), remoteSyncAttempts: 3 }); await f.worker().sync(7);
    expect(f.row().status).toBe('FAILED'); expect(f.api.compute).toHaveBeenCalledTimes(3);
  });
  it('manual launchMany requeues completed results with same ID and resets transcript; counts only scheduling', async () => {
    const f = fixture(); f.set({ status: CoachingStatus.READY, transcript: 'old', score: 65 });
    expect(await f.service.launchMany(['audio', 'audio'])).toBe(1);
    expect(f.row()).toMatchObject({ id: 7, status: 'PENDING', transcript: null, score: null });
    expect(await f.service.launchMany(['audio'])).toBe(0); expect(f.api.compute).not.toHaveBeenCalled();
  });
  it('worker uses refreshed request-pinned prices without obtaining a bearer or refreshing tariffs', async () => {
    const f = fixture();
    const product = { versionId: 91, prices: [{ label: 'Updated offer', price: 42.9 }], priceVerification: { status: 'verified', source: 'winleadplus_api', checkedAt: new Date().toISOString() } };
    f.set({ status: CoachingStatus.READY, remotePlanSnapshot: { plan: f.result({}).plan, products: [{ ...product, prices: [{ label: 'Old offer', price: 1 }] }] } });
    f.input.references.mockResolvedValue({ plan: f.result({}).plan, products: [product] });
    await f.service.launch('audio', 'synthetic-user-token');
    f.input.references.mockRejectedValue(new Error('request credential no longer available'));
    f.api.compute.mockImplementation(async (q: any) => ({ ...f.result(q), products: q.products }));
    await f.worker().sync(7);
    expect(f.row().status).toBe('READY');
    expect(f.input.references).toHaveBeenCalledTimes(1);
    expect(f.api.compute.mock.calls[0][0].products).toEqual([product]);
    expect(JSON.stringify(f.row())).not.toContain('synthetic-user-token');
    expect(JSON.stringify(f.api.compute.mock.calls)).not.toContain('synthetic-user-token');
  });
  it('ignores historical unmanaged rows', async () => {
    const f = fixture(); f.set({ remoteManaged: false }); await f.worker().sync(7); expect(f.api.compute).not.toHaveBeenCalled();
  });
  it('explicit launch can recover a legacy unmanaged pending row', async () => {
    const f = fixture(); f.set({ remoteManaged: false });
    expect(await f.service.launchMany(['audio'])).toBe(1);
    expect(f.row()).toMatchObject({ id: 7, remoteManaged: true, status: 'PENDING', transcript: null });
  });
  it('atomically clears all old generation results on READY → PENDING, including after failed retries', async () => {
    const f = fixture();
    const pinned = { plan: { markdown: 'plan', contentHash: 'hash', criteria: {}, version: 4 }, products: [] };
    const scalarFields = ['transcript', 'transcriptDurationSec', 'quality', 'score', 'confidence', 'summary', 'scoreBeforeMalus', 'malus'];
    const jsonFields = ['strengths', 'improvements', 'recommendations', 'subScores', 'criterionResults', 'violations', 'detectedProducts', 'productMapping', 'productSheetVersions', 'remoteResultSnapshot'];
    f.set({ status: CoachingStatus.READY, remotePlanSnapshot: pinned, porteId: 50, userId: 60, managerId: 70,
      ...Object.fromEntries(scalarFields.map(key => [key, key === 'transcript' || key === 'summary' || key === 'quality' ? 'old result' : 65])),
      ...Object.fromEntries(jsonFields.map(key => [key, [{ old: true }]])),
    });
    expect(await f.service.launchMany(['audio'])).toBe(1);
    expect(f.delegate.updateMany).toHaveBeenCalledTimes(1);
    const reset = f.delegate.updateMany.mock.calls[0][0].data;
    for (const key of jsonFields) expect(reset[key]).toBe(Prisma.DbNull);
    for (const key of [...scalarFields, ...jsonFields]) expect(f.row()[key]).toBeNull();
    expect(f.row()).toMatchObject({ id: 7, status: 'PENDING', salesPlanVersionId: 23, recordingId: 40, porteId: 50, userId: 60, managerId: 70, remotePlanSnapshot: pinned });
    expect(reset.remotePlanSnapshot).toEqual(pinned);
    f.api.compute.mockRejectedValue(new Error('upstream unavailable'));
    for (let i = 0; i < 3; i++) { f.set({ remoteNextSyncAt: null }); await f.worker().sync(7); }
    expect(f.row().status).toBe('FAILED');
    for (const key of [...scalarFields.filter(key => key !== 'quality'), ...jsonFields]) expect(f.row()[key]).toBeNull();
    expect(f.row().quality).toBe('FAILED'); expect(f.row().remotePlanSnapshot).toEqual(pinned);
    expect(f.input.references).toHaveBeenCalledTimes(1);
  });
});
