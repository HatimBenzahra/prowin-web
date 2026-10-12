import ProductSheetContent from './ProductSheetContent'

/** Les offres WinLead+ d'un produit, telles qu'elles fixent ses prix. */
function offresLabel(product) {
  if (product.offres?.length) return product.offres.map(o => o.nom).join(', ')
  if (product.offreFournisseur) return `Toutes les offres ${product.offreFournisseur}`
  if (product.offreExternalIds?.length)
    return `Offres ${product.offreExternalIds.join(', ')} (hors catalogue local)`
  return 'Aucune offre liée : tarifs non vérifiés'
}

/** Un produit du catalogue en lecture : identité, offres liées, fiche ou son absence. */
export default function ReferenceProductCard({ product, actions }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5">
        <span className="font-medium">{product.label}</span>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
          {product.key}
        </span>
      </div>
      <p className="border-b border-dashed border-border/60 px-4 py-2 text-xs text-muted-foreground">
        {offresLabel(product)}
      </p>
      {product.sheet ? (
        <ProductSheetContent sheet={product.sheet} />
      ) : (
        <p className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Sans fiche : la conformité de ce produit n'est pas jugée.
        </p>
      )}
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-2">
          {actions}
        </div>
      )}
    </div>
  )
}
