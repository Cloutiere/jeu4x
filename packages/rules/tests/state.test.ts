import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  areAtWar,
  compareUnitIds,
  migrateState,
  nextId,
} from '../src/state.js';
import type { GameState } from '../src/state.js';
import { eventRefs } from '../src/events.js';
import type { GameEvent } from '../src/events.js';
import { TERRAINS } from '../src/data.js';
import { cityAt, makeState, unit, unitAt } from '../src/fixtures.js';

describe('L2 · GameState versionné (DESIGN.md §3.8)', () => {
  it('la version courante est exportée avec la chaîne de migrations (v4 depuis l’économie Phase 6)', () => {
    const state = makeState();
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(MIGRATIONS).toBeTypeOf('object');
    expect(typeof MIGRATIONS[2]).toBe('function');
    expect(typeof MIGRATIONS[3]).toBe('function');
    expect(typeof MIGRATIONS[4]).toBe('function');
  });

  it('migrateState laisse passer un état à jour à l’identique (chaîne v4→v4 vide)', () => {
    const state = makeState();
    const out = migrateState<GameState>(state as unknown as Record<string, unknown>);
    expect(out).toEqual(state);
  });

  it('migrateState rejette une version inconnue ou futuriste', () => {
    expect(() => migrateState({ schemaVersion: 0 })).toThrow();
    expect(() => migrateState({ schemaVersion: 5 })).toThrow();
    expect(() => migrateState({})).toThrow();
  });
});

describe('L2 · Structure du GameState (DESIGN.md §4.2)', () => {
  it('la fixture construit un état complet : carte, joueurs, unités, villes, settings', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
      cities: [{ id: 'c1', owner: 'p1', q: 1, r: 0, capital: true }],
    });
    expect(Object.keys(state.map)).toHaveLength(64); // 8×8
    expect(state.players['p1']).toBeDefined();
    expect(state.players['p2']).toBeDefined();
    expect(state.units['u1']).toMatchObject({ type: 'guerrier', hp: 3, mp: 1 });
    expect(state.cities['c1']).toMatchObject({ pop: 1, capital: true });
    expect(state.phase).toBe('orders');
    expect(state.turn).toBe(0);
    expect(state.winner).toBeNull();
  });

  it('les terrains de données incluent la case de ville (RULES.md §2 : +50 %, 2/1/1)', () => {
    expect(TERRAINS['ville']).toMatchObject({
      passable: true,
      defenseBonus: 0.5,
      yields: { food: 2, production: 1, commerce: 1 },
    });
  });

  it('unitAt / cityAt retrouvent les entités par position', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 2, r: 3 }],
      cities: [{ id: 'c1', owner: 'p2', q: 5, r: 5 }],
    });
    expect(unit(state, 'u1').type).toBe('colon');
    expect(state.cities['c1']).toBeDefined();
    expect(unitAt(state, 2, 3)?.id).toBe('u1');
    expect(unitAt(state, 0, 0)).toBeNull();
    expect(cityAt(state, 5, 5)?.id).toBe('c1');
  });
});

describe('L2 · R-58 · points d’accroche diplomatie', () => {
  it('v1 : les deux joueurs sont en guerre permanente', () => {
    const state = makeState();
    expect(areAtWar(state, 'p1', 'p2')).toBe(true);
    expect(areAtWar(state, 'p2', 'p1')).toBe(true);
  });

  it('une paire non déclarée est en paix (hook R-58-a pour la Phase 7)', () => {
    const state = makeState({ players: ['p1', 'p2', 'p3'], warPairs: [['p1', 'p2']] });
    expect(areAtWar(state, 'p1', 'p3')).toBe(false);
    expect(areAtWar(state, 'p2', 'p3')).toBe(false);
  });
});

describe('L2 · Tri déterministe des identifiants (R-81)', () => {
  it('compareUnitIds trie par suffixe numérique, pas lexicalement', () => {
    const ids = ['u10', 'u2', 'u1', 'u33'];
    expect([...ids].sort(compareUnitIds)).toEqual(['u1', 'u2', 'u10', 'u33']);
  });

  it('nextId propose max(suffixe) + 1', () => {
    expect(nextId({ u1: 1, u4: 1 }, 'u')).toBe('u5');
    expect(nextId({}, 'c')).toBe('c1');
  });
});

describe('L2 · Journal d’événements typé (R-73)', () => {
  const events: GameEvent[] = [
    { seq: 1, type: 'Move', unitId: 'u1', owner: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } },
    { seq: 2, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: { q: 1, r: 0 } },
    {
      seq: 3,
      type: 'CombatExchange',
      attackerId: 'u1',
      defenderId: 'u2',
      at: { q: 1, r: 0 },
      attackerHpAfter: 3,
      defenderHpAfter: 2,
    },
    { seq: 4, type: 'UnitDestroyed', unitId: 'u2', owner: 'p2', at: { q: 1, r: 0 }, cause: 'combat', byUnitId: 'u1' },
    { seq: 5, type: 'Retreat', unitId: 'u3', owner: 'p2', from: { q: 2, r: 0 }, to: { q: 2, r: 1 } },
    { seq: 6, type: 'Captured', unitId: 'u4', owner: 'p2', byPlayer: 'p1', at: { q: 0, r: 1 }, outcome: 'destroyed' },
    { seq: 7, type: 'BootyGold', player: 'p1', amount: 10, sourceUnitId: 'u4' },
    { seq: 8, type: 'ArmyFormed', unitId: 'u9', owner: 'p1', memberIds: ['u1', 'u5', 'u6'], at: { q: 1, r: 0 } },
    { seq: 9, type: 'CityFounded', cityId: 'c2', owner: 'p1', at: { q: 3, r: 3 }, capital: false, byUnitId: 'u4' },
    { seq: 10, type: 'CityCaptured', cityId: 'c1', fromOwner: 'p2', toOwner: 'p1', at: { q: 5, r: 5 } },
    { seq: 11, type: 'DiplomaticIncident', between: ['p1', 'p2'], at: { q: 1, r: 1 } },
    { seq: 12, type: 'TurnResolved', turn: 1 },
  ];

  it('l’union typée couvre au minimum les 12 types demandés (HANDOFF L2)', () => {
    const types = new Set(events.map((e) => e.type));
    const required: Array<GameEvent['type']> = [
      'Move',
      'Attack',
      'CombatExchange',
      'UnitDestroyed',
      'Retreat',
      'Captured',
      'BootyGold',
      'ArmyFormed',
      'CityFounded',
      'CityCaptured',
      'DiplomaticIncident',
      'TurnResolved',
    ];
    for (const t of required) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('eventRefs extrait les références pour le filtrage par brouillard (L5)', () => {
    expect(eventRefs(events[0]!)).toEqual({
      tiles: ['0,0', '1,0'],
      unitIds: ['u1'],
      cityIds: [],
      players: ['p1'],
    });
    expect(eventRefs({ seq: 99, type: 'TurnResolved', turn: 3 })).toEqual({
      tiles: [],
      unitIds: [],
      cityIds: [],
      players: [],
    });
  });
});
