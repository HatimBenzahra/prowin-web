import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma.service';
import type {
  StatisticSyncService,
  StatsActeurs,
} from '../statistic/statistic-sync.service';
import type { ImmeubleAccessService } from '../immeuble/immeuble-access.service';
import { StatutPorte, type UpdatePorteInput } from './porte.dto';
import { PorteService } from './porte.service';

/**
 * `PorteService.update` : c'est par là que passe chaque passage terrain. On fige
 * le compteur de repassages, la remise à zéro du RDV, l'attribution du passage à
 * son auteur, le déclenchement de la synchro des statistiques et l'écriture de
 * l'historique (Prisma mocké).
 */
describe('PorteService.update', () => {
  const IMMEUBLE_ID = 40;
  const COMMERCIAL_ID = 7;
  /** Coéquipier membre du même immeuble partagé. */
  const COEQUIPIER_ID = 8;
  const MANAGER_ID = 3;
  const visite = new Date('2026-10-17T09:00:00.000Z');

  type PorteEnBase = {
    id: number;
    immeubleId: number;
    statut: StatutPorte;
    nbRepassages: number;
    nbContrats: number;
    rdvDate: Date | null;
    rdvTime: string | null;
    dernierCommercialId: number | null;
    dernierManagerId: number | null;
  };

  const build = (porte: Partial<PorteEnBase> = {}) => {
    const current: PorteEnBase = {
      id: 1,
      immeubleId: IMMEUBLE_ID,
      statut: StatutPorte.NON_VISITE,
      nbRepassages: 0,
      nbContrats: 1,
      rdvDate: null,
      rdvTime: null,
      dernierCommercialId: null,
      dernierManagerId: null,
      ...porte,
    };
    const immeuble = {
      id: IMMEUBLE_ID,
      commercialId: COMMERCIAL_ID,
      managerId: null,
    };
    const prisma = {
      porte: {
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...current, ...args.data, immeuble }),
        ),
        delete: jest.fn(() => Promise.resolve(current)),
        findMany: jest.fn<Promise<unknown[]>, [{ where: unknown }]>(() =>
          Promise.resolve([]),
        ),
      },
      immeuble: {
        update: jest.fn(() => Promise.resolve(immeuble)),
        findMany: jest.fn(() => Promise.resolve([{ id: IMMEUBLE_ID }])),
      },
      statusHistorique: { create: jest.fn(() => Promise.resolve({})) },
    };
    const sync = {
      syncActeursStats: jest.fn<Promise<void>, [StatsActeurs]>(() =>
        Promise.resolve(),
      ),
      syncAuteursPortesSupprimees: jest.fn(() => Promise.resolve()),
    };
    // Contrôle d'accès testé à part (immeuble-access.service.spec.ts) : ici, un
    // inconnu (id 999) est refusé, les membres et le manager sont acceptés.
    const access = {
      ensurePorteAccess: jest.fn((_porteId: number, userId: number) =>
        userId === 999
          ? Promise.reject(new ForbiddenException('Access denied'))
          : Promise.resolve({ ...current, immeuble }),
      ),
      ensureImmeubleAccess: jest.fn(() => Promise.resolve(immeuble)),
      accessWhere: jest.fn(() => ({})),
    };
    const service = new PorteService(
      prisma as unknown as PrismaService,
      sync as unknown as StatisticSyncService,
      access as unknown as ImmeubleAccessService,
    );
    /** Données réellement envoyées à `prisma.porte.update`. */
    const sent = () => prisma.porte.update.mock.calls[0][0].data;
    const update = (
      input: Omit<UpdatePorteInput, 'id'>,
      userId = COMMERCIAL_ID,
      role = 'commercial',
    ) => service.update({ id: current.id, ...input }, userId, role);
    return { prisma, sync, service, update, sent };
  };

  describe('compteur de repassages', () => {
    it('passe à 1 au premier passage absent', async () => {
      const { update, sent } = build();
      await update({
        statut: StatutPorte.ABSENT,
        derniereVisite: visite,
      });
      expect(sent().nbRepassages).toBe(1);
    });

    it('incrémente un repassage horodaté sur une porte déjà absente', async () => {
      const { update, sent } = build({
        statut: StatutPorte.ABSENT,
        nbRepassages: 1,
      });
      await update({
        statut: StatutPorte.ABSENT,
        derniereVisite: visite,
      });
      expect(sent().nbRepassages).toBe(2);
    });

    it('ne touche pas au compteur sans nouveau passage', async () => {
      const { update, sent } = build({
        statut: StatutPorte.ABSENT,
        nbRepassages: 2,
      });
      await update({ statut: StatutPorte.ABSENT, commentaire: 'retouche' });
      expect(sent()).not.toHaveProperty('nbRepassages');
    });

    it('ne touche pas au compteur pour un autre statut', async () => {
      const { update, sent } = build({
        statut: StatutPorte.ABSENT,
        nbRepassages: 2,
      });
      await update({
        statut: StatutPorte.REFUS,
        derniereVisite: visite,
      });
      expect(sent()).not.toHaveProperty('nbRepassages');
    });
  });

  describe('date de RDV à chaque nouveau passage', () => {
    const ancienRdv = {
      statut: StatutPorte.RENDEZ_VOUS_PRIS,
      rdvDate: new Date('2026-10-01'),
      rdvTime: '10:00',
    };

    it('remet rdvDate/rdvTime à null quand le statut change', async () => {
      const { update, sent } = build(ancienRdv);
      await update({ statut: StatutPorte.NECESSITE_REPASSAGE });
      expect(sent()).toMatchObject({ rdvDate: null, rdvTime: null });
    });

    it('remet rdvDate/rdvTime à null sur un passage horodaté sans changement de statut', async () => {
      const { update, sent } = build(ancienRdv);
      await update({
        statut: StatutPorte.RENDEZ_VOUS_PRIS,
        derniereVisite: visite,
      });
      expect(sent()).toMatchObject({ rdvDate: null, rdvTime: null });
    });

    it('garde la date fournie avec le nouveau passage', async () => {
      const rdvDate = new Date('2026-10-20');
      const { update, sent } = build();
      await update({
        statut: StatutPorte.RENDEZ_VOUS_PRIS,
        rdvDate,
        rdvTime: '14:30',
      });
      expect(sent()).toMatchObject({ rdvDate, rdvTime: '14:30' });
    });

    it('ne touche pas au RDV hors nouveau passage (commentaire seul)', async () => {
      const { update, sent } = build(ancienRdv);
      await update({ commentaire: 'rappeler avant' });
      expect(sent()).toEqual({ commentaire: 'rappeler avant' });
    });
  });

  describe('auteur du dernier passage', () => {
    it('est le commercial qui change le statut', async () => {
      const { update, sent } = build();
      await update({ statut: StatutPorte.REFUS });
      expect(sent()).toMatchObject({
        dernierCommercialId: COMMERCIAL_ID,
        dernierManagerId: null,
      });
    });

    it('est le manager qui change le statut', async () => {
      const { update, sent } = build({ dernierCommercialId: COMMERCIAL_ID });
      await update({ statut: StatutPorte.REFUS }, MANAGER_ID, 'manager');
      expect(sent()).toMatchObject({
        dernierCommercialId: null,
        dernierManagerId: MANAGER_ID,
      });
    });

    it('passe au coéquipier qui repasse la porte', async () => {
      const { update, sent } = build({
        statut: StatutPorte.ABSENT,
        dernierCommercialId: COMMERCIAL_ID,
      });
      await update({ statut: StatutPorte.CONTRAT_SIGNE }, COEQUIPIER_ID);
      expect(sent()).toMatchObject({ dernierCommercialId: COEQUIPIER_ID });
    });

    it('ne change pas sans changement de statut', async () => {
      const { update, sent } = build({
        statut: StatutPorte.CONTRAT_SIGNE,
        dernierCommercialId: COMMERCIAL_ID,
      });
      await update(
        { statut: StatutPorte.CONTRAT_SIGNE, nbContrats: 2 },
        COEQUIPIER_ID,
      );
      expect(sent()).not.toHaveProperty('dernierCommercialId');
    });

    it('reste celui du dernier passage sur une correction du directeur', async () => {
      const { update, sent, prisma } = build({
        dernierCommercialId: COEQUIPIER_ID,
      });
      await update({ statut: StatutPorte.REFUS }, 1, 'directeur');
      expect(sent()).toMatchObject({
        dernierCommercialId: COEQUIPIER_ID,
        dernierManagerId: null,
      });
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commercialId: COEQUIPIER_ID,
          managerId: null,
        }) as unknown,
      });
    });

    it('revient au créateur sur une correction admin d’une porte jamais attribuée', async () => {
      const { update, sent, prisma } = build();
      await update({ statut: StatutPorte.REFUS }, 0, 'admin');
      expect(sent()).toMatchObject({
        dernierCommercialId: COMMERCIAL_ID,
        dernierManagerId: null,
      });
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commercialId: COMMERCIAL_ID,
          managerId: null,
        }) as unknown,
      });
    });
  });

  describe('synchronisation des statistiques', () => {
    it('est déclenchée pour l’auteur sur un changement de statut', async () => {
      const { update, sync } = build();
      await update({ statut: StatutPorte.REFUS });
      expect(sync.syncActeursStats).toHaveBeenCalledTimes(1);
      expect(sync.syncActeursStats).toHaveBeenCalledWith({
        commercialIds: [COMMERCIAL_ID],
        managerIds: [],
      });
    });

    it('recalcule l’auteur précédent et le nouveau sur une repasse', async () => {
      const { update, sync } = build({
        statut: StatutPorte.ABSENT,
        dernierCommercialId: COMMERCIAL_ID,
      });
      await update(
        { statut: StatutPorte.RENDEZ_VOUS_PRIS },
        MANAGER_ID,
        'manager',
      );
      expect(sync.syncActeursStats).toHaveBeenCalledWith({
        commercialIds: [COMMERCIAL_ID],
        managerIds: [MANAGER_ID],
      });
    });

    it('est déclenchée sur un changement de nbContrats sans changement de statut', async () => {
      const { update, sync } = build({
        statut: StatutPorte.CONTRAT_SIGNE,
        nbContrats: 1,
        dernierCommercialId: COMMERCIAL_ID,
      });
      await update({ statut: StatutPorte.CONTRAT_SIGNE, nbContrats: 2 });
      expect(sync.syncActeursStats).toHaveBeenCalledWith({
        commercialIds: [COMMERCIAL_ID],
        managerIds: [],
      });
    });

    it('n’est pas déclenchée sur une édition de commentaire seul', async () => {
      const { update, sync } = build({ statut: StatutPorte.REFUS });
      await update({ commentaire: 'gardien hostile' });
      expect(sync.syncActeursStats).not.toHaveBeenCalled();
    });

    it('n’est pas déclenchée quand statut et nbContrats sont inchangés', async () => {
      const { update, sync } = build({
        statut: StatutPorte.CONTRAT_SIGNE,
        nbContrats: 2,
      });
      await update({ statut: StatutPorte.CONTRAT_SIGNE, nbContrats: 2 });
      expect(sync.syncActeursStats).not.toHaveBeenCalled();
    });
  });

  describe('historique des statuts', () => {
    it('est écrit au nom du commercial qui change le statut', async () => {
      const { update, prisma } = build();
      await update({
        statut: StatutPorte.RENDEZ_VOUS_PRIS,
        commentaire: 'mardi',
        rdvTime: '18:00',
        duree: 90,
      });
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: {
          porteId: 1,
          statut: StatutPorte.RENDEZ_VOUS_PRIS,
          commentaire: 'mardi',
          rdvDate: null,
          rdvTime: '18:00',
          duree: 90,
          commercialId: COMMERCIAL_ID,
          managerId: null,
        },
      });
    });

    it('attribue au seul manager connecté, pas au créateur de l’immeuble', async () => {
      const { update, prisma } = build();
      await update({ statut: StatutPorte.REFUS }, MANAGER_ID, 'manager');
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commercialId: null,
          managerId: MANAGER_ID,
        }) as unknown,
      });
    });

    it('attribue au coéquipier qui passe sur l’immeuble partagé', async () => {
      const { update, prisma } = build();
      await update({ statut: StatutPorte.REFUS }, COEQUIPIER_ID);
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commercialId: COEQUIPIER_ID,
          managerId: null,
        }) as unknown,
      });
    });

    it('n’est pas écrit sans changement de statut', async () => {
      const { update, prisma } = build({ statut: StatutPorte.ABSENT });
      await update({
        statut: StatutPorte.ABSENT,
        derniereVisite: visite,
      });
      expect(prisma.statusHistorique.create).not.toHaveBeenCalled();
    });
  });

  describe('agenda personnel', () => {
    it('ne montre à un commercial que les RDV dont il est l’auteur', async () => {
      const { service, prisma } = build();
      await service.findRdvToday(COMMERCIAL_ID, 'commercial');
      expect(prisma.porte.findMany.mock.calls[0][0].where).toMatchObject({
        immeubleId: { in: [IMMEUBLE_ID] },
        dernierCommercialId: COMMERCIAL_ID,
      });
    });

    it('garde le périmètre équipe d’un manager', async () => {
      const { service, prisma } = build();
      await service.findRdvToday(MANAGER_ID, 'manager');
      expect(prisma.porte.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'dernierCommercialId',
      );
    });

    it('filtre l’activité du jour par auteur sans immeuble, pas avec', async () => {
      const { service, prisma } = build();
      await service.findModifiedToday(undefined, COMMERCIAL_ID, 'commercial');
      await service.findModifiedToday(IMMEUBLE_ID, COMMERCIAL_ID, 'commercial');
      const [global, immeuble] = prisma.porte.findMany.mock.calls.map(
        (call) => call[0].where,
      );
      expect(global).toMatchObject({ dernierCommercialId: COMMERCIAL_ID });
      expect(immeuble).toMatchObject({ immeubleId: IMMEUBLE_ID });
      expect(immeuble).not.toHaveProperty('dernierCommercialId');
    });
  });

  it('recalcule les stats de l’auteur d’une porte supprimée', async () => {
    const { service, sync, prisma } = build({
      dernierCommercialId: COMMERCIAL_ID,
    });
    await service.remove(1, 1, 'directeur');
    expect(prisma.porte.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(sync.syncAuteursPortesSupprimees).toHaveBeenCalledWith([
      expect.objectContaining({ dernierCommercialId: COMMERCIAL_ID }),
    ]);
  });

  it('refuse un commercial non membre de l’immeuble, sans rien écrire', async () => {
    const { update, prisma, sync } = build();
    await expect(
      update({ statut: StatutPorte.REFUS }, 999, 'commercial'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.porte.update).not.toHaveBeenCalled();
    expect(sync.syncActeursStats).not.toHaveBeenCalled();
  });
});
