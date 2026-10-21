import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import type { CoachingService } from '../coaching/coaching.service';
import type { ImmeubleAccessService } from '../immeuble/immeuble-access.service';
import type { PrismaService } from '../prisma.service';
import { S3DiagnosticsService } from '../s3-diagnostics/s3-diagnostics.service';
import type { SpeechAnalysisService } from '../speech-analysis/speech-analysis.service';
import type {
  ConfirmRecordingUploadInput,
  DoorSegmentInput,
} from './recording.dto';
import { RecordingResolver } from './recording.resolver';
import { RecordingService } from './recording.service';

/** Client S3 factice : `send` est la seule méthode appelée par le service. */
const mockSend = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@aws-sdk/client-s3', () => ({
  ...jest.requireActual<typeof import('@aws-sdk/client-s3')>(
    '@aws-sdk/client-s3',
  ),
  S3Client: jest.fn(() => ({
    send: mockSend,
    middlewareStack: { add: jest.fn() },
  })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(() => Promise.resolve('https://signed.example/audio')),
}));

/**
 * Fin d'un enregistrement audio : `confirmRecordingUpload` vérifie l'accès à la
 * room, indexe l'audio et ses segments par porte, puis déclenche le coaching IA.
 * S3 (HeadObject, URL signée) et Prisma sont mockés.
 */
