import { CoachingStatus, StatutPorte } from '@prisma/client';
import type { PrismaService } from '../../prisma.service';
import type { CoachingApiClient } from '../coaching-api.client';
import type { CoachingConfigService } from '../coaching-config.service';
import type { CoachingInputService } from '../coaching-input.service';
import type { CoachingQueryService } from '../lecture/coaching-query.service';
import type { ReferenceService } from '../referentiels/reference.service';
import {
  CoachingService,
  type EnqueueCoachingInput,
} from '../coaching.service';
import { CRM_SOURCE, CRM_TENANT } from '../shared/crm-scope';

/**
 * Porte d'entrée de l'analyse AUTO (appelée à chaque upload d'audio) : chaque
 * condition qui l'écarte est figée, puis le cas nominal qui crée l'analyse.
 */
describe('CoachingService.enqueue — porte d’entrée de l’analyse auto', () => {
  const S3_KEY = 'recordings/porte-12.m4a';
  const reference = { id: 10, version: 3, products: [] };
  const recording = { id: 55, commercialId: 7, managerId: 3 };

  type Scenario = {
    configured?: boolean;
    coachable?: string[];
    minDuration?: number;
    /** Durée max des segments de cet audio (null = aucun segment). */
    segmentDuration?: number | null;
    activeReference?: typeof reference | null;
    recordingRow?: typeof recording | null;
    existing?: { id: number; status: CoachingStatus } | null;
  };

  const build = (s: Scenario = {}) => {
    const prisma = {
      recordingSegment: {
        aggregate: jest.fn(() =>
          Promise.resolve({
            _max: {
              durationSec:
                s.segmentDuration === undefined ? 300 : s.segmentDuration,
            },
          }),
        ),
      },
      recording: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            s.recordingRow === undefined ? recording : s.recordingRow,
          ),
        ),
      },
      coachingAnalysis: {
        findUnique: jest.fn(() => Promise.resolve(s.existing ?? null)),
        upsert: jest.fn(() =>
          Promise.resolve({ id: 99, remoteRequestKey: 'cle' }),
        ),
      },
    };
    const references = {
      getActive: jest.fn(() =>
        Promise.resolve(
          s.activeReference === undefined ? reference : s.activeReference,
        ),
      ),
    };
    const config = {
      getCoachableStatuts: jest.fn(() =>
        Promise.resolve(s.coachable ?? ['REFUS', 'CONTRAT_SIGNE']),
      ),
      getMinAutoDurationSec: jest.fn(() =>
        Promise.resolve(s.minDuration ?? 120),
      ),
    };
    const api = { isConfigured: jest.fn(() => s.configured ?? true) };
    const input = {
      freeze: jest.fn(() => Promise.resolve({ reference: { version: 3 } })),
    };
    const service = new CoachingService(
      prisma as unknown as PrismaService,
      references as unknown as ReferenceService,
      config as unknown as CoachingConfigService,
      {} as CoachingQueryService,
      api as unknown as CoachingApiClient,
      input as unknown as CoachingInputService,
    );
    const enqueue = (overrides: Partial<EnqueueCoachingInput> = {}) =>
      service.enqueue(
        { s3Key: S3_KEY, porteId: 12, statut: 'REFUS', ...overrides },
        'jeton',
      );
    return { prisma, references, config, api, input, enqueue };
  };

  it('ne fait rien si l’API coaching n’est pas configurée', async () => {
    const { enqueue, config, prisma } = build({ configured: false });
    await enqueue();
    expect(config.getCoachableStatuts).not.toHaveBeenCalled();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['un statut non coachable', 'ABSENT'],
    ['un statut absent', null],
  ])('écarte %s', async (_cas, statut) => {
    const { enqueue, prisma } = build();
    await enqueue({ statut });
    expect(prisma.recordingSegment.aggregate).not.toHaveBeenCalled();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });

  describe('durée minimale', () => {
    it('écarte un audio plus court que la durée configurée', async () => {
      const { enqueue, references } = build({ segmentDuration: 119 });
      await enqueue();
      expect(references.getActive).not.toHaveBeenCalled();
    });

    it('accepte un audio exactement à la durée configurée', async () => {
      const { enqueue, prisma } = build({ segmentDuration: 120 });
      await enqueue();
      expect(prisma.coachingAnalysis.upsert).toHaveBeenCalledTimes(1);
    });

    it('se replie sur la durée passée à l’upload sans segment', async () => {
      const { enqueue, prisma } = build({ segmentDuration: null });
      await enqueue({ durationSec: 200 });
      expect(prisma.coachingAnalysis.upsert).toHaveBeenCalledTimes(1);
    });

    it('écarte un audio sans aucune durée connue', async () => {
      const { enqueue, references } = build({ segmentDuration: null });
      await enqueue({ durationSec: null });
      expect(references.getActive).not.toHaveBeenCalled();
    });

    it('privilégie la durée du segment sur celle de l’upload', async () => {
      const { enqueue, references } = build({ segmentDuration: 30 });
      await enqueue({ durationSec: 600 });
      expect(references.getActive).not.toHaveBeenCalled();
    });
  });

  it('écarte quand aucun référentiel n’est actif', async () => {
    const { enqueue, prisma } = build({ activeReference: null });
    await enqueue();
    expect(prisma.recording.findUnique).not.toHaveBeenCalled();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('écarte quand l’enregistrement est introuvable', async () => {
    const { enqueue, prisma } = build({ recordingRow: null });
    await enqueue();
    expect(prisma.coachingAnalysis.findUnique).not.toHaveBeenCalled();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('n’en crée pas une seconde si l’analyse existe déjà pour ce référentiel', async () => {
    const { enqueue, prisma, input } = build({
      existing: { id: 4, status: CoachingStatus.READY },
    });
    await enqueue();
    expect(prisma.coachingAnalysis.findUnique).toHaveBeenCalledWith({
      where: {
        source_tenantId_s3KeyOriginal_referenceId: {
          source: CRM_SOURCE,
          tenantId: CRM_TENANT,
          s3KeyOriginal: S3_KEY,
          referenceId: reference.id,
        },
      },
      select: { id: true, status: true },
    });
    expect(input.freeze).not.toHaveBeenCalled();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });

  it('cas nominal : fige le référentiel et crée l’analyse en attente', async () => {
    const { enqueue, prisma, input } = build();
    await enqueue();

    expect(input.freeze).toHaveBeenCalledWith(reference, 'jeton');
    expect(prisma.coachingAnalysis.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.coachingAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          s3KeyOriginal: S3_KEY,
          recordingId: recording.id,
          porteId: 12,
          userId: recording.commercialId,
          managerId: recording.managerId,
          statutPorte: StatutPorte.REFUS,
          manual: false,
          referenceId: reference.id,
          source: CRM_SOURCE,
          tenantId: CRM_TENANT,
          remoteManaged: true,
          status: CoachingStatus.PENDING,
          remotePlanSnapshot: { reference: { version: 3 } },
        }) as unknown,
        update: {},
      }),
    );
  });

  it('n’échoue jamais : une erreur interne est journalisée, pas propagée', async () => {
    const { enqueue, prisma } = build();
    prisma.recording.findUnique.mockRejectedValueOnce(new Error('base KO'));
    await expect(enqueue()).resolves.toBeUndefined();
    expect(prisma.coachingAnalysis.upsert).not.toHaveBeenCalled();
  });
});
