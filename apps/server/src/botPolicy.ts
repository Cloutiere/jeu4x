/**
 * Politique du BOT — portage TS de `src/bot.mjs` (Chantier BOT-SOLO, L0).
 *
 * `bot.mjs` est un CLIENT Node externe (Phase 3) : inutilisable en prod.
 * Ce module est la MÊME politique, pure et déterministe, exécutée par le
 * GameDO à la résolution pour le joueur bot (L1) :
 *   - entrée : l'état moteur COMPLET (choix 🔶 documenté — le bot est le
 *     serveur, équité non garantie ; alternative écartée : état filtré) ;
 *   - RNG seedé DÉDIÉ dérivé du seed de partie et du tour (`botTurnSeed`,
 *     R-80) — il ne consomme JAMAIS le RNG de résolution du moteur ;
 *   - sortie : ordres valides (mêmes règles que bot.mjs : Hold/Move,
 *     fortification, naval/espion R-117/R-119, production filtrée R-87,
 *     rush-buy R-135, GP en Settle déterministe R-126, recherche R-85,
 *     régimes R-122, vaisseau R-124) + actions immédiates (SetResearch/
 *     SetGovernment — hors ordres de tour, appliquées par le DO).
 * Le moteur revalide TOUT à la résolution, comme pour un humain.
 *
 * NB : `bot.mjs` est CONSERVÉ tel quel pour les tests/e2e — deux
 * implémentations de la même politique (duplication documentée, défaut 🔶
 * du handoff : partage du cœur non raisonnable entre un client .mjs sans
 * build et un module TS serveur). Différence assumée avec bot.mjs : le
 * facteur d'ère du rush vient du champ persisté `era` (R-147, source
 * unique moteur) et le coût du rush du helper moteur `rushBuyCostOf`
 * (toutes réductions 7n comprises) — bot.mjs garde son miroir minimal.
 * Parcours deterministes : unités/villes triées R-81.
 */
import {
  BUILDINGS,
  CULTURE,
  GOVERNMENTS,
  TECHS,
  TERRAINS,
  UNIT_TYPES,
  WONDERS,
  canSetProduction,
  compareCityIds,
  compareUnitIds,
  hexDistance,
  rushBuyCostOf,
  wonderTreasuryLocked,
} from '@game/rules';
import type { City, GameState, Order, PlayerId, ProductionItem, SeededRng, Unit } from '@game/rules';

/** Id de session du joueur bot (réservé — l'auth ne délivre jamais cet id). */
export const BOT_PLAYER_ID = 'bot';
/** Nom affiché du bot. */
export const BOT_NAME = 'Bot';

/**
 * Graine du RNG du bot pour un tour donné : dérivation déterministe du seed
 * de partie (R-80) — même partie rejouée + mêmes ordres humains → mêmes
 * ordres du bot. Sensible au tour (chaque tour re-tire) et indépendant du
 * RNG de résolution du moteur (flux séparés).
 */
export function botTurnSeed(gameSeed: number, turn: number): number {
  return (Math.imul(turn + 0x9e37, 0x85ebca6b) ^ Math.imul(gameSeed >>> 0, 0xc2b2ae35)) >>> 0;
}

/** Actions immédiates (hors ordres de tour) choisies par la politique. */
export type BotAction =
  | { type: 'SetResearch'; techId: string }
  | { type: 'SetGovernment'; government: string };

export interface BotPlan {
  /** Ordres de tour — passés à resolveTurn comme ceux d'un humain (L1). */
  orders: Order[];
  /** Actions immédiates R-85/R-122 — appliquées par le DO avant résolution. */
  actions: BotAction[];
}

/** Les 6 directions axiales (hex.ts — miroir bot.mjs DIRS). */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
  [1, -1],
];

/** Composants du Vaisseau spatial (R-124 — visés en priorité en fin d'arbre). */
const SHIP_COMPONENTS = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];

/** R-85 : une tech aléatoire (RNG seedé) disponible — non débloquée, prérequis satisfaits. */
function pickResearch(player: GameState['players'][PlayerId], rng: SeededRng): string | null {
  const unlocked = player.techsUnlocked ?? [];
  const available = Object.values(TECHS).filter(
    (t) => !unlocked.includes(t.id) && t.prereqs.every((p) => unlocked.includes(p)),
  );
  if (available.length === 0) return null;
  return available[rng.nextInt(available.length)]!.id;
}

/** R-135 : coût de base d'un item de production (données — miroir bot.mjs). */
function baseCostOf(item: ProductionItem): number | null {
  if (item.kind === 'unit') return UNIT_TYPES[item.id]?.cost ?? null;
  if (item.kind === 'wonder') return WONDERS[item.id]?.cost ?? null;
  return BUILDINGS[item.id]?.cost ?? null;
}

