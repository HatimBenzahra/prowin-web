import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CoachingStatus, StatutPorte } from '@prisma/client';
import { CRM_SOURCE, CRM_TENANT } from './shared/crm-scope';
import { PrismaService } from '../prisma.service';
import { SalesPlanService } from './referentiels/sales-plan.service';
import { LlmService } from './shared/llm.service';
import { CoachingConfigService } from './coaching-config.service';
import { CoachingQueryService } from './lecture/coaching-query.service';
import { CoachingApiClient } from './coaching-api.client';

/** Toutes les analyses créées par ce CRM portent cette source. */
const PROWIN = 'prowin';
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
    private readonly llm: LlmService,
    private readonly config: CoachingConfigService,
    private readonly query: CoachingQueryService,
    private readonly api: CoachingApiClient,
  ) {}

  /**
   * Déclenché automatiquement à l'upload d'un enregistrement (fire-and-forget).
   * Idempotent : une seule analyse par (audio × version de plan).
   */
  async enqueue(input: EnqueueCoachingInput): Promise<void> {
    try {
      if (!this.llm.isConfigured()) {
        this.logger.warn('vLLM non configuré, coaching ignoré');
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

      const created = await this.api.createAnalysis({
        s3Key: input.s3Key,
        porteId: input.porteId ?? null,
        userId: recording.commercialId,
        managerId: recording.managerId,
        statutPorte: this.asStatut(input.statut),
      });
      this.logger.debug(`Coaching enfilé (#${created.id}) pour ${input.s3Key}`);
    } catch (error) {
      this.logger.error(
        `enqueue coaching échoué pour ${input.s3Key}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Lancement manuel sur un enregistrement DÉJÀ existant (test / backfill).
   * Porte/statut résolus best-effort depuis un éventuel segment legacy.
   */
  async launch(s3Key: string): Promise<CoachingAnalysisDto> {
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

    const analysis = await this.api.createAnalysis({
      s3Key,
      porteId: seg?.porteId ?? null,
      userId: recording.commercialId,
      managerId: recording.managerId,
      statutPorte: seg?.statut ?? null,
    });

    // Le job est en PENDING chez le service, qui le traitera.
    return this.query.getAnalysis(analysis.id);
  }

  /** Lancement en lot, idempotent, sans gating de durée. */
  async launchMany(s3Keys: string[]): Promise<number> {
    const keys = [...new Set((s3Keys ?? []).filter(Boolean))];
    let n = 0;
    for (const key of keys) {
      try {
        await this.launch(key);
        n++;
      } catch (e) {
        this.logger.warn(`launchMany: ${key} ignoré (${(e as Error).message})`);
      }
    }
    this.logger.log(`launchMany : ${n}/${keys.length} audios enfilés (manuel)`);
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
  async relaunch(id: number): Promise<CoachingAnalysisDto> {
    const analysis = await this.prisma.coachingAnalysis.findUnique({
      where: { id },
    });
    if (!analysis) throw new NotFoundException('Analyse coaching introuvable');

    const version = await this.salesPlans.getActiveVersion();
    if (!version) throw new NotFoundException('Aucun plan de vente actif');

    const requeue = {
      status: CoachingStatus.PENDING,
      error: null,
      attempts: 0,
      nextRetryAt: null,
      // Relance explicite : seul le gating de durée est levé.
      manual: true,
    };

    // Déjà sur le plan actif : simple remise en file.
    if (analysis.salesPlanVersionId === version.id) {
      await this.prisma.coachingAnalysis.update({ where: { id }, data: requeue });
      return this.query.getAnalysis(id);
    }

    const existing = await this.prisma.coachingAnalysis.findUnique({
      where: {
        source_tenantId_s3KeyOriginal_salesPlanVersionId: {
          source: CRM_SOURCE,
          tenantId: CRM_TENANT,
          s3KeyOriginal: analysis.s3KeyOriginal,
          salesPlanVersionId: version.id,
        },
      },
      select: { id: true, transcript: true },
    });

    if (existing) {
      await this.prisma.coachingAnalysis.update({
        where: { id: existing.id },
        data: {
          ...requeue,
          // Le transcript de la cible fait foi : il vient de son propre profil STT.
          ...(existing.transcript?.trim()
            ? {}
            : {
                transcript: analysis.transcript,
                transcriptDurationSec: analysis.transcriptDurationSec,
              }),
        },
      });
      return this.query.getAnalysis(existing.id);
    }

    const created = await this.prisma.coachingAnalysis.create({
      data: {
        recordingId: analysis.recordingId,
        porteId: analysis.porteId,
        userId: analysis.userId,
        managerId: analysis.managerId,
        s3KeyOriginal: analysis.s3KeyOriginal,
        statutPorte: analysis.statutPorte,
        salesPlanVersionId: version.id,
        transcript: analysis.transcript,
        transcriptDurationSec: analysis.transcriptDurationSec,
        ...requeue,
      },
      select: { id: true },
    });
    this.logger.log(
      `Analyse ${id} relancée sur le plan actif v${version.version} → nouvelle analyse ${created.id}`,
    );
    return this.query.getAnalysis(created.id);
  }

  private asStatut(value?: string | null): StatutPorte | null {
    if (!value) return null;
    return (StatutPorte as Record<string, StatutPorte>)[value] ?? null;
  }
}
