import { buildSynthesisSystemPrompt } from '../synthese-globale/synthesis-prompt';

/** Sans ces agrégats, la synthèse constate une baisse sans pouvoir en dire la cause. */
describe('synthèse — conformité produit', () => {
  const prompt = buildSynthesisSystemPrompt();

  it('décrit les agrégats de conformité fournis', () => {
    expect(prompt).toContain('coaching.conformite.recurrents');
    expect(prompt).toContain('nbEchangesAvecEcart');
    expect(prompt).toContain('malusMoyen');
  });

  it('demande de commenter le récurrent, pas l’isolé', () => {
    expect(prompt).toMatch(/écart ISOLÉ ne se commente pas/i);
    expect(prompt).toMatch(/RÉCURRENT se commente/i);
  });

  // Déjà retiré par ScoringService : le recompter sanctionnerait deux fois.
  it('interdit de recompter le malus déjà déduit', () => {
    expect(prompt).toMatch(/DÉJÀ déduits du score/);
  });

  // Décidé avec le métier : on ne félicite pas un commercial parce qu'il n'a pas menti.
  it('interdit de saluer l’absence d’écart', () => {
    expect(prompt).toMatch(/nbEcarts` vaut 0.*AUCUN paragraphe/s);
  });

  it('impose le paragraphe dédié uniquement s’il y a des écarts', () => {
    expect(prompt).toMatch(/si `coaching\.conformite\.nbEcarts` > 0/);
    expect(prompt).toContain('**Conformité produit.**');
  });
});
