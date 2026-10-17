import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
import { SpeechAnalysisService } from '../speech-analysis/speech-analysis.service';
import { S3DiagnosticsService } from '../s3-diagnostics/s3-diagnostics.service';
import { CoachingService } from '../coaching/coaching.service';

type RoomTarget = {
  type: 'COMMERCIAL' | 'MANAGER';
  id: number;
};

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

  /**
   * Audio d'un segment : le fichier découpé des anciens enregistrements par
   * immeuble, sinon l'audio original (1 audio = 1 porte).
   */
  private segmentAudioKey(segment: {
    s3KeySegment: string | null;
    s3KeyOriginal: string;
  }): string {
    return segment.s3KeySegment ?? segment.s3KeyOriginal;
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
    }

    // Coaching IA : 1 audio = 1 porte. Analyse déclenchée automatiquement
    // à partir de la porte du premier segment. Les tarifs sont figés pendant
    // cette requête; le calcul audio reste asynchrone. Le module coaching
    // re-transcrit depuis S3, il ne dépend pas des RecordingSegment.
    const primaryDoor = doorSegments?.[0] ?? null;
    await this.coaching.enqueue(
      {
        s3Key,
        porteId: primaryDoor?.porteId ?? null,
        statut: (primaryDoor?.statut as string | undefined) ?? null,
        durationSec: duration ?? null,
      },
      userToken,
    );

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
      status: segment.status,
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
        OR: [{ commercialId }, { porte: { immeuble: { commercialId } } }],
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
        const streamingUrl = await this.signedUrlOrUndefined(
          this.segmentAudioKey(segment),
        );

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
      orderBy: { createdAt: 'desc' },
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
        streamingUrl: await this.signedUrlOrUndefined(
          this.segmentAudioKey(segment),
        ),
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
      status: segment.status,
      streamingUrl: segment.streamingUrl,
      createdAt: segment.createdAt,
    }));
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
      ...commercials.map((commercial) =>
        this.roomNameFor(commercial.id, 'COMMERCIAL'),
      ),
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
      })),
      totalCount,
    };
  }

  async getSpeechScores(keys: string[]): Promise<
    Array<{
      key: string;
      score?: number;
      totalDurationSec?: number;
      speechDurationSec?: number;
      status: string;
    }>
  > {
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
