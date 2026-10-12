import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecordingService } from '@/services/audio'
import RecordingDetailModal from './RecordingDetailModal'
import { useRecordingsCoaching } from './useRecordingsCoaching'
import { Download, Loader2, Mic, Play, RefreshCw } from 'lucide-react'

const INITIAL_VISIBLE_COUNT = 6

const formatRecordingDate = value => {
  if (!value) return 'Date inconnue'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date inconnue'

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UserRecordingsSection({ userId, userType, userName }) {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [downloadingKey, setDownloadingKey] = useState(null)
  const { analysesByKey, coachingStatusOf, retry, setAnalysis } = useRecordingsCoaching(recordings)

  const normalizedUserType = userType?.toLowerCase()

  const loadRecordings = useCallback(async () => {
    if (!userId || !normalizedUserType) return

    setLoading(true)
    setError(null)

    try {
      const data = await RecordingService.getRecordingsForUser(userId, normalizedUserType)
      setRecordings(
        [...data].sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0))
      )
    } catch (loadError) {
      console.error('Erreur chargement enregistrements utilisateur:', loadError)
      setError('Impossible de charger les enregistrements.')
      setRecordings([])
    } finally {
      setLoading(false)
    }
  }, [normalizedUserType, userId])

  useEffect(() => {
    loadRecordings()
  }, [loadRecordings])

  const visibleRecordings = useMemo(() => {
    if (showAll) return recordings
    return recordings.slice(0, INITIAL_VISIBLE_COUNT)
  }, [recordings, showAll])

  const selectedRecording = selectedIndex == null ? null : recordings[selectedIndex]

  const handleDownload = useCallback(async recording => {
    if (!recording?.key) return

    setDownloadingKey(recording.key)
    try {
      const url =
        recording.url || recording.rawUrl || (await RecordingService.getStreamingUrl(recording.key))
      RecordingService.downloadRecording(url, recording.filename)
    } catch (downloadError) {
      console.error('Erreur téléchargement enregistrement:', downloadError)
    } finally {
      setDownloadingKey(null)
    }
  }, [])

  const openRecording = useCallback(
    recording => {
      const index = recordings.findIndex(item => item.key === recording.key)
      setSelectedIndex(index >= 0 ? index : null)
    },
    [recordings]
  )

  const hasNext = selectedIndex != null && selectedIndex < recordings.length - 1
  const hasPrevious = selectedIndex != null && selectedIndex > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement des enregistrements...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadRecordings}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    )
  }

  if (!recordings.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-muted/40">
          <Mic className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Aucun enregistrement trouvé</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Les nouveaux enregistrements apparaîtront ici après synchronisation.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadRecordings}>
          <RefreshCw className="h-4 w-4" />
          Rafraîchir
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {recordings.length} enregistrement{recordings.length > 1 ? 's' : ''}
          </Badge>
          <span className="text-sm text-muted-foreground">{userName}</span>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={loadRecordings}>
          <RefreshCw className="h-4 w-4" />
          Rafraîchir
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fichier</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Taille</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRecordings.map(recording => (
              <TableRow key={recording.key}>
                <TableCell className="min-w-0">
                  <div className="max-w-[320px] truncate font-medium">{recording.filename}</div>
                  <div className="mt-1 text-xs text-muted-foreground md:hidden">
                    {formatRecordingDate(recording.lastModified)}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {formatRecordingDate(recording.lastModified)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {recording.duration || RecordingService.formatFileSize(recording.size)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openRecording(recording)}
                      aria-label="Écouter l'enregistrement"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(recording)}
                      disabled={downloadingKey === recording.key}
                      aria-label="Télécharger l'enregistrement"
                    >
                      {downloadingKey === recording.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {recordings.length > INITIAL_VISIBLE_COUNT && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(prev => !prev)}>
            {showAll
              ? 'Afficher moins'
              : `Afficher les ${recordings.length - INITIAL_VISIBLE_COUNT} autres`}
          </Button>
        </div>
      )}

      <RecordingDetailModal
        open={selectedIndex != null}
        onOpenChange={open => {
          if (!open) setSelectedIndex(null)
        }}
        recording={selectedRecording}
        analysis={analysesByKey.get(selectedRecording?.key)}
        coachingStatus={coachingStatusOf(selectedRecording?.key)}
        onRetryCoaching={retry}
        onAnalysisLaunched={setAnalysis}
        onNext={() => {
          if (hasNext) setSelectedIndex(prev => prev + 1)
        }}
        onPrevious={() => {
          if (hasPrevious) setSelectedIndex(prev => prev - 1)
        }}
        hasNext={hasNext}
        hasPrevious={hasPrevious}
        currentIndex={selectedIndex ?? 0}
        totalCount={recordings.length}
        onDownload={handleDownload}
      />
    </div>
  )
}
