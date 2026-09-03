import { describe, expect, it } from 'vitest';
import {
  MapValidationError,
  createInitialState,
  loadBuiltinMap,
  parseMap,
} from '../src/map.js';
import type { MapData } from '../src/map.js';
import { CURRENT_SCHEMA_VERSION } from '../src/state.js';
import { hexDistance, tileKeyOf, colRowToHex } from '../src/hex.js';
import { RESOURCES, TERRAINS, isWaterTerrain } from '../src/data.js';
import type { TerrainId } from '../src/types.js';

/** Petite carte valide 14×3 de prairie, capitales à distance 13 ≥ 12.
 *  Démarrage conforme (décision d'Erik du 01/09) : 1 Guerrier adjacent. */
function validSmallMap(): MapData {
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
        units: [{ type: 'guerrier', q: 1, r: 0 }],
      },
      {
        id: 'p2',
        capital: { q: 13, r: 0 },
        units: [{ type: 'guerrier', q: 12, r: 0 }],
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
    m.players[1]!.units = [{ type: 'guerrier', q: 6, r: 0 }];
    expect(() => parseMap(m)).toThrow(/distance 5 < 12/);
  });

  it('rejette un spawn hors carte ou sur terrain infranchissable (T-11)', () => {
    const m = validSmallMap();
    m.players[1]!.capital = { q: 99, r: 0 };
    expect(() => parseMap(m)).toThrow(/hors carte/);

    const m2 = validSmallMap();
    m2.rows[0] = 'g'.repeat(13) + 'w';
    m2.players[1]!.units = [{ type: 'guerrier', q: 12, r: 1 }]; // (12,1) reste praticable
    expect(() => parseMap(m2)).toThrow(/infranchissable/);

    const m3 = validSmallMap();
    m3.rows[1] = 'g'.repeat(12) + 'w' + 'g';
    m3.players[1]!.units = [{ type: 'guerrier', q: 12, r: 1 }]; // sur l'eau
    expect(() => parseMap(m3)).toThrow(/infranchissable/);
  });

  it('démarrage conforme (décision d’Erik 01/09) : exactement 1 Guerrier adjacent à la capitale', () => {
    const deuxUnites = validSmallMap();
    deuxUnites.players[0]!.units = [
      { type: 'guerrier', q: 1, r: 0 },
      { type: 'colon', q: 0, r: 1 },
    ];
    expect(() => parseMap(deuxUnites)).toThrow(/exactement 1 unité/);

    const pasUnGuerrier = validSmallMap();
    pasUnGuerrier.players[0]!.units = [{ type: 'colon', q: 1, r: 0 }];
    expect(() => parseMap(pasUnGuerrier)).toThrow(/doit être un Guerrier/);

    const surLaCapitale = validSmallMap();
    surLaCapitale.players[0]!.units = [{ type: 'guerrier', q: 0, r: 0 }];
    expect(() => parseMap(surLaCapitale)).toThrow(/adjacent à la capitale/);

    const tropLoin = validSmallMap();
    tropLoin.players[0]!.units = [{ type: 'guerrier', q: 2, r: 0 }];
    expect(() => parseMap(tropLoin)).toThrow(/adjacent à la capitale/);
  });

  it('rejette deux unités ennemies sur la même case', () => {
    const m = validSmallMap();
    m.players[1]!.units = [{ type: 'guerrier', q: 1, r: 0 }]; // case du Guerrier de p1
    expect(() => parseMap(m)).toThrow(/plus d'une unité/);
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

  it('pangée : eau infranchissable en bordure uniquement (T-11 — côte et océan, Phase 6c), continents intérieurs praticables', async () => {
    const loaded = await loadBuiltinMap('pangee-40');
    expect(Object.keys(loaded.terrain)).toHaveLength(1600);
    const waterAtBorder = { eau: 0, ocean: 0 } as Record<string, number>;
    for (let r = 0; r < 40; r++) {
      for (const c of [0, 39]) {
        const t = loaded.terrain[tileKeyOf(colRowToHex(c, r))]! as TerrainId;
        expect(TERRAINS[t]!.passable, `bordure (${c},${r}) infranchissable`).toBe(false);
        expect(isWaterTerrain(t), `bordure (${c},${r}) est de l'eau`).toBe(true);
        waterAtBorder[t] = (waterAtBorder[t] ?? 0) + 1;
      }
    }
    // Les deux eaux existent sur la bordure (côte le long des terres, océan au large).
    expect(waterAtBorder['eau']).toBeGreaterThan(0);
    expect(waterAtBorder['ocean']).toBeGreaterThan(0);
    // le centre de la carte est de la terre ferme
    for (let r = 15; r < 25; r++) {
      for (let c = 15; c < 25; c++) {
        expect(isWaterTerrain(loaded.terrain[tileKeyOf(colRowToHex(c, r))]! as TerrainId), `centre (${c},${r})`).toBe(false);
      }
    }
  });

  it('variée : 1600 cases, les 8 terrains en quantités significatives (Phase 6c : côte + océan)', async () => {
    const loaded = await loadBuiltinMap('variee-40');
    expect(Object.keys(loaded.terrain)).toHaveLength(1600);
    const counts: Record<string, number> = {};
    for (const t of Object.values(loaded.terrain)) counts[t] = (counts[t] ?? 0) + 1;
    for (const t of ['prairie', 'plaine', 'foret', 'colline', 'montagne', 'desert', 'eau', 'ocean']) {
      expect(counts[t], `terrain ${t} présent en quantité significative`).toBeGreaterThanOrEqual(50);
    }
  });

  it('variée : terrain symétrique par miroir ponctuel (équité)', async () => {
    const loaded = await loadBuiltinMap('variee-40');
    const rows = loaded.data.rows;
    for (let r = 0; r < 40; r++) {
      for (let c = 0; c < 40; c++) {
        expect(rows[r]![c]).toBe(rows[39 - r]![39 - c]!);
      }
    }
  });

  it('les trois cartes ont des spawns valides et symétriques à distance ≥ 12 (démarrage 01/09)', async () => {
    for (const id of ['pedagogique-40', 'pangee-40', 'variee-40'] as const) {
      const loaded = await loadBuiltinMap(id);
      const [p1, p2] = loaded.spawns;
      const d = hexDistance(p1!.capital, p2!.capital);
      expect(d).toBeGreaterThanOrEqual(12);
      for (const p of loaded.spawns) {
        // Décision d'Erik du 01/09 : plus de Colon — 1 Guerrier adjacent à la capitale.
        expect(p.units).toHaveLength(1);
        expect(p.units[0]!.type).toBe('guerrier');
        expect(hexDistance(p.capital, p.units[0]!)).toBe(1);
      }
    }
  });
});

describe('L3 · createInitialState', () => {
  it('capitales fondées (pop 2 — 7i D3, capital), unités placées, guerre permanente, vision initiale', async () => {
    const loaded = await loadBuiltinMap('pangee-40');
    const state = createInitialState(loaded, 42);
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.turn).toBe(0);
    expect(state.rngSeed).toBe(42);
    expect(Object.keys(state.cities)).toEqual(['c1', 'c2']);
    for (const city of Object.values(state.cities)) {
      // 7i · D3 · R-64 (rév.) : capitales préfabriquées à pop 2 (proposal 🔶)
      expect(city.pop).toBe(2);
      expect(city.capital).toBe(true);
      // les 2 citoyens initiaux sont auto-assignés (R-60)
      expect(city.workedTiles).toHaveLength(2);
      // la case de capitale porte le terrain "ville" (RULES.md §2)
      expect(state.map[tileKeyOf(city)]!.terrain).toBe('ville');
    }
    // 1 Guerrier par joueur, adjacent à la capitale (décision d'Erik du 01/09).
    expect(Object.keys(state.units)).toHaveLength(2);
    for (const city of Object.values(state.cities)) {
      const defenders = Object.values(state.units).filter(
        (u) => u.owner === city.owner && hexDistance(u, city) === 1,
      );
      expect(defenders).toHaveLength(1);
      expect(defenders[0]!.type).toBe('guerrier');
    }
    expect(state.diplomacy.war).toEqual([['p1', 'p2']]);
    // chaque joueur voit au moins sa capitale (rayon ville T-08 = 3)
    for (const p of Object.values(state.players)) {
      expect(p.vision.visible.length).toBeGreaterThanOrEqual(1);
      expect(p.vision.explored).toEqual(p.vision.visible);
    }
  });
});

