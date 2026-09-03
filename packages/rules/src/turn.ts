/**
 * L4 — resolveTurn : résolution déterministe d'un tour (RULES.md §5-9).
 *
 * resolveTurn(state, ordersByPlayer, rngSeed) → { newState, events }
 *
 * - Fonction PURE : l'état d'entrée n'est jamais muté (immuabilité, R-82) ;
 *   même (state, orders, seed) → même (newState, events) bit à bit (R-80).
 * - Le RNG n'est consulté qu'en Phase B (R-80) : un tour sans combat ne
 *   consomme aucun tir et la graine sortante égale la graine entrante.
 * - Les ordres reçus sont déjà verrouillés (le timer/auto-verrouillage est
 *   côté serveur, Phase 1). Un ordre illégal est ignoré individuellement,
 *   sans bloquer la partie (RULES.md §5).
 * - Seul l'ordre Move persiste sur l'unité (chemin restant, gelé en cas de
 *   halte, repris au tour suivant) ; les autres ordres sont consommés.
 */
import { createRng } from './rng.js';
import type { SeededRng } from './rng.js';
import {
  compareHex,
  hexDistance,
  hexesWithinRadius,
  inRectangle,
  neighbors,
  tileKeyOf,
} from './hex.js';
import type { Hex } from './hex.js';
import { areAtWar, compareCityIds, compareIds, compareUnitIds, isBarbarian, nextId } from './state.js';
import type { BarbarianVillage, City, CityId, GameState, Order, PlayerId, ProductionItem, TileKey, Unit, UnitId } from './state.js';
import { BARBARIAN_ID, BARBARIANS, CULTURE, TERRAINS, unitType, building, BUILDINGS, HUT_REWARDS } from './data.js';
import { tileYield, workRadiusOf, tileWorkable } from './economy.js';
import { combatRound, effectiveStrength } from './combat.js';
import { computeVisibleTiles, recomputeVision } from './fog.js';
import {
  ARMY_SIZE,
  CITY_WORK_RADIUS,
  EXCHANGES_PER_ATTACK,
  FORTIFY_DEFENSE_BONUS,
  GROWTH_BASE,
  MIN_CITY_DISTANCE,
  POP_PRODUCTION_BONUS,
  RANGED_RANGE,
  SETTLER_BOOTY_GOLD,
  VILLAGE_DESTRUCTION_GOLD,
} from './constants.js';
import type { DestructionCause, GameEvent, HutReward } from './events.js';
import { creditScience } from './research.js';
import { conversionGains, CONVERSION_DEFAULT, goldMultOf, scienceMultOf } from './conversion.js';
import { WONDERS, canSetProduction, buildingCostDiscount } from './techs.js';
import {
  cultureGains,
  greatPersonThresholdFor,
  greatPersonTypeFor,
  isGreatPersonType,
  wonderProductionIssue,
} from './culture.js';
import { applyFirstToDiscover, empirePerCityBonus } from './firstDiscovery.js';
import {
  barbarianOrders,
  barbarianUnitType,
  createBarbarianUnit,
  drawHutReward,
  freeSpawnTiles,
} from './barbares.js';

export interface TurnResult {
  newState: GameState;
  events: GameEvent[];
}

/** Omit distributif : préserve l'union typée des événements. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------------------
// Structures de travail
// ---------------------------------------------------------------------------

interface AttackPlan {
  kind: 'attack';
  at: Hex;
  attackerId: UnitId;
  defenderId: UnitId;
}
interface CollisionPlan {
  kind: 'collision';
  at: Hex;
  holderId: UnitId;
  challengerId: UnitId;
}
/** R-96 · Entrée sur une case de village barbare sans unité : le village défend. */
interface VillageAttackPlan {
  kind: 'villageAttack';
  at: Hex;
  attackerId: UnitId;
  villageId: string;
}
type CombatPlan = AttackPlan | CollisionPlan | VillageAttackPlan;

interface FormGroup {
  members: UnitId[];
  rally: Hex;
}

/**
 * Repli différé (R-56 deux passes) : pendant la passe 1 (résolution des
 * combats R-50..R-52), un perdant devant céder le terrain est collecté au
 * lieu de replier immédiatement. La passe 2 alloue les cases de repli libres
 * GLOBALEMENT (PV décroissants), la passe 3 fait reprendre le combat aux
 * perdants sans case (R-55).
 */
interface PendingRetreat {
  loserId: UnitId;
  winnerId: UnitId;
  combatTile: Hex;
  /** Perdant occupant la case de combat (R-59-d, détenteur d'une collision) : il doit la céder. */
  mustLeave: boolean;
  /** Collision gagnée par le challenger : il prend la case dès que le perdant l'a quittée. */
  winnerTakesTile: boolean;
  /** R-52 : si le perdant emporte les attaques répétées de la passe 3, il avance. */
  advanceOnKill: boolean;
  /** R-96 : vainqueur VILLAGE (passe 3 : attaques répétées contre le village). */
  villageId?: string;
}

