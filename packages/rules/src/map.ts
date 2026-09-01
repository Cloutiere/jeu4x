/**
 * L3 — Cartes préfabriquées : format JSON + loader validé.
 *
 * Format (disposition rectangulaire axiale, hex.ts) :
 *  - `rows[r]` : chaîne de `width` caractères, la colonne c de la rangée r
 *    correspond à la case axiale (q = c − ⌊r/2⌋, r) ;
 *  - `legend` : caractère → identifiant de terrain (doit exister dans terrain.json) ;
 *  - `players` : exactement 2 en v1, chaque joueur a sa capitale et son unité
 *    de départ — 1 Guerrier sur une case adjacente praticable de la capitale
 *    (décision d'Erik du 01/09 : plus de Colon au départ) ;
 *  - `resources` (optionnel, R-94/Phase 7c) : placements explicites
 *    `[{id, q, r}]` — données commises, calibrage par édition.
 *
 * Validations testées : dimensions, terrains connus, spawns dans la carte et
 * praticables, capitales à distance ≥ 12, types d'unités connus, au plus une
 * unité par case, pas de chevauchement capitale/unité adverse, et pour les
 * ressources (R-94) : id connu, terrain de la case ∈ `terrains` de la
 * ressource, au plus une par case, jamais sur une case de capitale.
 */
