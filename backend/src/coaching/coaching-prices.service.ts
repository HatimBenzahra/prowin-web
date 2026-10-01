import { Inject, Injectable, Optional } from '@nestjs/common';
import { WinleadPlusApiService } from '../gamification/winleadplus-api.service';
import { PrismaService } from '../prisma.service';
import { WinLeadPlusBinding } from './referentiels/product-sheet.types';

export interface PriceSnapshot {
  prices: Array<{ label: string; price: number }> | null;
  priceVerification: { status: 'verified' | 'empty' | 'unavailable'; source: 'winleadplus_api' | 'winleadplus_cache'; checkedAt: string | null; comment: string; completeGrid?: boolean; variantsCertified?: boolean };
}

export const COACHING_PRICE_CACHE_MAX_AGE_MS = 'COACHING_PRICE_CACHE_MAX_AGE_MS';
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One live catalog read per snapshot; integration auth takes priority over user auth. */
@Injectable()
export class CoachingPricesService {
  constructor(
    private readonly api: WinleadPlusApiService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(COACHING_PRICE_CACHE_MAX_AGE_MS) private readonly cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  ) {}

  async snapshots(bindings: Array<WinLeadPlusBinding | undefined>, userToken?: string): Promise<PriceSnapshot[]> {
    const now = Date.now();
    const integration = this.api.isIntegrationConfigured();
    const live = integration || Boolean(userToken);
    const source = live ? 'winleadplus_api' : 'winleadplus_cache';
    const checkedAt = live ? new Date(now).toISOString() : null;
    const unknown = (comment: string, checked: string | null = checkedAt): PriceSnapshot => ({ prices: null, priceVerification: { status: 'unavailable', source, checkedAt: checked, comment } });
    if (!bindings.some(b => b?.externalIds?.length || b?.match?.fournisseur)) return bindings.map(() => unknown('Tarifs non vérifiés : liaison offre absente'));
    let items: unknown[];
    try {
      items = integration ? await this.api.getIntegrationOffres() : userToken ? await this.api.getOffres(userToken) : (await this.prisma.offre.findMany({
        select: { externalId: true, fournisseur: true, nom: true, prixBase: true, isActive: true, syncedAt: true },
      })).map(o => ({ id: o.externalId, fournisseur: o.fournisseur, nom: o.nom, prix_base: o.prixBase, isActive: o.isActive, syncedAt: o.syncedAt }));
    }
    catch { return bindings.map(() => unknown('Tarifs non vérifiés : grille courante indisponible')); }
    if (!Array.isArray(items)) return bindings.map(() => unknown('Tarifs non vérifiés : grille invalide'));
    if (items.some(item => {
      if (!item || typeof item !== 'object') return true;
      const offer = item as Record<string, unknown>;
      return !Number.isSafeInteger(offer.id) || (offer.id as number) <= 0 || typeof offer.fournisseur !== 'string' || !offer.fournisseur.trim();
    })) {
      return bindings.map(() => unknown('Tarifs non vérifiés : identification des offres invalide'));
    }
    return bindings.map(binding => {
      if (!binding?.externalIds?.length && !binding?.match?.fournisseur) return unknown('Tarifs non vérifiés : liaison offre absente');
      const matched = items.filter((item): item is Record<string, unknown> => {
        if (!item || typeof item !== 'object') return false;
        const o = item as Record<string, unknown>;
        return binding.externalIds?.length ? binding.externalIds.includes(o.id as number) : o.fournisseur === binding.match?.fournisseur;
      });
      if (live && matched.length && binding.externalIds?.some(id => !matched.some(o => o.id === id))) return unknown('Tarifs non vérifiés : grille des offres liées incomplète');
      let verifiedAt = checkedAt;
      if (!live) {
        const dates = matched.map(o => o.syncedAt instanceof Date ? o.syncedAt.getTime() : NaN);
        const oldest = Math.min(...dates);
        verifiedAt = Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;
        const missingIds = binding.externalIds?.some(id => !matched.some(o => o.id === id));
        if (!matched.length || missingIds || dates.some(date => !Number.isFinite(date) || date > now || now - date > this.cacheMaxAgeMs) || !Number.isFinite(this.cacheMaxAgeMs) || this.cacheMaxAgeMs <= 0) {
          return unknown('Tarifs non vérifiés : cache absent, non synchronisé ou périmé', verifiedAt);
        }
      }
      // Missing activity/amount fields must not silently produce an empty or partially trusted grid.
      if (matched.some(o => typeof o.isActive !== 'boolean')) return unknown('Tarifs non vérifiés : validité des offres inconnue', verifiedAt);
      const active = matched.filter(o => o.isActive === true);
      // A parent amount is not a verified variant grid. Preserve uncertainty until
      // the upstream variant contract can be explicitly identified and validated.
      if (active.some(o => o.formules != null && (!Array.isArray(o.formules) || o.formules.length > 0))) return unknown('Tarifs non vérifiés : grille de variantes non identifiée', verifiedAt);
      if (active.some(o => typeof o.nom !== 'string' || !o.nom.trim() || typeof o.prix_base !== 'number' || !Number.isFinite(o.prix_base) || o.prix_base < 0)) return unknown('Tarifs non vérifiés : montants ou offres invalides', verifiedAt);
      const prices = active.map(o => ({ label: (o.nom as string).trim(), price: o.prix_base as number })).sort((a, b) => a.label.localeCompare(b.label) || a.price - b.price);
      // Null/omitted variants and the cache's base amounts do not certify absence
      // of other legitimate prices. Only an explicit empty variant list does.
      const variantsCertified = live && active.length > 0 && active.every(o => Array.isArray(o.formules) && o.formules.length === 0);
      return { prices, priceVerification: { status: prices.length ? 'verified' : 'empty', source, checkedAt: verifiedAt, completeGrid: variantsCertified, variantsCertified, comment: prices.length ? (variantsCertified ? 'Grille active complète du périmètre produit lié ; absence de variantes certifiée par listes explicites vides' : live ? 'Prix de base des offres courantes vérifiés lors du snapshot ; absence de variantes non certifiée' : 'Grille issue du cache API synchronisé dans la fenêtre de fraîcheur ; variantes non certifiées') : 'Aucune offre active correspondante ; montants non vérifiés' } };
    });
  }
}
