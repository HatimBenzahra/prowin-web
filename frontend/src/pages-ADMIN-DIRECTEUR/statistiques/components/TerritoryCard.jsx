import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpRight } from 'lucide-react'
import { formatNumber } from '../stats-format'

/**
 * Rendement des zones : où la prospection convertit.
 *
 * Volontairement resserré — la gestion des zones, leur historique et leur
 * comparaison détaillée vivent sur la page Zones, qui en est propriétaire. Ici on
 * répond à une seule question, « quelle zone rend le mieux », et un bouton renvoie
 * vers la page compétente. L'ancienne version rejouait un graphe complet et une
 * table de zones, en doublon de cette page.
 *
 * `zoneStatistics` est un agrégat cumulé côté backend, sans dimension temporelle :
 * il **ne suit pas** le filtre de période de la page. C'est dit explicitement,
 * sinon deux blocs voisins sembleraient se contredire.
 */
const TOP_ZONES = 6

export default function TerritoryCard({ zoneStats }) {
  const navigate = useNavigate()

  const zones = useMemo(() => {
    const rows = [...(zoneStats || [])]
      .sort((a, b) => (b.tauxConversion || 0) - (a.tauxConversion || 0))
      .slice(0, TOP_ZONES)

    const maxConversion = Math.max(...rows.map(zone => zone.tauxConversion || 0), 1)
    return rows.map(zone => ({
      ...zone,
      // Largeur relative à la meilleure zone : sur des taux souvent bas, une échelle
      // 0–100 % écraserait toutes les barres contre la gauche.
      widthPct: Math.round(((zone.tauxConversion || 0) / maxConversion) * 1000) / 10,
    }))
  }, [zoneStats])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rendement par zone</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cumul depuis l’origine — ce bloc ne suit pas le filtre de période
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/zones')}
          >
            Page Zones
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {zones.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune statistique de zone disponible
          </p>
        ) : (
          <div className="space-y-3.5">
            {zones.map(zone => (
              <div key={zone.zoneId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{zone.zoneName}</span>
                    <Badge variant="outline" className="shrink-0 bg-background text-[10px]">
                      {formatNumber(zone.nombreCommerciaux || 0)} intervenant
                      {(zone.nombreCommerciaux || 0) > 1 ? 's' : ''}
                    </Badge>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatNumber(zone.tauxConversion || 0, 1)} %
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${zone.widthPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatNumber(zone.totalContratsSignes || 0)} contrat
                  {(zone.totalContratsSignes || 0) > 1 ? 's' : ''} ·{' '}
                  {formatNumber(zone.totalRendezVousPris || 0)} RDV ·{' '}
                  {formatNumber(zone.totalPortesProspectes || 0)} porte
                  {(zone.totalPortesProspectes || 0) > 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
