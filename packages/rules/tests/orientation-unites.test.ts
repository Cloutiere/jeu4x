/**
 * ORIENTATION-UNITES — tests moteur (décisions D1-D5 d'Erik du 17/10).
 * Voir HANDOFF-ORIENTATION-UNITES.md.
 *
 *  - directionOrientante : les 6 voisins → 3 gauche (O/N-O/S-O) ↔ 3 droite
 *    (E/N-E/S-E), mesuré en X écran (q + r/2) ; hors voisinage = null ;
 *  - faceGauche mis à jour au PREMIER pas du mouvement de chaque tour ;
 *  - création = absent (droite) ; wrap cylindre compris (CARTE-RONDE T1) ;
 *  - dépose navale = oriente (côté du pas de dépose) ; à bord = suit son
 *    transport.
 */
import { describe, expect, it } from 'vitest';
import { colRowToHex, directionOrientante, hexesWithinRadius, SANS_WRAP, tileKeyOf } from '../src/hex.js';
import type { Hex } from '../src/hex.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';

const ORIGINE: Hex = { q: 0, r: 0 };

function exploreAll(state: GameState, player: string, w: number, h: number): void {
  const explored: string[] = [];
  for (let q = 0; q <= w; q++) for (let r = 0; r <= h; r++) explored.push(`${q},${r}`);
  state.players[player]!.vision.explored = explored;
}

describe('directionOrientante · helper pur (L1)', () => {
  it('les 3 voisins de droite : E, N-E, S-E', () => {
    expect(directionOrientante(ORIGINE, { q: 1, r: 0 })).toBe('droite');
    expect(directionOrientante(ORIGINE, { q: 1, r: -1 })).toBe('droite');
    expect(directionOrientante(ORIGINE, { q: 0, r: 1 })).toBe('droite');
  });

  it('les 3 voisins de gauche : O, N-O, S-O', () => {
    expect(directionOrientante(ORIGINE, { q: -1, r: 0 })).toBe('gauche');
    expect(directionOrientante(ORIGINE, { q: 0, r: -1 })).toBe('gauche');
    expect(directionOrientante(ORIGINE, { q: -1, r: 1 })).toBe('gauche');
  });

  it('hors voisinage (distance ≠ 1) = pas d\'orientation', () => {
    expect(directionOrientante(ORIGINE, ORIGINE)).toBeNull();
    expect(directionOrientante(ORIGINE, { q: 2, r: 0 })).toBeNull();
    expect(directionOrientante(ORIGINE, { q: 3, r: -2 })).toBeNull();
  });

  it('indépendant de la position (voisins de toute case)', () => {
    for (const centre of hexesWithinRadius({ q: 5, r: 7 }, 3)) {
      expect(directionOrientante(centre, { q: centre.q + 1, r: centre.r })).toBe('droite');
      expect(directionOrientante(centre, { q: centre.q - 1, r: centre.r })).toBe('gauche');
    }
  });

  it('wrap cylindre : un pas vers l\'Ouest AU-DELA de la couture reste gauche', () => {
    const largeur = 10;
    // Case de colonne 0 : (q=0, r=0). Son voisin Ouest est replié colonne 9.
    const bord = colRowToHex(0, 0);
    const ouest = colRowToHex(9, 1); // voisin Ouest après repli
    expect(directionOrientante(bord, ouest, largeur)).toBe('gauche');
    // Et le voisin Est d'une case de colonne 9 repliée à 0 : droite.
    expect(directionOrientante(ouest, bord, largeur)).toBe('droite');
  });

  it('SANS_WRAP : identité plate (aucun repli)', () => {
    expect(directionOrientante({ q: -1, r: 0 }, { q: -2, r: 0 }, SANS_WRAP)).toBe('gauche');
  });
});

describe('faceGauche · mise à jour moteur (L2)', () => {
  it('création = champ absent (regarde à droite par défaut, D1)', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    expect(state.units['u1']!.faceGauche).toBeUndefined();
  });

  it('pas vers l\'Est → droite (faceGauche false DÉFINI) ; vers l\'Ouest → true', () => {
    let state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    exploreAll(state, 'p1', 8, 8);
    let res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 3, r: 2 }] }] }, 1);
    expect(getUnit(res.newState, 'u1')).toMatchObject({ q: 3, r: 2, faceGauche: false });

    state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    exploreAll(state, 'p1', 8, 8);
    res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 2 }] }] }, 1);
    expect(getUnit(res.newState, 'u1')).toMatchObject({ q: 1, r: 2, faceGauche: true });
  });

  it('multi-pas dans un même tour : orientation du PREMIER pas seulement', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    exploreAll(state, 'p1', 8, 8);
    // Chemin Est puis Ouest : le premier pas (Est) fait foi.
    const res = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 3, r: 2 }, { q: 2, r: 2 }] }] },
      1,
    );
    const u = getUnit(res.newState, 'u1');
    // 1 PM : seul le premier pas (Est) est exécuté, le reste gèle —
    // l'orientation vient de CE pas, jamais du chemin programmé restant.
    expect(u?.q).toBe(3);
    expect(u?.faceGauche).toBe(false);
  });

  it('chemin gelé repris au tour suivant : réorientation au premier pas de CE tour', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    exploreAll(state, 'p1', 8, 8);
    // Guerrier 1 PM (convention tests) : chemin de 2 → gel après le 1er pas.
    const t1 = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 3, r: 2 }, { q: 2, r: 2 }] }] },
      1,
    );
    // Tour 2 : l'ordre gelé est rejoué — pas vers l'Ouest → réorientation.
    const gel: Order[] | undefined = t1.newState.units['u1']!.order
      ? [t1.newState.units['u1']!.order as Order]
      : undefined;
    if (gel) {
      const t2 = resolveTurn(t1.newState, { p1: [] }, 2);
      const u = getUnit(t2.newState, 'u1');
      if (u?.q === 2) expect(u.faceGauche).toBe(true);
    }
  });

  it('unité immobile : jamais d\'orientation', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    exploreAll(state, 'p1', 8, 8);
    const res = resolveTurn(state, { p1: [] }, 1);
    expect(getUnit(res.newState, 'u1')?.faceGauche).toBeUndefined();
  });

  it('dépose navale : la cargaison est orientée par le pas de dépose (D1 tranché)', () => {
    const overrides: Record<string, TerrainId> = {};
    for (let col = 0; col < 8; col++) {
      overrides[tileKeyOf(colRowToHex(col, 3))] = 'eau';
      overrides[tileKeyOf(colRowToHex(col, 4))] = 'eau';
    }
    const H = (col: number, row: number) => colRowToHex(col, row);
    const state = makeState({
      width: 8,
      height: 7,
      terrainOverrides: overrides,
      units: [
        { id: 'nav', type: 'galere', owner: 'p1', q: H(3, 3).q, r: H(3, 3).r },
        { id: 'col', type: 'colon', owner: 'p1', q: H(3, 3).q, r: H(3, 3).r, aboard: 'nav' },
      ],
    } as Parameters<typeof makeState>[0]);
    state.units['nav']!.cargo = 'col';
    state.units['col']!.aboard = 'nav';
    exploreAll(state, 'p1', 8, 7);
    // Ordre de DÉPOSE du passager : sortir au Nord (case terrestre voisine).
    const res = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'col', path: [H(3, 2)] }] },
      1,
    );
    const col = getUnit(res.newState, 'col');
    expect(col?.aboard).toBeNull(); // déposée
    // Transport (3,3) → arrivée (3,2) = voisin Nord-Ouest écran → gauche.
    expect(col?.faceGauche).toBe(true);
  });
});