/**
 * R-87 · Un item de production aléatoire VALIDE pour la ville (miroir bot.mjs
 * `pickProduction`). Le filtre final passe par le VALIDATEUR MOTEUR
 * `canSetProduction` (tech, obsolescence R-110, unités uniques R-148 avec
 * remplacement, GP R-114, stratégiques R-138, bâtiments R-66/R-111) — un
 * ordre que le moteur refuserait n'entre jamais dans le tirage (leçon CI :
 * un Guerrier Impi pour une civ non-zoulou ou la Banque mondiale sous
 * 20 000 or rendaient le SetProduction inopérant). S'y ajoutent les filtres
 * bot.mjs : coût population (R-112), accès à la mer (R-117), unicité
 * MONDIALE des merveilles (R-129) et verrou de trésorerie (R-137).
 */
function pickProduction(
  city: City,
  player: GameState['players'][PlayerId],
  myCities: City[],
  state: GameState,
  rng: SeededRng,
): ProductionItem | null {
  const unlocked = player.techsUnlocked ?? [];
  const obsoleteWonders = new Set<string>();
  for (const techId of unlocked) for (const w of TECHS[techId]?.obsoleteWonders ?? []) obsoleteWonders.add(w);
  const allCities = Object.values(state.cities);
  const empireWonders = new Set(myCities.flatMap((c) => c.wonders ?? []));
  // Unicité MONDIALE R-129 (révision 7k, absente de bot.mjs) : une merveille
  // bâtie chez le rival n'est plus produisible — le moteur le refuserait.
  const worldWonders = new Set(allCities.flatMap((c) => c.wonders ?? []));
  const empireChantiers = new Set(
    myCities.filter((c) => c.production?.item.kind === 'wonder').map((c) => c.production!.item.id),
  );
  const options: ProductionItem[] = [];
  // R-116 : à 20 jalons, le bot VISE l'ONU (victoire culturelle).
  if ((player.cultureMilestones ?? 0) >= CULTURE.milestonesTarget) {
    options.unshift({ kind: 'wonder', id: 'nations_unies' });
  }
  for (const u of Object.values(UNIT_TYPES)) {
    if (u.implemented === false || u.greatPerson || u.strategic) continue;
    if ((u.populationCost ?? 0) > 0 && city.pop < u.populationCost!) continue; // R-112 (complétion)
    if (u.aquatic && !isCoastal(city, state)) continue; // R-117 : accès à la mer
    if (!canSetProduction({ kind: 'unit', id: u.id }, unlocked, city.buildings, player.civId)) continue;
    options.push({ kind: 'unit', id: u.id });
  }
  for (const b of Object.values(BUILDINGS)) {
    if (b.fixed || b.implemented === false) continue;
    if (city.buildings.includes(b.id)) continue;
    if (b.replaces && city.buildings.includes(b.replaces)) continue;
    if (!canSetProduction({ kind: 'building', id: b.id }, unlocked, city.buildings, player.civId)) continue;
    options.push({ kind: 'building', id: b.id });
  }
  for (const w of Object.values(WONDERS)) {
    if (w.implemented === false || w.cultureVictory) continue; // ONU déjà priorisée
    if (w.tech && !unlocked.includes(w.tech)) continue;
    if (obsoleteWonders.has(w.id)) continue;
    if (empireWonders.has(w.id) || worldWonders.has(w.id) || empireChantiers.has(w.id)) continue;
    if (wonderTreasuryLocked(w.id, player.treasury)) continue; // R-137 (Banque mondiale)
    options.push({ kind: 'wonder', id: w.id });
  }
  if (options.length === 0) return null;
  return options[rng.nextInt(options.length)]!;
}

/**
 * R-122 · Le régime à adopter — République dès Code des lois, puis Démocratie
 * ou Communisme selon les rendements d'empire, LORSQUE la tech a été
 * complétée CE tour (bascule sans Anarchie). Sinon : null (le bot évite de
 * payer un tour d'Anarchie). Miroir bot.mjs `pickGovernment`.
 */
function pickGovernment(
  player: GameState['players'][PlayerId],
  myCities: City[],
  state: GameState,
): string | null {
  const fresh = player.techsUnlockedThisTurn ?? [];
  const current = player.government ?? 'despotisme';
  const canFree = (id: string): boolean => {
    const tech = GOVERNMENTS[id]?.tech;
    return current !== id && (!tech || fresh.includes(tech));
  };
  if (canFree('republique')) return 'republique';
  let commerce = 0;
  let production = 0;
  for (const c of myCities) {
    for (const key of [...c.workedTiles, `${c.q},${c.r}`]) {
      const tile = state.map[key];
      const y = tile && TERRAINS[tile.terrain]?.yields;
      if (!y) continue;
      commerce += y.commerce ?? 0;
      production += y.production ?? 0;
    }
  }
  if (commerce >= production && canFree('democratie')) return 'democratie';
  if (production > commerce && canFree('communisme')) return 'communisme';
  if (canFree('democratie')) return 'democratie';
  if (canFree('communisme')) return 'communisme';
  return null;
}

