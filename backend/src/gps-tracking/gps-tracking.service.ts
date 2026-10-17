import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReportPositionInput } from './gps-tracking.dto';
import { UserType } from '../zone/zone.dto';

// Au-dela de ce delai depuis la derniere position remontee, un acteur est
// considere hors-ligne (isOnline calcule a la lecture, pas persiste).
const ONLINE_THRESHOLD_MS = 5 * 60_000;

@Injectable()
export class GpsTrackingService {
  constructor(private prisma: PrismaService) {}

  // Positions remontees par l'app mobile. L'identite de l'acteur (userId, userType)
  // est imposee par l'appelant (derivee du token) et jamais par le client :
  // ReportPositionInput n'expose aucun champ d'identite.
  async saveForActor(
    userId: number,
    userType: UserType,
    inputs: ReportPositionInput[],
  ): Promise<number> {
    const data = inputs.map((input) => ({
      userId,
      userType,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      batteryLevel: input.batteryLevel ?? null,
      isOnline: true,
      recordedAt: input.recordedAt ?? new Date(),
    }));

    const result = await this.prisma.gpsPosition.createMany({ data });
    return result.count;
  }

  // Derniere position connue de chaque acteur (une ligne par (userId, userType)).
  // isOnline est recalcule a partir de la fraicheur de recordedAt : la valeur
  // persistee (toujours true) n'est pas fiable pour l'affichage temps reel.
  async getLatestActorPositions() {
    const rows = await this.prisma.gpsPosition.findMany({
      where: { userId: { not: null } },
      orderBy: { recordedAt: 'desc' },
      distinct: ['userId', 'userType'],
    });

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      isOnline: now - row.recordedAt.getTime() <= ONLINE_THRESHOLD_MS,
    }));
  }

  // Trace du jour keyee par acteur (source: app mobile).
  async getDailyRouteByActor(userId: number, userType: UserType, date: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.gpsPosition.findMany({
      where: {
        userId,
        userType,
        recordedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  // Trace d'un acteur sur une plage arbitraire.
  async getRouteByActor(
    userId: number,
    userType: UserType,
    from: string,
    to: string,
  ) {
    return this.prisma.gpsPosition.findMany({
      where: {
        userId,
        userType,
        recordedAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
