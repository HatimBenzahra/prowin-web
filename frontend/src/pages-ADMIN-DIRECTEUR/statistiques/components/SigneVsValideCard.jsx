import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { StatTile } from '@/components/details/DetailPrimitives'
import { getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'
import { formatDayLabel, formatNumber, formatPeriodKey } from '../stats-format'
import { periodKeyForDate } from '../stats-period'

/**
 * Terrain vs back-office : ce que les commerciaux annoncent, ce que WinLeadPlus
 * confirme.
 *
 * Une seule échelle pour les deux séries — ce sont des contrats dans les deux cas.
 * Jamais deux axes : la comparaison n'a de sens que si les hauteurs sont
 * directement comparables.
 *
 * Les deux séries ne s'alignent pas forcément dans le temps : un contrat signé fin
 * juillet peut être validé début août. Le graphe montre donc deux flux datés
 * chacun par son propre fait générateur (signature terrain / validation
 * back-office), et c'est le délai médian, affiché à côté, qui relie les deux.
 *
 * Palette : motif d'emphase, pas deux catégories de même rang. Le contrat **validé**
 * est la mesure qui compte, il porte le vert de `CONTRAT_SIGNE` ; le signé n'est
 * qu'une annonce, il sert de référence en gris neutre. Même parti que
 * `MonthlyPaceCard`, et mêmes chiffres au validateur : séparation ΔE 18,3 en vision
 * normale, 10,5 deutan, 13,5 tritan. Le gris échoue au « chroma floor », ce qui est
 * attendu pour une référence — le colorer ferait lire deux séries concurrentes.
 *
 * `--chart-2` a été écarté : associé au vert de `CONTRAT_SIGNE`, il tombe à ΔE 12,5
 * en vision normale (seuil 15), deux verts qu'on ne distingue pas.
 */
const chartConfig = {
  valides: {
    label: 'Validés (back-office)',
    color: getStatusChartColor(StatutPorte.CONTRAT_SIGNE),
  },
  signes: {
    label: 'Signés (terrain)',
    color: getStatusChartColor(StatutPorte.NON_VISITE),
  },
}

export default function SigneVsValideCard({ timeline, contratsValides, granularity }) {
  const data = useMemo(() => {
    const signesByKey = new Map()

    // La timeline est toujours au jour ; on la replie sur la granularité choisie
    // pour que les deux séries partagent les mêmes catégories d'abscisse.
    ;(timeline || []).forEach(point => {
      const date = new Date(point.date)
      if (Number.isNaN(date.getTime())) return

      const key = periodKeyForDate(date, granularity)
      signesByKey.set(key, (signesByKey.get(key) || 0) + (point.contratsSignes || 0))
    })

    const validesByKey = new Map(
      (contratsValides?.series || []).map(point => [point.periodKey, point.contratsValides])
    )

    const keys = [...new Set([...signesByKey.keys(), ...validesByKey.keys()])].sort((a, b) =>
      a.localeCompare(b)
    )

    return keys.map(key => ({
      key,
      label: granularity === 'day' ? formatDayLabel(`${key}T00:00:00`) : formatPeriodKey(key),
      signes: signesByKey.get(key) || 0,
      valides: validesByKey.get(key) || 0,
    }))
  }, [timeline, contratsValides, granularity])

  const totalSignes = data.reduce((sum, point) => sum + point.signes, 0)
  const totalValides = contratsValides?.total ?? 0
  const ecart = totalSignes - totalValides
  const hasData = data.some(point => point.signes > 0 || point.valides > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signés terrain vs validés back-office</CardTitle>
        <p className="text-sm text-muted-foreground">
          Les contrats sont datés par leur propre fait générateur : signature pour le terrain,
          validation pour le back-office
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Écart signés → validés"
            value={formatNumber(ecart)}
            hint={
              ecart > 0
                ? 'Contrats annoncés non encore confirmés'
                : ecart < 0
                  ? 'Validations de signatures antérieures'
                  : 'Terrain et back-office alignés'
            }
          />
          <StatTile
            label="Délai médian de validation"
            value={
              contratsValides?.delaiMedianValidationJours == null
                ? '—'
                : `${formatNumber(contratsValides.delaiMedianValidationJours, 1)} j`
            }
            hint="Entre signature et validation"
          />
          <StatTile
            label="Sans date de signature"
            value={formatNumber(contratsValides?.nbSansDateSignature || 0)}
            hint="Délai non calculable sur ces contrats"
          />
        </div>

        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Aucun contrat signé ni validé sur cette période
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {/* La référence grise d'abord, la mesure ensuite : la barre qui compte
                  se lit à droite de son point de comparaison. */}
              <Bar dataKey="signes" fill="var(--color-signes)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="valides" fill="var(--color-valides)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
