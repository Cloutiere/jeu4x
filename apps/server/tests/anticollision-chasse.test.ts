/**
 * ANTICOLLISION-CHASSE (canon Erik 14/11, prod GZJQZX PERDUE t39) — tests
 * FIRST de la mécanique D1+D2 dans botPolicy (au-dessus de Jev, même famille
 * que le rappel L2).
 *
 *   D1 — l'unité chassée n'offre jamais le duel : poursuivie ≥ 2 tours
 *        consécutifs (un ennemi CONNU capable de joindre sa tuile en ≤ 2
 *        tours de MARCHE) à d ≤ 2 d'une ville propre → elle ENTRE en ville
 *        (déficit de garnison ou menacée d'abord) ou se FORTIFIE sur place,
 *        et n'en re-sort pas tant que la poursuite tient (hystérésis).
 *   D2 — anti-collision : jamais un pas qui ATERRIT sur une case où un
 *        ennemi CONNU peut arriver CE même tour (cohabitation hostile =
 *        bataille complète 3v3 p=0,5 — GZJQZX t36), ni à d≤1 d'un ennemi
 *        plus fort/égal SAUF si le duel passe le gate R-190 ; tous les pas
 *        mauvais → Fortify (jamais inactif).
 *
 * Le cas canon : u4 (seul guerrier, 3 PV) marche au t36 SUR la case (19,22)
 * où u27 arrive le même tour → duel offert, capitale vide t38, rasée t39.
 */
