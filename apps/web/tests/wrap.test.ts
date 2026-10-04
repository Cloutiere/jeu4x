/**
 * CARTE-RONDE T2 · L1 — tests de la transformation wrap (rendu cylindrique).
 * Le monde boucle Est↔Ouest : période horizontale P = √3·size·W ; toute
 * position monde x et x+P est LA MÊME case. Ces fonctions sont pures
 * (aucun PixiJS) — le motif des suites interaction/hexView.
 */
import { describe, expect, it } from 'vitest';
import { colRowToHex, hexToPixel, pixelToHex, SANS_WRAP } from '@game/rules';
import { HEX_SIZE } from '../src/lib/render/hexView.js';
import {
  cameraXPourCentre,
  centreMondeDe,
  copiesDe,
  copiesPolyline,
  copieLaPlusProche,
  deplierPoints,
  envelopperX,
  hexCanoniqueSousPoint,
  periodeHorizontale,
} from '../src/lib/render/wrap.js';

const SIZE = HEX_SIZE;
const W = 40;
const P = periodeHorizontale(SIZE, W); // √3·64·40 ≈ 4434

describe('periodeHorizontale', () => {
  it('vaut √3·size·largeur pour une carte cylindrique', () => {
    expect(P).toBeCloseTo(SIZE * Math.sqrt(3) * W, 6);
  });
  it('la sentinelle SANS_WRAP (monde plat) désactive le wrap', () => {
    expect(periodeHorizontale(SIZE, SANS_WRAP)).toBe(Infinity);
  });
});

describe('envelopperX / centreMondeDe (bande canonique [0, P))', () => {
  it('un x dans la bande reste inchangé', () => {
    expect(envelopperX(123, P)).toBe(123);
  });
  it('un x au-delà de P revient dans la bande (même case)', () => {
    const x = hexToPixel(colRowToHex(41, 0), SIZE).x; // copie de la colonne 1
    expect(envelopperX(x, P)).toBeCloseTo(hexToPixel(colRowToHex(1, 0), SIZE).x, 6);
  });
  it('un x négatif (colonne −1) revient dans la bande côté Ouest', () => {
    const x = hexToPixel(colRowToHex(-1, 0), SIZE).x;
    const attendu = hexToPixel(colRowToHex(W - 1, 0), SIZE).x;
    expect(envelopperX(x, P)).toBeCloseTo(attendu, 6);
  });
  it('centreMondeDe / cameraXPourCentre sont des inverses exacts', () => {
    const camX = -1234;
    const scale = 0.8;
    const vw = 1600;
    const centre = centreMondeDe(camX, scale, vw); // monde sous le centre de l'écran
    expect(centre).toBeCloseTo((vw / 2 - camX) / scale, 6);
    expect(cameraXPourCentre(centre, scale, vw)).toBeCloseTo(camX, 6);
  });
});

describe('copiesDe (duplications nécessaires au voisinage de la couture)', () => {
  it('une case au centre du monde, vue étroite : UNE seule copie (k=0)', () => {
    const x = P / 2;
    expect(copiesDe(x, P / 2 - 500, P / 2 + 500, P)).toEqual([0]);
  });
  it('une case près du col 0 est visible depuis la couture via sa copie k=+1', () => {
    const x = hexToPixel(colRowToHex(1, 0), SIZE).x; // ≈ 111
    // Fenêtre [P−500, P+500] (caméra sur la couture) : la case n'y est pas en
    // canonique, sa copie décalée de +P oui — c'est ELLE qui est dessinée.
    expect(copiesDe(x, P - 500, P + 500, P)).toEqual([1]);
  });
  it('une case près du col W−1 est visible depuis la couture via sa copie k=−1', () => {
    const x = hexToPixel(colRowToHex(W - 1, 0), SIZE).x; // ≈ P − 111
    expect(copiesDe(x, -500, 500, P)).toEqual([-1]);
  });
  it('dézoom extrême (fenêtre plus large que P) : au moins 3 copies', () => {
    const ks = copiesDe(P / 2, P / 2 - 1.2 * P, P / 2 + 1.2 * P, P);
    expect(ks.length).toBeGreaterThanOrEqual(3);
    expect(ks).toContain(-1);
    expect(ks).toContain(0);
    expect(ks).toContain(1);
  });
  it('aucune copie hors de la fenêtre (économie — D6)', () => {
    const x = hexToPixel(colRowToHex(1, 0), SIZE).x;
    expect(copiesDe(x, P / 2 - 300, P / 2 + 300, P)).toEqual([0]);
  });
});

