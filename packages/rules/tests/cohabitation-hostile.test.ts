import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { BARBARIAN_ID } from '../src/data.js';
import type { GameEvent } from '../src/events.js';
import type { GameState, Order, PlayerId } from '../src/state.js';

/**
 * HANDOFF-COHABITATION-HOSTILE (canon Erik 09/11) — « Deux unités ennemies ne
 * partagent jamais une case. » Cas capturé en prod (5633Y3, tour 22) : l'armée
 * u31 d'Erik (p1, 9 PV) et le barbare u22 (3 PV) ont convergé dans le MÊME
 * tour vers la case vide (5,16) — et y cohabitaient sans un échange (la mêlée
 * pondérée R-180 ne blesse que de −2/−1 PV, jamais à la mort).
 *
 * COHABITATION-HOSTILE (R-176 amendée) : des entrants de camps HOSTILES qui se
 * retrouvent co-localisés sur une case SANS défenseur se battent en BATAILLE
 * COMPLÈTE (R-51 : assauts jusqu'à la mort de l'un), ordre déterministe seedé
 * (plus faible unitId d'abord), jusqu'à ce qu'il ne reste que des unités d'un
 * MÊME camp (miroir R-177). Les co-locations AMIES (R-44/R-159) restent
 * intactes ; entrant vs défenseur stabilisé = R-176 tel quel.
 */

function echangesDe(events: GameEvent[]) {
  return events.filter((ev): ev is Extract<GameEvent, { type: 'CombatExchange' }> => ev.type === 'CombatExchange');
}

/** Le cas Erik reconstitué : armée p1 (0,0) et barbare (2,0) convergent vers (1,0). */
function casErik(): GameState {
  const state = makeState({
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
  return {
    p1: [{ type: 'Move', unitId: 'u31', path: [{ q: 1, r: 0 }] }],
  } as Record<PlayerId, Order[]>;
}

describe('COHABITATION-HOSTILE · D1 — les entrants hostiles se battent', () => {
  it('cas Erik reconstitué : armée 9 PV vs barbare 3 PV convergents — bataille complète, UN mort, le survivant tient seul la case', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveTurn(casErik(), ordresErik(), seed);
      const u31 = r.newState.units.u31;
      const u22 = r.newState.units.u22;
      const morts = (u31 ? 0 : 1) + (u22 ? 0 : 1);
      expect(morts, `seed ${seed} : la bataille complète doit tuer exactement un camp`).toBe(1);
      const ex = echangesDe(r.events);
      expect(ex.length, `seed ${seed} : au moins un échange R-51`).toBeGreaterThan(0);
      expect(ex[0]?.detail?.issue).not.toBe('survie-mutuelle');
      // Le survivant tient SEUL la case de convergence.
      const survivant = (u31 ?? u22)!;
      expect(survivant.q).toBe(1);
      expect(survivant.r).toBe(0);
      expect(survivant.stabilized, 'le survivant tient la case (stabilisé au marquage final)').toBe(true);
    }
  });

  it('acceptation canon (5633Y3) : il existe une issue où l\'armée 9 PV tue le barbare 3 PV et tient la case', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveTurn(casErik(), ordresErik(), seed);
      if (r.newState.units.u31 && !r.newState.units.u22) {
        const u31 = r.newState.units.u31!;
        expect(u31.q).toBe(1);
        expect(u31.r).toBe(0);
        expect(u31.hp).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('aucune graine à victoire de l\'armée trouvée — calibrage fixture à revoir');
  });

  it('déterminisme : même seed → même issue bit à bit (même vainqueur, mêmes PV, mêmes échanges)', () => {
    for (const seed of [3, 17, 42]) {
      const a = resolveTurn(casErik(), ordresErik(), seed);
      const b = resolveTurn(casErik(), ordresErik(), seed);
      expect(!!a.newState.units.u31).toBe(!!b.newState.units.u31);
      expect(!!a.newState.units.u22).toBe(!!b.newState.units.u22);
      if (a.newState.units.u31 && b.newState.units.u31) {
        expect(a.newState.units.u31.hp).toBe(b.newState.units.u31.hp);
        expect(a.newState.units.u31.veteran).toBe(b.newState.units.u31.veteran);
      }
      expect(echangesDe(a.events).map((e) => [e.attackerId, e.defenderId, e.attackerHpAfter, e.defenderHpAfter]))
        .toEqual(echangesDe(b.events).map((e) => [e.attackerId, e.defenderId, e.attackerHpAfter, e.defenderHpAfter]));
    }
  });

  it('les barbares sont inclus : le cas capturé est barbare/joueur — bataille complète R-51, jamais la mêlée pondérée', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveTurn(casErik(), ordresErik(), seed);
      // Le chemin est la bataille complète (CombatExchange u22↔u31) — JAMAIS
      // la mêlée pondérée R-180 (MeleeResolved) pour ce cas.
      const ex = echangesDe(r.events).filter((e) =>
        (e.attackerId === 'u31' && e.defenderId === 'u22') || (e.attackerId === 'u22' && e.defenderId === 'u31'));
      expect(ex.length, `seed ${seed} : la bataille passe par R-51`).toBeGreaterThan(0);
      expect(r.events.some((e) => e.type === 'MeleeResolved'), `seed ${seed} : pas de mêlée pondérée sans défenseur`).toBe(false);
    }
  });
});

