/**
 * Tests Phase 7l — Or & trésorerie (RULES.md §8.10, R-134..R-137) et
 * corrections Bloc 0 d'Erik du 05/09 (C4-C11, RULES.md révisions).
 *
 * Chaque test cite la règle R-xx / la décision (Cx) qu'il couvre.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';
import { MIGRATIONS, migrateState, allKnownTechs } from '../src/state.js';
import { getFilteredState } from '../src/fog.js';
import {
  ECONOMY,
  rushBuyCostOf,
  isRushForbidden,
  treasuryInterestOf,
  nextEconomyMilestone,
  eraRushFactorFor,
  explorerGoldInjectionFor,
} from '../src/economyOr.js';
import { greatPersonThresholdFor, settledGpMultiplier, settledGpCostFactor, wonderProductionIssue } from '../src/culture.js';
import { tileYield } from '../src/economy.js';
import { growthThresholdFor } from '../src/growth.js';
import cultureData from '../src/data/culture.json' with { type: 'json' };
import { WONDERS } from '../src/techs.js';
import { hexDistance } from '../src/hex.js';

/** Ville capitale p1 en (0,0) ; cases voisines prairies (fond de carte). */
function capitalState(opts: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({ cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1 }], ...opts });
}

// ---------------------------------------------------------------------------
// Bloc 0 — corrections d'Erik du 05/09
// ---------------------------------------------------------------------------

describe('7l · Bloc 0 · C4 — courbe de croissance linéaire 10 × n (R-63 rév.)', () => {
  it('2→3 coûte 20, 5→6 coûte 50 (10 × population actuelle)', () => {
    expect(growthThresholdFor(2)).toBe(20);
    expect(growthThresholdFor(5)).toBe(50);
    expect(growthThresholdFor(10)).toBe(100);
  });

  it('moteur : pop 2 avec réserve 16 + surplus 4 franchit le seuil 20 (2→3)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 16, workedTiles: ['1,0', '0,1'] }],
    });
    const out = resolveTurn(state, {}, 1).newState;
    // récolte 6 (centre 2 + 2 prairies) − 2 citoyens = 4 → 16 + 4 = 20 = seuil.
    expect(out.cities['c1']!.pop).toBe(3);
  });
});

describe('7l · Bloc 0 · C5 — table canon des seuils culturels (R-114 rév.)', () => {
  it('1er GP à 150, écarts croissants (ancres d\'Erik)', () => {
    expect(greatPersonThresholdFor(0)).toBe(150);
    expect(greatPersonThresholdFor(1)).toBe(267);
    expect(greatPersonThresholdFor(2)).toBe(417);
    expect(greatPersonThresholdFor(3)).toBe(600);
    expect(greatPersonThresholdFor(4)).toBe(817);
    expect(greatPersonThresholdFor(5)).toBe(1067);
    expect(greatPersonThresholdFor(6)).toBe(1350);
    expect(greatPersonThresholdFor(7)).toBe(1667);
    expect(greatPersonThresholdFor(8)).toBe(2017);
    expect(greatPersonThresholdFor(9)).toBe(2400);
    expect(greatPersonThresholdFor(14)).toBe(4817); // 15e
    expect(greatPersonThresholdFor(19)).toBe(8067); // 20e
  });

  it('la table data-driven est générée par la formule (écart 117, +33,33 par pas, arrondi)', () => {
    const thresholds = (cultureData as { greatPersonCultureThresholds: number[] }).greatPersonCultureThresholds;
    let t = 150;
    for (let i = 0; i < thresholds.length; i++) {
      expect(thresholds[i]).toBe(t);
      t += Math.floor(117 + (100 * i) / 3);
    }
  });
});

