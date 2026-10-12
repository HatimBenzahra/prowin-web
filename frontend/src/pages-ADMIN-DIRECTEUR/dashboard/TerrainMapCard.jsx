import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import MapboxMap, { Marker, Layer, Source } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Card } from '@/components/ui/card'
import { MapPin, Flag } from 'lucide-react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN

const IDF_CENTER = { longitude: 2.35, latitude: 48.85, zoom: 10 }

/** Carte pleine card : aucun header, aucun padding, seules les bordures restent visibles. */
const CARD_SHELL = 'p-0 gap-0 overflow-hidden h-[320px] lg:h-[440px]'

function boundsOf(coordinates) {
  const [first] = coordinates
  return coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(first, first))
}

function ActorMarker({ color, initial, dimmed, selected }) {
  return (
    <div
      className={`flex flex-col items-center transition-transform duration-300 ${
        dimmed ? 'opacity-50' : ''
      }`}
      style={{ transform: selected ? 'scale(1.25)' : 'scale(1)' }}
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg"
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
      <div
        className="-mt-0.5 h-2 w-2 rounded-full border border-white"
        style={{ backgroundColor: color }}
      />
    </div>
  )
}

/** L'anneau extérieur d'une zone, ou une liste vide si sa géométrie est inexploitable. */
function zoneRing(zone) {
  return zone?.geoJson?.geometry?.coordinates?.[0] ?? []
}

function actorPoints(actors) {
  return (actors || []).map(actor => [actor.longitude, actor.latitude])
}

export default function TerrainMapCard({
  located,
  selectedKey,
  selectedActor,
  selectActor,
  route,
  colorFor,
  zones,
  focusedZone,
  zoneOfSelectedActor,
  actorsOfFocusedZone,
}) {
  const mapRef = useRef(null)
  const cameraTargetRef = useRef(null)

  const routeColor = colorFor(selectedActor?.userId)

  /**
   * Une géométrie par zone, pas par assignation : deux commerciaux affectés à la
   * même zone produiraient deux polygones superposés, dont les remplissages se
   * cumuleraient — la zone partagée paraîtrait plus foncée, donc mise en avant,
   * alors qu'elle ne l'est pas.
   */
  const drawableZones = useMemo(() => {
    const byZoneId = new Map()
    for (const zone of zones || []) {
      if (zone.geoJson && !byZoneId.has(zone.zoneId)) byZoneId.set(zone.zoneId, zone)
    }
    return Array.from(byZoneId.values())
  }, [zones])

  /**
   * On cadre toujours les deux couches ensemble, jamais l'une sans l'autre :
   * - sans sélection : toutes les zones et tous les acteurs localisés ;
   * - commercial sélectionné : son trajet (ou sa position) avec sa zone assignée ;
   * - zone sélectionnée : la zone avec les acteurs qui y sont affectés.
   */
  const cameraTarget = useMemo(() => {
    if (selectedActor) {
      const actorCoords = route.geoJson
        ? route.geoJson.geometry.coordinates
        : selectedActor.hasPosition
          ? [[selectedActor.longitude, selectedActor.latitude]]
          : []
      return [...actorCoords, ...zoneRing(zoneOfSelectedActor)]
    }

    if (focusedZone) {
      return [...zoneRing(focusedZone), ...actorPoints(actorsOfFocusedZone)]
    }

    return [...drawableZones.flatMap(zoneRing), ...actorPoints(located)]
  }, [
    selectedActor,
    route.geoJson,
    zoneOfSelectedActor,
    focusedZone,
    actorsOfFocusedZone,
    drawableZones,
    located,
  ])

  // La cible passe par un ref pour que `onLoad` applique toujours la dernière
  // connue, même si la carte finit de charger après l'arrivée des données.
  const applyCamera = useCallback(() => {
    const map = mapRef.current
    const coordinates = cameraTargetRef.current
    if (!map || !coordinates?.length) return
    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: 14, duration: 800 })
      return
    }
    map.fitBounds(boundsOf(coordinates), { padding: 48, duration: 800, maxZoom: 16 })
  }, [])

  useEffect(() => {
    cameraTargetRef.current = cameraTarget
    applyCamera()
  }, [cameraTarget, applyCamera])

  const overlayMessage = useMemo(() => {
    // Une zone focalisée est le sujet de la carte : pas de pastille par-dessus.
    if (focusedZone) return null
    if (located.length === 0) return "Personne sur le terrain aujourd'hui"
    if (selectedActor && route.isEmpty) return 'Aucun trajet enregistré'
    return null
  }, [focusedZone, located.length, selectedActor, route.isEmpty])

  if (!MAPBOX_TOKEN) {
    return (
      <Card className={CARD_SHELL}>
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40">
          <MapPin className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Carte indisponible</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className={CARD_SHELL}>
      <div className="relative h-full w-full">
        <MapboxMap
          ref={mapRef}
          initialViewState={IDF_CENTER}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          scrollZoom
          dragPan
          doubleClickZoom
          touchZoomRotate
          keyboard={false}
          attributionControl={false}
          onLoad={applyCamera}
        >
          {/*
            Toutes les zones assignées sont dessinées en permanence : sélectionner
            une zone ou un commercial ne fait jamais disparaître le contexte, seule
            l'emphase change. Les non-focalisées restent très discrètes, sinon
            plusieurs remplissages superposés brouilleraient contours et marqueurs.
          */}
          {drawableZones.map(zone => {
            // L'emphase suit la zone, pas la ligne cliquée : focaliser l'une des
            // assignations d'une zone partagée met bien en avant cette zone.
            const isFocused = focusedZone?.zoneId === zone.zoneId
            return (
              <Source
                key={zone.zoneId}
                id={`zone-${zone.zoneId}`}
                type="geojson"
                data={zone.geoJson}
              >
                <Layer
                  id={`zone-fill-${zone.zoneId}`}
                  type="fill"
                  paint={{
                    'fill-color': zone.color,
                    'fill-opacity': isFocused ? 0.22 : 0.08,
                  }}
                />
                <Layer
                  id={`zone-line-${zone.zoneId}`}
                  type="line"
                  paint={{
                    'line-color': zone.color,
                    'line-width': isFocused ? 3 : 1.5,
                  }}
                />
              </Source>
            )
          })}

          {route.geoJson && (
            <Source id="daily-route" type="geojson" data={route.geoJson}>
              <Layer
                id="daily-route-shadow"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': routeColor, 'line-width': 6, 'line-opacity': 0.15 }}
              />
              <Layer
                id="daily-route-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': routeColor, 'line-width': 3, 'line-opacity': 0.85 }}
              />
            </Source>
          )}

          {route.startPoint && (
            <Marker
              longitude={route.startPoint.longitude}
              latitude={route.startPoint.latitude}
              anchor="center"
            >
              <div
                className="flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white shadow"
                style={{ borderColor: routeColor }}
              >
                <Flag className="h-2 w-2" style={{ color: routeColor }} />
              </div>
            </Marker>
          )}

          {located.map(c => {
            const isSelected = c.key === selectedKey
            return (
              <Marker
                key={c.key}
                longitude={c.longitude}
                latitude={c.latitude}
                anchor="bottom"
                onClick={() => selectActor(c)}
                style={{ cursor: 'pointer', zIndex: isSelected ? 2 : 1 }}
              >
                <ActorMarker
                  color={colorFor(c.userId)}
                  initial={(c.name || '?').charAt(0).toUpperCase()}
                  dimmed={!c.online}
                  selected={isSelected}
                />
              </Marker>
            )
          })}
        </MapboxMap>

        {overlayMessage && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <p className="rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {overlayMessage}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
