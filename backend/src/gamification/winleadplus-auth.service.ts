import { Injectable } from '@nestjs/common';
import axios from 'axios';

const EXPIRY_MARGIN_MS = 60_000;

interface WinleadPlusLoginResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

/**
 * Shared service-to-service authentication: ProWin signs in to WinLead+ with its
 * dedicated account through WinLead+'s own login route, exactly like the CRM.
 * Credentials and tokens are never logged nor stored outside this process.
 */
@Injectable()
export class WinleadPlusAuthService {
  private cachedToken: string | null = null;
  private cachedUntil = 0;

  async getServiceToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedUntil) return this.cachedToken;

    const username = process.env.WINLEADPLUS_USERNAME?.trim();
    const password = process.env.WINLEADPLUS_PASSWORD;
    const root = process.env.WINLEADPLUS_API_URL?.trim().replace(/\/+$/, '');
    // ProWin's KEYCLOAK_* credentials authenticate CRM users in a different realm.
    // Never silently use them for WinLead+.
    if (!username || !password || !root) {
      throw new Error('Authentification service WinLead+ indisponible : configuration WINLEADPLUS dédiée absente');
    }
    const apiBase = root.endsWith('/api') ? root : `${root}/api`;

    let data: WinleadPlusLoginResponse;
    try {
      ({ data } = await axios.post<WinleadPlusLoginResponse>(
        `${apiBase}/auth/login`,
        { username, password },
        { timeout: 15_000, maxRedirects: 0 },
      ));
    } catch (error: unknown) {
      // Never log Axios errors: they contain the request body (password).
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new Error(`Connexion WinLead+ refusée${status ? ` (HTTP ${status})` : ''}`);
    }

    if (typeof data?.access_token !== 'string' || !data.access_token.trim()) {
      throw new Error('Token service WinLead+ absent');
    }
    const expiresInMs = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in * 1000 : 0;
    this.cachedToken = data.access_token;
    this.cachedUntil = Date.now() + Math.max(expiresInMs - EXPIRY_MARGIN_MS, 0);
    return data.access_token;
  }
}
