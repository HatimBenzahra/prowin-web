import * as fs from 'fs';
import * as path from 'path';

/**
 * Chaque lecture d'analyses du CRM doit être bornée à ses propres échanges :
 * la table est partagée avec les autres apps qui consomment le service.
 */
describe('cloisonnement des lectures du CRM', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'lecture', 'coaching-query.service.ts'),
    'utf8',
  );

  it('toute requête sur coachingAnalysis porte le filtre de source', () => {
    const reads = file.match(
      /coachingAnalysis\.(findMany|count|groupBy|findFirst)\(\{[\s\S]{0,400}?\n\s{4,6}\}\)/g,
    );
    expect(reads).not.toBeNull();
    const unscoped = (reads ?? ([] as string[])).filter(
      (r: string) => !r.includes('CRM_SOURCE') && !r.includes('where,'),
    );
    expect(unscoped).toEqual([]);
  });

  it('la lecture par id retombe sur prowin par défaut', () => {
    expect(file).toContain('source: string = this.CRM_SOURCE');
    expect(file).toContain('row.source !== source');
  });
});
