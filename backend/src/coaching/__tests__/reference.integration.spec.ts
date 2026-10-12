import * as fs from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ReferenceService } from '../referentiels/reference.service';
import { CoachingInputService } from '../coaching-input.service';
import type { CoachingApiClient, ReferenceDraftRequest } from '../coaching-api.client';

/**
 * Référentiel de bout en bout sur une vraie base Postgres (transactions, verrou,
 * index partiels) et la vraie validation du moteur, sans HTTP. Nécessite une base
 * jetable au schéma courant : COACHING_TEST_DATABASE_URL (sinon la suite est ignorée).
 */
const url = process.env.COACHING_TEST_DATABASE_URL;
const enginePath = process.env.COACHING_ENGINE_SRC ?? resolve(process.cwd(), '../../../../coaching/src');
/* eslint-disable @typescript-eslint/no-require-imports */
const engine = {
  reference: require(`${enginePath}/referentiels/reference`),
  plan: require(`${enginePath}/referentiels/sales-plan.parser`),
  sheet: require(`${enginePath}/referentiels/product-sheet.parser`),
  request: require(`${enginePath}/compute/request`),
};
/* eslint-enable @typescript-eslint/no-require-imports */
const fixture = (file: string) => fs.readFileSync(`${enginePath}/__tests__/fixtures/${file}`, 'utf8');
const SHEETS = ['purea.md', 'purea-douchette.md', 'depanssur.md', 'mondial-tv.md', 'france-telephone.md'];
/** Fiche encore active d'un produit retiré du plan (cas réel : Bleubox après le plan v3). */
const ORPHAN = '---\nslug: bleubox\nlabel: Bleubox\nappliesTo: productDetected:bleubox\nfacts: [Box internet]\n---\n';

