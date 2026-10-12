import { useState, useEffect } from 'react'
import {
  GraduationCap,
  Loader2,
  ArrowLeft,
  AudioLines,
  CircleSlash,
  TriangleAlert,
  ChevronRight,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCoachingIALogic } from './useCoachingIALogic'
import SalesPlanViewer from './SalesPlanViewer'
import ProductSheetsViewer from './ProductSheetsViewer'
import CoachingManagementList from './CoachingManagementList'
import AnalyzedRecordingsModal from './AnalyzedRecordingsModal'
import {
  PORTE_STATUT_META,
  PorteStatutPill,
  StatusPill,
  parseRecordingKey,
  formatDuration,
} from './CoachingComponents'

// Nombre max de jetons empilés affichés avant de basculer sur un compteur « +N ».
const MAX_CHIPS = 14

// Options de planification du cron de synthèse.
const CRON_FREQUENCIES = [
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'off', label: 'Désactivé' },
]
const CRON_WEEKDAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
]
const CRON_HOURS = Array.from({ length: 24 }, (_, h) => h)
const CRON_MINUTES = [0, 15, 30, 45]

// Libellé de survol d'un jeton : « Nom · adresse · durée ».
function chipTitle(item) {
  if (!item) return undefined
  const meta = parseRecordingKey(item.s3KeyOriginal)
  return [item.subjectName, meta.address, formatDuration(item.durationSec)]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Une pile visuelle d'enregistrements : les jetons s'empilent depuis le bas.
 * `active` fait respirer le sommet ; `items` alimente les tooltips ; cliquable
 * pour interroger la file (statut détaillé sous la chaîne).
 */
function Pile({ count, label, tone, active, items = [], onClick, open }) {
  const shown = Math.min(count, MAX_CHIPS)
  const overflow = count - shown
  const interactive = typeof onClick === 'function' && count > 0
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      className={cn(
        'flex flex-1 flex-col items-center gap-3 rounded-xl p-2 text-center transition-colors',
        interactive ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
        open && 'bg-muted/50 ring-1 ring-border',
      )}
      aria-expanded={interactive ? open : undefined}
    >
      <div className={cn('font-serif text-4xl leading-none tabular-nums', tone.text)}>
        {count}
      </div>
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {interactive && (
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')}
          />
        )}
      </div>
      <div className="flex h-[180px] w-full flex-col items-center justify-end gap-[3px] rounded-xl border border-dashed border-border/50 bg-muted/20 p-2">
        {overflow > 0 && (
          <div className={cn('mb-0.5 text-[11px] font-semibold', tone.text)}>+{overflow}</div>
        )}
        {shown === 0 ? (
          <div className="mb-2 flex flex-col items-center gap-1 text-muted-foreground/40">
            <AudioLines className="h-5 w-5" />
            <span className="text-[10px]">vide</span>
          </div>
        ) : (
          Array.from({ length: shown }).map((_, i) => (
            <div
              key={i}
              title={chipTitle(items[i])}
              className={cn(
                'h-2.5 w-[86%] rounded-full shadow-sm transition-all',
                tone.chip,
                active && i === shown - 1 && 'animate-pulse ring-2 ring-offset-1 ring-offset-background',
                active && i === shown - 1 && tone.ring,
              )}
            />
          ))
        )}
      </div>
    </button>
  )
}

const FlowArrow = () => (
  <div className="flex items-center justify-center px-1 text-muted-foreground/40">
    <ArrowLeft className="h-6 w-6 -rotate-90 md:rotate-0" />
  </div>
)

