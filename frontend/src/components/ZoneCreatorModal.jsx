import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Map, { Source, Layer, NavigationControl, useControl } from 'react-map-gl/mapbox'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import mapboxgl from 'mapbox-gl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { MapSkeleton } from '@/components/LoadingSkeletons'
import { X, Check, MousePointerClick, RotateCcw, Undo2, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ThreeDButton,
  MapStyleButton,
  ZonesToggleButton,
  DrawButton,
  UndoPointButton,
  ClearDrawButton,
} from './MapControls'
import {
  createGeoJSONCircle,
  zoneToGeoJSON,
  polygonAreaKm2,
  isPolygonTooSmall,
  hasSelfIntersection,
  overlapsExistingZones,
  getZoneColor,
} from '@/pages-ADMIN-DIRECTEUR/zones/zones-utils'

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

// Couleurs du tracé actif (retour visuel live).
const DRAW_STROKE = '#2563eb' // Bleu franc, cohérent avec le thème "primary"
const DRAW_FILL = '#3b82f6'
const START_VERTEX = '#10b981' // Vert : point de départ = "cliquez ici pour fermer"

/**
 * Styles de dessin custom pour mapbox-gl-draw (remplacent l'orange par défaut).
 * Le point de départ (coord_path 0.0) est mis en évidence pour guider la fermeture.
 */
const DRAW_STYLES = [
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon']],
    paint: { 'fill-color': DRAW_FILL, 'fill-opacity': 0.12 },
  },
  {
    id: 'gl-draw-lines',
    type: 'line',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DRAW_STROKE, 'line-width': 2.5 },
  },
  {
    id: 'gl-draw-polygon-midpoint',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'midpoint']],
    paint: { 'circle-radius': 3, 'circle-color': DRAW_STROKE, 'circle-opacity': 0.6 },
  },
  {
    id: 'gl-draw-vertex-halo',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
    paint: { 'circle-radius': 6, 'circle-color': '#ffffff' },
  },
  {
    id: 'gl-draw-vertex',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
    paint: { 'circle-radius': 4, 'circle-color': DRAW_STROKE },
  },
  // Point de départ mis en évidence (dessiné par-dessus les autres sommets)
  {
    id: 'gl-draw-vertex-start-halo',
    type: 'circle',
    filter: [
      'all',
      ['==', 'meta', 'vertex'],
      ['==', 'coord_path', '0.0'],
      ['==', '$type', 'Point'],
    ],
    paint: { 'circle-radius': 9, 'circle-color': '#ffffff' },
  },
  {
    id: 'gl-draw-vertex-start',
    type: 'circle',
    filter: [
      'all',
      ['==', 'meta', 'vertex'],
      ['==', 'coord_path', '0.0'],
      ['==', '$type', 'Point'],
    ],
    paint: { 'circle-radius': 6, 'circle-color': START_VERTEX },
  },
]

/**
 * Mode de dessin de polygone étendant `draw_polygon` avec annulation du dernier
 * sommet (Ctrl/Cmd+Z ou Backspace), sans quitter le mode dessin.
 * `onSetup` reçoit `registerUndo` pour exposer l'action à un bouton externe.
 */
const DrawPolygonUndo = { ...MapboxDraw.modes.draw_polygon }

const removeLastVertex = state => {
  // Le dernier sommet de l'anneau suit le curseur ; les sommets validés sont
  // aux positions 0..currentVertexPosition-1.
  if (state.currentVertexPosition > 0) {
    state.polygon.removeCoordinate(`0.${state.currentVertexPosition - 1}`)
    state.currentVertexPosition -= 1
  }
}

DrawPolygonUndo.onSetup = function (opts) {
  const state = MapboxDraw.modes.draw_polygon.onSetup.call(this, opts)
  if (opts && typeof opts.registerUndo === 'function') {
    opts.registerUndo(() => removeLastVertex(state))
  }
  return state
}

DrawPolygonUndo.onKeyUp = function (state, e) {
  const isUndo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.keyCode === 90)
  const isBackspace = e.key === 'Backspace' || e.keyCode === 8
  if (isUndo || isBackspace) {
    if (e.preventDefault) e.preventDefault()
    removeLastVertex(state)
    return
  }
  if (MapboxDraw.modes.draw_polygon.onKeyUp) {
    MapboxDraw.modes.draw_polygon.onKeyUp.call(this, state, e)
  }
}

