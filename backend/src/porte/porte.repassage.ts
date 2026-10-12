import { StatutPorte } from './porte-status.constants';

/**
 * Règle de comptage des passages sur une porte laissée absente.
 *
 * Extraite de `PorteService.update` pour être testable : c'est une règle à trois
 * entrées dont un seul cas était couvert avant, et le cas manquant était le plus
 * fréquent.
 *
 * **Le problème corrigé.** La condition portait uniquement sur un CHANGEMENT de
 * statut, donc un repassage sur une porte déjà `ABSENT` n'incrémentait rien. Le
 * compteur restait à 1 quel que soit le nombre de passages, et l'état « Absent soir »
 * du mobile (`nbRepassages >= 2`, cf. `status-display.ts`) était inatteignable.
 *
 * **Le discriminant retenu : `derniereVisite`.** Les deux chemins qui représentent un
 * passage réel la posent — la session de prospection
 * (`use-prospection-session.ts`) et l'édition de statut du détail immeuble — alors
 * qu'une édition de commentaire seul ne l'envoie pas. On incrémente donc sur un
 * passage réel, jamais sur une simple retouche de fiche.
 */
export function shouldIncrementRepassages(params: {
  /** Statut demandé par la mise à jour (absent = pas de changement de statut). */
  nouveauStatut?: StatutPorte | string | null;
  /** Statut actuellement en base. */
  statutActuel: StatutPorte | string;
  /** Horodatage de visite fourni par l'appelant, marqueur d'un passage réel. */
  derniereVisite?: Date | string | null;
}): boolean {
  const { nouveauStatut, statutActuel, derniereVisite } = params;

  // Seules les portes laissées absentes alimentent le compteur de repassages.
  if (nouveauStatut !== StatutPorte.ABSENT) return false;

  const statutChangeVersAbsent = statutActuel !== nouveauStatut;
  const nouveauPassage = Boolean(derniereVisite);

  return statutChangeVersAbsent || nouveauPassage;
}
