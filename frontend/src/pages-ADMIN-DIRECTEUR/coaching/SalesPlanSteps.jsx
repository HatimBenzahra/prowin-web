function stepWeightLabel(s) {
  if (s.appliesWhen?.startsWith('productDetected')) return 'module · si détecté'
  if (s.appliesWhen === 'contractSigned') return `poids ${s.weight} · si signé`
  return `poids ${s.weight}`
}

/** Étapes et critères d'un plan de vente : version active ou ancienne version. */
export default function SalesPlanSteps({ steps }) {
  return (
    <div className="space-y-2.5">
      {(steps || []).map(s => (
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
  )
}