/** État de travail mutable pendant la résolution (copie profonde de l'état). */
interface Board {
  st: GameState;
  rng: SeededRng;
  seq: number;
  events: GameEvent[];
  planned: CombatPlan[];
  /** Position de chaque unité au début du tour (R-54 : case d'origine). */
  origin: Map<UnitId, Hex>;
  /** Unités ayant exécuté ≥ 1 pas ce tour (R-42/R-53). */
  moved: Set<UnitId>;
  /** Cases parcourues ce tour (R-53, tie-break). */
  steps: Map<UnitId, number>;
  /** Unités ayant participé à un échange de combat (R-71 : pas de soin). */
  fought: Set<UnitId>;
  /** Vision en début de tour : un ennemi visible alors est « connu » (pas de halte). */
  initialVisible: Map<PlayerId, Set<TileKey>>;
  /** Groupes FormArmy de ce tour (co-location transitoire, R-44). */
  formGroups: Map<UnitId, FormGroup>;
  /** Perdants en attente d'allocation de repli (R-56 deux passes). */
  pendingRetreats: PendingRetreat[];
  /**
   * Villes dont les citoyens doivent être auto-assignés en Phase C : fondation
   * et capture uniquement (R-60). Une désassignation manuelle ou une case devenue
   * invalide LIBÈRE un citoyen sans re-remplissage (règle d'Erik : le joueur
   * réassigne explicitement).
   */
  pendingFill: Set<CityId>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortUnitIds(board: Board): UnitId[] {
  return Object.keys(board.st.units).sort(compareUnitIds);
}

function occupants(board: Board, hex: Hex, except?: UnitId): Unit[] {
  const out: Unit[] = [];
  for (const id of sortUnitIds(board)) {
    const u = board.st.units[id]!;
    if (id !== except && u.q === hex.q && u.r === hex.r) out.push(u);
  }
  return out;
}

function occupiedByUnit(board: Board, hex: Hex, except?: UnitId): boolean {
  return occupants(board, hex, except).length > 0;
}

function cityAt(board: Board, hex: Hex): City | null {
  for (const id of Object.keys(board.st.cities).sort()) {
    const c = board.st.cities[id]!;
    if (c.q === hex.q && c.r === hex.r) return c;
  }
  return null;
}

/** R-96 : village barbare posé sur une case (au plus un par case — carte validée). */
function villageAt(board: Board, hex: Hex): BarbarianVillage | null {
  for (const v of board.st.villages) {
    if (v.q === hex.q && v.r === hex.r) return v;
  }
  return null;
}

/**
 * R-98 · Ouverture d'une hutte : la case est entrée lors d'un pas de mouvement
 * par une unité des civilisations (les barbares n'ouvrent pas — R-95). La
 * hutte est retirée (une seule ouverture) et la récompense est tirée au RNG
 * seedé (table huttes.json, R-99) puis appliquée immédiatement. L'événement
 * `HutOpened` est émis DANS TOUS LES CAS, avec la récompense complétée.
 */
function openHutAt(board: Board, hex: Hex, opener: Unit): void {
  if (isBarbarian(opener.owner)) return; // R-95 : les barbares n'ouvrent pas les huttes
  const idx = board.st.huts.findIndex((h) => h.q === hex.q && h.r === hex.r);
  if (idx === -1) return;
  const hut = board.st.huts[idx]!;
  board.st.huts.splice(idx, 1);
  const player = board.st.players[opener.owner]!;
  const reward: HutReward = drawHutReward(board.rng);

  switch (reward.kind) {
    case 'gold':
      player.gold += reward.amount;
      break;
    case 'unit': {
      // Unité gratuite pour l'ouvreur : case adjacente libre (hors
      // village/ville) — perdue si aucune case (interprétation documentée, R-98).
      const tile = freeSpawnTiles(board.st, hut, 1)[0];
      if (tile) {
        const stats = unitType(HUT_REWARDS.freeUnit);
        const unitId = nextId(board.st.units, 'u');
        board.st.units[unitId] = {
          id: unitId,
          type: HUT_REWARDS.freeUnit,
          owner: opener.owner,
          q: tile.q,
          r: tile.r,
          hp: stats.hpMax,
          mp: stats.movement,
          veteran: false,
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
        };
        reward.unitIds = [unitId];
      }
      break;
    }
    case 'science':
      // R-85 : la science alimente la tech courante (ou la réserve) —
      // complétion possible : événement TechResearched en cascade.
      creditScience(board.st, opener.owner, reward.amount, (pid, techId) => {
        emit(board, { type: 'TechResearched', player: pid, tech: techId });
      });
      break;
    case 'reveal':
      // R-98/L3.3 : ajout au `explored` du joueur (pas à `visible`) — le tri
      // final est assuré par recomputeVision (Phase D).
      {
        const explored = new Set(player.vision.explored);
        for (const h of hexesWithinRadius(hut, reward.radius)) {
          if (board.st.map[tileKeyOf(h)]) explored.add(tileKeyOf(h));
        }
        player.vision = { explored: [...explored].sort(), visible: player.vision.visible };
      }
      break;
    case 'ambush': {
      // Embuscade : barbares engendrés IMMÉDIATEMENT, hors village (cases
      // adjacentes libres) — cap des villages non affecté. Escalade R-95.
      const type = barbarianUnitType(board.st.turn + 1);
      for (const tile of freeSpawnTiles(board.st, hut, HUT_REWARDS.ambushCount)) {
        const unit = createBarbarianUnit(board.st, tile, type);
        reward.unitIds.push(unit.id);
      }
      break;
    }
    case 'nothing':
      break;
  }

  emit(board, {
    type: 'HutOpened',
    hutId: hut.id,
    byPlayer: opener.owner,
    byUnitId: opener.id,
    at: { q: hut.q, r: hut.r },
    reward,
  });
}

function inMapAndPassable(board: Board, hex: Hex): boolean {
  if (!inRectangle(hex, board.st.mapWidth, board.st.mapHeight)) return false;
  const tile = board.st.map[tileKeyOf(hex)];
  return !!tile && TERRAINS[tile.terrain]!.passable;
}

function isPeaceful(unit: Unit): boolean {
  return !unitType(unit.type).canAttack;
}

function isRanged(unit: Unit): boolean {
  return unitType(unit.type).isRanged;
}

function emit(board: Board, event: DistributiveOmit<GameEvent, 'seq'>): void {
  board.seq += 1;
  board.events.push({ ...event, seq: board.seq } as GameEvent);
}

function moveUnit(board: Board, unit: Unit, to: Hex): void {
  const from = { q: unit.q, r: unit.r };
  unit.q = to.q;
  unit.r = to.r;
  board.steps.set(unit.id, (board.steps.get(unit.id) ?? 0) + 1);
  board.moved.add(unit.id);
  emit(board, { type: 'Move', unitId: unit.id, owner: unit.owner, from, to });
}

/**
 * Cible de repli (R-54). Retour :
 *  - Hex : l'unité se déplace là (événement Retreat à émettre) ;
 *  - 'stay' : la case d'origine est la position courante, libre d'autres
 *    entités — l'attaquant adjacent bat en retraite sans bouger (R-52) ;
 *  - null : aucun repli → attaques répétées (R-55).
 * `mustLeave` (R-59-d, collision du détenteur) interdit le 'stay' : l'unité
 * doit céder la case qu'elle occupe.
 */
function retreatTarget(
  board: Board,
  loser: Unit,
  combatTile: Hex,
  mustLeave: boolean,
): Hex | 'stay' | null {
  const origin = board.origin.get(loser.id) ?? { q: loser.q, r: loser.r };
  if (!mustLeave && !occupiedByUnit(board, origin, loser.id)) {
    return origin; // option 1 : la case d'origine, si elle est libre
  }
  // Option 2 : case adjacente libre à la case de combat, par proximité à la
  // case d'origine, puis (q, r) croissant (R-54-2).
  const candidates = neighbors(combatTile)
    .filter((h) => inMapAndPassable(board, h))
    .filter((h) => !occupiedByUnit(board, h))
    // pas de capture par repli : on n'entre pas en repli sur une ville ennemie
    .filter((h) => {
      const city = cityAt(board, h);
      return !city || city.owner === loser.owner;
    })
    .sort((a, b) => hexDistance(a, origin) - hexDistance(b, origin) || compareHex(a, b));
  return candidates[0] ?? null;
}

function applyRetreat(board: Board, loser: Unit, target: Hex): void {
  const from = { q: loser.q, r: loser.r };
  loser.q = target.q;
  loser.r = target.r;
  emit(board, { type: 'Retreat', unitId: loser.id, owner: loser.owner, from, to: target });
}

function kill(board: Board, unit: Unit, cause: DestructionCause, byUnitId: UnitId | null): void {
  delete board.st.units[unit.id];
  emit(board, {
    type: 'UnitDestroyed',
    unitId: unit.id,
    owner: unit.owner,
    at: { q: unit.q, r: unit.r },
    cause,
    byUnitId,
  });
}

/**
 * Capture d'une unité pacifique (R-43, R-57, I-3/I-4).
 * En guerre (v1) : destruction + butin T-12 au capteur. En paix (Phase 7) :
 * détention — le capteur choisira au tour suivant (§7.7-c). Une capture n'est
 * pas un combat : pas de vétéran (R-32 porte sur le coup fatal au combat).
 */
function capturePeaceful(board: Board, victim: Unit, byPlayer: PlayerId, byUnitId: UnitId | null): void {
  const war = areAtWar(board.st, victim.owner, byPlayer);
  emit(board, {
    type: 'Captured',
    unitId: victim.id,
    owner: victim.owner,
    byPlayer,
    at: { q: victim.q, r: victim.r },
    outcome: war ? 'destroyed' : 'detained',
  });
  if (war) {
    kill(board, victim, 'capture', byUnitId);
    // R-95 : les barbares n'ont pas de trésor — destruction sans butin.
    if (board.st.players[byPlayer]) {
      board.st.players[byPlayer]!.gold += SETTLER_BOOTY_GOLD;
      emit(board, { type: 'BootyGold', player: byPlayer, amount: SETTLER_BOOTY_GOLD, sourceUnitId: victim.id });
    }
  } else {
    victim.detainedBy = byPlayer;
  }
}

function terrainDefenseBonus(board: Board, hex: Hex): number {
  const tile = board.st.map[tileKeyOf(hex)];
  return tile ? TERRAINS[tile.terrain]!.defenseBonus : 0;
}

/**
 * 7e · Défense de ville des BÂTIMENTS (data-driven : `cityDefenseBonus`) —
 * s'ajoute au bonus de la case de ville (T-02) dans S_def du défenseur en
 * garnison (Palais +50 %, Remparts +100 %). Le bonus ne profite qu'au
 * propriétaire de la ville.
 */
function cityBuildingDefenseBonus(board: Board, hex: Hex, defenderOwner: PlayerId): number {
  const city = cityAt(board, hex);
  if (!city || city.owner !== defenderOwner) return 0;
  let bonus = 0;
  for (const id of city.buildings) bonus += BUILDINGS[id]?.cityDefenseBonus ?? 0;
  return bonus;
}

/**
 * R-33 : applique les ordres de fortification et les annulations associées.
 *  - `Fortify` → l'unité est fortifiée (état persistant), tout chemin gelé est
 *    effacé (une unité fortifiée ne bouge pas) ;
 *  - tout autre ordre touchant l'unité (Move, Attack, Hold, FoundCity,
 *    FormArmy via ses membres) annule la fortification.
 * Interprétation déterministe : si un même tour porte à la fois un autre
 * ordre et un Fortify (impossible via le serveur, qui remplace par sujet),
 * l'annulation s'applique d'abord puis le Fortify — la fortification prime.
 */
function applyFortifyOrders(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const fortify = new Set<UnitId>();
  const cancel = new Set<UnitId>();
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      switch (order.type) {
        case 'Fortify':
          fortify.add(order.unitId);
          break;
        case 'Move':
        case 'Attack':
        case 'Hold':
        case 'FoundCity':
          cancel.add(order.unitId);
          break;
        case 'FormArmy':
          for (const m of order.members) cancel.add(m);
          break;
        case 'SetProduction':
        case 'SetWorkedTile':
          break;
      }
    }
  }
  for (const id of cancel) {
    const unit = board.st.units[id];
    // Seuls les ordres du propriétaire comptent (une consigne ennemie est ignorée).
    const ordered = Object.keys(ordersByPlayer).some(
      (pid) => (ordersByPlayer[pid] ?? []).some((o) => orderTouchesUnit(o, id)) && unit?.owner === pid,
    );
    if (unit && ordered) unit.fortified = false;
  }
  for (const id of fortify) {
    const unit = board.st.units[id];
    const ordered = Object.keys(ordersByPlayer).some(
      (pid) =>
        (ordersByPlayer[pid] ?? []).some((o) => o.type === 'Fortify' && o.unitId === id) &&
        unit?.owner === pid,
    );
    if (unit && ordered) {
      unit.fortified = true;
      unit.order = null; // ne bouge pas : chemin gelé effacé (R-33)
    }
  }
}

/** Un ordre (quelconque) porte-t-il sur cette unité ? */
function orderTouchesUnit(order: Order, unitId: UnitId): boolean {
  return (
    ('unitId' in order && order.unitId === unitId) ||
    (order.type === 'FormArmy' && order.members.includes(unitId))
  );
}

// ---------------------------------------------------------------------------
// Phase B — combats & replis (RULES.md §7)
// ---------------------------------------------------------------------------

/**
 * Un échange (T-03 round(s)). R-59-b : un défenseur non-à-distance ne riposte
 * jamais contre une unité à distance ; interprétation (documentée, 🔶) : le
 * round lui retire alors directement 1 PV (p = 1 côté attaquant), ce qui
 * garantit la terminaison de R-55 (« chaque itération retire ≥ 1 PV »).
 */
function performExchange(board: Board, attacker: Unit, defender: Unit, combatTile: Hex): void {
  const aStats = unitType(attacker.type);
  const dStats = unitType(defender.type);
  const noRiposte = isRanged(attacker) && !isRanged(defender);
  const sAtt = effectiveStrength(aStats.attack, attacker.veteran);
  // T-17 : le bonus de fortification s'ajoute au bonus de terrain (RULES.md §7.4).
  // 7e : le bonus de défense de ville des bâtiments (Palais, Remparts) s'ajoute
  // pour le défenseur en garnison de SA ville.
  const sDef = effectiveStrength(
    dStats.defense,
    defender.veteran,
    terrainDefenseBonus(board, combatTile) +
      (defender.fortified ? FORTIFY_DEFENSE_BONUS : 0) +
      cityBuildingDefenseBonus(board, combatTile, defender.owner),
  );
  for (let i = 0; i < EXCHANGES_PER_ATTACK && attacker.hp > 0 && defender.hp > 0; i++) {
    if (noRiposte) {
      defender.hp -= 1;
      continue;
    }
    const winner = combatRound(sAtt, sDef, board.rng.next());
    if (winner === 'defender') defender.hp -= 1;
    else attacker.hp -= 1;
  }
  attacker.hp = Math.max(0, attacker.hp);
  defender.hp = Math.max(0, defender.hp);
  emit(board, { type: 'Attack', attackerId: attacker.id, defenderId: defender.id, at: combatTile });
  emit(board, {
    type: 'CombatExchange',
    attackerId: attacker.id,
    defenderId: defender.id,
    at: combatTile,
    attackerHpAfter: attacker.hp,
    defenderHpAfter: defender.hp,
  });
  board.fought.add(attacker.id);
  board.fought.add(defender.id);
}

