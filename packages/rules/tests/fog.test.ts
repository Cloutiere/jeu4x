import { describe, expect, it } from 'vitest';
import { filterEventsForPlayer, getFilteredState } from '../src/fog.js';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import type { GameEvent } from '../src/events.js';
import type { GameState, Order } from '../src/state.js';

describe('L5 · R-70 · trois états du brouillard', () => {
  it('les cases inexplorées sont ABSENTES de la carte filtrée (pas seulement nulles)', () => {
    const state = makeState({
      width: 10,
      height: 10,
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    const far = tileKeyOf(colRowToHex(9, 9)); // distance 14 du guerrier
    const fogged = getFilteredState(state, 'p1');
    expect(state.map[far]).toBeDefined();
    expect(fogged.map[far]).toBeUndefined();
    expect(fogged.map['0,0']).toBeDefined(); // case visible présente
  });

  it('exploré-masqué : le terrain reste, les entités ennemies disparaissent (R-70)', () => {
    const state = makeState({
      width: 12,
      height: 12,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 5, r: 0 },
      ],
    });
    // p1 a mémorisé la case de u2 (explorée), mais ne la voit plus (distance 5 > 2)
    state.players['p1']!.vision.explored = ['5,0'];
    const fogged = getFilteredState(state, 'p1');
    expect(fogged.map['5,0']).toBeDefined(); // terrain mémorisé
    expect(fogged.units['u2']).toBeUndefined(); // ennemi masqué
  });

  it('visible : l’ennemi dans le rayon est diffusé', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 }, // distance 2 ≤ vision
      ],
    });
    const fogged = getFilteredState(state, 'p1');
    expect(fogged.units['u2']).toMatchObject({ id: 'u2' });
  });

  it('les unités amies sont toujours diffusées, même hors vision', () => {
    const state = makeState({
      width: 20,
      height: 20,
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 }],
    });
    const fogged = getFilteredState(state, 'p1');
    expect(fogged.units['u1']).toBeDefined();
  });
});

describe('L5 · fuite d’information — état filtré', () => {
  it('ne contient jamais l’unité ennemie hors vision, y compris après un combat loin de la vue', () => {
    // p2 détruit un colon de p1 au loin (distance > 2 de toute autre entité de p1).
    const state = makeState({
      width: 30,
      height: 30,
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 0 },
        { id: 'u3', type: 'colon', owner: 'p1', q: 21, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [],
      p2: [{ type: 'Attack', unitId: 'u2', target: { q: 21, r: 0 } }],
    };
    const { newState } = resolveTurn(state, orders, 7);
    const fogged = getFilteredState(newState, 'p1');
    // u2 (vainqueur ennemi, hors de vue) n'apparaît jamais
    expect(fogged.units['u2']).toBeUndefined();
    // u3 a été détruit (+ butin) : il n'est plus nulle part
    expect(fogged.units['u3']).toBeUndefined();
    expect(newState.units['u3']).toBeUndefined();
    // l'unité amie de p1 reste visible
    expect(fogged.units['u1']).toBeDefined();
    expect(fogged.rngSeed).toBe(0); // la graine ne quitte jamais le serveur
    for (const p of Object.keys(fogged.players)) {
      if (p !== 'p1') {
        expect(fogged.players[p]!.vision).toEqual({ explored: [], visible: [] });
      }
    }
  });

  it('getFilteredState ne mute pas l’état d’entrée', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    const before = JSON.stringify(state);
    getFilteredState(state, 'p1');
    getFilteredState(state, 'p2');
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('L5 · journal d’événements filtré', () => {
  function resolveFarCombat(): { newState: GameState; events: GameEvent[] } {
    const state = makeState({
      width: 30,
      height: 30,
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 0 },
        { id: 'u3', type: 'colon', owner: 'p1', q: 21, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [],
      p2: [{ type: 'Attack', unitId: 'u2', target: { q: 21, r: 0 } }],
    };
    return resolveTurn(state, orders, 7);
  }

  it('un combat/capture implique les deux joueurs (1v1) : chacun reçoit ses événements', () => {
    const { newState, events } = resolveFarCombat();
    for (const viewer of ['p1', 'p2'] as const) {
      const seen = filterEventsForPlayer(newState, viewer, events);
      const types = new Set(seen.map((e) => e.type));
      expect(types.has('TurnResolved')).toBe(true);
      // attaquer un Colon = capture (R-43/R-57) : pas d'échange, mais la capture
      // et le butin sont portés à la connaissance des deux camps (1v1).
      expect(types.has('Captured')).toBe(true);
      expect(types.has('BootyGold')).toBe(true);
    }
  });

  it('le mouvement ennemi hors de vue n’apprend rien (ni position ni chemin)', () => {
    const state = makeState({
      width: 30,
      height: 30,
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 20, r: 0 },
        { id: 'u3', type: 'guerrier', owner: 'p2', q: 21, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 22, r: 0 }, { q: 23, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 7);
    const seen = filterEventsForPlayer(newState, 'p1', events);
    // aucun événement de mouvement de p2 ne filtre vers p1
    expect(seen.some((e) => e.type === 'Move' && e.owner === 'p2')).toBe(false);
    // p2, lui, voit les siens
    const seenByP2 = filterEventsForPlayer(newState, 'p2', events);
    expect(seenByP2.some((e) => e.type === 'Move' && e.owner === 'p2')).toBe(true);
  });

  it('un événement impliquant une unité du joueur passe toujours (il y a participé)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }],
      p2: [],
    };
    const { newState, events } = resolveTurn(state, orders, 7);
    for (const viewer of ['p1', 'p2'] as const) {
      const seen = filterEventsForPlayer(newState, viewer, events);
      expect(seen.some((e) => e.type === 'Attack')).toBe(true);
    }
  });
});
