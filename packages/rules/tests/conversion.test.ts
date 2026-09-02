/**
 * Tests Phase 7b — conversion du commerce des villes (RULES.md §8.2,
 * décisions d'Erik du 01/09/2026) : R-90 révisée (conversion binaire par
 * ville, défaut or, amende R-61), R-88 (Bibliothèque), R-89 (Caserne),
 * action SetConversion, migration v5→v6.
 */
import { describe, expect, it } from 'vitest';
import { makeState, grassMap } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { applySetConversion, conversionGains, CONVERSION_DEFAULT } from '../src/conversion.js';
import { CURRENT_SCHEMA_VERSION, migrateState } from '../src/state.js';
import type { GameState } from '../src/state.js';

describe('conversionGains · R-90 révisée (conversion binaire par ville)', () => {
  it('R-90 : sans bibliothèque, or = tout le commerce, science = 0', () => {
    expect(conversionGains(5, 'gold', [])).toEqual({ gold: 5, science: 0 });
    expect(conversionGains(1, 'gold', [])).toEqual({ gold: 1, science: 0 });
    expect(conversionGains(0, 'gold', [])).toEqual({ gold: 0, science: 0 });
  });

  it('R-90 : sans bibliothèque, science = tout le commerce, or = 0', () => {
    expect(conversionGains(5, 'science', [])).toEqual({ gold: 0, science: 5 });
    expect(conversionGains(12, 'science', [])).toEqual({ gold: 0, science: 12 });
  });

  it('R-90 : la conversion est binaire — jamais de partage du commerce', () => {
    for (const c of [1, 2, 7, 12]) {
      for (const conv of ['gold', 'science'] as const) {
        const g = conversionGains(c, conv, []);
        expect(g.gold === c || g.science === c).toBe(true);
        expect(g.gold + g.science).toBe(c);
      }
    }
  });
});

describe('conversionGains · R-88 (Bibliothèque)', () => {
  it('R-88 : conversion or — C or + max(1 ; round(C×0,2)) science', () => {
    // exemples validés par Erik : 5 → 5 or + 1 science ; 12 → 12 or + 2 science
    expect(conversionGains(5, 'gold', ['bibliotheque'])).toEqual({ gold: 5, science: 1 });
    expect(conversionGains(12, 'gold', ['bibliotheque'])).toEqual({ gold: 12, science: 2 });
    // arrondi au plus proche : 0,2×2 = 0,4 → 0 ; 0,2×3 = 0,6 → 1 ; 0,2×8 = 1,6 → 2
    expect(conversionGains(2, 'gold', ['bibliotheque']).science).toBe(1); // max(1 ; 0)
    expect(conversionGains(3, 'gold', ['bibliotheque']).science).toBe(1);
    expect(conversionGains(8, 'gold', ['bibliotheque']).science).toBe(2);
  });

  it('R-88 : cas limite tranché — 0 commerce avec bibliothèque = 1 science/tour', () => {
    expect(conversionGains(0, 'gold', ['bibliotheque'])).toEqual({ gold: 0, science: 1 });
  });

  it('R-88 : conversion science — round(C×1,5) science, 0 or (arrondi au plus proche)', () => {
    // exemple validé par Erik : 12 → 18 science
    expect(conversionGains(12, 'science', ['bibliotheque'])).toEqual({ gold: 0, science: 18 });
    // impair : 5 → 7,5 → 8 (round half up) ; 7 → 10,5 → 11
    expect(conversionGains(5, 'science', ['bibliotheque']).science).toBe(8);
    expect(conversionGains(7, 'science', ['bibliotheque']).science).toBe(11);
    // 0 commerce : 0 science (rien à convertir, le ×1,5 ne crée rien)
    expect(conversionGains(0, 'science', ['bibliotheque'])).toEqual({ gold: 0, science: 0 });
  });
});