/** R-124 : un composant du vaisseau manquant (fin d'arbre — Vol spatial). */
function missingShipComponent(myCities: City[]): string | null {
  const batis = new Set(myCities.flatMap((c) => c.buildings ?? []));
  return SHIP_COMPONENTS.find((id) => !batis.has(id)) ?? null;
}

/** Unité amie sur la case (q, r) — miroir bot.mjs `unitAtHex`. */
function unitAtHex(state: GameState, q: number, r: number, owner?: PlayerId): Unit | undefined {
  return Object.values(state.units).find((u) => u.q === q && u.r === r && (!owner || u.owner === owner));
}

/** Un pas vers une case adjacente praticable connue et libre d'amie (bot.mjs `randomStep`). */
function randomStep(
  unit: Unit,
  state: GameState,
  myEngineId: PlayerId,
  rng: SeededRng,
): { q: number; r: number } | null {
  const candidates: Array<{ q: number; r: number }> = [];
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue; // inconnue (brouillard) — ici : hors carte
    if (!TERRAINS[tile.terrain]?.passable) continue;
    if (unitAtHex(state, q, r, myEngineId)) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(candidates.length)]!;
}

/** R-117 · pas NAVAL — case d'eau connue selon la classe, libre d'amie. */
function navalStep(unit: Unit, state: GameState, myEngineId: PlayerId, rng: SeededRng): { q: number; r: number } | null {
  const stats = UNIT_TYPES[unit.type];
  const candidates: Array<{ q: number; r: number }> = [];
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    const access = TERRAINS[tile.terrain]?.navalAccess;
    if (!access) continue;
    if (access === 'ocean' && stats?.navalAccess !== 'ocean') continue; // côte seule
    if (unitAtHex(state, q, r, myEngineId)) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(candidates.length)]!;
}

/** R-117 · débarquement — case terrestre connue, LIBRE, adjacente. */
function landStep(unit: Unit, state: GameState, rng: SeededRng): { q: number; r: number } | null {
  const candidates: Array<{ q: number; r: number }> = [];
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    if (!TERRAINS[tile.terrain]?.passable) continue;
    if (unitAtHex(state, q, r)) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[rng.nextInt(candidates.length)]!;
}

/** R-117 · transport ami adjacent à cargaison libre (Galère/Galion). */
function adjacentFreeTransport(unit: Unit, state: GameState, myEngineId: PlayerId): { q: number; r: number } | null {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const t = unitAtHex(state, q, r, myEngineId);
    if (t && !t.cargo && !t.isArmy && (UNIT_TYPES[t.type]?.cargoCapacity ?? 0) > 0) return { q, r };
  }
  return null;
}

/** R-119 · ville ennemie adjacente avec un GP installé à voler. */
function spyTarget(unit: Unit, state: GameState, myEngineId: PlayerId): City | null {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const city = Object.values(state.cities).find((c) => c.q === q && c.r === r && c.owner !== myEngineId);
    if (!city) continue;
    // GP installés dérivables : jalons du propriétaire − merveilles de l'empire.
    const wonders = Object.values(state.cities)
      .filter((c) => c.owner === city.owner)
      .flatMap((c) => c.wonders ?? []).length;
    const gpInstalled = Math.max(0, (state.players[city.owner]?.cultureMilestones ?? 0) - wonders);
    if (gpInstalled > 0) return city;
  }
  return null;
}

/** R-117 · la ville est-elle côtière (adjacente à une case d'eau connue) ? */
function isCoastal(city: City, state: GameState): boolean {
  for (const [dq, dr] of DIRS) {
    const tile = state.map[`${city.q + dq},${city.r + dr}`];
    if (tile && TERRAINS[tile.terrain]?.navalAccess) return true;
  }
  return false;
}

/**
 * La politique du bot (L0) : état complet + RNG seedé dédié → plan (ordres +
 * actions immédiates). Mêmes seuils et même séquence de tirages que bot.mjs :
 * hold 40 %, fortifier 15 %, embarquer 35 %, naviguer 80 %, réassigner 20 %,
 * rush si trésorerie ≥ coût × 1,3 — le moteur revalide tout (R-80, §5).
 */
