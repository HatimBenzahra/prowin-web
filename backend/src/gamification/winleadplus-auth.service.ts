import { Injectable } from '@nestjs/common';
import axios from 'axios';

/** Shared service-to-service authentication; credentials never enter snapshots. */
@Injectable()
export class WinleadPlusAuthService {
  async getServiceToken(): Promise<string> {
    const { WINLEADPLUS_TOKEN_URL, WINLEADPLUS_CLIENT_ID, WINLEADPLUS_CLIENT_SECRET } = process.env;
    // ProWin's KEYCLOAK_* credentials authenticate CRM users in a different realm.
    // Never silently use them for the upstream catalog.
    if (!WINLEADPLUS_TOKEN_URL || !WINLEADPLUS_CLIENT_ID || !WINLEADPLUS_CLIENT_SECRET) {
      throw new Error('Authentification service WinLead+ indisponible : configuration WINLEADPLUS dédiée absente');
    }
    const params = new URLSearchParams({ client_id: WINLEADPLUS_CLIENT_ID, client_secret: WINLEADPLUS_CLIENT_SECRET, grant_type: 'client_credentials' });
    const response = await axios.post(WINLEADPLUS_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000,
    });
    if (typeof response.data?.access_token !== 'string' || !response.data.access_token.trim()) throw new Error('Token service WinLead+ absent');
    return response.data.access_token;
  }
}
