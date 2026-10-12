import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/details/DetailPrimitives'
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { delta, formatNumber, formatRelativeDate } from '../stats-format'

/**
 * Comparatif du score coaching entre intervenants, sur la période.
 *
 * Forme : barres horizontales triées, une seule teinte. Le sujet est la magnitude
 * (qui score le plus), pas l'identité des personnes — une couleur par commercial
 * n'apporterait rien et casserait au-delà de quelques lignes. La moyenne d'équipe
 * est matérialisée par un repère vertical : sans référence, un score de 62 ne dit
 * rien.
 *
 * Le score vient du backend (`CoachingAnalysis.score`, source de vérité) : il n'est
 * jamais recalculé ici.
 *
 * `nbAnalyses` est affiché sur chaque ligne parce qu'une moyenne sur 2 échanges et
 * une moyenne sur 40 ne se comparent pas — et une ligne à faible effectif est
 * signalée explicitement.
 */
const FAIBLE_EFFECTIF = 3

export default function CoachingScoreboardCard({ scoreboard, loading }) {
  const navigate = useNavigate()

  const rows = useMemo(() => scoreboard?.rows || [], [scoreboard])
  const moyenneEquipe = scoreboard?.scoreMoyenEquipe ?? null

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score coaching par intervenant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map(row => (
            <Skeleton key={row} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Score coaching par intervenant</CardTitle>
        <p className="text-sm text-muted-foreground">
          Moyenne des analyses d’échanges notées sur la période, sur 100
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Moyenne équipe"
            value={moyenneEquipe == null ? '—' : formatNumber(moyenneEquipe, 1)}
            hint="Toutes analyses notées"
            delta={delta(moyenneEquipe, scoreboard?.scoreMoyenEquipePrecedent)}
            deltaSuffix=" pt"
            deltaGoodDirection="up"
          />
          <StatTile
            label="Analyses notées"
            value={formatNumber(scoreboard?.nbAnalyses || 0)}
            hint="Échanges exploitables"
          />
          <StatTile
            label="Intervenants comparés"
            value={formatNumber(rows.length)}
            hint="Au moins une analyse notée"
          />
        </div>

        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Aucune analyse coaching notée sur cette période
          </p>
        ) : (
          <div className="space-y-2.5">
            {rows.map(row => {
              const score = row.scoreMoyen ?? 0
              const isBelowTeam = moyenneEquipe != null && score < moyenneEquipe
              const faibleEffectif = row.nbAnalyses < FAIBLE_EFFECTIF

              return (
                <button
                  key={`${row.subjectRole}-${row.subjectId}`}
                  type="button"
                  onClick={() =>
                    navigate(
                      row.subjectRole === 'manager'
                        ? `/managers/${row.subjectId}`
                        : `/commerciaux/${row.subjectId}`
                    )
                  }
                  className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                  title="Ouvrir la fiche de l’intervenant"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{row.subjectName}</span>
                      {row.subjectRole === 'manager' && (
                        <Badge variant="outline" className="shrink-0 bg-background text-[10px]">
                          Manager
                        </Badge>
                      )}
                      {faibleEffectif && (
                        <span
                          className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                          title={`Moyenne sur ${row.nbAnalyses} analyse${row.nbAnalyses > 1 ? 's' : ''} seulement`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          peu d’analyses
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5 text-sm tabular-nums">
                      <DeltaChip delta={row.deltaScore} />
                      <span className="font-semibold">{formatNumber(score, 1)}</span>
                    </span>
                  </div>

                  {/* Piste de 0 à 100 : la longueur de barre est directement le score. */}
                  <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={`h-full rounded-full ${
                        isBelowTeam ? 'bg-muted-foreground/50' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
                    />
                    {moyenneEquipe != null && (
                      <span
                        className="absolute top-0 h-full w-0.5 bg-foreground/40"
                        style={{ left: `${Math.min(Math.max(moyenneEquipe, 0), 100)}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {formatNumber(row.nbAnalyses)} analyse{row.nbAnalyses > 1 ? 's' : ''}
                    {row.scoreMin != null &&
                      row.scoreMax != null &&
                      ` · de ${formatNumber(row.scoreMin, 1)} à ${formatNumber(row.scoreMax, 1)}`}
                    {row.nbLowConfidence > 0 && ` · ${row.nbLowConfidence} à confiance faible`}
                    {row.nbInexploitable > 0 && ` · ${row.nbInexploitable} inexploitable`}
                    {` · dernière ${formatRelativeDate(row.derniereAnalyseAt).toLowerCase()}`}
                  </p>
                </button>
              )
            })}

            {moyenneEquipe != null && (
              <p className="pt-1 text-xs text-muted-foreground">
                Le repère vertical sur chaque piste marque la moyenne d’équipe (
                {formatNumber(moyenneEquipe, 1)}). Les barres grises sont sous cette moyenne.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Écart de score vs période précédente, en pastille compacte. */
function DeltaChip({ delta: value }) {
  if (value == null || value === 0) return null

  const isUp = value > 0
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-semibold ${
        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
      }`}
      title="Écart vs période précédente"
    >
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: 1,
        signDisplay: 'always',
      }).format(value)}
    </span>
  )
}
