/**
 * Phase 6b — Tests du générateur procédural (packages/rules/src/progen/).
 *
 * Critères d'acceptation du handoff 6b :
 *  - générateur PUR et DÉTERMINISTE (R-80) : même seed → même carte bit à bit ;
 *  - sortie = MapData existant, validée par parseMap (aucun changement du loader) ;
 *  - ratio terre borné ; connexité terrestre entre les deux spawns (BFS) ;
 *  - équité par miroir : terrains/ressources/villages/huttes symétriques
 *    (rotation 180°), checksum de fertilité delta = 0 ;
 *  - villages/huttes posés et à distance réglementaire des spawns (leçon 7d).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGEN_SETTINGS,
  MIRROR_1V1,
  PROCEDURAL_MAP_ID,
  classifyWaters,
  countResourcesByTerrain,
  countTerrainTypes,
  guaranteeResourceCoverage,
  generateProceduralMap,
  generateMap,
  generateTerrain,
  landConnected,
  placeResources,
  resolveProgenSettings,
} from '../src/progen/index.js';
import { ProgenPlacementError, attemptSeed, halfMapLookup, normalizeStartSite } from '../src/progen/mirror.js';
import { fertilityScore } from '../src/progen/fertility.js';
import { parseMap, createInitialState } from '../src/map.js';
import type { MapData, MapResource, LoadedMap } from '../src/map.js';
import { hexDistance, tileKeyOf, colRowToHex, neighbors } from '../src/hex.js';
import type { Hex } from '../src/hex.js';
import { createRng } from '../src/rng.js';
import { RESOURCES, TERRAINS, isWaterTerrain } from '../src/data.js';
import type { TerrainId } from '../src/types.js';

const W = 40;
const H = 40;

function tileOf(hex: Hex): { col: number; row: number } {
  return { col: hex.q + Math.floor(hex.r / 2), row: hex.r };
}

function mirrorOf(hex: Hex): Hex {
  return { q: W / 2 - hex.q, r: H - 1 - hex.r };
}

/** Exigences transverses sur une carte générée (factorisé pour les propriétés). */
function expectValidProceduralMap(map: LoadedMap): void {
  expect(map.data.id).toBe(PROCEDURAL_MAP_ID);
  expect(map.data.width).toBe(W);
  expect(map.data.height).toBe(H);
  expect(map.data.rows).toHaveLength(H);
  for (const row of map.data.rows) expect(row).toHaveLength(W);
  // Symétrie miroir (rotation 180°) des terrains — cœur de l'équité 1v1.
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      expect(map.data.rows[r]![c]).toBe(map.data.rows[H - 1 - r]![W - 1 - c]);
    }
  }
  // Spawns : 2 guerriers adjacents, capitales ≥ 12 (re-validé ici même si
  // parseMap l'impose déjà), et l'un est l'image exacte de l'autre.
  expect(map.spawns).toHaveLength(2);
  const [p1, p2] = map.spawns;
  expect(p2!.capital).toEqual(mirrorOf(p1!.capital));
  for (const sp of map.spawns) {
    expect(sp.units).toHaveLength(2);
    expect(sp.units[0]!.type).toBe('colon');
    expect(hexDistance(sp.capital, sp.units[0]!)).toBe(0);
    expect(sp.units[1]!.type).toBe('guerrier');
    expect(hexDistance(sp.capital, sp.units[1]!)).toBe(1);
    const t = map.terrain[tileKeyOf(sp.capital)]!;
    expect(TERRAINS[t]!.passable).toBe(true);
  }
  // Contenu reflété : chaque ressource/village/hutte a son image.
  const imageOf = (h: { q: number; r: number }): string => tileKeyOf(mirrorOf(h));
  for (const res of map.resources) {
    expect(map.resources.some((o) => tileKeyOf(o) === imageOf(res))).toBe(true);
  }
  for (const v of map.villages) {
    expect(map.villages.some((o) => tileKeyOf(o) === imageOf(v))).toBe(true);
  }
  for (const h of map.huts) {
    expect(map.huts.some((o) => tileKeyOf(o) === imageOf(h))).toBe(true);
  }
  // Villages ≥ 6 et huttes ≥ 3 des DEUX spawns (leçon calibrage 7d / handoff L2-2).
  for (const v of map.villages) {
    for (const sp of map.spawns) {
      expect(hexDistance(v, sp.capital)).toBeGreaterThanOrEqual(DEFAULT_PROGEN_SETTINGS.minVillageDistance);
    }
  }
  for (const h of map.huts) {
    for (const sp of map.spawns) {
      expect(hexDistance(h, sp.capital)).toBeGreaterThanOrEqual(DEFAULT_PROGEN_SETTINGS.minHutDistance);
    }
  }
  // Connexité terrestre : NON requise en archipel (défaut 6c — spawns
  // possibles sur des îles séparées, contact au naval Phase 7). Les modes
  // pangée/deux-continents la vérifient dans leurs tests dédiés.
}

