/**
 * EMBARQUEMENT-PROGRAMME (décisions d'Erik du 03/10) — client.
 *
 * Le clic droit d'une unité terrestre vise n'importe quelle case du chemin
 * PROGRAMMÉ d'un transport ami (D1-B — là où le navire SERA), jamais une case
 * de ville (D5) ; une cargaison sélectionnée donne son ordre de DÉPOSE par
 * clic droit terrestre (D3-A) — validation locale miroir du moteur.
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import { destinationsEmbarquement, deposeValide, pathTo, rightClickAction } from '../src/lib/render/interaction.js';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';

const H = (col: number, row: number): Hex => ({ q: col - Math.floor(row / 2), r: row });

/** 6×6 : rangées 2-3 en eau (côte), reste terre. */
function coastalState(units: Parameters<typeof makeState>[0]['units']): GameState {
  const overrides: Record<string, string> = {};
  for (let col = 0; col < 6; col++) {
    overrides[tileKey(col, 2)] = 'eau';
    overrides[tileKey(col, 3)] = 'eau';
  }
  return makeState({ width: 6, height: 6, terrainOverrides: overrides, units });
}

function viewOf(state: GameState, orders: GameView['orders'] = []): GameView {
  return {
    code: 'TEST',
    playerId: 'you1',
    players: [{ id: 'you1', engineId: 'p1', name: 'moi', bot: false }],
    status: 'active',
    phase: 'orders',
    locked: false,
    state,
    orders,
    events: [],
    lastSeq: 0,
    seenEventSeq: -1,
  } as unknown as GameView;
}

function uiOf(selectedUnitId: string | null): UiState {
  return { selectedUnitId, selectedCityId: null, draft: null } as UiState;
}

/** Guerrier p1 sur la côte (2,1), galère p1 sur l'eau (2,2). */
function merState(units: Parameters<typeof makeState>[0]['units'] = []): GameState {
  return coastalState([
    { id: 'u1', type: 'guerrier', owner: 'p1', ...H(2, 1) },
    { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 2) },
    ...units,
  ]);
}

describe('EMBARQUEMENT-PROGRAMME · D1-B — destinations d\'embarquement programmées', () => {
  it('destinationsEmbarquement : case courante + toutes les cases du chemin soumis, jamais une ville', () => {
    const state = merState();
    // Navire H(2,2)={q1,r2} ; chemin soumis ce tour : H(1,2)={0,2} → H(2,3)={1,3}.
    const orders = [{ type: 'Move', unitId: 'g1', path: [H(1, 2), H(2, 3)] }] as GameView['orders'];
    const cases = destinationsEmbarquement(state, orders, 'p1');
    expect(cases.has(tileKey(1, 2))).toBe(true); // position courante
    expect(cases.has(tileKey(0, 2))).toBe(true); // pas intermédiaire
    expect(cases.has(tileKey(1, 3))).toBe(true); // arrêt
    // D5 : une case de VILLE (entité) n'est jamais embarquable — on simule
    // le navire amarré dans sa ville portuaire.
    const port = merState();
    (port as unknown as { cities: Record<string, { id: string; owner: string; q: number; r: number }> }).cities['c1'] = { id: 'c1', owner: 'p1', ...H(2, 2) };
    const casesPort = destinationsEmbarquement(port, [], 'p1');
    expect(casesPort.has(tileKey(1, 2))).toBe(false);
  });

  it('pathTo vers la case d\'ARRÊT programmé du navire : chemin terrestre jusqu\'à l\'eau embarquable', () => {
    const state = coastalState([
      { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 2) },
      { id: 'u9', type: 'guerrier', owner: 'p1', ...H(0, 1) },
    ]);
    const orders = [{ type: 'Move', unitId: 'g1', path: [H(2, 3), H(1, 2)] }] as GameView['orders'];
    // Sans les destinations programmées : l'eau reste infranchissable.
    expect(pathTo(state, H(0, 1), H(1, 2))).toBeNull();
    // Avec : le guerrier rejoint la case d'arrêt {0,2} du navire (D1-B).
    expect(pathTo(state, H(0, 1), H(1, 2), destinationsEmbarquement(state, orders, 'p1'))).toEqual([H(1, 2)]);
  });

  it('le clic droit DÉCLENCHE l\'embarquement programmé (scénario de la capture)', () => {
    const state = merState([{ id: 'u9', type: 'guerrier', owner: 'p1', ...H(0, 1) }]);
    const orders = [{ type: 'Move', unitId: 'g1', path: [H(1, 2)] }] as GameView['orders'];
    const act = rightClickAction(viewOf(state, orders), uiOf('u9'), H(1, 2));
    expect(act).toEqual({ kind: 'moveDraft', path: [H(1, 2)], unitId: 'u9' });
  });
});

describe('EMBARQUEMENT-PROGRAMME · D3-A — le clic droit d\'une cargaison dépose', () => {
  const cargaisonState = (units: Parameters<typeof makeState>[0]['units'] = []): GameState => {
    const state = merState(units);
    state.units['u1']!.aboard = 'g1';
    state.units['g1']!.cargo = 'u1';
    return state;
  };

  it('cible terrestre libre adjacente au navire : ordre de dépose (un pas)', () => {
    const state = cargaisonState();
    const act = rightClickAction(viewOf(state), uiOf('u1'), H(1, 1));
    expect(act).toEqual({ kind: 'moveDraft', path: [H(1, 1)], unitId: 'u1' });
    expect(deposeValide(state, viewOf(state), state.units['u1']!, H(1, 1))).toBe(true);
  });

  it('cible adjacente à un PAS du chemin programmé du navire : dépose valide (miroir du moteur)', () => {
    const state = cargaisonState();
    const orders = [{ type: 'Move', unitId: 'g1', path: [H(1, 2)] }] as GameView['orders'];
    // (1,1) est adjacente au pas (1,2) mais… aussi au navire (2,2) — on
    // éprouve le pas : (0,1) est adjacente au pas (1,2), pas au navire.
    expect(deposeValide(state, viewOf(state, orders), state.units['u1']!, H(0, 1))).toBe(true);
  });

  it('cible non adjacente au chemin : cancelOrder (ordre ignoré proprement côté moteur)', () => {
    const state = cargaisonState();
    const act = rightClickAction(viewOf(state), uiOf('u1'), H(4, 1));
    expect(act.kind).toBe('cancelOrder');
    expect(deposeValide(state, viewOf(state), state.units['u1']!, H(4, 1))).toBe(false);
  });

  it('cible occupée (au sens dessiné) : refuse — le moteur exige une case libre', () => {
    const state = cargaisonState([{ id: 'u5', type: 'guerrier', owner: 'p2', ...H(1, 1) }]);
    expect(deposeValide(state, viewOf(state), state.units['u1']!, H(1, 1))).toBe(false);
  });
});
