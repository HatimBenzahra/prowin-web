import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CoachingQuality,
  CoachingStatus,
  Prisma,
  StatutPorte,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { ReferenceService } from '../referentiels/reference.service';
import { CoachingConfigService } from '../coaching-config.service';
import {
  CoachingAnalysesFilter,
  CoachingAnalysisDto,
  CoachingQueueItemDto,
  CoachingManagementFilter,
  CoachingManagementItemDto,
  CoachingScoreboardDto,
  CoachingScoreboardRowDto,
  CoachingStepAverageDto,
  CoachingViolationDto,
  CoachingProductStatsDto,
  CoachingJournalAnalysisDto,
  CoachingJournalFilter,
  CoachingJournalPageDto,
  CoachingJournalRowDto,
} from '../coaching.dto';
import { CriterionScore, StepScore } from '../shared/coaching.types';
import { CRM_SOURCE, CRM_TENANT } from '../shared/crm-scope';
import { isScorable, OBJECTIVE_BY_NIVEAU, PROPOSED_STATUSES, ProductStatus, SALE_RESULTS, SCORABLE } from '../shared/visit-outcome';

// Filtre par tranche de durée (secondes) pour la liste de gestion.
function matchDurationTier(sec: number, tier: string): boolean {
  const d = sec ?? 0;
  if (tier === 'lt1') return d < 60;
  if (tier === '1to3') return d >= 60 && d < 180;
  if (tier === 'gt3') return d >= 180;
  return true; // tier inconnu → pas de filtrage
}

const JOURNAL_WINDOW_MS = 14 * 24 * 3600 * 1000;
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Jour calendaire (YYYY-MM-DD) à Paris : un audio de 00h30 appartient au jour qui commence. */
export const parisDay = (d: Date) => PARIS_DAY.format(d);

/** Adresse comparable : sans casse, accents, ponctuation ni espaces superflus. */
export const normalizeAddress = (adresse: string) =>
  adresse
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Bande d'une analyse prête ; calculée depuis le score pour les analyses antérieures
 * au recalibrage. Inexploitable, ou ancienne analyse notée 0 sur un échange trop
 * court : non évaluable, comme dans l'écran.
 */
function journalBand(a: CoachingJournalAnalysisDto): string | null {
  if (a.status !== CoachingStatus.READY) return null;
  if (a.quality === CoachingQuality.INEXPLOITABLE) return 'non_evaluable';
  if (a.band) return a.band;
  if (a.score === 0 && a.quality === CoachingQuality.LOW_CONFIDENCE)
    return 'non_evaluable';
  if (a.score == null) return 'non_evaluable';
  if (a.score >= 85) return 'maitrise';
  if (a.score >= 75) return 'correct';
  if (a.score >= 60) return 'coaching';
  return 'insuffisant';
}

/** Filtres du journal portant sur la ligne construite (porte principale, analyse). */
function matchesJournalFilter(
  r: CoachingJournalRowDto,
  f: CoachingJournalFilter,
): boolean {
  const a = r.analysis ?? null;
  // Archivés masqués par défaut ; « only » ne montre qu'eux.
  if (r.archived !== (f.archived === 'only')) return false;
  if (f.favorisOnly && !r.favori) return false;
  if (f.nonAnalysesOnly && a) return false;
  if (f.immeubleIds?.length && !f.immeubleIds.includes(r.immeubleId))
    return false;
  const q = normalizeAddress(f.search ?? '');
  if (q && !normalizeAddress(r.adresse).includes(q)) return false;
  if (f.statutPorte?.length && !f.statutPorte.includes(r.statutPorte ?? ''))
    return false;
  if (
    f.visitResult?.length &&
    !(a?.visitResult && f.visitResult.includes(a.visitResult))
  )
    return false;
  if (f.band?.length) {
    const band = a ? journalBand(a) : null;
    if (!band || !f.band.includes(band)) return false;
  }
  if (f.productKey) {
    const statuses = f.productAcceptedOnly ? ['ACCEPTE'] : PROPOSED_STATUSES;
    if (
      !a?.productStatuses.some(
        (p) => p.key === f.productKey && statuses.includes(p.status),
      )
    )
      return false;
  }
  return true;
}

/**
 * Lectures du coaching (pipeline A) pour l'UI de gestion : stats, file,
 * analyses, liste de gestion, sujets coachables. DB-only, aucun effet de bord.
 */
