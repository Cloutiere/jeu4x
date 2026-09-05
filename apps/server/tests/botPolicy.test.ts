/**
 * Chantier BOT-SOLO · L0 — tests de la politique du bot portée en TS
 * (`src/botPolicy.ts`, miroir de `src/bot.mjs`). Chaque test cite le
 * comportement porté (seuils bot.mjs) et la règle R-xx applicable.
 * La politique est PURE et DÉTERMINISTE (RNG seedé dédié, R-80) : pas de
 * Math.random, pas de Date.now — même entrée → même plan.
 */
import { describe, expect, it } from 'vitest';
import { canSetProduction, createRng, makeState, rushBuyCostOf, TECHS } from '@game/rules';
import type { GameState, Order } from '@game/rules';
import { botPolicy, botTurnSeed } from '../src/botPolicy.js';
import { orderShapeError } from '../src/game.js';

const BOT = 'p2';
const HUMAN = 'p1';

/** État de base : prairie, le bot avec des unités et une ville. */
function baseState(opts: {
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; aboard?: string | null; cargo?: string | null; fortified?: boolean }>;
  cities?: Array<{ id: string; owner: string; q: number; r: number; pop?: number; production?: GameState['cities'][string]['production']; buildings?: string[]; wonders?: string[] }>;
  treasury?: number;
  researching?: string | null;
  freshTechs?: string[];
}): GameState {
  return makeState({
    width: 8,
    height: 8,
    players: [HUMAN, BOT],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: u.aboard ?? null, cargo: u.cargo ?? null })),
    cities: opts.cities ?? [],
    rngSeed: 42,
  }) as GameState;
}

function withPlayer(state: GameState, patch: Partial<GameState['players'][string]>): GameState {
  return { ...state, players: { ...state.players, [BOT]: { ...state.players[BOT]!, ...patch } } };
}

function planOf(state: GameState, seed = 7) {
  return botPolicy(state, BOT, createRng(seed));
}

describe('botPolicy · détermination & validation (L0)', () => {
  it('R-80 : même état + même graine → plan identique (ordres et actions)', () => {
    const state = baseState({
      units: [
        { id: 'u1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'u2', type: 'guerrier', owner: BOT, q: 3, r: 2 },
        { id: 'u3', type: 'guerrier', owner: HUMAN, q: 5, r: 5 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }],
    });
    const a = planOf(state, 99);
    const b = planOf(state, 99);
    expect(a).toEqual(b);
  });

  it('botTurnSeed : dérivation déterministe du seed de partie, sensible au tour', () => {
    expect(botTurnSeed(1234, 3)).toBe(botTurnSeed(1234, 3));
    expect(botTurnSeed(1234, 3)).not.toBe(botTurnSeed(1234, 4));
    expect(botTurnSeed(1234, 3)).not.toBe(botTurnSeed(5678, 3));
  });

  it('chaque ordre généré passe le validateur orderShapeError du serveur (L1, validateur inchangé)', () => {
    const state = baseState({
      units: [
        { id: 'u1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'u2', type: 'galere', owner: BOT, q: 1, r: 0 },
      ],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 3 }],
    });
    const { orders } = planOf(state);
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) expect(orderShapeError(o)).toBeNull();
  });

  it('les ordres ne référencent que les unités et villes DU BOT (jamais celles de l\'humain)', () => {
    const state = baseState({
      units: [
        { id: 'u1', type: 'guerrier', owner: BOT, q: 2, r: 2 },
        { id: 'u9', type: 'guerrier', owner: HUMAN, q: 5, r: 5 },
      ],
      cities: [
        { id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 },
        { id: 'c9', owner: HUMAN, q: 5, r: 6, pop: 2 },
      ],
    });
    const { orders } = planOf(state);
    const unitIds = new Set(Object.keys(state.units));
    for (const o of orders) {
      if ('unitId' in o) expect(unitIds.has(o.unitId) && state.units[o.unitId]!.owner).toBe(BOT);
      if ('cityId' in o) expect(state.cities[o.cityId]!.owner).toBe(BOT);
    }
  });
});

