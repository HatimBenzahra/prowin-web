import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'

// La hauteur est imposée par la colonne (cf. TerrainToday) : la card s'y partage
// l'espace avec « Zones assignées », d'où le flex-1 plutôt qu'une hauteur fixe.
const CARD_SHELL = 'min-h-0 flex-1 gap-0 py-0 overflow-hidden'

function lastSeenLabel(isoDate) {
  if (!isoDate) return null
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return null
  return `Vu à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ActiveCommercialsCard({ commercials, selectedKey, selectActor, colorFor }) {
  return (
    <Card className={CARD_SHELL}>
      <CardHeader className="px-3 pt-3 pb-2">
        <CardTitle className="truncate text-sm font-semibold">Sur le terrain</CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto px-3 pt-0 pb-3">
        {commercials.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Users className="h-5 w-5 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">
              Personne sur le terrain aujourd&apos;hui
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {commercials.map(c => {
              const isSelected = c.key === selectedKey
              const lastSeen = c.online ? null : lastSeenLabel(c.lastSeen)
              return (
                <button
                  type="button"
                  key={c.key}
                  disabled={!c.hasPosition}
                  onClick={() => selectActor(c)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border/50 bg-background/80'
                  } ${
                    c.hasPosition ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default opacity-60'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                    }`}
                  />
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      c.online ? '' : 'opacity-50'
                    }`}
                    style={{ backgroundColor: colorFor(c.userId) }}
                  >
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-tight">{c.name}</p>
                    {lastSeen && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {lastSeen}
                      </p>
                    )}
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
