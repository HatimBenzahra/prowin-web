import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { RecordingAnalysisStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { S3DiagnosticsService } from '../s3-diagnostics/s3-diagnostics.service';

const execFileAsync = promisify(execFile);

export interface SpeechScore {
  score: number; // 0–100
  totalDurationSec: number;
  speechDurationSec: number;
}

export interface StoredSpeechScore {
  key: string;
  score?: number;
  totalDurationSec?: number;
  speechDurationSec?: number;
  status: 'pending' | 'analyzing' | 'ready' | 'failed';
  error?: string;
}

@Injectable()
export class SpeechAnalysisService implements OnModuleDestroy {
  private readonly logger = new Logger(SpeechAnalysisService.name);
  private readonly prisma: PrismaService;

  private readonly cache = new Map<string, SpeechScore>();

  /** Track in-flight analyses to avoid duplicate work */
  private readonly analyzing = new Set<string>();

  /** Concurrency limiter — max N simultaneous analyses */
  private readonly maxConcurrency = 3;
  private runningCount = 0;
  private readonly waitQueue: (() => void)[] = [];

  private readonly region = process.env.AWS_REGION || 'eu-west-3';
  private readonly bucket = process.env.S3_BUCKET_NAME!;

  private readonly s3 = new S3Client({
    region: this.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  private readonly s3Diagnostics: S3DiagnosticsService;

  /** Silence detection thresholds tuned for compressed phone audio */
  constructor(prisma: PrismaService, s3Diagnostics: S3DiagnosticsService) {
    this.prisma = prisma;
    this.s3Diagnostics = s3Diagnostics;
    s3Diagnostics.instrument(this.s3, SpeechAnalysisService.name);
  }

  private readonly noiseThresholdDb = -40;
  private readonly minSilenceSec = 0.5;

  onModuleDestroy(): void {
    this.cache.clear();
    this.analyzing.clear();
    this.waitQueue.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Return all cached scores for the given keys */
  getCachedScores(keys: string[]): Map<string, SpeechScore> {
    const result = new Map<string, SpeechScore>();
    for (const key of keys) {
      const cached = this.cache.get(key);
      if (cached) result.set(key, cached);
    }
    return result;
  }

  async getStoredScores(
    keys: string[],
  ): Promise<Map<string, StoredSpeechScore>> {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    const result = new Map<string, StoredSpeechScore>();
    if (!uniqueKeys.length) return result;

    const rows = await this.prisma.recordingAnalysis.findMany({
      where: { s3Key: { in: uniqueKeys } },
    });

    for (const row of rows) {
      const status = this.toPublicStatus(row.status);
      if (
        row.status === RecordingAnalysisStatus.READY &&
        row.score != null &&
        row.totalDurationSec != null &&
        row.speechDurationSec != null
      ) {
        this.cache.set(row.s3Key, {
          score: row.score,
          totalDurationSec: row.totalDurationSec,
          speechDurationSec: row.speechDurationSec,
        });
      }

      result.set(row.s3Key, {
        key: row.s3Key,
        score: row.score ?? undefined,
        totalDurationSec: row.totalDurationSec ?? undefined,
        speechDurationSec: row.speechDurationSec ?? undefined,
        status,
        error: row.error ?? undefined,
      });
    }

    return result;
  }

  /** Check if analysis is currently running for a key */
  isAnalyzing(key: string): boolean {
    return this.analyzing.has(key);
  }

  /**
   * Trigger background analysis for all non-ready keys.
   * Does NOT await analysis completion — fire and forget.
   */
  async triggerBatchAnalysis(keys: string[]): Promise<number> {
    const requestedKeys = [
      ...new Set(
        keys.filter(
          (k) => k && !k.endsWith('_conv.mp4') && !this.analyzing.has(k),
        ),
      ),
    ];

    if (requestedKeys.length === 0) return 0;

    const existing = await this.prisma.recordingAnalysis.findMany({
      where: { s3Key: { in: requestedKeys } },
      select: { s3Key: true, status: true },
    });
    const existingByKey = new Map(existing.map((row) => [row.s3Key, row]));

    const candidates = requestedKeys.filter((key) => {
      if (this.cache.has(key)) return false;
      const row = existingByKey.get(key);
      if (!row) return true;
      return row.status === RecordingAnalysisStatus.PENDING;
    });

    if (candidates.length === 0) return 0;

    const recordings = await this.prisma.recording.findMany({
      where: { s3Key: { in: candidates } },
      select: { id: true, s3Key: true },
    });

    const toAnalyze: string[] = [];
    for (const recording of recordings) {
      await this.prisma.recordingAnalysis.upsert({
        where: { s3Key: recording.s3Key },
        create: {
          recordingId: recording.id,
          s3Key: recording.s3Key,
          status: RecordingAnalysisStatus.ANALYZING,
          error: null,
        },
        update: {
          status: RecordingAnalysisStatus.ANALYZING,
          error: null,
        },
      });
      toAnalyze.push(recording.s3Key);
    }

    if (toAnalyze.length === 0) return 0;

    this.logger.log(
      `recordingSpeechAnalysis triggered count=${toAnalyze.length} requested=${requestedKeys.length}`,
    );

    for (const key of toAnalyze) {
      void this.analyzeRecording(key);
    }

    return toAnalyze.length;
  }

  // ---------------------------------------------------------------------------
  // Core analysis
  // ---------------------------------------------------------------------------

  /**
   * Download a recording from S3, run ffprobe + silencedetect, cache result.
   * Never throws — logs errors and silently skips.
   */
  private async analyzeRecording(s3Key: string): Promise<void> {
    if (this.cache.has(s3Key) || this.analyzing.has(s3Key)) return;

    this.analyzing.add(s3Key);
    await this.acquireSlot();

    const tmpDir = path.join(
      os.tmpdir(),
      `speech-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const filePath = path.join(tmpDir, 'audio.mp4');

    try {
      const existing = await this.prisma.recordingAnalysis.findUnique({
        where: { s3Key },
      });
      if (
        existing?.status === RecordingAnalysisStatus.READY &&
        existing.score != null &&
        existing.totalDurationSec != null &&
        existing.speechDurationSec != null
      ) {
        this.cache.set(s3Key, {
          score: existing.score,
          totalDurationSec: existing.totalDurationSec,
          speechDurationSec: existing.speechDurationSec,
        });
        return;
      }

      fs.mkdirSync(tmpDir, { recursive: true });

      const downloaded = await this.downloadFromS3(s3Key, filePath);
      if (!downloaded) {
        await this.persistAnalysisFailure(s3Key, 'download_failed');
        return;
      }

      const [totalDuration, silences] = await Promise.all([
        this.getMediaDuration(filePath),
        this.detectSilences(filePath),
      ]);

      if (totalDuration <= 0) {
        this.logger.warn(`Durée invalide pour ${s3Key}: ${totalDuration}`);
        await this.persistAnalysisFailure(s3Key, 'invalid_duration');
        return;
      }

      const silenceDuration = silences.reduce(
        (sum, s) => sum + (s.end - s.start),
        0,
      );
      const speechDurationSec = Math.max(0, totalDuration - silenceDuration);
      const score = Math.round(
        Math.min(100, (speechDurationSec / totalDuration) * 100),
      );

      this.cache.set(s3Key, {
        score,
        totalDurationSec: totalDuration,
        speechDurationSec,
      });

      await this.persistAnalysisResult(
        s3Key,
        score,
        totalDuration,
        speechDurationSec,
      );

      this.logger.debug(
        `Score silencedetect pour ${s3Key}: ${score}% (${speechDurationSec.toFixed(1)}s parole / ${totalDuration.toFixed(1)}s total)`,
      );
    } catch (error) {
      await this.persistAnalysisFailure(s3Key, error?.message || String(error));
      this.logger.error(`Erreur analyse ${s3Key}: ${error?.message || error}`);
    } finally {
      this.cleanupDir(tmpDir);
      this.analyzing.delete(s3Key);
      this.releaseSlot();
    }
  }

  private async persistAnalysisResult(
    s3Key: string,
    score: number,
    totalDurationSec: number,
    speechDurationSec: number,
  ): Promise<void> {
    try {
      const recording = await this.prisma.recording.findUnique({
        where: { s3Key },
        select: { id: true },
      });
      if (!recording) {
        this.logger.warn(
          `RecordingAnalysis skipped: no Recording for ${s3Key}`,
        );
        return;
      }

      await this.prisma.recordingAnalysis.upsert({
        where: { s3Key },
        create: {
          recordingId: recording.id,
          s3Key,
          status: RecordingAnalysisStatus.READY,
          score,
          totalDurationSec,
          speechDurationSec,
          analyzedAt: new Date(),
          error: null,
        },
        update: {
          status: RecordingAnalysisStatus.READY,
          score,
          totalDurationSec,
          speechDurationSec,
          analyzedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `RecordingAnalysis persist failed for ${s3Key}: ${error?.message || error}`,
      );
    }
  }

  private async persistAnalysisFailure(
    s3Key: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      const recording = await this.prisma.recording.findUnique({
        where: { s3Key },
        select: { id: true },
      });
      if (!recording) return;

      await this.prisma.recordingAnalysis.upsert({
        where: { s3Key },
        create: {
          recordingId: recording.id,
          s3Key,
          status: RecordingAnalysisStatus.FAILED,
          error: errorMessage.slice(0, 500),
        },
        update: {
          status: RecordingAnalysisStatus.FAILED,
          error: errorMessage.slice(0, 500),
        },
      });
    } catch (error) {
      this.logger.warn(
        `RecordingAnalysis failure persist failed for ${s3Key}: ${error?.message || error}`,
      );
    }
  }

  private toPublicStatus(
    status: RecordingAnalysisStatus,
  ): StoredSpeechScore['status'] {
    switch (status) {
      case RecordingAnalysisStatus.ANALYZING:
        return 'analyzing';
      case RecordingAnalysisStatus.READY:
        return 'ready';
      case RecordingAnalysisStatus.FAILED:
        return 'failed';
      case RecordingAnalysisStatus.PENDING:
      default:
        return 'pending';
    }
  }

  // ---------------------------------------------------------------------------
  // ffprobe — total duration
  // ---------------------------------------------------------------------------

  private async getMediaDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        filePath,
      ]);

      const parsed = JSON.parse(stdout);
      const duration = parseFloat(parsed?.format?.duration ?? '0');
      return Number.isFinite(duration) ? duration : 0;
    } catch (error) {
      this.logger.error(`ffprobe échoué: ${error?.message || error}`);
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // ffmpeg silencedetect — silence segments
  // ---------------------------------------------------------------------------

  private detectSilences(
    filePath: string,
  ): Promise<Array<{ start: number; end: number }>> {
    return new Promise((resolve) => {
      const silences: Array<{ start: number; end: number }> = [];
      let currentStart: number | null = null;
      let stderrBuffer = '';

      const proc = spawn('ffmpeg', [
        '-i',
        filePath,
        '-af',
        `silencedetect=n=${this.noiseThresholdDb}dB:d=${this.minSilenceSec}`,
        '-f',
        'null',
        '-',
      ]);

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();

        // Process complete lines only
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const startMatch = line.match(/silence_start:\s*(\d+(?:\.\d+)?)/);
          if (startMatch) {
            currentStart = parseFloat(startMatch[1]);
            continue;
          }

          const endMatch = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/);
          if (endMatch && currentStart !== null) {
            const end = parseFloat(endMatch[1]);
            if (end > currentStart) {
              silences.push({ start: currentStart, end });
            }
            currentStart = null;
          }
        }
      });

      proc.on('close', () => {
        // ffmpeg returns 0 on success, but also sometimes 1 for audio issues
        // We still want partial results in those cases
        resolve(silences);
      });

      proc.on('error', (err) => {
        this.logger.error(`ffmpeg silencedetect spawn error: ${err.message}`);
        resolve([]); // Don't reject — return empty silences
      });

      // Safety timeout (30s should be more than enough)
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process may already be dead
        }
        resolve(silences);
      }, 30_000);
    });
  }

  // ---------------------------------------------------------------------------
  // S3 + filesystem helpers
  // ---------------------------------------------------------------------------

  private async downloadFromS3(
    s3Key: string,
    destPath: string,
  ): Promise<boolean> {
    try {
      const resp = await this.s3Diagnostics.runWithOperation(
        'SpeechAnalysisService.downloadFromS3',
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
      return true;
    } catch (error) {
      this.logger.error(
        `Échec téléchargement S3 pour analyse ${s3Key}: ${error?.message || error}`,
      );
      return false;
    }
  }

  private cleanupDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Cleanup is best-effort
    }
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
}
