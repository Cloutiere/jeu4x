/**
 * Tests Phase 7f — Culture & victoire culturelle (RULES.md §8.5).
 * R-113 (rendement culturel scalaire), R-114 (Personnages illustres de
 * culture, seuil T-27 croissant), R-115 (installation, jalons dynamiques des
 * merveilles), R-116 (Nations Unies : verrou/suspension/victoire culturelle)
 * + effets des 3 merveilles activées et migration v9 → v10.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { migrateState } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { makeState } from '../src/fixtures.js';
import { hexDistance } from '../src/hex.js';
import { CULTURE } from '../src/data.js';
import {
  cultureGains,
  greatPersonThresholdFor,
  settledGpMultiplier,
  settledGreatPersonsOfCities,
  isWonderObsolete,
  wonderProductionIssue,
  GP_CLASSES,
  GP_CULTURE_SEED_SALT,
  greatPersonClassTire,
  greatPersonRotationClass,
} from '../src/culture.js';
import { WONDERS, canSetProduction } from '../src/techs.js';
import { unitType, FIGURES } from '../src/data.js';
import { createRng } from '../src/rng.js';

/** Capitale p1 pop 4 avec 4 citoyens assignés (prairies : 2 N chacun) — le
 *  Palais est posé comme le fait le moteur dans toute capitale. */
function capitalCity(buildings: string[] = []): GameState {
  return makeState({
    cities: [{
      id: 'c1',
      owner: 'p1',
      q: 0,
      r: 0,
      capital: true,
      pop: 4,
      workedTiles: ['1,0', '0,1', '0,2', '1,2'],
      buildings: ['palais', ...buildings],
    }],
  });
}

describe('R-113 · Rendement culturel (scalaire sur la démographie)', () => {
  it('Palais min(pop,5) dans la capitale seule (R-113 rév.) ; Temple +1/citoyen ; Cathédrale +2/citoyen (cultureGains)', () => {
    // Capitale pop 1 avec Palais : 1 culture/tour (min(1, 5)).
    expect(cultureGains({ pop: 1, buildings: ['palais'], capital: true, wonders: [] })).toBe(1);
    // Temple pop 4 : Palais 4 (min(4, 5)) + 4 × 1 = 8.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: [] })).toBe(8);
    // Cathédrale pop 4 (remplace le Temple) : 4 + 4 × 2 = 12.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'cathedrale'], capital: true, wonders: [] })).toBe(12);
    // Document d'Erik : 20 pop × Cathédrale = 40 🔶 (part Temple seule — NON plafonnée).
    expect(cultureGains({ pop: 20, buildings: ['cathedrale'], capital: false, wonders: [] })).toBe(40);
    // Ville non-capitale sans bâtiment : 0.
    expect(cultureGains({ pop: 3, buildings: [], capital: false, wonders: [] })).toBe(0);
  });

  it('Stonehenge multiplie ×1,5 la part Temple/Cathédrale tant qu’il n’est pas obsolète (R-110)', () => {
    // 4 pop × Temple = 4 × 1,5 = 6, + Palais 4 (min(4,5), non multiplié) = 10.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: ['stonehenge'] })).toBe(10);
    // 3 pop × Cathédrale = 6 × 1,5 = 9, + Palais 3 = 12.
    expect(cultureGains({ pop: 3, buildings: ['palais', 'cathedrale'], capital: true, wonders: ['stonehenge'] })).toBe(12);
    // Obsolescence (Littératie débloquée) : le multiplicateur disparaît, le jalon reste.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: ['stonehenge'] }, 0, ['litteratie'])).toBe(8);
    expect(isWonderObsolete('stonehenge', ['litteratie'])).toBe(true);
    expect(isWonderObsolete('stonehenge', [])).toBe(false);
  });

  it('bonus empire perCity.culture du Premier découvrir (Religion/Imprimerie — R-109/R-113)', () => {
    const state = capitalCity(['temple']);
    state.firstBy = { religion: 'p1' }; // +1 Culture dans toutes les villes
    const { newState } = resolveTurn(state, {}, 1);
    // 4 (Palais min(4,5)) + 4 × 1 (Temple) + 1 (Premier découvrir) = 9 accumulés.
    expect(newState.cities['c1']!.cultureCumulee).toBe(9);
  });

  it('accumulation : la culture de ville s’ajoute chaque tour au CUMUL (jamais soustraite — D1)', () => {
    let state = capitalCity(['temple']);
    state = resolveTurn(state, {}, 1).newState;
    expect(state.cities['c1']!.cultureCumulee).toBe(8);
    state = resolveTurn(state, {}, 2).newState;
    expect(state.cities['c1']!.cultureCumulee).toBe(16);
  });
});

