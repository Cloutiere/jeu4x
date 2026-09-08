/**
 * TRAVAIL-VILLE-3D — géométrie PURE des contours (render3d/contours.ts) :
 * contour extérieur du rayon de cultivation (générique pour un rayon
 * quelconque — l'aqueduc l'étendra plus tard, M3.4) et cadre d'une case
 * travaillée posé à l'élévation de sa tuile (M1).
 */
import { describe, expect, it } from 'vitest';
import { contourHexTile, contourRegion, dansRayonTravail } from '../src/lib/render3d/contours.js';
import type { Hex } from '@game/rules';

const SIZE = 64;
const PLAT = 0;
const COLLINE = 0.6;

/** Élévation factice : colline sur (1, 0) (anneau rayon 1), plat ailleurs. */
function elevationDe(hex: Hex): number {
  return hex.q === 1 && hex.r === 0 ? COLLINE : PLAT;
}

describe('contourRegion — rayon de cultivation', () => {
  const centre: Hex = { q: 0, r: 0 };

  it('rayon 1 : une seule boucle fermée épousant le pourtour des 6 cases', () => {
    const boucles = contourRegion(centre, 1, SIZE, elevationDe);
    expect(boucles).toHaveLength(1);
    const boucle = boucles[0]!;
    // 6 tuiles d'anneau × 3 arêtes extérieures chacune = 18 arêtes.
    expect(boucle).toHaveLength(19); // 18 sommets + retour au premier (fermée)
    expect(boucle[0]!.x).toBeCloseTo(boucle[boucle.length - 1]!.x, 6);
    expect(boucle[0]!.y).toBeCloseTo(boucle[boucle.length - 1]!.y, 6);
    // Aucun sommet inventé loin de la région : distance au centre entre les
    // coins de jonction entre tuiles de l'anneau (2·s exactement) et les
    // pointes des tuiles (√3·s + s ≈ 2.732·s).
    const distances = boucle.map((p) => Math.hypot(p.x, p.y) / SIZE);
    for (const d of distances) {
      expect(d).toBeGreaterThanOrEqual(1.99);
      expect(d).toBeLessThanOrEqual(2.74);
    }
  });

  it('rayon 2 (aqueduc futur) : le contour grandit et reste une boucle fermée', () => {
    const r1 = contourRegion(centre, 1, SIZE, elevationDe)[0]!;
    const r2 = contourRegion(centre, 2, SIZE, elevationDe)[0]!;
    expect(contourRegion(centre, 2, SIZE, elevationDe)).toHaveLength(1);
    expect(r2).toHaveLength(31);
    expect(r2[0]!.x).toBeCloseTo(r2[r2.length - 1]!.x, 6);
    expect(r2[0]!.y).toBeCloseTo(r2[r2.length - 1]!.y, 6);
    const dMaxR2 = Math.max(...r2.map((p) => Math.hypot(p.x, p.y)));
    const dMaxR1 = Math.max(...r1.map((p) => Math.hypot(p.x, p.y)));
    expect(dMaxR2).toBeGreaterThan(dMaxR1);
  });

  it('chaque sommet porte l\'élévation de SA tuile (relief suivi, M1/M3.3)', () => {
    const boucle = contourRegion(centre, 1, SIZE, elevationDe)[0]!;
    // La colline (1, 0) est dans l'anneau rayon 1 : au moins un sommet à son
    // élévation, les autres à plat.
    expect(boucle.some((p) => p.elev === COLLINE)).toBe(true);
    expect(boucle.some((p) => p.elev === PLAT)).toBe(true);
  });

  it('fog : une case de l\'anneau non explorée ne troue pas le contour (élévation 0)', () => {
    // (1,-1) « non explorée » : son élévation retombe à 0, la boucle reste entière.
    const boucle = contourRegion(centre, 1, SIZE, (hex) => (hex.q === 1 && hex.r === -1 ? PLAT : elevationDe(hex)))[0]!;
    expect(boucle).toHaveLength(19);
    expect(boucle[0]!.x).toBeCloseTo(boucle[boucle.length - 1]!.x, 6);
    expect(boucle[0]!.y).toBeCloseTo(boucle[boucle.length - 1]!.y, 6);
  });
});

describe('contourHexTile — cadre d\'une case travaillée', () => {
  it('boucle fermée de 6 sommets, insérée dans la tuile, à l\'élévation donnée', () => {
    const hex: Hex = { q: 3, r: -1 };
    const boucle = contourHexTile(hex, SIZE, 14, COLLINE);
    expect(boucle).toHaveLength(6);
    for (const p of boucle) expect(p.elev).toBe(COLLINE);
    const centre = { x: boucle.reduce((s, p) => s + p.x, 0) / 6, y: boucle.reduce((s, p) => s + p.y, 0) / 6 };
    for (const p of boucle) expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeCloseTo(SIZE - 14, 5);
  });
});
