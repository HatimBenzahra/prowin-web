import { StatutPorte } from './porte-status.constants';
import { shouldIncrementRepassages } from './porte.repassage';

describe('shouldIncrementRepassages', () => {
  const visite = new Date('2026-08-05T09:00:00.000Z');

  describe('premier passage', () => {
    it('incrémente quand une porte non visitée devient absente', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.NON_VISITE,
          derniereVisite: visite,
        }),
      ).toBe(true);
    });

    it('incrémente même sans derniereVisite, car le statut change', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.NON_VISITE,
          derniereVisite: null,
        }),
      ).toBe(true);
    });
  });

  describe('repassage sur une porte déjà absente — le cas qui était cassé', () => {
    it('incrémente quand un nouveau passage est horodaté', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.ABSENT,
          derniereVisite: visite,
        }),
      ).toBe(true);
    });

    it('accepte aussi une date sous forme de chaîne ISO', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.ABSENT,
          derniereVisite: '2026-08-05T09:00:00.000Z',
        }),
      ).toBe(true);
    });

    it('n’incrémente PAS sans nouveau passage — édition de commentaire seul', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.ABSENT,
          derniereVisite: null,
        }),
      ).toBe(false);
    });

    it('n’incrémente PAS quand derniereVisite est absent du payload', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: StatutPorte.ABSENT,
          statutActuel: StatutPorte.ABSENT,
        }),
      ).toBe(false);
    });
  });

  describe('statuts qui ne concernent pas le repassage', () => {
    it.each([
      StatutPorte.CONTRAT_SIGNE,
      StatutPorte.REFUS,
      StatutPorte.ARGUMENTE,
      StatutPorte.RENDEZ_VOUS_PRIS,
      StatutPorte.NON_VISITE,
    ])('n’incrémente pas pour %s', (statut) => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: statut,
          statutActuel: StatutPorte.ABSENT,
          derniereVisite: visite,
        }),
      ).toBe(false);
    });

    it('n’incrémente pas quand la mise à jour ne porte pas de statut', () => {
      expect(
        shouldIncrementRepassages({
          nouveauStatut: undefined,
          statutActuel: StatutPorte.ABSENT,
          derniereVisite: visite,
        }),
      ).toBe(false);
    });
  });

  describe('scénario terrain complet', () => {
    it('compte trois passages sur trois visites successives laissées absentes', () => {
      // Reproduit la séquence réelle : 1er passage puis deux repassages, tous
      // horodatés par la session de prospection. Avant le correctif, seul le
      // premier était compté et « Absent soir » (>= 2) restait inatteignable.
      let nbRepassages = 0;
      let statutActuel: string = StatutPorte.NON_VISITE;

      for (let passage = 0; passage < 3; passage++) {
        if (
          shouldIncrementRepassages({
            nouveauStatut: StatutPorte.ABSENT,
            statutActuel,
            derniereVisite: new Date(visite.getTime() + passage * 86400000),
          })
        ) {
          nbRepassages += 1;
        }
        statutActuel = StatutPorte.ABSENT;
      }

      expect(nbRepassages).toBe(3);
      // Le mobile bascule sur « Absent soir » dès 2.
      expect(nbRepassages >= 2).toBe(true);
    });

    it('ne gonfle pas le compteur sur des retouches de commentaire répétées', () => {
      let nbRepassages = 1;

      for (let edition = 0; edition < 5; edition++) {
        if (
          shouldIncrementRepassages({
            nouveauStatut: StatutPorte.ABSENT,
            statutActuel: StatutPorte.ABSENT,
            derniereVisite: null,
          })
        ) {
          nbRepassages += 1;
        }
      }

      expect(nbRepassages).toBe(1);
    });
  });
});
