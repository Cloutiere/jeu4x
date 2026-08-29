/**
 * GameState persisté et versionné — DESIGN.md §4.2 et §3.8.
 *
 * §3.8 : les parties durent des jours, le code sera redéployé pendant.
 * Toute structure persistée porte `schemaVersion` ; la chaîne de migrations
 * (`MIGRATIONS`, `migrateState`) est exportée dès ce premier commit et
 * s'exécutera au chargement côté serveur (lazy-load du GameDO).
 */
import type { TerrainId } from './types.js';

export type PlayerId = string;
export type UnitId = string;
export type CityId = string;
/** Clé de case "q,r" (hex.ts). */
export type TileKey = string;

/** Ordres déclaratifs — RULES.md §4. Reçus déjà verrouillés par resolveTurn (L4). */
export type Order =
  /** Exécution pas à pas, multi-tours ; halte si un ennemi devient visible. */
  | { type: 'Move'; unitId: UnitId; path: Array<{ q: number; r: number }> }
  /** Attaque explicite d'une case cible adjacente. */
  | { type: 'Attack'; unitId: UnitId; target: { q: number; r: number } }
  /** Consomme le Colon (Phase C, R-64). */
  | { type: 'FoundCity'; unitId: UnitId }
  /** Fusion d'armée (R-31) — traitée en fin de Phase A (R-44). */
  | { type: 'FormArmy'; members: [UnitId, UnitId, UnitId]; rally: { q: number; r: number } }
  /** Ne rien faire. */
  | { type: 'Hold'; unitId: UnitId }
  /** File de production d'une ville (R-62) — progression conservée. */
  | { type: 'SetProduction'; cityId: CityId; item: string };

export interface Tile {
  terrain: TerrainId;
  /** Réservation design.md §4.2 (non utilisée en v1). */
  resource: null;
}

export interface Unit {
  id: UnitId;
  /** Clé du type dans units.json ('guerrier' | 'colon' en v1). */
  type: string;
  owner: PlayerId;
  q: number;
  r: number;
  hp: number;
  /** Points de mouvement restants ce tour (R-72 : régénérés au max en Phase D). */
  mp: number;
  veteran: boolean;
  /** true pour une armée fusionnée (R-31). */
  isArmy: boolean;
  /** Intention courante restante (chemin gelé d'un Move, null sinon). */
  order: Order | null;
  /** R-43/§7.7-c : détention en temps de paix (Phase 7) — null en v1. */
  detainedBy: PlayerId | null;
}

export interface CityProduction {
  item: string;
  progress: number;
}

export interface City {
  id: CityId;
  q: number;
  r: number;
  owner: PlayerId;
  pop: number;
  /** Capitale : sa capture = victoire par domination (R-65). */
  capital: boolean;
  /** Nourriture cumulée vers le prochain palier (R-63). */
  foodStored: number;
  production: CityProduction | null;
  /** Case travaillée (R-60) — clé "q,r", null = auto-assignation en Phase C. */
  workedTile: TileKey | null;
}

export interface Vision {
  /** Cases mémorisées (terrain figé, entités ennemies cachées) — triées. */
  explored: TileKey[];
  /** Cases actuellement visibles — triées. */
  visible: TileKey[];
}

export interface Player {
  id: PlayerId;
  /** Trésor en or. */
  gold: number;
  /** Science cumulée (arbre technologique : Phase 7). */
  science: number;
  /** Curseur global science/or (R-61, 🔶 défaut 0.5). */
  scienceRatio: number;
  vision: Vision;
  /** Timers manqués consécutifs (forfait T-06 — géré côté serveur, Phase 1). */
  missedTurns: number;
}

export interface GameSettings {
  /** Timer par partie, fixé à la création (null = pas de timer). */
  turnTimerMinutes: number | null;
}

export interface GameState {
  schemaVersion: number;
  turn: number;
  phase: 'orders' | 'resolving';
  /** Graine du RNG mulberry32 (R-80) — avance uniquement en Phase B. */
  rngSeed: number;
  /** Dernier seq du journal d'événements (R-73, continuité inter-tours). */
  lastEventSeq: number;
  /** Joueur vainqueur, null tant que la partie est en cours. */
  winner: PlayerId | null;
  /** Dimensions de la disposition rectangulaire (hex.ts). */
  mapWidth: number;
  mapHeight: number;
  map: Record<TileKey, Tile>;
  players: Record<PlayerId, Player>;
  units: Record<UnitId, Unit>;
  cities: Record<CityId, City>;
  settings: GameSettings;
  /** Points d'accroche diplomatie (R-58) : paires en guerre. v1 = les deux joueurs. */
  diplomacy: { war: Array<[PlayerId, PlayerId]> };
}

/** R-58-a : les deux nations sont-elles en guerre ? */
export function areAtWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return false;
  return state.diplomacy.war.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// ---------------------------------------------------------------------------
// Versionnage du schéma — DESIGN.md §3.8. La chaîne commence au premier commit.
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 1;

type AnyState = Record<string, unknown>;

/**
 * Migrations v(n-1) → v(n), indexées par version cible. v1 = état initial :
 * la case [1] est intentionally absente (rien à migrer vers v1).
 * Chaque migration doit être pure et totales sur les champs de sa version.
 */
export const MIGRATIONS: Record<number, (state: AnyState) => AnyState> = {};

/**
 * Applique la chaîne de migrations jusqu'à CURRENT_SCHEMA_VERSION.
 * Lève une erreur sur une version inconnue ou plus récente que le code.
 */
export function migrateState<T = GameState>(raw: AnyState): T {
  let state = raw;
  let v = typeof state.schemaVersion === 'number' ? state.schemaVersion : -1;
  if (v < 1 || v > CURRENT_SCHEMA_VERSION) {
    throw new Error(`schemaVersion inconnue : ${String(state.schemaVersion)}`);
  }
  while (v < CURRENT_SCHEMA_VERSION) {
    const next = v + 1;
    const migrate = MIGRATIONS[next];
    if (!migrate) throw new Error(`Migration manquante v${v} → v${next}`);
    state = migrate(state);
    state = { ...state, schemaVersion: next };
    v = next;
  }
  return state as T;
}

// ---------------------------------------------------------------------------
// Tri déterministe des identifiants — R-81 (indépendant des joueurs).
// ---------------------------------------------------------------------------

/**
 * Compare deux identifiants par suffixe numérique quand les deux en ont un
 * ("u12" < "u13"), sinon lexicalement. Évite le piège lexicographique
 * "u10" < "u9" tout en restant total et déterministe.
 */
export function compareIds(a: string, b: string): number {
  const ma = /^(\D*?)(\d+)$/.exec(a);
  const mb = /^(\D*?)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) {
    const d = Number(ma[2]) - Number(mb[2]);
    if (d !== 0) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareUnitIds(a: UnitId, b: UnitId): number {
  return compareIds(a, b);
}

export function compareCityIds(a: CityId, b: CityId): number {
  return compareIds(a, b);
}

/** Plus grand suffixe numérique existant + 1, formaté avec le préfixe donné. */
export function nextId(existing: Record<string, unknown>, prefix: string): string {
  let max = 0;
  for (const key of Object.keys(existing)) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
