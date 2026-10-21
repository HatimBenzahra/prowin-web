import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { prodImmeubleWhere } from '../enumeration-Status/prod-immeuble-where.util';
import { resolveContainingZoneId } from '../zone/zone.geometry';
import { ImmeubleAccessService, roleUserType } from './immeuble-access.service';
import { StatisticSyncService } from '../statistic/statistic-sync.service';
import {
  CreateImmeubleInput,
  CreateQuartierInput,
  ImmeubleProgressFilter,
  ImmeublesPageInput,
  MobileMapPlace,
  TypeHabitat,
  UpdateImmeubleInput,
} from './immeuble.dto';

@Injectable()
export class ImmeubleService {
  constructor(
    private prisma: PrismaService,
    private immeubleAccess: ImmeubleAccessService,
    private statisticSyncService: StatisticSyncService,
  ) {}

  /**
   * Vérifie qu'un manager possède bien un commercial (commercial.managerId === managerId).
   * Lève une ForbiddenException sinon.
   */
  private async assertManagerOwnsCommercial(
    managerId: number,
    commercialId: number,
  ) {
    const commercial = await this.prisma.commercial.findUnique({
      where: { id: commercialId },
      select: { managerId: true },
    });

    if (!commercial || commercial.managerId !== managerId) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * Vérifie qu'un directeur a bien la cible (commercial ou manager) dans son périmètre.
   */
  private async assertDirecteurOwnsTarget(
    directeurId: number,
    target: { commercialId?: number | null; managerId?: number | null },
  ) {
    if (target.commercialId) {
      const commercial = await this.prisma.commercial.findUnique({
        where: { id: target.commercialId },
        select: { directeurId: true },
      });
      if (!commercial || commercial.directeurId !== directeurId) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (target.managerId) {
      const manager = await this.prisma.manager.findUnique({
        where: { id: target.managerId },
        select: { directeurId: true },
      });
      if (!manager || manager.directeurId !== directeurId) {
        throw new ForbiddenException('Access denied');
      }
    }
  }

  /**
   * Dérive/valide l'identité du propriétaire (commercialId/managerId) à partir du
   * token (@CurrentUser), au lieu de faire confiance aveuglément au client.
   * - commercial : forcé sur lui-même (commercialId = son id), pas de managerId arbitraire.
   * - manager : pour lui (managerId = son id) ou pour un commercial de SON équipe (validé).
   * - directeur/admin : valide que la cible est dans son périmètre.
   * Renvoie l'ownership normalisé à utiliser à la création.
   */
  private async resolveCreationOwnership(
    data: Pick<CreateImmeubleInput, 'commercialId' | 'managerId'>,
    userId: number,
    userRole: string,
  ): Promise<{ commercialId?: number; managerId?: number }> {
    switch (userRole) {
      case 'commercial':
        // Toujours attribué au commercial connecté ; on ignore tout managerId du client.
        return { commercialId: userId, managerId: undefined };

      case 'manager':
        if (data.commercialId) {
          // Le manager agit pour un commercial : il doit posséder ce commercial.
          await this.assertManagerOwnsCommercial(userId, data.commercialId);
          return { commercialId: data.commercialId, managerId: undefined };
        }
        // Sinon l'immeuble est attribué au manager lui-même.
        return { commercialId: undefined, managerId: userId };

      case 'directeur':
        await this.assertDirecteurOwnsTarget(userId, data);
        return {
          commercialId: data.commercialId ?? undefined,
          managerId: data.managerId ?? undefined,
        };

      case 'admin':
        return {
          commercialId: data.commercialId ?? undefined,
          managerId: data.managerId ?? undefined,
        };

      default:
        throw new ForbiddenException('Access denied');
    }
  }

  /**
   * Résout géométriquement la zone contenant le point (lat/lng) de l'immeuble.
   * PUREMENT géométrique : aucun filtre par périmètre (créateur/manager/
   * directeur) — une zone créée par un admin (managerId/directeurId null)
   * doit pouvoir contenir le point tout autant qu'une autre. Charge TOUTES
   * les zones avec une géométrie exploitable (polygon non null OU rayon > 0)
   * et applique `resolveContainingZoneId` (plus petite aire gagne en cas de
   * chevauchement). Retourne `null` si les coordonnées sont absentes/invalides
   * ou si aucune zone ne contient le point.
   */
  private async resolveZoneIdByGeometry(data: {
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<number | null> {
    const { latitude, longitude } = data;
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    // Toutes les zones avec une géométrie exploitable, sans filtre de périmètre.
    const zones = await this.prisma.zone.findMany({
      where: {
        // polygon non null OU rayon > 0 (le disque hérité).
        NOT: { polygon: { equals: Prisma.DbNull }, rayon: { lte: 0 } },
      },
      select: {
        id: true,
        polygon: true,
        xOrigin: true,
        yOrigin: true,
        rayon: true,
      },
    });

    return resolveContainingZoneId(longitude, latitude, zones);
  }

  private async resolveZoneId(
    data: Pick<
      CreateImmeubleInput,
      'zoneId' | 'commercialId' | 'managerId' | 'latitude' | 'longitude'
    >,
  ) {
    // a. zoneId explicite fourni → comportement inchangé.
    if (data.zoneId) {
      return data.zoneId;
    }

    // b. Appartenance PUREMENT géométrique, calculée une fois à la création :
    //    le bâtiment est rattaché à la zone qui contient sa position. S'il
    //    n'est dans aucune zone → aucune zone (zoneId = null). Pas de fallback
    //    sur la zone active du créateur : la membership reflète la réalité
    //    géographique du tracé.
    return this.resolveZoneIdByGeometry(data);
  }

  /**
   * Cœur partagé de la ré-résolution géométrique de TOUS les immeubles
   * géolocalisés (latitude ET longitude non null) : recalcule le zoneId de
   * chacun par rapport à TOUTES les zones ayant une géométrie exploitable, et
   * persiste le nouveau zoneId s'il diffère (attache ou détache). Idempotent
   * et relançable — traite en batches pour ne pas tout charger d'un coup.
   *
   * Accepte optionnellement un client de transaction Prisma (`tx`) pour être
   * appelé depuis une autre transaction (ex. `ZoneService.create`/`update`,
   * pour ré-attacher/détacher automatiquement après création/édition d'une
   * zone). Sans `tx`, utilise `this.prisma` (backfill admin autonome).
   * Ne duplique jamais le lancer de rayon : toute la géométrie passe par
   * `resolveContainingZoneId` (zone.geometry.ts).
   */
  async reresolveAllImmeubleZones(tx?: any): Promise<{
    scanned: number;
    updated: number;
    attached: number;
    detached: number;
  }> {
    const client = tx ?? this.prisma;
    const BATCH_SIZE = 500;

    const zones = await client.zone.findMany({
      where: {
        NOT: { polygon: { equals: Prisma.DbNull }, rayon: { lte: 0 } },
      },
      select: {
        id: true,
        polygon: true,
        xOrigin: true,
        yOrigin: true,
        rayon: true,
      },
    });

    let scanned = 0;
    let updated = 0;
    let attached = 0;
    let detached = 0;
    let cursor: number | undefined;

    for (;;) {
      const batch: {
        id: number;
        latitude: number | null;
        longitude: number | null;
        zoneId: number | null;
      }[] = await client.immeuble.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true, zoneId: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor !== undefined ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) {
        break;
      }

      for (const immeuble of batch) {
        scanned++;
        const newZoneId = resolveContainingZoneId(
          immeuble.longitude!,
          immeuble.latitude!,
          zones,
        );
        if (newZoneId !== immeuble.zoneId) {
          await client.immeuble.update({
            where: { id: immeuble.id },
            data: { zoneId: newZoneId },
          });
          updated++;
          if (newZoneId != null) {
            attached++;
          } else {
            detached++;
          }
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH_SIZE) {
        break;
      }
    }

    return { scanned, updated, attached, detached };
  }

  /**
   * Backfill admin (idempotent, relançable) : ré-applique la résolution
   * géométrique à TOUS les immeubles géolocalisés. À déclencher après
   * déploiement du correctif de rattachement zone <-> immeuble, ou pour
   * réparer manuellement les données existantes.
   */
  async backfillImmeubleZones() {
    return this.reresolveAllImmeubleZones();
  }

  /** Trace de l'ajout d'un membre : qui l'a ajouté (null pour un admin). */
  private ajoutePar(userId: number, userRole: string) {
    const ajouteParType = roleUserType(userRole);
    return { ajouteParId: ajouteParType ? userId : null, ajouteParType };
  }

  /**
   * Membres initiaux d'un immeuble créé : son responsable (commercial et/ou
   * manager). Écrits avec l'immeuble, dans la même requête.
   */
  private membresCreation(
    ownership: { commercialId?: number; managerId?: number },
    userId: number,
    userRole: string,
  ): Prisma.ImmeubleMembreUncheckedCreateNestedManyWithoutImmeubleInput {
    const ajoutePar = this.ajoutePar(userId, userRole);
    return {
      create: [
        ...(ownership.commercialId
          ? [{ commercialId: ownership.commercialId, ...ajoutePar }]
          : []),
        ...(ownership.managerId
          ? [{ managerId: ownership.managerId, ...ajoutePar }]
          : []),
      ],
    };
  }

  /**
   * Réassignation du responsable (directeur/admin) : le nouveau remplace
   * l'ancien parmi les membres, sans quoi il n'aurait pas accès à l'immeuble.
   * Les autres membres (partage) sont conservés.
   */
  private membresReassignation(
    immeuble: {
      id: number;
      commercialId: number | null;
      managerId: number | null;
    },
    cible: { commercialId?: number | null; managerId?: number | null },
    userId: number,
    userRole: string,
  ):
    | Prisma.ImmeubleMembreUncheckedUpdateManyWithoutImmeubleNestedInput
    | undefined {
    const ajoutePar = this.ajoutePar(userId, userRole);
    const deleteMany: Prisma.ImmeubleMembreScalarWhereInput[] = [];
    const upsert: Prisma.ImmeubleMembreUpsertWithWhereUniqueWithoutImmeubleInput[] =
      [];

    if (
      cible.commercialId !== undefined &&
      cible.commercialId !== immeuble.commercialId
    ) {
      if (immeuble.commercialId !== null) {
        deleteMany.push({ commercialId: immeuble.commercialId });
      }
      if (cible.commercialId !== null) {
        upsert.push({
          where: {
            immeubleId_commercialId: {
              immeubleId: immeuble.id,
              commercialId: cible.commercialId,
            },
          },
          create: { commercialId: cible.commercialId, ...ajoutePar },
          update: {},
        });
      }
    }

    if (
      cible.managerId !== undefined &&
      cible.managerId !== immeuble.managerId
    ) {
      if (immeuble.managerId !== null) {
        deleteMany.push({ managerId: immeuble.managerId });
      }
      if (cible.managerId !== null) {
        upsert.push({
          where: {
            immeubleId_managerId: {
              immeubleId: immeuble.id,
              managerId: cible.managerId,
            },
          },
          create: { managerId: cible.managerId, ...ajoutePar },
          update: {},
        });
      }
    }

    return deleteMany.length > 0 || upsert.length > 0
      ? { deleteMany, upsert }
      : undefined;
  }

  async create(data: CreateImmeubleInput, userId: number, userRole: string) {
    // Dériver/valider le propriétaire depuis le token (anti-IDOR)
    const ownership = await this.resolveCreationOwnership(
      data,
      userId,
      userRole,
    );
    // Si un commercialId ou managerId est fourni, récupérer sa zone assignée
    const zoneId = await this.resolveZoneId({ ...data, ...ownership });

    // Créer l'immeuble avec la zone automatiquement assignée
    const immeuble = await this.prisma.immeuble.create({
      data: {
        adresse: data.adresse,
        latitude: data.latitude,
        longitude: data.longitude,
        typeHabitat: data.typeHabitat ?? TypeHabitat.IMMEUBLE,
        nbEtages: data.nbEtages,
        nbPortesParEtage: data.nbPortesParEtage,
        ascenseurPresent: data.ascenseurPresent,
        digitalCode: data.digitalCode,
        commercialId: ownership.commercialId,
        managerId: ownership.managerId,
        membres: this.membresCreation(ownership, userId, userRole),
        zoneId, // Assigner automatiquement la zone du commercial ou manager
        quartierId: data.quartierId,
        nbMaisonsPrevu: data.nbMaisonsPrevu,
      },
    });

    // Créer automatiquement toutes les portes pour cet immeuble
    const portes: any[] = [];
    for (let etage = 1; etage <= data.nbEtages; etage++) {
      for (let porte = 1; porte <= data.nbPortesParEtage; porte++) {
        portes.push({
          numero: `${etage}${porte.toString().padStart(2, '0')}`,
          etage,
          immeubleId: immeuble.id,
          statut: 'NON_VISITE',
          nbRepassages: 0,
        });
      }
    }

    // Créer toutes les portes en une fois
    if (portes.length > 0) {
      await this.prisma.porte.createMany({
        data: portes,
      });
    }

    return immeuble;
  }

  async createMaison(
    data: CreateImmeubleInput,
    userId: number,
    userRole: string,
  ) {
    const ownership = await this.resolveCreationOwnership(
      data,
      userId,
      userRole,
    );
    const zoneId = await this.resolveZoneId({ ...data, ...ownership });

    const immeuble = await this.prisma.immeuble.create({
      data: {
        adresse: data.adresse,
        latitude: data.latitude,
        longitude: data.longitude,
        typeHabitat: TypeHabitat.MAISON,
        nbEtages: 1,
        nbPortesParEtage: 1,
        ascenseurPresent: false,
        digitalCode: data.digitalCode,
        commercialId: ownership.commercialId,
        managerId: ownership.managerId,
        membres: this.membresCreation(ownership, userId, userRole),
        zoneId,
        quartierId: data.quartierId,
        nbMaisonsPrevu: 1,
      },
    });

    await this.prisma.porte.create({
      data: {
        numero: '1',
        nomPersonnalise: 'Maison',
        etage: 1,
        immeubleId: immeuble.id,
        statut: 'NON_VISITE',
        nbRepassages: 0,
      },
    });

    return immeuble;
  }

  /**
   * Construit le `where` Prisma de périmètre selon le rôle (visibilité des immeubles).
   * Source unique de vérité partagée par `findAll` et la pagination Lieux.
   * Renvoie `null` pour un rôle inconnu (aucun immeuble visible).
   */
  private buildRoleWhere(
    userId: number,
    userRole: string,
  ): Prisma.ImmeubleWhereInput | null {
    switch (userRole) {
      case 'admin':
        return {};

      case 'directeur':
        // Immeubles dont un membre est un commercial du directeur
        return { membres: { some: { commercial: { directeurId: userId } } } };

      case 'manager':
        // Immeubles dont un membre est un commercial du manager ou lui-même
        return {
          membres: {
            some: {
              OR: [
                { commercial: { managerId: userId } },
                { managerId: userId },
              ],
            },
          },
        };

      case 'commercial':
        // Immeubles dont le commercial est membre
        return { membres: { some: { commercialId: userId } } };

      default:
        return null;
    }
  }

  async findAll(userId?: number, userRole?: string) {
    // Vérifier que les paramètres sont définis (userId peut être 0 pour les admins)
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    const roleWhere = this.buildRoleWhere(userId, userRole);
    if (roleWhere === null) {
      return [];
    }

    return this.prisma.immeuble.findMany({
      where: { AND: [roleWhere, prodImmeubleWhere] },
      include: {
        portes: {
          select: {
            id: true,
            statut: true,
          },
        },
      },
    });
  }

  async findMobileManagerMapPlaces(
    userId: number,
    includeTeam: boolean,
  ): Promise<MobileMapPlace[]> {
    const rows = await this.prisma.immeuble.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        membres: {
          some: includeTeam
            ? {
                OR: [
                  { managerId: userId },
                  { commercial: { managerId: userId } },
                ],
              }
            : { managerId: userId },
        },
      },
      select: {
        id: true,
        adresse: true,
        latitude: true,
        longitude: true,
        typeHabitat: true,
        nbEtages: true,
        nbPortesParEtage: true,
        nbMaisonsPrevu: true,
        commercialId: true,
        managerId: true,
        zoneId: true,
        quartierId: true,
        updatedAt: true,
        commercial: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
        // Le manager est-il membre ? (MINE) Sinon lieu d'un de ses commerciaux.
        membres: { where: { managerId: userId }, select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((immeuble) => {
      const isTeam = immeuble.membres.length === 0;
      // Nom du créateur (commercial) pour un lieu d'équipe.
      const creatorName = isTeam
        ? [immeuble.commercial?.prenom, immeuble.commercial?.nom]
            .filter(Boolean)
            .join(' ') || undefined
        : undefined;

      return {
        id: immeuble.id,
        adresse: immeuble.adresse,
        latitude: immeuble.latitude!,
        longitude: immeuble.longitude!,
        typeHabitat: immeuble.typeHabitat as TypeHabitat,
        nbEtages: immeuble.nbEtages,
        nbPortesParEtage: immeuble.nbPortesParEtage,
        nbMaisonsPrevu: immeuble.nbMaisonsPrevu ?? undefined,
        commercialId: immeuble.commercialId ?? undefined,
        managerId: immeuble.managerId ?? undefined,
        zoneId: immeuble.zoneId ?? undefined,
        quartierId: immeuble.quartierId ?? undefined,
        ownership: isTeam ? 'TEAM' : 'MINE',
        creatorName,
        updatedAt: immeuble.updatedAt,
      };
    });
  }

  /**
   * Portée « MES immeubles » (ceux dont je suis membre) pour l'onglet Lieux
   * (mobile). Ce n'est PAS le périmètre d'équipe (`buildRoleWhere`) : un manager
   * ne voit QUE ses lieux ici — les lieux de ses commerciaux se consultent
   * uniquement sur la carte. `i` = alias de la table "Immeuble". Renvoie `null`
   * pour un rôle inconnu.
   */
  private ownScopeSql(userId: number, userRole: string): Prisma.Sql | null {
    switch (userRole) {
      case 'admin':
        return Prisma.sql`TRUE`;
      case 'commercial':
        return Prisma.sql`EXISTS (SELECT 1 FROM "ImmeubleMembre" m WHERE m."immeubleId" = i.id AND m."commercialId" = ${userId})`;
      case 'manager':
        // Uniquement les immeubles dont il est membre, pas ceux de l'équipe.
        return Prisma.sql`EXISTS (SELECT 1 FROM "ImmeubleMembre" m WHERE m."immeubleId" = i.id AND m."managerId" = ${userId})`;
      case 'directeur':
        return Prisma.sql`EXISTS (SELECT 1 FROM "ImmeubleMembre" m JOIN "Commercial" c ON c.id = m."commercialId" WHERE m."immeubleId" = i.id AND c."directeurId" = ${userId})`;
      default:
        return null;
    }
  }

  /**
   * Sous-requête calculant, pour chaque immeuble filtré par `whereSql`, sa
   * progression (`total`, `prospectees`, `percent`) — réplique EXACTE de
   * `getImmeubleProgress` + `effectiveTypeHabitat` côté mobile
   * (`components/immeubles/lieu-progress.ts` / `lieu-terms.ts`).
   */
  private scoredImmeublesSql(whereSql: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      SELECT
        s2.id, s2."createdAt", s2."quartierId", s2.total, s2.prospectees,
        (CASE WHEN s2.total = 0 THEN 0 ELSE ROUND(100.0 * s2.prospectees / s2.total) END) AS percent
      FROM (
        SELECT
          s1.id, s1."createdAt", s1."quartierId", s1.prospectees,
          (CASE
             WHEN s1.eff_type = 'MAISON'   THEN GREATEST(1, s1.real_portes)
             WHEN s1.eff_type = 'PAVILLON' THEN COALESCE(s1.nb_maisons, s1.nb_etages, s1.real_portes)
             ELSE (CASE WHEN s1.nb_etages * s1.nb_portes > 0 THEN s1.nb_etages * s1.nb_portes ELSE s1.real_portes END)
           END) AS total
        FROM (
          SELECT
            i.id, i."createdAt", i."quartierId",
            (CASE WHEN i."typeHabitat"::text = 'PAVILLON' AND i."nbPortesParEtage" > 1 THEN 'IMMEUBLE' ELSE i."typeHabitat"::text END) AS eff_type,
            i."nbEtages" AS nb_etages, i."nbPortesParEtage" AS nb_portes, i."nbMaisonsPrevu" AS nb_maisons,
            pc.real_portes, pc.prospectees
          FROM "Immeuble" i
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::int AS real_portes,
              COUNT(*) FILTER (WHERE p.statut::text <> 'NON_VISITE')::int AS prospectees
            FROM "Porte" p WHERE p."immeubleId" = i.id
          ) pc ON TRUE
          WHERE ${whereSql}
        ) s1
      ) s2
    `;
  }

  private progressPredicateSql(progress?: ImmeubleProgressFilter): Prisma.Sql {
    switch (progress) {
      case ImmeubleProgressFilter.INCOMPLETE:
        return Prisma.sql`percent < 100`;
      case ImmeubleProgressFilter.LOW:
        return Prisma.sql`percent < 35`;
      case ImmeubleProgressFilter.MID:
        return Prisma.sql`percent >= 35 AND percent < 70`;
      case ImmeubleProgressFilter.HIGH:
        return Prisma.sql`percent >= 70 AND percent < 100`;
      case ImmeubleProgressFilter.COMPLETE:
        return Prisma.sql`percent = 100`;
      case ImmeubleProgressFilter.ALL:
      default:
        return Prisma.sql`TRUE`;
    }
  }

  /**
   * Pagination keyset (curseur) des LIEUX AUTONOMES (quartierId NULL) pour
   * l'onglet Lieux mobile. Filtres 100% serveur (recherche/type/progression),
   * tri stable `(createdAt DESC, id DESC)`. N'affecte aucune query existante.
   */
  async findStandalonePaginated(
    input: ImmeublesPageInput,
    userId?: number,
    userRole?: string,
  ): Promise<{
    items: unknown[];
    nextCursor?: string;
    hasMore: boolean;
    totalCount: number;
    summary: { coveragePercent: number; standaloneCount: number };
  }> {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    const ownCond = this.ownScopeSql(userId, userRole);
    if (ownCond === null) {
      return {
        items: [],
        hasMore: false,
        totalCount: 0,
        summary: { coveragePercent: 0, standaloneCount: 0 },
      };
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    // Curseur : "createdAtISO__id"
    let cursorDate: Date | undefined;
    let cursorId: number | undefined;
    if (input.cursor) {
      const sep = input.cursor.lastIndexOf('__');
      const iso = sep >= 0 ? input.cursor.slice(0, sep) : '';
      const idPart = sep >= 0 ? input.cursor.slice(sep + 2) : '';
      const parsedDate = new Date(iso);
      const parsedId = Number(idPart);
      if (Number.isNaN(parsedDate.getTime()) || !Number.isInteger(parsedId)) {
        throw new BadRequestException('Curseur de pagination invalide.');
      }
      cursorDate = parsedDate;
      cursorId = parsedId;
    }

    // WHERE de la liste filtrée : mes lieux + autonomes + recherche + type.
    const filterConds: Prisma.Sql[] = [
      ownCond,
      Prisma.sql`i."quartierId" IS NULL`,
    ];
    if (input.search && input.search.trim()) {
      filterConds.push(
        Prisma.sql`i.adresse ILIKE ${`%${input.search.trim()}%`}`,
      );
    }
    if (input.typeHabitat) {
      // Filtre sur le type EFFECTIF (même règle que scoredImmeublesSql / le
      // mobile `effectiveTypeHabitat`) : un pavillon legacy (nbPortesParEtage>1)
      // est traité comme IMMEUBLE, pour rester cohérent avec l'affichage.
      filterConds.push(
        Prisma.sql`(CASE WHEN i."typeHabitat"::text = 'PAVILLON' AND i."nbPortesParEtage" > 1 THEN 'IMMEUBLE' ELSE i."typeHabitat"::text END) = ${input.typeHabitat}`,
      );
    }
    // Filtre plage de dates sur createdAt (bornes optionnelles ; createdTo
    // attendu en fin de journée côté client → borne inclusive).
    if (input.createdFrom) {
      filterConds.push(Prisma.sql`i."createdAt" >= ${input.createdFrom}`);
    }
    if (input.createdTo) {
      filterConds.push(Prisma.sql`i."createdAt" <= ${input.createdTo}`);
    }
    const filteredWhere = Prisma.join(filterConds, ' AND ');
    const scoredFiltered = this.scoredImmeublesSql(filteredWhere);
    const progressPredicate = this.progressPredicateSql(input.progress);
    const keysetPredicate =
      cursorDate && cursorId !== undefined
        ? Prisma.sql`AND ("createdAt", id) < (${cursorDate}, ${cursorId})`
        : Prisma.empty;

    // Page d'ids (limit + 1 pour détecter hasMore).
    const pageRows = await this.prisma.$queryRaw<
      { id: number; createdAt: Date }[]
    >(Prisma.sql`
      SELECT id, "createdAt"
      FROM (${scoredFiltered}) scored
      WHERE ${progressPredicate} ${keysetPredicate}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = pageRows.length > limit;
    const pageSlice = hasMore ? pageRows.slice(0, limit) : pageRows;
    const pageIds = pageSlice.map((r) => r.id);

    // Total du set filtré courant.
    const countRows = await this.prisma.$queryRaw<
      { count: number }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM (${scoredFiltered}) scored WHERE ${progressPredicate}
    `);
    const totalCount = countRows[0]?.count ?? 0;

    // Résumé header : couverture globale de MES immeubles (y.c. membres de
    // quartier) + nombre de mes lieux autonomes NON filtrés.
    const scoredOwn = this.scoredImmeublesSql(ownCond);
    const summaryRows = await this.prisma.$queryRaw<
      {
        total_total: number;
        total_prospectees: number;
        standalone_count: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(total), 0)::int AS total_total,
        COALESCE(SUM(prospectees), 0)::int AS total_prospectees,
        COUNT(*) FILTER (WHERE "quartierId" IS NULL)::int AS standalone_count
      FROM (${scoredOwn}) scored
    `);
    const sum = summaryRows[0];
    const coveragePercent =
      !sum || sum.total_total === 0
        ? 0
        : Math.round((100 * sum.total_prospectees) / sum.total_total);
    const standaloneCount = sum?.standalone_count ?? 0;

    // Hydratation (avec portes) puis ré-ordonnancement selon la page.
    const rows =
      pageIds.length === 0
        ? []
        : await this.prisma.immeuble.findMany({
            where: { id: { in: pageIds } },
            include: {
              portes: {
                select: {
                  id: true,
                  statut: true,
                  etage: true,
                  dernierCommercialId: true,
                  dernierManagerId: true,
                },
              },
            },
          });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = pageIds
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rows)[number] => !!r);

    const last = pageSlice[pageSlice.length - 1];
    const nextCursor =
      hasMore && last
        ? `${last.createdAt.toISOString()}__${last.id}`
        : undefined;

    return {
      items,
      nextCursor,
      hasMore,
      totalCount,
      summary: { coveragePercent, standaloneCount },
    };
  }

  async findQuartiers(userId?: number, userRole?: string) {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    const include = {
      include: {
        immeubles: { include: { portes: true } },
      },
    };

    switch (userRole) {
      case 'admin':
        return this.prisma.quartier.findMany(include);

      case 'directeur':
        return this.prisma.quartier.findMany({
          where: {
            OR: [
              { commercial: { directeurId: userId } },
              { manager: { directeurId: userId } },
              { zone: { directeurId: userId } },
            ],
          },
          ...include,
        });

      case 'manager':
        return this.prisma.quartier.findMany({
          where: {
            OR: [
              { managerId: userId },
              { commercial: { managerId: userId } },
              { zone: { managerId: userId } },
            ],
          },
          ...include,
        });

      case 'commercial':
        return this.prisma.quartier.findMany({
          where: { commercialId: userId },
          ...include,
        });

      default:
        return [];
    }
  }

  async findMobileMapQuartiers(userId?: number, userRole?: string) {
    if (userId === undefined || !userRole) {
      throw new ForbiddenException('UNAUTHORIZED');
    }

    const include = {
      include: {
        immeubles: {
          select: {
            id: true,
            adresse: true,
            latitude: true,
            longitude: true,
            typeHabitat: true,
            nbEtages: true,
            nbPortesParEtage: true,
            nbMaisonsPrevu: true,
            commercialId: true,
            managerId: true,
            zoneId: true,
            quartierId: true,
            updatedAt: true,
          },
        },
      },
    };

    switch (userRole) {
      case 'admin':
        return this.prisma.quartier.findMany(include);

      case 'directeur':
        return this.prisma.quartier.findMany({
          where: {
            OR: [
              { commercial: { directeurId: userId } },
              { manager: { directeurId: userId } },
              { zone: { directeurId: userId } },
            ],
          },
          ...include,
        });

      case 'manager':
        return this.prisma.quartier.findMany({
          where: {
            OR: [
              { managerId: userId },
              { commercial: { managerId: userId } },
              { zone: { managerId: userId } },
            ],
          },
          ...include,
        });

      case 'commercial':
        return this.prisma.quartier.findMany({
          where: { commercialId: userId },
          ...include,
        });

      default:
        return [];
    }
  }

  async findOne(id: number, userId: number, userRole: string) {
    await this.immeubleAccess.ensureImmeubleAccess(id, userId, userRole);

    return this.prisma.immeuble.findUnique({
      where: { id },
      include: {
        portes: {
          select: {
            id: true,
            statut: true,
            etage: true,
            numero: true,
            nbRepassages: true,
            rdvDate: true,
            rdvTime: true,
            commentaire: true,
            derniereVisite: true,
            dernierCommercialId: true,
            dernierManagerId: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async findMobileDetail(id: number, userId: number, userRole: string) {
    await this.immeubleAccess.ensureImmeubleAccess(id, userId, userRole);

    return this.prisma.immeuble.findUnique({
      where: { id },
      include: {
        portes: {
          select: {
            id: true,
            numero: true,
            nomPersonnalise: true,
            etage: true,
            immeubleId: true,
            statut: true,
            nbRepassages: true,
            nbContrats: true,
            rdvDate: true,
            rdvTime: true,
            commentaire: true,
            derniereVisite: true,
            duree: true,
            dernierCommercialId: true,
            dernierManagerId: true,
            updatedAt: true,
          },
          orderBy: [{ etage: 'asc' }, { numero: 'asc' }],
        },
      },
    });
  }

  async update(data: UpdateImmeubleInput, userId: number, userRole: string) {
    const { id, ...updateData } = data;

    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      id,
      userId,
      userRole,
    );

    // Anti mass-assignment (IDOR) : un commercial/manager ne peut PAS réassigner
    // l'immeuble vers un tiers. On retire ces champs d'ownership du payload.
    if (userRole === 'commercial' || userRole === 'manager') {
      delete (updateData as Record<string, unknown>).commercialId;
      delete (updateData as Record<string, unknown>).managerId;
    } else if (userRole === 'directeur') {
      // Le directeur ne peut réassigner que dans son périmètre : valide la cible.
      await this.assertDirecteurOwnsTarget(userId, {
        commercialId: updateData.commercialId,
        managerId: updateData.managerId,
      });
    }
    // admin : aucune restriction de réassignation commercial/manager.

    // zoneId est PUREMENT géométrique : jamais de confiance dans la valeur
    // envoyée par le client, quel que soit le rôle (y compris admin). Si la
    // mise à jour déplace le bâtiment (latitude et/ou longitude fournies), on
    // recalcule le zoneId depuis les nouvelles coordonnées ; sinon on ne
    // touche pas au zoneId existant.
    delete (updateData as Record<string, unknown>).zoneId;
    if (
      updateData.latitude !== undefined ||
      updateData.longitude !== undefined
    ) {
      const latitude = updateData.latitude ?? immeuble.latitude ?? undefined;
      const longitude = updateData.longitude ?? immeuble.longitude ?? undefined;
      (updateData as Record<string, unknown>).zoneId =
        await this.resolveZoneIdByGeometry({ latitude, longitude });
    }

    return this.prisma.immeuble.update({
      where: { id },
      data: {
        ...updateData,
        membres: this.membresReassignation(
          immeuble,
          updateData,
          userId,
          userRole,
        ),
      },
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    await this.immeubleAccess.ensureImmeubleAccess(id, userId, userRole);

    return this.prisma.immeuble.delete({
      where: { id },
    });
  }

  async removeTerrainLieu(id: number, userId: number, userRole: string) {
    await this.immeubleAccess.ensureImmeubleAccess(id, userId, userRole);

    const visitedPortes = await this.prisma.porte.count({
      where: {
        immeubleId: id,
        statut: { not: 'NON_VISITE' },
      },
    });

    if (visitedPortes > 0) {
      throw new BadRequestException(
        'Ce lieu contient deja des portes prospectees et ne peut pas etre supprime depuis la carte.',
      );
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const immeuble = await tx.immeuble.findUnique({
        where: { id },
      });

      if (!immeuble) {
        throw new NotFoundException('Immeuble not found');
      }

      const auteurs = await tx.porte.findMany({
        where: { immeubleId: id },
        select: { dernierCommercialId: true, dernierManagerId: true },
      });

      await tx.porte.deleteMany({
        where: { immeubleId: id },
      });

      await tx.immeuble.delete({
        where: { id },
      });

      return { immeuble, auteurs };
    });

    await this.statisticSyncService.syncAuteursPortesSupprimees(
      deleted.auteurs,
    );
    return deleted.immeuble;
  }

  async addPorteToEtage(
    immeubleId: number,
    etage: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

    if (etage < 1 || etage > immeuble.nbEtages) {
      throw new Error('Invalid floor number');
    }

    // Trouver le prochain numéro de porte pour cet étage
    const portesEtage = await this.prisma.porte.findMany({
      where: {
        immeubleId,
        etage,
      },
      orderBy: {
        numero: 'desc',
      },
      take: 1,
    });

    let nouveauNumeroPorte = 1;
    if (portesEtage.length > 0) {
      // Extraire le numéro de porte depuis le format "etageXX"
      const dernierNumero = portesEtage[0].numero;
      const numeroPorte = parseInt(dernierNumero.substring(1));
      nouveauNumeroPorte = numeroPorte + 1;
    } else {
      // Premier ajout de porte à cet étage, utiliser le nombre actuel + 1
      nouveauNumeroPorte = immeuble.nbPortesParEtage + 1;
    }

    // Créer la nouvelle porte
    await this.prisma.porte.create({
      data: {
        numero: `${etage}${nouveauNumeroPorte.toString().padStart(2, '0')}`,
        etage,
        immeubleId,
        statut: 'NON_VISITE',
        nbRepassages: 0,
      },
    });

    return immeuble;
  }

  async removePorteFromEtage(
    immeubleId: number,
    etage: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

    if (etage < 1 || etage > immeuble.nbEtages) {
      throw new Error('Invalid floor number');
    }

    // Trouver la dernière porte de cet étage
    const portesEtage = await this.prisma.porte.findMany({
      where: {
        immeubleId,
        etage,
      },
      orderBy: {
        numero: 'desc',
      },
      take: 1,
    });

    if (portesEtage.length === 0) {
      throw new Error('No doors found on this floor');
    }

    // Vérifier qu'il reste au moins une porte sur l'étage
    const totalPortesEtage = await this.prisma.porte.count({
      where: {
        immeubleId,
        etage,
      },
    });

    if (totalPortesEtage <= 1) {
      throw new Error('Cannot remove the last door from this floor');
    }

    // Supprimer la dernière porte
    await this.prisma.porte.delete({
      where: {
        id: portesEtage[0].id,
      },
    });
    await this.statisticSyncService.syncAuteursPortesSupprimees([
      portesEtage[0],
    ]);

    return immeuble;
  }

  async addEtage(immeubleId: number, userId: number, userRole: string) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

    const nouvelEtage = immeuble.nbEtages + 1;

    // Mettre à jour le nombre d'étages
    const updatedImmeuble = await this.prisma.immeuble.update({
      where: { id: immeubleId },
      data: {
        nbEtages: nouvelEtage,
      },
    });

    // Créer toutes les portes pour le nouvel étage
    const nouvellesPortes: any[] = [];
    for (let porte = 1; porte <= immeuble.nbPortesParEtage; porte++) {
      nouvellesPortes.push({
        numero: `${nouvelEtage}${porte.toString().padStart(2, '0')}`,
        etage: nouvelEtage,
        immeubleId,
        statut: 'NON_VISITE',
        nbRepassages: 0,
      });
    }

    // Créer toutes les nouvelles portes
    if (nouvellesPortes.length > 0) {
      await this.prisma.porte.createMany({
        data: nouvellesPortes,
      });
    }

    return updatedImmeuble;
  }

  async createEmpty(
    data: CreateImmeubleInput,
    userId: number,
    userRole: string,
  ) {
    const ownership = await this.resolveCreationOwnership(
      data,
      userId,
      userRole,
    );
    const zoneId = await this.resolveZoneId({ ...data, ...ownership });
    return this.prisma.immeuble.create({
      data: {
        adresse: data.adresse,
        latitude: data.latitude,
        longitude: data.longitude,
        typeHabitat: data.typeHabitat ?? TypeHabitat.IMMEUBLE,
        nbEtages: data.nbEtages,
        nbPortesParEtage: data.nbPortesParEtage,
        ascenseurPresent: data.ascenseurPresent,
        digitalCode: data.digitalCode,
        commercialId: ownership.commercialId,
        managerId: ownership.managerId,
        membres: this.membresCreation(ownership, userId, userRole),
        zoneId,
        quartierId: data.quartierId,
        nbMaisonsPrevu: data.nbMaisonsPrevu,
      },
    });
  }

  async createQuartier(
    data: CreateQuartierInput,
    userId: number,
    userRole: string,
  ) {
    if (!data.points || data.points.length === 0) {
      throw new BadRequestException(
        'Un quartier doit contenir au moins un point.',
      );
    }

    const ownership = await this.resolveCreationOwnership(
      data,
      userId,
      userRole,
    );
    const latitude =
      data.points.reduce((sum, point) => sum + point.latitude, 0) /
      data.points.length;
    const longitude =
      data.points.reduce((sum, point) => sum + point.longitude, 0) /
      data.points.length;
    // Résolution géométrique sur le centroïde du quartier (à la création).
    const zoneId = await this.resolveZoneId({
      ...data,
      ...ownership,
      latitude,
      longitude,
    });
    const nom =
      data.nom?.trim() || `Quartier ${new Date().toLocaleDateString('fr-FR')}`;

    return this.prisma.$transaction(async (tx) => {
      const quartier = await tx.quartier.create({
        data: {
          nom,
          latitude,
          longitude,
          commercialId: ownership.commercialId,
          managerId: ownership.managerId,
          zoneId,
        },
      });

      for (const point of data.points) {
        const isMaison = point.typeHabitat === TypeHabitat.MAISON;
        const isPavillon = point.typeHabitat === TypeHabitat.PAVILLON;
        const immeuble = await tx.immeuble.create({
          data: {
            adresse: point.adresse,
            latitude: point.latitude,
            longitude: point.longitude,
            typeHabitat: point.typeHabitat,
            nbEtages: isMaison ? 1 : (point.nbEtages ?? 1),
            nbPortesParEtage: isMaison ? 1 : (point.nbPortesParEtage ?? 1),
            nbMaisonsPrevu: isMaison
              ? 1
              : isPavillon
                ? (point.nbMaisonsPrevu ?? 2)
                : null,
            ascenseurPresent: false,
            commercialId: ownership.commercialId,
            managerId: ownership.managerId,
            membres: this.membresCreation(ownership, userId, userRole),
            zoneId,
            quartierId: quartier.id,
          },
        });

        if (isMaison) {
          await tx.porte.create({
            data: {
              numero: '1',
              nomPersonnalise: 'Maison',
              etage: 1,
              immeubleId: immeuble.id,
              statut: 'NON_VISITE',
              nbRepassages: 0,
            },
          });
        }
      }

      return tx.quartier.findUnique({
        where: { id: quartier.id },
        include: { immeubles: true },
      });
    });
  }

  async addEtageEmpty(immeubleId: number, userId: number, userRole: string) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );
    const nouvelEtage = immeuble.nbEtages + 1;
    return this.prisma.immeuble.update({
      where: { id: immeubleId },
      data: { nbEtages: nouvelEtage },
    });
  }

  async addPorteToEtageCapped(
    immeubleId: number,
    etage: number,
    userId: number,
    userRole: string,
  ) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );
    if (etage < 1 || etage > immeuble.nbEtages) {
      throw new BadRequestException(
        `Étage ${etage} invalide (1 à ${immeuble.nbEtages}).`,
      );
    }
    const portesEtage = await this.prisma.porte.findMany({
      where: { immeubleId, etage },
      orderBy: { numero: 'desc' },
    });
    if (portesEtage.length >= immeuble.nbPortesParEtage) {
      throw new BadRequestException(
        `L'étage ${etage} a déjà atteint sa capacité maximale (${immeuble.nbPortesParEtage} portes).`,
      );
    }
    let nouveauNumeroPorte = etage * 100 + 1;
    if (portesEtage.length > 0) {
      const numeros = portesEtage
        .map((p) => parseInt(p.numero, 10))
        .filter((n) => !Number.isNaN(n));
      if (numeros.length > 0) nouveauNumeroPorte = Math.max(...numeros) + 1;
    }
    await this.prisma.porte.create({
      data: {
        numero: String(nouveauNumeroPorte),
        etage,
        immeubleId,
        statut: 'NON_VISITE',
        nbRepassages: 0,
      },
    });
    return immeuble;
  }

  async removeEtage(immeubleId: number, userId: number, userRole: string) {
    const immeuble = await this.immeubleAccess.ensureImmeubleAccess(
      immeubleId,
      userId,
      userRole,
    );

    if (immeuble.nbEtages <= 1) {
      throw new Error('Cannot remove the last floor');
    }

    const etageASupprimer = immeuble.nbEtages;

    // Supprimer toutes les portes du dernier étage (auteurs relevés avant)
    const auteurs = await this.prisma.porte.findMany({
      where: { immeubleId, etage: etageASupprimer },
      select: { dernierCommercialId: true, dernierManagerId: true },
    });
    await this.prisma.porte.deleteMany({
      where: {
        immeubleId,
        etage: etageASupprimer,
      },
    });

    // Mettre à jour le nombre d'étages
    const updated = await this.prisma.immeuble.update({
      where: { id: immeubleId },
      data: {
        nbEtages: immeuble.nbEtages - 1,
      },
    });
    await this.statisticSyncService.syncAuteursPortesSupprimees(auteurs);
    return updated;
  }
}
