import { createHash } from 'crypto';
import { SalesPlanService } from '../referentiels/sales-plan.service';
import { ProductSheetService } from '../referentiels/product-sheet.service';
import { CoachingInputService } from '../coaching-input.service';

describe('caller-owned reference versions', () => {
  const markdown = 'local document';
  const contentHash = createHash('sha256').update(markdown).digest('hex');
  const plan = { slug: 'sales', title: 'Sales', scoringScale: 100, malus: { grave: 15, modere: 8, maxTotal: 30 }, steps: [] };
  function database() {
    let row: any = null;
    const table = { findUnique: jest.fn(async () => row), findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => row = { id: 23, ...data }), updateMany: jest.fn(async () => ({ count: 0 })), update: jest.fn(async ({ data }: any) => row = { ...row, ...data }) };
    const tx = { salesPlanVersion: table, productSheetVersion: table, $executeRaw: jest.fn() };
    return { prisma: { ...tx, $transaction: async (work: any) => work(tx) } as any, table, tx };
  }
  it('stores/activates plans only in the caller database and deduplicates repeated content', async () => {
    const f = database(); const api: any = { parsePlan: jest.fn(async () => ({ plan, rawMarkdown: markdown, contentHash })) };
    const service = new SalesPlanService(f.prisma, api);
    expect(await service.importPlan(markdown)).toMatchObject({ id: 23, version: 1, isActive: true, contentHash });
    await service.importPlan(markdown); expect(f.table.create).toHaveBeenCalledTimes(1); expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(api).not.toHaveProperty('createAnalysis');
  });
  it('validates reference content before any local DB writes', async () => {
    const f = database(); const service = new SalesPlanService(f.prisma, { parsePlan: async () => ({ plan, rawMarkdown: 'altered', contentHash }) } as any);
    await expect(service.importPlan(markdown)).rejects.toThrow('incompatible'); expect(f.table.create).not.toHaveBeenCalled();
  });
  it('stores product provenance locally and snapshots unavailable price verification', async () => {
    const f = database(); const sheet: any = { slug: 'x', label: 'X', productKey: 'x', facts: ['Fact'], identifiers: [], sttTerms: [], forbidden: [] };
    const sheets = new ProductSheetService(f.prisma, { parseSheet: async () => ({ sheet, rawMarkdown: markdown, contentHash }) } as any);
    expect(await sheets.importSheet(markdown)).toMatchObject({ id: 23, productKey: 'x', isActive: true });
    const plans: any = { toParsedPlan: () => ({ ...plan, steps: [{ appliesWhen: 'productDetected:x' }] }) };
    const tariffs: any = { snapshots: jest.fn(async () => [{ prices: null, priceVerification: { status: 'unavailable', comment: 'Tarifs non vérifiés' } }]) };
    const input = new CoachingInputService(plans, { listActiveSheets: async () => [{ id: 23, rawMarkdown: markdown, contentHash, ...sheet }], toParsedSheet: () => sheet } as any, tariffs);
    expect((await input.references({ rawMarkdown: markdown, contentHash, version: 1 } as any)).products[0]).toMatchObject({ versionId: 23, prices: null, contentHash });
    expect(tariffs.snapshots).toHaveBeenCalledWith([undefined], undefined);
    await expect(input.references({ rawMarkdown: markdown, contentHash: 'wrong' } as any)).rejects.toThrow('Hash');
  });
});
