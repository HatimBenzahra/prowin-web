import { useCallback, useEffect, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'

/** Le référentiel coaching actif (plan + produits), rechargeable après une publication. */
export function useActiveReference() {
  const [reference, setReference] = useState(null)
  const [loading, setLoading] = useState(true)
  const { showError } = useErrorToast()

  const reload = useCallback(async () => {
    try {
      setReference(await CoachingService.activeReference())
    } catch (error) {
      showError(error, 'useActiveReference')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    reload()
  }, [reload])

  return { reference, loading, reload }
}
