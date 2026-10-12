import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusLabel } from '@/constants/domain/porte-status'
import { getDurationTierKey, DURATION_FILTERS } from '@/constants/domain/recording-duration'
import { formatDuration } from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'
import BuildingTypeBadge from '@/components/BuildingTypeBadge'
import PorteDetailModal from './PorteDetailModal'

// Couleurs de statut théma-aware, exprimées uniquement via le point + le label
// (jamais via la bordure de la carte). Teintes qui tiennent en clair ET sombre.
const STATUS_TONE = {
  contrat_signe: {
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1]',
  },
  rendez_vous_pris: {
    text: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
    soft: 'bg-blue-500/[0.06] hover:bg-blue-500/[0.1]',
  },
  argumente: {
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    soft: 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]',
  },
  refus: {
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    soft: 'bg-red-500/[0.06] hover:bg-red-500/[0.1]',
  },
  absent: {
    text: 'text-slate-500 dark:text-slate-400',
    dot: 'bg-slate-400',
    soft: 'bg-slate-500/[0.05] hover:bg-slate-500/[0.09]',
  },
  necessite_repassage: {
    text: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
    soft: 'bg-violet-500/[0.06] hover:bg-violet-500/[0.1]',
  },
  non_visite: {
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/50',
    soft: 'bg-card hover:bg-muted/40',
  },
}

const toneOf = status => STATUS_TONE[status] || STATUS_TONE.non_visite

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'contrat_signe', label: 'Signés' },
  { value: 'rendez_vous_pris', label: 'RDV' },
  { value: 'argumente', label: 'Argumentés' },
  { value: 'refus', label: 'Refus' },
  { value: 'absent', label: 'Absents' },
  { value: 'necessite_repassage', label: 'Repassages' },
  { value: 'non_visite', label: 'Non visités' },
]

const BAR_COUNT = { none: 0, short: 1, brief: 2, medium: 3, long: 4 }

