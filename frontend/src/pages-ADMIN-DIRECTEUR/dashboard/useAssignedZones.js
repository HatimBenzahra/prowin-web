import { useMemo } from 'react'
import { useAllCurrentAssignments } from '@/hooks/metier/api/zones'
import { zoneToGeoJSON, getZoneColor } from '@/pages-ADMIN-DIRECTEUR/zones/zones-utils'
import { useActorDirectory } from '../gps-tracking/useActorDirectory'

const SUPPORTED_USER_TYPES = new Set(['COMMERCIAL', 'MANAGER'])

/**
 * Zones actuellement assignées aux commerciaux et managers, prêtes à être
 * focalisées sur la carte terrain.
 *
 * Comme `gpsLatestActorPositions`, la requête `allCurrentAssignments` n'accepte
 * pas d'`excludeTestUsers` : les utilisateurs de test sont écartés ici, côté
 * client.
 */
export function useAssignedZones() {
  const { data: assignments, loading } = useAllCurrentAssignments()
  const { resolveActorName } = useActorDirectory()

  // Le client GraphQL maison peut renvoyer `data: null` : le défaut `[]` de
  // useApiCall ne couvre que `undefined`, d'où la garde explicite.
  const zones = useMemo(() => {
    const result = (assignments || [])
      .filter(a => SUPPORTED_USER_TYPES.has(a?.userType))
      .map(a => {
        const geoJson = zoneToGeoJSON(a.zone)
        return {
          id: a.id,
          zoneId: a.zoneId,
          zoneName: a.zone?.nom || `Zone ${a.zoneId}`,
          userName: resolveActorName(a.userId, a.userType),
          // userId + userType forment la clé de jointure avec les acteurs GPS,
          // qui permet de cadrer un commercial avec sa zone et inversement.
          userId: Number(a.userId),
          userType: a.userType,
          assignedAt: a.assignedAt,
          immeublesCount: a.zone?.immeubles?.length ?? 0,
          geoJson,
          color: getZoneColor(Number(a.zoneId) || 0),
          // Une zone sans polygone ni cercle exploitable ne peut pas être focalisée.
          canFocus: geoJson !== null,
        }
      })

    result.sort((a, b) => a.zoneName.localeCompare(b.zoneName))
    return result
  }, [assignments, resolveActorName])

  return { zones, loading }
}