import { colRowToHex, hexDistance, inRectangle, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { RESOURCES, TERRAINS, unitType } from './data.js';
import type { PlayerId, Tile, GameState, City } from './state.js';
import { CURRENT_SCHEMA_VERSION } from './state.js';
import type { ResourceId } from './types.js';
import { SCIENCE_RATIO_DEFAULT, VISION_RADIUS_CITY } from './constants.js';
import { CONVERSION_DEFAULT } from './conversion.js';
import { hexesWithinRadius } from './hex.js';

export interface MapPlayerSpawn {
  id: PlayerId;
  capital: Hex;
  units: Array<{ type: string; q: number; r: number }>;
}

/** R-94 : placement explicite d'une ressource sur la carte. */
export interface MapResource {
  id: ResourceId;
  q: number;
  r: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  legend: Record<string, string>;
  rows: string[];
  players: MapPlayerSpawn[];
  /** R-94 : tableau optionnel (absent = carte sans ressource). */
  resources?: MapResource[];
}

/** Carte validée : terrain par case axiale + spawns + ressources. */
export interface LoadedMap {
  data: MapData;
  terrain: Record<string, string>; // clé "q,r" → TerrainId
  spawns: MapPlayerSpawn[];
  resources: MapResource[];
}

export class MapValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Carte invalide (${issues.length} problème(s)) :\n- ${issues.join('\n- ')}`);
    this.issues = issues;
  }
}

/** Rendements minimaux attendus des unités de départ (décision #7). */
const MIN_SPAWN_DISTANCE = 12;

export function parseMap(raw: unknown): LoadedMap {
  const issues: string[] = [];
  const data = raw as MapData;

  if (!data || typeof data !== 'object') throw new MapValidationError(['JSON non objet']);
  if (typeof data.id !== 'string' || data.id.length === 0) issues.push('id manquant');
  if (!Number.isInteger(data.width) || (data.width ?? 0) < 1) issues.push('width invalide');
  if (!Number.isInteger(data.height) || (data.height ?? 0) < 1) issues.push('height invalide');
  if (issues.length) throw new MapValidationError(issues);

  const { width, height } = data;

  if (!Array.isArray(data.rows) || data.rows.length !== height) {
    issues.push(`rows doit contenir ${height} ligne(s)`);
  }
  const legend = data.legend ?? {};
  for (const [ch, t] of Object.entries(legend)) {
    if (!TERRAINS[t]) issues.push(`légende : terrain inconnu "${t}" (caractère "${ch}")`);
  }
  if (!Array.isArray(data.players) || data.players.length !== 2) {
    issues.push('v1 : exactement 2 joueurs requis');
  }

  const terrain: Record<string, string> = {};
  if (!issues.some((i) => i.startsWith('rows') || i.startsWith('légende'))) {
    for (let row = 0; row < height; row++) {
      const line = data.rows[row] ?? '';
      if (line.length !== width) {
        issues.push(`rangée ${row} : ${line.length} caractères au lieu de ${width}`);
        continue;
      }
      for (let col = 0; col < width; col++) {
        const ch = line[col]!;
        const t = legend[ch];
        if (!t) {
          issues.push(`caractère inconnu "${ch}" en (col ${col}, rangée ${row})`);
          continue;
        }
        terrain[tileKeyOf(colRowToHex(col, row))] = t;
      }
    }
  }

  if (data.players?.length === 2) {
    const seenUnits = new Set<string>();
    const capitals: Hex[] = [];
    data.players.forEach((p, i) => {
      if (typeof p.id !== 'string' || !p.id) issues.push(`joueur #${i} : id manquant`);
      const cap = p.capital as Hex | undefined;
      if (!cap || typeof cap.q !== 'number' || typeof cap.r !== 'number') {
        issues.push(`joueur #${i} : capitale invalide`);
        return;
      }
      capitals.push(cap);
      if (!inRectangle(cap, width, height)) {
        issues.push(`capitale de ${p.id} hors carte`);
      } else {
        const t = terrain[tileKeyOf(cap)];
        if (t && !TERRAINS[t]!.passable) issues.push(`capitale de ${p.id} sur terrain infranchissable (${t})`);
      }
      if (!Array.isArray(p.units) || p.units.length !== 1) {
        issues.push(
          `joueur ${p.id} : démarrage non conforme — exactement 1 unité attendue ` +
          `(décision d'Erik du 01/09 : 1 Guerrier à côté de la ville, plus de Colon)`,
        );
      }
      for (const u of p.units ?? []) {
        if (u.type !== 'guerrier') {
          issues.push(`joueur ${p.id} : l'unité de départ doit être un Guerrier (reçu "${u.type}")`);
        }
        const hex = { q: u.q, r: u.r };
        if (cap && typeof cap.q === 'number' && typeof cap.r === 'number') {
          if (hexDistance(cap, hex) !== 1) {
            issues.push(`joueur ${p.id} : le Guerrier de départ doit être adjacent à la capitale (distance ${hexDistance(cap, hex)})`);
          }
        }
        if (!inRectangle(hex, width, height)) {
          issues.push(`unité ${u.type} de ${p.id} hors carte`);
        } else {
          const t = terrain[tileKeyOf(hex)];
          if (t && !TERRAINS[t]!.passable) {
            issues.push(`unité ${u.type} de ${p.id} sur terrain infranchissable (${t})`);
          }
        }
        const key = tileKeyOf(hex);
        if (seenUnits.has(key)) issues.push(`plus d'une unité sur la case ${key}`);
        seenUnits.add(key);
      }
    });
    // Distance minimale entre capitales (décision #7 : spawns ≥ 12).
    if (capitals.length === 2) {
      const d = hexDistance(capitals[0]!, capitals[1]!);
      if (d < MIN_SPAWN_DISTANCE) {
        issues.push(`capitales à distance ${d} < ${MIN_SPAWN_DISTANCE}`);
      }
    }
  }

  // R-94 : validations des placements de ressources (id connu, terrain
  // autorisé, unicité par case, jamais sur une capitale).
  const resources = data.resources ?? [];
  if (issues.every((i) => !i.startsWith('rows') && !i.startsWith('légende'))) {
    const capitalKeys = new Set((data.players ?? []).map((p) => tileKeyOf(p.capital)));
    const seenResourceTiles = new Set<string>();
    for (const res of resources) {
      const data2 = RESOURCES[res.id];
      if (!data2) {
        issues.push(`ressource inconnue : "${res.id}"`);
        continue;
      }
      const key = tileKeyOf({ q: res.q, r: res.r });
      const t = terrain[key];
      if (t === undefined) {
        issues.push(`ressource ${res.id} hors carte (${key})`);
        continue;
      }
      if (!(data2.terrains as readonly string[]).includes(t)) {
        issues.push(`ressource ${res.id} sur terrain non autorisé (${t} ∈ [${data2.terrains.join(', ')}]) en ${key}`);
      }
      if (seenResourceTiles.has(key)) {
        issues.push(`plus d'une ressource sur la case ${key}`);
      }
      seenResourceTiles.add(key);
      if (capitalKeys.has(key)) {
        issues.push(`ressource ${res.id} sur une case de capitale (${key})`);
      }
    }
  }

  if (issues.length) throw new MapValidationError(issues);
  return { data, terrain, spawns: data.players, resources };
}