@Injectable()
export class CoachingQueryService {
  /** Les écrans de ProWin ne montrent QUE les analyses de ProWin. */
  private readonly CRM_SOURCE = CRM_SOURCE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly config: CoachingConfigService,
  ) {}

  /** État de la file + KPIs pour le dashboard de gestion. */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    ready: number;
    failed: number;
    inexploitable: number;
    total: number;
    avgScore: number | null;
  }> {
    const grouped = await this.prisma.coachingAnalysis.groupBy({
      by: ['status'],
      where: { source: this.CRM_SOURCE, tenantId: CRM_TENANT },
      _count: { _all: true },
    });
    const c: Record<string, number> = {};
    for (const g of grouped) c[g.status] = g._count._all;
    const pending = c[CoachingStatus.PENDING] ?? 0;
    const processing =
      (c[CoachingStatus.TRANSCRIBING] ?? 0) +
      (c[CoachingStatus.MAPPING] ?? 0) +
      (c[CoachingStatus.ANALYZING] ?? 0) +
      // CONFORMITY n'est plus écrit, mais reste porté par les analyses antérieures.
      (c[CoachingStatus.CONFORMITY] ?? 0);
    const ready = c[CoachingStatus.READY] ?? 0;
    const failed = c[CoachingStatus.FAILED] ?? 0;
    const total = pending + processing + ready + failed;

    const inexploitable = await this.prisma.coachingAnalysis.count({
      where: { source: this.CRM_SOURCE, tenantId: CRM_TENANT, quality: CoachingQuality.INEXPLOITABLE },
    });
    const agg = await this.prisma.coachingAnalysis.aggregate({
      _avg: { score: true },
      where: { source: this.CRM_SOURCE, tenantId: CRM_TENANT, score: { not: null }, ...SCORABLE },
    });
    const avgScore =
      agg._avg.score != null ? Math.round(agg._avg.score * 10) / 10 : null;

    return {
      pending,
      processing,
      ready,
      failed,
      inexploitable,
      total,
      avgScore,
    };
  }

  /** Par défaut, ProWin : sans ce défaut, une analyse d'une autre app serait lisible. */
  async getAnalysis(
    id: number,
    source: string = this.CRM_SOURCE,
  ): Promise<CoachingAnalysisDto> {
    const row = await this.prisma.coachingAnalysis.findUnique({
      where: { id },
      include: {
        salesPlanVersion: { select: { slug: true, version: true } },
        reference: { select: { planSlug: true, version: true } },
        porte: { select: { coachingFavori: true } },
      },
    });
    // Un appelant ne voit que SES analyses : sans ce filtre, une app tierce
    // lirait les échanges d'une autre.
    if (!row || row.source !== source || row.tenantId !== CRM_TENANT) {
      throw new NotFoundException('Analyse coaching introuvable');
    }
    return (await this.withObjectives([this.toDto(row)]))[0];
  }

  async listAnalyses(
    filter: CoachingAnalysesFilter,
  ): Promise<{ items: CoachingAnalysisDto[]; total: number }> {
    const where = {
      source: this.CRM_SOURCE,
      tenantId: CRM_TENANT,
      ...(filter.userId != null
        ? { userId: filter.userId }
        : {}),
      ...(filter.managerId != null ? { managerId: filter.managerId } : {}),
      ...(filter.porteId != null ? { porteId: filter.porteId } : {}),
      ...(filter.status
        ? { status: filter.status as CoachingStatus }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.coachingAnalysis.findMany({
        where,
        include: {
          salesPlanVersion: { select: { slug: true, version: true } },
          reference: { select: { planSlug: true, version: true } },
          porte: { select: { coachingFavori: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: filter.skip ?? 0,
        take: Math.min(filter.take ?? 20, 100),
      }),
      this.prisma.coachingAnalysis.count({ where }),
    ]);
    const items = await this.withObjectives(rows.map((r) => this.toDto(r)));
    const subjects = await this.resolveSubjects(rows);
    for (const it of items) {
      const s = subjects.get(it.id);
      it.subjectName = s?.name ?? null;
      it.subjectRole = s?.role ?? null;
      it.subjectId = s?.id ?? null;
    }
    return { items, total };
  }

  /** Analyses existantes (référentiel actif) pour un lot de clés S3 — évite le N+1 côté UI. */
  async byS3Keys(s3Keys: string[]): Promise<CoachingAnalysisDto[]> {
    if (!s3Keys?.length) return [];
    const reference = await this.references.getActive();
    const rows = await this.prisma.coachingAnalysis.findMany({
      where: {
        source: this.CRM_SOURCE,
        tenantId: CRM_TENANT,
        s3KeyOriginal: { in: s3Keys },
        ...(reference ? { referenceId: reference.id } : {}),
      },
      include: {
        salesPlanVersion: { select: { slug: true, version: true } },
        reference: { select: { planSlug: true, version: true } },
        porte: { select: { coachingFavori: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.withObjectives(rows.map((r) => this.toDto(r)));
  }

  /** Objectif de score selon le niveau du commercial (une requête pour le lot). */
  private async withObjectives(items: CoachingAnalysisDto[]): Promise<CoachingAnalysisDto[]> {
    const ids = [...new Set(items.map((it) => it.userId).filter((x): x is number => x != null))];
    if (!ids.length) return items;
    const commercials = await this.prisma.commercial.findMany({ where: { id: { in: ids } }, select: { id: true, niveau: true } });
    const niveaux = new Map(commercials.map((c) => [c.id, c.niveau as string]));
    for (const it of items) {
      const niveau = it.userId != null ? niveaux.get(it.userId) : undefined;
      it.commercialNiveau = niveau ?? null;
      it.objectiveScore = niveau ? OBJECTIVE_BY_NIVEAU[niveau] ?? null : null;
    }
    return items;
  }

  /**
   * File des audios en attente ou en cours, le prochain d'abord.
   */
  async coachingQueue(): Promise<CoachingQueueItemDto[]> {
    const rows = await this.prisma.coachingAnalysis.findMany({
      where: {
        source: this.CRM_SOURCE,
        tenantId: CRM_TENANT,
        status: {
          in: [
            CoachingStatus.PENDING,
            CoachingStatus.TRANSCRIBING,
            CoachingStatus.MAPPING,
            CoachingStatus.ANALYZING,
            CoachingStatus.CONFORMITY,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        s3KeyOriginal: true,
        statutPorte: true,
        userId: true,
        managerId: true,
        transcriptDurationSec: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' }, // le prochain à passer en premier
    });
    if (!rows.length) return [];

    // Durée : agrégée depuis les segments (non stockée sur l'analyse avant transcription).
    const keys = [...new Set(rows.map((r) => r.s3KeyOriginal))];
    const durs = await this.prisma.recordingSegment.groupBy({
      by: ['s3KeyOriginal'],
      where: { s3KeyOriginal: { in: keys } },
      _max: { durationSec: true },
    });
    const durByKey = new Map<string, number | null>();
    for (const d of durs) durByKey.set(d.s3KeyOriginal, d._max.durationSec ?? null);

    const subjects = await this.resolveSubjects(rows);

    return rows.map((r) => {
      const s = subjects.get(r.id);
      return {
        id: r.id,
        status: r.status,
        s3KeyOriginal: r.s3KeyOriginal,
        subjectName: s?.name ?? null,
        subjectRole: s?.role ?? null,
        subjectId: s?.id ?? null,
        statutPorte: r.statutPorte ?? null,
        durationSec: r.transcriptDurationSec ?? durByKey.get(r.s3KeyOriginal) ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * Résout nom/rôle/id du sujet (commercial ou manager) pour un lot de lignes,
   * en 2 requêtes batch max (pas de N+1). Clé de la map = id de l'analyse.
   */
  private async resolveSubjects(
    rows: { id: number; userId: number | null; managerId: number | null }[],
  ): Promise<
    Map<number, { name: string; role: 'commercial' | 'manager'; id: number }>
  > {
    const userIds = [
      ...new Set(
        rows.map((r) => r.userId).filter((x): x is number => x != null),
      ),
    ];
    const managerIds = [
      ...new Set(
        rows.map((r) => r.managerId).filter((x): x is number => x != null),
      ),
    ];
    type NameRow = { id: number; nom: string; prenom: string };
    const [commercials, managers] = await Promise.all([
      userIds.length
        ? this.prisma.commercial.findMany({
            where: { id: { in: userIds } },
            select: { id: true, nom: true, prenom: true },
          })
        : Promise.resolve([] as NameRow[]),
      managerIds.length
        ? this.prisma.manager.findMany({
            where: { id: { in: managerIds } },
            select: { id: true, nom: true, prenom: true },
          })
        : Promise.resolve([] as NameRow[]),
    ]);
    const cMap = new Map<number, string>(
      commercials.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()]),
    );
    const mMap = new Map<number, string>(
      managers.map((m) => [m.id, `${m.prenom} ${m.nom}`.trim()]),
    );

    const out = new Map<
      number,
      { name: string; role: 'commercial' | 'manager'; id: number }
    >();
    for (const r of rows) {
      if (r.userId != null && cMap.has(r.userId)) {
        out.set(r.id, {
          name: cMap.get(r.userId)!,
          role: 'commercial',
          id: r.userId,
        });
      } else if (r.managerId != null && mMap.has(r.managerId)) {
        out.set(r.id, {
          name: mMap.get(r.managerId)!,
          role: 'manager',
          id: r.managerId,
        });
      }
    }
    return out;
  }

  /**
   * Interface de gestion : enregistrements coachables (statut porte coachable +
   * propriétaire ACTIF) avec l'état d'analyse et le favori. DB-only, paginé.
   */
  async coachingManagementList(
    filter: CoachingManagementFilter,
  ): Promise<{ items: CoachingManagementItemDto[]; total: number }> {
    const coachable = await this.config.getCoachableStatuts();
    const allowed = (
      filter.statut && coachable.includes(filter.statut)
        ? [filter.statut]
        : coachable
    ) as StatutPorte[];
    if (!allowed.length) return { items: [], total: 0 };

    const portes = await this.prisma.porte.findMany({
      where: { statut: { in: allowed }, recordingSegments: { some: {} } },
      select: {
        id: true,
        numero: true,
        etage: true,
        statut: true,
        coachingFavori: true,
        immeuble: { select: { adresse: true } },
        recordingSegments: {
          select: {
            s3KeyOriginal: true,
            durationSec: true,
            id: true,
            commercialId: true,
            managerId: true,
          },
        },
      },
    });

    // 1 entrée par clé S3 (1 audio = 1 porte).
    type Row = {
      s3Key: string;
      porteId: number;
      statutPorte: string;
      favori: boolean;
      adresse: string | null;
      porteNumero: string;
      porteEtage: number;
      durationSec: number;
      commercialId: number | null;
      managerId: number | null;
      maxId: number;
    };
    const byKey = new Map<string, Row>();
    for (const p of portes) {
      for (const seg of p.recordingSegments) {
        const prev = byKey.get(seg.s3KeyOriginal);
        if (!prev) {
          byKey.set(seg.s3KeyOriginal, {
            s3Key: seg.s3KeyOriginal,
            porteId: p.id,
            statutPorte: p.statut,
            favori: p.coachingFavori,
            adresse: p.immeuble?.adresse ?? null,
            porteNumero: p.numero,
            porteEtage: p.etage,
            durationSec: seg.durationSec ?? 0,
            commercialId: seg.commercialId,
            managerId: seg.managerId,
            maxId: seg.id,
          });
        } else {
          if ((seg.durationSec ?? 0) > prev.durationSec)
            prev.durationSec = seg.durationSec ?? 0;
          if (seg.id > prev.maxId) prev.maxId = seg.id;
          if (prev.commercialId == null && seg.commercialId != null)
            prev.commercialId = seg.commercialId;
          if (prev.managerId == null && seg.managerId != null)
            prev.managerId = seg.managerId;
        }
      }
    }

    // Propriétaire (nom + statut) — ne garder que les ACTIF.
    const rows = [...byKey.values()];
    type OwnerRow = { id: number; nom: string; prenom: string; status: UserStatus };
    const commercialIds = [
      ...new Set(rows.map((r) => r.commercialId).filter((x): x is number => x != null)),
    ];
    const managerIds = [
      ...new Set(rows.map((r) => r.managerId).filter((x): x is number => x != null)),
    ];
    const [commercials, managers] = await Promise.all([
      commercialIds.length
        ? this.prisma.commercial.findMany({
            where: { id: { in: commercialIds } },
            select: { id: true, nom: true, prenom: true, status: true },
          })
        : Promise.resolve([] as OwnerRow[]),
      managerIds.length
        ? this.prisma.manager.findMany({
            where: { id: { in: managerIds } },
            select: { id: true, nom: true, prenom: true, status: true },
          })
        : Promise.resolve([] as OwnerRow[]),
    ]);
    const cMap = new Map(commercials.map((c) => [c.id, c]));
    const mMap = new Map(managers.map((m) => [m.id, m]));

    const withOwner = rows
      .map((r) => {
        let name: string | null = null;
        let role: 'commercial' | 'manager' | null = null;
        let sid: number | null = null;
        let active = false;
        if (r.commercialId != null && cMap.has(r.commercialId)) {
          const c = cMap.get(r.commercialId)!;
          name = `${c.prenom} ${c.nom}`.trim();
          role = 'commercial';
          sid = r.commercialId;
          active = c.status === UserStatus.ACTIF;
        } else if (r.managerId != null && mMap.has(r.managerId)) {
          const m = mMap.get(r.managerId)!;
          name = `${m.prenom} ${m.nom}`.trim();
          role = 'manager';
          sid = r.managerId;
          active = m.status === UserStatus.ACTIF;
        }
        return { ...r, subjectName: name, subjectRole: role, subjectId: sid, active };
      })
      .filter((r) => r.active);

    // État d'analyse (référentiel actif) pour TOUS les candidats — requis pour le
    // filtre "non analysés uniquement" et pour l'indicateur, sans requête par page.
    const reference = await this.references.getActive();
    const analysisByKey = new Map<
      string,
      { id: number; status: string; quality: string | null; score: number | null; band: string | null }
    >();
    if (reference && withOwner.length) {
      const analyses = await this.prisma.coachingAnalysis.findMany({
        where: {
          source: this.CRM_SOURCE,
          tenantId: CRM_TENANT,
          s3KeyOriginal: { in: withOwner.map((r) => r.s3Key) },
          referenceId: reference.id,
        },
        select: { s3KeyOriginal: true, id: true, status: true, quality: true, score: true, band: true },
      });
      for (const a of analyses) {
        analysisByKey.set(a.s3KeyOriginal, {
          id: a.id,
          status: a.status,
          quality: a.quality,
          score: a.score,
          band: a.band,
        });
      }
    }

    // Filtres : favori, sujet, durée, non-analysés, recherche.
    let list = withOwner;
    if (filter.favorisOnly) list = list.filter((r) => r.favori);
    if (filter.subjectId != null)
      list = list.filter((r) => r.subjectId === filter.subjectId);
    if (filter.durationTier)
      list = list.filter((r) => matchDurationTier(r.durationSec, filter.durationTier!));
    if (filter.notAnalyzedOnly)
      list = list.filter((r) => !analysisByKey.has(r.s3Key)); // aucune analyse encore
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.subjectName ?? '').toLowerCase().includes(q) ||
          (r.adresse ?? '').toLowerCase().includes(q) ||
          (r.porteNumero ?? '').toLowerCase().includes(q),
      );
    }
    // Tri : favoris d'abord, puis récent.
    list.sort(
      (a, b) => Number(b.favori) - Number(a.favori) || b.maxId - a.maxId,
    );

    const total = list.length;
    const skip = filter.skip ?? 0;
    const take = Math.min(filter.take ?? 15, 100);
    const page = list.slice(skip, skip + take);

    const items = page.map((r) => {
      const a = analysisByKey.get(r.s3Key);
      return {
        s3Key: r.s3Key,
        porteId: r.porteId,
        subjectName: r.subjectName,
        subjectRole: r.subjectRole,
        subjectId: r.subjectId,
        statutPorte: r.statutPorte,
        durationSec: r.durationSec,
        adresse: r.adresse,
        porteNumero: r.porteNumero,
        porteEtage: r.porteEtage,
        favori: r.favori,
        analysisId: a?.id ?? null,
        analysisStatus: a?.status ?? null,
        quality: a?.quality ?? null,
        score: a?.score ?? null,
        band: a?.band ?? null,
      };
    });
    return { items, total };
  }

  /**
   * Journal des écoutes : un audio par ligne (1 audio = 1 porte, celle du premier
   * segment comme à l'enqueue), du plus récent au plus ancien, paginé par JOURS
   * ENTIERS. Les fenêtres de 14 jours reculent depuis le curseur jusqu'à voir un jour
   * de plus que demandé : les jours rendus sont alors complets, et `hasMore` exact.
   * Même périmètre que la liste de gestion (admin, directeur, sans restriction d'équipe).
   */
  async coachingJournal(
    filter: CoachingJournalFilter,
  ): Promise<CoachingJournalPageDto> {
    const wanted = Math.min(Math.max(filter.days ?? 5, 1), 31);
    const subjectWhere: Prisma.RecordingSegmentWhereInput = {
      ...(filter.commercialId != null
        ? { commercialId: filter.commercialId }
        : {}),
      ...(filter.managerId != null ? { managerId: filter.managerId } : {}),
    };
    const bounds = await this.prisma.recordingSegment.aggregate({
      where: {
        ...subjectWhere,
        createdAt: {
          ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
          ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          ...(filter.before ? { lt: filter.before } : {}),
        },
      },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    const floor = bounds._min.createdAt?.getTime();
    const ceiling = bounds._max.createdAt?.getTime();
    if (floor == null || ceiling == null)
      return { rows: [], days: [], hasMore: false, nextBefore: null };

    const reference = await this.references.getActive();
    const collected: CoachingJournalRowDto[] = [];
    const days = new Set<string>();
    // Un audio à cheval sur deux fenêtres n'est compté qu'une fois.
    const seen = new Set<string>();
    let windowEnd = ceiling + 1; // borne exclusive
    while (windowEnd > floor && days.size <= wanted) {
      const windowStart = Math.max(floor, windowEnd - JOURNAL_WINDOW_MS);
      const rows = await this.journalWindow(
        subjectWhere,
        new Date(windowStart),
        new Date(windowEnd),
        reference?.id ?? null,
      );
      for (const row of rows) {
        if (seen.has(row.s3Key)) continue;
        seen.add(row.s3Key);
        if (!matchesJournalFilter(row, filter)) continue;
        collected.push(row);
        days.add(row.day);
      }
      windowEnd = windowStart;
    }

    collected.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const kept = [...days].sort().reverse().slice(0, wanted);
    const keptSet = new Set(kept);
    const rows = collected.filter((r) => keptSet.has(r.day));
    const hasMore = days.size > wanted;
    return {
      rows,
      days: kept,
      hasMore,
      // Le plus ancien audio rendu : tout ce qui le précède appartient à un jour non rendu.
      nextBefore:
        hasMore && rows.length ? rows[rows.length - 1].createdAt : null,
    };
  }

  /** Lignes du journal d'une fenêtre [start, end[, en 6 requêtes batch (pas de N+1). */
  private async journalWindow(
    subjectWhere: Prisma.RecordingSegmentWhereInput,
    start: Date,
    end: Date,
    referenceId: number | null,
  ): Promise<CoachingJournalRowDto[]> {
    const segments = await this.prisma.recordingSegment.findMany({
      where: { ...subjectWhere, createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        s3KeyOriginal: true,
        commercialId: true,
        managerId: true,
        statut: true,
        durationSec: true,
        createdAt: true,
        porte: {
          select: {
            id: true,
            numero: true,
            etage: true,
            statut: true,
            coachingFavori: true,
            immeubleId: true,
            immeuble: { select: { adresse: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (!segments.length) return [];

    // Premier segment = porte principale ; les suivants ne complètent que durée et date.
    const byKey = new Map<
      string,
      {
        primary: (typeof segments)[number];
        durationSec: number;
        createdAt: Date;
      }
    >();
    for (const seg of segments) {
      const prev = byKey.get(seg.s3KeyOriginal);
      if (!prev) {
        byKey.set(seg.s3KeyOriginal, {
          primary: seg,
          durationSec: seg.durationSec ?? 0,
          createdAt: seg.createdAt,
        });
        continue;
      }
      if ((seg.durationSec ?? 0) > prev.durationSec)
        prev.durationSec = seg.durationSec ?? 0;
      if (seg.createdAt < prev.createdAt) prev.createdAt = seg.createdAt;
    }
    const keys = [...byKey.keys()];
    const entries = [...byKey.values()];
    const commercialIds = [
      ...new Set(
        entries
          .map((e) => e.primary.commercialId)
          .filter((x): x is number => x != null),
      ),
    ];
    const managerIds = [
      ...new Set(
        entries
          .map((e) => e.primary.managerId)
          .filter((x): x is number => x != null),
      ),
    ];
    type OwnerRow = {
      id: number;
      nom: string;
      prenom: string;
      status: UserStatus;
    };

    // Sans référentiel actif, aucune analyse : l'id -1 n'existe pas.
    const [recordings, analyses, commercials, managers, archives] = await Promise.all([
      this.prisma.recording.findMany({
        where: { s3Key: { in: keys } },
        select: { id: true, s3Key: true },
      }),
      this.prisma.coachingAnalysis.findMany({
        where: {
          source: this.CRM_SOURCE,
          tenantId: CRM_TENANT,
          s3KeyOriginal: { in: keys },
          referenceId: referenceId ?? -1,
        },
        select: {
          id: true,
          s3KeyOriginal: true,
          status: true,
          quality: true,
          score: true,
          band: true,
          executionScore: true,
          outcomeScore: true,
          visitResult: true,
          nonSaleReason: true,
          productStatuses: true,
          transcriptDurationSec: true,
        },
      }),
      commercialIds.length
        ? this.prisma.commercial.findMany({
            where: { id: { in: commercialIds } },
            select: { id: true, nom: true, prenom: true, status: true },
          })
        : Promise.resolve([] as OwnerRow[]),
      managerIds.length
        ? this.prisma.manager.findMany({
            where: { id: { in: managerIds } },
            select: { id: true, nom: true, prenom: true, status: true },
          })
        : Promise.resolve([] as OwnerRow[]),
      this.prisma.coachingArchive.findMany({
        where: { s3Key: { in: keys } },
        select: { s3Key: true, archivedAt: true },
      }),
    ]);
    const recordingByKey = new Map(recordings.map((r) => [r.s3Key, r.id]));
    const analysisByKey = new Map(analyses.map((a) => [a.s3KeyOriginal, a]));
    const cMap = new Map(commercials.map((c) => [c.id, c]));
    const mMap = new Map(managers.map((m) => [m.id, m]));
    const archivedAt = new Map(archives.map((x) => [x.s3Key, x.archivedAt]));

    const out: CoachingJournalRowDto[] = [];
    for (const [s3Key, { primary, durationSec, createdAt }] of byKey) {
      const owner =
        primary.commercialId != null && cMap.has(primary.commercialId)
          ? { ...cMap.get(primary.commercialId)!, role: 'commercial' }
          : primary.managerId != null && mMap.has(primary.managerId)
            ? { ...mMap.get(primary.managerId)!, role: 'manager' }
            : null;
      // Les utilisateurs de test ne polluent pas l'historique d'écoute.
      if (owner?.status === UserStatus.UTILISATEUR_TEST) continue;
      const a = analysisByKey.get(s3Key);
      const ready = a?.status === CoachingStatus.READY;
      out.push({
        s3Key,
        recordingId: recordingByKey.get(s3Key) ?? null,
        createdAt: createdAt.toISOString(),
        day: parisDay(createdAt),
        durationSec: a?.transcriptDurationSec ?? (durationSec || null),
        subjectId: owner?.id ?? null,
        subjectName: owner ? `${owner.prenom} ${owner.nom}`.trim() : null,
        subjectRole: owner?.role ?? null,
        porteId: primary.porte.id,
        porteNumero: primary.porte.numero,
        porteEtage: primary.porte.etage,
        // Statut au moment de l'échange ; celui de la porte sinon (segments anciens).
        statutPorte: primary.statut ?? primary.porte.statut,
        immeubleId: primary.porte.immeubleId,
        adresse: primary.porte.immeuble?.adresse ?? '',
        favori: primary.porte.coachingFavori,
        archived: archivedAt.has(s3Key),
        archivedAt: archivedAt.get(s3Key)?.toISOString() ?? null,
        analysis: a
          ? {
              id: a.id,
              status: a.status,
              quality: a.quality ?? null,
              // Comme le détail : aucun score avant la fin de l'analyse.
              score: ready ? (a.score ?? null) : null,
              band: a.band ?? null,
              executionScore: ready ? (a.executionScore ?? null) : null,
              outcomeScore: ready ? (a.outcomeScore ?? null) : null,
              visitResult: a.visitResult ?? null,
              nonSaleReason: a.nonSaleReason ?? null,
              productStatuses: (
                (a.productStatuses as unknown as ProductStatus[] | null) ?? []
              ).map((p) => ({
                key: p.key,
                status: p.status,
              })),
            }
          : null,
      });
    }
    return out;
  }

  /**
   * Sujets (commerciaux/managers actifs) ayant des enregistrements coachables —
   * pour le menu déroulant de filtre de la liste de gestion.
   */
  async coachableSubjects(): Promise<
    { subjectId: number; subjectName: string; subjectRole: string }[]
  > {
    const coachable = await this.config.getCoachableStatuts();
    if (!coachable.length) return [];
    const portes = await this.prisma.porte.findMany({
      where: { statut: { in: coachable as StatutPorte[] }, recordingSegments: { some: {} } },
      select: {
        recordingSegments: { select: { commercialId: true, managerId: true } },
      },
    });
    const commIds = new Set<number>();
    const mgrIds = new Set<number>();
    for (const p of portes) {
      for (const s of p.recordingSegments) {
        if (s.commercialId != null) commIds.add(s.commercialId);
        else if (s.managerId != null) mgrIds.add(s.managerId);
      }
    }
    const [comms, mgrs] = await Promise.all([
      commIds.size
        ? this.prisma.commercial.findMany({
            where: { id: { in: [...commIds] }, status: UserStatus.ACTIF },
            select: { id: true, nom: true, prenom: true },
          })
        : Promise.resolve([] as { id: number; nom: string; prenom: string }[]),
      mgrIds.size
        ? this.prisma.manager.findMany({
            where: { id: { in: [...mgrIds] }, status: UserStatus.ACTIF },
            select: { id: true, nom: true, prenom: true },
          })
        : Promise.resolve([] as { id: number; nom: string; prenom: string }[]),
    ]);
    const out = [
      ...comms.map((c) => ({
        subjectId: c.id,
        subjectName: `${c.prenom} ${c.nom}`.trim(),
        subjectRole: 'commercial',
      })),
      ...mgrs.map((m) => ({
        subjectId: m.id,
        subjectName: `${m.prenom} ${m.nom}`.trim(),
        subjectRole: 'manager',
      })),
    ];
    out.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    return out;
  }

  /**
   * Comparatif entre intervenants : seules les analyses notées comptent, et le
   * profil par étape vient des `subScores` pour ne pas punir une étape jamais rencontrée.
   */
  async coachingScoreboard(
    startDate?: Date,
    endDate?: Date,
  ): Promise<CoachingScoreboardDto> {
    const activeReference = await this.references.getActive();
    const planSteps = activeReference
      ? (this.references.planOf(activeReference)?.steps ?? [])
      : [];

    const dateWhere = (start?: Date, end?: Date) =>
      start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {};

    const select = {
      id: true,
      commercialId: true,
      managerId: true,
      score: true,
      quality: true,
      subScores: true,
      band: true,
      createdAt: true,
    } as const;

    // Période précédente contiguë et de même durée, pour l'écart de score.
    const previousRange =
      startDate && endDate
        ? (() => {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const span = end.getTime() - start.getTime();
            if (span < 0) return null;
            const previousEnd = new Date(start.getTime() - 1);
            return {
              start: new Date(previousEnd.getTime() - span),
              end: previousEnd,
            };
          })()
        : null;

    const [rows, previousRows] = await Promise.all([
      this.prisma.coachingAnalysis.findMany({
        where: {
          source: this.CRM_SOURCE,
          tenantId: CRM_TENANT,
          status: CoachingStatus.READY,
          ...dateWhere(startDate, endDate),
        },
        select,
        orderBy: { createdAt: 'desc' },
      }),
      previousRange
        ? this.prisma.coachingAnalysis.findMany({
            where: {
              source: this.CRM_SOURCE,
              tenantId: CRM_TENANT,
              status: CoachingStatus.READY,
              ...dateWhere(previousRange.start, previousRange.end),
            },
            select,
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([] as any[]),
    ]);

    const subjects = await this.resolveSubjects([...rows, ...previousRows]);

    // Les utilisateurs de test ne doivent pas polluer un comparatif de performance.
    const productionSubjectKeys = await this.productionSubjectKeys(subjects);

    type Bucket = {
      subjectId: number;
      subjectName: string;
      subjectRole: string;
      scores: number[];
      nbLowConfidence: number;
      nbInexploitable: number;
      stepTotals: Map<string, { sum: number; count: number }>;
      derniereAnalyseAt?: Date;
    };

    const scored = (row: { score: number | null; quality: string | null; band?: string | null }) =>
      isScorable(row) && row.quality !== CoachingQuality.INEXPLOITABLE;

    const accumulateSteps = (
      target: Map<string, { sum: number; count: number }>,
      subScores: unknown,
    ) => {
      const steps = (subScores as StepScore[] | null) ?? [];
      for (const step of steps) {
        if (!step.applicable || step.score == null) continue;
        const current = target.get(step.key) ?? { sum: 0, count: 0 };
        current.sum += step.score;
        current.count += 1;
        target.set(step.key, current);
      }
    };

    const buckets = new Map<string, Bucket>();
    const teamScores: number[] = [];
    const teamSteps = new Map<string, { sum: number; count: number }>();

    for (const row of rows) {
      const subject = subjects.get(row.id);
      if (!subject) continue;
      const key = `${subject.role}:${subject.id}`;
      if (!productionSubjectKeys.has(key)) continue;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          subjectId: subject.id,
          subjectName: subject.name,
          subjectRole: subject.role,
          scores: [],
          nbLowConfidence: 0,
          nbInexploitable: 0,
          stepTotals: new Map(),
        };
        buckets.set(key, bucket);
      }

      if (row.quality === CoachingQuality.INEXPLOITABLE) {
        bucket.nbInexploitable += 1;
        continue;
      }
      if (row.quality === CoachingQuality.LOW_CONFIDENCE) {
        bucket.nbLowConfidence += 1;
      }
      if (!scored(row)) continue;

      bucket.scores.push(row.score as number);
      accumulateSteps(bucket.stepTotals, row.subScores);
      if (!bucket.derniereAnalyseAt || row.createdAt > bucket.derniereAnalyseAt) {
        bucket.derniereAnalyseAt = row.createdAt;
      }

      teamScores.push(row.score as number);
      accumulateSteps(teamSteps, row.subScores);
    }

    // Moyennes de la période précédente, par sujet et pour l'équipe.
    const previousBySubject = new Map<string, number[]>();
    const previousTeamScores: number[] = [];
    for (const row of previousRows) {
      const subject = subjects.get(row.id);
      if (!subject || !scored(row)) continue;
      const key = `${subject.role}:${subject.id}`;
      if (!productionSubjectKeys.has(key)) continue;

      const list = previousBySubject.get(key) ?? [];
      list.push(row.score as number);
      previousBySubject.set(key, list);
      previousTeamScores.push(row.score as number);
    }

    const average = (values: number[]) =>
      values.length
        ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
        : null;

    const buildSteps = (
      totals: Map<string, { sum: number; count: number }>,
    ): CoachingStepAverageDto[] =>
      planSteps.map((step) => {
        const entry = totals.get(step.key);
        return {
          key: step.key,
          label: step.label,
          weight: step.weight,
          score: entry?.count
            ? Math.round((entry.sum / entry.count) * 10) / 10
            : null,
          nbAnalyses: entry?.count ?? 0,
        };
      });

    const rowsOut: CoachingScoreboardRowDto[] = [...buckets.entries()]
      .map(([key, bucket]) => {
        const scoreMoyen = average(bucket.scores);
        const scoreMoyenPrecedent = average(previousBySubject.get(key) ?? []);
        return {
          subjectId: bucket.subjectId,
          subjectName: bucket.subjectName,
          subjectRole: bucket.subjectRole,
          nbAnalyses: bucket.scores.length,
          scoreMoyen,
          scoreMin: bucket.scores.length ? Math.min(...bucket.scores) : null,
          scoreMax: bucket.scores.length ? Math.max(...bucket.scores) : null,
          scoreMoyenPrecedent,
          deltaScore:
            scoreMoyen != null && scoreMoyenPrecedent != null
              ? Math.round((scoreMoyen - scoreMoyenPrecedent) * 10) / 10
              : null,
          nbLowConfidence: bucket.nbLowConfidence,
          nbInexploitable: bucket.nbInexploitable,
          steps: buildSteps(bucket.stepTotals),
          derniereAnalyseAt: bucket.derniereAnalyseAt?.toISOString() ?? null,
        };
      })
      .sort(
        (a, b) =>
          (b.scoreMoyen ?? -1) - (a.scoreMoyen ?? -1) ||
          b.nbAnalyses - a.nbAnalyses ||
          a.subjectName.localeCompare(b.subjectName),
      );

    return {
      rows: rowsOut,
      scoreMoyenEquipe: average(teamScores),
      scoreMoyenEquipePrecedent: average(previousTeamScores),
      nbAnalyses: teamScores.length,
      stepsEquipe: buildSteps(teamSteps),
    };
  }

  /**
   * Statistiques produit sur une période : taux de proposition et de transformation par
   * produit, opportunités oubliées, produits vendus par visite et par intervenant, causes
   * de perte. Seules les visites exploitables portant des statuts produit comptent.
   */
  async coachingProductStats(startDate?: Date, endDate?: Date): Promise<CoachingProductStatsDto> {
    const rows = await this.prisma.coachingAnalysis.findMany({
      where: {
        source: this.CRM_SOURCE,
        tenantId: CRM_TENANT,
        status: CoachingStatus.READY,
        quality: { not: CoachingQuality.INEXPLOITABLE },
        productStatuses: { not: Prisma.DbNull },
        ...(startDate || endDate ? { createdAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
      },
      select: { id: true, userId: true, managerId: true, productStatuses: true, nonSaleReason: true, visitResult: true },
    });
    const subjects = await this.resolveSubjects(rows);
    const production = await this.productionSubjectKeys(subjects);
    const products = new Map<string, { key: string; label: string; nbVisites: number; nbProposes: number; nbAcceptes: number; nbOublies: number }>();
    const bySubject = new Map<string, { subjectId: number; subjectName: string; subjectRole: string; nbVisites: number; nbProduitsVendus: number }>();
    const causes = new Map<string, number>();
    let nbVisites = 0;
    let vendus = 0;
    for (const row of rows) {
      const subject = subjects.get(row.id);
      if (!subject || !production.has(`${subject.role}:${subject.id}`)) continue;
      nbVisites += 1;
      let sold = 0;
      for (const p of (row.productStatuses as unknown as ProductStatus[]) ?? []) {
        const entry = products.get(p.key) ?? { key: p.key, label: p.label, nbVisites: 0, nbProposes: 0, nbAcceptes: 0, nbOublies: 0 };
        // Le taux de proposition ne compte que les visites où le produit était applicable.
        if (p.status !== 'NON_APPLICABLE') entry.nbVisites += 1;
        if (PROPOSED_STATUSES.includes(p.status)) entry.nbProposes += 1;
        if (p.status === 'ACCEPTE') { entry.nbAcceptes += 1; sold += 1; }
        if (p.opportunity === 'oubliee') entry.nbOublies += 1;
        products.set(p.key, entry);
      }
      vendus += sold;
      const key = `${subject.role}:${subject.id}`;
      const bucket = bySubject.get(key) ?? { subjectId: subject.id, subjectName: subject.name, subjectRole: subject.role, nbVisites: 0, nbProduitsVendus: 0 };
      bucket.nbVisites += 1;
      bucket.nbProduitsVendus += sold;
      bySubject.set(key, bucket);
      // Une cause de perte n'a de sens que pour une visite sans vente.
      if (row.nonSaleReason && row.visitResult && !SALE_RESULTS.includes(row.visitResult)) causes.set(row.nonSaleReason, (causes.get(row.nonSaleReason) ?? 0) + 1);
    }
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
    const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 100) / 100 : null);
    return {
      nbVisites,
      products: [...products.values()].map((p) => ({ ...p, tauxProposition: pct(p.nbProposes, p.nbVisites), tauxTransformation: pct(p.nbAcceptes, p.nbProposes) })),
      produitsParVisite: ratio(vendus, nbVisites),
      parIntervenant: [...bySubject.values()]
        .map((b) => ({ ...b, produitsParVisite: ratio(b.nbProduitsVendus, b.nbVisites) }))
        .sort((a, b) => (b.produitsParVisite ?? 0) - (a.produitsParVisite ?? 0) || a.subjectName.localeCompare(b.subjectName)),
      causesPerte: [...causes.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Clés `role:id` des sujets qui ne sont pas des utilisateurs de test.
   * Un commercial supprimé entre-temps disparaît aussi du comparatif.
   */
  private async productionSubjectKeys(
    subjects: Map<number, { name: string; role: 'commercial' | 'manager'; id: number }>,
  ): Promise<Set<string>> {
    const commercialIds = new Set<number>();
    const managerIds = new Set<number>();
    for (const subject of subjects.values()) {
      if (subject.role === 'commercial') commercialIds.add(subject.id);
      else managerIds.add(subject.id);
    }

    const [commercials, managers] = await Promise.all([
      commercialIds.size
        ? this.prisma.commercial.findMany({
            where: {
              id: { in: [...commercialIds] },
              status: { not: UserStatus.UTILISATEUR_TEST },
            },
            select: { id: true },
          })
        : Promise.resolve([] as { id: number }[]),
      managerIds.size
        ? this.prisma.manager.findMany({
            where: {
              id: { in: [...managerIds] },
              status: { not: UserStatus.UTILISATEUR_TEST },
            },
            select: { id: true },
          })
        : Promise.resolve([] as { id: number }[]),
    ]);

    return new Set([
      ...commercials.map((c) => `commercial:${c.id}`),
      ...managers.map((m) => `manager:${m.id}`),
    ]);
  }

  private toDto(row: any): CoachingAnalysisDto {
    return {
      id: row.id,
      recordingId: row.recordingId,
      porteId: row.porteId,
      userId: row.userId,
      managerId: row.managerId,
      s3KeyOriginal: row.s3KeyOriginal,
      statutPorte: row.statutPorte ?? null,
      status: row.status,
      transcriptionAttempts: row.transcriptionAttempts ?? 0,
      evaluationAttempts: row.evaluationAttempts ?? 0,
      stageStartedAt: row.stageStartedAt?.toISOString() ?? null,
      transcriptionStartedAt: row.transcriptionStartedAt?.toISOString() ?? null,
      transcriptionCompletedAt: row.transcriptionCompletedAt?.toISOString() ?? null,
      evaluationStartedAt: row.evaluationStartedAt?.toISOString() ?? null,
      evaluationCompletedAt: row.evaluationCompletedAt?.toISOString() ?? null,
      nextRetryAt: row.remoteNextSyncAt?.toISOString() ?? null,
      quality: row.quality ?? null,
      score: row.status === 'READY' ? row.score ?? null : null,
      scoreBeforeMalus: row.scoreBeforeMalus ?? null,
      malus: row.malus ?? null,
      productAlerts: row.remoteResultSnapshot?.productAlerts ?? [],
      productVerification: row.remoteResultSnapshot?.productVerification ?? { status: 'unknown', products: [] },
      // Anciennes analyses et plans silencieux : garder une chaîne vide pour
      // les citations informatives absentes, conformément au contrat non-nullable.
      violations: ((row.violations as CoachingViolationDto[]) ?? []).map((v) => ({
        ...v,
        quote: v.quote ?? '',
        sheetSays: v.sheetSays ?? '',
        planSays: v.planSays ?? '',
      })),
      detectedProducts: (row.detectedProducts as string[]) ?? [],
      productMapping: (row.productMapping as CoachingAnalysisDto['productMapping']) ?? [],
      confidence: row.confidence ?? null,
      summary: row.summary ?? null,
      strengths: (row.strengths as string[]) ?? [],
      improvements: (row.improvements as string[]) ?? [],
      recommendations: (row.recommendations as string[]) ?? [],
      subScores: (row.subScores as StepScore[]) ?? [],
      // Une preuve mal formée ne doit pas annuler toute la réponse GraphQL.
      criterionResults: ((row.criterionResults as CriterionScore[]) ?? []).map((c: any) => ({
        ...c,
        evidenceRefs: Array.isArray(c.evidenceRefs) ? c.evidenceRefs.filter((e: any) => typeof e?.quote === 'string') : null,
      })),
      transcript: row.transcript ?? null,
      transcriptDurationSec: row.transcriptDurationSec ?? null,
      error: row.error ?? row.remoteSyncError ?? null,
      // Référentiel figé par l'analyse ; avant lui, la seule version de plan.
      planSlug: row.reference?.planSlug ?? row.salesPlanVersion?.slug ?? '',
      planVersion: row.reference?.version ?? row.salesPlanVersion?.version ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      favori: row.porte?.coachingFavori ?? false,
      executionScore: row.status === 'READY' ? row.executionScore ?? null : null,
      outcomeScore: row.status === 'READY' ? row.outcomeScore ?? null : null,
      outcomeCategory: row.remoteResultSnapshot?.outcome?.outcomeCategory ?? null,
      outcomeComment: row.remoteResultSnapshot?.outcome?.comment ?? null,
      outcomeEvidence: Array.isArray(row.remoteResultSnapshot?.outcome?.evidence) ? row.remoteResultSnapshot.outcome.evidence.filter((e: unknown) => typeof e === 'string') : [],
      visitResult: row.visitResult ?? null,
      nonSaleReason: row.nonSaleReason ?? null,
      nextAction: row.nextAction ?? null,
      ribStatus: row.ribStatus ?? null,
      signatureStatus: row.signatureStatus ?? null,
      outcomeOverriddenBy: row.outcomeOverriddenBy ?? null,
      outcomeOverriddenAt: row.outcomeOverriddenAt?.toISOString() ?? null,
      productStatuses: row.productStatuses ?? [],
      indicators: row.indicators ?? null,
      band: row.band ?? null,
      analysisConfidence: row.analysisConfidence ?? null,
      calculationChecks: row.calculationChecks ?? [],
      contradictions: row.contradictions ?? [],
      phaseTiming: row.phaseTiming ?? [],
      // Enrichis après coup : niveau/objectif par withObjectives, sujet par resolveSubjects.
      commercialNiveau: null,
      objectiveScore: null,
      subjectName: null,
      subjectRole: null,
      subjectId: null,
    };
  }
}
