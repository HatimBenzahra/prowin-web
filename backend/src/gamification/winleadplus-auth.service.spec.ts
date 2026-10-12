import axios from 'axios';
import { WinleadPlusAuthService } from './winleadplus-auth.service';

jest.mock('axios');
describe('shared WinLead+ service authentication', () => {
  const keys = ['WINLEADPLUS_TOKEN_URL', 'WINLEADPLUS_CLIENT_ID', 'WINLEADPLUS_CLIENT_SECRET', 'KEYCLOAK_BASE_URL', 'KEYCLOAK_REALM', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_CLIENT_SECRET'] as const;
  let previous: Array<string | undefined>;
  beforeEach(() => {
    previous = keys.map(k => process.env[k]);
    keys.forEach((k, i) => process.env[k] = ['https://upstream.invalid/realms/catalog/protocol/openid-connect/token', 'catalog-reader', 'opaque-secret', 'https://crm.invalid', 'master', 'module-rh', 'crm-secret'][i]);
    jest.clearAllMocks();
  });
  afterEach(() => keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; }));
  it('uses dedicated client_credentials configuration instead of CRM authentication', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'current-token' } });
    expect(await new WinleadPlusAuthService().getServiceToken()).toBe('current-token');
    expect(axios.post).toHaveBeenCalledWith('https://upstream.invalid/realms/catalog/protocol/openid-connect/token', expect.stringContaining('client_id=catalog-reader&client_secret=opaque-secret&grant_type=client_credentials'), expect.objectContaining({ timeout: 15_000 }));
  });
  it('fails clearly without config or token instead of making an unauthenticated catalog read', async () => {
    delete process.env.WINLEADPLUS_CLIENT_SECRET;
    await expect(new WinleadPlusAuthService().getServiceToken()).rejects.toThrow('indisponible');
    expect(axios.post).not.toHaveBeenCalled();
    process.env.WINLEADPLUS_CLIENT_SECRET = 'opaque-secret';
    (axios.post as jest.Mock).mockResolvedValue({ data: {} });
    await expect(new WinleadPlusAuthService().getServiceToken()).rejects.toThrow('absent');
  });
});
