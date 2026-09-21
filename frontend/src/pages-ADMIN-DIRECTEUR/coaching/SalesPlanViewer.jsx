import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import CoachingService from '@/services/coaching/coaching.service'

function stepWeightLabel(s) {
  if (s.appliesWhen?.startsWith('productDetected')) return 'module · si détecté'
  if (s.appliesWhen === 'contractSigned') return `poids ${s.weight} · si signé`
  return `poids ${s.weight}`
}

export default function SalesPlanViewer() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    CoachingService.activePlan()
      .then(p => active && setPlan(p))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du plan de vente…
      </div>
    )
  }
  if (!plan) {
    return <p className="text-sm text-muted-foreground">Aucun plan de vente actif.</p>
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{plan.title}</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
          v{plan.version} · actif
        </span>
      </div>
      <div className="space-y-2.5">
        {(plan.steps || []).map(s => (
          <div key={s.key} className="overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5">
              <span className="font-medium">{s.label}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
                {stepWeightLabel(s)}
              </span>
            </div>
            <ul>
              {(s.criteria || []).map(c => (
                <li
                  key={c.key}
                  className="flex items-start justify-between gap-3 border-t border-dashed border-border/60 px-4 py-2 text-sm first:border-t-0"
                >
                  <span className="text-foreground/90">{c.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {c.points} pts{c.evidenceRequired ? ' · preuve' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-lg border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Vue lecture seule : elle reflète le plan de vente markdown versionné qui pilote le scoring.
        L'édition du plan viendra plus tard.
      </p>
    </div>
  )
}
