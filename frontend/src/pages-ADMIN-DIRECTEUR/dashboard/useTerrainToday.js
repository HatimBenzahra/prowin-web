import { useCallback, useMemo, useState } from 'react'
import {
  useGpsLatestActorPositions,
  useGpsDailyRouteByActor,
} from '@/hooks/metier/api/gps-tracking'
import { useActorDirectory } from '../gps-tracking/useActorDirectory'

/**
 * Palette d'identité des commerciaux.
 *
 * Volontairement en hex littéral et non en tokens `chart-*` : les tokens du
 * design system sont injectés à l'exécution en OKLCH par src/config/theme/base.js
 * et varient selon le thème, alors que Mapbox `line-color` exige une couleur déjà
 * résolue. Une seule palette sert donc la pastille DOM et le tracé de la carte,
 * ce qui garantit que les deux ne divergent jamais (même choix que
 * LocationTab.jsx et AdressesAcquiscan.jsx).
 */
const ACTOR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']

function todayIsoDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(isoDate, reference) {
  if (!isoDate) return false
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return false
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

/**
 * Terrain du jour : les commerciaux ayant émis une position aujourd'hui, et le
 * trajet du jour de celui qui est sélectionné.
 *
 * `gpsLatestActorPositions` n'accepte aucun argument, donc aucun
 * `excludeTestUsers` comme le font les autres requêtes web : les utilisateurs de
 * test sont écartés ici, côté client.
 */
export function useTerrainToday() {
  const { data: gpsPositions, isLoading } = useGpsLatestActorPositions()
  const { buildActors } = useActorDirectory()
  const [selectedKey, setSelectedKey] = useState(null)

  const todayStr = useMemo(todayIsoDate, [])

  // Commerciaux ayant émis une position aujourd'hui, en ligne d'abord puis alphabétique.
  const commercials = useMemo(() => {
    const today = new Date()
    const result = buildActors(gpsPositions ?? [])
      .filter(a => a.userType === 'COMMERCIAL')
      .filter(a => isSameDay(a.lastSeen, today))
      .map(a => ({
        ...a,
        hasPosition: typeof a.latitude === 'number' && typeof a.longitude === 'number',
      }))
    result.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1
      return (a.name || '').localeCompare(b.name || '')
    })
    return result
  }, [gpsPositions, buildActors])

  const located = useMemo(() => commercials.filter(c => c.hasPosition), [commercials])

  const selectedActor = useMemo(
    () => commercials.find(c => c.key === selectedKey) ?? null,
    [commercials, selectedKey]
  )

  const { data: dailyRoute, isFetching } = useGpsDailyRouteByActor(
    selectedActor?.userId ?? null,
    selectedActor ? 'COMMERCIAL' : null,
    todayStr
  )

  const route = useMemo(() => {
    const positions = dailyRoute?.positions ?? []
    const geoJson =
      positions.length < 2
        ? null
        : {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: positions.map(p => [p.longitude, p.latitude]),
            },
            properties: {},
          }
    return {
      positions,
      geoJson,
      startPoint: positions[0] ?? null,
      isFetching,
      isEmpty: !isFetching && positions.length < 2,
    }
  }, [dailyRoute, isFetching])

  // Couleur d'identité indexée sur l'identifiant du commercial : elle reste la
  // même quand la liste est retriée (un commercial qui passe hors ligne remonte
  // ou descend sans changer de couleur).
  const colorFor = useCallback(
    userId => ACTOR_COLORS[Math.abs(Number(userId) || 0) % ACTOR_COLORS.length],
    []
  )

  // Re-cliquer le commercial sélectionné le désélectionne et rend la vue d'ensemble.
  const selectActor = useCallback(actor => {
    if (!actor?.hasPosition) return
    setSelectedKey(current => (current === actor.key ? null : actor.key))
  }, [])

  // Utilisé quand le focus passe à une zone : les deux sélections s'excluent.
  const clearActor = useCallback(() => setSelectedKey(null), [])

  return {
    commercials,
    located,
    selectedKey,
    selectedActor,
    selectActor,
    clearActor,
    route,
    colorFor,
    isLoading,
  }
}
