/**
 * Formatage partagé par les blocs de la page Statistiques.
 * Isolé ici pour que chaque carte affiche les mêmes chiffres de la même façon.
 */

export const formatNumber = (value, decimals = 0) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return decimals > 0 ? '0,0' : '0'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export const formatPercent = value => `${formatNumber(value, 1)} %`

/**
 * Durée lisible à partir de secondes : « 1 h 24 », « 12 min », « 45 s ».
 * On ne descend pas sous la seconde, la précision n'aurait pas de sens sur une
 * durée de passage relevée par le mobile.
 */
export const formatDuration = seconds => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—'

  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`
  if (minutes > 0) return `${minutes} min`
  return `${total} s`
}

/** Écart absolu entre deux valeurs, ou `null` si la référence manque. */
export const delta = (currentValue, previousValue) => {
  if (typeof currentValue !== 'number' || typeof previousValue !== 'number') return null
  return Math.round((currentValue - previousValue) * 10) / 10
}

/**
 * Libellé d'un point de série à partir d'une clé de période backend.
 * `2026-08-04` → « 04 août », `2026-W32` → « S32 », `2026-08` → « août 2026 ».
 */
export const formatPeriodKey = periodKey => {
  if (!periodKey) return ''

  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(periodKey)
  if (weekMatch) return `S${weekMatch[2]}`

  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const date = new Date(`${periodKey}-01T00:00:00`)
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  }

  const date = new Date(`${periodKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return periodKey
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

/** Date d'un point de timeline (ISO) → libellé court « 04/08 ». */
export const formatDayLabel = isoDate => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export const formatRelativeDate = dateValue => {
  if (!dateValue) return 'Jamais'

  const date = new Date(dateValue)
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return 'Date inconnue'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'À l’instant'
  if (minutes < 60) return `Il y a ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days} j`

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
