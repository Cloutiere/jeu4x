/**
 * Phase 6b L2 — Contenu procédural : ressources, villages barbares, huttes.
 *
 * Ressources (R-94) : tirées des `spawnWeight` de resources.json (champ
 * réservé en 7c, rempli ici 🔶) restreintes aux terrains autorisés de chaque
 * ressource ; densité cible 🔶 ~1 ressource / 12 cases de terre (l'eau reçoit
 * les ressources marines à demi-densité 🔶).
 *
 * Villages (R-96) et huttes (R-98) : posés sur la DEMI-carte par la stratégie
 * puis reflétés — chaque entité existe donc à l'identique pour les deux
 * joueurs. Villages à ≥ minVillageDistance des DEUX spawns (leçon de
 * calibrage 7d : éviter le siège précoce) ; huttes à ≥ minHutDistance 🔶.
 *
 * Tout est déterministe : parcours triés (row, col), RNG seedé unique.
 */
import { RESOURCES, TERRAINS } from '../data.js';
import { colRowToHex, hexDistance, neighbors, compareHex } from '../hex.js';
import type { Hex } from '../hex.js';
import type { MapResource } from '../map.js';
import type { ResourceId, TerrainId } from '../types.js';
import type { SeededRng } from '../rng.js';
import type { ProgenSettings } from './settings.js';

/** Densité cible 🔶 : 1 ressource par 12 cases de terre ; l'eau à 1/48
 *  (ressources marines occasionnelles — baleine/poisson/teinture). */
const LAND_RESOURCE_DENOMINATOR = 12;
const WATER_RESOURCE_DENOMINATOR = 48;

/** Un village/hutte isolé (entouré d'infranchissable) serait injoignable :
 *  ≥ 2 voisins praticables exigés (dont la case du poseur elle-même exclue). */
const MIN_PASSABLE_NEIGHBORS = 2;

export interface ResourcePlacement {
  resources: MapResource[];
  landTiles: number;
  waterTiles: number;
}

/**
 * Pose les ressources sur une grille (demi-carte pour le miroir 1v1).
 * Une case éligible reçoit au plus une ressource (R-94).
 */
export function placeResources(
  rng: SeededRng,
  terrain: TerrainId[][],
  s: ProgenSettings,
): ResourcePlacement {
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  const resources: MapResource[] = [];
  let landTiles = 0;
  let waterTiles = 0;

  // Ressources éligibles par terrain, pondérées (tri (id) croissant pour la
  // stabilité du tirage — R-81).
  const byTerrain = new Map<TerrainId, Array<{ id: ResourceId; weight: number }>>();
  for (const key of Object.keys(RESOURCES).sort()) {
    const r = RESOURCES[key]!;
    if (r.spawnWeight === null || r.spawnWeight <= 0) continue;
    for (const t of r.terrains) {
      const list = byTerrain.get(t) ?? [];
      list.push({ id: r.id, weight: r.spawnWeight });
      byTerrain.set(t, list);
    }
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = terrain[row]![col]!;
      const isWater = t === 'eau';
      if (isWater) waterTiles += 1;
      else landTiles += 1;
      const candidates = byTerrain.get(t);
      if (!candidates || candidates.length === 0) continue;
      const denominator = isWater ? WATER_RESOURCE_DENOMINATOR : LAND_RESOURCE_DENOMINATOR;
      const probability = (1 / denominator) * s.resourceDensity;
      if (rng.next() >= probability) continue;
      const total = candidates.reduce((acc, c) => acc + c.weight, 0);
      let roll = rng.next() * total;
      let picked = candidates[candidates.length - 1]!;
      for (const c of candidates) {
        if (roll < c.weight) {
          picked = c;
          break;
        }
        roll -= c.weight;
      }
      const hex = colRowToHex(col, row);
      resources.push({ id: picked.id, q: hex.q, r: hex.r });
    }
  }
  return { resources, landTiles, waterTiles };
}

export interface EntityPlacementInput {
  rng: SeededRng;
  terrain: TerrainId[][];
  /** Cases à distance ≥ minDistance de TOUTES ces cases (spawns de la carte
   *  complète — l'image du spawn est fournie par la stratégie). */
  spawns: Hex[];
  minDistance: number;
  /** Cases déjà occupées (villages + huttes + futurs spawns), clés "q,r". */
  occupied: Set<string>;
  count: number;
}

/** Cases praticables éligibles pour un village ou une hutte (tri (q, r)). */
function entityCandidates(input: EntityPlacementInput): Hex[] {
  const { terrain, spawns, minDistance, occupied } = input;
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  const out: Hex[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = terrain[row]![col]!;
      if (!TERRAINS[t]!.passable) continue;
      const hex = colRowToHex(col, row);
      const key = `${hex.q},${hex.r}`;
      if (occupied.has(key)) continue;
      if (spawns.some((sp) => hexDistance(sp, hex) < minDistance)) continue;
      const passableNeighbors = neighbors(hex).filter((n) => {
        const nRow = n.r;
        const nCol = n.q + Math.floor(n.r / 2);
        const nt = terrain[nRow]?.[nCol];
        return nt !== undefined && TERRAINS[nt]!.passable;
      }).length;
      if (passableNeighbors < MIN_PASSABLE_NEIGHBORS) continue;
      out.push(hex);
    }
  }
  return out.sort(compareHex);
}

/** Pose `count` entités (villages OU huttes) uniformément parmi les cases éligibles. */
export function placeEntities(input: EntityPlacementInput): Hex[] {
  const placed: Hex[] = [];
  for (let i = 0; i < input.count; i++) {
    const candidates = entityCandidates({ ...input, occupied: input.occupied });
    if (candidates.length === 0) break; // plus de place : posés en nombre moindre (consigné)
    const hex = candidates[input.rng.nextInt(candidates.length)]!;
    input.occupied.add(`${hex.q},${hex.r}`);
    placed.push({ q: hex.q, r: hex.r });
  }
  return placed;
}
