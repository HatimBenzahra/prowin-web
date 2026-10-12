import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { CoachingQuality, CoachingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CoachingApiClient, CoachingStageError, ComputeRequest, ComputeResult, FrozenReferences } from './coaching-api.client';
import { CoachingInputService } from './coaching-input.service';
import { CRM_SOURCE, CRM_TENANT } from './shared/crm-scope';

const TERMINAL: CoachingStatus[] = [CoachingStatus.READY, CoachingStatus.FAILED];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const equal = (a: unknown, b: unknown) => isDeepStrictEqual(json(a), json(b));

/** Durable LOCAL queue. Legacy remote* columns now describe local leases/references. */
@Injectable()
export class CoachingSyncService {
  private readonly logger = new Logger(CoachingSyncService.name);
  private running = 0;
  private readonly concurrency = Number.isInteger(Number(process.env.COACHING_CONCURRENCY)) && Number(process.env.COACHING_CONCURRENCY) >= 1 && Number(process.env.COACHING_CONCURRENCY) <= 8 ? Number(process.env.COACHING_CONCURRENCY) : 2;
  constructor(private readonly prisma: PrismaService, private readonly api: CoachingApiClient, private readonly input: CoachingInputService) {}
  @Interval(10_000)
  async poll(): Promise<void> {
    if (!this.api.isConfigured() || this.running >= this.concurrency) return;
    const now = new Date();
    const rows = await this.prisma.coachingAnalysis.findMany({ where: this.due(now), orderBy: { id: 'asc' }, take: this.concurrency - this.running, select: { id: true } });
    await Promise.all(rows.map(({ id }) => this.sync(id)));
  }
  private due(now: Date): Prisma.CoachingAnalysisWhereInput {
    return { source: CRM_SOURCE, tenantId: CRM_TENANT, remoteManaged: true, status: { notIn: TERMINAL }, AND: [
      { OR: [{ remoteNextSyncAt: null }, { remoteNextSyncAt: { lte: now } }] },
      { OR: [{ remoteLeaseUntil: null }, { remoteLeaseUntil: { lte: now } }] },
    ] };
  }
  async sync(id: number): Promise<void> {
    if (this.running >= this.concurrency) return;
    this.running++;
    const token = randomUUID();
    const now = new Date();
    const owned = () => ({ id, remoteLeaseToken: token, remoteLeaseUntil: { gt: new Date() } });
    let transcribing = true;
    let attempt = 0;
    try {
      const candidate = await this.prisma.coachingAnalysis.findUnique({ where: { id } });
      if (!candidate) return;
      transcribing = !(typeof candidate.transcript === 'string' && candidate.transcriptDurationSec != null && Number.isFinite(candidate.transcriptDurationSec) && candidate.transcriptDurationSec >= 0);
      const counter = transcribing ? 'transcriptionAttempts' : 'evaluationAttempts';
      const claimed = await this.prisma.coachingAnalysis.updateMany({ where: { id, updatedAt: candidate.updatedAt, remoteRequestKey: candidate.remoteRequestKey, ...this.due(now) }, data: {
        status: transcribing ? CoachingStatus.TRANSCRIBING : CoachingStatus.ANALYZING, remoteLeaseToken: token,
        stageStartedAt: now, [transcribing ? 'transcriptionStartedAt' : 'evaluationStartedAt']: now,
        [counter]: { increment: 1 },
        remoteSyncAttempts: { increment: 1 }, attempts: { increment: 1 },
        remoteLeaseUntil: new Date(now.getTime() + (transcribing ? this.api.timeoutMs : this.api.evaluationTimeoutMs) + 120_000),
      } });
      if (!claimed.count) return;
      const row = await this.prisma.coachingAnalysis.findUniqueOrThrow({ where: { id }, include: { salesPlanVersion: true, reference: { include: { products: { orderBy: { position: 'asc' } } } } } });
      if (row.remoteLeaseToken !== token) return;
      attempt = row[counter];
      if (attempt > 3) throw new Error('Tentatives épuisées après reprise');
      if (!row.remoteRequestKey) row.remoteRequestKey = randomUUID();
      const references = await this.frozenReferences(row);
      const attached = await this.prisma.coachingAnalysis.updateMany({ where: owned(), data: { remoteRequestKey: row.remoteRequestKey, remotePlanSnapshot: json(references), remoteAnalysisId: null, remoteRelaunch: false } });
      if (!attached.count) return;
      const request = await this.input.request(row, references);
      if (transcribing) {
        const result = await this.api.transcribe(request);
        if (result?.requestKey !== request.requestKey || result.source !== CRM_SOURCE || result.tenantId !== CRM_TENANT || result.audioKey !== request.audio.key || typeof result.transcript !== 'string' || !Number.isFinite(result.durationSec) || result.durationSec < 0) throw new Error('Transcript invalide');
        await this.prisma.coachingAnalysis.updateMany({ where: owned(), data: {
          status: CoachingStatus.ANALYZING, transcript: result.transcript, transcriptDurationSec: result.durationSec,
          ...(result.metadata != null ? { transcriptMetadata: json(result.metadata) } : {}),
          transcriptionCompletedAt: new Date(), stageStartedAt: null,
          error: null, remoteSyncError: null, nextRetryAt: null, remoteNextSyncAt: null, remoteLeaseToken: null, remoteLeaseUntil: null,
        } });
        return;
      }
      const result = await this.api.evaluate(request);
      this.validate(result, request);
      const cfg = await this.prisma.coachingConfig.findUnique({ where: { id: 1 } });
      const quality = result.score === null || result.durationSec < (cfg?.minDurationSec ?? 45) || result.transcript.trim().length < (cfg?.minTranscriptChars ?? 400)
        ? CoachingQuality.INEXPLOITABLE : result.durationSec < (cfg?.lowConfidenceBelowSec ?? 90) ? CoachingQuality.LOW_CONFIDENCE : CoachingQuality.ANALYZED;
      const data: Prisma.CoachingAnalysisUpdateManyMutationInput = {
        status: CoachingStatus.READY, quality, transcript: result.transcript, transcriptDurationSec: result.durationSec,
        evaluationCompletedAt: new Date(), stageStartedAt: null,
        confidence: result.confidence, summary: result.summary, score: quality === CoachingQuality.INEXPLOITABLE ? null : result.score,
        scoreBeforeMalus: result.scoreBeforeMalus, malus: result.malus, remoteResultSnapshot: json(result),
        error: null, nextRetryAt: null, remoteSyncError: null, remoteNextSyncAt: null, remoteLeaseToken: null, remoteLeaseUntil: null,
      };
      for (const key of ['subScores', 'strengths', 'improvements', 'recommendations', 'criterionResults', 'violations', 'detectedProducts', 'productMapping', 'productSheetVersions'] as const) data[key] = json(result[key]);
      const saved = await this.prisma.coachingAnalysis.updateMany({ where: owned(), data });
      if (saved.count) this.logger.log(`Calcul coaching #${id} enregistré localement`);
    } catch (error) {
      const busy = error instanceof CoachingStageError && error.code === 'STT_BUSY';
      const failed = !busy && (attempt >= 3 || error instanceof CoachingStageError && error.code === 'REQUEST_TOO_LARGE');
      const code = error instanceof CoachingStageError ? error.code : transcribing ? 'STT_INVALID_RESULT' : 'EVALUATION_INVALID_RESULT';
      const delay = busy ? (error as CoachingStageError).retryAfterMs : code === 'STT_TIMEOUT' ? 300_000 : 30_000 * Math.max(1, attempt);
      const retryAt = failed ? null : new Date(Date.now() + delay + Math.floor(Math.random() * 15_000));
      await this.prisma.coachingAnalysis.updateMany({ where: owned(), data: {
        status: failed ? CoachingStatus.FAILED : transcribing ? CoachingStatus.TRANSCRIBING : CoachingStatus.ANALYZING,
        ...(failed ? { quality: CoachingQuality.FAILED } : {}),
        ...(busy ? { [transcribing ? 'transcriptionAttempts' : 'evaluationAttempts']: { decrement: 1 }, attempts: { decrement: 1 }, remoteSyncAttempts: { decrement: 1 } } : {}),
        error: code, remoteSyncError: code, nextRetryAt: retryAt, remoteNextSyncAt: retryAt, stageStartedAt: null,
        remoteLeaseToken: null, remoteLeaseUntil: null,
      } });
      this.logger.warn(`Calcul coaching #${id} : ${failed ? 'échec définitif' : 'nouvelle tentative programmée'}`);
    } finally { this.running--; }
  }
  /**
   * Le référentiel figé de l'analyse. Depuis le référentiel unique, il est revérifié
   * contre sa version publiée (refigé si absent) ; les analyses antérieures gardent
   * leur couple plan + fiches, qui doit correspondre à leur version de plan.
   */
  private async frozenReferences(row: Prisma.CoachingAnalysisGetPayload<{ include: { salesPlanVersion: true; reference: { include: { products: true } } } }>): Promise<FrozenReferences> {
    const stored = row.remotePlanSnapshot as unknown as FrozenReferences | null;
    // Une analyse lancée avant le référentiel (puis rattachée par la migration) garde le
    // couple plan + fiches figé à sa création, jusqu'à sa prochaine remise en file.
    const legacy = stored && !('reference' in stored) && stored.plan && stored.products ? stored : null;
    if (row.reference && !legacy) {
      const frozen = stored && 'reference' in stored ? stored : await this.input.freeze(row.reference);
      if (!('reference' in frozen) || frozen.reference.version !== row.reference.version || frozen.reference.contentHash !== row.reference.contentHash) throw new Error('Référentiel local incompatible');
      return frozen;
    }
    const plan = row.salesPlanVersion;
    if (!plan || !legacy) throw new Error('Référentiel local absent');
    if (legacy.plan.contentHash !== plan.contentHash || legacy.plan.markdown !== plan.rawMarkdown || legacy.plan.version !== plan.version) throw new Error('Référentiel local incompatible');
    return legacy;
  }

