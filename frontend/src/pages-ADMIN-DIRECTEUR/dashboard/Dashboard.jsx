import React from 'react'
import { Trophy, TrendingUp, Calendar, DoorOpen } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/details/DetailPrimitives'
import { useDashboardLogic } from './useDashboardLogic'
import TerrainToday from './TerrainToday'
import ProspectionCharts from './ProspectionCharts'

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = React.useState(0)
  const isPercentage = typeof value === 'string' && String(value).endsWith('%')
  const numericValue = isPercentage ? parseInt(value) : Number(value) || 0

  React.useEffect(() => {
    if (numericValue === 0) {
      setDisplay(0)
      return
    }
    const start = performance.now()
    let raf
    const step = now => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(numericValue * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [numericValue, duration])

  return (
    <>
      {display}
      {isPercentage ? '%' : ''}
    </>
  )
}

export default function Dashboard() {
  const { today, totals, tauxConversion, isLoading } = useDashboardLogic()

  if (isLoading)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Même gabarit que `StatTile size="lg"` : icône en tête de libellé. */}
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border border-border/60 p-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="mt-2 h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        @keyframes dashFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dash-stagger { animation: dashFadeIn 0.5s ease-out forwards; opacity: 0; }
      `}</style>
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 dash-stagger"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'} 👋
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span className="text-sm font-medium">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 dash-stagger"
        style={{ animationDelay: '80ms' }}
      >
        {/* `StatTile` rend `value` tel quel : l'animation des chiffres reste ici. */}
        <StatTile
          label="Contrats signés"
          value={<AnimatedNumber value={totals.contrats} />}
          hint="Signatures du jour"
          icon={Trophy}
          accent="emerald"
          size="lg"
          interactive
        />
        <StatTile
          label="Portes prospectées"
          value={<AnimatedNumber value={totals.portes} />}
          hint="Visites effectuées"
          icon={DoorOpen}
          accent="blue"
          size="lg"
          interactive
        />
        <StatTile
          label="Rendez-vous pris"
          value={<AnimatedNumber value={totals.rdv} />}
          hint="Planifiés aujourd'hui"
          icon={Calendar}
          accent="amber"
          size="lg"
          interactive
        />
        <StatTile
          label="Taux de conversion"
          value={<AnimatedNumber value={tauxConversion} />}
          hint={`${totals.immeubles} bâtiment${totals.immeubles > 1 ? 's' : ''} prospecté${totals.immeubles > 1 ? 's' : ''}`}
          icon={TrendingUp}
          accent="violet"
          size="lg"
          interactive
        />
      </div>

      {/* ── Terrain du jour : carte dominante + commerciaux actifs ── */}
      <div className="dash-stagger" style={{ animationDelay: '160ms' }}>
        <TerrainToday />
      </div>

      {/* ── Graphes de prospection ── */}
      <div className="dash-stagger" style={{ animationDelay: '240ms' }}>
        <ProspectionCharts />
      </div>
    </div>
  )
}