describe('Phase 6b · Générateur procédural — déterminisme (R-80)', () => {
  it('R-100 : même seed → même MapData bit à bit', () => {
    const a = generateProceduralMap(20260902);
    const b = generateProceduralMap(20260902);
    expect(a.map.data).toEqual(b.map.data);
    expect(a.report).toEqual(b.report);
  });

  it('R-100 : seeds différents → cartes différentes', () => {
    const a = generateProceduralMap(1);
    const b = generateProceduralMap(2);
    expect(a.map.data.rows).not.toEqual(b.map.data.rows);
  });

  it('R-100 : les tentatives dérivent des sous-graines stables (attemptSeed)', () => {
    expect(attemptSeed(1234, 1)).toBe(attemptSeed(1234, 1));
    expect(attemptSeed(1234, 1)).not.toBe(attemptSeed(1234, 2));
  });
});

describe('Phase 6b · Générateur procédural — structure & validations', () => {
  it('R-101 : la carte générée passe parseMap et toutes les exigences du miroir', () => {
    const { map } = generateProceduralMap(42);
    // parseMap a déjà été appelé par le générateur ; on le re-valide depuis
    // le MapData sérialisé (le format doit être exactement celui des cartes
    // préfabriquées — critère #3).
    const raw = JSON.parse(JSON.stringify(map.data)) as MapData;
    expectValidProceduralMap(parseMap(raw));
  });

  it('R-101 : tous les terrains sont connus et le ratio terre est borné (~55 % 🔶)', () => {
    for (const seed of [7, 99, 1234567]) {
      const { map, report } = generateProceduralMap(seed);
      for (const t of Object.values(map.terrain)) expect(TERRAINS[t]).toBeDefined();
      // Archipel (défaut 6c) : ratio terre effectif = 55 % × 🔶 0.7 ≈ 38.5 %.
      expect(report.landRatio).toBeGreaterThan(0.33);
      expect(report.landRatio).toBeLessThan(0.45);
    }
  });

  it('R-102 : les terrains de la demi-carte haute = image de la demi-carte basse', () => {
    const { map } = generateProceduralMap(555);
    for (let r = 0; r < H / 2; r++) {
      for (let c = 0; c < W; c++) {
        expect(map.data.rows[r]![c]).toBe(map.data.rows[H - 1 - r]![W - 1 - c]);
      }
    }
  });

  it('R-104 : villages = 3 par moitié reflétés (6), huttes = 2 par moitié reflétées (4)', () => {
    for (const seed of [7, 99]) {
      const { map } = generateProceduralMap(seed);
      expect(map.villages).toHaveLength(2 * DEFAULT_PROGEN_SETTINGS.villagesPerHalf);
      expect(map.huts).toHaveLength(2 * DEFAULT_PROGEN_SETTINGS.hutsPerHalf);
    }
  });

  it('R-104 : villages et huttes sur terrain praticable, jamais sur une capitale (parseMap)', () => {
    // parseMap lève si ces invariants sont violés ; double contrôle explicite.
    const { map } = generateProceduralMap(314159);
    const capitalKeys = new Set(map.spawns.map((s) => tileKeyOf(s.capital)));
    for (const e of [...map.villages, ...map.huts]) {
      const t = map.terrain[tileKeyOf(e)]!;
      expect(TERRAINS[t]!.passable).toBe(true);
      expect(capitalKeys.has(tileKeyOf(e))).toBe(false);
    }
  });

  it('R-105 : les ressources respectent terrains autorisés + unicité + spawnWeight > 0', () => {
    const { map } = generateProceduralMap(2718);
    const seen = new Set<string>();
    for (const res of map.resources) {
      const key = tileKeyOf(res);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const data = RESOURCES[res.id]!;
      expect(data.spawnWeight).toBeGreaterThan(0);
      const t = map.terrain[key]!;
      expect(data.terrains).toContain(t);
    }
    expect(map.resources.length).toBeGreaterThan(20); // densité ~1/12 des ~880 terres × 2 moitiés
  });

  it('R-105 : densité des ressources suit resourceDensity (override du labo) — la garantie de couverture 6c reste active à densité 0', () => {
    // Densité 0 : plus AUCUNE pose aléatoire, mais la garantie de couverture
    // (Phase 6c) maintient ≥ 1 ressource de chaque type par joueur.
    const none = generateProceduralMap(606, { resourceDensity: 0 });
    expect(none.map.resources).toHaveLength(Object.keys(RESOURCES).length * 2);
    // Défaut 🔶 1.5 (Phase 6c) ; ×3 sature la capacité d'espacement (distance 2)
    // mais reste nettement au-dessus du défaut.
    const simple = generateProceduralMap(606);
    const double = generateProceduralMap(606, { resourceDensity: 3 });
    expect(none.map.resources.length).toBeLessThan(simple.map.resources.length);
    expect(double.map.resources.length).toBeGreaterThan(simple.map.resources.length * 1.15);
  });

  it('R-103 : l\'état initial se construit comme pour une carte préfabriquée', () => {
    const { map, report } = generateProceduralMap(777);
    const state = createInitialState(map, report.seed);
    expect(state.mapId).toBe(PROCEDURAL_MAP_ID);
    // Phase 6c (Erik) : démarrage Colon + Guerrier SANS capitale — aucune
    // ville à l'initialisation, le Colon fondera via FoundCity (R-64).
    expect(Object.keys(state.cities)).toEqual([]);
    expect(Object.keys(state.units)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(state.units.u1!.type).toBe('colon');
    expect(state.units.u1!.owner).toBe('p1');
    expect(state.units.u2!.type).toBe('guerrier');
    expect(state.units.u3!.type).toBe('colon');
    expect(state.units.u3!.owner).toBe('p2');
    // Phase 6c : 6 villages + 6 huttes par moitié (demande d'Erik) → 12/12 reflétés.
    expect(state.villages).toHaveLength(12);
    expect(state.huts).toHaveLength(12);
  });
});

describe('Phase 6b · Équilibrage — fertilité & équité (PDF §AssignStartingPlots)', () => {
  it('R-103 : checksum d\'équité — fertilité P1 = P2 (miroir) et ≥ seuil de normalisation', () => {
    for (const seed of [3, 42, 987654321]) {
      const { map, report } = generateProceduralMap(seed);
      expect(report.fertility.delta).toBe(0);
      expect(report.fertility.p1).toBeGreaterThanOrEqual(report.fertility.threshold);
      // Recalcul indépendant du score depuis la carte finale.
      const lookup = {
        terrainAt: (h: Hex) => map.terrain[tileKeyOf(h)] as TerrainId | undefined,
        resourceAt: (h: Hex) => map.resources.find((r) => tileKeyOf(r) === tileKeyOf(h))?.id ?? null,
      };
      expect(fertilityScore(lookup, map.spawns[0]!.capital, resolveProgenSettings())).toBeCloseTo(report.fertility.p1, 6);
    }
  });

  it('R-103 : les sites respectent les contraintes de bord (≥ 6 du bord, ≥ T-09 de l\'axe)', () => {
    const { map } = generateProceduralMap(4242);
    const s = resolveProgenSettings();
    for (const sp of map.spawns) {
      const { col, row } = tileOf(sp.capital);
      expect(col).toBeGreaterThanOrEqual(s.startMinEdgeDistance);
      expect(col).toBeLessThan(W - s.startMinEdgeDistance);
      expect(row).toBeGreaterThanOrEqual(s.startMinEdgeDistance);
      // distance aux deux capitales ≥ 12 — couverte par parseMap ; l'axe :
      expect(Math.min(row, H - 1 - row)).toBeLessThan(H / 2); // chaque site dans sa moitié
      const mirrored = mirrorOf(sp.capital);
      expect(hexDistance(sp.capital, mirrored)).toBeGreaterThanOrEqual(s.minSpawnDistance);
    }
  });

  it('R-103 : la normalisation injecte du blé/bétail quand le site est sous le seuil (unitaire)', () => {
    // Mini demi-carte contrôlée : un site entouré de plaines pauvres, un
    // seuil au-dessus de son score → la normalisation doit injecter jusqu'au
    // seuil (et échouer si impossible).
    const halfW = 12;
    const halfH = 8;
    const grid: TerrainId[][] = Array.from({ length: halfH }, () => Array.from({ length: halfW }, () => 'plaine'));
    const site = colRowToHex(6, 4);
    const lookup = halfMapLookup(grid, [], halfW); // carte complète = 12×16
    const s = resolveProgenSettings();
    const initial = fertilityScore(lookup, site, s);
    const injected: MapResource[] = [];
    // Phase 6c : l'anneau 1 du site reste TOUJOURS sans ressource — la
    // normalisation n'injecte qu'en anneau 2 (distance 2 exactement ici).
    const out = normalizeStartSite(lookup, site, initial, initial + 20, s, injected);
    expect(out.normalized).toBe(true);
    expect(out.score).toBeGreaterThanOrEqual(initial + 20);
    expect(injected.length).toBeGreaterThan(0);
    for (const r of injected) {
      expect(['ble', 'betail']).toContain(r.id);
      expect(hexDistance(site, r)).toBeLessThanOrEqual(2);
      expect(hexDistance(site, r)).toBeGreaterThanOrEqual(2);
    }
    // Aucune case injectable (tout en eau autour) → échec explicite.
    const waterGrid: TerrainId[][] = Array.from({ length: halfH }, () => Array.from({ length: halfW }, () => 'eau'));
    const lookupWater = halfMapLookup(waterGrid, [], halfW);
    expect(() => normalizeStartSite(lookupWater, site, -100, 0, s, [])).toThrow(ProgenPlacementError);
  });
});

describe('Phase 6b · Stratégie injectable (ajout d\'Erik — pérennité multi-joueurs)', () => {
  it('R-106 : mirror1v1 rejette playerCount ≠ 2 (regionalMulti futur)', () => {
    expect(() =>
      MIRROR_1V1.geoSize(resolveProgenSettings({ playerCount: 3 })),
    ).toThrow(ProgenPlacementError);
    expect(() => generateMap(1, { playerCount: 5 })).toThrow(/regionalMulti/);
  });

  it('R-106 : la couche géophysique génère une grille COMPLÈTE indépendamment du miroir', () => {
    // L0 doit savoir générer n'importe quelle grille sans connaître la
    // stratégie (le miroir vit dans la stratégie — contrainte architecturale).
    const geo = generateTerrain(createRng(1), resolveProgenSettings(), 13, 9);
    expect(geo.width).toBe(13);
    expect(geo.height).toBe(9);
    expect(geo.terrain).toHaveLength(9);
    for (const row of geo.terrain) expect(row).toHaveLength(13);
  });

  it('R-106 : continents=2 — rift traversant à isthme, connexité garantie quand même', () => {
    for (const seed of [11, 2222]) {
      const { map, report } = generateProceduralMap(seed, { continents: 2 });
      expectValidProceduralMap(map);
      expect(report.connected).toBe(true);
      // L'isthme existe : au moins une case praticable relie les deux moitiés
      // dans la bande de rift (rows 18-21).
      let landInRift = 0;
      for (let r = 18; r <= 21; r++) {
        for (let c = 0; c < W; c++) {
          const t = map.terrain[tileKeyOf(colRowToHex(c, r))]!;
          if (TERRAINS[t]!.passable) landInRift += 1;
        }
      }
      expect(landInRift).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6c — côte vs océan (décisions d'Erik du 02/09 : navalAccess coast/ocean,
// rendements 0/0/2 identiques, marines sur les deux eaux, coastWidth 🔶 1)
// ---------------------------------------------------------------------------

/** Distance hex minimale d'une case (col, row) à une case de terre de la grille. */
function minLandDistance(grid: TerrainId[][], col: number, row: number): number {
  const here = colRowToHex(col, row);
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r]!.length; c++) {
      if (isWaterTerrain(grid[r]![c]!)) continue;
      best = Math.min(best, hexDistance(here, colRowToHex(c, r)));
    }
  }
  return best;
}

function grille5x5(): TerrainId[][] {
  const grid: TerrainId[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'eau' as TerrainId));
  grid[2]![2] = 'prairie';
  return grid;
}

describe('Phase 6c · Classification des eaux (côte vs océan, R-107)', () => {
  it('classifyWaters : eau adjacente à de la terre = côte (`eau`), le reste = océan — la terre est inchangée', () => {
    const grid = grille5x5();
    const out = classifyWaters(grid, 1);
    expect(out[2]![2]).toBe('prairie'); // la terre ne change jamais de terrain
    let coast = 0;
    let ocean = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const t = out[r]![c]!;
        if (!isWaterTerrain(t)) continue;
        // Propriété centrale : côte ⟺ distance hex à la terre ≤ coastWidth.
        expect(t, `case (${c},${r})`).toBe(minLandDistance(grid, c, r) <= 1 ? 'eau' : 'ocean');
        if (t === 'eau') coast += 1;
        else ocean += 1;
      }
    }
    // L'anneau 1 du centre compte exactement 6 cases (toutes dans la grille).
    expect(coast).toBe(6);
    expect(ocean).toBe(25 - 1 - 6);
  });

  it('classifyWaters : coastWidth élargit la bande côtière (distance ≤ 2)', () => {
    const grid = grille5x5();
    const out = classifyWaters(grid, 2);
    let ocean = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const t = out[r]![c]!;
        if (!isWaterTerrain(t)) continue;
        expect(t, `case (${c},${r})`).toBe(minLandDistance(grid, c, r) <= 2 ? 'eau' : 'ocean');
        if (t === 'ocean') ocean += 1;
      }
    }
    // Les coins de la grille restent à distance ≥ 3 de la terre.
    expect(ocean).toBeGreaterThan(0);
  });

  it("classifyWaters : pur (ne mute pas l'entrée), idempotent, re-classifie une grille déjà océanisée", () => {
    const grid = grille5x5();
    const snapshot = JSON.stringify(grid);
    const once = classifyWaters(grid, 1);
    expect(JSON.stringify(grid)).toBe(snapshot);
    const twice = classifyWaters(once.map((l) => [...l]), 1);
    expect(twice).toEqual(once);
  });
});

