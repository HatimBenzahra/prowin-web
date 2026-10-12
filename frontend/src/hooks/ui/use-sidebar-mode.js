import { useCallback, useState } from 'react'

const STORAGE_KEY = 'sidebar-mode'

export const SIDEBAR_MODES = {
  SIMPLE: 'simple',
  ADVANCED: 'advanced',
}

/**
 * Mode d'affichage de la sidebar : `simple` ne montre que l'essentiel, `advanced`
 * toute la navigation.
 *
 * Persisté dans localStorage comme la préférence de thème. C'est donc une préférence
 * par navigateur et non par compte : un même utilisateur peut retrouver un mode
 * différent sur un autre poste. Le lier au profil demanderait un champ backend.
 *
 * Le défaut est `simple` : c'est la navigation du quotidien, et celle qu'on recommande.
 * Le mode complet reste à un clic, et le choix est mémorisé — un utilisateur qui a
 * basculé en `advanced` le retrouve tel quel. Seule l'ABSENCE de préférence retombe sur
 * `simple`, d'où la comparaison sur `advanced` et non sur `simple`.
 */
export function useSidebarMode() {
  const [mode, setModeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === SIDEBAR_MODES.ADVANCED ? SIDEBAR_MODES.ADVANCED : SIDEBAR_MODES.SIMPLE
  })

  const setMode = useCallback(nextMode => {
    if (nextMode !== SIDEBAR_MODES.SIMPLE && nextMode !== SIDEBAR_MODES.ADVANCED) {
      console.error('Sidebar mode must be "simple" or "advanced"')
      return
    }
    localStorage.setItem(STORAGE_KEY, nextMode)
    setModeState(nextMode)
  }, [])

  return {
    mode,
    setMode,
    isSimple: mode === SIDEBAR_MODES.SIMPLE,
  }
}