/** Avancée du vainqueur (R-52/I-2) — jamais pour une unité à distance (R-59-a). */
function advanceIfMelee(board: Board, attacker: Unit, tile: Hex): void {
  if (isRanged(attacker)) return;
  if (attacker.q === tile.q && attacker.r === tile.r) return;
  moveUnit(board, attacker, tile);
}

/**
 * Attaques répétées (R-55) : échanges jusqu'à élimination d'un des deux.
 * `advanceOnKill` : l'attaquant avance sur la case libérée s'il tue (R-52) —
 * false pour le détenteur d'une collision, qui défend simplement son bien.
 */
function repeatedAttacks(
  board: Board,
  attacker: Unit,
  defender: Unit,
  combatTile: Hex,
  advanceOnKill: boolean,
): void {
  let guard = 0;
  while (attacker.hp > 0 && defender.hp > 0) {
    performExchange(board, attacker, defender, combatTile);
    if (defender.hp <= 0) {
      kill(board, defender, 'combat', attacker.id);
      attacker.veteran = true; // R-32 : coup fatal
      if (advanceOnKill) advanceIfMelee(board, attacker, combatTile);
      return;
    }
    if (attacker.hp <= 0) {
      kill(board, attacker, 'combat', defender.id);
      defender.veteran = true; // R-32
      return;
    }
    if (++guard > 10_000) throw new Error('R-55 : boucle non terminale (bug)');
  }
}

/** Attaque d'un défenseur (R-52) avec repli unifié (R-54) et cas R-59. */
function resolveAttack(board: Board, attacker: Unit, defender: Unit, combatTile: Hex): void {
  // R-43/R-57 : défenseur pacifique → capture, jamais de combat.
  if (isPeaceful(defender)) {
    capturePeaceful(board, defender, attacker.owner, attacker.id);
    if (board.st.units[attacker.id]) advanceIfMelee(board, attacker, combatTile);
    return;
  }
  // R-58-b / I-1 (hook, inactif en v1) : nation en paix — repli mutuel si
  // possible, sinon échange normal + incident diplomatique (sans rupture de paix).
  // Le défenseur se replie d'abord (il doit libérer la case) ; sa case de repli
  // n'est pas disponible pour l'attaquant.
  if (!areAtWar(board.st, attacker.owner, defender.owner)) {
    const dT = retreatTarget(board, defender, combatTile, true);
    if (dT !== null && dT !== 'stay') {
      applyRetreat(board, defender, dT);
      const aT = retreatTarget(board, attacker, combatTile, false);
      if (aT !== null) {
        if (aT !== 'stay') applyRetreat(board, attacker, aT);
        return;
      }
    }
    emit(board, { type: 'DiplomaticIncident', between: [attacker.owner, defender.owner], at: combatTile });
  }
  performExchange(board, attacker, defender, combatTile);
  if (defender.hp <= 0) {
    kill(board, defender, 'combat', attacker.id);
    attacker.veteran = true; // R-32
    advanceIfMelee(board, attacker, combatTile);
    return;
  }
  if (attacker.hp <= 0) {
    kill(board, attacker, 'combat', defender.id);
    defender.veteran = true; // R-32
    return;
  }
  // Survie mutuelle (passe 1 de R-56) : le perdant est COLLECTÉ, l'allocation
  // des cases de repli est globale, après la fin de tous les combats.
  if (isRanged(attacker)) {
    // R-59-a : l'attaquant à distance attaque DEPUIS SA CASE (exception à
    // R-52) — survie mutuelle, il reste simplement en place (il n'a jamais
    // quitté sa case, aucun repli n'est dû).
    return;
  }
  if (isRanged(defender)) {
    // R-59-d : le défenseur à distance qui ne vainc pas cède systématiquement sa case.
    board.pendingRetreats.push({
      loserId: defender.id,
      winnerId: attacker.id,
      combatTile,
      mustLeave: true,
      winnerTakesTile: false,
      advanceOnKill: false,
    });
    return;
  }
  // R-52 : le défenseur stationnaire garde sa case, l'attaquant est en repli.
  board.pendingRetreats.push({
    loserId: attacker.id,
    winnerId: defender.id,
    combatTile,
    mustLeave: false,
    winnerTakesTile: false,
    advanceOnKill: true,
  });
}

// ---------------------------------------------------------------------------
// Combat contre un VILLAGE barbare (R-96 — Phase 7d)
// ---------------------------------------------------------------------------

/**
 * Un échange contre un village : le village SUBIT les rounds R-51 (défense
 * `villageDefense` 🔶 + bonus défensif de son terrain) sans jamais riposter
 * (force d'attaque 0 — p = 1 pour l'attaquant… sauf bonus défensif élevé :
 * p = S_att²/(S_att²+S_def²) peut rester < 1). Le perdant du round perd 1 PV.
 */
function villageExchange(board: Board, attacker: Unit, village: BarbarianVillage, combatTile: Hex): void {
  const aStats = unitType(attacker.type);
  const sAtt = effectiveStrength(aStats.attack, attacker.veteran);
  const sDef = effectiveStrength(BARBARIANS.villageDefense, false, terrainDefenseBonus(board, combatTile));
  for (let i = 0; i < EXCHANGES_PER_ATTACK && attacker.hp > 0 && village.hp > 0; i++) {
    const winner = combatRound(sAtt, sDef, board.rng.next());
    if (winner === 'defender') village.hp -= 1;
    else attacker.hp -= 1;
  }
  attacker.hp = Math.max(0, attacker.hp);
  village.hp = Math.max(0, village.hp);
  // defenderId porte l'id du village ('v*') pour les échanges de village.
  emit(board, { type: 'Attack', attackerId: attacker.id, defenderId: village.id, at: combatTile });
  emit(board, {
    type: 'CombatExchange',
    attackerId: attacker.id,
    defenderId: village.id,
    at: combatTile,
    attackerHpAfter: attacker.hp,
    defenderHpAfter: village.hp,
  });
  board.fought.add(attacker.id);
}

/** R-96 : village à 0 PV → détruit, or T-20 au vainqueur, disparition définitive. */
function destroyVillage(board: Board, village: BarbarianVillage, byPlayer: PlayerId, byUnitId: UnitId | null): void {
  board.st.villages = board.st.villages.filter((v) => v.id !== village.id);
  emit(board, {
    type: 'VillageDestroyed',
    villageId: village.id,
    byPlayer,
    byUnitId,
    at: { q: village.q, r: village.r },
  });
  if (board.st.players[byPlayer]) {
    board.st.players[byPlayer]!.gold += VILLAGE_DESTRUCTION_GOLD;
    emit(board, {
      type: 'BootyGold',
      player: byPlayer,
      amount: VILLAGE_DESTRUCTION_GOLD,
      sourceUnitId: byUnitId,
      sourceVillageId: village.id,
    });
  }
}

/** Attaque d'un village (R-96) : un échange, puis issue selon R-52. */
function resolveVillageAttack(board: Board, attacker: Unit, village: BarbarianVillage, combatTile: Hex): void {
  villageExchange(board, attacker, village, combatTile);
  if (village.hp <= 0) {
    destroyVillage(board, village, attacker.owner, attacker.id);
    attacker.veteran = true; // R-32 : coup fatal
    // R-52 : l'attaquant avance — il est déjà entré sur la case (Phase A).
    return;
  }
  if (attacker.hp <= 0) {
    kill(board, attacker, 'combat', null); // le village ne « signe » pas le coup
    return;
  }
  // Survie mutuelle : le village (stationnaire) garde sa case, l'attaquant se
  // replie — allocation globale R-56 (passe 1).
  board.pendingRetreats.push({
    loserId: attacker.id,
    winnerId: village.id,
    villageId: village.id,
    combatTile,
    mustLeave: false,
    winnerTakesTile: false,
    advanceOnKill: true,
  });
}

/** R-55 contre un village : attaques répétées jusqu'à élimination d'un des deux. */
function repeatedVillageAttacks(board: Board, attacker: Unit, village: BarbarianVillage, combatTile: Hex): void {
  let guard = 0;
  while (attacker.hp > 0 && village.hp > 0) {
    villageExchange(board, attacker, village, combatTile);
    if (village.hp <= 0) {
      destroyVillage(board, village, attacker.owner, attacker.id);
      attacker.veteran = true;
      return;
    }
    if (attacker.hp <= 0) {
      kill(board, attacker, 'combat', null);
      return;
    }
    if (++guard > 10_000) throw new Error('R-55 : boucle non terminale (bug)');
  }
}

/** Collision de movers convergents (R-53) : aucun dégât, la plus haute PV demeure. */
function resolveCollision(board: Board, holder: Unit, challenger: Unit, combatTile: Hex): void {
  // Exception R-43 : une unité pacifique est capturée — pas de comparaison de PV.
  if (isPeaceful(challenger)) {
    capturePeaceful(board, challenger, holder.owner, null);
    return;
  }
  if (isPeaceful(holder)) {
    capturePeaceful(board, holder, challenger.owner, null);
    if (board.st.units[challenger.id]) moveUnit(board, challenger, combatTile);
    return;
  }
  // Demeure : plus de PV ; égalité → moins de cases parcourues ; puis unitId faible (R-53).
  const holderSteps = board.steps.get(holder.id) ?? 0;
  const challengerSteps = board.steps.get(challenger.id) ?? 0;
  const holderWins =
    holder.hp > challenger.hp ||
    (holder.hp === challenger.hp &&
      (holderSteps < challengerSteps ||
        (holderSteps === challengerSteps && compareUnitIds(holder.id, challenger.id) < 0)));

  const loser = holderWins ? challenger : holder;
  const winner = holderWins ? holder : challenger;
  // Passe 1 de R-56 : le perdant est collecté. Le détenteur, qui occupe la
  // case, doit la céder (mustLeave) et le challenger vainqueur prendra la case
  // dès qu'elle sera libérée (winnerTakesTile, passe 2).
  board.pendingRetreats.push({
    loserId: loser.id,
    winnerId: winner.id,
    combatTile,
    mustLeave: !holderWins,
    winnerTakesTile: !holderWins,
    advanceOnKill: !holderWins,
  });
}