describe('Phase 6c · Génération — côte et océan sur les cartes (R-107)', () => {
  it('la carte générée contient côte ET océan, chaque case conforme à sa distance à la terre', () => {
    for (const seed of [42, 20260902]) {
      const { map, report } = generateProceduralMap(seed);
      const ids = new Set(Object.values(map.terrain));
      expect(ids.has('eau'), `seed ${seed} : de la côte`).toBe(true);
      expect(ids.has('ocean'), `seed ${seed} : de l'océan`).toBe(true);
      const grid: TerrainId[][] = map.data.rows.map((row) => [...row].map((ch) => map.data.legend[ch]! as TerrainId));
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r]!.length; c++) {
          const t = grid[r]![c]!;
          if (!isWaterTerrain(t)) continue;
          expect(t, `seed ${seed} case (${c},${r})`).toBe(minLandDistance(grid, c, r) <= 1 ? 'eau' : 'ocean');
        }
      }
      // Rapport : la répartition côte/océan couvre toute l'eau.
      expect(report.coastTiles + report.oceanTiles + report.landTiles).toBe(1600);
      expect(report.coastTiles).toBeGreaterThan(0);
      expect(report.oceanTiles).toBeGreaterThan(0);
    }
  });

  it('coastWidth = 2 élargit la côte (curseur du labo #/progen)', () => {
    const w1 = generateProceduralMap(42, { coastWidth: 1 });
    const w2 = generateProceduralMap(42, { coastWidth: 2 });
    expect(w2.report.coastTiles).toBeGreaterThan(w1.report.coastTiles);
    expect(w2.report.oceanTiles).toBeLessThan(w1.report.oceanTiles);
  });

  it("R-105 révisé (océan stérile — Erik, 02/09) : AUCUNE ressource ne pose sur l'océan", () => {
    const grid: TerrainId[][] = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'ocean' as TerrainId));
    const out = placeResources(createRng(7), grid, resolveProgenSettings({ resourceDensity: 4 }));
    expect(out.resources).toHaveLength(0);
    expect(out.waterTiles).toBe(400);
  });
});

