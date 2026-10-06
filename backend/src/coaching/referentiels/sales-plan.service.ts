import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ParsedSalesPlan,
  SalesPlanCriteriaPayload,
} from './sales-plan.types';
import { CRM_TENANT } from '../shared/crm-scope';
import { CoachingApiClient } from '../coaching-api.client';
import { createHash } from 'crypto';

type SalesPlanVersionRow = {
  id: number;
  slug: string;
  title: string;
  version: number;
  criteria: unknown;
  rawMarkdown: string;
};

/** Ligne d'historique : de quoi choisir une version, sans son contenu. */
const VERSION_SUMMARY = { id: true, version: true, createdAt: true, importedBy: true, isActive: true, contentHash: true } as const;

/**
 * Plans de vente de ce CRM, versionnés en DB (clé = sha256 du contenu), importés
 * depuis l'interface Coaching IA. Un seul plan actif pour tout le CRM, quel que soit
 * son slug : un import sous un autre slug remplace le plan, il ne s'y ajoute pas.
 */
@Injectable()
export class SalesPlanService {
  constructor(private readonly prisma: PrismaService, private readonly api: CoachingApiClient) {}

  /** The engine parses; only this application versions and stores the reference. */
  async importPlan(markdown: string, importedBy?: string) {
    const parsed = await this.api.parsePlan(markdown);
    if (parsed.rawMarkdown !== markdown || parsed.contentHash !== createHash('sha256').update(markdown).digest('hex')) throw new Error('Plan retourné incompatible');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coaching-plan:${CRM_TENANT}`}))`;
      let row = await tx.salesPlanVersion.findUnique({ where: { tenantId_contentHash: { tenantId: CRM_TENANT, contentHash: parsed.contentHash } } });
      if (!row) {
        const last = await tx.salesPlanVersion.findFirst({ where: { tenantId: CRM_TENANT, slug: parsed.plan.slug }, orderBy: { version: 'desc' } });
        const { slug, title, ...criteria } = parsed.plan;
        row = await tx.salesPlanVersion.create({ data: { tenantId: CRM_TENANT, slug, title, version: (last?.version ?? 0) + 1, contentHash: parsed.contentHash, rawMarkdown: markdown, criteria: JSON.parse(JSON.stringify(criteria)), importedBy } });
      }
      await tx.salesPlanVersion.updateMany({ where: { tenantId: CRM_TENANT, isActive: true, NOT: { id: row.id } }, data: { isActive: false } });
      return tx.salesPlanVersion.update({ where: { id: row.id }, data: { isActive: true } });
    });
  }

  /** Historique d'un plan, la plus récente d'abord. */
  listVersions(slug: string) {
    return this.prisma.salesPlanVersion.findMany({
      where: { tenantId: CRM_TENANT, slug },
      orderBy: { version: 'desc' },
      select: VERSION_SUMMARY,
    });
  }

  /** Une version précise, contenu compris, pour la consulter avant de la réactiver. */
  async getVersion(id: number) {
    const row = await this.prisma.salesPlanVersion.findFirst({ where: { id, tenantId: CRM_TENANT } });
    if (!row) throw new NotFoundException('Version de plan introuvable');
    return row;
  }

  /** Réactive une version existante : les prochaines analyses seront notées avec elle. */
  async activateVersion(id: number) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.salesPlanVersion.findFirst({ where: { id, tenantId: CRM_TENANT } });
      if (!row) throw new NotFoundException('Version de plan introuvable');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coaching-plan:${CRM_TENANT}`}))`;
      await tx.salesPlanVersion.updateMany({ where: { tenantId: CRM_TENANT, isActive: true, NOT: { id } }, data: { isActive: false } });
      return tx.salesPlanVersion.update({ where: { id }, data: { isActive: true } });
    });
  }

  /**
   * Version active pour un slug donné, ou la plus récente si slug omis.
   *
   * Toujours restreinte au CRM : depuis que le moteur héberge le référentiel d'autres
   * organisations, « le plan actif » sans autre précision désignerait aussi bien celui
   * d'une autre, et le CRM noterait ses commerciaux contre un plan qui n'est pas le sien.
   */
  async getActiveVersion(slug?: string) {
    return this.prisma.salesPlanVersion.findFirst({
      where: { tenantId: CRM_TENANT, isActive: true, ...(slug ? { slug } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Reconstruit le plan structuré à partir d'une ligne DB. */
  toParsedPlan(row: SalesPlanVersionRow): ParsedSalesPlan {
    const c = (row.criteria ?? {}) as SalesPlanCriteriaPayload;
    return {
      slug: row.slug,
      title: row.title,
      scoringScale: c.scoringScale ?? 100,
      // Analyses antérieures au malus : barème par défaut, aucune violation à leur appliquer.
      malus: c.malus ?? { grave: 15, modere: 8, maxTotal: 30 },
      steps: c.steps ?? [],
      context: c.context,
      language: c.language,
      sttTerms: c.sttTerms,
    };
  }
}
