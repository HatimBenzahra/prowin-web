import { useMemo } from 'react'
import {
  CartesianGrid,
  Label,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { formatNumber } from '../stats-format'

/**
 * Le score coaching se traduit-il en contrats ?
 *
 * Chaque point est un intervenant : score coaching en abscisse, taux de conversion
 * terrain en ordonnée. Une seule série — les points ne sont pas des catégories à
 * distinguer, c'est leur position qui parle.
 *
 * **Aucune droite de régression n'est tracée.** Avec une poignée d'intervenants, une
 * tendance ajustée donnerait l'illusion d'une relation démontrée. Les deux repères
 * (moyennes d'équipe) suffisent à lire le nuage en quatre cadrans, sans rien
 * affirmer sur la causalité :
 *
 * - haut-droite : le discours est bon et il convertit ;
 * - bas-droite : bon score mais peu de contrats — regarder le ciblage, la zone, le volume ;
 * - haut-gauche : convertit malgré un score faible — le plan de vente ne capte pas tout ;
 * - bas-gauche : priorité coaching.
 *
 * Les deux mesures viennent de sources indépendantes : le score de
 * `CoachingAnalysis`, la conversion de `statsActivityByOwner`. Le rapprochement se
 * fait ici, sur la clé `role:id`, sans rien recalculer.
 */
const chartConfig = {
  intervenants: { label: 'Intervenants', color: 'var(--primary)' },
}

export default function CoachingVsConversionCard({ scoreboard, ownerActivity }) {
  const points = useMemo(() => {
    const rows = scoreboard?.rows || []
    if (!rows.length) return []

    const activityByKey = new Map(
      (ownerActivity || []).map(entry => [`${entry.userType}:${entry.userId}`, entry])
    )

    return rows
      .map(row => {
        const activity = activityByKey.get(`${row.subjectRole}:${row.subjectId}`)
        if (!activity || row.scoreMoyen == null) return null

        return {
          name: row.subjectName,
          score: row.scoreMoyen,
          conversion: activity.tauxConversion,
          contrats: activity.contratsSignes,
          nbAnalyses: row.nbAnalyses,
        }
      })
      .filter(Boolean)
  }, [scoreboard, ownerActivity])

  const moyennes = useMemo(() => {
    if (!points.length) return null
    const sum = points.reduce(
      (acc, point) => ({
        score: acc.score + point.score,
        conversion: acc.conversion + point.conversion,
      }),
      { score: 0, conversion: 0 }
    )
    return {
      score: Math.round((sum.score / points.length) * 10) / 10,
      conversion: Math.round((sum.conversion / points.length) * 10) / 10,
    }
  }, [points])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Score coaching et conversion réelle</CardTitle>
        <p className="text-sm text-muted-foreground">
          Un point par intervenant. Les repères sont les moyennes d’équipe — aucune tendance n’est
          ajustée.
        </p>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Il faut au moins un intervenant avec un score coaching et de l’activité terrain sur la
            période
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[340px] w-full">
              <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: -8 }}>
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="score"
                  name="Score coaching"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                >
                  <Label
                    value="Score coaching (sur 100)"
                    position="insideBottom"
                    offset={-4}
                    className="fill-muted-foreground text-xs"
                  />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="conversion"
                  name="Taux de conversion"
                  unit=" %"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                >
                  <Label
                    value="Conversion"
                    angle={-90}
                    position="insideLeft"
                    className="fill-muted-foreground text-xs"
                  />
                </YAxis>
                {/* Zone de survol confortable : la cible dépasse le point tracé. */}
                <ZAxis range={[160, 160]} />
                <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
                {moyennes && (
                  <>
                    <ReferenceLine
                      x={moyennes.score}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 4"
                    />
                    <ReferenceLine
                      y={moyennes.conversion}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 4"
                    />
                  </>
                )}
                <Scatter data={points} fill="var(--primary)" />
              </ScatterChart>
            </ChartContainer>

            {moyennes && (
              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                Moyennes d’équipe : score {formatNumber(moyennes.score, 1)} · conversion{' '}
                {formatNumber(moyennes.conversion, 1)} %. {points.length} intervenant
                {points.length > 1 ? 's' : ''} avec score et activité sur la période.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Infobulle nommant l'intervenant : sans le nom, un point du nuage est muet. */
function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-semibold">{point.name}</p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        Score {formatNumber(point.score, 1)} sur {formatNumber(point.nbAnalyses)} analyse
        {point.nbAnalyses > 1 ? 's' : ''}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        Conversion {formatNumber(point.conversion, 1)} % · {formatNumber(point.contrats)} contrat
        {point.contrats > 1 ? 's' : ''}
      </p>
    </div>
  )
}
