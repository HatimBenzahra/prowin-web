import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatTile } from '@/components/details/DetailPrimitives'
import { getStatusChartColor, StatutPorte } from '@/constants/domain/porte-status'
import { formatNumber } from '../stats-format'

/**
 * Le stock de portes à repasser, et l'efficacité du repassage.
 *
 * Le repassage est le cœur de la méthode terrain : une porte `ABSENT` n'est pas une
 * issue, c'est un travail en attente. Le mobile le matérialise par une file dans
 * l'onglet Agenda ; côté pilotage, ce qui compte c'est la **taille** de cette file et
 * son **ancienneté** — une porte absente depuis 40 jours ne sera jamais reprise.
 *
 * Forme : barres d'ancienneté en une seule teinte (la magnitude est le sujet, pas
 * l'identité des tranches), échelle relative à la tranche la plus peuplée pour rester
 * lisible quand la distribution est très déséquilibrée.
 *
 * Le taux de reprise se lit sur les portes **déjà passées par `ABSENT`** dans
 * l'historique. Il répond à « le repassage paye-t-il ? ». Il ne dit pas combien de
 * passages sont nécessaires : l'historique ne consigne pas les passages qui laissent
 * la porte au même statut.
 */
export default function PipelineRepassageCard({ repassages, reprise }) {
  const total = repassages?.total || 0
  const buckets = repassages?.buckets || []
  const maxCount = Math.max(...buckets.map(bucket => bucket.count), 1)
  const accent = getStatusChartColor(StatutPorte.ABSENT)

  const passees = reprise?.portesPasseesParAbsent || 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Repassages en attente</CardTitle>
        <p className="text-sm text-muted-foreground">
          Portes actuellement absentes, par ancienneté du dernier passage
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            iconName="door"
            label="À repasser"
            value={formatNumber(total)}
            hint={
              repassages?.plusAncienJours != null
                ? `Le plus ancien depuis ${formatNumber(repassages.plusAncienJours)} j`
                : 'Aucun historique de visite'
            }
          />
          <StatTile
            iconName="cycle"
            label="Taux de reprise"
            value={passees > 0 ? `${formatNumber(reprise.tauxReprise, 1)} %` : '—'}
            hint={
              passees > 0
                ? `${formatNumber(reprise.portesConclues)} conclues sur ${formatNumber(passees)} passées par « absent »`
                : 'Aucune porte encore passée par « absent »'
            }
          />
          <StatTile
            iconName="brick-wall"
            label="Encore absentes"
            value={formatNumber(reprise?.portesEncoreAbsentes || 0)}
            hint="Passées par « absent » et toujours non conclues"
          />
        </div>

        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune porte en attente de repassage
          </p>
        ) : (
          <div className="space-y-3">
            {buckets.map(bucket => (
              <div key={bucket.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{bucket.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatNumber(bucket.count)} porte{bucket.count > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(bucket.count / maxCount) * 100}%`,
                      backgroundColor: accent,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Longueurs relatives à la tranche la plus peuplée, pas au total.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
