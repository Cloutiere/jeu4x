/**
 * Phase 7j — Personnages Illustres : classes canoniques, Consume & Settle
 * (RULES.md §8.8, R-114 rév., R-123 complétée, R-126, R-127 ; migration v13).
 * Chaque test cite son identifiant de règle ou la ligne du doc d'Erik
 * (« Merveilles et Personnages », tableau Consume/Settle).
 */
import { describe, expect, it } from 'vitest';
import {
  applyFirstToDiscover,
  CURRENT_SCHEMA_VERSION,
  greatPersonClassFor,
  migrateState,
  resolveTurn,
  settledGpCostFactor,
  settledGpMultiplier,
  settledGreatPersonsOfCities,
} from '../src/index.js';
import { makeState } from '../src/fixtures.js';
import { GP_CLASSES, figureClassForTech } from '../src/culture.js';
import { FIGURES } from '../src/data.js';
import type { GameState } from '../src/index.js';

function gpState(): GameState {
  return makeState({
    cities: [{ owner: 'p1', q: 2, r: 2, capital: true, pop: 3, workedTiles: ['2,1'] }],
  });
}

function addUnit(state: GameState, id: string, type: string, q: number, r: number, owner = 'p1'): void {
  state.units[id] = {
    id,
    type,
    owner,
    q,
    r,
    hp: 3,
    mp: 2,
    veteran: false,
    isArmy: false,
    order: null,
    detainedBy: null,
    fortified: false,
    aboard: null,
    cargo: null,
  };
}

describe('7j · D1 — fusion Artiste / Penseur (R-114 révisée)', () => {
  it('le canal culture engendre directement la classe fusionnée artiste_penseur', () => {
    const state = gpState();
    state.cities['c1']!.cultureStored = 20;
    const result = resolveTurn(state, {}, 42);
    const spawned = result.events.find((e) => e.type === 'GreatPersonSpawned');
    if (spawned?.type !== 'GreatPersonSpawned') throw new Error('GP attendu');
    expect(spawned.unitType).toBe('artiste_penseur'); // doc : « Grand Artiste / Penseur »
    expect(result.newState.units[spawned.unitId]!.type).toBe('artiste_penseur');
  });

  it('les 6 classes canoniques sont déclarées dans l’ordre du tableau du doc', () => {
    expect([...GP_CLASSES]).toEqual([
      'artiste_penseur',
      'batisseur',
      'savant',
      'explorateur',
      'humanitaire',
      'leader',
    ]);
  });
});

describe('7k · C1 — Grand Humanitaire produit PAR LE CANAL CULTURE (veto d’Erik du 04/09, révision R-123/R-126)', () => {
  it('l’accumulateur gpAccumFood est DORMANT : plus aucun GP n’en sort (compat saves)', () => {
    const state = gpState();
    state.cities['c1']!.gpAccumFood = 20; // ancien seuil T-30 — plus jamais lu
    const result = resolveTurn(state, {}, 42);
    expect(result.events.some((e) => e.type === 'GreatPersonSpawned')).toBe(false);
    expect(result.newState.cities['c1']!.gpAccumFood).toBe(20); // inchangé (dormant)
  });

  it('le canal CULTURE engendre l’Humanitaire via le ciblage technologique (R-127 : Thomas Becket / Féodalité)', () => {
    const state = gpState();
    state.cities['c1']!.cultureStored = 20; // seuil T-27
    state.players['p1']!.researching = 'feudalite'; // figure humanitaire (figures.json)
    const result = resolveTurn(state, {}, 42);
    const spawned = result.events.find((e) => e.type === 'GreatPersonSpawned');
    if (spawned?.type !== 'GreatPersonSpawned') throw new Error('GP attendu');
    expect(spawned.unitType).toBe('humanitaire');
    // 7k · C2 : le canal culture compte le jalon À L'OBTENTION.
    expect(result.newState.players['p1']!.cultureMilestones).toBe(1);
  });

  it('un déficit alimentaire ne touche plus aucun accumulateur (champ dormant, interprétation 7k)', () => {
    const state = gpState();
    state.cities['c1']!.gpAccumFood = 5;
    state.cities['c1']!.pop = 30; // déficit massif (cap 31, R-63)
    const out = resolveTurn(state, {}, 42).newState;
    expect(out.cities['c1']!.gpAccumFood).toBe(5); // inchangé — dormant
  });
});

