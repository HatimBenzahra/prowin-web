import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'
import { formatDayLabel, formatNumber } from '../stats-format'

/**
 * Évolution des trois issues qui décident du résultat : signé, RDV, refus.
 *
 * Trois séries et pas plus : les six statuts sur un même graphe rendaient les
 * courbes illisibles, et la répartition complète est déjà le sujet de la carte
 * « Où vont les portes ».
 *
 * Palette : couleurs de statut du design system. Le validateur de palette les
 * accepte en vision normale comme sous CVD (pire paire RDV↔signé, ΔE 23,3 deutan /
 * 26,5 normal), mais signale deux points en mode sombre : le bleu RDV sort de la
 * bande de luminosité (L 0,716) et son contraste tombe à 2,45:1 en mode clair.
 * D'où légende **et** libellés de séries : l'identité ne repose jamais sur la
 * couleur seule, conformément au traitement déjà retenu pour ces mêmes couleurs
 * dans `ProspectionOutcomesCard`.
 */
const chartConfig = {
  contratsSignes: {
    label: 'Contrats signés',
    color: getStatusChartColor(StatutPorte.CONTRAT_SIGNE),
  },
  rdvPris: {
    label: 'Rendez-vous pris',
    color: getStatusChartColor(StatutPorte.RENDEZ_VOUS_PRIS),
  },
  refus: {
    label: 'Refus',
    color: getStatusChartColor(StatutPorte.REFUS),
  },
}

export default function ActivityTrendCard({ timeline, periodLabel }) {
  const data = useMemo(
    () =>
      (timeline || []).map(point => ({
        label: formatDayLabel(point.date),
        contratsSignes: point.contratsSignes || 0,
        rdvPris: point.rdvPris || 0,
        refus: point.refus || 0,
      })),
    [timeline]
  )

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, point) => ({
          contratsSignes: acc.contratsSignes + point.contratsSignes,
          rdvPris: acc.rdvPris + point.rdvPris,
          refus: acc.refus + point.refus,
        }),
        { contratsSignes: 0, rdvPris: 0, refus: 0 }
      ),
    [data]
  )

  const hasData = data.some(
    point => point.contratsSignes > 0 || point.rdvPris > 0 || point.refus > 0
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle className="text-base">Évolution de l’activité</CardTitle>
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {Object.entries(chartConfig)
            .map(([key, config]) => `${formatNumber(totals[key])} ${config.label.toLowerCase()}`)
            .join(' · ')}
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune activité enregistrée sur cette période
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              {Object.keys(chartConfig).map(key => (
                <Line
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
