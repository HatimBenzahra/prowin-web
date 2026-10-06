import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  ForbiddenClaim,
  ParsedProductSheet,
  WinLeadPlusBinding,
} from './product-sheet.types';
import { StepApplicability } from './sales-plan.types';
import { CRM_TENANT } from '../shared/crm-scope';
import { CoachingApiClient } from '../coaching-api.client';
import { createHash } from 'crypto';

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

type SheetTx = Pick<Prisma.TransactionClient, '$executeRaw'>;

/**
 * Sérialise les écritures d'une fiche : par slug (versions) ET par produit (une seule
 * fiche active par productKey). Toujours dans le même ordre, donc sans interblocage.
 */
async function lockSheet(tx: SheetTx, slug: string, productKey: string) {
  for (const key of [`coaching-sheet:${CRM_TENANT}:${slug}`, `coaching-sheet-product:${CRM_TENANT}:${productKey}`]) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

/**
 * Les versions actives qu'une activation remplace : celles de la même fiche, et toute
 * autre fiche du même produit — l'analyse joint sur productKey, deux fiches actives
 * pour un produit feraient juger sa conformité deux fois.
 */
function competingSheets(row: { id: number; slug: string; productKey: string }): Prisma.ProductSheetVersionWhereInput {
  return { tenantId: CRM_TENANT, isActive: true, NOT: { id: row.id }, OR: [{ slug: row.slug }, { productKey: row.productKey }] };
}

/** Ligne d'historique : de quoi choisir une version, sans son contenu. */
const VERSION_SUMMARY = { id: true, version: true, createdAt: true, importedBy: true, isActive: true, contentHash: true } as const;

/**
 * Fiches produit de ce CRM, versionnées par sha256 comme les plans et importées
 * depuis l'interface Coaching IA. Au plus une fiche active par slug et par produit.
 */
@Injectable()
export class ProductSheetService {
  constructor(private readonly prisma: PrismaService, private readonly api: CoachingApiClient) {}

  async importSheet(markdown: string, importedBy?: string) {
    const parsed = await this.api.parseSheet(markdown);
    if (parsed.rawMarkdown !== markdown || parsed.contentHash !== createHash('sha256').update(markdown).digest('hex')) throw new Error('Fiche retournée incompatible');
    return this.prisma.$transaction(async tx => {
      await lockSheet(tx, parsed.sheet.slug, parsed.sheet.productKey);
      let row = await tx.productSheetVersion.findUnique({ where: { tenantId_contentHash: { tenantId: CRM_TENANT, contentHash: parsed.contentHash } } });
      if (!row) {
        const last = await tx.productSheetVersion.findFirst({ where: { tenantId: CRM_TENANT, slug: parsed.sheet.slug }, orderBy: { version: 'desc' } });
        const { slug, label, productKey, facts, identifiers, sttTerms, forbidden, winleadplus } = parsed.sheet;
        row = await tx.productSheetVersion.create({ data: { tenantId: CRM_TENANT, slug, label, productKey, facts, identifiers, sttTerms, forbidden: JSON.parse(JSON.stringify(forbidden)), winleadplus: winleadplus ? JSON.parse(JSON.stringify(winleadplus)) : undefined, version: (last?.version ?? 0) + 1, contentHash: parsed.contentHash, rawMarkdown: markdown, importedBy } });
      }
      await tx.productSheetVersion.updateMany({ where: competingSheets(row), data: { isActive: false } });
      return tx.productSheetVersion.update({ where: { id: row.id }, data: { isActive: true } });
    });
  }

  /** Historique d'une fiche, la plus récente d'abord. */
  listVersions(slug: string) {
    return this.prisma.productSheetVersion.findMany({
      where: { tenantId: CRM_TENANT, slug },
      orderBy: { version: 'desc' },
      select: VERSION_SUMMARY,
    });
  }

  /** Une version précise, contenu compris, pour la consulter avant de la réactiver. */
  async getVersion(id: number) {
    const row = await this.prisma.productSheetVersion.findFirst({ where: { id, tenantId: CRM_TENANT } });
    if (!row) throw new NotFoundException('Version de fiche introuvable');
    return row;
  }

  /** Réactive une version existante de la fiche. */
  async activateVersion(id: number) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.productSheetVersion.findFirst({ where: { id, tenantId: CRM_TENANT } });
      if (!row) throw new NotFoundException('Version de fiche introuvable');
      await lockSheet(tx, row.slug, row.productKey);
      await tx.productSheetVersion.updateMany({ where: competingSheets(row), data: { isActive: false } });
      return tx.productSheetVersion.update({ where: { id }, data: { isActive: true } });
    });
  }

  /**
   * Retire la fiche (offre sortie du plan) sans rien supprimer : plus aucune version
   * active, donc plus de conformité jugée pour ce produit. Un nouvel import la réactive.
   */
  async deactivateSheet(slug: string): Promise<boolean> {
    const { count } = await this.prisma.productSheetVersion.updateMany({
      where: { tenantId: CRM_TENANT, slug, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) throw new NotFoundException('Aucune fiche active pour ce slug');
    return true;
  }

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
