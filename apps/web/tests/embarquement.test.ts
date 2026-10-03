/**
 * EMBARQUEMENT-BUG (signalement Erik 02/10) — non-régression R-117 embarquement.
 *
 * Panne diagnostiquée : le moteur embarquait correctement (turn.ts, cas R-117
 * AVANT canEnter), mais le client refusait le geste — `pathTo` exigeait une
 * destination ENTRABLE PAR LE TERRAIN, ce qu'une case d'eau n'est jamais pour
 * une unité terrestre : le clic droit sur le navire produisait cancelOrder.
 * Correctif : la destination est admise si elle porte un transport ami à
 * cargaison libre (R-117), transit toujours refusé.
 *
 * Deux couches testées ici sur les MÊMES états :
 *  - client (`pathTo`/`rightClickAction`) — le geste d'Erik ;
 *  - moteur pur (`resolveTurn`) — embarquement mer/quai, débarquement,
 *    cargaison pleine, chemin gelé, événements.
 * Transversal post-PLACEMENT-MELEE : case amie TERRESTRE = cohabitation,
 * case transport = embarquement — les deux coexistent.
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import { resolveTurn } from '@game/rules';
import type { GameEvent, GameState, Hex } from '@game/rules';
import { pathTo, rightClickAction } from '../src/lib/render/interaction.js';
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

function viewOf(state: GameState): GameView {
  return {
    code: 'TEST',
    playerId: 'you1',
    players: [{ id: 'you1', engineId: 'p1', name: 'moi', bot: false }],
    status: 'active',
    phase: 'orders',
    locked: false,
    state,
    orders: [],
    events: [],
    lastSeq: 0,
    seenEventSeq: -1,
  } as unknown as GameView;
}

function uiOf(selectedUnitId: string | null): UiState {
  return { selectedUnitId, selectedCityId: null, draft: null } as UiState;
}

/** Guerrier p1 sur la côte (2,1), galère p1 sur l'eau (2,2) — adjacents. */
function merState(units: Parameters<typeof makeState>[0]['units'] = []): GameState {
  return coastalState([
    { id: 'u1', type: 'guerrier', owner: 'p1', ...H(2, 1) },
    { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 2) },
    ...units,
  ]);
}

const MER_FROM = H(2, 1);
const MER_TO = H(2, 2);

function eventsOf(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

// ---------------------------------------------------------------------------
// Client — le geste d'Erik : clic droit sur la case du navire
// ---------------------------------------------------------------------------
describe('embarquement · client pathTo/clic droit (le geste d\'Erik)', () => {
  it('pathTo vers le transport ami EN MER : chemin d\'un pas (était null — la panne)', () => {
    const state = merState();
    expect(pathTo(state, MER_FROM, MER_TO)).toEqual([MER_TO]);
  });

  it('rightClickAction produit moveDraft, pas cancelOrder', () => {
    const state = merState();
    const act = rightClickAction(viewOf(state), uiOf('u1'), MER_TO);
    expect(act).toEqual({ kind: 'moveDraft', path: [MER_TO], unitId: 'u1' });
  });

  it('embarquement À QUAI (ville portuaire) : pathTo passe aussi', () => {
    const state = merState();
    state.map[tileKey(2, 2)]!.terrain = 'ville';
    expect(pathTo(state, MER_FROM, MER_TO)).toEqual([MER_TO]);
  });

  it('cargaison À BORD : capacité INFINIE (D7) — le chemin passe quand même', () => {
    const state = merState([{ id: 'u2', type: 'colon', owner: 'p1', ...H(4, 1) }]);
    state.units['u2']!.aboard = 'g1';
    state.units['g1']!.cargo = 'u2';
    expect(pathTo(state, MER_FROM, MER_TO)).toEqual([MER_TO]);
    expect(rightClickAction(viewOf(state), uiOf('u1'), MER_TO).kind).toBe('moveDraft');
  });

  it('transport ENNEMI : pas embarquable — pas de chemin vers l\'eau', () => {
    const state = merState();
    state.units['g1']!.owner = 'p2';
    expect(pathTo(state, MER_FROM, MER_TO)).toBeNull();
  });

  it('occupant ami NON transport (guerrier sur la côte) : cohabitation inchangée', () => {
    const state = coastalState([
      { id: 'u1', type: 'guerrier', owner: 'p1', ...H(2, 1) },
      { id: 'u2', type: 'guerrier', owner: 'p1', ...H(3, 1) },
    ]);
    expect(pathTo(state, H(2, 1), H(3, 1))).toEqual([H(3, 1)]);
  });

  it('unité NAVALE : rien de changé — elle entre sur l\'eau par son propre prédicat', () => {
    const state = coastalState([
      { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 3) },
    ]);
    expect(pathTo(state, H(2, 3), H(2, 2))).toEqual([H(2, 2)]);
  });

  it('case d\'eau SANS transport (ni inconnue) : toujours refusée pour un terrestre', () => {
    const state = coastalState([{ id: 'u1', type: 'guerrier', owner: 'p1', ...H(2, 1) }]);
    expect(pathTo(state, H(2, 1), H(3, 2))).toBeNull(); // eau vide adjacente
  });
});

