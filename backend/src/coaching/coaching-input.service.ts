import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CoachingAnalysis, SalesPlanVersion } from '@prisma/client';
import { SalesPlanService } from './referentiels/sales-plan.service';
import { ProductSheetService } from './referentiels/product-sheet.service';
import { ComputeRequest } from './coaching-api.client';
import { createHash } from 'crypto';
import { CoachingPricesService } from './coaching-prices.service';

/** Caller owns audio access and reference versions. No credentials cross HTTP. */
@Injectable()
export class CoachingInputService {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-west-3' });
  constructor(private readonly plans: SalesPlanService, private readonly sheets: ProductSheetService, private readonly tariffs: CoachingPricesService) {}
  async references(version: SalesPlanVersion, userToken?: string): Promise<Pick<ComputeRequest, 'plan' | 'products'>> {
    if (createHash('sha256').update(version.rawMarkdown).digest('hex') !== version.contentHash) throw new Error('Hash du plan local incompatible');
    const plan = this.plans.toParsedPlan(version);
    const keys = plan.steps.flatMap(s => /^productDetected:(.+)$/.exec(s.appliesWhen)?.[1] ?? []);
    const rows = (await this.sheets.listActiveSheets()).filter(s => keys.includes(s.productKey));
    const parsed = rows.map(row => this.sheets.toParsedSheet(row));
    const prices = await this.tariffs.snapshots(parsed.map(sheet => sheet.winleadplus), userToken);
    return {
      plan: { markdown: version.rawMarkdown, contentHash: version.contentHash, version: version.version, criteria: plan },
      products: rows.map((row, i) => ({ markdown: row.rawMarkdown, contentHash: row.contentHash, versionId: row.id, sheet: parsed[i], ...prices[i] })),
    };
  }
  async request(row: CoachingAnalysis, references: Pick<ComputeRequest, 'plan' | 'products'>): Promise<ComputeRequest> {
    const url = typeof row.transcript === 'string' && row.transcriptDurationSec != null ? '' : await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: row.s3KeyOriginal }), { expiresIn: 3600 });
    return { ...references, requestKey: row.remoteRequestKey!, audio: { key: row.s3KeyOriginal, url }, statutPorte: row.statutPorte, transcript: row.transcript, transcriptDurationSec: row.transcriptDurationSec };
  }
}
