/**
 * Calculs purs des métriques de pilotage — extraits de `StatisticService` pour être
 * testables sans base de données.
 *
 * Tout ce qui touche aux bornes de période, au décompte de portes déclarées et aux
 * tranches d'ancienneté vit ici : ce sont les endroits où une erreur passe inaperçue
 * (bord d'année, pavillon sans grille, plage d'un seul jour) et où un test vaut mieux
 * qu'une relecture.
 */

/** Arrondi à une décimale, format des taux exposés par l'API. */
export function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Date valide, ou `undefined` si l'entrée n'en est pas une. */
export function normalizeDate(date?: Date | string): Date | undefined {
  if (!date) return undefined;
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

/**
 * Médiane d'une série. Renvoie 0 sur une série vide — l'appelant décide s'il expose
 * la valeur ou un « — », il a le compte sous la main pour trancher.
 */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Plage immédiatement antérieure, de durée identique et **contiguë**.
 *
 * La plage précédente s'arrête 1 ms avant le début de la plage courante : sans ce
 * décalage, un évènement pile à la borne serait compté dans les deux périodes et le
 * delta serait faux.
 *
 * Renvoie `null` si la plage n'est pas bornée des deux côtés — sans bornes, « la
 * période précédente » n'a pas de définition.
 */
export function previousRange(
  startDate?: Date,
  endDate?: Date,
): { startDate: Date; endDate: Date } | null {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return null;

  const span = end.getTime() - start.getTime();
  if (span < 0) return null;

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - span);
  return { startDate: previousStart, endDate: previousEnd };
}

export type DeclarableImmeuble = {
  typeHabitat: string;
  nbEtages: number;
  nbPortesParEtage: number;
  nbMaisonsPrevu: number | null;
};

/**
 * Type d'habitat effectif : un pavillon créé avant le correctif
 * (`nbPortesParEtage > 1`) se comporte comme un immeuble.
 *
 * Miroir de `effectiveTypeHabitat` côté web — les deux doivent rester alignés.
 */
export function effectiveTypeHabitat(immeuble: {
  typeHabitat: string;
  nbPortesParEtage?: number | null;
}): string {
  if (
    immeuble.typeHabitat === 'PAVILLON' &&
    (immeuble.nbPortesParEtage ?? 1) > 1
  ) {
    return 'IMMEUBLE';
  }
  return immeuble.typeHabitat;
}

/**
 * Nombre de portes **déclarées** à la création (la « grille »), dénominateur
 * canonique de la couverture. Pas le nombre de portes créées : le mobile les crée
 * une par une au fil de la prospection, donc les compter ferait tendre la couverture
 * vers 100 %.
 *
 * Miroir de `buildingDoorCount` côté web, replis compris — un pavillon sans
 * `nbMaisonsPrevu` vaut 0, ce qui rend sa couverture non calculable plutôt que
 * fausse.
 */
export function declaredDoorCount(immeuble: DeclarableImmeuble): number {
  const effectif = effectiveTypeHabitat(immeuble);

  if (effectif === 'MAISON') return 1;
  if (effectif === 'PAVILLON') return immeuble.nbMaisonsPrevu ?? 0;
  return (immeuble.nbEtages ?? 0) * (immeuble.nbPortesParEtage ?? 0);
}

/** Tranches d'ancienneté du stock de repassages, bornes hautes incluses. */
export const AGE_BUCKETS: { label: string; maxDays: number }[] = [
  { label: '0–3 j', maxDays: 3 },
  { label: '4–7 j', maxDays: 7 },
  { label: '8–14 j', maxDays: 14 },
  { label: '15–30 j', maxDays: 30 },
  { label: '+ de 30 j', maxDays: Number.POSITIVE_INFINITY },
];

/**
 * Index de la tranche d'ancienneté pour un nombre de jours donné.
 * Une ancienneté négative (date de visite dans le futur, horloge décalée) retombe
 * sur la première tranche plutôt que de sortir du tableau.
 */
export function ageBucketIndex(days: number): number {
  const index = AGE_BUCKETS.findIndex((bucket) => days <= bucket.maxDays);
  return index >= 0 ? index : AGE_BUCKETS.length - 1;
}

/**
 * Clé de semaine ISO-8601 (`2026-W32`).
 *
 * La semaine appartient à l'année de son **jeudi** : un 1er janvier peut donc relever
 * de la semaine 52 ou 53 de l'année précédente. C'est pour ça que l'année est lue
 * **après** le décalage vers le jeudi, et non prise sur la date d'origine.
 *
 * ⚠️ `ContratValide.periodWeek` (colonne persistée, remplie par
 * `contrat.service.computePeriodKeys`) ne respecte pas cette règle : elle concatène
 * l'année calendaire au numéro de semaine ISO. Au 1ᵉʳ janvier 2027 elle produit
 * `2027-W53`, une semaine qui n'existe pas, et fin décembre 2024 elle produit
 * `2024-W01`, qui collisionne avec la vraie première semaine de 2024. Les agrégats de
 * pilotage n'utilisent donc PAS cette colonne : ils regroupent via ce helper. Corriger
 * la colonne demanderait un backfill, ce qui est une décision séparée.
 */
export function isoWeekKey(date: Date): string {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type PeriodGranularity = 'day' | 'week' | 'month';

/**
 * Clé de regroupement d'une date selon la granularité, sur les composantes
 * **locales** — cohérent avec le reste des clés de période du projet.
 */
export function periodKeyFor(
  date: Date,
  granularity: PeriodGranularity,
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  if (granularity === 'month') return `${year}-${month}`;
  if (granularity === 'week') return isoWeekKey(date);
  return `${year}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Taux de conversion : signés sur les portes ayant donné une opportunité. */
export function tauxConversion(
  contratsSignes: number,
  rendezVousPris: number,
  refus: number,
): number {
  const opportunites = contratsSignes + rendezVousPris + refus;
  return opportunites > 0 ? roundRate((contratsSignes / opportunites) * 100) : 0;
}
