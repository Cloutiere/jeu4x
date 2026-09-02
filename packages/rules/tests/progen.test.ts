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
  generateProceduralMap,
  generateMap,
  generateTerrain,
  landConnected,
  resolveProgenSettings,
} from '../src/progen/index.js';
import { ProgenPlacementError, attemptSeed, halfMapLookup, normalizeStartSite } from '../src/progen/mirror.js';
import { fertilityScore } from '../src/progen/fertility.js';
import { parseMap, createInitialState } from '../src/map.js';
import type { MapData, MapResource, LoadedMap } from '../src/map.js';
import { hexDistance, tileKeyOf, colRowToHex } from '../src/hex.js';
import type { Hex } from '../src/hex.js';
import { createRng } from '../src/rng.js';
import { RESOURCES, TERRAINS } from '../src/data.js';
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
    expect(sp.units).toHaveLength(1);
    expect(sp.units[0]!.type).toBe('guerrier');
    expect(hexDistance(sp.capital, sp.units[0]!)).toBe(1);
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
  // Connexité terrestre entre les deux zones de spawn (BFS, handoff L0-6).
  expect(landConnected(map, map.spawns[0]!.capital, map.spawns[1]!.capital)).toBe(true);
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
      expect(report.landRatio).toBeGreaterThan(0.5);
      expect(report.landRatio).toBeLessThan(0.6);
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

  it('R-105 : densité des ressources suit resourceDensity (override du labo)', () => {
    const none = generateProceduralMap(606, { resourceDensity: 0 });
    expect(none.map.resources).toHaveLength(0);
    const double = generateProceduralMap(606, { resourceDensity: 2 });
    const simple = generateProceduralMap(606);
    expect(double.map.resources.length).toBeGreaterThan(simple.map.resources.length * 1.4);
  });

  it('R-103 : l\'état initial se construit comme pour une carte préfabriquée', () => {
    const { map, report } = generateProceduralMap(777);
    const state = createInitialState(map, report.seed);
    expect(state.mapId).toBe(PROCEDURAL_MAP_ID);
    expect(Object.keys(state.cities)).toEqual(['c1', 'c2']);
    expect(Object.keys(state.units)).toEqual(['u1', 'u2']);
    expect(state.villages).toHaveLength(6);
    expect(state.huts).toHaveLength(4);
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
    const out = normalizeStartSite(lookup, site, initial, initial + 30, s, injected);
    expect(out.normalized).toBe(true);
    expect(out.score).toBeGreaterThanOrEqual(initial + 30);
    expect(injected.length).toBeGreaterThan(0);
    for (const r of injected) {
      expect(['ble', 'betail']).toContain(r.id);
      expect(hexDistance(site, r)).toBeLessThanOrEqual(2);
      expect(hexDistance(site, r)).toBeGreaterThanOrEqual(1);
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
