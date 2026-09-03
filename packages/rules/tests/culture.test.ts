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
  greatPersonTypeFor,
  isWonderObsolete,
  wonderProductionIssue,
} from '../src/culture.js';
import { WONDERS, canSetProduction } from '../src/techs.js';

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
  it('Palais 1/tour dans la capitale seule ; Temple +1/citoyen ; Cathédrale +2/citoyen (cultureGains)', () => {
    // Capitale pop 1 avec Palais : 1 culture/tour.
    expect(cultureGains({ pop: 1, buildings: ['palais'], capital: true, wonders: [] })).toBe(1);
    // Temple pop 4 : 1 (Palais) + 4 × 1 = 5.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: [] })).toBe(5);
    // Cathédrale pop 4 (remplace le Temple) : 1 + 4 × 2 = 9.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'cathedrale'], capital: true, wonders: [] })).toBe(9);
    // Document d'Erik : 20 pop × Cathédrale = 40 🔶 (part Temple seule).
    expect(cultureGains({ pop: 20, buildings: ['cathedrale'], capital: false, wonders: [] })).toBe(40);
    // Ville non-capitale sans bâtiment : 0.
    expect(cultureGains({ pop: 3, buildings: [], capital: false, wonders: [] })).toBe(0);
  });

  it('Stonehenge multiplie ×1,5 la part Temple/Cathédrale tant qu’il n’est pas obsolète (R-110)', () => {
    // 4 pop × Temple = 4 × 1,5 = 6, + Palais 1 = 7.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: ['stonehenge'] })).toBe(7);
    // 3 pop × Cathédrale = 6 × 1,5 = 9, + Palais 1 = 10.
    expect(cultureGains({ pop: 3, buildings: ['palais', 'cathedrale'], capital: true, wonders: ['stonehenge'] })).toBe(10);
    // Obsolescence (Littératie débloquée) : le multiplicateur disparaît, le jalon reste.
    expect(cultureGains({ pop: 4, buildings: ['palais', 'temple'], capital: true, wonders: ['stonehenge'] }, 0, ['litteratie'])).toBe(5);
    expect(isWonderObsolete('stonehenge', ['litteratie'])).toBe(true);
    expect(isWonderObsolete('stonehenge', [])).toBe(false);
  });

  it('bonus empire perCity.culture du Premier découvrir (Religion/Imprimerie — R-109/R-113)', () => {
    const state = capitalCity(['temple']);
    state.firstBy = { religion: 'p1' }; // +1 Culture dans toutes les villes
    const { newState } = resolveTurn(state, {}, 1);
    // 1 (Palais) + 4 × 1 (Temple) + 1 (Premier découvrir) = 6 accumulés.
    expect(newState.cities['c1']!.cultureStored).toBe(6);
  });

  it('accumulation par ville : la culture s’ajoute chaque tour (cultureStored)', () => {
    let state = capitalCity(['temple']);
    state = resolveTurn(state, {}, 1).newState;
    expect(state.cities['c1']!.cultureStored).toBe(5);
    state = resolveTurn(state, {}, 2).newState;
    expect(state.cities['c1']!.cultureStored).toBe(10);
  });
});

describe('R-114 · Personnages illustres de culture (seuil T-27 croissant)', () => {
  it('au seuil 20 🔶 : un GP (Artiste d’abord) apparaît, la jauge est soustraite, le compteur empire monte', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.cultureStored = 19; // 5/tour → franchit 20 ce tour
    const { newState, events } = resolveTurn(state, {}, 1);
    const gp = Object.values(newState.units).find((u) => u.type === 'artiste');
    expect(gp).toBeDefined();
    expect(gp!.owner).toBe('p1');
    expect(gp!.q).toBe(0); // posé sur la case de la ville (libre)
    expect(newState.cities['c1']!.cultureStored).toBe(4); // 19 + 5 − 20 (surplus conservé)
    expect(newState.players['p1']!.greatPersonsObtained).toBe(1);
    expect(events.some((e) => e.type === 'GreatPersonSpawned' && e.unitType === 'artiste')).toBe(true);
  });

  it('le seuil DOUBLE à chaque GP obtenu par l’empire (T-27 : 20 → 40 → 80…)', () => {
    expect(greatPersonThresholdFor(0)).toBe(20);
    expect(greatPersonThresholdFor(1)).toBe(40);
    expect(greatPersonThresholdFor(2)).toBe(80);
    // Après 1 GP obtenu, une ville à 5 culture/tour : 34 + 5 = 39 < 40 ne
    // suffit plus ; 35 + 5 = 40 franchit le nouveau seuil.
    const state = capitalCity(['temple']);
    state.players['p1']!.greatPersonsObtained = 1;
    state.cities['c1']!.cultureStored = 34;
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.cultureStored).toBe(39); // pas de GP
    expect(Object.values(newState.units)).toHaveLength(0);
    state.cities['c1']!.cultureStored = 35;
    const r2 = resolveTurn(state, {}, 1).newState;
    // Alternance : ce deuxième GP est un PENSEUR (index 1).
    expect(Object.values(r2.units).some((u) => u.type === 'penseur')).toBe(true); // 40 ≥ 40
  });

  it('alternance déterministe 🔶 : Artiste puis Penseur (interprétation documentée)', () => {
    expect(greatPersonTypeFor(0)).toBe('artiste');
    expect(greatPersonTypeFor(1)).toBe('penseur');
    expect(greatPersonTypeFor(2)).toBe('artiste');
  });

  it('case de ville occupée : le GP apparaît sur une case adjacente libre (tri (q,r) — R-81)', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.cultureStored = 19;
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
    const gp = Object.values(newState.units).find((u) => u.type === 'artiste');
    expect(gp).toBeDefined();
    expect(hexDistance(gp!, { q: 0, r: 0 })).toBe(1); // adjacent
    expect(gp!.id).not.toBe('u9');
  });

  it('un GP n’est JAMAIS produisible par les files (moteur — R-114)', () => {
    const state = capitalCity();
    const r = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'artiste' } }] }, 1);
    expect(r.newState.cities['c1']!.production).toBeNull();
    expect(canSetProduction({ kind: 'unit', id: 'penseur' }, [], [])).toBe(false);
  });
});

