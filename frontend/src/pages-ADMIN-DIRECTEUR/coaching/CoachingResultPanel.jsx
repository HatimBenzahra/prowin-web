import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  ThumbsUp,
  TrendingUp,
  Lightbulb,
  CheckCircle2,
  XCircle,
  MinusCircle,
  CircleDashed,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { productComplianceMessage } from './product-compliance'
import AudioPlayer from '@/components/AudioPlayer'
import RecordingService from '@/services/audio/recordings/recording.service'
import AnalysisProgress from './AnalysisProgress'
import {
  ScoreBar,
  StatusPill,
  QualityPill,
  SeverityPill,
  CRITERION_META,
  isInProgress,
} from './CoachingComponents'

/** Proven contradiction against the product sheet or supplied price grid. */
function ViolationCard({ violation }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <SeverityPill severity={violation.severity} />
        <span className="text-xs font-medium text-muted-foreground">
          {violation.productLabel || violation.productSlug}
        </span>
      </div>

      <p className="mb-2 text-sm italic text-foreground/90">« {violation.quote} »</p>

      <dl className="space-y-1.5 text-xs">
        <div>
          <dt className="font-medium text-muted-foreground">
            La référence produit / tarifaire dit
          </dt>
          <dd className="text-foreground/80">{violation.sheetSays}</dd>
        </div>
        {violation.planSays && (
          <div>
            <dt className="font-medium text-muted-foreground">Le plan de vente dit</dt>
            <dd className="text-foreground/80">{violation.planSays}</dd>
          </div>
        )}
      </dl>

      {violation.why && <p className="mt-2 text-xs text-muted-foreground">{violation.why}</p>}
    </div>
  )
}

function VerdictIcon({ status }) {
  const cls = 'h-4 w-4 shrink-0'
  if (status === 'atteint') return <CheckCircle2 className={cn(cls, 'text-green-600')} />
  if (status === 'partiel') return <MinusCircle className={cn(cls, 'text-amber-600')} />
  if (status === 'non_applicable')
    return <CircleDashed className={cn(cls, 'text-muted-foreground')} />
  return <XCircle className={cn(cls, 'text-red-600')} />
}

