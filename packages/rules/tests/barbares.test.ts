/**
 * Barbares & huttes — Phase 7d (RULES.md §7.9, R-95..R-99).
 *
 * Chaque test cite son identifiant de règle. Toutes les issues aléatoires
 * (rounds de combat, récompenses de huttes) sont rendues déterministes par
 * recherche de graine — la recherche elle-même est déterministe (R-80/R-82).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, pathBetween } from '../src/fixtures.js';
import { barbarianOrders, barbarianUnitType, createBarbarianUnit, drawHutReward } from '../src/barbares.js';
import { BARBARIAN_ID, BARBARIANS, HUT_REWARDS, UNIT_TYPES, registerTestUnitType } from '../src/data.js';
import { hexDistance, tileKeyOf, neighbors } from '../src/hex.js';
import { createRng } from '../src/rng.js';
import { getFilteredState, filterEventsForPlayer } from '../src/fog.js';
import { checkForfeit } from '../src/forfeit.js';
import { parseMap, loadBuiltinMapSync, createInitialState } from '../src/map.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent, HutReward } from '../src/events.js';
import type { TurnResult } from '../src/turn.js';
import type { Hex } from '../src/hex.js';

// Unité de test surpuissante (combat tranché : les rounds vont au perdant faible).
registerTestUnitType({
  id: 'geant',
  name: 'Géant (test)',
  attack: 20,
  defense: 20,
  movement: 1,
  hpMax: 3,
  cost: 1,
  visionRadius: 2,
  canAttack: true,
  canFoundCity: false,
  isRanged: false,
  tech: null,
});

/** Recherche DÉTERMINISTE d'une graine produisant l'issue voulu (R-80). */
function findSeed(
  build: () => GameState,
  orders: Record<string, Order[]>,
  predicate: (r: TurnResult) => boolean,
  max = 500,
): { seed: number; result: TurnResult } {
  for (let seed = 1; seed <= max; seed++) {
    const result = resolveTurn(build(), orders, seed);
    if (predicate(result)) return { seed, result };
  }
  throw new Error('aucune graine trouvée (calibrage du test)');
}

/** Résout n tours à ordres vides (les barbares, eux, jouent toujours). */
function resolveEmpty(state: GameState, n: number, seed = 17): { state: GameState; events: GameEvent[] } {
  let cur = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = resolveTurn(cur, {}, seed + i);
    cur = r.newState;
    events.push(...r.events);
  }
  return { state: cur, events };
}

function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

/** Les unités barbares vivantes de l'état, triées (R-81). */
function barbarians(state: GameState): string[] {
  return Object.keys(state.units)
    .filter((id) => state.units[id]!.owner === BARBARIAN_ID)
    .sort();
}

// ---------------------------------------------------------------------------
// R-99 · Données de calibrage
// ---------------------------------------------------------------------------

describe('R-99 · Données barbares.json / huttes.json', () => {
  it('R-99/T-18..T-23 + T-49/T-50 : barbares.json porte les constantes (POLISSAGE-1 C3), types d’escalade connus', () => {
    expect(BARBARIANS.spawnInterval).toBe(10); // T-18 (C3 : était 3)
    expect(BARBARIANS.aggroRadius).toBe(2); // T-19 (C3 : était 6 — sortie à 2 cases ou moins)
    expect(BARBARIANS.villageDestructionGold).toBe(50); // T-20 (7l · R-134 : canon +50 or — était 25 🔶 7d)
    expect(BARBARIANS.villageHP).toBe(3); // T-21
    expect(BARBARIANS.capPerVillage).toBe(3); // T-22 (C3 : était 2)
    expect(BARBARIANS.gardeMinimale).toBe(1); // T-49 (C3 : ≥ 1 unité reste au camp)
    expect(BARBARIANS.initialUnits).toBe(1); // T-50 (C3 : 1 barbare au camp au début)
    expect(BARBARIANS.escalationTurn).toBe(15); // T-23 (inchangé — seul le RYTHME change)
    expect(BARBARIANS.barbarianId).toBe('barbarien'); // R-95
    expect(BARBARIANS.villageDefense).toBeGreaterThanOrEqual(0);
    expect(UNIT_TYPES[BARBARIANS.units.initial]).toBeDefined();
    expect(UNIT_TYPES[BARBARIANS.units.escalated]).toBeDefined();
  });

  it('R-99 : huttes.json — table fermée, poids valides, bornes or cohérentes (T-24..T-26)', () => {
    const kinds: HutReward['kind'][] = ['gold', 'unit', 'science', 'reveal', 'ambush', 'artefact_indice', 'nothing']; // 7o · R-155 — ambush RETIRÉE de la table (décision Erik 06/09) mais kind encore connu du moteur
    const total = HUT_REWARDS.rewards.reduce((a, r) => a + r.weight, 0);
    expect(total).toBeGreaterThan(0);
    for (const def of HUT_REWARDS.rewards) {
      expect(kinds, `kind inconnu : ${def.kind}`).toContain(def.kind);
      expect(def.weight).toBeGreaterThanOrEqual(0);
    }
    const gold = HUT_REWARDS.rewards.find((r) => r.kind === 'gold')!;
    expect(gold.amountMin!).toBeLessThanOrEqual(gold.amountMax!);
    expect(HUT_REWARDS.scienceBoost).toBeGreaterThan(0); // T-24
    expect(HUT_REWARDS.revealRadius).toBeGreaterThanOrEqual(1);
    expect(UNIT_TYPES[HUT_REWARDS.freeUnit]).toBeDefined();
  });

  it('R-95 : l’escalade engendre le type initial avant T-23, le type escalated après', () => {
    expect(barbarianUnitType(1)).toBe(BARBARIANS.units.initial);
    expect(barbarianUnitType(15)).toBe(BARBARIANS.units.initial);
    expect(barbarianUnitType(16)).toBe(BARBARIANS.units.escalated);
  });
});

// ---------------------------------------------------------------------------
// R-95 · Faction barbare
// ---------------------------------------------------------------------------

