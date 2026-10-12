import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getHabitatMeta } from '@/constants/domain/habitat'
import { formatNumber } from '../stats-format'

/**
 * Le stock ventilé par type de bâtiment.
 *
 * Une porte d'immeuble et une maison ne coûtent pas le même effort : 40 portes dans
 * une tour c'est un déplacement, 40 maisons c'est une journée de marche. Agréger les
 * deux dans un total unique mesure surtout la composition du portefeuille. Le flow
 * mobile distingue déjà les trois types (une MAISON s'auto-soumet sans interaction,
 * un PAVILLON compte `nbMaisonsPrevu` foyers), la lecture des stats doit suivre.
 *
 * `capacité déclarée` est la grille saisie à la création, et c'est le dénominateur
 * canonique de la couverture — pas le nombre de portes créées, puisque le mobile les
 * crée une par une au fil de la prospection.
 */
export default function PipelineHabitatCard({ habitat }) {
  const rows = habitat || []

  const totals = rows.reduce(
    (acc, row) => ({
      batiments: acc.batiments + row.batiments,
      capaciteDeclaree: acc.capaciteDeclaree + row.capaciteDeclaree,
      prospectees: acc.prospectees + row.prospectees,
      aTraiter: acc.aTraiter + row.aTraiter,
    }),
    { batiments: 0, capaciteDeclaree: 0, prospectees: 0, aTraiter: 0 }
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portefeuille par type de bâtiment</CardTitle>
        <p className="text-sm text-muted-foreground">
          La couverture se calcule sur la grille déclarée à la création, pas sur les portes créées
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucun bâtiment sur ce périmètre
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Bâtiments</TableHead>
                    <TableHead className="text-right">Capacité déclarée</TableHead>
                    <TableHead className="text-right">Prospectées</TableHead>
                    <TableHead className="text-right">Couverture</TableHead>
                    <TableHead className="text-right">À traiter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.typeHabitat}>
                      <TableCell className="font-medium">
                        {getHabitatMeta(row.typeHabitat).labelPlural}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.batiments)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.capaciteDeclaree > 0 ? (
                          formatNumber(row.capaciteDeclaree)
                        ) : (
                          <span
                            className="text-muted-foreground"
                            title="Aucune grille déclarée — couverture non calculable"
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.prospectees)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.capaciteDeclaree > 0 ? (
                          `${formatNumber(row.couverture, 1)} %`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.aTraiter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {rows.length > 1 && (
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            Total : {formatNumber(totals.batiments)} bâtiments · {formatNumber(totals.prospectees)}{' '}
            portes prospectées sur {formatNumber(totals.capaciteDeclaree)} déclarées ·{' '}
            {formatNumber(totals.aTraiter)} à traiter.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
