import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { CoachingReference, CoachingReferenceProduct, CoachingReferenceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CoachingApiClient, ParsedReference, ReferenceDraftRequest, ReferenceIssue } from '../coaching-api.client';
import { CRM_SOURCE, CRM_TENANT } from '../shared/crm-scope';
import { ParsedSalesPlan } from './sales-plan.types';

export type ReferenceWithProducts = CoachingReference & { products: CoachingReferenceProduct[] };

/** L'identité d'un produit et ses offres, telles que l'admin les saisit. */
export interface ReferenceProductFields {
  key: string;
  label: string;
  identifiers: string[];
  sttTerms: string[];
  offreExternalIds: number[];
  offreFournisseur: string | null;
}

export interface ReferenceDraftState {
  reference: ReferenceWithProducts;
  issues: ReferenceIssue[];
}

type Tx = Prisma.TransactionClient;
const WITH_PRODUCTS = { products: { orderBy: { position: 'asc' } } } as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
/** Le moteur répond en moins de 15 s ; la transaction garde le verrou pendant l'appel. */
const TX_OPTIONS = { timeout: 30_000 };
/** La migration appelle le moteur deux fois sous le même verrou. */
const MIGRATION_TX_OPTIONS = { timeout: 60_000 };

/**
 * Le référentiel coaching du CRM : plan de vente + catalogue de produits, publiés
 * ensemble. On modifie un brouillon, le moteur valide la cohérence, la publication
 * crée une version figée et active. Toutes les écritures passent sous un même verrou.
 */
