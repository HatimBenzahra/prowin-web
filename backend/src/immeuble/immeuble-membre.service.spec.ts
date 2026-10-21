import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, UserStatus, UserType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ImmeubleAccessService } from './immeuble-access.service';
import { ImmeubleMembreService } from './immeuble-membre.service';

/**
 * `ImmeubleMembreService` : partage d'un immeuble entre coéquipiers. On fige qui
 * peut partager à qui (même équipe, pas de mélange test/prod), l'idempotence, la
 * notification et la règle « le dernier membre ne quitte pas » (Prisma mocké).
 */
describe('ImmeubleMembreService', () => {
  const IMMEUBLE_ID = 40;
  const COMMERCIAL_ID = 7;
  const COEQUIPIER_ID = 8;
  const MANAGER_ID = 3;
  const immeuble = { id: IMMEUBLE_ID, adresse: '1 rue du Test' };

  type Options = {
    membre?: boolean;
    statut?: UserStatus;
    managerId?: number | null;
    cibleTrouvee?: boolean;
    dejaMembre?: boolean;
    nbMembres?: number;
  };

  const build = (options: Options = {}) => {
    const prisma = {
      immeuble: {
        findUnique: jest.fn(() => Promise.resolve(immeuble)),
      },
      immeubleMembre: {
        findFirst: jest.fn(() =>
          Promise.resolve(options.membre === false ? null : { id: 11 }),
        ),
        createMany: jest.fn(() =>
          Promise.resolve({ count: options.dejaMembre ? 0 : 1 }),
        ),
        count: jest.fn(() => Promise.resolve(options.nbMembres ?? 2)),
        delete: jest.fn(() => Promise.resolve({ id: 11 })),
      },
      commercial: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            prenom: 'Chloé',
            managerId:
              options.managerId === undefined ? MANAGER_ID : options.managerId,
            status: options.statut ?? UserStatus.ACTIF,
          }),
        ),
        findFirst: jest.fn<
          Promise<{ id: number } | null>,
          [{ where: Prisma.CommercialWhereInput }]
        >(() =>
          Promise.resolve(
            options.cibleTrouvee === false ? null : { id: COEQUIPIER_ID },
          ),
        ),
        findMany: jest.fn<
          Promise<unknown[]>,
          [{ where: Prisma.CommercialWhereInput }]
        >(() => Promise.resolve([])),
      },
      manager: {
        findUnique: jest.fn(() =>
          Promise.resolve({ prenom: 'Max', status: UserStatus.ACTIF }),
        ),
      },
      $queryRaw: jest.fn(() => Promise.resolve([{ id: IMMEUBLE_ID }])),
    };
    // Transaction interactive : le callback reçoit le même client mocké.
    const client = {
      ...prisma,
      $transaction: jest.fn((fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    } as unknown as PrismaService;
    const notifications = { notify: jest.fn(() => Promise.resolve()) };
    const service = new ImmeubleMembreService(
      client,
      new ImmeubleAccessService(client),
      notifications as unknown as NotificationsService,
    );
    return { prisma, notifications, service };
  };

  describe('findCoequipiers', () => {
    it('liste les commerciaux actifs du même manager, sauf soi-même', async () => {
      const { service, prisma } = build();
      await service.findCoequipiers(COMMERCIAL_ID, 'commercial');
      expect(prisma.commercial.findMany.mock.calls[0][0].where).toEqual({
        managerId: MANAGER_ID,
        status: UserStatus.ACTIF,
        id: { not: COMMERCIAL_ID },
      });
    });

    it('ne propose que des comptes test à un compte test', async () => {
      const { service, prisma } = build({
        statut: UserStatus.UTILISATEUR_TEST,
      });
      await service.findCoequipiers(COMMERCIAL_ID, 'commercial');
      expect(prisma.commercial.findMany.mock.calls[0][0].where).toMatchObject({
        status: UserStatus.UTILISATEUR_TEST,
      });
    });

    it('liste ses commerciaux pour un manager', async () => {
      const { service, prisma } = build();
      await service.findCoequipiers(MANAGER_ID, 'manager');
      expect(prisma.commercial.findMany.mock.calls[0][0].where).toEqual({
        managerId: MANAGER_ID,
        status: UserStatus.ACTIF,
      });
    });

    it('est vide pour un commercial sans manager', async () => {
      const { service, prisma } = build({ managerId: null });
      await expect(
        service.findCoequipiers(COMMERCIAL_ID, 'commercial'),
      ).resolves.toEqual([]);
      expect(prisma.commercial.findMany).not.toHaveBeenCalled();
    });
  });

  describe('partager', () => {
    const partager = (service: ImmeubleMembreService) =>
      service.partager(IMMEUBLE_ID, COEQUIPIER_ID, COMMERCIAL_ID, 'commercial');

    it('ajoute le coéquipier et le notifie', async () => {
      const { service, prisma, notifications } = build();
      await expect(partager(service)).resolves.toEqual(immeuble);
      expect(prisma.commercial.findFirst.mock.calls[0][0].where).toEqual({
        AND: [
          {
            managerId: MANAGER_ID,
            status: UserStatus.ACTIF,
            id: { not: COMMERCIAL_ID },
          },
          { id: COEQUIPIER_ID },
        ],
      });
      expect(prisma.immeubleMembre.createMany).toHaveBeenCalledWith({
        data: [
          {
            immeubleId: IMMEUBLE_ID,
            commercialId: COEQUIPIER_ID,
            ajouteParId: COMMERCIAL_ID,
            ajouteParType: UserType.COMMERCIAL,
          },
        ],
        skipDuplicates: true,
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: COEQUIPIER_ID,
          userType: UserType.COMMERCIAL,
          type: NotificationType.IMMEUBLE_PARTAGE,
        }),
      );
    });

    it('est idempotent : un membre existant n’est pas re-notifié', async () => {
      const { service, notifications } = build({ dejaMembre: true });
      await expect(partager(service)).resolves.toEqual(immeuble);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('refuse un appelant non membre', async () => {
      const { service, prisma } = build({ membre: false });
      await expect(partager(service)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.immeubleMembre.createMany).not.toHaveBeenCalled();
    });

    it('refuse un commercial hors équipe (ou test ↔ prod)', async () => {
      const { service, prisma } = build({ cibleTrouvee: false });
      await expect(partager(service)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.immeubleMembre.createMany).not.toHaveBeenCalled();
    });

    it('ne bloque pas le partage si la notification échoue', async () => {
      const { service, notifications } = build();
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      notifications.notify.mockRejectedValueOnce(new Error('FCM'));
      await expect(partager(service)).resolves.toEqual(immeuble);
      expect(log).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });
  });

  describe('quitter', () => {
    it('retire le membre', async () => {
      const { service, prisma } = build();
      await expect(
        service.quitter(IMMEUBLE_ID, COMMERCIAL_ID, 'commercial'),
      ).resolves.toBe(true);
      expect(prisma.immeubleMembre.delete).toHaveBeenCalledWith({
        where: { id: 11 },
      });
    });

    it('refuse le dernier membre', async () => {
      const { service, prisma } = build({ nbMembres: 1 });
      await expect(
        service.quitter(IMMEUBLE_ID, COMMERCIAL_ID, 'commercial'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.immeubleMembre.delete).not.toHaveBeenCalled();
    });

    it('refuse un non-membre', async () => {
      const { service } = build({ membre: false });
      await expect(
        service.quitter(IMMEUBLE_ID, COMMERCIAL_ID, 'commercial'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('signale un immeuble inexistant', async () => {
      const { service, prisma } = build();
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(
        service.quitter(IMMEUBLE_ID, COMMERCIAL_ID, 'commercial'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
