/**
 * Tests des helpers purs de rendu (L1/L3) : culling, bornes monde,
 * conversions caméra, construction de chemin pas à pas.
 * Toute la géométrie vient de @game/rules — les tests vérifient l'usage,
 * pas les maths hexagonales (déjà couvertes par packages/rules).
 */
import { describe, expect, it } from 'vitest';
import { hexDistance, hexToPixel } from '@game/rules';
import type { Hex } from '@game/rules';
import { extendPath, hexesInRect, mapBounds, screenToHex, HEX_SIZE } from '../src/lib/render/hexView.js';

const SIZE = HEX_SIZE;
const W = 8;
const H = 8;

describe('hexesInRect (culling, L1)', () => {
  it('le rect couvrant tout le monde retourne exactement les 64 cases de la carte', () => {
    const bounds = mapBounds(SIZE, W, H);
    const hexes = hexesInRect(bounds, SIZE, W, H);
    expect(hexes).toHaveLength(W * H);
    const unique = new Set(hexes.map((h) => `${h.q},${h.r}`));
    expect(unique.size).toBe(W * H);
  });

  it('toute case dont le centre est dans le rect est retournée (pas de faux négatif)', () => {
    // Rect arbitraire au milieu de la carte.
    const rect = { x: -300, y: 200, w: 500, h: 260 };
    const hexes = hexesInRect(rect, SIZE, W, H);
    const keys = new Set(hexes.map((h) => `${h.q},${h.r}`));
    // Balayage exhaustif de la carte : chaque case centrée dans le rect doit y être.
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const q = col - Math.floor(row / 2);
        const p = hexToPixel({ q, r: row }, SIZE);
        if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
          expect(keys.has(`${q},${row}`), `case (${q},${row}) manquante`).toBe(true);
        }
      }
    }
  });

  it('aucune case retournée n\'est à plus d\'une case du rect (pas de gras extrême)', () => {
    const rect = { x: -300, y: 200, w: 500, h: 260 };
    for (const h of hexesInRect(rect, SIZE, W, H)) {
      const c = hexToPixel(h, SIZE);
      const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.w));
      const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.h));
      // Marge généreuse (2 tailles) : le culling est conservateur mais borné.
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(2 * SIZE + SIZE * Math.SQRT2);
    }
  });

  it('les rects hors carte retournent au plus les cases de bord', () => {
    expect(hexesInRect({ x: 1e6, y: 1e6, w: 10, h: 10 }, SIZE, W, H)).toHaveLength(0);
    expect(hexesInRect({ x: -1e6, y: -1e6, w: 10, h: 10 }, SIZE, W, H)).toHaveLength(0);
  });
});

describe('screenToHex (caméra)', () => {
  it('aller-retour hex → écran → hex pour plusieurs zooms/panoramiques', () => {
    const cameras = [
      { x: 400, y: 300, scale: 1 },
      { x: 0, y: 0, scale: 0.5 },
      { x: -1222, y: 871, scale: 2.25 },
    ];
    const hexes: Hex[] = [
      { q: 0, r: 0 },
      { q: 12, r: 7 },
      { q: -5, r: 20 },
    ];
    for (const cam of cameras) {
      for (const h of hexes) {
        const c = hexToPixel(h, SIZE);
        const screenX = c.x * cam.scale + cam.x;
        const screenY = c.y * cam.scale + cam.y;
        expect(screenToHex(screenX, screenY, cam, SIZE)).toEqual(h);
      }
    }
  });
});

describe('construction de chemin pas à pas (L3)', () => {
  const origin: Hex = { q: 2, r: 2 };
  const neighbor: Hex = { q: 3, r: 2 };
  const far: Hex = { q: 5, r: 4 };
  const passable = (): boolean => true;
  const areNeighbors = (a: Hex, b: Hex): boolean => hexDistance(a, b) === 1;

  it('étend depuis l\'origine quand le chemin est vide', () => {
    expect(extendPath([], origin, neighbor, passable, areNeighbors)).toEqual([neighbor]);
  });
  it('étend depuis la dernière case du chemin', () => {
    expect(extendPath([neighbor], origin, { q: 3, r: 3 }, passable, areNeighbors)).toEqual([neighbor, { q: 3, r: 3 }]);
  });
  it('refuse une case non voisine', () => {
    expect(extendPath([], origin, far, passable, areNeighbors)).toBeNull();
  });
  it('refuse une case inconnue ou infranchissable (brouillard/terrain)', () => {
    expect(extendPath([], origin, neighbor, (): boolean => false, areNeighbors)).toBeNull();
  });
  it('refuse un doublon de la dernière case', () => {
    expect(extendPath([neighbor], origin, neighbor, passable, areNeighbors)).toBeNull();
  });
  it('tronque en revenant sur une case du chemin', () => {
    const path = [{ q: 3, r: 2 }, { q: 3, r: 3 }, { q: 4, r: 3 }];
    // Re-clic sur la 2e case (index 1) → chemin tronqué à [0..1].
    expect(truncate(path, path[1]!)).toEqual([{ q: 3, r: 2 }, { q: 3, r: 3 }]);
    expect(truncate(path, path[0]!)).toEqual([{ q: 3, r: 2 }]);
    expect(truncate(path, { q: 0, r: 0 })).toBeNull();
  });
});

function truncate(path: Hex[], hex: Hex): Hex[] | null {
  for (let i = 0; i < path.length; i++) {
    if (path[i]!.q === hex.q && path[i]!.r === hex.r) return path.slice(0, i + 1);
  }
  return null;
}
