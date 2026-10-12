import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { WinleadPlusUser } from './gamification.dto';

const DEFAULT_PAGE_SIZE = 50;

export interface IntegrationOffre {
  id: number;
  nom: string;
  fournisseur: string;
  prix_base: number | null;
  isActive: boolean;
  canal: string;
  categorie?: string;
  description?: string | null;
  logo_url?: string | null;
  features?: any;
  popular?: boolean;
  rating?: number | null;
  formules?: unknown;
}

export interface IntegrationOffresResponse {
  count: number;
  items: IntegrationOffre[];
}

@Injectable()
export class WinleadPlusApiService {
  private readonly logger = new Logger(WinleadPlusApiService.name);

  // ============================================================================
  // USERS — Récupérer les users WinLead+ (COMMERCIAL + MANAGER uniquement)
  // ============================================================================

  async getUsers(token: string): Promise<WinleadPlusUser[]> {
    try {
      const items = await this.fetchPaginatedResource(token, '/users', 1000);

      return items
        .filter(
          (u) =>
            ['COMMERCIAL', 'MANAGER'].includes(u.role) && u.isActive === true,
        )
        .map((u) => ({
          id: u.id,
          nom: (u.nom || '').trim(),
          prenom: (u.prenom || '').trim(),
          username: u.username,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          managerId: u.managerId,
        }));
    } catch (error: any) {
      this.logger.error(`Erreur appel WinLead+ /api/users: ${error.message}`);
      this.handleApiError(error, 'utilisateurs');
    }
  }

  // ============================================================================
  // OFFRES — Récupérer les offres WinLead+
  // ============================================================================

  async getOffres(token: string): Promise<any[]> {
    try {
      return await this.fetchPaginatedResource(token, '/offres', DEFAULT_PAGE_SIZE);
    } catch (error: any) {
      this.logger.error('Erreur synchro offres WinLead+');
      this.handleApiError(error, 'offres');
    }
  }

  isIntegrationConfigured(): boolean {
    return Boolean(process.env.WINLEADPLUS_INTEGRATION_API_KEY?.trim());
  }

  /** Complete commercial catalog; integration auth is independent of human sessions. */
  async getIntegrationOffres(): Promise<IntegrationOffre[]> {
    try {
      const key = process.env.WINLEADPLUS_INTEGRATION_API_KEY?.trim();
      const root = process.env.WINLEADPLUS_API_URL?.trim().replace(/\/+$/, '');
      if (!key || !root) throw new Error('Integration configuration missing');
      const apiBase = root.endsWith('/api') ? root : `${root}/api`;
      const { data } = await axios.get<IntegrationOffresResponse>(`${apiBase}/integration/offres`, {
        headers: { 'x-api-key': key },
        params: { canal: 'commercial', actives: true },
        timeout: 15_000,
        maxRedirects: 0,
      });
      if (!data || !Number.isSafeInteger(data.count) || data.count < 0 || !Array.isArray(data.items) || data.count !== data.items.length) {
        throw new Error('Invalid integration catalog envelope');
      }
      const ids = new Set<number>();
      for (const item of data.items) {
        if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id) ||
          typeof item.nom !== 'string' || !item.nom.trim() ||
          typeof item.fournisseur !== 'string' || !item.fournisseur.trim() ||
          item.isActive !== true || item.canal !== 'commercial' ||
          !(item.prix_base === null || (typeof item.prix_base === 'number' && Number.isFinite(item.prix_base) && item.prix_base >= 0))) {
          throw new Error('Invalid integration offer');
        }
        ids.add(item.id);
      }
      return data.items;
    } catch {
      // Never log Axios errors: they contain headers, URLs and upstream payloads.
      throw new BadRequestException('Impossible de récupérer le catalogue intégration WinLead+');
    }
  }

  // ============================================================================
  // PROSPECTS — Récupérer les prospects WinLead+ (avec souscriptions et contrats)
  // ============================================================================

  async getProspects(token: string): Promise<any[]> {
    try {
      return this.fetchPaginatedResource(token, '/prospects', DEFAULT_PAGE_SIZE);
    } catch (error: any) {
      this.logger.error(`Erreur synchro prospects WinLead+: ${error.message}`);
      this.handleApiError(error, 'prospects');
    }
  }

  private async fetchPaginatedResource(
    token: string,
    resourcePath: string,
    limit: number,
  ): Promise<any[]> {
    const headers = { Authorization: `Bearer ${token}` };
    const collectedItems: any[] = [];

    let currentPage = 1;
    let totalPages = 1;

    do {
      const root = (process.env.WINLEADPLUS_API_URL || 'https://www.winleadplus.com').replace(/\/+$/, '');
      const apiBase = root.endsWith('/api') ? root : `${root}/api`;
      const response = await axios.get(`${apiBase}${resourcePath}`, {
        headers,
        timeout: 15_000,
        params: {
          page: currentPage,
          limit,
        },
      });

      const pageItems = this.extractCollectionItems(response.data);
      collectedItems.push(...pageItems);

      const responseTotalPages = Number(response.data?.totalPages);
      totalPages = Number.isFinite(responseTotalPages) && responseTotalPages > 0
        ? responseTotalPages
        : 1;

      currentPage += 1;
    } while (currentPage <= totalPages);

    this.logger.log(
      `WinLead+ ${resourcePath}: ${collectedItems.length} élément(s) récupéré(s) sur ${totalPages} page(s)`,
    );

    return collectedItems;
  }

  private extractCollectionItems(data: any): any[] {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    if (Array.isArray(data?.items)) {
      return data.items;
    }

    throw new Error('Collection WinLead+ invalide');
  }

  // ============================================================================
  // HELPER — Gestion centralisée des erreurs API
  // ============================================================================

  private handleApiError(error: any, resource: string): never {
    if (error.response?.status === 401) {
      throw new BadRequestException(
        'Token invalide ou expiré pour WinLead+',
      );
    }
    throw new BadRequestException(
      `Impossible de récupérer les ${resource} WinLead+`,
    );
  }
}
