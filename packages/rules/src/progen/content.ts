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
import { RESOURCES, TERRAINS, isWaterTerrain } from '../data.js';
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

/**
 * Phase 6c — contrainte d'espacement des ressources (demande d'Erik : « une
 * distance d'une case entre chaque ressource » → distance hex ≥ N sur la carte
 * COMPLÈTE). `mirrorOf` (rotation 180° de la stratégie) : la contrainte porte
 * aussi sur les images — deux ressources réfléchies ne doivent jamais se
 * toucher à travers l'axe de miroir, et une ressource ne doit pas être
 * adjacente à sa propre image. min ≤ 1 = contrainte désactivée (héritage 6b).
 */
export function spacingViolated(
  candidate: Hex,
  placed: Array<{ q: number; r: number }>,
  mirrorOf: ((hex: Hex) => Hex) | undefined,
  min: number,
): boolean {
  if (min <= 1) return false;
  for (const p of placed) {
    if (hexDistance(candidate, p) < min) return true;
    if (mirrorOf && hexDistance(candidate, mirrorOf(p)) < min) return true;
  }
  if (mirrorOf && hexDistance(candidate, mirrorOf(candidate)) < min) return true;
  return false;
}

export interface ResourcePlacement {
  resources: MapResource[];
  landTiles: number;
  waterTiles: number;
}

/** Options de pose : `mirrorOf` = image de la stratégie miroir (rotation 180°)
 *  — fournie, la contrainte d'espacement porte sur la carte complète ;
 *  `alreadyPlaced` = ressources déjà posées (garantie de couverture 6c) dont
 *  le tirage aléatoire doit respecter l'espacement. */
export interface ResourcePlacementOptions {
  mirrorOf?: (hex: Hex) => Hex;
  alreadyPlaced?: Array<{ q: number; r: number }>;
}

/**
 * Pose les ressources sur une grille (demi-carte pour le miroir 1v1).
 * Une case éligible reçoit au plus une ressource (R-94) ; deux ressources
 * respectent `minResourceDistance` 🔶 (espacement complet, miroir compris —
 * Phase 6c).
 */
export function placeResources(
  rng: SeededRng,
  terrain: TerrainId[][],
  s: ProgenSettings,
  options?: ResourcePlacementOptions,
): ResourcePlacement {
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  const resources: MapResource[] = [];
  const placedHexes: Hex[] = (options?.alreadyPlaced ?? []).map((r) => ({ q: r.q, r: r.r }));
  const prePlacedKeys = new Set(placedHexes.map((p) => `${p.q},${p.r}`));
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
      const isWater = isWaterTerrain(t); // Mer (côte) ET Océan — même densité 🔶
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
      const key = `${hex.q},${hex.r}`;
      if (prePlacedKeys.has(key)) continue; // case réservée par la garantie 6c
      if (spacingViolated(hex, placedHexes, options?.mirrorOf, s.minResourceDistance)) continue;
      placedHexes.push(hex);
      resources.push({ id: picked.id, q: hex.q, r: hex.r });
    }
  }
  return { resources, landTiles, waterTiles };
}

export interface EntityPlacementInput {
  rng: SeededRng;
  terrain: TerrainId[][];
  /** Départs de la carte complète (l'image du spawn est fournie par la
   *  stratégie) — pose à ≥ minSpawnDistance de TOUTES ces cases. */
  spawns: Hex[];
  minSpawnDistance: number;
  /** Poses DU MÊME type déjà présentes (muté : chaque pose y est ajoutée) —
   *  ≥ minSameDistance (≤ 1 = contrainte désactivée). */
  same: Hex[];
  minSame: number;
  /** Poses de l'AUTRE type (villages ↔ huttes) — ≥ minOtherDistance (≤ 1 =
   *  désactivée ; le recouvrement reste interdit quelle que soit la valeur). */
  other: Hex[];
  minOther: number;
  /** Image miroir (rotation 180°) — fournie, les trois distances portent sur
   *  la carte COMPLÈTE (poses ET leurs images, auto-image comprise). */
  mirrorOf?: (hex: Hex) => Hex;
  /** Cases interdites sans condition de distance (capitales), clés "q,r". */
  reserved: Set<string>;
  count: number;
}

/** Cases praticables éligibles pour un village ou une hutte (tri (q, r)).
 *  Phase 6c : les trois distances sont indépendantes (villages entre eux,
 *  huttes entre elles, huttes ↔ villages — une hutte ne doit pas être à côté
 *  d'un village mais peut en être plus proche qu'une autre hutte). */
function entityCandidates(input: EntityPlacementInput): Hex[] {
  const { terrain, spawns, minSpawnDistance, same, minSame, other, minOther, reserved, mirrorOf } = input;
  const sameFull = mirrorOf ? [...same, ...same.map(mirrorOf)] : same;
  const otherFull = mirrorOf ? [...other, ...other.map(mirrorOf)] : other;
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  const out: Hex[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const t = terrain[row]![col]!;
      if (!TERRAINS[t]!.passable) continue;
      const hex = colRowToHex(col, row);
      const key = `${hex.q},${hex.r}`;
      if (reserved.has(key)) continue;
      if (same.some((p) => p.q === hex.q && p.r === hex.r)) continue;
      if (other.some((p) => p.q === hex.q && p.r === hex.r)) continue;
      if (spawns.some((sp) => hexDistance(sp, hex) < minSpawnDistance)) continue;
      if (minSame > 1 && sameFull.some((p) => hexDistance(p, hex) < minSame)) continue;
      if (minOther > 1 && otherFull.some((p) => hexDistance(p, hex) < minOther)) continue;
      // Auto-image : une pose et son reflet ne doivent jamais se toucher.
      if (mirrorOf && minSame > 1 && hexDistance(hex, mirrorOf(hex)) < minSame) continue;
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
    const candidates = entityCandidates(input);
    if (candidates.length === 0) break; // plus de place : posés en nombre moindre (consigné)
    const hex = candidates[input.rng.nextInt(candidates.length)]!;
    input.same.push(hex);
    placed.push({ q: hex.q, r: hex.r });
  }
  return placed;
}