describe('7l · Bloc 0 · C6 — un seul GP d\'un même type par ville (aucun effet cumulé)', () => {
  it('settledGpMultiplier plafonne à une instance par classe (1,5 pas 2,0)', () => {
    expect(settledGpMultiplier({ settledGreatPersons: ['savant'] }, 'savant')).toBe(1.5);
    expect(settledGpMultiplier({ settledGreatPersons: ['savant', 'savant'] }, 'savant')).toBe(1.5); // jamais 2,0
    expect(settledGpMultiplier({ settledGreatPersons: ['savant', 'batisseur'] }, 'savant')).toBe(1.5);
  });

  it('settledGpCostFactor plafonne à ×0,5 (pas ×0,25)', () => {
    expect(settledGpCostFactor({ settledGreatPersons: ['batisseur'] }, 'batisseur')).toBe(0.5);
    expect(settledGpCostFactor({ settledGreatPersons: ['batisseur', 'batisseur'] }, 'batisseur')).toBe(0.5);
  });
});

describe('7l · Bloc 0 · C9 — Cie des Indes : toutes les cases d\'eau, CÔTE incluse (R-132 rév.)', () => {
  it('+1 Commerce sur une case de CÔTE travaillée (et sur l\'océan)', () => {
    const map: Record<string, { terrain: TerrainId; resource: null }> = {
      '0,0': { terrain: 'ville', resource: null },
      '1,0': { terrain: 'eau', resource: null }, // côte
      '0,1': { terrain: 'ocean', resource: null }, // océan
    };
    expect(tileYield(map, [], '1,0', [], ['compagnie_des_indes'])).toEqual({ food: 0, production: 0, commerce: 3 }); // 2 + 1
    expect(tileYield(map, [], '0,1', [], ['compagnie_des_indes'])).toEqual({ food: 0, production: 0, commerce: 3 });
    expect(tileYield(map, [], '1,0', [], [])).toEqual({ food: 0, production: 0, commerce: 2 }); // sans la merveille
  });
});

// ---------------------------------------------------------------------------
// Bloc 1 — R-134 · Trésorerie
// ---------------------------------------------------------------------------

