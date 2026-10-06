import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SalesPlanSteps from './SalesPlanSteps'
import ReferenceProductCard from './ReferenceProductCard'

/** Un référentiel complet en lecture : son plan, son catalogue, le markdown du plan. */
export default function ReferenceContent({ reference }) {
  const [view, setView] = useState('plan')
  return (
    <Tabs value={view} onValueChange={setView}>
      <TabsList>
        <TabsTrigger value="plan">Plan de vente</TabsTrigger>
        <TabsTrigger value="produits">Produits · {reference.products.length}</TabsTrigger>
        <TabsTrigger value="markdown">Markdown du plan</TabsTrigger>
      </TabsList>
      <TabsContent value="plan" className="pt-3">
        {reference.plan ? (
          <SalesPlanSteps steps={reference.plan.steps} />
        ) : (
          <p className="text-sm text-muted-foreground">Aucun plan de vente.</p>
        )}
      </TabsContent>
      <TabsContent value="produits" className="space-y-2.5 pt-3">
        {reference.products.map(product => (
          <ReferenceProductCard key={product.key} product={product} />
        ))}
      </TabsContent>
      <TabsContent value="markdown" className="pt-3">
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {reference.plan?.rawMarkdown ?? ''}
        </pre>
      </TabsContent>
    </Tabs>
  )
}
