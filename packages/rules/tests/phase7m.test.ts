/**
 * Tests Phase 7m — Nucléaire (RULES.md §8.11, R-138..R-141) et Bloc 0
 * (décisions d'Erik du 05/09 : C13 résolution unifiée, C14 frappe ≠ domination).
 *
 * Chaque test cite la règle R-xx, la décision C-xx ou la section du rapport
 * [`Nuclear and spy Game Mechanics Research.md`](../../Nuclear%20and%20spy%20Game%20Mechanics%20Research.md).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order } from '../src/state.js';
import { MIGRATIONS, migrateState } from '../src/state.js';
import { WONDERS } from '../src/techs.js';
import { isProducible } from '../src/techs.js';
import { unitType } from '../src/data.js';
import { stolenGoldAmount, spyDuelWinChance, nukeCulturePenalty } from '../src/espionnage.js';
import { ESPIONNAGE_DATA } from '../src/data.js';
import { tileYield } from '../src/economy.js';

/** p1 : ICBM en (2,0) — cible (0,0) à distance 2, donc VISIBLE (vision 2) ;
 *  p2 : ville cible en (0,0) avec garnison. */
function nukeState(opts: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({
    width: 10,
    height: 8,
    cities: [
      { id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: false },
    ],
    units: [
      { id: 'nuke', type: 'icbm', owner: 'p1', q: 2, r: 0 },
      { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
    ],
    ...opts,
  });
}

function launch(target: { q: number; r: number }): Record<string, Order[]> {
  return { p1: [{ type: 'Launch', unitId: 'nuke', target }] };
}

// ---------------------------------------------------------------------------
// Données — audit R-138/R-142
// ---------------------------------------------------------------------------

describe('7m · Données auditées (R-138/R-142)', () => {
  it('ICBM 0/0/40, PV 1, strategic (jamais dans les files) — canon §1.2', () => {
    const icbm = unitType('icbm');
    expect(icbm.attack).toBe(0);
    expect(icbm.defense).toBe(0);
    expect(icbm.movement).toBe(40); // audit : 4 → 40 (portée globale pratique)
    expect(icbm.strategic).toBe(true);
    // R-138 : ni produite ni achetable.
    expect(isProducible({ tech: null, implemented: true, strategic: true }, [], [])).toBe(false);
  });

  it('Espion 0/0/2, 25 marteaux, Écriture — canon §3.1 (défense corrigée 1 → 0)', () => {
    const spy = unitType('espion');
    expect(spy.attack).toBe(0);
    expect(spy.defense).toBe(0);
    expect(spy.movement).toBe(2);
    expect(spy.cost).toBe(25);
    expect(spy.tech).toBe('ecriture');
    expect(spy.spy).toBe(true);
  });

  it('Manhattan 750 marteaux / Théorie atomique, activé, grantsUnit icbm — canon §1.1', () => {
    const w = WONDERS['projet_manhattan']!;
    expect(w.cost).toBe(750);
    expect(w.tech).toBe('theorie_atomique');
    expect(w.implemented).toBe(true);
    expect(w.grantsUnit).toBe('icbm');
  });

  it('espionnage.json 🔶 : T-33/T-34/T-35 (pénalité, matrice de duel, part de vol)', () => {
    expect(ESPIONNAGE_DATA.nukeCulturePenalty).toBe(1);
    expect(ESPIONNAGE_DATA.stealGoldPct).toBe(0.5);
    expect(nukeCulturePenalty()).toBe(1);
    expect(stolenGoldAmount(200)).toBe(100);
    expect(stolenGoldAmount(3)).toBe(2); // arrondi au plus proche, plafonné
    expect(stolenGoldAmount(0)).toBe(0);
    // Matrice R-144 🔶 (cellule isolé vs réseau : complétion symétrique).
    expect(spyDuelWinChance(false, false)).toBe(0.5);
    expect(spyDuelWinChance(true, false)).toBe(0.9);
    expect(spyDuelWinChance(true, true)).toBe(0.5);
    expect(spyDuelWinChance(false, true)).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// Manhattan → ICBM (R-138)
// ---------------------------------------------------------------------------

describe('7m · R-138 — Projet Manhattan & instanciation de l\'ICBM', () => {
  it('la complétion de Manhattan instancie l\'ICBM dans la ville constructrice', () => {
    const state = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, production: { item: { kind: 'wonder', id: 'projet_manhattan' }, progress: 750 } },
      ],
    });
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.wonders).toContain('projet_manhattan');
    const icbms = Object.values(out.units).filter((u) => u.type === 'icbm' && u.owner === 'p1');
    expect(icbms).toHaveLength(1);
    expect(icbms[0]!.q).toBe(0);
    expect(icbms[0]!.r).toBe(0);
    // Événement UnitProduced (canal réutilisé — documenté).
  });

  it('un SetProduction d\'ICBM est refusé (arme stratégique — jamais dans les files)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2 }],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'icbm' } }],
    };
    const out = resolveTurn(state, orders, 1).newState;
    expect(out.cities['c1']!.production).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Launch + C15/C16/C17 (Bloc 0 7n — décisions d'Erik du 06/09)
// ---------------------------------------------------------------------------

describe('7n · Bloc 0 · C15 — distinction canon rétablie : ville ordinaire RASÉE', () => {
  it('C15 : une ville ORDINAIRE visée est RASÉE — effacée, cratère stérile, merveilles détruites', () => {
    const state = nukeState({
      cities: [
        {
          id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: false,
          buildings: ['temple', 'marche'],
          wonders: ['stonehenge'],
          settledGreatPersons: ['savant'],
        },
      ],
    });
    state.map['0,0'] = { terrain: 'ville', resource: null };
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    // La ville est EFFACÉE de la carte (bâtiments et merveilles avec elle).
    expect(newState.cities['cible']).toBeUndefined();
    expect(events.some((e) => e.type === 'CityRazed' && e.cityId === 'cible' && e.byPlayer === 'p1')).toBe(true);
    expect(events.some((e) => e.type === 'CityNuked')).toBe(false); // rien ne survit
    expect(newState.winner).toBeNull();
    // Cratère : la case devient stérile (terrain 'cratere', ressource effacée) — défaut 🔶 permanent.
    const tile = newState.map['0,0']!;
    expect(tile.terrain).toBe('cratere');
    expect(tile.resource).toBeNull();
    // Merveille détruite = jalon perdu (miroir rasement barbare — R-115).
    expect(newState.players['p2']!.cultureMilestones).toBe(-1);
    expect(events.some((e) => e.type === 'CultureMilestone' && e.reason === 'wonderLost')).toBe(true);
  });

  it('C15 : le cratère est NON FONDABLE et STÉRILE (aucun rendement, permanent 🔶)', () => {
    const state = nukeState({ turn: 10 });
    const after = resolveTurn(state, launch({ q: 0, r: 0 }), 1).newState;
    // Un colon qui tente de fonder SUR le cratère est refusé.
    const colonState = structuredClone(after);
    colonState.map['4,0'] = { terrain: 'cratere', resource: null };
    colonState.units['settler'] = {
      id: 'settler', type: 'colon', owner: 'p1', q: 4, r: 0, hp: 3, mp: 2,
      veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null,
    };
    const out = resolveTurn(colonState, { p1: [{ type: 'FoundCity', unitId: 'settler' }] }, 2).newState;
    expect(Object.values(out.cities).some((c) => c.q === 4 && c.r === 0)).toBe(false);
    expect(out.units['settler']).toBeDefined(); // le colon survit (fondation refusée)
    // Stérile : aucun rendement (tileYield → 0/0/0).
    const y = tileYield(out.map, [], '4,0');
    expect(y).toEqual({ food: 0, production: 0, commerce: 0 });
  });

  it('C15 : la CAPITALE conserve la règle C13 — survit, pop 2, merveilles préservées', () => {
    const state = nukeState({
      cities: [
        {
          id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: true,
          buildings: ['temple', 'marche'],
          wonders: ['stonehenge'],
          settledGreatPersons: ['savant'],
        },
      ],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    const city = newState.cities['cible']!;
    expect(city.owner).toBe('p2'); // C14 : pas de capture
    expect(city.pop).toBe(2); // C13.1 : réduite à 2 (jamais 1)
    expect(city.wonders).toEqual(['stonehenge']); // C13.3 : merveilles préservées
    expect(city.settledGreatPersons).toEqual(['savant']); // C13.5 : GP installés préservés
    expect(newState.winner).toBeNull();
    expect(events.some((e) => e.type === 'NukeLaunched' && e.outcome === 'detonated')).toBe(true);
    expect(events.some((e) => e.type === 'CityNuked')).toBe(true);
    expect(events.some((e) => e.type === 'CityRazed')).toBe(false);
    expect(newState.map['0,0']!.terrain).toBe(state.map['0,0']!.terrain); // pas de cratère sur la capitale
  });

  it('C15 🔶 : capitale à pop ≤ 2 ne grossit pas d\'une frappe (min(pop, 2))', () => {
    const state = nukeState({ cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 1, capital: true }] });
    const out = resolveTurn(state, launch({ q: 0, r: 0 }), 1).newState;
    expect(out.cities['cible']!.pop).toBe(1);
  });

  it('C16 : moitié des bâtiments ARRONDI VERS LE HAUT ⌈n/2⌉ — 4 non-Palais → 2, 5 → 3 (Palais exclu, seedée R-80)', () => {
    const base = (buildings: string[]) =>
      nukeState({
        cities: [
          {
            id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: true,
            buildings, wonders: ['stonehenge'],
          },
        ],
      });
    const launchAt = launch({ q: 0, r: 0 });
    // ⌈4/2⌉ = 2 détruits parmi les non-Palais ; le Palais survit.
    const four = resolveTurn(base(['palais', 'temple', 'bibliotheque', 'marche', 'atelier']), structuredClone(launchAt), 7).newState.cities['cible']!;
    const candidates4 = ['temple', 'bibliotheque', 'marche', 'atelier'];
    expect(candidates4.filter((x) => !four.buildings.includes(x))).toHaveLength(2);
    expect(four.buildings).toContain('palais');
    // ⌈5/2⌉ = 3 détruits (C16 : 5 bâtiments → 3 détruits).
    const five = resolveTurn(base(['palais', 'temple', 'bibliotheque', 'marche', 'atelier', 'caserne']), structuredClone(launchAt), 7).newState.cities['cible']!;
    const candidates5 = ['temple', 'bibliotheque', 'marche', 'atelier', 'caserne'];
    expect(candidates5.filter((x) => !five.buildings.includes(x))).toHaveLength(3);
    expect(five.buildings).toContain('palais');
    // Rejouabilité bit à bit (même graine → même sélection — R-80).
    const run = (seed: number) => resolveTurn(structuredClone(base(['palais', 'temple', 'bibliotheque', 'marche', 'atelier', 'caserne'])), structuredClone(launchAt), seed).newState.cities['cible']!;
    expect(run(7).buildings).toEqual(run(7).buildings);
    // C13.3 : merveilles préservées.
    expect(five.wonders).toEqual(['stonehenge']);
  });

  it('C13.4 : TOUTES les unités du rayon 1 (7 cases, les deux camps) sont détruites — aucun survivant', () => {
    const state = nukeState({
      units: [
        { id: 'nuke', type: 'icbm', owner: 'p1', q: 2, r: 0 },
        { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 }, // case de ville
        { id: 'adj', type: 'archer', owner: 'p2', q: 1, r: 0 }, // adjacente
        { id: 'ami', type: 'guerrier', owner: 'p1', q: 0, r: 1 }, // adjacente AMIE
        { id: 'loin', type: 'guerrier', owner: 'p2', q: 3, r: 2 }, // distance 2 de la cible
      ],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    expect(newState.units['gar']).toBeUndefined();
    expect(newState.units['adj']).toBeUndefined();
    expect(newState.units['ami']).toBeUndefined(); // amies détruites aussi
    expect(newState.units['loin']).toBeDefined(); // hors rayon
    expect(newState.units['nuke']).toBeUndefined(); // missile consommé
    const nukeKills = events.filter((e) => e.type === 'UnitDestroyed' && e.cause === 'nuke');
    expect(nukeKills).toHaveLength(3);
  });

  it('C13.6 🔶 : les GP « en attente de choix » du rayon sont détruits', () => {
    const state = nukeState({
      units: [
        { id: 'nuke', type: 'icbm', owner: 'p1', q: 2, r: 0 },
        { id: 'gp', type: 'savant', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    expect(newState.units['gp']).toBeUndefined();
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'gp' && e.cause === 'nuke')).toBe(true);
  });

  it('C14 : frapper la CAPITALE ne valide pas la domination — la partie continue', () => {
    const state = nukeState({ cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: true }] });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    expect(newState.winner).toBeNull();
    expect(newState.cities['cible']!.owner).toBe('p2');
    expect(events.some((e) => e.type === 'Victory')).toBe(false);
  });

  it('R-139 : cible SANS ville — seules les unités du rayon 1 sont détruites, terrain intact', () => {
    const state = nukeState({
      units: [
        { id: 'nuke', type: 'icbm', owner: 'p1', q: 4, r: 0 },
        { id: 'victime', type: 'guerrier', owner: 'p2', q: 3, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 3, r: 0 }), 1);
    expect(newState.units['victime']).toBeUndefined();
    expect(events.some((e) => e.type === 'CityNuked')).toBe(false);
    expect(newState.cities['cible']!.pop).toBe(5); // la ville adjacente n'est PAS la cible
    expect(newState.cities['cible']!.buildings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Interdictions, pénalité, SDI (R-140/R-141)
// ---------------------------------------------------------------------------

describe('7m · R-140 — interdictions et pénalités', () => {
  it('Démocratie : le tir est REFUSÉ, le missile est conservé (canon §1.2)', () => {
    const state = nukeState();
    state.players['p1']!.government = 'democratie';
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    const refused = events.find((e) => e.type === 'NukeLaunched');
    expect(refused && refused.type === 'NukeLaunched' ? refused.outcome : null).toBe('refused');
    expect(refused && refused.type === 'NukeLaunched' ? refused.reason : null).toBe('democratie');
    expect(newState.units['nuke']).toBeDefined(); // missile non consommé
    expect(newState.cities['cible']!.pop).toBe(5);
  });

  it('cible invisible (fog) : refus, missile conservé (R-139)', () => {
    const state = nukeState({ width: 14 });
    // Aucune unité/ville de p1 autour : la case (12,0) est hors de toute vision.
    const { newState, events } = resolveTurn(state, launch({ q: 12, r: 0 }), 1);
    const refused = events.find((e) => e.type === 'NukeLaunched');
    expect(refused && refused.type === 'NukeLaunched' ? refused.outcome : null).toBe('refused');
    expect(refused && refused.type === 'NukeLaunched' ? refused.reason : null).toBe('cibleInvisible');
    expect(newState.units['nuke']).toBeDefined();
  });

  it('pénalité culturelle 🔶 : −1 jalon par détonation, ANNULÉE sous Despotisme (canon §1.2)', () => {
    const monarchie = nukeState();
    monarchie.players['p1']!.government = 'monarchie';
    monarchie.players['p1']!.cultureMilestones = 5;
    const { newState, events } = resolveTurn(monarchie, launch({ q: 0, r: 0 }), 1);
    expect(newState.players['p1']!.cultureMilestones).toBe(4);
    const milestone = events.find((e) => e.type === 'CultureMilestone' && e.reason === 'nuke');
    expect(milestone && milestone.type === 'CultureMilestone' ? milestone.delta : null).toBe(-1);

    const despotisme = nukeState();
    despotisme.players['p1']!.cultureMilestones = 5; // Despotisme : nuclearWithoutPenalty
    const out = resolveTurn(despotisme, launch({ q: 0, r: 0 }), 1).newState;
    expect(out.players['p1']!.cultureMilestones).toBe(5);

    // Une frappe INTERCEPTÉE n'est pas une détonation : pas de pénalité 🔶.
    const intercepte = nukeState({
      cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, buildings: ['sdi'] }],
    });
    intercepte.players['p1']!.government = 'monarchie';
    intercepte.players['p1']!.cultureMilestones = 5;
    const out2 = resolveTurn(intercepte, launch({ q: 0, r: 0 }), 1).newState;
    expect(out2.players['p1']!.cultureMilestones).toBe(5);
    expect(out2.players['p1']!.nukesLaunched).toBe(0);
  });

  it('statistique R-139 : nukesLaunched comptabilise les détonations (migration 16)', () => {
    const state = nukeState();
    const out = resolveTurn(state, launch({ q: 0, r: 0 }), 1).newState;
    expect(out.players['p1']!.nukesLaunched).toBe(1);
    expect(out.players['p2']!.nukesLaunched).toBe(0);
  });
});

describe('7m · R-141 — Défense SDI', () => {
  it('tir direct sur une ville à SDI : interception GARANTIE, aucun dégât, missile consommé', () => {
    const state = nukeState({
      cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, buildings: ['sdi'] }],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    const launched = events.find((e) => e.type === 'NukeLaunched');
    expect(launched && launched.type === 'NukeLaunched' ? launched.outcome : null).toBe('intercepted');
    expect(launched && launched.type === 'NukeLaunched' ? launched.cityId : null).toBe('cible');
    // Aucune destruction d'UNITÉ (le missile lui-même mis à part — cause mission).
    expect(events.filter((e) => e.type === 'UnitDestroyed' && e.cause !== 'mission')).toHaveLength(0);
    expect(events.some((e) => e.type === 'CityNuked')).toBe(false);
    expect(newState.units['gar']).toBeDefined();
    expect(newState.cities['cible']!.pop).toBe(5);
    expect(newState.units['nuke']).toBeUndefined(); // missile consommé (canon §2.2)
  });

  it('couverture LOCALE : une SDI à A ne protège pas la ville B (canon §2.2)', () => {
    const state = nukeState({
      cities: [
        { id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5 },
        { id: 'autre', owner: 'p2', q: 5, r: 1, pop: 3, buildings: ['sdi'] },
      ],
    });
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    // C15 : la ville ordinaire visée est RASÉE (la SDI distante ne la protège pas).
    expect(events.some((e) => e.type === 'CityRazed' && e.cityId === 'cible')).toBe(true);
    expect(newState.cities['cible']).toBeUndefined();
  });

  it('exploit canon conservé 🔶 : un tir ADJACENT à la ville protégée n\'est pas intercepté (C13.4 rayon)', () => {
    const state = nukeState({
      cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, buildings: ['sdi', 'temple'] }],
    });
    // Cible (1,0), adjacente à la ville : pas d'interception.
    const { newState, events } = resolveTurn(state, launch({ q: 1, r: 0 }), 1);
    const launched = events.find((e) => e.type === 'NukeLaunched');
    expect(launched && launched.type === 'NukeLaunched' ? launched.outcome : null).toBe('detonated');
    expect(events.some((e) => e.type === 'CityNuked')).toBe(false); // la ville n'est PAS la cible
    expect(newState.units['gar']).toBeUndefined(); // C13.4 : la garnison du rayon meurt
    // La ville elle-même est intacte (pop, bâtiments) — elle n'est pas ciblée.
    expect(newState.cities['cible']!.pop).toBe(5);
    expect(newState.cities['cible']!.buildings).toEqual(['sdi', 'temple']);
  });
});

// ---------------------------------------------------------------------------
// C17 (Bloc 0 7n) — la Grande Muraille bloque le missile nucléaire
// ---------------------------------------------------------------------------

describe('7n · Bloc 0 · C17 — la Grande Muraille bloque l\'ICBM (révision R-140)', () => {
  /** p2 : ville cible en (0,0) + une seconde ville hébergeant la Muraille. */
  function wallState(opts: { obsolete?: boolean } = {}): GameState {
    const state = nukeState({
      width: 12,
      cities: [
        { id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: true },
        { id: 'mur', owner: 'p2', q: 9, r: 3, pop: 2, wonders: ['grande_muraille'] },
      ],
    });
    if (opts.obsolete) {
      // R-128 : obsolescence GLOBALE — n'importe quelle civ connaît Ingénierie.
      state.players['p1']!.techsUnlocked = ['ingenierie'];
    }
    return state;
  }

  it('C17 : toute frappe visant une ville du propriétaire est ANNULÉE — missile consommé, aucun dégât', () => {
    const { newState, events } = resolveTurn(wallState(), launch({ q: 0, r: 0 }), 1);
    const launched = events.find((e) => e.type === 'NukeLaunched');
    expect(launched && launched.type === 'NukeLaunched' ? launched.outcome : null).toBe('blocked');
    expect(newState.units['nuke']).toBeUndefined(); // missile consommé (miroir SDI R-141)
    expect(newState.units['gar']).toBeDefined(); // garnison intacte — AUCUN dégât
    expect(newState.cities['cible']!.pop).toBe(5);
    expect(newState.cities['cible']!.buildings).toEqual([]);
    expect(events.some((e) => e.type === 'CityNuked')).toBe(false);
    // Aucune destruction d'UNITÉ (le missile lui-même mis à part — cause mission).
    expect(events.filter((e) => e.type === 'UnitDestroyed' && e.cause !== 'mission')).toHaveLength(0);
    expect(newState.players['p1']!.nukesLaunched).toBe(0); // pas une détonation
    expect(newState.players['p1']!.cultureMilestones).toBe(0); // pas de pénalité 🔶 (pas de détonation)
  });

  it('C17 : portée EMPIRE — la Muraille (dans une autre ville) protège toutes les villes du propriétaire', () => {
    const state = wallState();
    const { newState } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    expect(newState.cities['cible']!.pop).toBe(5); // protégée malgré la distance
  });

  it('C17 : la Muraille OBSOLÈTE (R-128, union des techs — Ingénierie connue) ne bloque plus', () => {
    const { newState, events } = resolveTurn(wallState({ obsolete: true }), launch({ q: 0, r: 0 }), 1);
    const launched = events.find((e) => e.type === 'NukeLaunched');
    expect(launched && launched.type === 'NukeLaunched' ? launched.outcome : null).toBe('detonated');
    // Capitale visée : elle survit (C15) mais subit la résolution C13.
    expect(newState.cities['cible']!.pop).toBe(2);
  });

  it('C17 🔶 : la Muraille NE bloque PAS un tir sur une CASE ADJACENTE (l\'exploit R-141 reste possible)', () => {
    const state = wallState();
    const { newState, events } = resolveTurn(state, launch({ q: 1, r: 0 }), 1);
    const launched = events.find((e) => e.type === 'NukeLaunched');
    expect(launched && launched.type === 'NukeLaunched' ? launched.outcome : null).toBe('detonated');
    expect(newState.units['gar']).toBeUndefined(); // C13.4 : le rayon annihile
    expect(newState.cities['cible']!.pop).toBe(5); // la ville (non ciblée) est intacte
  });

  it('C17 : la Muraille d\'un TIERS ne protège pas (seul le propriétaire est couvert)', () => {
    const state = nukeState({
      cities: [{ id: 'cible', owner: 'p2', q: 0, r: 0, pop: 5, capital: true }],
    });
    // p2 n'a pas la Muraille (aucune autre ville) — détonation normale.
    const { newState, events } = resolveTurn(state, launch({ q: 0, r: 0 }), 1);
    expect(events.some((e) => e.type === 'NukeLaunched' && e.outcome === 'detonated')).toBe(true);
    expect(newState.cities['cible']!.pop).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Migration 15 → 16 (additive, idempotente)
// ---------------------------------------------------------------------------

describe('7m · Migration v15 → v16 (R-139 — nukesLaunched)', () => {
  it('champ additif nukesLaunched: 0 par joueur, idempotent', () => {
    const v15 = {
      schemaVersion: 15,
      turn: 3,
      players: {
        p1: { id: 'p1', treasury: 12, missedTurns: 0 },
        p2: { id: 'p2', treasury: 0, missedTurns: 1 },
      },
    };
    type Raw = { players: Record<string, { nukesLaunched?: number }> };
    const once = migrateState(v15) as unknown as Raw;
    expect(once.players['p1']!.nukesLaunched).toBe(0);
    expect(once.players['p2']!.nukesLaunched).toBe(0);
    const twice = migrateState(structuredClone(once) as unknown as Record<string, unknown>) as unknown as Raw;
    expect(twice.players['p1']!.nukesLaunched).toBe(0);
    expect(MIGRATIONS[16]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// E2E chaîné — l'arc complet de la 7m (R-138→R-141, C13/C14)
// ---------------------------------------------------------------------------

describe('7m · E2E chaîné — Manhattan → ICBM → frappe → occupation (C14)', () => {
  it('la frappe NE capture PAS : la domination exige une occupation physique ultérieure', () => {
    // T1 : Manhattan complété → ICBM instanciée dans la ville constructrice.
    const t0 = makeState({
      width: 20,
      height: 10,
      cities: [
        { id: 'cap1', owner: 'p1', q: 0, r: 0, capital: true, pop: 4 },
        { id: 'cap2', owner: 'p2', q: 12, r: 0, capital: true, pop: 6, buildings: ['temple', 'marche'] },
      ],
      units: [{ id: 'assaut', type: 'legion', owner: 'p1', q: 10, r: 2, mp: 1 }],
    });
    t0.cities['cap1']!.production = { item: { kind: 'wonder', id: 'projet_manhattan' }, progress: 750 };
    const t1 = resolveTurn(t0, {}, 1).newState;
    expect(t1.cities['cap1']!.wonders).toContain('projet_manhattan');
    const nuke = Object.values(t1.units).find((u) => u.type === 'icbm');
    expect(nuke).toBeDefined();

    // T2 : la cible est à portée de VISION (40 PM — déplacement au contact).
    // L'ICBM est posée en (0,0) : avec 40 PM elle rejoint (10,0) — adjacente
    // à la capitale adverse — qui devient visible (vision 2 du missile).
    const t2orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: nuke!.id, path: [{ q: 6, r: 0 }, { q: 8, r: 0 }, { q: 10, r: 0 }] }],
    };
    const t2 = resolveTurn(t1, t2orders, 2).newState;
    const missile = Object.values(t2.units).find((u) => u.type === 'icbm')!;
    expect(missile.q).toBe(10); // déplacement garanti R-40 (cases vides)
    expect(missile.mp).toBe(40); // R-72 : PM régénérés à max en Phase D du même tour

    // T3 : frappe DIRECTE sur la capitale adverse — C13 : la ville survit,
    // la légion adverse... la garnison du rayon meurt, pop → 2, moitié des
    // bâtiments (⌊2/2⌋ = 1 : temple ou marché), PAS de victoire (C14).
    const t3 = resolveTurn(t2, { p1: [{ type: 'Launch', unitId: missile.id, target: { q: 12, r: 0 } }] }, 3);
    const t3state = t3.newState;
    // Le missile est consommé — AUCUNE ICBM ne reste en jeu (l'id 'u1' peut
    // être réutilisé par un engendrement du même tour : on teste le type).
    expect(Object.values(t3state.units).some((u) => u.type === 'icbm')).toBe(false);
    expect(t3state.players['p1']!.nukesLaunched).toBe(1);
    expect(t3state.cities['cap2']!.owner).toBe('p2'); // pas de capture (C14)
    expect(t3state.cities['cap2']!.pop).toBe(2);
    expect(t3state.cities['cap2']!.buildings).toHaveLength(1); // ⌊2/2⌋
    expect(t3state.winner).toBeNull();
    const kills = t3.events.filter((e) => e.type === 'UnitDestroyed' && e.cause === 'nuke');

    // T4+T5 : la LÉGION (hors rayon pendant la frappe — C13.4 détruit tout)
    // s'approche puis entre sur la capitale neutralisée — capture, victoire
    // (R-65 : l'occupation physique valide la domination, pas le tir — C14).
    void kills;
    const t4 = resolveTurn(t3state, { p1: [{ type: 'Move', unitId: 'assaut', path: [{ q: 11, r: 1 }] }] }, 4).newState;
    expect(t4.units['assaut']!.q).toBe(11);
    const t5 = resolveTurn(t4, { p1: [{ type: 'Move', unitId: 'assaut', path: [{ q: 12, r: 0 }] }] }, 5).newState;
    expect(t5.cities['cap2']!.owner).toBe('p1');
    expect(t5.winner).toBe('p1'); // la domination vient de l'OCCUPATION, pas du tir
  });
});