describe('7j · D3 — Consume / Settle (R-126)', () => {
  it('Consume · Bâtisseur : achève la production en cours (bâtiment) — le GP disparaît', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'batisseur', 3, 2); // adjacent à c1 (2,2)
    state.cities['c1']!.production = { item: { kind: 'building', id: 'temple' }, progress: 0 };
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'consume', cityId: 'c1' }] },
      42,
    );
    expect(result.newState.units['uGP']).toBeUndefined();
    expect(result.newState.cities['c1']!.buildings).toContain('temple');
    expect(result.newState.cities['c1']!.production).toBeNull();
    expect(result.events.some((e) => e.type === 'GreatPersonConsumed' && e.unitType === 'batisseur')).toBe(true);
    expect(result.events.some((e) => e.type === 'BuildingCompleted' && e.building === 'temple')).toBe(true);
  });

  it('Consume · Bâtisseur : achète une UNITÉ en file (posée sur la ville sinon adjacente)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'batisseur', 3, 2);
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'consume', cityId: 'c1' }] },
      42,
    );
    expect(result.newState.cities['c1']!.production).toBeNull();
    expect(Object.values(result.newState.units).some((u) => u.type === 'guerrier')).toBe(true);
    expect(result.events.some((e) => e.type === 'UnitProduced')).toBe(true);
  });

  it('Consume · Savant : achève la recherche active (R-126 — doc : « finalise immédiatement la recherche »)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'savant', 3, 2);
    state.players['p1']!.researching = 'poterie';
    state.players['p1']!.scienceProgress['poterie'] = 0;
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'consume', cityId: 'c1' }] },
      42,
    );
    expect(result.newState.units['uGP']).toBeUndefined();
    expect(result.newState.players['p1']!.techsUnlocked).toContain('poterie');
    expect(result.newState.players['p1']!.researching).toBeNull();
    expect(result.events.some((e) => e.type === 'TechResearched' && e.tech === 'poterie')).toBe(true);
  });

  it('Consume · Humanitaire : +1 pop à TOUTES les cités de l’empire', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'humanitaire', 3, 2);
    state.cities['c2'] = { ...state.cities['c1']!, id: 'c2', q: 5, r: 5, capital: false, buildings: [] };
    const pop1 = state.cities['c1']!.pop;
    const pop2 = state.cities['c2']!.pop;
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'consume', cityId: 'c1' }] },
      42,
    );
    expect(result.newState.cities['c1']!.pop).toBe(pop1 + 1);
    expect(result.newState.cities['c2']!.pop).toBe(pop2 + 1);
    expect(result.newState.units['uGP']).toBeUndefined();
  });

  it('Consume · Leader : toutes les unités militaires de l’empire → Vétéran', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'leader', 3, 2);
    addUnit(state, 'uM1', 'guerrier', 5, 5);
    addUnit(state, 'uM2', 'legion', 6, 5);
    state.units['uM1']!.veteran = true; // déjà vétéran
    addUnit(state, 'uC1', 'colon', 7, 5); // civil : NON promu
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'consume', cityId: 'c1' }] },
      42,
    );
    expect(result.newState.units['uM2']!.veteran).toBe(true);
    expect(result.newState.units['uM1']!.veteran).toBe(true);
    expect(result.newState.units['uC1']!.veteran).toBe(false); // pacifique
    expect(result.newState.units['uGP']).toBeUndefined();
  });

  it('Consume inactifs v1 (doc : flip culturel / injection d’or — 7l) : l’ordre est ignoré, le GP reste en attente', () => {
    const state = gpState();
    addUnit(state, 'uAP', 'artiste_penseur', 3, 2);
    addUnit(state, 'uEX', 'explorateur', 4, 2);
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'GreatPersonAction', unitId: 'uAP', action: 'consume', cityId: 'c1' },
          { type: 'GreatPersonAction', unitId: 'uEX', action: 'consume', cityId: 'c1' },
        ],
      },
      42,
    );
    expect(result.newState.units['uAP']).toBeDefined();
    expect(result.newState.units['uEX']).toBeDefined();
    expect(result.events.some((e) => e.type === 'GreatPersonConsumed')).toBe(false);
  });

  it('Settle · Savant : +50 % de Science dans la cité hôte (doc : « +50 % de production de Science »)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'savant', 3, 2);
    const settled = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      42,
    ).newState;
    expect(settled.cities['c1']!.settledGreatPersons).toEqual(['savant']);
    // Multiplicateur appliqué aux gains (pur — R-126) :
    expect(settledGpMultiplier(settled.cities['c1']!, 'savant')).toBe(1.5);
  });

  it('Settle · Bâtisseur : −50 % de marteaux sur les FUTURS BÂTIMENTS de la cité (test dédié, critère d’acceptation)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'batisseur', 3, 2);
    state.players['p1']!.techsUnlocked = ['rites_funeraires']; // Temple débloqué
    const settled = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      42,
    ).newState;
    expect(settledGpCostFactor(settled.cities['c1']!, 'batisseur')).toBe(0.5);
    // Le Temple coûte 40 🔶 (buildings.json) : avec le Bâtisseur installé, le
    // coût effectif est 20 — la ville (production ≥ 20/tour, 7i) l'achève en UN
    // tour depuis un chantier à 19 marteaux ; le contrôle SANS Bâtisseur
    // (il manque 21, production < 20/tour) ne l'achève pas.
    settled.cities['c1']!.production = { item: { kind: 'building', id: 'temple' }, progress: 19 };
    const sansState = structuredClone(settled) as typeof settled;
    sansState.cities['c1']!.settledGreatPersons = [];
    const sansOut = resolveTurn(sansState, {}, 43).newState;
    expect(sansOut.cities['c1']!.buildings).not.toContain('temple'); // coût plein : pas achevé
    const result = resolveTurn(settled, {}, 43);
    expect(result.newState.cities['c1']!.buildings).toContain('temple'); // −50 % : achevé
    expect(result.newState.cities['c1']!.production).toBeNull();
  });

  it('Settle · Leader : les NOUVELLES unités de la cité hôte sont vétérans (🔶 interprétation « +3 XP / effet Caserne »)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'leader', 3, 2);
    const settled = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      42,
    ).newState;
    settled.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 999 };
    const result = resolveTurn(settled, {}, 43);
    const produced = Object.values(result.newState.units).find((u) => u.type === 'guerrier');
    expect(produced).toBeDefined();
    expect(produced!.veteran).toBe(true);
  });

  it('le jalon culturel est compté À L’OBTENTION, quel que soit l’usage (D3/D4 — vérif 7f)', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'savant', 3, 2);
    state.players['p1']!.cultureMilestones = 0;
    const result = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      42,
    );
    // Le settle n'ajoute PAS de jalon (il serait déjà compté au spawn).
    expect(result.newState.cities['c1']!.settledGreatPersons).toEqual(['savant']);
    expect(result.events.filter((e) => e.type === 'CultureMilestone')).toHaveLength(0);
  });

  it('ordre invalide : ville ennemie, GP non possédé, trop loin — le GP reste en attente', () => {
    const state = gpState();
    addUnit(state, 'uGP', 'savant', 6, 6); // loin
    const r1 = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      42,
    ).newState;
    expect(r1.units['uGP']).toBeDefined();
    expect(r1.cities['c1']!.settledGreatPersons).toEqual([]);
    state.cities['c1']!.owner = 'p2';
    const r2 = resolveTurn(
      state,
      { p1: [{ type: 'GreatPersonAction', unitId: 'uGP', action: 'settle', cityId: 'c1' }] },
      43,
    ).newState;
    expect(r2.units['uGP']).toBeDefined();
  });
});

