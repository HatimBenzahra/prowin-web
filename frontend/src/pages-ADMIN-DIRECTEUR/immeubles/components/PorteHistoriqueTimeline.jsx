import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, User, Calendar, MessageSquare } from 'lucide-react'
import { getStatusLabel, getStatusColor } from '@/constants/domain/porte-status'
import { useStatusHistoriqueByPorte } from '@/hooks/metier/use-api'

export default function PorteHistoriqueTimeline({ porteId, porteNumero }) {
  const { data: historique, loading } = useStatusHistoriqueByPorte(porteId)

  const timelineItems = useMemo(() => {
    if (!historique || historique.length === 0) return []

    return historique.map((entry, index) => {
      const date = new Date(entry.createdAt)
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      const timeStr = date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })

      const acteur = entry.commercial
        ? `${entry.commercial.prenom} ${entry.commercial.nom} (Commercial)`
        : entry.manager
          ? `${entry.manager.prenom} ${entry.manager.nom} (Manager)`
          : 'Système'

      // Calculer le numéro de passage pour les absents (en parcourant de la fin vers le début)
      let passageNumber = null
      if (entry.statut === 'ABSENT') {
        // Compter combien de fois ABSENT apparaît depuis la fin jusqu'à cette entrée
        const reversedIndex = historique.length - 1 - index
        passageNumber = historique.slice(reversedIndex).filter(e => e.statut === 'ABSENT').length
      }

      return {
        id: entry.id,
        statut: entry.statut,
        date: dateStr,
        time: timeStr,
        acteur,
        commentaire: entry.commentaire,
        rdvDate: entry.rdvDate
          ? new Date(entry.rdvDate).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : null,
        rdvTime: entry.rdvTime,
        passageNumber,
      }
    })
  }, [historique])

  if (loading) {
    return (
      <div className="p-6 bg-muted/50 rounded-lg border">
        <div className="flex items-center justify-center space-x-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Chargement de l'historique...</span>
        </div>
      </div>
    )
  }

  if (!timelineItems || timelineItems.length === 0) {
    return (
      <div className="p-6 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground text-center">
          Aucun historique disponible pour cette porte
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-muted/30 to-muted/50 rounded-lg border">
      <CardHeader className="px-0 pt-0 pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Historique de la Porte {porteNumero}
        </CardTitle>
      </CardHeader>

      <div className="relative space-y-3 sm:space-y-4">
        {/* Timeline line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border"></div>

        {timelineItems.map((item, index) => {
          const isLast = index === timelineItems.length - 1
          const statusColor = getStatusColor(item.statut)
          const statusLabel = getStatusLabel(item.statut)

          return (
            <div key={item.id} className="relative pl-6 sm:pl-8">
              {/* Timeline dot */}
              <div
                className={`absolute left-0 top-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-3 sm:border-4 border-background ${statusColor.split(' ')[0]} shadow-md flex items-center justify-center`}
              >
                {index === 0 && (
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-background rounded-full"></div>
                )}
              </div>

              {/* Card content */}
              <Card className={`${isLast ? 'opacity-75' : ''} hover:shadow-md transition-shadow`}>
                <CardContent className="p-3 sm:p-4">
                  {/* Header: Status + Date/Time */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <Badge className={statusColor}>{statusLabel}</Badge>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span className="whitespace-nowrap">
                        {item.date} à {item.time}
                      </span>
                    </div>
                  </div>

                  {/* Acteur */}
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-foreground mb-2">
                    <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{item.acteur}</span>
                  </div>

                  {/* RDV Info (if applicable) */}
                  {item.rdvDate && item.rdvTime && (
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-primary bg-primary/10 p-2 rounded mb-2 border border-primary/20">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="font-medium">
                        RDV: {item.rdvDate} à {item.rdvTime}
                      </span>
                    </div>
                  )}

                  {/* Passage Number for ABSENT status */}
                  {item.passageNumber && (
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground bg-muted/50 p-2 rounded mb-2 border border-muted">
                      <User className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="font-medium">
                        {item.passageNumber === 1
                          ? '1er passage'
                          : item.passageNumber === 2
                            ? '2ème passage'
                            : `${item.passageNumber}ème passage`}
                      </span>
                    </div>
                  )}

                  {/* Commentaire */}
                  {item.commentaire && (
                    <div className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground bg-muted p-2 sm:p-3 rounded mt-2">
                      <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="italic break-words">{item.commentaire}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {timelineItems.length} changement{timelineItems.length > 1 ? 's' : ''} de statut
        </span>
        <span className="flex items-center gap-1">
          Première action: {timelineItems[timelineItems.length - 1]?.date}
        </span>
      </div>
    </div>
  )
}
