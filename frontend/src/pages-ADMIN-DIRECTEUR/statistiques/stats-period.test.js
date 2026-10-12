import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PERIOD_DAYS,
  defaultRange,
  granularityForRange,
  isoWeekKey,
  periodKeyForDate,
  toIsoEnd,
  toIsoStart,
  toLocalISODate,
} from './stats-period'

/** Date locale, sans passer par un parsing de chaîne (qui bascule en UTC). */
const local = (y, m, d, h = 0) => new Date(y, m - 1, d, h)

describe('stats-period', () => {
  describe('toLocalISODate', () => {
    it('formate sur les composantes locales', () => {
      expect(toLocalISODate(local(2026, 8, 5))).toBe('2026-08-05')
    })

    it('zéro-pad mois et jour', () => {
      expect(toLocalISODate(local(2026, 1, 3))).toBe('2026-01-03')
    })

    it('ne recule pas d’un jour en fin de soirée', () => {
      // Le piège de `toISOString()` : 23 h heure locale devient le lendemain ou la
      // veille en UTC selon le fuseau. Les composantes locales n'ont pas ce défaut.
      expect(toLocalISODate(local(2026, 8, 5, 23))).toBe('2026-08-05')
      expect(toLocalISODate(local(2026, 8, 5, 1))).toBe('2026-08-05')
    })
  })

  describe('defaultRange', () => {
    it('couvre les 30 derniers jours, bornes incluses', () => {
      const { start, end } = defaultRange(local(2026, 8, 5))
      expect(end).toBe('2026-08-05')
      // 30 jours inclusifs → on remonte de 29 jours.
      expect(start).toBe('2026-07-07')
    })

    it('produit une plage de DEFAULT_PERIOD_DAYS jours', () => {
      const { start, end } = defaultRange(local(2026, 8, 5))
      const spanDays =
        (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000
      expect(spanDays + 1).toBe(DEFAULT_PERIOD_DAYS)
    })

    it('traverse un changement de mois et d’année', () => {
      const { start } = defaultRange(local(2026, 1, 10))
      expect(start).toBe('2025-12-12')
    })
  })

  describe('toIsoStart / toIsoEnd', () => {
    it('borne le début à minuit local', () => {
      const iso = toIsoStart('2026-08-05')
      const date = new Date(iso)
      expect(date.getHours()).toBe(0)
      expect(date.getMinutes()).toBe(0)
      expect(date.getSeconds()).toBe(0)
      expect(date.getMilliseconds()).toBe(0)
    })

    it('borne la fin à la dernière milliseconde de la journée locale', () => {
      // Sans ça, une fin de période au 5 août excluait la journée du 5.
      const date = new Date(toIsoEnd('2026-08-05'))
      expect(date.getHours()).toBe(23)
      expect(date.getMinutes()).toBe(59)
      expect(date.getSeconds()).toBe(59)
      expect(date.getMilliseconds()).toBe(999)
    })

    it('encadre bien la journée : début < fin, même date locale', () => {
      const start = new Date(toIsoStart('2026-08-05'))
      const end = new Date(toIsoEnd('2026-08-05'))
      expect(start.getTime()).toBeLessThan(end.getTime())
      expect(toLocalISODate(start)).toBe('2026-08-05')
      expect(toLocalISODate(end)).toBe('2026-08-05')
    })

    it('renvoie undefined sur une valeur vide ou invalide', () => {
      expect(toIsoStart('')).toBeUndefined()
      expect(toIsoStart(null)).toBeUndefined()
      expect(toIsoStart('pas-une-date')).toBeUndefined()
      expect(toIsoEnd('')).toBeUndefined()
      expect(toIsoEnd('pas-une-date')).toBeUndefined()
    })
  })

  describe('granularityForRange', () => {
    const range = (startLocal, endLocal) => [toIsoStart(startLocal), toIsoEnd(endLocal)]

    it('regroupe au jour sur une période courte', () => {
      expect(granularityForRange(...range('2026-08-01', '2026-08-05'))).toBe('day')
      expect(granularityForRange(...range('2026-07-07', '2026-08-05'))).toBe('day')
    })

    it('bascule à la semaine au-delà de 45 jours', () => {
      expect(granularityForRange(...range('2026-06-01', '2026-08-05'))).toBe('week')
    })

    it('bascule au mois au-delà de 200 jours', () => {
      expect(granularityForRange(...range('2025-08-05', '2026-08-05'))).toBe('month')
    })

    it('retombe sur le mois quand une borne manque', () => {
      expect(granularityForRange(undefined, undefined)).toBe('month')
      expect(granularityForRange(toIsoStart('2026-08-01'), undefined)).toBe('month')
    })

    it('retombe sur le mois sur une borne illisible', () => {
      expect(granularityForRange('pas-une-date', 'non-plus')).toBe('month')
    })
  })

  describe('isoWeekKey', () => {
    it('numérote une semaine ordinaire', () => {
      expect(isoWeekKey(local(2026, 8, 5))).toBe('2026-W32')
    })

    it('rattache le 1er janvier à l’année ISO de son jeudi', () => {
      // 1er janvier 2027 est un vendredi → ISO 2026-W53.
      expect(isoWeekKey(local(2027, 1, 1))).toBe('2026-W53')
    })

    it('rattache une fin décembre à la première semaine suivante', () => {
      // 31 décembre 2024 est un mardi → ISO 2025-W01.
      expect(isoWeekKey(local(2024, 12, 31))).toBe('2025-W01')
    })

    it('donne une clé unique par semaine ISO dans une même année', () => {
      expect(isoWeekKey(local(2024, 1, 2))).toBe('2024-W01')
      expect(isoWeekKey(local(2024, 12, 31))).not.toBe('2024-W01')
    })

    it('donne la même clé pour tous les jours d’une semaine', () => {
      const keys = [3, 4, 5, 6, 7, 8, 9].map(day => isoWeekKey(local(2026, 8, day)))
      expect(new Set(keys).size).toBe(1)
    })

    it('change de clé entre dimanche et lundi', () => {
      expect(isoWeekKey(local(2026, 8, 9))).toBe('2026-W32')
      expect(isoWeekKey(local(2026, 8, 10))).toBe('2026-W33')
    })
  })

  describe('periodKeyForDate', () => {
    const date = local(2026, 8, 5)

    it('produit les trois formats de clé', () => {
      expect(periodKeyForDate(date, 'day')).toBe('2026-08-05')
      expect(periodKeyForDate(date, 'week')).toBe('2026-W32')
      expect(periodKeyForDate(date, 'month')).toBe('2026-08')
    })

    it('retombe sur le jour pour une granularité inconnue', () => {
      expect(periodKeyForDate(date, 'trimestre')).toBe('2026-08-05')
    })

    it('produit des clés dont l’ordre lexicographique est l’ordre du temps', () => {
      // Le graphe trie ses points par `periodKey.localeCompare` : le format doit
      // garantir cette propriété, sinon les barres sortent dans le désordre.
      const jours = [local(2026, 1, 3), local(2026, 9, 12), local(2026, 11, 1)].map(d =>
        periodKeyForDate(d, 'day')
      )
      expect([...jours].sort((a, b) => a.localeCompare(b))).toEqual(jours)

      const mois = [local(2026, 1, 3), local(2026, 9, 12), local(2026, 11, 1)].map(d =>
        periodKeyForDate(d, 'month')
      )
      expect([...mois].sort((a, b) => a.localeCompare(b))).toEqual(mois)
    })
  })
})
