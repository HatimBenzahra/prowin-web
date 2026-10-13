import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/details/DetailPrimitives'
import { NON_SALE_REASON_LABELS } from '@/pages-ADMIN-DIRECTEUR/coaching/coaching-calibration'
import { formatNumber, formatPercent } from '../stats-format'

/**
 * Ce que les visites analysées disent des produits : taux de proposition (présenté,
 * refusé ou accepté sur les visites), taux de transformation (accepté sur proposé),
 * opportunités oubliées, produits vendus par visite et par intervenant, causes de perte.
 *
 * Tout vient des statuts produit du moteur (corrigés le cas échéant par le manager) ;
 * les analyses antérieures au recalibrage n'en portent pas et ne comptent pas.
 */
export default function CoachingProductsCard({ stats, loading }) {
  const title = 'Produits proposés et vendus'

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map(row => (
            <Skeleton key={row} className="h-9 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const products = stats?.products || []
  const subjects = stats?.parIntervenant || []
  const causes = stats?.causesPerte || []
  const totalCauses = causes.reduce((sum, c) => sum + c.count, 0)
  const rate = value => (value == null ? '—' : formatPercent(value))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Visites analysées depuis le recalibrage : statuts produit pré-remplis par l’IA,
          corrigeables dans la fiche d’analyse
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Visites analysées"
            value={formatNumber(stats?.nbVisites || 0)}
            hint="Avec statuts produit"
          />
          <StatTile
            label="Produits vendus / visite"
            value={
              stats?.produitsParVisite == null ? '—' : formatNumber(stats.produitsParVisite, 2)
            }
            hint="Produits acceptés"
          />
          <StatTile
            label="Opportunités oubliées"
            value={formatNumber(products.reduce((sum, p) => sum + p.nbOublies, 0))}
            hint="Produits pertinents non présentés"
          />
        </div>

        {!stats?.nbVisites ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Aucune visite analysée avec statuts produit sur cette période
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Produit</th>
                  <th className="py-2 pr-3 text-right font-medium">Proposition</th>
                  <th className="py-2 pr-3 text-right font-medium">Transformation</th>
                  <th className="py-2 text-right font-medium">Oublis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-border/60">
                {products.map(p => (
                  <tr key={p.key}>
                    <td className="py-2 pr-3">{p.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rate(p.tauxProposition)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({p.nbProposes}/{p.nbVisites})
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rate(p.tauxTransformation)}
                      <span className="ml-1 text-xs text-muted-foreground">({p.nbAcceptes})</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(p.nbOublies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-medium">Produits vendus par intervenant</h4>
                <ul className="space-y-1.5 text-sm">
                  {subjects.map(s => (
                    <li
                      key={`${s.subjectRole}-${s.subjectId}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate">{s.subjectName}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold">
                          {s.produitsParVisite == null ? '—' : formatNumber(s.produitsParVisite, 2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          / visite · {s.nbProduitsVendus} sur {s.nbVisites} visite
                          {s.nbVisites > 1 ? 's' : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium">Causes de perte</h4>
                {causes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun motif de non-vente relevé</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {causes.map(c => (
                      <li key={c.reason}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span>{NON_SALE_REASON_LABELS[c.reason] || c.reason}</span>
                          <span className="tabular-nums text-muted-foreground">{c.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted/60">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(c.count / totalCauses) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
