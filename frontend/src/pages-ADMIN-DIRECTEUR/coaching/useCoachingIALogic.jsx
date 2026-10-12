import { useCallback, useEffect, useRef, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'

const POLL_INTERVAL_MS = 6000

/** Logique du dashboard de gestion Coaching (file + config). */
export function useCoachingIALogic() {
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [config, setConfig] = useState({
    coachableStatuts: [],
    allStatuts: [],
    minAutoDurationSec: 120,
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const pollRef = useRef(null)

  // Rafraîchit l'état temps réel (file + compteurs + derniers analysés).
  const refresh = useCallback(async () => {
    const [s, q] = await Promise.all([
      CoachingService.stats(),
      CoachingService.queue(),
    ])
    if (s) setStats(s)
    setQueue(q || [])
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [c] = await Promise.all([CoachingService.getConfig(), refresh()])
      if (!active) return
      if (c) setConfig(c)
      setLoading(false)
    })()
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      active = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  const saveCoachableStatuts = useCallback(
    async (statuts) => {
      setSavingConfig(true)
      try {
        const updated = await CoachingService.setCoachableStatuts(statuts)
        if (updated) setConfig(updated)
        await refresh()
      } catch (e) {
        setError(e?.message || 'Échec de la mise à jour des statuts')
      } finally {
        setSavingConfig(false)
      }
    },
    [refresh],
  )

  const saveMinDuration = useCallback(async (seconds) => {
    setSavingConfig(true)
    try {
      const updated = await CoachingService.setMinAutoDurationSec(seconds)
      if (updated) setConfig(updated)
    } catch (e) {
      setError(e?.message || 'Échec de la mise à jour de la durée minimale')
    } finally {
      setSavingConfig(false)
    }
  }, [])

  const saveSynthesisCron = useCallback(async ({ frequency, hour, minute, weekday }) => {
    setSavingConfig(true)
    try {
      const updated = await CoachingService.setSynthesisCron(
        frequency,
        hour,
        minute,
        weekday,
      )
      if (updated) setConfig(updated)
    } catch (e) {
      setError(e?.message || 'Échec de la mise à jour de la planification')
    } finally {
      setSavingConfig(false)
    }
  }, [])

  return {
    stats,
    queue,
    loading,
    error,
    config,
    savingConfig,
    saveCoachableStatuts,
    saveMinDuration,
    saveSynthesisCron,
  }
}
