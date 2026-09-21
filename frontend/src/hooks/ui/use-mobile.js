import * as React from 'react'

// Seuil de bascule de la sidebar, son unique consommateur : au-dessus elle est fixe et
// occupe 16rem, en dessous elle devient un tiroir. 1024 et non 768 parce qu'à 768 les
// 256 px de sidebar prenaient la moitié de l'écran — il ne restait que 512 px à la page,
// et l'en-tête applicatif débordait sur dix pages.
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
