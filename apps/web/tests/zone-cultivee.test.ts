/**
 * ZONE-CULTIVEE (style CivRev, décisions Erik 13/09) — géométrie PURE du
 * contour de l'union des cases travaillées d'une ville : boucle(s) fermée(s)
 * suivant les bords extérieurs des hexagones, formes non convexes et cases
 * détachées gérées (M1 du handoff). Le 3D n'appelle pas `contourUnion`.
 */
import { describe, expect, it } from 'vitest';
import { contourUnion, contourRegion } from '../src/lib/render3d/contours.js';
import type { Hex } from '@game/rules';

const SIZE = 64;
const PLAT = 0;
const COLLINE = 0.6;

function elevationDe(hex: Hex): number {
  return hex.q === 1 && hex.r === 0 ? COLLINE : PLAT;
}

/** Boucle fermée ? (dernier point = premier point à l'erreur de flottants du
 *  chaînage près — les sommets partagés entre deux tuiles sont recalculés) */
function fermee(boucle: Array<{ x: number; y: number }>): boolean {
  if (boucle.length <= 3) return false;
  const a = boucle[0]!;
  const b = boucle[boucle.length - 1]!;
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

describe('contourUnion — zone des tuiles cultivées', () => {
  it('zéro case travaillée : pas de zone (aucune boucle)', () => {
    expect(contourUnion([], SIZE, elevationDe)).toHaveLength(0);
  });

  it('ville de pop 1 (une seule case) : une boucle fermée de 6 sommets', () => {
    const boucles = contourUnion([{ q: 0, r: 0 }], SIZE, elevationDe);
    expect(boucles).toHaveLength(1);
    const boucle = boucles[0]!;
    expect(fermee(boucle)).toBe(true);
    expect(boucle).toHaveLength(7); // 6 sommets + retour au premier
    const centre = { x: 0, y: 0 };
    for (const p of boucle) expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeCloseTo(SIZE, 5);
  });

  it('tuiles contiguës (centre + 1 voisine) : UNE seule boucle épousant le domino', () => {
    const boucles = contourUnion([{ q: 0, r: 0 }, { q: 1, r: 0 }], SIZE, elevationDe);
    expect(boucles).toHaveLength(1);
    const boucle = boucles[0]!;
    expect(fermee(boucle)).toBe(true);
    // Périmètre d'un domino : 12 - 2×2 arêtes partagées = 10 arêtes.
    expect(boucle).toHaveLength(11); // 10 sommets + retour
  });

  it('formes non convexes (L à quatre cases) : une seule boucle concave fermée', () => {
    const boucles = contourUnion(
      [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: -1 }],
      SIZE,
      elevationDe,
    );
    expect(boucles).toHaveLength(1);
    expect(fermee(boucles[0]!)).toBe(true);
    // Périmètre : 24 - 2×3 paires d'arêtes partagées = 18 arêtes, dont le
    // coin concave (case (1,-1) absente, sommet de pincement à 3 arêtes).
    expect(boucles[0]!).toHaveLength(19);
  });

  it('trou intérieur (anneau de 6 autour d\'un centre non travaillé) : deux boucles', () => {
    const anneau: Hex[] = [
      { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
      { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
    ];
    const boucles = contourUnion(anneau, SIZE, elevationDe);
    expect(boucles).toHaveLength(2);
    for (const boucle of boucles) expect(fermee(boucle)).toBe(true);
    // La boucle intérieure (le trou) est plus petite : max des distances au
    // centre sous la moitié de celui de la boucle extérieure.
    const dMax = boucles.map((b) => Math.max(...b.map((p) => Math.hypot(p.x, p.y))));
    dMax.sort((a, b) => a - b);
    expect(dMax[0]!).toBeLessThan(dMax[1]! / 2);
  });

  it('case détachée : sa propre boucle (discontinuité gérée)', () => {
    const boucles = contourUnion([{ q: 0, r: 0 }, { q: 3, r: 0 }], SIZE, elevationDe);
    expect(boucles).toHaveLength(2);
    for (const boucle of boucles) {
      expect(fermee(boucle)).toBe(true);
      expect(boucle).toHaveLength(7);
    }
  });

  it('chaque sommet porte l\'élévation de SA tuile', () => {
    const boucle = contourUnion([{ q: 1, r: 0 }], SIZE, elevationDe)[0]!;
    for (const p of boucle) expect(p.elev).toBe(COLLINE);
  });

  it('non-régression 3D : contourRegion (rayon) produit toujours les mêmes boucles', () => {
    // Le refactor en corps commun ne doit pas changer le comportement du
    // rayon de cultivation (utilisé par le calque 3D — §5 du handoff).
    const boucle = contourRegion({ q: 0, r: 0 }, 1, SIZE, elevationDe)[0]!;
    expect(boucle).toHaveLength(19);
    expect(fermee(boucle)).toBe(true);
    expect(boucle.some((p) => p.elev === COLLINE)).toBe(true);
  });
});
