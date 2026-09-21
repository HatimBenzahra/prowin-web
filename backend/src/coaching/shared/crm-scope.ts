/**
 * Ce que le CRM voit du coaching.
 *
 * Le moteur sert plusieurs produits, et plusieurs organisations à l'intérieur de
 * chacun. Le CRM est l'un de ces appelants — celui qui s'appelle « prowin » — et il
 * n'a pas d'organisation : il est mono-client, et ses lignes portent la chaîne vide.
 *
 * Les deux vont toujours ensemble. `CRM_SOURCE` seul suffisait tant qu'aucun autre
 * produit n'écrivait de référentiel ; depuis, un plan « actif » ne veut plus rien dire
 * sans dire actif *chez qui*.
 */
export const CRM_SOURCE = 'prowin';
export const CRM_TENANT = '';
