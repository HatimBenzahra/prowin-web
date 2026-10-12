import axios from 'axios';
import { WinleadPlusApiService } from './winleadplus-api.service';

jest.mock('axios');
describe('current WinLead+ offers API', () => {
  let previousApiUrl: string | undefined;
  beforeEach(() => {
    previousApiUrl = process.env.WINLEADPLUS_API_URL;
    delete process.env.WINLEADPLUS_API_URL;
    jest.clearAllMocks();
  });
  afterEach(() => {
    if (previousApiUrl === undefined) delete process.env.WINLEADPLUS_API_URL;
    else process.env.WINLEADPLUS_API_URL = previousApiUrl;
  });
  it.each(['https://catalog.invalid/', 'https://catalog.invalid/api/'])('uses configured upstream %s without duplicating /api', async (root) => {
    process.env.WINLEADPLUS_API_URL = root;
    (axios.get as jest.Mock).mockResolvedValue({ data: [] });
    await new WinleadPlusApiService().getOffres('token');
    expect(axios.get).toHaveBeenCalledWith('https://catalog.invalid/api/offres', expect.objectContaining({ headers: { Authorization: 'Bearer token' } }));
  });
  it('retrieves all pages through the existing API service', async () => {
    const get = axios.get as jest.Mock;
    get.mockResolvedValueOnce({ data: { items: [{ id: 901 }], totalPages: 2 } }).mockResolvedValueOnce({ data: { items: [{ id: 902 }], totalPages: 2 } });
    expect(await new WinleadPlusApiService().getOffres('token')).toEqual([{ id: 901 }, { id: 902 }]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1]).toMatchObject({ params: { page: 2 }, timeout: 15_000 });
  });
  it('rejects an invalid envelope rather than returning a misleading empty grid', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({ data: { unexpected: [] } });
    await expect(new WinleadPlusApiService().getOffres('token')).rejects.toThrow('Impossible de récupérer');
  });
});

describe('WinLead+ integration catalog', () => {
  const env = { ...process.env };
  const offer = { id: 1, nom: 'Mobile', fournisseur: 'Operator', prix_base: 12, isActive: true, canal: 'commercial', formules: null };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WINLEADPLUS_API_URL = 'https://catalog.invalid/api/';
    process.env.WINLEADPLUS_INTEGRATION_API_KEY = 'test-integration-secret';
  });
  afterEach(() => { process.env = { ...env }; });
  it('reads the complete count/items envelope with only x-api-key and no pagination or redirects', async () => {
    (axios.get as jest.Mock).mockResolvedValue({ data: { count: 1, items: [offer] } });
    expect(await new WinleadPlusApiService().getIntegrationOffres()).toEqual([offer]);
    expect(axios.get).toHaveBeenCalledWith('https://catalog.invalid/api/integration/offres', {
      headers: { 'x-api-key': 'test-integration-secret' }, params: { canal: 'commercial', actives: true }, timeout: 15_000, maxRedirects: 0,
    });
  });
  it.each([
    { count: 2, items: [offer] }, { items: [] }, { count: -1, items: [] },
    { count: 2, items: [offer, offer] }, { count: 1, items: [{ ...offer, isActive: undefined }] },
    { count: 1, items: [{ ...offer, prix_base: '12' }] }, { count: 1, items: [{ ...offer, canal: 'other' }] },
  ])('rejects incomplete or malformed catalogs', async data => {
    (axios.get as jest.Mock).mockResolvedValue({ data });
    await expect(new WinleadPlusApiService().getIntegrationOffres()).rejects.toThrow('Impossible de récupérer le catalogue intégration');
  });
  it('requires the configured endpoint and sanitizes failures', async () => {
    delete process.env.WINLEADPLUS_API_URL;
    await expect(new WinleadPlusApiService().getIntegrationOffres()).rejects.toThrow('Impossible de récupérer le catalogue intégration');
    expect(axios.get).not.toHaveBeenCalled();
  });
});
