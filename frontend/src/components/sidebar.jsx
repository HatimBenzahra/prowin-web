import {
  Home,
  ChevronDown,
  User2,
  Building2,
  MapPin,
  Navigation2,
  Headphones,
  BarChart3,
  Trophy,
  Users,
  ArrowLeft,
  LogOut,
  Minimize2,
  Maximize2,
  Briefcase,
  LayoutDashboard,
  Tablet,
  Package,
  Rocket,
  ScrollText,
  Target,
  GraduationCap,
} from 'lucide-react'
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import logoSvg from '@/assets/logo.svg'
import { useRole } from '@/contexts/userole'
import { hasPermission } from '@/hooks/metier/permissions/roleFilters'
import { useSidebarMode, SIDEBAR_MODES } from '@/hooks/ui/use-sidebar-mode'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible'
import { useDetailsSections } from '@/contexts/DetailsSectionsContext'
import { cn } from '@/lib/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar'

const mainItems = [{ title: 'Dashboard', url: '/', icon: Home, entity: 'dashboard', simple: true }]

const terrainItems = [
  { title: 'Bâtiments', url: '/immeubles', icon: Building2, entity: 'immeubles' },
  { title: 'Ciblage Acquiscan', url: '/adresses', icon: Target, entity: 'immeubles', simple: true },
  {
    title: 'Zones',
    // En vue simple, l'entrée devient un lien direct « Zones en cours » : /zones EST
    // déjà cette page, donc aucune route supplémentaire, et l'historique disparaît.
    simpleTitle: 'Zones en cours',
    simpleHideSubitems: true,
    url: '/zones',
    icon: MapPin,
    entity: 'zones',
    simple: true,
    subitems: [
      { title: 'Zones en cours', url: '/zones' },
      { title: 'Historique de zones', url: '/zones/historique' },
    ],
  },
  {
    title: 'Suivi GPS',
    url: '/gps-tracking',
    icon: Navigation2,
    entity: 'gps-tracking',
    simple: true,
  },
]

const teamItems = [
  {
    // Une seule entrée pour les trois annuaires. Le parent pointe sur la page la plus
    // consultée ; en vue simple il perd ses sous-items et devient un lien direct,
    // comme Zones.
    title: 'Utilisateurs',
    url: '/commerciaux',
    // En vue simple, une seule entrée plate vers la page fusionnée
    // commerciaux + managers ; les directeurs n'y figurent pas.
    simpleUrl: '/equipe',
    simpleHideSubitems: true,
    icon: Briefcase,
    entity: 'commerciaux',
    simple: true,
    subitems: [
      { title: 'Commerciaux', url: '/commerciaux' },
      { title: 'Managers', url: '/managers' },
      { title: 'Directeurs', url: '/directeurs' },
    ],
  },
]

const performanceItems = [
  {
    title: 'Statistiques',
    url: '/statistiques',
    icon: BarChart3,
    entity: 'statistics',
    simple: true,
  },
  {
    title: 'Classement',
    url: '/gamification',
    icon: Trophy,
    entity: 'gamification',
    exact: true,
    simple: true,
  },
  {
    title: 'Bibliothèque',
    url: '/ecoutes/enregistrement',
    icon: Headphones,
    entity: 'ecoutes',
  },
  {
    title: 'Coaching IA',
    url: '/coaching',
    icon: GraduationCap,
    entity: 'coaching',
  },
  {
    title: 'Gamification',
    url: '/gamification',
    icon: Trophy,
    entity: 'gamification',
    subitems: [
      { title: 'Badges', url: '/gamification/badges' },
      { title: 'Mapping', url: '/gamification/mapping' },
      { title: 'Offres', url: '/gamification/offres' },
      { title: 'Synchronisation', url: '/gamification/sync' },
    ],
  },
]

