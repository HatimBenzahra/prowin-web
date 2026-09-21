import { Injectable, Logger,  } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ParsedSalesPlan,
  SalesPlanCriteriaPayload,
} from './sales-plan.types';
import { CRM_TENANT } from '../shared/crm-scope';

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

  constructor(private readonly prisma: PrismaService) {}

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
