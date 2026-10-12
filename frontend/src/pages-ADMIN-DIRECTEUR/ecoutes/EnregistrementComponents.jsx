import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, CalendarDays, X, Search, HelpCircle, User, Keyboard, FileText } from 'lucide-react'

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function SpeechScoreBar({ score }) {
  const barColor = score >= 50 ? 'bg-emerald-500' : score >= 20 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = score >= 50 ? 'text-emerald-500' : score >= 20 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${textColor}`}>{score}%</span>
    </div>
  )
}

export function formatRelativeDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "À l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffHour < 24) return `Il y a ${diffHour}h`
  if (diffDay === 1) return 'Hier'
  if (diffDay < 7) return `Il y a ${diffDay} jours`

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function UserAvatar({ prenom, nom, userType, size = 'md' }) {
  const initials = `${(prenom || '')[0] || ''}${(nom || '')[0] || ''}`.toUpperCase()
  const colorClass =
    userType === 'manager'
      ? 'bg-violet-500/15 text-violet-600'
      : 'bg-blue-500/15 text-blue-600'
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold shrink-0 ${colorClass} ${sizeClass}`}
    >
      {initials}
    </div>
  )
}

export function RecordingStatusBadge({ lastModified }) {
  if (!lastModified) return null
  const diffMs = Date.now() - new Date(lastModified).getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffHours / 24

  if (diffHours < 24) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-600">
        Nouveau
      </span>
    )
  }
  if (diffDays < 7) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600">
        Cette semaine
      </span>
    )
  }
  return null
}

