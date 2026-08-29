/**
 * L6 — Propriétés transversales (fast-check) sur des états aléatoires valides :
 *  - déterminisme / idempotence de resolveTurn (R-80) ;
 *  - invariant R-30 (non-empilement) après chaque tour ;
 *  - conservation des unités : aucune disparition sans événement correspondant.
 * Graine fast-check fixée pour la reproductibilité des contre-exemples.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { colRowToHex, neighbors, tileKeyOf } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent } from '../src/events.js';

const WIDTH = 8;
const HEIGHT = 6;

/** Arbitraires de base. */
const hexArb = fc.record({ q: fc.integer({ min: 0, max: WIDTH - 1 }), r: fc.integer({ min: 0, max: HEIGHT - 1 }) })
  .map(({ q, r }) => colRowToHex(q, r));

const passableTileArb: fc.Arbitrary<ReturnType<typeof colRowToHex>> = hexArb.filter((h) => {
  const tile = makeState({ width: WIDTH, height: HEIGHT }).map[tileKeyOf(h)];
  return !!tile && TERRAINS[tile.terrain]!.passable;
});

/** État aléatoire valide : terrains (10 % montagne), 2 à 6 unités sur cases praticables distinctes, capitales optionnelles. */
const stateArb: fc.Arbitrary<GameState> = fc
  .record({
    mountains: fc.uniqueArray(hexArb, { maxLength: 6, selector: (h) => tileKeyOf(h) }),
    units: fc.uniqueArray(
      fc.record({ owner: fc.constantFrom('p1', 'p2'), type: fc.constantFrom('guerrier', 'colon'), at: passableTileArb }),
      { minLength: 2, maxLength: 6, selector: (u) => tileKeyOf(u.at) },
    ),
    withCapitals: fc.boolean(),
    seed: fc.integer({ min: 0, max: 0xffff }),
  })
  .map(({ mountains, units, withCapitals, seed }) => {
    const overrides: Record<string, 'montagne'> = {};
    for (const m of mountains) overrides[tileKeyOf(m)] = 'montagne';
    // retire les unités posées sur une montagne, puis déduplique les positions :
    // l'état d'entrée doit être VALIDE (R-30) — précondition de la propriété.
    const seen = new Set<string>();
    const okUnits = units.filter((u) => {
      const key = tileKeyOf(u.at);
      if (overrides[key] || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const cities = withCapitals
      ? [
          { id: 'c1', owner: 'p1', q: okUnits[0]?.at.q ?? 0, r: okUnits[0]?.at.r ?? 0, capital: true },
        ]
      : [];
    return makeState({
      width: WIDTH,
      height: HEIGHT,
      terrainOverrides: overrides,
      units: okUnits.map((u, i) => ({
        id: `u${i + 1}`,
        type: u.type,
        owner: u.owner,
        q: u.at.q,
        r: u.at.r,
      })),
      cities,
      rngSeed: seed,
    });
  });

/** Ordres aléatoires : chemins de 1 à 3 pas, attaques adjacentes, FoundCity, Hold, FormArmy. */
function ordersArb(state: GameState): fc.Arbitrary<Record<string, Order[]>> {
  const unitArbs = Object.values(state.units);
  if (unitArbs.length === 0) return fc.constant({});
  const perUnitArb = fc.array(
    fc.record({ unit: fc.constantFrom(...unitArbs), kind: fc.integer({ min: 0, max: 9 }) }),
    { maxLength: 6 },
  );
  return perUnitArb.map((entries) => {
    const orders: Order[] = [];
    const seen = new Set<string>();
    for (const { unit, kind } of entries) {
      if (seen.has(unit.id)) continue; // un ordre par unité
      seen.add(unit.id);
      const stats = TERRAINS; // (silence linter : référence stable)
      void stats;
      if (kind <= 4) {
        // Move : chemin de 1 à 3 pas de voisins en voisins
        const path: Array<{ q: number; r: number }> = [];
        let cur = { q: unit.q, r: unit.r };
        const steps = 1 + (kind % 3);
        for (let i = 0; i < steps; i++) {
          const nexts = neighbors(cur);
          cur = nexts[(unit.q * 7 + unit.r * 13 + i * 5 + path.length) % nexts.length]!;
          path.push(cur);
        }
        orders.push({ type: 'Move', unitId: unit.id, path });
      } else if (kind === 5) {
        const target = neighbors(unit)[(unit.q + unit.r) % 6]!;
        orders.push({ type: 'Attack', unitId: unit.id, target });
      } else if (kind === 6 && unit.type === 'colon') {
        orders.push({ type: 'FoundCity', unitId: unit.id });
      } else if (kind === 7) {
        orders.push({ type: 'Hold', unitId: unit.id });
      } else {
        // FormArmy si 3 unités de même type/propriétaire existent, sinon rien
        const sameType = Object.values(state.units).filter((u) => u.owner === unit.owner && u.type === unit.type);
        if (sameType.length >= 3) {
          orders.push({
            type: 'FormArmy',
            members: [sameType[0]!.id, sameType[1]!.id, sameType[2]!.id],
            rally: { q: unit.q, r: unit.r },
          });
        } else {
          orders.push({ type: 'Hold', unitId: unit.id });
        }
      }
    }
    const byPlayer: Record<string, Order[]> = {};
    for (const order of orders) {
      if (!('unitId' in order)) continue;
      const unit = state.units[order.unitId]!;
      (byPlayer[unit.owner] ??= []).push(order);
    }
    return byPlayer;
  });
}

/** Un tour aléatoire complet : état + ordres cohérents + graine. */
const turnArb: fc.Arbitrary<{ state: GameState; orders: Record<string, Order[]>; seed: number }> = stateArb.chain(
  (state) =>
    fc.record({
      state: fc.constant(state),
      orders: ordersArb(state),
      seed: fc.integer({ min: 0, max: 0xffff }),
    }),
);

describe('L6 · Propriétés transversales (fast-check)', () => {
  it('P1 · R-80 : même (state, orders, seed) → même (newState, events) bit à bit', () => {
    fc.assert(
      fc.property(turnArb, ({ state, orders, seed }) => {
        const a = resolveTurn(state, orders, seed);
        const b = resolveTurn(state, orders, seed);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { seed: 20260829, numRuns: 150 },
    );
  });

  it('P2 · R-30 : au plus une entité amie par case après chaque tour', () => {
    fc.assert(
      fc.property(turnArb, ({ state, orders, seed }) => {
        const { newState } = resolveTurn(state, orders, seed);
        const seen = new Set<string>();
        for (const u of Object.values(newState.units)) {
          const key = `${u.q},${u.r}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }),
      { seed: 20260829, numRuns: 150 },
    );
  });

  it('P3 · conservation : aucune unité ne disparaît sans événement correspondant', () => {
    fc.assert(
      fc.property(turnArb, ({ state, orders, seed }) => {
        const { newState, events } = resolveTurn(state, orders, seed);
        const destroyed = new Set(
          events.filter((e) => e.type === 'UnitDestroyed').map((e) => (e as Extract<GameEvent, { type: 'UnitDestroyed' }>).unitId),
        );
        const merged = new Set(
          events.flatMap((e) => (e.type === 'ArmyFormed' ? (e as Extract<GameEvent, { type: 'ArmyFormed' }>).memberIds : [])),
        );
        const founded = new Set(
          events.filter((e) => e.type === 'CityFounded').map((e) => (e as Extract<GameEvent, { type: 'CityFounded' }>).byUnitId ?? ''),
        );
        for (const id of Object.keys(state.units)) {
          if (newState.units[id]) continue;
          const accounted = destroyed.has(id) || merged.has(id) || (founded.has(id) && id !== '');
          expect(accounted, `unité ${id} disparue sans événement`).toBe(true);
        }
        // et réciproquement : pas d'unité créée sans source (production, armée)
        const produced = new Set(
          events.filter((e) => e.type === 'UnitProduced').map((e) => (e as Extract<GameEvent, { type: 'UnitProduced' }>).unitId),
        );
        const armies = new Set(events.filter((e) => e.type === 'ArmyFormed').map((e) => (e as Extract<GameEvent, { type: 'ArmyFormed' }>).unitId));
        for (const id of Object.keys(newState.units)) {
          if (state.units[id]) continue;
          expect(produced.has(id) || armies.has(id), `unité ${id} apparue sans événement`).toBe(true);
        }
      }),
      { seed: 20260829, numRuns: 150 },
    );
  });

  it('P4 · cohérence : unités sur cases praticables existantes, seq consécutifs, tour avancé', () => {
    fc.assert(
      fc.property(turnArb, ({ state, orders, seed }) => {
        const { newState, events } = resolveTurn(state, orders, seed);
        expect(newState.turn).toBe(state.turn + 1);
        for (const u of Object.values(newState.units)) {
          const tile = newState.map[`${u.q},${u.r}`];
          expect(tile).toBeDefined();
          expect(TERRAINS[tile!.terrain]!.passable).toBe(true);
        }
        // seq strictement croissants, continuité avec lastEventSeq
        let expected = state.lastEventSeq;
        for (const e of events) {
          expected += 1;
          expect(e.seq).toBe(expected);
        }
        expect(newState.lastEventSeq).toBe(expected);
      }),
      { seed: 20260829, numRuns: 150 },
    );
  });

  it('P5 · multi-tours : 5 tours aléatoires enchaînés conservent les invariants', () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.integer({ min: 0, max: 0xffff }),
        (state, seed) => {
          let cur = state;
          for (let t = 0; t < 5; t++) {
            // ordres simples : tout le monde tient la position (déterministe)
            const { newState, events } = resolveTurn(cur, {}, seed + t);
            const seen = new Set<string>();
            for (const u of Object.values(newState.units)) {
              const key = `${u.q},${u.r}`;
              expect(seen.has(key)).toBe(false);
              seen.add(key);
            }
            for (const e of events) expect(e.seq).toBeLessThanOrEqual(newState.lastEventSeq);
            cur = newState;
          }
          expect(cur.turn).toBe(state.turn + 5);
        },
      ),
      { seed: 20260829, numRuns: 60 },
    );
  });
});