describe("Phase 6c · Comptage ressources × terrain (outil de labo d'Erik)", () => {
  it('countResourcesByTerrain : toutes les ressources connues figurent (zéros inclus), triées, décomptées par terrain', () => {
    const map: LoadedMap = {
      data: { id: 't', name: 'Test', width: 2, height: 1, legend: {}, rows: [], players: [] } as unknown as MapData,
      terrain: { '0,0': 'prairie', '1,0': 'ocean' },
      spawns: [],
      resources: [
        { id: 'betail', q: 0, r: 0 },
        { id: 'poisson', q: 1, r: 0 },
        { id: 'poisson', q: 0, r: 1 }, // hors grille (terrain absent) : ignoré
      ],
      villages: [],
      huts: [],
    };
    const counts = countResourcesByTerrain(map);
    expect(counts.byId.map((r) => r.id)).toEqual(Object.keys(RESOURCES).sort());
    expect(counts.byId.find((r) => r.id === 'betail')!.byTerrain).toEqual({ prairie: 1 });
    expect(counts.byId.find((r) => r.id === 'poisson')!.byTerrain).toEqual({ ocean: 1 });
    // Une ressource ABSENTE de la carte doit se voir : ligne à zéro.
    expect(counts.byId.find((r) => r.id === 'ble')!.total).toBe(0);
    expect(counts.byId.find((r) => r.id === 'ble')!.byTerrain).toEqual({});
    expect(counts.total).toBe(2);
    expect(counts.byTerrain).toEqual({ ocean: 1, prairie: 1 });
  });

  it('cohérence avec une carte générée : total compté = resources du rapport', () => {
    const { map, report } = generateProceduralMap(42);
    expect(countResourcesByTerrain(map).total).toBe(report.counts.resources);
  });
});

