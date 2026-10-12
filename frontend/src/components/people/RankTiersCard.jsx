import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TIER_ORDER, tierStyle } from '@/constants/domain/rank-tiers'

/**
 * Carte des paliers de rang, affichée en permanence à côté du classement.
 *
 * Construite sur `constants/domain/rank-tiers`, qui se déclare source unique côté web
 * et dont les seuils sont alignés sur `RankingService.pointTiers` du backend — huit
 * paliers, de Bronze à Legend.
 *
 * Ne PAS revenir à `utils/business/ranks.js` : ce module est un vestige à cinq paliers
 * (0/100/250/500/1000) qui ne correspond plus au backend.
 */
export default function RankTiersCard() {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle className="text-sm font-semibold">Paliers de rang</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Points du mois en cours, calculés par le backend.
        </p>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        <ul className="space-y-1.5">
          {TIER_ORDER.map((tier, index) => {
            const next = TIER_ORDER[index + 1]
            const range = next ? `${tier.min} – ${next.min - 1}` : `${tier.min}+`
            return (
              <li key={tier.key} className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierStyle(tier.key).badgeClasses}`}
                >
                  {tier.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{range} pts</span>
              </li>
            )
          })}
        </ul>

        <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Les points sont la somme des points d&apos;offre des{' '}
          <span className="font-medium text-foreground">contrats validés</span> de la période. Le
          score de chaque offre est configurable dans Gamification.
        </p>
      </CardContent>
    </Card>
  )
}