describe('R-90 · défaut et SetConversion (action immédiate)', () => {
  it('CONVERSION_DEFAULT = or (ville neuve et ville capturée)', () => {
    expect(CONVERSION_DEFAULT).toBe('gold');
    const st = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }] });
    expect(st.cities.c1!.conversion).toBe('gold');
  });

  it('R-90 : SetConversion change la conversion d’une ville possédée (pure)', () => {
    const st = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }] });
    const result = applySetConversion(st, 'p1', 'c1', 'science');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.cities.c1!.conversion).toBe('science');
      expect(st.cities.c1!.conversion).toBe('gold'); // entrée non mutée
    }
  });

  it('R-90 : refus — ville inconnue, ville ennemie, cible invalide', () => {
    const st = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
        { id: 'c2', owner: 'p2', q: 5, r: 5 },
      ],
    });
    expect(applySetConversion(st, 'p1', 'cx', 'science')).toMatchObject({ ok: false });
    expect(applySetConversion(st, 'p1', 'c2', 'science')).toMatchObject({ ok: false });
    expect(applySetConversion(st, 'p1', 'c1', 'plat' as never)).toMatchObject({ ok: false });
  });

  it('R-90 : répété = no-op accepté (idempotent)', () => {
    const st = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }] });
    const once = applySetConversion(st, 'p1', 'c1', 'science');
    const twice = applySetConversion((once as { state: GameState }).state, 'p1', 'c1', 'science');
    expect(twice.ok).toBe(true);
  });
});

describe('R-90/R-88 · Phase C — la conversion alimente or et science (resolveTurn)', () => {
  /** Ville p1 avec une case désert travaillée (0/0/1 C) + centre (2/1/1) → C=2. */
  function stateWithConversion(conversion: 'gold' | 'science', buildings: string[] = []): GameState {
    return makeState({
      width: 4,
      height: 4,
      terrainOverrides: { '0,1': 'desert' },
      cities: [
        {
          id: 'c1',
          owner: 'p1',
          q: 0,
          r: 0,
          capital: true,
          pop: 1,
          workedTiles: ['0,1'],
          buildings,
          conversion,
        },
      ],
    });
  }

  it('R-90 : conversion or → or = 2, science = 0 (réserve vide sans tech choisie)', () => {
    const { newState } = resolveTurn(stateWithConversion('gold'), { p1: [], p2: [] }, 7);
    expect(newState.players.p1!.gold).toBe(2);
    expect(newState.players.p1!.scienceStored).toBe(0);
  });

  it('R-90 : conversion science → science = 2 en réserve, or = 0', () => {
    const { newState } = resolveTurn(stateWithConversion('science'), { p1: [], p2: [] }, 7);
    expect(newState.players.p1!.gold).toBe(0);
    expect(newState.players.p1!.scienceStored).toBe(2);
  });

  it('R-88 : ville à bibliothèque en conversion or → 2 or + 1 science (max(1 ; round(0,4)))', () => {
    const { newState } = resolveTurn(stateWithConversion('gold', ['bibliotheque']), { p1: [], p2: [] }, 7);
    expect(newState.players.p1!.gold).toBe(2);
    expect(newState.players.p1!.scienceStored).toBe(1);
  });

  it('R-88 : ville à bibliothèque en conversion science → round(3) = 3 science, 0 or', () => {
    const { newState } = resolveTurn(stateWithConversion('science', ['bibliotheque']), { p1: [], p2: [] }, 7);
    expect(newState.players.p1!.gold).toBe(0);
    expect(newState.players.p1!.scienceStored).toBe(3);
  });

  it('R-88 : la science de la bibliothèque alimente la recherche en cours', () => {
    const st = stateWithConversion('gold', ['bibliotheque']);
    st.players.p1!.researching = 'alphabet';
    const { newState } = resolveTurn(st, { p1: [], p2: [] }, 7);
    expect(newState.players.p1!.scienceProgress['alphabet']).toBe(1);
  });
});

