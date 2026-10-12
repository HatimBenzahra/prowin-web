import { useEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'

/**
 * Layout deux colonnes redimensionnable (fiches détail commercial / manager).
 * - xl+ : `left` à gauche, `right` à droite, séparés par une poignée draggable
 *   (largeur mémorisée par `storageKey`, bornes 28–65%).
 * - < xl : une seule colonne, `right` d'abord puis `left` (ordre inversé) pour ne pas
 *   bloquer l'accès aux stats derrière un long contenu à gauche.
 */

const SPLIT_MIN = 28
const SPLIT_MAX = 65
const clampSplit = pct => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct))

function useIsXl() {
  const [isXl, setIsXl] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const sync = () => setIsXl(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return isXl
}

export default function SplitLayout({ storageKey, left, right, defaultLeftPct = 40 }) {
  const isXl = useIsXl()
  const ref = useRef(null)
  const [leftPct, setLeftPct] = useState(() => {
    if (typeof window === 'undefined') return defaultLeftPct
    const v = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : defaultLeftPct
  })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    const onMove = e => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      setLeftPct(clampSplit(((e.clientX - rect.left) / rect.width) * 100))
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(leftPct)))
      } catch {
        /* localStorage indisponible : on ignore */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [leftPct, storageKey])

  return (
    <div
      ref={ref}
      className="grid items-start gap-8 xl:gap-0"
      style={
        isXl
          ? { gridTemplateColumns: `minmax(0, ${leftPct}fr) 1.5rem minmax(0, ${100 - leftPct}fr)` }
          : undefined
      }
    >
      <div className="order-2 min-w-0 xl:order-1">{left}</div>

      {/* Poignée de redimensionnement (xl uniquement) : glisser ou flèches ←/→ */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajuster la largeur des colonnes"
        aria-valuenow={Math.round(leftPct)}
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        tabIndex={0}
        onPointerDown={() => setIsDragging(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setLeftPct(p => clampSplit(p - 2))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            setLeftPct(p => clampSplit(p + 2))
          }
        }}
        className="group relative hidden cursor-col-resize touch-none select-none items-center justify-center self-stretch outline-none xl:order-2 xl:flex"
      >
        <div
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
            isDragging ? 'bg-primary' : 'bg-border group-hover:bg-primary/50'
          }`}
        />
        <div
          className={`relative z-10 flex h-10 w-5 items-center justify-center rounded-full border bg-background shadow-sm transition-colors ${
            isDragging
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground group-hover:border-primary group-hover:text-primary group-focus-visible:border-primary group-focus-visible:text-primary'
          }`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="order-1 min-w-0 xl:order-3">{right}</div>
    </div>
  )
}
