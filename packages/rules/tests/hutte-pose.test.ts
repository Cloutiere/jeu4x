/**
 * HUTTE-POSE (signalement Erik 04/10) — l'ouverture d'une hutte vaut pour
 * toute POSE d'unité sur sa case, pas seulement les pas de mouvement (R-98
 * amendée, miroir ARTEFACT-ARCHE) :
 *  - dépose programmée (tenterDepose) et régularisation des arrivantes
 *    ouvrent la hutte, l'événement portant le bon tour et la bonne unité ;
 *  - balayage de début de résolution : une unité déjà debout sur une hutte
 *    l'ouvre au tour suivant ;
 *  - les barbares n'ouvrent jamais (R-95 inchangée).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';

const SEED = 20261004;
const H = (col: number, row: number) => colRowToHex(col, row);

/** Carte côtière 8×7 (repère embarquement-programme) : rangées 3-4 eau. */
function coastalState(extra: Parameters<typeof makeState>[0] = {}): GameState {
  const overrides: Record<string, TerrainId> = {};
  for (let col = 0; col < 8; col++) {
    overrides[tileKeyOf(colRowToHex(col, 3))] = 'eau';
    overrides[tileKeyOf(colRowToHex(col, 4))] = 'eau';
  }
  return makeState({ width: 8, height: 7, terrainOverrides: overrides, ...extra });
}

describe('HUTTE-POSE · dépose programmée sur une hutte', () => {
  it('galère → dépose du guerrier SUR la hutte → ouverture AU TOUR de la dépose', () => {
    const state = coastalState({
      huts: [{ q: H(0, 5).q, r: H(0, 5).r }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'n1', cargo: null },
        { id: 'n1', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'n1', path: [H(0, 4)] },
        { type: 'Move', unitId: 'u1', path: [H(0, 5)] },
      ],
    };
    const { newState, events } = resolveTurn(state, orders, SEED);
    expect(getUnit(newState, 'u1')).toMatchObject({ aboard: null, q: H(0, 5).q, r: H(0, 5).r });
    expect(newState.huts).toHaveLength(0);
    const opened = events.find((e) => e.type === 'HutOpened');
    expect(opened).toBeDefined();
    expect(opened && opened.type === 'HutOpened' && opened.byUnitId).toBe('u1');
  });
});

describe('HUTTE-POSE · régularisation des arrivantes', () => {
  /** Ville (0,0) occupée par une amie ; SEULE case terrestre adjacente = (0,1)
   *  portant la hutte — la régularisation pose l'arrivante dessus. */
  function etatIsole(): GameState {
    const voisines: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const overrides: Record<string, TerrainId> = {};
    for (const [q, r] of voisines) {
      if (q === 0 && r === 1) continue;
      overrides[tileKeyOf(H(q, r))] = 'eau';
    }
    return makeState({
      width: 8,
      height: 8,
      terrainOverrides: overrides,
      huts: [{ q: H(0, 1).q, r: H(0, 1).r }],
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, workedTiles: [], production: { item: { kind: 'unit', id: 'colon' }, progress: 20 } }],
      units: [{ id: 'u0', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
  }

  it('tour 1 : pose en arrivante, hutte intacte ; tour 2 : la régularisation ouvre la hutte', () => {
    const r1 = resolveTurn(etatIsole(), {}, SEED);
    const arrivante = Object.values(r1.newState.units).find((u) => u.arrivanteSurCase);
    expect(arrivante).toBeDefined();
    expect(r1.newState.huts).toHaveLength(1);

    const r2 = resolveTurn(r1.newState, {}, SEED);
    expect(r2.newState.huts).toHaveLength(0);
    const opened = r2.events.find((e) => e.type === 'HutOpened');
    expect(opened && opened.type === 'HutOpened' && opened.byPlayer).toBe('p1');
  });
});

describe('HUTTE-POSE · balayage de début de résolution', () => {
  it('unité DÉJÀ debout sur une hutte sans y être entrée par un pas → ouverture au tour suivant (rattrapage)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      huts: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 }],
    });
    const { newState, events } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.huts).toHaveLength(0);
    const opened = events.find((e) => e.type === 'HutOpened');
    expect(opened && opened.type === 'HutOpened' && opened.byUnitId).toBe('u1');
  });

  it('barbare debout sur la hutte → JAMAIS d\u2019ouverture (R-95)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      huts: [{ q: 5, r: 5 }],
      units: [{ id: 'b1', type: 'guerrier', owner: 'barbarien', q: 5, r: 5 }],
    });
    const { newState } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.huts).toHaveLength(1);
  });

  it('deux unités dessus : UNE SEULE ouverture, la première au tri unitId croissant (R-81)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      huts: [{ q: 5, r: 5 }],
      units: [
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.huts).toHaveLength(0);
    const ouvertures = events.filter((e) => e.type === 'HutOpened');
    expect(ouvertures).toHaveLength(1);
    expect(ouvertures[0] && ouvertures[0].type === 'HutOpened' && ouvertures[0].byUnitId).toBe('u1');
  });
});
