import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatTile } from '@/components/details/DetailPrimitives'
import { AlertTriangle } from 'lucide-react'
import { formatNumber } from '../stats-format'

/**
 * Le pipeline des rendez-vous, et surtout ce qui y pourrit.
 *
 * `enRetard` = porte dont la date de RDV est passée et qui est **toujours** en
 * `RENDEZ_VOUS_PRIS`. C'est le signal le plus actionnable du flow de prospection, et
 * il n'était visible nulle part : l'agenda mobile n'affiche que les RDV du jour, et
 * le web n'avait aucune vue RDV. Un rendez-vous non conclu ni requalifié est un
 * contrat qu'on a laissé filer.
 *
 * Lu sur `Porte`, donc insensible au fait que l'historique ne consigne que les
 * changements de statut.
 */
export default function PipelineRdvCard({ rdv }) {
  const total = rdv?.total || 0
  const enRetard = rdv?.enRetard || 0
  const partEnRetard = total > 0 ? (enRetard / total) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline des rendez-vous</CardTitle>
        <p className="text-sm text-muted-foreground">
          Portes actuellement en « RDV pris », quelle que soit la période
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucun rendez-vous en cours
          </p>
        ) : (
          <>
            {enRetard > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-semibold tabular-nums">
                    {formatNumber(enRetard)} rendez-vous
                  </span>{' '}
                  {enRetard > 1 ? 'ont' : 'a'} une date passée et {enRetard > 1 ? 'sont' : 'est'}{' '}
                  toujours au statut « RDV pris » — {formatNumber(partEnRetard, 1)} % du pipeline
                  {rdv?.plusEnRetardJours != null &&
                    `, le plus ancien depuis ${formatNumber(rdv.plusEnRetardJours)} jour${
                      rdv.plusEnRetardJours > 1 ? 's' : ''
                    }`}
                  . Ni conclus, ni requalifiés.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                iconName="calendar"
                label="En retard"
                value={formatNumber(enRetard)}
                hint="Date passée, statut inchangé"
                valueClassName={enRetard > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
              />
              <StatTile
                iconName="stopwatch"
                label="Aujourd’hui"
                value={formatNumber(rdv?.aujourdhui || 0)}
                hint="À honorer dans la journée"
              />
              <StatTile
                iconName="stairs-goal"
                label="À venir"
                value={formatNumber(rdv?.aVenir || 0)}
                hint="Date future"
              />
              <StatTile
                iconName="radar-dish"
                label="Sans date"
                value={formatNumber(rdv?.sansDate || 0)}
                hint="RDV posé sans échéance"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
