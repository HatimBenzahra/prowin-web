import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CoachingStatus, Prisma, SalesPlanVersion, StatutPorte } from '@prisma/client';
import { CRM_SOURCE, CRM_TENANT } from './shared/crm-scope';
import { PrismaService } from '../prisma.service';
import { SalesPlanService } from './referentiels/sales-plan.service';
import { CoachingConfigService } from './coaching-config.service';
import { CoachingQueryService } from './lecture/coaching-query.service';
import { CoachingApiClient } from './coaching-api.client';
import { CoachingInputService } from './coaching-input.service';
import { randomUUID } from 'crypto';

import { CoachingAnalysisDto } from './coaching.dto';

export interface EnqueueCoachingInput {
  s3Key: string;
  porteId?: number | null;
  statut?: string | null;
  durationSec?: number | null;
}

/** Commandes du coaching : enfiler, lancer, relancer, marquer favori. */
@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesPlans: SalesPlanService,
    private readonly config: CoachingConfigService,
    private readonly query: CoachingQueryService,
    private readonly api: CoachingApiClient,
    private readonly input: CoachingInputService,
  ) {}

  /**
   * Déclenché automatiquement à l'upload; les références sont figées avant retour.
   * Idempotent : une seule analyse par (audio × version de plan).
   */
  async enqueue(input: EnqueueCoachingInput, userToken?: string): Promise<void> {
    try {
      if (!this.api.isConfigured()) {
        this.logger.warn('API coaching non configurée, coaching ignoré');
        return;
      }
      // Auto : on ne coache que les échanges dont le statut porte est configuré.
      const coachable = await this.config.getCoachableStatuts();
      if (!input.statut || !coachable.includes(input.statut)) {
        this.logger.debug(
          `Statut "${input.statut ?? '∅'}" non coachable — auto ignoré pour ${input.s3Key}`,
        );
        return;
      }
      // Auto : audio trop court (< 2 min) → non coaché. La durée vient de la
      // porte (segment d'enregistrement) ; repli sur la durée passée à l'upload.
      const durAgg = await this.prisma.recordingSegment.aggregate({
        _max: { durationSec: true },
        where: { s3KeyOriginal: input.s3Key },
      });
      const durationSec = durAgg._max.durationSec ?? input.durationSec ?? 0;
      const minDuration = await this.config.getMinAutoDurationSec();
      if (durationSec < minDuration) {
        this.logger.debug(
          `Audio ${input.s3Key} trop court (${durationSec}s < ${minDuration}s) — auto ignoré`,
        );
        return;
      }
      const version = await this.salesPlans.getActiveVersion();
      if (!version) {
        this.logger.warn('Aucun plan de vente actif, coaching ignoré');
        return;
      }
      const recording = await this.prisma.recording.findUnique({
        where: { s3Key: input.s3Key },
        select: { id: true, commercialId: true, managerId: true },
      });
      if (!recording) {
        this.logger.warn(
          `Recording introuvable pour ${input.s3Key}, coaching ignoré`,
        );
        return;
      }

      const existing = await this.prisma.coachingAnalysis.findUnique({
        where: {
          source_tenantId_s3KeyOriginal_salesPlanVersionId: {
            source: CRM_SOURCE,
            tenantId: CRM_TENANT,
            s3KeyOriginal: input.s3Key,
            salesPlanVersionId: version.id,
          },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        this.logger.debug(
          `Analyse déjà existante (${existing.status}) pour ${input.s3Key}, skip`,
        );
        return;
      }

      const created = await this.createLocal({
        s3KeyOriginal: input.s3Key,
        recordingId: recording.id,
        porteId: input.porteId ?? null,
        userId: recording.commercialId,
        managerId: recording.managerId,
        statutPorte: this.asStatut(input.statut),
        salesPlanVersionId: version.id,
        manual: false,
      }, version, userToken);
      this.logger.debug(`Coaching enfilé (#${created.id}) pour ${input.s3Key}`);
    } catch {
      this.logger.error(
        `enqueue coaching échoué pour ${input.s3Key}`,
      );
    }
  }

  /**
   * Lancement manuel sur un enregistrement DÉJÀ existant (test / backfill).
   * Porte/statut résolus best-effort depuis un éventuel segment legacy.
   */
  async launch(s3Key: string, userToken?: string): Promise<CoachingAnalysisDto> {
    const result = await this.scheduleManual(s3Key, userToken);
    return this.query.getAnalysis(result.id);
  }

  private async scheduleManual(s3Key: string, userToken?: string): Promise<{ id: number; scheduled: boolean }> {
    const recording = await this.prisma.recording.findUnique({
      where: { s3Key },
      select: { id: true, commercialId: true, managerId: true },
    });
    if (!recording) {
      throw new NotFoundException(`Enregistrement introuvable: ${s3Key}`);
    }
    const seg = await this.prisma.recordingSegment.findFirst({
      where: { s3KeyOriginal: s3Key },
      orderBy: { id: 'desc' },
      select: { porteId: true, statut: true },
    });

    const version = await this.salesPlans.getActiveVersion();
    if (!version) throw new NotFoundException('Aucun plan de vente actif');
    const existing = await this.prisma.coachingAnalysis.findUnique({ where: {
      source_tenantId_s3KeyOriginal_salesPlanVersionId: { source: CRM_SOURCE, tenantId: CRM_TENANT, s3KeyOriginal: s3Key, salesPlanVersionId: version.id },
    } });
    if (existing) return { id: existing.id, scheduled: await this.requeue(existing, version, userToken) };
    const analysis = await this.createLocal({
      s3KeyOriginal: s3Key,
      recordingId: recording.id,
      porteId: seg?.porteId ?? null,
      userId: recording.commercialId,
      managerId: recording.managerId,
      statutPorte: seg?.statut ?? null,
      salesPlanVersionId: version.id,
      manual: true,
    }, version, userToken);
    return analysis;
  }

  /** Lancement en lot, idempotent, sans gating de durée. */
  async launchMany(s3Keys: string[], userToken?: string): Promise<number> {
    const keys = [...new Set((s3Keys ?? []).filter(Boolean))];
    let n = 0;
    for (const key of keys) {
      try {
        const result = await this.scheduleManual(key, userToken);
        if (result.scheduled) n++;
      } catch {
        this.logger.warn(`launchMany: ${key} ignoré (programmation échouée)`);
      }
    }
    this.logger.log(`launchMany : ${n}/${keys.length} calculs réellement programmés ; les analyses en cours sont dédupliquées`);
    return n;
  }

  /** SQL brut EXPRÈS : le favori ne doit pas bumper `Porte.updatedAt`. */
  async setCoachingFavori(porteId: number, favori: boolean): Promise<boolean> {
    await this.prisma.$executeRaw`
      UPDATE "Porte" SET "coachingFavori" = ${favori} WHERE "id" = ${porteId}
    `;
    return favori;
  }

  /** État favori d'une porte (source de vérité DB). */
  async getCoachingFavori(porteId: number): Promise<boolean> {
    const porte = await this.prisma.porte.findUnique({
      where: { id: porteId },
      select: { coachingFavori: true },
    });
    return porte?.coachingFavori ?? false;
  }

  /** Relance manuelle d'une analyse existante (admin/directeur). */
  /**
   * Rejoue l'audio sur le plan ACTIF sans toucher la ligne d'origine, qui reste
   * l'historique de ce qu'a valu cet échange sur son propre référentiel.
   */
  async relaunch(id: number, userToken?: string, retranscribe = false): Promise<CoachingAnalysisDto> {
    const analysis = await this.prisma.coachingAnalysis.findUnique({
      where: { id },
    });
    if (!analysis || analysis.source !== CRM_SOURCE || analysis.tenantId !== CRM_TENANT) throw new NotFoundException('Analyse coaching introuvable');

    const version = await this.salesPlans.getActiveVersion();
    if (!version) throw new NotFoundException('Aucun plan de vente actif');

    // A score retry reuses checkpointed audio facts unless explicitly requested.

    // Déjà sur le plan actif : simple remise en file.
    if (analysis.salesPlanVersionId === version.id) {
      await this.requeue(analysis, version, userToken, retranscribe);
      return this.query.getAnalysis(id);
    }

    const existing = await this.prisma.coachingAnalysis.findUnique({
      where: {
        source_tenantId_s3KeyOriginal_salesPlanVersionId: {
          source: CRM_SOURCE, tenantId: CRM_TENANT,
          s3KeyOriginal: analysis.s3KeyOriginal, salesPlanVersionId: version.id,
        },
      },
    });
    if (existing) {
      await this.requeue(existing, version, userToken, retranscribe);
      return this.query.getAnalysis(existing.id);
    }
    const created = await this.createLocal({
      recordingId: analysis.recordingId, porteId: analysis.porteId,
      userId: analysis.userId, managerId: analysis.managerId,
      s3KeyOriginal: analysis.s3KeyOriginal, statutPorte: analysis.statutPorte,
      salesPlanVersionId: version.id, manual: true,
      ...(!retranscribe ? { transcript: analysis.transcript, transcriptDurationSec: analysis.transcriptDurationSec } : {}),
      ...(!retranscribe && analysis.transcriptMetadata != null ? { transcriptMetadata: analysis.transcriptMetadata as Prisma.InputJsonValue } : {}),
      ...(!retranscribe ? { transcriptionStartedAt: analysis.transcriptionStartedAt, transcriptionCompletedAt: analysis.transcriptionCompletedAt } : {}),
    }, version, userToken);
    this.logger.log(`Analyse ${id} programmée sur le plan actif v${version.version} → analyse locale ${created.id}`);
    return this.query.getAnalysis(created.id);
  }

  private requeueData(retranscribe = false) {
    return {
      status: CoachingStatus.PENDING,
      error: null,
      attempts: 0,
      nextRetryAt: null,
      ...(retranscribe ? { transcript: null, transcriptDurationSec: null, transcriptMetadata: Prisma.DbNull } : {}),
      transcriptionAttempts: 0, evaluationAttempts: 0, stageStartedAt: null,
      ...(retranscribe ? { transcriptionStartedAt: null, transcriptionCompletedAt: null } : {}),
      evaluationStartedAt: null, evaluationCompletedAt: null,
      quality: null,
      score: null,
      confidence: null,
      summary: null,
      scoreBeforeMalus: null,
      malus: null,
      strengths: Prisma.DbNull,
      improvements: Prisma.DbNull,
      recommendations: Prisma.DbNull,
      subScores: Prisma.DbNull,
      criterionResults: Prisma.DbNull,
      violations: Prisma.DbNull,
      detectedProducts: Prisma.DbNull,
      productMapping: Prisma.DbNull,
      productSheetVersions: Prisma.DbNull,
      remoteResultSnapshot: Prisma.DbNull,
      // References are replaced atomically with the new generation below.
      remoteAnalysisId: null,
      // Relance explicite : gating levé et transcript recalculé.
      manual: true,
      remoteManaged: true,
      remoteRelaunch: false,
      remoteRequestKey: randomUUID(),
      remoteNextSyncAt: null,
      remoteSyncAttempts: 0,
      remoteSyncError: null,
      remoteLeaseToken: null,
      remoteLeaseUntil: null,
    };

  }

  private async requeue(analysis: { id: number; status: CoachingStatus; updatedAt: Date; remoteRequestKey: string | null; remoteManaged: boolean }, version: SalesPlanVersion, userToken?: string, retranscribe = false): Promise<boolean> {
    if (analysis.remoteManaged && analysis.status !== CoachingStatus.READY && analysis.status !== CoachingStatus.FAILED) return false;
    const references = await this.input.references(version, userToken);
    const updated = await this.prisma.coachingAnalysis.updateMany({
      where: { id: analysis.id, source: CRM_SOURCE, tenantId: CRM_TENANT,
        ...(analysis.remoteManaged ? { status: { in: [CoachingStatus.READY, CoachingStatus.FAILED] } } : { remoteManaged: false }),
        updatedAt: analysis.updatedAt, remoteRequestKey: analysis.remoteRequestKey },
      data: { ...this.requeueData(retranscribe), remotePlanSnapshot: this.referenceJson(references) },
    });
    return updated.count === 1;
  }

  private asStatut(value?: string | null): StatutPorte | null {
    if (!value) return null;
    return (StatutPorte as Record<string, StatutPorte>)[value] ?? null;
  }

  private async createLocal(data: {
    s3KeyOriginal: string;
    salesPlanVersionId: number;
    recordingId: number | null;
    porteId: number | null;
    userId: number | null;
    managerId: number | null;
    statutPorte: StatutPorte | null;
    manual: boolean;
    transcript?: string | null;
    transcriptDurationSec?: number | null;
    transcriptMetadata?: Prisma.InputJsonValue;
    transcriptionStartedAt?: Date | null;
    transcriptionCompletedAt?: Date | null;
  }, version: SalesPlanVersion, userToken?: string) {
    const references = await this.input.references(version, userToken);
    const where = {
      source_tenantId_s3KeyOriginal_salesPlanVersionId: {
        source: CRM_SOURCE,
        tenantId: CRM_TENANT,
        s3KeyOriginal: data.s3KeyOriginal,
        salesPlanVersionId: data.salesPlanVersionId,
      },
    };
    const requestKey = randomUUID();
    const row = await this.prisma.coachingAnalysis.upsert({
      where,
      create: {
        ...data,
        remotePlanSnapshot: this.referenceJson(references),
        source: CRM_SOURCE,
        tenantId: CRM_TENANT,
        remoteManaged: true,
        remoteRequestKey: requestKey,
        status: CoachingStatus.PENDING,
      },
      update: {},
      select: { id: true, remoteRequestKey: true },
    }).catch(error => {
      // Prisma may emulate upsert when it cannot use a native ON CONFLICT.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.coachingAnalysis.findUniqueOrThrow({ where, select: { id: true, remoteRequestKey: true } });
      }
      throw error;
    });
    return { id: row.id, scheduled: row.remoteRequestKey === requestKey };
  }

  private referenceJson(references: Awaited<ReturnType<CoachingInputService['references']>>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(references)) as Prisma.InputJsonValue;
  }
}
