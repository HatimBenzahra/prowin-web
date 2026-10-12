import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin } from 'lucide-react'

export default function AssignedZonesCard({ zones, selectedZoneId, selectZone }) {
  return (
    <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
      <CardHeader className="px-3 pt-3 pb-2">
        <CardTitle className="truncate text-sm font-semibold">Zones assignées</CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto px-3 pt-0 pb-3">
        {zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <MapPin className="h-5 w-5 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">Aucune zone assignée</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {zones.map(zone => {
              const isSelected = zone.id === selectedZoneId
              return (
                <button
                  type="button"
                  key={zone.id}
                  disabled={!zone.canFocus}
                  onClick={() => selectZone(zone)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border/50 bg-background/80'
                  } ${
                    zone.canFocus ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default opacity-60'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: zone.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-tight">{zone.zoneName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {zone.userName}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