describe('RecordingService.confirmRecordingUpload', () => {
  const COMMERCIAL_ID = 7;
  const MANAGER_ID = 3;
  const DIRECTEUR_ID = 1;
  const KEY =
    'recordings/room_commercial_7/immeuble_40_2026-10-17T10-00-00.mp4';
  const lastModified = new Date('2026-10-17T10:05:00Z');

  const door = (
    porteId: number,
    startTime: number,
    endTime: number,
    statut?: string,
  ): DoorSegmentInput => ({
    porteId,
    numero: String(porteId),
    etage: 1,
    startTime,
    endTime,
    statut,
  });

  const send = mockSend;
  beforeEach(() => {
    // Seule commande S3 attendue ici : HeadObject sur l'audio confirmé.
    send
      .mockReset()
      .mockResolvedValue({ ContentLength: 2048, LastModified: lastModified });
  });

  type CommercialRow = {
    id: number;
    managerId: number | null;
    directeurId: number | null;
  };

  const build = () => {
    const prisma = {
      commercial: {
        findUnique: jest.fn(
          (): Promise<CommercialRow | null> =>
            Promise.resolve({
              id: COMMERCIAL_ID,
              managerId: MANAGER_ID,
              directeurId: DIRECTEUR_ID,
            }),
        ),
      },
      manager: {
        findUnique: jest.fn(() =>
          Promise.resolve({ id: MANAGER_ID, directeurId: DIRECTEUR_ID }),
        ),
      },
      porte: {
        findUnique: jest.fn(() => Promise.resolve({ immeubleId: 99 })),
      },
      recording: { upsert: jest.fn(() => Promise.resolve({})) },
      recordingSegment: {
        createMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
    };
    const coaching = {
      enqueue: jest.fn<Promise<void>, Parameters<CoachingService['enqueue']>>(
        () => Promise.resolve(),
      ),
    };
    const service = new RecordingService(
      prisma as unknown as PrismaService,
      {} as SpeechAnalysisService,
      new S3DiagnosticsService(),
      coaching as unknown as CoachingService,
      {} as ImmeubleAccessService,
    );
    const confirm = (
      input: Partial<ConfirmRecordingUploadInput> = {},
      user = { id: COMMERCIAL_ID, role: 'commercial' },
    ) =>
      service.confirmRecordingUpload(
        { s3Key: KEY, duration: 240, ...input },
        user,
        'jeton',
      );
    return { prisma, coaching, confirm };
  };

  describe('cas nominal', () => {
    it('indexe l’audio, ses segments valides, et déclenche le coaching', async () => {
      const { confirm, prisma, coaching } = build();
      const result = await confirm({
        doorSegments: [
          door(12, 0, 150, 'REFUS'),
          door(13, 150, 150), // durée nulle : ignoré
          door(14, 200, 180), // fin avant début : ignoré
          door(15, 160, 400, 'CONTRAT_SIGNE'),
        ],
      });

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);

      expect(prisma.recording.upsert).toHaveBeenCalledWith({
        where: { s3Key: KEY },
        create: expect.objectContaining({
          s3Key: KEY,
          roomName: 'room:commercial:7',
          userType: 'COMMERCIAL',
          commercialId: COMMERCIAL_ID,
          managerId: null,
          immeubleId: 40,
          size: BigInt(2048),
          lastModified,
        }) as unknown,
        update: expect.objectContaining({ immeubleId: 40 }) as unknown,
      });

      expect(prisma.recordingSegment.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            porteId: 12,
            commercialId: COMMERCIAL_ID,
            managerId: null,
            immeubleId: 40,
            statut: 'REFUS',
            s3KeyOriginal: KEY,
            durationSec: 150,
          }),
          expect.objectContaining({
            porteId: 15,
            statut: 'CONTRAT_SIGNE',
            durationSec: 240,
          }),
        ],
      });

      expect(coaching.enqueue).toHaveBeenCalledTimes(1);
      expect(coaching.enqueue).toHaveBeenCalledWith(
        { s3Key: KEY, porteId: 12, statut: 'REFUS', durationSec: 240 },
        'jeton',
      );
      expect(result).toEqual({
        key: KEY,
        size: 2048,
        lastModified,
        url: 'https://signed.example/audio',
      });
    });

    it('déduit l’immeuble de la première porte quand la clé ne le porte pas', async () => {
      const { confirm, prisma } = build();
      const key = 'recordings/room_commercial_7/2026-10-17T10-00-00.mp4';
      await confirm({ s3Key: key, doorSegments: [door(12, 0, 150, 'REFUS')] });

      expect(prisma.porte.findUnique).toHaveBeenCalledWith({
        where: { id: 12 },
        select: { immeubleId: true },
      });
      expect(prisma.recordingSegment.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ immeubleId: 99 })],
      });
    });

    it('déclenche le coaching même sans segment de porte', async () => {
      const { confirm, prisma, coaching } = build();
      await confirm({ doorSegments: undefined, duration: undefined });

      expect(prisma.recordingSegment.createMany).not.toHaveBeenCalled();
      expect(coaching.enqueue).toHaveBeenCalledWith(
        { s3Key: KEY, porteId: null, statut: null, durationSec: null },
        'jeton',
      );
    });
  });

  describe('contrôles d’accès', () => {
    /** Rien ne doit être lu sur S3, indexé ni coaché après un refus. */
    const expectNothingDone = (
      prisma: ReturnType<typeof build>['prisma'],
      coaching: ReturnType<typeof build>['coaching'],
    ) => {
      expect(send).not.toHaveBeenCalled();
      expect(prisma.recording.upsert).not.toHaveBeenCalled();
      expect(prisma.recordingSegment.createMany).not.toHaveBeenCalled();
      expect(coaching.enqueue).not.toHaveBeenCalled();
    };

    it.each([
      ['le manager du commercial', { id: MANAGER_ID, role: 'manager' }],
      ['le directeur du commercial', { id: DIRECTEUR_ID, role: 'directeur' }],
      ['un admin', { id: 500, role: 'admin' }],
    ])('autorise %s', async (_cas, user) => {
      const { confirm, coaching } = build();
      await confirm({}, user);
      expect(coaching.enqueue).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['un autre commercial', { id: 8, role: 'commercial' }],
      ['un autre manager', { id: 4, role: 'manager' }],
      ['un autre directeur', { id: 2, role: 'directeur' }],
    ])('refuse %s', async (_cas, user) => {
      const { confirm, prisma, coaching } = build();
      await expect(confirm({}, user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expectNothingDone(prisma, coaching);
    });

    it('refuse une clé hors du préfixe des enregistrements (hors admin)', async () => {
      const { confirm, prisma, coaching } = build();
      await expect(confirm({ s3Key: 'autre/fichier.mp4' })).rejects.toThrow(
        'Unknown recording key',
      );
      expectNothingDone(prisma, coaching);
    });

    it('refuse une room au format inconnu (hors admin)', async () => {
      const { confirm, prisma, coaching } = build();
      await expect(
        confirm({ s3Key: 'recordings/room_inconnu/a.mp4' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNothingDone(prisma, coaching);
    });

    it('signale un commercial inexistant', async () => {
      const { confirm, prisma, coaching } = build();
      prisma.commercial.findUnique.mockResolvedValueOnce(null);
      await expect(confirm()).rejects.toBeInstanceOf(NotFoundException);
      expectNothingDone(prisma, coaching);
    });

    it('room manager : autorise le manager lui-même, refuse un autre', async () => {
      const key = 'recordings/room_manager_3/a.mp4';
      const ok = build();
      await ok.confirm({ s3Key: key }, { id: MANAGER_ID, role: 'manager' });
      expect(ok.prisma.recording.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userType: 'MANAGER',
            managerId: MANAGER_ID,
            commercialId: null,
          }) as unknown,
        }),
      );

      const ko = build();
      await expect(
        ko.confirm({ s3Key: key }, { id: 4, role: 'manager' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('RecordingResolver.confirmRecordingUpload', () => {
  it('transmet le jeton Bearer de la requête au service (pour le coaching)', async () => {
    const svc = {
      confirmRecordingUpload: jest.fn(() => Promise.resolve({ key: 'k' })),
    };
    const resolver = new RecordingResolver(svc as unknown as RecordingService);
    const input = { s3Key: 'k' };
    const user = { id: 7, role: 'commercial' };

    await resolver.confirmRecordingUpload(input, user, {
      req: { headers: { authorization: 'Bearer abc.def' } },
    });

    expect(svc.confirmRecordingUpload).toHaveBeenCalledWith(
      input,
      user,
      'abc.def',
    );
  });
});

/**
 * Listes de segments par commercial / manager : sur un immeuble partagé, chacun
 * ne voit que ses segments ; le repli sur le créateur de l'immeuble ne vaut que
 * pour les vieux segments sans auteur (Prisma mocké).
 */
describe('RecordingService.getSegmentsByCommercial / getSegmentsByManager', () => {
  const COMMERCIAL_ID = 7;
  const MANAGER_ID = 3;
  const admin = { id: 0, role: 'admin' };
  const sansAuteur = { commercialId: null, managerId: null };

  const build = () => {
    const prisma = {
      commercial: {
        findUnique: jest.fn(() =>
          Promise.resolve({ id: COMMERCIAL_ID, directeurId: 1 }),
        ),
        findMany: jest.fn(() => Promise.resolve([{ id: COMMERCIAL_ID }])),
      },
      manager: {
        findUnique: jest.fn(() =>
          Promise.resolve({ id: MANAGER_ID, directeurId: 1 }),
        ),
      },
      recordingSegment: {
        findMany: jest.fn<Promise<unknown[]>, [{ where: unknown }]>(() =>
          Promise.resolve([]),
        ),
      },
    };
    const service = new RecordingService(
      prisma as unknown as PrismaService,
      {} as SpeechAnalysisService,
      new S3DiagnosticsService(),
      {} as CoachingService,
      {} as ImmeubleAccessService,
    );
    const where = () => prisma.recordingSegment.findMany.mock.calls[0][0].where;
    return { service, where };
  };

  it('commercial : ses segments, plus les vieux segments sans auteur de ses immeubles', async () => {
    const { service, where } = build();
    await service.getSegmentsByCommercial(COMMERCIAL_ID, admin);
    expect(where()).toEqual({
      OR: [
        { commercialId: COMMERCIAL_ID },
        { ...sansAuteur, porte: { immeuble: { commercialId: COMMERCIAL_ID } } },
      ],
    });
  });

  it('manager : ses segments et ceux de ses commerciaux, repli créateur sans auteur', async () => {
    const { service, where } = build();
    await service.getSegmentsByManager(MANAGER_ID, admin);
    expect(where()).toEqual({
      OR: [
        { managerId: MANAGER_ID },
        { commercialId: { in: [COMMERCIAL_ID] } },
        { ...sansAuteur, porte: { immeuble: { managerId: MANAGER_ID } } },
        {
          ...sansAuteur,
          porte: { immeuble: { commercial: { managerId: MANAGER_ID } } },
        },
      ],
    });
  });
});
