import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { jetDeBataille } from '../src/derive.js';
import { BARBARIAN_ID } from '../src/data.js';
import type { GameEvent } from '../src/events.js';
import type { GameState, Order, PlayerId } from '../src/state.js';

/**
 * HANDOFF-ORACLE-VERDICT · L1 (canon Erik 09/11, Chemin B) — les jets de
 * combat MÊLÉE ne viennent plus du flux de résolution mais d'un DÉRIVÉ
 * déterministe par bataille : hash(graine du tour, idAttaquant, idDefenseur,
 * caseAttaquant, caseDefenseur, assaut). Conséquence votée : l'issue d'une
 * bataille est INDÉPENDANTE des autres ordres du tour — donc calculable
 * AVANT la résolution (l'Oracle révèle VICTOIRE/DÉFAITE, certain).
 *
 * D4 intouché : la formule de forces R-51 (p = S²/(S²+S²)), bataille
 * complète (assauts jusqu'à la mort), tirs R-59 (sans riposte, pas de dérivé),
 * R-177 (tirage d'égalité du flux) et mêlée pondérée R-180 (flux, consigné).
 */

function echangesDe(events: GameEvent[]) {
  return events.filter((ev): ev is Extract<GameEvent, { type: 'CombatExchange' }> => ev.type === 'CombatExchange');
}

/** Duel canon : guerrier a1 (0,0) attaque le piquier d1 fortifié en ville (1,0). */
function duel(seed: number): GameState {
  const state = makeState({
    rngSeed: seed,
    units: [
      { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'd1', type: 'piquier', owner: 'p2', q: 1, r: 0, fortified: true },
    ],
    terrainOverrides: { '1,0': 'ville' },
    cities: [{ id: 'cv', q: 1, r: 0, owner: 'p2', capital: true }],
  });
  state.units.d1!.stabilized = true;
  return state;
}

function ordresDuel(): Record<PlayerId, Order[]> {
  return { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }], p2: [] };
}

describe('ORACLE-VERDICT · D1 — le dérivé par bataille', () => {
  it('LE test canon : les jets de la bataille réelle == le dérivé calculé AVANT résolution (30 seeds, bit à bit)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveTurn(duel(seed), ordresDuel(), seed);
      const ex = echangesDe(r.events).find((e) => e.attackerId === 'a1' && e.defenderId === 'd1');
      expect(ex, `seed ${seed} : la bataille a1/d1 a eu lieu`).toBeDefined();
      const rounds = ex!.detail!.rounds;
      expect(rounds.length, `seed ${seed} : au moins un assaut`).toBeGreaterThan(0);
      expect(['victoire-attaquant', 'victoire-defenseur']).toContain(ex!.detail!.issue);
      for (let i = 0; i < rounds.length; i++) {
        const attendu = jetDeBataille(seed, 'a1', 'd1', '0,0', '1,0', i + 1);
        expect(rounds[i]!.jet, `seed ${seed} assaut ${i + 1} : jet == dérivé`).toBe(attendu);
      }
    }
  });

  it('indépendance du flux : une hutte explorée par une AUTRE unité (tirages décalés) laisse l\'issue bit à bit identique', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const base = resolveTurn(duel(seed), ordresDuel(), seed);
      // Variante : u2 explore une hutte en cours de tour (consomme le flux).
      const avecHutte = duel(seed);
      avecHutte.units.u2 = {
        ...avecHutte.units.a1!,
        id: 'u2',
        q: 4,
        r: 4,
      };
      avecHutte.huts = [{ id: 'h1', q: 5, r: 4 }];
      const variante = resolveTurn(avecHutte, { ...ordresDuel(), p1: [...ordresDuel().p1!, { type: 'Move', unitId: 'u2', path: [{ q: 5, r: 4 }] }] }, seed);
      const exBase = echangesDe(base.events).find((e) => e.attackerId === 'a1' && e.defenderId === 'd1');
      const exVar = echangesDe(variante.events).find((e) => e.attackerId === 'a1' && e.defenderId === 'd1');
      expect(exVar, `seed ${seed} : la bataille a eu lieu malgré la hutte`).toBeDefined();
      expect(exVar!.detail!.issue, `seed ${seed} : même issue`).toBe(exBase!.detail!.issue);
      expect(exVar!.detail!.rounds, `seed ${seed} : mêmes jets bit à bit`).toEqual(exBase!.detail!.rounds);
    }
  });

  it('le dérivé est pur : déterministe, dans [0,1), sensible à CHAQUE composante (graine, ids, cases, assaut)', () => {
    const reference = jetDeBataille(42, 'a1', 'd1', '0,0', '1,0', 1);
    expect(reference).toBeGreaterThanOrEqual(0);
    expect(reference).toBeLessThan(1);
    expect(jetDeBataille(42, 'a1', 'd1', '0,0', '1,0', 1)).toBe(reference);
    const variantes = [
      jetDeBataille(43, 'a1', 'd1', '0,0', '1,0', 1),
      jetDeBataille(42, 'a2', 'd1', '0,0', '1,0', 1),
      jetDeBataille(42, 'a1', 'd2', '0,0', '1,0', 1),
      jetDeBataille(42, 'a1', 'd1', '0,1', '1,0', 1),
      jetDeBataille(42, 'a1', 'd1', '0,0', '1,1', 1),
      jetDeBataille(42, 'a1', 'd1', '0,0', '1,0', 2),
    ];
    for (const v of variantes) expect(v).not.toBe(reference);
    // Deux batailles DIFFÉRENTES au même tour → issues indépendantes (jets distincts).
    const autres = Array.from({ length: 50 }, (_, i) => jetDeBataille(i + 1, 'x', 'y', '0,0', '1,0', 1));
    expect(new Set(autres).size).toBeGreaterThan(40);
  });
});

