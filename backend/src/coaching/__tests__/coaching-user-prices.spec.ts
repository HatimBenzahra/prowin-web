import { Logger } from '@nestjs/common';
import axios from 'axios';
import { CoachingResolver } from '../coaching.resolver';
import { CoachingService } from '../coaching.service';
import { CoachingInputService } from '../coaching-input.service';
import { CoachingPricesService } from '../coaching-prices.service';
import { WinleadPlusApiService } from '../../gamification/winleadplus-api.service';
import { RecordingResolver } from '../../recording/recording.resolver';
import { RecordingService } from '../../recording/recording.service';
import { requestBearer } from '../../auth/request-bearer';

jest.mock('axios');

const token = 'synthetic.user.jwt-do-not-persist';
const context = { req: { headers: { authorization: `Bearer ${token}` } } };
const reference = {
  id: 3, version: 4, contentHash: 'reference-hash', planMarkdown: 'local plan', planContentHash: 'plan-hash', planCriteria: { steps: [{ appliesWhen: 'productDetected:orbit' }] },
  products: [{ key: 'orbit', label: 'Orbit', identifiers: ['orbit'], sttTerms: [], offreExternalIds: [], offreFournisseur: 'ORBIT', sheetMarkdown: 'sheet', sheetContentHash: 'sheet-hash', sheetContent: { facts: ['fact'], forbidden: [] } }],
};
const grid = [
  { id: 601, fournisseur: 'ORBIT', nom: 'Orbit Compact', prix_base: 37.42, isActive: true },
  { id: 602, fournisseur: 'ORBIT', nom: 'Orbit Plus', prix_base: 64.18, isActive: true },
];

function fixture(existing = true) {
  let row: any = existing ? { id: 7, source: 'prowin', tenantId: '', status: 'READY', remoteManaged: true, remoteRequestKey: 'old-generation', updatedAt: new Date(), s3KeyOriginal: 'audio', referenceId: 3, remotePlanSnapshot: { reference: { products: [{ prices: [{ price: 1 }] }] } } } : null;
  const writes: unknown[] = [];
  const prisma: any = {
    offre: { findMany: jest.fn(async () => []) },
    recording: { findUnique: jest.fn(async () => ({ id: 40, commercialId: 60, managerId: null })) },
    recordingSegment: { findFirst: jest.fn(async () => null), aggregate: jest.fn(async () => ({ _max: { durationSec: 180 } })) },
    coachingAnalysis: {
      findUnique: jest.fn(async () => row),
      updateMany: jest.fn(async (args) => { writes.push(args); row = { ...row, ...args.data }; return { count: 1 }; }),
      upsert: jest.fn(async (args) => { writes.push(args); row = { id: 7, ...args.create }; return row; }),
    },
  };
  const references: any = { getActive: async () => reference, planOf: (r: any) => r.planCriteria };
  const prices = new CoachingPricesService(new WinleadPlusApiService(), prisma);
  const input = new CoachingInputService(references, prices);
  const freeze = jest.spyOn(input, 'freeze');
  const query: any = { getAnalysis: async () => row };
  const api: any = { isConfigured: () => true, compute: jest.fn() };
  const service = new CoachingService(prisma, references, { getCoachableStatuts: async () => ['ARGUMENTE'], getMinAutoDurationSec: async () => 120 } as any, query, api, input);
  const resolver = new CoachingResolver(service, {} as any, query);
  return { service, resolver, freeze, prisma, writes, row: () => row };
}

