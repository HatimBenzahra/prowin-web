import axios from 'axios';
import { WinleadPlusAuthService } from './winleadplus-auth.service';

jest.mock('axios');
describe('shared WinLead+ service authentication', () => {
  const keys = [
    'WINLEADPLUS_API_URL',
    'WINLEADPLUS_USERNAME',
    'WINLEADPLUS_PASSWORD',
    'KEYCLOAK_BASE_URL',
    'KEYCLOAK_REALM',
    'KEYCLOAK_CLIENT_ID',
    'KEYCLOAK_CLIENT_SECRET',
  ] as const;
  let previous: Array<string | undefined>;
  beforeEach(() => {
    previous = keys.map((k) => process.env[k]);
    keys.forEach(
      (k, i) =>
        (process.env[k] = [
          'https://upstream.invalid/',
          'prowin-sync',
          'opaque-password',
          'https://crm.invalid',
          'master',
          'module-rh',
          'crm-secret',
        ][i]),
    );
    jest.clearAllMocks();
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });
  afterEach(() =>
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    }),
  );

  it('signs in through the WinLead+ login route with the dedicated account, not CRM authentication', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'current-token', expires_in: 300 },
    });
    expect(await new WinleadPlusAuthService().getServiceToken()).toBe(
      'current-token',
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://upstream.invalid/api/auth/login',
      { username: 'prowin-sync', password: 'opaque-password' },
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('reuses the token until it is about to expire', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'current-token', expires_in: 300 },
    });
    const auth = new WinleadPlusAuthService();
    await auth.getServiceToken();
    await auth.getServiceToken();
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('signs in again once the token is close to expiry', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'short-token', expires_in: 30 },
    });
    const auth = new WinleadPlusAuthService();
    await auth.getServiceToken();
    await auth.getServiceToken();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('fails clearly without config or token instead of making an unauthenticated read', async () => {
    delete process.env.WINLEADPLUS_PASSWORD;
    await expect(
      new WinleadPlusAuthService().getServiceToken(),
    ).rejects.toThrow('indisponible');
    expect(axios.post).not.toHaveBeenCalled();
    process.env.WINLEADPLUS_PASSWORD = 'opaque-password';
    (axios.post as jest.Mock).mockResolvedValue({ data: {} });
    await expect(
      new WinleadPlusAuthService().getServiceToken(),
    ).rejects.toThrow('absent');
  });

  it('never leaks the password when the login is rejected', async () => {
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
    (axios.post as jest.Mock).mockRejectedValue({
      response: { status: 401 },
      config: { data: 'opaque-password' },
    });
    const error = await new WinleadPlusAuthService()
      .getServiceToken()
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Connexion WinLead+ refusée (HTTP 401)',
    );
    expect((error as Error).message).not.toContain('opaque-password');
  });
});