describe('R-95 · Faction barbare (pseudo-joueur)', () => {
  it('R-95 : les barbares ne sont pas dans players — ni trésor, ni recherche, ni forfait T-06', () => {
    const base = () =>
      makeState({
        width: 12,
        height: 10,
        units: [{ id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 8, r: 5 }],
      });
    const withBarb = base();
    expect(Object.keys(withBarb.players).sort()).toEqual(['p1', 'p2']); // pas de joueur barbare
    // Forfait T-06 : identique avec ou sans barbares (le compteur ne les voit pas)
    const sans = structuredClone(base());
    sans.players['p1']!.missedTurns = 3;
    sans.players['p2']!.missedTurns = 3;
    const avec = structuredClone(sans);
    avec.units['b1'] = { ...avec.units['b1']!, q: 2, r: 2 };
    expect(checkForfeit(sans).state.winner).toBe(checkForfeit(avec).state.winner);
    // et une résolution ne touche pas missedTurns (géré côté serveur seulement)
    const { state } = resolveEmpty(base(), 2);
    expect(state.players['p1']!.missedTurns).toBe(0);
  });

  it('R-95 : barbarianOrders ne génère jamais Fortify/FoundCity/SetProduction (pas de fortification possible)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 7 },
      ],
    });
    for (const order of barbarianOrders(state)) {
      expect(['Move', 'Attack', 'Hold']).toContain(order.type);
    }
  });

  it('R-95/R-71 : une unité barbare qui ne bouge pas et ne combat pas soigne (+1 PV)', () => {
    // p1 loin au-delà du rayon d’aggro : le barbare tient (Hold) et se soigne.
    const state = makeState({
      width: 12,
      height: 10,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 8, r: 7, hp: 1 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      ],
    });
    const { state: after } = resolveEmpty(state, 1);
    expect(after.units['b1']!.hp).toBe(2);
  });

  it('R-95/R-32 : un barbare qui inflige le coup fatal devient vétéran', () => {
    const build = () =>
      makeState({
        width: 12,
        height: 10,
        units: [
          { id: 'b1', type: 'geant', owner: BARBARIAN_ID, q: 5, r: 5 },
          { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 6, hp: 1 },
        ],
      });
    const { result } = findSeed(build, {}, (r) =>
      r.events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'u1'),
    );
    expect(result.newState.units['b1']!.veteran).toBe(true);
  });

  it('R-95 : un barbare qui capture une unité pacifique la détruit SANS butin (pas de trésor)', () => {
    const build = () =>
      makeState({
        width: 12,
        height: 10,
        units: [
          { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5 },
          { id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 6 },
        ],
      });
    const { result } = findSeed(build, {}, (r) =>
      r.events.some((e) => e.type === 'Captured' && e.unitId === 'u1' && e.outcome === 'destroyed'),
    );
    expect(result.newState.units['u1']).toBeUndefined();
    expect(eventTypes(result.events)).not.toContain('BootyGold'); // R-95 : pas de trésor
  });

  it('R-95/R-98 : un barbare qui traverse une hutte ne l’ouvre pas', () => {
    // Le barbare avance vers u1 : son pas le fait entrer sur la case de la hutte.
    const state = makeState({
      width: 12,
      height: 10,
      villages: [],
      huts: [{ q: 5, r: 4 }],
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 3 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
      ],
    });
    const { state: after, events } = resolveEmpty(state, 1);
    expect(after.huts).toHaveLength(1); // non ouverte
    expect(eventTypes(events)).not.toContain('HutOpened');
  });
});

// ---------------------------------------------------------------------------
// R-97 · IA barbare déterministe
// ---------------------------------------------------------------------------

describe('R-97 · IA barbare (priorités 1-2-3)', () => {
  it('R-97-1 : priorité à l’attaque d’une unité ennemie adjacente', () => {
    const state = makeState({
      width: 12,
      height: 10,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 6 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 9, r: 1 }, // plus loin
      ],
    });
    expect(barbarianOrders(state)).toContainEqual({ type: 'Attack', unitId: 'b1', target: { q: 5, r: 6 } });
    const { events } = resolveEmpty(state, 1);
    expect(events.some((e) => e.type === 'Attack' && e.attackerId === 'b1')).toBe(true);
  });

  it('R-97-1 : ville adjacente sans défenseur → entrer (elle sera rasée) ; défendue → attaquer le défenseur (R-57)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      cities: [
        { id: 'c1', owner: 'p1', q: 5, r: 4, capital: false }, // adjacente, sans défenseur
        { id: 'c2', owner: 'p2', q: 6, r: 4, capital: false }, // adjacente, défendue par u2
      ],
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 4 },
      ],
    });
    const orders = barbarianOrders(state);
    // c1 (5,4) avant c2 (6,4) : tri (q, r) des voisins.
    expect(orders).toContainEqual({ type: 'Move', unitId: 'b1', path: [{ q: 5, r: 4 }] });
    expect(orders).not.toContainEqual({ type: 'Attack', unitId: 'b1', target: { q: 6, r: 4 } });
  });

  it('R-97-2 : avancer d’un pas vers l’ennemi le plus proche dans le rayon d’aggro T-19 ; tie-break (q, r)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 6 },
        // deux ennemis équidistants (distance 2) : (6,4) < (6,8) — (q, r) décide
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 8 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 4 },
      ],
    });
    expect(barbarianOrders(state)).toContainEqual({ type: 'Move', unitId: 'b1', path: [{ q: 6, r: 5 }] });
  });

  it('R-97-3 : hors du rayon d’aggro, tenir (Hold)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 2 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 9 }, // distance 7 > T-19 (6)
      ],
    });
    expect(barbarianOrders(state)).toContainEqual({ type: 'Hold', unitId: 'b1' });
  });

  it('R-97-2 : pas bloqué (ami sur la ligne) → pas alternatif réducteur, sinon tenir', () => {
    // La ligne vers (5,5) passe par (6,5) où stationne un ami ; (5,6), autre
    // voisin réducteur de distance, lui succède (tri (q, r)).
    const state = makeState({
      width: 14,
      height: 12,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 6 },
        { id: 'b2', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 5 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 }, // distance 2 ≤ T-19
      ],
    });
    const orders = barbarianOrders(state);
    const b1 = orders.find((o) => 'unitId' in o && o.unitId === 'b1')!;
    expect(b1).toMatchObject({ type: 'Move', path: [{ q: 5, r: 6 }] });
  });

  it('C3 · T-49 : cap 3, garde 1 — deux barbares du camp sortent, le TROISIÈME tient (Hold)', () => {
    // 3 barbares au camp (cap T-22), ennemi à distance 2 (aggro T-19) : les
    // deux premiers (tri unitId) sortent, le camp garde son unité (T-49).
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 6, r: 5, spawnCountdown: 99 }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 3 }, // distance 2 du village, non adjacent aux gardes
      ],
    });
    // Remplace la dotation T-50 par 3 barbares AU camp (spawnedUnits câblés).
    const gabarit = state.units[state.villages[0]!.spawnedUnits[0]!]!;
    for (const id of [...state.villages[0]!.spawnedUnits]) delete state.units[id];
    state.villages[0]!.spawnedUnits = ['b1', 'b2', 'b3'];
    state.units['b1'] = { ...gabarit, id: 'b1', q: 5, r: 5 }; // cases adjacentes au village (6,5)
    state.units['b2'] = { ...gabarit, id: 'b2', q: 7, r: 4 };
    state.units['b3'] = { ...gabarit, id: 'b3', q: 6, r: 6 };
    const orders = barbarianOrders(state);
    const moves = orders.filter((o) => o.type === 'Move');
    const holds = orders.filter((o) => o.type === 'Hold');
    expect(moves).toHaveLength(2); // au plus 2 sortent (cap 3 − garde 1)
    expect(holds).toHaveLength(1); // le garde reste au camp
  });

  it('C3 · T-49 : la garde n’empêche jamais le combat défensif — l’unité au camp ATTAQUE l’ennemi adjacent', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 6, r: 5, spawnCountdown: 99 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 4 }], // voisin de (5,5)
    });
    // Un seul barbare, au camp (dotation T-50 repositionnée sur (5,5)).
    const dotation = state.villages[0]!.spawnedUnits[0]!;
    state.units[dotation] = { ...state.units[dotation]!, q: 5, r: 5 };
    const orders = barbarianOrders(state);
    expect(orders).toContainEqual({ type: 'Attack', unitId: dotation, target: { q: 6, r: 4 } });
  });
});

