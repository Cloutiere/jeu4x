/**
 * HANDOFF-RESOLUTION-DEPLACEMENTS — tests moteur (constats d'Erik du 18/09).
 *
 *  - Bug 1 : le colon doit pouvoir fonder sur la case que le guerrier QUITTE
 *    (cohabitation transitoire en Phase A — entrée autorisée quand toutes les
 *    amies présentes programment de partir vers une autre case que celle de
 *    l'entrant ; l'échange de cases reste refusé) ;
 *  - Option B (arbitrage Erik 18/09) : la fondation est ANNULÉE si une amie
 *    cohabite encore sur la case à l'arrivée ;
 *  - Bug 2 : l'échange de cases reste refusé au moteur (le message client est
 *    testé côté apps/web).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { createTraceCollector } from '../src/trace.js';
import type { GameState, Order } from '../src/state.js';

function unit(state: GameState, id: string) {
  return state.units[id]!;
}

function exploreAll(state: GameState, player: string, w: number, h: number): void {
  const explored: string[] = [];
  for (let q = 0; q <= w; q++) for (let r = 0; r <= h; r++) explored.push(`${q},${r}`);
  state.players[player]!.vision.explored = explored;
}

describe('Bug 1 — fondation sur la case que le guerrier quitte', () => {
  it('Reproduction exacte d\'Erik : guerrier part, le colon entre et fonde (ordre des unitIds défavorable)', () => {
    // 'col' < 'gue' : le colon est traité AVANT le guerrier (R-41) — c'est la
    // configuration qui déclenchait la fenêtre de refus.
    const state = makeState({
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'gue', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      ],
    });
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'gue', path: [{ q: 1, r: 1 }] },
        { type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' },
      ],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'gue')).toMatchObject({ q: 1, r: 1 }); // le guerrier est parti
    expect(Object.values(newState.cities).some((c) => c.q === 1 && c.r === 0)).toBe(true); // ville fondée
    expect(unit(newState, 'col')).toBeUndefined(); // le Colon est consommé (R-64)
    expect(events.some((e) => e.type === 'CityFounded' && e.owner === 'p1')).toBe(true);
  });

  it('Le guerrier RESTE (aucun ordre) : entrée refusée (R-159 rév. B), pas de ville, colon sur place', () => {
    const state = makeState({
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'gue', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      ],
    });
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'col')).toMatchObject({ q: 0, r: 0 }); // refusé, colon sur place
    expect(unit(newState, 'gue')).toMatchObject({ q: 1, r: 0 });
    expect(Object.values(newState.cities).length).toBe(0);
  });

  it('Option B : le départ du guerrier échoue — le colon cohabite et la fondation est ANNULÉE', () => {
    const state = makeState({
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'gue', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'bloc', type: 'guerrier', owner: 'p1', q: 1, r: 1 }, // bloque le départ du guerrier
      ],
    });
    const trace = createTraceCollector(state);
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'gue', path: [{ q: 1, r: 1 }] }, // départ qui échouera (bloc y reste)
        { type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' },
      ],
    };
    const { newState } = resolveTurn(state, orders, 1, trace);
    // Le colon est entré (cohabitation transitoire) mais le guerrier n'est
    // jamais parti : fondation ANNULÉE (option B). La cohabitation ami/ami de
    // fin de tour est résolue par la dispersion existante (R-179, Phase E) :
    // le guerrier est éjecté vers une case libre adjacente.
    expect(Object.values(newState.cities).length).toBe(0);
    expect(unit(newState, 'col')).toMatchObject({ q: 1, r: 0 });
    expect(unit(newState, 'gue')).toMatchObject({ q: 0, r: 0 });
    const decisions = trace.trace.phases.flatMap((p) => p.decisions);
    expect(decisions.some((d) => d.kind === 'fondation-annulee-cohabitation')).toBe(true);
  });

  it('Échange de cases : toujours refusé au moteur (les deux unités restent sur place)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
      ],
    });
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
        { type: 'Move', unitId: 'u2', path: [{ q: 0, r: 0 }] },
      ],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 });
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0 });
  });
});
