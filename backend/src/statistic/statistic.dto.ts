import {
  ObjectType,
  Field,
  Int,
  InputType,
  PartialType,
  Float,
} from '@nestjs/graphql';

@ObjectType()
export class Statistic {
  @Field(() => Int)
  id: number;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int, { nullable: true })
  directeurId?: number;

  @Field(() => Int, { nullable: true })
  immeubleId?: number;

  @Field(() => Int, { nullable: true })
  zoneId?: number;

  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  immeublesVisites: number;

  @Field(() => Int)
  rendezVousPris: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  absents: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  nbImmeublesProspectes: number;

  @Field(() => Int)
  nbPortesProspectes: number;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@InputType()
export class CreateStatisticInput {
  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int, { nullable: true })
  directeurId?: number;

  @Field(() => Int, { nullable: true })
  immeubleId?: number;

  @Field(() => Int, { nullable: true })
  zoneId?: number;

  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  immeublesVisites: number;

  @Field(() => Int)
  rendezVousPris: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  absents: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  nbImmeublesProspectes: number;

  @Field(() => Int)
  nbPortesProspectes: number;
}

@InputType()
export class UpdateStatisticInput extends PartialType(CreateStatisticInput) {
  @Field(() => Int)
  id: number;
}

@ObjectType()
export class TimelinePoint {
  @Field()
  date: Date;

  @Field(() => Int)
  rdvPris: number;

  @Field(() => Int)
  portesProspectees: number;

  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  absents: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  repassages: number;
}

@ObjectType()
export class OwnerActivityStatistic {
  @Field(() => Int)
  userId: number;

  @Field(() => String)
  userType: string;

  @Field(() => String)
  userName: string;

  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  rendezVousPris: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  absents: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  repassages: number;

  @Field(() => Int)
  nbPortesProspectes: number;

  @Field(() => Float)
  tauxConversion: number;

  @Field(() => Int)
  points: number;

  @Field({ nullable: true })
  lastActivityAt?: Date;
}

@ObjectType()
export class TeamLastStatusActivity {
  @Field(() => Int)
  userId: number;

  @Field(() => String)
  userType: string;

  @Field(() => String)
  userName: string;

  @Field(() => String)
  statut: string;

  @Field()
  changedAt: Date;

  @Field(() => Int)
  porteId: number;

  @Field(() => String)
  porteNumero: string;

  @Field(() => Int, { nullable: true })
  immeubleId?: number;

  @Field(() => String, { nullable: true })
  immeubleAdresse?: string;
}

/**
 * Totaux d'activité sur une plage, calculés depuis `StatusHistorique`
 * (`nbContrats` respecté pour les contrats signés).
 */
@ObjectType()
export class StatsPeriodTotals {
  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  rendezVousPris: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  absents: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  repassages: number;

  @Field(() => Int)
  nbPortesProspectes: number;

  /** Portes distinctes touchées (une porte revisitée ne compte qu'une fois). */
  @Field(() => Int)
  nbPortesDistinctes: number;

  /** Intervenants ayant produit au moins un évènement sur la plage. */
  @Field(() => Int)
  nbIntervenants: number;

  /** Journées distinctes d'activité — dénominateur des moyennes « par jour ». */
  @Field(() => Int)
  nbJoursActifs: number;

  @Field(() => Float)
  tauxConversion: number;

  @Field(() => Float)
  tauxContact: number;

  @Field(() => Float)
  tauxRdv: number;
}

/**
 * Période courante + période immédiatement précédente de même durée, pour que
 * chaque KPI puisse s'afficher avec son delta (aucun chiffre nu).
 */
@ObjectType()
export class StatsPeriodComparison {
  @Field(() => StatsPeriodTotals)
  current: StatsPeriodTotals;

  @Field(() => StatsPeriodTotals, { nullable: true })
  previous?: StatsPeriodTotals;
}

/** Agrégat d'effort issu de `StatusHistorique.duree` (secondes). */
@ObjectType()
export class StatsEffort {
  /** Évènements porteurs d'une durée exploitable. */
  @Field(() => Int)
  nbPassagesMesures: number;

  /** Évènements sans durée — mesure l'incomplétude de la donnée. */
  @Field(() => Int)
  nbPassagesSansDuree: number;

  @Field(() => Int)
  dureeTotaleSec: number;

  @Field(() => Float)
  dureeMoyenneParPassageSec: number;

  @Field(() => Float)
  dureeMedianeParPassageSec: number;

  @Field(() => Float, { nullable: true })
  dureeParContratSignesSec?: number;

  @Field(() => Float, { nullable: true })
  dureeParRdvSec?: number;

  @Field(() => Float)
  passagesParHeure: number;
}

/** Un point de la série des contrats validés (back-office WinLeadPlus). */
@ObjectType()
export class ContratsValidesPoint {
  /** Clé de période telle que stockée : "2026-08-04", "2026-W32", "2026-08". */
  @Field()
  periodKey: string;

  @Field(() => Int)
  contratsValides: number;
}

/**
 * Contrats validés agrégés sur la plage, avec la série temporelle et le délai
 * signature → validation. S'appuie sur les clés de période pré-calculées de
 * `ContratValide`.
 */
