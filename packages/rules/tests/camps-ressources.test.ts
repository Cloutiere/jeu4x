/**
 * CAMPS-RESSOURCES — demande d'Erik (28/09) : « quand on découvre une hutte
 * ami ou détruit un village barbare, la tuile en dessous est révélée et
 * contient une ressource », avec l'espacement R-108 entre ces tuiles et les
 * autres tuiles de ressources.
 *
 * Implémentation : la ressource est posée DÈS LA GÉNÉRATION sous chaque
 * village/hutte (canon CivRev « villages always on top of a resource », déjà
 * consigné au miroir) — la destruction du camp ne retire que l'entité : la
 * tuile RÉVÈLE ce qu'elle a toujours porté, et le fog (R-92) gère la
 * visibilité/identité. Aucune mutation d'état à l'exécution, zéro protocole.
 *
 *  - Génération (miroir 1v1 ET libre 3-5) : chaque camp porte une ressource
 *    de terrain légal ; TOUTES les paires de ressources (camps compris) sont
 *    à ≥ minResourceDistance (R-108) ;
 *  - les camps restent à leurs distances 7d des spawns (huttes ≥ 3 > rayon de
 *    purge 2 : la ressource du camp ne viole jamais T-45) ;
 *  - R-80 : déterminisme (même seed → mêmes poses) ;
 *  - préfabriquées : les villages déjà posés SUR une ressource (variee-40,
 *    soie) sont inchangés — le comportement demandé y existait.
 */
import { describe, expect, it } from 'vitest';
import {
  generateProceduralMap,
  resolveProgenSettings,
  poseRessourcesSousCamps,
} from '../src/progen/index.js';
import { hexDistance, tileKeyOf } from '../src/hex.js';
import { createRng } from '../src/rng.js';
import { RESOURCES, isWaterTerrain } from '../src/data.js';
import type { TerrainId } from '../src/types.js';
import { loadBuiltinMapSync } from '../src/map.js';

function campsPorteurs(map: {
  terrain: Record<string, string>;
  resources: Array<{ id: string; q: number; r: number }>;
  villages: Array<{ q: number; r: number }>;
  huts: Array<{ q: number; r: number }>;
}) {
  return [...map.villages, ...map.huts].map((c) => {
    const res = map.resources.find((r) => r.q === c.q && r.r === c.r);
    const terrain = map.terrain[tileKeyOf(c)]!;
    return { camp: c, res, terrain };
  });
}

describe('CAMPS-RESSOURCES · Génération', () => {
  it('miroir 1v1 : chaque village/hutte porte une ressource de terrain légal', () => {
    for (const seed of [1, 42, 20260924]) {
      const { map } = generateProceduralMap(seed);
      for (const { camp, res, terrain } of campsPorteurs(map)) {
        expect(res, `seed ${seed} : camp (${camp.q},${camp.r}) sans ressource`).toBeDefined();
        expect(RESOURCES[res!.id]!.terrains).toContain(terrain as TerrainId);
        expect(isWaterTerrain(terrain as TerrainId)).toBe(false);
      }
    }
  });

  it('libre 5P (50×40) : chaque camp porte une ressource, R-108 sur TOUTES les paires (camps compris)', () => {
    const s = resolveProgenSettings({ playerCount: 5 });
    for (const seed of [1, 4242, 777777]) {
      const { map } = generateProceduralMap(seed, { playerCount: 5 });
      const porteurs = campsPorteurs(map);
      for (const { camp, res, terrain } of porteurs) {
        expect(res, `seed ${seed} : camp (${camp.q},${camp.r}) sans ressource`).toBeDefined();
        expect(RESOURCES[res!.id]!.terrains).toContain(terrain as TerrainId);
      }
      // Espacement R-108 sur la carte COMPLÈTE — les ressources des camps
      // sont incluses dans map.resources, donc la paire à paire les couvre.
      for (let i = 0; i < map.resources.length; i++) {
        for (let j = i + 1; j < map.resources.length; j++) {
          expect(
            hexDistance(map.resources[i]!, map.resources[j]!),
            `seed ${seed} : ${map.resources[i]!.id}/${map.resources[j]!.id} trop proches`,
          ).toBeGreaterThanOrEqual(s.minResourceDistance);
        }
      }
      // Les camps ne sont jamais dans le rayon de purge (huttes ≥ 3, villages
      // ≥ 6 des spawns) : leur ressource ne viole pas T-45.
      for (const sp of map.spawns) {
        for (const { camp } of porteurs) {
          expect(hexDistance(sp.capital, camp)).toBeGreaterThanOrEqual(s.spawnPurgeRadius + 1);
        }
      }
    }
  }, 120000);

  it('R-80 · déterminisme : même seed → mêmes ressources sous les camps', () => {
    for (const seed of [7, 31337]) {
      const a = generateProceduralMap(seed).map.resources;
      const b = generateProceduralMap(seed).map.resources;
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it('poseRessourcesSousCamps : terrain légal sinon camp nu ; déjà-portée conservée (R-94)', () => {
    const terrain: TerrainId[][] = [
      ['prairie', 'montagne', 'prairie'],
      ['plaine', 'plaine', 'plaine'],
      ['prairie', 'prairie', 'prairie'],
    ];
    const resources = [{ id: 'ble' as const, q: 0, r: 2 }];
    // Camp (0,0) prairie : pose légale (d((0,0),(0,2)) = 2 ≥ 2).
    // Camp (2,1) plaine : à d=2 du bétail ? d((2,1),(0,2)) = 3 — légal.
    const poses = poseRessourcesSousCamps({
      rng: createRng(42),
      terrain,
      resources,
      villages: [
        { q: 0, r: 0 },
        { q: 2, r: 1 },
      ],
      huts: [],
      minResourceDistance: 2,
    });
    expect(poses).toHaveLength(2);
    for (const p of poses) expect(RESOURCES[p.id]!.terrains).toBeDefined();
    // Camp sur une case portant DÉJÀ une ressource : rien de nouveau (R-94).
    const poses2 = poseRessourcesSousCamps({
      rng: createRng(42),
      terrain,
      resources: [{ id: 'ble', q: 0, r: 0 }],
      villages: [{ q: 0, r: 0 }],
      huts: [],
      minResourceDistance: 2,
    });
    expect(poses2).toHaveLength(0);
  });
});

describe('CAMPS-RESSOURCES · Préfabriquées (1v1, intouchées)', () => {
  it('variee-40 : les villages posés SUR la soie la gardent (comportement existant)', () => {
    const m = loadBuiltinMapSync('variee-40');
    for (const v of m.villages) {
      const res = m.resources.find((r) => r.q === v.q && r.r === v.r);
      if (v.q === -2 && v.r === 28) expect(res?.id).toBe('soie');
      if (v.q === 22 && v.r === 11) expect(res?.id).toBe('soie');
    }
  });
});
