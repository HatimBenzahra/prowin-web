import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import MapboxMap, {
  Marker,
  Source,
  Layer,
  NavigationControl,
  useControl,
} from 'react-map-gl/mapbox'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css'
import mapboxgl from 'mapbox-gl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MapPin,
  Calendar,
  Maximize2,
  X,
  Building2,
  FileText,
  Percent,
  DoorOpen,
} from 'lucide-react'
import { MapSkeleton } from '@/components/LoadingSkeletons'
import { mapboxCache } from '@/services/core'
import { logError } from '@/services/core'
import {
  zoneToGeoJSON,
  polygonAreaKm2,
  getZoneColor,
} from '@/pages-ADMIN-DIRECTEUR/zones/zones-utils'
import {
  buildingDoorCount,
  habitatBreakdown,
  getHabitatMeta,
  effectiveTypeHabitat,
} from '@/constants/domain/habitat'
import { BuildingTypeBadge } from '@/components/BuildingTypeBadge'

// Set Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

// Geocoder Control Component pour la searchbar
function GeocoderControl() {
  useControl(
    () => {
      const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        marker: false,
        countries: 'fr',
        language: 'fr',
        placeholder: 'Rechercher une adresse...',
      })
      return geocoder
    },
    { position: 'top-left' }
  )
  return null
}

// Seuils de couverture partagés par les marqueurs et la légende de la carte.
const COVERAGE_LEVELS = [
  { max: 0, dotClass: 'bg-gray-500', markerClass: 'bg-gray-500', label: 'Non prospecté' },
  { max: 50, dotClass: 'bg-amber-500', markerClass: 'bg-amber-500', label: 'En cours' },
  { max: 100, dotClass: 'bg-blue-600', markerClass: 'bg-blue-600', label: 'Avancé' },
  { max: Infinity, dotClass: 'bg-emerald-500', markerClass: 'bg-emerald-500', label: 'Terminé' },
]

function getCoverageLevel(couverture) {
  if (couverture <= 0) return COVERAGE_LEVELS[0]
  if (couverture < 50) return COVERAGE_LEVELS[1]
  if (couverture < 100) return COVERAGE_LEVELS[2]
  return COVERAGE_LEVELS[3]
}