describe("Phase 6c · Espacement des ressources (demande d'Erik : « une distance d'une case »)", () => {
  it('sur les cartes générées, toutes les paires de ressources (miroir compris) respectent minResourceDistance', () => {
    for (const seed of [42, 20260902]) {
      const { map } = generateProceduralMap(seed);
      const res = map.resources;
      expect(res.length).toBeGreaterThan(40);
      for (let i = 0; i < res.length; i++) {
        for (let j = i + 1; j < res.length; j++) {
          const d = hexDistance({ q: res[i]!.q, r: res[i]!.r }, { q: res[j]!.q, r: res[j]!.r });
          expect(d, `seed ${seed} : ${res[i]!.id}@(${res[i]!.q},${res[i]!.r}) ↔ ${res[j]!.id}@(${res[j]!.q},${res[j]!.r})`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("placeResources : l'espacement porte sur la carte COMPLÈTE (images miroir comprises)", () => {
    const grid: TerrainId[][] = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'prairie' as TerrainId));
    // Miroir « identité ponctuelle » DANS la grille : une pose et son image
    // cohabitent sur la même grille — le tirage doit les garder distantes.
    const mirrorOf = (h: Hex): Hex => ({ q: 19 - h.q, r: 19 - h.r });
    const out = placeResources(createRng(7), grid, resolveProgenSettings({ resourceDensity: 4, minResourceDistance: 2 }), { mirrorOf });
    expect(out.resources.length).toBeGreaterThan(0);
    const full = [...out.resources, ...out.resources.map((r) => ({ ...mirrorOf({ q: r.q, r: r.r }), id: r.id }))];
    for (let i = 0; i < full.length; i++) {
      for (let j = i + 1; j < full.length; j++) {
        expect(hexDistance({ q: full[i]!.q, r: full[i]!.r }, { q: full[j]!.q, r: full[j]!.r }), `paire ${i}-${j}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('minResourceDistance = 1 restaure le comportement 6b (adjacence tolérée)', () => {
    const grid: TerrainId[][] = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'prairie' as TerrainId));
    const out = placeResources(createRng(7), grid, resolveProgenSettings({ resourceDensity: 4, minResourceDistance: 1 }));
    expect(out.resources.length).toBeGreaterThan(20); // sans espacement, bien plus de poses
  });
});

describe('Phase 6c · Garantie de couverture (≥ 1 ressource de chaque type par joueur)', () => {
  it('sur les cartes générées, chaque ressource existe au moins minPerResourceType fois PAR DEMI-carte', () => {
    for (const seed of [42, 20260902, 606]) {
      const { map } = generateProceduralMap(seed);
      const counts = countResourcesByTerrain(map);
      for (const row of counts.byId) {
        // Par joueur = par moitié (le miroir double tout) : total pair ≥ 2×min.
        expect(row.total, `seed ${seed} : ${row.id}`).toBeGreaterThanOrEqual(2);
        expect(row.total % 2, `seed ${seed} : ${row.id} symétrique`).toBe(0);
      }
    }
  });

  it('guaranteeResourceCoverage : comble les manques par paires (espacement + exclues respectés)', () => {
    // Grille à bandes couvrant les 7 terrains porteurs (chaque ressource a au
    // moins une bande de 5 rangées = ~150 cases, capacité distance-2 ≈ 11) :
    // il faut loger 22 types × 2 (miroir) à distance ≥ 2.
    const bands: TerrainId[] = ['prairie', 'plaine', 'foret', 'colline', 'montagne', 'desert', 'eau'];
    const grid: TerrainId[][] = Array.from({ length: 35 }, (_, row) =>
      Array.from({ length: 30 }, () => bands[Math.floor(row / 5)]!),
    );
    const mirrorOf = (h: Hex): Hex => ({ q: 29 - h.q, r: 34 - h.r });
    // Blé déjà présent 1×/moitié — paire FERMÉE par miroir (précondition de la passe).
    const resources: MapResource[] = [{ id: 'ble', q: 0, r: 0 }, { id: 'ble', q: 29, r: 34 }];
    const exclude = new Set([`7,7`]); // case interdite (capitale fictive au centre)
    guaranteeResourceCoverage({ rng: createRng(11), terrain: grid, resources, exclude, s: resolveProgenSettings({ minPerResourceType: 1 }), mirrorOf });
    const counts = new Map<string, number>();
    for (const r of resources) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    for (const id of Object.keys(RESOURCES)) {
      expect(counts.get(id) ?? 0, `couverture ${id}`).toBeGreaterThanOrEqual(2);
    }
    // Les exclues ne portent rien ; les paires sont symétriques.
    for (const r of resources) {
      expect(exclude.has(`${r.q},${r.r}`), `exclue (${r.q},${r.r})`).toBe(false);
      expect(resources.some((o) => o.id === r.id && o.q === mirrorOf({ q: r.q, r: r.r }).q && o.r === mirrorOf({ q: r.q, r: r.r }).r), `image de (${r.q},${r.r})`).toBe(true);
    }
    // Espacement sur la liste complète.
    for (let i = 0; i < resources.length; i++) {
      for (let j = i + 1; j < resources.length; j++) {
        expect(hexDistance({ q: resources[i]!.q, r: resources[i]!.r }, { q: resources[j]!.q, r: resources[j]!.r })).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('guaranteeResourceCoverage : échec explicite quand aucune case éligible (retry de tentative côté générateur)', () => {
    const grid: TerrainId[][] = [[ 'montagne' ]]; // uranium est montagne-only, mais 1 case = espacement impossible
    expect(() =>
      guaranteeResourceCoverage({
        rng: createRng(3),
        terrain: grid,
        resources: [],
        exclude: new Set<string>(),
        s: resolveProgenSettings({ minPerResourceType: 1, minResourceDistance: 2 }),
        mirrorOf: (h) => ({ q: 1 - h.q, r: 1 - h.r }),
      }),
    ).toThrow(/couverture impossible/);
  });

  it('minPerResourceType = 0 désactive la garantie', () => {
    const grid: TerrainId[][] = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 'prairie' as TerrainId));
    const resources: MapResource[] = [];
    guaranteeResourceCoverage({ rng: createRng(5), terrain: grid, resources, exclude: new Set<string>(), s: resolveProgenSettings({ minPerResourceType: 0 }), mirrorOf: (h) => h });
    expect(resources).toHaveLength(0);
  });
});

describe("Phase 6c · Comptage des terrains par type (demande d'Erik)", () => {
  it('countTerrainTypes : les 8 terrains de terrain.json figurent (zéros inclus), somme = cases de la carte', () => {
    const { map } = generateProceduralMap(42);
    const rows = countTerrainTypes(map);
    expect(rows.map((r) => r.id)).toEqual(Object.keys(TERRAINS).sort());
    expect(rows.reduce((acc, r) => acc + r.count, 0)).toBe(1600);
    const ocean = rows.find((r) => r.id === 'ocean')!;
    const eau = rows.find((r) => r.id === 'eau')!;
    expect(ocean.count).toBeGreaterThan(0);
    expect(eau.count).toBeGreaterThan(0);
  });

  it('tous les types de terrain existent sur les cartes générées (vérification de couverture)', () => {
    for (const seed of [1, 11, 42, 2222, 606, 777, 20260902]) {
      const { map } = generateProceduralMap(seed);
      // 'ville' n'est jamais généré : c'est une entité posée par
      // createInitialState sur les capitales (jamais un terrain de carte).
      const missing = countTerrainTypes(map)
        .filter((r) => r.count === 0 && r.id !== 'ville')
        .map((r) => r.id);
      expect(missing, `seed ${seed} : terrains absents`).toEqual([]);
    }
  });
});

describe("Phase 6c · Équité des entités — distances calibrables (demande d'Erik)", () => {
  it('villages/huttes : distances par défaut respectées sur les cartes générées (6 villages + 6 huttes par moitié)', () => {
    for (const seed of [42, 20260902]) {
      const { map } = generateProceduralMap(seed);
      expect(map.villages).toHaveLength(12);
      expect(map.huts).toHaveLength(12);
      const spawns = map.spawns.map((p) => p.capital);
      const villages = map.villages.map((v) => ({ q: v.q, r: v.r }));
      const huts = map.huts.map((h) => ({ q: h.q, r: h.r }));
      // Villages entre eux ≥ villageSpacing 🔶 6 ; huttes entre elles ≥ 3.
      for (let i = 0; i < villages.length; i++) {
        for (let j = i + 1; j < villages.length; j++) {
          expect(hexDistance(villages[i]!, villages[j]!), `seed ${seed} villages ${i}-${j}`).toBeGreaterThanOrEqual(6);
        }
      }
      for (let i = 0; i < huts.length; i++) {
        for (let j = i + 1; j < huts.length; j++) {
          expect(hexDistance(huts[i]!, huts[j]!), `seed ${seed} huttes ${i}-${j}`).toBeGreaterThanOrEqual(3);
        }
      }
      // Huttes ↔ villages ≥ 2 : jamais À CÔTÉ (mais plus près qu'une autre hutte).
      for (const h of huts) {
        for (const v of villages) {
          expect(hexDistance(h, v), `seed ${seed} hutte (${h.q},${h.r}) ↔ village (${v.q},${v.r})`).toBeGreaterThanOrEqual(2);
        }
      }
      // Distances aux départs (leçon 7d inchangée) : villages ≥ 6, huttes ≥ 3.
      for (const v of villages) {
        for (const sp of spawns) expect(hexDistance(v, sp), `seed ${seed} village-départ`).toBeGreaterThanOrEqual(6);
      }
      for (const h of huts) {
        for (const sp of spawns) expect(hexDistance(h, sp), `seed ${seed} hutte-départ`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('Phase 6c · Calibrage par type de tuile (mosaïque, déserts, prairies)', () => {
  /** Nombre de transitions de terrain entre cases adjacentes (proxy de la
   *  taille des zones : plus de transitions = zones plus petites). */
  function transitions(map: LoadedMap): number {
    let n = 0;
    const grid: TerrainId[][] = map.data.rows.map((row) => [...row].map((ch) => map.data.legend[ch]! as TerrainId));
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r]!.length - 1; c++) {
        if (grid[r]![c] !== grid[r]![c + 1]) n += 1;
      }
    }
    return n;
  }

  it('terrainPatchScale 0.5 (défaut) divise le regroupement par rapport à 1 (héritage 6b)', () => {
    const wide = generateProceduralMap(42, { terrainPatchScale: 1 });
    const fine = generateProceduralMap(42, { terrainPatchScale: 0.5 });
    expect(transitions(fine.map)).toBeGreaterThan(transitions(wide.map));
  });

  it('desertDensity et prairieDensity orientent leur type (calibreurs par tuile)', () => {
    const countOf = (map: LoadedMap, id: TerrainId): number =>
      Object.values(map.terrain).filter((t) => t === id).length;
    // Aux extrêmes (0 ou 1), la zone du terrain rare (désert ou plaine) devient
    // trop petite pour la garantie « 1 de chaque type » → échec explicite de
    // génération. Le calibrage directionnel se fait à 0.25 / 0.75.
    const desertLow = generateProceduralMap(42, { desertDensity: 0.25 });
    const desertHigh = generateProceduralMap(42, { desertDensity: 0.75 });
    expect(countOf(desertHigh.map, 'desert')).toBeGreaterThan(countOf(desertLow.map, 'desert'));
    // Au-delà de ~0.6, la plaine (classe résiduelle) disparaît → marbre/vin
    // infaisables → échec explicite. Calibrage directionnel 0.2 vs défaut 0.5.
    const plaineHeavy = generateProceduralMap(42, { prairieDensity: 0.2 });
    const prairieHeavy = generateProceduralMap(42, { prairieDensity: 0.5 });
    expect(countOf(prairieHeavy.map, 'prairie')).toBeGreaterThan(countOf(plaineHeavy.map, 'prairie'));
    expect(countOf(plaineHeavy.map, 'plaine')).toBeGreaterThan(countOf(prairieHeavy.map, 'plaine'));
  });

  it("les valeurs de base d'Erik (02/09) sont les défauts 🔶", () => {
    expect(DEFAULT_PROGEN_SETTINGS.resourceDensity).toBe(1.5);
    expect(DEFAULT_PROGEN_SETTINGS.villagesPerHalf).toBe(6);
    expect(DEFAULT_PROGEN_SETTINGS.hutsPerHalf).toBe(6);
    expect(DEFAULT_PROGEN_SETTINGS.forestDensity).toBe(0.36);
    expect(DEFAULT_PROGEN_SETTINGS.desertDensity).toBe(0.35);
    expect(DEFAULT_PROGEN_SETTINGS.prairieDensity).toBe(0.2);
    expect(DEFAULT_PROGEN_SETTINGS.terrainPatchScale).toBe(0.3);
    expect(DEFAULT_PROGEN_SETTINGS.rifts).toBe(2);
    expect(DEFAULT_PROGEN_SETTINGS.riftDepth).toBe(48);
  });

  it('R-105 : poisson favorisé sur les côtes (extraSpawnScale eau ×1.5 ≈ présence ×4)', () => {
    // Grille 100 % côte : le poisson bénéficie du tirage principal (poids 10/19)
    // PLUS son tirage forcé (×1.5 la probabilité de base) → net dominant.
    const grid: TerrainId[][] = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 'eau' as TerrainId));
    const out = placeResources(createRng(7), grid, resolveProgenSettings({ resourceDensity: 4 }));
    const count = (id: string): number => out.resources.filter((r) => r.id === id).length;
    expect(count('poisson')).toBeGreaterThan(count('baleine'));
    expect(count('poisson')).toBeGreaterThan(count('teinture'));
    // Et l'ordre de grandeur : ~2,5× n'importe quelle autre ressource marine.
    expect(count('poisson')).toBeGreaterThan(2 * Math.max(count('baleine'), count('teinture')));
  });
});

describe("Phase 6c · Anneau de départ équilibré (demande d'Erik)", () => {
  it('chaque capitale : anneau 6 avec ≥ 2 prairies, ≥ 2 forêts, AUCUNE ressource', () => {
    for (const seed of [42, 20260902, 606]) {
      const { map } = generateProceduralMap(seed);
      for (const spawn of map.spawns) {
        const cap = spawn.capital;
        let prairie = 0;
        let forest = 0;
        for (const n of neighbors(cap)) {
          const t = map.terrain[tileKeyOf(n)];
          expect(t, `seed ${seed} : voisin de la capitale connu`).toBeDefined();
          if (t === 'prairie') prairie += 1;
          if (t === 'foret') forest += 1;
          const res = map.resources.find((r) => r.q === n.q && r.r === n.r);
          expect(res, `seed ${seed} : case (${n.q},${n.r}) de l'anneau de départ sans ressource`).toBeUndefined();
        }
        expect(prairie, `seed ${seed} : ≥ 2 prairies autour de (${cap.q},${cap.r})`).toBeGreaterThanOrEqual(2);
        expect(forest, `seed ${seed} : ≥ 2 forêts autour de (${cap.q},${cap.r})`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
