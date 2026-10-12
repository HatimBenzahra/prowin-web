import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatTile } from '@/components/details/DetailPrimitives'
import { Info } from 'lucide-react'
import { formatDuration, formatNumber } from '../stats-format'

/**
 * Ce que l'activité coûte en temps d'échange à la porte.
 *
 * **Ce n'est pas un temps de terrain**, et le libellé le dit. Côté mobile, le chrono
 * d'un passage ne démarre qu'une fois l'enregistrement audio actif
 * (`use-prospection-session.ts` : la phase ne passe `STARTING → ACTIVE` que quand
 * `recording.isRecording` devient vrai). `StatusHistorique.duree` mesure donc la
 * durée de conversation micro ouvert — ni les déplacements, ni les cages
 * d'escalier, ni les portes ouvertes sans échange. Pour un temps de présence
 * terrain, il faudrait passer par `GpsPosition`.
 *
 * Deuxième limite, annoncée dans la carte : le backend n'écrit une ligne
 * d'historique que lorsque le statut **change** (`porte.service.ts`). Un repassage
 * qui laisse la porte en `ABSENT` ne produit aucune ligne, donc **sa durée est
 * perdue**. Les totaux ci-dessous sous-estiment l'activité, d'autant plus que le
 * commercial repasse.
 *
 * La couverture de la mesure est affichée avant les moyennes, et non après : un
 * temps moyen calculé sur 8 % des passages ne se lit pas comme un temps moyen
 * calculé sur 90 %. Sans cette part, les chiffres seraient trompeurs sans être faux.
 */
export default function EffortCard({ effort }) {
  const mesures = effort?.nbPassagesMesures || 0
  const sansDuree = effort?.nbPassagesSansDuree || 0
  const totalPassages = mesures + sansDuree
  const couverture = totalPassages > 0 ? (mesures / totalPassages) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Temps d’échange à la porte</CardTitle>
        <p className="text-sm text-muted-foreground">
          Durée micro ouvert relevée par le mobile — hors déplacements
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalPassages === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucun passage enregistré sur cette période
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Mesure disponible sur{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatNumber(couverture, 1)} %
                </span>{' '}
                des passages ({formatNumber(mesures)} sur {formatNumber(totalPassages)}).
                {couverture < 50 &&
                  ' En dessous de la moitié, les moyennes ci-dessous restent indicatives.'}{' '}
                Les repassages qui laissent la porte au même statut ne sont pas enregistrés : ces
                totaux sous-estiment l’activité réelle.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatTile
                iconName="stopwatch"
                label="Temps d’échange cumulé"
                value={formatDuration(effort?.dureeTotaleSec)}
                hint={`Sur ${formatNumber(mesures)} passage${mesures > 1 ? 's' : ''} mesuré${mesures > 1 ? 's' : ''}`}
              />
              <StatTile
                iconName="door"
                label="Échange médian par porte"
                value={formatDuration(effort?.dureeMedianeParPassageSec)}
                hint={`Moyenne ${formatDuration(effort?.dureeMoyenneParPassageSec)}`}
              />
              <StatTile
                iconName="sprint"
                label="Portes par heure d’échange"
                value={effort?.passagesParHeure ? formatNumber(effort.passagesParHeure, 1) : '—'}
                hint="Hors déplacements — pas une cadence terrain"
              />
              <StatTile
                iconName="contract-doc"
                label="Échange par contrat signé"
                value={formatDuration(effort?.dureeParContratSignesSec)}
                hint="Temps de parole investi par signature"
              />
              <StatTile
                iconName="calendar"
                label="Échange par rendez-vous"
                value={formatDuration(effort?.dureeParRdvSec)}
                hint="Temps de parole investi par RDV pris"
              />
              <StatTile
                iconName="brick-wall"
                label="Passages sans durée"
                value={formatNumber(sansDuree)}
                hint="Exclus des moyennes"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