describe('7l · R-134 · trésorerie d\'empire', () => {
  it('la trésorerie grossit des villes focus Or (conversion R-90 créditée en fin de tour)', () => {
    // Centre pop 1 = 0 commerce (tranche Ouvrier) ; désert travaillé = 1 C → 1 or/tour.
    const state = makeState({
      terrainOverrides: { '1,0': 'desert' },
      cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: ['1,0'] }],
    });
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.treasury).toBe(1);
  });

  it('zéro entretien (test négatif) : bâtiments, unités et population ne coûtent RIEN', () => {
    const state = capitalState({
      units: [
        { id: 'uA', type: 'guerrier', owner: 'p1', q: 3, r: 3 },
        { id: 'uB', type: 'legion', owner: 'p1', q: 4, r: 4 },
      ],
    });
    state.cities['c1']!.pop = 5;
    state.cities['c1']!.buildings = ['palais', 'temple', 'caserne', 'marche'];
    // Toutes les cases travaillées sont des prairies (0 commerce) : AUCUN or
    // généré — et aucun entretien ne vient le rendre négatif.
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.treasury).toBe(0);
  });

  it('Gemmes versent +2 or/tour DIRECTS à la trésorerie (canon — canal corrigé D3 de 7c)', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: ['1,0'] }],
    });
    state.map['1,0'] = { terrain: 'montagne', resource: 'gemmes' }; // +2 or direct, 0 commerce
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.treasury).toBe(2);
  });

  it('Or (ressource) exige Monnaie (revealedByTech) et verse +3 or/tour directs', () => {
    const state = makeState({
      cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: ['1,0'] }],
    });
    state.map['1,0'] = { terrain: 'montagne', resource: 'or' };
    expect(resolveTurn(state, {}, 1).newState.players['p1']!.treasury).toBe(0); // Monnaie manque
    const withCurrency = structuredClone(state);
    withCurrency.players['p1']!.techsUnlocked = ['monnaie'];
    expect(resolveTurn(withCurrency, {}, 1).newState.players['p1']!.treasury).toBe(3);
  });

  it('capture de ville = SAC : part 🔶 0,5 de la trésorerie du perdant (CityCaptured.plunder)', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 4 }],
      cities: [
        { owner: 'p1', q: 0, r: 0, capital: true, pop: 1 },
        { id: 'c2', owner: 'p2', q: 5, r: 4, pop: 1 }, // sans défenseur
      ],
    });
    state.players['p2']!.treasury = 100;
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 4 }] }] }, 1);
    const captured = result.events.find((e) => e.type === 'CityCaptured');
    expect(captured).toMatchObject({ type: 'CityCaptured', cityId: 'c2', toOwner: 'p1', plunder: 50 });
    expect(result.newState.players['p1']!.treasury).toBe(50);
    expect(result.newState.players['p2']!.treasury).toBe(50);
  });

  it('intérêts 2 % : hook 7n — DÉSACTIVÉ sans trait de civilisation', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 10_000;
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.treasury).toBe(10_000); // aucun intérêt (aucun trait)
    expect(treasuryInterestOf(out.players['p1']!)).toBe(0);
  });

  it('migration 14 → 15 : gold → treasury (report intégral) + economyMilestonesClaimed 0', () => {
    const v14 = {
      schemaVersion: 14,
      turn: 3,
      players: { p1: { id: 'p1', gold: 123, science: 0, vision: { explored: [], visible: [] }, missedTurns: 0 } },
      units: {},
      cities: {},
      diplomacy: { war: [] },
    };
    const out = migrateState(v14 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(15);
    expect(out.players['p1']!.treasury).toBe(123); // report de l'ancien or (zéro perte)
    expect(out.players['p1']!.economyMilestonesClaimed).toBe(0);
    expect('gold' in out.players['p1']!).toBe(false);
    expect(typeof MIGRATIONS[15]).toBe('function');
  });

  it('diffusion : la trésorerie de l\'ADVERSAIRE n\'est PAS publique (filtrée à 0 — hook 7m)', () => {
    const state = capitalState();
    state.players['p2']!.treasury = 5_000;
    const filtered = getFilteredState(state, 'p1');
    expect(filtered.players['p1']!.treasury).toBe(0); // la mienne : visible
    expect(filtered.players['p2']!.treasury).toBe(0); // la sienne : masquée
    expect(filtered.players['p2']!.economyMilestonesClaimed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bloc 2 — R-135 · Rush-buy
// ---------------------------------------------------------------------------

describe('7l · R-135 · formule du rush-buy (marteaux restants × facteur d\'ère)', () => {
  it('facteurs data-driven 🔶 : Antique ×2, Médiévale ×3, Industrielle ×5 (proposé), Moderne ×8', () => {
    expect(eraRushFactorFor([])).toBe(2);
    expect(eraRushFactorFor(['banque'])).toBe(3); // 'banque' = tech médiévale de l'arbre
    expect(eraRushFactorFor(['machine_a_vapeur'])).toBe(5);
    expect(eraRushFactorFor(['vol_spatial'])).toBe(8);
  });

  it('Guerrier à 0 marteau en Antique = ×2 du coût (20 or) — exemple chiffré du doc', () => {
    const state = capitalState();
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    expect(rushBuyCostOf(state, state.cities['c1']!)).toBe(20);
  });

  it('linéaire : marteaux investis déduits (Guerrier 4/10 → 6 restants ×2 = 12)', () => {
    const state = capitalState();
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 4 };
    expect(rushBuyCostOf(state, state.cities['c1']!)).toBe(12);
  });

  it('exemples du doc : Marché médiéval 180, Banque médiévale 360, Banque moderne 960, Bibliothèque moderne 320', () => {
    const medieval = capitalState();
    medieval.players['p1']!.techsUnlocked = ['banque']; // tech médiévale (ère de l'empire)
    medieval.cities['c1']!.production = { item: { kind: 'building', id: 'marche' }, progress: 0 };
    expect(rushBuyCostOf(medieval, medieval.cities['c1']!)).toBe(180); // 60 × 3
    medieval.cities['c1']!.production = { item: { kind: 'building', id: 'banque' }, progress: 0 };
    medieval.cities['c1']!.buildings = ['marche']; // prérequis R-111 (hors coût)
    expect(rushBuyCostOf(medieval, medieval.cities['c1']!)).toBe(360); // 120 × 3
    const modern = capitalState();
    modern.players['p1']!.techsUnlocked = ['vol_spatial'];
    modern.cities['c1']!.production = { item: { kind: 'building', id: 'banque' }, progress: 0 };
    expect(rushBuyCostOf(modern, modern.cities['c1']!)).toBe(960); // 120 × 8
    modern.cities['c1']!.production = { item: { kind: 'building', id: 'bibliotheque' }, progress: 0 };
    expect(rushBuyCostOf(modern, modern.cities['c1']!)).toBe(320); // 40 × 8
  });

  it('Complexe militaro-industriel : −20 % visible sur le coût d\'ACHAT des unités militaires', () => {
    const state = capitalState();
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'char_d_assaut' }, progress: 0 }; // 50
    const sans = structuredClone(state);
    expect(rushBuyCostOf(sans, sans.cities['c1']!)).toBe(100); // 50 × 2
    state.cities['c1']!.wonders = ['complexe_militaro_industriel'];
    expect(rushBuyCostOf(state, state.cities['c1']!)).toBe(80); // coût effectif 40 × 2
  });

  it('INTERDITS : Banque mondiale et Nations Unies — aucun coût, aucun achat', () => {
    expect(isRushForbidden({ kind: 'wonder', id: 'banque_mondiale' })).toBe(true);
    expect(isRushForbidden({ kind: 'wonder', id: 'nations_unies' })).toBe(true);
    expect(isRushForbidden({ kind: 'unit', id: 'guerrier' })).toBe(false);
    const state = capitalState();
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'banque_mondiale' }, progress: 0 };
    expect(rushBuyCostOf(state, state.cities['c1']!)).toBeNull();
  });
});