@Injectable()
export class ReferenceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(private readonly prisma: PrismaService, private readonly api: CoachingApiClient) {}

  /**
   * Migration de l'ancien modèle au démarrage, avant tout trafic : sans elle, aucune
   * analyse n'aurait de référentiel actif. Idempotente ; un échec (moteur injoignable)
   * est journalisé et se rattrape au démarrage suivant ou par le script dédié.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.api.isConfigured()) return;
    try {
      const result = await this.migrateLegacy();
      if (result.migrated) this.logger.log(`Référentiel v${result.version} créé depuis l'ancien modèle (${result.products} produits, ${result.analyses} analyses rattachées)`);
    } catch (error) {
      this.logger.error(`Migration du référentiel échouée : ${(error as Error).message}`);
    }
  }

  getActive(): Promise<ReferenceWithProducts | null> {
    return this.prisma.coachingReference.findFirst({ where: { tenantId: CRM_TENANT, isActive: true }, include: WITH_PRODUCTS });
  }

  async getPublished(id: number): Promise<ReferenceWithProducts> {
    const row = await this.prisma.coachingReference.findFirst({ where: { id, tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED }, include: WITH_PRODUCTS });
    if (!row) throw new NotFoundException('Version de référentiel introuvable');
    return row;
  }

  /** Versions publiées, la plus récente d'abord. */
  listPublished() {
    return this.prisma.coachingReference.findMany({
      where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, isActive: true, contentHash: true, publishedAt: true, publishedBy: true },
    });
  }

  /** Le brouillon en cours et son état de validation, ou null. */
  async getDraft(): Promise<ReferenceDraftState | null> {
    const draft = await this.findDraft(this.prisma);
    return draft ? { reference: draft, issues: (await this.validate(draft)).issues } : null;
  }

  /** Ouvre le brouillon à partir de la version active (ou vide s'il n'y en a pas). */
  async openDraft(author: string): Promise<ReferenceDraftState> {
    await this.locked(async tx => {
      if (await this.findDraft(tx)) return;
      const active = await tx.coachingReference.findFirst({ where: { tenantId: CRM_TENANT, isActive: true }, include: WITH_PRODUCTS });
      // Tant que l'ancien plan n'est pas migré, un brouillon vide le masquerait.
      if (!active && await tx.salesPlanVersion.count({ where: { tenantId: CRM_TENANT, isActive: true } })) {
        throw new ConflictException('Le référentiel n\'est pas encore migré depuis l\'ancien plan de vente : réessayez dans un instant.');
      }
      await tx.coachingReference.create({
        data: {
          tenantId: CRM_TENANT, createdBy: author,
          ...(active ? { planMarkdown: active.planMarkdown, planContentHash: active.planContentHash, planSlug: active.planSlug, planTitle: active.planTitle, planCriteria: json(active.planCriteria) } : {}),
          products: { create: (active?.products ?? []).map(({ id: _id, referenceId: _ref, sheetContent, ...product }) => ({ ...product, sheetContent: sheetContent === null ? Prisma.DbNull : json(sheetContent) })) },
        },
      });
    });
    return (await this.getDraft())!;
  }

  /** Remplace le plan du brouillon ; un plan illisible est refusé avec le message du parseur. */
  async setDraftPlan(markdown: string): Promise<ReferenceDraftState> {
    return this.editDraft(async (tx, draft) => {
      const parsed = await this.validate({ ...draft, planMarkdown: markdown });
      rejectIssues(parsed, i => i.code === 'PLAN_INVALID');
      const plan = parsed.plan!;
      await tx.coachingReference.update({ where: { id: draft.id }, data: { planMarkdown: markdown, planContentHash: plan.contentHash, planSlug: plan.plan.slug, planTitle: plan.plan.title, planCriteria: json(plan.plan) } });
    });
  }

  /** Crée ou modifie un produit du brouillon (sa clé ne change jamais). */
  async saveDraftProduct(fields: ReferenceProductFields): Promise<ReferenceDraftState> {
    const product = normalizeFields(fields);
    return this.editDraft(async (tx, draft) => {
      const existing = draft.products.find(p => p.key === product.key);
      const candidate = existing ? draft.products.map(p => (p.key === product.key ? { ...p, ...product } : p)) : [...draft.products, { ...product, sheetMarkdown: null } as CoachingReferenceProduct];
      rejectIssues(await this.validate({ ...draft, products: candidate }), i => i.productKey === product.key && ['PRODUCT_KEY_INVALID', 'PRODUCT_LABEL_MISSING', 'PRODUCT_INVALID'].includes(i.code));
      if (existing) {
        await tx.coachingReferenceProduct.update({ where: { id: existing.id }, data: product });
      } else {
        const position = draft.products.reduce((max, p) => Math.max(max, p.position + 1), 0);
        await tx.coachingReferenceProduct.create({ data: { ...product, position, referenceId: draft.id } });
      }
    });
  }

  /** Remplace la fiche d'un produit du brouillon ; une fiche illisible est refusée. */
  async setDraftProductSheet(key: string, markdown: string): Promise<ReferenceDraftState> {
    return this.editDraft(async (tx, draft) => {
      const product = findProduct(draft, key);
      const parsed = await this.validate({ ...draft, products: draft.products.map(p => (p.key === key ? { ...p, sheetMarkdown: markdown } : p)) });
      rejectIssues(parsed, i => i.code === 'SHEET_INVALID' && i.productKey === key);
      const sheet = parsed.products.find(p => p.key === key)!.sheet!;
      await tx.coachingReferenceProduct.update({ where: { id: product.id }, data: { sheetMarkdown: markdown, sheetContentHash: sheet.contentHash, sheetContent: json(sheet.content) } });
    });
  }

  /** Retire un produit du brouillon ; refusé tant qu'une étape du plan le vise. */
  async removeDraftProduct(key: string): Promise<ReferenceDraftState> {
    return this.editDraft(async (tx, draft) => {
      const product = findProduct(draft, key);
      rejectIssues(await this.validate({ ...draft, products: draft.products.filter(p => p.key !== key) }), i => i.code === 'PLAN_PRODUCT_UNKNOWN' && i.productKey === key);
      await tx.coachingReferenceProduct.delete({ where: { id: product.id } });
    });
  }

  async discardDraft(): Promise<boolean> {
    return this.locked(async tx => (await tx.coachingReference.deleteMany({ where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.DRAFT } })).count > 0);
  }

  /**
   * Publie le brouillon : il devient la version active. Un contenu identique à une
   * version déjà publiée la réactive simplement, sans créer de doublon.
   */
  async publishDraft(author: string): Promise<ReferenceWithProducts> {
    const id = await this.locked(async tx => {
      const draft = await this.findDraft(tx);
      if (!draft) throw new NotFoundException('Aucun brouillon de référentiel');
      const parsed = await this.validate(draft);
      rejectIssues(parsed, i => i.level === 'error');
      // L'empreinte du moteur ignore les offres (les prix sont lus à chaque analyse) :
      // un brouillon ne rejoint une version publiée que si son catalogue est identique.
      const candidates = await tx.coachingReference.findMany({ where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED, contentHash: parsed.contentHash! }, include: WITH_PRODUCTS });
      const same = candidates.find(c => sameCatalogue(c.products, draft.products));
      const target = same?.id ?? draft.id;
      await tx.coachingReference.updateMany({ where: { tenantId: CRM_TENANT, isActive: true, NOT: { id: target } }, data: { isActive: false } });
      if (same) {
        await tx.coachingReference.delete({ where: { id: draft.id } });
        await tx.coachingReference.update({ where: { id: same.id }, data: { isActive: true } });
      } else {
        const last = await tx.coachingReference.aggregate({ where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED }, _max: { version: true } });
        await tx.coachingReference.update({ where: { id: draft.id }, data: { status: CoachingReferenceStatus.PUBLISHED, version: (last._max.version ?? 0) + 1, contentHash: parsed.contentHash, isActive: true, publishedBy: author, publishedAt: new Date() } });
      }
      return target;
    });
    return this.getPublished(id);
  }

  /** Réactive une version publiée : les prochaines analyses l'utiliseront. */
  async activate(id: number): Promise<ReferenceWithProducts> {
    await this.locked(async tx => {
      const target = await tx.coachingReference.findFirst({ where: { id, tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED } });
      if (!target) throw new NotFoundException('Version de référentiel introuvable');
      await tx.coachingReference.updateMany({ where: { tenantId: CRM_TENANT, isActive: true, NOT: { id } }, data: { isActive: false } });
      await tx.coachingReference.update({ where: { id }, data: { isActive: true } });
    });
    return this.getPublished(id);
  }

  /** La grille du plan, telle que le moteur l'a lue à l'import. */
  planOf(reference: CoachingReference): ParsedSalesPlan | null {
    return (reference.planCriteria as unknown as ParsedSalesPlan | null) ?? null;
  }

  /**
   * Migration unique depuis l'ancien modèle (plan actif + fiches actives versionnés
   * séparément) : crée le référentiel v1, publié et actif, et y rattache les analyses
   * du plan actif. Sans effet si un référentiel existe déjà.
   */
  async migrateLegacy(): Promise<{ migrated: boolean; version?: number; products?: number; analyses?: number }> {
    return this.locked(async tx => {
      if (await tx.coachingReference.count({ where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED } })) return { migrated: false };
      const plan = await tx.salesPlanVersion.findFirst({ where: { tenantId: CRM_TENANT, isActive: true }, orderBy: { createdAt: 'desc' } });
      if (!plan) return { migrated: false };
      const sheets = await tx.productSheetVersion.findMany({ where: { tenantId: CRM_TENANT, isActive: true }, orderBy: { label: 'asc' } });
      const products = sheets.map((sheet): Omit<CoachingReferenceProduct, 'id' | 'referenceId' | 'position'> => {
        const binding = (sheet.winleadplus ?? {}) as { externalIds?: number[]; match?: { fournisseur?: string } };
        return { key: sheet.productKey, label: sheet.label, identifiers: strings(sheet.identifiers), sttTerms: strings(sheet.sttTerms), offreExternalIds: binding.externalIds ?? [], offreFournisseur: binding.match?.fournisseur ?? null, sheetMarkdown: sheet.rawMarkdown, sheetContentHash: null, sheetContent: null };
      });
      const draft = { planMarkdown: plan.rawMarkdown, products } as unknown as ReferenceWithProducts;
      const first = await this.validate(draft);
      // Une fiche active d'un produit absent du plan n'a jamais servi (l'ancien modèle ne
      // gardait que les produits du plan) : elle ne fait pas partie du référentiel.
      const unused = new Set(first.issues.filter(i => i.code === 'PRODUCT_UNUSED').map(i => i.productKey));
      products.splice(0, products.length, ...products.filter(p => !unused.has(p.key)));
      // Les produits du plan qui n'avaient pas de fiche entrent au catalogue sans fiche,
      // nommés d'après leur étape : c'est le moteur qui dit lesquels manquent.
      for (const issue of first.issues.filter(i => i.code === 'PLAN_PRODUCT_UNKNOWN')) {
        const step = (plan.criteria as unknown as { steps: Array<{ key: string; label: string }> }).steps.find(s => s.key === issue.stepKey);
        products.push({ key: issue.productKey!, label: (step?.label ?? issue.productKey!).replace(/^produits?\s*:\s*/i, '').trim(), identifiers: [], sttTerms: [], offreExternalIds: [], offreFournisseur: null, sheetMarkdown: null, sheetContentHash: null, sheetContent: null });
      }
      const parsed = await this.validate(draft);
      rejectIssues(parsed, i => i.level === 'error');
      const reference = await tx.coachingReference.create({
        data: {
          tenantId: CRM_TENANT, status: CoachingReferenceStatus.PUBLISHED, version: 1, isActive: true, contentHash: parsed.contentHash,
          planMarkdown: plan.rawMarkdown, planContentHash: parsed.plan!.contentHash, planSlug: parsed.plan!.plan.slug, planTitle: parsed.plan!.plan.title, planCriteria: json(parsed.plan!.plan),
          createdBy: 'migration', publishedBy: 'migration', publishedAt: new Date(),
          products: { create: products.map((product, position) => {
            const sheet = parsed.products.find(p => p.key === product.key)?.sheet ?? null;
            return { ...product, position, sheetContentHash: sheet?.contentHash ?? null, sheetContent: sheet ? json(sheet.content) : Prisma.DbNull };
          }) },
        },
      });
      const attached = await tx.coachingAnalysis.updateMany({ where: { source: CRM_SOURCE, tenantId: CRM_TENANT, salesPlanVersionId: plan.id, referenceId: null }, data: { referenceId: reference.id } });
      return { migrated: true, version: 1, products: products.length, analyses: attached.count };
    }, MIGRATION_TX_OPTIONS);
  }

  /** Le brouillon tel que le moteur le valide : plan et fiches en markdown. */
  private validate(draft: Pick<ReferenceWithProducts, 'planMarkdown' | 'products'>): Promise<ParsedReference> {
    const request: ReferenceDraftRequest = {
      plan: { markdown: draft.planMarkdown ?? '' },
      products: draft.products.map(p => ({ key: p.key, label: p.label, identifiers: p.identifiers, sttTerms: p.sttTerms, sheet: p.sheetMarkdown ? { markdown: p.sheetMarkdown } : null })),
    };
    return this.api.parseReference(request);
  }

  private findDraft(client: Pick<PrismaService, 'coachingReference'> | Tx) {
    return client.coachingReference.findFirst({ where: { tenantId: CRM_TENANT, status: CoachingReferenceStatus.DRAFT }, include: WITH_PRODUCTS });
  }

  private async editDraft(edit: (tx: Tx, draft: ReferenceWithProducts) => Promise<void>): Promise<ReferenceDraftState> {
    await this.locked(async tx => {
      const draft = await this.findDraft(tx);
      if (!draft) throw new ConflictException('Aucun brouillon ouvert : ouvrez-en un avant de modifier le référentiel');
      await edit(tx, draft);
    });
    return (await this.getDraft())!;
  }

  /** Toutes les écritures du référentiel d'un tenant sont sérialisées. */
  private locked<T>(work: (tx: Tx) => Promise<T>, options = TX_OPTIONS): Promise<T> {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coaching-reference:${CRM_TENANT}`}))`;
      return work(tx);
    }, options);
  }
}

