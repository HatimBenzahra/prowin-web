import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatNumber } from '../stats-format'

/**
 * Comparatif des intervenants sur la période, **normalisé**.
 *
 * Le point de la table est la colonne « portes / jour actif » : un classement en
 * volumes bruts ne mesure que le temps passé sur le terrain, pas la manière de
 * travailler. Deux commerciaux à 40 et 120 portes ne sont comparables qu'une fois
 * ramenés à leur nombre de jours d'activité.
 *
 * Ce n'est pas un classement : il n'y a ni points ni rang ici. Le classement
 * officiel vit sur sa page (`/gamification`) et s'appuie sur les snapshots mensuels
 * WinLeadPlus, seule source de vérité pour les points. Dupliquer un barème ici
 * produirait un deuxième score concurrent.
 *
 * Chaque ligne est cliquable et mène à la fiche de l'intervenant : une page de stats
 * qui ne mène nulle part oblige à tout refaire à la main.
 */
const COLUMNS = [
  { key: 'userName', label: 'Intervenant', align: 'left', numeric: false },
  { key: 'contratsSignes', label: 'Signés', align: 'right', numeric: true },
  { key: 'rendezVousPris', label: 'RDV', align: 'right', numeric: true },
  { key: 'nbPortesProspectes', label: 'Portes', align: 'right', numeric: true },
  { key: 'portesParJour', label: 'Portes / jour', align: 'right', numeric: true },
  { key: 'tauxConversion', label: 'Conversion', align: 'right', numeric: true },
  { key: 'scoreCoaching', label: 'Score coaching', align: 'right', numeric: true },
]

export default function TeamComparisonTable({ ownerActivity, scoreboard, current }) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState('contratsSignes')
  const [sortAsc, setSortAsc] = useState(false)

  const rows = useMemo(() => {
    const scoreByKey = new Map(
      (scoreboard?.rows || []).map(row => [`${row.subjectRole}:${row.subjectId}`, row])
    )

    // Faute d'un nombre de jours travaillés par personne, on normalise sur les jours
    // d'activité de la période observée. La base est donc identique pour tous : la
    // colonne compare des cadences, pas des présences individuelles.
    const joursActifs = Math.max(current?.nbJoursActifs || 0, 1)

    return (ownerActivity || []).map(entry => {
      const coaching = scoreByKey.get(`${entry.userType}:${entry.userId}`)
      return {
        ...entry,
        portesParJour: Math.round((entry.nbPortesProspectes / joursActifs) * 10) / 10,
        scoreCoaching: coaching?.scoreMoyen ?? null,
        nbAnalyses: coaching?.nbAnalyses ?? 0,
      }
    })
  }, [ownerActivity, scoreboard, current])

  const sorted = useMemo(() => {
    const factor = sortAsc ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]

      if (typeof left === 'string' || typeof right === 'string') {
        return factor * String(left ?? '').localeCompare(String(right ?? ''), 'fr')
      }
      // Les valeurs absentes restent en bas quel que soit le sens du tri.
      if (left == null) return 1
      if (right == null) return -1
      return factor * (left - right)
    })
  }, [rows, sortKey, sortAsc])

  const toggleSort = key => {
    if (key === sortKey) {
      setSortAsc(previous => !previous)
      return
    }
    setSortKey(key)
    setSortAsc(key === 'userName')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparatif des intervenants</CardTitle>
        <p className="text-sm text-muted-foreground">
          Volumes et cadence sur la période. Le classement officiel et les points sont sur la page
          Classement.
        </p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune activité par intervenant sur cette période
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map(column => (
                      <TableHead
                        key={column.key}
                        className={column.align === 'right' ? 'text-right' : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={`inline-flex items-center gap-1 hover:text-foreground ${
                            column.align === 'right' ? 'flex-row-reverse' : ''
                          } ${sortKey === column.key ? 'text-foreground' : ''}`}
                        >
                          {column.label}
                          {sortKey === column.key &&
                            (sortAsc ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            ))}
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(row => (
                    <TableRow
                      key={`${row.userType}-${row.userId}`}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate(
                          row.userType === 'manager'
                            ? `/managers/${row.userId}`
                            : `/commerciaux/${row.userId}`
                        )
                      }
                      title="Ouvrir la fiche de l’intervenant"
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <span className="truncate">{row.userName}</span>
                          {row.userType === 'manager' && (
                            <Badge variant="outline" className="bg-background text-[10px]">
                              Manager
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(row.contratsSignes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.rendezVousPris)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.nbPortesProspectes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.portesParJour, 1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.tauxConversion, 1)} %
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.scoreCoaching == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span title={`${row.nbAnalyses} analyse${row.nbAnalyses > 1 ? 's' : ''}`}>
                            {formatNumber(row.scoreCoaching, 1)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {current?.nbJoursActifs > 0 && sorted.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            « Portes / jour » est ramené aux {formatNumber(current.nbJoursActifs)} journée
            {current.nbJoursActifs > 1 ? 's' : ''} d’activité de la période, base identique pour
            tous.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
