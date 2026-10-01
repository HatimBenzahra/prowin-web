import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { CoachingQuality, CoachingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CoachingApiClient, ComputeRequest, ComputeResult } from './coaching-api.client';
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
  private readonly concurrency = Math.max(1, Number(process.env.COACHING_CONCURRENCY) || 2);
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
    const where = { id, remoteLeaseToken: token };
    try {
      const claimed = await this.prisma.coachingAnalysis.updateMany({ where: { id, ...this.due(now) }, data: {
        status: CoachingStatus.ANALYZING, remoteLeaseToken: token,
        remoteSyncAttempts: { increment: 1 }, attempts: { increment: 1 },
        remoteLeaseUntil: new Date(now.getTime() + this.api.timeoutMs + 120_000),
      } });
      if (!claimed.count) return;
      const row = await this.prisma.coachingAnalysis.findUniqueOrThrow({ where: { id }, include: { salesPlanVersion: true } });
      if (row.remoteLeaseToken !== token) return;
      if (row.remoteSyncAttempts > 3) throw new Error('Tentatives épuisées après reprise');
      if (!row.remoteRequestKey) row.remoteRequestKey = randomUUID();
      const stored = row.remotePlanSnapshot as unknown as Pick<ComputeRequest, 'plan' | 'products'> | null;
      const references = stored?.products && stored?.plan ? stored : await this.input.references(row.salesPlanVersion);
      if (references.plan.contentHash !== row.salesPlanVersion.contentHash || references.plan.markdown !== row.salesPlanVersion.rawMarkdown || references.plan.version !== row.salesPlanVersion.version) throw new Error('Référentiel local incompatible');
      const attached = await this.prisma.coachingAnalysis.updateMany({ where, data: { remoteRequestKey: row.remoteRequestKey, remotePlanSnapshot: json(references), remoteAnalysisId: null, remoteRelaunch: false } });
      if (!attached.count) return;
      const request = await this.input.request(row, references);
      const result = await this.api.compute(request);
      this.validate(result, request);
      const cfg = await this.prisma.coachingConfig.findUnique({ where: { id: 1 } });
      const quality = result.score === null || result.durationSec < (cfg?.minDurationSec ?? 45) || result.transcript.trim().length < (cfg?.minTranscriptChars ?? 400)
        ? CoachingQuality.INEXPLOITABLE : result.durationSec < (cfg?.lowConfidenceBelowSec ?? 90) ? CoachingQuality.LOW_CONFIDENCE : CoachingQuality.ANALYZED;
      const data: Prisma.CoachingAnalysisUpdateManyMutationInput = {
        status: CoachingStatus.READY, quality, transcript: result.transcript, transcriptDurationSec: result.durationSec,
        confidence: result.confidence, summary: result.summary, score: quality === CoachingQuality.INEXPLOITABLE ? null : result.score,
        scoreBeforeMalus: result.scoreBeforeMalus, malus: result.malus, remoteResultSnapshot: json(result),
        error: null, nextRetryAt: null, remoteSyncError: null, remoteNextSyncAt: null, remoteLeaseToken: null, remoteLeaseUntil: null,
      };
      for (const key of ['subScores', 'strengths', 'improvements', 'recommendations', 'criterionResults', 'violations', 'detectedProducts', 'productMapping', 'productSheetVersions'] as const) data[key] = json(result[key]);
      const saved = await this.prisma.coachingAnalysis.updateMany({ where, data });
      if (saved.count) this.logger.log(`Calcul coaching #${id} enregistré localement`);
    } catch {
      const row = await this.prisma.coachingAnalysis.findUnique({ where: { id }, select: { remoteSyncAttempts: true } });
      const attempts = row?.remoteSyncAttempts ?? 1;
      const failed = attempts >= 3;
      const retryAt = failed ? null : new Date(Date.now() + 30_000 * attempts);
      await this.prisma.coachingAnalysis.updateMany({ where, data: {
        status: failed ? CoachingStatus.FAILED : CoachingStatus.PENDING,
        ...(failed ? { quality: CoachingQuality.FAILED } : {}), attempts, remoteSyncAttempts: attempts,
        error: 'Calcul coaching échoué', remoteSyncError: 'Calcul coaching échoué', nextRetryAt: retryAt, remoteNextSyncAt: retryAt,
        remoteLeaseToken: null, remoteLeaseUntil: null,
      } });
      this.logger.warn(`Calcul coaching #${id} : ${failed ? 'échec définitif' : 'nouvelle tentative programmée'}`);
    } finally { this.running--; }
  }
  private validate(result: ComputeResult, request: ComputeRequest) {
    if (result?.requestKey !== request.requestKey || result.source !== CRM_SOURCE || result.tenantId !== CRM_TENANT || result.audioKey !== request.audio.key || result.status !== 'READY' || !equal(result.plan, request.plan) || !equal(result.products, request.products)) throw new Error('Résultat/référentiel incompatible');
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
        !request.products.some(p => p.sheet.productKey === a.productSlug && (a.referenceKind === 'price'
          ? !!p.prices?.length && (p.prices.some(price => a.reference === `${price.label} : ${price.price.toFixed(2).replace('.', ',')} € / mois`) ||
            a.reference === p.prices.map(price => `${price.label} : ${price.price.toFixed(2).replace('.', ',')} € / mois`).join(' ; '))
          : p.sheet.facts.some(f => f.includes(a.reference)))))) throw new Error('Alertes produit invalides');
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
        const product = request.products.find(x => x.sheet.productKey === p.productSlug);
        if (!product?.prices?.length || product.priceVerification?.completeGrid !== true || product.priceVerification?.variantsCertified !== true || product.priceVerification.status !== 'verified') throw new Error('Certification produit absente');
      }
    }
    const versions = new Set(request.products.map(p => p.versionId));
    if ((result.productSheetVersions as Prisma.JsonArray).some(id => typeof id !== 'number' || !versions.has(id))) throw new Error('Provenance résultat invalide');
  }
}
