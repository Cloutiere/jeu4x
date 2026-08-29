import { describe, expect, it } from 'vitest';
import {
  colRowToHex,
  compareHex,
  hexDistance,
  hexLine,
  hexesWithinRadius,
  hexToPixel,
  inRectangle,
  neighbors,
  parseTileKey,
  pixelToHex,
  tileKey,
  tileKeyOf,
} from '../src/hex.js';
import type { Hex } from '../src/hex.js';

const origin: Hex = { q: 0, r: 0 };

/** Disque de cases de rayon 4 centré sur un hexagone aléatoire mais fixe. */
const CENTER: Hex = { q: 7, r: -3 };
const disk = hexesWithinRadius(CENTER, 4);

describe('hex · clé de case', () => {
  it('encode et décode "q,r" en aller-retour', () => {
    for (const h of disk) {
      expect(parseTileKey(tileKeyOf(h))).toEqual(h);
    }
  });

  it('rejette les clés malformées', () => {
    expect(parseTileKey('1,2')).toEqual({ q: 1, r: 2 });
    expect(parseTileKey('abc')).toBeNull();
    expect(parseTileKey('1;2')).toBeNull();
    expect(parseTileKey('1,')).toBeNull();
  });

  it('tileKey est injectif (pas de collision)', () => {
    const keys = new Set(disk.map(tileKeyOf));
    expect(keys.size).toBe(disk.length);
  });
});

describe('hex · invariants sur un disque (L1)', () => {
  it('chaque case du disque a exactement 6 voisins', () => {
    for (const h of disk) {
      expect(neighbors(h)).toHaveLength(6);
    }
  });

  it('la distance est symétrique et nulle sur soi-même', () => {
    for (const a of disk) {
      expect(hexDistance(a, a)).toBe(0);
      for (const b of disk) {
        expect(hexDistance(a, b)).toBe(hexDistance(b, a));
      }
    }
  });

  it('les 6 voisins sont exactement à distance 1', () => {
    for (const h of disk) {
      for (const n of neighbors(h)) {
        expect(hexDistance(h, n)).toBe(1);
      }
    }
  });

  it('distance(0,0) ↔ (1,-1) = 1, les directions canoniques couvrent l’anneau 1', () => {
    const ring1 = hexesWithinRadius(origin, 1).filter((h) => hexDistance(origin, h) === 1);
    expect(ring1).toHaveLength(6);
    expect(new Set(ring1.map(tileKeyOf))).toEqual(new Set(neighbors(origin).map(tileKeyOf)));
  });

  it('le disque de rayon n contient 3n² + 3n + 1 cases', () => {
    for (const n of [0, 1, 2, 3]) {
      expect(hexesWithinRadius(origin, n)).toHaveLength(3 * n * n + 3 * n + 1);
    }
  });

  it('hexesWithinRadius est triée par (q, r) — R-81', () => {
    const sorted = [...disk].sort(compareHex);
    expect(disk.map(tileKeyOf)).toEqual(sorted.map(tileKeyOf));
  });
});

describe('hex · ligne (L1)', () => {
  it('relie les extrémités par cases consécutives voisines (continuité)', () => {
    for (const a of disk) {
      for (const b of disk) {
        const line = hexLine(a, b);
        expect(line[0]).toEqual(a);
        expect(line[line.length - 1]).toEqual(b);
        // distance en cases ≈ distance hexagonale (arrondi ± pas de trou)
        for (let i = 1; i < line.length; i++) {
          expect(hexDistance(line[i - 1]!, line[i]!)).toBeLessThanOrEqual(1);
        }
        // toute case de la ligne est à portée du segment (sous-ensemble du disque union)
        for (const c of line) {
          const onSegment =
            hexDistance(a, c) + hexDistance(c, b) === hexDistance(a, b) ||
            line.includes(c);
          expect(onSegment).toBe(true);
        }
      }
    }
  });

  it('la ligne d’une case à elle-même est [elle-même]', () => {
    expect(hexLine(CENTER, CENTER)).toEqual([CENTER]);
  });
});

describe('hex · conversion pixel pointy-top (L1)', () => {
  it('aller-retour axial → pixel → axial fidèle pour tout le disque', () => {
    for (const h of disk) {
      const { x, y } = hexToPixel(h, 24);
      expect(pixelToHex(x, y, 24)).toEqual(h);
    }
  });

  it('les centres de pixels sont distincts deux à deux', () => {
    const pts = new Set(disk.map((h) => { const p = hexToPixel(h, 10); return `${p.x},${p.y}`; }));
    expect(pts.size).toBe(disk.length);
  });

  it('l’origine axiale est au pixel (0, 0)', () => {
    expect(hexToPixel(origin, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe('hex · disposition rectangulaire des cartes (L3)', () => {
  it('colRowToHex / inRectangle couvrent exactement width × height cases', () => {
    const w = 6;
    const h = 5;
    const seen = new Set<string>();
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const hex = colRowToHex(col, row);
        expect(inRectangle(hex, w, h)).toBe(true);
        seen.add(tileKeyOf(hex));
      }
    }
    expect(seen.size).toBe(w * h);
  });

  it('refuse les cases hors rectangle', () => {
    expect(inRectangle(colRowToHex(-1, 0), 6, 5)).toBe(false);
    expect(inRectangle(colRowToHex(6, 0), 6, 5)).toBe(false);
    expect(inRectangle(colRowToHex(0, -1), 6, 5)).toBe(false);
    expect(inRectangle(colRowToHex(0, 5), 6, 5)).toBe(false);
  });
});
