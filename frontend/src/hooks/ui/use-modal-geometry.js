import { useSidebar } from '@/hooks/ui/use-sidebar'

/**
 * Géométrie des grandes modales qui occupent la zone à droite de la sidebar plutôt que
 * le viewport entier — celles du coaching aujourd'hui.
 *
 * La largeur réellement prise par la sidebar ne peut pas être devinée : 16rem déployée,
 * 3rem repliée en icônes, rien du tout en tiroir. Elle était codée en dur
 * (`lg:ml-[9.5rem] lg:w-[calc(100vw-19rem)]`), si bien qu'une sidebar repliée laissait
 * la modale décalée de 304 px, plus centrée sur rien. On lit son état.
 *
 * `useSidebar` reste accessible depuis une modale : le portail Radix déplace le DOM,
 * pas l'arbre React.
 *
 * Les valeurs 16rem / 3rem sont celles de `components/ui/sidebar`.
 */
export function useModalGeometry({ gutter = '3rem' } = {}) {
  const { isMobile, state } = useSidebar()
  const sidebar = isMobile ? '0rem' : state === 'collapsed' ? '3rem' : '16rem'

  return {
    // `DialogContent` centre sur le viewport : on le repousse d'une demi-sidebar pour
    // le recentrer sur la zone de contenu.
    marginLeft: `calc(${sidebar} / 2)`,
    width: `calc(100vw - ${sidebar} - ${gutter})`,
  }
}
