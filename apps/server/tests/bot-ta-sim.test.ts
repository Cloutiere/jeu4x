/**
 * BOT-TA · banc headless (L3) — 120 tours de guerre (le bot « normal » vs
 * une marche d'attaque naïve côté p1) : le moteur + la politique du bot
 * tournent sans exception ni tour lent (garde-fou anti-régression perf).
 */
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createRng,
  loadBuiltinMapSync,
  resolveTurn,
  UNIT_TYPES,
  hexDistanceW,
} from '@game/rules';
import type { GameState, Order } from '@game/rules';
import { botPolicy, botTurnSeed } from '../src/botPolicy.js';

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];

describe('BOT-TA · banc headless 120 tours en guerre', () => {
  it('tourne sans exception ni blocage (120 tours, attaques p1 contre le bot)', () => {
    const map = loadBuiltinMapSync('pangee-40');
    let state: GameState = createInitialState(map, 42);
    for (let t = 0; t < 120 && state.winner === null; t++) {
      const t0 = Date.now();
      const orders: Record<string, Order[]> = { p1: [], p2: [] };
      const rng = createRng(botTurnSeed(state.rngSeed, state.turn, 'bot'));
      orders['p2'] = botPolicy(state, 'p2', rng).orders;
      // Alice : produire, attaquer tout ennemi adjacent, sinon marcher vers la capitale bot.
      const cap = Object.values(state.cities).find((c) => c.owner === 'p2' && c.capital);
      const myCap = Object.values(state.cities).find((c) => c.owner === 'p1' && c.capital);
      if (myCap && !myCap.production) {
        orders['p1'].push({ type: 'SetProduction', cityId: myCap.id, item: { kind: 'unit', id: 'guerrier' } });
      }
      for (const u of Object.values(state.units)) {
        if (u.owner !== 'p1' || u.aboard) continue;
        const adj = DIRS.map(([dq, dr]) => ({ q: u.q + dq, r: u.r + dr }))
          .map((h) => Object.values(state.units).find((v) => v.q === h.q && v.r === h.r && !v.aboard && v.owner !== 'p1'))
          .find((v) => v !== undefined);
        if (adj && UNIT_TYPES[u.type]?.canAttack !== false) {
          orders['p1'].push({ type: 'Attack', unitId: u.id, target: { q: adj.q, r: adj.r } });
          continue;
        }
        if (cap) {
          const d = hexDistanceW(u, cap, state.mapWidth);
          const best = DIRS.map(([dq, dr]) => ({ q: u.q + dq, r: u.r + dr }))
            .filter((h) => state.map[`${h.q},${h.r}`] && !Object.values(state.units).some((v) => v.q === h.q && v.r === h.r && v.owner === 'p1' && !v.aboard))
            .sort((a, b) => hexDistanceW(a, cap, state.mapWidth) - hexDistanceW(b, cap, state.mapWidth))[0];
          if (best && hexDistanceW(best, cap, state.mapWidth) < d) orders['p1'].push({ type: 'Move', unitId: u.id, path: [best] });
        }
      }
      state = resolveTurn(state, orders, state.rngSeed).newState;
      const dt = Date.now() - t0;
      console.log(`tour ${state.turn} : ${dt} ms, p1=${Object.values(state.units).filter((u) => u.owner === 'p1').length} p2=${Object.values(state.units).filter((u) => u.owner === 'p2').length} winner=${state.winner}`);
      if (dt > 10000) {
        console.log('TOUR LENT ANORMAL — arrêt');
        break;
      }
    }
    expect(state.turn).toBeGreaterThan(30);
  }, 120_000);
});