// ---------------------------------------------------------------------------
// R-96 · Villages barbares
// ---------------------------------------------------------------------------

describe('R-96 · Villages barbares', () => {
  it('R-96/T-50 : dotation initiale — 1 barbare dans le camp au début de la partie, inscrit dans spawnedUnits', () => {
    const state = makeState({ width: 12, height: 10, villages: [{ q: 5, r: 5 }] });
    expect(state.villages[0]).toMatchObject({ id: 'v1', hp: BARBARIANS.villageHP, spawnCountdown: BARBARIANS.spawnInterval });
    const spawned = state.villages[0]!.spawnedUnits;
    expect(spawned).toHaveLength(BARBARIANS.initialUnits); // T-50
    const barbare = state.units[spawned[0]!]!;
    expect(barbare).toMatchObject({ owner: BARBARIAN_ID, type: BARBARIANS.units.initial });
    expect(hexDistance(barbare, { q: 5, r: 5 })).toBe(1); // case adjacente libre (R-96)
  });

  it('R-96/T-18 : premier RÉENGENDREMENT au tour 10 (spawnInterval), sur une case adjacente libre, compteur réarmé', () => {
    const state = makeState({ width: 12, height: 10, villages: [{ q: 5, r: 5 }] });
    const { state: after, events } = resolveEmpty(state, 10);
    expect(after.turn).toBe(10);
    const spawns = events.filter((e) => e.type === 'BarbarianSpawned');
    expect(spawns).toHaveLength(1); // la dotation initiale (T-50) n'émet pas d'événement
    const at = (spawns[0] as Extract<GameEvent, { type: 'BarbarianSpawned' }>).at;
    expect(hexDistance(at, { q: 5, r: 5 })).toBe(1); // case adjacente libre (R-96)
    expect(spawns[0]).toMatchObject({ villageId: 'v1', owner: BARBARIAN_ID });
    const spawned = barbarians(after);
    expect(spawned).toHaveLength(2); // dotation initiale + engendrement du tour 10
    expect(after.villages[0]!.spawnCountdown).toBe(BARBARIANS.spawnInterval);
    expect(after.villages[0]!.spawnedUnits).toEqual(spawned);
  });

  it('R-96 : aucun engendrement hors cycle (tours 1-9)', () => {
    const state = makeState({ width: 12, height: 10, villages: [{ q: 5, r: 5 }] });
    const { state: after, events } = resolveEmpty(state, 9);
    expect(events.filter((e) => e.type === 'BarbarianSpawned')).toHaveLength(0);
    expect(barbarians(after)).toHaveLength(1); // la dotation initiale seule (T-50)
    expect(after.turn).toBe(9);
  });

  it('R-96/T-22 : cap de 3 unités vivantes par village — le camp se régénère à 3 sans jamais le dépasser', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 9 }], // distance 4 > T-19 (2) : n'attire pas les barbares
    });
    const { state: after, events } = resolveEmpty(state, 25);
    const spawns = events.filter((e) => e.type === 'BarbarianSpawned');
    expect(spawns).toHaveLength(2); // tours 10 et 20 — dotation + 2 = 3 (cap T-22)
    expect(barbarians(after)).toHaveLength(3);
    const { state: encore } = resolveEmpty(after, 10); // tour 30 : le cap est atteint
    expect(barbarians(encore)).toHaveLength(3); // le camp se régénère à 3, jamais plus
  });

  it('R-96/T-22 + T-49 : cap 3 et garde 1 → au plus 2 barbares SORTENT simultanément (≥ 1 au camp)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 3 }], // distance 2 ≤ T-19 : attire
    });
    // Résous assez pour peupler le camp (dotation + tours 10, 20) puis laisser
    // les barbares sortir plusieurs tours de suite.
    let cur = state;
    for (let i = 0; i < 40; i++) cur = resolveTurn(cur, {}, 17 + i).newState;
    // Le camp garde TOUJOURS au moins 1 unité à distance ≤ 1 du village (T-49).
    const autourDuCamp = Object.values(cur.units).filter(
      (u) => u.owner === BARBARIAN_ID && hexDistance(u, { q: 5, r: 5 }) <= 1,
    );
    expect(autourDuCamp.length).toBeGreaterThanOrEqual(BARBARIANS.gardeMinimale);
    expect(cur.villages[0]!.spawnedUnits.filter((id) => cur.units[id]).length).toBeLessThanOrEqual(BARBARIANS.capPerVillage);
  });

  it('R-96/T-23 : escalade — engendrement d’archers après le tour 15 (dotation initiale inchangée : guerrier)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      turn: 15,
      villages: [{ q: 5, r: 5, spawnCountdown: 1 }],
    });
    const { state: after, events } = resolveEmpty(state, 1);
    expect(after.turn).toBe(16);
    const spawn = events.find((e): e is Extract<GameEvent, { type: 'BarbarianSpawned' }> => e.type === 'BarbarianSpawned')!;
    expect(after.units[spawn.unitId]!.type).toBe(BARBARIANS.units.escalated);
    // La dotation initiale (T-50) reste du type initial — seule la pousse du
    // village subit l'escalade.
    expect(after.units[after.villages[0]!.spawnedUnits.find((id) => id !== spawn.unitId)!]!.type).toBe(
      BARBARIANS.units.initial,
    );
    expect(eventTypes(events)).toContain('BarbarianSpawned');
  });

  it('R-96/R-51 : entrer sur un village = l’attaquer ; le village subit le round et l’attaquant se replie (R-52/R-54)', () => {
    const build = () =>
      makeState({
        width: 12,
        height: 10,
        villages: [{ q: 5, r: 5 }],
        units: [{ id: 'u1', type: 'geant', owner: 'p1', q: 5, r: 4 }],
      });
    const { result } = findSeed(build, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, (r) => {
      const v = r.newState.villages[0];
      return !!v && v.hp < BARBARIANS.villageHP; // le village a encaissé le round
    });
    const v = result.newState.villages[0]!;
    expect(v.hp).toBe(BARBARIANS.villageHP - 1);
    expect(result.newState.villages).toHaveLength(1); // toujours debout
    // Survie mutuelle : l’attaquant stationnaire-village garde sa case, l’attaquant se replie.
    expect(result.newState.units['u1']!).not.toMatchObject({ q: 5, r: 5 });
    const exchange = result.events.find((e) => e.type === 'CombatExchange');
    expect(exchange).toMatchObject({ defenderId: 'v1' });
  });

  it('R-96/T-20 : village détruit à 0 PV — or au vainqueur, disparition définitive, vétéran (R-32)', () => {
    let state = makeState({
      width: 12,
      height: 10,
      villages: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'geant', owner: 'p1', q: 5, r: 4 }],
    });
    const events: GameEvent[] = [];
    for (let t = 0; t < 6 && state.villages.length > 0; t++) {
      const hpBefore = state.villages[0]!.hp;
      const { seed, result } = findSeed(
        () => structuredClone(state),
        { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] },
        (r) => r.newState.villages.length === 0 || r.newState.villages[0]!.hp < hpBefore,
      );
      void seed;
      state = result.newState;
      events.push(...result.events);
    }
    expect(state.villages).toHaveLength(0); // détruit, disparition définitive
    expect(state.units['u1']!.veteran).toBe(true);
    expect(state.units['u1']!.q).toBe(5); // l’attaquant est sur la case libérée (R-52)
    expect(state.units['u1']!.r).toBe(5);
    expect(events.filter((e) => e.type === 'VillageDestroyed')).toHaveLength(1);
    expect(state.players['p1']!.treasury).toBe(BARBARIANS.villageDestructionGold);
    const booty = events.find((e) => e.type === 'BootyGold');
    expect(booty).toMatchObject({ player: 'p1', amount: BARBARIANS.villageDestructionGold, sourceVillageId: 'v1' });
  });

  it('R-96/R-57 : village défendu par une unité barbare — c’est l’unité qui combat, le village reste intact', () => {
    const build = () =>
      makeState({
        width: 12,
        height: 10,
        villages: [{ q: 5, r: 5 }],
        units: [
          { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5 }, // sur le village
          // 7n · R-149 : guerrier (et non le Géant de test) — un attaquant à
          // 20:1 ÉCRASERAIT le défenseur (Overrun ≥ 6:1) avant l'échange.
          { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 },
        ],
      });
    const { result } = findSeed(build, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, (r) =>
      r.events.some((e) => e.type === 'CombatExchange' && e.defenderId === 'b1' && e.defenderHpAfter > 0),
    );
    expect(result.newState.villages[0]!.hp).toBe(BARBARIANS.villageHP); // intact
    expect(result.newState.units['b1']).toBeDefined();
  });

  it('R-96/I-4 : un colon qui entre sur un village barbare est capturé (détruit, pas de butin)', () => {
    const build = () =>
      makeState({
        width: 12,
        height: 10,
        villages: [{ q: 5, r: 5 }],
        units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 4 }],
      });
    const { result } = findSeed(build, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, (r) =>
      r.events.some((e) => e.type === 'Captured' && e.unitId === 'u1'),
    );
    expect(result.newState.units['u1']).toBeUndefined();
    expect(result.newState.villages).toHaveLength(1);
    expect(eventTypes(result.events)).not.toContain('BootyGold');
  });
});

