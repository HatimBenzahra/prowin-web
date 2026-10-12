import { useParams } from 'react-router-dom'
import {
  useImmeuble,
  useCommercials,
  useManagers,
  useZones,
  useInfinitePortesByImmeuble,
} from '@/services'
import { useMemo, useState, useEffect } from 'react'
import {
  effectiveTypeHabitat,
  getHabitatMeta,
  buildingDoorCount,
  TypeHabitat,
} from '@/constants/domain/habitat'
import { porteApi } from '@/services/api/portes/porte.service'
import BuildingFacade from './components/BuildingFacade'
import { buildFacadeFloors } from './facade-data'

export function useImmeubleDetailsLogic() {
  const { id } = useParams()

  // API hooks
  const { data: immeuble, loading: immeubleLoading, error } = useImmeuble(parseInt(id))
  const { data: commercials } = useCommercials()
  const { data: managers } = useManagers()
  const { data: zones } = useZones()

  // Utiliser useInfinitePortesByImmeuble avec une grande pageSize pour charger toutes les portes
  // pageSize=10000 devrait couvrir même les très grands immeubles
  const { data: portes, loading: portesLoading } = useInfinitePortesByImmeuble(
    parseInt(id),
    10000,
    null
  )

  const [segments, setSegments] = useState([])

  useEffect(() => {
    if (!id) return
    let active = true
    porteApi
      .getRecordingSegmentsByImmeuble(parseInt(id))
      .then(data => {
        if (active) setSegments(data)
      })
      .catch(() => {
        if (active) setSegments([])
      })
    return () => {
      active = false
    }
  }, [id])

  // 1 enregistrement par porte : on garde le segment le plus long si plusieurs
  // remontent (robustesse), c'est celui qui porte le vrai signal.
  const porteSegmentMap = useMemo(() => {
    const map = new Map()
    for (const seg of segments) {
      const existing = map.get(seg.porteId)
      if (!existing || (seg.durationSec || 0) > (existing.durationSec || 0)) {
        map.set(seg.porteId, seg)
      }
    }
    return map
  }, [segments])

  // Transformation des données API vers format UI
  const immeubleData = useMemo(() => {
    if (!immeuble) return null

    const type = effectiveTypeHabitat(immeuble)
    const meta = getHabitatMeta(type)
    const commercial = commercials?.find(c => c.id === immeuble.commercialId)
    const manager = managers?.find(m => m.id === immeuble.managerId)
    // Zone = résolue depuis immeuble.zoneId (source unique de l'appli), pas depuis l'adresse.
    const zoneName = immeuble.zoneId
      ? zones?.find(z => z.id === immeuble.zoneId)?.nom || `Zone #${immeuble.zoneId}`
      : 'Non spécifiée'
    // Total de portes prévues = capacité déclarée (grille), jamais le compte de portes créées.
    const totalDoors = buildingDoorCount(immeuble)

    // Déterminer le responsable (commercial ou manager)
    let commercialName = 'Non assigné'
    if (commercial) {
      commercialName = `${commercial.prenom} ${commercial.nom}`
    } else if (manager) {
      commercialName = `${manager.prenom} ${manager.nom} (Manager)`
    }

    // Nombre d'unités selon le type : étages (immeuble), 1 foyer (maison), maisons (pavillon)
    let unitCount
    if (type === TypeHabitat.MAISON) {
      unitCount = 1
    } else if (type === TypeHabitat.PAVILLON) {
      unitCount = immeuble.nbMaisonsPrevu ?? 0
    } else {
      unitCount = immeuble.nbEtages ?? 0
    }

    const mapPorte = porte => ({
      id: porte.id,
      number: porte.numero,
      nomPersonnalise: porte.nomPersonnalise || null,
      status: porte.statut.toLowerCase(),
      rdvDate: porte.rdvDate || null,
      rdvTime: porte.rdvTime || null,
      comment: porte.commentaire || null,
      lastVisit: porte.updatedAt || null,
      nbRepassages: porte.nbRepassages || 0,
      nbContrats: porte.nbContrats || 0,
      coachingFavori: porte.coachingFavori ?? false,
    })

    // Regrouper les portes par unité à partir des vraies données.
    // MAISON : un foyer unique regroupe toutes les portes ; sinon groupement par étage/maison.
    let floorDetails = []
    if (portes) {
      if (type === TypeHabitat.MAISON) {
        floorDetails = [
          {
            floor: 1,
            unitLabel: meta.unitLabel,
            totalDoors: portes.length,
            doors: portes.map(mapPorte),
          },
        ]
      } else {
        floorDetails = Array.from({ length: unitCount }, (_, index) => {
          const unitNumber = index + 1
          const portesUnit = portes.filter(p => p.etage === unitNumber)
          return {
            floor: unitNumber,
            unitLabel: meta.unitLabel,
            totalDoors: portesUnit.length,
            doors: portesUnit.map(mapPorte),
          }
        })
      }
    }

    return {
      ...immeuble,
      effectiveType: type,
      name: immeuble.adresse.split(',')[0],
      address: immeuble.adresse,
      floors: immeuble.nbEtages,
      apartments: totalDoors,
      commercial_name: commercialName,
      has_elevator: immeuble.ascenseurPresent,
      digital_code: immeuble.digitalCode || 'Non défini',
      zone: zoneName,
      created_at: immeuble.createdAt,
      updated_at: immeuble.updatedAt,
      floorDetails,
    }
  }, [immeuble, commercials, managers, zones, portes])

  const habitatMeta = useMemo(
    () => getHabitatMeta(immeubleData?.effectiveType),
    [immeubleData?.effectiveType]
  )

  // Données pour la façade — construites via le helper partagé (même source que
  // la modale bâtiment de la page commercial).
  const facade = useMemo(
    () => buildFacadeFloors(immeuble, portes, porteSegmentMap),
    [immeuble, portes, porteSegmentMap]
  )

  const personalInfo = useMemo(() => {
    if (!immeubleData) return []
    const type = immeubleData.effectiveType
    // L'adresse complète est déjà le titre de la page → on ne la répète pas ici.
    const info = [
      { label: 'Zone', value: immeubleData.zone, icon: 'mapPin' },
      { label: 'Commercial responsable', value: immeubleData.commercial_name, icon: 'users' },
      { label: 'Type de bâtiment', value: habitatMeta.label, icon: 'building' },
    ]

    if (type === TypeHabitat.MAISON) {
      info.push({ label: 'Configuration', value: 'Foyer unique (1 porte)', icon: 'building' })
    } else if (type === TypeHabitat.PAVILLON) {
      info.push({
        label: 'Nombre de maisons',
        value: immeubleData.nbMaisonsPrevu ?? 0,
        icon: 'building',
      })
    } else {
      info.push({ label: "Nombre d'étages", value: immeubleData.floors, icon: 'building' })
      info.push({
        label: 'Portes par étage',
        value: immeubleData.nbPortesParEtage,
        icon: 'building',
      })
      info.push({
        label: 'Ascenseur',
        value: immeubleData.has_elevator ? 'Oui' : 'Non',
        icon: 'building',
      })
    }

    info.push({ label: 'Code digital', value: immeubleData.digital_code, icon: 'key' })
    return info
  }, [immeubleData, habitatMeta.label])

  const statsCards = useMemo(() => {
    if (!immeubleData) return []
    return [
      {
        title: 'Contrats signés',
        value: immeubleData.floorDetails.reduce(
          (acc, floor) => acc + floor.doors.filter(door => door.status === 'contrat_signe').length,
          0
        ),
        description: `Sur ${immeubleData.apartments} portes totales`,
        icon: 'trendingUp',
      },
      {
        title: 'RDV programmés',
        value: immeubleData.floorDetails.reduce(
          (acc, floor) =>
            acc + floor.doors.filter(door => door.status === 'rendez_vous_pris').length,
          0
        ),
        description: 'Rendez-vous à venir',
        icon: 'calendar',
      },
      {
        title: 'Absents',
        value: immeubleData.floorDetails.reduce(
          (acc, floor) => acc + floor.doors.filter(door => door.status === 'absent').length,
          0
        ),
        description: 'Personne absente',
        icon: 'users',
      },
      {
        title: 'Argumentés',
        value: immeubleData.floorDetails.reduce(
          (acc, floor) => acc + floor.doors.filter(door => door.status === 'argumente').length,
          0
        ),
        description: 'Refus après argumentation',
        icon: 'message-square',
      },
      {
        title: 'Refus',
        value: immeubleData.floorDetails.reduce(
          (acc, floor) => acc + floor.doors.filter(door => door.status === 'refus').length,
          0
        ),
        description: 'Propositions refusées',
        icon: 'building',
      },
    ]
  }, [immeubleData])

  const additionalSections = useMemo(() => {
    if (!immeubleData) return []

    return [
      {
        title: facade.planTitle,
        description: 'Cliquez une porte pour écouter son enregistrement et voir son détail',
        type: 'custom',
        render: () => (
          <BuildingFacade
            floors={facade.floors}
            address={facade.address}
            planSubtitle={facade.planSubtitle}
            type={facade.type}
          />
        ),
      },
    ]
  }, [immeubleData, facade])

  return {
    immeubleData,
    immeubleLoading,
    portesLoading,
    error,
    personalInfo,
    statsCards,
    additionalSections,
    habitatMeta,
  }
}
