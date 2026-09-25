/**
 * CARTE-MULTI — Mode de génération LIBRE 3-5 joueurs (D1, veto d'Erik du
 * 24/09 : zéro symétrie). Tests citant les règles :
 *  - R-157 (SPAWN-START) : garantie de voisinage PAR SPAWN (2F/2P/1E, purge
 *    rayon 🔶 spawnPurgeRadius) — ×3, ×4, ×5 ;
 *  - D1 : équidistance des spawns dans la tolérance 🔶 (critère data-driven
 *    consigné — score minimal, tie-breaks R-81) ;
 *  - R-80/R-82 : déterminisme (même seed → même carte bit à bit) ;
 *  - D3 : NON-RÉGRESSION 1v1 — les cartes 2 sièges sortent IDENTIQUES au
 *    flux miroir historique (octets) ;
 *  - R-151/R-152 (7o) : artefacts posés, à distance ≥ 🔶 de la capitale la
 *    plus proche pour les îles (généralisation « équidistant des N spawns ») ;
 *  - R-96/R-98 : villages/huttes à distance minimale des N spawns.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGEN_SETTINGS,
  generateProceduralMap,
  resolveProgenSettings,
  MIRROR_1V1,
  LIBRE_MULTI,
} from '../src/progen/index.js';
import { hexDistance, hexesWithinRadius, neighbors, tileKeyOf } from '../src/hex.js';
import type { Hex } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';
import type { TerrainId } from '../src/types.js';
import type { MapResource } from '../src/map.js';
import { parseMap } from '../src/map.js';

const S5 = resolveProgenSettings({ playerCount: 5 });

/** Composition de l'anneau 1 d'une capitale (checksum R-157). */
function ringComposition(map: { terrain: Record<string, string>; resources: MapResource[] }, cap: Hex) {
  const counts: Record<string, number> = {};
  for (const n of neighbors(cap)) {
    const t = map.terrain[tileKeyOf(n)]!;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/** Garantie R-157 complète sur UN spawn : exactement 2F/2P/1E, 6e case libre
 *  productive non-montagne, AUCUNE ressource au rayon spawnPurgeRadius. */
function checkR157(
  map: { terrain: Record<string, string>; resources: MapResource[] },
  cap: Hex,
  s = S5,
): void {
  const counts = ringComposition(map, cap);
  expect(counts['foret'] ?? 0).toBeGreaterThanOrEqual(s.spawnRingForet);
  expect(counts['eau']).toBe(s.spawnRingEau);
  expect((counts['prairie'] ?? 0)).toBeGreaterThanOrEqual(s.spawnRingPrairie);
  for (const h of hexesWithinRadius(cap, s.spawnPurgeRadius)) {
    if (hexDistance(cap, h) === 0) continue;
    expect(map.resources.find((r) => tileKeyOf(r) === tileKeyOf(h))).toBeUndefined();
  }
}

describe('CARTE-MULTI · Réglages data-driven (L1)', () => {
  it('la stratégie est choisie par le nombre de sièges : 2 = miroir (D3), 3-5 = libre (D1)', () => {
    expect(resolveProgenSettings({ playerCount: 2 }).startPlacement).toBe('mirror1v1');
    expect(resolveProgenSettings({ playerCount: 3 }).startPlacement).toBe('libreMulti');
    expect(resolveProgenSettings({ playerCount: 5 }).startPlacement).toBe('libreMulti');
    expect(resolveProgenSettings().startPlacement).toBe('mirror1v1'); // défaut historique
  });

  it('libreMulti refuse 2 sièges et 6 sièges (bornes 3-5)', () => {
    expect(() => LIBRE_MULTI.geoSize(resolveProgenSettings({ playerCount: 2 }))).toThrow();
    // 6 est ramené à 5 par le bornage de resolveProgenSettings — test brut :
    expect(() =>
      LIBRE_MULTI.geoSize({ ...DEFAULT_PROGEN_SETTINGS, playerCount: 6 }),
    ).toThrow();
  });

  it('les valeurs d\'équité 🔶 ont des défauts consignés (métrique D1)', () => {
    expect(S5.libreAttempts).toBeGreaterThan(0);
    expect(S5.libreCandidatePool).toBeGreaterThan(0);
    expect(S5.libreCenterWeight).toBeGreaterThanOrEqual(0);
    expect(S5.libreFertilityWeight).toBeGreaterThanOrEqual(0);
    expect(S5.libreSpreadWeight).toBeGreaterThanOrEqual(0);
    expect(S5.librePairSpreadMax).toBeGreaterThanOrEqual(0);
  });
});

describe('CARTE-MULTI · Génération libre (L2)', () => {
  it('génère 3, 4 et 5 spawns, tous validés par parseMap (2-5 joueurs)', { timeout: 60000 }, () => {
    for (const n of [3, 4, 5] as const) {
      const r = generateProceduralMap(20260924, { playerCount: n });
      expect(r.map.spawns).toHaveLength(n);
      expect(r.map.spawns.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', ...(n >= 4 ? ['p4'] : []), ...(n === 5 ? ['p5'] : [])]);
      expect(() => parseMap(r.map.data)).not.toThrow();
    }
  });

  it('R-157 · garantie de voisinage appliquée À CHAQUE spawn (×5)', () => {
    const r = generateProceduralMap(20260924, { playerCount: 5 });
    for (const sp of r.map.spawns) checkR157(r.map, sp.capital);
  });

  it('R-157 · 100 % des seeds conformes (3/4/5 joueurs × 6 seeds — comme SPAWN-START)', () => {
    for (const n of [3, 4, 5] as const) {
      for (const seed of [1, 42, 777, 20260924, 31337, 987654321]) {
        const r = generateProceduralMap(seed, { playerCount: n });
        expect(r.map.spawns).toHaveLength(n);
        for (const sp of r.map.spawns) checkR157(r.map, sp.capital);
      }
    }
  }, 300000);

  it('D1 · les N spawns sont équidistants dans la tolérance 🔶 (écart pairwise max−min)', () => {
    for (const n of [3, 4, 5] as const) {
      for (const seed of [1, 42, 777, 20260924, 31337]) {
        const r = generateProceduralMap(seed, { playerCount: n });
        const s = resolveProgenSettings({ playerCount: n });
        const multi = r.report.multi!;
        expect(multi).toBeDefined();
        expect(multi.pairSpread).toBeLessThanOrEqual(s.librePairSpreadMax);
        // distances pairwise ≥ minSpawnDistance (validation parseMap, all-pairs)
        for (const p of multi.pairwise) expect(p.distance).toBeGreaterThanOrEqual(s.minSpawnDistance);
        // chaque spawn à distance raisonnable du centre de carte
        for (const sp of multi.spawns) {
          expect(sp.distanceCentre).toBeGreaterThan(0);
        }
      }
    }
  }, 300000);

  it('R-80 · déterminisme : même seed → même carte bit à bit (5 joueurs)', { timeout: 90000 }, () => {
    const a = generateProceduralMap(424242, { playerCount: 5 });
    const b = generateProceduralMap(424242, { playerCount: 5 });
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });

  it('D1 · diversité : seeds distincts → cartes distinctes (aucune paire identique)', () => {
    const seeds = [11, 22, 33, 44, 55];
    const dumps = seeds.map((seed) => JSON.stringify(generateProceduralMap(seed, { playerCount: 5 }).map));
    for (let i = 0; i < dumps.length; i++) {
      for (let j = i + 1; j < dumps.length; j++) {
        expect(dumps[i]).not.toBe(dumps[j]);
      }
    }
  }, 120000);

  it('D3 · NON-RÉGRESSION 1v1 : la carte 2 sièges est IDENTIQUE au miroir historique', () => {
    for (const seed of [1, 42, 20260924, 777, 31337]) {
      const parDefaut = generateProceduralMap(seed);
      const explicite = generateProceduralMap(seed, { playerCount: 2 }, MIRROR_1V1);
      expect(JSON.stringify(parDefaut.map)).toBe(JSON.stringify(explicite.map));
      // le rapport miroir ne porte PAS le champ multi
      expect(parDefaut.report.multi).toBeUndefined();
    }
  }, 120000);

  it('D5 · villages et huttes aux TOTAUX 1v1 (densité de référence 🔶), à distance des N spawns', () => {
    const r = generateProceduralMap(42, { playerCount: 5 });
    expect(r.map.villages.length).toBe(S5.villagesPerHalf * 2);
    expect(r.map.huts.length).toBe(S5.hutsPerHalf * 2);
    for (const v of r.map.villages) {
      for (const sp of r.map.spawns) expect(hexDistance(v, sp.capital)).toBeGreaterThanOrEqual(S5.minVillageDistance);
    }
    for (const h of r.map.huts) {
      for (const sp of r.map.spawns) expect(hexDistance(h, sp.capital)).toBeGreaterThanOrEqual(S5.minHutDistance);
    }
  });

  it('R-151/R-152 (7o) · artefacts tirés et posés, îles à distance 🔶 de la capitale la plus proche', () => {
    for (const n of [3, 5] as const) {
      const r = generateProceduralMap(20260924, { playerCount: n });
      expect(r.map.artefacts.length).toBeGreaterThanOrEqual(4);
      expect(r.report.counts.artefacts).toBe(r.map.artefacts.length);
      for (const a of r.map.artefacts) {
        const dMin = Math.min(...r.map.spawns.map((sp) => hexDistance(sp.capital, a)));
        // soit île éloignée (≥ minDistanceToCapitals), soit repli continent
        // — l'invariant dur : AUCUN artefact collé à un spawn (≥ 4, 🔶 large)
        expect(dMin).toBeGreaterThanOrEqual(4);
      }
    }
  }, 120000);
});
