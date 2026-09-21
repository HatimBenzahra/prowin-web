import { Injectable, Logger,  } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ForbiddenClaim,
  ParsedProductSheet,
  ParsedProductSheetFile,
  WinLeadPlusBinding,
} from './product-sheet.types';
import { StepApplicability } from './sales-plan.types';
import { CRM_TENANT } from '../shared/crm-scope';

type ProductSheetVersionRow = {
  id: number;
  slug: string;
  label: string;
  productKey: string;
  facts: unknown;
  identifiers: unknown;
  sttTerms: unknown;
  forbidden: unknown;
  winleadplus: unknown;
};

/** Fiche active + l'id de version utilisé, pour la traçabilité de l'analyse. */
export interface ActiveProductSheet {
  versionId: number;
  sheet: ParsedProductSheet;
}

/**
 * De quoi nommer et reconnaître une offre, jamais de quoi la juger : c'est la
 * seule chose qu'on charge pour TOUTES les offres, avant de savoir ce qui a été abordé.
 */
export interface ProductSheetDescriptor {
  productKey: string;
  label: string;
  identifiers: string[];
  sttTerms: string[];
}

/** Charge les fiches au boot et les versionne par sha256, comme SalesPlanService. */
@Injectable()
export class ProductSheetService {
  private readonly logger = new Logger(ProductSheetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Un produit sans fiche est absent du résultat : la passe 2 ne l'invente pas. */
  async getActiveSheetsFor(
    productKeys: string[],
  ): Promise<ActiveProductSheet[]> {
    if (productKeys.length === 0) return [];
    const rows = await this.prisma.productSheetVersion.findMany({
      where: {
        tenantId: CRM_TENANT,
        productKey: { in: productKeys },
        isActive: true,
      },
    });
    return rows.map((row) => ({
      versionId: row.id,
      sheet: this.toParsedSheet(row),
    }));
  }

  /** Sans `facts` ni `forbidden` : nommer une offre ne donne pas le droit de la juger. */
  async getActiveDescriptors(
    productKeys: string[],
  ): Promise<ProductSheetDescriptor[]> {
    if (productKeys.length === 0) return [];
    const rows = await this.prisma.productSheetVersion.findMany({
      where: {
        tenantId: CRM_TENANT,
        productKey: { in: productKeys },
        isActive: true,
      },
      select: {
        productKey: true,
        label: true,
        identifiers: true,
        sttTerms: true,
      },
    });
    return rows.map((row) => ({
      productKey: row.productKey,
      label: row.label,
      identifiers: Array.isArray(row.identifiers)
        ? (row.identifiers as string[])
        : [],
      sttTerms: Array.isArray(row.sttTerms) ? (row.sttTerms as string[]) : [],
    }));
  }

  /** Toutes les fiches actives — alimente l'onglet Produits en lecture seule. */
  async listActiveSheets() {
    return this.prisma.productSheetVersion.findMany({
      where: { tenantId: CRM_TENANT, isActive: true },
      orderBy: { label: 'asc' },
    });
  }

  /** Reconstruit la fiche structurée à partir d'une ligne DB. */
  toParsedSheet(row: ProductSheetVersionRow): ParsedProductSheet {
    return {
      slug: row.slug,
      label: row.label,
      appliesTo: `productDetected:${row.productKey}` as StepApplicability,
      productKey: row.productKey,
      facts: Array.isArray(row.facts) ? (row.facts as string[]) : [],
      identifiers: Array.isArray(row.identifiers)
        ? (row.identifiers as string[])
        : [],
      sttTerms: Array.isArray(row.sttTerms) ? (row.sttTerms as string[]) : [],
      forbidden: Array.isArray(row.forbidden)
        ? (row.forbidden as ForbiddenClaim[])
        : [],
      winleadplus: (row.winleadplus as WinLeadPlusBinding | null) ?? undefined,
    };
  }
}
