import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import MapboxMap, { Marker, NavigationControl, Popup, Source, Layer } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/ui/use-mobile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  MapPin,
  Info,
  Route,
  Clock,
  ChevronRight,
  ChevronLeft,
  Navigation2,
  Flag,
  Users,
  Zap,
  Crosshair,
  X,
  PanelLeftOpen,
} from 'lucide-react'
import MapToolbar from './MapToolbar'
import {
  formatBattery,
  getBatteryIcon,
  getBatteryColor,
  getBatteryHexColor,
  isBatteryKnown,
  clampBattery,
} from '../batteryUtils'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN

const MAP_STYLES = [
  { url: 'mapbox://styles/mapbox/streets-v12', label: 'Plan' },
  { url: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite' },
  { url: 'mapbox://styles/mapbox/dark-v11', label: 'Sombre' },
]

const BUILDINGS_LAYER_DEF = {
  id: 'gps-3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': '#aaa',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-opacity': 0.6,
  },
}

const ROUTE_COLOR = '#6366f1'

const TRAJET_QUICK_FILTERS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
]

const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function detectStops(positions) {
  if (!Array.isArray(positions) || positions.length < 2) return []
  const STOP_THRESHOLD_METERS = 50
  const STOP_MIN_DURATION_MS = 5 * 60 * 1000
  const stops = []
  let stopStart = null
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]
    const curr = positions[i]
    const dist = haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
    if (dist < STOP_THRESHOLD_METERS) {
      if (!stopStart) stopStart = { index: i - 1, position: prev }
    } else {
      if (stopStart) {
        const duration = new Date(prev.recordedAt) - new Date(stopStart.position.recordedAt)
        if (duration >= STOP_MIN_DURATION_MS) {
          stops.push({
            type: 'stop',
            latitude: stopStart.position.latitude,
            longitude: stopStart.position.longitude,
            startTime: stopStart.position.recordedAt,
            endTime: prev.recordedAt,
            duration,
          })
        }
        stopStart = null
      }
    }
  }
  if (stopStart) {
    const last = positions[positions.length - 1]
    const duration = new Date(last.recordedAt) - new Date(stopStart.position.recordedAt)
    if (duration >= STOP_MIN_DURATION_MS) {
      stops.push({
        type: 'stop',
        latitude: stopStart.position.latitude,
        longitude: stopStart.position.longitude,
        startTime: stopStart.position.recordedAt,
        endTime: last.recordedAt,
        duration,
      })
    }
  }
  return stops
}

function buildEnrichedEvents(positions, stops) {
  if (!Array.isArray(positions) || positions.length < 1) return []
  const first = positions[0]
  const last = positions[positions.length - 1]
  const allEvents = [
    {
      type: 'departure',
      time: first.recordedAt,
      latitude: first.latitude,
      longitude: first.longitude,
      _key: 'departure',
    },
    ...stops.map(s => ({ ...s, _key: `stop-${s.startTime}` })),
    {
      type: 'arrival',
      time: last.recordedAt,
      latitude: last.latitude,
      longitude: last.longitude,
      _key: 'arrival',
    },
  ]
  const result = []
  for (let i = 0; i < allEvents.length; i++) {
    result.push(allEvents[i])
    if (i < allEvents.length - 1) {
      const startTime = allEvents[i].type === 'departure' ? allEvents[i].time : allEvents[i].endTime
      const endTime =
        allEvents[i + 1].type === 'arrival' ? allEvents[i + 1].time : allEvents[i + 1].startTime
      const startMs = new Date(startTime).getTime()
      const endMs = new Date(endTime).getTime()
      const durationMs = Math.max(0, endMs - startMs)
      const segPositions = positions.filter(p => {
        const t = new Date(p.recordedAt).getTime()
        return t >= startMs && t <= endMs
      })
      let distMeters = 0
      for (let j = 1; j < segPositions.length; j++) {
        distMeters += haversineDistance(
          segPositions[j - 1].latitude,
          segPositions[j - 1].longitude,
          segPositions[j].latitude,
          segPositions[j].longitude
        )
      }
      result.push({
        type: 'movement',
        durationMs,
        distanceMeters: distMeters,
        _key: `mv-${startMs}-${endMs}`,
      })
    }
  }
  return result
}

const formatRelativeTime = value => {
  if (!value) return 'Inconnu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Inconnu'
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffSec < 60) return "À l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  if (diffHour < 24) return `il y a ${diffHour} h`
  if (diffDay < 7) return `il y a ${diffDay} j`
  return date.toLocaleDateString('fr-FR')
}

const formatTime = dateStr =>
  new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const formatDurationMs = ms => {
  if (!ms || ms <= 0) return '—'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}min`
  return `${minutes} min`
}

const formatDistanceKm = meters => {
  if (!meters || meters <= 0) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const getActorRoleLabel = actor => (actor?.userType === 'MANAGER' ? 'Manager' : 'Commercial')

const getActorInitial = actor => getActorRoleLabel(actor).charAt(0).toUpperCase()

// Initiales de la personne (ex. « Jean Dupont » → « JD ») pour l'en-tête du popup
// live. Repli sur getActorInitial (lettre du rôle) quand le nom n'a pas pu être
// résolu (cf. useActorDirectory#resolveActorName → `#${userId}`).
const getActorNameInitials = actor => {
  const trimmed = (actor?.name || '').trim()
  if (!trimmed || trimmed.startsWith('#')) return getActorInitial(actor)
  const initials = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
  return initials || getActorInitial(actor)
}

// Couleur d'avatar dérivée du rôle (commercial vs manager), via les tokens
// sémantiques déjà utilisés par AVATAR_COLORS ci-dessous.
const getActorRoleAvatarColor = actor =>
  actor?.userType === 'MANAGER' ? 'bg-chart-5/15 text-chart-5' : 'bg-primary/15 text-primary'

