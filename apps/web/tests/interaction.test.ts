/**
 * Tests de la logique de clic pure (L3) : sélection, attaque adjacente,
 * construction de chemin — le client n'invente rien hors de l'état filtré.
 * États de test : fixtures de @game/rules (source unique).
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { clickAction, ordersEditable, passableKnown } from '../src/lib/render/interaction.js';

function viewOf(state: GameState, over: Partial<GameView> = {}): GameView {
  return {
    code: 'ABC123',
    playerId: 'dev:alice',
    players: [
      { id: 'dev:alice', name: 'Alice', engineId: 'p1' },
      { id: 'dev:bob', name: 'Bob', engineId: 'p2' },
    ],
    status: 'active',
    turn: 0,
    phase: 'orders',
    state,
    orders: [],
    locked: false,
    events: [],
    lastSeq: 0,
    seenEventSeq: -1,
    ...over,
  };
}

function uiOf(over: Partial<UiState> = {}): UiState {
  return { selectedUnitId: null, selectedCityId: null, draft: null, ...over };
}

/** État : u1 guerrier p1 en (0,0), u2 colon p1 en (1,0), u3 guerrier p2 en (0,1) (adjacente à u1), ville p2 en (2,1). */
function makeBattleState(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'colon', owner: 'p1', q: 1, r: 0 },
      { id: 'u3', type: 'guerrier', owner: 'p2', q: 0, r: 1 },
    ],
    cities: [{ id: 'c1', owner: 'p2', q: 2, r: 1 }],
    terrainOverrides: { [tileKey(4, 4)]: 'eau' },
  });
}

describe('clickAction (L3)', () => {
  it('une unité amie est sélectionnée ; l\'ennemi visible aussi (lecture seule)', () => {
    const view = viewOf(makeBattleState());
    expect(clickAction(view, uiOf(), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
    expect(clickAction(view, uiOf(), { q: 0, r: 1 })).toEqual({ kind: 'selectUnit', unitId: 'u3', mine: false });
  });

  it('guerrier sélectionné + ennemi visible adjacent → attaque directe', () => {
    const view = viewOf(makeBattleState());
    const action = clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 1 });
    expect(action).toEqual({ kind: 'attack', order: { type: 'Attack', unitId: 'u1', target: { q: 0, r: 1 } } });
  });

  it('le colon (non-combattant) ne produit pas d\'attaque — sélection au clic', () => {
    const view = viewOf(makeBattleState());
    const action = clickAction(view, uiOf({ selectedUnitId: 'u2' }), { q: 0, r: 1 });
    expect(action).toEqual({ kind: 'selectUnit', unitId: 'u3', mine: false });
  });

  it('construction de chemin : clics adjacents praticables connus, troncature en arrière', () => {
    const view = viewOf(makeBattleState());
    const ui = uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [] } });
    // (0,1) voisine de (0,0), prairie connue → extension.
    expect(clickAction(view, ui, { q: 0, r: 1 })).toEqual({ kind: 'extend', path: [{ q: 0, r: 1 }] });
    const ui2 = uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [{ q: 0, r: 1 }] } });
    expect(clickAction(view, ui2, { q: 1, r: 1 })).toEqual({
      kind: 'extend',
      path: [{ q: 0, r: 1 }, { q: 1, r: 1 }],
    });
    // Re-clic sur la 1re étape → troncature.
    expect(clickAction(view, ui2, { q: 0, r: 1 })).toEqual({ kind: 'truncate', path: [{ q: 0, r: 1 }] });
    // Clic sur la case de l'unité (chemin vide, pas de ville) → re-sélection.
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [] } }), { q: 0, r: 0 })).toEqual({
      kind: 'selectUnit',
      unitId: 'u1',
      mine: true,
    });
  });

  it('une case inconnue (brouillard) n\'étend jamais le chemin', () => {
    const state = makeBattleState();
    delete (state.map as Record<string, unknown>)[tileKey(-1, 1)]; // voisine de u1 mais hors état filtré
    const view = viewOf(state);
    const ui = uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [] } });
    expect(clickAction(view, ui, { q: -1, r: 1 }).kind).toBe('deselect');
  });

  it('ordres verrouillés : sélection possible mais ni attaque ni extension', () => {
    const view = viewOf(makeBattleState(), { locked: true });
    expect(ordersEditable(view)).toBe(false);
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 1 })).toEqual({
      kind: 'selectUnit',
      unitId: 'u3',
      mine: false,
    });
    const ui = uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [] } });
    // Le clic n'étend pas le chemin (verrouillé) : il retombe sur la sélection.
    expect(clickAction(view, ui, { q: 0, r: 1 })).toEqual({ kind: 'selectUnit', unitId: 'u3', mine: false });
  });

  it('clic sur une ville → sélection de ville ; clic dans le vide → déselection', () => {
    const view = viewOf(makeBattleState());
    expect(clickAction(view, uiOf(), { q: 2, r: 1 })).toEqual({ kind: 'selectCity', cityId: 'c1' });
    expect(clickAction(view, uiOf(), { q: 6, r: 6 })).toEqual({ kind: 'deselect' });
  });

  it('capitale défendue : 1er clic l\'unité, 2e clic la ville (alternance)', () => {
    const state = makeBattleState();
    // Ville amie sous le guerrier u1 en (0,0).
    state.cities.c2 = { id: 'c2', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTile: null };
    const view = viewOf(state);
    expect(clickAction(view, uiOf(), { q: 0, r: 0 })).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 0 })).toEqual({ kind: 'selectCity', cityId: 'c2' });
  });

  it('passableKnown refuse l\'eau et les cases absentes du JSON filtré', () => {
    const state = makeBattleState();
    expect(passableKnown(state, { q: 4, r: 4 })).toBe(false); // eau
    expect(passableKnown(state, { q: 9, r: 9 })).toBe(false); // hors carte
    expect(passableKnown(state, { q: 3, r: 3 })).toBe(true); // prairie
  });
});
