import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
@Injectable()
export class CoachingApiClient {
  private readonly baseUrl = (process.env.COACHING_API_URL ?? '').replace(/\/+$/, '');
  private readonly apiKey = process.env.COACHING_API_KEY ?? '';
  readonly timeoutMs = Math.max(60_000, Number(process.env.COACHING_COMPUTE_TIMEOUT_MS) || 1_800_000);
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
    catch { throw new ServiceUnavailableException('Validation du référentiel indisponible ou contenu invalide'); }
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
}