/** Charge une des cartes commises (source des données : src/data/maps). */
export async function loadBuiltinMap(id: 'pedagogique-40' | 'pangee-40' | 'variee-40'): Promise<LoadedMap> {
  const mod =
    id === 'pangee-40'
      ? await import('./data/maps/pangee-40.json', { with: { type: 'json' } })
      : id === 'variee-40'
        ? await import('./data/maps/variee-40.json', { with: { type: 'json' } })
        : await import('./data/maps/pedagogique-40.json', { with: { type: 'json' } });
  return parseMap(mod.default);
}

/**
 * État initial : capitales fondées (pop 1), unités de départ placées,
 * vision initiale calculée, guerre permanente entre les deux joueurs (R-58).
 */
export function createInitialState(map: LoadedMap, rngSeed: number): GameState {
  const terrainById = map.terrain;
  const mapRecord: Record<string, Tile> = {};
  for (const [key, t] of Object.entries(terrainById)) {
    mapRecord[key] = { terrain: t as Tile['terrain'], resource: null };
  }
  // R-94 : recopie des placements de ressources de la carte dans l'état
  // (validés par parseMap : terrain autorisé, unicité, pas de capitale).
  for (const res of map.resources) {
    const tile = mapRecord[tileKeyOf(res)];
    if (tile) tile.resource = res.id;
  }

  const players: GameState['players'] = {};
  for (const spawn of map.spawns) {
    players[spawn.id] = {
      id: spawn.id,
      gold: 0,
      science: 0,
      scienceRatio: SCIENCE_RATIO_DEFAULT,
      researching: null,
      scienceProgress: {},
      techsUnlocked: [],
      scienceStored: 0,
      vision: { explored: [], visible: [] },
      missedTurns: 0,
    };
  }

  const cities: Record<string, City> = {};
  map.spawns.forEach((spawn, i) => {
    const id = `c${i + 1}`;
    cities[id] = {
      id,
      q: spawn.capital.q,
      r: spawn.capital.r,
      owner: spawn.id,
      pop: 1,
      capital: true,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: [],
      conversion: CONVERSION_DEFAULT, // R-90 : défaut Or
    };
    // La case de capitale devient une case de ville (RULES.md §2).
    mapRecord[tileKeyOf(spawn.capital)] = { terrain: 'ville', resource: null };
  });

  const units: GameState['units'] = {};
  let n = 0;
  for (const spawn of map.spawns) {
    for (const spec of spawn.units) {
      n += 1;
      const stats = unitType(spec.type);
      units[`u${n}`] = {
        id: `u${n}`,
        type: spec.type,
        owner: spawn.id,
        q: spec.q,
        r: spec.r,
        hp: stats.hpMax,
        mp: stats.movement,
        veteran: false,
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
      };
    }
  }

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    turn: 0,
    phase: 'orders',
    rngSeed,
    lastEventSeq: 0,
    winner: null,
    mapWidth: map.data.width,
    mapHeight: map.data.height,
    map: mapRecord,
    players,
    units,
    cities,
    settings: { turnTimerMinutes: null },
    diplomacy: { war: [[map.spawns[0]!.id, map.spawns[1]!.id]] },
  };

  // Vision initiale : rayon des unités (T-07, data-driven) + des villes (T-08).
  for (const spawn of map.spawns) {
    const visible = new Set<string>();
    for (const unit of Object.values(state.units)) {
      if (unit.owner !== spawn.id) continue;
      const radius = unitType(unit.type).visionRadius;
      for (const h of hexesWithinRadius(unit, radius)) visible.add(tileKeyOf(h));
    }
    for (const city of Object.values(state.cities)) {
      if (city.owner !== spawn.id) continue;
      for (const h of hexesWithinRadius(city, VISION_RADIUS_CITY)) visible.add(tileKeyOf(h));
    }
    state.players[spawn.id]!.vision = {
      explored: [...visible].sort(),
      visible: [...visible].sort(),
    };
  }

  return state;
}