// ---------------------------------------------------------------------------
// R-97 · Rasement (capture barbare des villes)
// ---------------------------------------------------------------------------

describe('R-97 · Rasement des villes', () => {
  it('R-97 : une ville sans défenseur investie par les barbares est RASÉE (CityRazed, aucun changement de propriétaire)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      cities: [{ id: 'c2', owner: 'p1', q: 7, r: 3, capital: false }],
      units: [{ id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 7, r: 1 }], // distance 2 ≤ T-19
    });
    const { state: after, events } = resolveEmpty(state, 3); // approche (2 tours) + entrée
    expect(after.cities['c2']).toBeUndefined(); // rasée = disparue
    expect(eventTypes(events)).toContain('CityRazed');
    expect(eventTypes(events)).not.toContain('CityCaptured');
    const razed = events.find((e) => e.type === 'CityRazed');
    expect(razed).toMatchObject({ cityId: 'c2', owner: 'p1', byPlayer: BARBARIAN_ID });
    expect(after.winner).toBeNull(); // pas une capitale
  });

  it('R-97 : capitale rasée → son propriétaire perd, l’adversaire réel gagne (Victory razedCapital)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      cities: [{ id: 'c1', owner: 'p1', q: 7, r: 3, capital: true }],
      units: [{ id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 7, r: 1 }],
    });
    const { state: after, events } = resolveEmpty(state, 4);
    expect(after.cities['c1']).toBeUndefined();
    expect(after.winner).toBe('p2'); // l’autre joueur réel — les barbares ne gagnent jamais
    const victory = events.find((e) => e.type === 'Victory');
    expect(victory).toMatchObject({ winner: 'p2', reason: 'razedCapital' });
  });
});

// ---------------------------------------------------------------------------
// R-98 · Huttes bonus
// ---------------------------------------------------------------------------

const HUT = { q: 6, r: 5 };

