/**
 * GameState persisté et versionné — DESIGN.md §4.2 et §3.8.
 *
 * §3.8 : les parties durent des jours, le code sera redéployé pendant.
 * Toute structure persistée porte `schemaVersion` ; la chaîne de migrations
 * (`MIGRATIONS`, `migrateState`) est exportée dès ce premier commit et
 * s'exécutera au chargement côté serveur (lazy-load du GameDO).
 */
import type { TerrainId, TileResource } from './types.js';
import { BARBARIAN_ID, TERRAINS } from './data.js';

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
  /** Fortification permanente (R-33) — non consommé, annulé par tout autre ordre. */
  | { type: 'Fortify'; unitId: UnitId }
  /** File de production d'une ville (R-62) — progression conservée. Items :
   *  unités ET bâtiments (R-66, Phase 6). */
  | { type: 'SetProduction'; cityId: CityId; item: ProductionItem }
  /** R-60 (Phase 6) : assigne un citoyen à une case (rayon de travail, libre,
   *  travaillable) ; désassigner = cibler null. Un ciblage d'une case déjà
   *  travaillée par la MÊME ville est un échange (re-assignation). */
  | { type: 'SetWorkedTile'; cityId: CityId; tile: TileKey | null }
  /** 7f · R-115 : installe DÉFINITIVEMENT un Personnage illustre dans une
   *  ville AMIE (sur sa case ou adjacente) — consomme l'unité, +1 jalon
   *  culturel au joueur. */
  | { type: 'InstallPerson'; unitId: UnitId; cityId: CityId }
  /** 7j · R-126 : choix Consume/Settle d'un Personnage illustre. Consume :
   *  effet massif immédiat selon la classe, le GP DISPARAÎT. Settle :
   *  installation permanente dans la ville cible (amie, sur sa case ou
   *  adjacente — comme R-115) : multiplicateur de rendement permanent.
   *  `InstallPerson` reste accepté comme alias historique de
   *  `GreatPersonAction{action:'settle'}` (compat des clients 7f/7h). */
  | { type: 'GreatPersonAction'; unitId: UnitId; action: 'consume' | 'settle'; cityId: CityId }
  /** 7g · R-119 : mission d'espionnage — infiltration d'une ville ennemie
   *  VISIBLE adjacente. Tranche 7g : vol de GP installé uniquement (le
   *  champ `mission` prépare 7h : contre-espionnage, vol de tech). */
  | { type: 'SpyMission'; unitId: UnitId; cityId: CityId; mission: 'stealGreatPerson' };

/** Item de production (R-62/R-66) : une unité, un bâtiment — ou une merveille
 *  (7f : merveilles à effets simples + Nations Unies, R-116). */
export interface ProductionItem {
  kind: 'unit' | 'building' | 'wonder';
  id: string;
}

export interface Tile {
  terrain: TerrainId;
  /** R-91/Phase 7c : ressource posée sur la case (id de resources.json) —
   *  null = aucune. Le champ existait à null depuis v1 ; l'élargissement du
   *  type (7b → 7c) ne change pas la forme : migration v6 → v7 no-op.
   *  R-92 (D1 révisée) : la valeur « inconnue » (marqueur d'identité masquée)
   *  n'est JAMAIS persistée — elle n'existe que dans l'état filtré diffusé. */
  resource: TileResource | null;
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
  /** R-33 : position fortifiée — bonus T-17, persiste tant qu'aucun autre ordre n'est donné. */
  fortified: boolean;
  /** 7g · R-117 : transport en cours (`aboard` = id du navire porteur) —
   *  null pour une entité de carte. Une unité à bord n'occupe pas, ne
   *  bloque pas, ne combat pas ; sa position miroite celle du transport. */
  aboard: UnitId | null;
  /** 7g · R-117 : cargaison embarquée (transport uniquement) — au plus une
   *  unité terrestre par Galère/Galion (cargoCapacity, décision d'Erik). */
  cargo: UnitId | null;
}

