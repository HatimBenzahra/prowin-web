import { mapboxCache } from '@/services/core'
import kinks from '@turf/kinks'
import booleanIntersects from '@turf/boolean-intersects'
import { polygon as turfPolygon } from '@turf/helpers'

/**
 * Génère un Feature<Polygon> GeoJSON approximant un cercle géodésique.
 * Utilisé pour l'affichage des zones "cercle" héritées (xOrigin/yOrigin/rayon).
 * @param {[number, number]} center - [longitude, latitude]
 * @param {number} radiusInMeters - Rayon en mètres
 * @param {number} [points=64] - Nombre de segments du polygone
 * @returns {{type: 'Feature', geometry: {type: 'Polygon', coordinates: number[][][]}, properties: Object}}
 */
export function createGeoJSONCircle(center, radiusInMeters, points = 64) {
  const coords = { latitude: center[1], longitude: center[0] }
  const km = radiusInMeters / 1000
  const ret = []
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180))
  const distanceY = km / 110.574
  let theta, x, y
  for (let i = 0; i < points; i++) {
    theta = (i / points) * (2 * Math.PI)
    x = distanceX * Math.cos(theta)
    y = distanceY * Math.sin(theta)
    ret.push([coords.longitude + x, coords.latitude + y])
  }
  ret.push(ret[0])
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ret] },
    properties: {},
  }
}

/**
 * Retourne la géométrie GeoJSON d'une zone en gérant le modèle mixte :
 * - Zone polygone (nouvelle) : Feature<Polygon> construit depuis `zone.polygon`.
 * - Zone cercle (héritée) : cercle généré depuis `xOrigin`/`yOrigin`/`rayon`.
 * @param {{polygon?: number[][], xOrigin?: number, yOrigin?: number, rayon?: number}} zone
 * @returns {{type: 'Feature', geometry: {type: 'Polygon', coordinates: number[][][]}, properties: Object}|null}
 */
export function zoneToGeoJSON(zone) {
  if (!zone) return null

  if (Array.isArray(zone.polygon) && zone.polygon.length > 0) {
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [zone.polygon] },
      properties: {},
    }
  }

  if (zone.xOrigin != null && zone.yOrigin != null && zone.rayon != null) {
    return createGeoJSONCircle([zone.xOrigin, zone.yOrigin], zone.rayon)
  }

  return null
}

const ZONE_COLORS = [
  '#3388ff', // Blue
  '#ff6b6b', // Red
  '#51cf66', // Green
  '#ffd93d', // Yellow
  '#a78bfa', // Purple
  '#f59e0b', // Orange
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Dark Orange
]

/**
 * Couleur déterministe d'une zone, dérivée de son identifiant : une même zone
 * garde la même couleur partout (carte de zone assignée, création, dashboard).
 * @param {number} zoneId
 * @returns {string} Couleur hex
 */
export function getZoneColor(zoneId) {
  return ZONE_COLORS[zoneId % ZONE_COLORS.length]
}

/**
 * Calcule la superficie (km²) d'un anneau polygonal fermé `[[lng,lat], ...]`
 * via la formule du lacet (shoelace) appliquée sur une projection
 * équirectangulaire locale (cohérente avec createGeoJSONCircle).
 * @param {number[][]} ring - Anneau fermé de coordonnées [longitude, latitude]
 * @returns {number} Superficie en km²
 */
export function polygonAreaKm2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0

  const latAvgDeg = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
  const latRad = (latAvgDeg * Math.PI) / 180
  const metersPerDegLat = 110574
  const metersPerDegLng = 111320 * Math.cos(latRad)

  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * metersPerDegLng
    const y1 = ring[i][1] * metersPerDegLat
    const x2 = ring[i + 1][0] * metersPerDegLng
    const y2 = ring[i + 1][1] * metersPerDegLat
    area += x1 * y2 - x2 * y1
  }

  return Math.abs(area / 2) / 1e6
}

/**
 * Fonction pour récupérer l'adresse via reverse geocoding Mapbox AVEC CACHE
 */
export const fetchLocationName = async (longitude, latitude) => {
  // Arrondir les coordonnées pour améliorer le taux de cache hit
  const roundedLng = longitude.toFixed(4)
  const roundedLat = latitude.toFixed(4)
  // Créer une fonction unique pour cette géolocalisation
  const fetchGeocode = async () => {
    try {
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${token}&types=place,region,country&language=fr`
      )
      const data = await response.json()

      if (data.features && data.features.length > 0) {
        // Récupérer le lieu le plus pertinent (ville, région, pays)
        const feature = data.features[0]
        return feature.place_name || feature.text
      } else {
        return `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du nom de lieu:', error)
      return `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`
    }
  }

  // Utiliser le cache dédié Mapbox avec namespace et gestion de déduplication
  const cacheKey = mapboxCache.getKey(fetchGeocode, [roundedLng, roundedLat], 'mapbox-geocode')
  return mapboxCache.fetchWithCache(cacheKey, fetchGeocode)
}

