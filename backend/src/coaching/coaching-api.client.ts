import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { CRM_TENANT } from './shared/crm-scope';
import { ParsedSalesPlan } from './referentiels/sales-plan.types';
import { ParsedProductSheet } from './referentiels/product-sheet.types';
import { PriceSnapshot } from './coaching-prices.service';
import { CoachingProductAlertDto, CoachingProductVerificationDto } from './coaching.dto';

export interface ComputeRequest {
  requestKey: string;
  audio: { key: string; url: string };
  statutPorte?: string | null;
  transcript?: string | null;
  transcriptDurationSec?: number | null;
  plan: { markdown: string; contentHash: string; criteria: ParsedSalesPlan; version: number };
  products: Array<{ markdown: string; contentHash: string; versionId: number; sheet: ParsedProductSheet; prices: PriceSnapshot['prices']; priceVerification?: PriceSnapshot['priceVerification'] }>;
}
export interface ComputeResult {
  requestKey: string; source: string; tenantId: string; audioKey: string; status: 'READY';
  plan: ComputeRequest['plan']; products: ComputeRequest['products'];
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
  async parsePlan(markdown: string): Promise<{ plan: ParsedSalesPlan; rawMarkdown: string; contentHash: string }> {
    return this.parse('plan', markdown);
  }
  async parseSheet(markdown: string): Promise<{ sheet: ParsedProductSheet; rawMarkdown: string; contentHash: string }> {
    return this.parse('sheet', markdown);
  }
  private async parse<T>(kind: string, markdown: string): Promise<T> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('COACHING_API_URL absent');
    try { return (await axios.post<T>(`${this.baseUrl}/coaching/parse/${kind}`, { markdown }, { headers: { 'x-api-key': this.apiKey, 'x-tenant-id': CRM_TENANT }, timeout: 15_000 })).data; }
    catch (error) {
      // 400 = contenu refusé par le parseur : son message dit à l'auteur quoi corriger.
      const raw = axios.isAxiosError<{ message?: unknown }>(error) && error.response?.status === 400 ? error.response.data?.message : undefined;
      const message = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === 'string').join(' ; ') : raw;
      if (typeof message === 'string' && message.trim()) throw new BadRequestException(message);
      throw new ServiceUnavailableException('Validation du référentiel indisponible');
    }
  }
  async compute(input: ComputeRequest): Promise<ComputeResult> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('COACHING_API_URL absent');
    try {
      return (await axios.post<ComputeResult>(`${this.baseUrl}/coaching/compute`, input, {
        headers: { 'x-api-key': this.apiKey, 'x-tenant-id': CRM_TENANT }, timeout: this.timeoutMs,
      })).data;
    } catch {
      // Axios errors contain signed URLs and auth headers. Never persist/log them.
      throw new ServiceUnavailableException('Calcul coaching indisponible ou délai dépassé');
    }
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
