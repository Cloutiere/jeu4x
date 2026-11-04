/**
 * GESTE-ARMEE rév. 2 (04/11, retour d'Erik) — la proposition AUTOMATIQUE :
 * quand ≥ 3 unités amies du même type sont programmées pour finir la
 * prochaine résolution sur la MÊME case (ou y sont déjà co-localisées), le
 * jeu PROPOSE la formation d'une armée — le joueur peut refuser (objectif
 * tactique sans fusion). Au-delà de 3, il sélectionne les unités en cliquant
 * chacune. Les Move déjà programmés persistent (le FormArmy n'est pas leur
 * sujet) : la fusion se produit à la résolution si le mouvement réussit.
 * Fonctions PURES testées — la validation finale reste serveur (R-44).
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey, unitType } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameView } from '../src/lib/gameClient.js';
import { propositionsArmees } from '../src/lib/geste-armee.js';

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

/** 5 guerriers p1 alignés + colon + guerrier ennemi. (0,0)-(1,1) eau. */
function makeEtat(): GameState {
  return makeState({
    width: 10,
    height: 10,
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
      { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 2 },
      { id: 'u3', type: 'guerrier', owner: 'p1', q: 4, r: 2 },
      { id: 'u4', type: 'guerrier', owner: 'p1', q: 5, r: 2 },
      { id: 'u5', type: 'guerrier', owner: 'p1', q: 6, r: 2 },
      { id: 'u6', type: 'colon', owner: 'p1', q: 2, r: 3 },
      { id: 'u7', type: 'guerrier', owner: 'p2', q: 3, r: 3 },
    ],
    terrainOverrides: {
      [tileKey(0, 0)]: 'eau',
      [tileKey(1, 0)]: 'eau',
      [tileKey(0, 1)]: 'eau',
    },
  });
}