/**
 * R-56 — passes 2 et 3 de l'allocation globale des replis.
 *
 * Passe 2 : les cases de repli libres sont allouées par perdant à PV
 * décroissants (tie : `unitId` croissant), chacun recevant sa meilleure case
 * selon R-54, évaluée APRÈS la fin de tous les combats (cases réellement
 * libres, pas leur état au moment du combat).
 *
 * Passe 3 (R-56-3/R-55) : les perdants sans case attribuée reprennent le
 * combat avec une attaque supplémentaire contre le vainqueur de LEUR combat —
 * qui n'a jamais quitté la case — jusqu'à élimination d'une des deux. Même
 * ordre déterministe que l'allocation.
 */
function allocateRetreats(board: Board): void {
  const order = [...board.pendingRetreats].sort((a, b) => {
    const la = board.st.units[a.loserId];
    const lb = board.st.units[b.loserId];
    return (lb ? lb.hp : -1) - (la ? la.hp : -1) || compareUnitIds(a.loserId, b.loserId);
  });
  // R-30 : une case gagnée par un challenger (winnerTakesTile) ne peut pas
  // être attribuée deux fois — deux collisions distinctes sur la même case
  // (détenteur commun vaincu par deux movers) attribueraient sinon la case à
  // deux vainqueurs. Premier attributaire = premier dans l'ordre R-56.
  const awarded = new Set<TileKey>();
  const withoutTile: PendingRetreat[] = [];
  for (const req of order) {
    const loser = board.st.units[req.loserId];
    if (!loser) continue; // sécurité : déjà éliminé
    const target = retreatTarget(board, loser, req.combatTile, req.mustLeave);
    if (target === null) {
      withoutTile.push(req);
      continue;
    }
    if (target !== 'stay') applyRetreat(board, loser, target);
    if (req.winnerTakesTile) {
      const key = tileKeyOf(req.combatTile);
      if (!awarded.has(key) && !occupiedByUnit(board, req.combatTile)) {
        const winner = board.st.units[req.winnerId];
        if (winner) {
          moveUnit(board, winner, req.combatTile); // le challenger prend la case libérée
          awarded.add(key);
        }
      }
    }
  }
  for (const req of withoutTile) {
    const loser = board.st.units[req.loserId];
    if (!loser) continue;
    if (req.villageId) {
      // R-96 : vainqueur village — attaques répétées contre le village (R-55).
      const village = board.st.villages.find((v) => v.id === req.villageId);
      if (!village) continue;
      repeatedVillageAttacks(board, loser, village, { q: village.q, r: village.r });
      continue;
    }
    const winner = board.st.units[req.winnerId];
    if (!winner) continue;
    // Le perdant attaque, le vainqueur défend là où il se trouve (bonus de terrain).
    repeatedAttacks(board, loser, winner, { q: winner.q, r: winner.r }, req.advanceOnKill);
  }
}

// ---------------------------------------------------------------------------
// Phase A — mouvements (RULES.md §6)
// ---------------------------------------------------------------------------

/** R-42 (halt) : un ennemi (unité ou ville) est-il devenu visible hors de la case visée ? */
function haltedByNewSighting(board: Board, unit: Unit, next: Hex): boolean {
  const known = board.initialVisible.get(unit.owner) ?? new Set<TileKey>();
  const visible = computeVisibleTiles(board.st, unit.owner);
  const nextKey = tileKeyOf(next);
  for (const id of Object.keys(board.st.units).sort(compareUnitIds)) {
    const enemy = board.st.units[id]!;
    if (enemy.owner === unit.owner) continue;
    const key = tileKeyOf(enemy);
    if (key !== nextKey && visible.has(key) && !known.has(key)) return true;
  }
  for (const id of Object.keys(board.st.cities).sort()) {
    const enemyCity = board.st.cities[id]!;
    if (enemyCity.owner === unit.owner) continue;
    const key = tileKeyOf(enemyCity);
    if (key !== nextKey && visible.has(key) && !known.has(key)) return true;
  }
  return false;
}

/**
 * Exécute le chemin d'une unité, pas à pas, dans la limite des PM (R-40..R-43).
 * Met à jour unit.order : chemin restant (gelé en cas de halte) ou null.
 * Interprétations documentées :
 *  - chemin invalide (hors carte / infranchissable) → le reste du chemin est effacé ;
 *  - blocage amical → l'unité s'arrête ce tour, le chemin restant est conservé ;
 *  - le halte ne s'applique pas à l'ennemi situé sur la case visée (I-1 :
 *    entrer sur cet ennemi déclenche le combat/collision prévu).
 */
function executeMoveOrder(board: Board, unit: Unit, path: Hex[]): void {
  while (unit.mp > 0 && path.length > 0) {
    const next = path[0]!;
    // R-95 (Phase 7d) : les barbares ne subissent pas la halte X-2 — leurs
    // ordres (1 pas) sont régénérés à chaque résolution, la halte les figerait.
    if (!isBarbarian(unit.owner) && haltedByNewSighting(board, unit, next)) break; // halte, chemin gelé

    if (!inMapAndPassable(board, next)) {
      path = []; // R-42 : chemin invalide, l'unité s'arrête
      break;
    }
    const here = occupants(board, next);
    if (here.length === 0) {
      // R-96 (Phase 7d) : case de village barbare ENNEMI — entrer = l'attaquer
      // (une unité pacifique y est capturée, I-4). L'attaque est planifiée
      // après l'entrée (le village est stationnaire, R-52). Un barbare entre
      // sur son propre village sans combat (co-location autorisée, R-30).
      const village = villageAt(board, next);
      if (village && !isBarbarian(unit.owner)) {
        if (isPeaceful(unit)) {
          capturePeaceful(board, unit, BARBARIAN_ID, null);
          path = [];
          break;
        }
        path.shift();
        unit.mp -= 1;
        moveUnit(board, unit, next);
        openHutAt(board, next, unit);
        board.planned.push({ kind: 'villageAttack', at: next, attackerId: unit.id, villageId: village.id });
        break;
      }
      // R-40 : mouvement garanti vers une case vide.
      path.shift();
      unit.mp -= 1;
      moveUnit(board, unit, next);
      openHutAt(board, next, unit); // R-98 : ouverture à l'entrée (Phase A)
      continue;
    }
    if (here.some((u) => u.owner === unit.owner)) {
      // R-30 : arrêt sur la case précédente, sauf co-location transitoire
      // entre membres désignés d'un même FormArmy (R-44).
      const group = board.formGroups.get(unit.id);
      const coLocationLegale = !!group && here.every((u) => group.members.includes(u.id));
      if (!coLocationLegale) break;
      path.shift();
      unit.mp -= 1;
      moveUnit(board, unit, next);
      openHutAt(board, next, unit);
      continue;
    }
    // Occupants ennemis.
    if (isPeaceful(unit)) {
      // R-43 : le pacifique qui aboutit sur un ennemi est capturé (v1 : butin).
      capturePeaceful(board, unit, here[0]!.owner, null);
      path = [];
      break;
    }
    const mover = here.find((u) => board.moved.has(u.id));
    if (mover) {
      // R-42 cas 3 : case visée par un mover ennemi déjà arrivé → collision.
      path = [];
      board.planned.push({ kind: 'collision', at: next, holderId: mover.id, challengerId: unit.id });
      break;
    }
    // R-42 cas 2 : ennemi stationnaire → l'unité entre, combat planifié.
    const defender = here[0]!;
    path = [];
    unit.mp -= 1;
    moveUnit(board, unit, next);
    openHutAt(board, next, unit); // R-98 : la hutte s'ouvre avant le combat planifié
    board.planned.push({ kind: 'attack', at: next, attackerId: unit.id, defenderId: defender.id });
    break;
  }
  if (!board.st.units[unit.id]) return; // capturée en cours de route
  unit.order = path.length > 0 ? { type: 'Move', unitId: unit.id, path } : null;
}

/** Ordres de mouvement effectifs : nouvel ordre du tour, sinon chemin gelé (R-41). */
function collectMoveOrders(
  board: Board,
  ordersByPlayer: Record<PlayerId, Order[]>,
): Array<{ unit: Unit; path: Hex[] }> {
  const claimed = new Map<UnitId, Hex[]>();
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'Move' || claimed.has(order.unitId)) continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      claimed.set(order.unitId, order.path.map((h) => ({ ...h })));
    }
  }
  // Unités sans nouvel ordre mais avec un chemin gelé : reprise multi-tours.
  for (const id of sortUnitIds(board)) {
    const unit = board.st.units[id]!;
    if (claimed.has(id)) {
      unit.order = { type: 'Move', unitId: id, path: claimed.get(id)! };
    } else if (unit.order?.type === 'Move') {
      claimed.set(id, unit.order.path.map((h) => ({ ...h })));
    }
  }
  return [...claimed.entries()]
    .map(([unitId, path]) => ({ unit: board.st.units[unitId]!, path }))
    .sort((a, b) => compareUnitIds(a.unit.id, b.unit.id));
}

/**
 * Formation d'armées — fin de Phase A (R-44). Interprétation documentée : si
 * les 3 membres ne sont pas réunis, la formation ne se produit pas (l'ordre
 * est consommé, le joueur le redonne) et les membres co-localisés au rendez-
 * vous sont éparpillés déterministement pour préserver R-30 (le plus petit
 * unitId reste, les autres reculent vers la case libre la plus proche).
 */
