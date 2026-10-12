import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  RefreshCw,
  ClipboardList,
  CircleHelp,
  ThumbsUp,
  TrendingUp,
  ListChecks,
  TrendingDown,
  Minus,
  ArrowUpRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingSessionsModal from './CoachingSessionsModal'
import GuideVideoDialog from '@/components/guide/GuideVideoDialog'

const POLL_MS = 5000

// Date courte JJ/MM/AAAA (tolère null / ISO).
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TREND_META = {
  progresse: { label: 'En progression', icon: ArrowUpRight, cls: 'bg-green-500/10 text-green-600' },
  stagne: { label: 'Stable', icon: Minus, cls: 'bg-slate-500/10 text-slate-600' },
  regresse: { label: 'En baisse', icon: TrendingDown, cls: 'bg-red-500/10 text-red-600' },
}

// Rend le gras Markdown inline (`**texte**`) — le LLM titre ses paragraphes ainsi.
function renderInlineBold(text) {
  return String(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((seg, i) =>
      seg.startsWith('**') && seg.endsWith('**') ? (
        <strong key={i} className="font-semibold text-foreground">
          {seg.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{seg}</span>
      )
    )
}

/**
 * Bloc de liste. `prose` = paragraphes titrés (sans tiret, plus d'air) pour
 * l'analyse structurée ; sinon liste à tirets (forces / axes / priorités).
 */
function Block({ icon: Icon, title, items, tone, prose }) {
  const list = items || []
  if (!list.length) return null
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className={cn('mb-2 flex items-center gap-1.5 text-sm font-medium', tone)}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <ul className={prose ? 'space-y-2.5' : 'space-y-1.5'}>
        {list.map((it, i) => (
          <li
            key={i}
            className={
              prose
                ? 'text-sm leading-relaxed text-foreground/90'
                : 'flex gap-2 text-sm text-foreground/90'
            }
          >
            {!prose && <span className="select-none text-muted-foreground">–</span>}
            <span>{renderInlineBold(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Section « Synthèse coaching » d'une fiche commercial / manager : bilan global
 * généré par le LLM (hors pipeline audio). Prop `commercialId` OU `managerId`.
 */
export default function CoachingSynthesisSection({ commercialId, managerId, subjectName }) {
  const subjectType = commercialId != null ? 'commercial' : 'manager'
  const subjectId = commercialId != null ? commercialId : managerId

  const [syn, setSyn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [readyCount, setReadyCount] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    if (subjectId == null) return
    const s = await CoachingService.getSynthesis(subjectType, subjectId)
    setSyn(s)
    setLoading(false)
    return s
  }, [subjectType, subjectId])

  useEffect(() => {
    load()
  }, [load])

  const inProgress = syn && ['PENDING', 'ANALYZING'].includes(syn.status)

  // Poll tant que la génération est en cours.
  useEffect(() => {
    if (!inProgress) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(load, POLL_MS)
    return () => pollRef.current && clearInterval(pollRef.current)
  }, [inProgress, load])

  // Nombre d'analyses READY du sujet (source live). Sert à signaler les sessions
  // pas encore incluses dans la synthèse (snapshot figé à la dernière génération).
  const refreshReadyCount = useCallback(async () => {
    if (subjectId == null) return
    const where =
      subjectType === 'commercial' ? { userId: subjectId } : { managerId: subjectId }
    const res = await CoachingService.analyses({ ...where, status: 'READY', take: 1 })
    setReadyCount(res?.total ?? 0)
  }, [subjectType, subjectId])

  // Charge le compte au montage puis le rafraîchit régulièrement (léger : total
  // seul) → le badge « nouvelles sessions » apparaît quand des analyses ajoutées
  // se terminent, même après fermeture du modal.
  useEffect(() => {
    refreshReadyCount()
    const t = setInterval(refreshReadyCount, POLL_MS)
    return () => clearInterval(t)
  }, [refreshReadyCount])

  const generate = async () => {
    setGenerating(true)
    try {
      const s = await CoachingService.generateSynthesis(subjectType, subjectId)
      if (s) setSyn(s)
    } finally {
      setGenerating(false)
    }
  }

  const trend = TREND_META[syn?.trend] || null
  const ready = syn?.status === 'READY'
  // Sessions analysées non encore prises en compte par la synthèse figée.
  const newSessions =
    ready && readyCount != null && syn?.nbAnalyses != null
      ? Math.max(0, readyCount - syn.nbAnalyses)
      : 0

  return (
    <>
      <Card className="border-border/60 bg-card">
        {/* @container : les sous-grilles s'adaptent à la LARGEUR RÉELLE de la card
            (étroite en colonne latérale → empilé ; large en pleine largeur → 3 colonnes). */}
        <CardContent className="@container">
          {/* En-tête compact : titre + retry + (si prêt) score/tendance/sessions/période
              sur UNE seule ligne pour économiser de la hauteur verticale. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <h3 className="text-lg font-semibold tracking-tight">Synthèse coaching</h3>
              {/* Retry discret (pas de bouton « IA »). */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={generate}
                disabled={generating || inProgress}
                title={syn ? 'Régénérer la synthèse' : 'Générer la synthèse'}
                aria-label={syn ? 'Régénérer la synthèse' : 'Générer la synthèse'}
                className="text-muted-foreground hover:text-foreground"
              >
                {generating || inProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              {/* C'est ICI que la question « d'où sortent ces notes ? » se pose — pas sur
                  la liste d'équipe. Le guide s'ouvre donc directement au chapitre
                  coaching, résolu par titre côté modale. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <CircleHelp className="h-3.5 w-3.5" />
                Comment ça marche ?
              </Button>
            </div>

            {ready && (
              <>
                <span className="flex items-baseline gap-1">
                  <span className="text-xl font-bold leading-none tabular-nums">
                    {syn.scoreMoyen ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </span>
                {trend && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                      trend.cls
                    )}
                  >
                    <trend.icon className="h-3.5 w-3.5" />
                    {trend.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSessionsOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-sm transition-colors hover:border-border hover:bg-muted/60"
                  title="Voir les sessions et en ajouter"
                >
                  <span className="font-bold tabular-nums">{syn.nbAnalyses}</span>
                  <span className="text-muted-foreground">
                    session{syn.nbAnalyses > 1 ? 's' : ''} analysée{syn.nbAnalyses > 1 ? 's' : ''}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {(syn.periodStart || syn.periodEnd) && (
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(syn.periodStart)} → {fmtDate(syn.periodEnd)}
                  </span>
                )}
              </>
            )}

            {newSessions > 0 && (
              <button
                type="button"
                onClick={generate}
                disabled={generating || inProgress}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                title="De nouvelles sessions ont été analysées depuis cette synthèse — régénérez pour les inclure"
              >
                +{newSessions} nouvelle{newSessions > 1 ? 's' : ''} session
                {newSessions > 1 ? 's' : ''}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : inProgress ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Génération de la synthèse en cours…
            </div>
          ) : syn?.status === 'FAILED' ? (
            <div className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Échec de la génération{syn.error ? ` : ${syn.error}` : ''}.
            </div>
          ) : !syn || !ready ? (
            <p className="text-sm text-muted-foreground">
              Pas encore de synthèse pour ce {subjectType === 'manager' ? 'manager' : 'commercial'}.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Analyse structurée : aperçu → discours → prospection, paragraphes
                  titrés en gras (rendu Markdown inline). */}
              <Block
                icon={ClipboardList}
                title="Analyse détaillée"
                items={syn.analyse}
                tone="text-foreground"
                prose
              />

              {/* Forces / Axes / Priorités — 3 colonnes seulement si la card est
                  assez large (container query), sinon empilé pour rester lisible. */}
              <div className="grid gap-3 @2xl:grid-cols-3">
                <Block icon={ThumbsUp} title="Forces" items={syn.strengths} tone="text-green-600" />
                <Block
                  icon={TrendingUp}
                  title="À améliorer"
                  items={syn.improvements}
                  tone="text-amber-600"
                />
                <Block
                  icon={ListChecks}
                  title="Priorités"
                  items={syn.priorities}
                  tone="text-indigo-600"
                />
              </div>

              {syn.generatedAt && (
                <p className="text-xs text-muted-foreground">
                  Généré le{' '}
                  {new Date(syn.generatedAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <GuideVideoDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        startAtChapter={/coaching/i}
        title="Comprendre le bilan coaching"
      />

      <CoachingSessionsModal
        open={sessionsOpen}
        onOpenChange={o => {
          setSessionsOpen(o)
          // Retour du modal : on a pu lancer des analyses → rafraîchit la
          // synthèse (période live) et le compte de sessions analysées.
          if (!o) {
            load()
            refreshReadyCount()
          }
        }}
        subjectType={subjectType}
        subjectId={subjectId}
        subjectName={subjectName}
      />
    </>
  )
}
