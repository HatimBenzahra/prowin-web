import { CoachingSyncService } from '../coaching-sync.service';
import { CoachingService } from '../coaching.service';
import { CoachingStageError } from '../coaching-api.client';
import { Prisma } from '@prisma/client';

function fixture() {
  let row: any = { id: 7, source: 'prowin', tenantId: '', status: 'PENDING', remoteManaged: true, remoteLeaseToken: null, remoteLeaseUntil: null, remoteNextSyncAt: null, remoteSyncAttempts: 0, attempts: 0, transcriptionAttempts: 0, evaluationAttempts: 0, remoteRequestKey: 'generation-1', s3KeyOriginal: 'audio', referenceId: 5, salesPlanVersionId: null, recordingId: 40, updatedAt: new Date(), transcript: null };
  const references = { reference: { version: 4, contentHash: 'hash', plan: { markdown: 'plan', contentHash: 'plan-hash', criteria: {} }, products: [] } };
  const active = { id: 5, version: 4, contentHash: 'hash', products: [] };
  const delegate = {
    findUniqueOrThrow: jest.fn(async () => ({ ...row, salesPlanVersion: null, reference: { id: 5, version: 4, contentHash: 'hash', products: [] } })),
    findUnique: jest.fn(async () => ({ ...row })),
    findMany: jest.fn(async () => [{ id: 7 }]),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (where.remoteLeaseToken && where.remoteLeaseToken !== row.remoteLeaseToken) return { count: 0 };
      if (where.remoteLeaseUntil?.gt && !(row.remoteLeaseUntil > where.remoteLeaseUntil.gt)) return { count: 0 };
      if (where.remoteRequestKey && where.remoteRequestKey !== row.remoteRequestKey) return { count: 0 };
      if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 };
      if (where.remoteManaged === true && (!row.remoteManaged || ['READY', 'FAILED'].includes(row.status) || row.remoteLeaseUntil > new Date() || row.remoteNextSyncAt > new Date())) return { count: 0 };
      for (const [key, value] of Object.entries(data)) row[key] = value === Prisma.DbNull ? null : typeof value === 'object' && value !== null && 'increment' in value ? (row[key] ?? 0) + (value as any).increment : typeof value === 'object' && value !== null && 'decrement' in value ? row[key] - (value as any).decrement : value;
      return { count: 1 };
    }),
  };
  const prisma: any = { coachingAnalysis: delegate, coachingConfig: { findUnique: async () => null } };
  const input: any = { freeze: jest.fn(async () => references), request: jest.fn(async (r: any, refs: any) => ({ ...refs, requestKey: r.remoteRequestKey, audio: { key: r.s3KeyOriginal, url: r.transcript == null ? 'https://signed.invalid/secret' : '' }, transcript: r.transcript, transcriptDurationSec: r.transcriptDurationSec })) };
  const result = (q: any): any => ({ requestKey: q.requestKey, source: 'prowin', tenantId: '', audioKey: 'audio', status: 'READY', reference: { version: 4, contentHash: 'hash' }, transcript: q.transcript ?? 'Conversation utile '.repeat(50), durationSec: q.transcriptDurationSec ?? 180, confidence: 0.87, score: 65, scoreBeforeMalus: 80, malus: 15, summary: 'Résumé', subScores: [], strengths: [], improvements: [], recommendations: [], criterionResults: [], violations: [], detectedProducts: [], productMapping: [], judgedProducts: [], productSheetVersions: [] });
  const api: any = { isConfigured: () => true, timeoutMs: 5_700_000, evaluationTimeoutMs: 600_000, transcribe: jest.fn(async (q: any) => ({ ...result(q), metadata: { quality: { score: 50 } } })), evaluate: jest.fn(async (q: any) => ({ ...result(q), transcript: q.transcript.trim() })) };
  const worker = () => new CoachingSyncService(prisma, api, input);
  const service = new CoachingService(prisma, { getActive: async () => active } as any, {} as any, { getAnalysis: async () => row } as any, api, input);
  return { worker, api, input, delegate, service, row: () => row, set: (data: any) => Object.assign(row, data), result };
}