describe('R-114 · Personnages illustres de culture (seuil T-27 croissant)', () => {
  it('D1/D6 : au palier 150 (table canon) le CUMUL EMPIRE franchit le seuil — +1 jalon ET 1 GP, culture JAMAIS soustraite', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.cultureCumulee = 149; // 8/tour → franchit 150 ce tour
    const { newState, events } = resolveTurn(state, {}, 1);
    const gps = Object.values(newState.units).filter((u) => unitType(u.type).greatPerson);
    expect(gps).toHaveLength(1);
    expect(gps[0]!.owner).toBe('p1');
    expect(gps[0]!.q).toBe(0); // ville la plus cultivée (la seule), case libre
    expect(newState.cities['c1']!.cultureCumulee).toBe(157); // 149 + 8 — JAMAIS soustraite (D1)
    expect(newState.players['p1']!.culturePaliers).toBe(1); // D4 : index palier avancé
    expect(newState.players['p1']!.cultureMilestones).toBe(1); // D6(a)
    expect(newState.players['p1']!.greatPersonsObtained).toBe(1); // D6(b)
    // D6 : ordre déterministe — le jalon 'cultureLevel' est émis AVANT le spawn du GP.
    const jalonIdx = events.findIndex((e) => e.type === 'CultureMilestone' && e.reason === 'cultureLevel');
    const gpIdx = events.findIndex((e) => e.type === 'GreatPersonSpawned');
    expect(jalonIdx).toBeGreaterThanOrEqual(0);
    expect(gpIdx).toBeGreaterThanOrEqual(0);
    expect(jalonIdx).toBeLessThan(gpIdx);
  });

  it('7l · C5 : le seuil suit la TABLE CANON (150 → 267 → 417 — écarts +117, +150, +183)', () => {
    expect(greatPersonThresholdFor(0)).toBe(150);
    expect(greatPersonThresholdFor(1)).toBe(267);
    expect(greatPersonThresholdFor(2)).toBe(417);
    expect(greatPersonThresholdFor(14)).toBe(4817); // 15e GP (ancre Erik)
    expect(greatPersonThresholdFor(19)).toBe(8067); // 20e GP (ancre Erik)
    // D4 : le seuil suit culturePaliers (paliers FRANCHIS), pas greatPersonsObtained —
    // 5 GP obtenus par d'autres voies ne décalent pas le prochain palier.
    // Cumul empire 258 + 8 = 266 < 267 : pas de palier ; 259 + 8 = 267 : palier 2.
    const state = capitalCity(['temple']);
    state.players['p1']!.culturePaliers = 1;
    state.players['p1']!.greatPersonsObtained = 5; // neutre (D4)
    state.cities['c1']!.cultureCumulee = 258;
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.cultureCumulee).toBe(266); // pas de GP
    expect(Object.values(newState.units)).toHaveLength(0);
    expect(newState.players['p1']!.cultureMilestones).toBe(0);
    state.cities['c1']!.cultureCumulee = 259;
    const r2 = resolveTurn(state, {}, 1).newState;
    expect(r2.players['p1']!.culturePaliers).toBe(2); // 267 ≥ 267
    expect(Object.values(r2.units).some((u) => unitType(u.type).greatPerson)).toBe(true);
  });

  it('D2 (pur) : tirage seedé déterministe — même graine ⇒ même classe ; pool épuisé ⇒ repli rotation R-80', () => {
    // Déterminisme : la même graine produit la même classe.
    const a = greatPersonClassTire(createRng((7 ^ GP_CULTURE_SEED_SALT) >>> 0), {}, 0);
    const b = greatPersonClassTire(createRng((7 ^ GP_CULTURE_SEED_SALT) >>> 0), {}, 0);
    expect(a).toBe(b);
    expect(GP_CLASSES).toContain(a);
    // Pool épuisé (toutes les figures de toutes les classes consommées) :
    // repli DÉTERMINISTE sur la rotation R-80 (index = greatPersonsObtained).
    const sature: Record<string, number> = {};
    for (const cls of GP_CLASSES) {
      sature[cls] = FIGURES.classes[cls]?.figures.length ?? 0;
    }
    expect(greatPersonClassTire(createRng(1), sature, 0)).toBe(greatPersonRotationClass(0));
    expect(greatPersonClassTire(createRng(99), sature, 7)).toBe(greatPersonRotationClass(7));
  });

  it('case de ville occupée : le GP apparaît sur une case adjacente libre (tri (q,r) — R-81)', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.cultureCumulee = 149;
    state.units['u9'] = {
      id: 'u9',
      type: 'guerrier',
      owner: 'p1',
      q: 0,
      r: 0,
      hp: 3,
      mp: 1,
      veteran: false,
      isArmy: false,
      order: null,
      detainedBy: null,
      fortified: true,
      aboard: null, // 7g · R-117
      cargo: null,
    };
    const { newState } = resolveTurn(state, {}, 1);
    const gp = Object.values(newState.units).find((u) => unitType(u.type).greatPerson);
    expect(gp).toBeDefined();
    expect(hexDistance(gp!, { q: 0, r: 0 })).toBe(1); // adjacent
    expect(gp!.id).not.toBe('u9');
  });

  it('un GP n’est JAMAIS produisible par les files (moteur — R-114)', () => {
    const state = capitalCity();
    const r = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'artiste_penseur' } }] }, 1);
    expect(r.newState.cities['c1']!.production).toBeNull();
    expect(canSetProduction({ kind: 'unit', id: 'artiste_penseur' }, [], [])).toBe(false);
  });
});

