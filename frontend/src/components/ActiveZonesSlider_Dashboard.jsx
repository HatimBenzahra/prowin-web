import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapSkeleton } from '@/components/LoadingSkeletons'
import { ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCommercials, useManagers, useDirecteurs } from '@/hooks/metier/use-api'
import { Link } from "react-router-dom";

const AssignedZoneCard = lazy(() => import('./AssignedZoneCard'))

/**
 * Composant slider pour afficher les zones actuellement assignées avec carte Mapbox
 * @param {Object} props
 * @param {Array} props.assignments - Liste des assignations en cours
 * @param {string} props.className - Classes CSS additionnelles
 * @param {boolean} props.autoPlay - Activer le défilement automatique
 * @param {number} props.autoPlayInterval - Intervalle de défilement auto (ms)
 */
export default function ActiveZonesSlider({
  assignments = [],
  className = '',
  autoPlay = false,
  autoPlayInterval = 8000,
  isSliding = true,
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showMap, setShowMap] = useState(false)

  // Charger les données utilisateurs pour enrichir les assignations
  const { data: commercials } = useCommercials()
  const { data: managers } = useManagers()
  const { data: directeurs } = useDirecteurs()

  // Enrichir les assignations avec les noms des utilisateurs
  const enrichedAssignments = useMemo(() => {
    if (!assignments) return []

    return assignments.map(item => {
      // Trouver le nom de l'utilisateur selon son type
      let userName = `ID: ${item.userId}`
      let userTypeLabel = 'Utilisateur'

      if (item.userType === 'COMMERCIAL') {
        const commercial = commercials?.find(c => c.id === item.userId)
        if (commercial) {
          userName = `${commercial.prenom} ${commercial.nom}`
        }
        userTypeLabel = 'Commercial'
      } else if (item.userType === 'MANAGER') {
        const manager = managers?.find(m => m.id === item.userId)
        if (manager) {
          userName = `${manager.prenom} ${manager.nom}`
        }
        userTypeLabel = 'Manager'
      } else if (item.userType === 'DIRECTEUR') {
        const directeur = directeurs?.find(d => d.id === item.userId)
        if (directeur) {
          userName = `${directeur.prenom} ${directeur.nom}`
        }
        userTypeLabel = 'Directeur'
      }

      return {
        ...item,
        userName,
        userTypeLabel,
      }
    })
  }, [assignments, commercials, managers, directeurs])

  // Auto-play slider
  useEffect(() => {
    if (!autoPlay || enrichedAssignments.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % enrichedAssignments.length)
    }, autoPlayInterval)

    return () => clearInterval(interval)
  }, [autoPlay, autoPlayInterval, enrichedAssignments.length])

  const handlePrevious = () => {
    setCurrentIndex(prev => (prev - 1 + enrichedAssignments.length) % enrichedAssignments.length)
  }

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % enrichedAssignments.length)
  }

  if (!enrichedAssignments || enrichedAssignments.length === 0) {
    return (
      <Card className={cn('border-2', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Zones en cours de prospection
          </CardTitle>
          <CardDescription>Aucune zone active actuellement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Aucune assignation en cours</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const currentAssignment = enrichedAssignments[currentIndex]
  const zone = currentAssignment?.zone
  const userName = currentAssignment?.userName || 'Utilisateur inconnu'
  const userType = currentAssignment?.userTypeLabel || 'Utilisateur'

  return (
    <div className={cn('space-y-4', className)}>
      {/* En-tête avec navigation */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Zones en cours de prospection
              </CardTitle>
              <CardDescription className="mt-2">
                {enrichedAssignments.length} zone{enrichedAssignments.length > 1 ? 's' : ''} active
                {enrichedAssignments.length > 1 ? 's' : ''}
              </CardDescription>
            </div>

            {/* Info utilisateur assigné */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Assigné à</p>
                <div className="flex items-center gap-2 mt-1">
                  <Link
                    to={
                      currentAssignment?.userType === 'COMMERCIAL'
                        ? `/commerciaux/${currentAssignment?.userId}`
                        : currentAssignment?.userType === 'MANAGER'
                          ? `/managers/${currentAssignment?.userId}`
                          : currentAssignment?.userType === 'DIRECTEUR'
                            ? `/directeurs/${currentAssignment?.userId}`
                            : '#'
                    }
                    className="font-semibold hover:text-primary hover:underline transition-colors cursor-pointer"
                  >
                    {userName}
                  </Link>
                  <Badge variant="secondary">{userType}</Badge>
                </div>
              </div>
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Carte de la zone actuelle */}
      {zone && (
        showMap ? (
          <Suspense fallback={<MapSkeleton />}>
            <AssignedZoneCard
              zone={zone}
              assignmentDate={currentAssignment?.assignedAt || currentAssignment?.dateDebut}
              fullWidth={true}
              className="transition-all duration-300"
            />
          </Suspense>
        ) : (
          <Card className="border-2">
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Carte masquee pour accelerer le chargement initial.
                </p>
                <Button onClick={() => setShowMap(true)} size="sm" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  Afficher la carte
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Navigation du slider */}
      {enrichedAssignments.length > 1 && isSliding && (
        <Card className="border-2">
          <CardContent>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={enrichedAssignments.length <= 1}
                className="h-10 w-10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-2">
                {enrichedAssignments.map((assignment, index) => (
                  <button
                    key={`${assignment.userType}-${assignment.userId}-${assignment?.zone?.id ?? 'zone'}`}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      index === currentIndex
                        ? 'w-8 bg-primary'
                        : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    )}
                    title={assignment?.zone?.nom || `Zone ${index + 1}`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={enrichedAssignments.length <= 1}
                className="h-10 w-10"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="text-center mt-4">
              <p className="text-sm text-muted-foreground">
                Zone {currentIndex + 1} sur {enrichedAssignments.length}
                {zone && ` • ${zone.nom}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