describe('ORACLE-VERDICT · D1 — la mêlée de convergence (Phase E, R-176 rév. COHABITATION-HOSTILE) utilise le même dérivé', () => {
  /** Le cas Erik reconstitué : armée p1 (0,0) et barbare (2,0) convergent vers (1,0). */
  function casErik(seed: number): GameState {
    const state = makeState({
      rngSeed: seed,
      units: [
        { id: 'u31', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 9, isArmy: true },
        { id: 'u22', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 0, hp: 3 },
      ],
    });
    state.units.u31!.stabilized = false;
    state.units.u22!.stabilized = false;
    return state;
  }
  function ordresErik(): Record<PlayerId, Order[]> {
    return { p1: [{ type: 'Move', unitId: 'u31', path: [{ q: 1, r: 0 }] }] } as Record<PlayerId, Order[]>;
  }

  it('les jets de la mêlée de convergence == dérivé (attaquant = plus faible unitId, cases = case de bataille)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = resolveTurn(casErik(seed), ordresErik(), seed);
      const ex = echangesDe(r.events);
      expect(ex.length, `seed ${seed} : un échange de convergence`).toBe(1);
      const rounds = ex[0]!.detail!.rounds;
      expect(rounds.length, `seed ${seed} : au moins un assaut`).toBeGreaterThan(0);
      for (let i = 0; i < rounds.length; i++) {
        const attendu = jetDeBataille(seed, 'u22', 'u31', '1,0', '1,0', i + 1);
        expect(rounds[i]!.jet, `seed ${seed} assaut ${i + 1}`).toBe(attendu);
      }
    }
  });
});

describe('ORACLE-VERDICT · D4 — les tirs R-59 restent intouchés', () => {
  it('tir sans riposte : 1 PV garanti, jet null, jamais de bataille complète', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = makeState({
        rngSeed: seed,
        units: [
          { id: 't1', type: 'catapulte', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'piquier', owner: 'p2', q: 1, r: 0, hp: 10, fortified: true },
        ],
        terrainOverrides: { '1,0': 'ville' },
        cities: [{ id: 'cv', q: 1, r: 0, owner: 'p2', capital: true }],
      });
      state.units.d1!.stabilized = true;
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 't1', target: { q: 1, r: 0 } }], p2: [] }, seed);
      const ex = echangesDe(r.events).find((e) => e.attackerId === 't1');
      expect(ex, `seed ${seed}`).toBeDefined();
      expect(ex!.detail!.sansRiposte, `seed ${seed} : sans riposte`).toBe(true);
      expect(ex!.detail!.rounds, `seed ${seed} : UN assaut`).toHaveLength(1);
      expect(ex!.detail!.rounds[0]!.jet, `seed ${seed} : jet null (pas de dérivé)`).toBeNull();
      expect(ex!.defenderHpAfter, `seed ${seed} : 1 PV retiré`).toBe(9);
    }
  });
});