/**
 * Parse l'assignedUserId (format: "role-id") et retourne le rôle et l'ID
 * @param {string} assignedUserId - Format: "directeur-5", "manager-3", "commercial-7"
 * @returns {{role: string, id: number} | null}
 */
export const parseAssignedUserId = assignedUserId => {
  if (!assignedUserId || typeof assignedUserId !== 'string') return null

  const parts = assignedUserId.split('-')
  if (parts.length !== 2) return null

  const [role, idStr] = parts
  const id = parseInt(idStr, 10)

  if (isNaN(id)) return null

  return { role, id }
}

/**
 * Parse plusieurs assignedUserIds et retourne un array d'objets {role, id}
 * @param {string[]} assignedUserIds - Array de format: ["directeur-5", "manager-3", "commercial-7"]
 * @returns {{role: string, id: number}[]}
 */
export const parseAssignedUserIds = assignedUserIds => {
  if (!Array.isArray(assignedUserIds)) return []
  return assignedUserIds.map(parseAssignedUserId).filter(assignment => assignment !== null)
}

/** Superficie minimale par défaut d'une zone valide (km²) ≈ 500 m². */
export const MIN_ZONE_AREA_KM2 = 0.0005

/**
 * Indique si un anneau polygonal fermé est plus petit que le seuil minimal.
 * Un anneau invalide/dégénéré (moins de 4 sommets) est considéré trop petit.
 * @param {number[][]} ring - Anneau fermé [[lng,lat], ...]
 * @param {number} [minKm2=MIN_ZONE_AREA_KM2] - Seuil en km²
 * @returns {boolean}
 */
export const isPolygonTooSmall = (ring, minKm2 = MIN_ZONE_AREA_KM2) => {
  if (!Array.isArray(ring) || ring.length < 4) return true
  return polygonAreaKm2(ring) < minKm2
}

/**
 * Indique si le contour se croise lui-même (polygone non simple).
 * S'appuie sur @turf/kinks pour détecter les intersections d'arêtes.
 * @param {number[][]} ring - Anneau fermé [[lng,lat], ...]
 * @returns {boolean}
 */
export const hasSelfIntersection = ring => {
  if (!Array.isArray(ring) || ring.length < 4) return false
  try {
    return kinks(turfPolygon([ring])).features.length > 0
  } catch {
    // Anneau non fermé ou géométrie invalide : on ne bloque pas sur ce critère
    return false
  }
}

/**
 * Retourne les zones existantes que le contour tracé chevauche.
 * Réutilise `zoneToGeoJSON` (modèle mixte polygone/cercle) et @turf/boolean-intersects.
 * @param {number[][]} ring - Anneau fermé [[lng,lat], ...] du tracé courant
 * @param {Array} existingZones - Zones existantes (polygone ou cercle hérité)
 * @param {number|null} [excludeId=null] - Id de zone à ignorer (édition de soi-même)
 * @returns {Array} Sous-ensemble de `existingZones` en chevauchement
 */
export const overlapsExistingZones = (ring, existingZones, excludeId = null) => {
  if (!Array.isArray(ring) || ring.length < 4 || !Array.isArray(existingZones)) return []
  let current
  try {
    current = turfPolygon([ring])
  } catch {
    return []
  }
  return existingZones.filter(zone => {
    if (!zone || zone.id === excludeId) return false
    const other = zoneToGeoJSON(zone)
    if (!other) return false
    try {
      return booleanIntersects(current, other)
    } catch {
      return false
    }
  })
}

/**
 * Détermine tous les utilisateurs assignés à une zone (format: ["role-id", ...])
 */
export const getAssignedUserIdsFromZone = (zone, allAssignments) => {
  if (!zone) return []

  const assignedUsers = []

  // 1. Vérifier l'assignation directe au directeur
  if (zone.directeurId) {
    assignedUsers.push(`directeur-${zone.directeurId}`)
  }

  // 2. Vérifier l'assignation directe au manager
  if (zone.managerId) {
    assignedUsers.push(`manager-${zone.managerId}`)
  }

  // 3. Chercher toutes les assignations via ZoneEnCours
  const zoneAssignments = allAssignments?.filter(assignment => assignment.zoneId === zone.id) || []

  zoneAssignments.forEach(assignment => {
    if (assignment.userType === 'COMMERCIAL') {
      assignedUsers.push(`commercial-${assignment.userId}`)
    } else if (assignment.userType === 'MANAGER') {
      assignedUsers.push(`manager-${assignment.userId}`)
    } else if (assignment.userType === 'DIRECTEUR') {
      assignedUsers.push(`directeur-${assignment.userId}`)
    }
  })

  // Deduplicate
  return [...new Set(assignedUsers)]
}
