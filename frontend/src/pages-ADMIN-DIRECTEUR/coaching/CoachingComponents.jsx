import { cn } from '@/lib/utils'

// Barre de score 0-100 (vert ≥50, ambre ≥20, rouge sinon) — même logique visuelle
// que SpeechScoreBar de la Bibliothèque.
export function ScoreBar({ value, className }) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null
  const color =
    v == null
      ? 'bg-muted'
      : v >= 50
        ? 'bg-green-500'
        : v >= 20
          ? 'bg-amber-500'
          : 'bg-red-500'
  return (
    <div className={cn('h-2 w-full rounded-full bg-muted/60 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v ?? 0}%` }} />
    </div>
  )
}

// Métadonnées d'affichage du statut de pipeline (pas de bordure colorée : dot + pill).
export const STATUS_META = {
  PENDING: { label: 'En attente', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-600' },
  TRANSCRIBING: { label: 'Transcription…', dot: 'bg-blue-500', pill: 'bg-blue-500/10 text-blue-600' },
  MAPPING: { label: 'Détection des offres…', dot: 'bg-sky-500', pill: 'bg-sky-500/10 text-sky-600' },
  ANALYZING: { label: 'Analyse…', dot: 'bg-indigo-500', pill: 'bg-indigo-500/10 text-indigo-600' },
  // Legacy : plus jamais écrit, encore porté par les analyses antérieures.
  CONFORMITY: { label: 'Conformité produit…', dot: 'bg-violet-500', pill: 'bg-violet-500/10 text-violet-600' },
  READY: { label: 'Analysé', dot: 'bg-green-500', pill: 'bg-green-500/10 text-green-600' },
  FAILED: { label: 'Échec', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600' },
}

export const QUALITY_META = {
  ANALYZED: { label: 'Exploitable', pill: 'bg-green-500/10 text-green-600' },
  LOW_CONFIDENCE: { label: 'Confiance faible', pill: 'bg-amber-500/10 text-amber-600' },
  INEXPLOITABLE: { label: 'Inexploitable', pill: 'bg-slate-500/10 text-slate-600' },
  FAILED: { label: 'Échec', pill: 'bg-red-500/10 text-red-600' },
}

// Statut d'un critère jugé par le LLM.
export const CRITERION_META = {
  atteint: { label: 'Atteint', dot: 'bg-green-500', text: 'text-green-600' },
  partiel: { label: 'Partiel', dot: 'bg-amber-500', text: 'text-amber-600' },
  absent: { label: 'Absent', dot: 'bg-red-500', text: 'text-red-600' },
  non_applicable: { label: 'N/A', dot: 'bg-slate-300', text: 'text-muted-foreground' },
}

// Gravité d'une violation de conformité produit.
export const SEVERITY_META = {
  grave: { label: 'Grave', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600' },
  modere: { label: 'Modéré', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-600' },
}

export function SeverityPill({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.modere
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.pill)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.PENDING
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.pill)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function QualityPill({ quality }) {
  if (!quality) return null
  const meta = QUALITY_META[quality] || QUALITY_META.INEXPLOITABLE
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', meta.pill)}>
      {meta.label}
    </span>
  )
}

const ROLE_LABEL = { commercial: 'Commercial', manager: 'Manager', directeur: 'Directeur' }

/**
 * Dérive un libellé lisible depuis la clé S3.
 * Ex: "recordings/room_commercial_12/12 rue Bobet_1699999999000.mp4"
 *   → { role:"Commercial", userId:"12", address:"12 rue Bobet", date: Date }
 */
export function parseRecordingKey(key) {
  if (!key) return { role: '', userId: '', address: '', date: null }
  const parts = key.split('/')
  const room = parts.length >= 2 ? parts[parts.length - 2] : ''
  const file = (parts[parts.length - 1] || '').replace(/\.mp4$/i, '')

  let role = ''
  let userId = ''
  const roomMatch = /room[_:]?(commercial|manager|directeur)[_:]?(\d+)/i.exec(room)
  if (roomMatch) {
    role = ROLE_LABEL[roomMatch[1].toLowerCase()] || roomMatch[1]
    userId = roomMatch[2]
  }

  let address = file
  let date = null
  const lastUnderscore = file.lastIndexOf('_')
  if (lastUnderscore > 0) {
    address = file.slice(0, lastUnderscore)
    const rawTs = file.slice(lastUnderscore + 1)
    const epoch = Number(rawTs)
    if (Number.isFinite(epoch) && epoch > 0) {
      // ancien format : timestamp epoch (ms ou s)
      date = new Date(epoch > 1e12 ? epoch : epoch * 1000)
    } else {
      // format ISO avec tirets dans l'heure : 2026-07-16T12-53-51.535Z → 12:53:51
      const iso = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3')
      const d = new Date(iso)
      if (!Number.isNaN(d.getTime())) date = d
    }
  }
  // Adresse lisible : les underscores (espaces/accents assainis) → espaces
  address = (address || file).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return { role, userId, address, date }
}

export function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime?.())) return '—'
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const IN_PROGRESS_STATUSES = [
  'PENDING',
  'TRANSCRIBING',
  'MAPPING',
  'ANALYZING',
  'CONFORMITY', // legacy : analyses antérieures à la passe 0
]
export const isInProgress = (status) => IN_PROGRESS_STATUSES.includes(status)

export function formatDuration(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Statut de la porte (résultat de l'échange) — couleur sémantique via pastille.
export const PORTE_STATUT_META = {
  CONTRAT_SIGNE: { label: 'Contrat signé', dot: 'bg-green-500', pill: 'bg-green-500/10 text-green-600' },
  RENDEZ_VOUS_PRIS: { label: 'RDV pris', dot: 'bg-blue-500', pill: 'bg-blue-500/10 text-blue-600' },
  ARGUMENTE: { label: 'Argumenté', dot: 'bg-indigo-500', pill: 'bg-indigo-500/10 text-indigo-600' },
  NECESSITE_REPASSAGE: { label: 'À repasser', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-600' },
  REFUS: { label: 'Refus', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-600' },
  ABSENT: { label: 'Absent', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-600' },
  NON_VISITE: { label: 'Non visité', dot: 'bg-slate-300', pill: 'bg-slate-500/10 text-muted-foreground' },
}

export function PorteStatutPill({ statut }) {
  if (!statut) return <span className="text-xs text-muted-foreground">—</span>
  const meta = PORTE_STATUT_META[statut] || {
    label: statut,
    dot: 'bg-slate-400',
    pill: 'bg-slate-500/10 text-slate-600',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', meta.pill)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

// Statuts « coachables » (échange réel) — les seuls affichés dans la page.
export const RELEVANT_STATUTS = [
  'CONTRAT_SIGNE',
  'RENDEZ_VOUS_PRIS',
  'ARGUMENTE',
  'REFUS',
]

// Options du filtre par statut porte (uniquement les statuts pertinents).
export const STATUT_FILTERS = [
  { value: 'ALL', label: 'Tous (pertinents)' },
  { value: 'CONTRAT_SIGNE', label: 'Contrat signé' },
  { value: 'RENDEZ_VOUS_PRIS', label: 'RDV pris' },
  { value: 'ARGUMENTE', label: 'Argumenté' },
  { value: 'REFUS', label: 'Refus' },
]
