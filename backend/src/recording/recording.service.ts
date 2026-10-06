import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  RecordingItem,
  RequestRecordingUploadInput,
  RecordingUploadDetails,
  ConfirmRecordingUploadInput,
  ListRecentRecordingsInput,
  BackfillRecordingsInput,
  BackfillRecordingsResult,
  RecordingSegmentDto,
} from './recording.dto';
import { PrismaService } from '../prisma.service';
import { TranscriptionService, WhisperBusyError } from '../transcription/transcription.service';
import { SpeechAnalysisService } from '../transcription/speech-analysis.service';
import { S3DiagnosticsService } from '../s3-diagnostics/s3-diagnostics.service';
import { CoachingService } from '../coaching/coaching.service';

type RoomTarget = {
  type: 'COMMERCIAL' | 'MANAGER';
  id: number;
};

const execFileAsync = promisify(execFile);
const FFMPEG_MAX_BUFFER = 10 * 1024 * 1024;

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);

  private readonly region = process.env.AWS_REGION || 'eu-west-3';
  private readonly bucket = process.env.S3_BUCKET_NAME!;
  private readonly prefix = process.env.S3_PREFIX || 'recordings/';
  private readonly awsAccessKey = process.env.AWS_ACCESS_KEY_ID!;
  private readonly awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY!;

  // Force l’usage des clés de .env (évite ~/.aws/credentials)
  private readonly s3 = new S3Client({
    region: this.region,
    credentials: {
      accessKeyId: this.awsAccessKey,
      secretAccessKey: this.awsSecretKey,
    },
  });

  private safeRoom(roomName: string) {
    return roomName.replace(/[:]/g, '_');
  }

  private roomNameFor(userId: number, userType: 'COMMERCIAL' | 'MANAGER') {
    return `room:${userType.toLowerCase()}:${userId}`;
  }

  private urlCache = new Map<string, { url: string; expiry: number }>();

  constructor(
    private prisma: PrismaService,
    private transcription: TranscriptionService,
    private speechAnalysis: SpeechAnalysisService,
    private s3Diagnostics: S3DiagnosticsService,
    private coaching: CoachingService,
  ) {
    this.s3Diagnostics.instrument(this.s3, RecordingService.name);
  }

  private getStartOfToday(): Date {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
  }

  private normalizeRoomName(roomName: string): string {
    if (roomName.includes(':')) {
      return roomName;
    }

    // Retro-compat: accepter les anciens formats room_type_id
    const legacy = roomName.split('_');
    if (legacy.length === 3 && legacy[0] === 'room') {
      return `room:${legacy[1]}:${legacy[2]}`;
    }

    return roomName;
  }

  private parseRoomIdentifier(roomName: string): RoomTarget | null {
    const normalized = this.normalizeRoomName(roomName);
    const parts = normalized.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const type = parts[1].toUpperCase();
    const id = Number(parts[2]);

    if (!Number.isFinite(id)) {
      return null;
    }

    if (type !== 'COMMERCIAL' && type !== 'MANAGER') {
      return null;
    }

    return { type: type as RoomTarget['type'], id };
  }

  private async ensureRoomAccess(
    roomName: string,
    userId: number,
    userRole: string,
  ): Promise<RoomTarget | null> {
    const target = this.parseRoomIdentifier(roomName);

    if (!target) {
      if (userRole === 'admin') {
        return null;
      }
      throw new ForbiddenException('Invalid room identifier');
    }

    if (userRole === 'admin') {
      return target;
    }

    if (target.type === 'COMMERCIAL') {
      const commercial = await this.prisma.commercial.findUnique({
        where: { id: target.id },
        select: { id: true, managerId: true, directeurId: true },
      });

      if (!commercial) {
        throw new NotFoundException('Commercial not found');
      }

      // Commercial peut accéder à lui-même
      if (userRole === 'commercial' && commercial.id === userId) {
        return target;
      }

      // Directeur peut accéder à ses commerciaux
      if (userRole === 'directeur' && commercial.directeurId === userId) {
        return target;
      }

      // Manager peut accéder à ses commerciaux
      if (userRole === 'manager' && commercial.managerId === userId) {
        return target;
      }

      throw new ForbiddenException('Access denied to this room');
    }

    if (target.type === 'MANAGER') {
      const manager = await this.prisma.manager.findUnique({
        where: { id: target.id },
        select: { id: true, directeurId: true },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found');
      }

      // Directeur peut accéder à ses managers
      if (userRole === 'directeur' && manager.directeurId === userId) {
        return target;
      }

      // Manager peut accéder à lui-même
      if (userRole === 'manager' && manager.id === userId) {
        return target;
      }

      throw new ForbiddenException('Access denied to this room');
    }

    throw new ForbiddenException('Unsupported room target');
  }

  private extractRoomFromKey(key: string): string | null {
    if (!key.startsWith(this.prefix)) {
      return null;
    }
    const remainder = key.slice(this.prefix.length);
    const [safeRoom] = remainder.split('/');
    if (!safeRoom) {
      return null;
    }
    return safeRoom.replace(/_/g, ':');
  }

  private extractImmeubleIdFromKey(key: string): number | undefined {
    const match = key.match(/(?:^|\/|_)immeuble[-_](\d+)(?:_|\/|\.|$)/i);
    if (!match) {
      return undefined;
    }
    const immeubleId = Number(match[1]);
    return Number.isFinite(immeubleId) ? immeubleId : undefined;
  }

  private async upsertRecordingIndex(
    s3Key: string,
    metadata: {
      size?: number;
      lastModified?: Date;
      hasConversation?: boolean;
    } = {},
  ): Promise<void> {
    const roomName = this.extractRoomFromKey(s3Key);
    const target = roomName ? this.parseRoomIdentifier(roomName) : null;

    if (!roomName || !target) {
      return;
    }

    const optionalData = {
      ...(metadata.size === undefined ? {} : { size: BigInt(metadata.size) }),
      ...(metadata.lastModified === undefined
        ? {}
        : { lastModified: metadata.lastModified }),
      ...(metadata.hasConversation === undefined
        ? {}
        : { hasConversation: metadata.hasConversation }),
    };

    const data = {
      roomName,
      userType: target.type as any,
      commercialId: target.type === 'COMMERCIAL' ? target.id : null,
      managerId: target.type === 'MANAGER' ? target.id : null,
      immeubleId: this.extractImmeubleIdFromKey(s3Key) ?? null,
      ...optionalData,
    };

    await this.prisma.recording.upsert({
      where: { s3Key },
      create: {
        s3Key,
        hasConversation: metadata.hasConversation ?? false,
        ...data,
      },
      update: {
        ...data,
      },
    });
  }

  private toRecordingItemSize(
    size: bigint | number | null | undefined,
  ): number | undefined {
    if (size == null) return undefined;
    const value = typeof size === 'bigint' ? Number(size) : size;
    return Number.isFinite(value) ? value : undefined;
  }

  private async markRecordingHasConversation(s3Key: string): Promise<void> {
    try {
      await this.prisma.recording.update({
        where: { s3Key },
        data: { hasConversation: true },
      });
    } catch {
      await this.upsertRecordingIndex(s3Key, { hasConversation: true });
    }
  }

  private buildSegmentKey(
    originalKey: string,
    porteId: number,
    startTime: number,
  ): string {
    const originalWithoutExt = originalKey.replace(/\.[^/.]+$/u, '');
    const safeStartTime = Number(startTime.toFixed(3))
      .toString()
      .replace(/\./g, '_');
    return `${originalWithoutExt}_porte_${porteId}_${safeStartTime}s.mp4`;
  }

  private async signedUrlOrUndefined(key: string): Promise<string | undefined> {
    try {
      // Vérifier le cache (URLs valides 50 minutes)
      const cached = this.urlCache.get(key);
      if (cached && Date.now() < cached.expiry) {
        return cached.url;
      }

      // Générer nouvelle URL signée avec headers CORS pour streaming
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: 'audio/mp4',
        ResponseCacheControl: 'no-cache',
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: 3600,
      });

      // Mettre en cache (expiry = maintenant + 50 minutes)
      this.urlCache.set(key, {
        url,
        expiry: Date.now() + 50 * 60 * 1000,
      });

      return url;
    } catch {
      return undefined;
    }
  }

  private mapSegmentMetadata(segment: any): RecordingSegmentDto {
    const comm = segment.porte?.immeuble?.commercial;
    const mgr = segment.porte?.immeuble?.manager;
    const commercialNom = comm
      ? `${comm.prenom} ${comm.nom}`
      : mgr
        ? `${mgr.prenom} ${mgr.nom}`
        : undefined;

    return {
      id: segment.id,
      porteId: segment.porteId,
      porteNumero: segment.porte?.numero,
      porteEtage: segment.porte?.etage,
      immeubleAdresse: segment.porte?.immeuble?.adresse,
      commercialNom,
      s3KeyOriginal: segment.s3KeyOriginal ?? undefined,
      s3KeySegment: segment.s3KeySegment ?? undefined,
      statut: segment.statut ?? undefined,
      startTime: segment.startTime,
      endTime: segment.endTime,
      durationSec: segment.durationSec,
      transcription: segment.transcription ?? undefined,
      speechScore: segment.speechScore ?? undefined,
      status: segment.status,
      createdAt: segment.createdAt,
      immeubleId: segment.immeubleId ?? segment.porte?.immeuble?.id,
      commercialId: segment.commercialId ?? comm?.id,
      managerId: segment.managerId ?? mgr?.id,
    };
  }

  async listRecordings(
    roomName: string,
    currentUser: { id: number; role: string },
  ): Promise<RecordingItem[]> {
    await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);

    const safe = this.safeRoom(roomName);
    const prefix = `${this.prefix}${safe}/`;

    const out: RecordingItem[] = [];

    const resp = await this.s3Diagnostics.runWithOperation(
      'RecordingService.listRecordings',
      () =>
        this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
          }),
        ),
    );

    for (const obj of resp.Contents || []) {
      if (!obj.Key) continue;
      if (obj.Key.endsWith('_conv.mp4')) continue;
      if (obj.Key.includes('_porte_')) continue;
      out.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        url: await this.signedUrlOrUndefined(obj.Key),
      });
    }

    // tri décroissant par date
    out.sort(
      (a, b) =>
        (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0),
    );

    return out;
  }

  async requestRecordingUpload(
    input: RequestRecordingUploadInput,
    currentUser: { id: number; role: string },
  ): Promise<RecordingUploadDetails> {
    const { roomName, immeubleId, mimeType = 'audio/mp4' } = input;

    await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);

    const safe = this.safeRoom(roomName);
    const ts = new Date().toISOString().replace(/[:]/g, '-');

    let addressPart = '';
    if (immeubleId) {
      const immeuble = await this.prisma.immeuble.findUnique({
        where: { id: immeubleId },
        select: { adresse: true },
      });
      if (immeuble?.adresse) {
        addressPart = immeuble.adresse.replace(/[^a-z0-9]/gi, '_') + '_';
      }
    }

    const ext = mimeType === 'audio/mp4' ? 'mp4' : 'm4a';
    const s3Key = `${this.prefix}${safe}/${addressPart}${ts}.${ext}`;

    const expiresIn = 900;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });

    this.logger.log(
      `Upload URL generated: key=${s3Key} room=${roomName} user=${currentUser.role}-${currentUser.id}`,
    );

    return { uploadUrl, s3Key, expiresIn };
  }

  async confirmRecordingUpload(
    input: ConfirmRecordingUploadInput,
    currentUser: { id: number; role: string },
    userToken?: string,
  ): Promise<RecordingItem> {
    const { s3Key, duration, doorSegments } = input;

    const roomName = this.extractRoomFromKey(s3Key);
    if (roomName) {
      await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
    } else if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Unknown recording key');
    }

    const head = await this.s3Diagnostics.runWithOperation(
      'RecordingService.confirmRecordingUpload',
      () =>
        this.s3.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: s3Key }),
        ),
    );

    this.logger.log(
      `Upload confirmed: key=${s3Key} size=${head.ContentLength} user=${currentUser.role}-${currentUser.id} duration=${duration ?? 'unknown'}`,
    );

    await this.upsertRecordingIndex(s3Key, {
      size: head.ContentLength,
      lastModified: head.LastModified,
    });

    const validSegments =
      doorSegments?.filter(
        (segment) =>
          Number.isFinite(segment.startTime) &&
          Number.isFinite(segment.endTime) &&
          segment.endTime > segment.startTime,
      ) ?? [];

    if (validSegments.length > 0) {
      const roomTarget = roomName ? this.parseRoomIdentifier(roomName) : null;
      const createdAfter = new Date();
      const commercialId =
        roomTarget?.type === 'COMMERCIAL' ? roomTarget.id : null;
      const managerId = roomTarget?.type === 'MANAGER' ? roomTarget.id : null;
      let immeubleId = this.extractImmeubleIdFromKey(s3Key) ?? null;
      if (!immeubleId && validSegments.length > 0) {
        const firstPorte = await this.prisma.porte.findUnique({
          where: { id: validSegments[0].porteId },
          select: { immeubleId: true },
        });
        immeubleId = firstPorte?.immeubleId ?? null;
      }

      await this.prisma.recordingSegment.createMany({
        data: validSegments.map((segment) => ({
          porteId: segment.porteId,
          commercialId,
          managerId,
          immeubleId,
          statut: (segment.statut as any) ?? null,
          s3KeyOriginal: s3Key,
          startTime: segment.startTime,
          endTime: segment.endTime,
          durationSec: segment.endTime - segment.startTime,
        })),
      });

      const createdSegments = await this.prisma.recordingSegment.findMany({
        where: {
          s3KeyOriginal: s3Key,
          status: 'PENDING',
          createdAt: { gte: createdAfter },
          OR: validSegments.map((segment) => ({
            porteId: segment.porteId,
            startTime: segment.startTime,
            endTime: segment.endTime,
          })),
        },
        orderBy: { id: 'desc' },
      });

      if (createdSegments.length > 0) {
        void this.processSegments(s3Key, createdSegments);
      }
    }

    // Coaching IA : 1 audio = 1 porte. Analyse déclenchée automatiquement
    // à partir de la porte du premier segment. Les tarifs sont figés pendant
    // cette requête; le calcul audio reste asynchrone. Le module coaching
    // re-transcrit depuis S3, il ne dépend pas des RecordingSegment.
    const primaryDoor = doorSegments?.[0] ?? null;
    await this.coaching.enqueue({
      s3Key,
      porteId: primaryDoor?.porteId ?? null,
      statut: (primaryDoor?.statut as string | undefined) ?? null,
      durationSec: duration ?? null,
    }, userToken);

    const url = await this.signedUrlOrUndefined(s3Key);

    return {
      key: s3Key,
      size: head.ContentLength,
      lastModified: head.LastModified,
      url,
    };
  }

  async getSegmentsByPorte(
    porteId: number,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    if (currentUser.role === 'directeur') {
      const porte = await this.prisma.porte.findUnique({
        where: { id: porteId },
        select: {
          immeuble: {
            select: {
              manager: { select: { directeurId: true } },
              commercial: { select: { directeurId: true } },
            },
          },
        },
      });

      if (!porte) {
        throw new NotFoundException('Porte not found');
      }

      const managerDirecteurId = porte.immeuble.manager?.directeurId;
      const commercialDirecteurId = porte.immeuble.commercial?.directeurId;

      if (
        managerDirecteurId !== currentUser.id &&
        commercialDirecteurId !== currentUser.id
      ) {
        throw new ForbiddenException('Access denied to recording segments');
      }
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where: { porteId },
      orderBy: { createdAt: 'desc' },
    });

    return segments.map((segment) => ({
      id: segment.id,
      porteId: segment.porteId,
      s3KeyOriginal: segment.s3KeyOriginal,
      s3KeySegment: segment.s3KeySegment ?? undefined,
      statut: segment.statut ?? undefined,
      startTime: segment.startTime,
      endTime: segment.endTime,
      durationSec: segment.durationSec,
      transcription: segment.transcription ?? undefined,
      speechScore: segment.speechScore ?? undefined,
      status: segment.status,
      createdAt: segment.createdAt,
    }));
  }

  async getSegmentsByKey(
    s3Key: string,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const roomName = this.extractRoomFromKey(s3Key);
    if (roomName) {
      await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where: { s3KeyOriginal: s3Key },
      include: {
        porte: {
          select: {
            numero: true,
            etage: true,
            immeuble: { select: { adresse: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    const withUrls = await Promise.all(
      segments.map(async (segment) => ({
        ...segment,
        streamingUrl: segment.s3KeySegment
          ? await this.signedUrlOrUndefined(segment.s3KeySegment)
          : undefined,
      })),
    );

    return withUrls.map((segment) => ({
      id: segment.id,
      porteId: segment.porteId,
      porteNumero: segment.porte.numero,
      porteEtage: segment.porte.etage,
      immeubleAdresse: segment.porte.immeuble.adresse,
      s3KeyOriginal: segment.s3KeyOriginal,
      s3KeySegment: segment.s3KeySegment ?? undefined,
      statut: segment.statut ?? undefined,
      startTime: segment.startTime,
      endTime: segment.endTime,
      durationSec: segment.durationSec,
      transcription: segment.transcription ?? undefined,
      speechScore: segment.speechScore ?? undefined,
      status: segment.status,
      streamingUrl: segment.streamingUrl,
      createdAt: segment.createdAt,
    }));
  }

  async getSegmentsByCommercial(
    commercialId: number,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const commercial = await this.prisma.commercial.findUnique({
      where: { id: commercialId },
      select: { id: true, directeurId: true },
    });

    if (!commercial) {
      throw new NotFoundException('Commercial not found');
    }

    if (
      currentUser.role === 'directeur' &&
      commercial.directeurId !== Number(currentUser.id)
    ) {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where: {
        OR: [
          { commercialId },
          { porte: { immeuble: { commercialId } } },
        ],
      },
      include: {
        porte: {
          select: {
            numero: true,
            etage: true,
            immeuble: {
              select: {
                id: true,
                adresse: true,
                commercial: { select: { id: true, nom: true, prenom: true } },
                manager: { select: { id: true, nom: true, prenom: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return segments.map((segment) => this.mapSegmentMetadata(segment));
  }

  async getSegmentsByManager(
    managerId: number,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const manager = await this.prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, directeurId: true },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    if (
      currentUser.role === 'directeur' &&
      manager.directeurId !== Number(currentUser.id)
    ) {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where: {
        OR: [
          { managerId },
          { porte: { immeuble: { managerId } } },
          { porte: { immeuble: { commercial: { managerId } } } },
        ],
      },
      include: {
        porte: {
          select: {
            numero: true,
            etage: true,
            immeuble: {
              select: {
                id: true,
                adresse: true,
                commercial: { select: { id: true, nom: true, prenom: true } },
                manager: { select: { id: true, nom: true, prenom: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return segments.map((segment) => this.mapSegmentMetadata(segment));
  }

  async getSegmentsToday(
    statut: string | null,
    limit: number,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied');
    }

    const EXPLOITABLE_STATUTS = ['REFUS', 'ARGUMENTE', 'CONTRAT_SIGNE'];

    const where: any = {
      createdAt: { gte: this.getStartOfToday() },
    };
    if (statut) {
      where.statut = statut;
    } else {
      where.statut = { in: EXPLOITABLE_STATUTS };
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where,
      include: {
        porte: {
          select: {
            numero: true,
            etage: true,
            immeuble: {
              select: {
                id: true,
                adresse: true,
                commercial: { select: { nom: true, prenom: true } },
                manager: { select: { nom: true, prenom: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const mapped = await Promise.all(
      segments.map(async (segment) => {
        const streamingUrl = segment.s3KeySegment
          ? await this.signedUrlOrUndefined(segment.s3KeySegment)
          : undefined;

        const comm = segment.porte.immeuble.commercial;
        const mgr = segment.porte.immeuble.manager;
        const commercialNom = comm
          ? `${comm.prenom} ${comm.nom}`
          : mgr
            ? `${mgr.prenom} ${mgr.nom}`
            : undefined;

        return {
          id: segment.id,
          porteId: segment.porteId,
          porteNumero: segment.porte.numero,
          porteEtage: segment.porte.etage,
          immeubleAdresse: segment.porte.immeuble.adresse,
          commercialNom,
          s3KeyOriginal: segment.s3KeyOriginal,
          s3KeySegment: segment.s3KeySegment ?? undefined,
          statut: segment.statut ?? undefined,
          startTime: segment.startTime,
          endTime: segment.endTime,
          durationSec: segment.durationSec,
          transcription: segment.transcription ?? undefined,
          speechScore: segment.speechScore ?? undefined,
          status: segment.status,
          streamingUrl,
          createdAt: segment.createdAt,
          immeubleId: segment.porte.immeuble.id,
        };
      }),
    );

    return mapped;
  }

  async removeSegmentsToday(
    statut: string | null,
    segmentIds: number[] | null,
    commercialId: number | null,
    limit: number,
    currentUser: { id: number; role: string },
  ): Promise<number> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    // Si des IDs spécifiques sont fournis, supprimer uniquement ceux-là (d'aujourd'hui)
    if (segmentIds && segmentIds.length > 0) {
      const result = await this.prisma.recordingSegment.deleteMany({
        where: {
          id: { in: segmentIds },
          createdAt: { gte: this.getStartOfToday() },
        },
      });
      return result.count;
    }

    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0) {
      return 0;
    }

    const where: any = {
      createdAt: { gte: this.getStartOfToday() },
    };
    if (statut) where.statut = statut;
    if (commercialId) where.commercialId = commercialId;

    const segmentsToDelete = await this.prisma.recordingSegment.findMany({
      where,
      select: { id: true },
      orderBy: { speechScore: 'desc' },
      take: safeLimit,
    });

    if (segmentsToDelete.length === 0) {
      return 0;
    }

    const result = await this.prisma.recordingSegment.deleteMany({
      where: {
        id: { in: segmentsToDelete.map((segment) => segment.id) },
      },
    });

    return result.count;
  }

  async getSegmentsByImmeuble(
    immeubleId: number,
    currentUser: { id: number; role: string },
  ): Promise<RecordingSegmentDto[]> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'directeur') {
      throw new ForbiddenException('Access denied to recording segments');
    }

    const segments = await this.prisma.recordingSegment.findMany({
      where: { immeubleId },
      include: {
        porte: {
          select: {
            numero: true,
            etage: true,
            immeuble: { select: { adresse: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withUrls = await Promise.all(
      segments.map(async (segment) => ({
        ...segment,
        streamingUrl: segment.s3KeySegment
          ? await this.signedUrlOrUndefined(segment.s3KeySegment)
          : undefined,
      })),
    );

    return withUrls.map((segment) => ({
      id: segment.id,
      porteId: segment.porteId,
      porteNumero: segment.porte.numero,
      porteEtage: segment.porte.etage,
      immeubleAdresse: segment.porte.immeuble.adresse,
      s3KeyOriginal: segment.s3KeyOriginal,
      s3KeySegment: segment.s3KeySegment ?? undefined,
      statut: segment.statut ?? undefined,
      startTime: segment.startTime,
      endTime: segment.endTime,
      durationSec: segment.durationSec,
      transcription: segment.transcription ?? undefined,
      speechScore: segment.speechScore ?? undefined,
      status: segment.status,
      streamingUrl: segment.streamingUrl,
      createdAt: segment.createdAt,
    }));
  }

  private async processSegments(
    originalS3Key: string,
    segments: Array<{
      id: number;
      porteId: number;
      startTime: number;
      endTime: number;
    }>,
  ): Promise<void> {
    const tmpDir = path.join(
      os.tmpdir(),
      `recording-segments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const originalFilePath = path.join(tmpDir, 'original.mp4');

    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const downloaded = await this.downloadFromS3(
        originalS3Key,
        originalFilePath,
      );
      if (!downloaded) {
        for (const segment of segments) {
          await this.prisma.recordingSegment.update({
            where: { id: segment.id },
            data: { status: 'FAILED' },
          });
        }
        return;
      }

      // ── PASSE 1 : Découpage + upload en parallèle (audio jouable, max 3) ──
      const MAX_CONCURRENT = 3;
      let running = 0;
      const queue: (() => void)[] = [];
      const limitFn = <T>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const run = () => {
            running++;
            fn().then(resolve, reject).finally(() => {
              running--;
              const next = queue.shift();
              if (next) next();
            });
          };
          if (running < MAX_CONCURRENT) run();
          else queue.push(run);
        });

      const results = await Promise.allSettled(
        segments.map((segment) =>
          limitFn(async () => {
            const segmentFilePath = path.join(tmpDir, `segment-${segment.id}.mp4`);
            const segmentS3Key = this.buildSegmentKey(
              originalS3Key,
              segment.porteId,
              segment.startTime,
            );

            await this.prisma.recordingSegment.update({
              where: { id: segment.id },
              data: { status: 'PROCESSING' },
            });

            await execFileAsync(
              'ffmpeg',
              [
                '-y',
                '-i',
                originalFilePath,
                '-ss',
                String(segment.startTime),
                '-to',
                String(segment.endTime),
                '-c',
                'copy',
                segmentFilePath,
              ],
              { maxBuffer: FFMPEG_MAX_BUFFER },
            );

            await this.uploadSegmentToS3(segmentFilePath, segmentS3Key);

            await this.prisma.recordingSegment.update({
              where: { id: segment.id },
              data: {
                s3KeySegment: segmentS3Key,
                status: 'COMPLETED',
              },
            });

            return { id: segment.id, s3Key: segmentS3Key };
          }),
        ),
      );

      // Marquer les échecs
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const seg = segments[i];
          this.logger.error(
            `Segment cut failed for segmentId=${seg.id}: ${(results[i] as PromiseRejectedResult).reason?.message || (results[i] as PromiseRejectedResult).reason}`,
          );
          await this.prisma.recordingSegment.update({
            where: { id: seg.id },
            data: { status: 'FAILED' },
          });
        }
      }

      // ── PASSE 2 : Enrichissement en arrière-plan (transcription + _conv.mp4) ──
      void this.enrichSegments(originalS3Key, originalFilePath, segments);

    } catch (error) {
      this.logger.error(
        `Unexpected error while processing segments for ${originalS3Key}: ${error?.message || error}`,
      );
      for (const segment of segments) {
        await this.prisma.recordingSegment.update({
          where: { id: segment.id },
          data: { status: 'FAILED' },
        });
      }
      this.cleanupDir(tmpDir);
    }
    // Note: tmpDir cleanup happens in enrichSegments after it finishes
  }

  /**
   * Passe 2 : Enrichissement — 1 seul appel Whisper pour tout le fichier.
   * Produit : transcription par segment, speech score, et _conv.mp4.
   * Fire-and-forget — ne bloque jamais la passe 1.
   */
  private async enrichSegments(
    originalS3Key: string,
    originalFilePath: string,
    segments: Array<{ id: number; startTime: number; endTime: number }>,
  ): Promise<void> {
    const tmpDir = path.dirname(originalFilePath);

    try {
      // 1. Un seul appel Whisper sur le fichier complet
      const whisperResult = await this.transcription.transcribeFile(originalFilePath);
      if (!whisperResult || whisperResult.segments.length === 0) {
        this.logger.warn(`Whisper returned no segments for ${originalS3Key}`);
        return;
      }

      const { segments: whisperSegments, duration: whisperDuration } = whisperResult;

      // 2. Extraire la transcription par segment (match par timestamps)
      for (const segment of segments) {
        try {
          const overlapping = whisperSegments.filter(
            (ws) => ws.end > segment.startTime && ws.start < segment.endTime,
          );
          const transcription = overlapping.map((ws) => ws.text).join(' ').trim() || undefined;

          // Speech score basé sur Whisper (ratio parole/durée du segment)
          const segDuration = segment.endTime - segment.startTime;
          const speechDuration = overlapping.reduce((sum, ws) => {
            const overlapStart = Math.max(ws.start, segment.startTime);
            const overlapEnd = Math.min(ws.end, segment.endTime);
            return sum + Math.max(0, overlapEnd - overlapStart);
          }, 0);
          const speechScore = segDuration > 0
            ? Math.round(Math.min(100, (speechDuration / segDuration) * 100))
            : null;

          await this.prisma.recordingSegment.update({
            where: { id: segment.id },
            data: { transcription, speechScore },
          });
        } catch (err) {
          this.logger.warn(
            `Enrichment failed for segmentId=${segment.id}: ${err?.message || err}`,
          );
        }
      }

      // 3. Générer _conv.mp4 (audio nettoyé — seulement la parole)
      try {
        const merged = this.transcription.mergeSegments(whisperSegments, 2.0);
        if (merged.length > 0) {
          const convFile = path.join(tmpDir, 'conversation.mp4');
          const cut = await this.transcription.cutAudio(originalFilePath, convFile, merged);
          if (cut) {
            const convKey = originalS3Key.replace(/\.mp4$/i, '_conv.mp4');
            await this.transcription.uploadToS3(convFile, convKey);
            await this.markRecordingHasConversation(originalS3Key);
            this.logger.log(`_conv.mp4 generated for ${originalS3Key}`);
          }
        }
      } catch (convErr) {
        this.logger.warn(
          `_conv.mp4 generation failed for ${originalS3Key}: ${convErr?.message || convErr}`,
        );
      }

      // 4. Cache le score global Whisper
      if (whisperDuration > 0) {
        this.speechAnalysis.cacheFromWhisperSegments(
          originalS3Key,
          whisperSegments,
          whisperDuration,
        );
      }

    } catch (error) {
      if (error instanceof WhisperBusyError) {
        this.logger.warn('Whisper occupé : enrichissement différé, segments conservés');
        this.transcription.deferBusy(`enrich:${originalS3Key}`, async () => {
          const retryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-enrich-'));
          const retryFile = path.join(retryDir, 'original.mp4');
          try {
            if (await this.downloadFromS3(originalS3Key, retryFile)) await this.enrichSegments(originalS3Key, retryFile, segments);
          } finally { this.cleanupDir(retryDir); }
        });
        return;
      }
      this.logger.error(
        `Enrichment failed for ${originalS3Key}: ${error?.message || error}`,
      );
    } finally {
      this.cleanupDir(tmpDir);
    }
  }

  private async downloadFromS3(
    s3Key: string,
    outputPath: string,
  ): Promise<boolean> {
    try {
      const resp = await this.s3Diagnostics.runWithOperation(
        'RecordingService.downloadFromS3',
        () =>
          this.s3.send(
            new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
          ),
      );

      if (!resp.Body) {
        return false;
      }

      const writeStream = fs.createWriteStream(outputPath);
      await pipeline(resp.Body as Readable, writeStream);
      return true;
    } catch (error) {
      this.logger.error(
        `Unable to download ${s3Key}: ${error?.message || error}`,
      );
      return false;
    }
  }

  private async uploadSegmentToS3(
    filePath: string,
    s3Key: string,
  ): Promise<void> {
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    await this.s3Diagnostics.runWithOperation(
      'RecordingService.uploadSegmentToS3',
      () =>
        this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: s3Key,
            Body: stream,
            ContentType: 'audio/mp4',
            ContentLength: stat.size,
          }),
        ),
    );
  }

  private cleanupDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {}
  }

  async getStreamingUrl(
    key: string,
    currentUser: { id: number; role: string },
  ): Promise<string> {
    const roomName = this.extractRoomFromKey(key);
    if (roomName) {
      await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
    } else if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Unknown recording key');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: 'audio/mp4',
        ResponseContentDisposition: 'inline',
      });

      return await getSignedUrl(this.s3, command, {
        expiresIn: 7200,
      });
    } catch (error) {
      this.logger.error(`Erreur génération URL streaming: ${error.message}`);
      throw error;
    }
  }

  async triggerConversationExtraction(
    key: string,
    currentUser: { id: number; role: string },
  ): Promise<boolean> {
    const roomName = this.extractRoomFromKey(key);
    if (roomName) {
      await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
    } else if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Unknown recording key');
    }

    const convKey = key.replace(/\.mp4$/i, '_conv.mp4');

    try {
      await this.s3Diagnostics.runWithOperation(
        'RecordingService.triggerConversationExtraction',
        () =>
          this.s3.send(
            new HeadObjectCommand({ Bucket: this.bucket, Key: convKey }),
          ),
      );
      return false;
    } catch {
      // Intentionally swallowed — file may not exist yet
    }

    if (this.transcription.isProcessing(key)) {
      return false;
    }

    void this.transcription.processRecording(key);
    return true;
  }

  getExtractionProgress(
    key: string,
  ): { step: string; current: number; total: number } | null {
    return this.transcription.getProgress(key);
  }

  async triggerBatchExtraction(
    keys: string[],
    currentUser: { id: number; role: string },
  ): Promise<number> {
    let started = 0;

    for (const key of keys) {
      const roomName = this.extractRoomFromKey(key);
      if (roomName) {
        try {
          await this.ensureRoomAccess(
            roomName,
            currentUser.id,
            currentUser.role,
          );
        } catch {
          continue;
        }
      } else if (currentUser.role !== 'admin') {
        continue;
      }

      if (this.transcription.isProcessing(key)) continue;

      const convKey = key.replace(/\.mp4$/i, '_conv.mp4');
      try {
        await this.s3Diagnostics.runWithOperation(
          'RecordingService.triggerBatchExtraction',
          () =>
            this.s3.send(
              new HeadObjectCommand({ Bucket: this.bucket, Key: convKey }),
            ),
        );
        continue;
      } catch {
        // falls through — file doesn't exist yet
      }

      void this.transcription.processRecording(key);
      started++;
    }

    return started;
  }

  getExtractionQueue(): {
    key: string;
    step: string;
    current: number;
    total: number;
  }[] {
    return this.transcription.getQueueState();
  }

  async getProcessedKeys(keys: string[]): Promise<string[]> {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    if (!uniqueKeys.length) return [];

    const recordings = await this.prisma.recording.findMany({
      where: {
        s3Key: { in: uniqueKeys },
        hasConversation: true,
      },
      select: { s3Key: true },
    });

    return recordings.map((recording) => recording.s3Key);
  }

  async getConversationStreamingUrl(
    key: string,
    currentUser: { id: number; role: string },
  ): Promise<string | null> {
    const roomName = this.extractRoomFromKey(key);
    if (roomName) {
      await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
    } else if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Unknown recording key');
    }

    const recording = await this.prisma.recording.findUnique({
      where: { s3Key: key },
      select: { hasConversation: true },
    });

    if (!recording?.hasConversation) {
      return null;
    }

    const convKey = key.replace(/\.mp4$/i, '_conv.mp4');

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: convKey,
        ResponseContentType: 'audio/mp4',
        ResponseContentDisposition: 'inline',
      });

      return await getSignedUrl(this.s3, command, {
        expiresIn: 7200,
      });
    } catch {
      return null;
    }
  }

  async listRecentRecordings(
    input: ListRecentRecordingsInput,
    currentUser: { id: number; role: string },
  ): Promise<{ items: RecordingItem[]; totalCount: number }> {
    const requestedLimit = input.limit ?? 60;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const baseWhere = { lastModified: { not: null } };
    const where =
      currentUser.role === 'directeur'
        ? {
            AND: [
              baseWhere,
              {
                OR: [
                  { commercial: { directeurId: currentUser.id } },
                  { manager: { directeurId: currentUser.id } },
                ],
              },
            ],
          }
        : baseWhere;

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.recording.findMany({
        where,
        orderBy: [{ lastModified: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.recording.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        key: item.s3Key,
        size: this.toRecordingItemSize(item.size),
        lastModified: item.lastModified ?? undefined,
        hasConversation: item.hasConversation,
      })),
      totalCount,
    };
  }

  async backfillRecordingsIndex(
    input: BackfillRecordingsInput,
  ): Promise<BackfillRecordingsResult> {
    const maxObjects = Math.min(Math.max(input.maxObjects ?? 5000, 1), 20000);
    const users = await this.getRecordingBackfillRooms();

    let scannedObjects = 0;
    let indexed = 0;
    let skipped = 0;

    for (const roomName of users) {
      if (scannedObjects >= maxObjects) break;

      const safe = this.safeRoom(roomName);
      const prefix = `${this.prefix}${safe}/`;

      const resp = await this.s3Diagnostics.runWithOperation(
        'RecordingService.backfillRecordingsIndex',
        () =>
          this.s3.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: prefix,
            }),
          ),
      );

      for (const obj of resp.Contents || []) {
        if (scannedObjects >= maxObjects) break;
        scannedObjects++;

        if (!obj.Key || !obj.Key.toLowerCase().endsWith('.mp4')) {
          skipped++;
          continue;
        }
        if (obj.Key.endsWith('_conv.mp4') || obj.Key.includes('_porte_')) {
          skipped++;
          continue;
        }

        try {
          await this.upsertRecordingIndex(obj.Key, {
            size: obj.Size,
            lastModified: obj.LastModified,
          });
          indexed++;
        } catch (error) {
          skipped++;
          this.logger.warn(
            `backfillRecordingsIndex skipped key=${obj.Key}: ${error?.message || error}`,
          );
        }
      }
    }

    this.logger.log(
      `backfillRecordingsIndex scannedRooms=${users.length} scannedObjects=${scannedObjects} indexed=${indexed} skipped=${skipped}`,
    );

    return {
      scannedRooms: users.length,
      scannedObjects,
      indexed,
      skipped,
    };
  }

  private async getRecordingBackfillRooms(): Promise<string[]> {
    const [commercials, managers] = await this.prisma.$transaction([
      this.prisma.commercial.findMany({ select: { id: true } }),
      this.prisma.manager.findMany({ select: { id: true } }),
    ]);

    return [
      ...commercials.map((commercial) => this.roomNameFor(commercial.id, 'COMMERCIAL')),
      ...managers.map((manager) => this.roomNameFor(manager.id, 'MANAGER')),
    ];
  }

  async listAllRecordings(
    roomNames: string[],
    currentUser: { id: number; role: string },
  ): Promise<{ items: RecordingItem[]; totalCount: number }> {
    const uniqueRooms = [...new Set(roomNames)];

    this.logger.log(
      `listAllRecordings legacy requestedRooms=${roomNames.length} uniqueRooms=${uniqueRooms.length} user=${currentUser.role}-${currentUser.id}`,
    );

    const allowedRooms: string[] = [];
    for (const roomName of uniqueRooms) {
      try {
        await this.ensureRoomAccess(roomName, currentUser.id, currentUser.role);
        allowedRooms.push(roomName);
      } catch {
        // Preserve old partial-success behavior without triggering S3 scans.
      }
    }

    if (!allowedRooms.length) {
      return { items: [], totalCount: 0 };
    }

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.recording.findMany({
        where: {
          roomName: { in: allowedRooms },
          lastModified: { not: null },
        },
        orderBy: [{ lastModified: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.recording.count({
        where: {
          roomName: { in: allowedRooms },
          lastModified: { not: null },
        },
      }),
    ]);

    this.logger.log(
      `listAllRecordings legacy completed uniqueRooms=${uniqueRooms.length} allowedRooms=${allowedRooms.length} returnedItems=${items.length}`,
    );

    return {
      items: items.map((item) => ({
        key: item.s3Key,
        size: this.toRecordingItemSize(item.size),
        lastModified: item.lastModified ?? undefined,
        hasConversation: item.hasConversation,
      })),
      totalCount,
    };
  }

  async getSpeechScores(keys: string[]): Promise<Array<{
    key: string;
    score?: number;
    totalDurationSec?: number;
    speechDurationSec?: number;
    status: string;
  }>> {
    const validKeys = keys.filter((k) => !k.endsWith('_conv.mp4'));

    const stored = await this.speechAnalysis.getStoredScores(validKeys);
    const cached = this.speechAnalysis.getCachedScores(validKeys);

    const keysToAnalyze = validKeys.filter(
      (key) =>
        !cached.has(key) &&
        !this.speechAnalysis.isAnalyzing(key) &&
        (!stored.has(key) || stored.get(key)?.status === 'pending'),
    );

    if (keysToAnalyze.length > 0) {
      await this.speechAnalysis.triggerBatchAnalysis(keysToAnalyze);
    }

    return validKeys.map((key) => {
      const score = cached.get(key);
      if (score) {
        return {
          key,
          score: score.score,
          totalDurationSec: score.totalDurationSec,
          speechDurationSec: score.speechDurationSec,
          status: 'ready',
        };
      }

      const storedScore = stored.get(key);
      if (storedScore) {
        return {
          key,
          score: storedScore.score,
          totalDurationSec: storedScore.totalDurationSec,
          speechDurationSec: storedScore.speechDurationSec,
          status: storedScore.status,
        };
      }

      if (this.speechAnalysis.isAnalyzing(key)) {
        return { key, status: 'analyzing' };
      }

      return { key, status: 'pending' };
    });
  }
}
