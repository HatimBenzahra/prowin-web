import { Injectable } from '@nestjs/common';
import { CRM_SOURCE, CRM_TENANT } from '../shared/crm-scope';
import { CoachingStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { calculateStatsForStatus } from '../../porte/porte-status.constants';

type SubjectType = 'commercial' | 'manager';

// Les sessions détaillent les analyses une par une ; l'agrégat, lui, couvre 100 %.
const SESSIONS_DETAIL_MAX = 80; // sessions listées au plus
const SESSIONS_DETAILLEES = 15; // les plus récentes portent leurs critères
const PREUVES_PAR_CRITERE = 2;
// Budget de la liste des sessions dans le prompt (~3 caractères par token) : avec le
// reste du snapshot, le prompt système et la réponse, il tient dans le contexte du
// modèle (64k tokens). Au-delà, le détail se réduit au lieu de faire échouer l'appel.
export const SESSIONS_BUDGET_CHARS = 90_000;
const MAX_JOURS = 90; // plafond dur de la ventilation "activité par jour"
const RECAP_MAX_COMMERCIAUX = 30; // plafond du récap équipe (manager)

/**
 * Agrégat 100 % DB envoyé au LLM de synthèse : que des faits chiffrés, pour un
 * commercial ou pour l'équipe d'un manager, l'activité venant de `StatusHistorique`.
 */
@Injectable()
export class SnapshotBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Périmètre du sujet : lui-même pour un commercial, son équipe pour un manager. */
  private async resolveScope(subjectType: SubjectType, subjectId: number) {
    if (subjectType === 'commercial') {
      return {
        activityWhere: { commercialId: subjectId } as {
          commercialId: number | { in: number[] };
        },
        // CoachingAnalysis porte `userId` depuis l'ouverture à plusieurs apps.
        analysisWhere: { userId: subjectId } as {
          userId: number | { in: number[] };
        },
        ownerWhere: { commercialId: subjectId } as
          | { commercialId: number }
          | { managerId: number },
        zoneUserType: UserType.COMMERCIAL,
        teamIds: null as number[] | null,
        teamNames: new Map<number, string>(),
      };
    }
    const team = await this.prisma.commercial.findMany({
      where: { managerId: subjectId },
      select: { id: true, nom: true, prenom: true },
    });
    const teamIds = team.map((c) => c.id);
    const teamNames = new Map<number, string>(
      team.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()]),
    );
    return {
      activityWhere: { commercialId: { in: teamIds } } as {
        commercialId: number | { in: number[] };
      },
      analysisWhere: { userId: { in: teamIds } } as {
        userId: number | { in: number[] };
      },
      ownerWhere: { managerId: subjectId } as
        | { commercialId: number }
        | { managerId: number },
      zoneUserType: UserType.MANAGER,
      teamIds,
      teamNames,
    };
  }

  async buildSnapshot(subjectType: SubjectType, subjectId: number) {
    const { activityWhere, analysisWhere, ownerWhere, zoneUserType, teamIds, teamNames } =
      await this.resolveScope(subjectType, subjectId);
    const round = (n: number) => Math.round(n * 10) / 10;

    const subject =
      subjectType === 'commercial'
        ? await this.prisma.commercial.findUnique({
            where: { id: subjectId },
            select: { nom: true, prenom: true, createdAt: true },
          })
        : await this.prisma.manager.findUnique({
            where: { id: subjectId },
            select: { nom: true, prenom: true, createdAt: true },
          });

    // Analyses coaching READY (verdicts LLM par critère + score backend).
    const analyses = await this.prisma.coachingAnalysis.findMany({
      // Le bilan d'un commercial ProWin ne compte que les analyses de ProWin.
      where: { ...analysisWhere, source: CRM_SOURCE, tenantId: CRM_TENANT, status: CoachingStatus.READY },
      select: {
        id: true,
        score: true,
        statutPorte: true,
        summary: true,
        strengths: true,
        improvements: true,
        criterionResults: true,
        // La récurrence des écarts est ce que la synthèse doit voir.
        violations: true,
        malus: true,
        transcriptDurationSec: true,
        porteId: true,
        userId: true,
        s3KeyOriginal: true,
        createdAt: true,
        recording: { select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Historique terrain (source de vérité activité, TOUTES portes), 1 requête.
    const history = await this.prisma.statusHistorique.findMany({
      where: activityWhere,
      select: { porteId: true, statut: true, duree: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Contrats validés (back-office) — periodDay pour la ventilation par jour.
    const contrats = await this.prisma.contratValide.findMany({
      where: activityWhere,
      select: {
        periodDay: true,
        periodMonth: true,
        dateValidation: true,
        offre: {
          select: {
            nom: true,
            categorie: true,
            badgeProductKey: true,
            points: true,
          },
        },
      },
    });

    const recDateOf = (a: { s3KeyOriginal: string; createdAt: Date }): Date =>
      parseRecordingDate(a.s3KeyOriginal) ?? a.createdAt;

    // --- Agrégats coaching (scores + critères + statuts coachés) -------------
    const scores = analyses
      .map((a) => a.score)
      .filter((n): n is number => typeof n === 'number');
    const scoreMoyen = scores.length
      ? round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    const critMap = new Map<
      string,
      { titre: string; atteint: number; partiel: number; absent: number }
    >();
    for (const a of analyses) {
      const crits = (a.criterionResults as any[]) ?? [];
      for (const c of crits) {
        if (c.status === 'non_applicable') continue;
        const key = c.criterionKey || c.title;
        const cur =
          critMap.get(key) ?? { titre: c.title, atteint: 0, partiel: 0, absent: 0 };
        if (c.status === 'atteint') cur.atteint++;
        else if (c.status === 'partiel') cur.partiel++;
        else cur.absent++;
        critMap.set(key, cur);
      }
    }

    // Conformité produit : des comptes, jamais les citations — le détail vit porte par porte.
    const violMap = new Map<
      string,
      { produit: string; contredit: string; grave: number; modere: number }
    >();
    let nbEchangesAvecEcart = 0;
    let malusTotal = 0;

    for (const a of analyses) {
      const viols = (a.violations as any[]) ?? [];
      if (viols.length > 0) nbEchangesAvecEcart++;
      malusTotal += typeof a.malus === 'number' ? a.malus : 0;

      for (const v of viols) {
        const produit = v.productLabel || v.productSlug || 'produit inconnu';
        // La ligne de fiche contredite fait office de famille d'écart.
        const contredit = String(v.sheetSays ?? '').slice(0, 120);
        const key = `${produit}::${contredit}`;
        const cur =
          violMap.get(key) ?? { produit, contredit, grave: 0, modere: 0 };
        if (v.severity === 'grave') cur.grave++;
        else cur.modere++;
        violMap.set(key, cur);
      }
    }

    const conformite = {
      nbEcarts: [...violMap.values()].reduce(
        (n, v) => n + v.grave + v.modere,
        0,
      ),
      nbEchangesAvecEcart,
      nbEchangesAvecProduit: analyses.filter(
        (a) => ((a.violations as any[]) ?? []).length > 0 || a.malus != null,
      ).length,
      malusMoyen: analyses.length ? round(malusTotal / analyses.length) : 0,
      // Les plus fréquentes d'abord : c'est ce qui se corrige en formation.
      recurrents: [...violMap.values()]
        .sort((a, b) => b.grave + b.modere - (a.grave + a.modere))
        .slice(0, 6),
    };

    const statutsCoaches: Record<string, number> = {};
    for (const a of analyses) {
      if (!a.statutPorte) continue;
      statutsCoaches[a.statutPorte] = (statutsCoaches[a.statutPorte] ?? 0) + 1;
    }

    // --- Activité terrain via StatusHistorique : dernier statut, durée cumulée ---
    const latestParPorte = new Map<number, string>();
    const dureeParPorte = new Map<number, number>();
    for (const h of history) {
      if (h.porteId == null) continue;
      latestParPorte.set(h.porteId, h.statut);
      if (h.duree && h.duree > 0) {
        dureeParPorte.set(h.porteId, (dureeParPorte.get(h.porteId) ?? 0) + h.duree);
      }
    }

    const statutsGlobal: Record<string, number> = {};
    const dureeSumParStatut: Record<string, { sum: number; n: number }> = {};
    let dureeSumGlobal = 0;
    let dureeNGlobal = 0;
    for (const [porteId, statut] of latestParPorte) {
      statutsGlobal[statut] = (statutsGlobal[statut] ?? 0) + 1;
      const d = dureeParPorte.get(porteId) ?? 0;
      if (d > 0) {
        dureeSumGlobal += d;
        dureeNGlobal++;
        const cur = dureeSumParStatut[statut] ?? { sum: 0, n: 0 };
        cur.sum += d;
        cur.n++;
        dureeSumParStatut[statut] = cur;
      }
    }
    const dureeMoyenneParPorteSec = dureeNGlobal
      ? Math.round(dureeSumGlobal / dureeNGlobal)
      : null;
    const dureeMoyenneParStatut: Record<string, number> = {};
    for (const [st, v] of Object.entries(dureeSumParStatut)) {
      dureeMoyenneParStatut[st] = Math.round(v.sum / v.n);
    }
    const nbPortes = latestParPorte.size;

    // Ventilation PAR JOUR (agrégée sur tout l'historique, bornée à l'affichage).
    type JourAgg = {
      portes: Set<number>;
      evenements: number;
      parStatut: Record<string, number>;
      dureeSum: number;
      dureeN: number;
    };
    const jourMap = new Map<string, JourAgg>();
    let dureeSumEvt = 0;
    let dureeNEvt = 0;
    for (const h of history) {
      const key = localDayKey(h.createdAt);
      let e = jourMap.get(key);
      if (!e) {
        e = { portes: new Set(), evenements: 0, parStatut: {}, dureeSum: 0, dureeN: 0 };
        jourMap.set(key, e);
      }
      if (h.porteId != null) e.portes.add(h.porteId);
      e.evenements++;
      e.parStatut[h.statut] = (e.parStatut[h.statut] ?? 0) + 1;
      if (h.duree && h.duree > 0) {
        e.dureeSum += h.duree;
        e.dureeN++;
        dureeSumEvt += h.duree;
        dureeNEvt++;
      }
    }

    // Contrats indexés par jour (clé periodDay, ou dérivée de dateValidation).
    const contratsParDay: Record<string, number> = {};
    for (const c of contrats) {
      const key = c.periodDay ?? (c.dateValidation ? localDayKey(c.dateValidation) : null);
      if (key) contratsParDay[key] = (contratsParDay[key] ?? 0) + 1;
    }

    // Baselines "habituel" — sur TOUT l'historique (moyennes stables).
    const nbJoursActifs = jourMap.size;
    let totalPortesJours = 0;
    let totalEvenements = 0;
    for (const e of jourMap.values()) {
      totalPortesJours += e.portes.size;
      totalEvenements += e.evenements;
    }
    const conv = {
      contratsSignes: 0,
      rendezVousPris: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      nbPortesProspectes: 0,
    };
    for (const statut of latestParPorte.values()) {
      const s = calculateStatsForStatus(statut, 1);
      conv.contratsSignes += s.contratsSignes;
      conv.rendezVousPris += s.rendezVousPris;
      conv.refus += s.refus;
      conv.absents += s.absents;
      conv.argumentes += s.argumentes;
      conv.nbPortesProspectes += s.nbPortesProspectes;
    }
    const rate = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 1000 : null;
    const baselines = {
      nbJoursActifs,
      portesParJourActif: nbJoursActifs
        ? Math.round(totalPortesJours / nbJoursActifs)
        : null,
      evenementsParJourActif: nbJoursActifs
        ? Math.round(totalEvenements / nbJoursActifs)
        : null,
      dureeMoyenneParPorteSec,
      dureeMoyenneParEvenementSec: dureeNEvt
        ? Math.round(dureeSumEvt / dureeNEvt)
        : null,
      contratsParJourActif: nbJoursActifs
        ? Math.round(contrats.length / nbJoursActifs)
        : null,
      conversion: {
        ...conv,
        tauxContratParPorte: rate(conv.contratsSignes, conv.nbPortesProspectes),
        tauxRdvParPorte: rate(conv.rendezVousPris, conv.nbPortesProspectes),
        tauxRefusParPorte: rate(conv.refus, conv.nbPortesProspectes),
      },
    };

    // --- Période couverte (analyses coaching) + fenêtre par-jour -------------
    const analyseTimes = analyses
      .map((a) => a.recording?.createdAt.getTime())
      .filter((t): t is number => t != null);
    const periodStart = analyseTimes.length ? new Date(Math.min(...analyseTimes)) : null;
    const periodEnd = analyseTimes.length ? new Date(Math.max(...analyseTimes)) : null;
    const dayStart = periodStart ? localDayKey(periodStart) : null;
    const dayEnd = periodEnd ? localDayKey(periodEnd) : null;
    const parJour = [...jourMap.entries()]
      .filter(
        ([key]) => (!dayStart || key >= dayStart) && (!dayEnd || key <= dayEnd),
      )
      .sort((a, b) => b[0].localeCompare(a[0])) // récents d'abord pour le plafond
      .slice(0, MAX_JOURS)
      .map(([date, e]) => ({
        date,
        nbPortes: e.portes.size,
        nbEvenements: e.evenements,
        parStatut: e.parStatut,
        contrats: contratsParDay[date] ?? 0,
        dureeTotaleSec: e.dureeSum,
        dureeMoyenneSec: e.dureeN ? Math.round(e.dureeSum / e.dureeN) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)); // chronologique pour la lecture

    // --- Date de début de prospection (cascade de fallbacks) -----------------
    let dateDebut: Date | null = history.length ? history[0].createdAt : null;
    let sourceDateDebut: string | null = history.length ? 'status_historique' : null;
    if (!dateDebut && contrats.length) {
      const min = contrats.reduce<Date | null>(
        (m, c) =>
          c.dateValidation && (!m || c.dateValidation < m) ? c.dateValidation : m,
        null,
      );
      if (min) {
        dateDebut = min;
        sourceDateDebut = 'contrat';
      }
    }
    if (!dateDebut && analyseTimes.length) {
      dateDebut = new Date(Math.min(...analyseTimes));
      sourceDateDebut = 'recording';
    }
    if (!dateDebut && subject?.createdAt) {
      dateDebut = subject.createdAt;
      sourceDateDebut = 'fiche';
    }
    const ancienneteJours = dateDebut
      ? Math.floor((Date.now() - dateDebut.getTime()) / 86_400_000)
      : null;

    // --- Tendance hebdo + sessions détaillées (inchangé) ---------------------
    const weekAgg = new Map<string, { sum: number; n: number }>();
    for (const a of analyses) {
      if (typeof a.score !== 'number') continue;
      const w = isoWeek(recDateOf(a));
      const cur = weekAgg.get(w) ?? { sum: 0, n: 0 };
      cur.sum += a.score;
      cur.n++;
      weekAgg.set(w, cur);
    }
    const scoreParSemaine = [...weekAgg.entries()]
      .map(([s, v]) => ({ s, score: round(v.sum / v.n) }))
      .sort((a, b) => a.s.localeCompare(b.s));
    const direction = trendDirection(scoreParSemaine.map((x) => x.score));

    const sessions = fitSessions(
      analyses.slice(0, SESSIONS_DETAIL_MAX).map((a) => ({
        date: recDateOf(a).toISOString().slice(0, 10),
        // Pour un manager, rattache la session à son commercial (le LLM peut citer
        // l'individu). Champ omis pour un commercial (teamNames vide).
        ...(subjectType === 'manager'
          ? { commercial: teamNames.get(a.userId as number) ?? null }
          : {}),
        statutPorte: a.statutPorte ?? null,
        score: typeof a.score === 'number' ? Math.round(a.score) : null,
        dureeSec:
          typeof a.transcriptDurationSec === 'number'
            ? Math.round(a.transcriptDurationSec)
            : null,
        resume: a.summary ?? null,
        forces: (a.strengths as string[]) ?? [],
        axes: (a.improvements as string[]) ?? [],
        criteres: ((a.criterionResults as any[]) ?? [])
          .filter((c) => c.status !== 'non_applicable')
          .map((c) => ({
            titre: c.title,
            verdict: c.status,
            commentaire: c.comment ?? null,
            // Citations verbatim de ce que le commercial a dit (matière première
            // du coaching : ce qu'il dit / ne dit pas vs le plan de vente).
            preuves: Array.isArray(c.evidence) ? c.evidence.slice(0, PREUVES_PAR_CRITERE) : [],
          })),
      })),
    );

    // --- Contrats : `points` = valeur de l'offre, pour juger le mix par VALEUR ---
    const parTypeMap = new Map<
      string,
      {
        categorie: string;
        offre: string;
        count: number;
        pointsUnite: number;
        valeurTotale: number;
      }
    >();
    const parMois: Record<string, number> = {};
    let valeurTotale = 0;
    for (const c of contrats) {
      const categorie = c.offre?.categorie ?? 'Inconnu';
      const offre = c.offre?.nom ?? c.offre?.badgeProductKey ?? 'Inconnu';
      const pts = c.offre?.points ?? 0;
      const key = `${categorie}|${offre}`;
      const cur =
        parTypeMap.get(key) ??
        { categorie, offre, count: 0, pointsUnite: pts, valeurTotale: 0 };
      cur.count++;
      cur.valeurTotale += pts;
      parTypeMap.set(key, cur);
      valeurTotale += pts;
      if (c.periodMonth) parMois[c.periodMonth] = (parMois[c.periodMonth] ?? 0) + 1;
    }

    // --- Zone de terrain (assignée au sujet + terrain réel coaché) -----------
    const zoneEnCours = await this.prisma.zoneEnCours.findFirst({
      where: { userId: subjectId, userType: zoneUserType },
      select: { zone: { select: { nom: true } } },
    });
    const quartiersAssignes = await this.prisma.quartier.findMany({
      where: ownerWhere,
      select: { nom: true },
    });
    const porteIds = analyses
      .map((a) => a.porteId)
      .filter((x): x is number => x != null);
    const portes = porteIds.length
      ? await this.prisma.porte.findMany({
          where: { id: { in: porteIds } },
          select: {
            immeuble: {
              select: {
                adresse: true,
                typeHabitat: true,
                zone: { select: { nom: true } },
                quartier: { select: { nom: true } },
              },
            },
          },
        })
      : [];
    const villes = new Set<string>();
    const zonesReelles = new Set<string>();
    const quartiersReels = new Set<string>();
    const habitatCount: Record<string, number> = {};
    for (const p of portes) {
      const imm = p.immeuble;
      if (!imm) continue;
      const ville = extractVille(imm.adresse);
      if (ville) villes.add(ville);
      if (imm.zone?.nom) zonesReelles.add(imm.zone.nom);
      if (imm.quartier?.nom) quartiersReels.add(imm.quartier.nom);
      if (imm.typeHabitat)
        habitatCount[imm.typeHabitat] = (habitatCount[imm.typeHabitat] ?? 0) + 1;
    }

    // --- Bloc équipe (manager uniquement) ------------------------------------
    let equipe: Record<string, unknown> | undefined;
    if (subjectType === 'manager' && teamIds) {
      const [byAnalyse, byContrat, perso] = await Promise.all([
        this.prisma.coachingAnalysis.groupBy({
          by: ['userId'],
          where: { source: CRM_SOURCE, tenantId: CRM_TENANT, userId: { in: teamIds }, status: CoachingStatus.READY },
          _count: { _all: true },
          _avg: { score: true },
        }),
        this.prisma.contratValide.groupBy({
          by: ['commercialId'],
          where: { commercialId: { in: teamIds } },
          _count: { _all: true },
        }),
        this.prisma.coachingAnalysis.aggregate({
          where: { source: CRM_SOURCE, tenantId: CRM_TENANT, managerId: subjectId, status: CoachingStatus.READY },
          _count: { _all: true },
          _avg: { score: true },
        }),
      ]);
      const contratByComm = new Map<number, number>(
        byContrat
          .filter((r) => r.commercialId != null)
          .map((r) => [r.commercialId as number, r._count._all]),
      );
      const equipeParCommercial = byAnalyse
        .filter((r) => r.userId != null)
        .map((r) => ({
          nom: teamNames.get(r.userId as number) ?? `#${r.userId}`,
          nbAnalyses: r._count._all,
          scoreMoyen: r._avg.score != null ? round(r._avg.score) : null,
          nbContrats: contratByComm.get(r.userId as number) ?? 0,
        }))
        .sort((a, b) => b.nbAnalyses - a.nbAnalyses)
        .slice(0, RECAP_MAX_COMMERCIAUX);
      equipe = {
        effectif: teamIds.length,
        parCommercial: equipeParCommercial,
        activiteManagerPerso: {
          nbAnalyses: perso._count._all,
          scoreMoyen: perso._avg.score != null ? round(perso._avg.score) : null,
        },
      };
    }

    return {
      sujet: {
        type: subjectType,
        nom: subject ? `${subject.prenom} ${subject.nom}`.trim() : null,
      },
      parcours: {
        dateDebutProspection: dateDebut ? dateDebut.toISOString().slice(0, 10) : null,
        ancienneteJours,
        nbJoursActifs,
        sourceDateDebut,
      },
      coaching: {
        nbAnalyses: analyses.length,
        scoreMoyen,
        scoreMin: scores.length ? Math.min(...scores) : null,
        scoreMax: scores.length ? Math.max(...scores) : null,
        criteres: [...critMap.values()],
        conformite,
        statutsCoaches,
      },
      activite: {
        // Toutes les portes du sujet via l'historique de statut (pas seulement
        // les portes enregistrées) — état courant par porte.
        statutsToutesPortes: statutsGlobal,
        nbPortes,
        // Temps total de prospection par porte (somme des passages), en secondes.
        duree: {
          moyenneSec: dureeMoyenneParPorteSec,
          parStatut: dureeMoyenneParStatut,
        },
        // Repères "habituels" (moyennes sur tout l'historique) — pour comparer.
        baselines,
        // Détail jour par jour sur la période coachée (jours actifs, borné).
        parJour,
      },
      sessions,
      contrats: {
        signesDeclares: statutsGlobal['CONTRAT_SIGNE'] ?? 0,
        valides: contrats.length,
        tauxValidation: statutsGlobal['CONTRAT_SIGNE']
          ? Math.round((contrats.length / statutsGlobal['CONTRAT_SIGNE']) * 100) / 100
          : null,
        // Valeur totale (somme des points d'offre) — les offres à points élevés
        // "valent" plus (barème gamification). Mix trié par valeur décroissante.
        valeurTotale,
        valeurMoyenne: contrats.length
          ? Math.round((valeurTotale / contrats.length) * 10) / 10
          : null,
        parType: [...parTypeMap.values()].sort(
          (a, b) => b.valeurTotale - a.valeurTotale || b.count - a.count,
        ),
        parMois,
      },
      zone: {
        zoneAssignee: zoneEnCours?.zone?.nom ?? null,
        quartiersAssignes: quartiersAssignes.map((q) => q.nom),
        villes: [...villes],
        zonesReelles: [...zonesReelles],
        quartiersReels: [...quartiersReels],
        typesHabitat: habitatCount,
      },
      tendance: { scoreParSemaine, direction },
      periode: {
        start: periodStart ? periodStart.toISOString() : null,
        end: periodEnd ? periodEnd.toISOString() : null,
        nb: analyses.length,
      },
      ...(equipe ? { equipe } : {}),
    };
  }
}

// --- Helpers ---------------------------------------------------------------

/** Clé jour "YYYY-MM-DD" en heure LOCALE serveur (miroir de computePeriodKeys.day). */
function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Semaine ISO "YYYY-Www". */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Compare la moyenne de la 1ère moitié vs 2nde moitié des points. */
function trendDirection(points: number[]): string {
  if (points.length < 2) return 'stagne';
  const mid = Math.floor(points.length / 2);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const first = avg(points.slice(0, mid));
  const second = avg(points.slice(mid));
  const delta = second - first;
  if (delta >= 5) return 'progresse';
  if (delta <= -5) return 'regresse';
  return 'stagne';
}

/**
 * Date de capture d'un enregistrement, extraite du suffixe de la clé S3
 * (ex. "…_2026-07-20T13-35-30.679Z.mp4" ou epoch). Null si non parsable.
 */
function parseRecordingDate(s3Key: string | null | undefined): Date | null {
  if (!s3Key) return null;
  const file = (s3Key.split('/').pop() ?? '').replace(/\.mp4$/i, '');
  const i = file.lastIndexOf('_');
  if (i < 0) return null;
  const raw = file.slice(i + 1);
  const epoch = Number(raw);
  if (Number.isFinite(epoch) && epoch > 0) {
    return new Date(epoch > 1e12 ? epoch : epoch * 1000);
  }
  const iso = raw.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Extrait "CP Ville" d'une adresse ("16 Rue X 93100 Montreuil" → "93100 Montreuil"). */
function extractVille(adresse: string): string | null {
  const m = /(\d{5})\s+([A-Za-zÀ-ÿ'\- ]+)$/.exec((adresse ?? '').trim());
  return m ? `${m[1]} ${m[2].trim()}` : null;
}

type Session = { criteres?: unknown[]; forces?: unknown[]; axes?: unknown[] } & Record<string, unknown>;

/**
 * Tient les sessions dans le budget du prompt, du plus récent au plus ancien : les
 * plus récentes gardent leurs critères, les autres leur seul résumé. Si cela dépasse
 * encore, moins de sessions sont détaillées, puis les plus anciennes sont retirées.
 */
export function fitSessions<T extends Session>(sessions: T[], budget = SESSIONS_BUDGET_CHARS): T[] {
  const summary = (s: T): T => {
    const { criteres: _c, forces: _f, axes: _a, ...rest } = s;
    return rest as T;
  };
  let detailed = Math.min(SESSIONS_DETAILLEES, sessions.length);
  let kept = sessions.length;
  const build = () => sessions.slice(0, kept).map((s, i) => (i < detailed ? s : summary(s)));
  let result = build();
  while (JSON.stringify(result).length > budget && kept > 0) {
    if (detailed > 0) detailed = Math.floor(detailed / 2);
    else kept--;
    result = build();
  }
  return result;
}
