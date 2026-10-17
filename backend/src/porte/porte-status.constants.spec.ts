import {
  StatutPorte,
  calculateStatsForStatus,
  type StatusStats,
} from './porte-status.constants';

/**
 * `calculateStatsForStatus` alimente toutes les statistiques agrégées
 * (StatisticSyncService) : chaque statut est figé ici, colonne par colonne.
 */
describe('calculateStatsForStatus', () => {
  const ZERO: StatusStats = {
    contratsSignes: 0,
    rendezVousPris: 0,
    refus: 0,
    absents: 0,
    argumentes: 0,
    nbPortesProspectes: 0,
  };

  const ATTENDU: Record<StatutPorte, StatusStats> = {
    [StatutPorte.NON_VISITE]: ZERO,
    [StatutPorte.CONTRAT_SIGNE]: {
      ...ZERO,
      contratsSignes: 3,
      nbPortesProspectes: 3,
    },
    [StatutPorte.REFUS]: { ...ZERO, refus: 3, nbPortesProspectes: 3 },
    [StatutPorte.RENDEZ_VOUS_PRIS]: {
      ...ZERO,
      rendezVousPris: 3,
      nbPortesProspectes: 3,
    },
    [StatutPorte.ABSENT]: { ...ZERO, absents: 3, nbPortesProspectes: 3 },
    // Un argumenté est un refus après discussion : il compte dans les deux colonnes.
    [StatutPorte.ARGUMENTE]: {
      ...ZERO,
      refus: 3,
      argumentes: 3,
      nbPortesProspectes: 3,
    },
    // Repasse (décisionnaire absent) : prospectée, ni refus ni contrat ni absent.
    [StatutPorte.NECESSITE_REPASSAGE]: { ...ZERO, nbPortesProspectes: 3 },
  };

  it('couvre tous les statuts de l’enum', () => {
    expect(Object.keys(ATTENDU).sort()).toEqual(
      Object.values(StatutPorte).sort(),
    );
  });

  it.each(Object.values(StatutPorte))('%s', (statut) => {
    expect(calculateStatsForStatus(statut, 3)).toEqual(ATTENDU[statut]);
  });

  it('accepte la valeur brute renvoyée par Prisma (chaîne)', () => {
    expect(calculateStatsForStatus('REFUS', 2)).toEqual({
      ...ZERO,
      refus: 2,
      nbPortesProspectes: 2,
    });
  });

  it('renvoie des zéros pour un statut inconnu', () => {
    expect(calculateStatsForStatus('STATUT_INCONNU', 5)).toEqual(ZERO);
  });

  it('renvoie des zéros pour un compte nul', () => {
    expect(calculateStatsForStatus(StatutPorte.CONTRAT_SIGNE, 0)).toEqual(ZERO);
  });
});
