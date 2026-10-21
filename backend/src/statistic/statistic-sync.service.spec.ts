import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma.service';
import {
  StatisticSyncService,
  acteursDesPortes,
} from './statistic-sync.service';

/**
 * Auteurs à recalculer à partir des portes (dernier passage) et synchro
 * best-effort après suppression de portes (Prisma mocké).
 */
describe('acteursDesPortes', () => {
  it('collecte les auteurs sans doublon ni null', () => {
    expect(
      acteursDesPortes([
        { dernierCommercialId: 7, dernierManagerId: null },
        { dernierCommercialId: 7, dernierManagerId: null },
        { dernierCommercialId: null, dernierManagerId: 3 },
        { dernierCommercialId: null, dernierManagerId: null },
      ]),
    ).toEqual({ commercialIds: [7], managerIds: [3] });
  });
});

describe('StatisticSyncService.syncAuteursPortesSupprimees', () => {
  it('ne propage pas une erreur de synchro (suppression déjà faite)', async () => {
    const prisma = {
      commercial: {
        findMany: jest.fn(() => Promise.reject(new Error('DB'))),
      },
    };
    const service = new StatisticSyncService(
      prisma as unknown as PrismaService,
    );
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(
      service.syncAuteursPortesSupprimees([
        { dernierCommercialId: 7, dernierManagerId: null },
      ]),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
