import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Recherche repliable : bouton loupe → champ qui s'ouvre en douceur, puis se
 * referme (croix). Extrait du pattern de la carte AcquiScan pour être réutilisé.
 * Contrôlé : `value` / `onChange`.
 */
export default function ExpandableSearch({
  value,
  onChange,
  placeholder = 'Rechercher…',
  className,
  expandedClassName = 'sm:basis-[300px] sm:max-w-[300px]',
}) {
  const inputRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const isOpen = expanded || (value?.length ?? 0) > 0

  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  const close = () => {
    onChange('')
    setExpanded(false)
  }

  return (
    <div
      className={cn(
        'relative min-w-0 transition-[flex-basis,width,max-width] duration-500 ease-out',
        isOpen ? `basis-full ${expandedClassName}` : 'basis-9',
        className,
      )}
    >
      {!isOpen ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setExpanded(true)}
          className="h-8 w-9 rounded-md border-border/70 bg-background text-muted-foreground shadow-none transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
          title={placeholder}
        >
          <Search className="h-4 w-4" />
        </Button>
      ) : (
        <>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 rounded-md border-border bg-background pl-9 pr-9 text-sm shadow-none focus-visible:border-ring focus-visible:ring-ring/30"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Fermer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