@ObjectType()
export class ContratsValidesAggregate {
  @Field(() => Int)
  total: number;

  @Field(() => Int, { nullable: true })
  totalPrevious?: number;

  @Field(() => [ContratsValidesPoint])
  series: ContratsValidesPoint[];

  /** Délai médian entre signature terrain et validation back-office, en jours. */
  @Field(() => Float, { nullable: true })
  delaiMedianValidationJours?: number;

  /** Contrats validés sans date de signature — délai non calculable. */
  @Field(() => Int)
  nbSansDateSignature: number;
}

/** Une tranche d'ancienneté du stock de travail en attente. */
@ObjectType()
export class PipelineAgeBucket {
  @Field()
  label: string;

  @Field(() => Int)
  count: number;
}

/** Portes laissées en `ABSENT` : le travail de repassage qui reste à faire. */
@ObjectType()
export class RepassageStock {
  @Field(() => Int)
  total: number;

  @Field(() => [PipelineAgeBucket])
  buckets: PipelineAgeBucket[];

  @Field(() => Int, { nullable: true })
  plusAncienJours?: number;
}

/**
 * Portes en `RENDEZ_VOUS_PRIS`. `enRetard` = date passée et porte toujours en RDV :
 * un rendez-vous qui n'a jamais été conclu ni requalifié.
 */
@ObjectType()
export class RdvStock {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  aujourdhui: number;

  @Field(() => Int)
  aVenir: number;

  @Field(() => Int)
  enRetard: number;

  @Field(() => Int)
  sansDate: number;

  @Field(() => Int, { nullable: true })
  plusEnRetardJours?: number;
}

/** Portes arrivées à un statut terminal — le stock déjà tranché. */
@ObjectType()
export class ConclusionStock {
  @Field(() => Int)
  contratsSignes: number;

  @Field(() => Int)
  argumentes: number;

  @Field(() => Int)
  refus: number;

  @Field(() => Int)
  total: number;
}

/**
 * Stock ventilé par type d'habitat. Une porte d'immeuble et une maison ne
 * représentent pas le même effort : les agréger masque la composition du portefeuille.
 */
@ObjectType()
export class HabitatStock {
  @Field()
  typeHabitat: string;

  @Field(() => Int)
  batiments: number;

  @Field(() => Int)
  portesCreees: number;

  /**
   * Capacité déclarée à la création (la « grille »), dénominateur canonique de la
   * couverture. Distincte de `portesCreees` : le mobile crée les portes une par une,
   * donc les portes existantes ne représentent que ce qui a déjà été abordé.
   */
  @Field(() => Int)
  capaciteDeclaree: number;

  @Field(() => Int)
  prospectees: number;

  @Field(() => Int)
  aTraiter: number;

  /** `prospectees / capaciteDeclaree`, ou 0 si aucune grille n'est déclarée. */
  @Field(() => Float)
  couverture: number;
}

/**
 * Efficacité du repassage : parmi les portes déjà passées par `ABSENT`, combien
 * ont fini par être conclues.
 *
 * Calculé sur `StatusHistorique`, donc sur les **changements** de statut : un
 * repassage qui laisse la porte en `ABSENT` n'y figure pas. Le taux mesure donc
 * « absent → conclu », pas le nombre de passages nécessaires.
 */
@ObjectType()
export class RepriseStats {
  @Field(() => Int)
  portesPasseesParAbsent: number;

  @Field(() => Int)
  portesConclues: number;

  @Field(() => Int)
  portesEncoreAbsentes: number;

  @Field(() => Float)
  tauxReprise: number;
}

/**
 * État courant du travail de prospection — un **stock**, pas un flux.
 *
 * Interrogé sur `Porte` (sauf `reprise`), donc insensible au fait que
 * `StatusHistorique` ne consigne que les changements de statut.
 */
@ObjectType()
export class ProspectionPipeline {
  @Field(() => RepassageStock)
  repassages: RepassageStock;

  @Field(() => RdvStock)
  rdv: RdvStock;

  @Field(() => ConclusionStock)
  conclusions: ConclusionStock;

  @Field(() => Int)
  nonVisitees: number;

  @Field(() => [HabitatStock])
  habitat: HabitatStock[];

  @Field(() => RepriseStats)
  reprise: RepriseStats;
}

@ObjectType()
export class ZoneStatistic {
  @Field(() => Int)
  zoneId: number;

  @Field(() => String)
  zoneName: string;

  @Field(() => Int)
  totalContratsSignes: number;

  @Field(() => Int)
  totalImmeublesVisites: number;

  @Field(() => Int)
  totalRendezVousPris: number;

  @Field(() => Int)
  totalRefus: number;

  @Field(() => Int)
  totalImmeublesProspectes: number;

  @Field(() => Int)
  totalPortesProspectes: number;

  @Field(() => Float)
  tauxConversion: number;

  @Field(() => Float)
  tauxSuccesRdv: number;

  @Field(() => Int)
  nombreCommerciaux: number;

  @Field(() => Float)
  performanceGlobale: number;
}
