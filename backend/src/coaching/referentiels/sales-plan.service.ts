import { Injectable, Logger,  } from '@nestjs/common';
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

/**
 * Charge les plans de vente markdown (dossier sales-plans/) au démarrage,
 * les versionne en DB (clé = sha256 du contenu) et expose la version active.
 */
@Injectable()
export class SalesPlanService {
  private readonly logger = new Logger(SalesPlanService.name);

  constructor(private readonly prisma: PrismaService, private readonly api: CoachingApiClient) {}

  /** The engine parses; only this application versions and stores the reference. */
  async importPlan(markdown: string) {
    const parsed = await this.api.parsePlan(markdown);
    if (parsed.rawMarkdown !== markdown || parsed.contentHash !== createHash('sha256').update(markdown).digest('hex')) throw new Error('Plan retourné incompatible');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coaching-plan:${CRM_TENANT}:${parsed.plan.slug}`}))`;
      let row = await tx.salesPlanVersion.findUnique({ where: { tenantId_contentHash: { tenantId: CRM_TENANT, contentHash: parsed.contentHash } } });
      if (!row) {
        const last = await tx.salesPlanVersion.findFirst({ where: { tenantId: CRM_TENANT, slug: parsed.plan.slug }, orderBy: { version: 'desc' } });
        const { slug, title, ...criteria } = parsed.plan;
        row = await tx.salesPlanVersion.create({ data: { tenantId: CRM_TENANT, slug, title, version: (last?.version ?? 0) + 1, contentHash: parsed.contentHash, rawMarkdown: markdown, criteria: JSON.parse(JSON.stringify(criteria)) } });
      }
      await tx.salesPlanVersion.updateMany({ where: { tenantId: CRM_TENANT, slug: row.slug, isActive: true, NOT: { id: row.id } }, data: { isActive: false } });
      return tx.salesPlanVersion.update({ where: { id: row.id }, data: { isActive: true } });
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
