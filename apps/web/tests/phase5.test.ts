/**
 * Tests Phase 5 L1 — polish UX (retours de la première partie en ligne) :
 * re-clic = désélection, clic droit = chemin soumis, unités sans ordre,
 * ordres non exécutés, case d'arrivée alliée refusée.
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';
import { clickAction, pathTo, rightClickAction, unitsWithoutOrders } from '../src/lib/render/interaction.js';
import { unexecutedOrders } from '../src/lib/feedback.js';
import type { GameEvent } from '@game/shared';

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

function baseState(): GameState {
  return makeState({
    width: 8,
    height: 8,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 5, r: 5 },
    ],
    terrainOverrides: { [tileKey(4, 4)]: 'eau' },
  });
}

describe('re-clic = désélection (L1)', () => {
  it('re-cliquer l’unité sélectionnée la désélectionne', () => {
    const view = viewOf(baseState());
    expect(clickAction(view, uiOf({ selectedUnitId: 'u1' }), { q: 0, r: 0 })).toEqual({ kind: 'deselect' });
  });

  it('re-cliquer la ville sélectionnée la désélectionne', () => {
    const state = baseState();
    state.cities.c1 = { id: 'c1', q: 3, r: 3, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTile: null };
    const view = viewOf(state);
    expect(clickAction(view, uiOf({ selectedCityId: 'c1' }), { q: 3, r: 3 })).toEqual({ kind: 'deselect' });
  });

  it('un brouillon de chemin en cours n’est pas cassé par le re-clic (troncature prioritaire)', () => {
    const view = viewOf(baseState());
    const ui = uiOf({ selectedUnitId: 'u1', draft: { unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] } });
    expect(clickAction(view, ui, { q: 1, r: 0 })).toEqual({ kind: 'truncate', path: [{ q: 1, r: 0 }] });
  });
});

describe('clic droit = ordre de déplacement (L1)', () => {
  it('pathTo trouve un chemin pas à pas à travers les cases connues praticables', () => {
    const state = baseState();
    const path = pathTo(state, { q: 0, r: 0 }, { q: 3, r: 0 });
    expect(path).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
  });

  it('pathTo refuse une destination inconnue, infranchissable, alliée ou inatteignable', () => {
    const state = baseState();
    expect(pathTo(state, { q: 0, r: 0 }, { q: 9, r: 9 })).toBeNull(); // inconnue (brouillard)
    expect(pathTo(state, { q: 0, r: 0 }, { q: 4, r: 4 })).toBeNull(); // eau
    state.units.u9 = { id: 'u9', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false };
    expect(pathTo(state, { q: 0, r: 0 }, { q: 3, r: 3 })).toBeNull(); // allié sur l'arrivée
  });

  it('rightClickAction construit un moveDraft complet ; case invalide → cancelDraft', () => {
    const view = viewOf(baseState());
    const ui = uiOf({ selectedUnitId: 'u1' });
    const a = rightClickAction(view, ui, { q: 2, r: 0 });
    expect(a).toEqual({ kind: 'moveDraft', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], unitId: 'u1' });
    expect(rightClickAction(view, ui, { q: 9, r: 9 })).toEqual({ kind: 'cancelDraft' });
  });

  it('rightClickAction sans sélection ni droit de modifier → cancelDraft', () => {
    const view = viewOf(baseState());
    expect(rightClickAction(view, uiOf(), { q: 2, r: 0 })).toEqual({ kind: 'cancelDraft' });
    expect(rightClickAction(viewOf(baseState(), { locked: true }), uiOf({ selectedUnitId: 'u1' }), { q: 2, r: 0 })).toEqual({ kind: 'cancelDraft' });
  });
});

describe('unités sans ordre (L1)', () => {
  it('liste les unités sans brouillon, sans chemin gelé et non fortifiées', () => {
    const state = baseState();
    state.units.u3 = { id: 'u3', type: 'guerrier', owner: 'p1', q: 1, r: 1, hp: 3, mp: 1, veteran: false, isArmy: false, order: { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 1 }] }, detainedBy: null, fortified: false };
    state.units.u4 = { id: 'u4', type: 'guerrier', owner: 'p1', q: 2, r: 1, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: true };
    state.units.u5 = { id: 'u5', type: 'guerrier', owner: 'p1', q: 3, r: 1, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false };
    const view = viewOf(state, { orders: [{ type: 'Hold', unitId: 'u1' }] });
    // u1 : Hold soumis · u3 : chemin gelé · u4 : fortifiée · u5 : sans rien.
    // (u2 est l'unité ennemie p2.)
    expect(unitsWithoutOrders(view)).toEqual(['u5']);
  });
});

describe('ordres non exécutés (L1, polish reporté)', () => {
  it('un FoundCity sans CityFounded est signalé ; un Move exécuté ne l’est pas', () => {
    const state = baseState();
    const events: GameEvent[] = [{ seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];
    const out = unexecutedOrders(
      [
        { type: 'FoundCity', unitId: 'u1' },
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
      ],
      events,
      state,
    );
    expect(out).toEqual([{ unitId: 'u1', label: expect.stringContaining('Fondation') }]);
  });

  it('un Move bloqué (aucun pas, chemin non gelé) est signalé ; une halte ne l’est pas', () => {
    const state = baseState();
    state.units.u1!.q = 0; // n'a pas bougé
    const noMove: GameEvent[] = [];
    const out = unexecutedOrders([{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }], noMove, state);
    expect(out).toHaveLength(1);
    // Halte : chemin gelé conservé sur l'unité → pas un échec.
    state.units.u1!.order = { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] };
    expect(unexecutedOrders([{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }], noMove, state)).toHaveLength(0);
  });

  it('une attaque qui fizzled (cible absente) est signalée', () => {
    const state = baseState();
    const out = unexecutedOrders([{ type: 'Attack', unitId: 'u1', target: { q: 5, r: 5 } }], [], state);
    expect(out).toHaveLength(1);
  });
});
