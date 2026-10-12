import { useMemo, useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DoorOpen, Loader2, Mic, X, Star, Sparkles } from 'lucide-react'
import { getStatusColor, getStatusLabel } from '@/constants/domain/porte-status'
import { SpeechScoreBar } from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'
import { useRecordingSegmentsByPorte } from '@/hooks/metier/api/portes'
import RecordingSegmentPlayer from '@/components/RecordingSegmentPlayer'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingResultPanel from '@/pages-ADMIN-DIRECTEUR/coaching/CoachingResultPanel'
import { isInProgress } from '@/pages-ADMIN-DIRECTEUR/coaching/CoachingComponents'
import AnalysisProgress from '@/pages-ADMIN-DIRECTEUR/coaching/AnalysisProgress'
import { cn } from '@/lib/utils'

// Cadence de suivi d'une analyse en cours, alignée sur les autres écrans coaching.
const COACHING_POLL_MS = 6000

/**
 * Détail d'une porte en modale centrée — même pattern que la modale de la page
 * Enregistrements (Dialog sm:max-w-3xl) pour que l'AudioPlayer ait toute la
 * largeur et que l'UX reste cohérente dans toute l'app.
 */
export default function PorteDetailModal({ door, open, onOpenChange, address = '' }) {
  const { data: segments = [], loading } = useRecordingSegmentsByPorte(door?.porteId)
  const statusUpper = (door?.status || '').toUpperCase()

  const primarySegment = useMemo(() => {
    if (!segments.length) return null
    return segments.reduce((longest, seg) =>
      (seg.durationSec || 0) > (longest.durationSec || 0) ? seg : longest
    )
  }, [segments])

  // Coaching de la porte (analyse la plus récente) + favori.
  const [analysis, setAnalysis] = useState(null)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [favori, setFavori] = useState(false)

  // `silent` : rafraîchissement de fond, sans repasser par l'état de chargement
  // (sinon le panneau clignote à chaque tick de polling).
  const loadCoaching = useCallback(
    async (silent = false) => {
      if (!door?.porteId) return
      if (!silent) setCoachingLoading(true)
      const a = await CoachingService.byPorte(door.porteId)
      setAnalysis(a)
      if (!silent) setCoachingLoading(false)
    },
    [door?.porteId]
  )

  useEffect(() => {
    if (open && door?.porteId) {
      // État favori depuis la DB (le prop `door` ne le porte pas).
      CoachingService.getFavori(door.porteId).then(setFavori)
      loadCoaching()
    } else {
      setAnalysis(null)
    }
  }, [open, door?.porteId, loadCoaching])

  const s3Key = primarySegment?.s3KeyOriginal || analysis?.s3KeyOriginal || null
  const launchCoaching = async () => {
    if (!s3Key) return
    setLaunching(true)
    try {
      await CoachingService.launchMany([s3Key])
      await loadCoaching()
    } finally {
      setLaunching(false)
    }
  }
  const toggleFavori = async () => {
    if (!door?.porteId) return
    const next = !favori
    setFavori(next)
    try {
      await CoachingService.setFavori(door.porteId, next)
    } catch {
      setFavori(!next)
    }
  }

  const coachInProgress = Boolean(analysis && isInProgress(analysis.status))

  // Suit l'analyse en direct. Sans ça il fallait fermer et réouvrir le modal pour
  // voir l'avancement : le chargement n'avait lieu qu'à l'ouverture.
  useEffect(() => {
    if (!open || !coachInProgress) return
    const t = setInterval(() => loadCoaching(true), COACHING_POLL_MS)
    return () => clearInterval(t)
  }, [open, coachInProgress, loadCoaching])

  if (!door) return null

  // Le coaching n'est affichable que s'il a produit un score : sinon on montre
  // la raison à sa place, dans la même colonne.
  const analysisUsable =
    Boolean(analysis) &&
    analysis.quality !== 'INEXPLOITABLE' &&
    analysis.status !== 'FAILED' &&
    typeof analysis.score === 'number'
  const showPanel = !coachingLoading && !coachInProgress && analysisUsable

  // Tête de la colonne de gauche, que le coaching soit exploitable ou non :
  // l'enregistrement est la source de tout ce que le panneau raconte.
  const recordingBlock = (
    <div className="space-y-4">
      {door.comment && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Commentaire</p>
          <p className="mt-1 text-sm text-muted-foreground">{door.comment}</p>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Enregistrement</h4>
          </div>
          {!loading && primarySegment?.speechScore != null && (
            <SpeechScoreBar score={primarySegment.speechScore} />
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Chargement de l'enregistrement...
          </div>
        ) : segments.length > 0 ? (
          <div className="space-y-2">
            {segments.map(segment => (
              <RecordingSegmentPlayer key={segment.id} segment={segment} autoLoad />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            Aucun enregistrement lié à cette porte.
          </div>
        )}
      </div>
    </div>
  )

  const coachingState = coachingLoading ? (
    <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Chargement du coaching…
    </div>
  ) : coachInProgress ? (
    <AnalysisProgress analysis={analysis} />
  ) : analysis ? (
    <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
      {analysis.status === 'FAILED'
        ? analysis.error
          ? `Échec de l'analyse : ${analysis.error}`
          : "Échec de l'analyse."
        : 'Échange trop court ou inexploitable — pas de score fiable.'}
    </div>
  ) : (
    <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
      Pas encore de coaching pour cet enregistrement.
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          // `sm:max-w-none` ne vit QUE dans la branche large : porté par la base,
          // il neutralisait le `max-w-2xl` du mode compact (une règle sous media
          // query l'emporte sur une utilitaire sans variante, quel que soit
          // l'ordre des classes) — le modal restait pleine largeur pour rien.
          //
          // w-[97vw] collait aussi aux deux bords : sous le point de rupture lg,
          // le modal est simplement centré, donc c'est la largeur qui fait la marge.
          showPanel
            ? 'h-[94vh] w-[94vw] sm:max-w-none lg:ml-[9.5rem] lg:w-[calc(100vw-23rem)]'
            : 'max-h-[88vh] w-[90vw] sm:max-w-2xl'
        )}
      >
        <DialogHeader className="border-b py-4 pl-6 pr-8">
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-primary" />
              <DialogTitle className="text-base font-semibold">Porte {door.number}</DialogTitle>
            </div>
            <Badge className={`self-center ${getStatusColor(statusUpper)}`}>
              {getStatusLabel(statusUpper)}
            </Badge>
            {/* Actions coaching dans l'en-tête, comme dans le modal Coaching :
                le corps est entièrement pris par les deux colonnes. */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFavori}
                className={cn(favori && 'border-amber-400 text-amber-600')}
                aria-label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <Star className={cn('h-4 w-4', favori && 'fill-amber-500 text-amber-500')} />
                Favori
              </Button>
              {s3Key && !coachInProgress && (
                <Button variant="outline" size="sm" onClick={launchCoaching} disabled={launching}>
                  {launching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {analysis ? 'Relancer' : "Lancer l'analyse"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => onOpenChange?.(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {door.floorLabel}
            {address ? ` · ${address}` : ''}
            {door.nomPersonnalise ? ` · ${door.nomPersonnalise}` : ''}
          </p>
        </DialogHeader>

        {/* Un seul split pour tout le corps : l'enregistrement ouvre la colonne
            de gauche et le plan de vente démarre en haut de celle de droite. En
            deux blocs empilés, la moitié haute droite restait vide. */}
        <div className="@container flex min-h-0 flex-1 flex-col py-4 pl-6 pr-8">
          {showPanel ? (
            <CoachingResultPanel
              analysis={analysis}
              showAudio={false}
              showScoreFooter
              lead={recordingBlock}
            />
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {recordingBlock}
              {coachingState}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