function AudioSignal({ durationSec, hasAudio }) {
  if (!hasAudio) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Mic className="h-3 w-3" /> —
      </span>
    )
  }
  const filled = BAR_COUNT[getDurationTierKey(durationSec)] ?? 0
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-primary">
      <span className="inline-flex h-3 items-end gap-[2px]">
        {[0, 1, 2, 3].map(i => (
          <span
            key={i}
            className="eq-bar w-[3px] rounded-sm bg-primary"
            style={{
              height: `${5 + i * 2.5}px`,
              opacity: i < filled ? 0.95 : 0.25,
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
      </span>
      {formatDuration(durationSec) ?? '0:00'}
    </span>
  )
}

function DoorTile({ door, selected, onSelect }) {
  const tone = toneOf(door.status)
  const durationLabel = formatDuration(door.audioDurationSec)
  const isLong = getDurationTierKey(door.audioDurationSec) === 'long'

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Porte ${door.number}${durationLabel ? ` — audio ${durationLabel}` : ''}`}
      className={cn(
        'group rounded-lg border border-border/70 p-2.5 text-left transition-all duration-200 ease-out',
        tone.soft,
        'hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-primary/45',
        isLong && !selected && 'ring-1 ring-primary/25',
        door.coachingFavori && 'favori-glow'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Porte {door.number}</span>
        <span
          className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', tone.text)}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
          {getStatusLabel((door.status || '').toUpperCase())}
        </span>
      </div>
      <div className="mt-2">
        <AudioSignal durationSec={door.audioDurationSec} hasAudio={door.hasAudio} />
      </div>
    </button>
  )
}

/**
 * Représentation "façade" d'un bâtiment : étages empilés (haut → bas), portes =
 * tuiles épurées (une couleur de statut par tuile + signal audio). Clic sur une
 * porte → modale de détail centrée.
 */
export default function BuildingFacade({ floors = [], address = '', planSubtitle = '', type }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [durationFilter, setDurationFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const shownFloors = useMemo(() => {
    return floors.map(fl => ({
      ...fl,
      shownDoors: fl.doors.filter(d => {
        const sOk = statusFilter === 'all' || d.status === statusFilter
        const dOk =
          durationFilter === 'all' || getDurationTierKey(d.audioDurationSec) === durationFilter
        return sOk && dOk
      }),
    }))
  }, [floors, statusFilter, durationFilter])

  const allDoors = useMemo(() => floors.flatMap(fl => fl.doors), [floors])

  const statusCounts = useMemo(() => {
    const m = new Map()
    for (const d of allDoors) m.set(d.status, (m.get(d.status) || 0) + 1)
    return m
  }, [allDoors])

  const durationCounts = useMemo(() => {
    const m = new Map()
    for (const d of allDoors) {
      const k = getDurationTierKey(d.audioDurationSec)
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [allDoors])

  const selectedDoor = useMemo(
    () => allDoors.find(d => d.porteId === selectedId) || null,
    [allDoors, selectedId]
  )

  const audioCount = useMemo(() => allDoors.filter(d => d.hasAudio).length, [allDoors])

  // Filtres intelligents : options présentes uniquement, rangée masquée si rien
  // à filtrer (ex. maison 1 porte).
  const statusFilterList = useMemo(
    () => STATUS_FILTERS.filter(f => f.value === 'all' || (statusCounts.get(f.value) || 0) > 0),
    [statusCounts]
  )
  const durationFilterList = useMemo(
    () => DURATION_FILTERS.filter(f => f.value === 'all' || (durationCounts.get(f.value) || 0) > 0),
    [durationCounts]
  )
  const showStatusFilters = statusFilterList.length > 2
  const showDurationFilters = audioCount > 0 && durationFilterList.length > 2

  const renderPills = (list, current, onPick, countsMap, leadIcon) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        {leadIcon}
      </span>
      {list.map(f => {
        const active = current === f.value
        const count = f.value === 'all' ? allDoors.length : countsMap.get(f.value) || 0
        return (
          <Button
            key={f.value}
            variant="ghost"
            size="sm"
            onClick={() => onPick(f.value)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium whitespace-nowrap',
              active
                ? 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/40'
            )}
          >
            <span>{f.label}</span>
            <span className="ml-2 text-[10px] tabular-nums opacity-55">{count}</span>
          </Button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {type && <BuildingTypeBadge type={type} />}
        {planSubtitle && <span className="text-xs text-muted-foreground">{planSubtitle}</span>}
      </div>

      {showStatusFilters &&
        renderPills(statusFilterList, statusFilter, setStatusFilter, statusCounts, 'Statut')}
      {showDurationFilters &&
        renderPills(
          durationFilterList,
          durationFilter,
          setDurationFilter,
          durationCounts,
          <>
            <Mic className="h-3.5 w-3.5" /> Durée
          </>
        )}

      {/* Bâtiment : un seul cadre, séparateurs fins entre étages */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {shownFloors.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Aucune donnée de structure pour ce bâtiment.
          </p>
        ) : (
          shownFloors.map(fl => (
            <div
              key={fl.floor}
              className="grid grid-cols-[56px_1fr] border-t border-border/60 first:border-t-0"
            >
              <div className="flex flex-col items-center justify-center gap-0.5 border-r border-border/60 px-2 py-3 text-center">
                <span className="text-[12px] font-bold">{fl.label}</span>
                <span className="text-[10px] text-muted-foreground">{fl.totalDoors} p.</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2.5 p-3.5">
                {fl.shownDoors.length === 0 ? (
                  <span className="py-2 text-xs text-muted-foreground">—</span>
                ) : (
                  fl.shownDoors.map(d => (
                    <DoorTile
                      key={d.porteId}
                      door={d}
                      selected={selectedId === d.porteId}
                      onSelect={() => setSelectedId(d.porteId)}
                    />
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', toneOf('contrat_signe').dot)} />
          Contrat
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', toneOf('rendez_vous_pris').dot)} />
          RDV
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', toneOf('refus').dot)} />
          Refus
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', toneOf('absent').dot)} />
          Absent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5" /> barres = durée d'audio
        </span>
        {audioCount > 0 && <span className="ml-auto">{audioCount} audio(s)</span>}
      </div>

      <PorteDetailModal
        door={selectedDoor}
        open={!!selectedDoor}
        onOpenChange={o => {
          if (!o) setSelectedId(null)
        }}
        address={address}
      />
    </div>
  )
}
