import {
  AGE_BUCKETS,
  ageBucketIndex,
  declaredDoorCount,
  effectiveTypeHabitat,
  isoWeekKey,
  median,
  normalizeDate,
  periodKeyFor,
  previousRange,
  roundRate,
  tauxConversion,
  type DeclarableImmeuble,
} from './statistic.metrics';

describe('statistic.metrics', () => {
  describe('roundRate', () => {
    it('arrondit à une décimale', () => {
      expect(roundRate(33.333333)).toBe(33.3);
      expect(roundRate(66.666666)).toBe(66.7);
    });

    it('laisse les entiers intacts', () => {
      expect(roundRate(100)).toBe(100);
      expect(roundRate(0)).toBe(0);
    });
  });

  describe('normalizeDate', () => {
    it('accepte une Date valide', () => {
      const date = new Date('2026-08-05T10:00:00.000Z');
      expect(normalizeDate(date)?.toISOString()).toBe('2026-08-05T10:00:00.000Z');
    });

    it('rejette une date invalide', () => {
      expect(normalizeDate(new Date('pas une date'))).toBeUndefined();
    });

    it('rejette une entrée absente', () => {
      expect(normalizeDate(undefined)).toBeUndefined();
    });
  });

  describe('median', () => {
    it('renvoie la valeur centrale sur une série impaire', () => {
      expect(median([5, 1, 3])).toBe(3);
    });

    it('moyenne les deux valeurs centrales sur une série paire', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('ne mute pas la série reçue', () => {
      const values = [3, 1, 2];
      median(values);
      expect(values).toEqual([3, 1, 2]);
    });

    it('renvoie 0 sur une série vide', () => {
      expect(median([])).toBe(0);
    });
  });

  describe('previousRange', () => {
    it('produit une plage contiguë de même durée', () => {
      const start = new Date('2026-08-01T00:00:00.000Z');
      const end = new Date('2026-08-31T23:59:59.999Z');

      const previous = previousRange(start, end);

      expect(previous).not.toBeNull();
      // La plage précédente s'arrête 1 ms avant le début de la courante : aucun
      // évènement ne peut tomber dans les deux.
      expect(previous!.endDate.getTime()).toBe(start.getTime() - 1);
      expect(previous!.endDate.getTime() - previous!.startDate.getTime()).toBe(
        end.getTime() - start.getTime(),
      );
    });

    it('gère une plage d’un seul instant', () => {
      const instant = new Date('2026-08-05T12:00:00.000Z');
      const previous = previousRange(instant, instant);

      expect(previous).not.toBeNull();
      expect(previous!.startDate.getTime()).toBe(instant.getTime() - 1);
      expect(previous!.endDate.getTime()).toBe(instant.getTime() - 1);
    });

    it('traverse correctement un changement d’année', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-01-31T23:59:59.999Z');

      const previous = previousRange(start, end);

      expect(previous!.endDate.getUTCFullYear()).toBe(2025);
      expect(previous!.endDate.getUTCMonth()).toBe(11); // décembre
    });

    it('renvoie null si une borne manque', () => {
      expect(previousRange(new Date(), undefined)).toBeNull();
      expect(previousRange(undefined, new Date())).toBeNull();
      expect(previousRange(undefined, undefined)).toBeNull();
    });

    it('renvoie null si les bornes sont inversées', () => {
      const start = new Date('2026-08-31T00:00:00.000Z');
      const end = new Date('2026-08-01T00:00:00.000Z');
      expect(previousRange(start, end)).toBeNull();
    });
  });

  describe('effectiveTypeHabitat', () => {
    it('laisse un immeuble et une maison inchangés', () => {
      expect(effectiveTypeHabitat({ typeHabitat: 'IMMEUBLE' })).toBe('IMMEUBLE');
      expect(effectiveTypeHabitat({ typeHabitat: 'MAISON' })).toBe('MAISON');
    });

    it('traite un pavillon legacy (nbPortesParEtage > 1) comme un immeuble', () => {
      expect(
        effectiveTypeHabitat({ typeHabitat: 'PAVILLON', nbPortesParEtage: 4 }),
      ).toBe('IMMEUBLE');
    });

    it('laisse un pavillon correct en pavillon', () => {
      expect(
        effectiveTypeHabitat({ typeHabitat: 'PAVILLON', nbPortesParEtage: 1 }),
      ).toBe('PAVILLON');
      expect(
        effectiveTypeHabitat({ typeHabitat: 'PAVILLON', nbPortesParEtage: null }),
      ).toBe('PAVILLON');
    });
  });

  describe('declaredDoorCount', () => {
    const base: DeclarableImmeuble = {
      typeHabitat: 'IMMEUBLE',
      nbEtages: 0,
      nbPortesParEtage: 0,
      nbMaisonsPrevu: null,
    };

    it('multiplie étages et portes par étage pour un immeuble', () => {
      expect(
        declaredDoorCount({ ...base, nbEtages: 5, nbPortesParEtage: 4 }),
      ).toBe(20);
    });

    it('vaut toujours 1 pour une maison', () => {
      expect(
        declaredDoorCount({
          ...base,
          typeHabitat: 'MAISON',
          nbEtages: 3,
          nbPortesParEtage: 4,
        }),
      ).toBe(1);
    });

    it('vaut nbMaisonsPrevu pour un pavillon', () => {
      expect(
        declaredDoorCount({
          ...base,
          typeHabitat: 'PAVILLON',
          nbPortesParEtage: 1,
          nbMaisonsPrevu: 12,
        }),
      ).toBe(12);
    });

    it('vaut 0 pour un pavillon sans nbMaisonsPrevu — couverture non calculable', () => {
      expect(
        declaredDoorCount({
          ...base,
          typeHabitat: 'PAVILLON',
          nbPortesParEtage: 1,
          nbMaisonsPrevu: null,
        }),
      ).toBe(0);
    });

    it('applique la règle legacy : un pavillon à plusieurs portes par étage compte comme un immeuble', () => {
      expect(
        declaredDoorCount({
          ...base,
          typeHabitat: 'PAVILLON',
          nbEtages: 3,
          nbPortesParEtage: 4,
          nbMaisonsPrevu: 99,
        }),
      ).toBe(12);
    });

    it('vaut 0 quand aucune grille n’est déclarée', () => {
      expect(declaredDoorCount(base)).toBe(0);
    });
  });

  describe('ageBucketIndex', () => {
    it('place les bornes hautes dans la bonne tranche', () => {
      expect(AGE_BUCKETS[ageBucketIndex(0)].label).toBe('0–3 j');
      expect(AGE_BUCKETS[ageBucketIndex(3)].label).toBe('0–3 j');
      expect(AGE_BUCKETS[ageBucketIndex(4)].label).toBe('4–7 j');
      expect(AGE_BUCKETS[ageBucketIndex(7)].label).toBe('4–7 j');
      expect(AGE_BUCKETS[ageBucketIndex(8)].label).toBe('8–14 j');
      expect(AGE_BUCKETS[ageBucketIndex(30)].label).toBe('15–30 j');
      expect(AGE_BUCKETS[ageBucketIndex(31)].label).toBe('+ de 30 j');
    });

    it('ne sort jamais du tableau, même sur une ancienneté absurde', () => {
      expect(AGE_BUCKETS[ageBucketIndex(100000)].label).toBe('+ de 30 j');
      // Horloge décalée : une visite « dans le futur » retombe sur la 1re tranche.
      expect(AGE_BUCKETS[ageBucketIndex(-5)].label).toBe('0–3 j');
    });
  });

  describe('isoWeekKey', () => {
    // Dates locales : le helper lit les composantes locales, comme le reste des
    // clés de période du projet.
    const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

    it('numérote une semaine ordinaire', () => {
      // 5 août 2026 est un mercredi, semaine 32.
      expect(isoWeekKey(local(2026, 8, 5))).toBe('2026-W32');
    });

    it('rattache le 1er janvier à l’année ISO de son jeudi', () => {
      // 1er janvier 2027 est un vendredi → ISO 2026-W53, pas 2027-W53.
      expect(isoWeekKey(local(2027, 1, 1))).toBe('2026-W53');
    });

    it('rattache une fin décembre à la première semaine de l’année suivante', () => {
      // 31 décembre 2024 est un mardi → ISO 2025-W01, pas 2024-W01.
      expect(isoWeekKey(local(2024, 12, 31))).toBe('2025-W01');
    });

    it('ne produit jamais deux fois la même clé pour deux semaines distinctes', () => {
      // Le défaut de `contrat.service.computePeriodKeys` : début et fin 2024
      // retombaient tous deux sur « 2024-W01 ».
      expect(isoWeekKey(local(2024, 1, 2))).toBe('2024-W01');
      expect(isoWeekKey(local(2024, 12, 31))).not.toBe('2024-W01');
    });

    it('donne la même clé pour tous les jours d’une même semaine ISO', () => {
      // Lundi 3 → dimanche 9 août 2026.
      const keys = [3, 4, 5, 6, 7, 8, 9].map((day) =>
        isoWeekKey(local(2026, 8, day)),
      );
      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toBe('2026-W32');
    });

    it('change de clé entre dimanche et lundi', () => {
      expect(isoWeekKey(local(2026, 8, 9))).toBe('2026-W32'); // dimanche
      expect(isoWeekKey(local(2026, 8, 10))).toBe('2026-W33'); // lundi
    });

    it('formate le numéro sur deux chiffres', () => {
      expect(isoWeekKey(local(2026, 1, 8))).toBe('2026-W02');
    });
  });

  describe('periodKeyFor', () => {
    const date = new Date(2026, 7, 5); // 5 août 2026, local

    it('produit une clé de jour', () => {
      expect(periodKeyFor(date, 'day')).toBe('2026-08-05');
    });

    it('produit une clé de mois', () => {
      expect(periodKeyFor(date, 'month')).toBe('2026-08');
    });

    it('produit une clé de semaine ISO', () => {
      expect(periodKeyFor(date, 'week')).toBe('2026-W32');
    });

    it('zéro-pad les mois et jours à un chiffre', () => {
      expect(periodKeyFor(new Date(2026, 0, 3), 'day')).toBe('2026-01-03');
      expect(periodKeyFor(new Date(2026, 0, 3), 'month')).toBe('2026-01');
    });

    it('produit des clés qui se trient dans l’ordre chronologique', () => {
      // Le front trie les points par `periodKey.localeCompare` : le format doit
      // garantir que l'ordre lexicographique est l'ordre du temps.
      const keys = [
        periodKeyFor(new Date(2026, 0, 3), 'day'),
        periodKeyFor(new Date(2026, 8, 12), 'day'),
        periodKeyFor(new Date(2026, 10, 1), 'day'),
      ];
      expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys);
    });
  });

  describe('tauxConversion', () => {
    it('rapporte les signés aux opportunités', () => {
      // 5 signés sur 5 + 3 RDV + 2 refus = 50 %
      expect(tauxConversion(5, 3, 2)).toBe(50);
    });

    it('vaut 0 sans aucune opportunité', () => {
      expect(tauxConversion(0, 0, 0)).toBe(0);
    });

    it('vaut 100 quand tout signe', () => {
      expect(tauxConversion(4, 0, 0)).toBe(100);
    });

    it('exclut les argumentés et absents du dénominateur', () => {
      // La signature du calcul ne les prend pas : c'est la définition retenue,
      // alignée sur `statsActivityByOwner`.
      expect(tauxConversion(1, 0, 1)).toBe(50);
    });
  });
});