export function botPolicy(state: GameState, playerId: PlayerId, rng: SeededRng): BotPlan {
  const orders: Order[] = [];
  const actions: BotAction[] = [];
  const me = state.players[playerId];
  if (!me) return { orders, actions };

  const mine = Object.values(state.units)
    .filter((u) => u.owner === playerId)
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81 : parcours déterministe

  for (const unit of mine) {
    // R-117 : unité embarquée → débarquement vers une rive libre.
    if (unit.aboard) {
      const step = landStep(unit, state, rng);
      orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
      continue;
    }
    // R-117 : unité navale → navigation sur ses eaux (80 %).
    if (UNIT_TYPES[unit.type]?.aquatic) {
      const step = navalStep(unit, state, playerId, rng);
      orders.push(step && rng.next() < 0.8 ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
      continue;
    }
    // R-119 : l'Espion mène sa mission dès qu'une ville ennemie adjacente a un GP installé.
    if (UNIT_TYPES[unit.type]?.spy) {
      const target = spyTarget(unit, state, playerId);
      if (target) {
        orders.push({ type: 'SpyMission', unitId: unit.id, cityId: target.id, mission: 'stealGreatPerson' });
        continue;
      }
    }
    // R-33 : fortifier parfois (état persistant — l'ordre n'est pas consommé).
    if (!unit.fortified && rng.next() < 0.15) {
      orders.push({ type: 'Fortify', unitId: unit.id });
      continue;
    }
    // R-117 : embarquement occasionnel sur un transport ami libre.
    const transport = adjacentFreeTransport(unit, state, playerId);
    if (transport && rng.next() < 0.35) {
      orders.push({ type: 'Move', unitId: unit.id, path: [transport] });
      continue;
    }
    if (rng.next() < 0.4) {
      orders.push({ type: 'Hold', unitId: unit.id });
      continue;
    }
    const step = randomStep(unit, state, playerId, rng);
    orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
  }

  const myCities = Object.values(state.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => compareCityIds(a.id, b.id)); // R-81 : parcours déterministe

  // R-60 : réassignation occasionnelle d'un citoyen (ordre valide — le moteur revalide).
  for (const city of myCities) {
    if (rng.next() >= 0.2) continue;
    const candidates = Object.keys(state.map).filter((key) => {
      const parts = key.split(',');
      const q = Number(parts[0]);
      const r = Number(parts[1]);
      const d = hexDistance({ q, r }, { q: city.q, r: city.r });
      return d >= 1 && d <= 2;
    });
    if (candidates.length === 0) continue;
    orders.push({ type: 'SetWorkedTile', cityId: city.id, tile: candidates[rng.nextInt(candidates.length)]! });
  }

  // R-85 : dès qu'il n'a pas de tech en cours, le bot en choisit une (action immédiate).
  if (!me.researching) {
    const tech = pickResearch(me, rng);
    if (tech) actions.push({ type: 'SetResearch', techId: tech });
  }
  // R-122 : adoption de régime SANS Anarchie (action immédiate).
  const gov = pickGovernment(me, myCities, state);
  if (gov) actions.push({ type: 'SetGovernment', government: gov });

  // R-87 : villes sans file → un item aléatoire valide (R-116 ONU, R-124 vaisseau).
  for (const city of myCities) {
    if (city.production) continue;
    const component = (me.techsUnlocked ?? []).includes('vol_spatial') ? missingShipComponent(myCities) : null;
    const item = component
      ? ({ kind: 'building', id: component } as ProductionItem)
      : pickProduction(city, me, myCities, state, rng);
    if (item) orders.push({ type: 'SetProduction', cityId: city.id, item });
  }

  // R-135 : rush-buy simple — achète si la trésorerie couvre coût + 30 % de
  // réserve (coût par le helper moteur : toutes réductions 7n comprises).
  const SAFETY = 1.3;
  for (const city of myCities) {
    if (!city.production) continue;
    const cost = rushBuyCostOf(state, city);
    if (cost === null) continue;
    if (me.treasury >= cost * SAFETY && me.treasury - cost > 0) {
      orders.push({ type: 'RushBuy', cityId: city.id });
    }
  }

  // R-126 : le bot SETTLE ses GP dans une ville amie adjacente (choix
  // déterministe simple 🔶 — toujours Settle, jamais Consume). L'ordre
  // REMPLACE l'ordre aléatoire déjà donné à ce GP (sémantique same-subject).
  for (const unit of mine) {
    if (!UNIT_TYPES[unit.type]?.greatPerson) continue;
    const target = myCities.find((c) => hexDistance({ q: unit.q, r: unit.r }, { q: c.q, r: c.r }) <= 1);
    if (!target) continue;
    const existing = orders.findIndex((o) => 'unitId' in o && o.unitId === unit.id);
    const settle: Order = { type: 'GreatPersonAction', unitId: unit.id, action: 'settle', cityId: target.id };
    if (existing >= 0) orders[existing] = settle;
    else orders.push(settle);
  }

  return { orders, actions };
}
