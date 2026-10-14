import { describe, expect, it } from 'vitest'
import { formatDuration } from './CoachingComponents'

describe('formatDuration', () => {
  it('m:ss sous l’heure, h:mm:ss au-delà', () => {
    expect(formatDuration(21)).toBe('0:21')
    expect(formatDuration(2915)).toBe('48:35')
    expect(formatDuration(9683)).toBe('2:41:23')
  })

  it('arrondit avant de découper : jamais « 0:60 »', () => {
    expect(formatDuration(59.6)).toBe('1:00')
    expect(formatDuration(3599.7)).toBe('1:00:00')
  })

  it('« — » sans durée exploitable', () => {
    expect([0, -3, null, undefined, NaN].map(formatDuration)).toEqual(['—', '—', '—', '—', '—'])
  })
})
