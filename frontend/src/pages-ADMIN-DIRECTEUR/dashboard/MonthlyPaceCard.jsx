import React from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'

/**
 * Le mois en cours est la série mise en avant, le mois précédent une ligne de
 * référence volontairement neutre : motif d'emphase (une série colorée, la
 * référence en gris) et non deux catégories de même rang. Le gris échoue au
 * « chroma floor » du validateur de palette, ce qui est attendu ici — le colorer
 * ferait lire deux séries concurrentes au lieu d'une mesure et son repère.
 * Séparation CVD 10.5 (deutan) et 18.3 en vision normale : validées.
 */
const CURRENT_COLOR = getStatusChartColor(StatutPorte.CONTRAT_SIGNE)
const PREVIOUS_COLOR = getStatusChartColor(StatutPorte.NON_VISITE)

const chartConfig = {
  current: { label: 'Mois en cours', color: CURRENT_COLOR },
  previous: { label: 'Mois précédent', color: PREVIOUS_COLOR },
}

function DeltaBadge({ delta }) {
  if (delta === 0) {
    return <span className="text-xs font-medium text-muted-foreground">au même niveau</span>
  }
  const isAhead = delta > 0
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        isAhead ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
      }`}
    >
      {isAhead ? '+' : ''}
      {delta} vs mois dernier
    </span>
  )
}

export default function MonthlyPaceCard({ pace }) {
  const { series, current, delta } = pace
  const hasData = series.length > 0 && series.some(point => point.current > 0 || point.previous > 0)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="truncate text-sm font-semibold">Rythme du mois</CardTitle>
          <DeltaBadge delta={delta} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{current}</span> contrat
          {current > 1 ? 's' : ''} signé{current > 1 ? 's' : ''} depuis le 1er
        </p>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        {!hasData ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucun contrat signé sur les deux périodes
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={value => `Jour ${value}`} />}
              />
              <Line
                dataKey="previous"
                name="previous"
                type="monotone"
                stroke={PREVIOUS_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                dataKey="current"
                name="current"
                type="monotone"
                stroke={CURRENT_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
