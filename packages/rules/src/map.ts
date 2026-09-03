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
import { BARBARIANS, RESOURCES, TERRAINS, unitType } from './data.js';
import type { PlayerId, Tile, GameState, City, BarbarianVillage, Hut } from './state.js';
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

/** R-96/Phase 7d : placement d'un village barbare (id affecté à la pose). */
export interface MapVillage {
  q: number;
  r: number;
}

/** R-98/Phase 7d : placement d'une hutte bonus. */
export interface MapHut {
  q: number;
  r: number;
}

/** Cartes commises (chargées statiquement — migration/enrichissement synchrones). */
export type BuiltinMapId = 'pedagogique-40' | 'pangee-40' | 'variee-40';

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
  /** R-96/Phase 7d : villages barbares (3 par carte 40×40 — placements équitables). */
  villages?: MapVillage[];
  /** R-98/Phase 7d : huttes bonus (2 par carte). */
  huts?: MapHut[];
  /** Phase 6c (demande d'Erik) : mode de démarrage — 'capital' (défaut : la
   *  ville existe dès l'initialisation) ou 'colon' : AUCUNE ville au départ,
   *  un Colon occupe le site réservé (`capital`, qui ne devient une ville que
   *  par FoundCity R-64) + un Guerrier adjacent. */
  start?: 'capital' | 'colon';
}