// Geocoder Control Component
const GeocoderControl = React.memo(({ onResult, position }) => {
  useControl(
    () => {
      const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        marker: false,
        countries: 'fr', // France
        language: 'fr',
        placeholder: 'Rechercher une adresse…',
      })
      geocoder.on('result', onResult)
      return geocoder
    },
    { position }
  )
  return null
})

/**
 * Contrôle de dessin de polygone (mapbox-gl-draw) intégré à react-map-gl.
 * - Sans géométrie initiale : démarre directement en mode dessin de polygone.
 * - Avec géométrie initiale (édition) : précharge l'anneau et laisse l'édition des sommets.
 * Les callbacks sont lus via une ref pour rester à jour sans re-binder les listeners.
 * `apiRef` expose { startDraw, undoLast, clear } aux boutons du panneau.
 */
const DrawControl = React.memo(
  ({ position, initialPolygon, onChange, onDraftChange, onModeChange, apiRef }) => {
    const drawRef = useRef(null)
    const undoFnRef = useRef(null)
    const handlersRef = useRef({})
    const cbRef = useRef({})
    cbRef.current = { onChange, onDraftChange, onModeChange }

    useControl(
      () => {
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: {},
          styles: DRAW_STYLES,
          modes: { ...MapboxDraw.modes, draw_polygon_undo: DrawPolygonUndo },
          defaultMode: 'simple_select',
        })
        return drawRef.current
      },
      ({ map }) => {
        const registerUndo = fn => {
          undoFnRef.current = fn
        }

        // Anneau fermé du polygone validé (ou null) → formulaire + validation
        const emitCommitted = () => {
          const data = drawRef.current?.getAll()
          const feature = data?.features?.[data.features.length - 1]
          const ring =
            feature?.geometry?.type === 'Polygon' ? feature.geometry.coordinates[0] : null
          cbRef.current.onChange?.(ring && ring.length >= 4 ? ring : null)
        }

        // Aperçu live pendant le tracé (sommets + superficie provisoire)
        const emitDraft = () => {
          if (!cbRef.current.onDraftChange) return
          if (drawRef.current?.getMode() !== 'draw_polygon_undo') {
            cbRef.current.onDraftChange(null)
            return
          }
          const data = drawRef.current.getAll()
          const feature = data?.features?.[data.features.length - 1]
          const ring =
            feature?.geometry?.type === 'Polygon' ? feature.geometry.coordinates[0] : null
          if (!ring) {
            cbRef.current.onDraftChange({ vertices: 0, areaKm2: 0 })
            return
          }
          // Le dernier point suit le curseur : on l'exclut du décompte validé.
          const committed = ring.slice(0, -1)
          const vertices = committed.length
          const areaKm2 = vertices >= 3 ? polygonAreaKm2([...committed, committed[0]]) : 0
          cbRef.current.onDraftChange({ vertices, areaKm2 })
        }

        const startDraw = () => {
          drawRef.current.deleteAll()
          undoFnRef.current = null
          cbRef.current.onChange?.(null)
          drawRef.current.changeMode('draw_polygon_undo', { registerUndo })
        }

        const clearAll = () => {
          drawRef.current.deleteAll()
          undoFnRef.current = null
          cbRef.current.onChange?.(null)
          cbRef.current.onDraftChange?.(null)
          drawRef.current.changeMode('draw_polygon_undo', { registerUndo })
        }

        // N'autoriser qu'un seul polygone : supprimer les anciens à la création
        const onCreate = e => {
          const data = drawRef.current.getAll()
          if (data.features.length > 1) {
            const keepId = e.features[e.features.length - 1].id
            data.features.filter(f => f.id !== keepId).forEach(f => drawRef.current.delete(f.id))
          }
          emitCommitted()
        }
        const onModeChangeEvt = e => cbRef.current.onModeChange?.(e.mode)

        handlersRef.current = { onCreate, emitCommitted, emitDraft, onModeChangeEvt }
        map.on('draw.create', onCreate)
        map.on('draw.update', emitCommitted)
        map.on('draw.delete', emitCommitted)
        map.on('draw.render', emitDraft)
        map.on('draw.modechange', onModeChangeEvt)

        apiRef.current = {
          startDraw,
          undoLast: () => undoFnRef.current?.(),
          clear: clearAll,
        }

        if (initialPolygon && initialPolygon.length) {
          // Édition : précharger l'anneau existant, rester en sélection simple.
          drawRef.current.add({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [initialPolygon] },
          })
          emitCommitted()
          cbRef.current.onModeChange?.('simple_select')
        } else {
          // Création : démarrer le tracé directement (avec undo enregistré).
          startDraw()
        }
      },
      ({ map }) => {
        const h = handlersRef.current
        if (h.onCreate) map.off('draw.create', h.onCreate)
        if (h.emitCommitted) {
          map.off('draw.update', h.emitCommitted)
          map.off('draw.delete', h.emitCommitted)
        }
        if (h.emitDraft) map.off('draw.render', h.emitDraft)
        if (h.onModeChangeEvt) map.off('draw.modechange', h.onModeChangeEvt)
      },
      { position }
    )
    return null
  }
)

