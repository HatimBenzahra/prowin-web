import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getStatusChartColor, getStatusLabel, StatutPorte } from '@/constants/domain/porte-status'
import { formatNumber } from '../stats-format'

/**
 * Répartition des issues des passages sur la période.
 *
 * Barres séparées, chacune libellée, plutôt qu'un donut ou une barre empilée : les
 * couleurs de statut du design system échouent au validateur sur la paire
 * Absent ↔ Rendez-vous pris (ΔE 5,7 en vision normale, seuil 15), donc l'identité
 * doit venir du libellé et la couleur ne peut être qu'un renfort. Même traitement
 * que `ProspectionOutcomesCard` sur le Dashboard.
 *
 * La largeur d'une barre est sa part du total des passages, cohérente avec le
 * pourcentage affiché à côté.
 *
 * `NECESSITE_REPASSAGE` est volontairement absent : le flow de prospection mobile
 * ne l'écrit jamais (il ne propose que six statuts, et le repassage y est porté par
 * `ABSENT`). L'afficher produisait une barre structurellement à zéro.
 *
 * Les deux statuts rejouables sont regroupés en fin de liste et annotés : une porte
 * `ABSENT` ou `RENDEZ_VOUS_PRIS` n'est pas une issue, c'est un travail en attente.
 * Seuls contrat / argumenté / refus concluent réellement une porte.
 */
const OUTCOME_KEYS = [
  { key: 'contratsSignes', statut: StatutPorte.CONTRAT_SIGNE, conclut: true },
  { key: 'argumentes', statut: StatutPorte.ARGUMENTE, conclut: true },
  { key: 'refus', statut: StatutPorte.REFUS, conclut: true },
  { key: 'rendezVousPris', statut: StatutPorte.RENDEZ_VOUS_PRIS, conclut: false },
  { key: 'absents', statut: StatutPorte.ABSENT, conclut: false },
]

export default function OutcomesCard({ current }) {
  const { total, conclus, buckets } = useMemo(() => {
    if (!current) return { total: 0, conclus: 0, buckets: [] }

    const rows = OUTCOME_KEYS.map(({ key, statut, conclut }) => ({
      statut,
      conclut,
      count: current[key] || 0,
    }))
    const sum = rows.reduce((acc, row) => acc + row.count, 0)

    return {
      total: sum,
      conclus: rows.filter(row => row.conclut).reduce((acc, row) => acc + row.count, 0),
      buckets: rows.map(row => ({
        ...row,
        pct: sum > 0 ? Math.round((row.count / sum) * 1000) / 10 : 0,
      })),
    }
  }, [current])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Où vont les portes</CardTitle>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{formatNumber(total)}</span>{' '}
          passage{total > 1 ? 's' : ''} enregistré{total > 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucun passage sur cette période
          </p>
        ) : (
          <div className="space-y-3.5">
            {buckets.map((bucket, index) => (
              <div key={bucket.statut}>
                {/* Frontière entre ce qui conclut une porte et ce qui la laisse à traiter. */}
                {index > 0 && buckets[index - 1].conclut && !bucket.conclut && (
                  <p className="mb-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    Ci-dessous : portes non conclues, à retraiter
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {getStatusLabel(bucket.statut)}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatNumber(bucket.count)} · {formatNumber(bucket.pct, 1)} %
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
              </div>
            ))}

            <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground tabular-nums">
              {formatNumber(conclus)} passage{conclus > 1 ? 's' : ''} sur {formatNumber(total)}{' '}
              {conclus > 1 ? 'ont' : 'a'} conclu une porte (
              {formatNumber(total > 0 ? (conclus / total) * 100 : 0, 1)} %).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