const administrationItems = [
  { title: 'Gestion', url: '/gestion', icon: Users, entity: 'gestion' },
  {
    title: 'Kiosk',
    url: '/kiosk',
    icon: Tablet,
    entity: 'kiosk',
    subitems: [
      { title: "Vue d'ensemble", url: '/kiosk', icon: LayoutDashboard },
      { title: 'Tablettes', url: '/kiosk/tablettes', icon: Tablet },
      { title: 'Releases', url: '/kiosk/releases', icon: Package },
      { title: 'Déploiements', url: '/kiosk/deploiements', icon: Rocket },
      { title: 'Logs', url: '/kiosk/logs', icon: ScrollText },
    ],
  },
]

const navigationGroups = [
  { label: 'Principal', items: mainItems },
  { label: 'Terrain', items: terrainItems },
  { label: 'Équipe', items: teamItems },
  { label: 'Performance', items: performanceItems },
  { label: 'Administration', items: administrationItems },
]

const items = navigationGroups.flatMap(group => group.items)

export function AppSidebar() {
  const { currentRole, logout } = useRole()
  const location = useLocation()
  const [openMenus, setOpenMenus] = React.useState({})
  const { sections, setFocusedSection } = useDetailsSections()
  const [activeSection, setActiveSection] = React.useState(null)
  const { mode, setMode, isSimple } = useSidebarMode()

  /**
   * Bascule de densité : on enregistre la préférence, puis on RECHARGE vers le tableau
   * de bord.
   *
   * Le rechargement seul ne suffirait pas — il rejouerait la même URL, et l'écran
   * courant peut très bien avoir disparu de la navigation cible (Coaching IA, Kiosk et
   * Gestion n'existent pas en vue simple ; /equipe n'existe pas en vue avancée). On
   * repart donc du Dashboard, seule page présente dans les deux vues.
   *
   * `location.assign` et non `navigate` : la sidebar, les permissions et les entrées
   * dérivées sont reconstruites à froid, sans état résiduel de l'ancienne vue.
   */
  const handleModeChange = nextMode => {
    if (nextMode === mode) return // déjà actif : pas de rechargement inutile
    setMode(nextMode) // écrit localStorage avant de quitter la page
    window.location.assign('/')
  }

  const normalizePath = value => {
    if (!value) return ''
    return value.replace(/\/+$/, '') || '/'
  }

  const isActiveRoute = (path, subitems = [], exact = false) => {
    const currentPath = normalizePath(location.pathname)
    const targetPath = normalizePath(path)

    if (!targetPath) return false
    if (targetPath === '/') {
      return currentPath === '/'
    }

    if (exact) {
      return currentPath === targetPath
    }

    // Si cet item a des sous-items, vérifier s'il y a une correspondance plus spécifique
    // Pour éviter que le parent soit actif quand un enfant est actif
    if (subitems.length > 0) {
      const hasMoreSpecificMatch = subitems.some(
        sub =>
          currentPath === normalizePath(sub.url) ||
          currentPath.startsWith(`${normalizePath(sub.url)}/`)
      )

      // Si un sous-item correspond mieux, utiliser une correspondance exacte pour le parent
      if (hasMoreSpecificMatch && currentPath !== targetPath) {
        return false
      }
    }

    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  }

  // Fonction pour gérer le scroll vers une section
  const handleScrollToSection = sectionId => {
    const element = document.getElementById(sectionId)
    if (element) {
      // Définir la section comme focusée pour l'effet visuel
      setFocusedSection(sectionId)

      // Calculer la position pour centrer vraiment l'élément
      const elementRect = element.getBoundingClientRect()
      const absoluteElementTop = elementRect.top + window.pageYOffset
      const middle = absoluteElementTop - window.innerHeight / 2 + elementRect.height / 2

      window.scrollTo({
        top: middle,
        behavior: 'smooth',
      })

      // Retirer l'effet de focus après 2 secondes
      setTimeout(() => {
        setFocusedSection(null)
      }, 2000)
    }
  }

  /**
   * Groupes réellement affichés : un item doit passer les DEUX filtres — la
   * permission du rôle et, en vue simple, son drapeau `simple`. Aucun ne remplace
   * l'autre. Les groupes qui se vident disparaissent, ce qui fait tomber tout le
   * groupe Administration en vue simple.
   */
  const visibleGroups = React.useMemo(() => {
    return navigationGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          if (item.entity && !hasPermission(currentRole, item.entity, 'view')) return false
          return isSimple ? Boolean(item.simple) : true
        }),
      }))
      .filter(group => group.items.length > 0)
  }, [currentRole, isSimple])

  // Enrichir les items du menu avec les sections dynamiques pour les pages de détails
  const enrichedItems = React.useMemo(() => {
    return items.map(item => {
      // Si on est sur une page de détails et qu'il y a des sections disponibles
      if (sections.length > 0 && location.pathname.includes(item.url) && item.url !== '/') {
        // Vérifier si on est sur une page de détail (avec un ID dans l'URL)
        const isDetailPage =
          location.pathname !== item.url && location.pathname.startsWith(item.url + '/')

        if (isDetailPage) {
          // Créer un premier sous-item pour retourner au tableau principal
          const backToListItem = {
            title: `Voir tous les ${item.title}`,
            url: item.url,
            isBackLink: true, // Marquer comme lien de retour
          }

          // Créer des sous-items à partir des sections
          const dynamicSubitems = sections.map(section => ({
            title: section.title,
            id: section.id,
            isSection: true, // Marquer comme section pour gérer différemment
          }))

          return {
            ...item,
            subitems: [backToListItem, ...dynamicSubitems], // Ajouter le lien de retour en premier
          }
        }
      }
      return item
    })
  }, [sections, location.pathname])

  // Ouvrir automatiquement le menu qui contient des sections dynamiques
  React.useEffect(() => {
    enrichedItems.forEach(item => {
      if (item.subitems && item.subitems.some(sub => sub.isSection)) {
        setOpenMenus(prev => ({ ...prev, [item.title]: true }))
      }
    })
  }, [enrichedItems])

  // Détecter la section active en fonction du scroll
  React.useEffect(() => {
    if (sections.length === 0) return

    const handleScroll = () => {
      // Vérifier si on est en bas de la page
      const isBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 10

      // Si on est en bas, activer la dernière section
      if (isBottom && sections.length > 0) {
        setActiveSection(sections[sections.length - 1].id)
        return
      }

      // Récupérer toutes les sections
      const sectionElements = sections.map(section => ({
        id: section.id,
        element: document.getElementById(section.id),
      }))

      // Trouver quelle section est actuellement visible
      // On considère qu'une section est active si elle est dans le tiers supérieur de l'écran
      const scrollPosition = window.scrollY + 200

      let currentActiveSection = null

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const section = sectionElements[i]
        if (section.element) {
          const offsetTop = section.element.offsetTop
          if (scrollPosition >= offsetTop) {
            currentActiveSection = section.id
            break
          }
        }
      }
      if (!currentActiveSection && sections.length > 0) {
        currentActiveSection = sections[0].id
      }

      setActiveSection(currentActiveSection)
    }

    // Écouter les événements de scroll
    window.addEventListener('scroll', handleScroll)
    // Appeler une première fois pour initialiser
    handleScroll()

    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections])

  const renderMenuItem = item => {
    if (item.subitems) {
      const isAnySubitemActive = item.subitems.some(sub => isActiveRoute(sub.url))
      return (
        <Collapsible
          key={item.title}
          open={openMenus[item.title] ?? isAnySubitemActive}
          onOpenChange={open => setOpenMenus(prev => ({ ...prev, [item.title]: open }))}
          className="group/collapsible"
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton tooltip={item.title} isActive={isAnySubitemActive}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
                <ChevronDown className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.subitems.map(subitem => (
                  <SidebarMenuSubItem key={subitem.title}>
                    {subitem.isSection ? (
                      <SidebarMenuSubButton
                        onClick={() => handleScrollToSection(subitem.id)}
                        isActive={activeSection === subitem.id}
                      >
                        <span>{subitem.title}</span>
                      </SidebarMenuSubButton>
                    ) : subitem.isBackLink ? (
                      <SidebarMenuSubButton
                        asChild
                        isActive={false}
                        className="font-semibold text-primary"
                      >
                        <Link to={subitem.url}>
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          <span>{subitem.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    ) : (
                      <SidebarMenuSubButton
                        asChild
                        isActive={isActiveRoute(subitem.url, item.subitems)}
                      >
                        <Link to={subitem.url}>
                          <span>{subitem.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    )}
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      )
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild={!item.disabled}
          isActive={isActiveRoute(item.url, item.subitems, item.exact)}
          disabled={item.disabled}
          tooltip={item.disabled ? 'Bientôt disponible' : item.title}
          className={cn(item.disabled && 'opacity-40 cursor-not-allowed')}
        >
          {item.disabled ? (
            <div className="flex w-full items-center gap-3">
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </div>
          ) : (
            <Link to={item.url} className="flex w-full items-center gap-3">
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </Link>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon" data-sidebar="sidebar">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent/50">
              <Link to="/" className="gap-3">
                <img src={logoSvg} alt="Pro-Win" className="size-10 rounded-xl shadow-md" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-tight">Pro-Win</span>
                  <span className="truncate text-[11px] text-sidebar-foreground/50 font-medium">
                    Prospection
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-1 py-2">
        {visibleGroups.map((group, idx) => (
          <SidebarGroup
            key={group.label}
            className={cn('px-2 py-1', idx > 0 && 'mt-2 border-t border-sidebar-border/50 pt-3')}
          >
            <SidebarGroupLabel className="h-6 mb-1 px-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map(item => {
                  const enriched = enrichedItems.find(e => e.title === item.title) || item
                  // En vue simple, une entrée peut porter un libellé dédié et masquer
                  // son sous-menu — mais seulement si elle le demande. Utilisateurs
                  // garde ses trois sous-onglets, sinon Managers et Directeurs
                  // deviendraient inatteignables dans cette vue.
                  const displayed = isSimple
                    ? {
                        ...enriched,
                        title: item.simpleTitle || item.title,
                        url: item.simpleUrl || enriched.url,
                        subitems: item.simpleHideSubitems ? undefined : enriched.subitems,
                      }
                    : enriched
                  return renderMenuItem(displayed)
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        {/* Bascule de densité de navigation, en primitives shadcn : `SidebarMenuButton`
            gère seul le mode replié (icône seule) et n'affiche le tooltip que dans cet
            état, via son `useSidebar()` interne. */}
        <SidebarMenu>
          {[
            { value: SIDEBAR_MODES.SIMPLE, label: 'Vue simple', icon: Minimize2 },
            { value: SIDEBAR_MODES.ADVANCED, label: 'Vue avancée', icon: Maximize2 },
          ].map(option => {
            const Icon = option.icon
            return (
              <SidebarMenuItem key={option.value}>
                <SidebarMenuButton
                  onClick={() => handleModeChange(option.value)}
                  isActive={mode === option.value}
                  aria-pressed={mode === option.value}
                  tooltip={option.label}
                  size="sm"
                >
                  <Icon />
                  <span>{option.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={`Utilisateur - ${currentRole}`}
              className="w-full"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
                <User2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Utilisateur</span>
                <span className="truncate text-xs capitalize text-sidebar-foreground/50">
                  {currentRole}
                </span>
              </div>
              <LogOut
                className="h-4 w-4 text-sidebar-foreground/40 hover:text-destructive cursor-pointer transition-colors ml-auto"
                onClick={e => {
                  e.stopPropagation()
                  logout()
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
