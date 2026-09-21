import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import CoachingService from '@/services/coaching/coaching.service'
import { SeverityPill } from './CoachingComponents'

/**
 * Fiches produit actives, en lecture seule. Ce sont elles que le LLM oppose au
 * discours du commercial en passe 2 — avec le plan de vente. Une affirmation ne
 * coûte des points que si elle contredit les deux.
 */
export default function ProductSheetsViewer() {
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    CoachingService.productSheets()
      .then(s => active && setSheets(s))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des fiches produit…
      </div>
    )
  }
  if (sheets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune fiche produit active. Sans fiche, la conformité d'un produit n'est pas jugée.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Fiches produit</h3>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {sheets.length} fiche{sheets.length > 1 ? 's' : ''}
          {sheets.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2.5">
        {sheets.map(sheet => (
          <div key={sheet.slug} className="overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5">
              <span className="font-medium">{sheet.label}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
                v{sheet.version} · {sheet.productKey}
              </span>
            </div>

            <div className="px-4 py-3">
              <h4 className="mb-1.5 text-sm font-semibold">Ce que le commercial peut affirmer</h4>
              <ul className="space-y-1">
                {(sheet.facts || []).map((fact, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>

            {(sheet.forbidden || []).length > 0 && (
              <div className="border-t border-dashed border-border/60 px-4 py-3">
                <h4 className="mb-1.5 text-sm font-semibold">Affirmations surveillées</h4>
                <ul className="space-y-1.5">
                  {sheet.forbidden.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <SeverityPill severity={f.severity} />
                      <span className="text-foreground/90">« {f.say} »</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Vue lecture seule : elle reflète les fiches produit versionnées. C'est ce référentiel que
        l'analyse oppose au discours du commercial pour juger la conformité de ce qu'il a dit du
        produit.
      </p>
    </div>
  )
}
