import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma.service';
import type { StatisticSyncService } from '../statistic/statistic-sync.service';
import { StatutPorte, type UpdatePorteInput } from './porte.dto';
import { PorteService } from './porte.service';

/**
 * `PorteService.update` : c'est par là que passe chaque passage terrain. On fige
 * le compteur de repassages, la remise à zéro du RDV, le déclenchement de la
 * synchro des statistiques et l'écriture de l'historique (Prisma mocké).
 */
describe('PorteService.update', () => {
  const IMMEUBLE_ID = 40;
  const COMMERCIAL_ID = 7;
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
      ...porte,
    };
    const immeuble = {
      id: IMMEUBLE_ID,
      commercialId: COMMERCIAL_ID,
      managerId: MANAGER_ID,
      commercial: { id: COMMERCIAL_ID, managerId: MANAGER_ID, directeurId: 1 },
      manager: { id: MANAGER_ID, directeurId: 1 },
      zone: null,
    };
    const prisma = {
      porte: {
        findUnique: jest.fn(() => Promise.resolve({ ...current, immeuble })),
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...current, ...args.data, immeuble }),
        ),
      },
      immeuble: {
        update: jest.fn(() => Promise.resolve(immeuble)),
        findUnique: jest.fn(() =>
          Promise.resolve({
            commercialId: COMMERCIAL_ID,
            managerId: MANAGER_ID,
          }),
        ),
      },
      statusHistorique: { create: jest.fn(() => Promise.resolve({})) },
    };
    const sync = {
      syncCommercialStats: jest.fn<Promise<void>, [number]>(() =>
        Promise.resolve(),
      ),
    };
    const service = new PorteService(
      prisma as unknown as PrismaService,
      sync as unknown as StatisticSyncService,
    );
    /** Données réellement envoyées à `prisma.porte.update`. */
    const sent = () => prisma.porte.update.mock.calls[0][0].data;
    const update = (
      input: Omit<UpdatePorteInput, 'id'>,
      userId = COMMERCIAL_ID,
      role = 'commercial',
    ) => service.update({ id: current.id, ...input }, userId, role);
    return { prisma, sync, update, sent };
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

  describe('synchronisation des statistiques', () => {
    it('est déclenchée sur un changement de statut', async () => {
      const { update, sync } = build();
      await update({ statut: StatutPorte.REFUS });
      expect(sync.syncCommercialStats).toHaveBeenCalledTimes(1);
      expect(sync.syncCommercialStats).toHaveBeenCalledWith(IMMEUBLE_ID);
    });

    it('est déclenchée sur un changement de nbContrats sans changement de statut', async () => {
      const { update, sync } = build({
        statut: StatutPorte.CONTRAT_SIGNE,
        nbContrats: 1,
      });
      await update({ statut: StatutPorte.CONTRAT_SIGNE, nbContrats: 2 });
      expect(sync.syncCommercialStats).toHaveBeenCalledWith(IMMEUBLE_ID);
    });

    it('n’est pas déclenchée sur une édition de commentaire seul', async () => {
      const { update, sync } = build({ statut: StatutPorte.REFUS });
      await update({ commentaire: 'gardien hostile' });
      expect(sync.syncCommercialStats).not.toHaveBeenCalled();
    });

    it('n’est pas déclenchée quand statut et nbContrats sont inchangés', async () => {
      const { update, sync } = build({
        statut: StatutPorte.CONTRAT_SIGNE,
        nbContrats: 2,
      });
      await update({ statut: StatutPorte.CONTRAT_SIGNE, nbContrats: 2 });
      expect(sync.syncCommercialStats).not.toHaveBeenCalled();
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
          managerId: MANAGER_ID,
        },
      });
    });

    it('attribue au manager connecté et au commercial de l’immeuble', async () => {
      const { update, prisma } = build();
      await update({ statut: StatutPorte.REFUS }, MANAGER_ID, 'manager');
      expect(prisma.statusHistorique.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commercialId: COMMERCIAL_ID,
          managerId: MANAGER_ID,
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

  it('refuse un commercial qui ne possède pas l’immeuble, sans rien écrire', async () => {
    const { update, prisma, sync } = build();
    await expect(
      update({ statut: StatutPorte.REFUS }, 999, 'commercial'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.porte.update).not.toHaveBeenCalled();
    expect(sync.syncCommercialStats).not.toHaveBeenCalled();
  });
});
