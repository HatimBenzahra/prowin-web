import { CoachingPricesService } from '../coaching-prices.service';

describe('current CRM tariff snapshots', () => {
  const token = 'synthetic.user.jwt';
  const offers = [
    { id: 601, fournisseur: 'ORBIT', nom: 'Orbit Compact', prix_base: 37.42, isActive: true },
    { id: 602, fournisseur: 'ORBIT', nom: 'Orbit Plus', prix_base: 64.18, isActive: true },
    { id: 603, fournisseur: 'ORBIT', nom: 'Retired', prix_base: 1, isActive: false },
    { id: 700, fournisseur: 'GARDEN', nom: 'Garden Care', prix_base: 8.73, isActive: true },
  ];
  function service(items: any = offers) {
    const api = { isIntegrationConfigured: jest.fn(() => false), getIntegrationOffres: jest.fn().mockResolvedValue(items), getOffres: jest.fn().mockResolvedValue(items) };
    const prisma = { offre: { findMany: jest.fn().mockResolvedValue([]) } };
    return { api, prisma, adapter: new CoachingPricesService(api as any, prisma as any) };
  }
  it('reads the live existing API once and respects supplier/external ID mappings', async () => {
    const f = service();
    const rows = await f.adapter.snapshots([{ match: { fournisseur: 'ORBIT' } }, { externalIds: [700], match: { fournisseur: 'ORBIT' } }], token);
    expect(f.api.getOffres).toHaveBeenCalledTimes(1);
    expect(f.api.getOffres).toHaveBeenCalledWith(token);
    expect(rows[0].prices).toEqual([{ label: 'Orbit Compact', price: 37.42 }, { label: 'Orbit Plus', price: 64.18 }]);
    expect(rows[1].prices).toEqual([{ label: 'Garden Care', price: 8.73 }]);
    expect(rows[0].priceVerification).toMatchObject({ status: 'verified', source: 'winleadplus_api' });
    expect(JSON.stringify(rows)).not.toContain(token);
  });
  it.each([undefined, token])('prefers integration for auto/manual snapshots (token %p), one complete read for all products', async userToken => {
    const f = service();
    f.api.isIntegrationConfigured.mockReturnValue(true);
    const rows = await f.adapter.snapshots([{ externalIds: [601, 602] }, { match: { fournisseur: 'GARDEN' } }, { match: { fournisseur: 'MISSING' } }], userToken);
    expect(f.api.getIntegrationOffres).toHaveBeenCalledTimes(1);
    expect(f.api.getOffres).not.toHaveBeenCalled();
    expect(f.prisma.offre.findMany).not.toHaveBeenCalled();
    expect(rows.map(r => r.priceVerification.status)).toEqual(['verified', 'verified', 'empty']);
    expect(rows[0].prices).toHaveLength(2);
    f.api.getIntegrationOffres.mockRejectedValue(new Error('secret upstream response'));
    expect((await f.adapter.snapshots([{ externalIds: [601] }], userToken))[0]).toMatchObject({ prices: null, priceVerification: { status: 'unavailable', source: 'winleadplus_api' } });
    expect(f.api.getOffres).not.toHaveBeenCalled();
  });
  it('does not certify parent prices as a nested variant grid', async () => {
    const f = service([{ ...offers[0], formules: [{ nom: 'Variant', prix: 99 }] }]);
    expect((await f.adapter.snapshots([{ externalIds: [601] }], token))[0]).toMatchObject({ prices: null, priceVerification: { status: 'unavailable', comment: expect.stringContaining('variantes') } });
  });
  it('certifies a complete active grid only with explicit absence of variants on every active offer', async () => {
    const f = service(offers.map(o => ({ ...o, formules: [] })));
    const [row] = await f.adapter.snapshots([{ match: { fournisseur: 'ORBIT' } }], token);
    expect(row.priceVerification).toMatchObject({ status: 'verified', completeGrid: true, variantsCertified: true });
    expect(row.prices).toHaveLength(2);
  });
  it.each([null, undefined])('does not certify missing/null variants (%p) as a complete grid', async formules => {
    const f = service([{ ...offers[0], formules: [] }, { ...offers[1], formules }]);
    const [row] = await f.adapter.snapshots([{ externalIds: [601, 602] }], token);
    expect(row.prices).toHaveLength(2);
    expect(row.priceVerification).toMatchObject({ status: 'verified', completeGrid: false, variantsCertified: false });
  });
  it('does not certify a partial live explicit-ID grid', async () => {
    const f = service([offers[0]]);
    expect((await f.adapter.snapshots([{ externalIds: [601, 602] }], token))[0].priceVerification.status).toBe('unavailable');
  });
  it('distinguishes empty current grid from outage; never falls back to old imported offers', async () => {
    const f = service([]);
    expect((await f.adapter.snapshots([{ externalIds: [601] }], token))[0]).toMatchObject({ prices: [], priceVerification: { status: 'empty' } });
    f.api.getOffres.mockRejectedValue(Object.assign(new Error(`401 ${token}`), { response: { status: 401 } }));
    const rows = await f.adapter.snapshots([{ externalIds: [601] }], token);
    expect(rows[0]).toMatchObject({ prices: null, priceVerification: { status: 'unavailable', source: 'winleadplus_api', comment: expect.stringContaining('non vérifiés') } });
    expect(f.prisma.offre.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).not.toContain(token);
  });
  it.each([null, -5, NaN, Infinity, '37.42'])('rejects invalid active amount %p instead of certifying partial grid', async amount => {
    const f = service([{ ...offers[0], prix_base: amount }, offers[1]]);
    expect((await f.adapter.snapshots([{ match: { fournisseur: 'ORBIT' } }], token))[0].prices).toBeNull();
  });
  it('requires explicit active status and a binding; does not fetch without mappings', async () => {
    const f = service([{ ...offers[0], isActive: undefined }]);
    expect((await f.adapter.snapshots([undefined], token))[0].prices).toBeNull();
    expect(f.api.getOffres).not.toHaveBeenCalled();
    expect((await f.adapter.snapshots([{ externalIds: [601] }], token))[0].prices).toBeNull();
  });

  const cacheRow = (offer: typeof offers[number], syncedAt: Date | null) => ({ externalId: offer.id, fournisseur: offer.fournisseur, nom: offer.nom, prixBase: offer.prix_base, isActive: offer.isActive, syncedAt });
  it('uses API-synced cache only without user auth and reports the oldest matching sync date', async () => {
    const f = service();
    const oldest = new Date(Date.now() - 2 * 3600_000);
    f.prisma.offre.findMany.mockResolvedValue([cacheRow(offers[0], oldest), cacheRow(offers[1], new Date())]);
    const [row] = await f.adapter.snapshots([{ match: { fournisseur: 'ORBIT' } }]);
    expect(row.prices).toHaveLength(2);
    expect(row.priceVerification).toMatchObject({ status: 'verified', source: 'winleadplus_cache', checkedAt: oldest.toISOString() });
    expect(row.priceVerification).toMatchObject({ completeGrid: false, variantsCertified: false });
    expect(f.api.getOffres).not.toHaveBeenCalled();
  });
  it.each([null, new Date(Date.now() - 25 * 3600_000), new Date(Date.now() + 3600_000)])('never certifies unsynced/stale/future cached rows (%p)', async syncedAt => {
    const f = service();
    f.prisma.offre.findMany.mockResolvedValue([cacheRow(offers[0], new Date()), cacheRow(offers[1], syncedAt)]);
    expect((await f.adapter.snapshots([{ match: { fournisseur: 'ORBIT' } }]))[0]).toMatchObject({ prices: null, priceVerification: { status: 'unavailable', source: 'winleadplus_cache' } });
  });
  it('does not certify absent cache or infer freshness from env; supports an explicit age override', async () => {
    const f = service();
    expect((await f.adapter.snapshots([{ externalIds: [601] }]))[0]).toMatchObject({ prices: null, priceVerification: { status: 'unavailable', checkedAt: null } });
    f.prisma.offre.findMany.mockResolvedValue([cacheRow(offers[0], new Date(Date.now() - 2000))]);
    const adapter = new CoachingPricesService(f.api as any, f.prisma as any, 1000);
    expect((await adapter.snapshots([{ externalIds: [601] }]))[0].prices).toBeNull();
  });
  it('does not certify a partial explicit-ID cache and preserves sync date for invalid amounts', async () => {
    const f = service();
    const syncedAt = new Date();
    f.prisma.offre.findMany.mockResolvedValue([cacheRow(offers[0], syncedAt)]);
    expect((await f.adapter.snapshots([{ externalIds: [601, 602] }]))[0].prices).toBeNull();
    f.prisma.offre.findMany.mockResolvedValue([{ ...cacheRow(offers[0], syncedAt), prixBase: null }]);
    expect((await f.adapter.snapshots([{ externalIds: [601] }]))[0].priceVerification).toMatchObject({ status: 'unavailable', checkedAt: syncedAt.toISOString() });
  });
});