/** Les erreurs retenues deviennent une 400 lisible, toutes ensemble. */
function rejectIssues(parsed: ParsedReference, blocking: (issue: ReferenceIssue) => boolean) {
  const errors = parsed.issues.filter(i => i.level === 'error' && blocking(i));
  if (errors.length) throw new BadRequestException(errors.map(e => e.message).join(' '));
}

function findProduct(draft: ReferenceWithProducts, key: string): CoachingReferenceProduct {
  const product = draft.products.find(p => p.key === key);
  if (!product) throw new NotFoundException(`Produit « ${key} » absent du brouillon`);
  return product;
}

/** Même catalogue au sens de l'app : mêmes offres liées et même ordre, produit par produit. */
function sameCatalogue(a: CoachingReferenceProduct[], b: CoachingReferenceProduct[]): boolean {
  const shape = (products: CoachingReferenceProduct[]) => JSON.stringify(
    [...products].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
      .map(p => [p.key, p.position, [...p.offreExternalIds].sort((x, y) => x - y), p.offreFournisseur]),
  );
  return shape(a) === shape(b);
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const cleanList = (values: string[]) => [...new Set(values.map(v => v.trim()).filter(Boolean))];

function normalizeFields(fields: ReferenceProductFields): ReferenceProductFields {
  const offreExternalIds = [...new Set(fields.offreExternalIds)].filter(id => Number.isSafeInteger(id) && id > 0);
  const offreFournisseur = fields.offreFournisseur?.trim() || null;
  if (offreExternalIds.length && offreFournisseur) throw new BadRequestException('Liez le produit soit à des offres précises, soit à un fournisseur, pas les deux');
  return { key: fields.key.trim(), label: fields.label.trim(), identifiers: cleanList(fields.identifiers), sttTerms: cleanList(fields.sttTerms), offreExternalIds, offreFournisseur };
}