describe('R-89 · Caserne — unités produites vétérans (hors Colon)', () => {
  /** pop 10 → production floor(1 × (1 + 0,25×9)) = 3/tour… progress quasi complète. */
  function cityProducing(item: 'guerrier' | 'colon'): GameState {
    return makeState({
      width: 4,
      height: 4,
      cities: [
        {
          id: 'c1',
          owner: 'p1',
          q: 0,
          r: 0,
          capital: true,
          pop: 10,
          production: { item: { kind: 'unit', id: item }, progress: item === 'guerrier' ? 9 : 19 },
          buildings: ['caserne'],
        },
      ],
    });
  }

  it('R-89 : un Guerrier produit par une ville à Caserne sort vétéran', () => {
    const { newState, events } = resolveTurn(cityProducing('guerrier'), { p1: [], p2: [] }, 7);
    const produced = Object.values(newState.units).find((u) => u.type === 'guerrier');
    expect(produced).toBeDefined();
    expect(produced!.veteran).toBe(true);
    expect(events.some((e) => e.type === 'UnitProduced')).toBe(true);
  });

  it('R-89 : un Colon produit par une ville à Caserne ne sort PAS vétéran', () => {
    const { newState } = resolveTurn(cityProducing('colon'), { p1: [], p2: [] }, 7);
    const produced = Object.values(newState.units).find((u) => u.type === 'colon');
    expect(produced).toBeDefined();
    expect(produced!.veteran).toBe(false);
  });

  it('R-89 : sans Caserne, le Guerrier produit sort sans vétérance', () => {
    const st = cityProducing('guerrier');
    st.cities.c1!.buildings = [];
    const { newState } = resolveTurn(st, { p1: [], p2: [] }, 7);
    const produced = Object.values(newState.units).find((u) => u.type === 'guerrier');
    expect(produced!.veteran).toBe(false);
  });
});

describe('R-90 · capture de ville — conversion réinitialisée à or', () => {
  it('R-90 : une ville scientifique capturée repasse en conversion or', () => {
    const st = makeState({
      width: 6,
      height: 6,
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, conversion: 'science' },
        { id: 'c2', owner: 'p2', q: 5, r: 5 },
      ],
      units: [{ id: 'u9', type: 'guerrier', owner: 'p2', q: 0, r: 0 }],
    });
    // p1 n'a pas d'unité défendant c1 → capture par u9 en Phase B/C
    const p1Orders = Object.values(st.units)
      .filter((u) => u.owner === 'p1')
      .map(() => null)
      .filter(Boolean);
    void p1Orders;
    const { newState, events } = resolveTurn(st, { p1: [], p2: [] }, 7);
    expect(events.some((e) => e.type === 'CityCaptured')).toBe(true);
    expect(newState.cities.c1!.owner).toBe('p2');
    expect(newState.cities.c1!.conversion).toBe('gold');
  });
});

describe('migration v5 → v6 (R-90)', () => {
  it('v6 : chaque ville gagne conversion, défaut or ; champ existant conservé', () => {
    const v5 = {
      schemaVersion: 5,
      cities: {
        c1: { id: 'c1', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTiles: [], buildings: [] },
        c2: { id: 'c2', q: 1, r: 1, owner: 'p2', pop: 1, capital: false, foodStored: 0, production: null, workedTiles: [], buildings: [], conversion: 'science' },
      },
    };
    const out = migrateState(v5 as unknown as Record<string, unknown>) as unknown as Record<string, never>;
    expect(out.schemaVersion).toBe(8);
    const cities = out.cities as unknown as Record<string, { conversion: string }>;
    expect(cities.c1!.conversion).toBe('gold');
    expect(cities.c2!.conversion).toBe('science');
  });

  it('v6 : idempotent (re-migrer un état v6 ne change rien)', () => {
    const v5 = {
      schemaVersion: 5,
      cities: {
        c1: { id: 'c1', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTiles: [], buildings: [] },
      },
    };
    const once = migrateState(v5 as unknown as Record<string, unknown>);
    const twice = migrateState(structuredClone(once) as unknown as Record<string, unknown>);
    expect(twice).toEqual(once);
  });

  it('chaîne complète v1 → v8 sur un état minimal', () => {
    const v1 = {
      schemaVersion: 1,
      turn: 0,
      players: { p1: { id: 'p1', gold: 0, science: 0 } },
      units: {},
      cities: { c1: { id: 'c1', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0, production: null, workedTile: null } },
    };
    const out = migrateState(v1 as unknown as Record<string, unknown>) as unknown as GameState;
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.cities.c1!.conversion).toBe('gold');
  });
});

describe('R-90 · intégrité des données de test', () => {
  it('la map de prairie ne crée pas de ville sans conversion (fixtures)', () => {
    const st = makeState({ width: 2, height: 2, cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0 }] });
    for (const c of Object.values(st.cities)) expect(c.conversion).toBe('gold');
    expect(grassMap(2, 2)).toBeDefined();
  });
});