describe('7j · D4.3 — espionnage et nouveaux états (R-119 révisée)', () => {
  it('un GP EN ATTENTE DE CHOIX ne peut pas être volé 🔶 (doc : seuls les installés)', () => {
    const state = gpState();
    state.players = { ...state.players, p2: { ...state.players['p2']!, id: 'p2' } };
    state.cities['c2'] = { ...state.cities['c1']!, id: 'c2', q: 4, r: 2, capital: true, owner: 'p2', buildings: [] };
    addUnit(state, 'uGP', 'savant', 5, 2, 'p2'); // en attente, sur c2
    addUnit(state, 'uSpy', 'espion', 4, 1, 'p1'); // adjacent
    const result = resolveTurn(
      state,
      { p1: [{ type: 'SpyMission', unitId: 'uSpy', cityId: 'c2', mission: 'stealGreatPerson' }] },
      42,
    );
    expect(result.events.some((e) => e.type === 'GreatPersonStolen')).toBe(false);
    expect(result.events.some((e) => e.type === 'SpyMission' && e.outcome === 'failed')).toBe(true);
    expect(result.newState.units['uSpy']).toBeDefined(); // échec : l'espion survit
  });

  it('un GP INSTALLÉ volé : retiré de la ville cible, réinstallé dans la capitale du voleur', () => {
    const state = gpState();
    state.cities['c2'] = { ...state.cities['c1']!, id: 'c2', q: 4, r: 2, capital: true, owner: 'p2', buildings: [] };
    state.cities['c2']!.settledGreatPersons = ['savant'];
    addUnit(state, 'uSpy', 'espion', 4, 1, 'p1');
    state.players['p2']!.cultureMilestones = 1;
    const result = resolveTurn(
      state,
      { p1: [{ type: 'SpyMission', unitId: 'uSpy', cityId: 'c2', mission: 'stealGreatPerson' }] },
      42,
    );
    expect(result.events.some((e) => e.type === 'GreatPersonStolen')).toBe(true);
    expect(result.newState.cities['c2']!.settledGreatPersons).toEqual([]);
    expect(result.newState.cities['c1']!.settledGreatPersons).toEqual(['savant']); // capitale voleur
    expect(result.newState.players['p2']!.cultureMilestones).toBe(0);
    expect(result.newState.players['p1']!.cultureMilestones).toBe(1);
  });
});