describe('R-115 · Installation et jalons culturels', () => {
  function stateWithGp(): GameState {
    const state = capitalCity(['temple']);
    state.units['u1'] = {
      id: 'u1',
      type: 'artiste_penseur',
      owner: 'p1',
      q: 1,
      r: 0, // adjacent à c1 (0,0)
      hp: 3,
      mp: 2,
      veteran: false,
      isArmy: false,
      order: null,
      detainedBy: null,
      fortified: false,
      aboard: null, // 7g · R-117
      cargo: null,
    };
    return state;
  }

  it('7j · R-126 : InstallPerson (alias Settle) consomme le GP, enregistre l’installation — jalon DÉJÀ compté à l’obtention', () => {
    const state = stateWithGp();
    state.players['p1']!.cultureMilestones = 1; // jalon d'obtention (spawn simulé par fixture)
    const { newState, events } = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'u1', action: 'settle', cityId: 'c1' }] },
      1,
    );
    expect(newState.units['u1']).toBeUndefined(); // GP consommé
    // Le jalon n'est PAS re-compté au settle (R-126 : jalon à l'obtention).
    expect(newState.players['p1']!.cultureMilestones).toBe(1);
    expect(newState.cities['c1']!.settledGreatPersons).toEqual(['artiste_penseur']);
    expect(settledGreatPersonsOfCities(newState.cities, 'p1')).toBe(1);
    expect(events.some((e) => e.type === 'InstallPerson' && e.unitType === 'artiste_penseur' && e.cityId === 'c1')).toBe(true);
  });

  it('7j · R-126 : InstallPerson (ordre historique R-115) reste accepté comme alias de Settle', () => {
    const state = stateWithGp();
    state.players['p1']!.cultureMilestones = 1;
    const { newState } = resolveTurn(
      state,
      { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] },
      1,
    );
    expect(newState.units['u1']).toBeUndefined();
    expect(newState.cities['c1']!.settledGreatPersons).toEqual(['artiste_penseur']);
  });

  it('InstallPerson refusé : ville ennemie, ville trop loin, unité non-GP', () => {
    const far = stateWithGp();
    far.units['u1']!.q = 5;
    far.units['u1']!.r = 5; // distance 8 — refusé
    expect(resolveTurn(far, { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] }, 1).newState.units['u1']).toBeDefined();

    const notGp = stateWithGp();
    notGp.units['u1']!.type = 'guerrier';
    expect(resolveTurn(notGp, { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] }, 1).newState.units['u1']).toBeDefined();

    const enemyCity = stateWithGp();
    enemyCity.cities['c1']!.owner = 'p2';
    expect(resolveTurn(enemyCity, { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] }, 1).newState.units['u1']).toBeDefined();
    expect(resolveTurn(enemyCity, { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] }, 1).newState.players['p1']!.cultureMilestones).toBe(0);
  });

  it('merveille construite = +1 jalon ; ville hôte capturée = −1 pour le perdant, +1 pour le captreur (dynamique)', () => {
    // Construction des Jardins suspendus (Poterie) : jalon 1 + effet +50 % pop.
    const state = capitalCity(['temple']);
    state.players['p1']!.techsUnlocked = ['poterie'];
    const built = resolveTurn(
      state,
      { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'jardins_suspendus' } }] },
      1,
    );
    expect(built.newState.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'jardins_suspendus' });
    expect(built.newState.cities['c1']!.production!.progress).toBeGreaterThan(0);
    built.newState.cities['c1']!.production!.progress = 99; // accel fixture (coût 100)
    const done = resolveTurn(built.newState, {}, 2);
    expect(done.newState.cities['c1']!.wonders).toEqual(['jardins_suspendus']);
    expect(done.newState.players['p1']!.cultureMilestones).toBe(1);
    expect(done.events.some((e) => e.type === 'WonderCompleted' && e.wonder === 'jardins_suspendus')).toBe(true);
    expect(done.events.some((e) => e.type === 'CultureMilestone' && e.reason === 'wonderBuilt')).toBe(true);
    // Effet Jardins : +50 % de pop (4 → 6, arrondi au plus proche).
    expect(done.newState.cities['c1']!.pop).toBe(6);

    // Capture de la ville hôte par p2 : le perdant retombe à 0, le captreur monte à 1.
    const host = done.newState;
    host.units['uAtt'] = {
      id: 'uAtt',
      type: 'guerrier',
      owner: 'p2',
      q: 0,
      r: 0, // entre dans la ville sans défenseur
      hp: 3,
      mp: 1,
      veteran: false,
      isArmy: false,
      order: null,
      detainedBy: null,
      fortified: false,
      aboard: null, // 7g · R-117
      cargo: null,
    };
    host.cities['c1']!.workedTiles = [];
    host.cities['c1']!.pop = Math.min(host.cities['c1']!.pop, 1);
    const captured = resolveTurn(host, {}, 3);
    expect(captured.newState.cities['c1']!.owner).toBe('p2');
    expect(captured.newState.cities['c1']!.wonders).toEqual(['jardins_suspendus']); // SURVIT
    expect(captured.newState.players['p1']!.cultureMilestones).toBe(0);
    expect(captured.newState.players['p2']!.cultureMilestones).toBe(1);
    expect(captured.events.some((e) => e.type === 'CultureMilestone' && e.player === 'p1' && e.reason === 'wonderLost')).toBe(true);
    expect(captured.events.some((e) => e.type === 'CultureMilestone' && e.player === 'p2' && e.reason === 'wonderCaptured')).toBe(true);
  });

  it('merveille déjà construite (ou en chantier) dans l’empire : SetProduction refusé (unicité R-116)', () => {
    const state = capitalCity();
    state.players['p1']!.techsUnlocked = ['poterie'];
    state.cities['c1']!.wonders = ['jardins_suspendus'];
    const r = resolveTurn(
      state,
      { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'jardins_suspendus' } }] },
      1,
    );
    expect(r.newState.cities['c1']!.production).toBeNull();
    // En chantier dans une AUTRE ville : refusé aussi.
    const other = capitalCity();
    other.players['p1']!.techsUnlocked = ['poterie'];
    other.cities['c2'] = {
      id: 'c2',
      q: 4,
      r: 4,
      owner: 'p1',
      pop: 1,
      capital: false,
      foodStored: 0,
      production: { item: { kind: 'wonder', id: 'jardins_suspendus' }, progress: 10 },
      workedTiles: [],
      buildings: [],
      conversion: 'gold',
      cultureCumulee: 0,
      wonders: [],
      gpAccumGold: 0,
      gpAccumScience: 0,
      gpAccumProd: 0, gpAccumFood: 0, pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
    };
    const r2 = resolveTurn(
      other,
      { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'jardins_suspendus' } }] },
      1,
    );
    expect(r2.newState.cities['c1']!.production).toBeNull();
  });
});