export interface CityProduction {
  item: ProductionItem;
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
  /** R-60 (Phase 6) : cases travaillées par les citoyens (≤ pop, sans le
   *  centre-ville, exploité gratuitement). Clés "q,r". */
  workedTiles: TileKey[];
  /** R-66 : bâtiments construits (permanents ; perdus si la ville est capturée). */
  buildings: string[];
  /** R-90 (Phase 7b) : conversion du commerce — 'gold' | 'science' (défaut or,
   *  réinitialisé à la capture). Amende R-61 : plus de curseur global. */
  conversion: 'gold' | 'science';
  /** 7f · R-113 : culture accumulée vers le prochain Personnage illustre. */
  cultureStored: number;
  /** 7f · R-115 : merveilles hébergées — SURVIVENT à la capture (elles
   *  changent de propriétaire avec la ville, contrairement aux bâtiments). */
  wonders: string[];
  /** 7h · R-123 : accumulateurs de GP à rendement (or/science/production) —
   *  gains de Phase C accumulés vers le seuil T-30. */
  gpAccumGold: number;
  gpAccumScience: number;
  gpAccumProd: number;
  /** 7j · R-123 complétée · accumulateur de CROISSANCE (surplus alimentaire
   *  crédité en Phase C) vers le seuil T-30 — canal du Grand Humanitaire. */
  gpAccumFood: number;
  /** 7j · R-126 · GP INSTALLÉS dans la ville (Settle), dans l'ordre
   *  d'installation (ids de classe GP) — source unique des multiplicateurs
   *  Settle et du vol d'installé (R-119 révisée). */
  settledGreatPersons: string[];
}

export interface Vision {
  /** Cases mémorisées (terrain figé, entités ennemies cachées) — triées. */
  explored: TileKey[];
  /** Cases actuellement visibles — triées. */
  visible: TileKey[];
}

/**
 * R-96 · Village barbare (Phase 7d) — entité de carte posée depuis le JSON de
 * carte (R-94 : `villages`) par createInitialState/applyMapEntities. Attaquable
 * (T-21 PV), détruit à 0 PV (disparaît définitivement, or T-20 au vainqueur).
 */
export interface BarbarianVillage {
  /** 'v1', 'v2'… — affecté par (q, r) croissant à la pose. */
  id: string;
  q: number;
  r: number;
  /** T-21 · PV courants. */
  hp: number;
  /** Compteur d'engendrement : résolutions restantes avant le prochain spawn
   *  (T-18) — initialisé à T-18 (premier engendrement au tour 3). */
  spawnCountdown: number;
  /** Unités vivantes engendrées par CE village (mortes élaguées) — cap T-22. */
  spawnedUnits: UnitId[];
}

/** R-98 · Hutte bonus (Phase 7d). Une seule ouverture : retirée de l'état. */
export interface Hut {
  /** 'h1', 'h2'… — affecté par (q, r) croissant à la pose. */
  id: string;
  q: number;
  r: number;
}

export interface Player {
  id: PlayerId;
  /** Trésor en or. */
  gold: number;
  /** Science cumulée (arbre technologique : Phase 7). */
  science: number;
  /** Curseur global science/or (R-61, 🔶 défaut 0.5). */
  scienceRatio: number;
  /** R-85 · Phase 7a : technologie en cours de recherche (null = aucun choix). */
  researching: string | null;
  /** R-85 : progression PAR technologie (conservée en cas de changement). */
  scienceProgress: Record<string, number>;
  /** R-85/R-87 : technologies débloquées (ids de techs.json). */
  techsUnlocked: string[];
  /** R-85 : science accumulée sans choix de tech — versée au premier choix. */
  scienceStored: number;
  /** 7f · R-115 : jalons culturels (GP installés + merveilles contrôlées). */
  cultureMilestones: number;
  /** 7f · R-114 : GP de culture obtenus (le seuil T-27 double à chaque obtention). */
  greatPersonsObtained: number;
  /** 7h · R-121 : régime politique actif (governments.json — défaut despotisme). */
  government: string;
  /** 7h · R-122 : tour JUSQU'AUQUEL l'Anarchie s'applique (tour + T-29) —
   *  null = pas d'anarchie. Pendant la résolution où `state.turn <
   *  anarchyUntil`, marteaux/fioles/or/culture à zéro et GP gelés. */
  anarchyUntil: number | null;
  /** 7h · R-123 : GP obtenus PAR TYPE (escalade T-30 par type ; T-27 reste
   *  porté par `greatPersonsObtained` — les compteurs sont indépendants). */
  greatPersonsByType: Record<string, number>;
  /** 7h · R-123 · T-31 : victoires de combat de l'empire (coups fatals R-32). */
  combatVictories: number;
  /** 7h · R-122 : technologies complétées pendant la DERNIÈRE résolution —
   *  fenêtre d'adoption sans Anarchie (invitation du conseiller). */
  techsUnlockedThisTurn: string[];
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
  /** R-96/Phase 7d : villages barbares (portés du JSON de carte vers l'état). */
  villages: BarbarianVillage[];
  /** R-98/Phase 7d : huttes bonus non ouvertes (une ouverte est retirée). */
  huts: Hut[];
  /** Phase 7d : id de la carte d'origine — null pour les états v7 migrés avant
   *  enrichissement serveur (applyMapEntities). */
  mapId: string | null;
  /** 7e · Premier découvrir (CivRev) : premier joueur à compléter chaque tech
   *  (techId → playerId) — récompense `firstToDiscover` appliquée une fois. */
  firstBy: Record<string, PlayerId>;
}

