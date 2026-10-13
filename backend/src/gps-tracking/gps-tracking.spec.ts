import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GpsTrackingResolver } from './gps-tracking.resolver';
import { GpsTrackingService } from './gps-tracking.service';
import { ReportPositionInput } from './gps-tracking.dto';
import { UserType } from '../zone/zone.dto';

// Fabrique un ExecutionContext minimal ciblant une methode du resolveur, avec
// un utilisateur au role donne, pour exercer le RolesGuard reellement.
function makeContext(handler: (...args: any[]) => any, role: string): any {
  const ctx = {
    getType: () => 'graphql',
    getHandler: () => handler,
    getClass: () => GpsTrackingResolver,
    getArgByIndex: () => ({ req: { user: { id: 42, role } } }),
  };
  jest
    .spyOn(GqlExecutionContext, 'create')
    .mockReturnValue({
      getContext: () => ({ req: { user: { id: 42, role } } }),
    } as any);
  return ctx;
}

describe('GpsTracking - reportMyPositions authorization', () => {
  const guard = new RolesGuard(new Reflector());

  it('rejette un role non-commercial/non-manager (ForbiddenException)', () => {
    const ctx = makeContext(
      GpsTrackingResolver.prototype.reportMyPositions,
      'directeur',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('autorise un commercial', () => {
    const ctx = makeContext(
      GpsTrackingResolver.prototype.reportMyPositions,
      'commercial',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('autorise un manager', () => {
    const ctx = makeContext(
      GpsTrackingResolver.prototype.reportMyPositions,
      'manager',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

describe('GpsTrackingResolver.reportMyPositions actor derivation', () => {
  const input: ReportPositionInput[] = [{ latitude: 48.85, longitude: 2.35 }];

  it('derive userType=MANAGER + userId=user.id pour un manager', () => {
    const saveForActor = jest.fn().mockResolvedValue(1);
    const resolver = new GpsTrackingResolver({ saveForActor } as any);

    resolver.reportMyPositions({ id: 7, role: 'manager' }, input);

    expect(saveForActor).toHaveBeenCalledWith(7, UserType.MANAGER, input);
  });

  it('derive userType=COMMERCIAL + userId=user.id pour un commercial', () => {
    const saveForActor = jest.fn().mockResolvedValue(1);
    const resolver = new GpsTrackingResolver({ saveForActor } as any);

    resolver.reportMyPositions({ id: 3, role: 'commercial' }, input);

    expect(saveForActor).toHaveBeenCalledWith(3, UserType.COMMERCIAL, input);
  });
});

describe('GpsTrackingService.saveForActor', () => {
  it('force userId/userType depuis les arguments et ignore toute valeur client', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { gpsPosition: { createMany } } as any;
    const service = new GpsTrackingService(prisma);

    // Le client tente d'injecter une identite frauduleuse ; elle ne doit jamais
    // atteindre la couche persistance (ReportPositionInput ne l'expose pas).
    const malicious = {
      latitude: 48.85,
      longitude: 2.35,
      accuracy: 5,
      batteryLevel: 80,
      userId: 999,
      userType: 'DIRECTEUR',
    } as unknown as ReportPositionInput;

    const count = await service.saveForActor(42, UserType.MANAGER, [malicious]);

    expect(count).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    const row = createMany.mock.calls[0][0].data[0];
    expect(row.userId).toBe(42);
    expect(row.userType).toBe(UserType.MANAGER);
    expect(row.isOnline).toBe(true);
    expect(row.recordedAt).toBeInstanceOf(Date);
  });

  it('respecte le recordedAt client quand il est fourni', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { gpsPosition: { createMany } } as any;
    const service = new GpsTrackingService(prisma);
    const recordedAt = new Date('2026-07-03T10:00:00.000Z');

    await service.saveForActor(7, UserType.COMMERCIAL, [
      { latitude: 1, longitude: 2, recordedAt },
    ]);

    expect(createMany.mock.calls[0][0].data[0].recordedAt).toBe(recordedAt);
  });
});

describe('GpsTrackingService.getLatestActorPositions', () => {
  it('renvoie une position par acteur (distinct userId+userType, userId non null)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 2,
        userId: 1,
        userType: UserType.COMMERCIAL,
        recordedAt: new Date('2026-07-03T09:00:00Z'),
      },
      {
        id: 5,
        userId: 1,
        userType: UserType.MANAGER,
        recordedAt: new Date('2026-07-03T08:00:00Z'),
      },
    ]);
    const prisma = { gpsPosition: { findMany } } as any;
    const service = new GpsTrackingService(prisma);

    const rows = await service.getLatestActorPositions();

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: { not: null } },
      orderBy: { recordedAt: 'desc' },
      distinct: ['userId', 'userType'],
    });
    // Meme userId (1) mais userType distinct => deux lignes distinctes.
    const keys = rows.map((r: any) => `${r.userId}:${r.userType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('recalcule isOnline: true pour une position fraiche, false pour une position perimee', async () => {
    const now = Date.now();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        userId: 1,
        userType: UserType.COMMERCIAL,
        recordedAt: new Date(now - 60_000), // 1 min => en ligne
      },
      {
        id: 2,
        userId: 2,
        userType: UserType.MANAGER,
        recordedAt: new Date(now - 60 * 60_000), // 1 h => hors-ligne
      },
    ]);
    const prisma = { gpsPosition: { findMany } } as any;
    const service = new GpsTrackingService(prisma);

    const rows = await service.getLatestActorPositions();

    expect(rows.find((r: any) => r.userId === 1)?.isOnline).toBe(true);
    expect(rows.find((r: any) => r.userId === 2)?.isOnline).toBe(false);
  });
});

describe('GpsTrackingService.getRouteByActor', () => {
  it('filtre par acteur (userId+userType) et plage, ordre croissant', async () => {
    const points = [
      {
        id: 1,
        userId: 7,
        userType: UserType.MANAGER,
        recordedAt: new Date('2026-07-03T08:00:00Z'),
      },
      {
        id: 2,
        userId: 7,
        userType: UserType.MANAGER,
        recordedAt: new Date('2026-07-03T09:00:00Z'),
      },
    ];
    const findMany = jest.fn().mockResolvedValue(points);
    const prisma = { gpsPosition: { findMany } } as any;
    const service = new GpsTrackingService(prisma);

    const rows = await service.getRouteByActor(
      7,
      UserType.MANAGER,
      '2026-07-03T00:00:00Z',
      '2026-07-03T23:59:59Z',
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe(7);
    expect(arg.where.userType).toBe(UserType.MANAGER);
    expect(arg.where.recordedAt.gte).toBeInstanceOf(Date);
    expect(arg.where.recordedAt.lte).toBeInstanceOf(Date);
    expect(arg.where.recordedAt.gte.getTime()).toBeLessThan(
      arg.where.recordedAt.lte.getTime(),
    );
    expect(arg.orderBy).toEqual({ recordedAt: 'asc' });
    expect(rows).toBe(points);
  });
});