/** État standard de test de hutte : u1 (p1) adjacente, un pas l’ouvre. */
function hutState(extra: Partial<Parameters<typeof makeState>[0]> = {}): GameState {
  return makeState({
    width: 14,
    height: 12,
    huts: [HUT],
    units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 4 }],
    ...extra,
  });
}
const HUT_ORDERS: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [HUT] }] };

/** Recherche une graine produisant la récompense demandée, retourne le résultat. */
function hutSeedOf(kind: HutReward['kind']): TurnResult {
  const { result } = findSeed(hutState, HUT_ORDERS, (r) =>
    r.events.some((e) => e.type === 'HutOpened' && e.reward.kind === kind),
  );
  return result;
}

describe('R-98 · Huttes bonus', () => {
  it('R-98 : les 6 récompenses de la table sont atteignables, chacune par sa graine (une partie par graine)', () => {
    for (const kind of ['gold', 'unit', 'science', 'reveal', 'artefact_indice'] as const) {
      const result = hutSeedOf(kind);
      const opened = result.events.find((e) => e.type === 'HutOpened');
      expect(opened).toMatchObject({ hutId: 'h1', byPlayer: 'p1', byUnitId: 'u1', at: HUT });
      expect(result.newState.huts).toHaveLength(0); // une seule fois, retirée de l’état
    }
  });

  it('R-98 : récompense or — montant T-25..T-26 crédité au trésor de l’ouvreur', () => {
    const result = hutSeedOf('gold');
    const opened = result.events.find((e) => e.type === 'HutOpened')!;
    if (opened.type !== 'HutOpened') throw new Error('impossible');
    if (opened.reward.kind !== 'gold') throw new Error('impossible');
    expect(opened.reward.amount).toBeGreaterThanOrEqual(15); // T-25
    expect(opened.reward.amount).toBeLessThanOrEqual(50); // T-26
    expect(result.newState.players['p1']!.treasury).toBe(opened.reward.amount);
  });

  it('R-98 : récompense unité — un guerrier gratuit engendré sur une case adjacente libre', () => {
    const result = hutSeedOf('unit');
    const opened = result.events.find((e) => e.type === 'HutOpened')!;
    if (opened.type !== 'HutOpened' || opened.reward.kind !== 'unit') throw new Error('impossible');
    expect(opened.reward.unitIds).toHaveLength(1);
    const free = result.newState.units[opened.reward.unitIds[0]!]!;
    expect(free).toMatchObject({ owner: 'p1', type: HUT_REWARDS.freeUnit });
    expect(hexDistance(free, HUT)).toBe(1);
  });

  it('R-98/T-24 : récompense science — boost sur la recherche courante (R-85)', () => {
    const build = () => {
      const st = hutState();
      // 'lettres' coûte 40 > T-24 : la progression reste visible (R-85 ;
      // avec 'alphabet' (coût 20) le boost COMPLÈTERAIT la tech).
      st.players['p1']!.researching = 'lettres';
      return st;
    };
    const { result } = findSeed(build, HUT_ORDERS, (r) =>
      r.events.some((e) => e.type === 'HutOpened' && e.reward.kind === 'science'),
    );
    expect(result.newState.players['p1']!.scienceProgress['lettres']).toBe(HUT_REWARDS.scienceBoost);
  });

  it('R-98 : récompense révélation — rayon 3 ajouté au explored du joueur (pas à visible)', () => {
    const result = hutSeedOf('reveal');
    const vision = result.newState.players['p1']!.vision;
    const revealed = `${HUT.q},${HUT.r + 3}`; // à distance 3 de la hutte, hors vision initiale
    expect(vision.explored).toContain(revealed);
    expect(vision.visible).not.toContain(revealed); // explored seulement (R-98)
  });

  // Embuscade RETIRÉE de la table huttes.json (décision Erik 06/09/2026) :
  // ouvrir une hutte n'engendre plus jamais de barbares. Le kind 'ambush'
  // reste connu du moteur (types/turn) pour une réintroduction éventuelle.

  // CORRECTIFS-SOLO 3 (enquête Erik 05/09) : invariant général — hors
  // embuscade R-98, AUCUN engendrement barbare ne provient d'une hutte : tout
  // BarbarianSpawned nomme un VILLAGE existant (R-96). Les guerriers « sortis
  // d'une hutte » signalés en solo sont donc l'embuscade canon (ouverture →
  // 2 barbares adjacents) ou un camp barbare pris pour une hutte.
  it('R-96/R-98 : tout BarbarianSpawned hors embuscade porte un villageId existant (jamais une hutte)', () => {
    for (const kind of ['gold', 'unit', 'science', 'reveal', 'artefact_indice'] as const) {
      const result = hutSeedOf(kind);
      const spawns = result.events.filter((e) => e.type === 'BarbarianSpawned');
      const villageIds = new Set(result.newState.villages.map((v) => v.id));
      for (const s of spawns) {
        if (s.type !== 'BarbarianSpawned') continue;
        expect(villageIds.has(s.villageId), `spawn hors village (kind=${kind})`).toBe(true);
      }
    }
  });

  // « rien » retiré de la table (poids 0, décision Erik 06/09) — jamais tiré.
  it('R-98 : « rien » (poids 0) et « ambush » (retirée 06/09) ne sortent JAMAIS du tirage ; artefact_indice oui', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = drawHutReward(createRng(seed));
      expect(['nothing', 'ambush'], `tiré ${r.kind} à la graine ${seed}`).not.toContain(r.kind);
    }
    const kinds = new Set(Array.from({ length: 300 }, (_, i) => drawHutReward(createRng(i + 1)).kind));
    expect(kinds.has('artefact_indice')).toBe(true); // R-155 : l'indice est tiré (bug de cas manquant corrigé)
  });

  it('R-98 : une hutte ne s’ouvre qu’une fois (deuxième entrant : plus rien)', () => {
    const state = makeState({
      width: 14,
      height: 12,
      huts: [HUT],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 6 },
      ],
    });
    // u1 ouvre (n’importe quelle récompense), puis u2 entre à son tour : pas de second événement.
    const { seed } = findSeed(() => structuredClone(state), HUT_ORDERS, (r) =>
      r.events.some((e) => e.type === 'HutOpened'),
    );
    const second = resolveTurn(state, { p1: HUT_ORDERS.p1!, p2: [{ type: 'Move', unitId: 'u2', path: [HUT] }] }, seed);
    expect(second.events.filter((e) => e.type === 'HutOpened')).toHaveLength(1); // u1 seulement
  });

  it('R-98 : une unité pacifique (colon) ouvre la hutte', () => {
    const state = makeState({
      width: 14,
      height: 12,
      huts: [HUT],
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 6, r: 4 }],
    });
    const { result } = findSeed(() => state, { p1: [{ type: 'Move', unitId: 'u1', path: [HUT] }] }, (r) =>
      r.events.some((e) => e.type === 'HutOpened'),
    );
    expect(result.newState.huts).toHaveLength(0);
  });

  it('R-98 : hutte occupée par un ennemi — ouverte à l’entrée, avant le combat planifié', () => {
    const state = makeState({
      width: 14,
      height: 12,
      huts: [HUT],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 5 }, // campe sur la hutte
      ],
    });
    const { result } = findSeed(() => structuredClone(state), HUT_ORDERS, (r) =>
      r.events.some((e) => e.type === 'Attack'),
    );
    expect(eventTypes(result.events)).toContain('HutOpened'); // ouverte malgré le combat
    expect(result.newState.huts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Interactions L1.5/L1.6
// ---------------------------------------------------------------------------

describe('Interactions barbares ↔ règles existantes (L1.5/L1.6)', () => {
  it('R-53 : collision barbare/civilisation — règle normale, aucun dégât, la plus haute PV demeure', () => {
    // b1 (unitId < u1) bouge en premier et arrive sur (6,7) ; u1 visait la même case.
    const state = makeState({
      width: 14,
      height: 12,
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 6 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 6, r: 8 },
      ],
    });
    const orders = barbarianOrders(state); // b1 avance vers u1 : pas sur (6,7)
    expect(orders).toContainEqual({ type: 'Move', unitId: 'b1', path: [{ q: 6, r: 7 }] });
    const { newState: after, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 6, r: 7 }] }] }, 11);
    expect(eventTypes(events)).not.toContain('CombatExchange'); // R-53 : aucun dégât
    expect(eventTypes(events)).not.toContain('UnitDestroyed');
    // Tie-break R-53 : à PV égaux, celle qui a parcouru le MOINS de cases
    // demeure — u1 (0 pas) garde la case, b1 (1 pas) se replie sur son origine.
    expect(after.units['u1']).toMatchObject({ q: 6, r: 7 });
    expect(after.units['b1']).toMatchObject({ q: 6, r: 6 });
    expect(eventTypes(events)).toContain('Retreat');
  });

  it('R-53/R-30 : deux movers convergent vers le même détenteur — la case n’est attribuée qu’à un seul vainqueur', () => {
    // u1 (mover) arrive sur (5,5) ; b1 et b2 visent la même case : deux
    // collisions, u1 (1 case parcourue) perd les deux (tie-break R-53). Sans
    // garde R-30, b1 ET b2 prenaient tous deux la case libérée.
    // Scénario générique (hors barbares : l'IA engendrerait des attaques
    // adjacentes qui brouilleraient le propos) — trois unités p1/p2.
    const state = makeState({
      width: 12,
      height: 10,
      villages: [],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 5 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 4, r: 6 },
        { id: 'u3', type: 'guerrier', owner: 'p2', q: 5, r: 6 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }],
      p2: [
        { type: 'Move', unitId: 'u2', path: [{ q: 5, r: 5 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 5, r: 5 }] },
      ],
    };
    const { newState: after, events } = resolveTurn(state, orders, 5);
    expect(eventTypes(events)).not.toContain('CombatExchange'); // R-53 : aucun dégât
    // R-30 : au plus une entité par case — b1 prend la case, b2 reste sur la sienne.
    const occupantsAt = (q: number, r: number) =>
      Object.values(after.units).filter((u) => u.q === q && u.r === r);
    expect(occupantsAt(5, 5)).toHaveLength(1);
    expect(occupantsAt(5, 5)[0]!.id).toBe('u2'); // premier vainqueur (ordre R-56)
    expect(after.units['u3']).toMatchObject({ q: 5, r: 6 }); // le second garde sa case
    expect(after.units['u1']).not.toMatchObject({ q: 5, r: 5 }); // replié (R-54)
  });

  it('anti-triche (R-95/R-70) : l’état filtré ne montre ni barbares hors vision, ni villages/huttes inexplorés', () => {
    const state = makeState({
      width: 20,
      height: 12,
      villages: [{ q: 12, r: 8 }],
      huts: [{ q: 13, r: 8 }],
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 12, r: 8 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 1 },
      ],
    });
    const filtered = getFilteredState(state, 'p1');
    expect(filtered.units['b1']).toBeUndefined(); // hors vision
    expect(filtered.villages).toHaveLength(0); // cases inexplorées
    expect(filtered.huts).toHaveLength(0);
    // mais visibles dès que la case est explorée (entités statiques, L3.3)
    state.players['p1']!.vision.explored.push('12,8', '13,8');
    const explored = getFilteredState(state, 'p1');
    expect(explored.villages).toHaveLength(1);
    expect(explored.huts).toHaveLength(1);
  });

  it('anti-triche (R-95) : les ordres barbares ne quittent jamais le moteur — rien dans l’état, journal filtré', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 5, r: 5 }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 8 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 1 },
      ],
    });
    const { state: after, events } = resolveEmpty(state, 10);
    const json = JSON.stringify(after);
    expect(json).not.toContain('"Fortify"');
    expect(json).not.toContain('"FoundCity"');
    expect(json).not.toContain('barbarianOrders');
    for (const id of barbarians(after)) {
      const order = after.units[id]!.order;
      expect(order === null || order.type === 'Move').toBe(true); // seulement un éventuel chemin gelé
    }
    // Le journal est filtré : un spawn hors exploration n’est pas diffusé à p1.
    const spawn = events.find((e) => e.type === 'BarbarianSpawned')!;
    const filtered = filterEventsForPlayer(after, 'p1', [spawn]);
    expect(filtered).toHaveLength(0); // la case du village n’est pas explorée par p1
  });

  it('R-80 : idempotence bit à bit avec villages, huttes et barbares', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 5, r: 5 }],
      huts: [{ q: 6, r: 4 }],
      units: [
        { id: 'b1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 7 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 8, r: 8 },
      ],
    });
    const a = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 4, r: 5 }] }] }, 123);
    const b = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 4, r: 5 }] }] }, 123);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('R-95 : un village peut engendrer sous les yeux d’un joueur — événement filtré par fog pour l’ennemi', () => {
    const state = makeState({
      width: 14,
      height: 12,
      villages: [{ q: 5, r: 5 }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 6 }, // voit le village (distance 1)
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 0, r: 0 }, // loin
      ],
    });
    const { state: after, events } = resolveEmpty(state, 10);
    const spawn = events.find((e) => e.type === 'BarbarianSpawned')!;
    expect(filterEventsForPlayer(after, 'p1', [spawn])).toHaveLength(1); // p1 voit
    expect(filterEventsForPlayer(after, 'p2', [spawn])).toHaveLength(0); // p2 ne voit pas
  });
});