describe('COHABITATION-HOSTILE · D2 — séquencement déterministe', () => {
  function casTroisCamps(): GameState {
    const state = makeState({
      players: ['p1', 'p2', 'p3'],
      units: [
        { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 3 },
        { id: 'b1', type: 'guerrier', owner: 'p2', q: 2, r: 0, hp: 3 },
        { id: 'c1', type: 'guerrier', owner: 'p3', q: 1, r: -2, hp: 3 },
      ],
    });
    for (const id of ['a1', 'b1', 'c1']) state.units[id]!.stabilized = false;
    state.diplomacy.war = [['p1', 'p2'], ['p1', 'p3'], ['p2', 'p3']];
    return state;
  }

  it('trois camps mêlés sur la même case → il ne reste que des unités d\'UN seul camp', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = resolveTurn(casTroisCamps(), {
        p1: [{ type: 'Move', unitId: 'a1', path: [{ q: 1, r: 0 }] }],
        p2: [{ type: 'Move', unitId: 'b1', path: [{ q: 1, r: 0 }] }],
        p3: [{ type: 'Move', unitId: 'c1', path: [{ q: 1, r: -1 }, { q: 1, r: 0 }] }],
      }, seed);
      const surCase = Object.values(r.newState.units).filter((u) => u.q === 1 && u.r === 0);
      const camps = new Set(surCase.map((u) => u.owner));
      expect(camps.size, `seed ${seed} : un seul camp doit rester sur la case`).toBeLessThanOrEqual(1);
      expect(surCase.length, `seed ${seed} : au moins un survivant (bataille complète jusqu'à paix de fait)`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('COHABITATION-HOSTILE · verrou — zéro cohabitation hostile survit à une résolution', () => {
  it('après résolution, aucune case ne porte des unités militaires de camps hostiles (balaine multi-scénarios × multi-seeds)', () => {
    const scénarios: Array<() => { state: GameState; orders: Record<PlayerId, Order[]> }> = [
      () => ({ state: casErik(), orders: ordresErik() }),
      () => {
        const state = makeState({
          players: ['p1', 'p2'],
          units: [
            { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 3 },
            { id: 'b1', type: 'guerrier', owner: 'p2', q: 2, r: 0, hp: 3 },
          ],
        });
        state.units.a1!.stabilized = false;
        state.units.b1!.stabilized = false;
        state.diplomacy.war = [['p1', 'p2']];
        return {
          state,
          orders: {
            p1: [{ type: 'Move', unitId: 'a1', path: [{ q: 1, r: 0 }] }] as Order[],
            p2: [{ type: 'Move', unitId: 'b1', path: [{ q: 1, r: 0 }] }] as Order[],
          } as Record<PlayerId, Order[]>,
        };
      },
    ];
    for (const build of scénarios) {
      for (let seed = 1; seed <= 20; seed++) {
        const { state, orders } = build();
        const r = resolveTurn(state, orders, seed);
        const parCase = new Map<string, typeof state.units[string][]>();
        for (const u of Object.values(r.newState.units)) {
          const key = `${u.q},${u.r}`;
          (parCase.get(key) ?? parCase.set(key, []).get(key)!).push(u);
        }
        for (const [key, here] of parCase) {
          for (let i = 0; i < here.length; i++) {
            for (let j = i + 1; j < here.length; j++) {
              const hostiles = state.diplomacy.war.length >= 0 && // contexte : hostilité = camps distincts en guerre
                (here[i]!.owner === BARBARIAN_ID || here[j]!.owner === BARBARIAN_ID ||
                  state.diplomacy.war.some(([x, y]) =>
                    (x === here[i]!.owner && y === here[j]!.owner) || (x === here[j]!.owner && y === here[i]!.owner)));
              expect(hostiles, `seed ${seed}, case (${key}) : cohabitation hostile survivante`).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe('COHABITATION-HOSTILE · co-locations amies et cas canon INTACTS', () => {
  it('R-44 : le rendez-vous FormArmy de trois amies convergentes cohabite SANS combat (exemption intacte)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 1 },
          { id: 'a2', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
          { id: 'a3', type: 'guerrier', owner: 'p1', q: 2, r: 1 },
        ],
      });
      const rally = { q: 1, r: 1 };
      const r = resolveTurn(state, {
        p1: [
          { type: 'Move', unitId: 'a1', path: [rally] },
          { type: 'Move', unitId: 'a2', path: [rally] },
          { type: 'Move', unitId: 'a3', path: [rally] },
          { type: 'FormArmy', members: ['a1', 'a2', 'a3'], rally },
        ],
      }, seed);
      expect(r.events.some((e) => e.type === 'ArmyFormed'), `seed ${seed} : l'armée se forme`).toBe(true);
      expect(echangesDe(r.events), `seed ${seed} : aucun combat entre amies`).toHaveLength(0);
    }
  });

  it('non-régression R-176 : entrant vs défenseur STABILISÉ = cas canon inchangé (bataille complète en Phase B, mêlée pondérée si cohabitation avec défenseur vivant)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = makeState({
        units: [
          { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
          { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        ],
      });
      state.units.d1!.stabilized = true;
      state.diplomacy.war = [['p1', 'p2']];
      const r = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'a1', target: { q: 1, r: 0 } }] }, seed);
      const ex = echangesDe(r.events);
      expect(ex.length, `seed ${seed} : l'échange Phase B a lieu`).toBeGreaterThan(0);
      // Un des deux meurt (bataille complète BATAILLE-COMPLETE) — inchangé.
      const morts = (r.newState.units.a1 ? 0 : 1) + (r.newState.units.d1 ? 0 : 1);
      expect(morts, `seed ${seed}`).toBe(1);
      // Jamais les DEUX sur la même case.
      expect(!!(r.newState.units.a1 && r.newState.units.d1)).toBe(false);
    }
  });
});