describe('botPolicy · recherche & régimes (actions immédiates, portage bot.mjs)', () => {
  it('R-85 : sans tech en cours, le bot choisit une tech disponible (prérequis satisfaits)', () => {
    const state = withPlayer(baseState({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3 }] }), { researching: null, techsUnlocked: [] });
    const { actions } = planOf(state);
    const research = actions.find((a) => a.type === 'SetResearch');
    expect(research).toBeDefined();
    if (research?.type !== 'SetResearch') return;
    const tech = TECHS[research.techId]!;
    expect(tech).toBeDefined();
    // Le bot n'a aucune tech débloquée : seules les racines (prérequis vides) sont accessibles.
    expect(tech.prereqs).toHaveLength(0);
  });

  it('R-85 : avec une tech déjà en cours, aucune action SetResearch', () => {
    const state = withPlayer(baseState({ researching: 'poterie' }), { researching: 'poterie' });
    const { actions } = planOf(state);
    expect(actions.some((a) => a.type === 'SetResearch')).toBe(false);
  });

  it('R-122 : le bot adopte la République quand la tech est complétée CE tour (sans Anarchie)', () => {
    const state = withPlayer(baseState({ freshTechs: ['code_des_lois'] }), {
      government: 'despotisme',
      techsUnlocked: ['code_des_lois'],
      techsUnlockedThisTurn: ['code_des_lois'],
    });
    const { actions } = planOf(state);
    expect(actions).toContainEqual({ type: 'SetGovernment', government: 'republique' });
  });

  it('R-122 : sans tech fraîchement complétée, le bot n\'adopte rien (il évite l\'Anarchie)', () => {
    const state = withPlayer(baseState({}), { government: 'despotisme', techsUnlockedThisTurn: [] });
    const { actions } = planOf(state);
    expect(actions.some((a) => a.type === 'SetGovernment')).toBe(false);
  });
});

describe('botPolicy · production & rush (portage bot.mjs)', () => {
  it('R-87 : une ville sans file reçoit un SetProduction VALIDE (canSetProduction)', () => {
    const state = baseState({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 2 }] });
    const { orders } = planOf(state);
    const prod = orders.find((o) => o.type === 'SetProduction');
    expect(prod).toBeDefined();
    if (prod?.type !== 'SetProduction') return;
    expect(prod.cityId).toBe('c1');
    expect(canSetProduction(prod.item, state.players[BOT]!.techsUnlocked, state.cities['c1']!.buildings, state.players[BOT]!.civId)).toBe(true);
  });

  it('R-87 : une ville avec une file en cours n\'est pas réassignée', () => {
    const state = baseState({
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'unit' as const, id: 'guerrier' }, progress: 0 } }],
    });
    const { orders } = planOf(state);
    expect(orders.some((o) => o.type === 'SetProduction')).toBe(false);
  });

  it('R-112/R-117 (filtrage R-87) : le Colon n\'est jamais proposé à une ville pop 1 non côtière sans les prérequis', () => {
    // Ville pop 1, aucune tech : les options unités se limitent aux sans-tech
    // sans coût de population couvrable — le Colon (pop 2 exigée) est exclu,
    // les unités navales (ville non côtière) aussi.
    const state = baseState({ cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, pop: 1 }] });
    for (let seed = 0; seed < 40; seed++) {
      const { orders } = planOf(state, seed);
      const prod = orders.find((o): o is Extract<Order, { type: 'SetProduction' }> => o.type === 'SetProduction');
      if (!prod) continue;
      if (prod.item.kind === 'unit') {
        expect(prod.item.id).not.toBe('colon');
        expect(prod.item.id).not.toBe('galere');
      }
    }
  });

  it('R-135 : trésorerie large → rush-buy de la production courante ; trésorerie nulle → jamais', () => {
    const city = { id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'unit' as const, id: 'guerrier' }, progress: 0 } };
    const rich = withPlayer(baseState({ cities: [city] }), { treasury: 1_000_000 });
    expect(planOf(rich).orders.some((o) => o.type === 'RushBuy' && o.cityId === 'c1')).toBe(true);
    // Marge de sécurité bot.mjs : 1,3 × coût — on teste aussi avec zéro.
    const poor = withPlayer(baseState({ cities: [city] }), { treasury: 0 });
    expect(planOf(poor).orders.some((o) => o.type === 'RushBuy')).toBe(false);
    // Le coût moteur (réductions 7n comprises) est bien couvert par la marge.
    const cost = rushBuyCostOf(rich, rich.cities['c1']!)!;
    expect(rich.players[BOT]!.treasury).toBeGreaterThanOrEqual(cost * 1.3);
  });

  it('R-135 : ONU (item interdit) n\'est jamais rush-buyée', () => {
    const state = withPlayer(
      baseState({
        cities: [{ id: 'c1', owner: BOT, q: 2, r: 3, production: { item: { kind: 'wonder', id: 'nations_unies' }, progress: 0 } }],
      }),
      { treasury: 1_000_000, cultureMilestones: 20 },
    );
    expect(planOf(state).orders.some((o) => o.type === 'RushBuy')).toBe(false);
  });
});

