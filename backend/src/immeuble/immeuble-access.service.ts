import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserType } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Type d'acteur porté par le rôle du token (null pour un admin). */
export function roleUserType(userRole: string): UserType | null {
  switch (userRole) {
    case 'commercial':
      return UserType.COMMERCIAL;
    case 'manager':
      return UserType.MANAGER;
    case 'directeur':
      return UserType.DIRECTEUR;
    default:
      return null;
  }
}

/**
 * Contrôle d'accès unique aux immeubles (et à leurs portes), partagé par les
 * modules immeuble, porte, statistic et recording. Un immeuble partagé n'a pas
 * de propriétaire : l'accès passe par ses membres (`ImmeubleMembre`).
 * - commercial : membre de l'immeuble ;
 * - manager : membre, un de ses commerciaux est membre, l'immeuble est dans sa
 *   zone, ou il a été créé par lui / un de ses commerciaux ;
 * - directeur : même règle via son périmètre (directeurId) ;
 * - admin : tous les immeubles.
 */
@Injectable()
export class ImmeubleAccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Filtre `ImmeubleMembre` désignant l'utilisateur lui-même. Seuls un
   * commercial ou un manager peuvent être membres : `null` sinon.
   */
  membreWhere(
    userId: number,
    userRole: string,
  ): Prisma.ImmeubleMembreWhereInput | null {
    switch (userRole) {
      case 'commercial':
        return { commercialId: userId };
      case 'manager':
        return { managerId: userId };
      default:
        return null;
    }
  }

  /** `where` Prisma des immeubles accessibles. Rôle inconnu : aucun immeuble. */
  accessWhere(userId: number, userRole: string): Prisma.ImmeubleWhereInput {
    switch (userRole) {
      case 'admin':
        return {};

      case 'directeur':
        return {
          OR: [
            {
              membres: {
                some: {
                  OR: [
                    { commercial: { directeurId: userId } },
                    { manager: { directeurId: userId } },
                  ],
                },
              },
            },
            { zone: { directeurId: userId } },
            { commercial: { directeurId: userId } },
            { manager: { directeurId: userId } },
          ],
        };

      case 'manager':
        return {
          OR: [
            {
              membres: {
                some: {
                  OR: [
                    { managerId: userId },
                    { commercial: { managerId: userId } },
                  ],
                },
              },
            },
            { zone: { managerId: userId } },
            { managerId: userId },
            { commercial: { managerId: userId } },
          ],
        };

      case 'commercial':
        return { membres: { some: { commercialId: userId } } };

      default:
        return { id: -1 };
    }
  }

  async ensureImmeubleAccess(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.prisma.immeuble.findUnique({
      where: { id: immeubleId },
    });

    if (!immeuble) {
      throw new NotFoundException('Immeuble not found');
    }

    await this.assertAccess(immeubleId, userId, userRole);

    return immeuble;
  }

  async ensurePorteAccess(porteId: number, userId: number, userRole: string) {
    const porte = await this.prisma.porte.findUnique({
      where: { id: porteId },
      include: { immeuble: true },
    });

    if (!porte) {
      throw new NotFoundException('Porte not found');
    }

    await this.assertAccess(porte.immeubleId, userId, userRole);

    return porte;
  }

  /** Même règle que `accessWhere`, appliquée à un immeuble existant. */
  private async assertAccess(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    if (userRole === 'admin') {
      return;
    }

    const accessible = await this.prisma.immeuble.count({
      where: { AND: [{ id: immeubleId }, this.accessWhere(userId, userRole)] },
    });

    if (accessible === 0) {
      throw new ForbiddenException('Access denied');
    }
  }
}