describe('durable stage queue', () => {
  it('four queued jobs, two STT dispatches share one fail-fast slot; busy leaves budget intact', async () => {
    const jobs = Array.from({ length: 4 }, () => fixture());
    let occupied = false;
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const admission = jest.fn(async (q: any) => {
      if (occupied) throw new CoachingStageError('STT_BUSY');
      occupied = true;
      try { await blocked; return jobs[0].result(q); } finally { occupied = false; }
    });
    for (const job of jobs) job.api.transcribe = admission;
    const active = Promise.all(jobs.slice(0, 2).map(job => job.worker().sync(7)));
    for (let i = 0; i < 20 && admission.mock.calls.length < 2; i++) await new Promise(resolve => setImmediate(resolve));
    expect(admission).toHaveBeenCalledTimes(2);
    release(); await active;
    expect(jobs[0].row().status).toBe('ANALYZING');
    expect(jobs[1].row()).toMatchObject({ status: 'TRANSCRIBING', transcriptionAttempts: 0, error: 'STT_BUSY' });
    expect(jobs.slice(2).map(job => job.row().status)).toEqual(['PENDING', 'PENDING']);
  });
  it('keeps the legacy snapshot of an analysis attached to a référentiel by the migration', async () => {
    const f = fixture();
    const legacy = { plan: { markdown: 'ancien plan', contentHash: 'plan-v17', criteria: {}, version: 17 }, products: [] };
    f.set({ remotePlanSnapshot: legacy, salesPlanVersionId: 23 });
    f.delegate.findUniqueOrThrow.mockImplementation(async () => ({ ...f.row(), salesPlanVersion: { id: 23, contentHash: 'plan-v17', rawMarkdown: 'ancien plan', version: 17 }, reference: { id: 5, version: 4, contentHash: 'hash', products: [] } }));
    await f.worker().sync(7);
    expect(f.input.freeze).not.toHaveBeenCalled();
    expect(f.api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ plan: legacy.plan, products: [] }));
    expect(f.row().remotePlanSnapshot).toEqual(legacy);
  });
  it('checkpoints facts before scoring, one stage per lease and survives restart', async () => {
    const f = fixture(); await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'ANALYZING', transcriptionAttempts: 1, evaluationAttempts: 0, transcriptDurationSec: 180, transcriptMetadata: { quality: { score: 50 } }, remoteLeaseToken: null });
    expect(f.api.evaluate).not.toHaveBeenCalled();
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'READY', score: 65, quality: 'ANALYZED', evaluationAttempts: 1 });
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    expect(f.api.evaluate.mock.calls[0][0].audio.url).toBe('');
  });
  it('score failure retry reuses transcript and pinned prices', async () => {
    const f = fixture(); await f.worker().sync(7);
    f.api.evaluate.mockRejectedValueOnce(new CoachingStageError('EVALUATION_FAILED'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'ANALYZING', error: 'EVALUATION_FAILED', evaluationAttempts: 1 });
    await f.worker().sync(7); expect(f.api.evaluate).toHaveBeenCalledTimes(1);
    f.set({ remoteNextSyncAt: new Date(0) }); await f.worker().sync(7);
    expect(f.row().status).toBe('READY'); expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    expect(f.input.freeze).toHaveBeenCalledTimes(1);
  });
  it('busy delays with jitter without consuming failure budget', async () => {
    const f = fixture(); f.api.transcribe.mockRejectedValue(new CoachingStageError('STT_BUSY'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'TRANSCRIBING', error: 'STT_BUSY', transcriptionAttempts: 0, attempts: 0, remoteSyncAttempts: 0 });
    expect(f.row().remoteNextSyncAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
  });
  it('deduplicates concurrent claims and recovers an interrupted STT lease', async () => {
    const f = fixture(); f.set({ status: 'TRANSCRIBING', remoteLeaseToken: 'dead', remoteLeaseUntil: new Date(0), transcriptionAttempts: 1 });
    await Promise.all([f.worker().sync(7), f.worker().sync(7)]);
    expect(f.api.transcribe).toHaveBeenCalledTimes(1); expect(f.row().transcriptionAttempts).toBe(2);
  });
  it('busy never clears an existing checkpoint', async () => {
    const f = fixture(); await f.worker().sync(7);
    const transcript = f.row().transcript;
    f.api.evaluate.mockRejectedValue(new CoachingStageError('STT_BUSY'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({ transcript, status: 'ANALYZING', evaluationAttempts: 0, transcriptionAttempts: 1 });
  });
  it.each(['superseded', 'expired'])('guards %s owner checkpoint writes', async mode => {
    const f = fixture(); f.api.transcribe.mockImplementation(async (q: any) => { f.set(mode === 'expired' ? { remoteLeaseUntil: new Date(0) } : { remoteLeaseToken: 'new', remoteRequestKey: 'new-generation' }); return f.result(q); });
    await f.worker().sync(7); expect(f.row().transcript).toBeNull(); expect(f.row().score).toBeUndefined();
  });
  it('bounds each stage independently and does not retry terminal rows', async () => {
    const f = fixture(); await f.worker().sync(7); f.api.evaluate.mockRejectedValue(new Error('secret'));
    for (let i = 0; i < 3; i++) { f.set({ remoteNextSyncAt: null }); await f.worker().sync(7); }
    expect(f.row()).toMatchObject({ status: 'FAILED', evaluationAttempts: 3, transcriptionAttempts: 1, error: 'EVALUATION_INVALID_RESULT' });
    expect(f.row().transcript).toBeTruthy(); await f.worker().sync(7); expect(f.api.evaluate).toHaveBeenCalledTimes(3);
  });
  it('manual relaunch recalculates score, preserving facts unless retranscribe is explicit', async () => {
    const f = fixture(); await f.worker().sync(7); await f.worker().sync(7);
    const transcript = f.row().transcript; await f.service.relaunch(7);
    expect(f.row()).toMatchObject({ status: 'PENDING', transcript, score: null, evaluationAttempts: 0 });
    await f.worker().sync(7); expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    await f.service.relaunch(7, undefined, true); expect(f.row().transcript).toBeNull();
    await f.worker().sync(7); expect(f.api.transcribe).toHaveBeenCalledTimes(2);
  });
  it('empty speech is checkpointed and evaluated once without fallback', async () => {
    const f = fixture(); f.api.transcribe.mockImplementation(async (q: any) => ({ ...f.result(q), transcript: '', durationSec: 19.76 }));
    await f.worker().sync(7); await f.worker().sync(7);
    expect(f.row()).toMatchObject({ status: 'READY', score: null, quality: 'INEXPLOITABLE' });
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
  });
});