// ---------------------------------------------------------------------------
// L4.1 · Scénario e2e seedé complet
// ---------------------------------------------------------------------------

describe('L4.1 · Scénario e2e seedé (village → attaque → hutte → destruction → rasement → défaite)', () => {
  /** État de campagne : 3 villages, 1 hutte, 2 villes p1 dont la capitale.
   *  POLISSAGE-1 C3 : la menace vient de la DOTATION initiale (T-50) puis des
   *  réengendrements (T-18 = 10) ; les compteurs de v2/v3 sont décalés pour
   *  que les rasements de c2 puis c1 s'enchaînent de façon déterministe. */
  function campagne(): GameState {
    return makeState({
      width: 20,
      height: 12,
      rngSeed: 2026,
      villages: [
        { q: 5, r: 5 }, // v2 (tri (q,r)) : scène de combat (bait u1 + geant u2)
        { q: 0, r: 7, spawnCountdown: 8 }, // v1 : menace la capitale c1 (distance 2) — réengendrement tour 8
        { q: 12, r: 6, spawnCountdown: 1 }, // v3 : menace la ville c2 (distance ≤ 2) — réengendrement tour 1
      ],
      huts: [{ q: 7, r: 4 }],
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 9, capital: true },
        { id: 'c2', owner: 'p1', q: 13, r: 4, capital: false },
      ],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 6 }, // appât adjacent à v2
        { id: 'u2', type: 'geant', owner: 'p1', q: 9, r: 5 }, // marche vers v2 et la détruit
        { id: 'u3', type: 'colon', owner: 'p1', q: 9, r: 4 }, // ouvre la hutte
      ],
    });
  }

  const V1: Hex = { q: 5, r: 5 };
  const HUT_E2E: Hex = { q: 7, r: 4 };

  /** Ordres p1 du tour : u3 ouvre la hutte (dès le tour 1), u2 marche vers le
   *  village de combat puis y entre (entrer = attaquer, R-96). */
  function ordersFor(s: GameState): Record<string, Order[]> {
    const p1: Order[] = [];
    if (s.units['u3'] && s.huts.some((h) => h.q === HUT_E2E.q && h.r === HUT_E2E.r)) {
      p1.push({ type: 'Move', unitId: 'u3', path: pathBetween(s.units['u3']!, HUT_E2E) });
    }
    const u2 = s.units['u2'];
    if (u2 && s.villages.some((v) => v.q === 5 && v.r === 5)) {
      p1.push({ type: 'Move', unitId: 'u2', path: pathBetween(u2, V1) }); // entrer = attaquer (R-96)
    }
    return { p1 };
  }

  it('la chaîne complète : dotation T-50, attaque barbare, hutte, destruction +or, villes rasées, défaite', () => {
    let state = campagne();
    const events: GameEvent[] = [];
    const step = (want?: (r: TurnResult) => boolean): void => {
      const orders = ordersFor(state);
      if (want) {
        const { result } = findSeed(() => structuredClone(state), orders, want);
        state = result.newState;
        events.push(...result.events);
      } else {
        const r = resolveTurn(state, orders, 1);
        state = r.newState;
        events.push(...r.events);
      }
    };

    // 1. Dotation initiale (T-50) : 1 barbare dans CHAQUE camp dès le début.
    expect(barbarians(state)).toHaveLength(3);
    expect(state.turn).toBe(0);
    // La fixture re-trie les villages par (q, r) : résoudre l'id par position.
    const villageId = state.villages.find((v) => v.q === 5 && v.r === 5)!.id;
    const barbOfV1 = state.villages.find((v) => v.id === villageId)!.spawnedUnits[0]!;

    // 2. Tour 1 : u3 ouvre la hutte (récompense quelconque) ; le barbare de
    //    v2, au contact de l'appât, engage.
    step((r) => r.events.some((e) => e.type === 'HutOpened'));
    expect(events.some((e) => e.type === 'HutOpened')).toBe(true);

    // 3. u2 détruit v2 : or T-20 au vainqueur, disparition définitive, vétéran.
    //    Marche d'approche d'abord (u2 est à distance 4 du village).
    let guard = 0;
    while (
      state.villages.some((v) => v.id === villageId) &&
      state.units['u2'] &&
      hexDistance(state.units['u2']!, V1) > 1 &&
      guard++ < 12
    ) {
      step();
    }
    const goldBefore = state.players['p1']!.treasury;
    guard = 0;
    while (state.villages.some((v) => v.id === villageId) && guard++ < 20) {
      const hpBefore = state.villages.find((v) => v.id === villageId)!.hp;
      const b1Alive = !!state.units[barbOfV1];
      step((r) => {
        const v = r.newState.villages.find((x) => x.id === villageId);
        if (!v) return true; // détruite ce tour
        if (v.hp < hpBefore) return true; // le village a encaissé
        return b1Alive && !r.newState.units[barbOfV1]; // son défenseur est tombé
      });
    }
    expect(state.villages.some((v) => v.id === villageId)).toBe(false);
    expect(state.players['p1']!.treasury).toBeGreaterThanOrEqual(goldBefore + BARBARIANS.villageDestructionGold);
    expect(events.some((e) => e.type === 'VillageDestroyed' && e.villageId === villageId)).toBe(true);
    expect(events.some((e) => e.type === 'BootyGold' && e.amount === BARBARIANS.villageDestructionGold)).toBe(true);
    expect(state.units['u2']!.veteran).toBe(true);

    // 4. Les barbares rasent c2 (sans défenseur) — aucun changement de
    //    propriétaire. Le rasement est déterministe : boucle à graine fixe
    //    jusqu'à disparition (les barbares convergent puis entrent).
    guard = 0;
    while (state.cities['c2'] && guard++ < 15) step();
    expect(state.cities['c2']).toBeUndefined();
    expect(events.some((e) => e.type === 'CityRazed' && e.cityId === 'c2')).toBe(true);

    // 5. La capitale c1 rasée à son tour : défaite de p1, victoire de p2.
    guard = 0;
    while (!state.winner && guard++ < 15) step();
    expect(state.cities['c1']).toBeUndefined();
    expect(state.winner).toBe('p2'); // l’adversaire réel gagne — les barbares ne gagnent jamais
    expect(events.some((e) => e.type === 'Victory' && e.reason === 'razedCapital' && e.winner === 'p2')).toBe(true);

    // Invariants de fin de partie : R-30 respecté, tout le monde sur la carte.
    const seen = new Set<string>();
    for (const u of Object.values(state.units)) {
      expect(state.map[`${u.q},${u.r}`]).toBeDefined();
      expect(seen.has(`${u.q},${u.r}`)).toBe(false);
      seen.add(`${u.q},${u.r}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Cartes : placements R-96/R-98 (L0/L3 — données commises)
// ---------------------------------------------------------------------------

describe('R-96/R-98 · Placements villages/huttes dans les cartes', () => {
  const IDS = ['pedagogique-40', 'pangee-40', 'variee-40'] as const;
  const PASSABLE = new Set(['prairie', 'plaine', 'foret', 'colline', 'desert']);

  /** Miroir ponctuel (39−col, 39−rangée) — même convention que les ressources variee. */
  function mirror(q: number, r: number): Hex {
    const col = q + Math.floor(r / 2);
    const col2 = 39 - col;
    const row2 = 39 - r;
    return { q: col2 - Math.floor(row2 / 2), r: row2 };
  }

  it('chaque carte 40×40 porte exactement 3 villages et 2 huttes, praticables, hors capitales, sans chevauchement', () => {
    for (const id of IDS) {
      const map = loadBuiltinMapSync(id);
      expect(map.villages, id).toHaveLength(3);
      expect(map.huts, id).toHaveLength(2);
      const capitalKeys = new Set(map.spawns.map((p) => tileKeyOf(p.capital)));
      const seen = new Set<string>();
      for (const e of [...map.villages, ...map.huts]) {
        const key = tileKeyOf(e);
        const terrain = map.terrain[key];
        expect(PASSABLE.has(terrain!), `${id} ${key} : ${terrain}`).toBe(true);
        expect(capitalKeys.has(key), `${id} ${key} : capitale`).toBe(false);
        expect(seen.has(key), `${id} ${key} : chevauchement`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('équité : pangee/variee sont symétriques (miroir ou central équidistant) ; pédagogique équilibrée à ±2', () => {
    for (const id of IDS) {
      const map = loadBuiltinMapSync(id);
      const [cap1, cap2] = map.spawns.map((p) => p.capital);
      for (const e of [...map.villages, ...map.huts]) {
        const d1 = hexDistance(e, cap1!);
        const d2 = hexDistance(e, cap2!);
        if (id === 'pedagogique-40') {
          expect(Math.abs(d1 - d2), `${id} ${tileKeyOf(e)}`).toBeLessThanOrEqual(2);
        } else {
          const m = mirror(e.q, e.r);
          const twin = [...map.villages, ...map.huts].some((o) => o.q === m.q && o.r === m.r);
          expect(twin || d1 === d2, `${id} ${tileKeyOf(e)} : miroir (${m.q},${m.r}) ou équidistant`).toBe(true);
        }
      }
    }
  });

  it('createInitialState porte villages/huttes dans l’état (ids triés par (q,r), compteurs à zéro)', () => {
    const map = loadBuiltinMapSync('variee-40');
    const state = createInitialState(map, 99);
    expect(state.villages).toHaveLength(3);
    expect(state.huts).toHaveLength(2);
    expect(state.villages.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect(state.huts.map((h) => h.id)).toEqual(['h1', 'h2']);
    for (const v of state.villages) {
      expect(v).toMatchObject({ hp: BARBARIANS.villageHP, spawnCountdown: BARBARIANS.spawnInterval });
      // POLISSAGE-1 C3 · T-50 : la dotation initiale est posée par la carte.
      expect(v.spawnedUnits).toHaveLength(1);
      expect(state.units[v.spawnedUnits[0]!]).toMatchObject({ owner: BARBARIAN_ID });
    }
    expect(state.mapId).toBe('variee-40');
  });

  it('parseMap rejette : village sur l’eau, sur une capitale, chevauchement village/hutte, hors carte', () => {
    const base = structuredClone(loadBuiltinMapSync('pangee-40').data); // l’eau est en bordure
    const waterChar = Object.entries(base.legend).find(([, t]) => t === 'eau')![0]!;
    const rowIdx = base.rows.findIndex((row) => row.includes(waterChar));
    expect(rowIdx).toBeGreaterThanOrEqual(0);
    const colIdx = base.rows[rowIdx]!.indexOf(waterChar);
    const qWater = colIdx - Math.floor(rowIdx / 2);
    const onWater = { ...structuredClone(base), villages: [{ q: qWater, r: rowIdx }] };
    expect(() => parseMap(onWater)).toThrow(/infranchissable/);

    const pedagogique = structuredClone(loadBuiltinMapSync('pedagogique-40').data);
    const onCapital = { ...pedagogique, villages: [{ ...pedagogique.players[0]!.capital }] };
    expect(() => parseMap(onCapital)).toThrow(/capitale/);

    const overlap = { ...pedagogique, villages: [{ q: 10, r: 18 }], huts: [{ q: 10, r: 18 }] };
    expect(() => parseMap(overlap)).toThrow(/plus d'un/);

    const outside = { ...pedagogique, villages: [{ q: 999, r: 0 }] };
    expect(() => parseMap(outside)).toThrow(/hors carte/);
  });

  it('R-98 : voisins d’une case — utilitaire de placement des spawns (adjacents praticables libres)', () => {
    const state = makeState({ width: 8, height: 8, villages: [{ q: 4, r: 4 }] });
    const tiles = neighbors({ q: 4, r: 4 }).filter((h) => {
      const t = state.map[tileKeyOf(h)];
      return t && t.terrain === 'prairie';
    });
    expect(tiles.length).toBe(6); // prairie partout : 6 voisins praticables
  });

  it('R-95 : createBarbarianUnit pose une unité au propriétaire barbare, PV pleins (usage moteur/tests)', () => {
    const state = makeState({ width: 8, height: 8 });
    const unit = createBarbarianUnit(state, { q: 2, r: 2 }, 'guerrier');
    expect(unit).toMatchObject({ owner: BARBARIAN_ID, type: 'guerrier', hp: 3, veteran: false, fortified: false });
    expect(state.units[unit.id]).toBe(unit);
  });
});