// ---------------------------------------------------------------------------
// Moteur pur — R-117 de bout en bout
// ---------------------------------------------------------------------------
describe('embarquement · moteur pur (resolveTurn)', () => {
  it('embarquement en mer : aboard + événement Embark, PM dépensé', () => {
    const state = merState();
    const res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [MER_TO] }] }, 1);
    expect(res.newState.units['u1']!.aboard).toBe('g1');
    expect(res.newState.units['g1']!.cargo).toBe('u1');
    expect(eventsOf(res.events, 'Embark')).toHaveLength(1);
  });

  it('embarquement à quai : la ville portuaire porte le transport', () => {
    const state = merState();
    state.map[tileKey(2, 2)]!.terrain = 'ville';
    const res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [MER_TO] }] }, 1);
    expect(res.newState.units['u1']!.aboard).toBe('g1');
    expect(eventsOf(res.events, 'Embark')).toHaveLength(1);
  });

  it('cargaison à bord : capacité INFINIE (D7) — la pile embarque quand même', () => {
    const state = merState([{ id: 'u2', type: 'colon', owner: 'p1', ...H(4, 1) }]);
    state.units['u2']!.aboard = 'g1';
    state.units['g1']!.cargo = 'u2';
    const res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [MER_TO] }] }, 1);
    expect(res.newState.units['u1']).toMatchObject({ aboard: 'g1', q: MER_TO.q, r: MER_TO.r });
    expect(eventsOf(res.events, 'Embark')).toHaveLength(1);
  });

  it('débarquement : premier pas sur une case terrestre libre → Disembark', () => {
    const state = merState();
    state.units['u1']!.aboard = 'g1';
    state.units['g1']!.cargo = 'u1';
    const cible = H(1, 1); // terre libre adjacente au transport
    const res = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [cible] }] }, 1);
    expect(res.newState.units['u1']).toMatchObject({ aboard: null, q: cible.q, r: cible.r });
    expect(res.newState.units['g1']!.cargo).toBeNull();
    expect(eventsOf(res.events, 'Disembark')).toHaveLength(1);
  });

  it('chemin gelé : T1 approche (PM 1), T2 embarque, T3 débarque', () => {
    // u1 à 2 cases du transport embarquable, chemin programmé jusqu'au
    // débarquement : chaque tour consomme 1 PM (movement 1).
    const state = coastalState([
      { id: 'u1', type: 'guerrier', owner: 'p1', ...H(0, 1) },
      { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 2) },
    ]);
    const chemin = [H(1, 1), H(2, 2), H(1, 1)]; // approche, embarquer, redébarquer
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: chemin }] }, 1);
    expect(t1.newState.units['u1']).toMatchObject({ q: H(1, 1).q, r: H(1, 1).r, aboard: null });
    expect(t1.newState.units['u1']!.order).not.toBeNull(); // le reste est gelé
    const t2 = resolveTurn(t1.newState, {}, 2);
    expect(t2.newState.units['u1']!.aboard).toBe('g1'); // embarquement (R-117)
    // D4 (rev. EMBARQUEMENT-PROGRAMME) : le gel post-embarquement est abrogé —
    // T3 sans ordre de dépose : l'unité RESTE à bord.
    const t3 = resolveTurn(t2.newState, {}, 3);
    expect(t3.newState.units['u1']!.aboard).toBe('g1');
  });

  it('transversal post-PLACEMENT-MELEE : même tour, arrivée case amie terrestre ET embarquement coexistent', () => {
    // Client : les deux destinations sont TRAÇABLES (case amie terrestre
    // occupée — INTERACTION-3D ; case transport — R-117), sans conflit.
    const st = coastalState([
      { id: 'u1', type: 'guerrier', owner: 'p1', ...H(3, 1) },
      { id: 'u2', type: 'guerrier', owner: 'p1', ...H(2, 1) },
      { id: 'u3', type: 'colon', owner: 'p1', ...H(1, 1) },
      { id: 'g1', type: 'galere', owner: 'p1', ...H(2, 2) },
    ]);
    expect(pathTo(st, H(3, 1), H(2, 1))).toEqual([H(2, 1)]); // amie terrestre
    expect(pathTo(st, H(1, 1), H(2, 2))).toEqual([H(2, 2)]); // transport
    // Moteur : la case amie terrestre REFUSE l'entrée (R-159 rév. B — u1
    // s'arrête avant), la case transport EMBARQUE (R-117).
    const res = resolveTurn(
      st,
      {
        p1: [
          { type: 'Move', unitId: 'u1', path: [H(2, 1)] },
          { type: 'Move', unitId: 'u3', path: [H(2, 2)] },
        ],
      },
      1,
    );
    expect(res.newState.units['u1']).toMatchObject({ q: H(3, 1).q, r: H(3, 1).r });
    expect(res.newState.units['u2']).toMatchObject({ q: H(2, 1).q, r: H(2, 1).r });
    // Embarquement : u3 à bord, u2 reste une entité de carte (non embarqué).
    expect(res.newState.units['u3']!.aboard).toBe('g1');
    expect(eventsOf(res.events, 'Embark')).toHaveLength(1);
  });
});
