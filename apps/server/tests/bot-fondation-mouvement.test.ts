/**
 * BOT-FONDATION-MOUVEMENT (décisions Erik 24/10) — au premier tour des cartes
 * à départ Colon, le bot fonde SA capitale ET assigne des objectifs à TOUTES
 * ses autres unités (le guerrier patrouille/bouge dès t1 — miroir
 * BOT-EXPLORATION). La fondation reste la première priorité : le colon
 * fondateur ne reçoit JAMAIS d'ordre de mouvement (D1).
 */
import { describe, expect, it } from 'vitest';
import { createRng, makeState } from "@game/rules";
import type { GameState } from '@game/rules';
import { botPolicy } from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** État de base : prairie 8×8 (PAIX R-187), départ colon sans ville. */
function state(opts: {
  units: Array<{ id: string; type: string; owner: string; q: number; r: number }>;
}): GameState {
  return makeState({
    width: 8,
    height: 8,
    players: [HUMAN, BOT],
    warPairs: [],
    units: opts.units.map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: [],
    rngSeed: 42,
  }) as GameState;
}

describe('BOT-FONDATION-MOUVEMENT · D1 — fondation ET ordres au même tour', () => {
  it('t1 départ colon : FoundCity du colon ET ordre de mouvement du guerrier (même tour)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'colon', owner: BOT, q: 2, r: 3 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 2, r: 4 },
      ],
    });
    const plan = botPolicy(s, BOT, createRng(7));
    const fondation = plan.orders.find((o) => o.type === 'FoundCity');
    expect(fondation).toMatchObject({ type: 'FoundCity', unitId: 'b1' });
    const guerrier = plan.orders.find((o) => 'unitId' in o && o.unitId === 'b2');
    expect(guerrier?.type).toBe('Move'); // le guerrier BOUGE déjà au tour de la fondation
  });

  it('D1 : le colon fondateur ne reçoit JAMAIS d\'ordre de mouvement (fondation = priorité)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'colon', owner: BOT, q: 2, r: 3 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 2, r: 4 },
      ],
    });
    const plan = botPolicy(s, BOT, createRng(7));
    const ordresColon = plan.orders.filter((o) => 'unitId' in o && o.unitId === 'b1');
    expect(ordresColon.map((o) => o.type)).toEqual(['FoundCity']);
  });

  it('pas de régression : colon seul ⇒ FoundCity émis (comportement CARTE-MULTI conservé)', () => {
    const s = state({ units: [{ id: 'b1', type: 'colon', owner: BOT, q: 2, r: 3 }] });
    const plan = botPolicy(s, BOT, createRng(7));
    expect(plan.orders.find((o) => o.type === 'FoundCity')).toMatchObject({ unitId: 'b1' });
  });

  it('déterminisme : même seed ⇒ mêmes ordres (fondation + mouvement)', () => {
    const s = state({
      units: [
        { id: 'b1', type: 'colon', owner: BOT, q: 2, r: 3 },
        { id: 'b2', type: 'guerrier', owner: BOT, q: 2, r: 4 },
      ],
    });
    const ordres = (seed: number) => JSON.stringify(botPolicy(s, BOT, createRng(seed)).orders);
    expect(ordres(7)).toBe(ordres(7));
    expect(ordres(0)).toBe(ordres(1));
  });
});
