import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GlobalSearchResult, SearchResultGroup } from './search.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, limit: number): Promise<GlobalSearchResult> {
    if (!query || query.trim().length < 2) {
      return { groups: [], totalCount: 0 };
    }

    const q = query.trim();
    const groups: SearchResultGroup[] = [];

    const [commerciaux, managers, directeurs, immeubles, portes, zones] =
      await Promise.all([
        this.searchCommerciaux(q, limit),
        this.searchManagers(q, limit),
        this.searchDirecteurs(q, limit),
        this.searchImmeubles(q, limit),
        this.searchPortes(q, limit),
        this.searchZones(q, limit),
      ]);

    if (commerciaux.length > 0)
      groups.push({ category: 'Commerciaux', items: commerciaux });
    if (managers.length > 0)
      groups.push({ category: 'Managers', items: managers });
    if (directeurs.length > 0)
      groups.push({ category: 'Directeurs', items: directeurs });
    if (immeubles.length > 0)
      groups.push({ category: 'Immeubles', items: immeubles });
    if (portes.length > 0) groups.push({ category: 'Portes', items: portes });
    if (zones.length > 0) groups.push({ category: 'Zones', items: zones });

    const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);
    return { groups, totalCount };
  }

  private async searchCommerciaux(q: string, limit: number) {
    const results = await this.prisma.commercial.findMany({
      where: {
        OR: [
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { numTel: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        manager: { select: { nom: true, prenom: true } },
      },
    });

    return results.map((c) => ({
      type: 'commercial',
      id: c.id,
      label: `${c.prenom} ${c.nom}`,
      sublabel: [
        c.email,
        c.manager ? `Manager: ${c.manager.prenom} ${c.manager.nom}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      url: `/commerciaux/${c.id}`,
    }));
  }

  private async searchManagers(q: string, limit: number) {
    const results = await this.prisma.manager.findMany({
      where: {
        OR: [
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { numTelephone: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        directeur: { select: { nom: true, prenom: true } },
      },
    });

    return results.map((m) => ({
      type: 'manager',
      id: m.id,
      label: `${m.prenom} ${m.nom}`,
      sublabel: [
        m.email,
        m.directeur ? `Dir: ${m.directeur.prenom} ${m.directeur.nom}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      url: `/managers/${m.id}`,
    }));
  }

  private async searchDirecteurs(q: string, limit: number) {
    const results = await this.prisma.directeur.findMany({
      where: {
        OR: [
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { numTelephone: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, nom: true, prenom: true, email: true },
    });

    return results.map((d) => ({
      type: 'directeur',
      id: d.id,
      label: `${d.prenom} ${d.nom}`,
      sublabel: d.email ?? undefined,
      url: `/directeurs/${d.id}`,
    }));
  }

  private async searchImmeubles(q: string, limit: number) {
    const results = await this.prisma.immeuble.findMany({
      where: {
        OR: [
          { adresse: { contains: q, mode: 'insensitive' } },
          { digitalCode: { contains: q, mode: 'insensitive' } },
          {
            commercial: {
              OR: [
                { nom: { contains: q, mode: 'insensitive' } },
                { prenom: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
          { zone: { nom: { contains: q, mode: 'insensitive' } } },
        ],
      },
      take: limit,
      select: {
        id: true,
        adresse: true,
        nbEtages: true,
        commercial: { select: { nom: true, prenom: true } },
        zone: { select: { nom: true } },
      },
    });

    return results.map((i) => ({
      type: 'immeuble',
      id: i.id,
      label: i.adresse,
      sublabel: [
        `${i.nbEtages} étage${i.nbEtages > 1 ? 's' : ''}`,
        i.commercial ? `${i.commercial.prenom} ${i.commercial.nom}` : null,
        i.zone ? i.zone.nom : null,
      ]
        .filter(Boolean)
        .join(' · '),
      url: `/immeubles/${i.id}`,
    }));
  }

  private async searchPortes(q: string, limit: number) {
    const results = await this.prisma.porte.findMany({
      where: {
        OR: [
          { numero: { contains: q, mode: 'insensitive' } },
          { nomPersonnalise: { contains: q, mode: 'insensitive' } },
          { commentaire: { contains: q, mode: 'insensitive' } },
          { immeuble: { adresse: { contains: q, mode: 'insensitive' } } },
        ],
      },
      take: limit,
      select: {
        id: true,
        numero: true,
        nomPersonnalise: true,
        etage: true,
        statut: true,
        immeuble: { select: { id: true, adresse: true } },
      },
    });

    return results.map((p) => ({
      type: 'porte',
      id: p.id,
      label: `Porte ${p.nomPersonnalise || p.numero} — Ét. ${p.etage}`,
      sublabel: [
        p.immeuble?.adresse,
        p.statut?.replace(/_/g, ' ').toLowerCase(),
      ]
        .filter(Boolean)
        .join(' · '),
      url: `/immeubles/${p.immeuble?.id}/portes/${p.id}`,
    }));
  }

  private async searchZones(q: string, limit: number) {
    const results = await this.prisma.zone.findMany({
      where: { nom: { contains: q, mode: 'insensitive' } },
      take: limit,
      select: { id: true, nom: true, _count: { select: { immeubles: true } } },
    });

    return results.map((z) => ({
      type: 'zone',
      id: z.id,
      label: z.nom,
      sublabel: `${z._count.immeubles} immeuble${z._count.immeubles > 1 ? 's' : ''}`,
      url: `/zones`,
    }));
  }
}
