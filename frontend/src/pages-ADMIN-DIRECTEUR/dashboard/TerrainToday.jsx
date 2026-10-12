import React, { useCallback, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTerrainToday } from './useTerrainToday'
import { useAssignedZones } from './useAssignedZones'
import TerrainMapCard from './TerrainMapCard'
import ActiveCommercialsCard from './ActiveCommercialsCard'
import AssignedZonesCard from './AssignedZonesCard'

const GRID = 'grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6'
const SIDE_COLUMN = 'flex flex-col gap-6 lg:h-[440px]'

/**
 * Terrain du jour : la carte (dominante) et, dans la colonne de droite, les
 * commerciaux actifs puis les zones assignées. Trois cards pour une seule carte,
 * d'où les hooks portés ici et le focus arbitré à un seul endroit.
 */
export default function TerrainToday() {
  const {
    commercials,
    located,
    selectedKey,
    selectedActor,
    selectActor,
    clearActor,
    route,
    colorFor,
    isLoading,
  } = useTerrainToday()
  const { zones, loading: zonesLoading } = useAssignedZones()
  const [selectedZoneId, setSelectedZoneId] = useState(null)

  // Un seul sujet cadré à la fois — mais les deux couches restent dessinées, donc
  // sélectionner ne fait jamais disparaître le contexte.
  const handleSelectActor = useCallback(
    actor => {
      setSelectedZoneId(null)
      selectActor(actor)
    },
    [selectActor]
  )

  const handleSelectZone = useCallback(
    zone => {
      if (!zone?.canFocus) return
      clearActor()
      setSelectedZoneId(current => (current === zone.id ? null : zone.id))
    },
    [clearActor]
  )

  const focusedZone = useMemo(
    () => zones.find(z => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId]
  )

  // La zone du commercial sélectionné, pour le cadrer avec son terrain.
  const zoneOfSelectedActor = useMemo(() => {
    if (!selectedActor) return null
    return zones.find(z => `${z.userType}-${z.userId}` === selectedActor.key) ?? null
  }, [zones, selectedActor])

  /**
   * Les acteurs localisés affectés à la MÊME zone que la ligne focalisée — par
   * `zoneId` et non par assignation : une zone peut porter plusieurs assignations
   * (deux commerciaux sur « Montreuil »), et focaliser l'une doit cadrer la zone
   * avec l'ensemble de ses commerciaux.
   */
  const actorsOfFocusedZone = useMemo(() => {
    if (!focusedZone) return []
    const keys = new Set(
      zones.filter(z => z.zoneId === focusedZone.zoneId).map(z => `${z.userType}-${z.userId}`)
    )
    return located.filter(actor => keys.has(actor.key))
  }, [focusedZone, zones, located])

  if (isLoading) {
    return (
      <div className={GRID}>
        <Card className="gap-0 overflow-hidden p-0">
          <Skeleton className="h-[320px] w-full rounded-none lg:h-[440px]" />
        </Card>
        <div className={SIDE_COLUMN}>
          {[0, 1].map(card => (
            <Card key={card} className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
              <div className="space-y-1.5 px-3 py-3">
                <Skeleton className="mb-2 h-5 w-28" />
                {[0, 1].map(row => (
                  <Skeleton key={row} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={GRID}>
      <TerrainMapCard
        located={located}
        selectedKey={selectedKey}
        selectedActor={selectedActor}
        selectActor={handleSelectActor}
        route={route}
        colorFor={colorFor}
        zones={zonesLoading ? [] : zones}
        focusedZone={focusedZone}
        zoneOfSelectedActor={zoneOfSelectedActor}
        actorsOfFocusedZone={actorsOfFocusedZone}
      />
      <div className={SIDE_COLUMN}>
        <ActiveCommercialsCard
          commercials={commercials}
          selectedKey={selectedKey}
          selectActor={handleSelectActor}
          colorFor={colorFor}
        />
        <AssignedZonesCard
          zones={zonesLoading ? [] : zones}
          selectedZoneId={selectedZoneId}
          selectZone={handleSelectZone}
        />
      </div>
    </div>
  )
}
