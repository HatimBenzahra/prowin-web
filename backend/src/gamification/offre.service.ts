import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateOffrePointsInput, UpdateOffreBadgeProductKeyInput } from './gamification.dto';
import { WinleadPlusApiService } from './winleadplus-api.service';

@Injectable()
export class OffreService {
  private readonly logger = new Logger(OffreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly winleadPlusApi: WinleadPlusApiService,
  ) {}

  // ============================================================================
  // SYNCHRO — Upsert offres depuis WinLead+
  // ============================================================================

  async syncOffres(
    token?: string,
  ): Promise<{ created: number; updated: number; total: number }> {
    const items = this.winleadPlusApi.isIntegrationConfigured()
      ? await this.winleadPlusApi.getIntegrationOffres()
      : await this.winleadPlusApi.getOffres(token ?? '');

    let created = 0;
    let updated = 0;

    for (const item of items) {
      if (!item.id || !item.nom || !item.categorie || !item.fournisseur) {
        this.logger.warn('Offre ignorée : champs catalogue manquants');
        continue;
      }

      const existing = await this.prisma.offre.findUnique({
        where: { externalId: item.id },
        select: { id: true, points: true, badgeProductKey: true },
      });

      const prixBase = item.prix_base ?? null;
      const defaultPoints = Math.max(0, Math.round(prixBase ?? 0));
      const inferredBadgeProductKey = this.inferBadgeProductKey(item);

      const syncData = {
        nom: (item.nom || '').trim(),
        description: item.description ?? null,
        categorie: (item.categorie || '').trim(),
        fournisseur: (item.fournisseur || '').trim(),
        logoUrl: item.logo_url ?? null,
        prixBase,
        features: item.features ?? null,
        popular: item.popular ?? false,
        rating: item.rating ?? null,
        isActive: item.isActive ?? true,
        syncedAt: new Date(),
      };

      const updateData = {
        ...syncData,
        ...(existing && existing.points === 0 ? { points: defaultPoints } : {}),
        ...(existing && !existing.badgeProductKey && inferredBadgeProductKey
          ? { badgeProductKey: inferredBadgeProductKey }
          : {}),
      };

      await this.prisma.offre.upsert({
        where: { externalId: item.id },
        create: {
          externalId: item.id,
          ...syncData,
          points: defaultPoints,
          badgeProductKey: inferredBadgeProductKey,
        },
        update: updateData,
      });

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    this.logger.log(
      `Synchro offres terminée: ${created} créées, ${updated} mises à jour (${items.length} total API)`,
    );

    return { created, updated, total: items.length };
  }

  // ============================================================================
  // CRUD — Lecture et modification des points
  // ============================================================================

  async getOffres(activeOnly: boolean) {
    return this.prisma.offre.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ categorie: 'asc' }, { nom: 'asc' }],
    });
  }

  async updateOffrePoints(offreId: number, points: number) {
    return this.prisma.offre.update({
      where: { id: offreId },
      data: { points },
    });
  }

  async batchUpdateOffrePoints(offres: UpdateOffrePointsInput[]) {
    let updated = 0;
    for (const entry of offres) {
      try {
        await this.prisma.offre.update({
          where: { id: entry.offreId },
          data: { points: entry.points },
        });
        updated++;
      } catch (error: any) {
        this.logger.warn(
          `Points update échoué pour offre #${entry.offreId}: ${error.message}`,
        );
      }
    }
    return { updated, total: offres.length };
  }

  // ============================================================================
  // BADGE PRODUCT KEY — Mapping offre → catégorie de badge
  // ============================================================================

  async updateOffreBadgeProductKey(offreId: number, badgeProductKey: string | null) {
    return this.prisma.offre.update({
      where: { id: offreId },
      data: { badgeProductKey },
    });
  }

  async batchUpdateOffreBadgeProductKey(offres: UpdateOffreBadgeProductKeyInput[]) {
    let updated = 0;
    for (const entry of offres) {
      try {
        await this.prisma.offre.update({
          where: { id: entry.offreId },
          data: { badgeProductKey: entry.badgeProductKey ?? null },
        });
        updated++;
      } catch (error: any) {
        this.logger.warn(
          `BadgeProductKey update échoué pour offre #${entry.offreId}: ${error.message}`,
        );
      }
    }
    return { updated, total: offres.length };
  }

  private inferBadgeProductKey(item: any): string | null {
    const source = `${item.nom ?? ''} ${item.categorie ?? ''} ${item.description ?? ''} ${item.fournisseur ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (source.includes('fibre') || source.includes('fiber')) return 'FIBRE';
    if (
      source.includes('mobile') ||
      source.includes('telephonie') ||
      source.includes('forfait') ||
      source.includes('sim')
    ) {
      return 'MOBILE';
    }
    if (
      source.includes('depanssur') ||
      source.includes('depannage') ||
      source.includes('assistance')
    ) {
      return 'DEPANSSUR';
    }
    if (
      source.includes('energie') ||
      source.includes('electricite') ||
      source.includes('elec') ||
      source.includes('gaz')
    ) {
      return 'ELEC_GAZ';
    }
    if (source.includes('conciergerie')) return 'CONCIERGERIE';
    if (
      source.includes('mondial tv') ||
      source.includes('divertissement') ||
      source.includes('television') ||
      source.includes('tv')
    ) {
      return 'MONDIAL_TV';
    }
    if (
      source.includes('assurance') ||
      source.includes('sante') ||
      source.includes('mutuelle')
    ) {
      return 'ASSURANCE';
    }

    return null;
  }
}