describe('7l · R-135 · exécution du RushBuy (moteur)', () => {
  it('un Guerrier est produit immédiatement, la trésorerie débitée du coût', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 25;
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const result = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(result.newState.players['p1']!.treasury).toBe(5); // 25 − 20
    expect(result.newState.cities['c1']!.production).toBeNull();
    expect(result.newState.units['u1']?.type).toBe('guerrier');
    expect(result.events.some((e) => e.type === 'RushBuy' && e.cost === 20)).toBe(true);
    expect(result.events.some((e) => e.type === 'UnitProduced' && e.unitType === 'guerrier')).toBe(true);
  });

  it('trésorerie insuffisante → ordre ignoré (aucun débit, aucune production)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 19;
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const result = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(result.newState.players['p1']!.treasury).toBe(19);
    expect(result.newState.cities['c1']!.production).toMatchObject({ item: { id: 'guerrier' } });
    expect(Object.keys(result.newState.units)).toHaveLength(0);
  });

  it('un seul rush par ville et par tour (dédoublonnage des ordres)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 100;
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const orders: Order[] = [
      { type: 'RushBuy', cityId: 'c1' },
      { type: 'RushBuy', cityId: 'c1' },
    ];
    const result = resolveTurn(state, { p1: orders }, 1);
    expect(result.events.filter((e) => e.type === 'RushBuy')).toHaveLength(1);
    expect(result.newState.players['p1']!.treasury).toBe(80); // un seul débit de 20
  });

  it('Bâtiment rushé : ajout immédiat (remplacement R-111 applicable)', () => {
    const state = capitalState();
    // ère MÉDIÉVALE (tech 'banque') : Banque 120 → rush 360 ; trésorerie 400.
    state.players['p1']!.treasury = 400;
    state.players['p1']!.techsUnlocked = ['monnaie', 'banque'];
    state.cities['c1']!.buildings = ['marche'];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'banque' }, progress: 0 };
    const result = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(result.newState.cities['c1']!.buildings).toContain('banque');
    expect(result.newState.cities['c1']!.buildings).not.toContain('marche'); // remplacée (R-111)
    expect(result.newState.players['p1']!.treasury).toBe(40); // 400 − (120 × 3)
  });

  it('une ville fondée ce tour peut acheter immédiatement au tour suivant (aucune restriction)', () => {
    let state = capitalState({ units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }] });
    const founded = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1).newState;
    const newCityId = Object.keys(founded.cities).find((id) => id !== 'c1')!;
    founded.players['p1']!.treasury = 100;
    founded.cities[newCityId]!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const result = resolveTurn(founded, { p1: [{ type: 'RushBuy', cityId: newCityId }] }, 2);
    expect(result.events.some((e) => e.type === 'RushBuy' && e.cityId === newCityId)).toBe(true);
  });

  it('Hammer banking proscrit : merveille → ONU/Banque mondiale RÉINITIALISE les marteaux (canon)', () => {
    const state = capitalState();
    state.players['p1']!.cultureMilestones = 20; // ONU déverrouillée
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'stonehenge' }, progress: 40 };
    const result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }] }, 1);
    expect(result.newState.cities['c1']!.production!.item).toEqual({ kind: 'wonder', id: 'nations_unies' });
    // Réinitialisés à 0, puis la production du tour s'ajoute (pop 1 sans case :
    // centre 1 + citoyen intérieur 1 = 2 — R-60bis).
    expect(result.newState.cities['c1']!.production!.progress).toBe(2);
    // Les autres basculements conservent la progression (R-62) : 40 + 2 = 42
    // (Mine de fer 80 — la file ne complète pas ce tour).
    const keep = capitalState();
    keep.players['p1']!.techsUnlocked = ['chemin_de_fer'];
    keep.cities['c1']!.production = { item: { kind: 'wonder', id: 'stonehenge' }, progress: 40 };
    const r2 = resolveTurn(keep, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'mine_de_fer' } }] }, 1);
    expect(r2.newState.cities['c1']!.production!.progress).toBe(42); // conservés + production du tour
  });

  it('interaction C7/R-135 : un projet payé depuis la réserve ne consomme PAS la trésorerie', () => {
    const state = capitalState();
    state.players['p1']!.techsUnlocked = ['rites_funeraires']; // Temple constructible
    state.cities['c1']!.pendingSalvage = 200; // réserve permanente
    const result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'temple' } }] }, 1);
    expect(result.newState.cities['c1']!.buildings).toContain('temple'); // payé en MARTEAUX
    expect(result.newState.players['p1']!.treasury).toBe(0); // or intact
  });
});