function processFormArmy(board: Board, allOrders: Order[]): void {
  const formOrders = allOrders.filter((o): o is Extract<Order, { type: 'FormArmy' }> => o.type === 'FormArmy');
  formOrders.sort((a, b) => compareHex(a.rally, b.rally) || compareUnitIds(a.members[0]!, b.members[0]!));
  for (const order of formOrders) {
    const members = order.members.map((id) => board.st.units[id]).filter((u): u is Unit => !!u);
    if (members.length !== ARMY_SIZE) continue; // membre mort → impossible
    const first = members[0]!;
    if (!members.every((m) => m.owner === first.owner && m.type === first.type)) continue;
    if (!members.every((m) => m.q === order.rally.q && m.r === order.rally.r)) continue;

    const stats = unitType(first.type);
    const sum = (fn: (m: Unit) => number) => members.reduce((acc, m) => acc + fn(m), 0);
    const armyId = nextId(board.st.units, 'u');
    const army: Unit = {
      id: armyId,
      type: first.type,
      owner: first.owner,
      q: order.rally.q,
      r: order.rally.r,
      hp: Math.min(sum((m) => m.hp), ARMY_SIZE * stats.hpMax), // R-31 : PV ≤ 9
      mp: stats.movement,
      veteran: members.filter((m) => m.veteran).length >= 2, // R-31 🔶
      isArmy: true,
      order: null,
      detainedBy: null,
      fortified: false, // R-33 : la formation d'armée annule la fortification
    };
    for (const m of members) delete board.st.units[m.id];
    board.st.units[armyId] = army;
    emit(board, {
      type: 'ArmyFormed',
      unitId: armyId,
      owner: army.owner,
      memberIds: members.map((m) => m.id),
      at: { ...order.rally },
    });
  }
  for (const order of formOrders) {
    const present = order.members
      .map((id) => board.st.units[id])
      .filter((u): u is Unit => !!u && u.q === order.rally.q && u.r === order.rally.r)
      .sort((a, b) => compareUnitIds(a.id, b.id));
    for (const extra of present.slice(1)) {
      const target = hexesWithinRadius(order.rally, 6)
        .filter((h) => hexDistance(h, order.rally) >= 1)
        .filter((h) => inMapAndPassable(board, h))
        .filter((h) => !occupiedByUnit(board, h))
        .filter((h) => !cityAt(board, h))
        .sort((a, b) => hexDistance(a, order.rally) - hexDistance(b, order.rally) || compareHex(a, b))[0];
      if (target) applyRetreat(board, extra, target);
    }
  }
}

function allOrdersFlattened(ordersByPlayer: Record<PlayerId, Order[]>): Order[] {
  return Object.keys(ordersByPlayer)
    .sort()
    .flatMap((pid) => ordersByPlayer[pid] ?? []);
}

// ---------------------------------------------------------------------------
// Phase C — économie (RULES.md §8, révision Phase 6 : R-60/R-61/R-63/R-66)
// ---------------------------------------------------------------------------

/**
 * Coût d'un item de production (unité ou bâtiment), null si id inconnu.
 * 7e : les réductions de coût du Premier découvrir (Communisme −33 % Usines,
 * Réseautage −50 % Universités) s'appliquent quand le contexte joueur est
 * fourni — plafonnées à 90 %, coût minimal 1 (déterminisme, R-81).
 */
function productionItemCost(item: ProductionItem, st?: GameState, playerId?: PlayerId): number | null {
  let cost: number | null;
  if (item.kind === 'unit') {
    try {
      cost = unitType(item.id).cost;
    } catch {
      return null;
    }
  } else if (item.kind === 'wonder') {
    // 7f · R-116 : coût des merveilles (T-28 pour l'ONU — nations_unies.cost).
    cost = WONDERS[item.id]?.cost ?? null;
  } else {
    cost = BUILDINGS[item.id]?.cost ?? null;
  }
  if (cost === null) return null;
  if (st && playerId && item.kind === 'building') {
    const discount = buildingCostDiscount(item.id, st.firstBy, playerId);
    if (discount > 0) cost = Math.max(1, Math.round(cost * (1 - discount)));
  }
  return cost;
}

/** La ville possède-t-elle déjà ce bâtiment ? (R-66 : non duplicable) */
function hasBuilding(city: City, id: string): boolean {
  return city.buildings.includes(id);
}

/**
 * R-60 · re-validation des cases travaillées d'une ville (appelée en Phase C) :
 * dans le rayon (bâtiments compris), travaillables, pas une case de ville,
 * pas déjà travaillée par une AUTRE ville. Les citoyens excédentaires (pop
 * baissée, capture) sont retirés en fin de liste.
 */
function validatedWorkedTiles(board: Board, city: City, takenByOthers: Set<TileKey>): TileKey[] {
  const radius = workRadiusOf(city.buildings);
  const cityHex = { q: city.q, r: city.r };
  const cityKeys = new Set(
    Object.keys(board.st.cities).map((id) => {
      const c = board.st.cities[id]!;
      return `${c.q},${c.r}`;
    }),
  );
  const kept: TileKey[] = [];
  for (const key of city.workedTiles) {
    if (kept.length >= city.pop) break;
    if (kept.includes(key)) continue;
    const parsed = key.split(',');
    const hex = { q: Number(parsed[0]), r: Number(parsed[1]) };
    if (Math.abs(hex.q - cityHex.q) + Math.abs(hex.r - cityHex.r) === 0) continue; // centre : gratuit, jamais assigné
    if (hexDistance(cityHex, hex) > radius) continue;
    if (!tileWorkable(board.st.map, key)) continue;
    if (cityKeys.has(key)) continue;
    if (takenByOthers.has(key)) continue;
    kept.push(key);
  }
  return kept;
}

/**
 * Complète l'assignation d'une ville jusqu'à `pop` citoyens : meilleures
 * cases libres par priorité nourriture > production > commerce, tie-break
 * (q, r) (R-60/R-81, rendements effectifs — bonus bâtiments et ressources
 * comprises, R-66/R-93 : les techs du propriétaire conditionnent le bonus).
 */
function fillWorkedTiles(board: Board, city: City, taken: Set<TileKey>): void {
  const radius = workRadiusOf(city.buildings);
  const cityHex = { q: city.q, r: city.r };
  const techs = board.st.players[city.owner]?.techsUnlocked ?? [];
  const cityKeys = new Set(Object.values(board.st.cities).map((c) => `${c.q},${c.r}`));
  const candidates = hexesWithinRadius(cityHex, radius)
    .filter((h) => hexDistance(h, cityHex) >= 1)
    .map((h) => ({ key: tileKeyOf(h), hex: h }))
    .filter(({ key }) => tileWorkable(board.st.map, key) && !cityKeys.has(key) && !taken.has(key))
    .map(({ key, hex }) => ({ key, hex, y: tileYield(board.st.map, city.buildings, key, techs)! }))
    .sort(
      (a, b) =>
        b.y.food - a.y.food ||
        b.y.production - a.y.production ||
        b.y.commerce - a.y.commerce ||
        compareHex(a.hex, b.hex),
    );
  for (const c of candidates) {
    if (city.workedTiles.length >= city.pop) break;
    if (city.workedTiles.includes(c.key)) continue;
    city.workedTiles.push(c.key);
    taken.add(c.key);
  }
}

/**
 * 7f · R-116 : validation d'EMPIRE d'une production de merveille (unicité,
 * jalons des Nations Unies) — complète `canSetProduction` (tech/implémentation)
 * avec l'état complet. `excludeCityId` : la ville qui (re)fait la demande n'est
 * pas comptée comme « déjà en chantier » (re-soumission du même choix).
 */
function wonderSetProductionIssue(st: GameState, wonderId: string, playerId: PlayerId, excludeCityId: CityId): string | null {
  const empireWondersBuilt: string[] = [];
  const empireWondersInProduction: string[] = [];
  for (const id of Object.keys(st.cities).sort()) {
    const c = st.cities[id]!;
    if (c.owner !== playerId) continue;
    empireWondersBuilt.push(...[...c.wonders].sort());
    if (id !== excludeCityId && c.production?.item.kind === 'wonder') empireWondersInProduction.push(c.production.item.id);
  }
  const player = st.players[playerId]!;
  return wonderProductionIssue(wonderId, {
    techsUnlocked: player.techsUnlocked,
    empireWondersBuilt,
    empireWondersInProduction,
    cultureMilestones: player.cultureMilestones,
  });
}

/** R-62/R-66 : SetProduction — items unités ET bâtiments ; progression conservée.
 *  7f · R-116 : items MERVEILLES (unicité empire, jalons ONU — R-115/R-116). */
function applySetProduction(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const setOrders: Array<Extract<Order, { type: 'SetProduction' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'SetProduction') continue;
      const city = board.st.cities[order.cityId];
      if (!city || city.owner !== playerId) continue;
      if (productionItemCost(order.item) === null) continue;
      // R-87 (étendue 7e) : item verrouillé refusé — tech non débloquée, non
      // implémenté, unité OBSOLÈTE, GP (R-114), bâtiment fixe (Palais),
      // prérequis de bâtiment manquant (Banque sans Marché) ou déjà possédé.
      const research = board.st.players[playerId]!;
      if (!canSetProduction(order.item, research.techsUnlocked, city.buildings)) continue;
      // 7f · R-116 : unicité d'empire des merveilles + verrou/jalons de l'ONU.
      if (order.item.kind === 'wonder' && wonderSetProductionIssue(board.st, order.item.id, playerId, city.id)) continue;
      setOrders.push(order);
    }
  }
  setOrders.sort((a, b) => compareCityIds(a.cityId, b.cityId));
  for (const order of setOrders) {
    const city = board.st.cities[order.cityId]!;
    const progress = city.production?.progress ?? 0;
    city.production = { item: order.item, progress };
  }
}

/**
 * R-60 · SetWorkedTile — assignation manuelle d'un citoyen (ordre Phase 6).
 * Validations : ville possédée, case null (désassignation) ou dans le rayon
 * de travail (bâtiments compris), travaillable, pas une case de ville, pas
 * travaillée par une AUTRE ville, et un citoyen disponible. Ville pleine :
 * l'ordre est ignoré — désassigner d'abord (règle d'Erik : pas d'échange
 * automatique).
 */