describe('botPolicy · GP, espion, naval (portage bot.mjs 7g/7j)', () => {
  it('R-126 : un GP adjacent à une ville amie est SETTLE (jamais Consume) et son ordre remplace l\'aléatoire', () => {
    const state = baseState({
      units: [{ id: 'gp1', type: 'artiste_penseur', owner: BOT, q: 2, r: 2 }],
      cities: [{ id: 'c1', owner: BOT, q: 2, r: 3 }],
    });
    const { orders } = planOf(state);
    const gpOrders = orders.filter((o) => 'unitId' in o && o.unitId === 'gp1');
    expect(gpOrders).toHaveLength(1); // sémantique same-subject : un seul ordre par unité
    expect(gpOrders[0]).toMatchObject({ type: 'GreatPersonAction', action: 'settle', cityId: 'c1' });
  });

  it('R-126 : un GP loin de toute ville amie n\'est ni consommé ni installé', () => {
    const state = baseState({
      units: [{ id: 'gp1', type: 'artiste_penseur', owner: BOT, q: 6, r: 6 }],
      cities: [{ id: 'c1', owner: BOT, q: 1, r: 1 }],
    });
    const { orders } = planOf(state);
    expect(orders.some((o) => o.type === 'GreatPersonAction')).toBe(false);
  });

  it('R-119 : l\'espion adjacent à une ville ennemie à GP installé mène sa mission', () => {
    const state = baseState({
      units: [{ id: 'sp1', type: 'espion', owner: BOT, q: 2, r: 2 }],
      cities: [{ id: 'c9', owner: HUMAN, q: 2, r: 3 }],
    });
    const withMilestones = { ...state, players: { ...state.players, [HUMAN]: { ...state.players[HUMAN]!, cultureMilestones: 2 } } };
    const { orders } = planOf(withMilestones);
    expect(orders).toContainEqual({ type: 'SpyMission', unitId: 'sp1', cityId: 'c9', mission: 'stealGreatPerson' });
  });

  it('R-119 : rien à voler (aucun jalon « GP installé ») → pas de mission', () => {
    const state = baseState({
      units: [{ id: 'sp1', type: 'espion', owner: BOT, q: 2, r: 2 }],
      cities: [{ id: 'c9', owner: HUMAN, q: 2, r: 3 }],
    });
    const { orders } = planOf(state);
    expect(orders.some((o) => o.type === 'SpyMission')).toBe(false);
  });

  it('R-117 : une galère ne reçoit que des pas sur l\'EAU (ou Hold) — jamais de case terrestre', () => {
    const water = baseState({});
    // g0 : ligne d'eau (r=0) ; le bot a une galère au milieu.
    const state: GameState = {
      ...water,
      map: Object.fromEntries(
        Object.entries(water.map).map(([key, tile]) => [
          key,
          key.endsWith(',0') || key.endsWith(',1') ? { ...tile, terrain: 'mer' as const } : tile,
        ]),
      ) as GameState['map'],
      units: {
        g0: { id: 'g0', type: 'galere', owner: BOT, q: 2, r: 0, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null },
      },
    } as unknown as GameState;
    for (let seed = 0; seed < 40; seed++) {
      const { orders } = planOf(state, seed);
      const move = orders.find((o): o is Extract<Order, { type: 'Move' }> => o.type === 'Move' && o.unitId === 'g0');
      if (!move) continue; // Hold : pas de contrainte
      expect(move.path).toHaveLength(1);
      const tile = state.map[`${move.path[0]!.q},${move.path[0]!.r}`]!;
      expect(TERRAIN_IS_WATER(tile.terrain as string)).toBe(true);
    }
  });

  it('R-117 : une unité embarquée débarque vers une case terrestre libre (ou tient)', () => {
    const state = baseState({
      units: [
        { id: 'gal', type: 'galere', owner: BOT, q: 2, r: 0, cargo: 'col1' },
        { id: 'col1', type: 'colon', owner: BOT, q: 2, r: 0, aboard: 'gal' },
      ],
    });
    for (let seed = 0; seed < 40; seed++) {
      const { orders } = planOf(state, seed);
      const o = orders.find((x): x is Extract<Order, { type: 'Move' | 'Hold' }> => 'unitId' in x && x.unitId === 'col1');
      expect(o).toBeDefined();
      if (o?.type === 'Move') {
        const tile = state.map[`${o.path[0]!.q},${o.path[0]!.r}`]!;
        expect(TERRAIN_IS_WATER(tile.terrain as string)).toBe(false);
      }
    }
  });
});

function TERRAIN_IS_WATER(id: string): boolean {
  return id === 'mer' || id === 'ocean';
}
