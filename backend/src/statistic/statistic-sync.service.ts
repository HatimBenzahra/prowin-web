import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  StatutPorte,
  calculateStatsForStatus,
} from '../porte/porte-status.constants';

/**
 * Service de synchronisation automatique des statistiques
 * Maintient la cohérence entre les actions sur les portes et les stats
 */
@Injectable()
export class StatisticSyncService {
  private readonly logger = new Logger(StatisticSyncService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Met à jour les statistiques d'un commercial après modification d'une porte
   */
  async syncCommercialStats(immeubleId: number): Promise<void> {
    try {
      // 1. Récupérer l'immeuble et son commercial/manager
      const immeuble = await this.prisma.immeuble.findUnique({
        where: { id: immeubleId },
        include: {
          commercial: true,
          manager: true,
        },
      });

      if (!immeuble?.commercial && !immeuble?.manager) {
        this.logger.warn(
          `Immeuble ${immeubleId} n'a ni commercial ni manager associé`,
        );
        return;
      }

      // 2. Synchroniser les stats du commercial si présent
      if (immeuble.commercial) {
        const commercialId = immeuble.commercial.id;
        const realStats = await this.calculateRealStats(commercialId);
        await this.upsertStatistic(commercialId, realStats);
        this.logger.debug(
          `Stats mises à jour pour commercial ${commercialId}:`,
          realStats,
        );

        // 3. Si le commercial a un manager, synchroniser aussi les stats du manager
        if (immeuble.commercial.managerId) {
          await this.syncManagerStats(immeuble.commercial.managerId);
        }
        // 4. Si le commercial a un directeur (sans manager), synchroniser aussi les stats du directeur
        else if (immeuble.commercial.directeurId) {
          await this.syncDirecteurStats(immeuble.commercial.directeurId);
        }
      }

      // 4. Synchroniser les stats du manager si l'immeuble lui appartient directement
      if (immeuble.managerId) {
        await this.syncManagerStats(immeuble.managerId);
      }
    } catch (error) {
      this.logger.error(
        `Erreur sync stats pour immeuble ${immeubleId}:`,
        error,
      );
      throw error;
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
   * Calcule les statistiques réelles d'un commercial basées sur ses portes
   */
  private async calculateRealStats(commercialId: number) {
    // Récupérer toutes les portes des immeubles du commercial
    const result = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: {
        immeuble: {
          commercialId: commercialId,
        },
      },
      _count: {
        statut: true,
      },
      _sum: {
        nbContrats: true,
      },
    });

    // Calculer aussi le nombre d'immeubles visités (au moins une porte non NON_VISITE)
    const immeublesVisites = await this.prisma.immeuble.count({
      where: {
        commercialId: commercialId,
        portes: {
          some: {
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
   * Calcule les statistiques réelles d'un manager basées sur ses portes
   */
  private async calculateManagerRealStats(managerId: number) {
    // Récupérer toutes les portes des immeubles du manager
    const result = await this.prisma.porte.groupBy({
      by: ['statut'],
      where: {
        immeuble: {
          managerId: managerId,
        },
      },
      _count: {
        statut: true,
      },
      _sum: {
        nbContrats: true,
      },
    });

    // Calculer aussi le nombre d'immeubles visités (au moins une porte non NON_VISITE)
    const immeublesVisites = await this.prisma.immeuble.count({
      where: {
        managerId: managerId,
        portes: {
          some: {
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
