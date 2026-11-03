/**
 * CONFIANCE-EXPLORATION (Erik 03/11) · D-B — doctrine d'exploration :
 * « tant qu'il reste des cases à explorer, les unités explorent — jamais
 * inactives. » Cause racine du dump prod YU4SHH (u4, guerrier p2) :
 * objectif `patrouiller` correct (cible (33,7)) MAIS le pas glouton
 * `pasVers` (strict) renvoyait null depuis (33,12) — les seules sorties
 * terrestres ((34,11) diagonale, (32,13), (33,13)) étaient non-améliorantes
 * en distance cube → Hold silencieux t16→24, mp inutilisés. Le BFS routier
 * wrappé (pasVersRoutier, canon BOT-ARMEE) trouve la route en 1 pas.
 * FIX testé : le cas chasser/patrouiller/explorer route par le BFS d'abord ;
 * à défaut, tenue EXPLICITE (Hold émis, jamais rien).
 */
import { describe, expect, it } from 'vitest';
import { createRng, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import { assignerObjectifs, botPolicy, pasVers, pasVersRoutier, profileDuBot } from '../src/botPolicy.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** Reproduction de la poche de u4 (prod YU4SHH, décalée de −28 en q) :
 *  capitale (2,7), unité (5,12), sorties terrestres (6,11)/(4,13)/(5,13)
 *  uniquement — eau sur (5,11)/(6,12)/(4,12) — corridor Est praticable. */
function pocheYU4SHH(): GameState {
  return makeState({
    width: 40,
    height: 24,
    terrainOverrides: {
      '5,11': 'eau', '6,12': 'eau', '4,12': 'eau',
      '5,14': 'eau', '6,13': 'eau', '4,14': 'eau', // poche serrée au Sud
    },
    players: [HUMAN, BOT],
    warPairs: [],
    units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 12, hp: 3, aboard: null, cargo: null }],
    cities: [{ id: 'c1', owner: BOT, q: 2, r: 7, pop: 2, capital: true }],
    rngSeed: 42,
  }) as GameState;
}

describe('CONFIANCE-EXPLORATION · D-B — la poche de u4 (prod YU4SHH)', () => {
  it('le pas glouton est bien null depuis la poche (cause racine reproduite)', () => {
    const s = pocheYU4SHH();
    const obj = assignerObjectifs(s, BOT, profileDuBot());
    const o = obj.get('b1')!;
    expect(o.kind).toBe('patrouiller');
    expect((o as { cible?: { q: number; r: number } }).cible).toBeDefined();
    expect(pasVers(s.units.b1!, s, (o as { cible: { q: number; r: number } }).cible)).toBeNull();
    // le BFS routier, lui, trouve la route
    expect(pasVersRoutier(s.units.b1!, s, (o as { cible: { q: number; r: number } }).cible)).not.toBeNull();
  });

  it('l\u2019unité en poche REPART par le pas routier — jamais de Hold silencieux', () => {
    const s = pocheYU4SHH();
    const plan = botPolicy(s, BOT, createRng(7));
    const ordre = plan.orders.find((o) => 'unitId' in o && o.unitId === 'b1');
    expect(ordre).toBeDefined();
    expect(ordre?.type).toBe('Move');
  });
});

describe('CONFIANCE-EXPLORATION · D-B — tenue EXPLICITE (jamais l\u2019inertie)', () => {
  it('unité sans aucune sortie ni cible atteignable → Hold ÉMIS (ordre présent, pas d\u2019absence)', () => {
    // îlot d\u2019une case : aucune exploration possible, la tenue doit être
    // un ordre explicite dans le plan (journalisé), pas un ordre manquant.
    const overrides: Record<string, 'eau'> = {};
    for (let q = 0; q < 40; q++) {
      for (let r = 0; r < 24; r++) {
        if (!(q === 5 && r === 12) && !(q === 2 && r === 7)) overrides[`${q},${r}`] = 'eau';
      }
    }
    const s = makeState({
      width: 40,
      height: 24,
      terrainOverrides: overrides,
      players: [HUMAN, BOT],
      warPairs: [],
      units: [{ id: 'b1', type: 'guerrier', owner: BOT, q: 5, r: 12, hp: 3, aboard: null, cargo: null }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 7, pop: 2, capital: true }],
      rngSeed: 42,
    }) as GameState;
    const plan = botPolicy(s, BOT, createRng(7));
    const ordre = plan.orders.find((o) => 'unitId' in o && o.unitId === 'b1');
    expect(ordre?.type).toBe('Hold');
  });
});
