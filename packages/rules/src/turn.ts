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
import { areAtWar, compareCityIds, compareUnitIds, nextId } from './state.js';
import type { City, GameState, Order, PlayerId, ProductionItem, TileKey, Unit, UnitId } from './state.js';
import { TERRAINS, unitType, building, BUILDINGS } from './data.js';
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
  SETTLER_BOOTY_GOLD,
} from './constants.js';
import type { DestructionCause, GameEvent } from './events.js';

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
type CombatPlan = AttackPlan | CollisionPlan;

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
    board.st.players[byPlayer]!.gold += SETTLER_BOOTY_GOLD;
    emit(board, { type: 'BootyGold', player: byPlayer, amount: SETTLER_BOOTY_GOLD, sourceUnitId: victim.id });
  } else {
    victim.detainedBy = byPlayer;
  }
}

function terrainDefenseBonus(board: Board, hex: Hex): number {
  const tile = board.st.map[tileKeyOf(hex)];
  return tile ? TERRAINS[tile.terrain]!.defenseBonus : 0;
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
  const sDef = effectiveStrength(
    dStats.defense,
    defender.veteran,
    terrainDefenseBonus(board, combatTile) + (defender.fortified ? FORTIFY_DEFENSE_BONUS : 0),
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
      const winner = board.st.units[req.winnerId];
      if (winner) moveUnit(board, winner, req.combatTile); // le challenger prend la case libérée
    }
  }
  for (const req of withoutTile) {
    const loser = board.st.units[req.loserId];
    const winner = board.st.units[req.winnerId];
    if (!loser || !winner) continue;
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
    if (haltedByNewSighting(board, unit, next)) break; // halte, chemin gelé

    if (!inMapAndPassable(board, next)) {
      path = []; // R-42 : chemin invalide, l'unité s'arrête
      break;
    }
    const here = occupants(board, next);
    if (here.length === 0) {
      // R-40 : mouvement garanti vers une case vide.
      path.shift();
      unit.mp -= 1;
      moveUnit(board, unit, next);
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

/** Coût d'un item de production (unité ou bâtiment), null si id inconnu. */
function productionItemCost(item: ProductionItem): number | null {
  if (item.kind === 'unit') {
    try {
      return unitType(item.id).cost;
    } catch {
      return null;
    }
  }
  return BUILDINGS[item.id]?.cost ?? null;
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
 * (q, r) (R-60/R-81, rendements effectifs — bonus bâtiments compris).
 */
function fillWorkedTiles(board: Board, city: City, taken: Set<TileKey>): void {
  const radius = workRadiusOf(city.buildings);
  const cityHex = { q: city.q, r: city.r };
  const cityKeys = new Set(Object.values(board.st.cities).map((c) => `${c.q},${c.r}`));
  const candidates = hexesWithinRadius(cityHex, radius)
    .filter((h) => hexDistance(h, cityHex) >= 1)
    .map((h) => ({ key: tileKeyOf(h), hex: h }))
    .filter(({ key }) => tileWorkable(board.st.map, key) && !cityKeys.has(key) && !taken.has(key))
    .map(({ key, hex }) => ({ key, hex, y: tileYield(board.st.map, city.buildings, key)! }))
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

/** R-62/R-66 : SetProduction — items unités ET bâtiments ; progression conservée. */
function applySetProduction(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const setOrders: Array<Extract<Order, { type: 'SetProduction' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'SetProduction') continue;
      const city = board.st.cities[order.cityId];
      if (!city || city.owner !== playerId) continue;
      if (productionItemCost(order.item) === null) continue;
      // R-66 : un bâtiment déjà possédé n'est pas (re)constructible.
      if (order.item.kind === 'building' && hasBuilding(city, order.item.id)) continue;
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
 * travaillée par une AUTRE ville. Assigner une case libre : si tous les
 * citoyens sont employés, ÉCHANGE — la case la moins intéressante de la
 * ville (même priorité, tie-break (q, r) croissant : la dernière du classement)
 * cède sa place (interprétation documentée, 🔶).
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
    } else {
      // Échange : remplace la case la moins intéressante (dernière du classement).
      const ranked = [...city.workedTiles]
        .map((key) => {
          const p = key.split(',');
          return { key, hex: { q: Number(p[0]), r: Number(p[1]) }, y: tileYield(board.st.map, city.buildings, key)! };
        })
        .sort(
          (a, b) =>
            a.y.food - b.y.food ||
            a.y.production - b.y.production ||
            a.y.commerce - b.y.commerce ||
            compareHex(a.hex, b.hex),
        );
      const worst = ranked[ranked.length - 1];
      if (!worst) continue;
      city.workedTiles = city.workedTiles.map((k) => (k === worst.key ? order.tile! : k));
    }
    takenByOthers.add(order.tile);
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

/** R-65 : ville sans défenseur investie → capture (capitale = victoire). */
function processCityCaptures(board: Board): void {
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const hex = { q: city.q, r: city.r };
    const here = occupants(board, hex);
    if (here.length === 0) continue;
    if (here.some((u) => u.owner === city.owner)) continue; // défendue (R-57)
    const invader = here[0]!;
    const fromOwner = city.owner;
    city.owner = invader.owner;
    city.pop = Math.max(1, city.pop - 1);
    city.production = null;
    city.workedTiles = [];
    city.buildings = []; // R-66 : les bâtiments sont perdus à la capture (le captreur ne les récupère pas)
    emit(board, { type: 'CityCaptured', cityId, fromOwner, toOwner: invader.owner, at: hex });
    if (city.capital) {
      board.st.winner = invader.owner; // R-65 : victoire par domination
      emit(board, { type: 'Victory', winner: invader.owner, reason: 'domination' });
    }
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
      buildings: [],
    };
    board.st.map[tileKeyOf(hex)] = { terrain: 'ville', resource: null };
    delete board.st.units[unit.id];
    emit(board, { type: 'CityFounded', cityId, owner: unit.owner, at: hex, capital: !ownerHasCity, byUnitId: unit.id });
  }
}

/** R-60/R-61/R-63/R-66 : rendements, répartition or/science, croissance, production. */
function processEconomy(board: Board): void {
  // Une case travaillée l'est par exactement une ville (propriété R-60) :
  // re-validation dans l'ordre des cityIds, qui arbitre tout conflit.
  // Interprétation (documentée) : le re-remplissage automatique ne joue QUE
  // si des cases sont devenues indisponibles (ou ville neuve) — une
  // désassignation MANUELLE (SetWorkedTile null) laisse le citoyen au repos.
  const taken = new Set<TileKey>();
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const before = city.workedTiles.length;
    city.workedTiles = validatedWorkedTiles(board, city, taken);
    const removed = before - city.workedTiles.length;
    for (const key of city.workedTiles) taken.add(key);
    if (removed > 0 || city.workedTiles.length === 0) fillWorkedTiles(board, city, taken);
  }

  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const player = board.st.players[city.owner]!;

    // Rendements : centre-ville automatique et gratuit + Σ cases travaillées
    // (base §2 + bonus bâtiments par terrain travaillé, R-66).
    const cityTile = TERRAINS['ville']!.yields!;
    let food = cityTile.food;
    let rawProduction = cityTile.production;
    let commerce = cityTile.commerce;
    for (const key of city.workedTiles) {
      const y = tileYield(board.st.map, city.buildings, key)!;
      food += y.food;
      rawProduction += y.production;
      commerce += y.commerce;
    }
    const prodMult = 1 + POP_PRODUCTION_BONUS * (city.pop - 1); // R-63 🔶
    const production = Math.floor(rawProduction * prodMult);
    // R-61 : le commerce est réparti or/science par le curseur global (reste
    // entier à l'or) — le commerce n'est JAMAIS crédité directement.
    const scienceGain = Math.floor(commerce * player.scienceRatio);
    player.gold += commerce - scienceGain;
    player.science += scienceGain;

    // R-63 : croissance au seuil 10 × pop (T-15) ; +1 pop = +1 citoyen
    // (auto-assigné) et +T-16 production par pop au-delà de la première.
    city.foodStored += food;
    let threshold = GROWTH_BASE * city.pop;
    while (city.foodStored >= threshold) {
      city.foodStored -= threshold;
      city.pop += 1;
      emit(board, { type: 'PopulationGrew', cityId, owner: city.owner, pop: city.pop, at: { q: city.q, r: city.r } });
      if (city.workedTiles.length < city.pop) fillWorkedTiles(board, city, taken);
      threshold = GROWTH_BASE * city.pop;
    }

    // R-62/R-66 : un seul item, progression conservée ; unité posée sur la
    // case de ville (si libre), bâtiment ajouté à la ville (permanent).
    if (city.production) {
      const cost = productionItemCost(city.production.item);
      if (cost !== null) {
        city.production.progress += production;
        if (city.production.progress >= cost) {
          if (city.production.item.kind === 'unit') {
            const stats = unitType(city.production.item.id);
            const hex = { q: city.q, r: city.r };
            if (!occupiedByUnit(board, hex)) {
              const unitId = nextId(board.st.units, 'u');
              board.st.units[unitId] = {
                id: unitId,
                type: city.production.item.id,
                owner: city.owner,
                q: hex.q,
                r: hex.r,
                hp: stats.hpMax,
                mp: stats.movement,
                veteran: false,
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
              city.production.progress = cost; // en attente 🔶
            }
          } else {
            // Bâtiment (R-66) : permanent, non duplicable, aucun besoin de case.
            const buildingId = city.production.item.id;
            if (!hasBuilding(city, buildingId)) {
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
  applyFortifyOrders(board, ordersByPlayer);
  // mouvements (R-40..R-43), ordre unitId croissant (R-41).
  for (const { unit, path } of collectMoveOrders(board, ordersByPlayer)) {
    if (!st.units[unit.id] || unit.detainedBy) continue;
    executeMoveOrder(board, unit, path);
  }
  // Ordres Hold : effacent l'intention courante (chemin gelé compris).
  for (const order of allOrdersFlattened(ordersByPlayer)) {
    if (order.type !== 'Hold') continue;
    const unit = st.units[order.unitId];
    if (unit) unit.order = null;
  }
  // Ordres Attack explicites (I-2 : une attaque suppose des PM disponibles).
  const attackOrders: Array<Extract<Order, { type: 'Attack' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
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
    if (hexDistance(unit, target) !== 1) continue; // cible non adjacente
    if (unit.mp < 1) continue;
    unit.mp -= 1;
    board.planned.push({ kind: 'attack', at: target, attackerId: unit.id, defenderId: enemy.id });
  }
  // R-44 : formation d'armées en fin de Phase A.
  processFormArmy(board, allOrdersFlattened(ordersByPlayer));

  // ---- Phase B : combats (R-50 : tri par case puis attaquant croissant).
  // R-56 (deux passes) : chaque combat se résout avec UN échange (R-51) et le
  // perdant devant replier est collecté (passe 1) ; les cases de repli sont
  // allouées globalement ensuite, par PV décroissants (passe 2), puis les
  // perdants sans case reprennent le combat contre leur vainqueur (passe 3).
  board.planned.sort(
    (a, b) =>
      compareHex(a.at, b.at) ||
      compareUnitIds(primaryId(a), primaryId(b)) ||
      (a.kind === 'attack' ? 0 : 1) - (b.kind === 'attack' ? 0 : 1),
  );
  for (const plan of board.planned) {
    if (plan.kind === 'attack') {
      const attacker = st.units[plan.attackerId];
      const defender = st.units[plan.defenderId];
      if (!attacker || !defender) continue; // l'un est mort entre-temps
      if (hexDistance(attacker, defender) > 1) continue; // plus au contact
      resolveAttack(board, attacker, defender, { q: defender.q, r: defender.r });
    } else {
      const holder = st.units[plan.holderId];
      const challenger = st.units[plan.challengerId];
      if (!holder || !challenger) continue;
      if (hexDistance(holder, challenger) !== 1) continue;
      resolveCollision(board, holder, challenger, { q: holder.q, r: holder.r });
    }
  }
  allocateRetreats(board);

  // ---- Phase C : économie (R-60 à R-66).
  applySetProduction(board, ordersByPlayer);
  processCityCaptures(board);
  processFoundCity(board, ordersByPlayer);
  applySetWorkedTile(board, ordersByPlayer);
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
  return plan.kind === 'attack' ? plan.attackerId : plan.holderId;
}