describe('R-116 · Nations Unies : verrou, suspension, victoire culturelle', () => {
  function unState(milestones: number, progress = 0): GameState {
    const state = capitalCity(['usine']); // production ×2 pour finir vite
    state.players['p1']!.cultureMilestones = milestones;
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'nations_unies' }, progress };
    return state;
  }

  it('verrouillée sous 20 jalons : SetProduction refusé (moteur + wonderProductionIssue)', () => {
    const state = capitalCity();
    const r = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }] }, 1);
    expect(r.newState.cities['c1']!.production).toBeNull();
    const issue = wonderProductionIssue('nations_unies', {
      techsUnlocked: [],
      empireWondersBuilt: [],
      empireWondersInProduction: [],
      cultureMilestones: 19,
    });
    expect(issue).toContain('20 jalons');
    expect(wonderProductionIssue('nations_unies', {
      techsUnlocked: [],
      empireWondersBuilt: [],
      empireWondersInProduction: [],
      cultureMilestones: 20,
    })).toBeNull();
  });

  it('suspendue si les jalons retombent sous 20 pendant la construction (progression gelée, marteaux conservés)', () => {
    const state = unState(19, 499); // un tour de production suffirait sinon
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    expect(newState.cities['c1']!.production!.progress).toBe(499); // gelée 🔶
    expect(newState.winner).toBeNull();
    // Les jalons reviennent à 20 : la construction reprend et achève l'ONU.
    const resumed = unState(20, 499);
    const r2 = resolveTurn(resumed, {}, 1);
    expect(r2.newState.winner).toBe('p1');
  });

  it('complétion à 20 jalons → Victory(reason: culture) (coût T-28 rév. 7l · C11 : 500)', () => {
    expect(WONDERS['nations_unies']!.cost).toBe(500);
    const state = unState(20, 499);
    const { newState, events } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.wonders).toEqual(['nations_unies']);
    expect(newState.winner).toBe('p1');
    expect(events.some((e) => e.type === 'Victory' && e.reason === 'culture' && e.winner === 'p1')).toBe(true);
  });
});

