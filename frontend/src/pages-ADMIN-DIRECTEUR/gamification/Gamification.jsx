import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  useCommercialBadges,
  useManagerBadges,
  useContratsByCommercial,
  useContratsByManager,
} from '@/hooks/metier/api/gamification'
import {
  Trophy,
  Medal,
  Award,
  Star,
  RefreshCw,
  Link2,
  Package,
  Zap,
  Shield,
  Crown,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  Pencil,
  Pen,
  Search,
  TrendingUp,
  Target,
  Trash2,
} from 'lucide-react'
import GameIcon from '@/components/gamification/GameIcon'
import iconManifest from '@/assets/gamification-icons/manifest.json'
import {
  useGamificationLogic,
  RANK_PERIODS,
  BADGE_CATEGORIES,
  BADGE_PRODUCT_KEYS,
  CONTRACT_STATUS_FILTERS,
} from './useGamificationLogic'

// =============================================================================
// Utilitaires
// =============================================================================

const formatNumber = (num, decimals = 0) => {
  if (typeof num !== 'number') return '0'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

const getRankIcon = position => {
  switch (position) {
    case 1:
      return (
        <div className="h-7 w-7 rounded-full bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 flex items-center justify-center">
          <Trophy className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
        </div>
      )
    case 2:
      return (
        <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800/40 border border-slate-300 dark:border-slate-600 flex items-center justify-center">
          <Medal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        </div>
      )
    case 3:
      return (
        <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 flex items-center justify-center">
          <Award className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
        </div>
      )
    default:
      return (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">{position}</span>
        </div>
      )
  }
}

const getRankRowClass = position => {
  switch (position) {
    case 1:
      return ''
    case 2:
      return ''
    case 3:
      return ''
    default:
      return ''
  }
}

const getInitialColors = name => {
  const palette = [
    'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  ]
  const index = (name || 'A').charCodeAt(0) % palette.length
  return palette[index]
}

const getCategoryBadgeClass = category => {
  switch (category) {
    case 'PROGRESSION':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
    case 'PRODUIT':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800'
    case 'PERFORMANCE':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
    case 'TROPHEE':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

const STAT_CARD_STYLES = [
  {
    label: 'Total',
    key: 'total',
    icon: Shield,
    bg: 'bg-slate-100 dark:bg-slate-800/40',
    color: 'text-slate-600 dark:text-slate-400',
  },
  {
    label: 'Progression',
    key: 'progression',
    icon: TrendingUp,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: 'Produit',
    key: 'produit',
    icon: Package,
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    color: 'text-sky-600 dark:text-sky-400',
  },
  {
    label: 'Performance',
    key: 'performance',
    icon: Target,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    color: 'text-amber-600 dark:text-amber-400',
  },
  {
    label: 'Trophée',
    key: 'trophee',
    icon: Crown,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
]

const getCategoryIcon = category => {
  switch (category) {
    case 'PROGRESSION':
      return <TrendingUp className="h-3.5 w-3.5" />
    case 'PRODUIT':
      return <Package className="h-3.5 w-3.5" />
    case 'PERFORMANCE':
      return <Target className="h-3.5 w-3.5" />
    case 'TROPHEE':
      return <Crown className="h-3.5 w-3.5" />
    default:
      return null
  }
}

const getConfidenceColor = confidence => {
  if (confidence >= 80) return 'text-green-600 dark:text-green-400'
  if (confidence >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

const getOffreLogoUrl = logoUrl => {
  if (!logoUrl) return null
  if (logoUrl.startsWith('http')) return logoUrl
  return `https://www.winleadplus.com${logoUrl}`
}

const getBadgeTriggerLabel = (conditionStr, metadataStr) => {
  try {
    const c = conditionStr ? JSON.parse(conditionStr) : null
    const m = metadataStr ? JSON.parse(metadataStr) : null
    if (!c?.metric) return null

    // Trophées / classement
    if (c.ranking) {
      const pos = c.ranking.replace('top', 'Top ')
      const suffix = m?.contrats ? ` (${m.contrats} contrats)` : ''
      return `${pos} du classement${suffix}`
    }

    switch (c.metric) {
      case 'contratsSignes': {
        const val = c.threshold || m?.totalContrats
        return val ? `${val} contrats signés` : 'Contrats signés'
      }
      case 'contratsProduit': {
        const val = c.threshold || m?.contratsCategorie
        const cat = c.categorie || m?.categorie || ''
        return val ? `${val} contrats ${cat}`.trim() : `Contrats ${cat || 'produit'}`
      }
      case 'argumentationsParJour': {
        const val = c.threshold || m?.maxArgumentationsParJour
        return val ? `${val} argumentations/jour` : 'Record argumentations/jour'
      }
      case 'portesProspectesParJour': {
        const val = c.threshold || m?.maxPortesProspectesParJour
        return val ? `${val} portes prospectées/jour` : 'Record portes/jour'
      }
      case 'tauxClosing': {
        const pct = m?.tauxClosing ?? c.threshold
        return pct ? `${pct}% taux closing` : 'Taux closing mensuel'
      }
      case 'repassageConversion': {
        const val = c.threshold || m?.repassageConversionsThisMonth
        return val
          ? `${val} repassage${val > 1 ? 's' : ''} converti${val > 1 ? 's' : ''}`
          : 'Repassages convertis'
      }
      case 'portesParJour': {
        const val = c.threshold || m?.portesParJour
        return val ? `${val} portes/jour` : 'Record portes/jour'
      }
      case 'signaturesParJour': {
        const val = c.threshold || m?.maxSignaturesJour
        return val ? `${val} signatures/jour` : 'Multi-signatures/jour'
      }
      case 'signaturesParSemaine': {
        const val = c.threshold || m?.maxSignaturesSemaine
        return val ? `${val} signatures/semaine` : 'Record signatures/semaine'
      }
      case 'progressionHebdo':
        return c.threshold ? `+${c.threshold}% progression hebdo` : 'Progression hebdo'
      case 'progressionMensuelle':
        return c.threshold ? `+${c.threshold}% progression mensuelle` : 'Progression mensuelle'
      case 'badgesDistincts': {
        const val = c.threshold || m?.distinctBadgeCount
        return val ? `${val} badges distincts obtenus` : 'Badges distincts obtenus'
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

const getTierBadgeClass = tierKey => {
  switch (tierKey) {
    case 'BRONZE':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'SILVER':
      return 'bg-slate-100 text-slate-800 border-slate-300'
    case 'GOLD':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    case 'PLATINUM':
      return 'bg-cyan-100 text-cyan-800 border-cyan-300'
    case 'DIAMOND':
      return 'bg-indigo-100 text-indigo-800 border-indigo-300'
    case 'MASTER':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'GRANDMASTER':
      return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300'
    case 'LEGEND':
      return 'bg-rose-100 text-rose-800 border-rose-300'
    default:
      return 'bg-muted text-foreground border-border'
  }
}

const CATEGORY_ICON_HEX = {
  PROGRESSION: '22C55E',
  PRODUIT: '0EA5E9',
  PERFORMANCE: 'F59E0B',
  TROPHEE: 'EAB308',
}

const normalizeExternalIconUrl = (iconUrl, category) => {
  if (!iconUrl) return null

  if (iconUrl.startsWith('https://cdn.simpleicons.org/')) {
    const match = iconUrl.match(/^https:\/\/cdn\.simpleicons\.org\/([^/]+)$/)
    if (match?.[1]) {
      const color = CATEGORY_ICON_HEX[category] || '2563EB'
      return `${iconUrl}/${color}`
    }
  }

  if (iconUrl.startsWith('https://api.iconify.design/') && !iconUrl.includes('color=')) {
    const color = CATEGORY_ICON_HEX[category] || '2563EB'
    const separator = iconUrl.includes('?') ? '&' : '?'
    return `${iconUrl}${separator}color=%23${color}`
  }

  return iconUrl
}

/**
 * R\u00e9sout la cl\u00e9 d'ic\u00f4ne locale (pack Game Icons) \u00e0 partir du `code` du badge.
 * Source de v\u00e9rit\u00e9 = `manifest.byCode` (1 ic\u00f4ne distincte par produit / exploit /
 * troph\u00e9e ; les paliers d'un m\u00eame produit partagent l'ic\u00f4ne, le niveau est affich\u00e9 \u00e0 part).
 * Repli par cat\u00e9gorie si le code est inconnu (badge custom).
 */
const resolveBadgeIconKey = badge => {
  const byCode = iconManifest.byCode[badge?.code]
  return byCode || iconManifest.categoryFallback[badge?.category] || 'trophy-cup'
}

/**
 * URL d'ic\u00f4ne personnalis\u00e9e \u00e9ventuellement saisie en base (`badge.iconUrl`, http/https).
 * R\u00e9tro-compatibilit\u00e9 : si pr\u00e9sente, elle prime sur l'ic\u00f4ne locale. Sinon `null`.
 */
const resolveBadgeCustomUrl = badge => {
  if (
    badge?.iconUrl &&
    (badge.iconUrl.startsWith('http://') || badge.iconUrl.startsWith('https://'))
  ) {
    return normalizeExternalIconUrl(badge.iconUrl, badge?.category)
  }
  return null
}

const CATEGORY_BADGE_STYLES = {
  PROGRESSION: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    color: 'text-emerald-600 dark:text-emerald-400',
    Icon: TrendingUp,
  },
  PRODUIT: {
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-800',
    color: 'text-sky-600 dark:text-sky-400',
    Icon: Package,
  },
  PERFORMANCE: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    color: 'text-amber-600 dark:text-amber-400',
    Icon: Target,
  },
  TROPHEE: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    color: 'text-yellow-600 dark:text-yellow-400',
    Icon: Crown,
  },
}

function BadgeIcon({ badge }) {
  const [imgFailed, setImgFailed] = useState(false)
  const customUrl = resolveBadgeCustomUrl(badge)
  const iconKey = resolveBadgeIconKey(badge)
  const style = CATEGORY_BADGE_STYLES[badge?.category] || CATEGORY_BADGE_STYLES.PROGRESSION

  useEffect(() => {
    setImgFailed(false)
  }, [])

  return (
    <div
      className={`h-9 w-9 rounded-lg border ${style.bg} ${style.border} flex items-center justify-center overflow-hidden`}
    >
      {customUrl && !imgFailed ? (
        <img
          src={customUrl}
          alt={badge.nom}
          className="h-6 w-6 object-contain"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <GameIcon name={iconKey} size={24} className={style.color} title={badge?.nom} />
      )}
    </div>
  )
}

// =============================================================================
// Tabs Configuration
// =============================================================================

const TABS = [
  { id: 'classement', label: 'Classement', icon: Trophy },
  { id: 'badges', label: 'Badges', icon: Shield },
  { id: 'mapping', label: 'Mapping', icon: Link2 },
  { id: 'offres', label: 'Offres', icon: Package },
  { id: 'sync', label: 'Synchronisation', icon: RefreshCw },
]

function CommercialBadgesCell({ commercialId, managerId, periodKey }) {
  const { data: commercialBadges, loading: commercialLoading } = useCommercialBadges(
    commercialId || 0
  )
  const { data: managerBadgesData, loading: managerLoading } = useManagerBadges(managerId || 0)

  const loading = commercialId ? commercialLoading : managerLoading
  const rawBadges = commercialId ? commercialBadges : managerBadgesData

  if (loading) {
    return <span className="text-[10px] text-muted-foreground">Chargement...</span>
  }

  const badges = (rawBadges || [])
    .filter(b => b.periodKey === periodKey || b.periodKey === 'lifetime')
    .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime())

  if (!badges.length) {
    return <span className="text-[10px] text-muted-foreground italic">Aucun badge</span>
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {badges.map(badge => {
        const def = badge.badgeDefinition
        const customUrl = def ? resolveBadgeCustomUrl(def) : null
        const iconKey = def ? resolveBadgeIconKey(def) : null
        const style = CATEGORY_BADGE_STYLES[def?.category] || CATEGORY_BADGE_STYLES.PROGRESSION
        return (
          <div
            key={badge.id}
            title={`${def?.nom || 'Badge'} — ${def?.description || ''}`}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.border}`}
          >
            {customUrl ? (
              <img
                src={customUrl}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 object-contain"
                loading="lazy"
              />
            ) : (
              <GameIcon name={iconKey} size={14} className={style.color} />
            )}
            <span className="max-w-[80px] truncate">{def?.nom || def?.code || 'Badge'}</span>
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// DetailModal — Fiche complète du participant (badges + contrats + points)
// =============================================================================

function DetailModal({
  open,
  onOpenChange,
  commercialId,
  managerId,
  displayNom,
  displayPrenom,
  isManager,
  periodKey,
  contractStatuses,
}) {
  const [activeSection, setActiveSection] = useState('badges')
  const { data: contratsCommercial, loading: loadingContrats } = useContratsByCommercial(
    commercialId || 0,
    contractStatuses
  )
  const { data: contratsManager, loading: loadingContratsM } = useContratsByManager(
    managerId || 0,
    contractStatuses
  )
  const { data: badgesCommercial, loading: loadingBadges } = useCommercialBadges(commercialId || 0)
  const { data: badgesManager, loading: loadingBadgesM } = useManagerBadges(managerId || 0)

  const loading = commercialId
    ? loadingContrats || loadingBadges
    : loadingContratsM || loadingBadgesM
  const rawContrats = commercialId ? contratsCommercial : contratsManager
  const rawBadges = commercialId ? badgesCommercial : badgesManager
  const getPrimaryContractDate = useCallback(
    contrat => contrat.dateValidation || contrat.dateSignature || null,
    []
  )

  const formatDate = dateStr => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getPeriodField = useCallback(pk => {
    if (/^\d{4}-W\d{2}$/.test(pk)) return 'periodWeek'
    if (/^\d{4}-Q\d$/.test(pk)) return 'periodQuarter'
    if (/^\d{4}$/.test(pk)) return 'periodYear'
    if (/^\d{4}-\d{2}-\d{2}$/.test(pk)) return 'periodDay'
    if (/^\d{4}-\d{2}$/.test(pk)) return 'periodMonth'
    return 'periodMonth'
  }, [])

  const contrats = useMemo(() => {
    if (!rawContrats) return []
    const field = getPeriodField(periodKey)
    return rawContrats.filter(c => c[field] === periodKey)
  }, [rawContrats, periodKey, getPeriodField])

  const badges = useMemo(() => {
    return (rawBadges || [])
      .filter(b => b.periodKey === periodKey || b.periodKey === 'lifetime')
      .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime())
  }, [rawBadges, periodKey])

  const totalPoints = useMemo(
    () => contrats.reduce((sum, c) => sum + (c.offrePoints || 0), 0),
    [contrats]
  )

  const badgesByCategory = useMemo(() => {
    const grouped = {}
    for (const b of badges) {
      const cat = b.badgeDefinition?.category || 'AUTRE'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(b)
    }
    return grouped
  }, [badges])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {displayPrenom} {displayNom}
          </DialogTitle>
          <DialogDescription>Fiche du participant</DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getInitialColors(displayPrenom)}`}
              >
                {displayPrenom.charAt(0)}
                {displayNom.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base truncate">
                    {displayPrenom} {displayNom}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {isManager ? 'Manager' : 'Commercial'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{periodKey}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {badges.length}
                </span>
                <span className="text-[10px] text-amber-600/70 dark:text-amber-500">badges</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {contrats.length}
                </span>
                <span className="text-[10px] text-emerald-600/70 dark:text-emerald-500">
                  contrats
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 px-2.5 py-1.5">
                <Star className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                  {totalPoints}
                </span>
                <span className="text-[10px] text-sky-600/70 dark:text-sky-500">pts</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-4 border-b border-transparent -mb-4">
            {[
              { id: 'badges', label: 'Badges', icon: Shield, count: badges.length },
              { id: 'contrats', label: 'Contrats', icon: FileText, count: contrats.length },
            ].map(tab => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  activeSection === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                <span
                  className={`ml-0.5 tabular-nums rounded-full px-1.5 py-px text-[10px] ${
                    activeSection === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Chargement...
            </div>
          ) : badges.length === 0 && contrats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="p-3 rounded-full bg-muted/50 mb-3">
                <Trophy className="h-6 w-6 opacity-40" />
              </div>
              <p className="text-sm font-medium">Aucune activité</p>
              <p className="text-xs mt-1">Aucun badge ou contrat sur cette période</p>
            </div>
          ) : activeSection === 'badges' ? (
            <div className="p-5 space-y-5">
              {Object.keys(badgesByCategory).length > 0 ? (
                Object.entries(badgesByCategory).map(([category, catBadges]) => {
                  const style = CATEGORY_BADGE_STYLES[category] || CATEGORY_BADGE_STYLES.PROGRESSION
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1 rounded-md ${style.bg}`}>
                          <style.Icon className={`h-3.5 w-3.5 ${style.color}`} />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {category}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          ({catBadges.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {catBadges.map(badge => {
                          const def = badge.badgeDefinition
                          const badgeStyle =
                            CATEGORY_BADGE_STYLES[def?.category] ||
                            CATEGORY_BADGE_STYLES.PROGRESSION
                          const trigger = getBadgeTriggerLabel(def?.condition, badge.metadata)
                          const customUrl = def ? resolveBadgeCustomUrl(def) : null
                          const iconKey = def ? resolveBadgeIconKey(def) : null
                          return (
                            <div
                              key={badge.id}
                              className="group rounded-lg border border-border/70 hover:border-border p-3 transition-colors"
                            >
                              <div className="flex items-start gap-2.5">
                                <div
                                  className={`h-8 w-8 rounded-lg border ${badgeStyle.bg} ${badgeStyle.border} flex items-center justify-center shrink-0 overflow-hidden`}
                                >
                                  {customUrl ? (
                                    <img
                                      src={customUrl}
                                      alt=""
                                      aria-hidden="true"
                                      className="h-5 w-5 object-contain"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <GameIcon
                                      name={iconKey}
                                      size={20}
                                      className={badgeStyle.color}
                                    />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium truncate leading-tight">
                                    {def?.nom || 'Badge'}
                                  </p>
                                  {trigger && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-tight">
                                      {trigger}
                                    </p>
                                  )}
                                  <span className="text-[10px] text-muted-foreground/70">
                                    {formatDate(badge.awardedAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-5 w-5 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun badge obtenu</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5">
              {contrats.length > 0 ? (
                <div className="space-y-2">
                  {contrats.map(contrat => (
                    <div
                      key={contrat.id}
                      className="flex items-center gap-3 rounded-lg border border-border/70 hover:border-border p-3 transition-colors group"
                    >
                      {contrat.offreLogoUrl ? (
                        <img
                          src={getOffreLogoUrl(contrat.offreLogoUrl)}
                          alt=""
                          aria-hidden="true"
                          className="h-10 w-10 rounded-lg border border-border/50 object-contain bg-muted/30 p-1 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {contrat.offreNom || 'Offre inconnue'}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {[contrat.statutContrat, contrat.offreCategorie, contrat.offreFournisseur]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 shrink-0">
                        <div className="text-right text-xs">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                            <span>{formatDate(getPrimaryContractDate(contrat))}</span>
                          </div>
                          {contrat.dateSignature && (
                            <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                              <Pen className="h-3 w-3" />
                              <span>{formatDate(contrat.dateSignature)}</span>
                            </div>
                          )}
                        </div>
                        {contrat.offrePoints > 0 && (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            +{contrat.offrePoints}
                          </span>
                        )}
                      </div>
                      <div className="flex sm:hidden items-center gap-1.5 shrink-0">
                        {contrat.offrePoints > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{contrat.offrePoints}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(getPrimaryContractDate(contrat))}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-end pt-2 border-t border-border/50 mt-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted-foreground">Total :</span>
                      <span className="font-bold tabular-nums">{totalPoints} pts</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="text-muted-foreground tabular-nums">
                        {contrats.length} contrat{contrats.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-5 w-5 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun contrat pour les statuts sélectionnés</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const TAB_PATHS = {
  classement: '/gamification',
  badges: '/gamification/badges',
  mapping: '/gamification/mapping',
  offres: '/gamification/offres',
  sync: '/gamification/sync',
}

const getTabFromPathname = pathname => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPath.startsWith('/gamification/badges')) return 'badges'
  if (normalizedPath.startsWith('/gamification/mapping')) return 'mapping'
  if (normalizedPath.startsWith('/gamification/offres')) return 'offres'
  if (normalizedPath.startsWith('/gamification/sync')) return 'sync'
  return 'classement'
}

// =============================================================================
// Tab: Classement
// =============================================================================

function ClassementTab({
  ranking,
  rankPeriod,
  setRankPeriod,
  periodKey,
  rankingLoading,
  handleComputeRanking,
  computeRankingLoading,
  includeContratFinie,
  setIncludeContratFinie,
  selectedContractStatuses,
  setSelectedContractStatuses,
}) {
  const [selectedEntry, setSelectedEntry] = useState(null)
  const activeStatusLabels = useMemo(() => {
    if (!selectedContractStatuses?.length) return 'aucun'
    return CONTRACT_STATUS_FILTERS.filter(filter => selectedContractStatuses.includes(filter.value))
      .map(filter => filter.label.toLowerCase())
      .join(', ')
  }, [selectedContractStatuses])

  const toggleContractStatus = useCallback(
    statusValue => {
      setSelectedContractStatuses(currentStatuses => {
        if (currentStatuses.includes(statusValue)) {
          return currentStatuses.filter(status => status !== statusValue)
        }

        return [...currentStatuses, statusValue]
      })
    },
    [setSelectedContractStatuses]
  )

  const classementStats = useMemo(() => {
    if (!ranking?.length) return { total: 0, totalPoints: 0, totalContrats: 0 }
    return {
      total: ranking.length,
      totalPoints: ranking.reduce((sum, e) => sum + (e.points || 0), 0),
      totalContrats: ranking.reduce((sum, e) => sum + (e.contratsSignes || 0), 0),
    }
  }, [ranking])

  return (
    <div className="flex flex-col gap-4">
      {/* Stats résumé */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/40">
              <Trophy className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{classementStats.total}</div>
              <div className="text-xs text-muted-foreground">Participants</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Star className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {formatNumber(classementStats.totalPoints)}
              </div>
              <div className="text-xs text-muted-foreground">Points cumulés</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {formatNumber(classementStats.totalContrats)}
              </div>
              <div className="text-xs text-muted-foreground">Contrats retenus</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contrôles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900/30">
                  <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                Classement
              </CardTitle>
              <CardDescription>
                {RANK_PERIODS.find(p => p.value === rankPeriod)?.label} — Points basés sur le prix
                des contrats filtrés ({activeStatusLabels})
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={rankPeriod} onValueChange={setRankPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  {RANK_PERIODS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 bg-muted/30">
                <label
                  htmlFor="includeContratFinie"
                  className="text-xs font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                >
                  Contrats finis
                </label>
                <button
                  type="button"
                  id="includeContratFinie"
                  role="switch"
                  aria-checked={includeContratFinie}
                  onClick={() => setIncludeContratFinie(prev => !prev)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${includeContratFinie ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${includeContratFinie ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 bg-muted/30 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Statuts inclus
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CONTRACT_STATUS_FILTERS.map(filter => {
                    const isActive = selectedContractStatuses.includes(filter.value)
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => toggleContractStatus(filter.value)}
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground'}`}
                      >
                        {filter.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleComputeRanking}
                disabled={computeRankingLoading}
              >
                {computeRankingLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Recalculer
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rankingLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !ranking?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="p-3 rounded-full bg-muted mb-3">
                <Trophy className="h-8 w-8 opacity-50" />
              </div>
              <p className="font-medium">Aucun classement disponible</p>
              <p className="text-xs mt-1">Aucun résultat pour les statuts sélectionnés ({activeStatusLabels})</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rang</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Contrats retenus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map(entry => {
                  const displayNom = entry.commercialNom || entry.managerNom || ''
                  const displayPrenom = entry.commercialPrenom || entry.managerPrenom || ''
                  const isManager = !!entry.managerId && !entry.commercialId
                  return (
                    <TableRow
                      key={entry.id}
                      className={`${getRankRowClass(entry.rank)} cursor-pointer`}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell>{getRankIcon(entry.rank)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getInitialColors(displayPrenom)}`}
                          >
                            {displayPrenom.charAt(0)}
                            {displayNom.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`font-medium ${entry.rank <= 3 ? 'text-foreground' : ''}`}
                            >
                              {displayPrenom} {displayNom}
                              {isManager && (
                                <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5">
                                  Manager
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1">
                              {entry.commercialId ? (
                                <CommercialBadgesCell
                                  commercialId={entry.commercialId}
                                  periodKey={periodKey}
                                />
                              ) : entry.managerId ? (
                                <CommercialBadgesCell
                                  managerId={entry.managerId}
                                  periodKey={periodKey}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 ${getTierBadgeClass(entry.rankTierKey)}`}
                        >
                          {entry.rankTierKey ? (
                            <GameIcon
                              name={String(entry.rankTierKey).toLowerCase()}
                              group="tiers"
                              size={13}
                            />
                          ) : null}
                          {entry.rankTierLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-bold text-sky-700 tabular-nums dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-400">
                          {formatNumber(entry.points)} pts
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
                          {formatNumber(entry.contratsSignes)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DetailModal
        open={!!selectedEntry}
        onOpenChange={open => {
          if (!open) setSelectedEntry(null)
        }}
        commercialId={selectedEntry?.commercialId}
        managerId={selectedEntry?.managerId}
        displayNom={selectedEntry?.commercialNom || selectedEntry?.managerNom || ''}
        displayPrenom={selectedEntry?.commercialPrenom || selectedEntry?.managerPrenom || ''}
        isManager={!!selectedEntry?.managerId && !selectedEntry?.commercialId}
        periodKey={periodKey}
        contractStatuses={selectedContractStatuses}
      />
    </div>
  )
}

// =============================================================================
// Tab: Badges
// =============================================================================

function BadgesTab({
  filteredBadges,
  badgeStats,
  badgeCategoryFilter,
  setBadgeCategoryFilter,
  badgesLoading,
  handleSeedBadges,
  seedBadgesLoading,
  handleEvaluateBadges,
  evaluateBadgesLoading,
}) {
  const [search, setSearch] = useState('')

  const displayedBadges = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return filteredBadges || []

    return (filteredBadges || []).filter(badge => {
      const haystack =
        `${badge.nom || ''} ${badge.code || ''} ${badge.description || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [filteredBadges, search])

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/70">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={badgeCategoryFilter} onValueChange={setBadgeCategoryFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative w-full sm:w-72">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un badge..."
                  className="pl-8 h-9"
                />
              </div>

              <span className="text-sm text-muted-foreground">
                {displayedBadges.length} badge{displayedBadges.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedBadges}
                disabled={seedBadgesLoading}
              >
                {seedBadgesLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Initialiser
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEvaluateBadges}
                disabled={evaluateBadgesLoading}
              >
                {evaluateBadgesLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Évaluer
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Astuce: filtrez par catégorie puis recherchez par nom/code pour retrouver rapidement un
            badge.
          </div>
        </CardContent>
      </Card>

      {/* Statistiques des badges */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STAT_CARD_STYLES.map(stat => (
          <Card key={stat.label} className="border-border/70 hover:shadow-sm transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{badgeStats[stat.key]}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grille de badges */}
      {badgesLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !displayedBadges.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Shield className="h-8 w-8 mb-3 opacity-50" />
          <p>Aucun badge trouvé</p>
          <p className="text-xs mt-1">Essayez un autre filtre ou une autre recherche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedBadges.map(badge => (
            <Card
              key={badge.id}
              className="hover:shadow-md transition-all duration-200 border-border/80"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BadgeIcon badge={badge} />
                    <div className="min-w-0">
                      <span className="font-medium text-sm block truncate">{badge.nom}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {badge.code}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${getCategoryBadgeClass(badge.category)}`}
                  >
                    {getCategoryIcon(badge.category)}
                    {badge.category}
                  </span>
                </div>
                {badge.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {badge.description}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    Niveau {badge.tier}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-2 w-2 rounded-full ${badge.isActive ? 'bg-green-500 dark:bg-green-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                    />
                    <span
                      className={`text-[11px] ${badge.isActive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                    >
                      {badge.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Tab: Mapping
// =============================================================================

function MappingTab({
  mappingSuggestions,
  mappingStats,
  mappingLoading,
  handleConfirmMapping,
  confirmMappingLoading,
  handleRemoveMapping,
  removeMappingLoading,
  refetchMapping,
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Statistiques du mapping */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xl font-bold">{mappingStats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <div>
              <div className="text-xl font-bold">{mappingStats.mapped}</div>
              <div className="text-xs text-muted-foreground">Mappés</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <div>
              <div className="text-xl font-bold">{mappingStats.pending}</div>
              <div className="text-xs text-muted-foreground">En attente</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tableau de mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Mapping Pro-Win ↔ WinLead+
              </CardTitle>
              <CardDescription>
                Associez les commerciaux Pro-Win avec leurs comptes WinLead+
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refetchMapping}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mappingLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !mappingSuggestions?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Link2 className="h-8 w-8 mb-3 opacity-50" />
              <p>Aucune suggestion de mapping disponible</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commercial Pro-Win</TableHead>
                  <TableHead>Commercial WinLead+</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Confiance</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappingSuggestions.map(suggestion => (
                  <TableRow key={`${suggestion.prowinId}-${suggestion.prowinType}`}>
                    <TableCell>
                      <div className="font-medium">
                        {suggestion.prowinPrenom} {suggestion.prowinNom}
                      </div>
                      {suggestion.prowinEmail && (
                        <div className="text-xs text-muted-foreground">
                          {suggestion.prowinEmail}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {suggestion.winleadPlusNom ? (
                        <div>
                          <div className="font-medium">
                            {suggestion.winleadPlusPrenom} {suggestion.winleadPlusNom}
                          </div>
                          {suggestion.winleadPlusEmail && (
                            <div className="text-xs text-muted-foreground">
                              {suggestion.winleadPlusEmail}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Aucune correspondance</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {suggestion.prowinType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {suggestion.confidence != null ? (
                        <span
                          className={`font-semibold ${getConfidenceColor(suggestion.confidence)}`}
                        >
                          {suggestion.confidence}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {suggestion.alreadyMapped ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-600 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!suggestion.alreadyMapped && suggestion.winleadPlusId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConfirmMapping(suggestion)}
                            disabled={confirmMappingLoading}
                          >
                            {confirmMappingLoading ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              'Confirmer'
                            )}
                          </Button>
                        )}
                        {suggestion.alreadyMapped && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMapping(suggestion)}
                            disabled={removeMappingLoading}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
                          >
                            {removeMappingLoading ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Tab: Offres
// =============================================================================

function OffresTab({
  offres,
  offresLoading,
  editingOffre,
  setEditingOffre,
  handleSyncOffres,
  syncOffresLoading,
  handleUpdateOffrePoints,
  handleUpdateBadgeProductKey,
  updatePointsLoading,
}) {
  const [editPoints, setEditPoints] = useState('')

  const offreStats = useMemo(() => {
    if (!offres?.length) return { total: 0, assigned: 0, pending: 0 }
    const assigned = offres.filter(o => o.badgeProductKey && o.badgeProductKey !== 'NONE').length
    return { total: offres.length, assigned, pending: offres.length - assigned }
  }, [offres])

  const sortedOffres = useMemo(() => {
    if (!offres?.length) return []
    return [...offres].sort((a, b) => (b.points || 0) - (a.points || 0))
  }, [offres])

  const getOffreCategoryStyle = categorie => {
    const cat = (categorie || '').toLowerCase()
    if (cat.includes('mobile') || cat.includes('telecom'))
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800'
    if (cat.includes('fibre') || cat.includes('internet'))
      return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800'
    if (cat.includes('elec') || cat.includes('gaz') || cat.includes('energ'))
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
    if (cat.includes('assurance') || cat.includes('mutuelle'))
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
    if (cat.includes('tv') || cat.includes('divertissement'))
      return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-800'
    if (cat.includes('conciergerie') || cat.includes('service'))
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800'
    return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700'
  }

  const getInitialColors = name => {
    const palette = [
      'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
      'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
      'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
      'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
      'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
      'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    ]
    const index = (name || 'A').charCodeAt(0) % palette.length
    return palette[index]
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats résumé */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/40">
              <Package className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{offreStats.total}</div>
              <div className="text-xs text-muted-foreground">Total offres</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{offreStats.assigned}</div>
              <div className="text-xs text-muted-foreground">Badge assigné</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{offreStats.pending}</div>
              <div className="text-xs text-muted-foreground">Non assigné</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carte principale */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-sky-100 dark:bg-sky-900/30">
                  <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                Offres WinLead+
              </CardTitle>
              <CardDescription>
                Gérez les points et les clés produit badge pour chaque offre
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncOffres}
              disabled={syncOffresLoading}
            >
              {syncOffresLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Synchroniser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {offresLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !offres?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="p-3 rounded-full bg-muted mb-3">
                <Package className="h-8 w-8 opacity-50" />
              </div>
              <p className="font-medium">Aucune offre synchronisée</p>
              <p className="text-xs mt-1">Lancez la synchronisation pour importer les offres</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Offre</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Prix de base</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Clé Badge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOffres.map(offre => (
                  <TableRow key={offre.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {offre.logoUrl ? (
                          <img
                            src={getOffreLogoUrl(offre.logoUrl)}
                            alt={offre.fournisseur}
                            className="h-9 w-9 rounded-lg border border-border/50 object-contain p-0.5 bg-white dark:bg-muted"
                            onError={e => {
                              e.target.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold ${getInitialColors(offre.fournisseur)}`}
                          >
                            {(offre.fournisseur || 'O').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{offre.nom}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {offre.fournisseur}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getOffreCategoryStyle(offre.categorie)}`}
                      >
                        {offre.categorie}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {offre.prixBase != null ? (
                        <span className="font-medium">{formatNumber(offre.prixBase, 2)} €</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingOffre === offre.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editPoints}
                            onChange={e => setEditPoints(e.target.value)}
                            className="w-20 h-7 text-xs"
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleUpdateOffrePoints(offre.id, editPoints)
                              if (e.key === 'Escape') setEditingOffre(null)
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleUpdateOffrePoints(offre.id, editPoints)}
                            disabled={updatePointsLoading}
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditingOffre(null)}
                          >
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="inline-flex items-center rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-bold text-sky-700 tabular-nums dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-400">
                            {formatNumber(offre.points)} pts
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground transition-colors"
                            title="Modifier les points"
                            aria-label="Modifier les points"
                            onClick={() => {
                              setEditingOffre(offre.id)
                              setEditPoints(String(offre.points || 0))
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={offre.badgeProductKey || 'NONE'}
                        onValueChange={value => handleUpdateBadgeProductKey(offre.id, value)}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue placeholder="Aucune" />
                        </SelectTrigger>
                        <SelectContent>
                          {BADGE_PRODUCT_KEYS.map(k => (
                            <SelectItem key={k.value} value={k.value}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Tab: Synchronisation
// =============================================================================

function SyncTab({
  syncResults,
  handleSyncContrats,
  syncContratsLoading,
  handleSyncOffres,
  syncOffresLoading,
  handleEvaluateBadges,
  evaluateBadgesLoading,
  handleComputeRanking,
  computeRankingLoading,
  handleSeedBadges,
  seedBadgesLoading,
  rankPeriod,
  periodKey,
}) {
  const actions = [
    {
      key: 'contrats',
      title: 'Synchroniser les contrats',
      description: 'Importe les contrats validés depuis WinLead+',
      icon: FileText,
      action: handleSyncContrats,
      loading: syncContratsLoading,
    },
    {
      key: 'offres',
      title: 'Synchroniser les offres',
      description: 'Importe les offres depuis WinLead+',
      icon: Package,
      action: handleSyncOffres,
      loading: syncOffresLoading,
    },
    {
      key: 'badges',
      title: 'Évaluer les badges',
      description: "Lance l'évaluation pour tous les commerciaux",
      icon: Shield,
      action: handleEvaluateBadges,
      loading: evaluateBadgesLoading,
    },
    {
      key: 'ranking',
      title: 'Calculer le classement',
      description: `Recalcule le classement ${RANK_PERIODS.find(p => p.value === rankPeriod)?.label?.toLowerCase()} (${periodKey})`,
      icon: Trophy,
      action: handleComputeRanking,
      loading: computeRankingLoading,
    },
    {
      key: 'seed',
      title: 'Initialiser les badges',
      description: 'Crée le catalogue de 87 badges (idempotent)',
      icon: Download,
      action: handleSeedBadges,
      loading: seedBadgesLoading,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Actions de synchronisation
          </CardTitle>
          <CardDescription>
            Ces actions sont normalement exécutées automatiquement par le CRON (2h00 quotidien).
            Utilisez-les manuellement si nécessaire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actions.map(item => (
              <Card key={item.key} className="border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-2 rounded-md bg-muted">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{item.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={item.action}
                      disabled={item.loading}
                      className="shrink-0"
                    >
                      {item.loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Lancer'}
                    </Button>
                  </div>
                  {/* Résultat */}
                  {syncResults[item.key] && (
                    <div
                      className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${
                        syncResults[item.key].success
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      }`}
                    >
                      {syncResults[item.key].success ? (
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {syncResults[item.key].message}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// Page principale
// =============================================================================

export default function Gamification() {
  const logic = useGamificationLogic()
  const location = useLocation()
  const navigate = useNavigate()
  const routeTab = getTabFromPathname(location.pathname)

  useEffect(() => {
    if (logic.activeTab !== routeTab) {
      logic.setActiveTab(routeTab)
    }
  }, [logic, routeTab])

  const handleTabChange = tabId => {
    const targetPath = TAB_PATHS[tabId] || TAB_PATHS.classement
    logic.setActiveTab(tabId)
    if (location.pathname !== targetPath) {
      navigate(targetPath)
    }
  }

  if (logic.loading && !logic.ranking && !logic.offres && !logic.filteredBadges?.length) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-muted-foreground">Chargement de la gamification...</p>
          </div>
        </div>
      </div>
    )
  }

  if (logic.error && !logic.ranking && !logic.offres) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <XCircle className="h-8 w-8 mx-auto mb-4 text-red-600" />
            <p className="text-red-600 font-medium">Erreur lors du chargement</p>
            <p className="text-muted-foreground text-sm mt-2">{logic.error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gamification</h1>
        <p className="text-muted-foreground">
          Classement, badges et gestion du système de gamification
        </p>
      </div>

      {/* Barre d'onglets */}
      <div className="flex gap-1 border-b">
        {TABS.map(tab => {
          const isActive = logic.activeTab === tab.id
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Contenu des onglets */}
      {logic.activeTab === 'classement' && (
        <ClassementTab
          ranking={logic.ranking}
          rankPeriod={logic.rankPeriod}
          setRankPeriod={logic.setRankPeriod}
          periodKey={logic.periodKey}
          rankingLoading={logic.rankingLoading}
          handleComputeRanking={logic.handleComputeRanking}
          computeRankingLoading={logic.computeRankingLoading}
          includeContratFinie={logic.includeContratFinie}
          setIncludeContratFinie={logic.setIncludeContratFinie}
          selectedContractStatuses={logic.selectedContractStatuses}
          setSelectedContractStatuses={logic.setSelectedContractStatuses}
        />
      )}
      {logic.activeTab === 'badges' && (
        <BadgesTab
          filteredBadges={logic.filteredBadges}
          badgeStats={logic.badgeStats}
          badgeCategoryFilter={logic.badgeCategoryFilter}
          setBadgeCategoryFilter={logic.setBadgeCategoryFilter}
          badgesLoading={logic.badgesLoading}
          handleSeedBadges={logic.handleSeedBadges}
          seedBadgesLoading={logic.seedBadgesLoading}
          handleEvaluateBadges={logic.handleEvaluateBadges}
          evaluateBadgesLoading={logic.evaluateBadgesLoading}
        />
      )}
      {logic.activeTab === 'mapping' && (
        <MappingTab
          mappingSuggestions={logic.mappingSuggestions}
          mappingStats={logic.mappingStats}
          mappingLoading={logic.mappingLoading}
          handleConfirmMapping={logic.handleConfirmMapping}
          confirmMappingLoading={logic.confirmMappingLoading}
          handleRemoveMapping={logic.handleRemoveMapping}
          removeMappingLoading={logic.removeMappingLoading}
          refetchMapping={logic.refetchMapping}
        />
      )}
      {logic.activeTab === 'offres' && (
        <OffresTab
          offres={logic.offres}
          offresLoading={logic.offresLoading}
          editingOffre={logic.editingOffre}
          setEditingOffre={logic.setEditingOffre}
          handleSyncOffres={logic.handleSyncOffres}
          syncOffresLoading={logic.syncOffresLoading}
          handleUpdateOffrePoints={logic.handleUpdateOffrePoints}
          handleUpdateBadgeProductKey={logic.handleUpdateBadgeProductKey}
          updatePointsLoading={logic.updatePointsLoading}
          updateBadgeKeyLoading={logic.updateBadgeKeyLoading}
        />
      )}
      {logic.activeTab === 'sync' && (
        <SyncTab
          syncResults={logic.syncResults}
          handleSyncContrats={logic.handleSyncContrats}
          syncContratsLoading={logic.syncContratsLoading}
          handleSyncOffres={logic.handleSyncOffres}
          syncOffresLoading={logic.syncOffresLoading}
          handleEvaluateBadges={logic.handleEvaluateBadges}
          evaluateBadgesLoading={logic.evaluateBadgesLoading}
          handleComputeRanking={logic.handleComputeRanking}
          computeRankingLoading={logic.computeRankingLoading}
          handleSeedBadges={logic.handleSeedBadges}
          seedBadgesLoading={logic.seedBadgesLoading}
          rankPeriod={logic.rankPeriod}
          periodKey={logic.periodKey}
        />
      )}
    </div>
  )
}
