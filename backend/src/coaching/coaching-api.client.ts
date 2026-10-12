import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { CRM_TENANT } from './shared/crm-scope';
import { ParsedSalesPlan } from './referentiels/sales-plan.types';
import { ForbiddenClaim, ParsedProductSheet } from './referentiels/product-sheet.types';
import { PriceSnapshot } from './coaching-prices.service';
import { CoachingProductAlertDto, CoachingProductVerificationDto } from './coaching.dto';

/** Le contenu jugeable d'une fiche, tel que le moteur l'a lu. */
export interface ProductContent { facts: string[]; forbidden: ForbiddenClaim[] }

/** Le référentiel figé envoyé avec chaque analyse (contrat du moteur). */
export interface ReferenceInput {
  version: number;
  contentHash: string;
  plan: { markdown: string; contentHash: string; criteria: ParsedSalesPlan };
  products: Array<{
    key: string; label: string; identifiers: string[]; sttTerms: string[];
    sheet: { markdown: string; contentHash: string; content: ProductContent } | null;
    prices: PriceSnapshot['prices']; priceVerification?: PriceSnapshot['priceVerification'];
  }>;
}

/** Ancien contrat : les analyses lancées avant le référentiel unique le gardent. */
export interface LegacyReferences {
  plan: { markdown: string; contentHash: string; criteria: ParsedSalesPlan; version: number };
  products: Array<{ markdown: string; contentHash: string; versionId: number; sheet: ParsedProductSheet; prices: PriceSnapshot['prices']; priceVerification?: PriceSnapshot['priceVerification'] }>;
}

/** Ce qu'une analyse fige à sa création : le référentiel, ou l'ancien couple plan + fiches. */
export type FrozenReferences = { reference: ReferenceInput } | LegacyReferences;

export type ComputeRequest = FrozenReferences & {
  requestKey: string;
  audio: { key: string; url: string };
  statutPorte?: string | null;
  transcript?: string | null;
  transcriptDurationSec?: number | null;
};

/** Un problème de cohérence du référentiel : une erreur bloque la publication. */
export interface ReferenceIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  productKey?: string;
  stepKey?: string;
}

/** Réponse de `POST /coaching/parse/reference`. */
export interface ParsedReference {
  valid: boolean;
  issues: ReferenceIssue[];
  plan: { plan: ParsedSalesPlan; rawMarkdown: string; contentHash: string } | null;
  products: Array<{ key: string; label: string; identifiers: string[]; sttTerms: string[]; sheet: { content: ProductContent; rawMarkdown: string; contentHash: string } | null }>;
  contentHash: string | null;
}

/** Un référentiel à valider : plan et catalogue, fiches en markdown. */
export interface ReferenceDraftRequest {
  plan: { markdown: string };
  products: Array<{ key: string; label: string; identifiers: string[]; sttTerms: string[]; sheet: { markdown: string } | null }>;
}

export interface ComputeResult {
  requestKey: string; source: string; tenantId: string; audioKey: string; status: 'READY';
  /** Provenance rappelée par le moteur, selon le contrat de la requête. */
  reference?: { version: number; contentHash: string };
  plan?: LegacyReferences['plan']; products?: LegacyReferences['products'];
  judgedProducts?: string[];
  durationSec: number; transcript: string; confidence: number | null;
  score: number | null; scoreBeforeMalus: number | null; malus: number | null; summary: string | null;
  subScores: Prisma.JsonValue; strengths: Prisma.JsonValue; improvements: Prisma.JsonValue;
  recommendations: Prisma.JsonValue; criterionResults: Prisma.JsonValue; violations: Prisma.JsonValue;
  detectedProducts: Prisma.JsonValue; productMapping: Prisma.JsonValue; productSheetVersions: Prisma.JsonValue;
  productAlerts?: Array<CoachingProductAlertDto & { contextQuote: string; productEvidence: string; relevanceReason: string }>;
  productVerification?: CoachingProductVerificationDto;
}
export interface TranscriptResult {
  requestKey: string; source: string; tenantId: string; audioKey: string;
  transcript: string; durationSec: number; metadata?: unknown;
}
export class CoachingStageError extends Error {
  constructor(readonly code: 'STT_BUSY' | 'STT_TIMEOUT' | 'STT_FAILED' | 'EVALUATION_TIMEOUT' | 'EVALUATION_FAILED' | 'REQUEST_TOO_LARGE', readonly retryAfterMs = 60_000) { super(code); }
}
@Injectable()
export class CoachingApiClient {
  private readonly baseUrl = (process.env.COACHING_API_URL ?? '').replace(/\/+$/, '');
  private readonly apiKey = process.env.COACHING_API_KEY ?? '';
  readonly timeoutMs = this.bounded(process.env.COACHING_TRANSCRIBE_TIMEOUT_MS, 5_880_000, 6_000_000);
  readonly evaluationTimeoutMs = this.bounded(process.env.COACHING_EVALUATE_TIMEOUT_MS, 600_000, 1_800_000);
  private bounded(raw: string | undefined, fallback: number, max: number) { const value = Number(raw); return Number.isFinite(value) && value >= 60_000 && value <= max ? value : fallback; }
  isConfigured() { return Boolean(this.baseUrl); }
  /** Validation complète d'un référentiel ; ses erreurs font partie de la réponse. */
  async parseReference(draft: ReferenceDraftRequest): Promise<ParsedReference> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('COACHING_API_URL absent');
    try { return (await axios.post<ParsedReference>(`${this.baseUrl}/coaching/parse/reference`, draft, { headers: { 'x-api-key': this.apiKey, 'x-tenant-id': CRM_TENANT }, timeout: 15_000 })).data; }
    catch { throw new ServiceUnavailableException('Validation du référentiel indisponible'); }
  }
  transcribe(input: ComputeRequest): Promise<TranscriptResult> { return this.stage('transcribe', input, this.timeoutMs); }
  evaluate(input: ComputeRequest): Promise<ComputeResult> { return this.stage('evaluate', input, this.evaluationTimeoutMs); }
  private async stage<T>(stage: 'transcribe' | 'evaluate', input: ComputeRequest, timeout: number): Promise<T> {
    try { return (await axios.post<T>(`${this.baseUrl}/coaching/${stage}`, input, { headers: { 'x-api-key': this.apiKey, 'x-tenant-id': CRM_TENANT }, timeout })).data; }
    catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 413) throw new CoachingStageError('REQUEST_TOO_LARGE');
      if (status === 429 || (status === 503 && axios.isAxiosError(error) && error.response?.data?.message === 'STT_BUSY')) {
        const seconds = Number(axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : 60);
        throw new CoachingStageError('STT_BUSY', Number.isFinite(seconds) ? Math.max(30_000, Math.min(300_000, seconds * 1000)) : 60_000);
      }
      const timedOut = status === 504 || axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
      throw new CoachingStageError(stage === 'transcribe' ? (timedOut ? 'STT_TIMEOUT' : 'STT_FAILED') : (timedOut ? 'EVALUATION_TIMEOUT' : 'EVALUATION_FAILED'));
    }
  }
}
