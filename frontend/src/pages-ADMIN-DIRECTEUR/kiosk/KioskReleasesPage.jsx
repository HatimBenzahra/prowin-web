import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useKioskReleases } from '@/hooks/metier/api/kiosk'
import ReleasesTab from './components/ReleasesTab'
import KioskErrorState from './components/KioskErrorState'

export default function KioskReleasesPage() {
  const releasesQuery = useKioskReleases()

  if (releasesQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-muted-foreground">Chargement des releases...</p>
          </div>
        </div>
      </div>
    )
  }

  if (releasesQuery.error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Releases</h1>
          <p className="text-muted-foreground mt-1">
            Versions de ProWin et du kiosk distribuées aux tablettes
          </p>
        </div>
        <KioskErrorState error={releasesQuery.error} onRetry={() => releasesQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Releases</h1>
        <p className="text-muted-foreground mt-1">
          Versions de ProWin et du kiosk distribuées aux tablettes
        </p>
      </div>

      <ReleasesTab releases={releasesQuery.data || []} loading={releasesQuery.isLoading} />
    </div>
  )
}