function ListBlock({ icon: Icon, title, items, tone }) {
  const list = items || []
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className={cn('mb-2 flex items-center gap-1.5 text-sm font-medium', tone)}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((it, i) => (
            <li key={i} className="flex gap-1.5 text-sm text-foreground/90">
              <span className="text-muted-foreground">•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Contenu réutilisable d'une analyse de coaching (hors Dialog) : bannières
 * d'état, lecteur audio optionnel, résumé, forces/axes/reco, déroulé du plan.
 * Utilisé par CoachingDetailModal ET dans le modal de la porte.
 *
 * `lead` : contenu de l'appelant placé en tête de la colonne de gauche (le
 * modal de la porte y met son propre lecteur d'enregistrement). Il défile avec
 * cette colonne, d'un seul tenant, plutôt que de coiffer les deux — sinon le
 * plan de vente ne démarre qu'en dessous et laisse un vide en haut à droite.
 */
export default function CoachingResultPanel({
  analysis,
  recordingKey,
  showAudio = true,
  showScoreFooter = false,
  lead = null,
}) {
  const [audioUrl, setAudioUrl] = useState(null)

  useEffect(() => {
    let active = true
    const key = recordingKey || analysis?.s3KeyOriginal
    if (showAudio && key) {
      RecordingService.getStreamingUrl(key)
        .then(url => active && setAudioUrl(url))
        .catch(() => {})
    } else {
      setAudioUrl(null)
    }
    return () => {
      active = false
    }
  }, [showAudio, recordingKey, analysis?.s3KeyOriginal])

  const stepGroups = useMemo(() => {
    if (!analysis) return { shown: [], skipped: [] }
    const byStep = {}
    for (const c of analysis.criterionResults || []) {
      ;(byStep[c.stepKey] ||= []).push(c)
    }
    const subScores = analysis.subScores || []
    const ordered =
      subScores.length > 0
        ? subScores.map(s => ({ step: s, criteria: byStep[s.key] || [] }))
        : Object.keys(byStep).map(k => ({
            step: { key: k, label: k, applicable: true, score: null },
            criteria: byStep[k],
          }))
    // On n'affiche que les étapes que le commercial avait à jouer. Une étape non
    // applicable — un produit qu'il n'a pas abordé, la complétude sans contrat —
    // n'est pas un manquement : la lister en « Non applicable » à 0 noie les
    // vraies étapes sous du bruit. Le compte reste visible en pied de liste.
    const withCriteria = ordered.filter(g => g.criteria.length > 0)
    return {
      shown: withCriteria.filter(g => g.step.applicable),
      skipped: withCriteria.filter(g => !g.step.applicable),
    }
  }, [analysis])

  if (!analysis) return null

  const inProgress = isInProgress(analysis.status)
  const hasScore = typeof analysis.score === 'number'
  const malus = typeof analysis.malus === 'number' ? analysis.malus : 0
  const hasMalus = malus > 0 && typeof analysis.scoreBeforeMalus === 'number'
  const violations = analysis.violations || []
  const productAlerts = analysis.productAlerts || []
  const compliance = productComplianceMessage(analysis)

  const ScoreFooter = () => (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <StatusPill status={analysis.status} />
        <QualityPill quality={analysis.quality} />
      </div>
      <div className="flex items-center gap-4">
        {hasScore && <ScoreBar value={analysis.score} className="w-40" />}
        <div className="text-right">
          <div className="text-3xl font-semibold leading-none tabular-nums">
            {hasScore ? Math.round(analysis.score) : '—'}
            <span className="text-base text-muted-foreground">/100</span>
          </div>
          {hasMalus && (
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {Math.round(analysis.scoreBeforeMalus)} − {Math.round(malus)} de malus produit
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-4">
      {inProgress && <AnalysisProgress analysis={analysis} />}
      {analysis.status === 'FAILED' && analysis.error && (
        <div className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Échec : {analysis.error}
        </div>
      )}
      {analysis.quality === 'INEXPLOITABLE' && (
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Échange trop court ou inexploitable — pas de score fiable.
        </div>
      )}

      {/* Deux colonnes : à gauche l'échange et ce qu'on en retient, à droite le
          respect du plan de vente. Chaque colonne défile pour elle-même, ce qui
          évite le rectangle interminable d'une colonne unique.

          Le seuil est une CONTAINER query, pas un breakpoint d'écran : `xl:` suit
          la fenêtre, or ce panneau vit dans des modaux de largeurs très
          différentes. Il se scindait donc en deux dans 500 px de large dès que
          l'écran était grand, avec un mot par ligne.

          L'enregistrement ouvre la colonne de gauche et défile avec elle, d'un
          seul tenant : il n'est pas au-dessus des deux colonnes, sinon celle de
          droite ne démarre qu'en dessous et laisse un vide en haut. */}
      <div className="grid min-h-0 flex-1 gap-5 @4xl:grid-cols-2">
        <div className="min-w-0 space-y-5 overflow-y-auto @4xl:pr-1">
          {lead}

          {showAudio && audioUrl && <AudioPlayer src={audioUrl} title="Enregistrement" />}

          {analysis.summary && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Résumé</h3>
              <p className="text-sm text-foreground/90">{analysis.summary}</p>
            </div>
          )}

          {violations.length === 0 && (
            <Alert
              className={cn(
                'p-3',
                compliance.warning
                  ? 'border-amber-500/30 bg-amber-500/10 [&>svg]:text-amber-600'
                  : 'bg-muted/20'
              )}
            >
              {compliance.warning ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CircleDashed className="h-4 w-4" />
              )}
              <AlertTitle className="text-sm">Conformité produit</AlertTitle>
              <AlertDescription>{compliance.text}</AlertDescription>
            </Alert>
          )}

          {analysis.productVerification?.products?.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {analysis.productVerification.products.map(p => (
                <li key={p.productSlug}>
                  <span className="font-medium">{p.productLabel}</span> — {p.reason}
                </li>
              ))}
            </ul>
          )}

          {productAlerts.length > 0 && (
            <Alert className="border-amber-500/30 bg-amber-500/10 [&>svg]:text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Points produit à clarifier · sans malus</AlertTitle>
              <AlertDescription className="space-y-3">
                {productAlerts.map((a, i) => (
                  <div key={`${a.productSlug}-${i}`} className="text-xs">
                    <p className="font-medium">{a.productLabel || a.productSlug}</p>
                    <p className="mt-1 italic">« {a.quote} »</p>
                    <p className="mt-1">Référence disponible : {a.reference}</p>
                    <p className="mt-1 text-muted-foreground">{a.reason}</p>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {violations.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">
                Conformité produit
                <span className="ml-2 font-normal text-muted-foreground">
                  {violations.length} écart{violations.length > 1 ? 's' : ''} · −{Math.round(malus)}{' '}
                  points
                </span>
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Ce que le commercial a affirmé sur le produit, comparé à sa fiche.
              </p>
              <div className="space-y-2">
                {violations.map((v, i) => (
                  <ViolationCard key={`${v.productSlug}-${i}`} violation={v} />
                ))}
              </div>
            </div>
          )}

          {(analysis.strengths?.length ||
            analysis.improvements?.length ||
            analysis.recommendations?.length) > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              <ListBlock
                icon={ThumbsUp}
                title="Forces"
                items={analysis.strengths}
                tone="text-green-600"
              />
              <ListBlock
                icon={TrendingUp}
                title="À améliorer"
                items={analysis.improvements}
                tone="text-amber-600"
              />
              <ListBlock
                icon={Lightbulb}
                title="Recommandations"
                items={analysis.recommendations}
                tone="text-indigo-600"
              />
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-y-auto @4xl:pl-1">
          {stepGroups.shown.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">Respect du plan de vente</h3>
                <CriteriaRecap groups={stepGroups.shown} />
              </div>
              <div className="space-y-3">
                {stepGroups.shown.map(({ step, criteria }) => (
                  <div key={step.key} className="rounded-lg border border-border/60">
                    <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-3 py-2">
                      <span className="text-sm font-medium">{step.label}</span>
                      {step.applicable && typeof step.score === 'number' ? (
                        <div className="flex items-center gap-2">
                          <ScoreBar value={step.score} className="w-24" />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {Math.round(step.score)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Non applicable</span>
                      )}
                    </div>
                    <ul className="divide-y divide-border/60">
                      {criteria.map(c => {
                        const cm = CRITERION_META[c.status] || CRITERION_META.absent
                        return (
                          <li key={c.criterionKey} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5">
                                  <VerdictIcon status={c.status} />
                                </span>
                                <div>
                                  <div className="text-sm">{c.title}</div>
                                  <div className={cn('text-xs', cm.text)}>{cm.label}</div>
                                </div>
                              </div>
                              {c.status !== 'non_applicable' && (
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {Math.round(c.score)}/{c.maxPoints}
                                </span>
                              )}
                            </div>
                            {c.evidence?.length > 0 && (
                              <ul className="mt-1.5 space-y-1 border-l-2 border-border/60 pl-3">
                                {c.evidence.map((e, i) => (
                                  <li key={i} className="text-xs italic text-muted-foreground">
                                    « {e} »
                                  </li>
                                ))}
                              </ul>
                            )}
                            {c.comment && (
                              <p className="mt-1.5 text-xs text-foreground/80">{c.comment}</p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              {stepGroups.skipped.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stepGroups.skipped.length} étape
                  {stepGroups.skipped.length > 1 ? 's' : ''} sans objet sur cet échange :{' '}
                  {stepGroups.skipped.map(g => g.step.label).join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {showScoreFooter && <ScoreFooter />}
    </div>
  )
}

/**
 * Récapitulatif des critères jugés, en tête de colonne : on veut savoir où on en
 * est avant de dérouler quinze critères. Les non applicables sont exclus du
 * compte — ils ne sont pas des manquements.
 */
function CriteriaRecap({ groups }) {
  const counts = { atteint: 0, partiel: 0, absent: 0 }
  for (const g of groups) {
    for (const c of g.criteria) {
      if (c.status in counts) counts[c.status] += 1
    }
  }
  const total = counts.atteint + counts.partiel + counts.absent
  if (total === 0) return null

  const parts = [
    { n: counts.atteint, label: 'atteints', dot: 'bg-green-500' },
    { n: counts.partiel, label: 'partiels', dot: 'bg-amber-500' },
    { n: counts.absent, label: 'absents', dot: 'bg-red-500' },
  ].filter(p => p.n > 0)

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {parts.map(p => (
        <span key={p.label} className="flex items-center gap-1.5 tabular-nums">
          <span className={cn('h-1.5 w-1.5 rounded-full', p.dot)} />
          {p.n} {p.label}
        </span>
      ))}
      <span className="tabular-nums">sur {total} jugés</span>
    </div>
  )
}
