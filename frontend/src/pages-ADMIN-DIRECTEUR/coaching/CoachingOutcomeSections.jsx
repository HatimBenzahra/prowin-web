import { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRole } from '@/contexts/userole'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import CoachingService from '@/services/coaching/coaching.service'
import { BandPill, ScoreBar, formatDateTime } from './CoachingComponents'
import {
  CHECK_STATUS_META,
  CONFIDENCE_LABELS,
  NA_REASON_LABELS,
  NEXT_ACTION_LABELS,
  NIVEAU_LABELS,
  NON_SALE_REASON_LABELS,
  PRODUCT_STATUS_META,
  RIB_LABELS,
  SIGNATURE_LABELS,
  VISIT_RESULT_LABELS,
  objectiveGap,
  optionsOf,
} from './coaching-calibration'

/*
 * Sections du recalibrage 2026 dans le panneau d'une analyse : décomposition du
 * score, résultat de visite (corrigeable), statuts produit, calculs et contradictions.
 * Toutes s'effacent sur une analyse antérieure qui n'en porte pas les champs.
 */

const NONE = '__none__'
const pct = v => (typeof v === 'number' ? `${Math.round(v)}` : '—')

function Pill({ className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Exécution, résultat commercial, global ; trois indicateurs ; confiance ; objectif du niveau. */
export function ScoreBreakdown({ analysis }) {
  const { executionScore, outcomeScore, score, band, indicators, analysisConfidence } = analysis
  const gap = objectiveGap(score, analysis.objectiveScore, band)
  const hasBreakdown =
    typeof executionScore === 'number' || indicators || analysisConfidence || band
  if (!hasBreakdown && !gap) return null

  const rows = [
    { label: 'Qualité commerciale', value: indicators?.qualiteCommerciale },
    { label: 'Respect du plan', value: indicators?.respectPlan },
    { label: 'Conformité', value: indicators?.conformite },
  ]
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Score</h3>
        <BandPill score={score} band={band} />
      </div>
      {typeof executionScore === 'number' && band !== 'non_evaluable' && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">Exécution</dt>
            <dd className="text-lg font-semibold tabular-nums">{pct(executionScore)}</dd>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">Résultat commercial</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {typeof outcomeScore === 'number' ? Math.round(outcomeScore * 10) / 10 : '—'}
            </dd>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">Global</dt>
            <dd className="text-lg font-semibold tabular-nums">{pct(score)}</dd>
          </div>
        </dl>
      )}
      {indicators && (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-center gap-3 text-xs">
              <span className="w-36 shrink-0 text-muted-foreground">{r.label}</span>
              <ScoreBar value={r.value} className="flex-1" />
              <span className="w-8 text-right tabular-nums">{pct(r.value)}</span>
            </div>
          ))}
        </div>
      )}
      {analysisConfidence && (
        <p className="text-xs text-muted-foreground">
          Confiance de l’analyse :{' '}
          <span
            className={cn('font-medium', analysisConfidence.level === 'faible' && 'text-amber-600')}
          >
            {CONFIDENCE_LABELS[analysisConfidence.level] || analysisConfidence.level}
          </span>
          {analysisConfidence.reasons?.length > 0 && ` — ${analysisConfidence.reasons.join(' ; ')}`}
        </p>
      )}
      {gap && (
        <p
          className={cn(
            'text-xs',
            gap.below ? 'font-medium text-amber-600' : 'text-muted-foreground'
          )}
        >
          {NIVEAU_LABELS[analysis.commercialNiveau] || analysis.commercialNiveau} · {gap.text}
        </p>
      )}
    </div>
  )
}

