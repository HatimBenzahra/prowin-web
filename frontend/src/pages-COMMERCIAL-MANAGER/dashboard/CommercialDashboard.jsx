import React, { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Building2,
  Award,
  Trophy,
  Target,
  Clock,
  Users,
  Calendar,
  MapPin,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useCommercialTheme } from '@/hooks/ui/use-commercial-theme'
import { calculateRank, RANKS } from '@/utils/business/ranks'
import { useCommercialTeamRanking } from '@/hooks/metier/use-api'
import { usePortesRdvToday } from '@/hooks/metier/use-api'
import { useNavigate } from 'react-router-dom'
import { portesFaitesPar } from '@/utils/business/immeuble-membres'
export default function CommercialDashboard() {
  // Récupérer les données du contexte du layout
  const context = useOutletContext()
  const commercial = context?.commercial
  const isManager = context?.isManager
  const isCommercial = !isManager
  const { data: rdvToday, loading: loadingRdvToday } = usePortesRdvToday()
  const navigate = useNavigate()
  const immeublesMap = useMemo(() => {
    if (!commercial?.immeubles) return new Map()
    return new Map(commercial.immeubles.map(imm => [imm.id, imm]))
  }, [commercial?.immeubles])
  const viewer = useMemo(
    () =>
      commercial?.id != null
        ? { type: isManager ? 'MANAGER' : 'COMMERCIAL', id: commercial.id }
        : null,
    [commercial?.id, isManager]
  )
  // Calculer le nombre total de portes prospectées
  const totalPortesProspectees = React.useMemo(() => {
    if (!commercial?.immeubles) return 0

    return commercial.immeubles.reduce((total, immeuble) => {
      // Compter les portes que j'ai faites dans cet immeuble (partagé ou non), hors NON_VISITE
      const portesProspectees = portesFaitesPar(immeuble.portes || [], viewer).filter(
        porte => porte.statut !== 'NON_VISITE'
      ).length

      return total + portesProspectees
    }, 0)
  }, [commercial?.immeubles, viewer])
  const myStats = useMemo(
    () =>
      context?.myStats || {
        contratsSignes: 0,
        immeublesVisites: 0,
        rendezVousPris: 0,
        refus: 0,
      },
    [context?.myStats]
  )
  const { data: teamRanking } = useCommercialTeamRanking(isCommercial ? commercial?.id || 0 : 0)

  // Hook pour le thème commercial - centralise TOUS les styles
  const { colors, base } = useCommercialTheme()

  // Calculer le rang et les points avec le système unifié
  const { rank: currentRank, points: totalPoints } = useMemo(() => {
    return calculateRank(myStats.contratsSignes, myStats.rendezVousPris, myStats.immeublesVisites)
  }, [myStats.contratsSignes, myStats.rendezVousPris, myStats.immeublesVisites])

  // Calculer la progression vers le prochain rang
  const rankProgress = useMemo(() => {
    const currentRankIndex = RANKS.indexOf(currentRank)
    const nextRank = RANKS[currentRankIndex + 1]

    if (!nextRank) {
      return { percentage: 100, pointsNeeded: 0, nextRank: null }
    }

    const pointsInCurrentRank = totalPoints - currentRank.minPoints
    const pointsNeededForNextRank = nextRank.minPoints - currentRank.minPoints
    const percentage = Math.min((pointsInCurrentRank / pointsNeededForNextRank) * 100, 100)
    const pointsNeeded = nextRank.minPoints - totalPoints

    return { percentage, pointsNeeded, nextRank }
  }, [totalPoints, currentRank])

  const StatCard = ({ title, value, icon }) => {
    const Icon = icon
    return (
      <Card className={`flex-1 min-w-0 ${base.bg.card} ${base.border.card} gap-0 py-1`}>
        <CardContent className="p-1.5 sm:p-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[10px] sm:text-xs ${base.text.muted} truncate`}>{title}</p>
              <div
                className={`p-1 rounded-lg border ${base.border.default} ${base.bg.muted} flex-shrink-0`}
              >
                <Icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${base.icon.default}`} />
              </div>
            </div>
            <div className="space-y-0">
              <p className={`text-base sm:text-lg font-bold ${base.text.primary}`}>{value}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col space-y-2 sm:space-y-2.5 max-w-full pb-2 mb-20">
      {/* Rang et progression */}
      <Card className={`${base.bg.card} ${base.border.card} h-fit gap-1 py-5`}>
        <CardHeader className="px-2.5 sm:px-3 md:px-4 py-0 space-y-0 mb-0">
          <CardTitle
            className={`text-sm sm:text-base ${base.text.primary} flex items-center gap-1 leading-none`}
          >
            <Trophy className="w-4 h-4 " />
            Rang
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2.5 sm:px-3 md:px-4 pt-1 pb-2 -mt-1">
          <div className="space-y-2 sm:space-y-2.5">
            {/* Rang actuel */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${currentRank.bgColor}`}>
                  <Award className="w-5 h-5 text-white" />
                </div>
                <span className={`text-base sm:text-lg font-bold ${base.text.primary}`}>
                  Rang {currentRank.name}
                </span>
              </div>
              <Badge
                className={`${currentRank.bgColor} ${currentRank.textColor} ${currentRank.borderColor} border text-xs font-semibold px-2 py-1`}
              >
                {totalPoints} pts
              </Badge>
            </div>

            {/* Progression vers le prochain rang */}
            {rankProgress.nextRank && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center gap-2">
                  <span className={`text-xs sm:text-sm ${base.text.secondary}`}>
                    Prochain rang : {rankProgress.nextRank.name}
                  </span>
                  <span className={`text-xs ${base.text.muted}`}>
                    {rankProgress.pointsNeeded} pts restants
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${currentRank.bgColor}`}
                    style={{
                      width: `${rankProgress.percentage}%`,
                    }}
                  ></div>
                </div>
                <div className={`text-[10px] sm:text-xs ${base.text.muted}`}>
                  {Math.round(rankProgress.percentage)}% complété
                </div>
              </div>
            )}

            {/* Message si rang max atteint */}
            {!rankProgress.nextRank && (
              <div
                className={`text-xs sm:text-sm ${colors.success.text} bg-green-50 p-1.5 rounded-lg flex items-center gap-1.5`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Rang maximum atteint !</span>
              </div>
            )}

            {/* Classement dans l'équipe - seulement si équipe existe */}
            {isCommercial &&
              teamRanking &&
              teamRanking.position !== null &&
              teamRanking.total > 1 && (
                <div className={`pt-2.5 border-t ${base.border.default}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs sm:text-sm ${base.text.secondary}`}>
                        Classement dans l'équipe
                      </span>
                      <p className={`text-[10px] sm:text-xs ${base.text.muted}`}>
                        Sur {teamRanking.total} commercial{teamRanking.total > 1 ? 'aux' : ''} dans
                        l'équipe
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {teamRanking.trend === 'up' && (
                        <TrendingUp className={`w-4 h-4 ${colors.success.text}`} />
                      )}
                      {teamRanking.trend === 'down' && (
                        <TrendingDown className={`w-4 h-4 ${colors.danger.text}`} />
                      )}
                      <Badge
                        className={`${
                          teamRanking.position === 1
                            ? `${colors.success.bgLight} ${colors.success.text} ${colors.success.border}`
                            : teamRanking.position <= 3
                              ? `${colors.warning.bgLight} ${colors.warning.text} ${colors.warning.border}`
                              : `${base.bg.muted} ${base.text.muted} ${base.border.default}`
                        } border text-xs font-semibold px-2.5 py-1`}
                      >
                        {teamRanking.position === 1 && '🥇 '}
                        {teamRanking.position === 2 && '🥈 '}
                        {teamRanking.position === 3 && '🥉 '}
                        {teamRanking.position === 1
                          ? '1er'
                          : `${teamRanking.position} / ${teamRanking.total}`}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </CardContent>
      </Card>
      {/* Carte Manager et Classement - uniquement pour les commerciaux */}
      {/* Carte Manager - seulement si manager existe */}
      {isCommercial &&
        teamRanking &&
        (teamRanking.managerPrenom ||
          teamRanking.managerNom ||
          teamRanking.managerEmail ||
          teamRanking.managerNumTel) && (
          <Card className={`${base.bg.card} ${base.border.card} gap-1 py-4`}>
            <CardHeader className="px-2.5 sm:px-3 md:px-4 py-1 space-y-0 mb-0">
              <CardTitle
                className={`text-sm sm:text-base ${base.text.primary} flex items-center gap-1.5 leading-none`}
              >
                <Users className="w-4 h-4" />
                Mon Manager
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2.5 sm:px-3 md:px-4 pt-1 pb-2 -mt-1">
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-1.5 rounded-lg ${colors.primary.bgLight} ${colors.primary.border} border flex-shrink-0`}
                >
                  <Users className={`w-4 h-4 ${colors.primary.text}`} />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div>
                    <span
                      className={`text-sm sm:text-base font-semibold ${base.text.primary} block`}
                    >
                      {teamRanking.managerPrenom || 'non défini'}{' '}
                      {teamRanking.managerNom || 'non défini'}
                    </span>
                  </div>
                  {teamRanking.managerEmail && (
                    <div className={`text-xs ${base.text.muted}`}>{teamRanking.managerEmail}</div>
                  )}
                  {teamRanking.managerNumTel && (
                    <div className={`text-xs ${base.text.muted}`}>{teamRanking.managerNumTel}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Rendez-vous du jour */}
      {!loadingRdvToday && rdvToday && rdvToday.length > 0 && (
        <Card className={`${base.bg.card} ${base.border.card} gap-1 py-4`}>
          <CardHeader className="px-2.5 sm:px-3 md:px-4 py-1 space-y-0 mb-0">
            <CardTitle
              className={`text-sm sm:text-base ${base.text.primary} flex items-center gap-1.5 leading-none`}
            >
              <Calendar className="w-4 h-4" />
              Rendez-vous d'aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2.5 sm:px-3 md:px-4 pt-1 pb-2 -mt-1">
            <div className="space-y-1.5 mt-2">
              {rdvToday.map(porte => {
                const immeuble = immeublesMap.get(porte.immeubleId)
                return (
                  <div
                    key={porte.id}
                    onClick={() => navigate(`/portes/${porte.immeubleId}`)}
                    className={`p-2 rounded-lg border ${base.border.default} ${base.bg.muted} hover:${base.bg.accent} transition cursor-pointer`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg ${colors.primary.bgLight} ${colors.primary.border} border flex-shrink-0`}
                        >
                          <MapPin className={`w-3.5 h-3.5 ${colors.primary.text}`} />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className={`text-sm font-semibold ${base.text.primary} truncate`}>
                            {immeuble?.adresse || 'Adresse non disponible'}
                          </span>
                          <span className={`text-xs ${base.text.muted}`}>
                            Porte {porte.numero} - Étage {porte.etage}
                            {porte.nomPersonnalise && ` (${porte.nomPersonnalise})`}
                          </span>
                          {porte.commentaire && (
                            <span className={`text-xs ${base.text.muted} mt-0.5 line-clamp-2`}>
                              {porte.commentaire}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Clock className={`w-3.5 h-3.5 ${base.text.muted}`} />
                          <span className={`text-sm font-medium ${base.text.primary}`}>
                            {porte.rdvTime || 'Heure non définie'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 flex-shrink-0">
        <StatCard title="Contrats signés" value={myStats.contratsSignes} icon={CheckCircle2} />
        <StatCard title="Bâtiments visités" value={myStats.immeublesVisites} icon={Building2} />
        <StatCard title="Rendez-vous pris" value={myStats.rendezVousPris} icon={Clock} />
        <StatCard
          title="Taux de refus"
          value={
            totalPortesProspectees === 0
              ? '0%'
              : `${Math.round((myStats.refus / totalPortesProspectees) * 100)}%`
          }
          icon={Target}
        />
      </div>
    </div>
  )
}
