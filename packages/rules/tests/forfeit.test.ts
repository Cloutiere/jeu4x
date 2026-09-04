import { describe, expect, it } from 'vitest';
import { checkForfeit } from '../src/forfeit.js';
import { resolveTurn } from '../src/turn.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateState } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { FORFEIT_MISSED_TURNS } from '../src/constants.js';
import { makeState } from '../src/fixtures.js';

describe('L0 · T-06 · forfait (compteur missedTurns tenu par le serveur)', () => {
  it('sous le seuil T-06 : aucun événement, état inchangé', () => {
    const state = makeState();
    state.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS - 1;
    const { state: out, events } = checkForfeit(state);
    expect(events).toHaveLength(0);
    expect(out.winner).toBeNull();
  });

  it(`à ${FORFEIT_MISSED_TURNS} verrouillages manqués consécutifs : Victory (forfait) pour l’adversaire`, () => {
    const state = makeState();
    state.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS;
    state.lastEventSeq = 5;
    const { state: out, events } = checkForfeit(state);
    expect(events).toEqual([{ seq: 6, type: 'Victory', winner: 'p2', reason: 'forfeit' }]);
    expect(out.winner).toBe('p2');
    expect(out.lastEventSeq).toBe(6);
  });

  it('fonction pure : l’état d’entrée n’est jamais muté', () => {
    const state = makeState();
    state.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS;
    const snapshot = structuredClone(state);
    checkForfeit(state);
    expect(state).toEqual(snapshot);
  });

  it('les deux joueurs au seuil : départage déterministe (le plus petit id perd, R-81)', () => {
    const state = makeState();
    state.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS;
    state.players['p2']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { state: out, events } = checkForfeit(state);
    expect(events).toHaveLength(1);
    expect(out.winner).toBe('p2'); // p1 (id le plus petit) est déclaré perdant
  });

  it('partie déjà terminée : aucun nouvel événement', () => {
    const state = makeState();
    state.winner = 'p1';
    state.players['p2']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { state: out, events } = checkForfeit(state);
    expect(events).toHaveLength(0);
    expect(out.winner).toBe('p1');
  });

  it('le compteur traverse resolveTurn inchangé (il est piloté par le GameDO, pas par le moteur)', () => {
    const state = makeState();
    state.players['p1']!.missedTurns = 2;
    state.players['p2']!.missedTurns = 1;
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.missedTurns).toBe(2);
    expect(newState.players['p2']!.missedTurns).toBe(1);
  });

  it('Victory forfait est un événement public (diffusé tel quel par le brouillard)', () => {
    // couvert indirectement par fog.test.ts (PUBLIC_EVENTS) — garde-fou local
    const state = makeState();
    state.players['p1']!.missedTurns = FORFEIT_MISSED_TURNS;
    const { events } = checkForfeit(state);
    expect(events[0]!.type).toBe('Victory');
  });
});

describe('L0 · Migrations (chaîne de migrations, DESIGN.md §3.8)', () => {
  it(`CURRENT_SCHEMA_VERSION vaut ${CURRENT_SCHEMA_VERSION} et les migrations v2/v3/v4/v5/v6/v7 existent`, () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(15); // 7l : trésorerie R-134 + paliers R-136
    expect(typeof MIGRATIONS[2]).toBe('function');
    expect(typeof MIGRATIONS[3]).toBe('function');
    expect(typeof MIGRATIONS[4]).toBe('function');
    expect(typeof MIGRATIONS[5]).toBe('function');
    expect(typeof MIGRATIONS[6]).toBe('function');
    expect(typeof MIGRATIONS[7]).toBe('function');
    expect(typeof MIGRATIONS[8]).toBe('function');
    expect(typeof MIGRATIONS[9]).toBe('function');
    expect(typeof MIGRATIONS[10]).toBe('function');
  });

  it('un état v1 (sans missedTurns) migre jusqu’à la version courante avec missedTurns = 0 et fortified = false', () => {
    const v2 = makeState();
    const v1Raw = migrateState<Record<string, unknown>>({
      ...structuredClone(v2),
      schemaVersion: 1,
      players: {
        p1: { id: 'p1', gold: 3, science: 1, scienceRatio: 0.5, vision: { explored: [], visible: [] } },
        p2: { id: 'p2', gold: 0, science: 0, scienceRatio: 0.5, vision: { explored: [], visible: [] }, missedTurns: 2 },
      },
    } as unknown as Record<string, unknown>) as unknown as GameState;
    expect(v1Raw.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(v1Raw.players['p1']!.missedTurns).toBe(0);
    // un champ déjà présent est conservé
    expect(v1Raw.players['p2']!.missedTurns).toBe(2);
    expect(v1Raw.players['p1']!.treasury).toBe(3);
    // v2 → v3 (R-33) : fortification absente des anciens états → false
    for (const u of Object.values(v1Raw.units)) expect(u.fortified).toBe(false);
  });

  it('la chaîne est rejouable à l’identique (idempotence par état d’entrée fixé)', () => {
    const v2 = makeState();
    const raw = { ...structuredClone(v2), schemaVersion: 1, players: { p1: { id: 'p1' }, p2: { id: 'p2' } } };
    const a = migrateState<GameState>(structuredClone(raw) as Record<string, unknown>);
    const b = migrateState<GameState>(structuredClone(raw) as Record<string, unknown>);
    expect(a).toEqual(b);
  });
});