function OutcomeChip({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <Icon className={cn('h-4 w-4', tone)} />
      <span className={cn('font-serif text-lg leading-none tabular-nums', tone)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// Liste détaillée d'une file (audios en attente / en cours) : qui, où, durée.
function QueueList({ items, emptyLabel }) {
  if (!items.length) {
    return <p className="px-1 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <ul className="divide-y divide-border/60">
      {items.map((q) => {
        const meta = parseRecordingKey(q.s3KeyOriginal)
        return (
          <li key={q.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {q.subjectName || meta.role || '—'}
                <span className="ml-2 font-normal text-muted-foreground">
                  {meta.address}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <PorteStatutPill statut={q.statutPorte} />
                <span className="text-xs text-muted-foreground">
                  {formatDuration(q.durationSec)}
                </span>
              </div>
            </div>
            <StatusPill status={q.status} />
          </li>
        )
      })}
    </ul>
  )
}

export default function CoachingIA() {
  const {
    stats,
    queue,
    loading,
    error,
    config,
    savingConfig,
    saveCoachableStatuts,
    saveMinDuration,
    saveSynthesisCron,
  } = useCoachingIALogic()

  // Pile ouverte (interrogation de la file).
  const [openPile, setOpenPile] = useState(null) // 'pending' | 'processing' | null
  // Modal des enregistrements analysés (clic sur la pile « Analysés »).
  const [analyzedOpen, setAnalyzedOpen] = useState(false)

  const pendingItems = queue.filter((q) => q.status === 'PENDING')
  const processingItems = queue.filter(
    (q) => q.status === 'TRANSCRIBING' || q.status === 'ANALYZING',
  )

  // Sélection locale des statuts coachables (onglet Réglages).
  const [sel, setSel] = useState([])
  useEffect(() => {
    setSel(config.coachableStatuts || [])
  }, [config.coachableStatuts])
  const toggleSel = (s) =>
    setSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  // Durée minimale (auto), éditée en minutes puis convertie en secondes.
  const [durMin, setDurMin] = useState('2')
  useEffect(() => {
    setDurMin(String((config.minAutoDurationSec ?? 120) / 60))
  }, [config.minAutoDurationSec])
  const durSeconds = Math.round(parseFloat(durMin) * 60)
  const durValid = Number.isFinite(durSeconds) && durSeconds >= 0 && durSeconds <= 3600
  const durChanged = durValid && durSeconds !== (config.minAutoDurationSec ?? 120)

  // Planif du cron de synthèse (rythme + heure), synchronisée depuis la config.
  const [cron, setCron] = useState({ frequency: 'daily', hour: 3, minute: 0, weekday: 1 })
  useEffect(() => {
    setCron({
      frequency: config.synthesisCronFrequency || 'daily',
      hour: config.synthesisCronHour ?? 3,
      minute: config.synthesisCronMinute ?? 0,
      weekday: config.synthesisCronWeekday ?? 1,
    })
  }, [
    config.synthesisCronFrequency,
    config.synthesisCronHour,
    config.synthesisCronMinute,
    config.synthesisCronWeekday,
  ])
  const cronChanged =
    cron.frequency !== (config.synthesisCronFrequency || 'daily') ||
    cron.hour !== (config.synthesisCronHour ?? 3) ||
    cron.minute !== (config.synthesisCronMinute ?? 0) ||
    cron.weekday !== (config.synthesisCronWeekday ?? 1)

  const togglePile = (p) => setOpenPile((cur) => (cur === p ? null : p))

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Coaching IA</h1>
          <p className="text-sm text-muted-foreground">
            État de la file d'analyse, plan de vente et réglages.
          </p>
        </div>
      </div>

      <Tabs defaultValue="apercu">
        <TabsList>
          <TabsTrigger value="apercu">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="plan">Plan de vente</TabsTrigger>
          <TabsTrigger value="produits">Produits</TabsTrigger>
          <TabsTrigger value="reglages">Réglages</TabsTrigger>
        </TabsList>

        {/* Onglet Vue d'ensemble : la file représentée comme une chaîne d'analyse */}
        <TabsContent value="apercu" className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chaîne d'analyse</CardTitle>
              <CardDescription>
                Les enregistrements arrivent à droite, passent par l'analyse, et s'empilent
                à gauche une fois traités. Clique sur « En file » ou « En cours » pour voir
                les audios concernés. Mise à jour en continu.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading || !stats ? (
                <div className="flex flex-col gap-3 md:flex-row">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[220px] flex-1 animate-pulse rounded-xl bg-muted/50" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-col-reverse items-stretch md:flex-row md:items-center">
                    <Pile
                      count={stats.ready}
                      label="Analysés"
                      onClick={() => setAnalyzedOpen(true)}
                      tone={{ text: 'text-green-600', chip: 'bg-green-500/70', ring: 'ring-green-500/50' }}
                    />
                    <FlowArrow />
                    <Pile
                      count={stats.processing}
                      label="En cours"
                      active
                      items={processingItems}
                      open={openPile === 'processing'}
                      onClick={() => togglePile('processing')}
                      tone={{ text: 'text-blue-600', chip: 'bg-blue-500/80', ring: 'ring-blue-500/60' }}
                    />
                    <FlowArrow />
                    <Pile
                      count={stats.pending}
                      label="En file"
                      items={pendingItems}
                      open={openPile === 'pending'}
                      onClick={() => togglePile('pending')}
                      tone={{ text: 'text-amber-600', chip: 'bg-amber-500/70', ring: 'ring-amber-500/50' }}
                    />
                  </div>

                  {/* Détail de la file interrogée */}
                  {openPile && (
                    <div className="mt-4 rounded-xl border border-border/60 bg-card p-3">
                      <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {openPile === 'pending'
                          ? 'Audios en file (prochain en haut)'
                          : 'Audios en cours de traitement'}
                      </div>
                      <QueueList
                        items={openPile === 'pending' ? pendingItems : processingItems}
                        emptyLabel="Aucun audio dans cette file."
                      />
                    </div>
                  )}

                  {/* Sorties annexes + score moyen */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <OutcomeChip
                        icon={CircleSlash}
                        label="Inexploitables"
                        value={stats.inexploitable}
                        tone="text-slate-500"
                      />
                      <OutcomeChip
                        icon={TriangleAlert}
                        label="Échecs"
                        value={stats.failed}
                        tone="text-red-600"
                      />
                    </div>
                    <div className="flex items-baseline gap-2 rounded-lg bg-muted/30 px-4 py-2">
                      <span className="text-xs text-muted-foreground">Score moyen</span>
                      <span className="font-serif text-2xl leading-none tabular-nums">
                        {stats.avgScore ?? '—'}
                        <span className="text-sm text-muted-foreground">/100</span>
                      </span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Interface de gestion : enregistrements coachables à analyser */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enregistrements à coacher</CardTitle>
              <CardDescription>
                Enregistrements des commerciaux/managers actifs. Lance l'analyse (manuelle,
                sans filtre de durée), en un clic ou par sélection multiple.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CoachingManagementList />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Plan de vente */}
        <TabsContent value="plan">
          <Card>
            <CardContent>
              <SalesPlanViewer />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Produits */}
        <TabsContent value="produits">
          <Card>
            <CardContent>
              <ProductSheetsViewer />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Réglages */}
        <TabsContent value="reglages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Durée minimale (analyse auto)</CardTitle>
              <CardDescription>
                Seuls les audios d'au moins cette durée sont analysés automatiquement. La
                durée provient de la porte. (L'analyse manuelle n'est pas soumise à ce filtre.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="0.5"
                    value={durMin}
                    onChange={(e) => setDurMin(e.target.value)}
                    className="w-24 rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-sm text-muted-foreground">
                    minutes {durValid ? `(${durSeconds}s)` : ''}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={savingConfig || !durValid || !durChanged}
                  onClick={() => saveMinDuration(durSeconds)}
                >
                  {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enregistrer
                </Button>
                {!durValid && (
                  <span className="text-xs text-destructive">
                    Valeur entre 0 et 60 minutes.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statuts porte à coacher</CardTitle>
              <CardDescription>
                Seuls les audios dont la porte a l'un de ces statuts déclenchent l'analyse
                automatique.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(config.allStatuts || []).map((s) => {
                  const active = sel.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSel(s)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-muted/60',
                      )}
                    >
                      {PORTE_STATUT_META[s]?.label || s}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={savingConfig || sel.length === 0}
                  onClick={() => saveCoachableStatuts(sel)}
                >
                  {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enregistrer
                </Button>
                {sel.length === 0 && (
                  <span className="text-xs text-destructive">
                    Sélectionne au moins un statut.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Régénération automatique des synthèses (cron nocturne) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Régénération automatique des synthèses</CardTitle>
              <CardDescription>
                Les fiches synthèse des commerciaux/managers actifs sont régénérées
                automatiquement (uniquement s'ils ont de nouvelles sessions coachées).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                {/* Rythme */}
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Rythme
                  </div>
                  <Select
                    value={cron.frequency}
                    onValueChange={(v) => setCron((c) => ({ ...c, frequency: v }))}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRON_FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Jour (hebdo uniquement) */}
                {cron.frequency === 'weekly' && (
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Jour
                    </div>
                    <Select
                      value={String(cron.weekday)}
                      onValueChange={(v) => setCron((c) => ({ ...c, weekday: Number(v) }))}
                    >
                      <SelectTrigger className="h-8 w-[130px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_WEEKDAYS.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Heure */}
                {cron.frequency !== 'off' && (
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Heure
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={String(cron.hour)}
                        onValueChange={(v) => setCron((c) => ({ ...c, hour: Number(v) }))}
                      >
                        <SelectTrigger className="h-8 w-[72px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRON_HOURS.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">:</span>
                      <Select
                        value={String(cron.minute)}
                        onValueChange={(v) => setCron((c) => ({ ...c, minute: Number(v) }))}
                      >
                        <SelectTrigger className="h-8 w-[72px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRON_MINUTES.map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {String(m).padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={savingConfig || !cronChanged}
                  onClick={() => saveSynthesisCron(cron)}
                >
                  {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enregistrer
                </Button>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Dernière exécution :{' '}
                <span className="font-medium tabular-nums text-foreground/80">
                  {config.synthesisCronLastRunAt
                    ? new Date(config.synthesisCronLastRunAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Jamais exécuté'}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AnalyzedRecordingsModal open={analyzedOpen} onOpenChange={setAnalyzedOpen} />
    </div>
  )
}
