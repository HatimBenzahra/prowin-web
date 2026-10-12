import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import axios from 'axios';
import { sttBudget } from './stt-budget';

const execFileAsync = promisify(execFile);

import { SpeechAnalysisService } from './speech-analysis.service';
import { S3DiagnosticsService } from '../s3-diagnostics/s3-diagnostics.service';
import { PrismaService } from '../prisma.service';

const FFMPEG_MAX_BUFFER = 10 * 1024 * 1024;
export class WhisperBusyError extends Error { constructor() { super('STT_BUSY'); } }

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  text: string;
  segments: WhisperSegment[];
  duration: number;
  processing_time: number;
}

export interface ExtractionProgress {
  step: string;
  current: number;
  total: number;
  key?: string;
}

@Injectable()
export class TranscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly speechAnalysis: SpeechAnalysisService,
    private readonly s3Diagnostics: S3DiagnosticsService,
    private readonly prisma: PrismaService,
  ) {
    this.s3Diagnostics.instrument(this.s3, TranscriptionService.name);
  }

  private readonly whisperUrl = process.env.WHISPER_API_URL;
  // Public : utilisé par le coaching pour dériver le seuil de requeue d'un job
  // bloqué (doit dépasser ce timeout, sinon on re-claime un job encore vivant).
  readonly whisperTimeoutMs = this.resolveWhisperTimeout();

  /** In-memory progress tracking per s3Key */
  private readonly progress = new Map<string, ExtractionProgress>();
  private readonly inFlight = new Set<string>();
  private readonly busyRetries = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;

  deferBusy(key: string, work: () => Promise<void>): void {
    if (this.destroyed || this.busyRetries.has(key)) return;
    const timer = setTimeout(() => {
      this.busyRetries.delete(key);
      if (!this.destroyed) void work().catch(() => this.logger.warn('Reprise STT différée indisponible'));
    }, 60_000 + Math.floor(Math.random() * 15_000));
    timer.unref();
    this.busyRetries.set(key, timer);
  }

  /** Concurrency limiter — max N simultaneous processRecording jobs */
  private readonly maxConcurrency = 2;
  private runningCount = 0;
  private readonly waitQueue: (() => void)[] = [];

  getProgress(s3Key: string): ExtractionProgress | null {
    return this.progress.get(s3Key) ?? null;
  }

  isProcessing(s3Key: string): boolean {
    return this.inFlight.has(s3Key);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    for (const timer of this.busyRetries.values()) clearTimeout(timer);
    this.busyRetries.clear();
    this.progress.clear();
    this.inFlight.clear();
    this.waitQueue.length = 0;
  }

  private acquireSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrency) {
      this.runningCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.runningCount++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.runningCount--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private setProgress(
    s3Key: string,
    step: string,
    current: number,
    total = 4,
  ): void {
    this.progress.set(s3Key, { step, current, total });
  }

  private clearProgress(s3Key: string): void {
    // Keep "done" visible for 10s so the frontend can catch it
    this.setProgress(s3Key, 'done', 4, 4);
    setTimeout(() => this.progress.delete(s3Key), 10_000);
  }

  private failProgress(s3Key: string): void {
    // Keep "error" visible for 30s so the frontend can catch it
    this.setProgress(s3Key, 'error', 0, 4);
    setTimeout(() => this.progress.delete(s3Key), 30_000);
  }

  private readonly region = process.env.AWS_REGION || 'eu-west-3';
  private readonly bucket = process.env.S3_BUCKET_NAME!;

  private readonly s3 = new S3Client({
    region: this.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  private resolveWhisperTimeout(): number {
    const raw = Number(process.env.WHISPER_TIMEOUT_MS);
    if (!Number.isFinite(raw) || raw < 10_000 || raw > 5_400_000) {
      return 5_400_000;
    }
    return raw;
  }

  /**
   * Traite un enregistrement : transcription Whisper → découpage ffmpeg → upload _conv.mp4
   *
   * IMPORTANT : Cette méthode ne throw JAMAIS.
   * Si le Whisper est down, ffmpeg échoue, S3 plante → on log et on return.
   * L'enregistrement original reste intact.
   */
  getQueueState(): (ExtractionProgress & { key: string })[] {
    return Array.from(this.progress.entries()).map(([key, p]) => ({
      ...p,
      key,
    }));
  }

  async processRecording(s3Key: string): Promise<void> {
    if (this.inFlight.has(s3Key)) {
      this.logger.debug(`Traitement déjà en cours pour ${s3Key}, skip`);
      return;
    }

    this.inFlight.add(s3Key);
    this.setProgress(s3Key, 'queued', 0);
    await this.acquireSlot();

    const tmpDir = path.join(
      os.tmpdir(),
      `transcription-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const originalFile = path.join(tmpDir, 'original.mp4');
    const convFile = path.join(tmpDir, 'conversation.mp4');

    try {
      // Vérifier que c'est un fichier audio valide (pas un _conv existant)
      if (s3Key.endsWith('_conv.mp4')) {
        return;
      }

      if (!this.whisperUrl) {
        this.logger.warn(
          `WHISPER_API_URL absent, extraction ignorée pour ${s3Key}`,
        );
        return;
      }

      this.logger.log(`Début traitement : ${s3Key}`);

      // 1. Créer le dossier temporaire
      fs.mkdirSync(tmpDir, { recursive: true });

      this.setProgress(s3Key, 'downloading', 1);
      const downloaded = await this.downloadFromS3(s3Key, originalFile);
      if (!downloaded) {
        this.failProgress(s3Key);
        return;
      }

      this.setProgress(s3Key, 'transcribing', 2);
      const whisperResult = await this.transcribeFile(originalFile);
      if (!whisperResult || whisperResult.segments.length === 0) {
        this.logger.warn(
          `Aucun segment de parole détecté pour ${s3Key} — pas de version conversation`,
        );
        this.failProgress(s3Key);
        return;
      }

      const { segments, duration: whisperDuration } = whisperResult;

      if (whisperDuration > 0) {
        this.speechAnalysis.cacheFromWhisperSegments(s3Key, segments, whisperDuration);
      }

      const merged = this.mergeSegments(segments, 2.0);

      this.logger.log(
        `${segments.length} segments détectés → ${merged.length} blocs fusionnés pour ${s3Key}`,
      );

      this.setProgress(s3Key, 'cutting', 3);
      const cut = await this.cutAudio(originalFile, convFile, merged);
      if (!cut) {
        this.failProgress(s3Key);
        return;
      }

      this.setProgress(s3Key, 'uploading', 4);
      const convKey = s3Key.replace(/\.mp4$/i, '_conv.mp4');
      const uploaded = await this.uploadToS3(convFile, convKey);
      if (!uploaded) {
        this.failProgress(s3Key);
        return;
      }
      await this.markRecordingHasConversation(s3Key);

      const originalSize = fs.statSync(originalFile).size;
      const convSize = fs.statSync(convFile).size;
      const ratio = ((1 - convSize / originalSize) * 100).toFixed(0);

      this.logger.log(
        `Traitement terminé : ${s3Key} → ${convKey} (${ratio}% réduit)`,
      );
      this.clearProgress(s3Key);
    } catch (error) {
      if (error instanceof WhisperBusyError) {
        this.setProgress(s3Key, 'pending', 0);
        this.deferBusy(s3Key, () => this.processRecording(s3Key));
        this.logger.warn('Whisper occupé : extraction différée, audio original conservé');
        return;
      }
      this.logger.error(
        `Erreur inattendue lors du traitement de ${s3Key}: ${error?.message || error}`,
      );
      this.failProgress(s3Key);
    } finally {
      // Nettoyage systématique des fichiers temporaires
      this.cleanupDir(tmpDir);
      this.inFlight.delete(s3Key);
      this.releaseSlot();
    }
  }

  // ---------------------------------------------------------------------------
  // Étapes internes — chacune gère ses propres erreurs
  // ---------------------------------------------------------------------------

  /** Télécharge depuis S3 en streaming directement sur disque (pas de buffering mémoire) */
  private async downloadFromS3(
    s3Key: string,
    destPath: string,
  ): Promise<boolean> {
    try {
      const resp = await this.s3Diagnostics.runWithOperation(
        'TranscriptionService.downloadFromS3',
        () =>
          this.s3.send(
            new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
          ),
      );

      if (!resp.Body) {
        this.logger.warn(`S3 Body vide pour ${s3Key}`);
        return false;
      }

      const writeStream = fs.createWriteStream(destPath);
      await pipeline(resp.Body as Readable, writeStream);

      this.logger.debug(`Téléchargé ${s3Key} → ${destPath}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Échec téléchargement S3 ${s3Key}: ${error?.message || error}`,
      );
      return false;
    }
  }

  /**
   * Appelle Whisper. Sans `opts`, on passe par `/transcribe/prospection`, le
   * raccourci historique qui pré-remplit les réglages ET le vocabulaire côté
   * service STT — c'est ce que font encore le pipeline `_conv` et
   * `recording.service.ts`.
   *
   * Avec `opts`, l'appelant porte son propre profil : on vise l'endpoint
   * générique `/transcribe` en passant tous les réglages explicitement. C'est ce
   * qui permet au coaching de rester un connecteur autonome, sans connaissance
   * métier stockée dans Whisper.
   */
  async transcribeFile(
    filePath: string,
  ): Promise<{ segments: WhisperSegment[]; duration: number; text: string } | null> {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      let durationSec = 0;
      try {
        const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: FFMPEG_MAX_BUFFER });
        durationSec = Number(stdout.trim());
      } catch { /* Unknown duration uses the bounded ceiling. */ }

      // Node.js 20+ : FormData et Blob natifs
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([fileBuffer], { type: 'audio/mp4' }),
        'audio.mp4',
      );

      const url = `${this.whisperUrl}/transcribe/prospection?language=fr`;

      // axios (et NON le fetch natif) : le fetch d'undici impose un
      // `headersTimeout` par défaut de 5 min, indépendant de notre timeout, qui
      // coupait les transcriptions longues (audio > ~5 min de traitement) avec
      // « fetch failed ». axios respecte `timeout` de bout en bout.
      const resp = await axios.post<WhisperResponse>(url, formData, {
        timeout: sttBudget(durationSec),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const data = resp.data;

      this.logger.debug(
        `Whisper : ${data.segments?.length || 0} segments en ${data.processing_time?.toFixed(1)}s`,
      );

      if (!data.segments || data.segments.length === 0) return null;

      return {
        segments: data.segments,
        duration: data.duration || 0,
        text: data.text || '',
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429 || (error.response?.status === 503 && error.response?.data?.detail === 'STT_BUSY')) throw new WhisperBusyError();
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          this.logger.error(
            `Whisper timeout (> ${this.whisperTimeoutMs}ms) — abandon`,
          );
        } else if (error.response) {
          this.logger.error(
            `Whisper a répondu HTTP ${error.response.status}`,
          );
        } else {
          this.logger.error('STT_TRANSPORT_FAILED');
        }
      } else {
        this.logger.error('STT_FAILED');
      }
      return null;
    }
  }

  /**
   * Transcription complète d'un objet S3 pour le coaching IA.
   * Télécharge l'audio depuis S3, appelle Whisper et renvoie le texte + la durée.
   * Indépendant du pipeline conversation (_conv) : ni découpe ni ré-upload.
   */


  /**
   * Fusionne les segments proches pour éviter les micro-coupures.
   * padding = secondes ajoutées avant/après chaque segment.
   */
  mergeSegments(
    segments: WhisperSegment[],
    padding: number,
  ): { start: number; end: number }[] {
    if (segments.length === 0) return [];

    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];

    let current = {
      start: Math.max(0, sorted[0].start - padding),
      end: sorted[0].end + padding,
    };

    for (let i = 1; i < sorted.length; i++) {
      const seg = sorted[i];
      const segStart = Math.max(0, seg.start - padding);
      const segEnd = seg.end + padding;

      if (segStart <= current.end) {
        // Les segments se chevauchent après padding → fusionner
        current.end = Math.max(current.end, segEnd);
      } else {
        merged.push(current);
        current = { start: segStart, end: segEnd };
      }
    }

    merged.push(current);
    return merged;
  }

  async cutAudio(
    inputPath: string,
    outputPath: string,
    segments: { start: number; end: number }[],
  ): Promise<boolean> {
    try {
      if (segments.length === 1) {
        // Un seul bloc → simple trim
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            inputPath,
            '-ss',
            String(segments[0].start),
            '-to',
            String(segments[0].end),
            '-c',
            'copy',
            outputPath,
          ],
          { maxBuffer: FFMPEG_MAX_BUFFER },
        );
        return true;
      }

      // Plusieurs blocs → extraire chacun puis concaténer
      const tmpDir = path.dirname(outputPath);
      const partFiles: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const partFile = path.join(tmpDir, `part_${i}.mp4`);
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            inputPath,
            '-ss',
            String(segments[i].start),
            '-to',
            String(segments[i].end),
            '-c',
            'copy',
            partFile,
          ],
          { maxBuffer: FFMPEG_MAX_BUFFER },
        );
        partFiles.push(partFile);
      }

      // Fichier de concat pour ffmpeg
      const listFile = path.join(tmpDir, 'concat_list.txt');
      const listContent = partFiles.map((f) => `file '${f}'`).join('\n');
      fs.writeFileSync(listFile, listContent);

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listFile,
          '-c',
          'copy',
          outputPath,
        ],
        { maxBuffer: FFMPEG_MAX_BUFFER },
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Échec ffmpeg pour le découpage: ${error?.message || error}`,
      );
      return false;
    }
  }

  /** Upload vers S3 en streaming depuis le disque (pas de buffering mémoire) */
  async uploadToS3(filePath: string, s3Key: string): Promise<boolean> {
    try {
      const stat = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);

      await this.s3Diagnostics.runWithOperation(
        'TranscriptionService.uploadToS3',
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

      this.logger.debug(`Uploadé ${s3Key} (${stat.size} bytes)`);
      return true;
    } catch (error) {
      this.logger.error(`Échec upload S3 ${s3Key}: ${error?.message || error}`);
      return false;
    }
  }

  private async markRecordingHasConversation(s3Key: string): Promise<void> {
    try {
      await this.prisma.recording.update({
        where: { s3Key },
        data: { hasConversation: true },
      });
    } catch {
      // The original object may predate the DB index; a later confirmation or
      // backfill can create the row without blocking extraction.
    }
  }

  private cleanupDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Silencieux — ce n'est que du nettoyage
    }
  }
}
