import { useCallback, useEffect, useMemo, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'

/**
 * Analyses coaching (référentiel actif) des enregistrements affichés, indexées par
 * clé S3. Un seul appel groupé par lot ; les lots successifs (pagination, autre
 * utilisateur) s'ajoutent à la map au lieu de la remplacer.
 *
 * `coachingStatusOf(key)` distingue « pas encore su » (`loading`), « appel échoué »
 * (`error`) et « su » (`resolved`) : l'absence d'analyse n'est fiable qu'une fois
 * la clé résolue, sinon on proposerait de relancer une analyse déjà faite.
 */
export function useRecordingsCoaching(recordings) {
  const [analysesByKey, setAnalysesByKey] = useState(() => new Map())
  const [resolvedKeys, setResolvedKeys] = useState(() => new Set())
  const [failedKeys, setFailedKeys] = useState(() => new Set())
  const [attempt, setAttempt] = useState(0)

  // Signature stable : un nouveau tableau aux mêmes clés ne relance pas l'appel.
  const keysSignature = useMemo(
    () => [...new Set(recordings.map(r => r.key).filter(Boolean))].sort().join('\n'),
    [recordings]
  )

  useEffect(() => {
    if (!keysSignature) return
    const keys = keysSignature.split('\n')
    let active = true
    CoachingService.byS3Keys(keys)
      .then(analyses => {
        if (!active) return
        setAnalysesByKey(prev => {
          const next = new Map(prev)
          analyses.forEach(analysis => next.set(analysis.s3KeyOriginal, analysis))
          return next
        })
        setResolvedKeys(prev => new Set([...prev, ...keys]))
      })
      .catch(error => {
        console.error('Erreur chargement des analyses coaching:', error)
        if (active) setFailedKeys(prev => new Set([...prev, ...keys]))
      })
    return () => {
      active = false
    }
  }, [keysSignature, attempt])

  const coachingStatusOf = useCallback(
    key => (resolvedKeys.has(key) ? 'resolved' : failedKeys.has(key) ? 'error' : 'loading'),
    [resolvedKeys, failedKeys]
  )

  const retry = useCallback(() => {
    setFailedKeys(new Set())
    setAttempt(n => n + 1)
  }, [])

  const setAnalysis = useCallback(analysis => {
    setAnalysesByKey(prev => new Map(prev).set(analysis.s3KeyOriginal, analysis))
  }, [])

  return { analysesByKey, coachingStatusOf, retry, setAnalysis }
}