export const ZoneCreatorModal = ({
  onValidate,
  onClose,
  existingZones = [],
  zoneToEdit = null,
  userRole,
  assignableUsers = [],
  isSubmitting = false,
}) => {
  const isEditMode = !!zoneToEdit
  const mapRef = useRef(null)
  const drawApiRef = useRef(null)

  // Géométrie initiale à précharger dans l'éditeur (édition uniquement).
  // Zone polygone : on reprend son anneau. Ancienne zone cercle : on la convertit
  // en polygone (aide visuelle), la sauvegarde deviendra un vrai polygon.
  const initialPolygon = useMemo(() => {
    if (!isEditMode || !zoneToEdit) return null
    if (Array.isArray(zoneToEdit.polygon) && zoneToEdit.polygon.length > 0) {
      return zoneToEdit.polygon
    }
    if (zoneToEdit.xOrigin != null && zoneToEdit.yOrigin != null && zoneToEdit.rayon != null) {
      return createGeoJSONCircle([zoneToEdit.xOrigin, zoneToEdit.yOrigin], zoneToEdit.rayon)
        .geometry.coordinates[0]
    }
    return null
  }, [isEditMode, zoneToEdit])

  // Anneau fermé [[lng,lat],...] du polygone validé, ou null tant qu'aucun tracé
  const [polygon, setPolygon] = useState(initialPolygon)
  // Aperçu live pendant le tracé { vertices, areaKm2 } ou null hors dessin
  const [draft, setDraft] = useState(null)
  // Mode de dessin en cours (true pendant le tracé actif)
  const [isDrawing, setIsDrawing] = useState(!isEditMode)
  const [zoneName, setZoneName] = useState(isEditMode ? zoneToEdit?.nom || '' : '')
  const [assignedUserIds, setAssignedUserIds] = useState(
    isEditMode && zoneToEdit?.assignedUserIds
      ? zoneToEdit.assignedUserIds
      : isEditMode && zoneToEdit?.assignedUserId
        ? [zoneToEdit.assignedUserId]
        : []
  )
  const [show3D, setShow3D] = useState(false)
  const [isSatellite, setIsSatellite] = useState(false)
  // Default to FALSE for existing zones
  const [showExistingZones, setShowExistingZones] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)

  // Map view state - Focus sur l'Île-de-France
  const initialMapViewState =
    isEditMode && zoneToEdit?.xOrigin && zoneToEdit?.yOrigin
      ? {
          longitude: zoneToEdit.xOrigin,
          latitude: zoneToEdit.yOrigin,
          zoom: 12,
        }
      : {
          longitude: 2.3522, // Paris center
          latitude: 48.8566,
          zoom: 10, // Zoom pour voir l'Île-de-France
        }

  // Effect for 3D mode
  useEffect(() => {
    if (mapRef.current) {
      if (show3D) {
        mapRef.current.easeTo({ pitch: 60, bearing: -17.6, duration: 1500, essential: true })
      } else {
        mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 1000, essential: true })
      }
    }
  }, [show3D])

  // Réception de l'anneau validé depuis le contrôle de dessin
  const handlePolygonChange = useCallback(ring => {
    setPolygon(ring)
    if (ring && ring.length >= 4) setDraft(null)
  }, [])

  // Aperçu live : on évite le churn en ignorant les valeurs inchangées
  const handleDraftChange = useCallback(next => {
    setDraft(prev => {
      if (next === null) return prev === null ? prev : null
      if (prev && prev.vertices === next.vertices && Math.abs(prev.areaKm2 - next.areaKm2) < 1e-6) {
        return prev
      }
      return next
    })
  }, [])

  const handleModeChange = useCallback(mode => {
    setIsDrawing(mode === 'draw_polygon_undo')
  }, [])

  // Efface uniquement le tracé (repart en mode dessin), sans toucher au formulaire.
  const handleClearDrawing = () => {
    drawApiRef.current?.clear()
    setPolygon(null)
    setDraft(null)
  }

  // Réinitialisation complète : tracé + nom + assignations.
  const handleReset = () => {
    handleClearDrawing()
    setZoneName('')
    setAssignedUserIds([])
  }

  const handleValidate = () => {
    if (!isFormValid) return

    const zoneData = {
      nom: zoneName,
      polygon, // anneau fermé [[lng,lat],...] ; le backend dérive xOrigin/yOrigin/rayon
    }

    if (isEditMode && zoneToEdit?.id) {
      zoneData.id = zoneToEdit.id
    }

    onValidate(zoneData, assignedUserIds)
  }

  const handleGeocoderResult = e => {
    const { result } = e
    if (result && result.center) {
      mapRef.current?.flyTo({ center: result.center, zoom: 14 })
    }
  }

  // Un anneau valide comporte au moins 3 sommets distincts + le point de fermeture
  const hasValidPolygon = Array.isArray(polygon) && polygon.length >= 4

  // Validation géométrique du tracé validé
  const validation = useMemo(() => {
    if (!hasValidPolygon) {
      return { tooSmall: false, selfIntersecting: false, overlaps: [] }
    }
    return {
      tooSmall: isPolygonTooSmall(polygon),
      selfIntersecting: hasSelfIntersection(polygon),
      overlaps: overlapsExistingZones(polygon, existingZones, zoneToEdit?.id),
    }
  }, [hasValidPolygon, polygon, existingZones, zoneToEdit?.id])

  const hasBlockingError = validation.tooSmall || validation.selfIntersecting

  const isFormValid =
    hasValidPolygon &&
    !hasBlockingError &&
    zoneName &&
    (userRole === 'directeur' || userRole === 'manager' || userRole === 'admin'
      ? assignedUserIds.length > 0
      : true)

  const polygonArea = hasValidPolygon ? polygonAreaKm2(polygon) : 0

  // Décompte / superficie affichés (live pendant le tracé, sinon polygone validé)
  const displayVertices = isDrawing
    ? (draft?.vertices ?? 0)
    : hasValidPolygon
      ? polygon.length - 1
      : 0
  const displayArea = isDrawing ? (draft?.areaKm2 ?? 0) : polygonArea
  const showLiveStats = (isDrawing && displayVertices > 0) || hasValidPolygon

  const canUndo = isDrawing && (draft?.vertices ?? 0) > 0
  const canClear = canUndo || hasValidPolygon

  const step = hasValidPolygon || isEditMode ? 2 : 1

  return (
    <div className="fixed inset-0 z-[100] flex flex-col animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm" />

      {/* Main Container */}
      <div className="relative flex-1 w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-black/5 bg-background">
          {mapLoading && (
            <div className="absolute inset-0 z-20 bg-background/50 backdrop-blur-sm">
              <MapSkeleton />
            </div>
          )}

          <Map
            ref={mapRef}
            initialViewState={initialMapViewState}
            style={{ height: '100%', width: '100%' }}
            // Toggle between Standard Streets (colorful) and Satellite Streets
            mapStyle={
              isSatellite
                ? 'mapbox://styles/mapbox/satellite-streets-v12'
                : 'mapbox://styles/mapbox/streets-v12'
            }
            onLoad={() => setMapLoading(false)}
            onError={() => setMapLoading(false)}
            attributionControl={false} // Clean look
            logoPosition="bottom-right"
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <GeocoderControl onResult={handleGeocoderResult} position="top-left" />

            {/* Contrôle de dessin du polygone de la zone */}
            <DrawControl
              position="top-left"
              initialPolygon={initialPolygon}
              onChange={handlePolygonChange}
              onDraftChange={handleDraftChange}
              onModeChange={handleModeChange}
              apiRef={drawApiRef}
            />

            {/* Outils de dessin (haut-gauche, sous la recherche) */}
            <DrawButton
              onClick={() => drawApiRef.current?.startDraw()}
              hasPolygon={hasValidPolygon}
            />
            <UndoPointButton onClick={() => drawApiRef.current?.undoLast()} disabled={!canUndo} />
            <ClearDrawButton onClick={handleClearDrawing} disabled={!canClear} />

            {/* Options de carte (bas-gauche) */}
            <ThreeDButton onClick={() => setShow3D(!show3D)} show3D={show3D} />
            <MapStyleButton
              onClick={() => setIsSatellite(!isSatellite)}
              isSatellite={isSatellite}
            />
            <ZonesToggleButton
              onClick={() => setShowExistingZones(!showExistingZones)}
              showZones={showExistingZones}
            />

            {/* 3D Buildings Layer */}
            {show3D && (
              <Layer
                id="3d-buildings"
                source="composite"
                source-layer="building"
                filter={['==', 'extrude', 'true']}
                type="fill-extrusion"
                minzoom={14}
                paint={{
                  'fill-extrusion-color': '#e5e5e5',
                  'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'height'],
                  ],
                  'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.05,
                    ['get', 'min_height'],
                  ],
                  'fill-extrusion-opacity': 0.8,
                }}
              />
            )}

            {/* Display existing zones - CONDITIONAL RENDERING (modèle mixte polygone/cercle) */}
            {showExistingZones &&
              existingZones
                .filter(z => z.id !== zoneToEdit?.id)
                .map(zone => {
                  const geojson = zoneToGeoJSON(zone)
                  if (!geojson) return null
                  const color = getZoneColor(zone.id)
                  return (
                    <Source
                      key={`existing-${zone.id}`}
                      id={`existing-${zone.id}`}
                      type="geojson"
                      data={geojson}
                    >
                      <Layer
                        key={`fill-existing-${zone.id}`}
                        id={`fill-existing-${zone.id}`}
                        type="fill"
                        paint={{
                          'fill-color': color,
                          'fill-opacity': isSatellite ? 0.25 : 0.1, // Increased opacity in satellite mode
                        }}
                      />
                      <Layer
                        key={`line-existing-${zone.id}`}
                        id={`line-existing-${zone.id}`}
                        type="line"
                        paint={{
                          'line-color': isSatellite ? '#ffffff' : color, // Use white lines in satellite for contrast, or stick to color
                          'line-width': 1.5,
                          'line-dasharray': [2, 2],
                          'line-opacity': 0.8,
                        }}
                      />
                    </Source>
                  )
                })}

            {/* La zone en cours de tracé/édition est rendue par le contrôle de dessin */}
          </Map>

          {/* Premium Glassmorphic Control Panel */}
          <div className="absolute top-4 right-4 w-[440px] max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] z-20 pointer-events-none">
            <div className="pointer-events-auto flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden bg-card/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl animate-in slide-in-from-right-10 duration-500">
              <div className="flex justify-between items-start gap-3 p-6 pb-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {isEditMode ? 'Modifier la Zone' : 'Nouvelle Zone'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step === 1 && 'Dessinez le contour de la zone'}
                    {step === 2 && 'Configurez les détails et assignations'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-full hover:bg-destructive/10 hover:text-destructive -mr-2 -mt-2 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-y-auto px-6 pb-6 space-y-5">
                {/* Progress Indicator */}
                {!isEditMode && (
                  <div className="flex gap-2">
                    {[1, 2].map(s => (
                      <div
                        key={s}
                        className={cn(
                          'h-1.5 flex-1 rounded-full transition-all duration-300',
                          step >= s ? 'bg-primary' : 'bg-primary/20'
                        )}
                      />
                    ))}
                  </div>
                )}

                {/* Step 1 Info : tracé du polygone */}
                {step < 2 && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-full shrink-0">
                      <MousePointerClick className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-foreground">Tracez la zone</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                        Cliquez sur la carte pour poser les sommets. Pour terminer le dessin,
                        appuyez sur{' '}
                        <kbd className="px-1 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">
                          Entrée
                        </kbd>{' '}
                        , cliquez sur le
                        <span className="font-medium text-emerald-600">
                          {' '}
                          point de départ (vert)
                        </span>{' '}
                        ou double-cliquez.
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Undo2 className="h-3.5 w-3.5" />
                        <span>
                          <kbd className="px-1 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">
                            Ctrl
                          </kbd>
                          +
                          <kbd className="px-1 py-0.5 rounded bg-muted border border-border/60 font-mono text-[10px]">
                            Z
                          </kbd>{' '}
                          annule le dernier point.
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Data Display : superficie */}
                {showLiveStats && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Superficie
                    </span>
                    <div className="font-mono text-sm bg-muted/50 p-2 rounded-lg border border-border/50">
                      {displayArea.toFixed(2)} km²
                    </div>
                  </div>
                )}

                {/* Validation : erreurs bloquantes + avertissements */}
                {validation.tooSmall && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Zone trop petite. Agrandissez le contour pour créer une zone exploitable.
                    </span>
                  </div>
                )}
                {validation.selfIntersecting && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Le contour se croise lui-même. Reprenez le tracé sans le faire se recouper.
                    </span>
                  </div>
                )}
                {!hasBlockingError && validation.overlaps.length > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Chevauche {validation.overlaps.length} zone
                      {validation.overlaps.length > 1 ? 's' : ''} existante
                      {validation.overlaps.length > 1 ? 's' : ''}
                      {validation.overlaps.length <= 3
                        ? ` (${validation.overlaps
                            .map(z => z.nom)
                            .filter(Boolean)
                            .join(', ')})`
                        : ''}
                      . Vous pouvez tout de même enregistrer.
                    </span>
                  </div>
                )}

                {/* Form Fields (étape 2) */}
                {(step >= 2 || isEditMode) && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="space-y-2">
                      <Label htmlFor="zone-name" className="text-sm font-medium">
                        Nom de la zone
                      </Label>
                      <Input
                        id="zone-name"
                        value={zoneName}
                        onChange={e => setZoneName(e.target.value)}
                        placeholder="Ex: Paris Centre - Secteur 1"
                        className="bg-background/50 border-input/50 focus:bg-background transition-colors"
                      />
                    </div>

                    {(userRole === 'admin' ||
                      userRole === 'directeur' ||
                      userRole === 'manager') && (
                      <div className="space-y-2">
                        <Label htmlFor="assigned-users" className="text-sm font-medium">
                          {userRole === 'admin' ? 'Responsables assignés' : 'Membres assignés'}
                        </Label>
                        <MultiSelect
                          id="assigned-users"
                          options={assignableUsers.map(user => ({
                            value: `${user.role}-${user.id}`,
                            label: `${user.name} (${user.role})`,
                            group: user.role === 'manager' ? 'Managers' : 'Commerciaux',
                          }))}
                          selected={assignedUserIds}
                          onChange={setAssignedUserIds}
                          placeholder="Sélectionner des membres..."
                          emptyText="Aucun membre disponible"
                          className="bg-background/50 border-input/50"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                  {(hasValidPolygon || isDrawing) && (
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  )}

                  <div className="flex-1 flex justify-end gap-3">
                    <Button onClick={onClose} variant="ghost" disabled={isSubmitting}>
                      Annuler
                    </Button>
                    <Button
                      onClick={handleValidate}
                      disabled={!isFormValid || isSubmitting}
                      className={cn(
                        'transition-all duration-300',
                        isFormValid
                          ? 'bg-primary shadow-lg shadow-primary/25 hover:shadow-primary/40'
                          : ''
                      )}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                          Sauvegarde...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          {isEditMode ? 'Enregistrer' : 'Créer'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZoneCreatorModal
