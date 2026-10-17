import {
  centroid,
  enclosingRadiusMeters,
  parseRing,
  pointInRing,
  pointInZone,
  polygonAreaM2,
  type Ring,
} from './zone.geometry';

describe('zone.geometry', () => {
  // Petit carré ~111 m de côté proche de l'équateur (lng/lat en degrés).
  const square: Ring = [
    [0, 0],
    [0.001, 0],
    [0.001, 0.001],
    [0, 0.001],
  ];

  describe('parseRing', () => {
    it('normalise un anneau ouvert valide', () => {
      expect(parseRing(square)).toEqual(square);
    });

    it('retire le point de fermeture dupliqué (anneau fermé)', () => {
      const closed: Ring = [...square, [0, 0]];
      expect(parseRing(closed)).toEqual(square);
    });

    it('rejette une entrée non tableau', () => {
      expect(() => parseRing('nope' as unknown)).toThrow();
    });

    it('rejette une coordonnée non numérique', () => {
      expect(() =>
        parseRing([
          [0, 0],
          ['a', 1],
          [1, 1],
        ] as unknown),
      ).toThrow();
    });

    it('rejette moins de 3 sommets distincts', () => {
      expect(() =>
        parseRing([
          [0, 0],
          [1, 1],
          [0, 0],
        ]),
      ).toThrow();
    });
  });

  describe('centroid', () => {
    it('retourne la moyenne des sommets (xOrigin=lng, yOrigin=lat)', () => {
      const c = centroid(square);
      expect(c.xOrigin).toBeCloseTo(0.0005, 10);
      expect(c.yOrigin).toBeCloseTo(0.0005, 10);
    });
  });

  describe('enclosingRadiusMeters', () => {
    it('retourne la distance haversine max centre -> sommet (positive)', () => {
      const center = centroid(square);
      const radius = enclosingRadiusMeters(center, square);
      // Demi-diagonale d'un carré de ~111 m => ~78 m.
      expect(radius).toBeGreaterThan(70);
      expect(radius).toBeLessThan(90);
    });

    it('couvre bien tous les sommets', () => {
      const center = centroid(square);
      const radius = enclosingRadiusMeters(center, square);
      // Le rayon englobant est >= distance à chaque sommet par construction.
      expect(radius).toBeGreaterThan(0);
    });
  });

  describe('polygonAreaM2', () => {
    it('approxime l’aire d’un carré ~111 m de côté', () => {
      const area = polygonAreaM2(square);
      // ~111.19 m de côté => ~12360 m².
      expect(area).toBeGreaterThan(11000);
      expect(area).toBeLessThan(14000);
    });

    it('est insensible au sens de parcours (valeur absolue)', () => {
      const reversed: Ring = [...square].reverse();
      expect(polygonAreaM2(reversed)).toBeCloseTo(polygonAreaM2(square), 3);
    });
  });

  describe('pointInRing', () => {
    it('détecte un point à l’intérieur', () => {
      expect(pointInRing(0.0005, 0.0005, square)).toBe(true);
    });

    it('détecte un point à l’extérieur', () => {
      expect(pointInRing(0.002, 0.002, square)).toBe(false);
      expect(pointInRing(-0.001, 0.0005, square)).toBe(false);
    });

    it('traite un anneau concave (forme en L) correctement', () => {
      // Polygone en L : le "coin" retiré est hors de la forme.
      const shapeL: Ring = [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ];
      expect(pointInRing(0.5, 0.5, shapeL)).toBe(true); // bras bas-gauche
      expect(pointInRing(1.5, 1.5, shapeL)).toBe(false); // coin retiré
    });
  });

  describe('pointInZone', () => {
    const polygonZone = {
      polygon: square as unknown,
      xOrigin: 0.0005,
      yOrigin: 0.0005,
      rayon: 0,
    };

    it('utilise le polygone quand il est valide (dedans/dehors)', () => {
      expect(pointInZone(0.0005, 0.0005, polygonZone)).toBe(true);
      expect(pointInZone(0.01, 0.01, polygonZone)).toBe(false);
    });

    it('retombe sur le disque hérité quand polygon est null', () => {
      // Cercle de 100 m centré sur [lng=0, lat=0].
      const circleZone = { polygon: null, xOrigin: 0, yOrigin: 0, rayon: 100 };
      expect(pointInZone(0, 0, circleZone)).toBe(true); // centre
      expect(pointInZone(0.001, 0, circleZone)).toBe(false); // ~111 m à l’est > 100 m
    });

    it('retombe sur le disque quand polygon est invalide', () => {
      const badPolygonZone = {
        polygon: [[0, 0]] as unknown,
        xOrigin: 0,
        yOrigin: 0,
        rayon: 100,
      };
      expect(pointInZone(0, 0, badPolygonZone)).toBe(true);
      expect(pointInZone(0.001, 0, badPolygonZone)).toBe(false);
    });
  });
});
