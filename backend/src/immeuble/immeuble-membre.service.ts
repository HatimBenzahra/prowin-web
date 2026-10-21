import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ImmeubleAccessService, roleUserType } from './immeuble-access.service';
import { Coequipier, ImmeubleMembre } from './immeuble.dto';

/** Acteur terrain vu depuis son équipe (le manager de référence). */
type ActeurEquipe = {
  prenom: string;
  managerId: number | null;
  status: UserStatus;
};

/**
 * Partage d'un immeuble entre membres d'une même équipe : tous les membres sont
 * à égalité (pas de propriétaire). N'importe quel membre ajoute un coéquipier,
 * chacun peut quitter l'immeuble sauf le dernier.
 */
@Injectable()
export class ImmeubleMembreService {
  private readonly logger = new Logger(ImmeubleMembreService.name);

  constructor(
    private prisma: PrismaService,
    private immeubleAccess: ImmeubleAccessService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Membres d'un immeuble (champ `Immeuble.membres`). `findUnique` + relation
   * fluente : Prisma regroupe ces appels en une requête sur une liste d'immeubles.
   */
  async findMembres(immeubleId: number): Promise<ImmeubleMembre[]> {
    const membres = await this.prisma.immeuble
      .findUnique({ where: { id: immeubleId } })
      .membres({
        select: {
          commercial: { select: { id: true, prenom: true, nom: true } },
          manager: { select: { id: true, prenom: true, nom: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

    return (membres ?? []).flatMap((membre): ImmeubleMembre[] => {
      if (membre.commercial) {
        return [{ ...membre.commercial, type: UserType.COMMERCIAL }];
      }
      if (membre.manager) {
        return [{ ...membre.manager, type: UserType.MANAGER }];
      }
      return [];
    });
  }

  /**
   * Commerciaux à qui l'utilisateur peut partager un immeuble : ceux du même
   * manager (pour un manager : ses commerciaux), hors lui-même, sans mélanger
   * comptes test et comptes de production.
   */
  async findCoequipiers(
    userId: number,
    userRole: string,
  ): Promise<Coequipier[]> {
    const acteur = await this.findActeurEquipe(userId, userRole);
    const where = acteur && this.coequipiersWhere(acteur, userId, userRole);
    if (!where) {
      return [];
    }

    return this.prisma.commercial.findMany({
      where,
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
    });
  }

  /**
   * Ajoute un coéquipier comme membre de l'immeuble. Idempotent : un commercial
   * déjà membre n'est ni ré-ajouté ni re-notifié.
   */
  async partager(
    immeubleId: number,
    commercialId: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.prisma.immeuble.findUnique({
      where: { id: immeubleId },
    });
    if (!immeuble) {
      throw new NotFoundException('Immeuble not found');
    }
    await this.assertMembre(immeubleId, userId, userRole);

    const acteur = await this.findActeurEquipe(userId, userRole);
    const where = acteur && this.coequipiersWhere(acteur, userId, userRole);
    const cible = where
      ? await this.prisma.commercial.findFirst({
          where: { AND: [where, { id: commercialId }] },
          select: { id: true },
        })
      : null;
    if (!acteur || !cible) {
      throw new ForbiddenException(
        'Ce commercial ne fait pas partie de votre équipe : partage impossible.',
      );
    }

    // createMany + skipDuplicates (ON CONFLICT DO NOTHING) : sûr en concurrence,
    // et `count` dit si le membre vient réellement d'être ajouté.
    const { count } = await this.prisma.immeubleMembre.createMany({
      data: [
        {
          immeubleId,
          commercialId: cible.id,
          ajouteParId: userId,
          ajouteParType: roleUserType(userRole),
        },
      ],
      skipDuplicates: true,
    });

    if (count > 0) {
      await this.notifierPartage(cible.id, acteur.prenom, immeuble);
    }

    return immeuble;
  }

  /** Retire l'utilisateur des membres. Le dernier membre doit supprimer l'immeuble. */
  async quitter(
    immeubleId: number,
    userId: number,
    userRole: string,
  ): Promise<boolean> {
    const membreWhere = this.immeubleAccess.membreWhere(userId, userRole);
    if (!membreWhere) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      // Verrou sur l'immeuble : deux départs simultanés ne doivent pas le vider.
      const verrou = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT "id" FROM "Immeuble" WHERE "id" = ${immeubleId} FOR UPDATE`,
      );
      if (verrou.length === 0) {
        throw new NotFoundException('Immeuble not found');
      }

      const membre = await tx.immeubleMembre.findFirst({
        where: { immeubleId, ...membreWhere },
        select: { id: true },
      });
      if (!membre) {
        throw new ForbiddenException("Vous n'êtes pas membre de cet immeuble.");
      }

      const nbMembres = await tx.immeubleMembre.count({
        where: { immeubleId },
      });
      if (nbMembres <= 1) {
        throw new BadRequestException(
          'Vous êtes le dernier membre de cet immeuble : supprimez-le plutôt que de le quitter.',
        );
      }

      await tx.immeubleMembre.delete({ where: { id: membre.id } });
      return true;
    });
  }

  private async assertMembre(
    immeubleId: number,
    userId: number,
    userRole: string,
  ) {
    const membreWhere = this.immeubleAccess.membreWhere(userId, userRole);
    const membre = membreWhere
      ? await this.prisma.immeubleMembre.findFirst({
          where: { immeubleId, ...membreWhere },
          select: { id: true },
        })
      : null;
    if (!membre) {
      throw new ForbiddenException(
        'Seul un membre de cet immeuble peut le partager.',
      );
    }
  }

  private async findActeurEquipe(
    userId: number,
    userRole: string,
  ): Promise<ActeurEquipe | null> {
    switch (userRole) {
      case 'commercial':
        return this.prisma.commercial.findUnique({
          where: { id: userId },
          select: { prenom: true, managerId: true, status: true },
        });
      case 'manager': {
        const manager = await this.prisma.manager.findUnique({
          where: { id: userId },
          select: { prenom: true, status: true },
        });
        return manager && { ...manager, managerId: userId };
      }
      default:
        return null;
    }
  }

  /**
   * Coéquipiers = commerciaux du même manager, hors l'utilisateur lui-même.
   * Un compte test ne partage qu'avec des comptes test, un compte de production
   * qu'avec des commerciaux actifs. `null` sans manager (pas d'équipe).
   */
  private coequipiersWhere(
    acteur: ActeurEquipe,
    userId: number,
    userRole: string,
  ): Prisma.CommercialWhereInput | null {
    if (acteur.managerId === null) {
      return null;
    }

    return {
      managerId: acteur.managerId,
      status:
        acteur.status === UserStatus.UTILISATEUR_TEST
          ? UserStatus.UTILISATEUR_TEST
          : UserStatus.ACTIF,
      ...(userRole === 'commercial' ? { id: { not: userId } } : {}),
    };
  }

  /** Notification best-effort : un échec n'annule jamais le partage. */
  private async notifierPartage(
    commercialId: number,
    prenomAuteur: string,
    immeuble: { id: number; adresse: string },
  ) {
    try {
      await this.notifications.notify({
        userId: commercialId,
        userType: UserType.COMMERCIAL,
        type: NotificationType.IMMEUBLE_PARTAGE,
        title: 'Immeuble partagé',
        body: `${prenomAuteur} a partagé un immeuble avec toi : ${immeuble.adresse}`,
        data: {
          type: NotificationType.IMMEUBLE_PARTAGE,
          immeubleId: immeuble.id,
          adresse: immeuble.adresse,
        },
      });
    } catch (error) {
      this.logger.error(
        `Notification de partage de l'immeuble ${immeuble.id} échouée`,
        error as Error,
      );
    }
  }
}
