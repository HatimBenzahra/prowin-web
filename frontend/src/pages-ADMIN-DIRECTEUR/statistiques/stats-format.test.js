import { describe, it, expect } from 'vitest'
import {
  delta,
  formatDayLabel,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPeriodKey,
} from './stats-format'

describe('stats-format', () => {
  describe('formatNumber', () => {
    it('formate à la française avec séparateur de milliers', () => {
      // Espace insécable étroite en fr-FR : on compare sur les chiffres pour ne pas
      // dépendre du caractère exact d'espacement de l'ICU.
      expect(formatNumber(1234).replace(/\s/g, ' ')).toBe('1 234')
    })

    it('respecte le nombre de décimales demandé', () => {
      expect(formatNumber(12.34, 1)).toBe('12,3')
      expect(formatNumber(12.35, 1)).toBe('12,4')
      expect(formatNumber(12, 1)).toBe('12,0')
    })

    it('arrondit à l’entier par défaut', () => {
      expect(formatNumber(12.6)).toBe('13')
    })

    it('renvoie un zéro lisible sur une entrée non numérique', () => {
      expect(formatNumber(undefined)).toBe('0')
      expect(formatNumber(null)).toBe('0')
      expect(formatNumber(NaN)).toBe('0')
      expect(formatNumber('12')).toBe('0')
      expect(formatNumber(undefined, 1)).toBe('0,0')
    })
  })

  describe('formatPercent', () => {
    it('affiche une décimale et le symbole', () => {
      expect(formatPercent(33.333)).toBe('33,3 %')
      expect(formatPercent(0)).toBe('0,0 %')
    })
  })

  describe('formatDuration', () => {
    it('affiche les secondes en dessous d’une minute', () => {
      expect(formatDuration(45)).toBe('45 s')
      expect(formatDuration(59)).toBe('59 s')
    })

    it('affiche les minutes en dessous d’une heure', () => {
      expect(formatDuration(60)).toBe('1 min')
      expect(formatDuration(754)).toBe('12 min')
      expect(formatDuration(3599)).toBe('59 min')
    })

    it('affiche heures et minutes au-delà d’une heure', () => {
      expect(formatDuration(3600)).toBe('1 h 00')
      expect(formatDuration(5040)).toBe('1 h 24')
      expect(formatDuration(36000)).toBe('10 h 00')
    })

    it('zéro-pad les minutes', () => {
      expect(formatDuration(3660)).toBe('1 h 01')
    })

    it('renvoie un tiret sur une durée absente, nulle ou négative', () => {
      expect(formatDuration(0)).toBe('—')
      expect(formatDuration(-10)).toBe('—')
      expect(formatDuration(null)).toBe('—')
      expect(formatDuration(undefined)).toBe('—')
      expect(formatDuration(NaN)).toBe('—')
      expect(formatDuration(Infinity)).toBe('—')
    })

    it('arrondit les fractions de seconde', () => {
      expect(formatDuration(45.6)).toBe('46 s')
    })
  })

  describe('delta', () => {
    it('calcule un écart positif et négatif', () => {
      expect(delta(12, 10)).toBe(2)
      expect(delta(8, 10)).toBe(-2)
    })

    it('renvoie 0 sur deux valeurs égales', () => {
      expect(delta(10, 10)).toBe(0)
    })

    it('arrondit à une décimale', () => {
      expect(delta(10.55, 10)).toBe(0.6)
    })

    it('renvoie null si la référence manque — pas de comparaison possible', () => {
      // Distinct de 0 : « pas de période précédente » n'est pas « stable ».
      expect(delta(12, undefined)).toBeNull()
      expect(delta(12, null)).toBeNull()
      expect(delta(undefined, 10)).toBeNull()
    })

    it('accepte une référence à zéro', () => {
      expect(delta(5, 0)).toBe(5)
    })
  })

  describe('formatPeriodKey', () => {
    it('formate une clé de jour', () => {
      expect(formatPeriodKey('2026-08-05')).toBe('05 août')
    })

    it('formate une clé de semaine', () => {
      expect(formatPeriodKey('2026-W32')).toBe('S32')
    })

    it('formate une clé de mois', () => {
      expect(formatPeriodKey('2026-08')).toMatch(/août 2026/)
    })

    it('renvoie une chaîne vide sur une clé absente', () => {
      expect(formatPeriodKey('')).toBe('')
      expect(formatPeriodKey(null)).toBe('')
    })

    it('renvoie la clé brute si elle est illisible', () => {
      expect(formatPeriodKey('n’importe-quoi')).toBe('n’importe-quoi')
    })
  })

  describe('formatDayLabel', () => {
    it('formate une date ISO en jour/mois', () => {
      expect(formatDayLabel('2026-08-05T00:00:00.000Z')).toBe('05/08')
    })

    it('renvoie une chaîne vide sur une date invalide', () => {
      expect(formatDayLabel('pas-une-date')).toBe('')
    })
  })
})
