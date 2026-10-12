import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GameIcon from '@/components/gamification/GameIcon'
import { StatTile } from '@/components/details/DetailPrimitives'
import PortesProspectionChart from '@/components/charts/PortesProspectionChart'
import PortesWeeklyChart from '@/components/charts/PortesWeeklyChart'
import PortesStatusChart from '@/components/charts/PortesStatusChart'

/**
 * Section prospection : 4 mini-KPI + funnel terrain + graphiques (statuts, portes/jour, hebdo).
 * Extrait de DetailsPage pour être réutilisable (fiche commercial refondue + manager).
 * Couverture = portes prospectées / capacité déclarée (grille), jamais / portes créées.
 */
export default function ProspectionChartsSection({ charts = [], totalDoors }) {
  const summary = useMemo(() => {
    const portes = charts.find(chart => chart.props?.portes)?.props?.portes || []
    const normalizeStatus = status => String(status || '').toUpperCase()
    const portesProspectees = portes.filter(
      porte => normalizeStatus(porte.statut) !== 'NON_VISITE'
    ).length
    const totalPortes = totalDoors > 0 ? totalDoors : 0
    const contrats = portes
      .filter(porte => normalizeStatus(porte.statut) === 'CONTRAT_SIGNE')
      .reduce((sum, porte) => sum + (porte.nbContrats || 1), 0)
    const rdv = portes.filter(porte => normalizeStatus(porte.statut) === 'RENDEZ_VOUS_PRIS').length
    const refus = portes.filter(porte => normalizeStatus(porte.statut) === 'REFUS').length
    const argumentes = portes.filter(porte => normalizeStatus(porte.statut) === 'ARGUMENTE').length
    const absents = portes.filter(porte => normalizeStatus(porte.statut) === 'ABSENT').length
    const couverture = totalPortes > 0 ? Math.round((portesProspectees / totalPortes) * 100) : 0
    const opportunites = contrats + rdv + refus + argumentes
    const conversion = opportunites > 0 ? Math.round((contrats / opportunites) * 100) : 0
    const contact = portesProspectees > 0 ? Math.round((opportunites / portesProspectees) * 100) : 0

    return {
      totalPortes,
      portesProspectees,
      contrats,
      rdv,
      refus,
      argumentes,
      absents,
      couverture,
      conversion,
      contact,
      funnel: [
        { label: 'Portes prospectées', value: portesProspectees, percent: couverture },
        { label: 'Contacts qualifiés', value: opportunites, percent: contact },
        {
          label: 'Rendez-vous',
          value: rdv,
          percent: portesProspectees > 0 ? Math.round((rdv / portesProspectees) * 100) : 0,
        },
        {
          label: 'Contrats',
          value: contrats,
          percent: portesProspectees > 0 ? Math.round((contrats / portesProspectees) * 100) : 0,
        },
      ],
    }
  }, [charts, totalDoors])

  const renderChart = (chart, index) => {
    if (chart.type === 'PortesStatusChart') {
      return <PortesStatusChart key={index} {...chart.props} />
    }
    if (chart.type === 'PortesProspectionChart') {
      return <PortesProspectionChart key={index} {...chart.props} />
    }
    if (chart.type === 'PortesWeeklyChart') {
      return <PortesWeeklyChart key={index} {...chart.props} />
    }
    return null
  }

  const statusChart = charts.find(chart => chart.type === 'PortesStatusChart')
  const trendCharts = charts.filter(chart => chart.type !== 'PortesStatusChart')

  return (
    <div className="@container space-y-5">
      <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
        <StatTile
          label="Couverture"
          value={`${summary.couverture}%`}
          hint={`${summary.portesProspectees}/${summary.totalPortes} portes prospectées`}
          iconName="door"
        />
        <StatTile
          label="Contrats"
          value={summary.contrats}
          hint={`${summary.conversion}% de conversion qualifiée`}
          iconName="contract-doc"
        />
        <StatTile
          label="Rendez-vous"
          value={summary.rdv}
          hint="Opportunités à suivre"
          iconName="calendar"
        />
        <StatTile
          label="Points de friction"
          value={summary.refus + summary.argumentes + summary.absents}
          hint={`${summary.refus} refus · ${summary.absents} absents`}
          iconName="brick-wall"
        />
      </div>

      <div className="grid gap-5 @3xl:grid-cols-3">
        <Card className="border-border/60 bg-card @3xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GameIcon name="on-target" size={18} className="text-primary" />
              Funnel terrain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.funnel.map((step, index) => (
              <div key={step.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground">
                    {step.value} · {step.percent}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(step.percent, 100)}%`,
                      opacity: 1 - index * 0.12,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="@3xl:col-span-2">{statusChart && renderChart(statusChart, 0)}</div>
      </div>

      <div className="grid gap-5 @2xl:grid-cols-2">{trendCharts.map(renderChart)}</div>
    </div>
  )
}
