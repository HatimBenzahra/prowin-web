import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RankPeriod } from '@prisma/client';
import { WinleadPlusApiService } from './winleadplus-api.service';
import { ContractRankingStatus } from './gamification.dto';

type PointTier = {
  key: string;
  label: string;
  minPoints: number;
  maxPoints: number | null;
};

type ScoreEntry = {
  id: number;
  commercialId: number | null;
  managerId: number | null;
  commercialWinleadPlusId?: string | null;
  managerWinleadPlusId?: string | null;
  commercialNom?: string | null;
  commercialPrenom?: string | null;
  managerNom?: string | null;
  managerPrenom?: string | null;
  points: number;
  contratsSignes: number;
};

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  private readonly pointTiers: PointTier[] = [
    { key: 'BRONZE', label: 'Bronze', minPoints: 0, maxPoints: 249 },
    { key: 'SILVER', label: 'Silver', minPoints: 250, maxPoints: 599 },
    { key: 'GOLD', label: 'Gold', minPoints: 600, maxPoints: 1199 },
    { key: 'PLATINUM', label: 'Platinum', minPoints: 1200, maxPoints: 2199 },
    { key: 'DIAMOND', label: 'Diamond', minPoints: 2200, maxPoints: 3499 },
    { key: 'MASTER', label: 'Master', minPoints: 3500, maxPoints: 4999 },
    {
      key: 'GRANDMASTER',
      label: 'Grandmaster',
      minPoints: 5000,
      maxPoints: 6999,
    },
    { key: 'LEGEND', label: 'Legend', minPoints: 7000, maxPoints: null },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly winleadPlusApi: WinleadPlusApiService,
  ) {}

  // ============================================================================
  // COMPUTE — Calculer le classement pour une période donnée
  // ============================================================================

  /**
   * Calcule le classement de tous les commerciaux ET managers actifs pour une période.
   *
   * Points = somme des Offre.points (score configurable) des contrats validés sur la période.
   * Chaque offre rapporte son score paramétré (onglet Offres de la console admin).
   *
   * Le calcul est idempotent: upsert par (commercialId/managerId, period, periodKey).
   */
  async computeRanking(
    period: RankPeriod,
    periodKey: string,
  ): Promise<{ computed: number }> {
    const periodField = this.getPeriodField(period);

    // 1. Récupérer tous les commerciaux avec mapping WinLead+ (ACTIF + CONTRAT_FINIE)
    const commercials = await this.prisma.commercial.findMany({
      where: {
        status: { in: ['ACTIF', 'CONTRAT_FINIE'] },
        winleadPlusId: { not: null },
      },
      select: { id: true },
    });

    // 2. Récupérer tous les managers avec mapping WinLead+ (ACTIF + CONTRAT_FINIE)
    const managers = await this.prisma.manager.findMany({
      where: {
        status: { in: ['ACTIF', 'CONTRAT_FINIE'] },
        winleadPlusId: { not: null },
      },
      select: { id: true },
    });

    // 3. Calculer les scores pour chaque commercial et manager
    const scores: ScoreEntry[] = [];

    for (const commercial of commercials) {
      const { points, contratsSignes } = await this.computeScore(
        'commercialId',
        commercial.id,
        periodField,
        periodKey,
      );
      scores.push({
        id: commercial.id,
        commercialId: commercial.id,
        managerId: null,
        points,
        contratsSignes,
      });
    }

    for (const manager of managers) {
      const { points, contratsSignes } = await this.computeScore(
        'managerId',
        manager.id,
        periodField,
        periodKey,
      );
      scores.push({
        id: manager.id,
        commercialId: null,
        managerId: manager.id,
        points,
        contratsSignes,
      });
    }

    // 4. Trier par points décroissants, puis par contrats signés en cas d'égalité
    scores.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.contratsSignes - a.contratsSignes;
    });

    // 5. Attribuer les rangs (ex aequo supporté)
    let currentRank = 1;
    for (let i = 0; i < scores.length; i++) {
      if (i > 0 && scores[i].points < scores[i - 1].points) {
        currentRank = i + 1;
      }

      const entry = scores[i];
      const pointTier = this.resolvePointTier(entry.points);

      // Récupérer le rang précédent pour le metadata
      const previousSnapshot = await this.findPreviousSnapshot(
        entry,
        period,
        periodKey,
      );
      const previousRank = previousSnapshot?.rank ?? null;
      const delta = previousRank !== null ? previousRank - currentRank : null;

      const snapshotData = {
        period,
        periodKey,
        rank: currentRank,
        points: entry.points,
        contratsSignes: entry.contratsSignes,
        metadata: {
          previousRank,
          delta,
          rankTierKey: pointTier.key,
          rankTierLabel: pointTier.label,
        },
      };

      if (entry.commercialId) {
        await this.prisma.rankSnapshot.upsert({
          where: {
            commercialId_period_periodKey: {
              commercialId: entry.commercialId,
              period,
              periodKey,
            },
          },
          create: { commercialId: entry.commercialId, ...snapshotData },
          update: { ...snapshotData, computedAt: new Date() },
        });
      } else if (entry.managerId) {
        await this.prisma.rankSnapshot.upsert({
          where: {
            managerId_period_periodKey: {
              managerId: entry.managerId,
              period,
              periodKey,
            },
          },
          create: { managerId: entry.managerId, ...snapshotData },
          update: { ...snapshotData, computedAt: new Date() },
        });
      }
    }

    this.logger.log(
      `Classement ${period}/${periodKey}: ${scores.length} participants classés (${commercials.length} commerciaux, ${managers.length} managers)`,
    );
    return { computed: scores.length };
  }

  // ============================================================================
  // READ — Récupérer le classement d'une période
  // ============================================================================

  async getRanking(
    period: RankPeriod,
    periodKey: string,
    includeContratFinie = false,
    contractStatuses: ContractRankingStatus[] = [ContractRankingStatus.VALIDE],
    token?: string,
  ) {
    if (contractStatuses.length === 0) {
      return [];
    }

    if (this.requiresDynamicRanking(contractStatuses)) {
      if (!token) {
        throw new Error(
          'Token requis pour filtrer le classement par statuts de contrats',
        );
      }

      return this.getDynamicRanking(
        period,
        periodKey,
        includeContratFinie,
        contractStatuses,
        token,
      );
    }

    const statusFilter = includeContratFinie
      ? { in: ['ACTIF' as const, 'CONTRAT_FINIE' as const] }
      : { equals: 'ACTIF' as const };

    return this.prisma.rankSnapshot.findMany({
      where: {
        period,
        periodKey,
        OR: [
          {
            commercial: { winleadPlusId: { not: null }, status: statusFilter },
          },
          { manager: { winleadPlusId: { not: null }, status: statusFilter } },
        ],
      },
      include: {
        commercial: {
          select: { id: true, nom: true, prenom: true },
        },
        manager: {
          select: { id: true, nom: true, prenom: true },
        },
      },
      orderBy: { rank: 'asc' },
    });
  }

  async getOffreDistribution(periodMonth: string) {
    const contrats = await this.prisma.contratValide.findMany({
      where: { periodMonth },
      select: { offreId: true },
    });

    const countByOffre: Record<number, number> = {};
    for (const c of contrats) {
      if (c.offreId)
        countByOffre[c.offreId] = (countByOffre[c.offreId] || 0) + 1;
    }

    const offreIds = Object.keys(countByOffre).map(Number);
    if (offreIds.length === 0) return [];

    const offres = await this.prisma.offre.findMany({
      where: { id: { in: offreIds } },
      select: {
        id: true,
        nom: true,
        categorie: true,
        fournisseur: true,
        logoUrl: true,
      },
    });

    const offreMap = new Map(offres.map((o) => [o.id, o]));

    return offreIds
      .map((id) => {
        const offre = offreMap.get(id);
        return {
          offreId: id,
          nom: offre?.nom || 'Inconnue',
          categorie: offre?.categorie || '',
          fournisseur: offre?.fournisseur || '',
          logoUrl: offre?.logoUrl || undefined,
          count: countByOffre[id],
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  async getCommercialRankings(commercialId: number) {
    return this.prisma.rankSnapshot.findMany({
      where: { commercialId },
      orderBy: [{ period: 'asc' }, { computedAt: 'desc' }],
    });
  }

  /**
   * Manager de référence pour le périmètre "équipe", dérivé de l'utilisateur courant :
   * - manager  → son propre id
   * - commercial → le managerId de sa fiche
   * - autres (admin/directeur) → null (pas d'équipe propre)
   */
  async resolveTeamManagerId(
    userId: number,
    role: string,
  ): Promise<number | null> {
    if (role === 'manager') return userId;
    if (role === 'commercial') {
      const commercial = await this.prisma.commercial.findUnique({
        where: { id: userId },
        select: { managerId: true },
      });
      return commercial?.managerId ?? null;
    }
    return null;
  }

  /**
   * Classement d'une équipe (commerciaux d'un même manager) sur une période,
   * re-classé 1..N sur les points (ex aequo au même rang).
   * Ne renvoie que les commerciaux ayant un snapshot pour la période.
   */
  async getTeamRanking(
    managerId: number,
    period: RankPeriod,
    periodKey: string,
  ) {
    const commercials = await this.prisma.commercial.findMany({
      where: { managerId },
      select: { id: true },
    });
    const ids = commercials.map((c) => c.id);
    if (ids.length === 0) return [];

    const snapshots = await this.prisma.rankSnapshot.findMany({
      where: { period, periodKey, commercialId: { in: ids } },
      include: {
        commercial: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: [{ points: 'desc' }, { contratsSignes: 'desc' }],
    });

    // Re-classement 1..N à l'échelle de l'équipe.
    let currentRank = 0;
    let lastPoints: number | null = null;
    return snapshots.map((s, i) => {
      if (lastPoints === null || s.points !== lastPoints) {
        currentRank = i + 1;
        lastPoints = s.points;
      }
      return { ...s, rank: currentRank };
    });
  }

  /** Récupérer le classement d'un manager spécifique sur toutes les périodes */
  async getManagerRankings(managerId: number) {
    return this.prisma.rankSnapshot.findMany({
      where: { managerId },
      orderBy: [{ period: 'asc' }, { computedAt: 'desc' }],
    });
  }

  // ============================================================================
  // HELPERS — Calcul du score
  // ============================================================================

  /**
   * Calcule le score d'un commercial ou manager pour une période.
   *
   * Points = somme des Offre.points (score configurable) des contrats validés sur la période.
   * Offre sans score → 0 point.
   * ContratsSignes = nombre de contrats validés sur la période.
   */
  private async computeScore(
    userField: 'commercialId' | 'managerId',
    userId: number,
    periodField: string,
    periodKey: string,
  ): Promise<{ points: number; contratsSignes: number }> {
    const contrats = await this.prisma.contratValide.findMany({
      where: {
        [userField]: userId,
        [periodField]: periodKey,
      },
      include: {
        offre: {
          select: { points: true },
        },
      },
    });

    const points = contrats.reduce((sum, c) => sum + (c.offre?.points ?? 0), 0);

    return { points, contratsSignes: contrats.length };
  }

  private async getDynamicRanking(
    period: RankPeriod,
    periodKey: string,
    includeContratFinie: boolean,
    contractStatuses: ContractRankingStatus[],
    token: string,
  ) {
    if (contractStatuses.length === 0) {
      return [];
    }

    const statusFilter = includeContratFinie
      ? { in: ['ACTIF' as const, 'CONTRAT_FINIE' as const] }
      : { equals: 'ACTIF' as const };

    const [commercials, managers, offres, prospects] = await Promise.all([
      this.prisma.commercial.findMany({
        where: { status: statusFilter, winleadPlusId: { not: null } },
        select: { id: true, nom: true, prenom: true, winleadPlusId: true },
      }),
      this.prisma.manager.findMany({
        where: { status: statusFilter, winleadPlusId: { not: null } },
        select: { id: true, nom: true, prenom: true, winleadPlusId: true },
      }),
      this.prisma.offre.findMany({
        select: { externalId: true, points: true },
      }),
      this.winleadPlusApi.getProspects(token),
    ]);

    const periodField = this.getPeriodField(period);
    const allowedStatuses = this.mapContractStatuses(contractStatuses);
    const offrePointsMap = new Map(
      offres.map((offre) => [offre.externalId, offre.points ?? 0]),
    );
    const scores = new Map<string, ScoreEntry>();

    for (const commercial of commercials) {
      if (!commercial.winleadPlusId) continue;
      scores.set(`commercial:${commercial.id}`, {
        id: commercial.id,
        commercialId: commercial.id,
        managerId: null,
        commercialWinleadPlusId: commercial.winleadPlusId,
        commercialNom: commercial.nom,
        commercialPrenom: commercial.prenom,
        points: 0,
        contratsSignes: 0,
      });
    }

    for (const manager of managers) {
      if (!manager.winleadPlusId) continue;
      scores.set(`manager:${manager.id}`, {
        id: -manager.id,
        commercialId: null,
        managerId: manager.id,
        managerWinleadPlusId: manager.winleadPlusId,
        managerNom: manager.nom,
        managerPrenom: manager.prenom,
        points: 0,
        contratsSignes: 0,
      });
    }

    const commercialIdByWinlead = new Map(
      commercials
        .filter((commercial) => commercial.winleadPlusId)
        .map((commercial) => [commercial.winleadPlusId!, commercial.id]),
    );
    const managerIdByWinlead = new Map(
      managers
        .filter((manager) => manager.winleadPlusId)
        .map((manager) => [manager.winleadPlusId!, manager.id]),
    );

    for (const prospect of prospects) {
      const mappedCommercialId = commercialIdByWinlead.get(
        prospect.commercialId,
      );
      const mappedManagerId = managerIdByWinlead.get(prospect.commercialId);

      for (const souscription of prospect.Souscription || []) {
        const offreExternalId = souscription.offreId ?? souscription.offre?.id;
        // Score configurable de l'offre (Offre.points). Pas d'équivalent "live"
        // côté WinLead+ → 0 si l'offre n'est pas mappée localement.
        const contractPoints = offreExternalId
          ? (offrePointsMap.get(offreExternalId) ?? 0)
          : 0;

        for (const contrat of souscription.contrats || []) {
          if (!allowedStatuses.has(contrat.statut)) {
            continue;
          }

          const referenceDate = this.resolveContractReferenceDate(contrat);
          if (!referenceDate) {
            continue;
          }

          const periods = this.computePeriodKeys(referenceDate);
          if (periods[periodField] !== periodKey) {
            continue;
          }

          if (mappedCommercialId) {
            const commercialEntry = scores.get(
              `commercial:${mappedCommercialId}`,
            );
            if (commercialEntry) {
              commercialEntry.contratsSignes += 1;
              commercialEntry.points += contractPoints;
            }
          }

          if (mappedManagerId) {
            const managerEntry = scores.get(`manager:${mappedManagerId}`);
            if (managerEntry) {
              managerEntry.contratsSignes += 1;
              managerEntry.points += contractPoints;
            }
          }
        }
      }
    }

    const orderedScores = Array.from(scores.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.contratsSignes - a.contratsSignes;
    });

    let currentRank = 1;
    return orderedScores.map((entry, index) => {
      if (index > 0) {
        const previousEntry = orderedScores[index - 1];
        if (entry.points < previousEntry.points) {
          currentRank = index + 1;
        }
      }

      return {
        id: entry.id,
        commercialId: entry.commercialId,
        managerId: entry.managerId,
        period,
        periodKey,
        rank: currentRank,
        points: entry.points,
        contratsSignes: entry.contratsSignes,
        metadata: {
          previousRank: null,
          delta: null,
          dynamicStatuses: contractStatuses,
          dynamicSource: 'live_winleadplus',
        },
        computedAt: new Date(),
        commercial: entry.commercialId
          ? {
              id: entry.commercialId,
              nom: entry.commercialNom,
              prenom: entry.commercialPrenom,
            }
          : undefined,
        manager: entry.managerId
          ? {
              id: entry.managerId,
              nom: entry.managerNom,
              prenom: entry.managerPrenom,
            }
          : undefined,
      };
    });
  }

  private requiresDynamicRanking(
    contractStatuses: ContractRankingStatus[],
  ): boolean {
    return contractStatuses.some(
      (status) => status !== ContractRankingStatus.VALIDE,
    );
  }

  private mapContractStatuses(
    contractStatuses: ContractRankingStatus[],
  ): Set<string> {
    return new Set(
      contractStatuses.map((status) => {
        switch (status) {
          case ContractRankingStatus.SIGNE:
            return 'Signé';
          case ContractRankingStatus.RETRACTE:
            return 'Rétracté';
          case ContractRankingStatus.VALIDE:
          default:
            return 'Validé';
        }
      }),
    );
  }

  private resolveContractReferenceDate(contrat: any): Date | null {
    const rawDate = contrat.dateValidation ?? contrat.dateSignature ?? null;
    return rawDate ? new Date(rawDate) : null;
  }

  private computePeriodKeys(date: Date): Record<string, string> {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return {
      periodDay: `${y}-${m}-${d}`,
      periodWeek: `${y}-W${this.getISOWeek(date)}`,
      periodMonth: `${y}-${m}`,
      periodQuarter: `${y}-Q${Math.ceil((date.getMonth() + 1) / 3)}`,
      periodYear: `${y}`,
    };
  }

  private getISOWeek(date: Date): string {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return String(weekNo).padStart(2, '0');
  }

  /**
   * Trouve le snapshot précédent pour calculer le delta de rang.
   */
  private async findPreviousSnapshot(
    entry: ScoreEntry,
    period: RankPeriod,
    periodKey: string,
  ) {
    if (entry.commercialId) {
      return this.prisma.rankSnapshot.findUnique({
        where: {
          commercialId_period_periodKey: {
            commercialId: entry.commercialId,
            period,
            periodKey,
          },
        },
        select: { rank: true },
      });
    }
    if (entry.managerId) {
      return this.prisma.rankSnapshot.findUnique({
        where: {
          managerId_period_periodKey: {
            managerId: entry.managerId,
            period,
            periodKey,
          },
        },
        select: { rank: true },
      });
    }
    return null;
  }

  /**
   * Mappe un RankPeriod vers le champ ContratValide correspondant.
   */
  private getPeriodField(period: RankPeriod): string {
    switch (period) {
      case 'DAILY':
        return 'periodDay';
      case 'WEEKLY':
        return 'periodWeek';
      case 'MONTHLY':
        return 'periodMonth';
      case 'QUARTERLY':
        return 'periodQuarter';
      case 'YEARLY':
        return 'periodYear';
      default:
        return 'periodMonth';
    }
  }

  resolvePointTier(points: number): PointTier {
    const safePoints = Math.max(0, points || 0);

    for (const tier of this.pointTiers) {
      if (tier.maxPoints === null && safePoints >= tier.minPoints) {
        return tier;
      }

      if (
        tier.maxPoints !== null &&
        safePoints >= tier.minPoints &&
        safePoints <= tier.maxPoints
      ) {
        return tier;
      }
    }

    return this.pointTiers[0];
  }
}
