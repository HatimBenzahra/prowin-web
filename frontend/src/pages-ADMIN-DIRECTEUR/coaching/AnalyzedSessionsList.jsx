import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PorteStatutPill, parseRecordingKey, formatDateTime } from './CoachingComponents'

const SORTS = [
  { value: 'date', label: 'Date (récent)' },
  { value: 'immeuble', label: 'Immeuble' },
  { value: 'score', label: 'Score' },
  { value: 'statut', label: 'Statut' },
]

/**
 * Liste présentationnelle de sessions analysées (READY) → clic ouvre le détail.
 * Réutilisée par AnalyzedRecordingsModal (toutes) et CoachingSessionsModal
 * (scopée à un sujet). `sortable` ajoute un tri client (date/immeuble/score/statut).
 */
export default function AnalyzedSessionsList({ items, onSelect, sortable = false }) {
  const [sortBy, setSortBy] = useState('date')
  const list = items || []

  const sorted = useMemo(() => {
    const decorated = list.map(a => {
      const meta = parseRecordingKey(a.s3KeyOriginal)
      return {
        a,
        address: meta.address || '',
        ts: meta.date
          ? new Date(meta.date).getTime()
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0,
      }
    })
    const cmp = {
      date: (x, y) => y.ts - x.ts,
      immeuble: (x, y) => x.address.localeCompare(y.address),
      score: (x, y) => (y.a.score ?? -1) - (x.a.score ?? -1),
      statut: (x, y) => (x.a.statutPorte || '').localeCompare(y.a.statutPorte || ''),
    }
    return decorated.sort(cmp[sortBy] || cmp.date).map(d => d.a)
  }, [list, sortBy])

  if (!list.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Aucune session analysée.</p>
    )
  }

  return (
    <div className="space-y-3">
      {sortable && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">Trier par</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map(a => {
          const meta = parseRecordingKey(a.s3KeyOriginal)
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect?.(a)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40',
                  a.favori && 'favori-glow'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {a.subjectName || meta.address || `audio_${a.id}`}
                    {a.subjectName && meta.address && (
                      <span className="ml-2 font-normal text-muted-foreground">{meta.address}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <PorteStatutPill statut={a.statutPorte} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(meta.date)}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-serif text-lg tabular-nums">
                  {typeof a.score === 'number' ? `${Math.round(a.score)}/100` : '—'}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