// Légende discrète des seuils de couverture, alignée sur les mêmes couleurs
// que les marqueurs (voir getCoverageLevel). Lisible en thème clair et sombre
// via les tokens sémantiques (bg-background/border-border/text-muted-foreground).
function CoverageLegend({ className = '' }) {
  return (
    <div
      className={`rounded-lg border border-border/60 bg-background/90 px-2.5 py-2 shadow-md backdrop-blur-sm ${className}`}
    >
      <div className="flex flex-col gap-1">
        {COVERAGE_LEVELS.map(level => (
          <div key={level.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${level.dotClass}`} />
            <span className="text-[10px] font-medium leading-none whitespace-nowrap text-muted-foreground">
              {level.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// KPI compacts de la zone. Source UNIQUE : l'agrégat backend (useZoneStatistics), passé
// en prop `stats` — jamais recalculé depuis les immeubles, pour rester cohérent avec les
// cartes de stats de la page (même divergence à éviter que celle déjà corrigée). Seule la
// couverture % combine le compteur backend `nbImmeublesProspectes` avec le nombre total de
// bâtiments de la zone (`totalImmeubles`, une donnée structurelle déjà utilisée telle quelle
// ailleurs sur cette page, pas une statistique de prospection recalculée).
function ZoneKpiStrip({ stats, totalImmeubles }) {
  const hasStats = stats != null
  const couverturePct =
    hasStats && totalImmeubles > 0 && stats.nbImmeublesProspectes != null
      ? Math.round((stats.nbImmeublesProspectes / totalImmeubles) * 100)
      : null

  const items = [
    { label: 'Contrats', value: hasStats ? stats.contratsSignes : '—', icon: FileText },
    { label: 'RDV', value: hasStats ? stats.rendezVousPris : '—', icon: Calendar },
    {
      label: 'Couverture',
      value: couverturePct != null ? `${couverturePct}%` : '—',
      icon: Percent,
    },
    {
      label: 'Portes prospectées',
      value: hasStats ? stats.nbPortesProspectes : '—',
      icon: DoorOpen,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div key={item.label} className="rounded-lg border border-border/60 bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-primary">
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-1 truncate text-lg font-bold tracking-tight text-foreground tabular-nums">
              {item.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const fetchLocationName = async (longitude, latitude) => {
  const roundedLng = longitude.toFixed(4)
  const roundedLat = latitude.toFixed(4)

  const fetchGeocode = async () => {
    try {
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${token}&types=place,region,country&language=fr`
      )

      if (!response.ok) {
        throw new Error(`Erreur Mapbox API: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const feature = data.features[0]
        return feature.place_name || feature.text
      } else {
        return `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`
      }
    } catch (error) {
      // Utiliser le système centralisé de logging d'erreurs
      logError(error, 'AssignedZoneCard.fetchLocationName', {
        longitude,
        latitude,
      })
      return `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`
    }
  }

  // Utiliser le cache dédié Mapbox
  const cacheKey = mapboxCache.getKey(fetchGeocode, [roundedLng, roundedLat], 'mapbox-geocode')
  return mapboxCache.fetchWithCache(cacheKey, fetchGeocode)
}

/**
 * Composant pour afficher la zone assignée à un commercial/manager/directeur
 * OU pour afficher tous les immeubles sur une carte
 * @param {Object} props
 * @param {Object} props.zone - Objet zone avec xOrigin, yOrigin, rayon, nom, id, immeubles
 * @param {string} props.assignmentDate - Date d'assignation au format ISO
 * @param {number} props.immeublesCount - Nombre d'immeubles dans la zone
 * @param {string} props.className - Classes CSS supplémentaires
 * @param {boolean} props.showAllImmeubles - Mode "tous les immeubles" sans zone spécifique
 * @param {Array} props.allImmeubles - Liste de tous les immeubles (si showAllImmeubles = true)
 * @param {Object|null} [props.stats] - Agrégat backend de la zone (useZoneStatistics). `null` =
 *   zone sans agrégat (affiche « — »). Omis = KPI strip masquée (compat. autres call sites).
 * @param {Array} [props.commercials] - Commerciaux connus (id, nom, prenom), pour résoudre le nom
 *   du commercial affecté à un immeuble (via immeuble.commercialId) dans le popup de la carte.
 */
export default function AssignedZoneCard({
  zone,
  assignmentDate,
  className = '',
  fullWidth = false,
  showAllImmeubles = false,
  allImmeubles = [],
  stats,
  commercials = [],
}) {
  const mapRef = useRef(null)
  const navigate = useNavigate()
  const [mapLoading, setMapLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [locationName, setLocationName] = useState('Chargement...')
  const [isMounted, setIsMounted] = useState(false) // ← AJOUT

  // S'assurer que le composant est monté avant de rendre la carte
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Charger le nom de la localisation
  useEffect(() => {
    if (zone?.xOrigin && zone?.yOrigin) {
      fetchLocationName(zone.xOrigin, zone.yOrigin)
        .then(name => {
          setLocationName(name)
        })
        .catch(error => {
          // Gérer les erreurs de géocodage silencieusement
          logError(error, 'AssignedZoneCard.useEffect.fetchLocationName', {
            zoneId: zone.id,
            zoneName: zone.nom,
          })
          setLocationName(`${zone.yOrigin.toFixed(2)}°N, ${zone.xOrigin.toFixed(2)}°E`)
        })
    }
  }, [zone])

  const zoneColor = useMemo(() => {
    return zone?.id ? getZoneColor(zone.id) : '#3388ff'
  }, [zone?.id])

  // Géométrie de la zone (modèle mixte : polygone récent ou cercle hérité)
  const zoneGeoJSON = useMemo(() => zoneToGeoJSON(zone), [zone])

  // Superficie affichée : vraie aire du polygone, sinon aire du disque (cercle hérité)
  const surfaceKm2 = useMemo(() => {
    if (Array.isArray(zone?.polygon) && zone.polygon.length > 0) {
      return polygonAreaKm2(zone.polygon)
    }
    if (zone?.rayon != null) {
      return Math.PI * Math.pow(zone.rayon / 1000, 2)
    }
    return 0
  }, [zone])

  // Filtrer les immeubles qui ont des coordonnées valides
  const immeublesWithCoordinates = useMemo(() => {
    const sourceImmeubles = showAllImmeubles ? allImmeubles : zone?.immeubles
    if (!sourceImmeubles) return []
    return sourceImmeubles.filter(
      immeuble =>
        immeuble.latitude != null &&
        immeuble.longitude != null &&
        !isNaN(immeuble.latitude) &&
        !isNaN(immeuble.longitude)
    )
  }, [zone?.immeubles, allImmeubles, showAllImmeubles])

  // Index commercial (id -> {nom, prenom, ...}) pour résoudre le nom affiché dans le popup
  // d'un immeuble à partir de son commercialId (le type GraphQL Immeuble n'expose pas de
  // champ `commercial` résolu, seulement `commercialId` — cf. schema.gql).
  const commercialsById = useMemo(() => {
    const map = new Map()
    for (const commercial of commercials) {
      if (commercial?.id != null) map.set(commercial.id, commercial)
    }
    return map
  }, [commercials])

  // Ensemble des points [lng, lat] à englober : géométrie de la zone (polygone ou cercle
  // généré) + tous les immeubles géolocalisés. Sert de base à un vrai fitBounds (plutôt
  // qu'une heuristique de zoom approximative) et au centre de secours en cas d'absence
  // totale de coordonnées.
  const boundsPoints = useMemo(() => {
    const points = []
    if (zoneGeoJSON && !showAllImmeubles) {
      for (const point of zoneGeoJSON.geometry.coordinates[0]) points.push(point)
    }
    for (const immeuble of immeublesWithCoordinates) {
      points.push([immeuble.longitude, immeuble.latitude])
    }
    return points
  }, [zoneGeoJSON, immeublesWithCoordinates, showAllImmeubles])

  // Position initiale (avant que fitBounds ne cadre précisément au chargement) : le premier
  // point disponible, sinon repli sur Paris. Le cadrage définitif vient de fitMapToBounds.
  const mapCenter = useMemo(() => {
    if (boundsPoints.length > 0) {
      const [longitude, latitude] = boundsPoints[0]
      return { longitude, latitude, zoom: 12 }
    }
    return { longitude: 2.3522, latitude: 48.8566, zoom: 5 }
  }, [boundsPoints])

  // Cadre la carte sur boundsPoints (zone + immeubles). Cas particulier 1 seul point :
  // fitBounds sur une bbox nulle donne un zoom incohérent, on centre donc directement.
  const fitMapToBounds = useCallback(
    (map, { animate = true } = {}) => {
      if (!map || boundsPoints.length === 0) return
      try {
        if (boundsPoints.length === 1) {
          map.easeTo({ center: boundsPoints[0], zoom: 15, duration: animate ? 500 : 0 })
          return
        }
        const bounds = boundsPoints.reduce(
          (acc, point) => acc.extend(point),
          new mapboxgl.LngLatBounds(boundsPoints[0], boundsPoints[0])
        )
        map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: animate ? 500 : 0 })
      } catch (error) {
        logError(error, 'AssignedZoneCard.fitMapToBounds', { zoneId: zone?.id })
      }
    },
    [boundsPoints, zone?.id]
  )

  // Recadre si la géométrie change pendant que la carte reste montée (ex. navigation
  // interne). Au premier montage, mapRef.current est encore null : c'est onLoad qui
  // effectue le cadrage initial (sans animation).
  useEffect(() => {
    fitMapToBounds(mapRef.current, { animate: true })
  }, [fitMapToBounds])

  // Fonction pour gérer le clic sur un immeuble
  const handleImmeubleClick = immeubleId => {
    navigate(`/immeubles/${immeubleId}`)
  }

  if (!zone && !showAllImmeubles) {
    return (
      <Card className={`border-2 ${className}`}>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Aucune zone assignée</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const MapContent = ({ height = '300px', showControls = false }) => {
    const containerRef = useRef(null)
    const [containerHeight, setContainerHeight] = useState(null)
    const [isContainerReady, setIsContainerReady] = useState(false)

    // Observer pour obtenir la hauteur réelle du conteneur quand height="100%"
    useEffect(() => {
      if (containerRef.current && height === '100%') {
        const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
            const h = entry.contentRect.height
            if (h > 0) {
              setContainerHeight(h)
              setIsContainerReady(true)
            }
          }
        })
        resizeObserver.observe(containerRef.current)
        return () => resizeObserver.disconnect()
      } else if (height !== '100%') {
        // Si height n'est pas 100%, on peut utiliser directement la valeur
        setContainerHeight(height)
        // Petit délai pour s'assurer que le DOM est prêt
        const timer = setTimeout(() => setIsContainerReady(true), 50)
        return () => clearTimeout(timer)
      }
    }, [height])

    // Vérifier que tout est prêt avant de rendre la carte
    const canRenderMap =
      isMounted &&
      isContainerReady &&
      containerHeight != null &&
      (showAllImmeubles ||
        (zone?.xOrigin != null &&
          zone?.yOrigin != null &&
          zone?.rayon != null &&
          !isNaN(zone.xOrigin) &&
          !isNaN(zone.yOrigin)))

    if (!canRenderMap) {
      return (
        <div
          ref={containerRef}
          style={{ height, width: '100%' }}
          className="flex items-center justify-center bg-muted rounded-lg"
        >
          <div className="text-center space-y-2">
            <MapPin className="h-8 w-8 mx-auto text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">
              {!isMounted
                ? 'Initialisation...'
                : containerHeight == null
                  ? 'Calcul des dimensions...'
                  : 'Coordonnées invalides'}
            </p>
          </div>
        </div>
      )
    }

    // Convertir la hauteur en pixels si nécessaire
    const actualHeight =
      typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight

    return (
      <div ref={containerRef} style={{ height, width: '100%', position: 'relative' }}>
        {mapLoading && (
          <div className="absolute inset-0 z-10">
            <MapSkeleton />
          </div>
        )}

        <MapboxMap
          ref={mapRef}
          initialViewState={mapCenter}
          style={{ height: actualHeight, width: '100%', borderRadius: '0.5rem' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          onLoad={evt => {
            setMapLoading(false)
            fitMapToBounds(evt.target, { animate: false })
          }}
          onError={error => {
            logError(error, 'AssignedZoneCard.Map.onError', {
              zoneId: zone?.id,
              zoneName: zone?.nom,
            })
            setMapLoading(false)
          }}
          attributionControl={false}
        >
          {showControls && <NavigationControl position="top-right" />}
          <GeocoderControl />

          {/* Centre de la zone - seulement si on a une zone */}
          {zone && !showAllImmeubles && <Marker longitude={zone.xOrigin} latitude={zone.yOrigin} />}

          {/* Immeubles sur la carte */}
          {immeublesWithCoordinates.map(immeuble => {
            const portes = immeuble.portes || []
            // Couverture = prospectées / total de portes PRÉVUES (grille déclarée), jamais / portes créées.
            const totalPortes = buildingDoorCount(immeuble)
            const prospectees = portes.filter(p => p.statut !== 'NON_VISITE').length
            const couverture = totalPortes > 0 ? Math.round((prospectees / totalPortes) * 100) : 0
            const contrats = portes
              .filter(p => p.statut === 'CONTRAT_SIGNE')
              .reduce((s, p) => s + (p.nbContrats ?? 0), 0)
            const coverageLevel = getCoverageLevel(couverture)
            const habitatMeta = getHabitatMeta(effectiveTypeHabitat(immeuble))
            const HabitatIcon = habitatMeta.Icon
            const assignedCommercial =
              immeuble.commercialId != null ? commercialsById.get(immeuble.commercialId) : null

            return (
              <Marker
                key={`immeuble-${immeuble.id}`}
                longitude={immeuble.longitude}
                latitude={immeuble.latitude}
              >
                <button
                  type="button"
                  className="relative cursor-pointer group"
                  onClick={e => {
                    e.stopPropagation()
                    handleImmeubleClick(immeuble.id)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      handleImmeubleClick(immeuble.id)
                    }
                  }}
                >
                  <div
                    className={`${coverageLevel.markerClass} text-white p-2 rounded-lg shadow-lg border-2 border-white hover:scale-110 transition-all duration-200 active:scale-95`}
                  >
                    <HabitatIcon className="h-4 w-4" />
                  </div>

                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2.5 bg-gray-900 text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 space-y-1.5">
                    <div className="font-semibold text-[13px]">{immeuble.adresse}</div>
                    <BuildingTypeBadge
                      immeuble={immeuble}
                      className="h-4 gap-1 px-1.5 py-0 text-[10px] font-medium"
                    />
                    <div className="text-gray-300">{totalPortes} portes</div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${coverageLevel.markerClass}`}
                          style={{ width: `${couverture}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums">{couverture}%</span>
                    </div>
                    {contrats > 0 && (
                      <div className="text-emerald-400">
                        {contrats} contrat{contrats > 1 ? 's' : ''}
                      </div>
                    )}
                    {assignedCommercial && (
                      <div className="text-gray-300">
                        👤 {assignedCommercial.prenom} {assignedCommercial.nom}
                      </div>
                    )}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                </button>
              </Marker>
            )
          })}

          {/* Géométrie de la zone (polygone ou cercle) - seulement si on a une zone */}
          {zoneGeoJSON && !showAllImmeubles && (
            <Source id="zone-circle" type="geojson" data={zoneGeoJSON}>
              <Layer
                id="zone-fill"
                type="fill"
                paint={{ 'fill-color': zoneColor, 'fill-opacity': 0.25 }}
              />
              <Layer
                id="zone-line"
                type="line"
                paint={{ 'line-color': zoneColor, 'line-width': 2 }}
              />
            </Source>
          )}
        </MapboxMap>

        {!mapLoading && immeublesWithCoordinates.length > 0 && (
          <CoverageLegend className="absolute bottom-3 left-3 z-20" />
        )}
      </div>
    )
  }

  return (
    <>
      <Card className={`border-2 ${className}`}>
        <CardContent>
          {fullWidth ? (
            /* Layout pleine largeur avec map en haut */
            <div className="space-y-6">
              {/* Map en pleine largeur */}
              <div className="relative">
                <div className="aspect-[21/9] rounded-lg overflow-hidden border-2 relative">
                  <MapContent height="100%" showControls={true} />

                  {/* Boutons de contrôle */}
                  <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
                    {showAllImmeubles && (
                      <Badge variant="secondary" className="shadow-lg">
                        {immeublesWithCoordinates.length} immeubles affichés
                      </Badge>
                    )}

                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setIsFullscreen(true)}
                      className="shadow-lg"
                      title="Agrandir la carte"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Informations sous la map */}
              {showAllImmeubles ? (
                /* Statistiques pour tous les immeubles */
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                        Total Bâtiments
                      </p>
                    </div>
                    <p className="text-2xl font-bold">{allImmeubles.length}</p>
                    {(() => {
                      const b = habitatBreakdown(allImmeubles)
                      return (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {b.IMMEUBLE} immeubles · {b.MAISON} maisons · {b.PAVILLON} pavillons
                        </p>
                      )
                    })()}
                  </div>

                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                        Géolocalisés
                      </p>
                    </div>
                    <p className="text-2xl font-bold">{immeublesWithCoordinates.length}</p>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                      Total Étages
                    </p>
                    <p className="text-2xl font-bold">
                      {allImmeubles.reduce((sum, imm) => sum + (imm.nbEtages || 0), 0)}
                    </p>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                      Total Portes
                    </p>
                    <p className="text-2xl font-bold">
                      {allImmeubles.reduce((sum, imm) => sum + buildingDoorCount(imm), 0)}
                    </p>
                  </div>
                </div>
              ) : (
                /* Informations de zone */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                          Zone
                        </p>
                      </div>
                      <Link
                        to={`/zones/${zone.id}`}
                        className="text-xl font-bold hover:text-primary hover:underline transition-colors cursor-pointer"
                      >
                        {zone.nom}
                      </Link>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                          Localisation
                        </p>
                      </div>
                      <p className="font-semibold">{locationName}</p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                        Rayon de couverture
                      </p>
                      <p className="text-xl font-bold">{(zone.rayon / 1000).toFixed(1)} km</p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
                        Surface totale
                      </p>
                      <p className="text-xl font-bold">{surfaceKm2.toFixed(1)} km²</p>
                    </div>
                  </div>

                  {stats !== undefined && (
                    <ZoneKpiStrip stats={stats} totalImmeubles={zone?.immeubles?.length ?? 0} />
                  )}

                  {assignmentDate && (
                    <div className="pt-4 border-t">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-1">
                            Date d'assignation
                          </p>
                          <p className="font-semibold">
                            {new Date(assignmentDate).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Layout original avec 2 colonnes */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Informations à gauche */}
              <div className="flex flex-col justify-between space-y-4">
                {/* Header avec infos */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xl font-semibold">{zone.nom}</h3>
                    <Badge>Zone assignée</Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-1">
                          Localisation
                        </p>
                        <p className="font-semibold">{locationName}</p>
                      </div>
                    </div>

                    {assignmentDate && (
                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-1">
                            Date d'assignation
                          </p>
                          <p className="font-semibold">
                            {new Date(assignmentDate).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Informations supplémentaires */}
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium mb-2">
                      Rayon de couverture
                    </p>
                    <p className="text-2xl font-bold">{(zone.rayon / 1000).toFixed(1)} km</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                        Surface
                      </p>
                      <p className="font-semibold">{surfaceKm2.toFixed(1)} km²</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
                        Bâtiments
                      </p>
                      <p className="font-semibold text-lg">{immeublesWithCoordinates.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Carte carrée à droite */}
              <div className="relative">
                <div className="aspect-square rounded-lg overflow-hidden border-2 relative">
                  <MapContent height="100%" />

                  {/* Boutons de contrôle */}
                  <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setIsFullscreen(true)}
                      className="shadow-lg"
                      title="Agrandir la carte"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal plein écran */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col p-4 animate-in fade-in-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">
                {showAllImmeubles ? 'Carte des Bâtiments' : zone.nom}
              </h2>
              <p className="text-muted-foreground">
                {showAllImmeubles
                  ? `${immeublesWithCoordinates.length} bâtiments géolocalisés`
                  : locationName}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setIsFullscreen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden border-2">
            <MapContent height="100%" showControls={true} />
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4 p-4 bg-card rounded-lg border">
            {showAllImmeubles ? (
              <>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Total Bâtiments
                  </p>
                  <p className="font-semibold text-lg">{allImmeubles.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Géolocalisés
                  </p>
                  <p className="font-semibold text-lg">{immeublesWithCoordinates.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Total Étages
                  </p>
                  <p className="font-semibold text-lg">
                    {allImmeubles.reduce((sum, imm) => sum + (imm.nbEtages || 0), 0)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Total Portes
                  </p>
                  <p className="font-semibold text-lg">
                    {allImmeubles.reduce((sum, imm) => sum + buildingDoorCount(imm), 0)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Nom de la zone
                  </p>
                  <p className="font-semibold">{zone.nom}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Rayon
                  </p>
                  <p className="font-semibold">{(zone.rayon / 1000).toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Bâtiments
                  </p>
                  <p className="font-semibold text-lg">{immeublesWithCoordinates.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide text-xs font-medium mb-1">
                    Date d'assignation
                  </p>
                  <p className="font-semibold">
                    {assignmentDate
                      ? new Date(assignmentDate).toLocaleDateString('fr-FR')
                      : 'Non disponible'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
