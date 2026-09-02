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
import { ProgenPlacementError } from './mirror.js';
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
 *  le tirage aléatoire doit respecter l'espacement ; `skipIds` = ressources
 *  exclues du tirage (marines — posées après classification des eaux). */
export interface ResourcePlacementOptions {
  mirrorOf?: (hex: Hex) => Hex;
  alreadyPlaced?: Array<{ q: number; r: number }>;
  skipIds?: Set<string>;
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
  // Phase 6c : tirages supplémentaires FORCÉS par terrain (extraSpawnScale —
  // ex. poisson favorisé sur les côtes), tri (id) croissant.
  const extraByTerrain = new Map<TerrainId, Array<{ id: ResourceId; scale: number }>>();
  for (const key of Object.keys(RESOURCES).sort()) {
    const r = RESOURCES[key]!;
    if (r.spawnWeight === null || r.spawnWeight <= 0) continue;
    if (options?.skipIds?.has(r.id)) continue;
    for (const t of r.terrains) {
      const list = byTerrain.get(t) ?? [];
      list.push({ id: r.id, weight: r.spawnWeight });
      byTerrain.set(t, list);
      const scale = r.extraSpawnScale?.[t];
      if (scale && scale > 0) {
        const extras = extraByTerrain.get(t) ?? [];
        extras.push({ id: r.id, scale });
        extraByTerrain.set(t, extras);
      }
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
      const hex = colRowToHex(col, row);
      const key = `${hex.q},${hex.r}`;
      const placeable =
        !prePlacedKeys.has(key) && // case réservée par la garantie 6c
        !spacingViolated(hex, placedHexes, options?.mirrorOf, s.minResourceDistance);
      // Tirage principal pondéré (poids spawnWeight).
      if (rng.next() < probability && placeable) {
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
        placedHexes.push(hex);
        resources.push({ id: picked.id, q: hex.q, r: hex.r });
        continue;
      }
      // Phase 6c — extraSpawnScale : tirage supplémentaire FORCÉ pour une
      // ressource donnée (ex. poisson favorisé sur les côtes), en multiple de
      // la probabilité de base ; une seule ressource par case (R-94).
      for (const e of extraByTerrain.get(t) ?? []) {
        if (rng.next() < probability * e.scale) {
          if (placeable) {
            placedHexes.push(hex);
            resources.push({ id: e.id, q: hex.q, r: hex.r });
          }
          break;
        }
      }
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

export interface MarinePlacementInput {
  rng: SeededRng;
  /** Grille CLASSIFIÉE de la carte COMPLÈTE (eau = côte 'eau' | 'ocean'). Les
   *  marines ne posent que sur la côte — l'océan reste stérile (Erik, 02/09). */
  terrain: TerrainId[][];
  /** Ressources déjà posées (terre) — muté : les marines s'y ajoutent. */
  resources: MapResource[];
  /** Cases interdites (capitales + anneaux de départ), clés "q,r". */
  exclude: Set<string>;
  s: ProgenSettings;
  mirrorOf: (hex: Hex) => Hex;
  /** Hauteur de la demi-carte : le tirage aléatoire parcourt les cases de
   *  côte de la demi et pose des PAIRES (équité par miroir). */
  halfHeight: number;
}

/** Ressources AQUATIQUES : tous leurs terrains sont des eaux (côte). */
export function waterOnlyResourceIds(): string[] {
  return Object.keys(RESOURCES).filter((id) => {
    const terrains = RESOURCES[id]!.terrains;
    return terrains.length > 0 && terrains.every((t) => isWaterTerrain(t));
  });
}

/**
 * Phase 6c — pose des ressources marines APRÈS classification des eaux, sur
 * la grille COMPLÈTE : garantie de couverture d'abord (par paires site+miroir,
 * farthest-point), puis tirage aléatoire sur les cases de CÔTE de la
 * demi-carte (l'océan ne reçoit rien). Chaque pose est doublée de son image
 * (équité). Déterminisme : ids triés, cases triées, RNG seedé.
 */
export function placeMarineResources(input: MarinePlacementInput): void {
  const marines = waterOnlyResourceIds().filter((id) => (RESOURCES[id]!.spawnWeight ?? 0) > 0);
  if (marines.length === 0) return;
  const grid = input.terrain;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const isCoast = (h: Hex): boolean => grid[h.r]?.[h.q + Math.floor(h.r / 2)] === 'eau';
  const open = (h: Hex): boolean => {
    const key = `${h.q},${h.r}`;
    if (input.exclude.has(key)) return false;
    if (input.resources.some((r) => r.q === h.q && r.r === h.r)) return false;
    return true;
  };
  const placeablePair = (hex: Hex): Hex | null => {
    const m = input.mirrorOf(hex);
    if (!isCoast(hex) || !isCoast(m)) return null;
    if (!open(hex) || !open(m)) return null;
    if (spacingViolated(hex, input.resources, input.mirrorOf, input.s.minResourceDistance)) return null;
    if (spacingViolated(m, input.resources, input.mirrorOf, input.s.minResourceDistance)) return null;
    return m;
  };

  // 1. Garantie de couverture — même nombre de cases de côte éligibles pour
  //    toutes les marines → ordre (id) croissant (R-81).
  for (const id of marines) {
    let need = 2 * input.s.minPerResourceType - input.resources.filter((r) => r.id === id).length;
    while (need > 0) {
      const candidates: Hex[] = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (grid[row]![col] !== 'eau') continue;
          const hex = colRowToHex(col, row);
          if (placeablePair(hex)) candidates.push(hex);
        }
      }
      if (candidates.length === 0) {
        throw new ProgenPlacementError(
          `garantie de couverture impossible : aucune côte éligible pour "${id}"`,
        );
      }
      const hex = candidates.reduce((best, c) => {
        const slack = (h: Hex): number => {
          let d = Number.POSITIVE_INFINITY;
          for (const p of input.resources) d = Math.min(d, hexDistance(h, p));
          return d;
        };
        const sBest = slack(best);
        const sC = slack(c);
        return sC > sBest || (sC === sBest && compareHex(c, best) < 0) ? c : best;
      });
      const m = placeablePair(hex)!;
      input.resources.push({ id: id as ResourceId, q: hex.q, r: hex.r });
      input.resources.push({ id: id as ResourceId, q: m.q, r: m.r });
      need -= 2;
    }
  }

  // 2. Tirage aléatoire sur les cases de côte de la demi-carte (paires).
  const probability = (1 / WATER_RESOURCE_DENOMINATOR) * input.s.resourceDensity;
  for (let row = 0; row < input.halfHeight; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]?.[col] !== 'eau') continue;
      const hex = colRowToHex(col, row);
      if (input.rng.next() >= probability) continue;
      // Pick pondéré par spawnWeight parmi les marines.
      const pool = marines.map((id) => ({ id, weight: RESOURCES[id]!.spawnWeight ?? 0 }));
      const total = pool.reduce((acc, c) => acc + c.weight, 0);
      let roll = input.rng.next() * total;
      let picked = pool[pool.length - 1]!;
      for (const c of pool) {
        if (roll < c.weight) {
          picked = c;
          break;
        }
        roll -= c.weight;
      }
      const m = placeablePair(hex);
      if (m) {
        input.resources.push({ id: picked.id as ResourceId, q: hex.q, r: hex.r });
        input.resources.push({ id: picked.id as ResourceId, q: m.q, r: m.r });
        continue;
      }
      // extraSpawnScale (poisson) : tirage forcé si la paire principale a échoué.
      for (const id of marines) {
        const scale = RESOURCES[id]!.extraSpawnScale?.['eau'];
        if (!scale || scale <= 0) continue;
        if (input.rng.next() < probability * scale) {
          const m2 = placeablePair(hex);
          if (m2) {
            input.resources.push({ id: id as ResourceId, q: hex.q, r: hex.r });
            input.resources.push({ id: id as ResourceId, q: m2.q, r: m2.r });
          }
          break;
        }
      }
    }
  }
}
