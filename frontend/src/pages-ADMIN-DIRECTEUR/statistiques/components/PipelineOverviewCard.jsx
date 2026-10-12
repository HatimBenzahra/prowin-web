import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatTile } from '@/components/details/DetailPrimitives'
import { Info } from 'lucide-react'
import { formatNumber } from '../stats-format'

/**
 * Vue d'ensemble du stock : où en sont les portes du portefeuille, maintenant.
 *
 * C'est la lecture que le flow de prospection réclame et que la page n'avait pas.
 * Compter des évènements sur une période dit ce qui s'est passé ; un stock dit ce
 * qu'il reste à faire — et sur un travail en boucle (passer → revenir → conclure),
 * c'est la seconde question qui pilote.
 *
 * Les quatre tuiles somment le portefeuille : jamais touchées + en attente + conclues.
 * « En attente » regroupe les deux statuts rejouables (absent, RDV pris) : ce sont
 * des portes ouvertes, pas des issues.
 *
 * Interrogé sur `Porte`, donc ce bloc ne souffre pas de la limite de l'historique
 * (qui ne consigne que les changements de statut).
 */
export default function PipelineOverviewCard({ pipeline }) {
  const nonVisitees = pipeline?.nonVisitees || 0
  const repassages = pipeline?.repassages?.total || 0
  const rdv = pipeline?.rdv?.total || 0
  const conclues = pipeline?.conclusions?.total || 0

  const enAttente = repassages + rdv
  const totalPortes = nonVisitees + enAttente + conclues
  const partConclue = totalPortes > 0 ? (conclues / totalPortes) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">État du portefeuille</CardTitle>
        <p className="text-sm text-muted-foreground">
          Situation actuelle des portes créées — indépendant du filtre de période
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalPortes === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune porte créée sur ce périmètre
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                iconName="door"
                label="Portes créées"
                value={formatNumber(totalPortes)}
                hint="Total du portefeuille"
              />
              <StatTile
                iconName="radar-dish"
                label="Jamais touchées"
                value={formatNumber(nonVisitees)}
                hint="Statut « non visité »"
              />
              <StatTile
                iconName="stopwatch"
                label="En attente"
                value={formatNumber(enAttente)}
                hint={`${formatNumber(repassages)} à repasser · ${formatNumber(rdv)} en RDV`}
              />
              <StatTile
                iconName="contract-doc"
                label="Conclues"
                value={formatNumber(conclues)}
                hint={`${formatNumber(partConclue, 1)} % du portefeuille`}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Ventilation des portes conclues :{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatNumber(pipeline?.conclusions?.contratsSignes || 0)}
                </span>{' '}
                contrat{(pipeline?.conclusions?.contratsSignes || 0) > 1 ? 's' : ''} signé
                {(pipeline?.conclusions?.contratsSignes || 0) > 1 ? 's' : ''} ·{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatNumber(pipeline?.conclusions?.argumentes || 0)}
                </span>{' '}
                argumenté{(pipeline?.conclusions?.argumentes || 0) > 1 ? 's' : ''} sans suite ·{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatNumber(pipeline?.conclusions?.refus || 0)}
                </span>{' '}
                refus. Une porte conclue ne se réouvre pas dans le flow terrain.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
