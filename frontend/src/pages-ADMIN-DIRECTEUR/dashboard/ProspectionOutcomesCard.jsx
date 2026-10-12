import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getStatusLabel, getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'

/**
 * Où vont les portes prospectées : cinq issues qui somment au total.
 *
 * Barres séparées et non empilées, et chacune porte son libellé : les couleurs de
 * statut du design system échouent au validateur de palette sur la paire
 * Absent / Rendez-vous pris (ΔE 5.7 en vision normale, seuil 15), donc l'identité
 * ne doit jamais reposer sur la couleur. Ici elle vient du libellé, la couleur n'est
 * qu'un renfort. Les libellés visibles couvrent aussi l'obligation liée au faible
 * contraste de trois de ces couleurs sur la surface.
 *
 * La largeur d'une barre est sa part du total, cohérente avec le pourcentage affiché.
 */
export default function ProspectionOutcomesCard({ outcomes, rollingDays }) {
  const { total, buckets, argumentes, refusSecs } = outcomes

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="truncate text-sm font-semibold">Où vont les portes</CardTitle>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {rollingDays} derniers jours
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{total}</span> porte
          {total > 1 ? 's' : ''} prospectée{total > 1 ? 's' : ''}
        </p>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        {total === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune porte prospectée sur la période
          </p>
        ) : (
          <div className="space-y-3">
            {buckets.map(bucket => (
              <div key={bucket.statut}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium">
                    {getStatusLabel(bucket.statut)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {bucket.count} · {bucket.pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${bucket.pct}%`,
                      backgroundColor: getStatusChartColor(bucket.statut),
                    }}
                  />
                </div>
                {bucket.statut === StatutPorte.REFUS && argumentes > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    dont {argumentes} argumenté{argumentes > 1 ? 's' : ''} non conclu
                    {argumentes > 1 ? 's' : ''} · {refusSecs} refus sec
                    {refusSecs > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