describe('R-115 · Installation et jalons culturels', () => {
  function stateWithGp(): GameState {
    const state = capitalCity(['temple']);
    state.units['u1'] = {
      id: 'u1',
      type: 'artiste',
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

  it('InstallPerson consomme le GP et accorde +1 jalon (événements InstallPerson + CultureMilestone)', () => {
    const { newState, events } = resolveTurn(
      stateWithGp(),
      { p1: [{ type: 'InstallPerson', unitId: 'u1', cityId: 'c1' }] },
      1,
    );
    expect(newState.units['u1']).toBeUndefined(); // GP consommé
    expect(newState.players['p1']!.cultureMilestones).toBe(1);
    expect(events.some((e) => e.type === 'InstallPerson' && e.unitType === 'artiste' && e.cityId === 'c1')).toBe(true);
    expect(events.some((e) => e.type === 'CultureMilestone' && e.delta === 1 && e.total === 1 && e.reason === 'install')).toBe(true);
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
      cultureStored: 0,
      wonders: [],
      gpAccumGold: 0,
      gpAccumScience: 0,
      gpAccumProd: 0,
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
    const state = unState(19, 299); // un tour de production suffirait sinon
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    expect(newState.cities['c1']!.production!.progress).toBe(299); // gelée 🔶
    expect(newState.winner).toBeNull();
    // Les jalons reviennent à 20 : la construction reprend et achève l'ONU.
    const resumed = unState(20, 299);
    const r2 = resolveTurn(resumed, {}, 1);
    expect(r2.newState.winner).toBe('p1');
  });

  it('complétion à 20 jalons → Victory(reason: culture) (coût T-28 🔶 300)', () => {
    expect(WONDERS['nations_unies']!.cost).toBe(300);
    const state = unState(20, 299);
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
    const rWith = resolveTurn(withColosse, {}, 1).newState;
    const without = capitalCity();
    const rWithout = resolveTurn(without, {}, 1).newState;
    // La case de ville donne 1 commerce — doublé à 2 or (conversion or par défaut).
    expect(rWith.players['p1']!.gold).toBe(2);
    expect(rWithout.players['p1']!.gold).toBe(1);
  });

  it('Stonehenge obsolète (Littératie) : effet retiré du moteur mais jalon conservé', () => {
    const state = capitalCity(['temple']);
    state.cities['c1']!.wonders = ['stonehenge'];
    state.players['p1']!.techsUnlocked = ['litteratie'];
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.cultureStored).toBe(5); // 1 + 4 (sans ×1,5)
    expect(newState.cities['c1']!.wonders).toEqual(['stonehenge']); // toujours là
  });
});

describe('7f · Migration v9 → v10', () => {
  it('champs additifs neutres (cultureStored, wonders, cultureMilestones, greatPersonsObtained), idempotent', () => {
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
    expect(out.schemaVersion).toBe(12); // la chaîne continue (7h)
    expect(out.cities['c1']!.cultureStored).toBe(0);
    expect(out.cities['c1']!.wonders).toEqual([]);
    expect(out.players['p1']!.cultureMilestones).toBe(0);
    expect(out.players['p1']!.greatPersonsObtained).toBe(0);
    // Les valeurs existantes sont conservées (idempotence additive).
    const advanced = structuredClone(out);
    advanced.cities['c1']!.cultureStored = 12;
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

    // 1. Un GP apparaît au seuil puis s'installe : jalon 20 → l'ONU se débloque.
    state.cities['c1']!.cultureStored = 19;
    let result = resolveTurn(state, {}, 1);
    state = result.newState;
    const gp = Object.values(state.units).find((u) => u.type === 'artiste' || u.type === 'penseur');
    expect(gp).toBeDefined(); // Artiste (1er GP)
    expect(state.players['p1']!.greatPersonsObtained).toBe(1);
    result = resolveTurn(state, { p1: [{ type: 'InstallPerson', unitId: gp!.id, cityId: 'c1' }] }, 2);
    state = result.newState;
    expect(state.players['p1']!.cultureMilestones).toBe(20);

    // 2. L'ONU est constructible à 20 jalons — posée en file (coût 300).
    result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }] }, 3);
    state = result.newState;
    expect(state.cities['c1']!.production?.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    state.cities['c1']!.production!.progress = 299; // accélération par fixture (handoff L4-1)

    // 3. Production → complétion → VICTOIRE CULTURELLE.
    result = resolveTurn(state, {}, 4);
    state = result.newState;
    expect(state.cities['c1']!.wonders).toContain('nations_unies');
    expect(state.winner).toBe('p1');
    expect(result.events.some((e) => e.type === 'Victory' && e.reason === 'culture')).toBe(true);
    expect(state.players['p1']!.cultureMilestones).toBe(21);
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
      cultureStored: 0,
      wonders: ['colosse_de_rhodes'],
      gpAccumGold: 0,
      gpAccumScience: 0,
      gpAccumProd: 0,
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