describe('7j · D5.1 — Premier découvrir accorde un GP (R-109 étendu)', () => {
  it('Premier découvrir de l’Invention → Grand Bâtisseur (Léonard de Vinci, figures.json)', () => {
    const state = gpState();
    applyFirstToDiscover(state, 'p1', 'invention', () => {});
    const gp = Object.values(state.units).find((u) => u.type === 'batisseur');
    expect(gp).toBeDefined();
    // 7k · C2 : le GP du Premier découvrir NE compte PAS de jalon (révision
    // R-126 — seuls les GP du canal culture en comptent).
    expect(state.players['p1']!.cultureMilestones).toBe(0);
    expect(state.players['p1']!.greatPersonsObtained).toBe(1);
    expect(state.players['p1']!.greatPersonsByType['batisseur']).toBe(1);
  });

  it('Premier découvrir de la Monarchie → Grand Leader (Roi David)', () => {
    const state = gpState();
    applyFirstToDiscover(state, 'p1', 'monarchie', () => {});
    expect(Object.values(state.units).some((u) => u.type === 'leader')).toBe(true);
  });

  it('ciblage R-126/R-127 : chaque figure du doc est rattachée à une tech EXISTANTE de l’arbre', () => {
    for (const cls of GP_CLASSES) {
      for (const f of FIGURES.classes[cls]!.figures) {
        expect(figureClassForTech(f.tech)).toBe(cls); // cohérence classe/figures
      }
    }
    // D5.1 : les figures Humanitaire (Féodalité, Chemin de fer) et Explorateur
    // (Combustion) existent bien dans techs.json — aucune tech manquante.
    expect(figureClassForTech('feudalite')).toBe('humanitaire');
    expect(figureClassForTech('chemin_de_fer')).toBe('humanitaire');
    expect(figureClassForTech('combustion')).toBe('explorateur');
    expect(greatPersonClassFor('machine_a_vapeur', 0)).toBe('batisseur');
  });
});

describe('7j · Migration v12 → v13 (fusion `penseur`, renommages D2, champs Settle)', () => {
  it('renomme les unités, fusionne les compteurs artiste+penseur, ajoute les champs ville — SANS PERTE, idempotent', () => {
    const v12 = {
      schemaVersion: 12,
      players: {
        p1: { id: 'p1', greatPersonsByType: { penseur: 1, artiste: 2, mogul: 3, leader: 1 }, cultureMilestones: 7 },
      },
      units: {
        u1: { id: 'u1', type: 'penseur', owner: 'p1' },
        u2: { id: 'u2', type: 'artiste', owner: 'p1' },
        u3: { id: 'u3', type: 'scientifique', owner: 'p1' },
        u4: { id: 'u4', type: 'ingenieur', owner: 'p1' },
      },
      cities: { c1: { id: 'c1', q: 0, r: 0, owner: 'p1' } },
    };
    const out = migrateState(v12 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(14); // 7k : migration additive pendingSalvage (R-130)
    expect(out.units['u1']!.type).toBe('artiste_penseur'); // fusion D1
    expect(out.units['u2']!.type).toBe('artiste_penseur');
    expect(out.units['u3']!.type).toBe('savant'); // D2
    expect(out.units['u4']!.type).toBe('batisseur'); // D2
    const byType = out.players['p1']!.greatPersonsByType;
    expect(byType['artiste_penseur']).toBe(3); // 1 penseur + 2 artistes — SANS PERTE
    expect(byType['explorateur']).toBe(3); // mogul renommé
    expect(byType['leader']).toBe(1);
    expect(byType['penseur']).toBeUndefined();
    expect(out.cities['c1']!.gpAccumFood).toBe(0); // additif
    expect(out.cities['c1']!.settledGreatPersons).toEqual([]); // additif
    // Idempotent.
    const twice = migrateState(structuredClone(out) as unknown as Record<string, unknown>);
    expect(twice).toEqual(out);
  });

  it('les GP installés (settledGreatPersons) survivent à la migration', () => {
    const v12 = {
      schemaVersion: 12,
      players: { p1: { id: 'p1', greatPersonsByType: {} } },
      units: {},
      cities: { c1: { id: 'c1', q: 0, r: 0, owner: 'p1', settledGreatPersons: ['savant', 'batisseur'] } },
    };
    const out = migrateState(v12 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.cities['c1']!.settledGreatPersons).toEqual(['savant', 'batisseur']);
    expect(settledGreatPersonsOfCities(out.cities, 'p1')).toBe(2);
  });
});