describe('request-scoped user tariffs before queue persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.get as jest.Mock).mockResolvedValue({ data: grid });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['launch', 'bulk', 'relaunch'] as const)('%s refreshes old prices with the user bearer and pins the full matched grid', async operation => {
    const f = fixture();
    if (operation === 'launch') await f.resolver.launchCoachingAnalysis('audio', context);
    else if (operation === 'bulk') expect(await f.resolver.launchCoachingAnalyses(['audio', 'audio'], context)).toBe(1);
    else await f.resolver.relaunchCoachingAnalysis(7, context);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/offres'), expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }));
    expect(f.row().remotePlanSnapshot.reference.products[0]).toMatchObject({ key: 'orbit', sheet: { markdown: 'sheet' }, prices: [{ label: 'Orbit Compact', price: 37.42 }, { label: 'Orbit Plus', price: 64.18 }], priceVerification: { status: 'verified', source: 'winleadplus_api' } });
    expect(f.row().remotePlanSnapshot.reference).toMatchObject({ version: 4, contentHash: 'reference-hash', plan: { contentHash: 'plan-hash' } });
    expect(f.row().remoteRequestKey).not.toBe('old-generation');
    expect(f.prisma.coachingAnalysis.updateMany.mock.calls[0][0].where).toMatchObject({ id: 7, remoteRequestKey: 'old-generation' });
    expect(JSON.stringify(f.writes)).not.toContain(token);
    expect(JSON.stringify(f.row())).not.toContain(token);
    await f.resolver.relaunchCoachingAnalysis(7, context);
    expect(axios.get).toHaveBeenCalledTimes(1); // pending dedup skips refresh
  });

  it('pins a newly launched manual job before inserting PENDING', async () => {
    const f = fixture(false);
    await f.resolver.launchCoachingAnalysis('audio', context);
    expect(f.prisma.coachingAnalysis.upsert.mock.calls[0][0].create).toMatchObject({ status: 'PENDING', remotePlanSnapshot: { reference: { products: [{ priceVerification: { status: 'verified' } }] } } });
    expect(f.freeze).toHaveBeenCalledWith(reference, token);
    expect(JSON.stringify(f.writes)).not.toContain(token);
  });

  it('upload resolver → recording confirmation → automatic enqueue uses the bearer before returning', async () => {
    const f = fixture(false);
    // Exercise the real confirmation method with local storage/index operations mocked.
    const recording: any = Object.create(RecordingService.prototype);
    Object.assign(recording, {
      coaching: f.service,
      extractRoomFromKey: () => 'room:commercial:60', ensureRoomAccess: jest.fn(async () => {}),
      s3Diagnostics: { runWithOperation: jest.fn(async () => ({ ContentLength: 100 })) },
      logger: { log: jest.fn() }, upsertRecordingIndex: jest.fn(async () => {}),
      signedUrlOrUndefined: jest.fn(async () => 'https://storage.invalid/audio'),
    });
    const resolver = new RecordingResolver(recording);
    // Invalid timing keeps segmentation outside this authentication test, while
    // preserving the primary door/status used by automatic coaching.
    const upload: any = { s3Key: 'audio', duration: 180, doorSegments: [{ porteId: 50, statut: 'ARGUMENTE', startTime: 0, endTime: 0 }] };
    await resolver.confirmRecordingUpload(upload, { id: 60, role: 'commercial' }, context);
    expect(recording.ensureRoomAccess).toHaveBeenCalledWith('room:commercial:60', 60, 'commercial');
    expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }));
    expect(f.row()).toMatchObject({ status: 'PENDING', manual: false, porteId: 50, remotePlanSnapshot: { reference: { products: [{ priceVerification: { status: 'verified' } }] } } });
    expect(JSON.stringify(f.writes)).not.toContain(token);
    expect(JSON.stringify(recording.logger.log.mock.calls)).not.toContain(token);
  });

  it.each(['manual', 'auto'])('401 on %s auth queues unavailable prices without leaking credentials or certifying cache', async mode => {
    const f = fixture(false);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    (axios.get as jest.Mock).mockRejectedValue({ message: `upstream echoed ${token}`, response: { status: 401 }, config: { headers: { Authorization: `Bearer ${token}` } } });
    if (mode === 'manual') await f.resolver.launchCoachingAnalysis('audio', context);
    else await f.service.enqueue({ s3Key: 'audio', statut: 'ARGUMENTE', durationSec: 180 }, token);
    expect(f.row()).toMatchObject({ status: 'PENDING', remotePlanSnapshot: { reference: { products: [{ prices: null, priceVerification: { status: 'unavailable', source: 'winleadplus_api' } }] } } });
    expect(f.prisma.offre.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(f.writes)).not.toContain(token);
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it('only extracts a single bearer from the authenticated request header', () => {
    expect(requestBearer(context)).toBe(token);
    expect(requestBearer({ req: { headers: { authorization: 'Basic credentials' } } })).toBeUndefined();
    expect(requestBearer({ req: { headers: { authorization: ['Bearer one', 'Bearer two'] } } })).toBeUndefined();
    expect(requestBearer()).toBeUndefined();
  });
});
