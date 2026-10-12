import { StatutPorte } from '@/constants/domain/porte-status'

/**
 * Agrégations pures du bloc graphes de prospection.
 *
 * Rappel du modèle de statuts (backend/src/porte/porte-status.constants.ts) : chaque
 * entrée de StatusHistorique atterrit dans UNE issue et compte pour une porte
 * prospectée. Les issues forment donc une partition de `portesProspectees`, ce ne
 * sont pas des étapes emboîtées.
 *
 * Piège : `ARGUMENTE` a `incrementRefus: true`, donc le champ `refus` vaut
 * REFUS + ARGUMENTE et `argumentes` est un SOUS-ENSEMBLE de `refus`. Additionner
 * les deux comme des catégories sœurs dépasserait le total.
 */

/** Le jour du mois, lu dans la chaîne ISO pour éviter tout décalage de fuseau. */
function dayOfMonth(isoDate) {
  const day = Number(String(isoDate).slice(8, 10))
  return Number.isFinite(day) && day > 0 ? day : null
}

/**
 * Répartition des issues sur la période : cinq parts qui somment exactement à
 * `portesProspectees`, triées par volume décroissant.
 * @param {Array} points - TimelinePoint[]
 */
export function aggregateOutcomes(points) {
  const sums = {
    portesProspectees: 0,
    contratsSignes: 0,
    rdvPris: 0,
    absents: 0,
    refus: 0,
    repassages: 0,
    argumentes: 0,
  }

  for (const point of points || []) {
    sums.portesProspectees += point?.portesProspectees || 0
    sums.contratsSignes += point?.contratsSignes || 0
    sums.rdvPris += point?.rdvPris || 0
    sums.absents += point?.absents || 0
    sums.refus += point?.refus || 0
    sums.repassages += point?.repassages || 0
    sums.argumentes += point?.argumentes || 0
  }

  const total = sums.portesProspectees

  const buckets = [
    { statut: StatutPorte.CONTRAT_SIGNE, count: sums.contratsSignes },
    { statut: StatutPorte.RENDEZ_VOUS_PRIS, count: sums.rdvPris },
    { statut: StatutPorte.ABSENT, count: sums.absents },
    { statut: StatutPorte.REFUS, count: sums.refus },
    { statut: StatutPorte.NECESSITE_REPASSAGE, count: sums.repassages },
  ]
    .map(bucket => ({
      ...bucket,
      pct: total > 0 ? Math.round((bucket.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    total,
    buckets,
    // Détail interne aux refus, jamais une sixième part.
    argumentes: sums.argumentes,
    refusSecs: Math.max(0, sums.refus - sums.argumentes),
  }
}

/** Contrats signés cumulés par jour du mois. */
function cumulativeContractsByDay(points) {
  const byDay = new Map()
  for (const point of points || []) {
    const day = dayOfMonth(point?.date)
    if (day === null) continue
    byDay.set(day, (byDay.get(day) || 0) + (point?.contratsSignes || 0))
  }
  return byDay
}

/**
 * Deux courbes cumulées de contrats signés, mois en cours et mois précédent
 * tronqué au même jour du mois, pour savoir si on est en avance ou en retard.
 * @param {Array} currentPoints - TimelinePoint[] du mois en cours
 * @param {Array} previousPoints - TimelinePoint[] du mois précédent
 * @param {Date} [today]
 */
export function buildMonthlyPace(currentPoints, previousPoints, today = new Date()) {
  const currentByDay = cumulativeContractsByDay(currentPoints)
  const previousByDay = cumulativeContractsByDay(previousPoints)
  const lastDay = today.getDate()

  const series = []
  let current = 0
  let previous = 0

  for (let day = 1; day <= lastDay; day++) {
    current += currentByDay.get(day) || 0
    previous += previousByDay.get(day) || 0
    series.push({ day, current, previous })
  }

  return { series, current, previous, delta: current - previous }
}

/** Nombre de jours entiers écoulés depuis une date ISO, ou null si inexploitable. */
export function daysSince(isoDate, now = new Date()) {
  if (!isoDate) return null
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return null
  const diff = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  return diff < 0 ? 0 : diff
}

/**
 * Commerciaux triés par volume de portes prospectées.
 * `tauxConversion` est repris tel quel de l'agrégat backend : c'est la source de
 * vérité, le recalculer côté client ferait diverger le dashboard des autres pages.
 * @param {Array} owners - OwnerActivityStatistic[]
 */
export function rankTeamActivity(owners, { inactiveAfterDays = 3, now = new Date() } = {}) {
  return (owners || [])
    .map(owner => {
      const idleDays = daysSince(owner?.lastActivityAt, now)
      const refus = owner?.refus || 0
      const argumentes = owner?.argumentes || 0
      return {
        key: `${owner?.userType || 'commercial'}-${owner?.userId}`,
        userName: owner?.userName || `#${owner?.userId}`,
        portes: owner?.nbPortesProspectes || 0,
        absents: owner?.absents || 0,
        argumentes,
        // `refus` de l'agrégat backend inclut les ARGUMENTE (incrementRefus: true) :
        // on expose le refus sec pour que les deux colonnes ne se comptent pas deux
        // fois, et le brut pour qui aurait besoin du total.
        refus,
        refusSecs: Math.max(0, refus - argumentes),
        rdv: owner?.rendezVousPris || 0,
        contrats: owner?.contratsSignes || 0,
        tauxConversion: owner?.tauxConversion ?? null,
        idleDays,
        isIdle: idleDays !== null && idleDays >= inactiveAfterDays,
      }
    })
    .sort((a, b) => b.portes - a.portes)
}
