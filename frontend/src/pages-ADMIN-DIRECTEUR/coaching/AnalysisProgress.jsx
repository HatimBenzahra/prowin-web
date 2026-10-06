import { useEffect, useState } from 'react'
import { AudioLines, Check, Clock, FileText, X, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import CoachingService from '@/services/coaching/coaching.service'

/**
 * Avancement réel d'une analyse, étape par étape.
 *
 * États backend : PENDING → TRANSCRIBING → checkpoint → ANALYZING → READY.
 * MAPPING/CONFORMITY restent reconnus pour les résultats historiques.
 *
 * CONFORMITY n'est plus jamais écrit ; il reste dans l'ordre pour que les analyses
 * antérieures, qui le portent en base, s'affichent correctement.
 *
 * Une analyse dure plusieurs minutes — Whisper tourne sur CPU. Sans rien montrer,
 * l'attente ressemble à une panne : d'où le rang dans la file quand le job attend,
 * et l'étape en cours dès qu'il tourne.
 */
const ORDER = ['PENDING', 'TRANSCRIBING', 'MAPPING', 'ANALYZING', 'CONFORMITY', 'READY']

const STEPS = [
  {
    key: 'PENDING',
    label: 'Enregistrement reçu',
    hint: 'L’audio est en file, le worker le prend au prochain tour.',
    icon: AudioLines,
    tone: 'text-amber-600',
    ring: 'bg-amber-500/10',
    bar: 'bg-amber-500',
  },
  {
    key: 'TRANSCRIBING',
    label: 'Transcription de l’échange',
    hint: 'Whisper transcrit l’audio. La durée dépend du fichier et de la capacité disponible.',
    icon: FileText,
    tone: 'text-blue-600',
    ring: 'bg-blue-500/10',
    bar: 'bg-blue-500',
  },
  {
    key: 'ANALYZING',
    label: 'Analyse face au plan de vente & aux fiches produit',
    hint: 'Évaluation du transcript enregistré : offres, plan et conformité produit.',
    icon: Gauge,
    tone: 'text-indigo-600',
    ring: 'bg-indigo-500/10',
    bar: 'bg-indigo-500',
  },
]

const QUEUE_POLL_MS = 15_000

/** Rang du job dans la file (1 = le prochain). null si introuvable ou en cours. */
function useQueuePosition(analysisId, enabled) {
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!enabled || !analysisId) {
      setPosition(null)
      return
    }
    let alive = true
    const read = async () => {
      // Le client GraphQL maison peut renvoyer data:null — d'où le `|| []`,
      // que le défaut de paramètre ne couvrirait pas.
      const items = (await CoachingService.queue()) || []
      if (!alive) return
      const idx = items.findIndex(i => i.id === analysisId)
      setPosition(idx === -1 ? null : idx + 1)
    }
    read()
    const t = setInterval(read, QUEUE_POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [analysisId, enabled])

  return position
}

function StepRow({ step, state, hint }) {
  const Icon = step.icon
  const done = state === 'done'
  const current = state === 'current'

  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
          done && 'bg-green-500/10',
          current && step.ring,
          !done && !current && 'bg-muted'
        )}
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : current ? (
          <Icon className={cn('h-3.5 w-3.5 animate-pulse', step.tone)} />
        ) : (
          <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-tight',
            current && 'font-medium text-foreground',
            done && 'text-foreground/80',
            !done && !current && 'text-muted-foreground'
          )}
        >
          {step.label}
        </p>
        {current && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {step.key === 'PENDING' && <Clock className="h-3 w-3 shrink-0 text-amber-500" />}
            {hint ?? step.hint}
          </p>
        )}

        {/* Barre indéterminée : on ne connaît pas l'avancement réel d'une étape,
            seulement qu'elle tourne. Mieux vaut le dire ainsi qu'un faux %. */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          {done ? (
            <div className="h-full w-full rounded-full bg-green-500/70" />
          ) : current ? (
            <div className={cn('h-full w-1/3 animate-progress-slide rounded-full', step.bar)} />
          ) : null}
        </div>
      </div>
    </li>
  )
}

export default function AnalysisProgress({ analysis }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const rank = ORDER.indexOf(analysis?.status)
  const failed = analysis?.status === 'FAILED'
  const ready = analysis?.status === 'READY'
  const pending = analysis?.status === 'PENDING'
  const position = useQueuePosition(analysis?.id, Boolean(analysis) && pending)

  if (!analysis) return null

  // Aucune offre présentée : la conformité produit n'a pas eu lieu. On le dit,
  // plutôt que de laisser croire qu'elle a tourné.
  const noProduct = (analysis.detectedProducts || []).length === 0

  // Rang dans la file : c'est la seule information concrète qu'on puisse donner
  // pendant l'attente. Sans elle, « en file » ressemble à un blocage.
  const queueHint =
    position === 1
      ? 'Prochain à passer.'
      : position
        ? `${position}ᵉ dans la file, ${position - 1} échange${position > 2 ? 's' : ''} devant.`
        : 'Le traitement démarre dans quelques secondes.'

  const stateOf = stepKey => {
    if (ready) return 'done'
    const stepRank = ORDER.indexOf(stepKey)
    if (failed) return 'pending'
    if (rank < 0) return 'pending'
    // CONFORMITY (analyses antérieures) tombe dans la même ligne qu'ANALYZING :
    // les deux passes y sont désormais simultanées.
    if (stepKey === 'ANALYZING' && analysis.status === 'CONFORMITY') return 'current'
    if (stepRank < rank) return 'done'
    if (stepRank === rank) return 'current'
    return 'pending'
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
        </span>
        <p className="text-sm font-medium">
          {failed
            ? 'Analyse échouée'
            : ready
              ? 'Analyse terminée'
              : analysis.nextRetryAt
                ? 'Étape en attente de reprise'
                : 'Analyse en cours'}
        </p>
      </div>

      <ul className="space-y-3">
        {STEPS.map(step => (
          <StepRow
            key={step.key}
            step={step}
            state={stateOf(step.key)}
            hint={step.key === 'PENDING' ? queueHint : undefined}
          />
        ))}
      </ul>

      {ready && noProduct && (
        <p className="mt-3 text-xs text-muted-foreground">
          Aucune offre présentée — conformité produit non requise.
        </p>
      )}
      {failed && analysis.error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {analysis.error}
        </p>
      )}
      {!pending && !failed && !ready && (
        <p className="mt-3 text-xs text-muted-foreground">
          {analysis.stageStartedAt && Number.isFinite(Date.parse(analysis.stageStartedAt))
            ? `Étape démarrée il y a ${Math.max(0, Math.floor((now - Date.parse(analysis.stageStartedAt)) / 60000))} min. `
            : ''}
          {analysis.status === 'TRANSCRIBING'
            ? `Tentative STT : ${analysis.transcriptionAttempts ?? 0}.`
            : `Tentative d’évaluation : ${analysis.evaluationAttempts ?? 0}. Transcript conservé.`}
          {analysis.nextRetryAt && Number.isFinite(Date.parse(analysis.nextRetryAt))
            ? ` Reprise prévue à ${new Date(analysis.nextRetryAt).toLocaleTimeString()}.`
            : ''}
        </p>
      )}
    </div>
  )
}