describe('R-94 · placements de ressources — validations du loader', () => {
  /** Les tests construisent volontairement des placements invalides : la
   *  structure n'est pas typée ResourceId ici, le loader valide. */
  function withResources(resources: Array<{ id: string; q: number; r: number }>): MapData {
    return { ...validSmallMap(), resources } as unknown as MapData;
  }

  it('une carte sans `resources` reste valide (champ optionnel)', () => {
    const loaded = parseMap(validSmallMap());
    expect(loaded.resources).toEqual([]);
  });

  it('placements valides : recopiés par createInitialState dans les cases de l’état', () => {
    // la carte de test est toute en prairie : ressources de prairie (betail, encens)
    const loaded = parseMap(withResources([{ id: 'betail', q: 1, r: 0 }, { id: 'encens', q: 5, r: 1 }]));
    expect(loaded.resources).toHaveLength(2);
    const state = createInitialState(loaded, 7);
    expect(state.map[tileKeyOf({ q: 1, r: 0 })]!.resource).toBe('betail');
    expect(state.map[tileKeyOf({ q: 5, r: 1 })]!.resource).toBe('encens');
    expect(state.map[tileKeyOf({ q: 2, r: 0 })]!.resource).toBeNull();
    // les capitales restent sans ressource (terrain ville)
    expect(state.map[tileKeyOf({ q: 0, r: 0 })]!.resource).toBeNull();
  });

  it('rejette un id de ressource inconnu', () => {
    expect(() => parseMap(withResources([{ id: 'diamant', q: 1, r: 0 }]))).toThrow(/ressource inconnue/);
  });

  it('rejette un terrain non autorisé (le scénario étalon : Fer ≠ montagne)', () => {
    // (3,0) est prairie — le Fer n'apparaît que sur colline
    expect(() => parseMap(withResources([{ id: 'fer', q: 3, r: 0 }]))).toThrow(/terrain non autorisé/);
  });

  it('rejette plus d’une ressource sur la même case', () => {
    // (1,0) : colline (fer) + montagne (gemmes) → conflit d'abord, unicité ensuite ;
    // deux ressources compatibles prairie suffisent à tester l'unicité.
    expect(() =>
      parseMap(withResources([{ id: 'betail', q: 5, r: 1 }, { id: 'encens', q: 5, r: 1 }])),
    ).toThrow(/plus d'une ressource/);
  });

  it('rejette une ressource sur une case de capitale', () => {
    // capitale p1 (0,0) : prairie → betail y serait valide hors capitale
    expect(() => parseMap(withResources([{ id: 'betail', q: 0, r: 0 }]))).toThrow(/case de capitale/);
  });

  it('rejette une ressource hors carte', () => {
    expect(() => parseMap(withResources([{ id: 'betail', q: 50, r: 0 }]))).toThrow(/hors carte/);
  });
});

describe('R-94/D6 · les 3 cartes commises sont dotées', () => {
  it('placements valides et « vivantes » v1 posées en priorité (9 vivantes : 7 à tech + Gemmes/Épices)', async () => {
    const vivantes = ['betail', 'boeufs', 'fer', 'gemmes', 'epices', 'poisson', 'baleine', 'soie', 'vin'];
    for (const id of ['pedagogique-40', 'pangee-40', 'variee-40'] as const) {
      const loaded = await loadBuiltinMap(id);
      const ids = loaded.resources.map((r) => r.id);
      expect(ids.length, `${id} : dotée de ressources`).toBeGreaterThanOrEqual(6);
      for (const res of loaded.resources) {
        expect(RESOURCES[res.id], `${id} : ${res.id} connu`).toBeDefined();
      }
      // pangée et variée = jeu complet (≥ 20 placements, vivantes couvertes)
      if (id !== 'pedagogique-40') {
        expect(ids.length, `${id} : jeu complet`).toBeGreaterThanOrEqual(20);
        for (const v of vivantes) expect(ids, `${id} : vivante ${v}`).toContain(v);
      } else {
        // pédagogique : didactique — quelques vivantes seulement
        expect(ids.some((x) => vivantes.includes(x))).toBe(true);
        // aucune ressource maritime (la carte n'a pas d'eau, T-11)
        for (const res of loaded.resources) {
          expect(RESOURCES[res.id]!.terrains, `${id} : ${res.id} non maritime`).not.toContain('eau');
        }
      }
    }
  });

  it('variée : placements symétriques par miroir ponctuel (comme le terrain)', async () => {
    const loaded = await loadBuiltinMap('variee-40');
    const byKey = new Map(loaded.resources.map((r) => [tileKeyOf(r), r]));
    expect(loaded.resources.length).toBeGreaterThan(0);
    for (const res of loaded.resources) {
      const col = res.q + Math.floor(res.r / 2);
      const mirror = { q: 39 - col - Math.floor((39 - res.r) / 2), r: 39 - res.r };
      const twin = byKey.get(tileKeyOf(mirror));
      expect(twin, `miroir de ${res.id} en (${res.q},${res.r})`).toBeDefined();
      expect(twin!.id).toBe(res.id);
    }
  });
});
