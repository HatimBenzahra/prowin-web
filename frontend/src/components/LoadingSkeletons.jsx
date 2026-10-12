import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/**
 * Skeleton pour le tableau de données
 */
export function TableSkeleton({ rows = 10 }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et filtres */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Tableau */}
        <div className="rounded-md border">
          {/* En-tête du tableau */}
          <div className="border-b p-4">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>

          {/* Lignes du tableau */}
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="border-b p-4 last:border-0">
              <div className="flex gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton pour les cartes de statistiques
 */
export function StatsCardSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-40 mb-3" />
        <div className="pt-3 border-t">
          <Skeleton className="h-3 w-28" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton pour la page de détails
 */
export function DetailsPageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 pb-6 border-b">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-5 w-96" />
        </div>
      </div>

      {/* Informations personnelles */}
      <div>
        <div className="mb-6">
          <Skeleton className="h-7 w-56 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="h-px bg-border mb-6" />
        <Card className="border-2">
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 mt-1" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistiques */}
      <div>
        <div className="mb-6">
          <Skeleton className="h-7 w-40 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="h-px bg-border mb-6" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <StatsCardSkeleton key={index} />
          ))}
        </div>
      </div>

      {/* Sections additionnelles */}
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <div key={sectionIndex}>
          <div className="mb-6">
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="h-px bg-border mb-6" />
          <Card className="border-2">
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, itemIndex) => (
                  <div key={itemIndex} className="flex items-center justify-between py-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton pour les listes simples
 */
export function ListSkeleton({ items = 5 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, index) => (
        <Card key={index}>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * Skeleton pour le dashboard
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Stats cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts area */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Skeleton pour une page simple
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Skeleton pour la carte interactive
 */
export function MapSkeleton() {
  return (
    <div className="relative w-full h-full bg-muted rounded-lg overflow-hidden">
      <Skeleton className="w-full h-full" />

      <div className="absolute top-4 right-4 space-y-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>

      <div className="absolute top-4 left-4 right-16">
        <Skeleton className="h-10 w-full max-w-md rounded-md" />
      </div>

      <div className="absolute bottom-2 right-2">
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-background/80 backdrop-blur-sm p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            <span className="text-sm text-muted-foreground">Chargement de la carte...</span>
          </div>
        </div>
      </div>
    </div>
  )
}
