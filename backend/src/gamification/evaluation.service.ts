import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BadgeService } from './badge.service';

/**
 * Moteur d'évaluation automatique des badges.
 *
 * Lit les contrats validés (ContratValide) et les données de prospection (Statistic, StatusHistorique)
 * pour évaluer et attribuer les badges selon les 4 catégories:
 * - PROGRESSION: paliers tous produits confondus
 * - PRODUIT: paliers par badgeProductKey de l'offre
 * - PERFORMANCE: achievements individuels (timing, volumes, records, conversion, progression)
 * - TROPHEE: trophées trimestriels (top producteur par catégorie)
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly badgeService: BadgeService,
  ) {}

  // ============================================================================
  // ENTRY POINT — Évaluer tous les badges pour tous les participants mappés
  // ============================================================================

  async evaluateAll(): Promise<{
    evaluated: number;
    awarded: number;
    skipped: number;
  }> {
    const commercials = await this.prisma.commercial.findMany({
      where: { status: 'ACTIF', winleadPlusId: { not: null } },
      select: { id: true, winleadPlusId: true },
    });

    const managers = await this.prisma.manager.findMany({
      where: { status: 'ACTIF', winleadPlusId: { not: null } },
      select: { id: true, winleadPlusId: true },
    });

    const badges = await this.prisma.badgeDefinition.findMany({
      where: { isActive: true },
    });

    let totalAwarded = 0;
    let totalSkipped = 0;

    for (const commercial of commercials) {
      const result = await this.evaluateUser(
        'commercialId',
        commercial.id,
        badges,
      );
      totalAwarded += result.awarded;
      totalSkipped += result.skipped;
    }

    for (const manager of managers) {
      const result = await this.evaluateUser('managerId', manager.id, badges);
      totalAwarded += result.awarded;
      totalSkipped += result.skipped;
    }

    this.logger.log(
      `Évaluation terminée: ${commercials.length + managers.length} participants évalués, ${totalAwarded} badges attribués, ${totalSkipped} déjà existants`,
    );

    return {
      evaluated: commercials.length + managers.length,
      awarded: totalAwarded,
      skipped: totalSkipped,
    };
  }

  // ============================================================================
  // EVALUATION PAR PARTICIPANT
  // ============================================================================

  private async evaluateUser(
    userField: 'commercialId' | 'managerId',
    userId: number,
    badges: any[],
  ): Promise<{ awarded: number; skipped: number }> {
    // Pré-charger toutes les données nécessaires pour ce participant
    const context = await this.buildEvaluationContext(userField, userId);

    let awarded = 0;
    let skipped = 0;

    for (const badge of badges) {
      const condition = badge.condition as any;
      if (!condition?.metric) continue;

      const shouldAward = this.evaluateBadge(condition, context);
      if (!shouldAward) continue;

      const periodKey = this.getPeriodKeyForBadge(badge, condition, context);

      const result = await this.badgeService.awardBadge({
        [context.userField]: context.userId,
        badgeDefinitionId: badge.id,
        periodKey,
        metadata: JSON.stringify(this.buildBadgeMetadata(condition, context)),
      } as any);

      if (result.awarded) awarded++;
      else skipped++;
    }

    return { awarded, skipped };
  }

  // ============================================================================
  // CONTEXTE D'ÉVALUATION — Données pré-chargées pour un participant
  // ============================================================================

  private async buildEvaluationContext(
    userField: 'commercialId' | 'managerId',
    userId: number,
  ) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
    const currentYear = `${now.getFullYear()}`;
    const currentDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Tous les contrats validés de ce participant
    const allContrats = await this.prisma.contratValide.findMany({
      where: { [userField]: userId },
      include: { offre: true },
      orderBy: { dateValidation: 'asc' },
    });

    // Contrats groupés par produit (via offre.badgeProductKey)
    const contratsByProduct = new Map<string, number>();
    for (const c of allContrats) {
      const key = c.offre?.badgeProductKey;
      if (key) {
        contratsByProduct.set(key, (contratsByProduct.get(key) ?? 0) + 1);
      }
    }

    // Contrats par jour (pour multi-signatures/jour)
    const contratsByDay = new Map<string, number>();
    for (const c of allContrats) {
      contratsByDay.set(c.periodDay, (contratsByDay.get(c.periodDay) ?? 0) + 1);
    }

    // Contrats par semaine (pour records hebdo)
    const contratsByWeek = new Map<string, number>();
    for (const c of allContrats) {
      contratsByWeek.set(
        c.periodWeek,
        (contratsByWeek.get(c.periodWeek) ?? 0) + 1,
      );
    }

    // Contrats par mois (pour progression)
    const contratsByMonth = new Map<string, number>();
    for (const c of allContrats) {
      contratsByMonth.set(
        c.periodMonth,
        (contratsByMonth.get(c.periodMonth) ?? 0) + 1,
      );
    }

    // Contrats par trimestre par catégorie produit (pour trophées)
    const contratsByQuarterProduct = new Map<string, number>();
    for (const c of allContrats) {
      const prodKey = c.offre?.badgeProductKey;
      if (prodKey) {
        const key = `${c.periodQuarter}:${prodKey}`;
        contratsByQuarterProduct.set(
          key,
          (contratsByQuarterProduct.get(key) ?? 0) + 1,
        );
      }
    }

    // Contrats du mois en cours (pour ranking mensuel)
    const contratsThisMonth = allContrats.filter(
      (c) => c.periodMonth === currentMonth,
    ).length;

    // Contrats du trimestre en cours
    const contratsThisQuarter = allContrats.filter(
      (c) => c.periodQuarter === currentQuarter,
    ).length;

    // Badges déjà obtenus (pour meta-badge Grand Chelem)
    const existingBadges = await this.prisma.commercialBadge.findMany({
      where: { [userField]: userId },
      select: { badgeDefinitionId: true },
    });
    const distinctBadgeCount = new Set(
      existingBadges.map((b) => b.badgeDefinitionId),
    ).size;

    // Timing: heures des contrats validés aujourd'hui
    const todayContrats = allContrats.filter((c) => c.periodDay === currentDay);
    const todayHours = todayContrats
      .filter((c) => c.dateValidation !== null)
      .map((c) => c.dateValidation!.getHours());

    // Champs spécifiques commercial (source: StatusHistorique + Statistic)
    let portesParJour = 0;
    let totalArgumentes = 0;
    let totalPortesProspectes = 0;
    let repassageContrats = 0;
    let maxArgumentationsParJour = 0;
    let maxPortesProspectesParJour = 0;
    let argumentesThisMonth = 0;
    let closedThisMonth = 0;
    let repassageConversionsThisMonth = 0;

    if (userField === 'commercialId') {
      // Portes tapées par jour (pour record et badge Marathon)
      portesParJour = await this.getPortesParJour(userId);

      // Stats de conversion (contrats validés / argumentés)
      const stats = await this.prisma.statistic.aggregate({
        where: { commercialId: userId },
        _sum: { argumentes: true, nbPortesProspectes: true },
      });
      totalArgumentes = stats._sum.argumentes ?? 0;
      totalPortesProspectes = stats._sum.nbPortesProspectes ?? 0;

      // Repassages: portes où StatusHistorique montre ABSENT ou RENDEZ_VOUS_PRIS suivi de CONTRAT_SIGNE
      repassageContrats = await this.countRepassageContrats(userId);

      // Max argumentations en un seul jour (StatusHistorique: statut=ARGUMENTE groupé par jour)
      maxArgumentationsParJour = await this.getMaxStatutParJour(
        userId,
        'ARGUMENTE',
      );

      // Max portes prospectées en un seul jour (StatusHistorique: tout statut groupé par jour)
      maxPortesProspectesParJour =
        await this.getMaxPortesProspectesParJour(userId);

      // Taux closing du mois en cours: ARGUMENTE et CONTRAT_SIGNE ce mois-ci
      const monthClosingStats = await this.getMonthClosingStats(
        userId,
        currentMonth,
      );
      argumentesThisMonth = monthClosingStats.argumentes;
      closedThisMonth = monthClosingStats.closed;

      // Repassage conversions du mois en cours: portes ABSENT → CONTRAT_SIGNE ce mois-ci
      repassageConversionsThisMonth =
        await this.countRepassageConversionsThisMonth(userId, currentMonth);
    }

    return {
      now,
      currentDay,
      currentMonth,
      currentQuarter,
      currentYear,
      totalContrats: allContrats.length,
      contratsByProduct,
      contratsByDay,
      contratsByWeek,
      contratsByMonth,
      contratsByQuarterProduct,
      contratsThisMonth,
      contratsThisQuarter,
      distinctBadgeCount,
      todayHours,
      portesParJour,
      totalArgumentes,
      totalPortesProspectes,
      repassageContrats,
      maxArgumentationsParJour,
      maxPortesProspectesParJour,
      argumentesThisMonth,
      closedThisMonth,
      repassageConversionsThisMonth,
      allContrats,
      userField,
      userId,
    };
  }

  // ============================================================================
  // ÉVALUATION D'UN BADGE — Dispatch par métrique
  // ============================================================================

  private evaluateBadge(condition: any, ctx: any): boolean {
    switch (condition.metric) {
      // --- PROGRESSION ---
      case 'contratsSignes':
        return this.evalContratsSignes(condition, ctx);

      // --- PRODUIT ---
      case 'contratsProduit':
        return this.evalContratsProduit(condition, ctx);

      // --- PERFORMANCE: Argumentations par jour ---
      case 'argumentationsParJour':
        return this.evalArgumentationsParJour(condition, ctx);

      // --- PERFORMANCE: Portes prospectées par jour ---
      case 'portesProspectesParJour':
        return this.evalPortesProspectesParJour(condition, ctx);

      // --- PERFORMANCE: Taux closing ARGUMENTE → CONTRAT_SIGNE ---
      case 'tauxClosing':
        return this.evalTauxClosing(condition, ctx);

      // --- PERFORMANCE: Repassage conversion ABSENT → CONTRAT_SIGNE ---
      case 'repassageConversion':
        return this.evalRepassageConversion(condition, ctx);
      // --- PERFORMANCE: Volume portes ---
      case 'portesParJour':
        return this.evalPortesParJour(condition, ctx);

      // --- PERFORMANCE: Multi-signatures/jour ---
      case 'signaturesParJour':
        return this.evalSignaturesParJour(condition, ctx);

      // --- PERFORMANCE: Records hebdo ---
      case 'signaturesParSemaine':
        return this.evalSignaturesParSemaine(condition, ctx);

      // --- PERFORMANCE: Conversion (évalué via evaluateConversionRanking) ---
      case 'tauxConversion':
        // Classement comparatif hebdo — évalué séparément via evaluateConversionRanking()
        return false;

      // --- PERFORMANCE: Ratio portes/signatures (évalué via evaluateTransformationRanking) ---
      case 'ratioPortesSignatures':
        // Classement comparatif mensuel — évalué séparément via evaluateTransformationRanking()
        return false;

      // --- PERFORMANCE: Progression ---
      case 'progressionHebdo':
        return this.evalProgressionHebdo(condition, ctx);

      case 'progressionMensuelle':
        return this.evalProgressionMensuelle(condition, ctx);

      // --- PERFORMANCE: Progression ---

      // --- PERFORMANCE: Meta-badge ---
      case 'badgesDistincts':
        return ctx.distinctBadgeCount >= (condition.threshold ?? 5);

      default:
        return false;
    }
  }

  // ============================================================================
  // ÉVALUATEURS SPÉCIFIQUES
  // ============================================================================

  /** PROGRESSION: nombre total de contrats validés >= threshold */
  private evalContratsSignes(condition: any, ctx: any): boolean {
    // Pour les badges avec ranking (top1, top2, top3) — évalués séparément
    if (condition.ranking) return false;

    return ctx.totalContrats >= (condition.threshold ?? 0);
  }

  /** PRODUIT: nombre de contrats validés pour un produit donné >= threshold */
  private evalContratsProduit(condition: any, ctx: any): boolean {
    // Pour les trophées avec ranking — évalués séparément
    if (condition.ranking) return false;

    const categorie = condition.categorie;
    if (!categorie) return false;

    // Mapper la catégorie du badge vers les badgeProductKey correspondants
    const productKeys = this.mapCategorieToProductKeys(categorie);
    let count = 0;
    for (const key of productKeys) {
      count += ctx.contratsByProduct.get(key) ?? 0;
    }

    return count >= (condition.threshold ?? 0);
  }

  /** ARGUMENTATIONS PAR JOUR: N argumentations réalisées en un seul jour (source: StatusHistorique) */
  private evalArgumentationsParJour(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 20;
    return ctx.maxArgumentationsParJour >= threshold;
  }

  /** PORTES PROSPECTÉES PAR JOUR: N portes prospectées en un seul jour (source: StatusHistorique) */
  private evalPortesProspectesParJour(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 100;
    return ctx.maxPortesProspectesParJour >= threshold;
  }

  /** TAUX CLOSING: ratio ARGUMENTE → CONTRAT_SIGNE >= threshold% sur le mois (source: StatusHistorique) */
  private evalTauxClosing(condition: any, ctx: any): boolean {
    if (condition.scope !== 'mois') return false;
    const threshold = condition.threshold ?? 30;
    if (ctx.argumentesThisMonth === 0) return false;
    const rate = (ctx.closedThisMonth / ctx.argumentesThisMonth) * 100;
    return rate >= threshold;
  }

  /** REPASSAGE CONVERSION: N portes ABSENT → CONTRAT_SIGNE sur le mois (source: StatusHistorique) */
  private evalRepassageConversion(condition: any, ctx: any): boolean {
    if (condition.scope !== 'mois') return false;
    const threshold = condition.threshold ?? 3;
    return ctx.repassageConversionsThisMonth >= threshold;
  }

  /** VOLUME PORTES: N portes tapées en un seul jour (source: StatusHistorique) */
  private evalPortesParJour(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 50;
    return ctx.portesParJour >= threshold;
  }

  /** MULTI-SIGNATURES: N contrats validés dans une même journée */
  private evalSignaturesParJour(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 3;
    for (const count of ctx.contratsByDay.values()) {
      if (count >= threshold) return true;
    }
    return false;
  }

  /** RECORDS HEBDO: N contrats validés sur une même semaine (source: WinLead+) */
  private evalSignaturesParSemaine(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 5;
    for (const count of ctx.contratsByWeek.values()) {
      if (count >= threshold) return true;
    }
    return false;
  }

  /** PROGRESSION HEBDO: a progressé chaque semaine du mois en cours */
  private evalProgressionHebdo(condition: any, ctx: any): boolean {
    if (condition.scope !== 'mois' || condition.type !== 'constante')
      return false;

    // Récupérer les semaines du mois en cours et vérifier progression constante
    const currentMonth = ctx.currentMonth;
    const weeksInMonth: string[] = [];

    for (const c of ctx.allContrats) {
      if (
        c.periodMonth === currentMonth &&
        !weeksInMonth.includes(c.periodWeek)
      ) {
        weeksInMonth.push(c.periodWeek);
      }
    }

    if (weeksInMonth.length < 2) return false;

    weeksInMonth.sort();
    for (let i = 1; i < weeksInMonth.length; i++) {
      const prev = ctx.contratsByWeek.get(weeksInMonth[i - 1]) ?? 0;
      const curr = ctx.contratsByWeek.get(weeksInMonth[i]) ?? 0;
      if (curr <= prev) return false;
    }

    return true;
  }

  /** PROGRESSION MENSUELLE: amélioration de plus de X% d'un mois à l'autre */
  private evalProgressionMensuelle(condition: any, ctx: any): boolean {
    const threshold = condition.threshold ?? 50; // % d'amélioration requis

    const months = Array.from(ctx.contratsByMonth.keys()).sort();
    if (months.length < 2) return false;

    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const lastCount = ctx.contratsByMonth.get(lastMonth) ?? 0;
    const prevCount = ctx.contratsByMonth.get(prevMonth) ?? 0;

    if (prevCount === 0) return lastCount > 0;

    const improvement = ((lastCount - prevCount) / prevCount) * 100;
    return improvement >= threshold;
  }

  // ============================================================================
  // TROPHÉES — Évaluation comparative (top1 par catégorie sur le trimestre)
  // ============================================================================

  /**
   * Évalue les trophées trimestriels pour tous les participants.
   * Appelé séparément car nécessite un classement comparatif.
   */
  async evaluateTrophees(
    quarter: string,
  ): Promise<{ awarded: number; skipped: number }> {
    const trophees = await this.prisma.badgeDefinition.findMany({
      where: { category: 'TROPHEE', isActive: true },
    });

    let awarded = 0;
    let skipped = 0;

    for (const trophee of trophees) {
      const condition = trophee.condition as any;
      if (!condition?.ranking || !condition?.scope) continue;

      const winner = await this.findTropheeWinner(condition, quarter);
      if (!winner) continue;

      const result = await this.badgeService.awardBadge({
        [winner.winnerField]: winner.winnerId,
        badgeDefinitionId: trophee.id,
        periodKey: quarter,
        metadata: JSON.stringify({
          quarter,
          auto: true,
          metric: condition.metric,
          ranking: condition.ranking,
        }),
      } as any);

      if (result.awarded) awarded++;
      else skipped++;
    }

    return { awarded, skipped };
  }

  /**
   * Trouve le gagnant d'un trophée pour un trimestre donné.
   */
  private async findTropheeWinner(
    condition: any,
    quarter: string,
  ): Promise<{
    winnerId: number;
    winnerField: 'commercialId' | 'managerId';
  } | null> {
    if (condition.metric === 'contratsSignes') {
      // Top producteur global — plus de contrats validés sur le trimestre
      const topCommercial = await this.prisma.contratValide.groupBy({
        by: ['commercialId'],
        where: { periodQuarter: quarter, commercialId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      });

      const topManager = await this.prisma.contratValide.groupBy({
        by: ['managerId'],
        where: { periodQuarter: quarter, managerId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      });

      const commercialCount = topCommercial[0]?._count.id ?? 0;
      const managerCount = topManager[0]?._count.id ?? 0;

      if (commercialCount === 0 && managerCount === 0) return null;

      if (commercialCount >= managerCount && topCommercial[0]?.commercialId) {
        return {
          winnerId: topCommercial[0].commercialId,
          winnerField: 'commercialId',
        };
      }

      if (topManager[0]?.managerId) {
        return { winnerId: topManager[0].managerId, winnerField: 'managerId' };
      }

      if (topCommercial[0]?.commercialId) {
        return {
          winnerId: topCommercial[0].commercialId,
          winnerField: 'commercialId',
        };
      }

      return null;
    }

    if (condition.metric === 'contratsProduit' && condition.categorie) {
      // Top producteur par catégorie
      const productKeys = this.mapCategorieToProductKeys(condition.categorie);
      if (productKeys.length === 0) return null;

      // Récupérer les contrats du trimestre pour ces produits
      const topCommercial = await this.prisma.contratValide.groupBy({
        by: ['commercialId'],
        where: {
          periodQuarter: quarter,
          commercialId: { not: null },
          offre: { badgeProductKey: { in: productKeys } },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      });

      const topManager = await this.prisma.contratValide.groupBy({
        by: ['managerId'],
        where: {
          periodQuarter: quarter,
          managerId: { not: null },
          offre: { badgeProductKey: { in: productKeys } },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      });

      const commercialCount = topCommercial[0]?._count.id ?? 0;
      const managerCount = topManager[0]?._count.id ?? 0;

      if (commercialCount === 0 && managerCount === 0) return null;

      if (commercialCount >= managerCount && topCommercial[0]?.commercialId) {
        return {
          winnerId: topCommercial[0].commercialId,
          winnerField: 'commercialId',
        };
      }

      if (topManager[0]?.managerId) {
        return { winnerId: topManager[0].managerId, winnerField: 'managerId' };
      }

      if (topCommercial[0]?.commercialId) {
        return {
          winnerId: topCommercial[0].commercialId,
          winnerField: 'commercialId',
        };
      }

      return null;
    }

    return null;
  }

  // ============================================================================
  // PERFORMANCE RANKING — Badges basés sur le classement mensuel
  // ============================================================================

  /**
   * Évalue les badges de performance basés sur le ranking (top1/2/3 mensuel).
   */
  async evaluatePerformanceRanking(
    month: string,
  ): Promise<{ awarded: number; skipped: number }> {
    const rankingBadges = await this.prisma.badgeDefinition.findMany({
      where: {
        category: 'PERFORMANCE',
        isActive: true,
      },
    });

    // Filtrer ceux qui ont un ranking dans leur condition
    const rankedBadges = rankingBadges.filter((b) => {
      const cond = b.condition as any;
      return cond?.ranking && cond?.scope === 'mois';
    });

    if (rankedBadges.length === 0) return { awarded: 0, skipped: 0 };

    // Calculer le classement du mois par contrats validés (participants)
    const commercialRanking = await this.prisma.contratValide.groupBy({
      by: ['commercialId'],
      where: { periodMonth: month, commercialId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const managerRanking = await this.prisma.contratValide.groupBy({
      by: ['managerId'],
      where: { periodMonth: month, managerId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const ranking = [
      ...commercialRanking
        .filter((r) => r.commercialId !== null)
        .map((r) => ({
          winnerId: r.commercialId as number,
          winnerField: 'commercialId' as const,
          count: r._count.id,
        })),
      ...managerRanking
        .filter((r) => r.managerId !== null)
        .map((r) => ({
          winnerId: r.managerId as number,
          winnerField: 'managerId' as const,
          count: r._count.id,
        })),
    ].sort((a, b) => b.count - a.count);

    let awarded = 0;
    let skipped = 0;

    for (const badge of rankedBadges) {
      const condition = badge.condition as any;
      const rankPosition = this.parseRankPosition(condition.ranking);
      if (rankPosition === null || rankPosition > ranking.length) continue;

      const winner = ranking[rankPosition - 1];
      if (!winner) continue;

      const result = await this.badgeService.awardBadge({
        [winner.winnerField]: winner.winnerId,
        badgeDefinitionId: badge.id,
        periodKey: month,
        metadata: JSON.stringify({
          month,
          rank: rankPosition,
          contrats: winner.count,
          auto: true,
        }),
      } as any);

      if (result.awarded) awarded++;
      else skipped++;
    }

    return { awarded, skipped };
  }

  // ============================================================================
  // CONVERSION RANKING — Badge basé sur le meilleur taux de conversion hebdo
  // ============================================================================

  /**
   * Évalue le badge PERF_CONVERSION_KING pour une semaine donnée.
   * Taux de conversion = contrats validés (WinLead+) / argumentations (Statistic) sur la semaine.
   * Attribué au commercial avec le meilleur taux (minimum 1 argumentation requise).
   */
  async evaluateConversionRanking(
    weekKey: string,
  ): Promise<{ awarded: number; skipped: number }> {
    // Trouver les badges de type tauxConversion
    const conversionBadges = await this.prisma.badgeDefinition.findMany({
      where: { category: 'PERFORMANCE', isActive: true },
    });

    const targetBadges = conversionBadges.filter((b) => {
      const cond = b.condition as any;
      return cond?.metric === 'tauxConversion' && cond?.ranking;
    });

    if (targetBadges.length === 0) return { awarded: 0, skipped: 0 };

    // Plage de dates de la semaine ISO (lundi 00:00 → dimanche 23:59)
    const { start, end } = this.getWeekDateRange(weekKey);

    // 1. Contrats validés par commercial pour cette semaine (source: WinLead+)
    const contratsByCommercial = await this.prisma.contratValide.groupBy({
      by: ['commercialId'],
      where: { periodWeek: weekKey, commercialId: { not: null } },
      _count: { id: true },
    });

    // 2. Argumentations par commercial pour cette semaine (source: Statistic)
    const statsByCommercial = await this.prisma.statistic.groupBy({
      by: ['commercialId'],
      where: {
        commercialId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      _sum: { argumentes: true },
    });

    // Construire les maps pour lookup rapide
    const arguMap = new Map<number, number>();
    for (const s of statsByCommercial) {
      if (s.commercialId != null) {
        arguMap.set(s.commercialId, s._sum.argumentes ?? 0);
      }
    }

    // Calculer le taux de conversion pour chaque commercial
    const rankings: Array<{
      commercialId: number;
      rate: number;
      contrats: number;
      argumentes: number;
    }> = [];

    for (const entry of contratsByCommercial) {
      if (entry.commercialId == null) continue;
      const contrats = entry._count.id;
      const argumentes = arguMap.get(entry.commercialId) ?? 0;

      // Minimum 1 argumentation requise pour éviter division par zéro
      if (argumentes === 0) continue;

      const rate = contrats / argumentes;
      rankings.push({
        commercialId: entry.commercialId,
        rate,
        contrats,
        argumentes,
      });
    }

    // Trier par taux décroissant
    rankings.sort((a, b) => b.rate - a.rate);

    let awarded = 0;
    let skipped = 0;

    for (const badge of targetBadges) {
      const condition = badge.condition as any;
      const rankPosition = this.parseRankPosition(condition.ranking);
      if (rankPosition === null || rankPosition > rankings.length) continue;

      const winner = rankings[rankPosition - 1];
      if (!winner) continue;

      const result = await this.badgeService.awardBadge({
        commercialId: winner.commercialId,
        badgeDefinitionId: badge.id,
        periodKey: weekKey,
        metadata: JSON.stringify({
          weekKey,
          rank: rankPosition,
          contrats: winner.contrats,
          argumentes: winner.argumentes,
          conversionRate: Math.round(winner.rate * 100) / 100,
          auto: true,
        }),
      } as any);

      if (result.awarded) awarded++;
      else skipped++;
    }

    return { awarded, skipped };
  }

  // ============================================================================
  // TRANSFORMATION RANKING — Badge basé sur le meilleur ratio portes/contrats mensuel
  // ============================================================================

  /**
   * Évalue le badge PERF_CHAMPION_TRANSFORMATION pour un mois donné.
   * Ratio = contrats validés (WinLead+) / portes prospectées (Statistic.nbPortesProspectes) sur le mois.
   * Attribué au commercial avec le meilleur ratio (minimum 1 porte prospectée requise).
   */
  async evaluateTransformationRanking(
    month: string,
  ): Promise<{ awarded: number; skipped: number }> {
    // Trouver les badges de type ratioPortesSignatures
    const perfBadges = await this.prisma.badgeDefinition.findMany({
      where: { category: 'PERFORMANCE', isActive: true },
    });

    const targetBadges = perfBadges.filter((b) => {
      const cond = b.condition as any;
      return cond?.metric === 'ratioPortesSignatures' && cond?.ranking;
    });

    if (targetBadges.length === 0) return { awarded: 0, skipped: 0 };

    // Plage de dates du mois
    const { start, end } = this.getMonthDateRange(month);

    // 1. Contrats validés par commercial pour ce mois (source: WinLead+)
    const contratsByCommercial = await this.prisma.contratValide.groupBy({
      by: ['commercialId'],
      where: { periodMonth: month, commercialId: { not: null } },
      _count: { id: true },
    });

    // 2. Portes prospectées par commercial pour ce mois (source: Statistic)
    const statsByCommercial = await this.prisma.statistic.groupBy({
      by: ['commercialId'],
      where: {
        commercialId: { not: null },
        createdAt: { gte: start, lte: end },
      },
      _sum: { nbPortesProspectes: true },
    });

    // Map pour lookup rapide
    const portesMap = new Map<number, number>();
    for (const s of statsByCommercial) {
      if (s.commercialId != null) {
        portesMap.set(s.commercialId, s._sum.nbPortesProspectes ?? 0);
      }
    }

    // Calculer le ratio pour chaque commercial
    const rankings: Array<{
      commercialId: number;
      rate: number;
      contrats: number;
      portes: number;
    }> = [];

    for (const entry of contratsByCommercial) {
      if (entry.commercialId == null) continue;
      const contrats = entry._count.id;
      const portes = portesMap.get(entry.commercialId) ?? 0;

      // Minimum 1 porte prospectée requise pour éviter division par zéro
      if (portes === 0) continue;

      const rate = contrats / portes;
      rankings.push({
        commercialId: entry.commercialId,
        rate,
        contrats,
        portes,
      });
    }

    // Trier par ratio décroissant
    rankings.sort((a, b) => b.rate - a.rate);

    let awarded = 0;
    let skipped = 0;

    for (const badge of targetBadges) {
      const condition = badge.condition as any;
      const rankPosition = this.parseRankPosition(condition.ranking);
      if (rankPosition === null || rankPosition > rankings.length) continue;

      const winner = rankings[rankPosition - 1];
      if (!winner) continue;

      const result = await this.badgeService.awardBadge({
        commercialId: winner.commercialId,
        badgeDefinitionId: badge.id,
        periodKey: month,
        metadata: JSON.stringify({
          month,
          rank: rankPosition,
          contrats: winner.contrats,
          portesProspectees: winner.portes,
          transformationRate: Math.round(winner.rate * 10000) / 100,
          auto: true,
        }),
      } as any);

      if (result.awarded) awarded++;
      else skipped++;
    }

    return { awarded, skipped };
  }

  /**
   * Convertit une clé de mois (ex: "2026-02") en plage de dates 1er→dernier jour.
   */
  private getMonthDateRange(month: string): { start: Date; end: Date } {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      const now = new Date();
      return { start: now, end: now };
    }

    const year = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);

    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    return { start, end };
  }

  /**
   * Convertit une clé de semaine ISO (ex: "2026-W09") en plage de dates lundi→dimanche.
   */
  private getWeekDateRange(weekKey: string): { start: Date; end: Date } {
    const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!match) {
      // Fallback: retourne une plage vide
      const now = new Date();
      return { start: now, end: now };
    }

    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);

    // ISO 8601: la semaine 1 contient le 4 janvier
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // 1=lundi, 7=dimanche
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

    const monday = new Date(mondayWeek1);
    monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Mappe les catégories de badges (ex: "Télécom – Mobile") vers les badgeProductKey
   * correspondants dans la table Offre.
   */
  private mapCategorieToProductKeys(categorie: string): string[] {
    const mapping: Record<string, string[]> = {
      'Télécom – Mobile': ['MOBILE'],
      'Télécom – Fibre': ['FIBRE'],
      'Énergie – Dépanssur': ['DEPANSSUR'],
      'Énergie – Électricité/Gaz': ['ELEC_GAZ'],
      'Conciergerie Privée': ['CONCIERGERIE'],
      'Mondial TV': ['MONDIAL_TV'],
      'Assurance – Mutuelle/Prévoyance/MRH': ['ASSURANCE'],
      // Catégories trophées (plus larges)
      Énergie: ['DEPANSSUR', 'ELEC_GAZ'],
      Télécom: ['MOBILE', 'FIBRE'],
      Assurance: ['ASSURANCE'],
    };

    return mapping[categorie] ?? [];
  }

  /** Parse "top1" → 1, "top2" → 2, "top3" → 3 */
  private parseRankPosition(ranking: string): number | null {
    const match = ranking?.match(/^top(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /** Nombre maximum de portes tapées en un jour par ce commercial */
  private async getPortesParJour(commercialId: number): Promise<number> {
    // Utilise StatusHistorique pour compter les portes visitées par jour
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "StatusHistorique"
      WHERE "commercialId" = ${commercialId}
      GROUP BY DATE("createdAt")
      ORDER BY count DESC
      LIMIT 1
    `;

    return result.length > 0 ? Number(result[0].count) : 0;
  }

  /**
   * Compte les contrats signés après repassage pour un commercial.
   * Un repassage = une porte où StatusHistorique montre ABSENT ou RENDEZ_VOUS_PRIS
   * suivi (chronologiquement) d'un CONTRAT_SIGNE par le même commercial.
   */
  private async countRepassageContrats(commercialId: number): Promise<number> {
    // Récupère l'historique complet de ce commercial, groupé par porte
    const historique = await this.prisma.statusHistorique.findMany({
      where: { commercialId },
      orderBy: { createdAt: 'asc' },
      select: { porteId: true, statut: true },
    });

    // Grouper par porte
    const byPorte = new Map<number, string[]>();
    for (const h of historique) {
      if (!byPorte.has(h.porteId)) byPorte.set(h.porteId, []);
      byPorte.get(h.porteId)!.push(h.statut);
    }

    // Pour chaque porte, vérifier le pattern: ABSENT|RENDEZ_VOUS_PRIS → ... → CONTRAT_SIGNE
    let count = 0;
    for (const statuts of byPorte.values()) {
      let sawRepassageTrigger = false;
      for (const s of statuts) {
        if (s === 'ABSENT' || s === 'RENDEZ_VOUS_PRIS') {
          sawRepassageTrigger = true;
        } else if (s === 'CONTRAT_SIGNE' && sawRepassageTrigger) {
          count++;
          break; // une seule signature par porte compte
        }
      }
    }

    return count;
  }

  /**
   * Max occurrences d'un statut donné en un seul jour pour un commercial.
   * Ex: getMaxStatutParJour(userId, 'ARGUMENTE') → max argumentations en 1 jour.
   * Source: StatusHistorique groupé par DATE(createdAt) filtré sur statut.
   */
  private async getMaxStatutParJour(
    commercialId: number,
    statut: string,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "StatusHistorique"
      WHERE "commercialId" = ${commercialId}
        AND "statut"::text = ${statut}
      GROUP BY DATE("createdAt")
      ORDER BY count DESC
      LIMIT 1
    `;

    return result.length > 0 ? Number(result[0].count) : 0;
  }

  /**
   * Max portes prospectées (tout statut) en un seul jour pour un commercial.
   * Compte les portes DISTINCTES visitées par jour (une porte visitée 2x le même jour = 1).
   * Source: StatusHistorique groupé par DATE(createdAt), COUNT(DISTINCT porteId).
   */
  private async getMaxPortesProspectesParJour(
    commercialId: number,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "porteId") as count
      FROM "StatusHistorique"
      WHERE "commercialId" = ${commercialId}
      GROUP BY DATE("createdAt")
      ORDER BY count DESC
      LIMIT 1
    `;

    return result.length > 0 ? Number(result[0].count) : 0;
  }

  /**
   * Statistiques de closing pour un mois donné: nb d'ARGUMENTE et nb de CONTRAT_SIGNE.
   * Source: StatusHistorique filtré par mois et commercialId.
   * Utilisé pour calculer le taux closing = closed / argumentes.
   */
  private async getMonthClosingStats(
    commercialId: number,
    month: string,
  ): Promise<{ argumentes: number; closed: number }> {
    const { start, end } = this.getMonthDateRange(month);

    const argumentes = await this.prisma.statusHistorique.count({
      where: {
        commercialId,
        statut: 'ARGUMENTE',
        createdAt: { gte: start, lte: end },
      },
    });

    const closed = await this.prisma.statusHistorique.count({
      where: {
        commercialId,
        statut: 'CONTRAT_SIGNE',
        createdAt: { gte: start, lte: end },
      },
    });

    return { argumentes, closed };
  }

  /**
   * Compte les portes où le commercial a converti un ABSENT en CONTRAT_SIGNE ce mois-ci.
   * Pattern: pour chaque porte, StatusHistorique montre au moins un ABSENT
   * suivi (chronologiquement) d'un CONTRAT_SIGNE, le tout dans le mois donné.
   */
  private async countRepassageConversionsThisMonth(
    commercialId: number,
    month: string,
  ): Promise<number> {
    const { start, end } = this.getMonthDateRange(month);

    const historique = await this.prisma.statusHistorique.findMany({
      where: {
        commercialId,
        createdAt: { gte: start, lte: end },
        statut: { in: ['ABSENT', 'CONTRAT_SIGNE'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { porteId: true, statut: true },
    });

    // Grouper par porte
    const byPorte = new Map<number, string[]>();
    for (const h of historique) {
      if (!byPorte.has(h.porteId)) byPorte.set(h.porteId, []);
      byPorte.get(h.porteId)!.push(h.statut);
    }

    // Pour chaque porte, vérifier ABSENT → ... → CONTRAT_SIGNE
    let count = 0;
    for (const statuts of byPorte.values()) {
      let sawAbsent = false;
      for (const s of statuts) {
        if (s === 'ABSENT') {
          sawAbsent = true;
        } else if (s === 'CONTRAT_SIGNE' && sawAbsent) {
          count++;
          break;
        }
      }
    }

    return count;
  }

  /**
   * Détermine la periodKey appropriée pour l'attribution d'un badge.
   * Les badges de progression sont « lifetime » (clé = "lifetime"),
   * les badges de produit aussi.
   * Les badges de performance dépendent de leur scope.
   */
  private getPeriodKeyForBadge(badge: any, condition: any, ctx: any): string {
    switch (badge.category) {
      case 'PROGRESSION':
        return 'lifetime';

      case 'PRODUIT':
        return 'lifetime';

      case 'PERFORMANCE':
        if (condition.scope === 'mois') return ctx.currentMonth;
        if (condition.scope === 'semaine') return this.getCurrentWeek(ctx.now);
        if (condition.scope === 'record') return 'lifetime';
        return ctx.currentDay;

      case 'TROPHEE':
        return ctx.currentQuarter;

      default:
        return ctx.currentDay;
    }
  }

  /**
   * Construit un metadata riche à partir de la condition du badge et du contexte d'évaluation.
   * Permet au frontend d'afficher les vraies valeurs (ex: "3 contrats signés" au lieu de "? contrats signés").
   */
  private buildBadgeMetadata(condition: any, ctx: any): Record<string, any> {
    const base: Record<string, any> = {
      evaluatedAt: new Date().toISOString(),
      auto: true,
    };

    switch (condition.metric) {
      case 'contratsSignes':
        base.totalContrats = ctx.totalContrats;
        break;
      case 'contratsProduit': {
        const keys = this.mapCategorieToProductKeys(condition.categorie || '');
        const count = keys.reduce(
          (sum, k) => sum + (ctx.contratsByProduct.get(k) ?? 0),
          0,
        );
        base.contratsCategorie = count;
        base.categorie = condition.categorie;
        break;
      }
      case 'argumentationsParJour':
        base.maxArgumentationsParJour = ctx.maxArgumentationsParJour;
        break;
      case 'portesProspectesParJour':
        base.maxPortesProspectesParJour = ctx.maxPortesProspectesParJour;
        break;
      case 'tauxClosing':
        base.argumentesThisMonth = ctx.argumentesThisMonth;
        base.closedThisMonth = ctx.closedThisMonth;
        base.tauxClosing =
          ctx.argumentesThisMonth > 0
            ? Math.round(
                (ctx.closedThisMonth / ctx.argumentesThisMonth) * 10000,
              ) / 100
            : 0;
        break;
      case 'repassageConversion':
        base.repassageConversionsThisMonth = ctx.repassageConversionsThisMonth;
        break;
      case 'portesParJour':
        base.portesParJour = ctx.portesParJour;
        break;
      case 'signaturesParJour': {
        const maxDay = Math.max(
          0,
          ...Array.from(ctx.contratsByDay.values() as Iterable<number>),
        );
        base.maxSignaturesJour = maxDay;
        break;
      }
      case 'signaturesParSemaine': {
        const maxWeek = Math.max(
          0,
          ...Array.from(ctx.contratsByWeek.values() as Iterable<number>),
        );
        base.maxSignaturesSemaine = maxWeek;
        break;
      }
      case 'progressionHebdo':
      case 'progressionMensuelle':
        base.totalContrats = ctx.totalContrats;
        break;
      case 'badgesDistincts':
        base.distinctBadgeCount = ctx.distinctBadgeCount;
        break;
    }

    return base;
  }

  private getCurrentWeek(date: Date): string {
    const y = date.getFullYear();
    const d = new Date(Date.UTC(y, date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${y}-W${String(weekNo).padStart(2, '0')}`;
  }
}
