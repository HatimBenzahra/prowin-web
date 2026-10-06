import 'reflect-metadata';
import axios from 'axios';
import { createHash } from 'crypto';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { CoachingApiClient } from '../coaching-api.client';
import { CoachingResolver } from '../coaching.resolver';
import { ProductSheetService } from '../referentiels/product-sheet.service';
import { SalesPlanService } from '../referentiels/sales-plan.service';
jest.mock('axios');

/** Une table de versions en mémoire, avec la transaction et le verrou de Prisma. */
function versions(rows: any[]) {
  const table = {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(
      async ({ where }: any) =>
        rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ??
        null,
    ),
    findMany: jest.fn(async () => rows),
    create: jest.fn(),
    updateMany: jest.fn(async ({ where, data }: any) => {
      // Sous-ensemble du filtre Prisma utilisé par les services : champs égaux, NOT { id }, OR.
      const equals = (r: any, clause: any) =>
        Object.entries(clause).every(([k, v]) => r[k] === v);
      const { NOT, OR, ...fields } = where;
      const hit = rows.filter(
        (r) =>
          equals(r, fields) &&
          r.id !== NOT?.id &&
          (!OR || OR.some((clause: any) => equals(r, clause))),
      );
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    update: jest.fn(async ({ where, data }: any) =>
      Object.assign(
        rows.find((r) => r.id === where.id),
        data,
      ),
    ),
  };
  const tx = {
    salesPlanVersion: table,
    productSheetVersion: table,
    $executeRaw: jest.fn(),
  };
  return {
    prisma: { ...tx, $transaction: async (work: any) => work(tx) } as any,
    table,
    tx,
  };
}
const row = (
  id: number,
  isActive: boolean,
  slug = 'plan',
  productKey = 'purea',
) => ({ id, tenantId: '', slug, productKey, version: id, isActive });

describe('administration des référentiels', () => {
  it('garde un seul plan actif pour le CRM, même sous un autre slug', async () => {
    const rows = [row(1, false), row(2, true), row(3, true, 'plan-renomme')];
    const f = versions(rows);
    await new SalesPlanService(f.prisma, {} as any).activateVersion(1);
    expect(rows.map((r) => r.isActive)).toEqual([true, false, false]);
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('garde une seule fiche active par produit, même sous un autre slug', async () => {
    const rows = [
      row(1, false, 'purea'),
      row(2, true, 'purea'),
      row(3, true, 'purea-2026'),
      row(4, true, 'depanssur', 'depanssur'),
    ];
    const f = versions(rows);
    await new ProductSheetService(f.prisma, {} as any).activateVersion(1);
    expect(rows.map((r) => r.isActive)).toEqual([true, false, false, true]);
    // Verrou de la fiche puis du produit, toujours dans cet ordre.
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('refuse une version inconnue sans rien écrire', async () => {
    const f = versions([row(1, true)]);
    await expect(
      new ProductSheetService(f.prisma, {} as any).activateVersion(99),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.table.updateMany).not.toHaveBeenCalled();
  });

  it("ne lit pas la version d'un autre tenant", async () => {
    const rows = [{ ...row(1, true), tenantId: 'autre-organisation' }];
    await expect(
      new SalesPlanService(versions(rows).prisma, {} as any).getVersion(1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("enregistre l'auteur de l'import", async () => {
    const f = versions([]);
    f.table.create.mockImplementation(async ({ data }: any) => ({
      id: 5,
      ...data,
    }));
    f.table.update.mockImplementation(async ({ data }: any) => ({
      id: 5,
      ...data,
    }));
    const markdown = 'plan';
    const contentHash = createHash('sha256').update(markdown).digest('hex');
    const api: any = {
      parsePlan: async () => ({
        plan: { slug: 'plan', title: 'Plan', steps: [] },
        rawMarkdown: markdown,
        contentHash,
      }),
    };
    await new SalesPlanService(f.prisma, api).importPlan(
      markdown,
      'admin@prowin.fr',
    );
    expect(f.table.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ importedBy: 'admin@prowin.fr' }),
    });
  });
});

describe('validation distante des référentiels', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.COACHING_API_URL = 'http://coaching.invalid';
  });
  afterEach(() => {
    process.env = { ...original };
    jest.resetAllMocks();
  });

  it('remonte le message du parseur quand le contenu est refusé', async () => {
    jest.mocked(axios.isAxiosError).mockReturnValue(true);
    jest.mocked(axios.post).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          message:
            'Plan markdown invalide : Aucune étape (steps) définie dans le plan',
        },
      },
    });
    const error = await new CoachingApiClient().parsePlan('x').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe(
      'Plan markdown invalide : Aucune étape (steps) définie dans le plan',
    );
  });

  it('reste générique quand le moteur est injoignable', async () => {
    jest.mocked(axios.isAxiosError).mockReturnValue(true);
    jest.mocked(axios.post).mockRejectedValueOnce({ code: 'ECONNREFUSED' });
    await expect(
      new CoachingApiClient().parseSheet('x'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('droits sur les référentiels', () => {
  const roles = (method: keyof CoachingResolver) =>
    Reflect.getMetadata(ROLES_KEY, CoachingResolver.prototype[method]);

  it.each([
    'importSalesPlan',
    'activateSalesPlanVersion',
    'importProductSheet',
    'activateProductSheetVersion',
  ] as const)('%s est réservé à l’admin', (method) =>
    expect(roles(method)).toEqual(['admin']),
  );

  it.each([
    'activeSalesPlan',
    'coachingProductSheets',
    'salesPlanVersions',
    'productSheetVersions',
    'salesPlanVersion',
    'productSheetVersion',
  ] as const)('%s reste consultable par le directeur', (method) =>
    expect(roles(method)).toEqual(['admin', 'directeur']),
  );
});
