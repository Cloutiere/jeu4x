/**
 * Helpers de fixtures pour construire des états de test (L2).
 * Code pur (aucune IO) : utilisable depuis les tests et les futurs bots.
 */
import { tileKey, tileKeyOf, colRowToHex, neighbors, hexDistance } from './hex.js';
import type { Hex } from './hex.js';
import type {
  City,
  CityId,
  GameState,
  Order,
  Player,
  PlayerId,
  Tile,
  Unit,
  UnitId,
} from './state.js';
import { CURRENT_SCHEMA_VERSION, areAtWar } from './state.js';
import { TERRAINS, unitType } from './data.js';
import type { TerrainId } from './types.js';
import { SCIENCE_RATIO_DEFAULT } from './constants.js';

export interface UnitSpec {
  id?: UnitId;
  type: string;
  owner: PlayerId;
  q: number;
  r: number;
  hp?: number;
  mp?: number;
  veteran?: boolean;
  isArmy?: boolean;
  order?: Order | null;
  fortified?: boolean;
}

export interface CitySpec {
  id?: CityId;
  owner: PlayerId;
  q: number;
  r: number;
  pop?: number;
  capital?: boolean;
  foodStored?: number;
  production?: City['production'];
  /** Cases travaillées (R-60) — sinon [] (auto-assignées en Phase C). */
  workedTiles?: string[];
  /** Bâtiments possédés (R-66). */
  buildings?: string[];
}

export interface MakeStateOptions {
  width?: number;
  height?: number;
  /** Terrain par défaut du fond de carte. */
  fill?: TerrainId;
  /** Cases à terrain spécifique (clés "q,r"). */
  terrainOverrides?: Record<string, TerrainId>;
  players?: PlayerId[];
  units?: UnitSpec[];
  cities?: CitySpec[];
  turn?: number;
  rngSeed?: number;
  /** Paires en guerre (défaut : toutes les paires des joueurs déclarés — v1). */
  warPairs?: Array<[PlayerId, PlayerId]>;
}

/** Map rectangulaire de prairie (ou du terrain fourni), clé "q,r". */
export function grassMap(width: number, height: number, fill: TerrainId = 'prairie'): Record<string, Tile> {
  const map: Record<string, Tile> = {};
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const hex = colRowToHex(col, row);
      map[tileKeyOf(hex)] = { terrain: fill, resource: null };
    }
  }
  return map;
}

function defaultWarPairs(players: PlayerId[]): Array<[PlayerId, PlayerId]> {
  const pairs: Array<[PlayerId, PlayerId]> = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push([players[i]!, players[j]!]);
    }
  }
  return pairs;
}

/** Construit un GameState de test valide et minimal. */
export function makeState(opts: MakeStateOptions = {}): GameState {
  const width = opts.width ?? 8;
  const height = opts.height ?? 8;
  const players = opts.players ?? ['p1', 'p2'];
  const map = grassMap(width, height, opts.fill ?? 'prairie');
  for (const [key, t] of Object.entries(opts.terrainOverrides ?? {})) {
    if (!TERRAINS[t]) throw new Error(`Terrain inconnu dans les fixtures : ${t}`);
    map[key] = { terrain: t, resource: null };
  }

  const playerRecords: Record<PlayerId, Player> = {};
  for (const id of players) {
    playerRecords[id] = {
      id,
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

  const units: Record<UnitId, Unit> = {};
  (opts.units ?? []).forEach((spec, i) => {
    const stats = unitType(spec.type);
    const id = spec.id ?? `u${i + 1}`;
    if (units[id]) throw new Error(`unitId dupliqué dans les fixtures : ${id}`);
    units[id] = {
      id,
      type: spec.type,
      owner: spec.owner,
      q: spec.q,
      r: spec.r,
      hp: spec.hp ?? stats.hpMax,
      mp: spec.mp ?? stats.movement,
      veteran: spec.veteran ?? false,
      isArmy: spec.isArmy ?? false,
      order: spec.order ?? null,
      detainedBy: null,
      fortified: spec.fortified ?? false,
    };
  });

  const cities: Record<CityId, City> = {};
  (opts.cities ?? []).forEach((spec, i) => {
    const id = spec.id ?? `c${i + 1}`;
    if (cities[id]) throw new Error(`cityId dupliqué dans les fixtures : ${id}`);
    cities[id] = {
      id,
      q: spec.q,
      r: spec.r,
      owner: spec.owner,
      pop: spec.pop ?? 1,
      capital: spec.capital ?? false,
      foodStored: spec.foodStored ?? 0,
      production: spec.production ?? null,
      workedTiles: spec.workedTiles ?? [],
      buildings: spec.buildings ?? [],
    };
  });

  const warPairs = opts.warPairs ?? defaultWarPairs(players);

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    turn: opts.turn ?? 0,
    phase: 'orders',
    rngSeed: opts.rngSeed ?? 42,
    lastEventSeq: 0,
    winner: null,
    mapWidth: width,
    mapHeight: height,
    map,
    players: playerRecords,
    units,
    cities,
    settings: { turnTimerMinutes: null },
    diplomacy: { war: warPairs },
  };
  return state;
}

/** Variante rapide : état + accès indexés pour les assertions. */
export function unit(state: GameState, id: UnitId): Unit {
  const u = state.units[id];
  if (!u) throw new Error(`Fixture : unité absente ${id}`);
  return u;
}

export function city(state: GameState, id: CityId): City {
  const c = state.cities[id];
  if (!c) throw new Error(`Fixture : ville absente ${id}`);
  return c;
}

export function unitAt(state: GameState, q: number, r: number): Unit | null {
  for (const id of Object.keys(state.units).sort()) {
    const u = state.units[id]!;
    if (u.q === q && u.r === r) return u;
  }
  return null;
}

export function cityAt(state: GameState, q: number, r: number): City | null {
  for (const id of Object.keys(state.cities).sort()) {
    const c = state.cities[id]!;
    if (c.q === q && c.r === r) return c;
  }
  return null;
}

/** Premier voisin libre et praticable d'une case, tri (q, r) — pratique pour placer. */
export function freeNeighbor(state: GameState, hex: Hex): Hex | null {
  const candidates = neighbors(hex).filter((h) => {
    const tile = state.map[tileKeyOf(h)];
    if (!tile || !TERRAINS[tile.terrain]?.passable) return false;
    if (unitAt(state, h.q, h.r)) return false;
    return true;
  });
  return candidates[0] ?? null;
}

/** Garde-fou de test : les deux joueurs v1 sont bien en guerre (R-58). */
export function expectWar(state: GameState, a: PlayerId, b: PlayerId): void {
  if (!areAtWar(state, a, b)) throw new Error(`Fixture : ${a} et ${b} devraient être en guerre`);
}

/** Chemin orthogonal simple de `from` vers `to` (suit une ligne hexagonale, terrain non vérifié). */
export function pathBetween(from: Hex, to: Hex): Hex[] {
  const path: Hex[] = [];
  let cur = from;
  while (hexDistance(cur, to) > 0) {
    const next = neighbors(cur)
      .filter((h) => hexDistance(h, to) < hexDistance(cur, to))
      .sort((a, b) => hexDistance(a, to) - hexDistance(b, to) || a.q - b.q || a.r - b.r)[0]!;
    path.push(next);
    cur = next;
  }
  return path;
}

export { tileKey };
