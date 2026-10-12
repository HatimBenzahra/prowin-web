import axios from 'axios';
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CRM_SOURCE, CRM_TENANT } from '../shared/crm-scope';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CoachingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { LlmService } from '../shared/llm.service';
import { SnapshotBuilderService } from './snapshot-builder.service';
import { CoachingSynthesisDto } from '../coaching.dto';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  parseSynthesisOutput,
} from './synthesis-prompt';

type SubjectType = 'commercial' | 'manager';

@Injectable()
export class SynthesisService {
  private readonly logger = new Logger(SynthesisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly snapshotBuilder: SnapshotBuilderService,
  ) {}

  /** Un manager = ses commerciaux ; miroir de SnapshotBuilderService.resolveScope. */
  private async analysisScopeWhere(
    subjectType: SubjectType,
    subjectId: number,
  ): Promise<{ userId: number | { in: number[] } }> {
    if (subjectType === 'commercial') return { userId: subjectId };
    const team = await this.prisma.commercial.findMany({
      where: { managerId: subjectId },
      select: { id: true },
    });
    return { userId: { in: team.map((c) => c.id) } };
  }

  // --- Lecture ---

  async getSynthesis(
    subjectType: SubjectType,
    subjectId: number,
  ): Promise<CoachingSynthesisDto | null> {
    const row = await this.prisma.coachingSynthesis.findUnique({
      where: { subjectKey: `${subjectType}:${subjectId}` },
    });
    if (!row) return null;
    // Période recalculée à chaque affichage, jamais figée.
    const scopeWhere = await this.analysisScopeWhere(subjectType, subjectId);
    const period = await this.prisma.recording.aggregate({
      where: {
        coachingAnalyses: { some: { ...scopeWhere, status: CoachingStatus.READY } },
      },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    return this.toDto(row, {
      periodStart: period._min.createdAt?.toISOString() ?? null,
      periodEnd: period._max.createdAt?.toISOString() ?? null,
    });
  }

  // --- Génération manuelle : non bloquante, l'UI poll ---

  /** Passe la synthèse en ANALYZING et lance la génération en fond. */
  async requestGenerate(
    subjectType: SubjectType,
    subjectId: number,
  ): Promise<CoachingSynthesisDto> {
    if (!this.llm.isConfigured()) {
      throw new BadRequestException('vLLM non configuré');
    }
    const subjectKey = `${subjectType}:${subjectId}`;
    const row = await this.prisma.coachingSynthesis.upsert({
      where: { subjectKey },
      create: {
        subjectKey,
        subjectType,
        commercialId: subjectType === 'commercial' ? subjectId : null,
        managerId: subjectType === 'manager' ? subjectId : null,
        status: CoachingStatus.ANALYZING,
      },
      update: { status: CoachingStatus.ANALYZING, error: null },
    });
    void this.runGenerate(subjectType, subjectId);
    return this.toDto(row);
  }

  /** Pipeline de génération : snapshot → LLM → stockage. */
  async runGenerate(subjectType: SubjectType, subjectId: number): Promise<void> {
    const subjectKey = `${subjectType}:${subjectId}`;
    try {
      const snapshot = await this.snapshotBuilder.buildSnapshot(
        subjectType,
        subjectId,
      );
      const raw = await this.llm.chatJson(
        buildSynthesisSystemPrompt(),
        buildSynthesisUserPrompt(snapshot),
      );
      const out = parseSynthesisOutput(raw);
      await this.prisma.coachingSynthesis.update({
        where: { subjectKey },
        data: {
          status: CoachingStatus.READY,
          sections: out as unknown as object, // { bilan, performanceTerrain, contrats, forces, axes, planAction }
          // Tendance & score = source de vérité backend (le LLM ne fait que rédiger).
          trend: snapshot.tendance.direction,
          scoreMoyen: snapshot.coaching.scoreMoyen,
          nbAnalyses: snapshot.coaching.nbAnalyses,
          stats: snapshot as unknown as object,
          error: null,
          generatedAt: new Date(),
        },
      });
      this.logger.log(`Synthèse ${subjectKey} générée (${snapshot.coaching.nbAnalyses} analyses)`);
    } catch (e) {
      const error = describeFailure(e);
      this.logger.error(`Synthèse ${subjectKey} échouée: ${error}`);
      await this.prisma.coachingSynthesis
        .update({
          where: { subjectKey },
          data: { status: CoachingStatus.FAILED, error },
        })
        .catch(() => undefined);
    }
  }

  // --- Cron : tick régulier qui lit la planif en base ---

  /** Tick de 10 min qui lit la planif en base, plutôt que de reprogrammer le scheduler. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async synthesisTick(): Promise<void> {
    if (!this.llm.isConfigured()) return;
    const cfg = await this.prisma.coachingConfig.findUnique({ where: { id: 1 } });
    if (!cfg || (cfg.synthesisCronFrequency ?? 'daily') === 'off') return;

    const now = new Date();
    const scheduled = mostRecentScheduled(
      cfg.synthesisCronFrequency ?? 'daily',
      cfg.synthesisCronHour ?? 3,
      cfg.synthesisCronMinute ?? 0,
      cfg.synthesisCronWeekday ?? 1,
      now,
    );
    if (!scheduled) return;

    // Claim AVANT de lancer : sinon un tick plus long que 10 min se dédouble.
    const claim = await this.prisma.coachingConfig.updateMany({
      where: {
        id: 1,
        OR: [
          { synthesisCronLastRunAt: null },
          { synthesisCronLastRunAt: { lt: scheduled } },
        ],
      },
      data: { synthesisCronLastRunAt: new Date() },
    });
    if (claim.count !== 1) return; // créneau déjà pris

    this.logger.log(
      `Cron synthèse déclenché (créneau ${scheduled.toISOString()})`,
    );
    await this.regenerateAllActive();
  }

  /** Met à jour la planif du cron de synthèse (Réglages). */
  async setCron(input: {
    frequency: string;
    hour: number;
    minute: number;
    weekday: number;
  }): Promise<void> {
    const frequency = ['daily', 'weekly', 'off'].includes(input.frequency)
      ? input.frequency
      : 'daily';
    const hour = Math.max(0, Math.min(23, Math.round(input.hour ?? 3)));
    const minute = Math.max(0, Math.min(59, Math.round(input.minute ?? 0)));
    const weekday = Math.max(0, Math.min(6, Math.round(input.weekday ?? 1)));
    await this.prisma.coachingConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        coachableStatuts: [],
        synthesisCronFrequency: frequency,
        synthesisCronHour: hour,
        synthesisCronMinute: minute,
        synthesisCronWeekday: weekday,
      },
      update: {
        synthesisCronFrequency: frequency,
        synthesisCronHour: hour,
        synthesisCronMinute: minute,
        synthesisCronWeekday: weekday,
      },
    });
  }

  /** Régénère les synthèses des sujets actifs ayant de nouvelles analyses. */
  async regenerateAllActive(): Promise<number> {
    const subjects = await this.activeSubjectsWithAnalyses();
    let n = 0;
    for (const s of subjects) {
      const needed = await this.needsRegeneration(s.type, s.id);
      if (!needed) continue;
      await this.runGenerate(s.type, s.id); // séquentiel (nuit)
      n++;
    }
    this.logger.log(`Cron synthèses : ${n}/${subjects.length} régénérées`);
    return n;
  }

  private async activeSubjectsWithAnalyses(): Promise<
    { type: SubjectType; id: number }[]
  > {
    // Commerciaux ayant des analyses READY + managers ayant des analyses perso.
    const [comm, mgrPerso] = await Promise.all([
      this.prisma.coachingAnalysis.findMany({
        where: { source: CRM_SOURCE, tenantId: CRM_TENANT, status: CoachingStatus.READY, userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.coachingAnalysis.findMany({
        where: { source: CRM_SOURCE, tenantId: CRM_TENANT, status: CoachingStatus.READY, managerId: { not: null } },
        distinct: ['managerId'],
        select: { managerId: true },
      }),
    ]);
    const commIds = comm.map((c) => c.userId!).filter((x) => x != null);
    const mgrPersoIds = mgrPerso.map((m) => m.managerId!).filter((x) => x != null);

    // Un manager n'a quasi jamais d'analyse à son nom : on le trouve par son équipe.
    const commRows = commIds.length
      ? await this.prisma.commercial.findMany({
          where: { id: { in: commIds } },
          select: { id: true, managerId: true },
        })
      : [];
    const mgrFromTeam = [
      ...new Set(
        commRows.map((c) => c.managerId).filter((x): x is number => x != null),
      ),
    ];
    const allMgrIds = [...new Set([...mgrPersoIds, ...mgrFromTeam])];

    const [activeComm, activeMgr] = await Promise.all([
      commIds.length
        ? this.prisma.commercial.findMany({
            where: { id: { in: commIds }, status: 'ACTIF' },
            select: { id: true },
          })
        : Promise.resolve([]),
      allMgrIds.length
        ? this.prisma.manager.findMany({
            where: { id: { in: allMgrIds }, status: 'ACTIF' },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    return [
      ...activeComm.map((c) => ({ type: 'commercial' as const, id: c.id })),
      ...activeMgr.map((m) => ({ type: 'manager' as const, id: m.id })),
    ];
  }

  /** True si aucune synthèse READY, ou si de nouvelles analyses depuis generatedAt. */
  private async needsRegeneration(
    subjectType: SubjectType,
    subjectId: number,
  ): Promise<boolean> {
    const existing = await this.prisma.coachingSynthesis.findUnique({
      where: { subjectKey: `${subjectType}:${subjectId}` },
      select: { status: true, generatedAt: true },
    });
    if (!existing || existing.status !== CoachingStatus.READY || !existing.generatedAt) {
      return true;
    }
    const scopeWhere = await this.analysisScopeWhere(subjectType, subjectId);
    const last = await this.prisma.coachingAnalysis.findFirst({
      where: { ...scopeWhere, source: CRM_SOURCE, tenantId: CRM_TENANT, status: CoachingStatus.READY },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return !!last && last.createdAt > existing.generatedAt;
  }

  private toDto(
    row: any,
    period?: { periodStart: string | null; periodEnd: string | null },
  ): CoachingSynthesisDto {
    const s = (row.sections as Record<string, string[]>) ?? {};
    const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
    return {
      subjectType: row.subjectType,
      subjectId: row.commercialId ?? row.managerId ?? null,
      status: row.status,
      analyse: arr(s.analyse),
      strengths: arr(s.strengths),
      improvements: arr(s.improvements),
      priorities: arr(s.priorities),
      trend: row.trend ?? null,
      scoreMoyen: row.scoreMoyen ?? null,
      nbAnalyses: row.nbAnalyses ?? 0,
      periodStart: period?.periodStart ?? null,
      periodEnd: period?.periodEnd ?? null,
      error: row.error ?? null,
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    };
  }
}

// --- Helpers ---------------------------------------------------------------

/** Dernière échéance planifiée avant maintenant, ou null si la planif est coupée. */
export function mostRecentScheduled(
  frequency: string,
  hour: number,
  minute: number,
  weekday: number,
  now: Date,
): Date | null {
  if (frequency === 'off') return null;
  const cand = new Date(now);
  cand.setHours(hour, minute, 0, 0);
  if (frequency === 'weekly') {
    const diff = (cand.getDay() - weekday + 7) % 7; // jours depuis le dernier jour cible
    cand.setDate(cand.getDate() - diff);
    if (cand > now) cand.setDate(cand.getDate() - 7);
    return cand;
  }
  // daily (défaut)
  if (cand > now) cand.setDate(cand.getDate() - 1);
  return cand;
}

const WEEKDAYS_FR = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
];

/** Libellé lisible de la planif (ex. « Chaque jour à 03:00 », « Chaque lundi à 09:30 »). */
export function synthesisScheduleLabel(
  frequency: string,
  hour: number,
  minute: number,
  weekday: number,
): string {
  if (frequency === 'off') return 'Désactivé';
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (frequency === 'weekly') {
    return `Chaque ${WEEKDAYS_FR[weekday] ?? 'jour'} à ${hhmm}`;
  }
  return `Chaque jour à ${hhmm}`;
}

/** Ce que l'écran affiche d'un échec : une cause compréhensible, pas un statut HTTP. */
export function describeFailure(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 400) return 'Le modèle a refusé la demande (contenu trop volumineux ou invalide).';
    if (error.response) return `Le modèle a répondu une erreur (${error.response.status}).`;
    return 'Le modèle est injoignable ou n\'a pas répondu à temps.';
  }
  return (error as Error).message;
}
