import { CoachingSyncService } from '../coaching-sync.service';
import { CoachingService } from '../coaching.service';
import { CoachingStageError } from '../coaching-api.client';
import { CoachingInputService } from '../coaching-input.service';
import { Prisma } from '@prisma/client';

function fixture() {
  let row: any = {
    id: 7,
    source: 'prowin',
    tenantId: '',
    status: 'PENDING',
    remoteManaged: true,
    remoteLeaseToken: null,
    remoteLeaseUntil: null,
    remoteNextSyncAt: null,
    remoteSyncAttempts: 0,
    attempts: 0,
    transcriptionAttempts: 0,
    evaluationAttempts: 0,
    remoteRequestKey: 'generation-1',
    s3KeyOriginal: 'audio',
    referenceId: 5,
    salesPlanVersionId: null,
    recordingId: 40,
    updatedAt: new Date(),
    transcript: null,
  };
  const references = {
    reference: {
      version: 4,
      contentHash: 'hash',
      plan: { markdown: 'plan', contentHash: 'plan-hash', criteria: {} },
      products: [],
    },
  };
  const active = { id: 5, version: 4, contentHash: 'hash', products: [] };
  const delegate = {
    findUniqueOrThrow: jest.fn(async () => ({
      ...row,
      salesPlanVersion: null,
      reference: { id: 5, version: 4, contentHash: 'hash', products: [] },
    })),
    findUnique: jest.fn(async () => ({ ...row })),
    findMany: jest.fn(async () => [{ id: 7 }]),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (
        where.remoteLeaseToken &&
        where.remoteLeaseToken !== row.remoteLeaseToken
      )
        return { count: 0 };
      if (
        where.remoteLeaseUntil?.gt &&
        !(row.remoteLeaseUntil > where.remoteLeaseUntil.gt)
      )
        return { count: 0 };
      if (
        where.remoteRequestKey &&
        where.remoteRequestKey !== row.remoteRequestKey
      )
        return { count: 0 };
      if (where.status?.in && !where.status.in.includes(row.status))
        return { count: 0 };
      if (
        where.remoteManaged === true &&
        (!row.remoteManaged ||
          ['READY', 'FAILED'].includes(row.status) ||
          row.remoteLeaseUntil > new Date() ||
          row.remoteNextSyncAt > new Date())
      )
        return { count: 0 };
      for (const [key, value] of Object.entries(data))
        row[key] =
          value === Prisma.DbNull
            ? null
            : typeof value === 'object' &&
                value !== null &&
                'increment' in value
              ? (row[key] ?? 0) + (value as any).increment
              : typeof value === 'object' &&
                  value !== null &&
                  'decrement' in value
                ? row[key] - (value as any).decrement
                : value;
      return { count: 1 };
    }),
  };
  const prisma: any = {
    coachingAnalysis: delegate,
    coachingConfig: { findUnique: async () => null },
  };
  const input: any = {
    freeze: jest.fn(async () => references),
    request: jest.fn(async (r: any, refs: any) => ({
      ...refs,
      requestKey: r.remoteRequestKey,
      audio: {
        key: r.s3KeyOriginal,
        url: r.transcript == null ? 'https://signed.invalid/secret' : '',
      },
      transcript: r.transcript,
      transcriptDurationSec: r.transcriptDurationSec,
    })),
  };
  const result = (q: any): any => ({
    requestKey: q.requestKey,
    source: 'prowin',
    tenantId: '',
    audioKey: 'audio',
    status: 'READY',
    reference: { version: 4, contentHash: 'hash' },
    transcript: q.transcript ?? 'Conversation utile '.repeat(50),
    durationSec: q.transcriptDurationSec ?? 180,
    confidence: 0.87,
    score: 65,
    scoreBeforeMalus: 80,
    malus: 15,
    summary: 'Résumé',
    subScores: [],
    strengths: [],
    improvements: [],
    recommendations: [],
    criterionResults: [],
    violations: [],
    detectedProducts: [],
    productMapping: [],
    judgedProducts: [],
    productSheetVersions: [],
  });
  const api: any = {
    isConfigured: () => true,
    timeoutMs: 5_700_000,
    evaluationTimeoutMs: 600_000,
    transcribe: jest.fn(async (q: any) => ({
      ...result(q),
      metadata: { quality: { score: 50 } },
    })),
    evaluate: jest.fn(async (q: any) => ({
      ...result(q),
      transcript: q.transcript.trim(),
    })),
  };
  const worker = () => new CoachingSyncService(prisma, api, input);
  const service = new CoachingService(
    prisma,
    { getActive: async () => active } as any,
    {} as any,
    { getAnalysis: async () => row } as any,
    api,
    input,
  );
  return {
    worker,
    api,
    input,
    delegate,
    service,
    row: () => row,
    set: (data: any) => Object.assign(row, data),
    result,
  };
}