export const RecordingCard = React.memo(function RecordingCard({ recording, onPlay, onDownload, speechScore }) {
  return (
    <div
      className="border border-border/60 rounded-xl p-3 hover:border-border hover:shadow-sm transition-all duration-200 cursor-pointer bg-card"
      onClick={() => onPlay?.(recording)}
    >
      <div className="flex items-start gap-2.5">
        <UserAvatar
          prenom={recording.userPrenom}
          nom={recording.userNom}
          userType={recording.userType}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium truncate">
              {recording.userName ||
                `${recording.userPrenom || ''} ${recording.userNom || ''}`.trim()}
            </span>
            <Badge
              variant={recording.userType === 'manager' ? 'secondary' : 'outline'}
              className="text-[10px] px-1.5 py-0 h-4 shrink-0"
            >
              {recording.userType === 'manager' ? 'Manager' : 'Commercial'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mb-1">{recording.filename}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground/70">
              {formatRelativeDate(recording.lastModified)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">·</span>
            <span className="text-[10px] text-muted-foreground/70">
              {speechScore?.totalDurationSec ? formatDuration(speechScore.totalDurationSec) : recording.duration}
            </span>
            {speechScore?.status === 'ready' && typeof speechScore.score === 'number' && (
              <SpeechScoreBar score={speechScore.score} />
            )}
            <RecordingStatusBadge lastModified={recording.lastModified} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={e => {
            e.stopPropagation()
            onDownload?.(recording)
          }}
          aria-label="Télécharger"
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
})

export function SortableTableHeader({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort?.key === sortKey
  const direction = isActive ? currentSort.direction : null

  return (
    <button
      onClick={() => onSort?.(sortKey)}
      className="flex items-center gap-1 font-medium text-left hover:text-foreground transition-colors text-muted-foreground text-sm w-full"
    >
      {label}
      {!isActive && <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />}
      {isActive && direction === 'desc' && <ChevronDown className="w-3.5 h-3.5" />}
      {isActive && direction === 'asc' && <ChevronUp className="w-3.5 h-3.5" />}
    </button>
  )
}

export function DateRangeFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear }) {
  const hasFilter = dateFrom || dateTo
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Période
      </span>
      <div className="flex items-center h-9 rounded-md border border-input bg-background">
        <div className="flex items-center pl-2.5 pr-1 text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
        </div>
        <input
          type="date"
          value={dateFrom || ''}
          onChange={e => onDateFromChange(e.target.value || null)}
          className="h-full w-[120px] px-1.5 text-sm bg-transparent text-foreground focus:outline-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer relative"
        />
        <span className="text-xs text-muted-foreground/50 px-1">→</span>
        <input
          type="date"
          value={dateTo || ''}
          onChange={e => onDateToChange(e.target.value || null)}
          className="h-full w-[120px] px-1.5 text-sm bg-transparent text-foreground focus:outline-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer relative"
        />
        {hasFilter && (
          <button
            onClick={onClear}
            className="flex items-center justify-center w-7 h-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

const PERIOD_OPTIONS = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
]

export function SmartSearchBar({ allUsers, activeFilters, onFilterChange, totalResults }) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const containerRef = useRef(null)

  const matchedUsers = useMemo(() => {
    if (!inputValue.trim()) return []
    const q = inputValue.toLowerCase()
    return allUsers
      .filter(u =>
        u.prenom?.toLowerCase().includes(q) ||
        u.nom?.toLowerCase().includes(q) ||
        `${u.prenom} ${u.nom}`.toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [inputValue, allUsers])

  const matchedPeriods = useMemo(() => {
    if (!inputValue.trim()) return PERIOD_OPTIONS
    const q = inputValue.toLowerCase()
    return PERIOD_OPTIONS.filter(p => p.label.toLowerCase().includes(q))
  }, [inputValue])

  const showSearchOption = inputValue.trim().length > 0

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleInputChange(e) {
    setInputValue(e.target.value)
    setIsOpen(true)
  }

  function handleInputFocus() {
    setIsOpen(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setInputValue('')
    }
    if (e.key === 'Enter' && inputValue.trim()) {
      onFilterChange({ ...activeFilters, searchText: inputValue.trim() })
      setInputValue('')
      setIsOpen(false)
    }
  }

  function selectUser(user) {
    onFilterChange({ ...activeFilters, commercial: user })
    setInputValue('')
    setIsOpen(false)
  }

  function selectPeriod(period) {
    onFilterChange({ ...activeFilters, period: period.value })
    setInputValue('')
    setIsOpen(false)
  }

  function applySearchText() {
    if (inputValue.trim()) {
      onFilterChange({ ...activeFilters, searchText: inputValue.trim() })
      setInputValue('')
      setIsOpen(false)
    }
  }

  function removeFilter(key) {
    onFilterChange({ ...activeFilters, [key]: key === 'searchText' ? '' : null })
  }

  const hasActiveFilters = activeFilters.commercial || activeFilters.period || activeFilters.searchText
  const activePeriodLabel = PERIOD_OPTIONS.find(p => p.value === activeFilters.period)?.label

  const showDropdown = isOpen && (matchedUsers.length > 0 || matchedPeriods.length > 0 || showSearchOption)

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center h-11 rounded-xl border bg-card shadow-sm transition-all duration-200 ${
          isOpen
            ? 'ring-2 ring-primary/20 border-primary/40'
            : 'border-border/60 hover:border-border/80'
        }`}
      >
        <div className="flex items-center pl-3.5 pr-2 text-muted-foreground shrink-0">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher par commercial, période, nom de fichier..."
          className="flex-1 h-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/55 focus:outline-none"
        />
        <div className="flex items-center gap-1.5 pr-3 pl-2 shrink-0">
          {totalResults !== undefined && (
            <span className="text-xs text-muted-foreground/55 font-medium tabular-nums">
              {totalResults} résultat{totalResults !== 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowHelp(true) }}
            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
            aria-label="Aide recherche"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
            {matchedUsers.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 py-1.5">
                  Commerciaux
                </div>
                {matchedUsers.map(user => (
                  <button
                    key={user.id}
                    onMouseDown={e => { e.preventDefault(); selectUser(user) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 cursor-pointer rounded-lg transition-colors text-left ${
                      activeFilters.commercial?.id === user.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <UserAvatar prenom={user.prenom} nom={user.nom} userType={user.userType} size="sm" />
                    <span className="flex-1 text-sm truncate">
                      {user.prenom} {user.nom}
                    </span>
                    <Badge
                      variant={user.userType === 'manager' ? 'secondary' : 'outline'}
                      className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                    >
                      {user.userType === 'manager' ? 'Manager' : 'Commercial'}
                    </Badge>
                    {activeFilters.commercial?.id === user.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {matchedPeriods.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 py-1.5">
                  Période
                </div>
                {matchedPeriods.map(period => (
                  <button
                    key={period.value}
                    onMouseDown={e => { e.preventDefault(); selectPeriod(period) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 cursor-pointer rounded-lg transition-colors text-left ${
                      activeFilters.period === period.value ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                      <CalendarDays className="w-3.5 h-3.5 text-violet-600" />
                    </div>
                    <span className="flex-1 text-sm">{period.label}</span>
                    {activeFilters.period === period.value && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {showSearchOption && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 py-1.5">
                  Recherche libre
                </div>
                <button
                  onMouseDown={e => { e.preventDefault(); applySearchText() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 cursor-pointer rounded-lg transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center shrink-0">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm">
                    Rechercher <span className="font-medium">"{inputValue}"</span> dans les fichiers
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {activeFilters.commercial && (
            <span className="h-7 rounded-full pl-1.5 pr-1 text-xs font-medium inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-700 border border-blue-500/20">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 inline-flex items-center justify-center text-[9px] font-bold text-blue-700 shrink-0">
                {(activeFilters.commercial.prenom?.[0] || '').toUpperCase()}{(activeFilters.commercial.nom?.[0] || '').toUpperCase()}
              </span>
              {activeFilters.commercial.prenom} {activeFilters.commercial.nom}
              <button
                onClick={() => removeFilter('commercial')}
                className="w-4 h-4 rounded-full hover:bg-black/10 inline-flex items-center justify-center transition-colors"
                aria-label="Supprimer le filtre commercial"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
          {activeFilters.period && (
            <span className="h-7 rounded-full pl-2.5 pr-1 text-xs font-medium inline-flex items-center gap-1.5 bg-violet-500/10 text-violet-700 border border-violet-500/20">
              <CalendarDays className="w-3 h-3 shrink-0" />
              {activePeriodLabel}
              <button
                onClick={() => removeFilter('period')}
                className="w-4 h-4 rounded-full hover:bg-black/10 inline-flex items-center justify-center transition-colors"
                aria-label="Supprimer le filtre période"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
          {activeFilters.searchText && (
            <span className="h-7 rounded-full pl-2.5 pr-1 text-xs font-medium inline-flex items-center gap-1.5 bg-muted text-muted-foreground border border-border/60">
              <Search className="w-3 h-3 shrink-0" />
              "{activeFilters.searchText}"
              <button
                onClick={() => removeFilter('searchText')}
                className="w-4 h-4 rounded-full hover:bg-black/10 inline-flex items-center justify-center transition-colors"
                aria-label="Supprimer la recherche textuelle"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
        </div>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Search className="w-4 h-4 text-primary" />
              </div>
              Guide de recherche
            </DialogTitle>
            <DialogDescription>
              Exploitez la barre de recherche pour filtrer rapidement vos enregistrements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Par commercial</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tapez un nom ou prénom pour filtrer les enregistrements d'un commercial ou manager spécifique.
                </p>
                <div className="flex gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Ahmed</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Dupont</span>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-border/60" />

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <CalendarDays className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Par période</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sélectionnez une période prédéfinie pour afficher uniquement les enregistrements correspondants.
                </p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Aujourd'hui</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Hier</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Cette semaine</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">Ce mois</span>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-border/60" />

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Par nom de fichier</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tapez du texte libre puis appuyez sur Entrée pour filtrer par nom de fichier d'enregistrement.
                </p>
                <div className="flex gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">appel-client</span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground">2025-01</span>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-border/60" />

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Keyboard className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Raccourcis clavier</p>
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono font-medium">Entrée</kbd>
                    <span>Appliquer la recherche texte</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono font-medium">Échap</kbd>
                    <span>Fermer les suggestions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border/40 p-3 mt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Les filtres sont cumulables : vous pouvez combiner un commercial, une période et une recherche texte simultanément.
              Cliquez sur le <X className="w-3 h-3 inline-block align-text-bottom" /> d'un filtre actif pour le retirer.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
