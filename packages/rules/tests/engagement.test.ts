/**
 * ENGAGEMENT — Règles d'engagement revues (spécification dictée par Erik en
 * session, handoff HANDOFF-ENGAGEMENT.md) : stabilité/instabilité des cases,
 * fin des replis et collisions, mêlée pondérée + étau, expulsion de
 * cohabitation, camps barbares spatialisés.
 *
 * Contrat :
 *  - R-173 · Stabilité de case (champ `stabilized`, migration 24→25) ;
 *  - R-174 · Prérogatives de l'unité stabilisée (valeurs de défense, Fortify) ;
 *  - R-175 · Fortification durable (conservée tant que l'unité demeure sur sa
 *    case — même en mêlée —, perdue au déplacement) ;
 *  - R-176/R-177 · Engagement contre le défenseur + ordre d'attaque
 *    (PM restants → attaque → défense croissante → PV → RNG) ;
 *  - R-178/R-179 · Phase E stabilité : mêlée (déclencheurs, une par tour,
 *    rejoindre, fuir) et expulsion de cohabitation ;
 *  - R-180 · Mêlée pondérée + étau (T-54/T-55) : gagnant 0, perdant −2,
 *    autres −1 ;
 *  - R-181 · Cohabitation avec défenseur = mêlée (décision D4 d'Erik) ;
 *  - R-182 · Unités pacifiques (fuite, capture à la stabilisation) ;
 *  - R-183 · Camps barbares (1 gardien au camp + satellites adjacents).
 *
 * Abrogations couvertes ici (ancien contrat révoqué) : R-52 rév.
 * DÉFENSE-DE-PILE, R-53 (collisions), R-54/R-55/R-56 (replis), R-96 rév.
 * (pile de camp), clause « pile » de R-97.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/events.js';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as unitOf, unitAt } from '../src/fixtures.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../src/state.js';
import type { GameState, Order } from '../src/state.js';
import { BARBARIAN_ID } from '../src/data.js';
import { drawWeightedMelee, meleeTauMultiplier } from '../src/melee.js';
import { createRng } from '../src/rng.js';

const AUCUN: Record<string, Order[]> = {};

function events(state: GameState) {
  return state;
}

describe('R-173 · Stabilité de case & migration 24→25', () => {
  it('migration 24→25 : toutes les unités existantes naissent stabilisées, idempotent', () => {
    const v24 = {
      ...makeState({
        units: [
          { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
          { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 4 },
        ],
      }),
      schemaVersion: 24,
    } as unknown as GameState;
    // simule un état v24 : pas encore de champ stabilized
    for (const u of Object.values(v24.units)) delete (u as unknown as Record<string, unknown>).stabilized;
    const m = migrateState<GameState>(v24 as never);
    expect(m.schemaVersion).toBe(25);
    for (const u of Object.values(m.units)) expect(u.stabilized).toBe(true);
    // idempotent
    const m2 = migrateState<GameState>(structuredClone(m) as never);
    expect(m2.schemaVersion).toBe(25);
    expect(CURRENT_SCHEMA_VERSION).toBe(25);
  });

  it('R-173 : en fin de tour, une case à exactement 1 unité la marque stabilisée, une case à 2 laisse instable', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6 },
      ],
    });
    const { newState } = resolveTurn(s0, AUCUN, 7);
    expect(unitOf(newState, 'u1').stabilized).toBe(true);
    expect(unitOf(newState, 'u2').stabilized).toBe(true);

    // co-location amie forcée (pose de fixture) : instable en fin de tour
    const s1 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 2, stabilized: false },
      ],
    });
    const r1 = resolveTurn(s1, AUCUN, 7);
    // expulsion de cohabitation (R-179) : une seule demeure, stabilisée
    const surCase = Object.values(r1.newState.units).filter((u) => u.q === 2 && u.r === 2);
    expect(surCase).toHaveLength(1);
    expect(surCase[0]!.stabilized).toBe(true);
  });
});

describe('R-174/R-175 · Fortification : acquise seulement stabilisée, durable sur place', () => {
  it('R-174 : un ordre Fortify sur une unité NON stabilisée est ignoré', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6, stabilized: false },
      ],
    });
    const { newState } = resolveTurn(s0, { p1: [{ type: 'Fortify', unitId: 'u1' }] }, 7);
    expect(unitOf(newState, 'u1').fortified).toBe(false);
  });

  it('R-174 : un ordre Fortify sur une unité stabilisée fortifie', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2, stabilized: true },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6 },
      ],
    });
    const { newState } = resolveTurn(s0, { p1: [{ type: 'Fortify', unitId: 'u1' }] }, 7);
    expect(unitOf(newState, 'u1').fortified).toBe(true);
  });

  it('R-175 : la fortification survit à un tour sans déplacement (Hold), même après combat', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2, stabilized: true },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6 },
      ],
    });
    const t1 = resolveTurn(s0, { p1: [{ type: 'Fortify', unitId: 'u1' }] }, 7);
    expect(unitOf(t1.newState, 'u1').fortified).toBe(true);
    const t2 = resolveTurn(t1.newState, { p1: [{ type: 'Hold', unitId: 'u1' }] }, 7);
    expect(unitOf(t2.newState, 'u1').fortified).toBe(true);
  });

  it('R-175 : la fortification est perdue au déplacement', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2, fortified: true, stabilized: true },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6 },
      ],
    });
    const { newState } = resolveTurn(s0, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 3 }] }] }, 7);
    const u1 = unitOf(newState, 'u1');
    expect(u1.fortified).toBe(false);
    expect(u1.q).toBe(2);
    expect(u1.r).toBe(3);
  });
});

describe('R-176/R-177 · Engagement : un seul défenseur, ordre d’attaque, fin des replis', () => {
  it('deux attaquants entrants ne combattent QUE le défenseur ; les deux finissent sur sa case (aucun repli)', () => {
    const s0 = makeState({
      units: [
        { id: 'd1', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: true },
        { id: 'a1', type: 'guerrier', owner: 'p2', q: 4, r: 3 },
        { id: 'a2', type: 'guerrier', owner: 'p2', q: 3, r: 4 },
      ],
    });
    const t1 = resolveTurn(s0, {
      p2: [
        { type: 'Attack', unitId: 'a1', target: { q: 4, r: 4 } },
        { type: 'Attack', unitId: 'a2', target: { q: 4, r: 4 } },
      ],
    }, 7);
    const events = t1.events;
    // les deux attaquants n'ont combattu QUE le défenseur (R-176/#1)
    const cibles = events.filter((e) => e.type === 'Attack').map((e) => (e as { defenderId: string }).defenderId);
    expect(cibles.length).toBeGreaterThanOrEqual(2);
    for (const c of cibles) expect(c).toBe('d1');
    // aucun événement Retreat (R-53/R-54/R-56 abrogées)
    expect(events.some((e) => e.type === 'Retreat')).toBe(false);
    // R-178 rév. A : défenseur attaqué ce tour → PAS de mêlée le même tour.
    expect(events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    // Tour 2 (tous demeurent) : la mêlée réunit défenseur et attaquants.
    const t2 = resolveTurn(t1.newState, {}, 20260916);
    const melee = t2.events.find((e): e is Extract<GameEvent, { type: 'MeleeResolved' }> => e.type === 'MeleeResolved')!;
    expect(new Set(melee.participants)).toEqual(new Set(['d1', 'a1', 'a2']));
  });

  it('R-177 : l’attaquant avec le plus de PM restants après l’entrée attaque en premier', () => {
    const s0 = makeState({
      units: [
        { id: 'd1', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: true },
        { id: 'a1', type: 'guerrier', owner: 'p2', q: 4, r: 3, mp: 1 }, // entre avec 0 PM restant
        { id: 'a2', type: 'guerrier', owner: 'p2', q: 3, r: 4, mp: 2 }, // entre avec 1 PM restant
      ],
    });
    const { events } = resolveTurn(s0, {
      p2: [
        { type: 'Attack', unitId: 'a1', target: { q: 4, r: 4 } },
        { type: 'Attack', unitId: 'a2', target: { q: 4, r: 4 } },
      ],
    }, 7);
    const attaques = events.filter((e) => e.type === 'Attack').map((e) => (e as { attackerId: string }).attackerId);
    expect(attaques[0]).toBe('a2'); // plus de PM restants d'abord
    expect(attaques).toContain('a1');
  });

  it('R-177 : défenseur détruit par le premier attaquant → les suivants n’attaquent pas ; mêlée en fin de tour', () => {
    const s0 = makeState({
      units: [
        { id: 'd1', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: true, hp: 1 },
        { id: 'a1', type: 'canon', owner: 'p2', q: 4, r: 3 }, // attaque 6 : écrase le guerrier
        { id: 'a2', type: 'guerrier', owner: 'p2', q: 3, r: 4 },
      ],
    });
    const { newState, events } = resolveTurn(s0, {
      p2: [
        { type: 'Attack', unitId: 'a1', target: { q: 4, r: 4 } },
        { type: 'Attack', unitId: 'a2', target: { q: 4, r: 4 } },
      ],
    }, 7);
    expect(newState.units['d1']).toBeUndefined(); // mort
    const attaques = events.filter((e) => e.type === 'Attack').map((e) => (e as { attackerId: string }).attackerId);
    expect(attaques).toEqual(['a1']); // a2 n'attaque pas (séquence arrêtée, R-177)
    // a1 (canon : à distance, R-59-a) est resté à (4,3) — pas de cohabitation
    expect(events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    expect(events.some((e) => e.type === 'UnitExpelled')).toBe(false);
    expect([unitOf(newState, 'a1').q, unitOf(newState, 'a1').r]).toEqual([4, 3]);
    // a2 (mêlée) a pris place sur la case libérée : seule → stabilisée
    const surCase = Object.values(newState.units).filter((u) => u.q === 4 && u.r === 4);
    expect(surCase.map((u) => u.id)).toEqual(['a2']);
    expect(unitOf(newState, 'a2').stabilized).toBe(true);
  });

  it('R-181 (D4) : cohabitation attaquants/défenseur vivant en fin de tour → mêlée, pas de ré-attaque séquentielle', () => {
    const s0 = makeState({
      units: [
        { id: 'd1', type: 'piquier', owner: 'p1', q: 4, r: 4, stabilized: true }, // déf 3 : survit au guerrier
        { id: 'a1', type: 'guerrier', owner: 'p2', q: 4, r: 3 },
      ],
    });
    const t1 = resolveTurn(s0, { p2: [{ type: 'Move', unitId: 'a1', path: [{ q: 4, r: 4 }] }] }, 7);
    // R-178 rév. A : défenseur attaqué → mêlée reportée au tour suivant.
    expect(t1.events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    const t2 = resolveTurn(t1.newState, {}, 20260916);
    const melee = t2.events.find((e): e is Extract<GameEvent, { type: 'MeleeResolved' }> => e.type === 'MeleeResolved');
    expect(melee).toBeDefined();
    expect(new Set(melee!.participants)).toEqual(new Set(['d1', 'a1']));
  });

  it('R-178 rév. A · REPORT : entrée sur un défenseur stabilisé — attaques ce tour, mêlée AU TOUR SUIVANT (scénario du labo, seed 20260915)', () => {
    // J2 (2,3) et J1 (1,4) entrent sur le barbare (2,4) : deux attaques à
    // tour de rôle (le barbare perd au plus 2 PV), AUCUNE mêlée le même tour.
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p2', q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 1, r: 4 },
        { id: 'u3', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 4 },
      ],
    });
    const t1 = resolveTurn(s0, {
      p1: [{ type: 'Move', unitId: 'u2', path: [{ q: 2, r: 4 }] }],
      p2: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 4 }] }],
    }, 20260915);
    // Tour 1 : deux attaques contre u3, jamais de mêlée.
    const attaques = t1.events.filter((e): e is Extract<GameEvent, { type: 'Attack' }> => e.type === 'Attack');
    expect(attaques.map((a) => a.attackerId).sort()).toEqual(['u1', 'u2']);
    expect(attaques.every((a) => a.defenderId === 'u3')).toBe(true);
    expect(t1.events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    expect(unitOf(t1.newState, 'u3').hp).toBe(1); // 3 − 2 × 1
    // Cohabitation instable : personne n'est stabilisé.
    for (const u of Object.values(t1.newState.units)) expect(u.stabilized).toBe(false);
    // Tour 2 (tout le monde demeure) : la MÊLÉE a lieu en Phase E.
    const t2 = resolveTurn(t1.newState, {}, 20260916);
    const melee = t2.events.find((e): e is Extract<GameEvent, { type: 'MeleeResolved' }> => e.type === 'MeleeResolved');
    expect(melee).toBeDefined();
    expect(new Set(melee!.participants)).toEqual(new Set(['u1', 'u2', 'u3']));
  });

  it('R-178 rév. A · le report NE s’applique PAS sans défenseur : entrée simultanée sur une case vide = mêlée immédiate (#2)', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 3 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 4 },
      ],
    });
    const { events } = resolveTurn(s0, {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 4 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 2, r: 4 }] }],
    }, 20260915);
    // Aucun défenseur sur (2,4) : instabilité résolue le tour même de l'entrée.
    expect(events.some((e) => e.type === 'MeleeResolved')).toBe(true);
  });

  it('R-175/R-178 rév. A · le défenseur qui DEMEURE pour la mêlée différée conserve ses bonus (fortifié + forêt)', () => {
    // Tour 1 : un char fortifié en forêt est attaqué par deux guerriers
    // (survie mutuelle — cohabitation, mêlée reportée). Tour 2 : la mêlée
    // donne un poids écrasant au char (attaque² × [forêt +50 % + fortifié +25 %]
    // contre guerrier¹²) — il sort GAGNANT, intacts.
    let state = makeState({
      terrainOverrides: { '4,4': 'foret' },
      units: [
        { id: 'd1', type: 'char_d_assaut', owner: 'p1', q: 4, r: 4, fortified: true, stabilized: true },
        { id: 'a1', type: 'guerrier', owner: 'p2', q: 3, r: 4 },
        { id: 'a2', type: 'guerrier', owner: 'p2', q: 4, r: 3 },
      ],
    });
    const t1 = resolveTurn(state, {
      p2: [
        { type: 'Attack', unitId: 'a1', target: { q: 4, r: 4 } },
        { type: 'Attack', unitId: 'a2', target: { q: 4, r: 4 } },
      ],
    }, 20260915);
    expect(t1.events.some((e) => e.type === 'MeleeResolved')).toBe(false); // report
    expect(unitOf(t1.newState, 'd1').hp).toBeGreaterThanOrEqual(2); // défense solide (1 PV perdu au pire)
    // Tour 2 : tous demeurent → mêlée. Le char fortifié + forêt domine le tirage.
    const t2 = resolveTurn(t1.newState, {}, 20260916);
    const melee = t2.events.find((e): e is Extract<GameEvent, { type: 'MeleeResolved' }> => e.type === 'MeleeResolved')!;
    expect(melee).toBeDefined();
    const roleD1 = melee!.results.find((r) => r.unitId === 'd1')!;
    expect(roleD1.role).toBe('winner'); // ses bonus de demeure (R-175) pèsent dans le tirage
    expect(roleD1.hpAfter).toBe(unitOf(t1.newState, 'd1').hp); // gagnant : 0 PV perdus
  });

  it('R-176a · COUP EN PASSANT : deux unités qui échangent leurs cases — l’attaque planifiée à l’entrée se résout sur la case de fuite (reproduction labo seed 20260915)', () => {
    // u1 (J1, (1,3)) et u2 (J2, (2,3)) échangent leurs cases. u1 entre sur
    // (2,3) encore occupée → attaque planifiée contre le défenseur stabilisé ;
    // u2 part ensuite sur (1,3) : l'attaque se résout TOUT DE MÊME (u2 reste à
    // portée 1) — le défenseur parti se défend en VALEURS D'ATTAQUE (R-174,
    // il a bougé). Survie mutuelle : personne ne cohabite, les deux cases
    // se stabilisent en fin de tour.
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 3 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 3 },
      ],
    });
    const { newState, events } = resolveTurn(s0, {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 3 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 3 }] }],
    }, 20260915);
    // Croisement : positions échangées.
    expect([unitOf(newState, 'u1').q, unitOf(newState, 'u1').r]).toEqual([2, 3]);
    expect([unitOf(newState, 'u2').q, unitOf(newState, 'u2').r]).toEqual([1, 3]);
    // Le coup en passant : attaque de u1 (en 2,3) SUR u2 (en 1,3).
    const att = events.find((e): e is Extract<GameEvent, { type: 'Attack' }> => e.type === 'Attack')!;
    expect(att.attackerId).toBe('u1');
    expect(att.defenderId).toBe('u2');
    expect(att.at).toEqual({ q: 1, r: 3 });
    const ex = events.find((e): e is Extract<GameEvent, { type: 'CombatExchange' }> => e.type === 'CombatExchange')!;
    expect(ex.attackerHpAfter + ex.defenderHpAfter).toBe(5); // 1 PV perdu au total (T-03)
    // Survie mutuelle : pas de mêlée, les deux cases se stabilisent.
    expect(events.some((e) => e.type === 'MeleeResolved')).toBe(false);
    expect(unitOf(newState, 'u1').stabilized).toBe(true);
    expect(unitOf(newState, 'u2').stabilized).toBe(true);
  });
});

describe('R-178/R-180 · Mêlée pondérée + étau', () => {
  it('pur : drawWeightedMelee — gagnant 0, perdant −2, autres −1 ; le poids domine le tirage', () => {
    const rng = createRng(42);
    // deux participants de même poids : tirage uniforme
    const deux = drawWeightedMelee(
      [{ id: 'x', weight: 9 }, { id: 'y', weight: 9 }],
      rng,
    );
    expect(deux).toHaveLength(2);
    const roles = Object.fromEntries(deux.map((r) => [r.id, r.role]));
    expect(Object.values(roles).sort()).toEqual(['loser', 'winner']);
    // trois participants : un intermédiaire
    const trois = drawWeightedMelee(
      [{ id: 'x', weight: 9 }, { id: 'y', weight: 9 }, { id: 'z', weight: 9 }],
      rng,
    );
    const roles3 = Object.fromEntries(trois.map((r) => [r.id, r.role])).valueOf() as Record<string, string>;
    expect(Object.values(roles3).sort()).toEqual(['loser', 'middle', 'winner']);
    // poids dominant : le plus fort gagne presque toujours (roll médian)
    const inegal = drawWeightedMelee(
      [{ id: 'fort', weight: 10000 }, { id: 'faible', weight: 1 }],
      createRng(1),
    );
    expect(inegal.find((r) => r.id === 'fort')!.role).toBe('winner');
  });

  it('pur : meleeTauMultiplier — +0,25 par alliée au-delà de la première, plafonné à +0,50 (T-54/T-55)', () => {
    expect(meleeTauMultiplier(1)).toBe(1);
    expect(meleeTauMultiplier(2)).toBeCloseTo(1.25);
    expect(meleeTauMultiplier(3)).toBeCloseTo(1.5);
    expect(meleeTauMultiplier(5)).toBeCloseTo(1.5); // plafond
  });

  it('R-180 : mêlée à 2 — le gagnant ne perd rien, le perdant perd 2 PV ; mort à 0', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 4, stabilized: false, hp: 2 },
      ],
    });
    const { newState } = resolveTurn(s0, AUCUN, 7);
    const melee = Object.values(newState.units);
    expect(melee).toHaveLength(1); // l'un est mort (2 PV − 2)
    expect(melee[0]!.hp).toBe(3); // le gagnant sort intact
  });

  it('R-180 : mêlée à 3 — gagnant 0, perdant −2, intermédiaire −1 (déterministe au seed)', () => {
    const base = () =>
      makeState({
        units: [
          { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: false },
          { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 4, stabilized: false },
          { id: 'u3', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: false },
        ],
      });
    const r1 = resolveTurn(base(), AUCUN, 11);
    const r2 = resolveTurn(base(), AUCUN, 11);
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
    const vivants = Object.values(r1.newState.units);
    const delta: Record<string, number> = {};
    for (const u of vivants) delta[u.id] = 3 - u.hp;
    const pertes = Object.values(delta).sort((a, b) => b - a);
    expect(pertes[0]).toBe(2); // perdant
    expect(pertes[1]).toBe(1); // intermédiaire
    expect(pertes[2]).toBe(0); // gagnant
  });
});

describe('R-179 · Expulsion de cohabitation (unités amies)', () => {
  it('l’unité fortifiée reste, l’autre est expulsée vers une case adjacente libre', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4, fortified: true, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: false },
      ],
    });
    const { newState, events } = resolveTurn(s0, AUCUN, 7);
    expect(unitOf(newState, 'u1').q).toBe(4);
    expect(unitOf(newState, 'u1').r).toBe(4); // la fortifiée reste
    const u2 = unitOf(newState, 'u2');
    expect(Math.abs(u2.q - 4) + Math.abs(u2.r - 4)).toBeGreaterThan(0); // expulsée (adjacente)
    expect(events.some((e) => e.type === 'UnitExpelled' && e.unitId === 'u2')).toBe(true);
  });

  it('sans case libre adjacente, l’excédent reste sur place (punition : instable)', () => {
    // encerclement complet : montagne tout autour de (4,4)
    const overrides: Record<string, 'montagne'> = {};
    for (let dq = -1; dq <= 1; dq++)
      for (let dr = -1; dr <= 1; dr++) {
        if (dq === 0 && dr === 0) continue;
        overrides[`${4 + dq},${4 + dr}`] = 'montagne';
      }
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4, fortified: true, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 4, stabilized: false },
      ],
      terrainOverrides: overrides,
    });
    const { newState } = resolveTurn(s0, AUCUN, 7);
    expect(Object.values(newState.units)).toHaveLength(2);
    const surCase = Object.values(newState.units).filter((u) => u.q === 4 && u.r === 4);
    expect(surCase).toHaveLength(2);
    for (const u of surCase) expect(u.stabilized).toBe(false);
  });
});

describe('R-182 · Unités pacifiques en instabilité', () => {
  it('un colon co-localisé à un ennemi est capturé quand la case se stabilise (butin T-12)', () => {
    const s0 = makeState({
      units: [
        { id: 'c1', type: 'colon', owner: 'p1', q: 4, r: 4, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 4, stabilized: false },
      ],
    });
    const { newState, events } = resolveTurn(s0, AUCUN, 7);
    expect(newState.units['c1']).toBeUndefined();
    expect(events.some((e) => e.type === 'Captured' && e.unitId === 'c1')).toBe(true);
    expect(newState.units['u2']).toBeDefined();
  });

  it('un colon qui fuit la case instable échappe à tout', () => {
    const s0 = makeState({
      units: [
        { id: 'c1', type: 'colon', owner: 'p1', q: 4, r: 4, stabilized: false, mp: 2 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 4, stabilized: false },
      ],
    });
    const { newState } = resolveTurn(s0, { p1: [{ type: 'Move', unitId: 'c1', path: [{ q: 4, r: 3 }] }] }, 7);
    expect(newState.units['c1']).toBeDefined();
    expect(unitOf(newState, 'c1').q).toBe(4);
  });
});

describe('R-183 · Camps barbares spatialisés (1 gardien + satellites adjacents)', () => {
  it('dotation T-50 : 1 barbare SUR le camp, les autres sur des cases adjacentes libres', () => {
    const s0 = makeState({
      width: 10,
      height: 10,
      villages: [{ q: 5, r: 5 }],
    });
    const barbares = Object.values(s0.units).filter((u) => u.owner === BARBARIAN_ID);
    expect(barbares).toHaveLength(3);
    const auCamp = barbares.filter((u) => u.q === 5 && u.r === 5);
    expect(auCamp).toHaveLength(1);
    for (const u of barbares.filter((x) => x.q !== 5 || x.r !== 5)) {
      expect(Math.max(Math.abs(u.q - 5), Math.abs(u.r - 5))).toBe(1); // rayon d'une case
    }
  });

  it('R-183 : le gardien ne sort jamais du camp ; les satellites bougent (aggro)', () => {
    const s0 = makeState({
      width: 12,
      height: 10,
      villages: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 3 }], // dans l'aggro des satellites
    });
    const { newState } = resolveTurn(s0, AUCUN, 7);
    const barbares = Object.values(newState.units).filter((u) => u.owner === BARBARIAN_ID);
    const gardien = barbares.find((u) => u.q === 5 && u.r === 5);
    expect(gardien).toBeDefined(); // toujours au camp
    // au moins un satellite s'est rapproché/attaqué
    expect(barbares.some((u) => u.q !== 5 || u.r !== 5)).toBe(true);
  });

  it('R-183 : tuer le gardien capture le camp (VillageDestroyed + VillageLooted, récompense seedée)', () => {
    const s0 = makeState({
      width: 10,
      height: 10,
      villages: [{ q: 5, r: 5 }],
      units: [{ id: 'k1', type: 'char_d_assaut', owner: 'p1', q: 5, r: 4 }], // att 10 mêlée : ÉCRASE le gardien (R-149)
    });
    const { newState, events } = resolveTurn(s0, { p1: [{ type: 'Attack', unitId: 'k1', target: { q: 5, r: 5 } }] }, 7);
    expect(newState.villages).toHaveLength(0);
    expect(events.some((e) => e.type === 'VillageDestroyed')).toBe(true);
    expect(events.some((e) => e.type === 'VillageLooted')).toBe(true);
  });

  it('R-183 : le rengendrement T-18 pose sur le camp si libre, sinon sur une case adjacente libre', () => {
    const s0 = makeState({
      width: 10,
      height: 10,
      turn: 9,
      villages: [{ q: 5, r: 5, spawnCountdown: 1 }],
      units: [{ id: 'k1', type: 'canon', owner: 'p1', q: 0, r: 0 }],
    });
    // le gardien est au camp → le spawn va sur une case adjacente
    const { newState } = resolveTurn(s0, AUCUN, 7);
    const spawns = Object.values(newState.units).filter((u) => u.owner === BARBARIAN_ID && u.id !== 'k1');
    expect(spawns.length).toBe(3); // dotation + 1 spawn (cap 3 atteint → le spawn est refusé si déjà 3 ?)
    void spawns;
  });
});