describe('durable stage queue', () => {
  it('four queued jobs, two STT dispatches share one fail-fast slot; busy leaves budget intact', async () => {
    const jobs = Array.from({ length: 4 }, () => fixture());
    let occupied = false;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const admission = jest.fn(async (q: any) => {
      if (occupied) throw new CoachingStageError('STT_BUSY');
      occupied = true;
      try {
        await blocked;
        return jobs[0].result(q);
      } finally {
        occupied = false;
      }
    });
    for (const job of jobs) job.api.transcribe = admission;
    const active = Promise.all(
      jobs.slice(0, 2).map((job) => job.worker().sync(7)),
    );
    for (let i = 0; i < 20 && admission.mock.calls.length < 2; i++)
      await new Promise((resolve) => setImmediate(resolve));
    expect(admission).toHaveBeenCalledTimes(2);
    release();
    await active;
    expect(jobs[0].row().status).toBe('ANALYZING');
    expect(jobs[1].row()).toMatchObject({
      status: 'TRANSCRIBING',
      transcriptionAttempts: 0,
      error: 'STT_BUSY',
    });
    expect(jobs.slice(2).map((job) => job.row().status)).toEqual([
      'PENDING',
      'PENDING',
    ]);
  });
  it('keeps the legacy snapshot of an analysis attached to a référentiel by the migration', async () => {
    const f = fixture();
    const legacy = {
      plan: {
        markdown: 'ancien plan',
        contentHash: 'plan-v17',
        criteria: {},
        version: 17,
      },
      products: [],
    };
    f.set({ remotePlanSnapshot: legacy, salesPlanVersionId: 23 });
    f.delegate.findUniqueOrThrow.mockImplementation(async () => ({
      ...f.row(),
      salesPlanVersion: {
        id: 23,
        contentHash: 'plan-v17',
        rawMarkdown: 'ancien plan',
        version: 17,
      },
      reference: { id: 5, version: 4, contentHash: 'hash', products: [] },
    }));
    await f.worker().sync(7);
    expect(f.input.freeze).not.toHaveBeenCalled();
    expect(f.api.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ plan: legacy.plan, products: [] }),
    );
    expect(f.row().remotePlanSnapshot).toEqual(legacy);
  });
  it('checkpoints facts before scoring, one stage per lease and survives restart', async () => {
    const f = fixture();
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'ANALYZING',
      transcriptionAttempts: 1,
      evaluationAttempts: 0,
      transcriptDurationSec: 180,
      transcriptMetadata: { quality: { score: 50 } },
      remoteLeaseToken: null,
    });
    expect(f.api.evaluate).not.toHaveBeenCalled();
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      score: 65,
      quality: 'ANALYZED',
      evaluationAttempts: 1,
    });
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    expect(f.api.evaluate.mock.calls[0][0].audio.url).toBe('');
  });
  it('score failure retry reuses transcript and pinned prices', async () => {
    const f = fixture();
    await f.worker().sync(7);
    f.api.evaluate.mockRejectedValueOnce(
      new CoachingStageError('EVALUATION_FAILED'),
    );
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'ANALYZING',
      error: 'EVALUATION_FAILED',
      evaluationAttempts: 1,
    });
    await f.worker().sync(7);
    expect(f.api.evaluate).toHaveBeenCalledTimes(1);
    f.set({ remoteNextSyncAt: new Date(0) });
    await f.worker().sync(7);
    expect(f.row().status).toBe('READY');
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    expect(f.input.freeze).toHaveBeenCalledTimes(1);
  });
  it('busy delays with jitter without consuming failure budget', async () => {
    const f = fixture();
    f.api.transcribe.mockRejectedValue(new CoachingStageError('STT_BUSY'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'TRANSCRIBING',
      error: 'STT_BUSY',
      transcriptionAttempts: 0,
      attempts: 0,
      remoteSyncAttempts: 0,
    });
    expect(f.row().remoteNextSyncAt.getTime()).toBeGreaterThan(
      Date.now() + 50_000,
    );
  });
  it('deduplicates concurrent claims and recovers an interrupted STT lease', async () => {
    const f = fixture();
    f.set({
      status: 'TRANSCRIBING',
      remoteLeaseToken: 'dead',
      remoteLeaseUntil: new Date(0),
      transcriptionAttempts: 1,
    });
    await Promise.all([f.worker().sync(7), f.worker().sync(7)]);
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    expect(f.row().transcriptionAttempts).toBe(2);
  });
  it('busy never clears an existing checkpoint', async () => {
    const f = fixture();
    await f.worker().sync(7);
    const transcript = f.row().transcript;
    f.api.evaluate.mockRejectedValue(new CoachingStageError('STT_BUSY'));
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      transcript,
      status: 'ANALYZING',
      evaluationAttempts: 0,
      transcriptionAttempts: 1,
    });
  });
  it.each(['superseded', 'expired'])(
    'guards %s owner checkpoint writes',
    async (mode) => {
      const f = fixture();
      f.api.transcribe.mockImplementation(async (q: any) => {
        f.set(
          mode === 'expired'
            ? { remoteLeaseUntil: new Date(0) }
            : { remoteLeaseToken: 'new', remoteRequestKey: 'new-generation' },
        );
        return f.result(q);
      });
      await f.worker().sync(7);
      expect(f.row().transcript).toBeNull();
      expect(f.row().score).toBeUndefined();
    },
  );
  it('bounds each stage independently and does not retry terminal rows', async () => {
    const f = fixture();
    await f.worker().sync(7);
    f.api.evaluate.mockRejectedValue(new Error('secret'));
    for (let i = 0; i < 3; i++) {
      f.set({ remoteNextSyncAt: null });
      await f.worker().sync(7);
    }
    expect(f.row()).toMatchObject({
      status: 'FAILED',
      evaluationAttempts: 3,
      transcriptionAttempts: 1,
      error: 'EVALUATION_INVALID_RESULT',
    });
    expect(f.row().transcript).toBeTruthy();
    await f.worker().sync(7);
    expect(f.api.evaluate).toHaveBeenCalledTimes(3);
  });
  it('manual relaunch recalculates score, preserving facts unless retranscribe is explicit', async () => {
    const f = fixture();
    await f.worker().sync(7);
    await f.worker().sync(7);
    const transcript = f.row().transcript;
    await f.service.relaunch(7);
    expect(f.row()).toMatchObject({
      status: 'PENDING',
      transcript,
      score: null,
      evaluationAttempts: 0,
    });
    await f.worker().sync(7);
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
    await f.service.relaunch(7, undefined, true);
    expect(f.row().transcript).toBeNull();
    await f.worker().sync(7);
    expect(f.api.transcribe).toHaveBeenCalledTimes(2);
  });
  it('empty speech is checkpointed and evaluated once without fallback', async () => {
    const f = fixture();
    f.api.transcribe.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: '',
      durationSec: 19.76,
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      score: null,
      quality: 'INEXPLOITABLE',
    });
    expect(f.api.transcribe).toHaveBeenCalledTimes(1);
  });
});