describe('propositionsArmees · détection (≥ 3 même type même arrivée)', () => {
  it('3 co-localisées SANS mouvement (production empilée) → 1 proposition, rally = la case', () => {
    const state = makeEtat();
    state.units['u1']!.q = 3;
    state.units['u1']!.r = 2; // u1 rejoint u2 sur (3,2)
    state.units['u3']!.q = 3;
    state.units['u3']!.r = 2;
    const props = propositionsArmees(viewOf(state));
    expect(props).toHaveLength(1);
    expect(props[0]!.membres.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(props[0]!.type).toBe('guerrier');
    expect(props[0]!.rally).toEqual({ q: 3, r: 2 });
  });

  it('Move programmés vers la même case → proposition sur l\'ARRÊT de la prochaine résolution', () => {
    const state = makeEtat();
    // u2 (3,2) et u3 (4,2) programment un pas vers u1 (2,2)? mp 1 : u2→(2,2)
    // direct ; u3 à 2 cases → arrêt (3,2) : PAS de groupe avec u1 ce tour.
    const view = viewOf(state, {
      orders: [
        { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 2 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 3, r: 2 }] },
      ],
    });
    // Arrivées : u2→(2,2) [avec u1], u3→(3,2) [seule] — aucun trio.
    expect(propositionsArmees(view)).toHaveLength(0);
    // u4 (5,2) → (4,2) rejoint l'arrêt de u3 : toujours pas de trio.
    const view2 = viewOf(state, {
      orders: [
        { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 2 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 3, r: 2 }] },
        { type: 'Move', unitId: 'u4', path: [{ q: 4, r: 2 }] },
      ],
    });
    expect(propositionsArmees(view2)).toHaveLength(0);
  });

  it('3 unités programmées vers la MÊME case → proposition sur cette case', () => {
    const state = makeEtat();
    // u1 (2,2) reste ; u2 (3,2) → (2,2) ; u6? non — utilisons u3 : (4,2) est
    // à 2 cases (mp 1, arrêt (3,2)). Déplaçons u3 à (3,1) pour l'adjacence.
    state.units['u3']!.q = 3;
    state.units['u3']!.r = 1;
    const view = viewOf(state, {
      orders: [
        { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 2 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 2 }] },
      ],
    });
    const props = propositionsArmees(view);
    expect(props).toHaveLength(1);
    expect(props[0]!.membres.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(props[0]!.rally).toEqual({ q: 2, r: 2 });
  });

  it('chemin multi-tours : l\'arrêt compte, pas la destination finale', () => {
    const state = makeEtat();
    // u5 (6,2) programmé vers (1,2) — arrêt à mp 1 : (5,2) [u4 y est].
    const view = viewOf(state, {
      orders: [{ type: 'Move', unitId: 'u5', path: [{ q: 5, r: 2 }, { q: 4, r: 2 }, { q: 3, r: 2 }, { q: 2, r: 2 }, { q: 1, r: 2 }] }],
    });
    const props = propositionsArmees(view);
    // u4 (5,2) immobile + u5 arrêt (5,2) : seulement 2 — aucun trio.
    expect(props).toHaveLength(0);
  });

  it('exclusions : armées, membres d\'un FormArmy en cours, à bord, ennemis, autres types', () => {
    const state = makeEtat();
    for (const id of ['u1', 'u2', 'u3']) {
      state.units[id]!.q = 3;
      state.units[id]!.r = 2;
    }
    state.units['u1']!.isArmy = true; // déjà une armée
    const v1 = viewOf(state);
    expect(propositionsArmees(v1)).toHaveLength(0); // reste u2,u3 — 2 seulement

    state.units['u1']!.isArmy = false;
    const v2 = viewOf(state, {
      orders: [{ type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 3, r: 2 } }],
    });
    expect(propositionsArmees(v2)).toHaveLength(0); // déjà programmé

    state.units['u2']!.aboard = 'n9'; // à bord
    const v3 = viewOf(state);
    expect(propositionsArmees(v3)).toHaveLength(0); // u1,u3 + personne
  });

  it('plus de 3 : TOUTES les unités du groupe sont listées (le joueur en choisit 3)', () => {
    const state = makeEtat();
    for (const id of ['u1', 'u2', 'u3', 'u4', 'u5']) {
      state.units[id]!.q = 3;
      state.units[id]!.r = 2;
    }
    const props = propositionsArmees(viewOf(state));
    expect(props).toHaveLength(1);
    expect(props[0]!.membres.sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(props[0]!.type).toBe('guerrier');
  });

  it('deux groupes distincts (types différents) → deux propositions', () => {
    const state = makeEtat();
    for (const id of ['u1', 'u2', 'u3']) {
      state.units[id]!.q = 3;
      state.units[id]!.r = 2;
    }
    // u6 colon + 2 autres colons ailleurs? Il n'y en a qu'un — groupe colon
    // impossible ; second groupe : déplaçons u4/u5 colons dans l'état.
    state.units['u4']!.type = 'colon';
    state.units['u4']!.q = 5;
    state.units['u4']!.r = 5;
    state.units['u5']!.type = 'colon';
    state.units['u5']!.q = 5;
    state.units['u5']!.r = 5;
    state.units['u6']!.q = 5;
    state.units['u6']!.r = 5;
    const props = propositionsArmees(viewOf(state));
    expect(props).toHaveLength(2);
    expect(props.map((p) => p.type).sort()).toEqual(['colon', 'guerrier']);
  });

  it('déterminisme : membres triés par id, propositions par (type, case)', () => {
    const state = makeEtat();
    for (const id of ['u3', 'u1', 'u2']) {
      state.units[id]!.q = 3;
      state.units[id]!.r = 2;
    }
    const props = propositionsArmees(viewOf(state));
    expect(props[0]!.membres).toEqual(['u1', 'u2', 'u3']);
  });

  it('utile : unitType sans aquatic pour un terrestre — navires exclus', () => {
    const state = makeEtat();
    state.units['u4']!.type = 'galere';
    state.units['u5']!.type = 'galere';
    expect(unitType('galere').aquatic).toBe(true);
    for (const id of ['u1', 'u2', 'u4']) {
      state.units[id]!.q = 3;
      state.units[id]!.r = 2;
    }
    // u1,u2 guerriers + u4 galère : types mélangés — pas de trio même type.
    expect(propositionsArmees(viewOf(state))).toHaveLength(0);
  });
});
