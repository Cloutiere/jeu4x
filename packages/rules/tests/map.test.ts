import { describe, expect, it } from 'vitest';
import {
  MapValidationError,
  createInitialState,
  loadBuiltinMap,
  parseMap,
} from '../src/map.js';
import type { MapData } from '../src/map.js';
import { CURRENT_SCHEMA_VERSION } from '../src/state.js';
import { hexDistance, tileKeyOf } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';

/** Petite carte valide 6×4 de prairie, capitales à distance ≥ 12 impossible →
 *  on l'agrandit : la validation de distance exige une carte assez grande. */
function validSmallMap(): MapData {
  // 14 colonnes suffisent : (0,0) ↔ (13,0) → distance 13 ≥ 12.
  return {
    id: 'test',
    name: 'Carte de test',
    width: 14,
    height: 3,
    legend: { g: 'prairie', w: 'eau' },
    rows: ['g'.repeat(14), 'g'.repeat(14), 'g'.repeat(14)],
    players: [
      {
        id: 'p1',
        capital: { q: 0, r: 0 },
        units: [
          { type: 'guerrier', q: 0, r: 0 },
          { type: 'colon', q: 1, r: 0 },
        ],
      },
      {
        id: 'p2',
        capital: { q: 13, r: 0 },
        units: [
          { type: 'guerrier', q: 13, r: 0 },
          { type: 'colon', q: 12, r: 0 },
        ],
      },
    ],
  };
}

describe('L3 · Loader de cartes — validation', () => {
  it('accepte une carte valide et expose le terrain par clé "q,r"', () => {
    const loaded = parseMap(validSmallMap());
    expect(loaded.terrain[tileKeyOf({ q: 0, r: 0 })]).toBe('prairie');
    expect(Object.keys(loaded.terrain)).toHaveLength(14 * 3);
  });

  it('rejette une rangée trop courte', () => {
    const m = validSmallMap();
    m.rows = ['g'.repeat(13), 'g'.repeat(14), 'g'.repeat(14)];
    expect(() => parseMap(m)).toThrow(MapValidationError);
  });

  it('rejette un caractère absent de la légende et un terrain inconnu (terrains connus)', () => {
    const m1 = validSmallMap();
    m1.rows[0] = 'x' + 'g'.repeat(13);
    expect(() => parseMap(m1)).toThrow(/caractère inconnu/);

    const m2 = validSmallMap();
    m2.legend = { g: 'oceane' };
    expect(() => parseMap(m2)).toThrow(/terrain inconnu/);
  });

  it('rejette des capitales trop proches (< 12, décision #7)', () => {
    const m = validSmallMap();
    m.players[1]!.capital = { q: 5, r: 0 };
    m.players[1]!.units = [
      { type: 'guerrier', q: 5, r: 0 },
      { type: 'colon', q: 6, r: 0 },
    ];
    expect(() => parseMap(m)).toThrow(/distance 5 < 12/);
  });

  it('rejette un spawn hors carte ou sur terrain infranchissable (T-11)', () => {
    const m = validSmallMap();
    m.players[1]!.capital = { q: 99, r: 0 };
    expect(() => parseMap(m)).toThrow(/hors carte/);

    const m2 = validSmallMap();
    m2.rows[0] = 'g'.repeat(13) + 'w';
    expect(() => parseMap(m2)).toThrow(/infranchissable/);
  });

  it('rejette un type d’unité inconnu et deux unités sur la même case', () => {
    const m = validSmallMap();
    m.players[0]!.units[0]!.type = 'char';
    expect(() => parseMap(m)).toThrow(/type d'unité inconnu/);

    const m2 = validSmallMap();
    m2.players[0]!.units[1] = { type: 'colon', q: 0, r: 0 };
    expect(() => parseMap(m2)).toThrow(/plus d'une unité/);
  });

  it('v1 : exactement deux joueurs', () => {
    const m = validSmallMap();
    m.players = m.players.slice(0, 1);
    expect(() => parseMap(m)).toThrow(/2 joueurs/);
  });
});

describe('L3 · Cartes 40×40 commises', () => {
  it('pédagogique : 1600 cases, terrains connus, aucune eau (T-11)', async () => {
    const loaded = await loadBuiltinMap('pedagogique-40');
    expect(Object.keys(loaded.terrain)).toHaveLength(1600);
    for (const t of Object.values(loaded.terrain)) {
      expect(TERRAINS[t]).toBeDefined();
      expect(t).not.toBe('eau');
    }
  });

  it('pangée : eau infranchissable en bordure uniquement (T-11), continents intérieurs praticables', async () => {
    const loaded = await loadBuiltinMap('pangee-40');
    expect(Object.keys(loaded.terrain)).toHaveLength(1600);
    const rows = loaded.data.rows;
    for (let r = 0; r < 40; r++) {
      expect(rows[r]![0]).toBe('w'); // bordure ouest
      expect(rows[r]![39]).toBe('w'); // bordure est
    }
    // le centre de la carte est de la terre ferme
    for (let r = 15; r < 25; r++) {
      for (let c = 15; c < 25; c++) {
        expect(rows[r]![c]).not.toBe('w');
      }
    }
  });

  it('les deux cartes ont des spawns valides et symétriques à distance ≥ 12', async () => {
    for (const id of ['pedagogique-40', 'pangee-40'] as const) {
      const loaded = await loadBuiltinMap(id);
      const [p1, p2] = loaded.spawns;
      const d = hexDistance(p1!.capital, p2!.capital);
      expect(d).toBeGreaterThanOrEqual(12);
      for (const p of loaded.spawns) {
        expect(p.units).toHaveLength(2); // 1 Guerrier + 1 Colon (décision #7)
        expect(p.units.map((u) => u.type).sort()).toEqual(['colon', 'guerrier']);
      }
    }
  });
});

describe('L3 · createInitialState', () => {
  it('capitales fondées (pop 1, capital), unités placées, guerre permanente, vision initiale', async () => {
    const loaded = await loadBuiltinMap('pangee-40');
    const state = createInitialState(loaded, 42);
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.turn).toBe(0);
    expect(state.rngSeed).toBe(42);
    expect(Object.keys(state.cities)).toEqual(['c1', 'c2']);
    for (const city of Object.values(state.cities)) {
      expect(city.pop).toBe(1);
      expect(city.capital).toBe(true);
      // la case de capitale porte le terrain "ville" (RULES.md §2)
      expect(state.map[tileKeyOf(city)]!.terrain).toBe('ville');
    }
    expect(Object.keys(state.units)).toHaveLength(4);
    expect(state.diplomacy.war).toEqual([['p1', 'p2']]);
    // chaque joueur voit au moins sa capitale (rayon ville T-08 = 3)
    for (const p of Object.values(state.players)) {
      expect(p.vision.visible.length).toBeGreaterThanOrEqual(1);
      expect(p.vision.explored).toEqual(p.vision.visible);
    }
  });
});