(url ? describe : describe.skip)('référentiel coaching (base réelle)', () => {
  // Créé seulement si la suite tourne : sans URL, Prisma refuse de se construire.
  const prisma = url ? new PrismaService({ datasources: { db: { url } } }) : (undefined as unknown as PrismaService);
  const api = { parseReference: async (draft: ReferenceDraftRequest) => JSON.parse(JSON.stringify(engine.reference.parseReference(draft))) } as unknown as CoachingApiClient;
  const references = new ReferenceService(prisma, api);

  const clean = async () => {
    await prisma.coachingAnalysis.deleteMany();
    await prisma.coachingReferenceProduct.deleteMany();
    await prisma.coachingReference.deleteMany();
    await prisma.productSheetVersion.deleteMany();
    await prisma.salesPlanVersion.deleteMany();
  };

  /** L'ancien modèle : plan actif + fiches actives, et une analyse sur ce plan. */
  const seedLegacy = async () => {
    const markdown = fixture('sales-plan.md');
    const parsed = engine.plan.parseSalesPlanMarkdown(markdown);
    const { slug, title, ...criteria } = parsed.plan;
    const plan = await prisma.salesPlanVersion.create({ data: { slug, title, version: 5, contentHash: parsed.contentHash, criteria, rawMarkdown: markdown, isActive: true } });
    for (const file of SHEETS) {
      const source = fixture(`product-sheets/${file}`);
      const { sheet, contentHash } = engine.sheet.parseProductSheetMarkdown(source);
      await prisma.productSheetVersion.create({ data: { slug: sheet.slug, label: sheet.label, productKey: sheet.productKey, version: 1, contentHash, facts: sheet.facts, identifiers: sheet.identifiers, sttTerms: sheet.sttTerms, forbidden: sheet.forbidden, winleadplus: sheet.winleadplus ?? undefined, rawMarkdown: source, isActive: true } });
    }
    const orphan = engine.sheet.parseProductSheetMarkdown(ORPHAN);
    await prisma.productSheetVersion.create({ data: { slug: 'bleubox', label: 'Bleubox', productKey: 'bleubox', version: 7, contentHash: orphan.contentHash, facts: orphan.sheet.facts, identifiers: [], sttTerms: [], forbidden: [], rawMarkdown: ORPHAN, isActive: true } });
    await prisma.coachingAnalysis.create({ data: { source: 'prowin', tenantId: '', s3KeyOriginal: 'audio-1', salesPlanVersionId: plan.id } });
    return plan;
  };

  beforeEach(clean);
  afterAll(async () => { await clean(); await prisma.$disconnect(); });

  it("migre l'ancien modèle en référentiel v1, une seule fois", async () => {
    await seedLegacy();
    expect(await references.migrateLegacy()).toEqual({ migrated: true, version: 1, products: 6, analyses: 1 });
    const active = await references.getActive();
    expect(active).toMatchObject({ version: 1, status: 'PUBLISHED', isActive: true, publishedBy: 'migration' });
    const byKey = Object.fromEntries(active!.products.map(p => [p.key, p]));
    expect(Object.keys(byKey).sort()).toEqual(['assistant_personnel', 'depanssur', 'france_telephone', 'mondial_tv', 'purea', 'purea_douchette']);
    expect(byKey.assistant_personnel).toMatchObject({ label: 'Assistant personnel (Action Réduction + Justi+ PRO)', sheetMarkdown: null });
    expect(byKey.purea).toMatchObject({ offreExternalIds: [708], offreFournisseur: null });
    expect(byKey.depanssur).toMatchObject({ offreExternalIds: [], offreFournisseur: "DEPAN'SSUR" });
    expect(await prisma.coachingAnalysis.findFirst()).toMatchObject({ referenceId: active!.id });
    expect(await references.migrateLegacy()).toEqual({ migrated: false });
  });

  it('brouillon : refuse ce qui est invalide, signale ce qui est incohérent, publie', async () => {
    await seedLegacy();
    await references.migrateLegacy();
    const draft = await references.openDraft('admin@prowin.fr');
    expect(draft.reference).toMatchObject({ status: 'DRAFT', version: null, createdBy: 'admin@prowin.fr' });
    expect(draft.reference.products).toHaveLength(6);
    expect(draft.issues.map(i => i.code)).toEqual(['PRODUCT_WITHOUT_SHEET']);
    // Un seul brouillon : le rouvrir rend le même.
    expect((await references.openDraft('autre@prowin.fr')).reference.id).toBe(draft.reference.id);

    await expect(references.setDraftPlan('---\nslug: x\ntitle: X\nsteps: []\n---\n')).rejects.toThrow('Aucune étape (steps) définie dans le plan');
    await expect(references.setDraftProductSheet('purea', '---\nfacts: []\n---\n')).rejects.toBeInstanceOf(BadRequestException);
    await expect(references.removeDraftProduct('purea')).rejects.toThrow('absent du catalogue');
    await expect(references.saveDraftProduct({ key: 'Mauvaise Clé', label: 'X', identifiers: [], sttTerms: [], offreExternalIds: [], offreFournisseur: null })).rejects.toThrow('invalide');

    const added = await references.saveDraftProduct({ key: 'carte_sim', label: 'Carte SIM', identifiers: [' SIM ', 'SIM'], sttTerms: [], offreExternalIds: [12], offreFournisseur: null });
    expect(added.reference.products.at(-1)).toMatchObject({ key: 'carte_sim', identifiers: ['SIM'], position: 6 });
    expect(added.issues.map(i => i.code).sort()).toEqual(['PRODUCT_UNUSED', 'PRODUCT_WITHOUT_SHEET']);
    const withSheet = await references.setDraftProductSheet('assistant_personnel', '---\nfacts: [Accompagnement administratif]\n---\nFiche.');
    expect(withSheet.issues.map(i => i.code)).toEqual(['PRODUCT_UNUSED']);
    await references.removeDraftProduct('carte_sim');

    const v2 = await references.publishDraft('admin@prowin.fr');
    expect(v2).toMatchObject({ version: 2, isActive: true, publishedBy: 'admin@prowin.fr' });
    expect((await references.listPublished()).map(v => [v.version, v.isActive])).toEqual([[2, true], [1, false]]);
    expect(await references.getDraft()).toBeNull();

    // Un brouillon identique à une version publiée la réactive, sans doublon.
    await references.activate((await references.listPublished())[1].id);
    await references.openDraft('admin@prowin.fr');
    await references.setDraftProductSheet('assistant_personnel', '---\nfacts: [Accompagnement administratif]\n---\nFiche.');
    expect(await references.publishDraft('admin@prowin.fr')).toMatchObject({ id: v2.id, version: 2, isActive: true });
    expect(await prisma.coachingReference.count()).toBe(2);
  });

  it('publie un changement qui ne touche que les offres, et refuse un brouillon avant la migration', async () => {
    await seedLegacy();
    await expect(references.openDraft('admin@prowin.fr')).rejects.toThrow("pas encore migré");
    await references.migrateLegacy();
    await references.openDraft('admin@prowin.fr');
    const purea = (await references.getDraft())!.reference.products.find(p => p.key === 'purea')!;
    await references.saveDraftProduct({ ...purea, offreExternalIds: [708, 710] });
    // Même empreinte moteur (les offres n'y sont pas), mais un catalogue différent.
    const v2 = await references.publishDraft('admin@prowin.fr');
    expect(v2).toMatchObject({ version: 2, isActive: true });
    expect(v2.contentHash).toBe((await references.getPublished((await references.listPublished())[1].id)).contentHash);
    expect(v2.products.find(p => p.key === 'purea')!.offreExternalIds).toEqual([708, 710]);
  });

  it('la base refuse un second brouillon ou un second référentiel actif', async () => {
    await prisma.coachingReference.create({ data: { tenantId: '' } });
    await expect(prisma.coachingReference.create({ data: { tenantId: '' } })).rejects.toThrow();
    const published = { tenantId: '', status: 'PUBLISHED' as const, isActive: true, planMarkdown: 'p', contentHash: 'h' };
    await prisma.coachingReference.create({ data: { ...published, version: 1 } });
    await expect(prisma.coachingReference.create({ data: { ...published, version: 2 } })).rejects.toThrow();
  });

  it('fige un référentiel que le moteur accepte tel quel', async () => {
    await seedLegacy();
    await references.migrateLegacy();
    const tariffs = { snapshots: jest.fn(async (bindings: unknown[]) => bindings.map(() => ({ prices: null }))) };
    const frozen = await new CoachingInputService(references, tariffs as never).freeze((await references.getActive())!);
    // Les prix ne sont demandés que pour les produits jugeables (avec fiche).
    expect(tariffs.snapshots.mock.calls[0][0]).toHaveLength(5);
    expect(() => engine.request.normalizeRequest({ requestKey: 'k', audio: { key: 'a', url: '' }, transcript: 'Bonjour', transcriptDurationSec: 60, ...frozen })).not.toThrow();
    expect('reference' in frozen && frozen.reference.contentHash).toBe((await references.getActive())!.contentHash);
    expect(createHash('sha256').update('reference' in frozen ? frozen.reference.plan.markdown : '').digest('hex')).toBe('reference' in frozen ? frozen.reference.plan.contentHash : '');
  });
});
