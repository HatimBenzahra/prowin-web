import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'

const BAR_COLOR = getStatusChartColor(StatutPorte.RENDEZ_VOUS_PRIS)

/**
 * Table de pilotage par commercial.
 *
 * Une table et non un graphe à barres : trois lignes et une seule mesure ne
 * justifient pas la pleine largeur, et une barre en `w-full` s'y lit comme une
 * barre de chargement. La densité de colonnes est ce qui mérite l'espace.
 *
 * Le volume est encodé par un remplissage À L'INTÉRIEUR de la cellule « Portes »,
 * donc borné par elle : il ne peut structurellement plus s'étirer avec l'écran.
 *
 * « Refus » affiche le refus sec (hors argumentés) : le champ `refus` de l'agrégat
 * backend inclut les ARGUMENTE, les mettre en colonnes voisines les compterait deux
 * fois. Voir rankTeamActivity.
 *
 * Le conteneur reste scrollable — neuf colonnes débordent sur écran étroit — mais la
 * barre est masquée via l'utilitaire `scrollbar-hidden` de index.css.
 */

const NUM_CELL = 'px-2 py-2 text-right tabular-nums'
const HEAD_CELL = 'px-2 py-1.5 text-right font-medium text-muted-foreground'

/** Un zéro ne porte pas de signal : on le laisse en retrait. */
function Num({ value }) {
  if (!value) return <span className="text-muted-foreground/50">0</span>
  return <span className="text-foreground">{value}</span>
}

function ConversionValue({ taux }) {
  if (taux == null) return <span className="text-muted-foreground/50">—</span>
  if (taux === 0) return <span className="text-muted-foreground">0 %</span>
  return <span className="font-semibold text-foreground">{taux.toFixed(1)} %</span>
}

export default function TeamActivityCard({ team, rollingDays, inactiveAfterDays }) {
  const maxPortes = team.reduce((max, row) => Math.max(max, row.portes), 0)
  const totalPortes = team.reduce((sum, row) => sum + row.portes, 0)
  const commercialLabel = team.length > 1 ? 'commerciaux' : 'commercial'

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="truncate text-sm font-semibold">Activité par commercial</CardTitle>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {rollingDays} derniers jours
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{totalPortes}</span> porte
          {totalPortes > 1 ? 's' : ''} prospectée{totalPortes > 1 ? 's' : ''} par{' '}
          <span className="font-semibold tabular-nums text-foreground">{team.length}</span>{' '}
          {commercialLabel}
        </p>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        {team.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune activité sur la période
          </p>
        ) : (
          <div className="scrollbar-hidden max-h-[420px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  <th
                    scope="col"
                    className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                  >
                    Commercial
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    Portes
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    Absents
                  </th>
                  <th
                    scope="col"
                    className={HEAD_CELL}
                    title="Refus secs, hors échanges argumentés"
                  >
                    Refus
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    Argum.
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    RDV
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    Contrats
                  </th>
                  <th scope="col" className={HEAD_CELL}>
                    Taux
                  </th>
                  <th scope="col" className={HEAD_CELL} title="Dernière activité enregistrée">
                    Vu
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map(row => (
                  <tr key={row.key} className="border-b border-border/40 last:border-0">
                    <th
                      scope="row"
                      className="max-w-[220px] truncate px-2 py-2 text-left font-medium"
                    >
                      {row.userName}
                    </th>

                    <td className={`${NUM_CELL} relative`}>
                      {/* Remplissage borné par la cellule : jamais d'étirement. */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1 left-1 rounded-sm"
                        style={{
                          width:
                            maxPortes > 0
                              ? `calc(${(row.portes / maxPortes) * 100}% - 0.5rem)`
                              : '0px',
                          backgroundColor: BAR_COLOR,
                          opacity: 0.16,
                        }}
                      />
                      <span className="relative font-semibold text-foreground">{row.portes}</span>
                    </td>

                    <td className={NUM_CELL}>
                      <Num value={row.absents} />
                    </td>
                    <td className={NUM_CELL}>
                      <Num value={row.refusSecs} />
                    </td>
                    <td className={NUM_CELL}>
                      <Num value={row.argumentes} />
                    </td>
                    <td className={NUM_CELL}>
                      <Num value={row.rdv} />
                    </td>
                    <td className={NUM_CELL}>
                      <Num value={row.contrats} />
                    </td>
                    <td className={NUM_CELL}>
                      <ConversionValue taux={row.tauxConversion} />
                    </td>
                    <td
                      className={`${NUM_CELL} ${row.isIdle ? 'text-muted-foreground' : ''}`}
                      title={
                        row.isIdle
                          ? `Aucune activité depuis ${inactiveAfterDays} jours ou plus`
                          : undefined
                      }
                    >
                      {row.idleDays == null ? '—' : `${row.idleDays} j`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
