/**
 * Géométrie des zones polygonales.
 *
 * Un anneau (ring) est un tableau de coordonnées GeoJSON `[lng, lat]`, dans
 * l'ordre du polygone. Convention du repo (cf. acquiscan.service create zone) :
 * `xOrigin = longitude`, `yOrigin = latitude`.
 *
 * Ces fonctions sont pures (aucune dépendance NestJS) et lancent une `Error`
 * descriptive en cas d'anneau invalide ; le service traduit en BadRequestException.
 */

export type LngLat = [number, number];
export type Ring = LngLat[];

/** Rayon moyen de la Terre en mètres (identique à acquiscan.service). */
const EARTH_RADIUS_METERS = 6_371_000;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Distance haversine en mètres entre deux points `[lat, lng]`.
 */
function haversineMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Valide et normalise une entrée JSON en anneau ouvert (sans point de fermeture
 * dupliqué). Exige au moins 3 sommets distincts. Lance une `Error` si invalide.
 */
export function parseRing(input: unknown): Ring {
  if (!Array.isArray(input)) {
    throw new Error(
      'polygon doit être un tableau de coordonnées [[lng,lat], ...]',
    );
  }

  const points: Ring = input.map((point, index) => {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      typeof point[0] !== 'number' ||
      typeof point[1] !== 'number' ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      throw new Error(
        `polygon[${index}] doit être une coordonnée numérique [lng,lat]`,
      );
    }
    return [point[0], point[1]];
  });

  // Retire le point de fermeture dupliqué s'il existe (anneau fermé GeoJSON).
  const closed =
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const ring = closed ? points.slice(0, -1) : points;

  const distinct = new Set(ring.map(([lng, lat]) => `${lng},${lat}`));
  if (distinct.size < 3) {
    throw new Error('polygon doit contenir au moins 3 sommets distincts');
  }

  return ring;
}

/**
 * Centroïde (moyenne arithmétique des sommets) d'un anneau.
 * Retourne `{ xOrigin: longitude, yOrigin: latitude }`.
 */
export function centroid(ring: Ring): { xOrigin: number; yOrigin: number } {
  const validRing = parseRing(ring);
  const sum = validRing.reduce(
    (acc, [lng, lat]) => {
      acc.lng += lng;
      acc.lat += lat;
      return acc;
    },
    { lng: 0, lat: 0 },
  );
  return {
    xOrigin: sum.lng / validRing.length,
    yOrigin: sum.lat / validRing.length,
  };
}

/**
 * Rayon (en mètres) du cercle centré sur `center` englobant tous les sommets :
 * distance haversine maximale centre -> sommet.
 */
export function enclosingRadiusMeters(
  center: { xOrigin: number; yOrigin: number },
  ring: Ring,
): number {
  const validRing = parseRing(ring);
  return validRing.reduce((max, [lng, lat]) => {
    const distance = haversineMeters(center.yOrigin, center.xOrigin, lat, lng);
    return distance > max ? distance : max;
  }, 0);
}

/**
 * Aire du polygone en mètres carrés (formule du lacet / shoelace), via une
 * projection équirectangulaire locale centrée sur la latitude du centroïde.
 * Approximation adaptée aux zones de prospection (petites surfaces).
 */
/**
 * Test point-dans-anneau par lancer de rayon (ray casting standard).
 * Convention GeoJSON : `lng` = x, `lat` = y. L'anneau est supposé déjà
 * normalisé (ouvert, ≥ 3 sommets) — voir `parseRing`.
 */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test point-dans-zone. Si la zone a un `polygon` valide (≥ 3 sommets via
 * `parseRing`) on utilise le lancer de rayon ; sinon on retombe sur le disque
 * hérité `haversineMeters(centre, point) <= rayon` (`xOrigin` = lng, `yOrigin` = lat).
 * Un `polygon` présent mais invalide bascule sur le disque.
 */
export function pointInZone(
  lng: number,
  lat: number,
  zone: { polygon?: unknown; xOrigin: number; yOrigin: number; rayon: number },
): boolean {
  if (zone.polygon != null) {
    try {
      return pointInRing(lng, lat, parseRing(zone.polygon));
    } catch {
      // polygon invalide → repli sur le disque hérité.
    }
  }
  return haversineMeters(zone.yOrigin, zone.xOrigin, lat, lng) <= zone.rayon;
}

export function polygonAreaM2(ring: Ring): number {
  const validRing = parseRing(ring);
  const lat0 = centroid(validRing).yOrigin;
  const cosLat0 = Math.cos(toRad(lat0));

  // Projette chaque sommet [lng,lat] en mètres (x est, y nord).
  const projected = validRing.map(([lng, lat]) => ({
    x: toRad(lng) * EARTH_RADIUS_METERS * cosLat0,
    y: toRad(lat) * EARTH_RADIUS_METERS,
  }));

  let twiceArea = 0;
  for (let i = 0; i < projected.length; i++) {
    const current = projected[i];
    const next = projected[(i + 1) % projected.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) / 2;
}

/** Géométrie minimale d'une zone nécessaire à la résolution d'appartenance. */
export interface ZoneGeometryCandidate {
  id: number;
  polygon: unknown;
  xOrigin: number;
  yOrigin: number;
  rayon: number;
}

/**
 * Aire (m²) d'une zone : polygone via `polygonAreaM2`, sinon disque π·rayon².
 * Sert uniquement à départager plusieurs zones contenant le même point (la
 * plus petite gagne). Un polygon présent mais invalide bascule sur le disque.
 */
export function zoneAreaM2(zone: { polygon: unknown; rayon: number }): number {
  if (zone.polygon != null) {
    try {
      return polygonAreaM2(parseRing(zone.polygon));
    } catch {
      // polygon invalide → repli sur le disque.
    }
  }
  return Math.PI * zone.rayon * zone.rayon;
}

/**
 * Résolution PUREMENT géométrique de la zone contenant un point : parcourt
 * `zones` (déjà filtrées sur une géométrie exploitable), retient celles qui
 * contiennent le point (`pointInZone`) et renvoie l'id de la plus petite aire.
 * `null` si aucune zone ne contient le point. Cœur partagé par la création
 * d'immeuble, le déplacement (update), le backfill admin et la ré-résolution
 * automatique après création/édition de zone — pour ne jamais dupliquer le
 * lancer de rayon.
 */
export function resolveContainingZoneId(
  lng: number,
  lat: number,
  zones: ZoneGeometryCandidate[],
): number | null {
  let best: { id: number; area: number } | undefined;
  for (const zone of zones) {
    if (!pointInZone(lng, lat, zone)) {
      continue;
    }
    const area = zoneAreaM2(zone);
    if (!best || area < best.area) {
      best = { id: zone.id, area };
    }
  }
  return best?.id ?? null;
}