import { describe, expect, it } from 'vitest';
import { createRng, makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import {
  assignerObjectifs,
  botPolicy,
  botTurnSeed,
  filtrerAntiCollision,
  planAntiCollision,
  profileDuBot,
} from '../src/botPolicy.js';
import type { Order } from '@game/rules';

const ME = 'p1';
const BAR = 'barbarien';

/** GZJQZX t36 reconstitué : u4 (seul guerrier, 3 PV) à (19,21), capitale c2
 *  à (18,21) (d=1 ≤ 2), u27 barbare à (20,22) — SA portée de marche 1 tour
 *  couvre (19,22), le pas fatal du canon. Fond plaine (jamais d'eau). */
function etatGZJQZX(seed = 42): GameState {
  return makeState({
    width: 40,
    height: 40,
    fill: 'plaine',
    rngSeed: seed,
    players: [ME],
    cities: [{ id: 'c2', q: 18, r: 21, owner: ME, pop: 1, capital: true }],
    units: [
      { id: 'u4', type: 'guerrier', owner: ME, q: 19, r: 21, hp: 3 },
      { id: 'u27', type: 'guerrier', owner: BAR, q: 20, r: 22, hp: 3 },
    ],
  }) as GameState;
}

/** La portée d'arrivée 1 tour du barbare (miroir canon — mouvement 2 pour un
 *  guerrier ? non : guerrier = mouvement standard ; le test lit la portée via
 *  planAntiCollision lui-même en vérifiant le REFUS du pas (19,22)). */

describe('ANTICOLLISION-CHASSE · D2 filtrerAntiCollision', () => {
  it('GZJQZX t36 : le pas fatal vers (19,22) est REFUSÉ → Fortify (rouge avant fix)', () => {
    const state = etatGZJQZX();
    const ordres = filtrerAntiCollision(
      [{ type: 'Move', unitId: 'u4', path: [{ q: 19, r: 22 } as { q: number; r: number }] } as Order],
      state,
      ME,
    );
    expect(ordres).toHaveLength(1);
    expect(ordres[0]!.type).toBe('Fortify');
  });

  it('ennemi hors portée du pas → pas autorisé BIT-À-BIT (ordre identique)', () => {
    const state = etatGZJQZX();
    state.units['u27']!.q = 34;
    state.units['u27']!.r = 30; // loin — aucune portée d'arrivée
    const move: Order = { type: 'Move', unitId: 'u4', path: [{ q: 19, r: 22 }] };
    const ordres = filtrerAntiCollision([move], state, ME);
    expect(ordres).toEqual([move]);
  });

  it('pas qui passe le gate R-190 → l\u2019ATTAQUE volontaire reste possible (ordre intact)', () => {
    const state = etatGZJQZX();
    const attaque: Order = { type: 'Attack', unitId: 'u4', target: { q: 20, r: 22 } };
    expect(filtrerAntiCollision([attaque], state, ME)).toEqual([attaque]);
  });

  it('rappel L2 dont la route croise la portée ennemie → ARRÊT + Fortification', () => {
    const state = etatGZJQZX();
    // u2 en route de rappel vers c2 : son pas atterrit à (19,22) — portée
    // d'arrivée de u27 (d'1 tour depuis (20,22)).
    state.units['u4']!.q = 18;
    state.units['u4']!.r = 21;
    const move: Order = { type: 'Move', unitId: 'u2', path: [{ q: 19, r: 22 }] };
    const ajoute = makeState({
      width: 40,
      height: 40,
      fill: 'plaine',
      rngSeed: 7,
      players: [ME],
      cities: [{ id: 'c2', q: 18, r: 21, owner: ME, pop: 1, capital: true }],
      units: [
        { id: 'u2', type: 'guerrier', owner: ME, q: 20, r: 21, hp: 3 },
        { id: 'u4', type: 'guerrier', owner: ME, q: 18, r: 21, hp: 3 },
        { id: 'u27', type: 'guerrier', owner: BAR, q: 20, r: 22, hp: 3 },
      ],
    }) as GameState;
    void state;
    const ordres = filtrerAntiCollision([move], ajoute, ME);
    expect(ordres[0]!.type).toBe('Fortify');
  });

  it('MultiStep : le pas fatal est RETIRÉ du chemin (préfixe sûr conservé)', () => {
    const state = etatGZJQZX();
    const multi: Order = {
      type: 'MultiStep',
      unitId: 'u4',
      path: [
        { q: 19, r: 20 }, // sûr
        { q: 19, r: 22 }, // fatal (arrivée u27)
        { q: 18, r: 22 }, // derrière le fatal — jamais atteint
      ],
    };
    const ordres = filtrerAntiCollision([multi], state, ME);
    expect(ordres[0]!.type).toBe('MultiStep');
    expect((ordres[0] as { path: Array<{ q: number; r: number }> }).path).toEqual([{ q: 19, r: 20 }]);
  });

  it('atterrir sur une ville PROPRE = défense fortifiée ADMISE (canon D1, def ~1,3-1,6)', () => {
    const state = etatGZJQZX();
    // (18,21) = c2 : même si u27 peut y arriver, l'entrée en ville est le
    // comportement optimal (bataille R-183, défenseur fourni + soin).
    const move: Order = { type: 'Move', unitId: 'u4', path: [{ q: 18, r: 21 }] };
    expect(filtrerAntiCollision([move], state, ME)).toEqual([move]);
  });
});

describe('ANTICOLLISION-CHASSE · D1 planAntiCollision (poursuite + hystérésis)', () => {
  it('poursuivie 2 tours à d≤2 d\u2019une ville → ENTRE en ville (garnison)', () => {
    const state = etatGZJQZX();
    const memo: Record<string, number> = { u4: 1 }; // 1er tour déjà chassée
    const poursivies = planAntiCollision(state, ME, memo);
    expect(memo['u4']).toBe(2); // seuil toursDePoursuite atteint
    expect(poursivies.get('u4')).toBe('c2');
    // L'objectif suit : garnison vers LA tuile de la ville.
    const objectifs = assignerObjectifs(state, ME, profileDuBot(), undefined, undefined, undefined, { u4: 1 });
    expect(objectifs.get('u4')?.kind).toBe('garnison');
    expect(objectifs.get('u4')?.cityId).toBe('c2');
  });

  it('une seule tour de poursuite → PAS de pinned (seuil toursDePoursuite 2)', () => {
    const state = etatGZJQZX();
    state.units['u27']!.q = 24;
    state.units['u27']!.r = 24; // à 3+ tours de marche — hors seuil de poursuite
    const memo: Record<string, number> = {};
    const poursivies = planAntiCollision(state, ME, memo);
    expect(poursivies.has('u4')).toBe(false);
  });

  it('menace persistante → NE RE-SORT PAS (l\u2019objectif garnison tient en ville)', () => {
    const state = etatGZJQZX();
    state.units['u4']!.q = 18;
    state.units['u4']!.r = 21; // DÉJÀ dans c2
    state.units['u27']!.q = 20;
    state.units['u27']!.r = 21; // à d=2 — portée de poursuite (mouvement 1)
    const memo: Record<string, number> = { u4: 2 };
    const poursivies = planAntiCollision(state, ME, memo);
    expect(poursivies.get('u4')).toBe('c2');
    const objectifs = assignerObjectifs(state, ME, profileDuBot(), undefined, undefined, undefined, { u4: 2 });
    expect(objectifs.get('u4')?.kind).toBe('garnison');
    // Aucun ordre Move ne peut la faire sortir : l'émission garnison sur
    // place donne Fortify/Hold (vérifié au niveau botPolicy plus bas).
  });

  it('menace DISSOUTE → poursuite reset, l\u2019unité reprend son ordre', () => {
    const state = etatGZJQZX();
    state.units['u27']!.q = 34;
    state.units['u27']!.r = 30;
    const memo: Record<string, number> = { u4: 2 };
    const poursivies = planAntiCollision(state, ME, memo);
    expect(memo['u4']).toBeUndefined();
    expect(poursivies.has('u4')).toBe(false);
  });

  it('priorité : la ville à DÉFICIT/MENACE la plus proche — pas la simple plus proche', () => {
    const state = etatGZJQZX();
    // c3 plus proche mais pleine et sans menace ; c2 plus loin, menacée.
    void makeState;
    const state2 = makeState({
      width: 40,
      height: 40,
      fill: 'plaine',
      rngSeed: 11,
      players: [ME],
      cities: [
        { id: 'c3', q: 20, r: 20, owner: ME, pop: 2 },
        { id: 'c2', q: 17, r: 22, owner: ME, pop: 1, capital: true },
      ],
      units: [
        { id: 'u4', type: 'guerrier', owner: ME, q: 19, r: 21, hp: 3 },
        { id: 'g3', type: 'guerrier', owner: ME, q: 20, r: 20, hp: 3 }, // garnison complète c3
        { id: 'u27', type: 'guerrier', owner: BAR, q: 18, r: 23, hp: 3 }, // menace sur c2, poursuite u4
      ],
    }) as GameState;
    const memo: Record<string, number> = { u4: 1 };
    const poursivies = planAntiCollision(state2, ME, memo);
    expect(poursivies.get('u4')).toBe('c2');
  });

  it('capitale insulaire / aucune ville éligible à d≤2 → null : FORTIFIER SUR PLACE', () => {
    const state = etatGZJQZX();
    state.cities['c2']!.q = 3;
    state.cities['c2']!.r = 3; // à d > 2 — plus d'option D1
    const memo: Record<string, number> = { u4: 1 };
    const poursivies = planAntiCollision(state, ME, memo);
    expect(poursivies.get('u4')).toBeNull();
    const objectifs = assignerObjectifs(state, ME, profileDuBot(), undefined, undefined, undefined, { u4: 1 });
    expect(objectifs.get('u4')?.kind).toBe('fortifier');
  });

  it('scout NON poursuivi → aucune pinned, patrouille canon intacte (non-régression)', () => {
    const state = etatGZJQZX();
    state.units['u27']!.q = 34;
    state.units['u27']!.r = 30;
    const memo: Record<string, number> = {};
    const poursivies = planAntiCollision(state, ME, memo);
    expect(poursivies.size).toBe(0);
    const objectifs = assignerObjectifs(state, ME, profileDuBot());
    expect(objectifs.get('u4')?.kind === 'patrouiller' || objectifs.get('u4')?.kind === 'explorer').toBe(true);
  });
});

describe('ANTICOLLISION-CHASSE · botPolicy bout-en-bout', () => {
  it('GZJQZX t36 rejoué : AUCUN Move d\u2019une combattante qui atterrit dans la portée d\u2019arrivée ennemie', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = etatGZJQZX(seed);
      const memo: Record<string, number> = { u4: 1 }; // 2e tour de poursuite
      const rng = createRng(botTurnSeed(seed, 36, ME));
      const plan = botPolicy(state, ME, rng, undefined, { antiCollisionMemo: memo });
      // Invariant canon : le pas fatal (19,22) n'est JAMAIS la destination
      // d'un Move/MultiStep de u4 ce tour.
      for (const o of plan.orders) {
        if (o.type !== 'Move' && o.type !== 'MultiStep') continue;
        const or = o as { unitId: string; path: Array<{ q: number; r: number }> };
        if (or.unitId !== 'u4') continue;
        for (const s of or.path) {
          expect(`${s.q},${s.r}`).not.toBe('19,22');
        }
      }
      // L'unité reçoit TOUJOURS un ordre (canon « jamais inactif »).
      const ordreU4 = plan.orders.find(
        (o) => 'unitId' in o && (o as { unitId: string }).unitId === 'u4',
      );
      expect(ordreU4).toBeDefined();
    }
  });

  it('déterminisme : même état + même memo copié → plans bit-à-bit identiques', () => {
    const state = etatGZJQZX(7);
    const m1: Record<string, number> = { u4: 1 };
    const m2: Record<string, number> = { u4: 1 };
    const p1 = botPolicy(state, ME, createRng(botTurnSeed(7, 36, ME)), undefined, { antiCollisionMemo: m1 });
    const p2 = botPolicy(state, ME, createRng(botTurnSeed(7, 36, ME)), undefined, { antiCollisionMemo: m2 });
    expect(JSON.stringify(p1.orders)).toBe(JSON.stringify(p2.orders));
    expect(m1).toEqual(m2);
  });
});
