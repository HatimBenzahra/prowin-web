import { useCallback, useEffect, useRef, useState } from 'react'
import { RecordingService } from '@/services/audio'

/**
 * Audio d'un segment porte. Les segments récents n'ont plus de fichier découpé :
 * on lit alors l'enregistrement d'origine. Pour un ancien enregistrement couvrant
 * plusieurs portes et jamais découpé, le passage de la porte commence à
 * `startTime` : le lecteur s'y place dès qu'il est prêt (`onWavesurferReady`).
 */
export function useSegmentAudio(segment, { autoLoad = false } = {}) {
  const [audioUrl, setAudioUrl] = useState(null)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const inFlightRef = useRef(false)

  const audioKey = segment.s3KeySegment ?? segment.s3KeyOriginal
  const startOffset = segment.s3KeySegment ? 0 : segment.startTime || 0

  const loadAudio = useCallback(async () => {
    if (!audioKey || inFlightRef.current) return

    inFlightRef.current = true
    setLoadingAudio(true)
    setAudioError(null)
    try {
      const url = await RecordingService.getStreamingUrl(audioKey)
      setAudioUrl(url)
    } catch {
      setAudioError("Impossible de charger l'audio.")
    } finally {
      inFlightRef.current = false
      setLoadingAudio(false)
    }
  }, [audioKey])

  // Chargement automatique (modale) : pas de bouton, l'audio se prépare dès l'affichage.
  useEffect(() => {
    if (autoLoad) loadAudio()
  }, [autoLoad, loadAudio])

  const onWavesurferReady = useCallback(
    ws => {
      if (startOffset <= 0) return
      const duration = ws.getDuration()
      if (duration > 0) ws.seekTo(Math.min(startOffset / duration, 1))
    },
    [startOffset]
  )

  return { audioKey, audioUrl, loadingAudio, audioError, loadAudio, onWavesurferReady }
}