function OutcomeSelect({ value, onChange, labels, placeholder }) {
  return (
    <Select value={value ?? NONE} onValueChange={v => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {optionsOf(labels).map(o => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const OUTCOME_FIELDS = [
  { key: 'visitResult', label: 'Résultat', labels: VISIT_RESULT_LABELS },
  { key: 'nonSaleReason', label: 'Motif de non-vente', labels: NON_SALE_REASON_LABELS },
  { key: 'nextAction', label: 'Prochaine action', labels: NEXT_ACTION_LABELS },
  { key: 'ribStatus', label: 'RIB', labels: RIB_LABELS },
  { key: 'signatureStatus', label: 'Signature', labels: SIGNATURE_LABELS },
]
const PRODUCT_STATUS_LABELS = Object.fromEntries(
  Object.entries(PRODUCT_STATUS_META).map(([k, m]) => [k, m.label])
)

/**
 * Résultat de visite pré-rempli par l'IA, et les statuts produit. Admin, directeur
 * et manager peuvent le corriger (le serveur vérifie le périmètre).
 */
export function VisitOutcomeSection({ analysis, onUpdated }) {
  const { isAdmin, isDirecteur, isManager } = useRole()
  const canEdit = isAdmin || isDirecteur || isManager
  const { showError, showSuccess } = useErrorToast()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => setEditing(false), [analysis.id])

  const products = analysis.productStatuses || []
  const hasOutcome = OUTCOME_FIELDS.some(f => analysis[f.key]) || products.length > 0
  if (!hasOutcome) return null

  const startEdit = () => {
    setForm({
      ...Object.fromEntries(OUTCOME_FIELDS.map(f => [f.key, analysis[f.key] ?? null])),
      products: Object.fromEntries(products.map(p => [p.key, p.status])),
    })
    setEditing(true)
  }
  const save = async () => {
    // Seuls les champs modifiés partent : rien de modifié, rien d'envoyé ni de tracé.
    const changedProducts = products
      .filter(p => form.products[p.key] !== p.status)
      .map(p => ({ key: p.key, status: form.products[p.key] }))
    const correction = Object.fromEntries(
      OUTCOME_FIELDS.filter(f => form[f.key] !== (analysis[f.key] ?? null)).map(f => [
        f.key,
        form[f.key],
      ])
    )
    if (changedProducts.length) correction.productStatuses = changedProducts
    if (!Object.keys(correction).length) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const updated = await CoachingService.updateVisitOutcome(analysis.id, correction)
      onUpdated?.(updated)
      setEditing(false)
      showSuccess('Résultat de visite corrigé')
    } catch (error) {
      showError(error, 'VisitOutcomeSection.save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Résultat de visite</h3>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Corriger
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        {OUTCOME_FIELDS.map(f => (
          <div key={f.key} className="contents">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd>
              {editing ? (
                <OutcomeSelect
                  value={form[f.key]}
                  labels={f.labels}
                  onChange={v => setForm(cur => ({ ...cur, [f.key]: v }))}
                />
              ) : (
                (f.labels[analysis[f.key]] ?? analysis[f.key]) || '—'
              )}
            </dd>
          </div>
        ))}
      </dl>

      {analysis.outcomeComment && !editing && (
        <p className="text-xs text-foreground/80">{analysis.outcomeComment}</p>
      )}

      {products.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Produit</th>
              <th className="py-1.5 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-border/60">
            {products.map(p => {
              const meta = PRODUCT_STATUS_META[p.status] || { label: p.status, pill: 'bg-muted' }
              return (
                <tr key={p.key}>
                  <td className="py-1.5 pr-3 align-top">
                    {p.label}
                    {p.evidence?.[0] && !editing && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        « {p.evidence[0]} »
                      </p>
                    )}
                  </td>
                  <td className="py-1.5 align-top">
                    {editing ? (
                      <OutcomeSelect
                        value={form.products[p.key]}
                        labels={PRODUCT_STATUS_LABELS}
                        onChange={v =>
                          v &&
                          setForm(cur => ({ ...cur, products: { ...cur.products, [p.key]: v } }))
                        }
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill className={meta.pill}>{meta.label}</Pill>
                        {p.opportunity === 'oubliee' && (
                          <Pill className="bg-amber-500/10 text-amber-600">
                            Opportunité oubliée
                          </Pill>
                        )}
                        {p.opportunity === 'volontairement_non_presente' && (
                          <Pill className="bg-slate-500/10 text-muted-foreground">
                            Volontairement non présenté
                          </Pill>
                        )}
                        {p.naReason && (
                          <span className="text-xs text-muted-foreground">
                            {NA_REASON_LABELS[p.naReason] || p.naReason}
                            {p.naDetail ? ` — ${p.naDetail}` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
            Annuler
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {analysis.outcomeOverriddenAt
          ? `Corrigé par ${analysis.outcomeOverriddenBy || '—'} le ${formatDateTime(new Date(analysis.outcomeOverriddenAt))}`
          : 'Pré-rempli par l’IA'}
      </p>
    </div>
  )
}

/** Calculs annoncés au client, recalculés, et contradictions relevées dans l'échange. */
export function ConsistencySection({ analysis }) {
  const checks = analysis.calculationChecks || []
  const contradictions = analysis.contradictions || []
  if (!checks.length && !contradictions.length) return null
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <h3 className="text-sm font-semibold">Cohérence des chiffres et du discours</h3>
      {checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((c, i) => {
            const meta = CHECK_STATUS_META[c.status] || CHECK_STATUS_META.non_verifiable
            return (
              <li key={i} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className={meta.pill}>{meta.label}</Pill>
                  <span className="italic">« {c.quote} »</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {c.expression}
                  {typeof c.announced === 'number' && ` · annoncé ${c.announced}`}
                  {typeof c.recomputed === 'number' && ` · recalculé ${c.recomputed}`}
                </p>
                {c.comment && <p className="mt-0.5 text-foreground/80">{c.comment}</p>}
              </li>
            )
          })}
        </ul>
      )}
      {contradictions.length > 0 && (
        <ul className="space-y-2">
          {contradictions.map((c, i) => (
            <li key={i} className="text-xs">
              <Pill className="bg-red-500/10 text-red-600">Contradiction · {c.topic}</Pill>
              <p className="mt-1 italic">« {c.quoteA} »</p>
              <p className="italic">« {c.quoteB} »</p>
              {c.comment && <p className="mt-0.5 text-foreground/80">{c.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
