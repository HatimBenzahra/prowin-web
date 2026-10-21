import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  StatutPorte,
  calculateStatsForStatus,
} from '../porte/porte-status.constants';

/** Auteurs de passages dont les statistiques sont à recalculer. */
export type StatsActeurs = { commercialIds: number[]; managerIds: number[] };

/** Auteurs du dernier passage d'un ensemble de portes (sans doublon). */
export function acteursDesPortes(
  portes: {
    dernierCommercialId: number | null;
    dernierManagerId: number | null;
  }[],
): StatsActeurs {
  const ids = (values: (number | null)[]) => [
    ...new Set(values.filter((id): id is number => id !== null)),
  ];
  return {
    commercialIds: ids(portes.map((porte) => porte.dernierCommercialId)),
    managerIds: ids(portes.map((porte) => porte.dernierManagerId)),
  };
}

/**
 * Service de synchronisation automatique des statistiques
 * Maintient la cohérence entre les actions sur les portes et les stats
 */
@Injectable()
export class StatisticSyncService {
  private readonly logger = new Logger(StatisticSyncService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Recalcule les statistiques des auteurs des portes d'un immeuble (une porte
   * compte pour l'auteur de son dernier passage, pas pour le créateur).
   */
  async syncCommercialStats(immeubleId: number): Promise<void> {
    try {
      const portes = await this.prisma.porte.findMany({
        where: { immeubleId },
        select: { dernierCommercialId: true, dernierManagerId: true },
      });
      const acteurs = acteursDesPortes(portes);

      if (
        acteurs.commercialIds.length === 0 &&
        acteurs.managerIds.length === 0
      ) {
        this.logger.warn(
          `Immeuble ${immeubleId} n'a aucune porte attribuée à un commercial ou un manager`,
        );
        return;
      }

      await this.syncActeursStats(acteurs);
    } catch (error) {
      this.logger.error(
        `Erreur sync stats pour immeuble ${immeubleId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Recalcule les stats des auteurs de portes supprimées : une porte supprimée
   * ne compte plus pour personne. Best-effort : un échec est loggé sans faire
   * échouer la suppression, déjà effectuée.
   */
  async syncAuteursPortesSupprimees(
    portes: {
      dernierCommercialId: number | null;
      dernierManagerId: number | null;
    }[],
  ): Promise<void> {
    try {
      await this.syncActeursStats(acteursDesPortes(portes));
    } catch (error) {
      this.logger.error(
        'Erreur sync stats après suppression de portes:',
        error,
      );
    }
  }

  /**
   * Met à jour les statistiques des commerciaux et managers donnés (auteurs de
   * passages), puis celles de leur manager / directeur.
   */
  async syncActeursStats(acteurs: StatsActeurs): Promise<void> {
    const managerIds = new Set(acteurs.managerIds);
    const directeurIds = new Set<number>();

    const commerciaux =
      acteurs.commercialIds.length === 0
        ? []
        : await this.prisma.commercial.findMany({
            where: { id: { in: [...new Set(acteurs.commercialIds)] } },
            select: { id: true, managerId: true, directeurId: true },
          });

    for (const commercial of commerciaux) {
      const realStats = await this.calculateRealStats(commercial.id);
      await this.upsertStatistic(commercial.id, realStats);
      this.logger.debug(
        `Stats mises à jour pour commercial ${commercial.id}:`,
        realStats,
      );

      // Le manager du commercial (à défaut son directeur) agrège ses stats.
      if (commercial.managerId) {
        managerIds.add(commercial.managerId);
      } else if (commercial.directeurId) {
        directeurIds.add(commercial.directeurId);
      }
    }

    for (const managerId of managerIds) {
      await this.syncManagerStats(managerId);
    }
    for (const directeurId of directeurIds) {
      await this.syncDirecteurStats(directeurId);
    }
  }

  /**
   * Met à jour les statistiques d'un manager après modification
   */
  async syncManagerStats(managerId: number): Promise<void> {
    try {
      // Calculer les nouvelles statistiques basées sur toutes les portes du manager
      const realStats = await this.calculateManagerRealStats(managerId);

      // Mettre à jour ou créer la statistique
      await this.upsertManagerStatistic(managerId, realStats);

      this.logger.debug(
        `Stats mises à jour pour manager ${managerId}:`,
        realStats,
      );

      // Si le manager a un directeur, synchroniser aussi les stats du directeur
      const manager = await this.prisma.manager.findUnique({
        where: { id: managerId },
        select: { directeurId: true },
      });

      if (manager?.directeurId) {
        await this.syncDirecteurStats(manager.directeurId);
      }
    } catch (error) {
      this.logger.error(`Erreur sync stats pour manager ${managerId}:`, error);
      throw error;
    }
  }

  /**
   * Met à jour les statistiques d'un directeur après modification
   */
  async syncDirecteurStats(directeurId: number): Promise<void> {
    try {
      // Calculer les nouvelles statistiques basées sur la somme des stats de ses managers et commerciaux
      const realStats = await this.calculateDirecteurRealStats(directeurId);

      // Mettre à jour ou créer la statistique
      await this.upsertDirecteurStatistic(directeurId, realStats);

      this.logger.debug(
        `Stats mises à jour pour directeur ${directeurId}:`,
        realStats,
      );
    } catch (error) {
      this.logger.error(
        `Erreur sync stats pour directeur ${directeurId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Calcule les statistiques réelles d'un commercial : les portes dont il est
   * l'auteur du dernier passage, quel que soit le créateur de l'immeuble.
   */
  private async calculateRealStats(commercialId: number) {
    const result = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: {
        dernierCommercialId: commercialId,
      },
      _count: {
        statut: true,
      },
      _sum: {
        nbContrats: true,
      },
    });

    // Immeubles visités : au moins une porte prospectée dont il est l'auteur
    const immeublesVisites = await this.prisma.immeuble.count({
      where: {
        portes: {
          some: {
            dernierCommercialId: commercialId,
            statut: {
              not: StatutPorte.NON_VISITE,
            },
          },
        },
      },
    });

    // Transformer en stats
    const stats = {
      contratsSignes: 0,
      rendezVousPris: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      immeublesVisites: immeublesVisites,
      nbImmeublesProspectes: immeublesVisites, // Pour l'instant identique
      nbPortesProspectes: 0,
    };

    // Utilisation du helper centralisé pour calculer les stats
    result.forEach((group) => {
      const count = group._count.statut;
      const totalContrats = group._sum.nbContrats || 0;
      const statusStats = calculateStatsForStatus(group.statut, count);

      // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats
      // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats
      if (group.statut === StatutPorte.CONTRAT_SIGNE) {
        stats.contratsSignes += totalContrats;
      } else {
        stats.contratsSignes += statusStats.contratsSignes;
      }

      stats.rendezVousPris += statusStats.rendezVousPris;
      stats.refus += statusStats.refus;
      stats.absents += statusStats.absents;
      stats.argumentes += statusStats.argumentes;
      stats.nbPortesProspectes += statusStats.nbPortesProspectes;
    });

    return stats;
  }

  /**
   * Calcule les statistiques réelles d'un manager : les portes dont il est
   * l'auteur du dernier passage, quel que soit le créateur de l'immeuble.
   */
  private async calculateManagerRealStats(managerId: number) {
    const result = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: {
        dernierManagerId: managerId,
      },
      _count: {
        statut: true,
      },
      _sum: {
        nbContrats: true,
      },
    });

    // Immeubles visités : au moins une porte prospectée dont il est l'auteur
    const immeublesVisites = await this.prisma.immeuble.count({
      where: {
        portes: {
          some: {
            dernierManagerId: managerId,
            statut: {
              not: StatutPorte.NON_VISITE,
            },
          },
        },
      },
    });

    // Transformer en stats
    const stats = {
      contratsSignes: 0,
      rendezVousPris: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      immeublesVisites: immeublesVisites,
      nbImmeublesProspectes: immeublesVisites, // Pour l'instant identique
      nbPortesProspectes: 0,
    };

    // Utilisation du helper centralisé pour calculer les stats
    result.forEach((group) => {
      const count = group._count.statut;
      const totalContrats = group._sum.nbContrats || 0;
      const statusStats = calculateStatsForStatus(group.statut, count);

      // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats
      // Pour CONTRAT_SIGNE, utiliser la somme des nbContrats
      if (group.statut === StatutPorte.CONTRAT_SIGNE) {
        stats.contratsSignes += totalContrats;
      } else {
        stats.contratsSignes += statusStats.contratsSignes;
      }

      stats.rendezVousPris += statusStats.rendezVousPris;
      stats.refus += statusStats.refus;
      stats.absents += statusStats.absents;
      stats.argumentes += statusStats.argumentes;
      stats.nbPortesProspectes += statusStats.nbPortesProspectes;
    });

    return stats;
  }

  /**
   * Calcule les statistiques réelles d'un directeur basées sur la somme des stats de ses managers et commerciaux
   */
  private async calculateDirecteurRealStats(directeurId: number) {
    // 1. Somme des stats de tous les managers du directeur
    const managerStats = await this.prisma.statistic.aggregate({
      where: {
        manager: {
          directeurId: directeurId,
        },
      },
      _sum: {
        contratsSignes: true,
        rendezVousPris: true,
        refus: true,
        absents: true,
        argumentes: true,
        immeublesVisites: true,
        nbImmeublesProspectes: true,
        nbPortesProspectes: true,
      },
    });

    // 2. Somme des stats de TOUS les commerciaux du directeur (avec ou sans manager)
    const commercialStats = await this.prisma.statistic.aggregate({
      where: {
        commercial: {
          directeurId: directeurId,
        },
      },
      _sum: {
        contratsSignes: true,
        rendezVousPris: true,
        refus: true,
        absents: true,
        argumentes: true,
        immeublesVisites: true,
        nbImmeublesProspectes: true,
        nbPortesProspectes: true,
      },
    });

    // 3. Fusionner les deux sommes
    const stats = {
      contratsSignes:
        (managerStats._sum.contratsSignes || 0) +
        (commercialStats._sum.contratsSignes || 0),
      rendezVousPris:
        (managerStats._sum.rendezVousPris || 0) +
        (commercialStats._sum.rendezVousPris || 0),
      refus: (managerStats._sum.refus || 0) + (commercialStats._sum.refus || 0),
      absents:
        (managerStats._sum.absents || 0) + (commercialStats._sum.absents || 0),
      argumentes:
        (managerStats._sum.argumentes || 0) +
        (commercialStats._sum.argumentes || 0),
      immeublesVisites:
        (managerStats._sum.immeublesVisites || 0) +
        (commercialStats._sum.immeublesVisites || 0),
      nbImmeublesProspectes:
        (managerStats._sum.nbImmeublesProspectes || 0) +
        (commercialStats._sum.nbImmeublesProspectes || 0),
      nbPortesProspectes:
        (managerStats._sum.nbPortesProspectes || 0) +
        (commercialStats._sum.nbPortesProspectes || 0),
    };

    return stats;
  }

  /**
   * Met à jour ou crée une statistique pour un commercial
   */
  private async upsertStatistic(commercialId: number, stats: any) {
    // Récupérer la zone assignée au commercial via ZoneEnCours
    const zoneEnCours = await this.prisma.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId: commercialId,
          userType: 'COMMERCIAL',
        },
      },
    });

    const zoneId = zoneEnCours?.zoneId || null;

    // Chercher d'abord s'il existe une stat pour ce commercial
    const existingStat = await this.prisma.statistic.findFirst({
      where: { commercialId: commercialId },
    });

    if (existingStat) {
      // Mettre à jour (incluant zoneId)
      return this.prisma.statistic.update({
        where: { id: existingStat.id },
        data: {
          ...stats,
          zoneId, // Synchroniser avec la zone du commercial
          updatedAt: new Date(),
        },
      });
    } else {
      // Créer (incluant zoneId)
      return this.prisma.statistic.create({
        data: {
          commercialId: commercialId,
          zoneId, // Assigner automatiquement la zone du commercial
          ...stats,
        },
      });
    }
  }

  /**
   * Met à jour ou crée une statistique pour un manager
   */
  private async upsertManagerStatistic(managerId: number, stats: any) {
    // Récupérer la zone assignée au manager via ZoneEnCours (nouveau système)
    const zoneEnCours = await this.prisma.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId: managerId,
          userType: 'MANAGER',
        },
      },
    });

    const zoneId = zoneEnCours?.zoneId || null;

    // Chercher d'abord s'il existe une stat pour ce manager
    const existingStat = await this.prisma.statistic.findFirst({
      where: { managerId: managerId },
    });

    if (existingStat) {
      // Mettre à jour (incluant zoneId)
      return this.prisma.statistic.update({
        where: { id: existingStat.id },
        data: {
          ...stats,
          zoneId, // Synchroniser avec la zone du manager
          updatedAt: new Date(),
        },
      });
    } else {
      // Créer (incluant zoneId)
      return this.prisma.statistic.create({
        data: {
          managerId: managerId,
          zoneId, // Assigner automatiquement la zone du manager
          ...stats,
        },
      });
    }
  }

  /**
   * Met à jour ou crée une statistique pour un directeur
   */
  private async upsertDirecteurStatistic(directeurId: number, stats: any) {
    // Récupérer la zone assignée au directeur via ZoneEnCours
    const zoneEnCours = await this.prisma.zoneEnCours.findUnique({
      where: {
        userId_userType: {
          userId: directeurId,
          userType: 'DIRECTEUR',
        },
      },
    });

    const zoneId = zoneEnCours?.zoneId || null;

    // Chercher d'abord s'il existe une stat pour ce directeur
    const existingStat = await this.prisma.statistic.findFirst({
      where: { directeurId: directeurId },
    });

    if (existingStat) {
      // Mettre à jour (incluant zoneId)
      return this.prisma.statistic.update({
        where: { id: existingStat.id },
        data: {
          ...stats,
          zoneId, // Synchroniser avec la zone du directeur
          updatedAt: new Date(),
        },
      });
    } else {
      // Créer (incluant zoneId)
      return this.prisma.statistic.create({
        data: {
          directeurId: directeurId,
          zoneId, // Assigner automatiquement la zone du directeur
          ...stats,
        },
      });
    }
  }

  /**
   * Recalcule toutes les statistiques
   */
  async recalculateAllStats(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      // Récupérer tous les commerciaux
      const commerciaux = await this.prisma.commercial.findMany({
        select: { id: true },
      });

      for (const commercial of commerciaux) {
        try {
          const stats = await this.calculateRealStats(commercial.id);
          await this.upsertStatistic(commercial.id, stats);
          updated++;
        } catch (error) {
          this.logger.error(
            `Erreur recalcul stats commercial ${commercial.id}:`,
            error,
          );
          errors++;
        }
      }

      // Récupérer tous les managers
      const managers = await this.prisma.manager.findMany({
        select: { id: true },
      });

      for (const manager of managers) {
        try {
          const stats = await this.calculateManagerRealStats(manager.id);
          await this.upsertManagerStatistic(manager.id, stats);
          updated++;
        } catch (error) {
          this.logger.error(
            `Erreur recalcul stats manager ${manager.id}:`,
            error,
          );
          errors++;
        }
      }

      // Récupérer tous les directeurs
      const directeurs = await this.prisma.directeur.findMany({
        select: { id: true },
      });

      for (const directeur of directeurs) {
        try {
          const stats = await this.calculateDirecteurRealStats(directeur.id);
          await this.upsertDirecteurStatistic(directeur.id, stats);
          updated++;
        } catch (error) {
          this.logger.error(
            `Erreur recalcul stats directeur ${directeur.id}:`,
            error,
          );
          errors++;
        }
      }

      this.logger.log(
        `Recalcul terminé: ${updated} mis à jour, ${errors} erreurs`,
      );
      return { updated, errors };
    } catch (error) {
      this.logger.error('Erreur générale recalcul stats:', error);
      throw error;
    }
  }

  /**
   * Valide la cohérence entre portes et stats
   */
  async validateStatsCoherence(): Promise<{ valid: number; invalid: any[] }> {
    const invalid: Array<{
      commercialId: number;
      commercial: string;
      current: any;
      real: any;
    }> = [];
    let valid = 0;

    try {
      const statistics = await this.prisma.statistic.findMany({
        include: { commercial: true },
      });

      for (const stat of statistics) {
        if (!stat.commercialId) continue; // Skip si pas de commercial associé

        const realStats = await this.calculateRealStats(stat.commercialId);

        const isValid =
          stat.contratsSignes === realStats.contratsSignes &&
          stat.rendezVousPris === realStats.rendezVousPris &&
          stat.refus === realStats.refus &&
          stat.immeublesVisites === realStats.immeublesVisites;

        if (isValid) {
          valid++;
        } else {
          invalid.push({
            commercialId: stat.commercialId,
            commercial: stat.commercial?.nom + ' ' + stat.commercial?.prenom,
            current: {
              contratsSignes: stat.contratsSignes,
              rendezVousPris: stat.rendezVousPris,
              refus: stat.refus,
              immeublesVisites: stat.immeublesVisites,
            },
            real: realStats,
          });
        }
      }

      return { valid, invalid };
    } catch (error) {
      this.logger.error('Erreur validation cohérence:', error);
      throw error;
    }
  }
}
