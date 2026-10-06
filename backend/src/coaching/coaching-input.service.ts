import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CoachingAnalysis } from '@prisma/client';
import { ComputeRequest, FrozenReferences, ProductContent } from './coaching-api.client';
import { CoachingPricesService } from './coaching-prices.service';
import { ReferenceService, ReferenceWithProducts } from './referentiels/reference.service';
import { WinLeadPlusBinding } from './referentiels/product-sheet.types';

/** Caller owns audio access and reference versions. No credentials cross HTTP. */
@Injectable()
export class CoachingInputService {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-west-3' });
  constructor(private readonly references: ReferenceService, private readonly tariffs: CoachingPricesService) {}

  /**
   * Fige un référentiel publié pour une analyse : plan, catalogue, fiches, et les prix
   * des produits jugeables (lus une fois, à cet instant).
   */
  async freeze(reference: ReferenceWithProducts, userToken?: string): Promise<FrozenReferences> {
    const plan = this.references.planOf(reference);
    if (reference.version === null || !reference.contentHash || !reference.planMarkdown || !reference.planContentHash || !plan) throw new Error('Référentiel non publié');
    const judged = reference.products.filter(p => p.sheetMarkdown);
    const prices = await this.tariffs.snapshots(judged.map(bindingOf), userToken);
    return {
      reference: {
        version: reference.version,
        contentHash: reference.contentHash,
        plan: { markdown: reference.planMarkdown, contentHash: reference.planContentHash, criteria: plan },
        products: reference.products.map(product => {
          const price = prices[judged.indexOf(product)];
          return {
            key: product.key, label: product.label, identifiers: product.identifiers, sttTerms: product.sttTerms,
            sheet: product.sheetMarkdown ? { markdown: product.sheetMarkdown, contentHash: product.sheetContentHash!, content: product.sheetContent as unknown as ProductContent } : null,
            ...(price ?? { prices: null }),
          };
        }),
      },
    };
  }

  async request(row: CoachingAnalysis, references: FrozenReferences): Promise<ComputeRequest> {
    const url = typeof row.transcript === 'string' && row.transcriptDurationSec != null ? '' : await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: row.s3KeyOriginal }), { expiresIn: 3600 });
    return { ...references, requestKey: row.remoteRequestKey!, audio: { key: row.s3KeyOriginal, url }, statutPorte: row.statutPorte, transcript: row.transcript, transcriptDurationSec: row.transcriptDurationSec };
  }
}

/** Les offres WinLead+ d'un produit : par identifiants, sinon par fournisseur. */
function bindingOf(product: { offreExternalIds: number[]; offreFournisseur: string | null }): WinLeadPlusBinding | undefined {
  if (product.offreExternalIds.length) return { externalIds: product.offreExternalIds };
  return product.offreFournisseur ? { match: { fournisseur: product.offreFournisseur } } : undefined;
}