  private validate(result: ComputeResult, request: ComputeRequest) {
    if (result.transcript !== request.transcript?.trim() || result.durationSec !== request.transcriptDurationSec) throw new Error('Checkpoint modifié');
    const provenance = 'reference' in request ? equal(result.reference, { version: request.reference.version, contentHash: request.reference.contentHash }) : equal(result.plan, request.plan) && equal(result.products, request.products);
    if (result?.requestKey !== request.requestKey || result.source !== CRM_SOURCE || result.tenantId !== CRM_TENANT || result.audioKey !== request.audio.key || result.status !== 'READY' || !provenance) throw new Error('Résultat/référentiel incompatible');
    const products = judgeableProducts(request);
    if (typeof result.transcript !== 'string' || !Number.isFinite(result.durationSec) || result.durationSec < 0) throw new Error('Transcript/durée invalide');
    for (const key of ['score', 'scoreBeforeMalus', 'malus', 'confidence'] as const) if (result[key] !== null && !Number.isFinite(result[key])) throw new Error('Score invalide');
    for (const key of ['subScores', 'strengths', 'improvements', 'recommendations', 'criterionResults', 'violations', 'detectedProducts', 'productMapping', 'productSheetVersions'] as const) if (!Array.isArray(result[key])) throw new Error('Détail résultat invalide');
    // Older engines may omit metadata; never infer verified from missing fields.
    if (result.productAlerts !== undefined) {
      if (!Array.isArray(result.productAlerts) || result.productAlerts.some(a => !a ||
        !['tariff_unverified', 'payment_unclear', 'feature_uncertain', 'transcript_ambiguous'].includes(a.type) ||
        !['sheet', 'price'].includes(a.referenceKind) ||
        ['productSlug', 'quote', 'reference', 'reason', 'contextQuote', 'productEvidence', 'relevanceReason'].some(k => typeof a[k] !== 'string' || !a[k].trim()) ||
        !result.transcript.includes(a.contextQuote) || !a.contextQuote.includes(a.quote) || !a.contextQuote.includes(a.productEvidence) ||
        !products.some(p => p.key === a.productSlug && (a.referenceKind === 'price'
          ? !!p.prices?.length && (p.prices.some(price => a.reference === `${price.label} : ${price.price.toFixed(2).replace('.', ',')} € / mois`) ||
            a.reference === p.prices.map(price => `${price.label} : ${price.price.toFixed(2).replace('.', ',')} € / mois`).join(' ; '))
          : p.facts.some(f => f.includes(a.reference)))))) throw new Error('Alertes produit invalides');
    }
    if (result.productVerification !== undefined) {
      const v = result.productVerification;
      const statuses = ['verified', 'partial', 'unavailable'];
      if (!v || !statuses.includes(v.status) || !Array.isArray(v.products) || new Set(v.products.map(p => p.productSlug)).size !== v.products.length || v.products.some(p => !p ||
        !statuses.includes(p.status) || ['productSlug', 'productLabel', 'reason'].some(k => typeof p[k] !== 'string' || !p[k].trim()) ||
        !(result.detectedProducts as Prisma.JsonArray).includes(p.productSlug))) throw new Error('Vérification produit invalide');
      const overall = !v.products.length || v.products.every(p => p.status === 'unavailable') ? 'unavailable'
        : v.products.every(p => p.status === 'verified') ? 'verified' : 'partial';
      if (v.products.length !== (result.detectedProducts as Prisma.JsonArray).length || v.status !== overall ||
        v.products.some(p => p.status === 'verified' && result.productAlerts?.some(a => a.productSlug === p.productSlug))) throw new Error('Périmètre vérification incompatible');
      for (const p of v.products.filter(p => p.status === 'verified')) {
        const product = products.find(x => x.key === p.productSlug);
        if (!product?.prices?.length || product.priceVerification?.completeGrid !== true || product.priceVerification?.variantsCertified !== true || product.priceVerification.status !== 'verified') throw new Error('Certification produit absente');
      }
    }
    if ('reference' in request) {
      const keys = new Set(products.map(p => p.key));
      if (!Array.isArray(result.judgedProducts) || result.judgedProducts.some(key => !keys.has(key)) || (result.productSheetVersions as Prisma.JsonArray).length) throw new Error('Provenance résultat invalide');
    } else {
      const versions = new Set(request.products.map(p => p.versionId));
      if ((result.productSheetVersions as Prisma.JsonArray).some(id => typeof id !== 'number' || !versions.has(id))) throw new Error('Provenance résultat invalide');
    }
  }
}

/** Les produits dont la conformité peut être jugée (avec fiche), quel que soit le contrat. */
function judgeableProducts(request: ComputeRequest) {
  if ('reference' in request) {
    return request.reference.products.flatMap(p => (p.sheet ? [{ key: p.key, facts: p.sheet.content.facts, prices: p.prices, priceVerification: p.priceVerification }] : []));
  }
  return request.products.map(p => ({ key: p.sheet.productKey, facts: p.sheet.facts, prices: p.prices, priceVerification: p.priceVerification }));
}
