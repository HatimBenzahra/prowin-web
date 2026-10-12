/**
 * Formate une date en `YYYY-MM-DD` sur ses composantes LOCALES.
 *
 * Ne pas repasser par `toISOString()` : il convertit en UTC, si bien qu'une date
 * posée à minuit heure française devenait 22:00 la veille et reculait d'un jour.
 * Toutes les bornes de début étaient donc décalées.
 */
const toLocalISODate = date => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Décale une date d'un nombre de jours, sans muter l'originale. */
const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Bornes `{ start, end }` d'un preset, en dates locales inclusives.
 *
 * Exporté pour être testé : cette fonction portait deux défauts de calcul — « today »
 * démarrait le lendemain (plage vide) et toutes les bornes reculaient d'un jour via UTC.
 *
 * @param {string} preset - Identifiant d'un DATE_PRESETS
 * @param {Date} [now] - Injectable pour les tests
 */
export const getDatePreset = (preset, now = new Date()) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (preset) {
    case 'today':
      return { start: toLocalISODate(today), end: toLocalISODate(today) }

    case 'yesterday': {
      const yesterday = addDays(today, -1)
      return { start: toLocalISODate(yesterday), end: toLocalISODate(yesterday) }
    }

    case 'last7days':
      return { start: toLocalISODate(addDays(today, -6)), end: toLocalISODate(today) }

    case 'last14days':
      return { start: toLocalISODate(addDays(today, -13)), end: toLocalISODate(today) }

    case 'last30days':
      return { start: toLocalISODate(addDays(today, -29)), end: toLocalISODate(today) }

    case 'thisWeek': {
      // Semaine à la française : lundi comme premier jour.
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      return { start: toLocalISODate(addDays(today, mondayOffset)), end: toLocalISODate(today) }
    }

    case 'lastWeek': {
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const thisMonday = addDays(today, mondayOffset)
      return {
        start: toLocalISODate(addDays(thisMonday, -7)),
        end: toLocalISODate(addDays(thisMonday, -1)),
      }
    }

    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: toLocalISODate(first), end: toLocalISODate(today) }
    }

    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: toLocalISODate(first), end: toLocalISODate(last) }
    }

    case 'all':
      return { start: '', end: '' }

    default:
      return { start: toLocalISODate(today), end: toLocalISODate(today) }
  }
}