describe('recalibrage 2026 : nouveaux champs du résultat', () => {
  const recalibrage = {
    executionScore: 82.5,
    outcome: {
      visitResult: 'VENTE',
      outcomeCategory: 'vente_produit_principal',
      outcomeScore: 13,
      nonSaleReason: null,
      nextAction: 'SIGNATURE_A_FINALISER',
      rib: 'OUI',
      signature: 'LIEN_SMS',
      evidence: ['Je signe'],
      comment: 'Vente du purificateur',
    },
    productStatuses: [
      {
        key: 'purea',
        label: 'Purificateur',
        status: 'ACCEPTE',
        opportunity: null,
        naReason: null,
        naDetail: null,
        evidence: ['oui pour le purificateur'],
      },
      {
        key: 'mondial-tv',
        label: 'Mondial TV',
        status: 'NON_PRESENTE',
        opportunity: 'oubliee',
        naReason: null,
        naDetail: null,
        evidence: [],
      },
    ],
    indicators: { qualiteCommerciale: 78, respectPlan: 85, conformite: 100 },
    band: 'correct',
    analysisConfidence: { level: 'haute', reasons: [] },
    calculationChecks: [
      {
        quote: '19,90 par mois',
        inputs: ['19,90'],
        expression: '19.9*12',
        announced: 238.8,
        recomputed: 238.8,
        status: 'coherent',
        comment: '',
      },
    ],
    contradictions: [
      { topic: 'prix', quoteA: '19,90', quoteB: '24,90', comment: 'Deux prix' },
    ],
    phaseTiming: [
      {
        stepKey: 'rib',
        timing: 'late',
        evidence: 'RIB demandé à la fin',
        comment: '',
      },
    ],
  };

  it('persiste les nouveaux champs du moteur', async () => {
    const f = fixture();
    f.api.evaluate.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: q.transcript.trim(),
      ...recalibrage,
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      executionScore: 82.5,
      outcomeScore: 13,
      visitResult: 'VENTE',
      nonSaleReason: null,
      nextAction: 'SIGNATURE_A_FINALISER',
      ribStatus: 'OUI',
      signatureStatus: 'LIEN_SMS',
      band: 'correct',
      indicators: { qualiteCommerciale: 78, respectPlan: 85, conformite: 100 },
      analysisConfidence: { level: 'haute', reasons: [] },
      productStatuses: recalibrage.productStatuses,
      calculationChecks: recalibrage.calculationChecks,
      contradictions: recalibrage.contradictions,
      phaseTiming: [
        {
          stepKey: 'rib',
          timing: 'late',
          evidence: ['RIB demandé à la fin'],
          comment: '',
        },
      ],
    });
  });

  it('un moteur antérieur (champs absents) donne des nulls, sans échec', async () => {
    const f = fixture();
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      score: 65,
      executionScore: null,
      outcomeScore: null,
      visitResult: null,
      ribStatus: null,
      band: null,
      productStatuses: null,
      indicators: null,
      analysisConfidence: null,
      calculationChecks: null,
      contradictions: null,
      phaseTiming: null,
    });
  });

  it('des valeurs hors contrat deviennent null au lieu de faire échouer l’analyse', async () => {
    const f = fixture();
    f.api.evaluate.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: q.transcript.trim(),
      executionScore: 'beaucoup',
      outcome: { visitResult: 'GAGNE', rib: 'PEUT_ETRE' },
      band: 'excellent',
      productStatuses: [
        { key: 'purea', status: 'VENDU' },
        null,
        { key: 'depanssur', status: 'REFUSE' },
      ],
      indicators: 'n/a',
      analysisConfidence: { level: 'totale' },
      calculationChecks: { a: 1 },
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      executionScore: null,
      visitResult: null,
      ribStatus: null,
      band: null,
      indicators: null,
      analysisConfidence: null,
      calculationChecks: null,
      productStatuses: [
        {
          key: 'depanssur',
          label: 'depanssur',
          status: 'REFUSE',
          opportunity: null,
          naReason: null,
          naDetail: null,
          evidence: [],
        },
      ],
    });
  });

  it('une analyse inexploitable masque aussi les nouveaux scores', async () => {
    const f = fixture();
    f.api.transcribe.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: 'court',
      durationSec: 20,
    }));
    f.api.evaluate.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: q.transcript.trim(),
      durationSec: q.transcriptDurationSec,
      ...recalibrage,
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      quality: 'INEXPLOITABLE',
      score: null,
      executionScore: null,
      outcomeScore: null,
      indicators: null,
      band: 'non_evaluable',
      visitResult: 'VENTE',
    });
  });

  it('un moteur sans score d’exécution (score null) marque l’analyse inexploitable', async () => {
    const f = fixture();
    f.api.evaluate.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: q.transcript.trim(),
      ...recalibrage,
      score: null,
      scoreBeforeMalus: null,
      executionScore: null,
      band: 'non_evaluable',
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    expect(f.row()).toMatchObject({
      status: 'READY',
      quality: 'INEXPLOITABLE',
      score: null,
      scoreBeforeMalus: null,
      executionScore: null,
      outcomeScore: null,
      band: 'non_evaluable',
    });
  });

  it('la remise en file efface les nouveaux champs', async () => {
    const f = fixture();
    f.api.evaluate.mockImplementation(async (q: any) => ({
      ...f.result(q),
      transcript: q.transcript.trim(),
      ...recalibrage,
    }));
    await f.worker().sync(7);
    await f.worker().sync(7);
    f.set({ outcomeOverriddenBy: 'admin@x', outcomeOverriddenAt: new Date() });
    await f.service.relaunch(7);
    expect(f.row()).toMatchObject({
      status: 'PENDING',
      executionScore: null,
      outcomeScore: null,
      visitResult: null,
      nextAction: null,
      ribStatus: null,
      signatureStatus: null,
      band: null,
      productStatuses: null,
      indicators: null,
      analysisConfidence: null,
      calculationChecks: null,
      contradictions: null,
      phaseTiming: null,
      outcomeOverriddenBy: null,
      outcomeOverriddenAt: null,
    });
  });

  it('envoie les segments horodatés du transcript à /evaluate, et rien sans segments valides', async () => {
    const input = new CoachingInputService({} as any, {} as any);
    const refs: any = {
      reference: { version: 1, contentHash: 'h', plan: {}, products: [] },
    };
    const row: any = {
      remoteRequestKey: 'k',
      s3KeyOriginal: 'audio',
      statutPorte: null,
      transcript: 'Bonjour',
      transcriptDurationSec: 12,
      transcriptMetadata: {
        segments: [
          {
            start: 0,
            end: 2.5,
            text: 'Bonjour',
            words: [],
            no_speech_prob: 0.02,
            avg_logprob: -0.3,
          },
          { start: 3, end: 4, text: 'Oui' },
        ],
        quality: null,
      },
    };
    expect((await input.request(row, refs)).transcriptSegments).toEqual([
      {
        start: 0,
        end: 2.5,
        text: 'Bonjour',
        no_speech_prob: 0.02,
        avg_logprob: -0.3,
      },
      { start: 3, end: 4, text: 'Oui' },
    ]);
    // Tout ou rien : un seul segment invalide et aucun segment ne part.
    for (const bad of [
      { start: 'x', end: 3, text: 'bruit' },
      { start: 5, end: 4, text: 'à rebours' },
      { start: 6, end: 7, text: null },
      { start: -1, end: 1, text: 'avant' },
    ]) {
      const withBad = {
        ...row,
        transcriptMetadata: {
          segments: [...row.transcriptMetadata.segments, bad],
        },
      };
      expect('transcriptSegments' in (await input.request(withBad, refs))).toBe(
        false,
      );
    }
    expect(
      'transcriptSegments' in
        (await input.request(
          { ...row, transcriptMetadata: { segments: null } },
          refs,
        )),
    ).toBe(false);
    expect(
      'transcriptSegments' in
        (await input.request({ ...row, transcriptMetadata: null }, refs)),
    ).toBe(false);
  });
});
