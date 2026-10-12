import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowDown } from 'lucide-react'
import { formatNumber } from '../stats-format'

/**
 * Le parcours porte → contrat validé, avec le taux de passage d'une étape à la
 * suivante.
 *
 * Deux différences avec l'ancien funnel : il est bâti sur les évènements réels de
 * `StatusHistorique` (et non sur des snapshots agrégés), et il va jusqu'au contrat
 * **validé** — l'étape où l'on perd réellement des contrats était absente.
 *
 * Le taux affiché entre deux étapes est le taux de passage local (étape N / étape
 * N−1), pas la part du total : c'est lui qui désigne l'endroit où ça bloque.
 *
 * Le haut de funnel s'appelle « portes ayant changé de statut » et non « portes
 * touchées », parce que c'est exactement ce que la donnée contient : le backend
 * n'écrit une ligne d'historique que sur changement de statut, donc un repassage
 * sans changement n'y figure pas. Nommer ça « touchées » promettrait un décompte de
 * visites que la base ne tient pas.
 *
 * `ARGUMENTE` compte dans « contacts établis » mais pas dans « intérêt exprimé » :
 * côté mobile c'est un statut **terminal négatif** (« on a discuté, ça n'a rien
 * donné »), pas une étape vers le rendez-vous.
 *
 * Barres en une seule teinte, dégradée par profondeur (forme séquentielle : la
 * magnitude est le sujet, pas l'identité des étapes).
 */
export default function ConversionFunnelCard({ current, contratsValides }) {
  const steps = useMemo(() => {
    if (!current) return []

    const touchees = current.nbPortesDistinctes
    const contactes =
      current.contratsSignes + current.rendezVousPris + current.refus + current.argumentes
    const interesses = current.contratsSignes + current.rendezVousPris
    const signes = current.contratsSignes
    const valides = contratsValides?.total ?? null

    const rows = [
      { key: 'touchees', label: 'Portes ayant changé de statut', value: touchees },
      { key: 'contactes', label: 'Contacts établis', value: contactes },
      { key: 'interesses', label: 'Intérêt exprimé', value: interesses },
      { key: 'signes', label: 'Contrats signés', value: signes },
    ]

    if (valides != null) {
      rows.push({ key: 'valides', label: 'Contrats validés', value: valides })
    }

    const base = Math.max(touchees, 1)
    return rows.map((row, index) => {
      const previousValue = index === 0 ? null : rows[index - 1].value
      return {
        ...row,
        // Part du haut de funnel : donne l'échelle visuelle de la barre.
        partDuTotal: Math.round((row.value / base) * 1000) / 10,
        // Taux de passage local : désigne l'étape qui coûte le plus.
        tauxPassage:
          previousValue && previousValue > 0
            ? Math.round((row.value / previousValue) * 1000) / 10
            : null,
      }
    })
  }, [current, contratsValides])

  const hasData = steps.some(step => step.value > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parcours de conversion</CardTitle>
        <p className="text-sm text-muted-foreground">
          De la porte touchée au contrat confirmé back-office
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune activité sur cette période
          </p>
        ) : (
          <div className="space-y-1">
            {steps.map((step, index) => (
              <div key={step.key}>
                {index > 0 && (
                  <div className="flex items-center gap-1.5 py-1 pl-1 text-xs text-muted-foreground">
                    <ArrowDown className="h-3 w-3 shrink-0" />
                    <span className="tabular-nums">
                      {step.tauxPassage == null
                        ? 'taux indisponible'
                        : `${formatNumber(step.tauxPassage, 1)} % de l’étape précédente`}
                    </span>
                  </div>
                )}
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{step.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatNumber(step.value)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(Math.max(step.partDuTotal, 0), 100)}%`,
                        opacity: 1 - index * 0.14,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
