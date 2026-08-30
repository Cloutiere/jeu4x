/**
 * Économie des villes — Phase 6 (RULES.md §2 révisé, R-60, R-61, R-66).
 *
 * Fonctions PURES et déterministes (R-81/R-82) :
 *  - tileYield : rendement effectif d'une case pour une ville (base §2 +
 *    bonus des bâtiments de la ville par terrain travaillé, R-66) ;
 *  - workRadiusOf : rayon de travail (T-08b = 1, 2 avec Tribunal) ;
 *  - autoAssignWorkedTiles : assignation déterministe des citoyens
 *    (priorité nourriture > production > commerce, tie-break (q, r) — R-81).
 *
 * Le commerce N'EST PAS l'or : il est réparti or/science par le curseur
 * global du joueur (R-61) dans turn.ts/processEconomy.
 */
import { hexesWithinRadius, compareHex, tileKeyOf, parseTileKey } from './hex.js';
import type { Hex } from './hex.js';
import { TERRAINS, BUILDINGS } from './data.js';
import type { TerrainId, Yields } from './types.js';
import { CITY_WORK_RADIUS } from './constants.js';
import type { TileKey } from './state.js';

export const ZERO_YIELDS: Yields = { food: 0, production: 0, commerce: 0 };

function addYields(a: Yields, b: Yields): Yields {
  return { food: a.food + b.food, production: a.production + b.production, commerce: a.commerce + b.commerce };
}

/** La case est-elle travaillable par une ville (montagne/mer comprises, R-60) ? */
export function tileWorkable(map: Record<TileKey, { terrain: TerrainId }>, key: TileKey): boolean {
  const tile = map[key];
  return !!tile && !!TERRAINS[tile.terrain]?.yields;
}

/** Rayon de travail d'une ville : T-08b + bonus du Tribunal (R-60/R-66). */
export function workRadiusOf(buildings: string[]): number {
  let radius = CITY_WORK_RADIUS;
  for (const id of buildings) {
    const b = BUILDINGS[id];
    if (b) radius += b.workRadiusBonus;
  }
  return radius;
}

/**
 * Rendement effectif d'une case pour une ville donnée : base §2 + bonus de
 * CHAQUE bâtiment ciblant le terrain de la case (R-66). Retourne null si la
 * case n'est pas travaillable (absente, ou terrain sans rendements).
 */
export function tileYield(
  map: Record<TileKey, { terrain: TerrainId }>,
  buildings: string[],
  key: TileKey,
): Yields | null {
  const tile = map[key];
  if (!tile) return null;
  const base = TERRAINS[tile.terrain]?.yields;
  if (!base) return null;
  let y: Yields = { ...base };
  for (const id of buildings) {
    const bonus = BUILDINGS[id]?.tileBonus;
    if (bonus && bonus.terrain === tile.terrain) {
      y = addYields(y, { food: bonus.food, production: bonus.production, commerce: bonus.commerce });
    }
  }
  return y;
}

/** Clés candidates au travail d'une ville : dans le rayon, hors centre, hors villes. */
export function workableTilesFor(
  map: Record<TileKey, { terrain: TerrainId }>,
  cities: Array<Hex>,
  city: Hex,
  radius: number,
): TileKey[] {
  const cityKeys = new Set(cities.map((c) => tileKeyOf(c)));
  return hexesWithinRadius(city, radius)
    .filter((h) => hexDistanceAtLeast1(h, city))
    .map(tileKeyOf)
    .filter((key) => tileWorkable(map, key) && !cityKeys.has(key));
}

function hexDistanceAtLeast1(a: Hex, b: Hex): boolean {
  return !(a.q === b.q && a.r === b.r);
}

/**
 * R-60 · Auto-assignation déterministe des citoyens : les `pop` meilleures
 * cases libres par priorité nourriture > production > commerce (rendements
 * EFFECTIFS, bonus bâtiments compris), tie-break (q, r) croissant (R-81).
 * `taken` = cases déjà travaillées par d'autres villes (une case travaillée
 * l'est par exactement une ville). Le centre-ville n'est JAMAIS assigné :
 * il est exploité automatiquement et gratuitement.
 */
export function autoAssignWorkedTiles(
  map: Record<TileKey, { terrain: TerrainId }>,
  cities: Array<Hex>,
  city: Hex & { pop: number; buildings: string[] },
  taken: Set<TileKey> = new Set<TileKey>(),
): TileKey[] {
  const radius = workRadiusOf(city.buildings);
  const candidates = workableTilesFor(map, cities, city, radius)
    .filter((key) => !taken.has(key))
    .map((key) => ({ key, y: tileYield(map, city.buildings, key)! }))
    .sort(
      (a, b) =>
        b.y.food - a.y.food ||
        b.y.production - a.y.production ||
        b.y.commerce - a.y.commerce ||
        compareHex(parseTileKey(a.key)!, parseTileKey(b.key)!),
    );
  return candidates.slice(0, city.pop).map((c) => c.key);
}