describe('7f · Effets des merveilles activées', () => {
  it('Colosse de Rhodes : commerce de la ville ×2 AVANT conversion (or ou science)', () => {
    const withColosse = capitalCity();
    withColosse.cities['c1']!.wonders = ['colosse_de_rhodes'];
    // ALIGNEMENT-CROISSANCE : la case de ville rapporte 0 (socle abrogé) —
    // une case désert travaillée (0/0/1) porte tout le commerce.
    withColosse.map['0,1'] = { terrain: 'desert', resource: null };
    withColosse.cities['c1']!.workedTiles = ['0,1', '1,0', '0,2', '1,2'];
    const rWith = resolveTurn(withColosse, {}, 1).newState;
    const without = capitalCity();
    without.map['0,1'] = { terrain: 'desert', resource: null };
    without.cities['c1']!.workedTiles = ['0,1', '1,0', '0,2', '1,2'];
    const rWithout = resolveTurn(without, {}, 1).newState;
    // 1 commerce (désert) — doublé à 2 or (conversion or par défaut).
    expect(rWith.players['p1']!.treasury).toBe(2);
    expect(rWithout.players['p1']!.treasury).toBe(1);
  });

  it('Stonehenge obsolète (Littératie) : effet retiré du moteur mais jalon conservé', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.wonders = ['stonehenge'];
    state.players['p1']!.techsUnlocked = ['litteratie'];
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.cultureCumulee).toBe(8); // 4 (Palais min(4,5)) + 4 (Temple, sans ×1,5)
    expect(newState.cities['c1']!.wonders).toEqual(['stonehenge']); // toujours là
  });
});