describe('deplierPoints (polyligne continue à travers la couture)', () => {
  it('un chemin col 39 → col 0 est déplié sans grand saut arrière', () => {
    const a = hexToPixel(colRowToHex(38, 0), SIZE);
    const b = hexToPixel(colRowToHex(39, 0), SIZE);
    const c = hexToPixel(colRowToHex(0, 0), SIZE); // saut de ≈ −P dans l'espace canonique
    const d = hexToPixel(colRowToHex(1, 0), SIZE);
    const deplie = deplierPoints([a, b, c, d], P);
    for (let i = 1; i < deplie.length; i++) {
      const pas = Math.abs(deplie[i]!.x - deplie[i - 1]!.x);
      expect(pas).toBeCloseTo(Math.sqrt(3) * SIZE, 6); // un pas de case, pas un saut de monde
    }
    // La copie dépliée de l'arrivée est à droite du départ (traversée Est→Ouest).
    expect(deplie[3]!.x).toBeGreaterThan(deplie[0]!.x);
  });
  it('un chemin sans couture est inchangé', () => {
    const pts = [0, 1, 2].map((c) => hexToPixel(colRowToHex(c, 2), SIZE));
    const deplie = deplierPoints(pts, P);
    expect(deplie.map((p) => p.x)).toEqual(pts.map((p) => p.x));
  });
  it('un chemin qui REPART par la gauche (programmé Ouest) est déplié vers la gauche', () => {
    const a = hexToPixel(colRowToHex(1, 0), SIZE);
    const b = hexToPixel(colRowToHex(0, 0), SIZE);
    const c = hexToPixel(colRowToHex(W - 1, 0), SIZE);
    const deplie = deplierPoints([a, b, c], P);
    expect(deplie[2]!.x).toBeLessThan(deplie[0]!.x);
  });
});

describe('copiesPolyline (segments traversant dessinés des deux côtés — D3)', () => {
  it('un chemin traversant la couture, déplié, chevauche la couture en continu (D3)', () => {
    const pts = deplierPoints(
      [colRowToHex(38, 0), colRowToHex(39, 0), colRowToHex(0, 0), colRowToHex(1, 0)].map((h) => hexToPixel(h, SIZE)),
      P,
    );
    // La polyligne dépliée passe par-dessus la couture (x = P) sans trou :
    // dessinée UNE fois, elle est visible des deux côtés de la couture.
    const avant = pts.filter((p) => p.x < P).length;
    const apres = pts.filter((p) => p.x >= P).length;
    expect(avant).toBeGreaterThanOrEqual(2);
    expect(apres).toBeGreaterThanOrEqual(2);
    // Une seule copie suffit à couvrir la vue centrée sur la couture.
    expect(copiesPolyline(pts, P - 800, P + 800, P)).toEqual([0]);
  });
  it('un chemin au centre du monde : une seule copie', () => {
    const pts = [10, 11, 12].map((c) => hexToPixel(colRowToHex(c, 0), SIZE));
    expect(copiesPolyline(pts, P / 2 - 400, P / 2 + 400, P)).toEqual([0]);
  });
});

describe('hexCanoniqueSousPoint (picking à la couture — D3)', () => {
  it('un point à gauche de la bande (x proche de −P+col39) tombe sur la colonne W−1', () => {
    // Le centre du col W−1 vu depuis la copie Ouest : x(39) − P ≈ −111.
    const x = hexToPixel(colRowToHex(W - 1, 0), SIZE).x - P;
    const hex = hexCanoniqueSousPoint(x, 0, SIZE, W, P);
    expect(hex).toEqual(colRowToHex(W - 1, 0));
  });
  it('un point au-delà de P (copie Est du col 0) tombe sur la colonne 0', () => {
    // Le centre du col 1 vu depuis la copie Est : x(1) + P.
    const x = hexToPixel(colRowToHex(1, 0), SIZE).x + P;
    const hex = hexCanoniqueSousPoint(x, 0, SIZE, W, P);
    expect(hex).toEqual(colRowToHex(1, 0));
  });
  it('le picking est cohérent avec le rendu dupliqué : la copie k=+1 d’une case se pick comme la case', () => {
    const hex = colRowToHex(20, 5);
    const p = hexToPixel(hex, SIZE);
    const copie = hexCanoniqueSousPoint(p.x + P, p.y, SIZE, W, P);
    const direct = pixelToHex(envelopperX(p.x + P, P), p.y, SIZE);
    expect(copie.q).toBe(direct.q);
    expect(copie.r).toBe(direct.r);
  });
});

describe('copieLaPlusProche (centrages sans téléportation — D5)', () => {
  it('vise la copie la plus proche du viewport courant', () => {
    const ville = hexToPixel(colRowToHex(0, 0), SIZE).x; // x = 0
    // Caméra près du bord Est (x ≈ P) : viser la copie k=+1, pas la canonique.
    expect(copieLaPlusProche(ville, P - 100, P)).toBe(1);
    // Caméra au centre : copie canonique (P/3 évite l'égalité ambiguë ±P/2).
    expect(copieLaPlusProche(ville, P / 3, P)).toBe(0);
  });
});