// ---------------------------------------------------------------------------
// Bloc 3 — R-136 · Paliers économiques
// ---------------------------------------------------------------------------

describe('7l · R-136 · paliers économiques (ladder canon)', () => {
  it('l\'ordre canon des 8 seuils est en données (economy.json)', () => {
    expect(ECONOMY.milestones.map((m) => m.threshold)).toEqual([100, 250, 500, 1000, 2000, 5000, 10000, 20000]);
    expect(nextEconomyMilestone(0)?.reward).toBe('settler');
    expect(nextEconomyMilestone(7)?.reward).toBe('worldBank');
    expect(nextEconomyMilestone(8)).toBeNull();
  });

  it('100 or → Colon gratuit à la capitale (sans coût de population)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 100;
    const result = resolveTurn(state, {}, 1);
    const settler = Object.values(result.newState.units).find((u) => u.type === 'colon');
    expect(settler).toBeDefined();
    expect(settler!.q).toBe(0); // posé à la capitale
    expect(result.newState.cities['c1']!.pop).toBe(1); // SANS coût pop (récompense)
    expect(result.events.some((e) => e.type === 'EconomyMilestone' && e.threshold === 100)).toBe(true);
    expect(result.events.some((e) => e.type === 'UnitProduced' && e.unitType === 'colon')).toBe(true);
  });

  it('250 or → tech économique gratuite (Monnaie, la première non débloquée)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 250;
    const result = resolveTurn(state, {}, 1);
    expect(result.newState.players['p1']!.techsUnlocked).toContain('monnaie');
    expect(result.events.some((e) => e.type === 'TechResearched' && e.tech === 'monnaie')).toBe(true);
  });

  it('500 or → Grand Personnage gratuit (sans jalon — miroir C2) ; 10 000 → second GP', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 10_500;
    const result = resolveTurn(state, {}, 1);
    const gps = result.events.filter((e) => e.type === 'GreatPersonSpawned');
    expect(gps).toHaveLength(2); // canaux or 500 + 10 000
    expect(result.newState.players['p1']!.cultureMilestones).toBe(0); // PAS de jalon (miroir C2)
    expect(result.newState.players['p1']!.greatPersonsObtained).toBe(2);
  });

  it('1 000 or → Grenier partout ; 5 000 or → Aqueduc partout (R-66/R-111 : déjà dotée = saute)', () => {
    const state = capitalState({ cities: [{ owner: 'p1', q: 0, r: 0, capital: true, pop: 1, buildings: ['palais'] }] });
    state.players['p1']!.treasury = 5_000;
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.buildings).toEqual(expect.arrayContaining(['grenier', 'aqueduc', 'palais']));
    // Un second tour sans changement : pas de re-déclenchement, pas de doublon.
    const again = resolveTurn(out, {}, 2);
    expect(again.events.some((e) => e.type === 'EconomyMilestone')).toBe(false);
    expect(again.newState.cities['c1']!.buildings.filter((b) => b === 'grenier')).toHaveLength(1);
  });

  it('2 000 or → +1 Population dans toutes les villes (citoyens auto-assignés, plafond 31 respecté)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 2_000;
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.pop).toBe(2);
    expect(out.cities['c1']!.workedTiles.length).toBe(2); // +1 citoyen assigné (R-60)
  });

  it('grand saut : tous les paliers tombent DANS L\'ORDRE des seuils, une seule fois chacun', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 25_000;
    const result = resolveTurn(state, {}, 1);
    const milestones = result.events.filter((e) => e.type === 'EconomyMilestone');
    expect(milestones.map((e) => (e as { threshold: number }).threshold)).toEqual([100, 250, 500, 1000, 2000, 5000, 10000, 20000]);
    expect(result.newState.players['p1']!.economyMilestonesClaimed).toBe(8);
    // Tour suivant sans revenu : RIEN ne se redéclenche.
    const next = resolveTurn(result.newState, {}, 2);
    expect(next.events.some((e) => e.type === 'EconomyMilestone')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bloc 4 — R-137 · Banque mondiale & victoire économique
// ---------------------------------------------------------------------------

describe('7l · R-137 · Banque mondiale (condition dynamique, jamais débitée)', () => {
  function issueFor(treasury: number, milestones = 0): string | null {
    const state = capitalState();
    state.players['p1']!.treasury = treasury;
    state.players['p1']!.cultureMilestones = milestones;
    state.players['p1']!.techsUnlocked = ['vol_spatial'];
    return wonderProductionIssue('banque_mondiale', {
      techsUnlocked: state.players['p1']!.techsUnlocked,
      allTechsUnlocked: allKnownTechs(state),
      worldWondersBuilt: [],
      empireWondersBuilt: [],
      empireWondersInProduction: [],
      cultureMilestones: 0,
      treasury,
    });
  }

  it('verrouillée sous 20 000 or, disponible au-dessus (condition DYNAMIQUE)', () => {
    expect(WONDERS['banque_mondiale']!.cost).toBe(500);
    expect(WONDERS['banque_mondiale']!.economicVictory).toBe(true);
    expect(WONDERS['banque_mondiale']!.treasuryRequired).toBe(20_000);
    expect(issueFor(19_999)).toContain('or de trésorerie');
    expect(issueFor(20_000)).toBeNull();
  });

  it('gelée si on repasse SOUS 20 000 pendant le chantier (progression conservée)', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 19_999; // repasse dessous
    state.players['p1']!.techsUnlocked = ['vol_spatial'];
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'banque_mondiale' }, progress: 400 };
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.cities['c1']!.production!.progress).toBe(400); // gelée (pas de production ajoutée)
    expect(out.winner).toBeNull();
  });

  it('complétion → Victory(reason: \'economique\') — l\'or n\'est PAS débité', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 20_000;
    state.players['p1']!.techsUnlocked = ['vol_spatial'];
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'banque_mondiale' }, progress: 499 };
    const result = resolveTurn(state, {}, 1);
    expect(result.newState.cities['c1']!.wonders).toEqual(['banque_mondiale']);
    expect(result.newState.players['p1']!.treasury).toBe(20_000); // CONDITION, pas un prix
    expect(result.newState.winner).toBe('p1');
    expect(result.events.some((e) => e.type === 'Victory' && e.reason === 'economique' && e.winner === 'p1')).toBe(true);
  });

  it('non achetable au rush-buy (R-135) — même à 25 000 or', () => {
    const state = capitalState();
    state.players['p1']!.treasury = 25_000;
    state.players['p1']!.techsUnlocked = ['vol_spatial'];
    state.cities['c1']!.production = { item: { kind: 'wonder', id: 'banque_mondiale' }, progress: 0 };
    const result = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(result.events.some((e) => e.type === 'RushBuy')).toBe(false);
    expect(result.newState.players['p1']!.treasury).toBe(25_000);
    expect(result.newState.cities['c1']!.wonders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bloc 5 — Grand Explorateur / Industriel : Consume or activé
// ---------------------------------------------------------------------------

describe('7l · Bloc 5 · injection d\'or de l\'Explorateur (R-126, données economy.json)', () => {
  function explorerState(techs: string[]): GameState {
    const state = capitalState();
    state.players['p1']!.techsUnlocked = techs;
    state.units['gp1'] = {
      id: 'gp1',
      type: 'explorateur',
      owner: 'p1',
      q: 0,
      r: 0,
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
    return state;
  }

  it('ère Antique : +50 or (50/100/200/400 par ère — doc d\'Erik)', () => {
    expect(explorerGoldInjectionFor([])).toBe(50);
    expect(explorerGoldInjectionFor(['banque'])).toBe(100);
    expect(explorerGoldInjectionFor(['machine_a_vapeur'])).toBe(200);
    expect(explorerGoldInjectionFor(['vol_spatial'])).toBe(400);
    const result = resolveTurn(explorerState([]), { p1: [{ type: 'GreatPersonAction', unitId: 'gp1', action: 'consume', cityId: 'c1' }] }, 1);
    expect(result.newState.players['p1']!.treasury).toBe(50);
    expect(result.newState.units['gp1']).toBeUndefined(); // le GP disparaît
    const consumed = result.events.find((e) => e.type === 'GreatPersonConsumed');
    expect(consumed).toMatchObject({ type: 'GreatPersonConsumed', unitType: 'explorateur' });
  });

  it('ère Moderne : +400 or', () => {
    const result = resolveTurn(explorerState(['vol_spatial']), { p1: [{ type: 'GreatPersonAction', unitId: 'gp1', action: 'consume', cityId: 'c1' }] }, 1);
    expect(result.newState.players['p1']!.treasury).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Divers — GP posé à distance (régression) et helpers
// ---------------------------------------------------------------------------

describe('7l · régressions transverses', () => {
  it('hexDistance reste cohérent pour les spawns de paliers (sanity)', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });
});
