import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BadgeCategory } from '@prisma/client';
import {
  CreateBadgeDefinitionInput,
  UpdateBadgeDefinitionInput,
  AwardBadgeInput,
} from './gamification.dto';

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================================
  // CRUD — Lecture et modification du catalogue de badges
  // ============================================================================

  async getBadgeDefinitions(category?: BadgeCategory, activeOnly = true) {
    return this.prisma.badgeDefinition.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ category: 'asc' }, { tier: 'asc' }, { nom: 'asc' }],
    });
  }

  async getBadgeDefinition(id: number) {
    return this.prisma.badgeDefinition.findUnique({ where: { id } });
  }

  async createBadgeDefinition(input: CreateBadgeDefinitionInput) {
    return this.prisma.badgeDefinition.create({
      data: {
        code: input.code,
        nom: input.nom,
        description: input.description ?? null,
        category: input.category,
        iconUrl: input.iconUrl ?? null,
        condition: input.condition ? JSON.parse(input.condition) : null,
        tier: input.tier ?? 0,
      },
    });
  }

  async updateBadgeDefinition(id: number, input: UpdateBadgeDefinitionInput) {
    const data: any = {};
    if (input.nom !== undefined) data.nom = input.nom;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl;
    if (input.condition !== undefined)
      data.condition = JSON.parse(input.condition);
    if (input.tier !== undefined) data.tier = input.tier;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.prisma.badgeDefinition.update({
      where: { id },
      data,
    });
  }

  // ============================================================================
  // SEED — Peupler le catalogue (~95 badges, idempotent via code unique)
  // ============================================================================

  async seedBadges(): Promise<{
    created: number;
    skipped: number;
    total: number;
  }> {
    const badges = this.buildCatalogue();
    let created = 0;
    let skipped = 0;

    for (const badge of badges) {
      const existing = await this.prisma.badgeDefinition.findUnique({
        where: { code: badge.code },
        select: { id: true },
      });

      await this.prisma.badgeDefinition.upsert({
        where: { code: badge.code },
        create: badge,
        update: {
          nom: badge.nom,
          description: badge.description,
          category: badge.category,
          condition: badge.condition,
          tier: badge.tier,
          isActive: true,
        },
      });

      if (existing) skipped++;
      else created++;
    }

    this.logger.log(
      `Seed badges: ${created} créés, ${skipped} déjà existants (${badges.length} total)`,
    );
    return { created, skipped, total: badges.length };
  }

  // ============================================================================
  // CATALOGUE — Définition des 87 badges implémentables
  // ============================================================================

  private buildCatalogue() {
    const badges: Array<{
      code: string;
      nom: string;
      description: string;
      category: BadgeCategory;
      condition: any;
      tier: number;
    }> = [];

    this.addProgressionBadges(badges);
    this.addProduitBadges(badges);
    this.addPerformanceBadges(badges);
    this.addTropheeBadges(badges);

    return badges;
  }

  // ---- PROGRESSION: Paliers tous produits confondus ----

  private addProgressionBadges(badges: any[]) {
    const tiers = [
      { threshold: 1, nom: 'Déclencheur', tier: 1 },
      { threshold: 2, nom: 'Junior Performer', tier: 2 },
      { threshold: 3, nom: 'Montée en puissance', tier: 3 },
      { threshold: 5, nom: 'Déca Performer', tier: 4 },
      { threshold: 10, nom: 'Objectif 10', tier: 5 },
      { threshold: 20, nom: 'Vingtaine', tier: 6 },
      { threshold: 50, nom: 'Cinquantaine', tier: 7 },
      { threshold: 100, nom: 'Centurion', tier: 8 },
    ];

    for (const t of tiers) {
      badges.push({
        code: `PROGRESSION_${t.threshold}_CONTRATS`,
        nom: t.nom,
        description: `${t.threshold} client(s) signé(s) tous produits confondus`,
        category: 'PROGRESSION',
        condition: { metric: 'contratsSignes', threshold: t.threshold },
        tier: t.tier,
      });
    }
  }

  // ---- PRODUIT: Paliers spécifiques par produit ----

  private addProduitBadges(badges: any[]) {
    const produits = [
      { key: 'MOBILE', label: 'Mobile', categorie: 'Télécom – Mobile' },
      { key: 'FIBRE', label: 'Fibre', categorie: 'Télécom – Fibre' },
      {
        key: 'DEPANSSUR',
        label: 'Dépanssur',
        categorie: 'Énergie – Dépanssur',
      },
      {
        key: 'ELEC_GAZ',
        label: 'Électricité/Gaz',
        categorie: 'Énergie – Électricité/Gaz',
      },
      {
        key: 'CONCIERGERIE',
        label: 'Conciergerie',
        categorie: 'Conciergerie Privée',
      },
      { key: 'MONDIAL_TV', label: 'Mondial TV', categorie: 'Mondial TV' },
      {
        key: 'ASSURANCE',
        label: 'Assurance',
        categorie: 'Assurance – Mutuelle/Prévoyance/MRH',
      },
    ];

    const tiers = [
      { threshold: 1, prefix: 'Starter', tier: 1 },
      { threshold: 2, prefix: 'Duo', tier: 2 },
      { threshold: 3, prefix: 'Trio', tier: 3 },
      { threshold: 5, prefix: 'Pack 5', tier: 4 },
      { threshold: 10, prefix: 'Top 10', tier: 5 },
      { threshold: 20, prefix: 'Vingtaine', tier: 6 },
      { threshold: 50, prefix: 'Expert', tier: 7 },
      { threshold: 100, prefix: 'Légende', tier: 8 },
    ];

    for (const produit of produits) {
      for (const t of tiers) {
        badges.push({
          code: `PRODUIT_${produit.key}_${t.threshold}`,
          nom: `${t.prefix} ${produit.label}`,
          description: `${t.threshold} contrat(s) ${produit.label.toLowerCase()} signé(s)`,
          category: 'PRODUIT',
          condition: {
            metric: 'contratsProduit',
            categorie: produit.categorie,
            threshold: t.threshold,
          },
          tier: t.tier,
        });
      }
    }
  }

  // ---- PERFORMANCE: Achievements individuels ----

  private addPerformanceBadges(badges: any[]) {
    const performanceBadges = [
      // --- Volume terrain (source: StatusHistorique par jour) ---
      {
        code: 'PERF_ARGUMENTATEUR',
        nom: 'Argumentateur',
        description: '20 argumentations réalisées en une seule journée',
        condition: {
          metric: 'argumentationsParJour',
          scope: 'record',
          threshold: 20,
        },
      },
      {
        code: 'PERF_PROSPECTEUR_100',
        nom: 'Prospecteur 100',
        description: '100 portes prospectées en une seule journée',
        condition: {
          metric: 'portesProspectesParJour',
          scope: 'record',
          threshold: 100,
        },
      },
      // --- Conversion terrain (source: StatusHistorique) ---
      {
        code: 'PERF_CLOSER',
        nom: 'Closer',
        description:
          'Taux de conversion ARGUMENTE → CONTRAT_SIGNE ≥ 30% sur le mois',
        condition: { metric: 'tauxClosing', scope: 'mois', threshold: 30 },
      },
      {
        code: 'PERF_RELANCEUR',
        nom: 'Relanceur',
        description:
          '3 portes ABSENT converties en CONTRAT_SIGNÉ via repassage sur le mois',
        condition: {
          metric: 'repassageConversion',
          scope: 'mois',
          threshold: 3,
        },
      },
      // --- Volume portes (source: StatusHistorique.createdAt par jour) ---
      {
        code: 'PERF_MARATHON_PORTES',
        nom: 'Marathon des Portes',
        description: '50 portes tapées en une seule journée',
        condition: { metric: 'portesParJour', threshold: 50 },
      },
      // --- Multi-signatures/jour (source: dateValidation groupé par jour) ---
      {
        code: 'PERF_COUP_CHAPEAU',
        nom: 'Coup du Chapeau',
        description: '3 contrats validés dans une même journée',
        condition: { metric: 'signaturesParJour', threshold: 3 },
      },
      {
        code: 'PERF_QUADRUPLE',
        nom: 'Quadruplé',
        description: '4 contrats validés dans une même journée',
        condition: { metric: 'signaturesParJour', threshold: 4 },
      },
      {
        code: 'PERF_QUINTUPLE',
        nom: 'Quintuplé',
        description: '5 contrats validés dans une même journée',
        condition: { metric: 'signaturesParJour', threshold: 5 },
      },
      {
        code: 'PERF_AS_TERRAIN',
        nom: 'As du terrain',
        description: '6 contrats validés ou plus dans une même journée',
        condition: { metric: 'signaturesParJour', threshold: 6 },
      },
      // --- Records hebdo (source: dateValidation groupé par semaine) ---
      {
        code: 'PERF_SERIAL_SIGNATAIRE',
        nom: 'Serial Signataire',
        description: '5 contrats validés sur une même semaine',
        condition: { metric: 'signaturesParSemaine', threshold: 5 },
      },
      // --- Taux de conversion (source: contrats validés / Statistic.argumentes) ---
      {
        code: 'PERF_CONVERSION_KING',
        nom: 'Conversion King',
        description:
          'Meilleur taux de conversion contrats validés / argumentations sur la semaine',
        condition: {
          metric: 'tauxConversion',
          scope: 'semaine',
          ranking: 'top1',
        },
      },
      // --- Ratio portes/signatures (source: contrats validés / Statistic.nbPortesProspectes) ---
      {
        code: 'PERF_CHAMPION_TRANSFORMATION',
        nom: 'Champion de la Transformation',
        description:
          'Meilleur ratio portes tapées / contrats validés sur le mois',
        condition: {
          metric: 'ratioPortesSignatures',
          scope: 'mois',
          ranking: 'top1',
        },
      },
      // --- Progression (source: comparaison contrats validés entre périodes) ---
      {
        code: 'PERF_CONSTANTE_PROGRESSION',
        nom: 'Constante Progression',
        description: 'A progressé en contrats validés chaque semaine du mois',
        condition: {
          metric: 'progressionHebdo',
          scope: 'mois',
          type: 'constante',
        },
      },
      {
        code: 'PERF_PROGRESSION_FULGURANTE',
        nom: 'Progression fulgurante',
        description:
          "Amélioration des contrats validés de plus de 50% d'un mois à l'autre",
        condition: { metric: 'progressionMensuelle', threshold: 50 },
      },
      // --- Ranking mensuel (source: RankSnapshot) ---
      // --- Ranking mensuel (source: RankSnapshot) ---
      {
        code: 'PERF_CONTRAT_OR',
        nom: "Contrat d'Or",
        description: 'Meilleur commercial en contrats validés sur le mois',
        condition: { metric: 'contratsSignes', scope: 'mois', ranking: 'top1' },
      },
      {
        code: 'PERF_VICE_CHAMPION',
        nom: 'Vice-champion',
        description: 'Deuxième meilleur commercial du mois',
        condition: { metric: 'contratsSignes', scope: 'mois', ranking: 'top2' },
      },
      {
        code: 'PERF_TROISIEME_PLACE',
        nom: 'Troisième Place',
        description: 'Troisième meilleur commercial du mois',
        condition: { metric: 'contratsSignes', scope: 'mois', ranking: 'top3' },
      },
      // --- Meta-badge (source: count distinct dans CommercialBadge) ---
      {
        code: 'PERF_GRAND_CHELEM',
        nom: 'Grand Chelem',
        description: 'Obtenir au moins 5 badges individuels différents',
        condition: { metric: 'badgesDistincts', threshold: 5 },
      },
    ];

    for (const b of performanceBadges) {
      badges.push({
        ...b,
        category: 'PERFORMANCE' as BadgeCategory,
        tier: 0,
      });
    }
  }

  // ---- TROPHEE: Trophées numériques trimestriels ----

  private addTropheeBadges(badges: any[]) {
    const tropheeBadges = [
      {
        code: 'TROPHEE_TOP_GLOBAL',
        nom: 'Top Producteur Global',
        description:
          'Meilleure performance globale trimestrielle (contrats validés)',
        condition: {
          metric: 'contratsSignes',
          scope: 'trimestre',
          ranking: 'top1',
        },
      },
      {
        code: 'TROPHEE_TOP_ENERGIE',
        nom: 'Top Producteur Énergie',
        description: 'Meilleur producteur Énergie du trimestre',
        condition: {
          metric: 'contratsProduit',
          categorie: 'Énergie',
          scope: 'trimestre',
          ranking: 'top1',
        },
      },
      {
        code: 'TROPHEE_TOP_TELECOM',
        nom: 'Top Producteur Télécom',
        description: 'Meilleur producteur Télécom du trimestre',
        condition: {
          metric: 'contratsProduit',
          categorie: 'Télécom',
          scope: 'trimestre',
          ranking: 'top1',
        },
      },
      {
        code: 'TROPHEE_TOP_MTV',
        nom: 'Top Producteur MTV',
        description: 'Meilleur producteur Mondial TV du trimestre',
        condition: {
          metric: 'contratsProduit',
          categorie: 'Mondial TV',
          scope: 'trimestre',
          ranking: 'top1',
        },
      },
      {
        code: 'TROPHEE_TOP_ASSURANCE',
        nom: 'Top Producteur Assurance',
        description: 'Meilleur producteur Assurance du trimestre',
        condition: {
          metric: 'contratsProduit',
          categorie: 'Assurance',
          scope: 'trimestre',
          ranking: 'top1',
        },
      },
    ];

    for (const b of tropheeBadges) {
      badges.push({
        ...b,
        category: 'TROPHEE' as BadgeCategory,
        tier: 0,
      });
    }
  }

  // ============================================================================
  // ATTRIBUTION — Attribuer / lister / révoquer des badges commerciaux
  // ============================================================================

  /**
   * Attribue un badge à un commercial pour une période donnée.
   * Idempotent: si le badge existe déjà pour cette période, retourne null.
   */
  async awardBadge(
    input: AwardBadgeInput,
  ): Promise<{ awarded: boolean; id?: number }> {
    const data: any = {
      badgeDefinitionId: input.badgeDefinitionId,
      periodKey: input.periodKey,
      metadata: input.metadata ? JSON.parse(input.metadata) : null,
    };
    if (input.commercialId) data.commercialId = input.commercialId;
    if (input.managerId) data.managerId = input.managerId;

    // Unique constraint: commercialId+badgeDefinitionId+periodKey ou managerId+badgeDefinitionId+periodKey
    const uniqueWhere = input.commercialId
      ? {
          commercialId_badgeDefinitionId_periodKey: {
            commercialId: input.commercialId,
            badgeDefinitionId: input.badgeDefinitionId,
            periodKey: input.periodKey,
          },
        }
      : {
          managerId_badgeDefinitionId_periodKey: {
            managerId: input.managerId!,
            badgeDefinitionId: input.badgeDefinitionId,
            periodKey: input.periodKey,
          },
        };

    const record = await this.prisma.commercialBadge.upsert({
      where: uniqueWhere,
      create: data,
      update: { metadata: data.metadata },
    });

    return { awarded: true, id: record.id };
  }

  /**
   * Attribue plusieurs badges d'un coup.
   * Chaque attribution est idempotente individuellement.
   */
  async batchAwardBadges(
    awards: AwardBadgeInput[],
  ): Promise<{ awarded: number; skipped: number; total: number }> {
    let awarded = 0;
    let skipped = 0;

    for (const input of awards) {
      const result = await this.awardBadge(input);
      if (result.awarded) {
        awarded++;
      } else {
        skipped++;
      }
    }

    this.logger.log(
      `Badge attribution: ${awarded} attribué(s), ${skipped} déjà existant(s) (${awards.length} total)`,
    );
    return { awarded, skipped, total: awards.length };
  }

  /** Liste les badges d'un commercial, avec la définition incluse */
  async getCommercialBadges(commercialId: number) {
    return this.prisma.commercialBadge.findMany({
      where: { commercialId },
      include: { badgeDefinition: true },
      orderBy: { awardedAt: 'desc' },
    });
  }

  /** Liste les badges d'un manager, avec la définition incluse */
  async getManagerBadges(managerId: number) {
    return this.prisma.commercialBadge.findMany({
      where: { managerId },
      include: { badgeDefinition: true },
      orderBy: { awardedAt: 'desc' },
    });
  }

  /** Révoque un badge attribué (par ID d'attribution) */
  async revokeBadge(id: number): Promise<boolean> {
    try {
      await this.prisma.commercialBadge.delete({ where: { id } });
      return true;
    } catch (error: any) {
      this.logger.warn(`Révocation badge #${id} échouée: ${error.message}`);
      return false;
    }
  }
}