/** Carte validée : terrain par case axiale + spawns + ressources + villages/huttes. */
export interface LoadedMap {
  data: MapData;
  terrain: Record<string, string>; // clé "q,r" → TerrainId
  spawns: MapPlayerSpawn[];
  resources: MapResource[];
  villages: MapVillage[];
  huts: MapHut[];
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
      // Phase 6c : démarrage 'colon' (Erik) — Colon SUR le site réservé +
      // Guerrier adjacent ; démarrage 'capital' (défaut) — 1 Guerrier adjacent.
      const colonStart = data.start === 'colon';
      const expectedUnits = colonStart ? 2 : 1;
      if (!Array.isArray(p.units) || p.units.length !== expectedUnits) {
        issues.push(
          `joueur ${p.id} : démarrage non conforme — exactement ${expectedUnits} unité(s) attendue(s) ` +
          (colonStart ? "(Colon sur le site + Guerrier adjacent)" : "(décision d'Erik du 01/09 : 1 Guerrier à côté de la ville)"),
        );
      }
      let seenColon = false;
      let seenGuerrier = false;
      for (const u of p.units ?? []) {
        const hex = { q: u.q, r: u.r };
        const d = cap && typeof cap.q === 'number' && typeof cap.r === 'number' ? hexDistance(cap, hex) : -1;
        if (colonStart) {
          if (u.type === 'colon') {
            if (seenColon) issues.push(`joueur ${p.id} : plus d'un Colon de départ`);
            seenColon = true;
            if (d !== 0) {
              issues.push(`joueur ${p.id} : le Colon de départ occupe le site réservé (distance ${d})`);
            }
          } else if (u.type === 'guerrier') {
            if (seenGuerrier) issues.push(`joueur ${p.id} : plus d'un Guerrier de départ`);
            seenGuerrier = true;
            if (d !== 1) {
              issues.push(`joueur ${p.id} : le Guerrier de départ doit être adjacent au site (distance ${d})`);
            }
          } else {
            issues.push(`joueur ${p.id} : unité de départ inattendue "${u.type}" (Colon + Guerrier attendus)`);
          }
        } else {
          if (u.type !== 'guerrier') {
            issues.push(`joueur ${p.id} : l'unité de départ doit être un Guerrier (reçu "${u.type}")`);
          }
          if (d !== 1) {
            issues.push(`joueur ${p.id} : le Guerrier de départ doit être adjacent à la capitale (distance ${d})`);
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

  // R-96/R-98 : validations des villages barbares et des huttes — dans la
  // carte, terrain praticable (un village sur l'eau serait injoignable),
  // jamais sur une case de capitale, au plus une entité (village/hutte) par
  // case. Les ressources, elles, sont AUTORISÉES sous un village (CivRev :
  // « villages always on top of a resource »).
  const entities = [
    ...(data.villages ?? []).map((v) => ({ kind: 'village' as const, ...v })),
    ...(data.huts ?? []).map((h) => ({ kind: 'hut' as const, ...h })),
  ];
  if (issues.every((i) => !i.startsWith('rows') && !i.startsWith('légende'))) {
    const capitalKeys = new Set((data.players ?? []).map((p) => tileKeyOf(p.capital)));
    const seenEntities = new Set<string>();
    for (const e of entities) {
      const label = e.kind === 'village' ? 'village' : 'hutte';
      const key = tileKeyOf(e);
      if (!inRectangle(e, width, height)) {
        issues.push(`${label} hors carte (${key})`);
        continue;
      }
      const t = terrain[key];
      if (t === undefined) {
        issues.push(`${label} hors carte (${key})`);
        continue;
      }
      if (!TERRAINS[t]!.passable) {
        issues.push(`${label} sur terrain infranchissable (${t}) en ${key}`);
      }
      if (capitalKeys.has(key)) {
        issues.push(`${label} sur une case de capitale (${key})`);
      }
      if (seenEntities.has(key)) {
        issues.push(`plus d'un village/hutte sur la case ${key}`);
      }
      seenEntities.add(key);
    }
  }

  if (issues.length) throw new MapValidationError(issues);
  return { data, terrain, spawns: data.players, resources, villages: data.villages ?? [], huts: data.huts ?? [] };
}

import pedagogiqueJson from './data/maps/pedagogique-40.json' with { type: 'json' };
import pangeeJson from './data/maps/pangee-40.json' with { type: 'json' };
import varieeJson from './data/maps/variee-40.json' with { type: 'json' };

/** Charge une des cartes commises (source des données : src/data/maps). */
export async function loadBuiltinMap(id: BuiltinMapId): Promise<LoadedMap> {
  return loadBuiltinMapSync(id);
}

/**
 * Variante SYNCHRONE (Phase 7d) : les trois cartes sont importées
 * statiquement — indispensable à `applyMapEntities` pour l'enrichissement des
 * états migrés v7 (le serveur connaît le `mapId` de la partie, le moteur pur
 * doit pouvoir l'appliquer sans IO asynchrone).
 */
export function loadBuiltinMapSync(id: BuiltinMapId): LoadedMap {
  const mod =
    id === 'pangee-40' ? pangeeJson : id === 'variee-40' ? varieeJson : pedagogiqueJson;
  return parseMap(mod as unknown as MapData);
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
  // Phase 6c (Erik) : démarrage 'colon' — AUCUNE ville à l'initialisation ;
  // le Colon occupe le site réservé et fondera via FoundCity (R-64, la
  // première ville devient capitale). L'ancre garde son terrain d'origine.
  const colonStart = map.data.start === 'colon';
  map.spawns.forEach((spawn, i) => {
    if (colonStart) return;
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
      buildings: ['palais'], // 7e : le Palais ne vit que dans la capitale
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
    // Villages/huttes réellement posés par applyMapEntities ci-dessous (R-96/R-98).
    villages: [],
    huts: [],
    mapId: map.data.id,
    firstBy: {}, // 7e : Premier découvrir (aucun au départ)
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

  // R-96/R-98 : villages barbares et huttes portés de la carte vers l'état
  // (ids affectés par (q, r) croissant — déterminisme R-81 ; compteurs à zéro).
  return applyMapEntities(state, map);
}

/**
 * R-96/R-98 · Porte les villages et huttes d'une carte validée dans l'état,
 * compteurs à zéro, et mémorise l'`mapId`. Utilisé par `createInitialState`
 * ET par le serveur pour ENRICHIR les états v7 migrés (la migration moteur ne
 * connaît pas la carte — le serveur, lui, a `meta.settings.mapId`).
 * Pure : retourne un nouvel état, l'entrée n'est pas mutée.
 */
export function applyMapEntities(state: GameState, map: LoadedMap): GameState {
  const villages: BarbarianVillage[] = [...map.villages]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((v, i) => ({
      id: `v${i + 1}`,
      q: v.q,
      r: v.r,
      hp: BARBARIANS.villageHP,
      spawnCountdown: BARBARIANS.spawnInterval,
      spawnedUnits: [],
    }));
  const huts: Hut[] = [...map.huts]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((h, i) => ({ id: `h${i + 1}`, q: h.q, r: h.r }));
  return { ...state, mapId: map.data.id, villages, huts };
}
