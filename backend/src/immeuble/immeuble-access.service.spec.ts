import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';
import { ImmeubleAccessService } from './immeuble-access.service';

/**
 * `ImmeubleAccessService` : règle d'accès unique aux immeubles partagés. On fige
 * le `where` par rôle (appartenance via `membres`) et l'enchaînement
 * 404 → 403 des contrôles (Prisma mocké).
 */
describe('ImmeubleAccessService', () => {
  const IMMEUBLE_ID = 40;
  const USER_ID = 7;

  const build = (
    options: { immeuble?: { id: number } | null; accessible?: number } = {},
  ) => {
    const immeuble =
      options.immeuble === undefined ? { id: IMMEUBLE_ID } : options.immeuble;
    const prisma = {
      immeuble: {
        findUnique: jest.fn(() => Promise.resolve(immeuble)),
        count: jest.fn<Promise<number>, [{ where: Prisma.ImmeubleWhereInput }]>(
          () => Promise.resolve(options.accessible ?? 1),
        ),
      },
      porte: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            immeuble && { id: 1, immeubleId: immeuble.id, immeuble },
          ),
        ),
      },
    };
    const service = new ImmeubleAccessService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  };

  describe('accessWhere', () => {
    const { service } = build();

    it('limite un commercial aux immeubles dont il est membre', () => {
      expect(service.accessWhere(USER_ID, 'commercial')).toEqual({
        membres: { some: { commercialId: USER_ID } },
      });
    });

    it('ouvre au manager les immeubles de ses membres, de sa zone et créés par son équipe', () => {
      expect(service.accessWhere(USER_ID, 'manager')).toEqual({
        OR: [
          {
            membres: {
              some: {
                OR: [
                  { managerId: USER_ID },
                  { commercial: { managerId: USER_ID } },
                ],
              },
            },
          },
          { zone: { managerId: USER_ID } },
          { managerId: USER_ID },
          { commercial: { managerId: USER_ID } },
        ],
      });
    });

    it('ouvre au directeur son périmètre via les membres et la zone', () => {
      expect(service.accessWhere(USER_ID, 'directeur')).toEqual({
        OR: [
          {
            membres: {
              some: {
                OR: [
                  { commercial: { directeurId: USER_ID } },
                  { manager: { directeurId: USER_ID } },
                ],
              },
            },
          },
          { zone: { directeurId: USER_ID } },
          { commercial: { directeurId: USER_ID } },
          { manager: { directeurId: USER_ID } },
        ],
      });
    });

    it('ouvre tout à l’admin et rien à un rôle inconnu', () => {
      expect(service.accessWhere(0, 'admin')).toEqual({});
      expect(service.accessWhere(USER_ID, 'inconnu')).toEqual({ id: -1 });
    });
  });

  describe('membreWhere', () => {
    const { service } = build();

    it('désigne le commercial ou le manager lui-même', () => {
      expect(service.membreWhere(USER_ID, 'commercial')).toEqual({
        commercialId: USER_ID,
      });
      expect(service.membreWhere(USER_ID, 'manager')).toEqual({
        managerId: USER_ID,
      });
    });

    it('est null pour un rôle qui ne peut pas être membre', () => {
      expect(service.membreWhere(USER_ID, 'directeur')).toBeNull();
      expect(service.membreWhere(0, 'admin')).toBeNull();
    });
  });

  describe('ensureImmeubleAccess', () => {
    it('renvoie l’immeuble d’un membre', async () => {
      const { service, prisma } = build();
      await expect(
        service.ensureImmeubleAccess(IMMEUBLE_ID, USER_ID, 'commercial'),
      ).resolves.toEqual({ id: IMMEUBLE_ID });
      expect(prisma.immeuble.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: IMMEUBLE_ID },
            { membres: { some: { commercialId: USER_ID } } },
          ],
        },
      });
    });

    it('refuse un non-membre', async () => {
      const { service } = build({ accessible: 0 });
      await expect(
        service.ensureImmeubleAccess(IMMEUBLE_ID, USER_ID, 'commercial'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('signale un immeuble inexistant avant tout contrôle', async () => {
      const { service, prisma } = build({ immeuble: null });
      await expect(
        service.ensureImmeubleAccess(IMMEUBLE_ID, USER_ID, 'commercial'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.immeuble.count).not.toHaveBeenCalled();
    });

    it('laisse passer l’admin sans contrôle d’appartenance', async () => {
      const { service, prisma } = build({ accessible: 0 });
      await expect(
        service.ensureImmeubleAccess(IMMEUBLE_ID, 0, 'admin'),
      ).resolves.toEqual({ id: IMMEUBLE_ID });
      expect(prisma.immeuble.count).not.toHaveBeenCalled();
    });
  });

  describe('ensurePorteAccess', () => {
    it('contrôle l’immeuble de la porte', async () => {
      const { service, prisma } = build();
      await service.ensurePorteAccess(1, USER_ID, 'manager');
      expect(prisma.immeuble.count).toHaveBeenCalledWith({
        where: {
          AND: [{ id: IMMEUBLE_ID }, service.accessWhere(USER_ID, 'manager')],
        },
      });
    });

    it('signale une porte inexistante', async () => {
      const { service } = build({ immeuble: null });
      await expect(
        service.ensurePorteAccess(1, USER_ID, 'commercial'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