/** R-58-a : les deux nations sont-elles en guerre ? R-95 : les barbares sont
 *  en guerre permanente avec tout le monde (et ne sont pas dans `players`). */
export function areAtWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return false;
  if (a === BARBARIAN_ID || b === BARBARIAN_ID) return true;
  return state.diplomacy.war.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** R-95 : l'id donné est-il celui du pseudo-joueur barbare ? */
export function isBarbarian(playerId: PlayerId): boolean {
  return playerId === BARBARIAN_ID;
}

// ---------------------------------------------------------------------------
// Versionnage du schéma — DESIGN.md §3.8. La chaîne commence au premier commit.
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 13;

type AnyState = Record<string, unknown>;

/**
 * Auto-assignation R-60 pour la migration v3 → v4 (implémentation locale :
 * la migration doit rester stable même si economy.ts évolue). Priorité
 * nourriture > production > commerce, tie-break (q, r) — R-81.
 */
function migrationAssign(map: Record<string, { terrain: string }>, city: Record<string, unknown>): string[] {
  const radius = 1 + (Array.isArray(city.buildings) && city.buildings.includes('tribunal') ? 1 : 0);
  const q0 = Number(city.q);
  const r0 = Number(city.r);
  const pop = Number(city.pop ?? 1);
  const candidates: Array<{ key: string; f: number; p: number; c: number }> = [];
  for (const [key, tile] of Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const parsed = /^(-?\d+),(-?\d+)$/.exec(key);
    if (!parsed) continue;
    const dq = Number(parsed[1]) - q0;
    const dr = Number(parsed[2]) - r0;
    const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (dist < 1 || dist > radius) continue;
    const yields = TERRAINS[tile.terrain]?.yields;
    if (!yields) continue;
    candidates.push({ key, f: yields.food, p: yields.production, c: yields.commerce });
  }
  return candidates
    .sort((a, b) => b.f - a.f || b.p - a.p || b.c - a.c || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, pop)
    .map((c) => c.key);
}

/**
 * Migrations v(n-1) → v(n), indexées par version cible. v1 = état initial :
 * la case [1] est intentionally absente (rien à migrer vers v1).
 * Chaque migration doit être pure et totales sur les champs de sa version.
 */