const AVATAR_COLORS = [
  'bg-chart-2/15 text-chart-2',
  'bg-primary/15 text-primary',
  'bg-chart-5/15 text-chart-5',
  'bg-chart-1/15 text-chart-1',
  'bg-chart-3/15 text-chart-3',
]

const getAvatarColor = (_id, index) => AVATAR_COLORS[index % AVATAR_COLORS.length]

const sanitizeId = id => (id || '').replace(/[^a-zA-Z0-9]/g, '_')

export default function LocationTab({
  actors,
  loading,
  mode,
  setMode,
  selectedActorKey,
  setSelectedActorKey,
  periodKey,
  setPeriodKey,
  periodLabel,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  customFromTime,
  setCustomFromTime,
  customToTime,
  setCustomToTime,
  routePositions,
  routeLoading,
  routeTotal,
  embedded = false,
}) {
  const navigate = useNavigate()
  const [viewState, setViewState] = useState(null)
  // Sous 1024 px le panneau latéral devient un tiroir : la carte a besoin de la largeur.
  const isCompact = useIsMobile()
  const [panelOpen, setPanelOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [is3DTerrain, setIs3DTerrain] = useState(false)
  const [is3DBuildings, setIs3DBuildings] = useState(false)
  const [mapStyleIndex, setMapStyleIndex] = useState(0)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [trajetPopupPos, setTrajetPopupPos] = useState(null)
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [selectedStopIndex, setSelectedStopIndex] = useState(null)

  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const is3DTerrainRef = useRef(false)
  const is3DBuildingsRef = useRef(false)
  const timelineRef = useRef(null)

  const actorsWithGps = useMemo(
    () =>
      (actors || []).filter(a => typeof a.latitude === 'number' && typeof a.longitude === 'number'),
    [actors]
  )

  // En mode Live on ne montre que les commerciaux actuellement en ligne :
  // afficher la dernière position d'un commercial hors ligne est trompeur pour
  // une vue « temps réel ». Le Trajet, lui, continue d'utiliser actorsWithGps
  // (on doit pouvoir consulter l'historique d'un commercial même hors ligne).
  const liveActors = useMemo(() => actorsWithGps.filter(a => a.online), [actorsWithGps])

  const selectedActor = useMemo(
    () => (actors || []).find(a => a.key === selectedActorKey) || null,
    [actors, selectedActorKey]
  )

  const selectedLiveActor = useMemo(
    () => actorsWithGps.find(a => a.key === selectedActorKey) || null,
    [actorsWithGps, selectedActorKey]
  )

  const defaultCenter = useMemo(() => {
    if (!actorsWithGps.length) return { latitude: 48.86, longitude: 2.35, zoom: 10 }
    const lat =
      actorsWithGps.reduce((s, a) => s + Number(a.latitude || 0), 0) / actorsWithGps.length
    const lng =
      actorsWithGps.reduce((s, a) => s + Number(a.longitude || 0), 0) / actorsWithGps.length
    return { latitude: lat, longitude: lng, zoom: 11 }
  }, [actorsWithGps])

  // Un seul actor est sélectionné à la fois : le trajet est un simple tableau
  // chronologique de positions, dont on dérive distance / arrêts / événements.
  const routeStats = useMemo(() => {
    const positions = routePositions || []
    if (positions.length < 2) {
      return {
        positions,
        totalDistance: 0,
        stops: [],
        firstPos: positions[0] || null,
        lastPos: positions[positions.length - 1] || null,
      }
    }
    let dist = 0
    for (let i = 1; i < positions.length; i++) {
      dist += haversineDistance(
        positions[i - 1].latitude,
        positions[i - 1].longitude,
        positions[i].latitude,
        positions[i].longitude
      )
    }
    const stops = detectStops(positions)
    return {
      positions,
      totalDistance: dist,
      stops,
      firstPos: positions[0],
      lastPos: positions[positions.length - 1],
    }
  }, [routePositions])

  const selectedEnrichedEvents = useMemo(() => {
    if (routeStats.positions.length < 2) return []
    return buildEnrichedEvents(routeStats.positions, routeStats.stops)
  }, [routeStats])

  const selectedStopEvents = useMemo(() => routeStats.stops || [], [routeStats])

  const hasRoute = routeStats.positions.length >= 2

  const routeSafeId = useMemo(() => sanitizeId(selectedActorKey || 'route'), [selectedActorKey])

  useEffect(() => {
    is3DTerrainRef.current = is3DTerrain
  }, [is3DTerrain])
  useEffect(() => {
    is3DBuildingsRef.current = is3DBuildings
  }, [is3DBuildings])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    if (mode === 'live') {
      setTrajetPopupPos(null)
      setFocusedIndex(null)
      setSelectedStopIndex(null)
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'trajet' || !mapRef.current) return
    const positions = routePositions || []
    if (!positions.length) return
    const bounds = new mapboxgl.LngLatBounds()
    for (const p of positions) {
      bounds.extend([p.longitude, p.latitude])
    }
    try {
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 900 })
    } catch (error) {
      void error
    }
  }, [mode, routePositions])

  const setupMapExtras = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        })
      }
      if (is3DTerrainRef.current) map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      if (is3DBuildingsRef.current && !map.getLayer('gps-3d-buildings')) {
        map.addLayer(BUILDINGS_LAYER_DEF)
      }
    } catch (error) {
      void error
    }
  }, [])

  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true)
    setupMapExtras()
    const map = mapRef.current?.getMap()
    if (map) map.on('style.load', setupMapExtras)
  }, [setupMapExtras])

  const handleToggle3DTerrain = useCallback(() => {
    if (!isMapLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const next = !is3DTerrain
    try {
      if (next) {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          })
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
        map.easeTo({ pitch: 60 })
      } else {
        map.setTerrain(null)
        map.easeTo({ pitch: 0 })
      }
      setIs3DTerrain(next)
      is3DTerrainRef.current = next
    } catch (error) {
      void error
    }
  }, [is3DTerrain, isMapLoaded])

  const handleToggle3DBuildings = useCallback(() => {
    if (!isMapLoaded) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const next = !is3DBuildings
    try {
      if (next) {
        if (!map.getLayer('gps-3d-buildings')) map.addLayer(BUILDINGS_LAYER_DEF)
      } else {
        if (map.getLayer('gps-3d-buildings')) map.removeLayer('gps-3d-buildings')
      }
      setIs3DBuildings(next)
      is3DBuildingsRef.current = next
    } catch (error) {
      void error
    }
  }, [is3DBuildings, isMapLoaded])

  const handleStyleSwitch = useCallback(() => {
    setMapStyleIndex(prev => (prev + 1) % MAP_STYLES.length)
  }, [])

  const handleFullscreenToggle = useCallback(() => {
    try {
      if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
      else document.exitFullscreen()
    } catch (error) {
      void error
    }
  }, [])

  const handleCenterOnDevices = useCallback(() => {
    if (!mapRef.current) return
    if (mode === 'trajet') {
      const positions = routePositions || []
      if (positions.length) {
        const bounds = new mapboxgl.LngLatBounds()
        for (const p of positions) {
          bounds.extend([p.longitude, p.latitude])
        }
        try {
          mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 })
        } catch (error) {
          void error
        }
        return
      }
    }
    const centerSet = mode === 'live' ? liveActors : actorsWithGps
    if (!centerSet.length) return
    const bounds = new mapboxgl.LngLatBounds()
    for (const a of centerSet) {
      bounds.extend([a.longitude, a.latitude])
    }
    try {
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 })
    } catch (error) {
      void error
    }
  }, [actorsWithGps, liveActors, mode, routePositions])

  const handleCardClick = useCallback(
    actor => {
      setSelectedActorKey(actor.key)
      setViewState({
        latitude: Number(actor.latitude),
        longitude: Number(actor.longitude),
        zoom: 14,
        transitionDuration: 800,
      })
    },
    [setSelectedActorKey]
  )

  const handlePeriodChange = useCallback(
    key => {
      setPeriodKey(key)
      if (key === 'custom' && !customFrom) {
        const today = new Date().toISOString().slice(0, 10)
        setCustomFrom(today)
        if (!customTo) setCustomTo(today)
      }
    },
    [setPeriodKey, customFrom, customTo, setCustomFrom, setCustomTo]
  )

  const handleEventClick = useCallback(event => {
    if (mapRef.current && event.longitude != null && event.latitude != null) {
      mapRef.current.flyTo({ center: [event.longitude, event.latitude], zoom: 16, duration: 700 })
    }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <span className="text-sm">Chargement des positions GPS...</span>
      </div>
    )
  }

  if (!MAPBOX_TOKEN) {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-muted-foreground">
          Le token Mapbox est requis pour afficher la carte. Configurez{' '}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
            VITE_MAPBOX_ACCESS_TOKEN
          </code>{' '}
          dans votre fichier d'environnement.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-[420px] bg-background overflow-hidden ${
        isFullscreen
          ? 'h-dvh rounded-none border-0'
          : `${embedded ? 'h-[560px]' : 'h-[calc(100dvh-130px)]'} rounded-xl border border-border/40`
      }`}
    >
      {/* Sous 1024 px, un panneau de 360 px ne laisse rien à la carte : à 375 px elle
          sortait de 435 px du cadre, coupée par l'`overflow-hidden` du conteneur. Le
          panneau passe donc en tiroir et la carte prend toute la largeur. Le seuil est
          celui de `useIsMobile`, le même que la bascule de la sidebar : les deux
          répondent à la même contrainte de place. */}
      {isCompact ? (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="left" className="w-[min(22.5rem,88vw)] gap-0 p-0">
            <SheetTitle className="sr-only">Panneau de suivi</SheetTitle>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="p-3 border-b border-border/50 space-y-3">
                {!embedded && (
                  <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('live')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        mode === 'live'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full bg-chart-2 ${mode === 'live' ? 'animate-pulse' : ''}`}
                      />
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('trajet')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        mode === 'trajet'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Route className="h-3.5 w-3.5" />
                      Trajet
                    </button>
                  </div>
                )}

                {mode === 'live' ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Commerciaux et tablettes
                      </div>
                      <div
                        className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
                        style={{ scrollbarWidth: 'none' }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedActorKey(null)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            !selectedActorKey
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Tous
                        </button>
                        {liveActors.map(actor => {
                          const active = selectedActorKey === actor.key
                          return (
                            <button
                              key={actor.key}
                              type="button"
                              onClick={() => setSelectedActorKey(actor.key)}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-w-[180px] truncate ${
                                active
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                              }`}
                              title={actor.name}
                            >
                              {actor.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs rounded-lg border border-chart-2/20 bg-chart-2/10 px-2.5 py-1.5">
                      <span className="text-muted-foreground">Vue opérateur</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-chart-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-chart-2 animate-pulse" />
                        En direct
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-border/50 bg-muted/15 p-2.5 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />P{'\u00e9'}riode
                      </div>
                      <div className="flex items-center gap-1.5">
                        {TRAJET_QUICK_FILTERS.map(opt => {
                          const active = periodKey === opt.key
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => handlePeriodChange(opt.key)}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => handlePeriodChange('custom')}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            periodKey === 'custom'
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Autre date
                        </button>
                      </div>
                      {periodKey === 'custom' && (
                        <div className="space-y-1.5 pt-1">
                          <div className="grid grid-cols-[24px_1fr_92px] gap-2 items-center">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Du
                            </span>
                            <input
                              type="date"
                              value={customFrom}
                              onChange={e => setCustomFrom(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <input
                              type="time"
                              value={customFromTime}
                              onChange={e => setCustomFromTime(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div className="grid grid-cols-[24px_1fr_92px] gap-2 items-center">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Au
                            </span>
                            <input
                              type="date"
                              value={customTo || customFrom}
                              onChange={e => setCustomTo(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <input
                              type="time"
                              value={customToTime}
                              onChange={e => setCustomToTime(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {!embedded && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          Filtre commerciaux
                        </div>
                        <div
                          className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
                          style={{ scrollbarWidth: 'none' }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedActorKey(null)
                              setTrajetPopupPos(null)
                              setSelectedStopIndex(null)
                            }}
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              !selectedActorKey
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Tous
                          </button>
                          {(actors || []).map(actor => {
                            const active = selectedActorKey === actor.key
                            return (
                              <button
                                key={actor.key}
                                type="button"
                                onClick={() => {
                                  setSelectedActorKey(actor.key)
                                  setTrajetPopupPos(null)
                                  setSelectedStopIndex(null)
                                }}
                                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-w-[180px] truncate ${
                                  active
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                                }`}
                                title={actor.name}
                              >
                                {actor.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                      <span className="text-muted-foreground">{periodLabel}</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {routeTotal} points
                      </span>
                    </div>
                    {routeLoading && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                        Chargement des trajets...
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                style={{ scrollbarWidth: 'thin' }}
              >
                {mode === 'live' ? (
                  liveActors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 gap-3 text-muted-foreground">
                      <div className="rounded-full bg-muted/40 p-4">
                        <MapPin className="h-7 w-7 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm">Aucune position disponible</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {liveActors.map((actor, index) => {
                        const isSelected = actor.key === selectedActorKey
                        const BattIcon = getBatteryIcon(actor.batteryLevel)
                        const battColor = getBatteryColor(actor.batteryLevel)
                        return (
                          <button
                            key={actor.key}
                            type="button"
                            onClick={() => handleCardClick(actor)}
                            className={`w-full p-3 text-left transition-colors ${
                              isSelected
                                ? 'bg-primary/6 ring-1 ring-primary/20'
                                : 'hover:bg-muted/25'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(actor.key, index)}`}
                              >
                                {getActorInitial(actor)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold truncate">
                                    {actor.name || 'Non assigné'}
                                  </p>
                                  <span
                                    className={`h-2 w-2 rounded-full shrink-0 ${
                                      actor.online ? 'bg-chart-2' : 'bg-muted-foreground/40'
                                    }`}
                                  />
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                  {getActorRoleLabel(actor)}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <BattIcon className={`h-3 w-3 ${battColor}`} />
                                    <span
                                      className={`text-[11px] font-medium tabular-nums ${battColor}`}
                                    >
                                      {formatBattery(actor.batteryLevel)}
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto px-0 py-0 text-[11px] text-primary/70 hover:text-primary hover:bg-transparent gap-0.5"
                                    onClick={e => {
                                      e.stopPropagation()
                                      setSelectedActorKey(actor.key)
                                      setMode('trajet')
                                    }}
                                  >
                                    Voir trajet
                                    <ChevronRight className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                ) : routeLoading ? (
                  <div className="p-3 space-y-2">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="rounded-lg border border-border/40 bg-muted/15 p-3 animate-pulse space-y-2"
                      >
                        <div className="h-3 w-28 rounded-full bg-muted/50" />
                        <div className="h-2.5 w-20 rounded-full bg-muted/40" />
                        <div className="h-1.5 w-full rounded-full bg-muted/40" />
                      </div>
                    ))}
                  </div>
                ) : selectedActorKey ? (
                  hasRoute ? (
                    <>
                      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/40 p-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActorKey(null)
                            setTrajetPopupPos(null)
                            setSelectedStopIndex(null)
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 rounded-full px-3 py-1.5 transition-colors"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Tous les commerciaux
                        </button>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">
                              {selectedActor?.name || 'Non assigné'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">
                              {formatDistanceKm(routeStats.totalDistance)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {routeStats.stops.length} arrêt
                              {routeStats.stops.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div ref={timelineRef} className="p-3 space-y-0.5">
                        {selectedEnrichedEvents.map((event, idx) => {
                          const isNotLast = idx < selectedEnrichedEvents.length - 1
                          if (event.type === 'movement') {
                            return (
                              <div key={event._key} className="flex gap-3">
                                <div className="w-5 shrink-0 flex justify-center">
                                  <div
                                    className="bg-muted-foreground/15 min-h-6"
                                    style={{ width: 2 }}
                                  />
                                </div>
                                <div className="flex items-center py-1 min-h-6">
                                  <p className="text-[11px] text-muted-foreground/70 italic">
                                    {`En déplacement${event.durationMs > 60000 ? ` · ${formatDurationMs(event.durationMs)}` : ''}${event.distanceMeters > 100 ? ` · ${formatDistanceKm(event.distanceMeters)}` : ''}`}
                                  </p>
                                </div>
                              </div>
                            )
                          }

                          const isDeparture = event.type === 'departure'
                          const isArrival = event.type === 'arrival'
                          const isStop = event.type === 'stop'

                          return (
                            <div key={event._key} className="flex gap-3">
                              <div className="flex flex-col items-center w-5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleEventClick(event)}
                                  className={`h-5 w-5 rounded-full border-2 border-background shadow-sm flex items-center justify-center hover:scale-110 transition-transform ${
                                    isDeparture
                                      ? 'bg-chart-2'
                                      : isArrival
                                        ? 'bg-muted-foreground'
                                        : 'bg-destructive'
                                  }`}
                                >
                                  {isArrival && <Flag className="h-2.5 w-2.5 text-white" />}
                                  {isDeparture && (
                                    <Navigation2 className="h-2.5 w-2.5 text-white" />
                                  )}
                                  {isStop && <MapPin className="h-2.5 w-2.5 text-white" />}
                                </button>
                                {isNotLast && (
                                  <div
                                    className="flex-1 bg-border/50 min-h-2"
                                    style={{ width: 2 }}
                                  />
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleEventClick(event)}
                                className="flex-1 pb-2 pt-0.5 text-left hover:opacity-75 transition-opacity"
                              >
                                {isDeparture && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-chart-2 tabular-nums">
                                      {formatTime(event.time)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">Départ</span>
                                  </div>
                                )}
                                {isArrival && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground tabular-nums">
                                      {formatTime(event.time)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">Arrivée</span>
                                  </div>
                                )}
                                {isStop && (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-destructive tabular-nums">
                                        {formatTime(event.startTime)}
                                      </span>
                                      <span className="text-xs text-muted-foreground">Arrêt</span>
                                      <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-bold">
                                        {formatDurationMs(event.duration)}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/65 mt-0.5">
                                      jusqu'à {formatTime(event.endTime)}
                                    </p>
                                  </div>
                                )}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                      <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                        <Route className="h-7 w-7 text-muted-foreground/30" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Aucun déplacement enregistré
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{periodLabel}</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                    <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                      <Route className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Aucun trajet disponible
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">{periodLabel}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <aside className="flex min-h-0 w-[360px] shrink-0 flex-col border-r border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="p-3 border-b border-border/50 space-y-3">
            {!embedded && (
              <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setMode('live')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    mode === 'live'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-chart-2 ${mode === 'live' ? 'animate-pulse' : ''}`}
                  />
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => setMode('trajet')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    mode === 'trajet'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Route className="h-3.5 w-3.5" />
                  Trajet
                </button>
              </div>
            )}

            {mode === 'live' ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    Commerciaux et tablettes
                  </div>
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedActorKey(null)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        !selectedActorKey
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Tous
                    </button>
                    {liveActors.map(actor => {
                      const active = selectedActorKey === actor.key
                      return (
                        <button
                          key={actor.key}
                          type="button"
                          onClick={() => setSelectedActorKey(actor.key)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-w-[180px] truncate ${
                            active
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                          title={actor.name}
                        >
                          {actor.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs rounded-lg border border-chart-2/20 bg-chart-2/10 px-2.5 py-1.5">
                  <span className="text-muted-foreground">Vue opérateur</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-chart-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-chart-2 animate-pulse" />
                    En direct
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-border/50 bg-muted/15 p-2.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />P{'\u00e9'}riode
                  </div>
                  <div className="flex items-center gap-1.5">
                    {TRAJET_QUICK_FILTERS.map(opt => {
                      const active = periodKey === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => handlePeriodChange(opt.key)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('custom')}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        periodKey === 'custom'
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Autre date
                    </button>
                  </div>
                  {periodKey === 'custom' && (
                    <div className="space-y-1.5 pt-1">
                      <div className="grid grid-cols-[24px_1fr_92px] gap-2 items-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Du</span>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={e => setCustomFrom(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          type="time"
                          value={customFromTime}
                          onChange={e => setCustomFromTime(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="grid grid-cols-[24px_1fr_92px] gap-2 items-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Au</span>
                        <input
                          type="date"
                          value={customTo || customFrom}
                          onChange={e => setCustomTo(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          type="time"
                          value={customToTime}
                          onChange={e => setCustomToTime(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {!embedded && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      Filtre commerciaux
                    </div>
                    <div
                      className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedActorKey(null)
                          setTrajetPopupPos(null)
                          setSelectedStopIndex(null)
                        }}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          !selectedActorKey
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Tous
                      </button>
                      {(actors || []).map(actor => {
                        const active = selectedActorKey === actor.key
                        return (
                          <button
                            key={actor.key}
                            type="button"
                            onClick={() => {
                              setSelectedActorKey(actor.key)
                              setTrajetPopupPos(null)
                              setSelectedStopIndex(null)
                            }}
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-w-[180px] truncate ${
                              active
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border/60 bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                            }`}
                            title={actor.name}
                          >
                            {actor.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <span className="text-muted-foreground">{periodLabel}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {routeTotal} points
                  </span>
                </div>
                {routeLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    Chargement des trajets...
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            style={{ scrollbarWidth: 'thin' }}
          >
            {mode === 'live' ? (
              liveActors.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-3 text-muted-foreground">
                  <div className="rounded-full bg-muted/40 p-4">
                    <MapPin className="h-7 w-7 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm">Aucune position disponible</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {liveActors.map((actor, index) => {
                    const isSelected = actor.key === selectedActorKey
                    const BattIcon = getBatteryIcon(actor.batteryLevel)
                    const battColor = getBatteryColor(actor.batteryLevel)
                    return (
                      <button
                        key={actor.key}
                        type="button"
                        onClick={() => handleCardClick(actor)}
                        className={`w-full p-3 text-left transition-colors ${
                          isSelected ? 'bg-primary/6 ring-1 ring-primary/20' : 'hover:bg-muted/25'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(actor.key, index)}`}
                          >
                            {getActorInitial(actor)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate">
                                {actor.name || 'Non assigné'}
                              </p>
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  actor.online ? 'bg-chart-2' : 'bg-muted-foreground/40'
                                }`}
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {getActorRoleLabel(actor)}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <BattIcon className={`h-3 w-3 ${battColor}`} />
                                <span
                                  className={`text-[11px] font-medium tabular-nums ${battColor}`}
                                >
                                  {formatBattery(actor.batteryLevel)}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 py-0 text-[11px] text-primary/70 hover:text-primary hover:bg-transparent gap-0.5"
                                onClick={e => {
                                  e.stopPropagation()
                                  setSelectedActorKey(actor.key)
                                  setMode('trajet')
                                }}
                              >
                                Voir trajet
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            ) : routeLoading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/40 bg-muted/15 p-3 animate-pulse space-y-2"
                  >
                    <div className="h-3 w-28 rounded-full bg-muted/50" />
                    <div className="h-2.5 w-20 rounded-full bg-muted/40" />
                    <div className="h-1.5 w-full rounded-full bg-muted/40" />
                  </div>
                ))}
              </div>
            ) : selectedActorKey ? (
              hasRoute ? (
                <>
                  <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/40 p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedActorKey(null)
                        setTrajetPopupPos(null)
                        setSelectedStopIndex(null)
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 rounded-full px-3 py-1.5 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Tous les commerciaux
                    </button>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">
                          {selectedActor?.name || 'Non assigné'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatDistanceKm(routeStats.totalDistance)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {routeStats.stops.length} arrêt
                          {routeStats.stops.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div ref={timelineRef} className="p-3 space-y-0.5">
                    {selectedEnrichedEvents.map((event, idx) => {
                      const isNotLast = idx < selectedEnrichedEvents.length - 1
                      if (event.type === 'movement') {
                        return (
                          <div key={event._key} className="flex gap-3">
                            <div className="w-5 shrink-0 flex justify-center">
                              <div
                                className="bg-muted-foreground/15 min-h-6"
                                style={{ width: 2 }}
                              />
                            </div>
                            <div className="flex items-center py-1 min-h-6">
                              <p className="text-[11px] text-muted-foreground/70 italic">
                                {`En déplacement${event.durationMs > 60000 ? ` · ${formatDurationMs(event.durationMs)}` : ''}${event.distanceMeters > 100 ? ` · ${formatDistanceKm(event.distanceMeters)}` : ''}`}
                              </p>
                            </div>
                          </div>
                        )
                      }

                      const isDeparture = event.type === 'departure'
                      const isArrival = event.type === 'arrival'
                      const isStop = event.type === 'stop'

                      return (
                        <div key={event._key} className="flex gap-3">
                          <div className="flex flex-col items-center w-5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEventClick(event)}
                              className={`h-5 w-5 rounded-full border-2 border-background shadow-sm flex items-center justify-center hover:scale-110 transition-transform ${
                                isDeparture
                                  ? 'bg-chart-2'
                                  : isArrival
                                    ? 'bg-muted-foreground'
                                    : 'bg-destructive'
                              }`}
                            >
                              {isArrival && <Flag className="h-2.5 w-2.5 text-white" />}
                              {isDeparture && <Navigation2 className="h-2.5 w-2.5 text-white" />}
                              {isStop && <MapPin className="h-2.5 w-2.5 text-white" />}
                            </button>
                            {isNotLast && (
                              <div className="flex-1 bg-border/50 min-h-2" style={{ width: 2 }} />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleEventClick(event)}
                            className="flex-1 pb-2 pt-0.5 text-left hover:opacity-75 transition-opacity"
                          >
                            {isDeparture && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-chart-2 tabular-nums">
                                  {formatTime(event.time)}
                                </span>
                                <span className="text-xs text-muted-foreground">Départ</span>
                              </div>
                            )}
                            {isArrival && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground tabular-nums">
                                  {formatTime(event.time)}
                                </span>
                                <span className="text-xs text-muted-foreground">Arrivée</span>
                              </div>
                            )}
                            {isStop && (
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-destructive tabular-nums">
                                    {formatTime(event.startTime)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Arrêt</span>
                                  <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-bold">
                                    {formatDurationMs(event.duration)}
                                  </span>
                                </div>
                                <p className="text-[10px] text-muted-foreground/65 mt-0.5">
                                  jusqu'à {formatTime(event.endTime)}
                                </p>
                              </div>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                    <Route className="h-7 w-7 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Aucun déplacement enregistré
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{periodLabel}</p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                  <Route className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Aucun trajet disponible
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{periodLabel}</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="relative flex-1 min-w-0 min-h-0 bg-muted/20">
        {/* Seule porte d'entrée du panneau une fois qu'il est en tiroir. */}
        {isCompact && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPanelOpen(true)}
            className="absolute left-3 top-3 z-10 gap-1.5 shadow-md"
          >
            <PanelLeftOpen className="h-4 w-4" />
            Panneau
          </Button>
        )}
        <MapboxMap
          ref={mapRef}
          {...(viewState || defaultCenter)}
          onMove={evt => setViewState(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapStyleIndex].url}
          onLoad={handleMapLoad}
          onClick={() => {
            setTrajetPopupPos(null)
            setSelectedStopIndex(null)
          }}
        >
          <NavigationControl position="top-right" />

          <MapToolbar
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleFullscreenToggle}
            is3DTerrain={is3DTerrain}
            onToggle3DTerrain={handleToggle3DTerrain}
            is3DBuildings={is3DBuildings}
            onToggle3DBuildings={handleToggle3DBuildings}
            mapStyleLabel={MAP_STYLES[mapStyleIndex].label}
            onStyleSwitch={handleStyleSwitch}
            onCenter={handleCenterOnDevices}
          />

          {isFullscreen && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="rounded-full bg-background/80 backdrop-blur-sm border border-border/50 shadow-md px-3 py-1.5 text-[11px] text-muted-foreground">
                Appuyez sur Échap pour quitter
              </span>
            </div>
          )}

          {mode === 'trajet' &&
            hasRoute &&
            (() => {
              const geoJson = {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: routeStats.positions.map(p => [p.longitude, p.latitude]),
                },
                properties: {},
              }
              return (
                <Source id={`route-${routeSafeId}`} type="geojson" data={geoJson}>
                  <Layer
                    id={`route-shadow-${routeSafeId}`}
                    type="line"
                    paint={{ 'line-color': ROUTE_COLOR, 'line-width': 6, 'line-opacity': 0.15 }}
                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                  />
                  <Layer
                    id={`route-line-${routeSafeId}`}
                    type="line"
                    paint={{ 'line-color': ROUTE_COLOR, 'line-width': 3, 'line-opacity': 0.85 }}
                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                  />
                  <Layer
                    id={`route-arrows-${routeSafeId}`}
                    type="symbol"
                    layout={{
                      'symbol-placement': 'line',
                      'symbol-spacing': 80,
                      'text-field': '▶',
                      'text-size': 11,
                      'text-keep-upright': false,
                      'text-rotation-alignment': 'map',
                      'text-pitch-alignment': 'viewport',
                      'text-allow-overlap': true,
                    }}
                    paint={{
                      'text-color': ROUTE_COLOR,
                      'text-opacity': 0.65,
                      'text-halo-color': '#ffffff',
                      'text-halo-width': 1,
                    }}
                  />
                </Source>
              )
            })()}

          {mode === 'trajet' &&
            hasRoute &&
            (() => {
              const firstPos = routeStats.positions[0]
              const lastPos = routeStats.positions[routeStats.positions.length - 1]
              return (
                <React.Fragment key={`endpts-${routeSafeId}`}>
                  <Marker
                    latitude={firstPos.latitude}
                    longitude={firstPos.longitude}
                    anchor="center"
                  >
                    <div className="relative flex flex-col items-center">
                      <div className="h-5 w-5 rounded-full bg-chart-2 border-2 border-white shadow-md flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-white" />
                      </div>
                      <span className="mt-0.5 text-[9px] font-bold text-chart-2 bg-white/90 rounded px-1 shadow-sm whitespace-nowrap">
                        Départ
                      </span>
                    </div>
                  </Marker>
                  <Marker latitude={lastPos.latitude} longitude={lastPos.longitude} anchor="center">
                    <div className="relative flex flex-col items-center">
                      <div className="h-5 w-5 rounded-full bg-destructive border-2 border-white shadow-md flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-white" />
                      </div>
                      <span className="mt-0.5 text-[9px] font-bold text-destructive bg-white/90 rounded px-1 shadow-sm whitespace-nowrap">
                        Arrivée
                      </span>
                    </div>
                  </Marker>
                </React.Fragment>
              )
            })()}

          {mode === 'trajet' &&
            hasRoute &&
            routeStats.positions.map((pos, index) => {
              const isFirst = index === 0
              const isLast = index === routeStats.positions.length - 1
              if (isFirst || isLast) return null
              const isFocused = focusedIndex === index
              const progress = index / (routeStats.positions.length - 1)
              const opacity = 0.3 + progress * 0.7
              return (
                <Marker
                  key={pos.id ?? `pos-${index}`}
                  latitude={pos.latitude}
                  longitude={pos.longitude}
                  anchor="center"
                  onClick={evt => {
                    evt.originalEvent.stopPropagation()
                    setTrajetPopupPos(pos)
                    setFocusedIndex(index)
                    setSelectedStopIndex(null)
                  }}
                >
                  <button
                    type="button"
                    className="focus:outline-none"
                    onClick={evt => {
                      evt.stopPropagation()
                      setTrajetPopupPos(pos)
                      setFocusedIndex(index)
                      setSelectedStopIndex(null)
                    }}
                  >
                    <div
                      className="rounded-full border border-white shadow-sm transition-transform hover:scale-150"
                      style={{
                        width: isFocused ? 10 : 7,
                        height: isFocused ? 10 : 7,
                        backgroundColor: `rgba(99,102,241,${opacity})`,
                      }}
                    />
                  </button>
                </Marker>
              )
            })}

          {mode === 'trajet' &&
            hasRoute &&
            selectedStopEvents.map((stop, idx) => (
              <Marker
                key={stop.startTime || `stop-${idx}`}
                latitude={stop.latitude}
                longitude={stop.longitude}
                anchor="center"
                onClick={evt => {
                  evt.originalEvent.stopPropagation()
                  setSelectedStopIndex(idx)
                  setTrajetPopupPos(null)
                  setFocusedIndex(null)
                }}
              >
                <button
                  type="button"
                  className="focus:outline-none group"
                  onClick={evt => {
                    evt.stopPropagation()
                    setSelectedStopIndex(idx)
                    setTrajetPopupPos(null)
                    setFocusedIndex(null)
                  }}
                >
                  <div className="h-4 w-4 rounded-full bg-chart-5 border-2 border-white shadow-md group-hover:scale-125 transition-transform" />
                </button>
              </Marker>
            ))}

          {mode === 'live' &&
            liveActors.map(actor => {
              const isOnline = actor.online
              const isSelected = actor.key === selectedActorKey
              return (
                <Marker
                  key={actor.key}
                  latitude={Number(actor.latitude)}
                  longitude={Number(actor.longitude)}
                  anchor="center"
                  onClick={evt => {
                    evt.originalEvent.stopPropagation()
                    setSelectedActorKey(actor.key)
                  }}
                >
                  <button
                    type="button"
                    className="relative cursor-pointer focus:outline-none"
                    onClick={evt => {
                      evt.stopPropagation()
                      setSelectedActorKey(actor.key)
                    }}
                  >
                    {isOnline && (
                      <span
                        className="absolute inset-0 rounded-full bg-chart-2/40 animate-ping"
                        style={{ animationDuration: '2s' }}
                      />
                    )}
                    <div
                      className={`relative rounded-full border-2 border-white shadow-lg transition-transform ${
                        isSelected ? 'scale-125' : 'hover:scale-110'
                      } ${isOnline ? 'bg-chart-2 h-5 w-5' : 'bg-muted-foreground/50 h-4 w-4'}`}
                    />
                  </button>
                </Marker>
              )
            })}

          {mode === 'live' && selectedLiveActor && (
            <Popup
              latitude={Number(selectedLiveActor.latitude)}
              longitude={Number(selectedLiveActor.longitude)}
              anchor="top"
              offset={18}
              onClose={() => setSelectedActorKey(null)}
              closeButton={false}
              maxWidth="270px"
            >
              <div className="relative w-[236px]">
                {/* Bouton fermer custom (le × natif Mapbox est peu soigné) */}
                <button
                  type="button"
                  onClick={() => setSelectedActorKey(null)}
                  aria-label="Fermer"
                  className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
                {/* En-tête : avatar (initiales, coloré par rôle) + nom/rôle + statut */}
                <div className="flex items-center gap-2.5 p-3 pb-2.5 pr-9 border-b border-border/60">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getActorRoleAvatarColor(selectedLiveActor)}`}
                  >
                    {getActorNameInitials(selectedLiveActor)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate leading-tight">
                      {selectedLiveActor.name || 'Non assigné'}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-tight min-w-0">
                      <span className="text-muted-foreground truncate">
                        {getActorRoleLabel(selectedLiveActor)}
                      </span>
                      <span className="text-muted-foreground/40 shrink-0">·</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            selectedLiveActor.online ? 'bg-chart-2' : 'bg-muted-foreground/40'
                          }`}
                        />
                        <span
                          className={`font-medium ${
                            selectedLiveActor.online ? 'text-chart-2' : 'text-muted-foreground'
                          }`}
                        >
                          {selectedLiveActor.online ? 'En ligne' : 'Hors ligne'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Corps : batterie, précision GPS, dernière position */}
                <div className="p-3 space-y-2">
                  {(() => {
                    const BattIcon = getBatteryIcon(selectedLiveActor.batteryLevel)
                    const battColor = getBatteryColor(selectedLiveActor.batteryLevel)
                    const isCharging =
                      Boolean(selectedLiveActor.batteryCharging) &&
                      isBatteryKnown(selectedLiveActor.batteryLevel)
                    return (
                      <div className="flex items-center gap-2">
                        <BattIcon className={`h-3.5 w-3.5 shrink-0 ${battColor}`} />
                        <span className="text-[11px] text-muted-foreground w-[78px] shrink-0">
                          Batterie
                        </span>
                        <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                          <div className="flex-1 max-w-[64px] bg-muted/50 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${clampBattery(selectedLiveActor.batteryLevel)}%`,
                                backgroundColor: isBatteryKnown(selectedLiveActor.batteryLevel)
                                  ? getBatteryHexColor(selectedLiveActor.batteryLevel)
                                  : 'transparent',
                              }}
                            />
                          </div>
                          {isCharging && (
                            <Zap className="h-3 w-3 text-chart-5 shrink-0" fill="currentColor" />
                          )}
                          <span className="text-[11px] font-medium tabular-nums shrink-0">
                            {formatBattery(selectedLiveActor.batteryLevel)}
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {selectedLiveActor.accuracy != null &&
                    Number.isFinite(Number(selectedLiveActor.accuracy)) && (
                      <div className="flex items-center gap-2">
                        <Crosshair className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground w-[78px] shrink-0">
                          Précision
                        </span>
                        <span className="text-[11px] font-medium ml-auto">
                          ± {Math.round(Number(selectedLiveActor.accuracy))} m
                        </span>
                      </div>
                    )}

                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground w-[78px] shrink-0">
                      Dernière vue
                    </span>
                    <span className="text-[11px] font-medium ml-auto">
                      {formatRelativeTime(selectedLiveActor.lastSeen)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 p-3 pt-2 border-t border-border/60">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 px-2 text-[11px]"
                    onClick={() => {
                      setSelectedActorKey(selectedLiveActor.key)
                      setMode('trajet')
                    }}
                  >
                    <Route className="h-3 w-3" />
                    Trajet
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-7 px-2 text-[11px]"
                    onClick={() =>
                      navigate(
                        selectedLiveActor.userType === 'MANAGER'
                          ? `/managers/${selectedLiveActor.userId}`
                          : `/commerciaux/${selectedLiveActor.userId}`
                      )
                    }
                  >
                    Voir le détail
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Popup>
          )}

          {mode === 'trajet' && trajetPopupPos && (
            <Popup
              latitude={trajetPopupPos.latitude}
              longitude={trajetPopupPos.longitude}
              anchor="top"
              onClose={() => setTrajetPopupPos(null)}
              closeButton
              maxWidth="200px"
            >
              <div className="p-3 space-y-2 min-w-[160px]">
                <p className="text-xs font-semibold">{selectedActor?.name || 'Non assigné'}</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold">
                    {new Date(trajetPopupPos.recordedAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                {isBatteryKnown(trajetPopupPos.batteryLevel) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">Batterie</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${clampBattery(trajetPopupPos.batteryLevel)}%`,
                            backgroundColor: getBatteryHexColor(trajetPopupPos.batteryLevel),
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-medium tabular-nums">
                        {formatBattery(trajetPopupPos.batteryLevel)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Popup>
          )}

          {mode === 'trajet' &&
            selectedStopIndex !== null &&
            selectedStopEvents[selectedStopIndex] && (
              <Popup
                latitude={selectedStopEvents[selectedStopIndex].latitude}
                longitude={selectedStopEvents[selectedStopIndex].longitude}
                anchor="top"
                onClose={() => setSelectedStopIndex(null)}
                closeButton
                maxWidth="200px"
              >
                <div className="p-3 space-y-2 min-w-[160px]">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-chart-5 shrink-0" />
                    <p className="text-xs font-semibold">
                      Arrêt · {formatDurationMs(selectedStopEvents[selectedStopIndex].duration)}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatTime(selectedStopEvents[selectedStopIndex].startTime)}
                    {' — '}
                    {formatTime(selectedStopEvents[selectedStopIndex].endTime)}
                  </p>
                </div>
              </Popup>
            )}
        </MapboxMap>
      </div>
    </div>
  )
}
