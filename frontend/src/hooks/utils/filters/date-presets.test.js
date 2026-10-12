import { describe, it, expect } from 'vitest'
import { getDatePreset } from '@/hooks/utils/filters/date-presets'

// Mardi 4 août 2026, 21 h locales — le scénario « le directeur consulte le soir ».
const EVENING = new Date(2026, 7, 4, 21, 0, 0)

describe('getDatePreset', () => {
  it('« today » couvre bien le jour même, pas une plage vide', () => {
    // Régression : le début était posé au lendemain, la plage ne renvoyait rien.
    expect(getDatePreset('today', EVENING)).toEqual({
      start: '2026-08-04',
      end: '2026-08-04',
    })
  })

  it('ne recule pas les bornes dun jour à cause dUTC', () => {
    // Régression : `toISOString()` sur minuit local (UTC+2) donnait la veille.
    const midnight = new Date(2026, 7, 4, 0, 30, 0)
    expect(getDatePreset('today', midnight).start).toBe('2026-08-04')
    expect(getDatePreset('last7days', midnight).start).toBe('2026-07-29')
  })

  it('« yesterday » couvre la veille seule', () => {
    expect(getDatePreset('yesterday', EVENING)).toEqual({
      start: '2026-08-03',
      end: '2026-08-03',
    })
  })

  it('les fenêtres glissantes incluent le jour courant', () => {
    expect(getDatePreset('last7days', EVENING)).toEqual({
      start: '2026-07-29',
      end: '2026-08-04',
    })
    expect(getDatePreset('last30days', EVENING).start).toBe('2026-07-06')
  })

  it('« thisWeek » démarre le lundi', () => {
    // Le 4 août 2026 est un mardi : le lundi est le 3.
    expect(getDatePreset('thisWeek', EVENING)).toEqual({
      start: '2026-08-03',
      end: '2026-08-04',
    })
  })

  it('traite le dimanche comme fin de semaine, pas comme début', () => {
    const sunday = new Date(2026, 7, 9, 12, 0, 0)
    expect(getDatePreset('thisWeek', sunday).start).toBe('2026-08-03')
  })

  it('« lastWeek » couvre lundi à dimanche de la semaine précédente', () => {
    expect(getDatePreset('lastWeek', EVENING)).toEqual({
      start: '2026-07-27',
      end: '2026-08-02',
    })
  })

  it('« thisMonth » démarre au 1er', () => {
    expect(getDatePreset('thisMonth', EVENING)).toEqual({
      start: '2026-08-01',
      end: '2026-08-04',
    })
  })

  it('« lastMonth » couvre le mois précédent en entier', () => {
    expect(getDatePreset('lastMonth', EVENING)).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    })
  })

  it('gère le passage dannée pour le mois précédent', () => {
    const january = new Date(2026, 0, 15, 12, 0, 0)
    expect(getDatePreset('lastMonth', january)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    })
  })

  it('« all » rend des bornes vides', () => {
    expect(getDatePreset('all', EVENING)).toEqual({ start: '', end: '' })
  })
})