function applySetWorkedTile(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'SetWorkedTile' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'SetWorkedTile') continue;
      const city = board.st.cities[order.cityId];
      if (!city || city.owner !== playerId) continue;
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareCityIds(a.cityId, b.cityId));
  const takenByOthers = takenTilesExcluding(board, null);
  for (const order of orders) {
    const city = board.st.cities[order.cityId]!;
    if (order.tile === null) {
      // Désassignation : le dernier citoyen assigné est retiré (déterministe).
      city.workedTiles.pop();
      continue;
    }
    const parsed = order.tile.split(',');
    const hex = { q: Number(parsed[0]), r: Number(parsed[1]) };
    const cityHex = { q: city.q, r: city.r };
    if (!tileWorkable(board.st.map, order.tile)) continue;
    if (hexDistance(cityHex, hex) > workRadiusOf(city.buildings)) continue;
    if (takenByOthers.has(order.tile)) continue; // travaillée par une autre ville (ou ville elle-même)
    if (city.workedTiles.includes(order.tile)) continue; // déjà travaillée par cette ville : no-op
    if (city.workedTiles.length < city.pop) {
      city.workedTiles.push(order.tile);
      takenByOthers.add(order.tile);
    }
    // Ville pleine : l'ordre est ignoré — le joueur doit d'abord DÉSASSIGNER
    // une case (tile null) pour libérer un citoyen, puis assigner au tour
    // suivant (règle demandée par Erik, remplace l'ancien échange automatique).
  }
}

/** Cases travaillées par les villes, hors celles de la ville donnée (null = toutes). */
function takenTilesExcluding(board: Board, cityId: string | null): Set<TileKey> {
  const taken = new Set<TileKey>();
  for (const id of Object.keys(board.st.cities).sort()) {
    if (id === cityId) continue;
    for (const key of board.st.cities[id]!.workedTiles) taken.add(key);
  }
  // Une case de ville n'est jamais travaillable.
  for (const id of Object.keys(board.st.cities).sort()) {
    const c = board.st.cities[id]!;
    taken.add(`${c.q},${c.r}`);
  }
  return taken;
}

/**
 * 7f · R-115 : InstallPerson — un Personnage illustre s'installe DÉFINITIVE-
 * MENT dans une ville amie, sur sa case ou ADJACENTE (distance ≤ 1) : l'unité
 * est consommée et le joueur gagne 1 jalon culturel. Ordre Phase C ; un ordre
 * invalide (unité/ville non possédée, pas un GP, trop loin) est ignoré.
 */
function applyInstallPerson(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'InstallPerson' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'InstallPerson') continue;
      const unit = board.st.units[order.unitId];
      const city = board.st.cities[order.cityId];
      if (!unit || unit.owner !== playerId) continue;
      if (!city || city.owner !== playerId) continue; // ville AMIE uniquement
      if (!isGreatPersonType(unit.type)) continue; // R-114 : GP seulement
      if (hexDistance(unit, city) > 1) continue; // sur la case ou adjacente
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  for (const order of orders) {
    const unit = board.st.units[order.unitId];
    const city = board.st.cities[order.cityId];
    if (!unit || !city) continue; // déjà consommé par un ordre antérieur du lot
    const player = board.st.players[unit.owner]!;
    delete board.st.units[unit.id];
    player.cultureMilestones += 1;
    emit(board, {
      type: 'InstallPerson',
      unitId: unit.id,
      unitType: unit.type,
      cityId: city.id,
      owner: unit.owner,
      at: { q: unit.q, r: unit.r },
    });
    emit(board, {
      type: 'CultureMilestone',
      player: unit.owner,
      delta: 1,
      total: player.cultureMilestones,
      reason: 'install',
    });
  }
}

/** R-65 : ville sans défenseur investie → capture (capitale = victoire). R-97 : capture BARBARE → rasement. */
function processCityCaptures(board: Board): void {
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const hex = { q: city.q, r: city.r };
    const here = occupants(board, hex);
    if (here.length === 0) continue;
    if (here.some((u) => u.owner === city.owner)) continue; // défendue (R-57)
    const invader = here[0]!;
    const fromOwner = city.owner;
    if (isBarbarian(invader.owner)) {
      // R-97 (Phase 7d) : les barbares ne fondent pas de ville — la ville est
      // RASÉE (disparaît, bâtiments perdus, aucun changement de propriétaire).
      // 7f · R-115 : les merveilles rasées sont PERDUES (−1 jalon chacune).
      for (const w of [...city.wonders].sort()) {
        const loser = board.st.players[fromOwner];
        if (!loser) break;
        loser.cultureMilestones -= 1;
        emit(board, {
          type: 'CultureMilestone',
          player: fromOwner,
          delta: -1,
          total: loser.cultureMilestones,
          reason: 'wonderLost',
        });
      }
      delete board.st.cities[cityId];
      emit(board, { type: 'CityRazed', cityId, owner: fromOwner, byPlayer: invader.owner, at: hex });
      if (city.capital) {
        // R-97 : la capitale rasée = défaite de son propriétaire — victoire de
        // l'AUTRE joueur réel (les barbares ne gagnent jamais).
        const winner =
          Object.keys(board.st.players)
            .filter((id) => id !== fromOwner && !isBarbarian(id))
            .sort()[0] ?? null;
        board.st.winner = winner;
        emit(board, { type: 'Victory', winner: winner ?? '', reason: 'razedCapital' });
      }
      continue;
    }
    city.owner = invader.owner;
    city.pop = Math.max(1, city.pop - 1);
    city.production = null;
    city.workedTiles = [];
    city.buildings = []; // R-66 : les bâtiments sont perdus à la capture (le captreur ne les récupère pas)
    city.conversion = CONVERSION_DEFAULT; // R-90 : le choix de conversion est réinitialisé
    board.pendingFill.add(cityId); // les citoyens de la nouvelle propriétaire sont auto-assignés
    // 7f · R-115 : les merveilles SURVIVENT à la capture — elles changent de
    // propriétaire avec la ville ; le perdant cède ses jalons, le captreur
    // les reçoit (dynamique : « chaque merveille contrôlée = 1 point »).
    for (const w of [...city.wonders].sort()) {
      const loser = board.st.players[fromOwner];
      if (loser) {
        loser.cultureMilestones -= 1;
        emit(board, {
          type: 'CultureMilestone',
          player: fromOwner,
          delta: -1,
          total: loser.cultureMilestones,
          reason: 'wonderLost',
        });
      }
      const captor = board.st.players[invader.owner]!;
      captor.cultureMilestones += 1;
      emit(board, {
        type: 'CultureMilestone',
        player: invader.owner,
        delta: 1,
        total: captor.cultureMilestones,
        reason: 'wonderCaptured',
      });
    }
    emit(board, { type: 'CityCaptured', cityId, fromOwner, toOwner: invader.owner, at: hex });
    if (city.capital) {
      board.st.winner = invader.owner; // R-65 : victoire par domination
      emit(board, { type: 'Victory', winner: invader.owner, reason: 'domination' });
    }
  }
}

/**
 * R-96 · Engendrement barbare par les villages (Phase C — l'unité produite
 * n'agit pas le tour de sa naissance). Compteur décrémenté à chaque
 * résolution ; l'unité apparaît sur une CASE ADJACENTE LIBRE du village (tri
 * (q, r) — R-81 ; évite qu'un défenseur ne campe sur le village et le rende
 * inexpugnable), report si aucune case n'est disponible ; cap T-22 d'unités
 * vivantes par village, type selon l'escalade R-95.
 */
function processVillages(board: Board): void {
  for (const village of [...board.st.villages].sort((a, b) => compareIds(a.id, b.id))) {
    village.spawnCountdown -= 1;
    if (village.spawnCountdown > 0) continue;
    village.spawnCountdown = BARBARIANS.spawnInterval;
    village.spawnedUnits = village.spawnedUnits.filter((id) => board.st.units[id]);
    if (village.spawnedUnits.length >= BARBARIANS.capPerVillage) continue; // cap T-22
    const hex = { q: village.q, r: village.r };
    const tile = freeSpawnTiles(board.st, hex, 1)[0];
    if (!tile) continue; // aucune case adjacente libre : reporté au cycle suivant
    const type = barbarianUnitType(board.st.turn + 1); // tour résultant
    const unit = createBarbarianUnit(board.st, tile, type);
    village.spawnedUnits.push(unit.id);
    emit(board, { type: 'BarbarianSpawned', unitId: unit.id, villageId: village.id, owner: BARBARIAN_ID, at: tile });
  }
}

/** R-64 : fondation de ville (consomme le Colon), exécutée en Phase C. */
function processFoundCity(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const foundOrders: Array<Extract<Order, { type: 'FoundCity' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'FoundCity') continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      foundOrders.push(order);
    }
  }
  foundOrders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  for (const order of foundOrders) {
    const unit = board.st.units[order.unitId];
    if (!unit || unit.detainedBy || !unitType(unit.type).canFoundCity) continue;
    const hex = { q: unit.q, r: unit.r };
    if (cityAt(board, hex)) continue;
    // T-09 : distance minimale à toute ville existante.
    if (Object.values(board.st.cities).some((c) => hexDistance(c, hex) < MIN_CITY_DISTANCE)) continue;
    const ownerHasCity = Object.values(board.st.cities).some((c) => c.owner === unit.owner);
    const cityId = nextId(board.st.cities, 'c');
    board.st.cities[cityId] = {
      id: cityId,
      q: hex.q,
      r: hex.r,
      owner: unit.owner,
      pop: 1,
      capital: !ownerHasCity,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: !ownerHasCity ? ['palais'] : [], // 7e : le Palais ne vit que dans la capitale
      conversion: CONVERSION_DEFAULT, // R-90 : défaut Or
      cultureStored: 0, // 7f · R-113
      wonders: [], // 7f · R-115
    };
    board.st.map[tileKeyOf(hex)] = { terrain: 'ville', resource: null };
    delete board.st.units[unit.id];
    board.pendingFill.add(cityId); // le premier citoyen est auto-assigné en Phase C
    emit(board, { type: 'CityFounded', cityId, owner: unit.owner, at: hex, capital: !ownerHasCity, byUnitId: unit.id });
  }
}

