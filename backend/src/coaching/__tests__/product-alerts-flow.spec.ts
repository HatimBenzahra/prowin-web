import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory, Query, Resolver } from '@nestjs/graphql';
import { graphql } from 'graphql';
import { CoachingAnalysisDto } from '../coaching.dto';
import { CoachingSyncService } from '../coaching-sync.service';
import { CoachingQueryService } from '../lecture/coaching-query.service';

@Resolver(() => CoachingAnalysisDto)
class FlowResolver {
  @Query(() => CoachingAnalysisDto) coachingAnalysis(): CoachingAnalysisDto { throw new Error('Supplied by local mock'); }
}

/** Local engine + mocked model, DB and GraphQL execution: no network or listener. */
describe('product alerts compute → snapshot → GraphQL → frontend selection', () => {
  async function flow(mutate?: (result: any) => void, certified = false) {
    // Repo prowin-coaching, voisin de prowin_V1/ (PRO_WIN/coaching) ; surchargeable en CI.
    const enginePath = process.env.COACHING_ENGINE_SRC ?? resolve(process.cwd(), '../../../../coaching/src');
    const { ComputeService } = require(`${enginePath}/compute/compute.service`);
    const { ScoringService } = require(`${enginePath}/analyse-porte/etape-5-scoring/scoring.service`);
    const { parseSalesPlanMarkdown } = require(`${enginePath}/referentiels/sales-plan.parser`);
    const { parseProductSheetMarkdown } = require(`${enginePath}/referentiels/product-sheet.parser`);
    const markdown = '---\nslug: orchard\ntitle: Orchard\nsteps:\n  - key: service\n    label: Service\n    weight: 100\n    appliesWhen: productDetected:orchard\n    criteria:\n      - key: nature\n        label: Nature du service\n        points: 100\n        requiresProductSheet: true\n---';
    const sheetMarkdown = '---\nslug: orchard\nlabel: Orchard Assist\nappliesTo: productDetected:orchard\nfacts: [Entretien des arbres sans remplacement.]\nidentifiers: [Orchard]\n---';
    const parsed = parseSalesPlanMarkdown(markdown), sheet = parseProductSheetMarkdown(sheetMarkdown);
    const quote = 'Orchard : vous payez 64 euros, je ne précise pas pourquoi.';
    const transcript = `${quote} ${'Nous parlons du service proposé et des besoins du client. '.repeat(10)}`;
    const request = { requestKey: 'flow-generation', audio: { key: 'flow-audio', url: 'https://unused.invalid' }, transcript, transcriptDurationSec: 180,
      plan: { markdown, contentHash: parsed.contentHash, criteria: parsed.plan, version: 1 },
      products: [{ markdown: sheetMarkdown, contentHash: sheet.contentHash, versionId: 31, sheet: sheet.sheet, prices: [{ label: 'Verger compact', price: 14.6 }],
        ...(certified ? { priceVerification: { status: 'verified', source: 'winleadplus_api', checkedAt: '2026-10-01T00:00:00Z', comment: 'Grille complète certifiée.', completeGrid: true, variantsCertified: true } } : {}) }] };
    const model = { chatJson: jest.fn().mockResolvedValueOnce(JSON.stringify({ products: [{ key: 'orchard', presentedByCommercial: true, evidence: 'Orchard' }] }))
      .mockResolvedValueOnce(JSON.stringify({ criteria: [] })).mockResolvedValueOnce(JSON.stringify({ criteria: [], productAlerts: [{ productSlug: 'orchard', type: 'payment_unclear', quote,
        referenceKind: 'sheet', reference: 'Entretien des arbres sans remplacement.', reason: 'Nature du paiement à clarifier.', contextQuote: quote, productEvidence: 'Orchard', relevanceReason: 'Paiement dans la vente du service.' }] })) };
    const engine = new ComputeService({}, model, new ScoringService());
    const computed = { ...await engine.compute(JSON.parse(JSON.stringify(request))), source: 'prowin', tenantId: '' };
    mutate?.(computed);
    let row: any = { id: 9, source: 'prowin', tenantId: '', status: 'PENDING', remoteManaged: true, remoteSyncAttempts: 0, remoteRequestKey: request.requestKey,
      transcript, transcriptDurationSec: 180, evaluationAttempts: 0, transcriptionAttempts: 0,
      salesPlanVersion: { rawMarkdown: markdown, contentHash: parsed.contentHash, version: 1 }, s3KeyOriginal: request.audio.key, createdAt: new Date(), updatedAt: new Date() };
    const prisma: any = { coachingConfig: { findUnique: async () => null }, coachingAnalysis: {
      findUnique: async () => row, findUniqueOrThrow: async () => row,
       updateMany: async ({ data }: any) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] ?? 0) + (value as any).increment : value; return { count: 1 }; },
    } };
    const worker = new CoachingSyncService(prisma, { timeoutMs: 1000, evaluationTimeoutMs: 1000, evaluate: async () => computed } as any, { references: async () => ({ plan: request.plan, products: request.products }), request: async () => request } as any);
    await worker.sync(9);
    const queries = new CoachingQueryService(prisma, {} as any, {} as any);
    return { row, computed, dto: await queries.getAnalysis(9) };
  }

  it('returns and persists grounded alerts without malus and exposes them through the actual common frontend fields', async () => {
    const { row, computed, dto } = await flow();
    expect(computed.productAlerts).toHaveLength(1); expect(computed.malus).toBe(0);
    expect(row.status).toBe('READY'); expect(row.remoteResultSnapshot.productAlerts).toEqual(computed.productAlerts);
    expect(dto.productVerification?.status).toBe('partial');
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([FlowResolver]);
      const frontend = readFileSync(resolve(process.cwd(), '../frontend/src/services/coaching/coaching.service.ts'), 'utf8');
      const fields = /const COACHING_FIELDS = `([\s\S]*?)`/.exec(frontend)![1];
      const response = await graphql({ schema, source: `{ coachingAnalysis { ${fields} } }`, rootValue: { coachingAnalysis: () => dto } });
      expect(response.errors).toBeUndefined();
      expect(response.data?.coachingAnalysis).toMatchObject({ productAlerts: [{ type: 'payment_unclear', quote: computed.productAlerts[0].quote }], productVerification: { status: 'partial' }, malus: 0 });
    } finally { await module.close(); }
  });
  it('rejects malformed alert metadata before persisting a score', async () => {
    const { row } = await flow(r => { r.productAlerts[0].quote = 'Fabricated quotation'; });
    expect(row.status).toBe('ANALYZING'); expect(row.remoteResultSnapshot).toBeUndefined();
  });
  it('reads old snapshots as unknown rather than verified', async () => {
    const { dto } = await flow(r => { delete r.productAlerts; delete r.productVerification; });
    expect(dto.productAlerts).toEqual([]); expect(dto.productVerification).toEqual({ status: 'unknown', products: [] });
  });
  it('rejects an alerted product marked verified even with a consistent partial overall status and certified grid', async () => {
    const { row } = await flow(r => {
      r.productVerification.products[0].status = 'verified';
      r.detectedProducts.push('unreferenced');
      r.productVerification.products.push({ productSlug: 'unreferenced', productLabel: 'Missing reference', status: 'unavailable', reason: 'Fiche non fournie.' });
      r.productVerification.status = 'partial';
    }, true);
    expect(row.status).toBe('ANALYZING'); expect(row.remoteResultSnapshot).toBeUndefined(); expect(row.score).toBeUndefined();
  });
  it.each([
    ['unavailable', 'partial'],
    ['partial', 'unavailable'],
    ['partial', 'verified'],
    ['verified', 'partial'],
  ])('rejects overall %s inconsistent with per-product %s', async (overall, item) => {
    const { row } = await flow(r => {
      r.productAlerts = [];
      r.productVerification.status = overall;
      r.productVerification.products[0].status = item;
    }, true);
    expect(row.status).toBe('ANALYZING'); expect(row.remoteResultSnapshot).toBeUndefined(); expect(row.score).toBeUndefined();
  });
  it.each(['verified', 'unavailable'])('accepts consistent %s aggregation without alerts', async status => {
    const { row } = await flow(r => {
      r.productAlerts = [];
      r.productVerification.status = status;
      r.productVerification.products[0].status = status;
    }, true);
    expect(row.status).toBe('READY'); expect(row.remoteResultSnapshot.productVerification.status).toBe(status);
  });
});
