import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Retour arrière d'une page de détail : on revient d'où l'on vient, et seulement à
 * défaut sur la page parente.
 *
 * **Pourquoi pas un lien en dur.** Une fiche de détail se rejoint depuis beaucoup
 * d'endroits : un commercial s'ouvre depuis la liste, mais aussi depuis le Dashboard,
 * la page Localisation, la page Équipe, la page Statistiques, et depuis la fiche de
 * son manager. Un « Retour aux commerciaux » codé en dur renvoie donc vers une liste
 * que l'utilisateur n'a pas visitée — et dans le cas de la fiche manager, lui fait
 * perdre le contexte dans lequel il travaillait.
 *
 * **Pourquoi pas `navigate(-1)` tout court.** Sur un lien partagé ou après un
 * rafraîchissement, il n'existe aucune entrée d'historique interne : reculer ferait
 * sortir de l'application. `location.key` vaut `'default'` exactement dans ce cas
 * (react-router), ce qui permet de retomber proprement sur le parent.
 *
 * Le repli utilise `replace` : la page de détail dont on sort ne doit pas rester dans
 * l'historique, sinon le bouton retour du navigateur y ramène en boucle.
 *
 * @param {string} fallbackPath - Page parente canonique, utilisée sans historique.
 * @returns {() => void} Handler à brancher sur le bouton de retour.
 */
export function useBackNavigation(fallbackPath) {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    // 'default' = entrée initiale de la session de navigation, donc rien derrière.
    if (location.key !== 'default') {
      navigate(-1)
      return
    }
    navigate(fallbackPath, { replace: true })
  }, [navigate, location.key, fallbackPath])
}
