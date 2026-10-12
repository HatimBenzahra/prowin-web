import { Loader2 } from 'lucide-react'
import { useActiveReference } from './useActiveReference'
import ReferenceHeader from './ReferenceHeader'
import ReferenceProductCard from './ReferenceProductCard'

/**
 * Onglet Produits : le catalogue du référentiel actif. La fiche d'un produit est ce
 * que l'analyse oppose au discours du commercial — avec le plan de vente — pour juger
 * la conformité de ce qu'il a dit ; sans fiche, elle n'est pas jugée.
 */
export default function ProductSheetsViewer() {
  const { reference, loading, reload } = useActiveReference()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des produits…
      </div>
    )
  }

  const products = reference?.products ?? []
  return (
    <div>
      <ReferenceHeader reference={reference} onChanged={reload} />
      {products.length ? (
        <div className="space-y-2.5">
          {products.map(product => (
            <ReferenceProductCard key={product.key} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun produit dans le référentiel actif.</p>
      )}
    </div>
  )
}