/** R-60/R-61/R-63/R-66 : rendements, répartition or/science, croissance, production. */
function processEconomy(board: Board): void {
  // Une case travaillée l'est par exactement une ville (propriété R-60) :
  // re-validation dans l'ordre des cityIds, qui arbitre tout conflit.
  // Remplissage automatique UNIQUEMENT pour les villes fondées ou capturées
  // ce tour (board.pendingFill) — une désassignation manuelle (SetWorkedTile
  // null) ou une case devenue invalide LIBÈRE un citoyen sans re-remplissage
  // (règle d'Erik : le joueur réassigne explicitement).
  const taken = new Set<TileKey>();
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    city.workedTiles = validatedWorkedTiles(board, city, taken);
    for (const key of city.workedTiles) taken.add(key);
    if (city.workedTiles.length < city.pop && board.pendingFill.has(cityId)) {
      fillWorkedTiles(board, city, taken);
    }
  }

  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const player = board.st.players[city.owner]!;

    // 7e · Premier découvrir : bonus d'empire par ville (Littératie +1 science,
    // Chemin de fer +2 production, Industrialisation +5 or…). Le volet culture
    // est ignoré tant que le moteur culturel n'existe pas (7f).
    const empireBonus = empirePerCityBonus(board.st, city.owner);

    // Rendements : centre-ville automatique et gratuit + Σ cases travaillées
    // (base §2 + bonus bâtiments par terrain travaillé R-66 + bonus ressource
    // si le propriétaire y a accès, R-93).
    const cityTile = TERRAINS['ville']!.yields!;
    let food = cityTile.food;
    let rawProduction = cityTile.production + empireBonus.production;
    let commerce = cityTile.commerce + empireBonus.commerce;
    for (const key of city.workedTiles) {
      const y = tileYield(board.st.map, city.buildings, key, player.techsUnlocked)!;
      food += y.food;
      rawProduction += y.production;
      commerce += y.commerce;
    }
    // 7f · R-113/R-116 : le Colosse de Rhodes DOUBLE le commerce brut de la
    // ville hôte (avant la conversion or/science R-90) — data-driven.
    let wonderCommerceMult = 1;
    for (const w of city.wonders) wonderCommerceMult = Math.max(wonderCommerceMult, WONDERS[w]?.commerceMult ?? 1);
    commerce *= wonderCommerceMult;
    // 7e · Multiplicateurs de production (Usine ×2, data-driven).
    let factoryMult = 1;
    for (const b of city.buildings) factoryMult = Math.max(factoryMult, BUILDINGS[b]?.productionMult ?? 1);
    const prodMult = factoryMult * (1 + POP_PRODUCTION_BONUS * (city.pop - 1)); // R-63 🔶
    const production = Math.floor(rawProduction * prodMult);
    // R-90 révisée (Phase 7b) : le commerce est converti en TOTALITÉ en or ou
    // en science selon le choix de la ville. 7e : Marché ×2 / Banque ×4 or,
    // Bibliothèque ×1,5 / Université ×4 science (data-driven, conversion.ts).
    const gains = conversionGains(commerce, city.conversion, city.buildings);
    player.gold += gains.gold + empireBonus.gold;
    // R-85 : la science alimente la tech courante (progression par tech,
    // débordement reporté) ou la réserve si aucun choix (`scienceStored`).
    // 7e : à la complétion, la récompense de Premier découvrir est appliquée
    // (firstDiscovery.ts) ; les nouveaux citoyens sont auto-assignés ici.
    creditScience(board.st, city.owner, gains.science + empireBonus.science, {
      onResearched: (pid, techId) => {
        emit(board, { type: 'TechResearched', player: pid, tech: techId });
      },
      onFirstDiscovered: (payload, citiesToFill) => {
        emit(board, payload);
        for (const id of citiesToFill) board.pendingFill.add(id);
      },
    });

    // R-63 : croissance au seuil 10 × pop (T-15) ; +1 pop = +1 citoyen
    // (auto-assigné) et +T-16 production par pop au-delà de la première.
    // 7e · Aqueduc : seuil réduit d'un tiers (data-driven 🔶).
    let growthReduction = 0;
    for (const b of city.buildings) {
      growthReduction = Math.max(growthReduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    }
    city.foodStored += food;
    let threshold = Math.max(1, Math.round(GROWTH_BASE * city.pop * (1 - growthReduction)));
    while (city.foodStored >= threshold) {
      city.foodStored -= threshold;
      city.pop += 1;
      emit(board, { type: 'PopulationGrew', cityId, owner: city.owner, pop: city.pop, at: { q: city.q, r: city.r } });
      if (city.workedTiles.length < city.pop) fillWorkedTiles(board, city, taken);
      threshold = Math.max(1, Math.round(GROWTH_BASE * city.pop * (1 - growthReduction)));
    }

    // 7f · R-113 : rendement culturel de la ville (scalaire sur la démographie :
    // Palais + Temples/Cathédrales × pop, Stonehenge ×1,5) + bonus empire
    // perCity.culture (R-109) — accumulation PAR VILLE.
    city.cultureStored += cultureGains(city, empireBonus.culture, player.techsUnlocked);
    // 7f · R-114 : seuil T-27 (base 20 🔶, ×2 par GP obtenu PAR L'EMPIRE) —
    // au plus un GP par ville et par tour ; le surplus est conservé (miroir
    // R-63). Posé sur la case de la ville, sinon case adjacente libre.
    const gpThreshold = greatPersonThresholdFor(player.greatPersonsObtained);
    if (city.cultureStored >= gpThreshold) {
      city.cultureStored -= gpThreshold;
      const gpType = greatPersonTypeFor(player.greatPersonsObtained);
      player.greatPersonsObtained += 1;
      const gpStats = unitType(gpType);
      const cityHex = { q: city.q, r: city.r };
      const spot = occupiedByUnit(board, cityHex) ? (freeSpawnTiles(board.st, cityHex, 1)[0] ?? null) : cityHex;
      if (spot) {
        const gpId = nextId(board.st.units, 'u');
        board.st.units[gpId] = {
          id: gpId,
          type: gpType,
          owner: city.owner,
          q: spot.q,
          r: spot.r,
          hp: gpStats.hpMax,
          mp: gpStats.movement,
          veteran: false,
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
        };
        emit(board, {
          type: 'GreatPersonSpawned',
          unitId: gpId,
          unitType: gpType,
          cityId,
          owner: city.owner,
          at: spot,
        });
      }
      // Aucune case libre : le GP est perdu (interprétation documentée R-114,
      // comme l'unité gratuite d'une hutte R-98).
    }

    // R-62/R-66 : un seul item, progression conservée ; unité posée sur la
    // case de ville (si libre), bâtiment ajouté à la ville (permanent).
    if (city.production) {
      const cost = productionItemCost(city.production.item, board.st, city.owner);
      if (cost !== null) {
        // 7f · R-116 : les Nations Unies sont SUSPENDUES tant que les jalons
        // sont sous le seuil — progression gelée (marteaux conservés 🔶).
        const unSuspended =
          city.production.item.kind === 'wonder' &&
          WONDERS[city.production.item.id]?.cultureVictory === true &&
          player.cultureMilestones < CULTURE.milestonesTarget;
        if (!unSuspended) city.production.progress += production;
        if (!unSuspended && city.production.progress >= cost) {
          if (city.production.item.kind === 'unit') {
            const stats = unitType(city.production.item.id);
            const hex = { q: city.q, r: city.r };
            // 7e · Coût en population (comportement officiel CivRev adopté
            // par Erik : le Colon consomme 2 population à sa PRODUCTION) —
            // la ville garde au moins 1 citoyen ; pop insuffisante = en attente.
            const popCost = stats.populationCost ?? 0;
            const popAvailable = city.pop >= Math.max(1, popCost);
            if (!occupiedByUnit(board, hex) && popAvailable) {
              if (popCost > 0) {
                city.pop = Math.max(1, city.pop - popCost);
                city.workedTiles = city.workedTiles.slice(0, city.pop);
                emit(board, {
                  type: 'PopulationConsumed',
                  cityId,
                  owner: city.owner,
                  pop: city.pop,
                  byUnitType: stats.id,
                  at: hex,
                });
              }
              const unitId = nextId(board.st.units, 'u');
              board.st.units[unitId] = {
                id: unitId,
                type: city.production.item.id,
                owner: city.owner,
                q: hex.q,
                r: hex.r,
                hp: stats.hpMax,
                mp: stats.movement,
                // R-89 (Phase 7b) : la Caserne rend les unités produites
                // vétérans — hors pacifiques (pas de combat).
                veteran: hasBuilding(city, 'caserne') && stats.canAttack,
                isArmy: false,
                order: null,
                detainedBy: null,
                fortified: false,
              };
              emit(board, {
                type: 'UnitProduced',
                unitId,
                cityId,
                owner: city.owner,
                unitType: city.production.item.id,
                at: hex,
              });
              city.production = null; // 🔶 file vidée après complétion
            } else {
              city.production.progress = cost; // en attente 🔶 (case occupée ou pop insuffisante)
            }
          } else if (city.production.item.kind === 'wonder') {
            // 7f · R-115/R-116 : merveille achevée — unique à l'empire, +1
            // jalon, effets simples (Jardins : +50 % pop ; ONU : victoire).
            const wonderId = city.production.item.id;
            const wonderData = WONDERS[wonderId];
            const empireHas = Object.values(board.st.cities).some(
              (c) => c.owner === city.owner && c.wonders.includes(wonderId),
            );
            city.production = null; // file vidée (R-62)
            if (wonderData && !empireHas) {
              city.wonders.push(wonderId);
              player.cultureMilestones += 1;
              emit(board, {
                type: 'WonderCompleted',
                cityId,
                owner: city.owner,
                wonder: wonderId,
                at: { q: city.q, r: city.r },
              });
              emit(board, {
                type: 'CultureMilestone',
                player: city.owner,
                delta: 1,
                total: player.cultureMilestones,
                reason: 'wonderBuilt',
              });
              // Jardins suspendus : +50 % de population immédiat (arrondi au
              // plus proche, R-116) — citoyens auto-assignés en Phase C.
              if (wonderData.populationGainPct) {
                const gain = Math.round(city.pop * wonderData.populationGainPct);
                if (gain > 0) {
                  city.pop += gain;
                  board.pendingFill.add(cityId);
                  emit(board, {
                    type: 'PopulationGrew',
                    cityId,
                    owner: city.owner,
                    pop: city.pop,
                    at: { q: city.q, r: city.r },
                  });
                }
              }
              // R-116 : les Nations Unies achevées = VICTOIRE CULTURELLE.
              if (wonderData.cultureVictory) {
                board.st.winner = city.owner;
                emit(board, { type: 'Victory', winner: city.owner, reason: 'culture' });
              }
            }
            // Double complétion concurrente (déjà bâtie ailleurs dans
            // l'empire) : no-op documenté (R-116) — ni merveille ni jalon.
          } else {
            // Bâtiment (R-66) : permanent, non duplicable, aucun besoin de case.
            // 7e · Remplacement : la Banque RETIRE le Marché de la ville (idem
            // Université/Bibliothèque, Cathédrale/Temple).
            const buildingId = city.production.item.id;
            if (!hasBuilding(city, buildingId)) {
              const replaced = BUILDINGS[buildingId]?.replaces;
              if (replaced && hasBuilding(city, replaced)) {
                city.buildings = city.buildings.filter((b) => b !== replaced);
              }
              city.buildings.push(buildingId);
              emit(board, {
                type: 'BuildingCompleted',
                cityId,
                owner: city.owner,
                building: buildingId,
                at: { q: city.q, r: city.r },
              });
            }
            city.production = null;
          }
        }
      } else {
        city.production = null; // item inconnu : file purgée
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Phase D — vision, soins, PM (RULES.md §9)
// ---------------------------------------------------------------------------

function processHealsAndMp(board: Board): void {
  for (const id of sortUnitIds(board)) {
    const unit = board.st.units[id]!;
    const stats = unitType(unit.type);
    if (!board.moved.has(id) && !board.fought.has(id)) {
      // R-71 🔶 : +1 PV/tour, +2 dans une ville amie.
      const city = cityAt(board, unit);
      const heal = city && city.owner === unit.owner ? 2 : 1;
      const cap = unit.isArmy ? ARMY_SIZE * stats.hpMax : stats.hpMax;
      unit.hp = Math.min(cap, unit.hp + heal);
    }
    unit.mp = stats.movement; // R-72 : PM régénérés au maximum
  }
}

// ---------------------------------------------------------------------------
// resolveTurn
// ---------------------------------------------------------------------------

export function resolveTurn(
  inputState: GameState,
  ordersByPlayer: Record<PlayerId, Order[]>,
  rngSeed: number,
): TurnResult {
  const st: GameState = structuredClone(inputState);
  st.phase = 'resolving';

  // R-95/R-97 (Phase 7d) : les barbares jouent avec les MÊMES phases — leurs
  // ordres sont générés en tête de résolution par une fonction pure et
  // déterministe, puis suivent le traitement normal (mouvements → combats).
  // Ils ne sont JAMAIS persistés dans l'état ni diffusés aux clients
  // (anti-triche R-95 : seuls les événements résultants, filtrés par fog,
  // quittent le moteur).
  const allOrders: Record<PlayerId, Order[]> = { ...ordersByPlayer };
  if (
    st.villages.length > 0 ||
    Object.values(st.units).some((u) => isBarbarian(u.owner))
  ) {
    allOrders[BARBARIAN_ID] = [...(allOrders[BARBARIAN_ID] ?? []), ...barbarianOrders(st)];
  }

  const board: Board = {
    st,
    rng: createRng(rngSeed),
    seq: st.lastEventSeq,
    events: [],
    planned: [],
    origin: new Map(),
    moved: new Set(),
    steps: new Map(),
    fought: new Set(),
    initialVisible: new Map(),
    formGroups: new Map(),
    pendingRetreats: [],
    pendingFill: new Set(),
  };

  for (const id of sortUnitIds(board)) {
    const u = st.units[id]!;
    board.origin.set(id, { q: u.q, r: u.r });
    board.steps.set(id, 0);
  }
  for (const playerId of Object.keys(st.players).sort()) {
    board.initialVisible.set(playerId, computeVisibleTiles(st, playerId));
  }
  for (const order of allOrdersFlattened(ordersByPlayer)) {
    if (order.type === 'FormArmy') {
      const group: FormGroup = { members: [...order.members], rally: { ...order.rally } };
      for (const m of order.members) board.formGroups.set(m, group);
    }
  }

  // ---- Phase A : fortification R-33 (avant les mouvements : un Move donné
  // à un fortifié l'annule et s'exécute ; un Fortify efface tout chemin).
  applyFortifyOrders(board, allOrders);
  // mouvements (R-40..R-43), ordre unitId croissant (R-41) — barbares compris.
  for (const { unit, path } of collectMoveOrders(board, allOrders)) {
    if (!st.units[unit.id] || unit.detainedBy) continue;
    executeMoveOrder(board, unit, path);
  }
  // Ordres Hold : effacent l'intention courante (chemin gelé compris).
  for (const order of allOrdersFlattened(allOrders)) {
    if (order.type !== 'Hold') continue;
    const unit = st.units[order.unitId];
    if (unit) unit.order = null;
  }
  // Ordres Attack explicites (I-2 : une attaque suppose des PM disponibles).
  const attackOrders: Array<Extract<Order, { type: 'Attack' }>> = [];
  for (const playerId of Object.keys(allOrders).sort()) {
    for (const order of allOrders[playerId] ?? []) {
      if (order.type !== 'Attack') continue;
      const unit = st.units[order.unitId];
      if (!unit || unit.owner !== playerId || unit.detainedBy) continue;
      attackOrders.push(order);
    }
  }
  attackOrders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  for (const order of attackOrders) {
    const unit = st.units[order.unitId]!;
    const target = order.target;
    const enemy = occupants(board, target).find((u) => u.owner !== unit.owner);
    if (!enemy) continue; // pas d'ennemi présent → fizzle
    if (!areAtWar(st, unit.owner, enemy.owner)) continue; // R-58-a 🔶 (Phase 7)
    if (isPeaceful(unit)) continue; // R-43 : un pacifique n'attaque jamais
    // R-59 : une unité à distance attaque depuis sa case, portée T-13 🔶
    // (1 = adjacente en v1) — la mêlée exige le contact.
    const range = isRanged(unit) ? RANGED_RANGE : 1;
    if (hexDistance(unit, target) > range) continue; // cible hors de portée
    if (unit.mp < 1) continue;
    unit.mp -= 1;
    board.planned.push({ kind: 'attack', at: target, attackerId: unit.id, defenderId: enemy.id });
  }
  // R-44 : formation d'armées en fin de Phase A.
  processFormArmy(board, allOrdersFlattened(allOrders));

  // ---- Phase B : combats (R-50 : tri par case puis attaquant croissant).
  // R-56 (deux passes) : chaque combat se résout avec UN échange (R-51) et le
  // perdant devant replier est collecté (passe 1) ; les cases de repli sont
  // allouées globalement ensuite, par PV décroissants (passe 2), puis les
  // perdants sans case reprennent le combat contre leur vainqueur (passe 3).
  board.planned.sort(
    (a, b) =>
      compareHex(a.at, b.at) ||
      compareUnitIds(primaryId(a), primaryId(b)) ||
      planOrder(a) - planOrder(b),
  );
  for (const plan of board.planned) {
    if (plan.kind === 'attack') {
      const attacker = st.units[plan.attackerId];
      const defender = st.units[plan.defenderId];
      if (!attacker || !defender) continue; // l'un est mort entre-temps
      // R-59 : portée T-13 pour l'attaquant à distance, contact sinon.
      const range = isRanged(attacker) ? RANGED_RANGE : 1;
      if (hexDistance(attacker, defender) > range) continue; // plus au contact
      resolveAttack(board, attacker, defender, { q: defender.q, r: defender.r });
    } else if (plan.kind === 'villageAttack') {
      // R-96 (Phase 7d) : le village défend sa case s'il est toujours debout.
      const attacker = st.units[plan.attackerId];
      const village = st.villages.find((v) => v.id === plan.villageId);
      if (!attacker || !village) continue;
      if (hexDistance(attacker, village) > 1) continue; // plus au contact
      resolveVillageAttack(board, attacker, village, { q: village.q, r: village.r });
    } else {
      const holder = st.units[plan.holderId];
      const challenger = st.units[plan.challengerId];
      if (!holder || !challenger) continue;
      if (hexDistance(holder, challenger) !== 1) continue;
      resolveCollision(board, holder, challenger, { q: holder.q, r: holder.r });
    }
  }
  allocateRetreats(board);

  // ---- Phase C : économie (R-60 à R-66) + barbares (R-96 : villages).
  applySetProduction(board, allOrders);
  applyInstallPerson(board, allOrders); // 7f · R-115
  processCityCaptures(board);
  processFoundCity(board, allOrders);
  processVillages(board);
  applySetWorkedTile(board, allOrders);
  processEconomy(board);

  // ---- Phase D : vision (R-70), soins (R-71), PM (R-72).
  recomputeVision(st);
  processHealsAndMp(board);

  // ---- Finalisation : tour suivant, graine avancée uniquement en Phase B (R-80).
  st.turn += 1;
  st.phase = 'orders';
  st.rngSeed = board.rng.state;
  emit(board, { type: 'TurnResolved', turn: st.turn });
  st.lastEventSeq = board.seq;

  return { newState: st, events: board.events };
}

function primaryId(plan: CombatPlan): UnitId {
  return plan.kind === 'attack' ? plan.attackerId : plan.kind === 'villageAttack' ? plan.attackerId : plan.holderId;
}

/** Ordre de type de plan dans le tri R-50 (attaque et village avant collision). */
function planOrder(plan: CombatPlan): number {
  return plan.kind === 'collision' ? 1 : 0;
}
