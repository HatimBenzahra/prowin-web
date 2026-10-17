import type { PrismaService } from '../../prisma.service';
import { CoachingConfigService } from '../coaching-config.service';

/**
 * Config singleton du coaching : valeurs par défaut, cache 30 s, filtrage des
 * statuts et bornes de durée. Ces réglages pilotent la porte d'entrée `enqueue`.
 */
describe('CoachingConfigService', () => {
  type Row = { coachableStatuts: unknown; minAutoDurationSec: number | null };

  const build = (row: Row | null) => {
    const prisma = {
      coachingConfig: {
        findUnique: jest.fn(() => Promise.resolve(row)),
        create: jest.fn((args: { data: { coachableStatuts: string[] } }) =>
          Promise.resolve({ ...args.data, minAutoDurationSec: null }),
        ),
        upsert: jest.fn(() => Promise.resolve({})),
      },
    };
    const service = new CoachingConfigService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  };

  afterEach(() => jest.useRealTimers());

  describe('valeurs par défaut', () => {
    it('crée la ligne par défaut quand elle n’existe pas', async () => {
      const { service, prisma } = build(null);
      expect(await service.getCoachableStatuts()).toEqual([
        'REFUS',
        'ARGUMENTE',
        'RENDEZ_VOUS_PRIS',
        'CONTRAT_SIGNE',
      ]);
      expect(await service.getMinAutoDurationSec()).toBe(120);
      expect(prisma.coachingConfig.create).toHaveBeenCalledWith({
        data: {
          id: 1,
          coachableStatuts: [
            'REFUS',
            'ARGUMENTE',
            'RENDEZ_VOUS_PRIS',
            'CONTRAT_SIGNE',
          ],
        },
      });
    });

    it('retombe sur les défauts si la ligne est incomplète', async () => {
      const { service } = build({
        coachableStatuts: 'corrompu',
        minAutoDurationSec: null,
      });
      expect(await service.getCoachableStatuts()).toEqual([
        'REFUS',
        'ARGUMENTE',
        'RENDEZ_VOUS_PRIS',
        'CONTRAT_SIGNE',
      ]);
      expect(await service.getMinAutoDurationSec()).toBe(120);
    });

    it('lit la config enregistrée', async () => {
      const { service, prisma } = build({
        coachableStatuts: ['ABSENT'],
        minAutoDurationSec: 45,
      });
      expect(await service.getCoachableStatuts()).toEqual(['ABSENT']);
      expect(await service.getMinAutoDurationSec()).toBe(45);
      expect(prisma.coachingConfig.create).not.toHaveBeenCalled();
    });
  });

  describe('cache 30 s', () => {
    const row: Row = { coachableStatuts: ['REFUS'], minAutoDurationSec: 60 };

    it('ne relit pas la base avant 30 s', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-17T10:00:00Z') });
      const { service, prisma } = build(row);
      await service.getCoachableStatuts();
      jest.advanceTimersByTime(29_999);
      await service.getMinAutoDurationSec();
      expect(prisma.coachingConfig.findUnique).toHaveBeenCalledTimes(1);
    });

    it('relit la base une fois les 30 s écoulées', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-17T10:00:00Z') });
      const { service, prisma } = build(row);
      await service.getCoachableStatuts();
      jest.advanceTimersByTime(30_000);
      await service.getCoachableStatuts();
      expect(prisma.coachingConfig.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('setCoachableStatuts', () => {
    it('ne garde que les statuts porte connus, sans doublon', async () => {
      const { service, prisma } = build(null);
      const clean = await service.setCoachableStatuts([
        'REFUS',
        'INCONNU',
        'REFUS',
        'NECESSITE_REPASSAGE',
        'refus',
      ]);
      expect(clean).toEqual(['REFUS', 'NECESSITE_REPASSAGE']);
      expect(prisma.coachingConfig.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, coachableStatuts: clean },
        update: { coachableStatuts: clean },
      });
    });

    it('invalide le cache', async () => {
      const { service, prisma } = build({
        coachableStatuts: ['REFUS'],
        minAutoDurationSec: 60,
      });
      await service.getCoachableStatuts();
      await service.setCoachableStatuts(['ABSENT']);
      await service.getCoachableStatuts();
      expect(prisma.coachingConfig.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('setMinAutoDurationSec', () => {
    it.each([
      [-5, 0],
      [0, 0],
      [90.4, 90],
      [3600, 3600],
      [99_999, 3600],
      [Number.NaN, 0],
    ])('borne %p à %p', async (input, attendu) => {
      const { service, prisma } = build(null);
      expect(await service.setMinAutoDurationSec(input)).toBe(attendu);
      expect(prisma.coachingConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { minAutoDurationSec: attendu } }),
      );
    });

    it('invalide le cache', async () => {
      const { service, prisma } = build({
        coachableStatuts: ['REFUS'],
        minAutoDurationSec: 60,
      });
      await service.getMinAutoDurationSec();
      await service.setMinAutoDurationSec(30);
      await service.getMinAutoDurationSec();
      expect(prisma.coachingConfig.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