export const MIGRATIONS: Record<number, (state: AnyState) => AnyState> = {
  /**
   * v1 → v2 : compteur de forfait T-06 (RULES.md §1/§11). Les joueurs des
   * états v1 persistés n'ont pas `missedTurns` : initialisé à 0. Champ déjà
   * présent (états de test) : conservé.
   */
  2: (state) => {
    const players = (state.players ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(players).sort()) {
      const p = players[id]!;
      migrated[id] = {
        ...p,
        missedTurns: typeof p.missedTurns === 'number' ? p.missedTurns : 0,
      };
    }
    return { ...state, players: migrated };
  },
  /**
   * v2 → v3 : fortification R-33 (ajout du 30/08). Nouvel ordre + nouveau
   * champ `fortified` sur les unités : donnée ADDITIVE, pas un reformat —
   * les états persistés v2 n'ont jamais de fortification, initialisée à
   * false. (Décision : bump de version requis car un champ d'unité manque
   * dans les états v2 ; aucune autre transformation.)
   */
  3: (state) => {
    const units = (state.units ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(units).sort()) {
      const u = units[id]!;
      migrated[id] = {
        ...u,
        fortified: typeof u.fortified === 'boolean' ? u.fortified : false,
      };
    }
    return { ...state, units: migrated };
  },
  /**
   * v3 → v4 : économie Phase 6 (R-60/R-66). Trois transformations :
   *  - `workedTile` (case unique) → `workedTiles` (citoyens, ≤ pop) — valeur
   *    par défaut = auto-assignation déterministe de l'état chargé (priorité
   *    nourriture > production > commerce, tie-break (q, r)) ;
   *  - `production.item` string (unité) → `{ kind: 'unit', id }` (items
   *    étendus unités + bâtiments, R-66) ;
   *  - `buildings: []` (champ additif — aucun état v3 n'a de bâtiment).
   */
  4: (state) => {
    const map = (state.map ?? {}) as Record<string, { terrain: string }>;
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      // workedTiles par défaut = auto-assignation déterministe de l'état
      // chargé (l'ancienne workedTile unique, posée par le même algorithme,
      // est recalculée — plus robuste qu'un report de valeur périmée).
      const workedTiles = migrationAssign(map, c);
      const rawItem = (c.production as { item?: unknown } | null)?.item;
      const item =
        typeof rawItem === 'string' ? { kind: 'unit', id: rawItem } : (rawItem as unknown);
      const { workedTile: _drop, ...rest } = c;
      void _drop;
      migrated[id] = {
        ...rest,
        workedTiles,
        buildings: Array.isArray(c.buildings) ? c.buildings : [],
        production:
          c.production && typeof c.production === 'object' ? { ...(c.production as object), item } : c.production,
      };
    }
    return { ...state, cities: migrated };
  },
    /**
   * v4 → v5 : technologies Phase 7a (R-85). Champs ADDITIFS par joueur :
   * défauts vides (aucune recherche, aucune progression, rien débloqué,
   * réserve nulle) — idempotent si un champ existe déjà. `science` (stat
   * cumulative des phases 6) est conservé tel quel.
   */
  5: (state) => {
    const players = (state.players ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(players).sort()) {
      const p = players[id]!;
      migrated[id] = {
        ...p,
        researching: typeof p.researching === 'string' ? p.researching : null,
        scienceProgress:
          p.scienceProgress && typeof p.scienceProgress === 'object' && !Array.isArray(p.scienceProgress)
            ? p.scienceProgress
            : {},
        techsUnlocked: Array.isArray(p.techsUnlocked) ? p.techsUnlocked : [],
        scienceStored: typeof p.scienceStored === 'number' ? p.scienceStored : 0,
      };
    }
    return { ...state, players: migrated };
  },
  /**
   * v5 → v6 : conversion du commerce par ville (R-90 révisée, Phase 7b —
   * décisions d'Erik du 01/09/2026). Champ ADDITIF sur chaque ville, défaut
   * 'gold' (décision : les villes neuves et capturées convertissent en or) —
   * idempotent si le champ existe déjà. `player.scienceRatio` (curseur global
   * R-61) devient inutilisé : conservé tel quel pour compat.
   */
  6: (state) => {
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      migrated[id] = {
        ...c,
        conversion: c.conversion === 'science' ? 'science' : 'gold',
      };
    }
    return { ...state, cities: migrated };
  },
  /**
   * v6 → v7 : ressources Phase 7c (R-91). `Tile.resource` existe depuis v1 à
   * `null` et `null` est une valeur valide du type élargi (`ResourceId | null`)
   * — AUCUN changement de forme : migration no-op (identité pure). Les
   * ressources des cartes préfabriquées sont posées à `createInitialState`
   * (R-94), jamais par migration.
   */
  7: (state) => state,
  /**
   * v7 → v8 : barbares & huttes (Phase 7d, R-96/R-98). Champs ADDITIFS :
   * `villages`, `huts` (tableaux vides — les états migrés n'ont aucun village,
   * l'enrichissement depuis la carte est fait par applyMapEntities côté
   * serveur, qui connaît `meta.settings.mapId`, hors du moteur pur) et
   * `mapId: null`. Compteurs à zéro = villages absents ; idempotent si les
   * champs existent déjà.
   */
  8: (state) => {
    const out: AnyState = { ...state };
    if (!Array.isArray(state.villages)) out.villages = [];
    if (!Array.isArray(state.huts)) out.huts = [];
    if (typeof state.mapId !== 'string') out.mapId = null;
    return out;
  },
  /**
   * v8 → v9 : Phase 7e — arbre technologique complet. Champs ADDITIFS :
   *  - `firstBy: {}` (Premier découvrir — les parties en cours n'ont fait
   *    aucun « premier découvrir » : table vide, idempotent) ;
   *  - le PALAIS est posé dans les capitales existantes (nouveau bâtiment
   *    fixed, +50 % défense de garnison — les nouvelles fondations le reçoivent
   *    directement du moteur). Idempotent.
   */
  9: (state) => {
    const out: AnyState = { ...state };
    if (!state.firstBy || typeof state.firstBy !== 'object' || Array.isArray(state.firstBy)) out.firstBy = {};
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      const buildings = Array.isArray(c.buildings) ? [...(c.buildings as string[])] : [];
      if (c.capital === true && !buildings.includes('palais')) buildings.push('palais');
      migrated[id] = { ...c, buildings };
    }
    out.cities = migrated;
    return out;
  },
  /**
   * v9 → v10 : Phase 7f — culture (R-113..R-116). Champs ADDITIFS, défauts
   * neutres (les parties en cours n'ont accumulé aucune culture, aucun jalon,
   * aucun GP, aucune merveille en ville) — idempotent si les champs existent :
   *  - chaque ville : `cultureStored: 0` (R-113) et `wonders: []` (R-115 —
   *    les merveilles survivent à la capture, contrairement aux bâtiments) ;
   *  - chaque joueur : `cultureMilestones: 0` (R-115) et
   *    `greatPersonsObtained: 0` (R-114). Les GP eux-mêmes sont des unités de
   *    type spécial (artiste/penseur) — aucune transformation des unités.
   */
  10: (state) => {
    const out: AnyState = { ...state };
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migratedCities: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      migratedCities[id] = {
        ...c,
        cultureStored: typeof c.cultureStored === 'number' ? c.cultureStored : 0,
        wonders: Array.isArray(c.wonders) ? c.wonders : [],
      };
    }
    out.cities = migratedCities;
    const players = (state.players ?? {}) as Record<string, Record<string, unknown>>;
    const migratedPlayers: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(players).sort()) {
      const p = players[id]!;
      migratedPlayers[id] = {
        ...p,
        cultureMilestones: typeof p.cultureMilestones === 'number' ? p.cultureMilestones : 0,
        greatPersonsObtained: typeof p.greatPersonsObtained === 'number' ? p.greatPersonsObtained : 0,
      };
    }
    out.players = migratedPlayers;
    return out;
  },
  /**
   * v10 → v11 : Phase 7g — naval & espionnage (R-117). Champs ADDITIFS par
   * unité : `aboard: null` (transport en cours) et `cargo: null` (cargaison
   * du navire) — les états migrés n'ont aucun transport actif, idempotent.
   */
  11: (state) => {
    const units = (state.units ?? {}) as Record<string, Record<string, unknown>>;
    const migrated: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(units).sort()) {
      const u = units[id]!;
      migrated[id] = {
        ...u,
        aboard: typeof u.aboard === 'string' ? u.aboard : null,
        cargo: typeof u.cargo === 'string' ? u.cargo : null,
      };
    }
    return { ...state, units: migrated };
  },
  /**
   * v11 → v12 : Phase 7h — gouvernements, GP restants, victoire scientifique
   * (RULES.md §8.7, R-121..R-125). Champs ADDITIFS, défauts neutres :
   *  - par joueur : `government: 'despotisme'` (régime de départ R-121),
   *    `anarchyUntil: null` (R-122), `greatPersonsByType: {}` (escalade par
   *    type R-123), `combatVictories: 0` (T-31), `techsUnlockedThisTurn: []`
   *    (R-122) — idempotent ;
   *  - par ville : `gpAccumGold/Science/Prod: 0` (accumulateurs R-123).
   * Les composants du vaisseau sont DÉRIVÉS des villes (R-124 — choix
   * documenté) : aucune transformation des bâtiments.
   */
  12: (state) => {
    const players = (state.players ?? {}) as Record<string, Record<string, unknown>>;
    const migratedPlayers: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(players).sort()) {
      const p = players[id]!;
      migratedPlayers[id] = {
        ...p,
        government: typeof p.government === 'string' ? p.government : 'despotisme',
        anarchyUntil: typeof p.anarchyUntil === 'number' ? p.anarchyUntil : null,
        greatPersonsByType:
          p.greatPersonsByType && typeof p.greatPersonsByType === 'object' && !Array.isArray(p.greatPersonsByType)
            ? p.greatPersonsByType
            : {},
        combatVictories: typeof p.combatVictories === 'number' ? p.combatVictories : 0,
        techsUnlockedThisTurn: Array.isArray(p.techsUnlockedThisTurn) ? p.techsUnlockedThisTurn : [],
      };
    }
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migratedCities: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      migratedCities[id] = {
        ...c,
        gpAccumGold: typeof c.gpAccumGold === 'number' ? c.gpAccumGold : 0,
        gpAccumScience: typeof c.gpAccumScience === 'number' ? c.gpAccumScience : 0,
        gpAccumProd: typeof c.gpAccumProd === 'number' ? c.gpAccumProd : 0,
      };
    }
    return { ...state, players: migratedPlayers, cities: migratedCities };
  },
  /**
   * v12 → v13 : Phase 7j — classes canoniques de GP, Consume/Settle (RULES.md
   * §8.8, R-114 rév. / R-123 complétée / R-126 / R-127). SANS PERTE :
   *  - unités : types d'GP RENOMMÉS — `artiste`/`penseur` fusionnés en
   *    `artiste_penseur` (D1, rév. R-114), `scientifique`→`savant`,
   *    `mogul`→`explorateur`, `ingenieur`→`batisseur` (D2) — idempotent ;
   *  - compteurs `greatPersonsByType` : mêmes renommages + FUSION des compteurs
   *    `artiste`+`penseur` dans `artiste_penseur` (l'escalade T-27/T-30 reste
   *    exacte) ;
   *  - par ville : `gpAccumFood: 0` (canal Humanitaire — additif) et
   *    `settledGreatPersons: []` (Settle R-126 — additif, aucun GP installé
   *    dans les états migrés : l'installation n'était pas enregistrée).
   */
  13: (state) => {
    const UNIT_RENAMES: Record<string, string> = {
      artiste: 'artiste_penseur',
      penseur: 'artiste_penseur',
      scientifique: 'savant',
      mogul: 'explorateur',
      ingenieur: 'batisseur',
    };
    const units = (state.units ?? {}) as Record<string, Record<string, unknown>>;
    const migratedUnits: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(units).sort()) {
      const u = units[id]!;
      migratedUnits[id] = { ...u, type: UNIT_RENAMES[u.type as string] ?? u.type };
    }
    const players = (state.players ?? {}) as Record<string, Record<string, unknown>>;
    const migratedPlayers: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(players).sort()) {
      const p = players[id]!;
      const byType = (p.greatPersonsByType && typeof p.greatPersonsByType === 'object' && !Array.isArray(p.greatPersonsByType)
        ? p.greatPersonsByType
        : {}) as Record<string, number>;
      const merged: Record<string, number> = {};
      for (const key of Object.keys(byType).sort()) {
        const nk = UNIT_RENAMES[key] ?? key;
        merged[nk] = (merged[nk] ?? 0) + (byType[key] ?? 0);
      }
      migratedPlayers[id] = { ...p, greatPersonsByType: merged };
    }
    const cities = (state.cities ?? {}) as Record<string, Record<string, unknown>>;
    const migratedCities: Record<string, Record<string, unknown>> = {};
    for (const id of Object.keys(cities).sort()) {
      const c = cities[id]!;
      migratedCities[id] = {
        ...c,
        gpAccumFood: typeof c.gpAccumFood === 'number' ? c.gpAccumFood : 0,
        settledGreatPersons: Array.isArray(c.settledGreatPersons) ? c.settledGreatPersons : [],
      };
    }
    return { ...state, units: migratedUnits, players: migratedPlayers, cities: migratedCities };
  },
};



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
