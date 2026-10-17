import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma.service';
import { PorteService } from '../src/porte/porte.service';
import { StatutPorte, type UpdatePorteInput } from '../src/porte/porte.dto';
import { StatisticSyncService } from '../src/statistic/statistic-sync.service';

/**
 * Prospection → statuts porte → statistiques, sur une VRAIE base Postgres.
 *
 * On enchaîne des passages terrain via le vrai `PorteService.update`, qui déclenche
 * le vrai `StatisticSyncService`, puis on vérifie les lignes `Statistic` du
 * commercial, du manager et du directeur, et `validateStatsCoherence`.
 *
 * Base fournie par `npm run test:int` (TEST_DATABASE_URL). Jamais de repli sur le
 * .env : la suite vide les tables qu'elle utilise.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL manquant : lancer cette suite via `npm run test:int`.',
  );
}

describe('prospection → statistiques (base réelle)', () => {
  const prisma = new PrismaService({ datasources: { db: { url } } });
  let portes: PorteService;
  let sync: StatisticSyncService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PorteService,
        StatisticSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    portes = module.get(PorteService);
    sync = module.get(StatisticSyncService);
  });

  /** Ordre imposé par les clés étrangères. */
  const clean = async () => {
    await prisma.statistic.deleteMany();
    await prisma.statusHistorique.deleteMany();
    await prisma.porte.deleteMany();
    await prisma.immeuble.deleteMany();
    await prisma.zoneEnCours.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.commercial.deleteMany();
    await prisma.manager.deleteMany();
    await prisma.directeur.deleteMany();
  };

  /**
   * Directeur → manager → commercial, une zone en cours pour le commercial,
   * un immeuble prospecté par le commercial (2 × 4 portes) et un immeuble
   * prospecté par le manager lui-même (1 × 2 portes).
   */
  const seed = async () => {
    const directeur = await prisma.directeur.create({
      data: { nom: 'Durand', prenom: 'Dora' },
    });
    const manager = await prisma.manager.create({
      data: { nom: 'Martin', prenom: 'Max', directeurId: directeur.id },
    });
    const commercial = await prisma.commercial.create({
      data: {
        nom: 'Colin',
        prenom: 'Chloé',
        managerId: manager.id,
        directeurId: directeur.id,
      },
    });
    const zone = await prisma.zone.create({
      data: {
        nom: 'Zone test',
        xOrigin: 2.35,
        yOrigin: 48.85,
        rayon: 500,
        directeurId: directeur.id,
      },
    });
    await prisma.zoneEnCours.create({
      data: { zoneId: zone.id, userId: commercial.id, userType: 'COMMERCIAL' },
    });
    const immeuble = await prisma.immeuble.create({
      data: {
        adresse: '1 rue du Test',
        nbEtages: 2,
        nbPortesParEtage: 4,
        commercialId: commercial.id,
        zoneId: zone.id,
      },
    });
    const immeubleManager = await prisma.immeuble.create({
      data: {
        adresse: '2 rue du Test',
        nbEtages: 1,
        nbPortesParEtage: 2,
        managerId: manager.id,
      },
    });
    // Création des portes par le vrai service (rôle admin : pas d'ownership).
    await portes.createPortesForImmeuble(immeuble.id, 2, 4, 0, 'admin');
    await portes.createPortesForImmeuble(immeubleManager.id, 1, 2, 0, 'admin');
    const ids = async (immeubleId: number) =>
      (
        await prisma.porte.findMany({
          where: { immeubleId },
          orderBy: [{ etage: 'asc' }, { numero: 'asc' }],
          select: { id: true },
        })
      ).map((p) => p.id);
    return {
      directeur,
      manager,
      commercial,
      zone,
      portesCommercial: await ids(immeuble.id),
      portesManager: await ids(immeubleManager.id),
    };
  };

  type Seed = Awaited<ReturnType<typeof seed>>;
  let s: Seed;

  /** Passage d'un commercial sur sa porte, horodaté comme sur le terrain. */
  const passage = (
    id: number,
    input: Omit<UpdatePorteInput, 'id'>,
    userId = s.commercial.id,
    role = 'commercial',
  ) =>
    portes.update({ id, derniereVisite: new Date(), ...input }, userId, role);

  const statsOf = (where: {
    commercialId?: number;
    managerId?: number;
    directeurId?: number;
  }) =>
    prisma.statistic.findMany({
      where,
      select: {
        contratsSignes: true,
        rendezVousPris: true,
        refus: true,
        absents: true,
        argumentes: true,
        immeublesVisites: true,
        nbImmeublesProspectes: true,
        nbPortesProspectes: true,
        zoneId: true,
      },
    });

  /** Le scénario terrain complet (voir l'en-tête du fichier). */
  const scenario = async () => {
    const [p1, p2, p3, p4, p5] = s.portesCommercial;
    const [m1, m2] = s.portesManager;

    // P1 : absent → absent (repassage) → RDV → contrat → 2 contrats.
    await passage(p1, { statut: StatutPorte.ABSENT });
    await passage(p1, { statut: StatutPorte.ABSENT });
    await passage(p1, {
      statut: StatutPorte.RENDEZ_VOUS_PRIS,
      rdvDate: new Date('2026-10-20T00:00:00Z'),
      rdvTime: '18:30',
    });
    await passage(p1, { statut: StatutPorte.CONTRAT_SIGNE });
    // Retouche du nombre de contrats (même statut, pas de nouveau passage).
    await portes.update(
      { id: p1, nbContrats: 2 },
      s.commercial.id,
      'commercial',
    );

    await passage(p2, { statut: StatutPorte.REFUS });
    await passage(p3, { statut: StatutPorte.ARGUMENTE });
    await passage(p4, { statut: StatutPorte.NECESSITE_REPASSAGE });
    await passage(p5, { statut: StatutPorte.ABSENT });

    // Le manager prospecte son propre immeuble.
    await passage(
      m1,
      { statut: StatutPorte.CONTRAT_SIGNE },
      s.manager.id,
      'manager',
    );
    await passage(
      m2,
      {
        statut: StatutPorte.RENDEZ_VOUS_PRIS,
        rdvDate: new Date('2026-10-21T00:00:00Z'),
        rdvTime: '10:00',
      },
      s.manager.id,
      'manager',
    );
  };

  const ATTENDU_COMMERCIAL = {
    contratsSignes: 2, // P1 : 2 contrats
    rendezVousPris: 0, // le RDV de P1 est devenu un contrat
    refus: 2, // REFUS + ARGUMENTE
    absents: 1, // P5
    argumentes: 1, // P3
    immeublesVisites: 1,
    nbImmeublesProspectes: 1,
    nbPortesProspectes: 5, // P1..P5 (repasse comprise), 3 non visitées
  };
  const ATTENDU_MANAGER = {
    contratsSignes: 1,
    rendezVousPris: 1,
    refus: 0,
    absents: 0,
    argumentes: 0,
    immeublesVisites: 1,
    nbImmeublesProspectes: 1,
    nbPortesProspectes: 2,
  };
  /** Directeur = somme (manager + commerciaux rattachés). */
  const ATTENDU_DIRECTEUR = {
    contratsSignes: 3,
    rendezVousPris: 1,
    refus: 2,
    absents: 1,
    argumentes: 1,
    immeublesVisites: 2,
    nbImmeublesProspectes: 2,
    nbPortesProspectes: 7,
  };

  beforeEach(async () => {
    await clean();
    s = await seed();
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it('suit chaque passage sur la porte (repassages, RDV, historique)', async () => {
    const [p1] = s.portesCommercial;

    await passage(p1, { statut: StatutPorte.ABSENT });
    await passage(p1, { statut: StatutPorte.ABSENT });
    expect(
      await prisma.porte.findUniqueOrThrow({ where: { id: p1 } }),
    ).toMatchObject({
      statut: StatutPorte.ABSENT,
      nbRepassages: 2,
    });

    await passage(p1, {
      statut: StatutPorte.RENDEZ_VOUS_PRIS,
      rdvDate: new Date('2026-10-20T00:00:00Z'),
      rdvTime: '18:30',
    });
    expect(await statsOf({ commercialId: s.commercial.id })).toEqual([
      expect.objectContaining({ rendezVousPris: 1, absents: 0 }),
    ]);

    // Nouveau passage : la date du RDV précédent ne survit pas.
    await passage(p1, { statut: StatutPorte.CONTRAT_SIGNE });
    expect(
      await prisma.porte.findUniqueOrThrow({ where: { id: p1 } }),
    ).toMatchObject({
      statut: StatutPorte.CONTRAT_SIGNE,
      rdvDate: null,
      rdvTime: null,
    });

    // Un changement de statut = une ligne d'historique (pas le 2e « absent »).
    const historique = await prisma.statusHistorique.findMany({
      where: { porteId: p1 },
      orderBy: { id: 'asc' },
    });
    expect(historique.map((h) => h.statut)).toEqual([
      StatutPorte.ABSENT,
      StatutPorte.RENDEZ_VOUS_PRIS,
      StatutPorte.CONTRAT_SIGNE,
    ]);
    expect(historique.every((h) => h.commercialId === s.commercial.id)).toBe(
      true,
    );
  });

  it('agrège les statistiques du commercial, du manager et du directeur', async () => {
    await scenario();

    expect(await statsOf({ commercialId: s.commercial.id })).toEqual([
      { ...ATTENDU_COMMERCIAL, zoneId: s.zone.id },
    ]);
    expect(await statsOf({ managerId: s.manager.id })).toEqual([
      { ...ATTENDU_MANAGER, zoneId: null },
    ]);
    expect(await statsOf({ directeurId: s.directeur.id })).toEqual([
      { ...ATTENDU_DIRECTEUR, zoneId: null },
    ]);

    expect(await sync.validateStatsCoherence()).toEqual({
      valid: 1,
      invalid: [],
    });
  });

  it('le recalcul complet retombe sur les mêmes chiffres que la synchro incrémentale', async () => {
    await scenario();
    expect(await sync.recalculateAllStats()).toEqual({ updated: 3, errors: 0 });

    expect(await statsOf({ commercialId: s.commercial.id })).toEqual([
      expect.objectContaining(ATTENDU_COMMERCIAL),
    ]);
    expect(await statsOf({ managerId: s.manager.id })).toEqual([
      expect.objectContaining(ATTENDU_MANAGER),
    ]);
    expect(await statsOf({ directeurId: s.directeur.id })).toEqual([
      expect.objectContaining(ATTENDU_DIRECTEUR),
    ]);
  });
});
