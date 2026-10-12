import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { synthesisScheduleLabel } from './synthese-globale/synthesis.service';

// Statuts porte coachables par défaut (surchargés par la config DB éditable).
const COACHABLE_STATUTS_DEFAULT = [
  'REFUS',
  'ARGUMENTE',
  'RENDEZ_VOUS_PRIS',
  'CONTRAT_SIGNE',
];
const ALL_STATUTS = [
  'NON_VISITE',
  'CONTRAT_SIGNE',
  'REFUS',
  'RENDEZ_VOUS_PRIS',
  'ABSENT',
  'ARGUMENTE',
  'NECESSITE_REPASSAGE',
];
// Durée min (s) d'un audio pour l'analyse AUTO — valeur par défaut si la config
// DB est absente ; la vraie valeur est éditable dans les Réglages (CoachingConfig).
const MIN_AUTO_DURATION_SEC_DEFAULT = 120;

/**
 * Config singleton du coaching (statuts coachables + durée min auto) et gating
 * de l'analyse automatique. Cache mémoire 30 s pour éviter un hit DB par audio.
 */
@Injectable()
export class CoachingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private configCache: {
    statuts: string[];
    minAutoDurationSec: number;
    at: number;
  } | null = null;

  /** Charge la config (cache 30 s), en créant la ligne par défaut au besoin. */
  private async loadConfig(): Promise<{
    statuts: string[];
    minAutoDurationSec: number;
  }> {
    if (this.configCache && Date.now() - this.configCache.at < 30_000) {
      return this.configCache;
    }
    let cfg = await this.prisma.coachingConfig.findUnique({ where: { id: 1 } });
    if (!cfg) {
      cfg = await this.prisma.coachingConfig.create({
        data: { id: 1, coachableStatuts: COACHABLE_STATUTS_DEFAULT },
      });
    }
    const statuts = Array.isArray(cfg.coachableStatuts)
      ? (cfg.coachableStatuts as string[])
      : COACHABLE_STATUTS_DEFAULT;
    const minAutoDurationSec =
      cfg.minAutoDurationSec ?? MIN_AUTO_DURATION_SEC_DEFAULT;
    this.configCache = { statuts, minAutoDurationSec, at: Date.now() };
    return this.configCache;
  }

  /** Statuts porte qui déclenchent l'analyse auto (config DB, cache 30 s). */
  async getCoachableStatuts(): Promise<string[]> {
    return (await this.loadConfig()).statuts;
  }

  /** Durée minimale (s) d'un audio pour l'analyse AUTO (config DB, cache 30 s). */
  async getMinAutoDurationSec(): Promise<number> {
    return (await this.loadConfig()).minAutoDurationSec;
  }

  /** Met à jour la liste des statuts coachables (admin, page de gestion). */
  async setCoachableStatuts(statuts: string[]): Promise<string[]> {
    const clean = [
      ...new Set((statuts ?? []).filter((s) => ALL_STATUTS.includes(s))),
    ];
    await this.prisma.coachingConfig.upsert({
      where: { id: 1 },
      create: { id: 1, coachableStatuts: clean },
      update: { coachableStatuts: clean },
    });
    this.configCache = null; // invalide le cache
    return clean;
  }

  /** Met à jour la durée minimale (s) d'analyse auto. Bornée à [0, 3600]. */
  async setMinAutoDurationSec(seconds: number): Promise<number> {
    const clean = Math.max(0, Math.min(3600, Math.round(seconds || 0)));
    await this.prisma.coachingConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        coachableStatuts: COACHABLE_STATUTS_DEFAULT,
        minAutoDurationSec: clean,
      },
      update: { minAutoDurationSec: clean },
    });
    this.configCache = null; // invalide le cache
    return clean;
  }

  async getConfig(): Promise<{
    coachableStatuts: string[];
    allStatuts: string[];
    minAutoDurationSec: number;
    synthesisCronSchedule: string;
    synthesisCronFrequency: string;
    synthesisCronHour: number;
    synthesisCronMinute: number;
    synthesisCronWeekday: number;
    synthesisCronLastRunAt: string | null;
  }> {
    const c = await this.loadConfig();
    // Lecture fraîche de la planif cron (non cachée — reflète l'état réel).
    const row = await this.prisma.coachingConfig.findUnique({
      where: { id: 1 },
      select: {
        synthesisCronFrequency: true,
        synthesisCronHour: true,
        synthesisCronMinute: true,
        synthesisCronWeekday: true,
        synthesisCronLastRunAt: true,
      },
    });
    const frequency = row?.synthesisCronFrequency ?? 'daily';
    const hour = row?.synthesisCronHour ?? 3;
    const minute = row?.synthesisCronMinute ?? 0;
    const weekday = row?.synthesisCronWeekday ?? 1;
    return {
      coachableStatuts: c.statuts,
      allStatuts: ALL_STATUTS,
      minAutoDurationSec: c.minAutoDurationSec,
      synthesisCronSchedule: synthesisScheduleLabel(
        frequency,
        hour,
        minute,
        weekday,
      ),
      synthesisCronFrequency: frequency,
      synthesisCronHour: hour,
      synthesisCronMinute: minute,
      synthesisCronWeekday: weekday,
      synthesisCronLastRunAt: row?.synthesisCronLastRunAt
        ? row.synthesisCronLastRunAt.toISOString()
        : null,
    };
  }
}