describe('7f · Migration v9 → v10', () => {
  it('GP-CULTURE-EVENEMENTS · D5 : cultureStored SUPPRIMÉ, cultureCumulee/culturePaliers additifs, idempotent', () => {
    const v9 = {
      schemaVersion: 9,
      turn: 7,
      map: {},
      players: {
        p1: { id: 'p1', gold: 5, science: 0, techsUnlocked: [], scienceProgress: {}, vision: { explored: [], visible: [] }, missedTurns: 0 },
      },
      units: {},
      cities: {
        c1: { id: 'c1', q: 0, r: 0, owner: 'p1', pop: 2, capital: true, foodStored: 0, production: null, workedTiles: [], buildings: ['palais'], conversion: 'gold' },
      },
      firstBy: {},
      diplomacy: { war: [] },
      settings: { turnTimerMinutes: null },
    };
    const out = migrateState(v9 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(22); // la chaîne continue (GP-CULTURE-EVENEMENTS)
    expect((out.cities['c1'] as unknown as Record<string, unknown>)['cultureStored']).toBeUndefined(); // D5 : retiré de l'état
    expect(out.cities['c1']!.cultureCumulee).toBe(0);
    expect(out.cities['c1']!.wonders).toEqual([]);
    expect(out.players['p1']!.cultureMilestones).toBe(0);
    expect(out.players['p1']!.greatPersonsObtained).toBe(0);
    expect(out.players['p1']!.culturePaliers).toBe(0);
    // Les valeurs existantes sont conservées (idempotence additive).
    const advanced = structuredClone(out);
    advanced.cities['c1']!.cultureCumulee = 12;
    advanced.players['p1']!.culturePaliers = 2;
    advanced.cities['c1']!.wonders = ['stonehenge'];
    advanced.players['p1']!.cultureMilestones = 3;
    const twice = migrateState(advanced as unknown as Record<string, unknown>);
    expect(twice).toEqual(advanced);
  });
});

describe('7f · e2e : culture → GP → jalons → merveilles → ONU → victoire culturelle', () => {
  it('scénario complet (R-113..R-116) : GP installé (jalon 1), 3 merveilles (jalons 4), ONU à 20, victoire', () => {
    let state = capitalCity(['temple', 'usine']);
    state.players['p1']!.techsUnlocked = ['poterie', 'travail_du_bronze', 'industrialisation'];
    state.players['p1']!.cultureMilestones = 19; // accélération par fixture (handoff L4-1)

    // 1. Le palier 150 est franchi (D6) : +1 jalon (19 → 20) ET 1 GP — l'ONU se débloque.
    state.cities['c1']!.cultureCumulee = 149;
    let result = resolveTurn(state, {}, 1);
    state = result.newState;
    const gp = Object.values(state.units).find((u) => unitType(u.type).greatPerson);
    expect(gp).toBeDefined(); // GP du palier (classe tirée — D2)
    expect(state.players['p1']!.greatPersonsObtained).toBe(1);
    expect(state.players['p1']!.cultureMilestones).toBe(20); // D6(a) : le palier EST l'événement
    result = resolveTurn(state, { p1: [{ type: 'InstallPerson', unitId: gp!.id, cityId: 'c1' }] }, 2);
    state = result.newState;
    // D7 : le settle ne touche JAMAIS le compteur des 20 (R-126 abrogée).
    expect(state.players['p1']!.cultureMilestones).toBe(20);

    // 2. L'ONU est constructible à 20 jalons — posée en file (coût 500 — C11).
    result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }] }, 3);
    state = result.newState;
    expect(state.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    state.cities['c1']!.production!.progress = 499; // accélération par fixture (handoff L4-1)

    // 3. Production → complétion → VICTOIRE CULTURELLE.
    result = resolveTurn(state, {}, 4);
    state = result.newState;
    expect(state.cities['c1']!.wonders).toContain('nations_unies');
    expect(state.winner).toBe('p1');
    expect(result.events.some((e) => e.type === 'Victory' && e.reason === 'culture')).toBe(true);
    expect(state.players['p1']!.cultureMilestones).toBe(21); // palier (D6) + ONU (R-131)
    expect(CULTURE.milestonesTarget).toBe(20);
  });

  it('capture d’une ville hôte de merveille pendant le chantier de l’ONU → jalon perdu → suspension (handoff L4-1)', () => {
    let state = capitalCity(['usine']);
    state.players['p1']!.cultureMilestones = 20;
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'nations_unies' }, progress: 150 };
    // Une seconde ville héberge une merveille ; p2 la capture → p1 retombe à 19.
    state.cities['c2'] = {
      id: 'c2',
      q: 5,
      r: 5,
      owner: 'p1',
      pop: 1,
      capital: false,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: [],
      conversion: 'gold',
      cultureCumulee: 0,
      wonders: ['colosse_de_rhodes'],
      gpAccumGold: 0,
      gpAccumScience: 0,
      gpAccumProd: 0, gpAccumFood: 0, pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
    };
    state.units['uInv'] = {
      id: 'uInv',
      type: 'guerrier',
      owner: 'p2',
      q: 5,
      r: 5,
      hp: 3,
      mp: 1,
      veteran: false,
      isArmy: false,
      order: null,
      detainedBy: null,
      fortified: false,
      aboard: null, // 7g · R-117
      cargo: null,
    };
    state.cities['c2']!.workedTiles = [];
    const { newState, events } = resolveTurn(state, {}, 1);
    expect(newState.players['p1']!.cultureMilestones).toBe(19);
    expect(newState.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    expect(newState.cities['c1']!.production!.progress).toBe(150); // gelée (suspendue)
    expect(events.some((e) => e.type === 'CultureMilestone' && e.reason === 'wonderLost' && e.player === 'p1')).toBe(true);
    expect(newState.winner).toBeNull();
  });
});
