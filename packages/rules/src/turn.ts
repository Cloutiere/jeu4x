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
import { areAtWar, compareCityIds, compareIds, compareUnitIds, isBarbarian, nextId, allKnownTechs } from './state.js';
import type { BarbarianVillage, City, CityId, GameState, Order, Player, PlayerId, ProductionItem, TileKey, Unit, UnitId } from './state.js';
import { BARBARIAN_ID, BARBARIANS, CULTURE, TERRAINS, unitType, building, BUILDINGS, HUT_REWARDS, RESOURCES, isWaterTerrain, isSpyUnit } from './data.js';
import { tileYield, workRadiusOf, tileWorkable } from './economy.js';
import { combatRound, effectiveStrength } from './combat.js';
import { computeVisibleTiles, recomputeVision } from './fog.js';
import {
  canEnterTerrain,
  cargoCapacityOf,
  citySiteIsCoastal,
  isCoastalCityHex,
  navalSupportFor,
} from './naval.js';
import {
  ARMY_SIZE,
  CITY_WORK_RADIUS,
  EXCHANGES_PER_ATTACK,
  FORTIFY_DEFENSE_BONUS,
  MIN_CITY_DISTANCE,
  POP_PRODUCTION_BONUS,
  RANGED_RANGE,
  SETTLER_BOOTY_GOLD,
  VILLAGE_DESTRUCTION_GOLD,
} from './constants.js';
import type { DestructionCause, GameEvent, HutReward } from './events.js';
import { creditScience } from './research.js';
import { conversionGains, CONVERSION_DEFAULT, goldMultOf, scienceMultOf } from './conversion.js';
import { WONDERS, TECHS, canSetProduction, buildingCostDiscount, isUnitObsolete, unitReplacementFor } from './techs.js';
import type { WonderData } from './types.js';
import {
  cultureGains,
  greatPersonThresholdFor,
  isWonderObsolete,
  greatPersonClassFor,
  settledGpMultiplier,
  settledGpCostFactor,
  settledGreatPersonsOfCities,
  installedGreatPersonsOf,
  isGreatPersonType,
  leaderGpVictoriesNeeded,
  wonderProductionIssue,
  wonderAttackBonusEmpireOf,
  wonderBlocksEnemyAttacks,
  wondersOwnedBy,
  yieldGpThresholdFor,
  cityGoldMultOf,
  empireGoldMultOf,
  militaryCostMultOf,
  YIELD_GP_TYPES,
} from './culture.js';
import type { YieldGreatPersonType } from './culture.js';
import { effectsFor, isInAnarchy, landCombatBonus, populationCostOf } from './governments.js';
// 7i · R-63 rév. (D1/D2), R-60bis (D4), R-64 rév. (D3) — croissance CivRev.
import {
  GROWTH,
  foundingPopForEra,
  growthThresholdFor,
  interiorCitizenFor,
  interiorCountOf,
  populationCap,
} from './growth.js';
import { applyFirstToDiscover, empirePerCityBonus } from './firstDiscovery.js';
// 7l · R-134..R-137 — or & trésorerie (données economy.json, helpers purs partagés).
import {
  ECONOMY,
  productionItemCostOf,
  rushBuyCostOf,
  treasuryInterestOf,
  nextEconomyMilestone,
  milestoneTechFor,
  explorerGoldInjectionForEra,
} from './economyOr.js';
// 7m · R-138..R-144 — nucléaire & espionnage (données espionnage.json, helpers purs partagés).
import {
  stolenGoldAmount,
  spyDuelWinChance,
  nukeCulturePenalty,
  destroyBuildingGoldOf,
  destroyBuildingSuccessChance,
} from './espionnage.js';
import {
  activeTraitsOf,
  civBuildingProductionMultOf,
  civBuildingScienceOf,
  civCommerceCaptureMultOf,
  civEmpireGoldMultOf,
  civGpThresholdMultOf,
  civGrowthReductionOf,
  civHealAfterVictory,
  civHutGoldMultOf,
  civNavalAttackBonusOf,
  civOverrunRatioOf,
  civUnitStatBonusOf,
  civToutesRessources,
  civVeteranUnitsOf,
  civVillagesBecomeCities,
  civDataOf,
  civIdOf,
  eraIndexOf,
  eraOfPlayer,
  eraOfTechCount,
  foundingPopBonusOf,
  traitEntriesOf,
  uniqueReplacing,
} from './civilizations.js';
import { resourceAccessible } from './resources.js';
import {
  barbarianOrders,
  barbarianUnitType,
  createBarbarianUnit,
  drawHutReward,
  freeSpawnTiles,
} from './barbares.js';
// 7o · R-151..R-156 — artefacts (reliques) : activation Phase A + effets.
import { activateArtefactAt, applyArtefactIndiceReward } from './artefacts.js';
import type { ArtefactActivationContext } from './artefacts.js';

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

/**
 * Entités de carte posées sur une case. 7g · R-117 : les unités EMBARQUÉES
 * (`aboard`) ne sont plus des entités de carte — elles n'occupent pas, ne
 * bloquent pas, ne défendent pas et ne sont jamais ciblées.
 */
function occupants(board: Board, hex: Hex, except?: UnitId): Unit[] {
  const out: Unit[] = [];
  for (const id of sortUnitIds(board)) {
    const u = board.st.units[id]!;
    if (id !== except && u.aboard === null && u.q === hex.q && u.r === hex.r) out.push(u);
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
  // 7n · R-149 (trait Mongol `villagesVilles`) : le village barbare assimilé
  // DEVIENT une ville pop 1 — la hutte ouverte par un Mongol fonde une ville
  // AU LIEU de la récompense tirée (tranche du handoff 🔶). Si la fondation
  // est illégale (ville sur la case, distance T-09, terrain non praticable),
  // la récompense normale s'applique à la place.
  if (civVillagesBecomeCities(player)) {
    const legal =
      !cityAt(board, hex) &&
      TERRAINS[board.st.map[tileKeyOf(hex)]?.terrain ?? 'eau']!.passable &&
      !Object.values(board.st.cities).some((c) => hexDistance(c, hex) < MIN_CITY_DISTANCE);
    if (legal) {
      const ownerHasCity = Object.values(board.st.cities).some((c) => c.owner === opener.owner);
      const cityId = nextId(board.st.cities, 'c');
      board.st.cities[cityId] = {
        id: cityId,
        q: hex.q,
        r: hex.r,
        owner: opener.owner,
        pop: 1,
        capital: !ownerHasCity,
        foodStored: 0,
        production: null,
        workedTiles: [],
        buildings: !ownerHasCity ? ['palais'] : [],
        conversion: CONVERSION_DEFAULT,
        cultureStored: 0,
        wonders: [],
        gpAccumGold: 0,
        gpAccumScience: 0,
        gpAccumProd: 0,
        gpAccumFood: 0,
        pendingSalvage: 0,
        settledGreatPersons: [],
        wasCaptured: false,
      };
      board.st.map[tileKeyOf(hex)] = { terrain: 'ville', resource: null };
      board.pendingFill.add(cityId);
      emit(board, {
        type: 'HutOpened',
        hutId: hut.id,
        byPlayer: opener.owner,
        byUnitId: opener.id,
        at: { q: hut.q, r: hut.r },
        reward: { kind: 'nothing' }, // la ville EST la récompense (assimilation)
      });
      emit(board, {
        type: 'CityFounded',
        cityId,
        owner: opener.owner,
        at: hex,
        capital: !ownerHasCity,
        byUnitId: opener.id,
      });
      return;
    }
  }
  const reward: HutReward = drawHutReward(board.rng);

  switch (reward.kind) {
    case 'gold':
      // 7n · R-149 (trait Espagnol `tresorsDouble`) : l'or des trésors est
      // doublé (les artefacts sont une phase suivante — mapping 🔶).
      player.treasury += reward.amount * civHutGoldMultOf(player);
      break;
    case 'unit': {
      // Unité gratuite pour l'ouvreur : case adjacente libre (hors
      // village/ville) — perdue si aucune case (interprétation documentée, R-98).
      // 7n · R-148/R-149 : remplacement par l'unique de la civ (un Zoulou
      // reçoit un Impi) + vétérans de trait + bonus de mouvement.
      const tile = freeSpawnTiles(board.st, hut, 1)[0];
      if (tile) {
        const effectiveType = effectiveUnitTypeFor(board.st, opener.owner, HUT_REWARDS.freeUnit);
        const stats = unitType(effectiveType);
        const unitId = nextId(board.st.units, 'u');
        board.st.units[unitId] = {
          id: unitId,
          type: effectiveType,
          owner: opener.owner,
          q: tile.q,
          r: tile.r,
          hp: stats.hpMax,
          mp: maxMovementOf(board.st, opener.owner, effectiveType),
          veteran: civVeteranUnitsOf(player).has(HUT_REWARDS.freeUnit) || civVeteranUnitsOf(player).has(effectiveType),
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          aboard: null,
          cargo: null,
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
    case 'artefact_indice':
      // 7o · R-155 : indice artefact — nombre restant OU position (RNG 50/50,
      // table huttes.json) ; la position est révélée par l'application.
      {
        const hint = applyArtefactIndiceReward(board.st, opener.owner, hut, board.rng);
        reward.remaining = hint.remaining;
        if (hint.position) reward.position = hint.position;
      }
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

/**
 * 7o · R-153 : contexte d'activation des artefacts (Board → artefacts.ts) —
 * l'émission (seq) et les aides de spawn restent liées au Board de résolution.
 */
function artefactCtxOf(board: Board): ArtefactActivationContext {
  return {
    st: board.st,
    emit: (event) => emit(board, event),
    freeSpawnTile: (center) => freeSpawnTiles(board.st, center, 1)[0] ?? null,
    occupiedByUnit: (hex) => occupants(board, hex).length > 0,
  };
}

function inMapAndPassable(board: Board, hex: Hex): boolean {
  if (!inRectangle(hex, board.st.mapWidth, board.st.mapHeight)) return false;
  const tile = board.st.map[tileKeyOf(hex)];
  return !!tile && TERRAINS[tile.terrain]!.passable;
}

/**
 * 7g · R-117 : l'unité peut-elle ENTRER sur cette case (terrain seul) ?
 * Terrestre : terrain passable (T-11 inchangé). Navale : eau selon sa classe
 * (`navalAccess` — côte vs océan, R-107) ou ville portuaire (côtière). */
function canEnter(board: Board, unit: Unit, hex: Hex): boolean {
  if (!inRectangle(hex, board.st.mapWidth, board.st.mapHeight)) return false;
  const tile = board.st.map[tileKeyOf(hex)];
  if (!tile) return false;
  return canEnterTerrain(unitType(unit.type), tile.terrain, isCoastalCityHex(board.st.map, hex));
}

function isPeaceful(unit: Unit): boolean {
  return !unitType(unit.type).canAttack;
}

function isRanged(unit: Unit): boolean {
  return unitType(unit.type).isRanged;
}

/**
 * 7n · R-148 : type EFFECTIF d'une unité produite pour un joueur — l'unité
 * unique de sa civ qui remplace le type standard (null → type inchangé).
 */
function effectiveUnitTypeFor(state: GameState, owner: PlayerId, typeId: string): string {
  const player = state.players[owner];
  return uniqueReplacing(civIdOf(player), typeId, player?.techsUnlocked ?? []) ?? typeId;
}

/**
 * 7n · R-149 : PM MAX d'une unité — mouvement du type + bonus civilisationnel
 * (Mongols cavalerie, Zoulous guerriers/Impi, Égypte/France fusiliers). La
 * régénération Phase D (R-72) et toutes les créations d'unités y passent.
 */
function maxMovementOf(state: GameState, owner: PlayerId, typeId: string): number {
  return unitType(typeId).movement + civUnitStatBonusOf(state.players[owner], 'unitMovement', typeId);
}

/**
 * 7n · R-149 : l'unité produite de ce type sort-elle VÉTÉRANE (Caserne R-89,
 * Leader installé R-126, ou trait civilisationnel « Guerriers vétérans » —
 * Allemagne) ?
 */
function producedVeteranOf(state: GameState, owner: PlayerId, city: City, typeId: string, canAttack: boolean): boolean {
  if (!canAttack) return false; // R-89 : hors pacifiques
  if (hasBuilding(city, 'caserne') || settledGpMultiplier(city, 'leader') > 1) return true;
  const player = state.players[owner];
  return civVeteranUnitsOf(player).has(typeId);
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
  // 7g · R-117 : la cargaison miroite la position de son transport (aucun
  // événement propre — elle n'est plus une entité de carte).
  if (unit.cargo) {
    const cargo = board.st.units[unit.cargo];
    if (cargo) {
      cargo.q = to.q;
      cargo.r = to.r;
    }
  }
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
  // case d'origine, puis (q, r) croissant (R-54-2). 7g · R-117 : la
  // praticabilité est évaluée pour l'unité elle-même (un naval se replie en
  // mer, un terrestre sur la terre).
  const candidates = neighbors(combatTile)
    .filter((h) => canEnter(board, loser, h))
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
  // 7g · R-117 : la destruction d'un transport entraîne celle de sa cargaison
  // (naufrage — la position miroir fait que l'événement tombe sur la même case).
  if (unit.cargo) {
    const cargo = board.st.units[unit.cargo];
    if (cargo) kill(board, cargo, 'sunk', byUnitId);
  }
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
    // 7m · R-43/R-142 🔶 : un ESPION capturé ne rapporte rien non plus.
    if (board.st.players[byPlayer] && !unitType(victim.type).spy) {
      board.st.players[byPlayer]!.treasury += SETTLER_BOOTY_GOLD;
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
/** R-32/R-123 : un coup fatal signé = 1 victoire de combat de l'empire (T-31). */
function recordCombatVictory(board: Board, winner: Unit): void {
  const player = board.st.players[winner.owner];
  if (player) player.combatVictories += 1;
  // 7n · R-149 (trait Aztèque `soinVictoire`) : l'unité se soigne
  // AUTOMATIQUEMENT après une victoire — PV rendus au maximum 🔶.
  if (civHealAfterVictory(player)) {
    winner.hp = unitType(winner.type).hpMax;
  }
}

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
 * Forces effectives (S_att/S_def) d'un échange — facteur unique partagé par
 * l'échange (R-51) et l'ÉCRASEMENT (7n · R-149 : Overrun, canon CivRev).
 */
function combatStrengthsOf(
  board: Board,
  attacker: Unit,
  defender: Unit,
  combatTile: Hex,
): { sAtt: number; sDef: number; sAttBase: number } {
  const aStats = unitType(attacker.type);
  const dStats = unitType(defender.type);
  // 7g · R-118 : soutien naval — un combat terrestre adjacent à la côte avec
  // une unité navale AMIE en mer reçoit son `navalSupport` en force d'attaque
  // (MAX d'un seul navire — décision d'Erik : s'ajoute à S_att).
  const support = navalSupportFor(board.st.map, aStats, attacker.owner, combatTile, (h) => {
    const u = occupants(board, h)[0];
    return u ? { owner: u.owner, type: u.type, q: u.q, r: u.r, aboard: u.aboard } : undefined;
  });
  // 7h · R-122 : aucun bonus de régime/merveille pendant l'Anarchie.
  // 7h · R-125 : Himeji (+1 Attaque à toutes les unités de l'empire) —
  // tant que la merveille n'est pas obsolète (Communisme, R-110).
  // 7h · R-121 : Fondamentalisme (+1 Attaque aux unités TERRESTRES).
  // R-95 : les barbares ne sont pas dans `players` — aucun bonus de régime.
  // 7k · M1/R-128 : l'obsolescence des merveilles est GLOBALE — l'union des
  // technologies de toutes les civilisations fait foi.
  const allTechs = allKnownTechs(board.st);
  const attPlayer = board.st.players[attacker.owner];
  const defPlayer = board.st.players[defender.owner];
  const attAnarchy = attPlayer ? isInAnarchy(attPlayer, board.st.turn) : true;
  const defAnarchy = defPlayer ? isInAnarchy(defPlayer, board.st.turn) : true;
  // 7n · R-149 : bonus de stats civilisationnels — unitAttack par TYPE
  // (Arabie cavaliers/chevaliers, France canons, Japon samouraïs) et
  // navalAttack pour les unités navales (Angleterre/Espagne). S'ajoutent à
  // la force de base (indépendants de l'Anarchie — traits, pas régimes).
  const sAttBase =
    effectiveStrength(
      aStats.attack +
        civUnitStatBonusOf(attPlayer, 'unitAttack', attacker.type) +
        (aStats.aquatic ? civNavalAttackBonusOf(attPlayer) : 0),
      attacker.veteran,
    );
  const sAtt =
    sAttBase +
    support +
    (attPlayer && !attAnarchy
      ? wonderAttackBonusEmpireOf(Object.values(board.st.cities), attacker.owner, allTechs) +
        landCombatBonus(effectsFor(attPlayer), aStats, 'attack')
      : 0);
  // T-17 : le bonus de fortification s'ajoute au bonus de terrain (RULES.md §7.4).
  // 7e : le bonus de défense de ville des bâtiments (Palais, Remparts) s'ajoute
  // pour le défenseur en garnison de SA ville. 7h · R-121 : Fondamentalisme
  // (+1 Défense aux unités terrestres). 7n · R-149 : unitDefense par TYPE
  // (Angleterre archers à long arc).
  const sDef = effectiveStrength(
    dStats.defense + civUnitStatBonusOf(defPlayer, 'unitDefense', defender.type),
    defender.veteran,
    terrainDefenseBonus(board, combatTile) +
      (defender.fortified ? FORTIFY_DEFENSE_BONUS : 0) +
      cityBuildingDefenseBonus(board, combatTile, defender.owner),
  ) + (defPlayer && !defAnarchy ? landCombatBonus(effectsFor(defPlayer), dStats, 'defense') : 0);
  return { sAtt, sDef, sAttBase };
}

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
  const { sAtt, sDef } = combatStrengthsOf(board, attacker, defender, combatTile);
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

/**
 * Avancée du vainqueur (R-52/I-2) — jamais pour une unité à distance (R-59-a).
 * 7g · R-117 (interprétation documentée) : pas d'avancée non plus sur une
 * case que le vainqueur ne peut pas ENTRER (un terrestre qui coule un navire
 * en mer reste sur sa rive ; un naval ne débarque pas en tuant le défenseur
 * d'une ville non portuaire).
 */
function advanceIfMelee(board: Board, attacker: Unit, tile: Hex): void {
  if (isRanged(attacker)) return;
  if (!canEnter(board, attacker, tile)) return;
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
      recordCombatVictory(board, attacker); // 7h · R-123 (T-31)
      if (advanceOnKill) advanceIfMelee(board, attacker, combatTile);
      return;
    }
    if (attacker.hp <= 0) {
      kill(board, attacker, 'combat', defender.id);
      defender.veteran = true; // R-32
      recordCombatVictory(board, defender); // 7h · R-123 (T-31)
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
  // 7n · R-149 · ÉCRASEMENT (Overrun — canon CivRev, mécanique ajoutée au
  // combat §7) : si la force d'attaque atteint `ratio` × la force défensive
  // (base canon 6 ; trait Zoulou 4), le défenseur est DÉTRUIT INSTANTANÉMENT
  // — aucun round R-51. Mêlée uniquement (jamais pour un attaquant à distance,
  // R-59-a — pas d'avancée, pas de contact de ce type).
  if (!isRanged(attacker)) {
    const { sAttBase, sDef } = combatStrengthsOf(board, attacker, defender, combatTile);
    // 🔶 sDef > 0 exigé : le ratio est indéfini contre une défense nulle
    // (aucune unité réelle n'a 0 défense — les unités pacifiques sont capturées).
    if (sAttBase > 0 && sDef > 0 && sAttBase >= sDef * civOverrunRatioOf(board.st.players[attacker.owner])) {
      defender.hp = 0;
      emit(board, { type: 'Attack', attackerId: attacker.id, defenderId: defender.id, at: combatTile });
      emit(board, {
        type: 'CombatExchange',
        attackerId: attacker.id,
        defenderId: defender.id,
        at: combatTile,
        attackerHpAfter: attacker.hp,
        defenderHpAfter: 0,
      });
      kill(board, defender, 'combat', attacker.id);
      attacker.veteran = true; // R-32
      recordCombatVictory(board, attacker); // 7h · R-123 (T-31) + soin Aztèque
      advanceIfMelee(board, attacker, combatTile);
      return;
    }
  }
  performExchange(board, attacker, defender, combatTile);
  if (defender.hp <= 0) {
    kill(board, defender, 'combat', attacker.id);
    attacker.veteran = true; // R-32
    recordCombatVictory(board, attacker); // 7h · R-123 (T-31)
    advanceIfMelee(board, attacker, combatTile);
    return;
  }
  if (attacker.hp <= 0) {
    kill(board, attacker, 'combat', defender.id);
    defender.veteran = true; // R-32
    recordCombatVictory(board, defender); // 7h · R-123 (T-31)
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
    board.st.players[byPlayer]!.treasury += VILLAGE_DESTRUCTION_GOLD;
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
    recordCombatVictory(board, attacker); // 7h · R-123 (T-31)
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
      recordCombatVictory(board, attacker); // 7h · R-123 (T-31)
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
    if (enemy.owner === unit.owner || enemy.aboard) continue; // 7g : une cargaison n'est pas une entité de carte
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

    // 7g · R-117 : unité EMBARQUÉE — débarquement. Le premier pas doit être
    // une case TERRESTRE libre adjacente au transport ; l'unité poursuit
    // ensuite normalement (le reste du chemin suit les règles R-42).
    if (unit.aboard) {
      const transport = board.st.units[unit.aboard];
      if (!transport) {
        // Sécurité (le naufrage coule toujours sa cargaison) : plus à bord.
        unit.aboard = null;
        continue;
      }
      const dismountable =
        hexDistance(transport, next) === 1 &&
        canEnter(board, unit, next) &&
        occupants(board, next).length === 0;
      if (unit.mp > 0 && dismountable) {
        path.shift();
        unit.mp -= 1;
        transport.cargo = null;
        unit.aboard = null;
        unit.q = next.q;
        unit.r = next.r;
        board.steps.set(unit.id, (board.steps.get(unit.id) ?? 0) + 1);
        board.moved.add(unit.id);
        emit(board, {
          type: 'Disembark',
          unitId: unit.id,
          owner: unit.owner,
          transportId: transport.id,
          at: { ...next },
        });
        continue; // la suite du chemin suit les règles normales (attaque incluse)
      }
      path = []; // débarquement impossible : chemin effacé, l'unité reste à bord
      break;
    }

    // 7g · R-117 : EMBARQUEMENT — pas d'une unité terrestre vers un transport
    // ami à cargaison libre (Galère/Galion : 1 unité — décision d'Erik).
    if (unit.mp > 0 && !unitType(unit.type).aquatic) {
      const transport = occupants(board, next).find(
        (u) => u.owner === unit.owner && u.cargo === null && cargoCapacityOf(u) > 0,
      );
      if (transport) {
        path.shift();
        unit.mp -= 1;
        transport.cargo = unit.id;
        unit.aboard = transport.id;
        unit.q = transport.q;
        unit.r = transport.r;
        board.steps.set(unit.id, (board.steps.get(unit.id) ?? 0) + 1);
        board.moved.add(unit.id);
        emit(board, {
          type: 'Embark',
          unitId: unit.id,
          owner: unit.owner,
          transportId: transport.id,
          at: { q: transport.q, r: transport.r },
        });
        continue; // le reste du chemin (gelé) servira au débarquement du tour suivant
      }
    }

    if (!canEnter(board, unit, next)) {
      path = []; // R-42 : chemin invalide (pour cette unité — l'eau est navale, R-117), l'unité s'arrête
      break;
    }
    const here = occupants(board, next);
    if (here.length === 0) {
      // 7k · R-132 · Grande Muraille (décision d'Erik du 04/09, validée) :
      // entrer sur une ville ennemie NON défendue serait une capture — c'est
      // une « attaque de la ville » : bloquée tant que la merveille est debout
      // (l'unité s'arrête, le chemin reste gelé — repris au tour suivant).
      // 7m · R-140 🔶 : la Muraille n'arrête ni l'ICBM (arme stratégique, hors
      // mouvement) ni l'INFLILTRATION d'un espion (l'espion n'attaque pas —
      // R-143 ; il ne capture pas la ville).
      const cityHere = cityAt(board, next);
      if (
        cityHere &&
        cityHere.owner !== unit.owner &&
        !isSpyUnit(unit) &&
        wonderBlocksEnemyAttacks(Object.values(board.st.cities), cityHere.owner, allKnownTechs(board.st))
      ) {
        break;
      }
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
        activateArtefactAt(artefactCtxOf(board), unit, next); // 7o · R-153
        board.planned.push({ kind: 'villageAttack', at: next, attackerId: unit.id, villageId: village.id });
        break;
      }
      // R-40 : mouvement garanti vers une case vide.
      path.shift();
      unit.mp -= 1;
      moveUnit(board, unit, next);
      openHutAt(board, next, unit); // R-98 : ouverture à l'entrée (Phase A)
      activateArtefactAt(artefactCtxOf(board), unit, next); // 7o · R-153 : entrée sur la case / Atlantide adjacente
      continue;
    }
    // 7m · R-143 · INFILTRATION : un espion ENTRE dans une ville (amie :
    // garnison — contre-espionnage R-144 ; ennemie : infiltration) SANS combat
    // NI capture (exceptions R-43/R-57/R-65). R-30 (amendée 7m) : UN espion
    // par propriétaire et par ville — un second espion du même propriétaire
    // est bloqué. Le pas se termine dans la ville (le reste du chemin est
    // abandonné — miroir R-42 cas 2).
    const cityHere = cityAt(board, next);
    if (cityHere && isSpyUnit(unit)) {
      // R-30 (amendée 7m) : un seul espion par propriétaire et par ville —
      // sauf co-location transitoire entre membres désignés d'un même
      // FormArmy (R-44, miroir de la branche amie : un Réseau d'espions peut
      // se former dans une ville).
      const group = board.formGroups.get(unit.id);
      const coLocationLegale = !!group && here.every((u) => group.members.includes(u.id));
      if (here.some((u) => u.owner === unit.owner && isSpyUnit(u)) && !coLocationLegale) break;
      path = [];
      unit.mp -= 1;
      moveUnit(board, unit, next);
      break;
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
      activateArtefactAt(artefactCtxOf(board), unit, next); // 7o · R-153
      continue;
    }
    // Occupants ennemis.
    // 7m · R-142 : un espion HORS VILLE est éliminé SANS COMBAT par une unité
    // militaire ennemie qui entre sur sa case (aucun butin 🔶) — le reste du
    // chemin est abandonné (miroir R-42 cas 2). Une MIXITÉ transitoire
    // (espion + militaire, co-location interne) suit le chemin normal.
    if (!cityHere && !isPeaceful(unit) && here.every((u) => u.owner !== unit.owner && isSpyUnit(u))) {
      for (const spy of here) {
        if (board.st.units[spy.id]) kill(board, spy, 'capture', unit.id);
      }
      path = [];
      unit.mp -= 1;
      moveUnit(board, unit, next);
      break;
    }
    // 7m · R-142 : DANS une ville, l'espion est à l'abri et ne défend pas —
    // une unité militaire qui entre sur une ville dont tous les occupants
    // ennemis sont des espions n'y planifie AUCUN combat (la capture se
    // résout en Phase C, R-65 ; la garnison espionne survit et devient
    // infiltrée dans la ville capturée).
    if (cityHere && here.every((u) => u.owner !== unit.owner && isSpyUnit(u))) {
      if (wonderBlocksEnemyAttacks(Object.values(board.st.cities), here[0]!.owner, allKnownTechs(board.st))) break;
      path = [];
      unit.mp -= 1;
      moveUnit(board, unit, next);
      break;
    }
    if (isPeaceful(unit)) {
      // R-43 : le pacifique qui aboutit sur un ennemi est capturé (v1 : butin).
      capturePeaceful(board, unit, here[0]!.owner, null);
      path = [];
      break;
    }
    // 7k · R-132 · Grande Muraille : attaquer une unité d'un empire protégé
    // est impossible — l'unité s'arrête devant le défenseur, chemin gelé
    // (l'attaque n'entre jamais, aucun PM consommé, pas de combat planifié).
    if (wonderBlocksEnemyAttacks(Object.values(board.st.cities), here[0]!.owner, allKnownTechs(board.st))) {
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
    activateArtefactAt(artefactCtxOf(board), unit, next); // 7o · R-153
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
      aboard: null,
      cargo: null, // R-117 : une armée ne transporte rien
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
    .map(({ key, hex }) => ({ key, hex, y: tileYield(board.st.map, city.buildings, key, techs, city.wonders)! }))
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
 * 7f · R-116 (rév. 7k · R-129) : validation d'EMPIRE/MONDE d'une production de
 * merveille — complète `canSetProduction` (tech/implémentation du joueur) avec
 * l'état complet : EXCLUSIVITÉ MONDIALE (bâtie par n'importe quelle civ ⇒
 * refus, M2), unicité de chantier d'empire, jalons des Nations Unies.
 * 7k · M1/R-128 : l'obsolescence est évaluée sur l'UNION des techs de toutes
 * les civilisations ; le prérequis `tech`, sur les seules techs du joueur.
 * `excludeCityId` : la ville qui (re)fait la demande n'est pas comptée comme
 * « déjà en chantier » (re-soumission du même choix).
 */
function wonderSetProductionIssue(st: GameState, wonderId: string, playerId: PlayerId, excludeCityId: CityId): string | null {
  const empireWondersBuilt: string[] = [];
  const empireWondersInProduction: string[] = [];
  const worldWondersBuilt = new Set<string>();
  for (const id of Object.keys(st.cities).sort()) {
    const c = st.cities[id]!;
    for (const w of c.wonders) worldWondersBuilt.add(w); // toutes civilisations (R-129)
    if (c.owner !== playerId) continue;
    empireWondersBuilt.push(...[...c.wonders].sort());
    if (id !== excludeCityId && c.production?.item.kind === 'wonder') empireWondersInProduction.push(c.production.item.id);
  }
  const player = st.players[playerId]!;
  return wonderProductionIssue(wonderId, {
    techsUnlocked: player.techsUnlocked,
    allTechsUnlocked: allKnownTechs(st),
    worldWondersBuilt: [...worldWondersBuilt].sort(),
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
      if (productionItemCostOf(board.st, playerId, order.item) === null) continue;
      // R-87 (étendue 7e) : item verrouillé refusé — tech non débloquée, non
      // implémenté, unité OBSOLÈTE, GP (R-114), bâtiment fixe (Palais),
      // prérequis de bâtiment manquant (Banque sans Marché) ou déjà possédé.
      // 7n · R-148 : une unité standard remplacée par l'unique disponible de
      // la civ est refusée (le menu propose l'unique — pattern R-111).
      const research = board.st.players[playerId]!;
      if (!canSetProduction(order.item, research.techsUnlocked, city.buildings, civIdOf(research))) continue;
      // 7g · R-117 : une unité navale exige une ville côtière (accès à la mer).
      // 7n · R-148 : la validation porte sur le type EFFECTIF (l'unique).
      const effectiveItem = unitReplacementFor(order.item, civIdOf(research), research.techsUnlocked) ?? order.item.id;
      if (
        order.item.kind === 'unit' &&
        unitType(effectiveItem).aquatic &&
        !citySiteIsCoastal(board.st.map, { q: city.q, r: city.r })
      ) {
        continue;
      }
      // 7f · R-116 : unicité d'empire des merveilles + verrou/jalons de l'ONU.
      if (order.item.kind === 'wonder' && wonderSetProductionIssue(board.st, order.item.id, playerId, city.id)) continue;
      setOrders.push(order);
    }
  }
  setOrders.sort((a, b) => compareCityIds(a.cityId, b.cityId));
  for (const order of setOrders) {
    const city = board.st.cities[order.cityId]!;
    // 7l · C7 · R-130 (rév.) : la réserve de marteaux est PERMANENTE et
    // n'est plus absorbée à la pose du projet — elle finance le projet en
    // Phase C (R-130 rév.) jusqu'à épuisement. La progression CONSERVÉE
    // (R-62) reste celle du projet précédent.
    // 7l · R-135 · Hammer banking proscrit (canon) : basculer d'une merveille
    // vers une merveille de VICTOIRE (ONU / Banque mondiale) réinitialise les
    // marteaux accumulés à 0 (les autres basculements conservent — R-62).
    const previous = city.production;
    let progress = previous?.progress ?? 0;
    if (
      previous?.item.kind === 'wonder' &&
      order.item.kind === 'wonder' &&
      (WONDERS[order.item.id]?.cultureVictory === true || WONDERS[order.item.id]?.economicVictory === true)
    ) {
      progress = 0;
    }
    city.production = { item: order.item, progress };
  }
}

/**
 * 7l · R-135 · RushBuy — achat instantané de la production COURANTE d'une
 * ville : coût en or = marteaux restants × facteur d'ère × hook trait
 * (`rushBuyCostOf` — pur, source unique UI), débité de la trésorerie (R-134),
 * puis complétion immédiate (les événements usuels suivent). Validations :
 * ville possédée, production en cours, item éligible (INTERDITS : Banque
 * mondiale et ONU — R-135), trésorerie suffisante, pose possible (unité :
 * case de ville libre + coût pop R-112 ; merveille : non bâtie ailleurs —
 * R-129). Sinon l'ordre est ignoré (aucun débit). Un seul rush par ville et
 * par tour (le serveur remplace l'ordre de même sujet ; dédoublonnage ici).
 * La réserve de marteaux (C7) n'entre ni dans le coût ni dans la
 * complétion : ce sont des MARTEAUX, pas de l'or (interaction R-135/R-130).
 */
function applyRushBuys(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'RushBuy' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'RushBuy') continue;
      const city = board.st.cities[order.cityId];
      if (!city || city.owner !== playerId) continue;
      if (orders.some((o) => o.cityId === order.cityId)) continue; // 1 seul rush/ville/tour
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareCityIds(a.cityId, b.cityId));
  for (const order of orders) {
    const city = board.st.cities[order.cityId]!;
    if (!city.production) continue; // aucune production : rien à acheter
    const item = city.production.item;
    const cost = rushBuyCostOf(board.st, city);
    if (cost === null) continue; // interdit (ONU/Banque mondiale) ou item inconnu
    const player = board.st.players[city.owner]!;
    if (player.treasury < cost) continue; // trésorerie insuffisante
    // Éligibilité de POSE (avant tout débit — l'ordre est ignoré sinon).
    if (item.kind === 'unit') {
      const stats = unitType(item.id);
      const popCost = populationCostOf(stats.populationCost ?? 0, player);
      if (city.pop < Math.max(1, popCost)) continue; // pop insuffisante (R-112)
      if (occupiedByUnit(board, { q: city.q, r: city.r })) continue; // en attente
    } else if (item.kind === 'wonder') {
      const builtAnywhere = Object.values(board.st.cities).some((c) => c.wonders.includes(item.id));
      if (builtAnywhere) continue; // exclusivité mondiale (R-129)
    }
    player.treasury -= cost;
    emit(board, {
      type: 'RushBuy',
      cityId: city.id,
      owner: city.owner,
      item: { ...item },
      cost,
      at: { q: city.q, r: city.r },
    });
    completeProductionNow(board, city);
  }
}

/**
 * 7l · Complétion IMMÉDIATE de la production courante d'une ville (rush-buy
 * R-135 et réserve non répétable C7) — unité posée sur la case de ville,
 * bâtiment ajouté (remplacement R-111), merveille via la complétion
 * canonique (R-129/R-130/R-131 + effets). La file est vidée (R-62).
 */
function completeProductionNow(board: Board, city: City): void {
  const prod = city.production;
  if (!prod) return;
  const item = prod.item;
  city.production = null;
  if (item.kind === 'unit') {
    // 7n · R-148 : l'unité produite est remplacée par l'unique de la civ.
    const effectiveType = effectiveUnitTypeFor(board.st, city.owner, item.id);
    const stats = unitType(effectiveType);
    const player = board.st.players[city.owner]!;
    const popCost = populationCostOf(stats.populationCost ?? 0, player);
    if (popCost > 0) {
      city.pop = Math.max(1, city.pop - popCost);
      city.workedTiles = city.workedTiles.slice(0, city.pop);
      emit(board, {
        type: 'PopulationConsumed',
        cityId: city.id,
        owner: city.owner,
        pop: city.pop,
        byUnitType: stats.id,
        at: { q: city.q, r: city.r },
      });
    }
    const unitId = nextId(board.st.units, 'u');
    board.st.units[unitId] = {
      id: unitId,
      type: effectiveType,
      owner: city.owner,
      q: city.q,
      r: city.r,
      hp: stats.hpMax,
      mp: maxMovementOf(board.st, city.owner, effectiveType),
      // R-89 + 7j · R-126 + 7n · R-149 (Guerriers vétérans Allemagne) : Caserne,
      // Leader installé ou trait → vétéran.
      veteran: producedVeteranOf(board.st, city.owner, city, effectiveType, stats.canAttack),
      isArmy: false,
      order: null,
      detainedBy: null,
      fortified: false,
      aboard: null,
      cargo: null,
    };
    emit(board, { type: 'UnitProduced', unitId, cityId: city.id, owner: city.owner, unitType: effectiveType, at: { q: city.q, r: city.r } });
  } else if (item.kind === 'wonder') {
    // La complétion canonique lit `city.production.progress` pour la
    // récupération éventuelle : à un rush, le projet est payé — la file est
    // déjà vidée, aucun surplus à basculer (progression 0 par construction).
    completeWonder(board, city, item.id);
  } else {
    grantBuildingToCity(board, city, item.id);
  }
}

/**
 * 7l · R-136 · Ajout d'un bâtiment GRATUIT à une ville (paliers économiques)
 * — mêmes règles que la production (R-66 : non duplicable — saute si déjà
 * construit ; remplacement R-111) ; Tribunal : réassignation immédiate.
 */
function grantBuildingToCity(board: Board, city: City, buildingId: string): void {
  if (hasBuilding(city, buildingId)) return; // R-66 : déjà dotée
  const replaced = BUILDINGS[buildingId]?.replaces;
  if (replaced && hasBuilding(city, replaced)) {
    city.buildings = city.buildings.filter((b) => b !== replaced);
  }
  city.buildings.push(buildingId);
  city.buildings.sort();
  if ((BUILDINGS[buildingId]?.workRadiusBonus ?? 0) > 0) {
    // Tribunal : le rayon s'élargit — les citoyens intérieurs redeviennent
    // travailleurs de terrain (miroir production, R-60bis).
    const taken = takenTilesExcluding(board, city.id);
    fillWorkedTiles(board, city, taken);
  }
  emit(board, {
    type: 'BuildingCompleted',
    cityId: city.id,
    owner: city.owner,
    building: buildingId,
    at: { q: city.q, r: city.r },
  });
}

/**
 * 7l · C7 · R-130 (rév.) · Production d'une unité DEPUIS LA RÉSERVE de
 * marteaux (projet répétable — produit autant de fois que la réserve le
 * permet) OU complétion normale de la file. Pose : case de ville ;
 * `allowAdjacent` (production en série C7 uniquement) : les unités suivantes
 * passent sur une case adjacente libre (sinon la série s'arrête — R-30 rend
 * la case de ville unique). Coût pop R-112 (République : 1 — R-121).
 * Retourne false si la pose est impossible (la réserve subsiste / en attente).
 */
function produceUnitFromReserve(board: Board, city: City, unitTypeId: string, allowAdjacent: boolean): boolean {
  // 7n · R-148 : la réserve produit l'UNIQUE de la civ si le type est remplacé.
  const effectiveType = effectiveUnitTypeFor(board.st, city.owner, unitTypeId);
  const stats = unitType(effectiveType);
  const player = board.st.players[city.owner]!;
  const popCost = populationCostOf(stats.populationCost ?? 0, player);
  if (city.pop < Math.max(1, popCost)) return false;
  const cityHex = { q: city.q, r: city.r };
  const spot = !occupiedByUnit(board, cityHex)
    ? cityHex
    : allowAdjacent
      ? (freeSpawnTiles(board.st, cityHex, 1)[0] ?? null)
      : null;
  if (!spot) return false;
  if (popCost > 0) {
    city.pop = Math.max(1, city.pop - popCost);
    city.workedTiles = city.workedTiles.slice(0, city.pop);
    emit(board, {
      type: 'PopulationConsumed',
      cityId: city.id,
      owner: city.owner,
      pop: city.pop,
      byUnitType: stats.id,
      at: { q: city.q, r: city.r },
    });
  }
  const unitId = nextId(board.st.units, 'u');
  board.st.units[unitId] = {
    id: unitId,
    type: effectiveType,
    owner: city.owner,
    q: spot.q,
    r: spot.r,
    hp: stats.hpMax,
    mp: maxMovementOf(board.st, city.owner, effectiveType),
    veteran: producedVeteranOf(board.st, city.owner, city, effectiveType, stats.canAttack),
    isArmy: false,
    order: null,
    detainedBy: null,
    fortified: false,
    aboard: null,
    cargo: null,
  };
  emit(board, { type: 'UnitProduced', unitId, cityId: city.id, owner: city.owner, unitType: effectiveType, at: spot });
  return true;
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
 * 7j · R-126 : GreatPersonAction — le joueur choisit, pour CHAQUE GP obtenu,
 * entre Consume (effet massif immédiat, le GP disparaît) et Settle
 * (installation permanente dans une ville amie — multiplicateur de rendement).
 * `InstallPerson` (7f · R-115) reste accepté comme ALIAS de Settle (compat
 * clients 7f/7h). Le jalon est déjà compté À L'OBTENTION (spawn, R-126) :
 * aucune des deux actions n'en accorde. Un ordre invalide (unité/ville non
 * possédée, pas un GP, trop loin, Consume sans effet v1) est ignoré — le GP
 * reste « en attente de choix » (et ne peut pas être volé, R-119 révisée).
 */
interface GpAction {
  playerId: PlayerId;
  action: 'consume' | 'settle';
  unitId: UnitId;
  cityId: CityId;
}

function applyGreatPersonActions(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const actions: GpAction[] = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      let action: 'consume' | 'settle' | null = null;
      let unitId: UnitId | null = null;
      let cityId: CityId | null = null;
      if (order.type === 'GreatPersonAction') {
        action = order.action;
        unitId = order.unitId;
        cityId = order.cityId;
      } else if (order.type === 'InstallPerson') {
        action = 'settle'; // alias historique (R-115)
        unitId = order.unitId;
        cityId = order.cityId;
      }
      if (!action || !unitId || !cityId) continue;
      const unit = board.st.units[unitId];
      const city = board.st.cities[cityId];
      if (!unit || unit.owner !== playerId) continue;
      if (!city || city.owner !== playerId) continue; // ville AMIE uniquement
      if (!isGreatPersonType(unit.type)) continue; // R-114 : GP seulement
      if (hexDistance(unit, city) > 1) continue; // sur la case ou adjacente
      actions.push({ playerId, action, unitId, cityId });
    }
  }
  actions.sort((a, b) => compareUnitIds(a.unitId, b.unitId) || a.action.localeCompare(b.action));
  for (const a of actions) {
    const unit = board.st.units[a.unitId];
    const city = board.st.cities[a.cityId];
    if (!unit || !city) continue; // déjà consommé par une action antérieure du lot
    if (a.action === 'settle') {
      // 7k · C3 (veto d'Erik du 04/09) : UN SEUL GP d'un même type par ville —
      // le Settle d'une classe déjà installée dans la cité est refusé (ordre
      // ignoré, le GP reste en attente de choix ; l'UI désactive le bouton
      // avec un tooltip explicite).
      if (city.settledGreatPersons.includes(unit.type)) continue;
      // Settle (R-126) : installation permanente — multiplicateur de rendement
      // de la cité hôte (processEconomy lit `city.settledGreatPersons`).
      delete board.st.units[unit.id];
      city.settledGreatPersons.push(unit.type);
      emit(board, {
        type: 'InstallPerson',
        unitId: unit.id,
        unitType: unit.type,
        cityId: city.id,
        owner: unit.owner,
        at: { q: unit.q, r: unit.r },
      });
      continue;
    }
    // Consume (R-126) — effet massif immédiat par classe ; le GP disparaît.
    // 7l : l'injection d'or de l'Explorateur est ACTIVE (Bloc 5) ; le flip
    // culturel de l'Artiste/Penseur reste inactif (ordre ignoré — le GP reste
    // en attente de choix).
    const applied = applyGreatPersonConsume(board, unit, city);
    if (!applied) continue;
    delete board.st.units[unit.id];
    emit(board, {
      type: 'GreatPersonConsumed',
      unitId: unit.id,
      unitType: unit.type,
      player: unit.owner,
      cityId: city.id,
      effect: applied,
    });
  }
}

/**
 * 7j · R-126 · Effets CONSUME par classe (doc d'Erik, tableau). Retourne le
 * libellé de l'effet appliqué, ou null si l'effet est inactif/impossible (le
 * GP reste alors en attente de choix). Mute l'état de TRAVAIL du moteur.
 *  - Bâtisseur : achève la production en cours (unité, bâtiment ou merveille) ;
 *  - Savant : achève la recherche active (Premier découvrir applicable — la
 *    complétion passe par `creditScience`, comme une découverte normale) ;
 *  - Humanitaire : +1 pop à TOUTES les cités de l'empire ;
 *  - Leader : toutes les unités militaires (canAttack) → Vétéran ;
 *  - Explorateur (7l · Bloc 5) : injection d'or fixe par ère (50/100/200/400) ;
 *  - Artiste/Penseur : reporté (flip culturel — territoire en suspens).
 */
function applyGreatPersonConsume(board: Board, unit: Unit, city: City): string | null {
  const player = board.st.players[unit.owner]!;
  switch (unit.type) {
    case 'batisseur': {
      const prod = city.production;
      if (!prod || productionItemCostOf(board.st, unit.owner, prod.item) === null) return null;
      const at = { q: city.q, r: city.r };
      if (prod.item.kind === 'unit') {
        const stats = unitType(prod.item.id);
        const hex = occupiedByUnit(board, at) ? (freeSpawnTiles(board.st, at, 1)[0] ?? null) : at;
        if (!hex) return null; // aucune case : en attente (comme R-62)
        const unitId = nextId(board.st.units, 'u');
        board.st.units[unitId] = {
          id: unitId,
          type: prod.item.id,
          owner: unit.owner,
          q: hex.q,
          r: hex.r,
          hp: stats.hpMax,
          mp: stats.movement,
          // R-89 + 7j · R-126 : Caserne OU Leader installé → vétéran.
          veteran: (hasBuilding(city, 'caserne') || settledGpMultiplier(city, 'leader') > 1) && stats.canAttack,
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          aboard: null,
          cargo: null,
        };
        emit(board, { type: 'UnitProduced', unitId, cityId: city.id, owner: unit.owner, unitType: prod.item.id, at: hex });
      } else if (prod.item.kind === 'wonder') {
        const wonderId = prod.item.id;
        const wonderData = WONDERS[wonderId];
        // 7k · R-129 : exclusivité MONDIALE — déjà bâtie n'importe où, le
        // Bâtisseur n'a rien à achever : en attente (GP préservé).
        const builtAnywhere = Object.values(board.st.cities).some((c) => c.wonders.includes(wonderId));
        if (!wonderData || builtAnywhere) return null;
        completeWonder(board, city, wonderId);
      } else {
        const buildingId = prod.item.id;
        if (hasBuilding(city, buildingId)) return null; // déjà dotée : en attente
        const replaced = BUILDINGS[buildingId]?.replaces;
        if (replaced && hasBuilding(city, replaced)) {
          city.buildings = city.buildings.filter((b) => b !== replaced);
        }
        city.buildings.push(buildingId);
        city.buildings.sort();
        emit(board, { type: 'BuildingCompleted', cityId: city.id, owner: unit.owner, building: buildingId, at });
      }
      city.production = null;
      return 'production achevée';
    }
    case 'savant': {
      const techId = player.researching;
      const tech = techId ? TECHS[techId] : null;
      if (!techId || !tech) return null; // aucune recherche active : en attente
      const progress = player.scienceProgress[techId] ?? 0;
      creditScience(board.st, unit.owner, Math.max(1, tech.cost - progress), {
        onResearched: (pid, tid) => emit(board, { type: 'TechResearched', player: pid, tech: tid }),
        onFirstDiscovered: (payload, citiesToFill) => {
          emit(board, payload);
          for (const id of citiesToFill) board.pendingFill.add(id);
        },
      });
      return 'recherche achevée';
    }
    case 'humanitaire': {
      // +1 pop à TOUTES les cités de l'empire (citoyens auto-assignés en
      // Phase C — pendingFill). La croissance reste bornée par le cap pop 31
      // (R-63, growth.json) appliqué à la boucle de croissance normale.
      for (const cityId of Object.keys(board.st.cities).sort()) {
        const c = board.st.cities[cityId]!;
        if (c.owner !== unit.owner) continue;
        c.pop += 1;
        board.pendingFill.add(cityId);
        emit(board, { type: 'PopulationGrew', cityId, owner: unit.owner, pop: c.pop, at: { q: c.q, r: c.r } });
      }
      return '+1 population partout';
    }
    case 'leader': {
      let promoted = 0;
      for (const id of Object.keys(board.st.units).sort()) {
        const u = board.st.units[id]!;
        if (u.owner !== unit.owner) continue;
        if (!unitType(u.type).canAttack) continue; // militaires uniquement
        if (!u.veteran) {
          u.veteran = true;
          promoted += 1;
        }
      }
      return promoted > 0 ? 'vétérans partout' : null; // rien à promouvoir : en attente
    }
    case 'explorateur': {
      // 7l · Bloc 5 · R-126 (activé — doc d'Erik « Économie d'or ») :
      // injection d'or FIXE par ère (données economy.json : 50/100/200/400),
      // versée directement à la trésorerie (R-134). L'Artiste/Penseur (flip
      // culturel) reste inactif (territoire en suspens). 7n · R-147 : l'ère
      // est celle de l'EMPIRE (compage, champ `era`).
      const amount = explorerGoldInjectionForEra(eraOfPlayer(player));
      player.treasury += amount;
      return `+${amount} or (injection — trésorerie)`;
    }
    default:
      return null; // Artiste/Penseur (flip culturel) : reporté (territoire en suspens)
  }
}

/**
 * 7g · R-119 : SpyMission — vol de GP installé (tranche 7g). Un Espion
 * ADJACENT (distance ≤ 1) à une ville ennemie VISIBLE vole un GP installé si
 * la victime en possède au moins un (jalons − merveilles contrôlées > 0,
 * R-115) : −1 jalon à la victime, +1 jalon au voleur (le GP est réputé
 * installé d'office dans l'empire voleur — aucun `greatPersonsObtained` ne
 * varie : l'escalade T-27 est inchangée, décision d'Erik) ; l'Espion est
 * consommé. Échec (rien à voler / conditions non remplies) : l'Espion SURVIT
 * (interprétation 🔶 documentée). Détection : reportée 7h.
 */
function applySpyMissions(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'SpyMission' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'SpyMission') continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      if (!unitType(unit.type).spy) continue; // R-119 : Espion uniquement
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  for (const order of orders) {
    const unit = board.st.units[order.unitId];
    const city = board.st.cities[order.cityId];
    if (!unit || !city) continue; // déjà consommé (ordre antérieur du lot) / ville disparue
    if (city.owner === unit.owner) continue; // ville AMIE : pas de mission
    const victim = board.st.players[city.owner];
    if (!victim) continue; // (aucune ville barbare — garde-fou)
    const visible = computeVisibleTiles(board.st, unit.owner).has(tileKeyOf(city));
    const adjacent = hexDistance(unit, city) <= 1;
    // 7j · D4.3 : seuls les GP INSTALLÉS (settledGreatPersons) peuvent être
    // volés — un GP « en attente de choix » est insaisissable (doc d'Erik).
    const stealable = settledGreatPersonsOfCities(board.st.cities, city.owner) > 0;
    if (!visible || !adjacent || !stealable) {
      emit(board, {
        type: 'SpyMission',
        unitId: unit.id,
        owner: unit.owner,
        cityId: city.id,
        target: city.owner,
        outcome: 'failed',
      });
      continue;
    }
    emit(board, {
      type: 'SpyMission',
      unitId: unit.id,
      owner: unit.owner,
      cityId: city.id,
      target: city.owner,
      outcome: 'success',
    });
    emit(board, {
      type: 'GreatPersonStolen',
      spyId: unit.id,
      thief: unit.owner,
      victim: city.owner,
      cityId: city.id,
      at: { q: city.q, r: city.r },
    });
    // 7j · D4.3 : le GP volé est RETIRÉ de la liste d'installation de la ville
    // cible (le plus récemment installé — déterministe) et réputé installé
    // d'office dans la capitale du voleur (sinon première ville — R-81) : le
    // bonus Settle change de camp, l'escalade T-27/T-30 est inchangée
    // (décision d'Erik, R-119).
    const stolen = board.st.cities[city.id]?.settledGreatPersons.pop();
    if (stolen) {
      const thiefCities = Object.values(board.st.cities)
        .filter((c) => c.owner === unit.owner)
        .sort((a, b) => Number(b.capital) - Number(a.capital) || compareCityIds(a.id, b.id));
      thiefCities[0]?.settledGreatPersons.push(stolen);
    }
    victim.cultureMilestones -= 1;
    emit(board, {
      type: 'CultureMilestone',
      player: city.owner,
      delta: -1,
      total: victim.cultureMilestones,
      reason: 'gpStolen',
    });
    const thief = board.st.players[unit.owner]!;
    thief.cultureMilestones += 1;
    emit(board, {
      type: 'CultureMilestone',
      player: unit.owner,
      delta: 1,
      total: thief.cultureMilestones,
      reason: 'gpStolen',
    });
    kill(board, unit, 'mission', null); // l'Espion est consommé par sa mission
  }
}

/**
 * 7m · R-139 : Launch — lancement d'ICBM, résolu en TÊTE de Phase C (une
 * frappe précède l'économie, les actions d'espionnage et les captures : les
 * unités du rayon disparaissent avant toute autre résolution). Validations
 * (R-139) : unité stratégique du joueur, cible existante et VISIBLE (fog,
 * évalué à la résolution), gouvernement ≠ Démocratie (R-140). Un refus est
 * individuel (missile NON consommé). Lancement valide : le missile est
 * consommé (cause `mission`), puis — C17 (7n · Bloc 0) : la Grande Muraille
 * du propriétaire de la ville ciblée BLOQUE le tir (portée empire, missile
 * consommé, aucun dégât) — interception SDI (R-141) si la cible est la case
 * d'une ville hôte d'un SDI, sinon DÉTONATION :
 *  - C13.4 : TOUTES les unités du rayon 1 (7 cases, les deux camps) détruites
 *    (cause `nuke`) — GP « en attente » compris (C13.6) ;
 *  - C15 (7n · Bloc 0 — distinction canon RÉTABLIE) : la CAPITALE SURVIT —
 *    pop = min(pop, 2) 🔶, moitié des bâtiments détruite au hasard (RNG
 *    seedé, C16 : arrondi vers le HAUT ⌈n/2⌉, Palais exclu), merveilles et
 *    GP installés préservés (C13.3/C13.5) ; une ville ORDINAIRE est RASÉE —
 *    effacée de la carte (bâtiments et merveilles détruits, jalon perdu par
 *    merveille — R-115), garnison anéantie (C13.4) et CRATÈRE : la case
 *    devient un terrain `cratere` STÉRILE (rendements nuls) et NON FONDABLE
 *    (défaut 🔶 : cratère permanent — le canon est muet sur la réutilisation).
 *  - pénalité culturelle 🔶 (R-140) : −1 jalon (T-33) sauf Despotisme ;
 *  - la ville (capitale) n'est PAS capturée (C14) — aucune unité ne change de
 *    camp. Aucun autre changement de terrain (pas de conversion d'océan 🔶).
 */
function applyLaunches(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'Launch' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'Launch') continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      if (!unitType(unit.type).strategic) continue; // R-138 : ICBM uniquement
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  const visibilityCache = new Map<PlayerId, Set<TileKey>>();
  const refuse = (unit: Unit, target: Hex, reason: 'democratie' | 'cibleInvisible') => {
    emit(board, {
      type: 'NukeLaunched',
      unitId: unit.id,
      owner: unit.owner,
      at: { q: unit.q, r: unit.r },
      target,
      outcome: 'refused',
      reason,
    });
  };
  for (const order of orders) {
    const unit = board.st.units[order.unitId];
    if (!unit) continue; // garde-fou (une seule ICBM par partie — R-138)
    const target = { q: order.target.q, r: order.target.r };
    if (!board.st.map[tileKeyOf(target)]) {
      refuse(unit, target, 'cibleInvisible');
      continue;
    }
    // R-139 : la cible doit être visible du LANCEUR (fog, évalué à la résolution).
    let visible = visibilityCache.get(unit.owner);
    if (!visible) {
      visible = computeVisibleTiles(board.st, unit.owner);
      visibilityCache.set(unit.owner, visible);
    }
    if (!visible.has(tileKeyOf(target))) {
      refuse(unit, target, 'cibleInvisible');
      continue;
    }
    // R-140 : interdiction politique sous Démocratie (missile conservé).
    const player = board.st.players[unit.owner]!;
    if (player.government === 'democratie') {
      refuse(unit, target, 'democratie');
      continue;
    }
    const cityThere = cityAt(board, target);
    // C17 (7n · Bloc 0) : la Grande Muraille du propriétaire de la ville ciblée
    // BLOQUE le missile — portée EMPIRE (miroir de son effet d'attaque R-132),
    // missile consommé, AUCUN dégât (miroir SDI R-141). L'obsolescence est
    // GLOBALE (R-128 — union des techs). 🔶 les tirs sur des CASES ADJACENTES
    // ne sont pas bloqués (l'exploit R-141 reste possible).
    if (cityThere && wonderBlocksEnemyAttacks(Object.values(board.st.cities), cityThere.owner, allKnownTechs(board.st))) {
      kill(board, unit, 'mission', null);
      emit(board, {
        type: 'NukeLaunched',
        unitId: unit.id,
        owner: unit.owner,
        at: { q: unit.q, r: unit.r },
        target,
        outcome: 'blocked',
        cityId: cityThere.id,
        reason: 'grandeMuraille',
      });
      continue;
    }
    // R-141 : SDI de la ville CIBLÉE — interception garantie (100 %), aucun
    // dégât, missile consommé. Couverture locale : la case seule.
    if (cityThere && cityThere.buildings.includes('sdi')) {
      kill(board, unit, 'mission', null);
      emit(board, {
        type: 'NukeLaunched',
        unitId: unit.id,
        owner: unit.owner,
        at: { q: unit.q, r: unit.r },
        target,
        outcome: 'intercepted',
        cityId: cityThere.id,
      });
      continue;
    }
    // Détonation : le missile est consommé (une seule frappe — R-138).
    kill(board, unit, 'mission', null);
    player.nukesLaunched += 1;
    emit(board, {
      type: 'NukeLaunched',
      unitId: unit.id,
      owner: unit.owner,
      at: { q: unit.q, r: unit.r },
      target,
      outcome: 'detonated',
      ...(cityThere ? { cityId: cityThere.id } : {}),
    });
    // R-140 · T-33 🔶 : pénalité culturelle d'une détonation — annulée sous
    // Despotisme (hook 7i activé, `nuclearWithoutPenalty`).
    if (!effectsFor(player).nuclearWithoutPenalty) {
      const penalty = nukeCulturePenalty();
      if (penalty > 0 && player.cultureMilestones > 0) {
        const delta = -Math.min(penalty, player.cultureMilestones);
        player.cultureMilestones += delta;
        emit(board, {
          type: 'CultureMilestone',
          player: unit.owner,
          delta,
          total: player.cultureMilestones,
          reason: 'nuke',
        });
      }
    }
    // C13.4 : TOUTES les unités du rayon 1 — case cible et 6 adjacentes, les
    // deux camps, aucun survivant (espions infiltrés, réseaux, armées, GP
    // « en attente » — C13.6 — compris). C13.4 s'applique à toute cible.
    const victims: Unit[] = [];
    for (const h of hexesWithinRadius(target, 1)) {
      victims.push(...occupants(board, h));
    }
    for (const v of victims) {
      if (!board.st.units[v.id]) continue; // cargaison déjà coulée avec son transport
      kill(board, v, 'nuke', null);
    }
    // C15 (7n · Bloc 0) : résolution de la ville CIBLÉE — la distinction canon
    // est RÉTABLIE. La CAPITALE survit (résolution C13, aucun changement de
    // propriétaire — C14) ; une ville ORDINAIRE est RASÉE. Une cible ADJACENTE
    // à une ville ne déclenche PAS cette résolution (exploit canon conservé
    // — R-141).
    if (cityThere && board.st.cities[cityThere.id]) {
      const city = board.st.cities[cityThere.id]!;
      if (city.capital) {
        const newPop = Math.min(city.pop, 2); // C13.1 🔶 : réduite à 2, jamais 1
        city.pop = newPop;
        city.workedTiles = city.workedTiles.slice(0, newPop);
        // C13.2 · C16 (7n · Bloc 0) : la moitié des bâtiments ARRONDIE VERS LE
        // HAUT (⌈n/2⌉ — 5 bâtiments → 3 détruits), Palais exclu, sélection
        // seedée (Fisher-Yates partiel — R-80 consulté en Phase C, amendement
        // documenté). Les merveilles (city.wonders) ne sont pas des bâtiments :
        // préservées (C13.3) ; les GP installés (settledGreatPersons) aussi
        // (C13.5).
        const candidates = city.buildings.filter((b) => b !== 'palais').sort();
        const pool = [...candidates];
        const destroyed: string[] = [];
        for (let i = 0; i < Math.ceil(pool.length / 2); i++) {
          const j = i + Math.floor(board.rng.next() * (pool.length - i));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          destroyed.push(pool[i]!);
        }
        destroyed.sort();
        city.buildings = city.buildings.filter((b) => !destroyed.includes(b));
        emit(board, {
          type: 'CityNuked',
          cityId: city.id,
          owner: city.owner,
          at: target,
          popAfter: newPop,
          buildingsDestroyed: destroyed,
        });
      } else {
        // C15 : ville ORDINAIRE — RASÉE (canon). Effacée de la carte, bâtiments
        // ET merveilles détruits (jalon perdu par merveille — R-115, miroir du
        // rasement barbare R-97), la garnison est déjà anéantie (C13.4) ; la
        // case devient un CRATÈRE stérile et non fondable (terrain `cratere`,
        // ressource effacée — défaut 🔶 : permanent).
        const razed = board.st.cities[cityThere.id]!;
        for (const w of [...razed.wonders].sort()) {
          const loser = board.st.players[razed.owner];
          if (!loser) break;
          loser.cultureMilestones -= 1;
          emit(board, {
            type: 'CultureMilestone',
            player: razed.owner,
            delta: -1,
            total: loser.cultureMilestones,
            reason: 'wonderLost',
          });
        }
        delete board.st.cities[cityThere.id];
        board.st.map[tileKeyOf(target)] = { terrain: 'cratere', resource: null };
        emit(board, { type: 'CityRazed', cityId: razed.id, owner: razed.owner, byPlayer: unit.owner, at: target });
      }
    }
  }
}

/**
 * 7m · R-143 : SpyAction — actions d'espionnage d'un espion INFILTRÉ (présent
 * sur la case d'une ville ENNEMIE), résolues après les missions 7g et avant
 * les captures de ville. Chaque action HOSTILE est précédée d'un duel
 * d'espions si le propriétaire a un espion en garnison (R-144) — RNG seedé
 * (R-80 consulté en Phase C, amendement documenté), le perdant est détruit
 * sans exécuter sa mission. Sans garnison : succès automatique (0 % de
 * risque, aucun RNG). Toute action hostile EXÉCUTÉE consomme l'espion ; une
 * action sans cible valable est un échec sans effet et l'espion SURVIT
 * (miroir R-119-7g 🔶) ; `leave` n'est ni hostile ni consommatrice.
 */
function applySpyActions(board: Board, ordersByPlayer: Record<PlayerId, Order[]>): void {
  const orders: Array<Extract<Order, { type: 'SpyAction' }>> = [];
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'SpyAction') continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      if (!unitType(unit.type).spy) continue; // R-143 : Espion uniquement
      orders.push(order);
    }
  }
  orders.sort((a, b) => compareUnitIds(a.unitId, b.unitId));
  for (const order of orders) {
    const unit = board.st.units[order.unitId];
    const city = board.st.cities[order.cityId];
    if (!unit) continue; // déjà consommé (ordre antérieur du lot)
    if (!city) continue; // ville disparue (frappe, rasement) — rien à notifier
    if (city.owner === unit.owner || unit.q !== city.q || unit.r !== city.r) {
      // Garnison dans sa propre ville ou espion hors de la ville ciblée :
      // pas d'action (échec notifié, espion survit).
      emit(board, {
        type: 'SpyAction',
        unitId: unit.id,
        owner: unit.owner,
        cityId: city.id,
        target: city.owner,
        action: order.action,
        outcome: 'failed',
      });
      continue;
    }
    const victim = board.st.players[city.owner];
    if (!victim) continue; // (aucune ville barbare — garde-fou)
    const isHostile = order.action !== 'leave';

    // R-144 · Duel d'espions : espion (ou réseau) EN GARNISON du propriétaire.
    if (isHostile) {
      const defenderSpy = occupants(board, { q: city.q, r: city.r }).find(
        (u) => u.owner === city.owner && isSpyUnit(u),
      );
      if (defenderSpy) {
        const chance = spyDuelWinChance(unit.isArmy, defenderSpy.isArmy);
        const attackerWins = board.rng.next() < chance;
        emit(board, {
          type: 'SpyDuel',
          cityId: city.id,
          attackerId: unit.id,
          defenderId: defenderSpy.id,
          thief: unit.owner,
          defender: city.owner,
          winner: attackerWins ? unit.owner : city.owner,
        });
        if (!attackerWins) {
          kill(board, unit, 'combat', null); // détruit sans exécuter sa mission
          continue;
        }
        kill(board, defenderSpy, 'combat', null); // le perdant est détruit
      }
    }

    let executed = true;
    let failedRoll = false; // C18 : tirage de réussite perdu (action exécutée, or + espion perdus)
    switch (order.action) {
      case 'leave': {
        // R-143.6 : reposition sur une case adjacente libre (tri R-81 via
        // freeSpawnTiles) — non consommé ; aucune case libre : sans effet.
        const target = freeSpawnTiles(board.st, { q: city.q, r: city.r }, 1)[0];
        if (target) {
          unit.q = target.q;
          unit.r = target.r;
        } else {
          executed = false;
        }
        break;
      }
      case 'stealGold': {
        // R-143.1 · T-35 🔶 : 50 % de la trésorerie adverse (arrondi au plus
        // proche, plafonné) — débit/crédit immédiats, la victime est notifiée
        // avec le montant (l'événement ne révèle QUE le montant — fog R-134).
        const amount = stolenGoldAmount(victim.treasury);
        if (amount > 0) {
          victim.treasury -= amount;
          board.st.players[unit.owner]!.treasury += amount;
        }
        emit(board, {
          type: 'GoldStolen',
          spyId: unit.id,
          thief: unit.owner,
          victim: city.owner,
          cityId: city.id,
          amount,
        });
        break;
      }
      case 'kidnapGreatPerson': {
        // R-143.2 : GP « en attente de choix » du propriétaire (unité GP non
        // installée) sur la case de la ville ou adjacente (fenêtre R-115) —
        // choix déterministe : sur place d'abord, puis (q, r), unitId croissant.
        const hex = { q: city.q, r: city.r };
        const gp = Object.values(board.st.units)
          .filter((u) => u.owner === city.owner && !u.aboard && isGreatPersonType(u.type))
          .filter((u) => hexDistance(u, hex) <= 1)
          .sort(
            (a, b) =>
              (a.q === hex.q && a.r === hex.r ? 0 : 1) - (b.q === hex.q && b.r === hex.r ? 0 : 1) ||
              a.q - b.q ||
              a.r - b.r ||
              compareUnitIds(a.id, b.id),
          )[0];
        if (!gp) {
          executed = false;
          break;
        }
        gp.owner = unit.owner; // transfert (aucun jalon ni escalade ne varie — C2)
        const thiefCities = Object.values(board.st.cities)
          .filter((c) => c.owner === unit.owner)
          .sort((a, b) => Number(b.capital) - Number(a.capital) || compareCityIds(a.id, b.id));
        const home = thiefCities[0];
        if (home) {
          const homeHex = { q: home.q, r: home.r };
          const spot = occupiedByUnit(board, homeHex) ? (freeSpawnTiles(board.st, homeHex, 1)[0] ?? null) : homeHex;
          if (spot) {
            gp.q = spot.q;
            gp.r = spot.r;
          }
        }
        emit(board, {
          type: 'GreatPersonKidnapped',
          spyId: unit.id,
          thief: unit.owner,
          victim: city.owner,
          cityId: city.id,
          unitId: gp.id,
          gpType: gp.type,
        });
        break;
      }
      case 'sabotageProduction': {
        // R-143.3 🔶 : marteaux investis du projet en cours remis à zéro — la
        // réserve permanente C7 (`pendingSalvage`) n'est PAS touchée.
        if (!city.production) {
          executed = false;
          break;
        }
        city.production = { ...city.production, progress: 0 };
        break;
      }
      case 'destroyBuilding': {
        // R-143.4 · C18 (7n · Bloc 0) : le tireur choisit le bâtiment AVANT
        // l'action (`buildingId` de l'ordre — les merveilles ne sont pas des
        // bâtiments et sont épargnées ; Palais exclu). Coût et risque
        // CROISSENT avec la valeur de production (marteaux) du bâtiment :
        // coût en or = round(marteaux × 0,5) 🔶 débité AU LANCEMENT (non
        // remboursé — échec compris) ; réussite = clamp(0,9 − marteaux/500 ;
        // 0,4 ; 0,9) 🔶 (RNG seedé R-80 consulté en Phase C — duel compris).
        // Trésorerie insuffisante = action sans effet (aucun débit, espion
        // survit 🔶) ; ÉCHEC du tirage = espion perdu + or perdu (défaut 🔶).
        const target = order.buildingId;
        if (!target || target === 'palais' || !city.buildings.includes(target)) {
          executed = false;
          break;
        }
        const marteaux = BUILDINGS[target]?.cost ?? 0;
        const goldCost = destroyBuildingGoldOf(marteaux);
        const thief = board.st.players[unit.owner]!;
        if (thief.treasury < goldCost) {
          executed = false;
          break;
        }
        thief.treasury -= goldCost; // débité au lancement, non remboursé 🔶
        const success = board.rng.next() < destroyBuildingSuccessChance(marteaux);
        if (!success) {
          failedRoll = true; // échec : espion + or perdus, bâtiment intact
          break;
        }
        city.buildings = city.buildings.filter((b) => b !== target);
        emit(board, {
          type: 'SpyBuildingDestroyed',
          spyId: unit.id,
          thief: unit.owner,
          victim: city.owner,
          cityId: city.id,
          building: target,
          at: { q: city.q, r: city.r },
        });
        break;
      }
      case 'destroyFortifications': {
        // R-143.5 : annule la fortification (R-33) du défenseur du
        // propriétaire présent sur la case de ville (R-30 : il n'y en a qu'un).
        const defender = occupants(board, { q: city.q, r: city.r }).find(
          (u) => u.owner === city.owner && !isSpyUnit(u),
        );
        if (!defender || !defender.fortified) {
          executed = false;
          break;
        }
        defender.fortified = false;
        break;
      }
    }
    emit(board, {
      type: 'SpyAction',
      unitId: unit.id,
      owner: unit.owner,
      cityId: city.id,
      target: city.owner,
      action: order.action,
      outcome: executed && !failedRoll ? 'success' : 'failed',
    });
    // R-143 : toute action hostile EXÉCUTÉE consomme l'espion (seul `leave`
    // le préserve) ; un échec sans effet aussi. C18 : un tirage perdu est une
    // action EXÉCUTÉE (or débité) — l'espion est perdu lui aussi.
    if (executed && isHostile) kill(board, unit, 'mission', null);
  }
}

/** R-65 : ville sans défenseur investie → capture (capitale = victoire). R-97 : capture BARBARE → rasement. */function processCityCaptures(board: Board): void {
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const hex = { q: city.q, r: city.r };
    const here = occupants(board, hex);
    if (here.length === 0) continue;
    // 7m · R-142 : un espion (garnison comme infiltré) ne défend PAS la ville
    // — seules les entités non-espion du propriétaire la défendent (R-57).
    if (here.some((u) => u.owner === city.owner && !isSpyUnit(u))) continue; // défendue (R-57)
    // 7m · R-142 : un espion ne capture pas non plus — le captreur est la
    // première entité non-espion ENNEMIE (tri R-81) ; une ville dont les
    // seuls occupants sont des espions n'est pas capturée.
    const invader = here.find((u) => u.owner !== city.owner && !isSpyUnit(u));
    if (!invader) continue;
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
      // 7m · R-142 🔶 : au rasement barbare, l'espion INFILTRÉ disparaît avec
      // la ville ; la garnison espion du propriétaire rasé survit (simple
      // unité de terrain désormais).
      for (const spy of occupants(board, hex)) {
        if (isSpyUnit(spy) && spy.owner !== fromOwner && board.st.units[spy.id]) {
          kill(board, spy, 'capture', null);
        }
      }
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
    city.pendingSalvage = 0; // R-130 : les marteaux en récupération ne passent pas au captreur
    city.workedTiles = [];
    city.buildings = []; // R-66 : les bâtiments sont perdus à la capture (le captreur ne les récupère pas)
    city.conversion = CONVERSION_DEFAULT; // R-90 : le choix de conversion est réinitialisé
    city.wasCaptured = true; // 7n · R-149 (trait Mongol commerceCaptures — définitif)
    // 7l · R-134 · Sac de ville : le captreur pille une PART de la trésorerie
    // du perdant (economy.json `cityCapturePlunderPct` 🔶 0.5 — sources
    // muettes, calibrable ; arrondi au plus proche). Champ `plunder` de
    // l'événement CityCaptured.
    let plunder = 0;
    const victim = board.st.players[fromOwner];
    if (victim && victim.treasury > 0) {
      plunder = Math.round(victim.treasury * ECONOMY.cityCapturePlunderPct);
      if (plunder > 0) {
        victim.treasury -= plunder;
        board.st.players[invader.owner]!.treasury += plunder;
      }
    }
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
    emit(board, { type: 'CityCaptured', cityId, fromOwner, toOwner: invader.owner, at: hex, ...(plunder > 0 ? { plunder } : {}) });
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

/**
 * 7f/7h · R-114/R-123 (rév. 7j · R-126) : engendre un Personnage illustre de
 * la classe donnée sur la case de la ville (sinon première case adjacente
 * libre — perdu si aucune, interprétation R-114). Escalades : compteur PAR
 * TYPE (T-30) et `greatPersonsObtained` (T-27) pour TOUTE classe — « le seuil
 * augmente à chaque nouveau personnage » 🔶 (inchangé 7k).
 * 7k · C2 (veto d'Erik du 04/09, révision R-126) : `countsAsMilestone` — seuls
 * les GP issus du CANAL CULTURE comptent immédiatement comme Jalon culturel
 * (reason 'obtain') ; un GP d'accumulateur (T-30), du canal combat (T-31) ou
 * du Premier découvrir n'en compte PAS. Les merveilles continuent de compter
 * (R-131).
 */
function spawnGreatPerson(board: Board, city: City, gpType: string, countsAsMilestone: boolean): void {
  const player = board.st.players[city.owner]!;
  const gpStats = unitType(gpType);
  const cityHex = { q: city.q, r: city.r };
  const spot = occupiedByUnit(board, cityHex) ? (freeSpawnTiles(board.st, cityHex, 1)[0] ?? null) : cityHex;
  if (gpStats.greatPerson) {
    player.greatPersonsByType[gpType] = (player.greatPersonsByType[gpType] ?? 0) + 1;
    player.greatPersonsObtained += 1; // R-114 : seuil T-27 — toutes classes
    if (countsAsMilestone) {
      player.cultureMilestones += 1; // 7k · C2 : canal CULTURE seulement
      emit(board, {
        type: 'CultureMilestone',
        player: city.owner,
        delta: 1,
        total: player.cultureMilestones,
        reason: 'obtain',
      });
    }
  }
  if (!spot) return; // aucune case libre : le GP est perdu (interprétation documentée)
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
    aboard: null,
    cargo: null,
  };
  emit(board, {
    type: 'GreatPersonSpawned',
    unitId: gpId,
    unitType: gpType,
    cityId: city.id,
    owner: city.owner,
    at: spot,
  });
}

/**
 * 7h · R-124 · Victoire scientifique : les 4 composants du Vaisseau spatial
 * contrôlés par le joueur (villes quelconques — suivi DÉRIVÉ des bâtiments,
 * R-66 : une capture les détruit) → événement Launch + Victory 'science'.
 */
const SHIP_COMPONENTS = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];

function checkScienceVictory(board: Board): void {
  if (board.st.winner) return;
  for (const playerId of Object.keys(board.st.players).sort()) {
    const buildings = new Set<string>();
    for (const id of Object.keys(board.st.cities).sort()) {
      const city = board.st.cities[id]!;
      if (city.owner !== playerId) continue;
      for (const b of city.buildings) buildings.add(b);
    }
    if (SHIP_COMPONENTS.every((c) => buildings.has(c))) {
      const capital = Object.values(board.st.cities)
        .filter((c) => c.owner === playerId)
        .sort((a, b) => compareCityIds(a.id, b.id))
        .find((c) => c.capital) ?? Object.values(board.st.cities).filter((c) => c.owner === playerId)[0];
      emit(board, { type: 'Launch', player: playerId, at: { q: capital!.q, r: capital!.r } });
      board.st.winner = playerId;
      emit(board, { type: 'Victory', winner: playerId, reason: 'science' });
      return;
    }
  }
}

/**
 * 7h · R-123 · GP Leader : spawn sur la capitale (sinon première ville —
 * interprétation documentée) au seuil T-31 de victoires de combat de l'empire.
 * Seuil FIXE (pas de croissance ×2 — interprétation documentée).
 */
function checkLeaderGreatPerson(board: Board): void {
  for (const playerId of Object.keys(board.st.players).sort()) {
    const player = board.st.players[playerId]!;
    if (isInAnarchy(player, board.st.turn)) continue; // R-122 : GP gelés
    if ((player.greatPersonsByType['leader'] ?? 0) > 0) continue; // seuil fixe : un seul Leader
    if (player.combatVictories < leaderGpVictoriesNeeded()) continue;
    const city = Object.values(board.st.cities)
      .filter((c) => c.owner === playerId)
      .sort((a, b) => compareCityIds(a.id, b.id))
      .find((c) => c.capital);
    if (city) spawnGreatPerson(board, city, 'leader', false); // C2 : pas de jalon
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
    // 7g · R-117 : une unité EMBARQUÉE ne fonde rien (elle n'est pas sur la
    // carte — le débarquement d'abord).
    if (!unit || unit.detainedBy || unit.aboard || !unitType(unit.type).canFoundCity) continue;
    const hex = { q: unit.q, r: unit.r };
    if (cityAt(board, hex)) continue;
    // Fondation sur un terrain praticable uniquement (jamais sur l'eau —
    // garde-fou : un terrestre ne se tient de toute façon jamais sur l'eau).
    const tile = board.st.map[tileKeyOf(hex)];
    if (!tile || !TERRAINS[tile.terrain]!.passable) continue;
    // C15 (7n · Bloc 0) : un CRATÈRE (frappe nucléaire — terrain stérile) est
    // NON FONDABLE (défaut 🔶 : permanent). Le colon survit, l'ordre est ignoré.
    if (tile.terrain === 'cratere') continue;
    // T-09 : distance minimale à toute ville existante.
    if (Object.values(board.st.cities).some((c) => hexDistance(c, hex) < MIN_CITY_DISTANCE)) continue;
    const ownerHasCity = Object.values(board.st.cities).some((c) => c.owner === unit.owner);
    // 7i · D3 · R-64 (rév.) : population initiale selon l'Ère de l'empire
    // (7n · R-147 : ère par COMPAGE — champ `era`, transition au tour suivant)
    // — Antique 2, Médiévale 3, Industrielle 4, Moderne 5 (growth.json).
    // 7n · R-149 : + le bonus civilisationnel (Chine Antique +1, Rome
    // Moderne +1 → pop 6). Les citoyens sont auto-assignés en Phase C
    // (board.pendingFill — R-60).
    const owner = board.st.players[unit.owner]!;
    const founderPop = foundingPopForEra(owner.era) + foundingPopBonusOf(owner);
    // 7i · D5 · R-64 (rév.) : fonder SUR une ressource la détruit
    // définitivement (elle est effacée avec le terrain, déjà le cas —
    // l'événement le documente désormais dans le journal).
    const destroyedResource = tile.resource ?? null;
    const cityId = nextId(board.st.cities, 'c');
    board.st.cities[cityId] = {
      id: cityId,
      q: hex.q,
      r: hex.r,
      owner: unit.owner,
      pop: founderPop,
      capital: !ownerHasCity,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: !ownerHasCity ? ['palais'] : [], // 7e : le Palais ne vit que dans la capitale
      conversion: CONVERSION_DEFAULT, // R-90 : défaut Or
      cultureStored: 0, // 7f · R-113
      wonders: [], // 7f · R-115
      gpAccumGold: 0, // 7h · R-123
      gpAccumScience: 0,
      gpAccumProd: 0,
      gpAccumFood: 0, // 7j (7k · C1 : DORMANT — le canal Humanitaire est la culture)
      pendingSalvage: 0, // 7k · R-130 (M3)
      settledGreatPersons: [], // 7j · R-126
      wasCaptured: false, // 7n · R-149
    };
    board.st.map[tileKeyOf(hex)] = { terrain: 'ville', resource: null };
    delete board.st.units[unit.id];
    board.pendingFill.add(cityId); // les citoyens initiaux sont auto-assignés en Phase C
    emit(board, { type: 'CityFounded', cityId, owner: unit.owner, at: hex, capital: !ownerHasCity, byUnitId: unit.id });
    if (destroyedResource) {
      emit(board, { type: 'ResourceDestroyed', resource: destroyedResource, at: hex, cityId, owner: unit.owner });
    }
  }
}

/**
 * 7k · R-129/R-130/R-131 — complétion d'une merveille, logique UNIQUE partagée
 * par la file de production (R-62) et le Consume Bâtisseur (R-126).
 *  - Exclusivité MONDIALE (R-129) : bâtie n'importe où (toutes civs) ⇒ no-op
 *    documenté ; les marteaux investis de la ville perdante basculent en
 *    récupération R-130 (HammerSalvage 'available' — réaffectation pendant la
 *    fenêtre T-32 🔶 via SetProduction, sinon dissipation).
 *  - Merveille = 1 jalon (R-131, reason 'wonderBuilt').
 *  - Effets de complétion R-132 (Oxford, Apollo, Léonard) + Jardins (R-116) +
 *    ONU (victoire culturelle R-116).
 */
function completeWonder(board: Board, city: City, wonderId: string): void {
  const player = board.st.players[city.owner]!;
  const wonderData = WONDERS[wonderId];
  const invested = city.production?.progress ?? 0;
  city.production = null; // file vidée (R-62) — no-op comme complétion
  const builtAnywhere = Object.values(board.st.cities).some((c) => c.wonders.includes(wonderId));
  if (!wonderData || builtAnywhere) {
    if (wonderData && invested > 0) {
      // R-130 · M3 (rév. 7l · C7) : devancé — les marteaux sont conservés en
      // RÉSERVE PERMANENTE (cumul avec une réserve existante — plus de
      // dissipation, le SetProduction n'absorbe plus la réserve).
      emit(board, {
        type: 'HammerSalvage',
        cityId: city.id,
        owner: city.owner,
        wonder: wonderId,
        amount: invested,
        outcome: 'available',
      });
    }
    return;
  }
  city.wonders.push(wonderId);
  player.cultureMilestones += 1; // R-131 : merveille = 1 jalon (survit à l'obsolescence)
  emit(board, {
    type: 'WonderCompleted',
    cityId: city.id,
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
  // R-130 · M3 : à la résolution où la merveille est complétée, TOUT chantier
  // concurrent de cette merveille (toutes civilisations — l'unicité de chantier
  // d'empire ne couvre pas les rivaux) bascule automatiquement en récupération :
  // marteaux conservés, réaffectation pendant la fenêtre (T-32 🔶 — un tour),
  // sinon dissipés à la résolution suivante. Tie-break même tour : R-81 (ordre
  // cityId croissant — la première complétion de la résolution gagne).
  for (const otherId of Object.keys(board.st.cities).sort()) {
    const other = board.st.cities[otherId]!;
    if (other.production?.item.kind !== 'wonder' || other.production.item.id !== wonderId) continue;
    const lost = other.production.progress;
    other.production = null;
    if (lost > 0) {
      // 7l · C7 : la réserve est PERMANENTE — cumul avec l'existant.
      other.pendingSalvage += lost;
      emit(board, {
        type: 'HammerSalvage',
        cityId: other.id,
        owner: other.owner,
        wonder: wonderId,
        amount: lost,
        outcome: 'available',
      });
    }
  }
  // R-116 : Jardins suspendus — +50 % de population immédiat (arrondi au plus
  // proche) — citoyens auto-assignés en Phase C.
  if (wonderData.populationGainPct) {
    const gain = Math.round(city.pop * wonderData.populationGainPct);
    if (gain > 0) {
      city.pop += gain;
      board.pendingFill.add(city.id);
      emit(board, {
        type: 'PopulationGrew',
        cityId: city.id,
        owner: city.owner,
        pop: city.pop,
        at: { q: city.q, r: city.r },
      });
    }
  }
  applyWonderCompletionEffects(board, city, wonderData);
  // R-116 : les Nations Unies achevées = VICTOIRE CULTURELLE.
  // 7l · R-137 : la Banque mondiale achevée = VICTOIRE ÉCONOMIQUE
  // (l'or n'est PAS débité — condition, pas un prix).
  if (wonderData.cultureVictory) {
    board.st.winner = city.owner;
    emit(board, { type: 'Victory', winner: city.owner, reason: 'culture' });
  }
  if (wonderData.economicVictory) {
    board.st.winner = city.owner;
    emit(board, { type: 'Victory', winner: city.owner, reason: 'economique' });
  }
}

/** 7k · R-132 · Octroi direct d'une technologie (Oxford, Apollo, Grande
 *  Bibliothèque) : ni `firstBy` ni récompense Premier découvrir ; la fenêtre
 *  d'adoption de régime (R-122) s'ouvre normalement ; événement TechResearched
 *  (libellé « complétée » — documenté 🔶). */
function grantTech(board: Board, playerId: PlayerId, techId: string): void {
  const player = board.st.players[playerId]!;
  if (player.techsUnlocked.includes(techId)) return;
  player.techsUnlocked.push(techId);
  player.techsUnlocked.sort();
  player.techsUnlockedThisTurn = [...(player.techsUnlockedThisTurn ?? []), techId];
  emit(board, { type: 'TechResearched', player: playerId, tech: techId });
}

/**
 * 7k · R-132 · Atelier de Léonard (une fois, à la complétion) : toutes les
 * unités obsolètes de l'empire sont mises à niveau GRATUITEMENT — chaîne
 * `upgradeTo` (R-111) suivie tant que le type courant est obsolète pour le
 * PROPRIÉTAIRE (R-110 unités : périmètre joueur, contrairement aux merveilles
 * M1/R-128). Armées comprises (le type suit, vétéran et PV conservés — tous
 * les types terrestres partagent le même hpMax 🔶). Événement UnitsUpgraded.
 */
function upgradeObsoleteUnitsOf(board: Board, playerId: PlayerId): void {
  const owner = board.st.players[playerId]!;
  const upgrades: Array<{ unitId: UnitId; from: string; to: string }> = [];
  for (const id of Object.keys(board.st.units).sort(compareUnitIds)) {
    const u = board.st.units[id]!;
    if (u.owner !== playerId) continue;
    let type = u.type;
    let changed = false;
    while (isUnitObsolete(type, owner.techsUnlocked)) {
      const next = unitType(type).upgradeTo;
      if (!next) break; // chaîne terminée sans type moderne (aucune donnée v1)
      type = next;
      changed = true;
    }
    if (changed) {
      upgrades.push({ unitId: id, from: u.type, to: type });
      u.type = type;
    }
  }
  if (upgrades.length > 0) emit(board, { type: 'UnitsUpgraded', player: playerId, upgrades });
}

/** 7k · R-132 · Effets de complétion des merveilles (une fois, à la pose). */
function applyWonderCompletionEffects(board: Board, city: City, wonderData: WonderData): void {
  const player = board.st.players[city.owner]!;
  // 7m · R-138 : instanciation d'une unité STRATÉGIQUE dans la ville
  // constructrice (Projet Manhattan → ICBM — le seul missile de la partie,
  // l'exclusivité mondiale R-129 interdisant une seconde complétion). Case de
  // ville si libre, sinon adjacente — perdue si aucune (miroir R-114 🔶).
  if (wonderData.grantsUnit) {
    const stats = unitType(wonderData.grantsUnit);
    const cityHex = { q: city.q, r: city.r };
    const spot = !occupiedByUnit(board, cityHex) ? cityHex : (freeSpawnTiles(board.st, cityHex, 1)[0] ?? null);
    if (spot) {
      const unitId = nextId(board.st.units, 'u');
      board.st.units[unitId] = {
        id: unitId,
        type: wonderData.grantsUnit,
        owner: city.owner,
        q: spot.q,
        r: spot.r,
        hp: stats.hpMax,
        mp: stats.movement,
        veteran: false,
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
        aboard: null,
        cargo: null,
      };
      // Canal `UnitProduced` réutilisé (documenté) : l'unité n'est pas passée
      // par une file de production (R-138 — jamais dans les files).
      emit(board, {
        type: 'UnitProduced',
        unitId,
        cityId: city.id,
        owner: city.owner,
        unitType: wonderData.grantsUnit,
        at: spot,
      });
    }
  }
  // Université d'Oxford : une technologie avancée ALÉATOIRE — tirage seedé
  // R-80 parmi les techs non débloquées (table triée par id 🔶). Amendement
  // R-80 documenté : le RNG est consulté en Phase C.
  if (wonderData.randomTechOnComplete) {
    const pool = Object.keys(TECHS)
      .filter((t) => !player.techsUnlocked.includes(t))
      .sort();
    if (pool.length > 0) {
      const pick = pool[Math.floor(board.rng.next() * pool.length)]!;
      grantTech(board, city.owner, pick);
    }
    return; // pool vide : tout est déjà connu — effet sans objet
  }
  // Programme Apollo : l'ENSEMBLE des technologies de l'arbre, instantanément
  // (le doc fait foi 🔶 — conséquence canonique : obsolescence globale R-128).
  if (wonderData.allTechsOnComplete) {
    for (const t of Object.keys(TECHS).sort()) grantTech(board, city.owner, t);
    return;
  }
  // Atelier de Léonard : mise à niveau gratuite des unités obsolètes.
  if (wonderData.upgradeObsoleteUnits) upgradeObsoleteUnitsOf(board, city.owner);
}

/**
 * 7k · R-132 · Grande Bibliothèque d'Alexandrie : à CHAQUE résolution, accorde
 * toute technologie déjà découverte par au moins DEUX rivaux (comptés parmi
 * les autres civilisations — condition canonique ; en 1v1 un seul rival ⇒
 * JAMAIS déclenchée, documenté). Octroi direct (grantTech — ni `firstBy` ni
 * récompense Premier découvrir). Effet continu tant que la merveille est
 * debout (obsolescence Université — M1/R-128 : union des techs).
 */
function processWonderEffects(board: Board): void {
  const allTechs = allKnownTechs(board.st);
  for (const playerId of Object.keys(board.st.players).sort()) {
    const player = board.st.players[playerId]!;
    const ownsLibrary = Object.values(board.st.cities).some(
      (c) => c.owner === playerId && c.wonders.includes('grande_bibliotheque') && !isWonderObsolete('grande_bibliotheque', allTechs),
    );
    if (!ownsLibrary) continue;
    for (const techId of Object.keys(TECHS).sort()) {
      if (player.techsUnlocked.includes(techId)) continue;
      let rivals = 0;
      for (const otherId of Object.keys(board.st.players).sort()) {
        if (otherId === playerId) continue;
        if (board.st.players[otherId]!.techsUnlocked.includes(techId)) rivals += 1;
      }
      if (rivals >= 2) grantTech(board, playerId, techId);
    }
  }
}

/**
 * 7l · Entrées économiques d'une ville (Phase C) — calcul PUR extrait de la
 * boucle pour servir à la fois à la boucle elle-même et au départage C8 des
 * complétions simultanées (qui doit évaluer tous les chantiers AVANT toute
 * complétion). Comprend : Anarchie/régime, bonus empire, rendements,
 * production finale et or direct des ressources (R-134).
 */
interface CityEconomyInputs {
  anarchy: boolean;
  govEffects: ReturnType<typeof effectsFor>;
  empireBonus: ReturnType<typeof empirePerCityBonus>;
  food: number;
  /** Production finale (marteaux) — 0 en Anarchie (R-122). */
  production: number;
  /** Commerce brut (avant conversion R-90). */
  commerce: number;
  /** 7l · R-134 · Or DIRECT des ressources travaillées (Gemmes +2, Or +3 —
   *  canal canon, correction du D3 de 7c) ; 0 en Anarchie (R-122 : or à zéro). */
  directGold: number;
}

function cityEconomyInputs(board: Board, city: City, allTechs: readonly string[]): CityEconomyInputs {
  const player = board.st.players[city.owner]!;
  // 7h · R-121/R-122 : Anarchie — marteaux, fioles, or et culture TOMBENT À
  // ZÉRO (la nourriture n'est PAS paralysée — interprétation documentée).
  const anarchy = isInAnarchy(player, board.st.turn);
  const govEffects = anarchy ? {} : effectsFor(player);
  // 7e · Premier découvrir : bonus d'empire par ville (Littératie +1 science,
  // Chemin de fer +2 production, Industrialisation +5 or…).
  const empireBonus = empirePerCityBonus(board.st, city.owner);

  // Rendements : centre-ville automatique et gratuit + Σ cases travaillées
  // (base §2 + bonus bâtiments R-66 + bonus ressource si accès, R-93).
  // 7i · R-66 (rév.) : le centre-ville garantit AU MINIMUM 1 Production et son
  // commerce évolue avec la tranche démographique (D4 — interprétation 🔶).
  const cityTile = TERRAINS['ville']!.yields!;
  const tier = interiorCitizenFor(city.pop);
  let food = cityTile.food;
  let rawProduction = Math.max(GROWTH.cityCenter.minProduction, cityTile.production) + empireBonus.production;
  let commerce = (GROWTH.cityCenter.commerceByTier ? tier.commerce : cityTile.commerce) + empireBonus.commerce;
  let directGold = 0;
  for (const key of city.workedTiles) {
    // 7k · R-132 / 7l · C9 : les merveilles portent des bonus par terrain
    // travaillé (Cie des Indes : +1 Commerce par case d'EAU — côte incluse).
    // 7n · R-149 : le contexte civ active les bonus de TERRAIN (Amérique/Russie
    // plaine, Égypte désert, Allemagne forêt, Mongolie montagne, maritime) et
    // l'accès aux ressources SANS tech (Inde).
    const y = tileYield(board.st.map, city.buildings, key, player.techsUnlocked, city.wonders, allTechs, player)!;
    food += y.food;
    rawProduction += y.production;
    commerce += y.commerce;
    // 7l · R-134 : or direct des ressources (Gemmes +2, Or +3 dès Monnaie —
    // canon ; correction du canal commerce D3 de 7c, la trésorerie existe).
    // 7n · R-149 : l'Inde (`toutesRessources`) ignore la tech d'accès.
    const res = board.st.map[key]?.resource;
    const resData = res ? RESOURCES[res] : undefined;
    if (resData?.directGold && (civToutesRessources(player) || resourceAccessible(resData, player.techsUnlocked))) {
      directGold += resData.directGold;
    }
  }
  // 7i · D4 · R-60bis : citoyens intérieurs au centre-ville (tranche D4).
  const interior = interiorCountOf(city.pop, city.workedTiles.length);
  rawProduction += interior * tier.production;
  commerce += interior * tier.commerce;
  // 7f · R-113/R-116 : le Colosse de Rhodes DOUBLE le commerce brut (R-90).
  let wonderCommerceMult = 1;
  for (const w of city.wonders) wonderCommerceMult = Math.max(wonderCommerceMult, WONDERS[w]?.commerceMult ?? 1);
  commerce *= wonderCommerceMult;
  // 7n · R-149 (trait Mongol `commerceCaptures`) : +50 % de commerce pour les
  // VILLES CAPTURÉES (wasCapturee — définitif, mirror « villes assimilées »).
  if (city.wasCaptured) commerce *= civCommerceCaptureMultOf(player);
  // 7e · Multiplicateurs de production (Usine ×2, data-driven).
  // 7n · R-149 (trait Amérique `buildingProductionMult`) : surcharge data —
  // les Usines triplent la production (×3).
  let factoryMult = 1;
  for (const b of city.buildings) {
    factoryMult = Math.max(factoryMult, civBuildingProductionMultOf(player, b) ?? BUILDINGS[b]?.productionMult ?? 1);
  }
  const prodMult = factoryMult * (1 + POP_PRODUCTION_BONUS * (city.pop - 1)); // R-63 🔶
  // 7h · R-121 · Communisme : +50 % de Production (round half up, après Usine/pop).
  const production = anarchy
    ? 0 // R-122 : production gelée
    : Math.round(Math.floor(rawProduction * prodMult) * (govEffects.productionMult ?? 1));
  return { anarchy, govEffects, empireBonus, food, production, commerce, directGold: anarchy ? 0 : directGold };
}

/**
 * 7n · R-147 · Transition d'ÈRE par COMPAGE de technologies (T-36 🔶 :
 * Médiévale à 5 techs, Industrielle à 14, Moderne à 24 — eras.json,
 * indifférent à la branche). Appelée en FIN de Phase C : les techs complétées
 * pendant cette résolution changent l'ère POUR LE TOUR SUIVANT (la pop de
 * fondation, les facteurs de rush et les bonus de civ de la résolution
 * courante ont déjà lu l'ère persistée). Les techs GRATUITES du nouveau palier
 * (Arabie Mathématiques, Chine Alphabétisation, Égypte Irrigation, Grèce
 * Démocratie→départ, Inde Religion, Mongols Communisme, France Poterie→départ)
 * sont accordées immédiatement (octroi direct grantTech — ni `firstBy` ni
 * Premier découvrir) et le comptage est RÉÉVALUÉ (cascade déterministe :
 * des techs gratuites peuvent franchir le palier suivant). Événement
 * `EraChanged` (public — l'ère est une information publique, canon).
 */
function processEraChanges(board: Board): void {
  for (const playerId of Object.keys(board.st.players).sort()) {
    const player = board.st.players[playerId]!;
    const civ = civDataOf(civIdOf(player));
    let changed = false;
    for (let guard = 0; guard < 8; guard++) {
      const target = eraOfTechCount(player.techsUnlocked.length);
      if (eraIndexOf(target) <= eraIndexOf(player.era)) break;
      player.era = target;
      changed = true;
      emit(board, { type: 'EraChanged', player: playerId, era: target, turn: board.st.turn });
      // Techs gratuites du palier ATTEINT (tri par id — R-81).
      if (civ) {
        const freeTechs = new Set<string>();
        for (const t of civ.eras[target] ?? []) {
          if (t.key === 'techGratuite' && t.tech && !t.inactif) freeTechs.add(t.tech);
        }
        for (const tech of [...freeTechs].sort()) grantTech(board, playerId, tech);
      }
    }
    void changed;
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

  // 7k · M1/R-128 : union des technologies de TOUTES les civilisations —
  // l'obsolescence des merveilles (effets, production) est GLOBALE. Figurée en
  // tête de Phase C : les octrois de tech de CETTE résolution (Apollo, Oxford,
  // Grande Bibliothèque) s'appliquent à la résolution suivante 🔶.
  const allTechs = allKnownTechs(board.st);

  // 7l · Entrées économiques précalculées pour TOUTES les villes (pures) :
  // le départage C8 doit évaluer tous les chantiers AVANT toute complétion.
  const economyInputs = new Map<CityId, CityEconomyInputs>();
  for (const cityId of Object.keys(board.st.cities).sort()) {
    economyInputs.set(cityId, cityEconomyInputs(board, board.st.cities[cityId]!, allTechs));
  }
  // 7l · C8 · R-129 : départage des complétions SIMULTANÉES d'une même
  // merveille (le perdant bascule intégralement en réserve C7).
  resolveWonderRaces(board, economyInputs);

  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const player = board.st.players[city.owner]!;
    const { anarchy, govEffects, empireBonus, food, production, commerce, directGold } = economyInputs.get(cityId)!;
    // R-90 révisée (Phase 7b) : le commerce est converti en TOTALITÉ en or ou
    // en science selon le choix de la ville. 7e : Marché ×2 / Banque ×4 or,
    // Bibliothèque ×1,5 / Université ×4 science (data-driven, conversion.ts).
    // 7h · R-121 : Démocratie +50 % or/science (avant répartition) ;
    // Fondamentalisme : science Bibliothèque/Université = 0.
    const rawGains = anarchy
      ? { gold: 0, science: 0 } // R-122 : fioles et or à zéro
      : conversionGains(commerce, city.conversion, city.buildings, govEffects);
    // 7k · R-132 · Foire de Troyes (cité hôte) et Internet (tout l'empire)
    // multiplient la part OR de la conversion R-90. 7l · C10 (décision d'Erik
    // du 05/09) : cumul MULTIPLICATIF ×4 (remplace la convention MAX de 7k),
    // avant le multiplicateur Settle Explorateur (round half up final).
    const goldWonderMult = anarchy
      ? 1
      : cityGoldMultOf(city.wonders, allTechs) *
        empireGoldMultOf(Object.values(board.st.cities), city.owner, allTechs);
    // 7j · R-126 · Settle : les GP INSTALLÉS multiplient le rendement de leur
    // cité hôte (+50 % par GP installé de la classe, additif 🔶) — Savant
    // (science) et Grand Explorateur / Industriel (or). Arrondi au plus proche.
    // 7n · R-149 (trait `empireGoldMult` — Aztèques/Espagne/Zoulous
    // Industrielle) : +50 % de production globale d'or — multiplicatif avec
    // les merveilles (miroir C10).
    const gains = {
      gold: Math.round(
        rawGains.gold * goldWonderMult * civEmpireGoldMultOf(player) * settledGpMultiplier(city, 'explorateur'),
      ),
      science: Math.round(rawGains.science * settledGpMultiplier(city, 'savant')),
    };
    // 7n · R-149 (trait Aztèque `templeScience`) : les Temples produisent +3
    // Science par tour dans leur ville (fixe, hors Anarchie — R-122).
    if (!anarchy) gains.science += civBuildingScienceOf(player, city.buildings);
    // 7l · R-134 : la trésorerie d'empire crédite la part OR des villes focus
    // Or (R-90) + bonus empire + or direct des ressources (Gemmes/Or).
    player.treasury += gains.gold + empireBonus.gold + directGold;
    // R-85 (rév. R-134) : la science alimente la tech courante ; le SURPLUS à
    // la complétion est converti 1:1 en or (creditScience) ; sans tech choisie,
    // la réserve `scienceStored` reste inchangée.
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

    // 7i · D1 · R-63 (rév.) : chaque citoyen CONSOMME 1 nourriture par tour —
    // seul le SURPLUS (récolte − population) alimente la réserve. En déficit
    // la réserve se vide et, à 0, la croissance s'arrête — PAS de famine ni
    // de décès (interprétation 🔶 documentée : le doc ne couvre pas la famine).
    // D2 · seuils NON LINÉAIRES (table growth.json, indexée par la population
    // CIBLE — courbe exponentielle 🔶) ; plafond absolu 31 (croissance
    // bloquée au-delà). Aqueduc : seuil réduit d'un tiers (data-driven).
    let growthReduction = 0;
    for (const b of city.buildings) {
      growthReduction = Math.max(growthReduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    }
    // 7n · R-149 (trait Zoulou `croissanceAcceleree`) : réduction de seuil
    // « type Aqueduc » — S'AJOUTE à celle du bâtiment (plafonnée par le
    // plancher de seuil de growthThresholdFor).
    growthReduction += civGrowthReductionOf(player);
    // 7j · R-126 · Settle · Humanitaire : +50 % du taux de croissance (le
    // SURPLUS alimentaire est multiplié, additif 🔶, arrondi au plus proche) ;
    // un déficit n'est PAS amplifié.
    // 7j · R-123 complétée · surplus alimentaire (récolte − population) —
    // alimente aussi l'accumulateur de croissance du Grand Humanitaire
    // (crédité plus bas, surplus > 0 uniquement 🔶).
    const foodSurplus = food - city.pop;
    // 7j · R-126 · Settle · Humanitaire : +50 % du taux de croissance (le
    // SURPLUS alimentaire est multiplié, additif 🔶, arrondi au plus proche) ;
    // un déficit n'est PAS amplifié.
    const settledSurplus = foodSurplus > 0 ? Math.round(foodSurplus * settledGpMultiplier(city, 'humanitaire')) : foodSurplus;
    city.foodStored = Math.max(0, city.foodStored + settledSurplus);
    let threshold = growthThresholdFor(city.pop, growthReduction);
    while (threshold !== null && city.foodStored >= threshold) {
      city.foodStored -= threshold;
      city.pop += 1;
      emit(board, { type: 'PopulationGrew', cityId, owner: city.owner, pop: city.pop, at: { q: city.q, r: city.r } });
      if (city.workedTiles.length < city.pop) fillWorkedTiles(board, city, taken);
      threshold = growthThresholdFor(city.pop, growthReduction);
    }

    // 7f · R-113 : rendement culturel de la ville (scalaire sur la démographie :
    // Palais + Temples/Cathédrales × pop, Stonehenge ×1,5) + bonus empire
    // perCity.culture (R-109) — accumulation PAR VILLE.
    // 7h · R-123 : accumulateurs de GP à rendement par ville (or/science/
    // production) — les mêmes gains que ceux crédités en Phase C, vers le
    // seuil T-30. Gelés en Anarchie (gains déjà à zéro ci-dessus).
    city.gpAccumGold += gains.gold + empireBonus.gold;
    city.gpAccumScience += gains.science + empireBonus.science;
    city.gpAccumProd += production;
    // 7h · R-121/R-122 : culture à zéro pendant l'Anarchie ; Monarchie (Palais
    // ×2) et Communisme (Temples/Cathédrales = 0) via les effets de régime ;
    // Magna Carta (Tribunal +1) via les merveilles (R-125).
    city.cultureStored += anarchy
      ? 0
      : Math.round(
          cultureGains(city, empireBonus.culture, allTechs, govEffects) * // M1/R-128 : union des techs
            settledGpMultiplier(city, 'artiste_penseur'),
        );
    // 7k · C1 (veto d'Erik du 04/09) : le Grand Humanitaire est produit comme
    // les autres GP — PAR LE CANAL CULTURE (R-114/R-127, ciblage technologique
    // et rotation des 6 classes). L'accumulateur `gpAccumFood` n'est plus
    // crédité ni lu (champ conservé DORMANT — compat saves).
    // 7f/7h · R-114/R-123 : seuils de GP — au plus UN GP par ville et par tour
    // (toutes classes confondues), ordre déterministe : culture → science → or
    // → production. Le surplus est conservé (miroir R-63). Posé sur la case de
    // la ville, sinon case adjacente libre (perdu si aucune). GP gelés en
    // Anarchie (R-122). 7k · C2 : le jalon n'est compté que pour le canal
    // culture (`countsAsMilestone`).
    if (!anarchy) {
      // 7n · R-149 (trait `gpFrequents` — Grèce Médiévale, Rome Industrielle) :
      // seuils d'obtention des GP ×0,75 🔶 (canal culture T-27 ET accumulateurs
      // T-30 — la jauge soustraite utilise la MÊME valeur effective).
      const gpMult = civGpThresholdMultOf(player);
      const gpThreshold = Math.round(greatPersonThresholdFor(player.greatPersonsObtained) * gpMult);
      if (city.cultureStored >= gpThreshold) {
        city.cultureStored -= gpThreshold;
        spawnGreatPerson(board, city, greatPersonClassFor(player.researching, player.greatPersonsObtained), true);
      } else if (city.gpAccumScience >= Math.round(yieldGpThresholdFor('savant', player.greatPersonsByType) * gpMult)) {
        city.gpAccumScience -= Math.round(yieldGpThresholdFor('savant', player.greatPersonsByType) * gpMult);
        spawnGreatPerson(board, city, 'savant', false);
      } else if (city.gpAccumGold >= Math.round(yieldGpThresholdFor('explorateur', player.greatPersonsByType) * gpMult)) {
        city.gpAccumGold -= Math.round(yieldGpThresholdFor('explorateur', player.greatPersonsByType) * gpMult);
        spawnGreatPerson(board, city, 'explorateur', false);
      } else if (city.gpAccumProd >= Math.round(yieldGpThresholdFor('batisseur', player.greatPersonsByType) * gpMult)) {
        city.gpAccumProd -= Math.round(yieldGpThresholdFor('batisseur', player.greatPersonsByType) * gpMult);
        spawnGreatPerson(board, city, 'batisseur', false);
      }
    }

    // R-62/R-66 : un seul item, progression conservée ; unité posée sur la
    // case de ville (si libre), bâtiment ajouté à la ville (permanent).
    // 7l · C7 · R-130 (rév.) : la réserve de MARTEAUX est PERMANENTE (plus de
    // dissipation — T-32 abrogé) et finance le projet courant :
    //  - non répétable (bâtiment/merveille) : réserve ≥ coût → complétion
    //    immédiate, le surplus RESTE en réserve (ex. 200 récupérés, bâtiment
    //    80 → produit ce tour, 120 restent) ; réserve < coût → versée dans la
    //    progression (accumulation normale tour par tour ensuite) ;
    //  - répétable (unité) : produite autant de fois que la réserve le permet
    //    (case de ville libre exigée — en attente sinon, la réserve subsiste) ;
    //    le reliquat (< coût) rejoint la progression de l'unité suivante.
    //  Interprétation 🔶 documentée : quand la réserve complète l'item, la
    //  production du tour (sans projet restant) est perdue — miroir « file
    //  vide » R-62 ; le surplus du doc (120 sur 200−80) est reproduit exactement.
    if (city.production) {
      let cost = productionItemCostOf(board.st, city.owner, city.production.item);
      // 7j · R-126 · Settle · Bâtisseur : −50 % de marteaux sur tous les
      // FUTURS BÂTIMENTS de la cité hôte (C6 7l : une instance max par classe).
      if (cost !== null && city.production.item.kind === 'building') {
        cost = Math.max(1, Math.round(cost * settledGpCostFactor(city, 'batisseur')));
      }
      if (cost !== null) {
        // 7f · R-116 (ONU — jalons) et 7l · R-137 (Banque mondiale —
        // trésorerie) : condition non tenue → progression GELÉE (marteaux
        // conservés — miroir de suspension).
        const wonderData = city.production.item.kind === 'wonder' ? WONDERS[city.production.item.id] : undefined;
        const frozen =
          city.production.item.kind === 'wonder' &&
          ((wonderData?.cultureVictory === true && player.cultureMilestones < CULTURE.milestonesTarget) ||
            (typeof wonderData?.treasuryRequired === 'number' && player.treasury < wonderData.treasuryRequired));
        if (!frozen) {
          const item = city.production.item;
          if (item.kind === 'unit') {
            // C7 : autant d'unités que la réserve le permet...
            let placeable = true;
            while (city.pendingSalvage >= cost && placeable) {
              placeable = produceUnitFromReserve(board, city, item.id, true); // série C7 : adjacente autorisée
              if (placeable) city.pendingSalvage -= cost;
            }
            // ... puis le reliquat rejoint la progression de l'unité suivante.
            if (city.pendingSalvage > 0 && placeable && city.production) {
              city.production.progress += city.pendingSalvage;
              city.pendingSalvage = 0;
            }
          } else if (city.pendingSalvage >= cost) {
            // Non répétable : complété immédiatement depuis la réserve — le
            // surplus RESTE en réserve (C7).
            city.pendingSalvage -= cost;
            completeProductionNow(board, city);
          } else if (city.pendingSalvage > 0) {
            // Réserve < coût : versée dans la progression (accumulation
            // normale tour par tour ensuite).
            city.production.progress += city.pendingSalvage;
            city.pendingSalvage = 0;
          }
        }
        // Accumulation normale + complétion standard (si un projet subsiste).
        if (city.production && !frozen) {
          city.production.progress += production;
          if (city.production.progress >= cost) {
            if (city.production.item.kind === 'unit') {
              // Même pose que la réserve C7 : case de ville, coût pop R-112
              // (République : 1 — R-121) ; en attente sinon (progression
              // plafonnée au coût — excessif perdu, 🔶 conservé de 7i).
              if (produceUnitFromReserve(board, city, city.production.item.id, false)) {
                city.production = null; // 🔶 file vidée après complétion
              } else {
                city.production.progress = cost; // en attente (case occupée ou pop insuffisante)
              }
            } else if (city.production.item.kind === 'wonder') {
              // 7f · R-115/R-116 (rév. 7k/7l) : logique UNIQUE completeWonder —
              // exclusivité MONDIALE (R-129 + départage C8), récupération en
              // réserve PERMANENTE (R-130/C7), jalon (R-131), effets R-132,
              // ONU (victoire culturelle R-116) et Banque mondiale (victoire
              // économique R-137 — l'or n'est PAS débité).
              completeWonder(board, city, city.production.item.id);
            } else {
              // Bâtiment (R-66) : permanent, non duplicable, remplacement R-111.
              grantBuildingToCity(board, city, city.production.item.id);
              city.production = null;
            }
          }
        }
      } else {
        city.production = null; // item inconnu : file purgée
      }
    }
  }
}

/**
 * 7l · C8 · R-129 (rév.) · Départage des complétions SIMULTANÉES d'une même
 * merveille : gagne le chantier avec le PLUS de marteaux en surplus
 * (investi − coût — un déficit plus faible l'emporte : chantier le plus
 * avancé) ; le perdant récupère l'ENTIÈRETÉ de ses marteaux (bascule en
 * réserve permanente C7 — `pendingSalvage` cumulé) ; ÉGALITÉ de surplus →
 * `cityId` croissant (R-81). Évalué AVANT toute complétion de la résolution
 * (entrées économiques précalculées) ; les complétions immédiates (rush-buy
 * R-135, Bâtisseur R-126) précèdent la boucle de production et ne participent
 * pas au départage (interprétation documentée : actions explicites du tour).
 */
function resolveWonderRaces(board: Board, inputs: Map<CityId, CityEconomyInputs>): void {
  const allTechs = allKnownTechs(board.st);
  interface Racer {
    cityId: CityId;
    wonderId: string;
    invested: number;
    surplus: number;
  }
  const candidates: Racer[] = [];
  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const prod = city.production;
    if (!prod || prod.item.kind !== 'wonder') continue;
    const wonderData = WONDERS[prod.item.id];
    if (!wonderData) continue;
    if (Object.values(board.st.cities).some((c) => c.wonders.includes(prod.item.id))) continue; // déjà bâtie (R-129)
    const player = board.st.players[city.owner]!;
    if (wonderData.cultureVictory && player.cultureMilestones < CULTURE.milestonesTarget) continue; // ONU suspendue (R-116)
    if (typeof wonderData.treasuryRequired === 'number' && player.treasury < wonderData.treasuryRequired) continue; // BM gelée (R-137)
    const cost = productionItemCostOf(board.st, city.owner, prod.item);
    if (cost === null) continue;
    const invested = prod.progress + (inputs.get(cityId)?.production ?? 0) + city.pendingSalvage;
    if (invested < cost) continue;
    candidates.push({ cityId, wonderId: prod.item.id, invested, surplus: invested - cost });
  }
  for (const wonderId of [...new Set(candidates.map((c) => c.wonderId))].sort()) {
    const racers = candidates.filter((c) => c.wonderId === wonderId);
    if (racers.length < 2) continue; // un seul prétendant : chemin normal
    const winner = [...racers].sort((a, b) => b.surplus - a.surplus || compareCityIds(a.cityId, b.cityId))[0]!;
    for (const racer of racers) {
      if (racer.cityId === winner.cityId) continue;
      const city = board.st.cities[racer.cityId]!;
      city.production = null;
      city.pendingSalvage += racer.invested; // l'entièreté — réserve permanente (C7)
      emit(board, {
        type: 'HammerSalvage',
        cityId: city.id,
        owner: city.owner,
        wonder: wonderId,
        amount: racer.invested,
        outcome: 'available',
      });
    }
  }
}

/**
 * 7l · R-134/R-136 · Trésorerie d'empire — fin de Phase C :
 *  1. intérêts passifs (2 % 🔶 — hook trait 7n, désactivé sans trait) ;
 *  2. paliers économiques : chaque palier est accordé UNE SEULE FOIS, dans
 *     l'ordre des seuils, quand la trésorerie le franchit (plusieurs paliers
 *     possibles le même tour — grand saut compris ; compteur joueur
 *     `economyMilestonesClaimed`).
 */
function processTreasury(board: Board): void {
  for (const playerId of Object.keys(board.st.players).sort()) {
    const player = board.st.players[playerId]!;
    // Intérêts 2 % (hook 7n — aucun trait avant le système de civilisations).
    player.treasury += treasuryInterestOf(player);
    // Paliers économiques (R-136 — ladder economy.json).
    let claimed = player.economyMilestonesClaimed;
    while (claimed < ECONOMY.milestones.length) {
      const milestone = ECONOMY.milestones[claimed]!;
      if (player.treasury < milestone.threshold) break;
      applyEconomyMilestone(board, player, playerId, milestone);
      claimed += 1;
      player.economyMilestonesClaimed = claimed;
    }
  }
}

/**
 * 7l · R-136 · Récompense d'un palier économique (data-driven economy.json).
 * Bâtiments gratuits : règles R-66/R-111 (déjà possédé = saute, remplacement
 * applicable — `grantBuildingToCity`) ; citoyens des villes grossies
 * auto-assignés (R-60) ; Colon/ GP posés à la capitale (sinon première ville),
 * case libre sinon adjacente (perdus si aucune — miroir R-114) ; le GP suit
 * le ciblage technologique R-127 🔶 et ne compte PAS comme jalon (miroir C2 :
 * seuls les GP du canal culture comptent). Les événements d'effet suivent
 * l'événement EconomyMilestone.
 */
function applyEconomyMilestone(
  board: Board,
  player: Player,
  playerId: PlayerId,
  milestone: { threshold: number; reward: string; label: string; building?: string; unit?: string },
): void {
  emit(board, {
    type: 'EconomyMilestone',
    player: playerId,
    threshold: milestone.threshold,
    reward: milestone.reward,
    label: milestone.label,
  });
  const ownCities = Object.values(board.st.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || compareCityIds(a.id, b.id));
  const capital = ownCities.find((c) => c.capital) ?? ownCities[0] ?? null;
  switch (milestone.reward) {
    case 'settler': {
      // Colon GRATUIT (sans coût pop — récompense) : case de la capitale,
      // sinon adjacente libre (perdu si aucune — interprétation miroir R-114).
      if (!capital || !milestone.unit) break;
      const hex = { q: capital.q, r: capital.r };
      const spot = occupiedByUnit(board, hex) ? (freeSpawnTiles(board.st, hex, 1)[0] ?? null) : hex;
      if (!spot) break; // aucune case : perdu (interprétation documentée)
      const stats = unitType(milestone.unit);
      const unitId = nextId(board.st.units, 'u');
      board.st.units[unitId] = {
        id: unitId,
        type: milestone.unit,
        owner: playerId,
        q: spot.q,
        r: spot.r,
        hp: stats.hpMax,
        mp: stats.movement,
        veteran: false,
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
        aboard: null,
        cargo: null,
      };
      emit(board, {
        type: 'UnitProduced',
        unitId,
        cityId: capital.id,
        owner: playerId,
        unitType: milestone.unit,
        at: spot,
      });
      break;
    }
    case 'tech': {
      // Tech économique gratuite (Monnaie, sinon Bancaire — première non
      // débloquée) ; octroi DIRECT (ni firstBy ni récompense Premier
      // découvrir — comme Oxford/Apollo, R-132).
      const techId = milestoneTechFor(player.techsUnlocked);
      if (techId) grantTech(board, playerId, techId);
      break;
    }
    case 'greatPerson': {
      // GP gratuit (canaux or 500 / 10 000 — doc GP confirmé) : capitale,
      // classe par ciblage technologique R-127, SANS jalon (miroir C2).
      if (capital) spawnGreatPerson(board, capital, greatPersonClassFor(player.researching, player.greatPersonsObtained), false);
      break;
    }
    case 'granary':
    case 'aqueduct': {
      if (!milestone.building) break;
      for (const c of ownCities) grantBuildingToCity(board, c, milestone.building);
      break;
    }
    case 'population': {
      // +1 Population dans toutes les villes (citoyens auto-assignés — R-60) ;
      // plafond 31 respecté 🔶 (miroir R-63).
      for (const c of ownCities) {
        if (c.pop >= populationCap()) continue;
        c.pop += 1;
        const taken = takenTilesExcluding(board, c.id);
        fillWorkedTiles(board, c, taken);
        emit(board, { type: 'PopulationGrew', cityId: c.id, owner: playerId, pop: c.pop, at: { q: c.q, r: c.r } });
      }
      break;
    }
    case 'worldBank':
      // Rien à poser : la Banque mondiale devient disponible via la condition
      // DYNAMIQUE de trésorerie (R-137) — le palier marque le moment.
      break;
    default:
      break; // récompense inconnue (données éditées) : événement seul
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
    unit.mp = maxMovementOf(board.st, unit.owner, unit.type); // R-72 + 7n · R-149 (bonus mouvement civ)
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
  // 7h · R-122 : la fenêtre d'adoption sans Anarchie porte sur les techs
  // complétées pendant CETTE résolution (le conseiller invite au tour suivant).
  for (const playerId of Object.keys(st.players).sort()) {
    st.players[playerId]!.techsUnlockedThisTurn = [];
  }

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
    // 7k · R-132 · Grande Muraille : l'adversaire d'un empire protégé ne peut
    // pas attaquer ses unités ni ses villes — l'ordre est un fizzle SANS
    // consommation de PM (la cible existe, l'attaque est interdite).
    if (wonderBlocksEnemyAttacks(Object.values(st.cities), enemy.owner, allKnownTechs(st))) continue;
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
  applyLaunches(board, allOrders); // 7m · R-139 : frappes nucléaires (en tête de Phase C)
  applySetProduction(board, allOrders);
  applyRushBuys(board, allOrders); // 7l · R-135 : achat instantané (avant l'économie)
  applyGreatPersonActions(board, allOrders); // 7j · R-126 (alias InstallPerson R-115)
  applySpyMissions(board, allOrders); // 7g · R-119
  applySpyActions(board, allOrders); // 7m · R-143 : actions d'espionnage en ville ennemie
  processCityCaptures(board);
  processFoundCity(board, allOrders);
  processVillages(board);
  applySetWorkedTile(board, allOrders);
  // 7l · C7 · R-130 (rév.) : PLUS de dissipation — la réserve de marteaux est
  // permanente (T-32 abrogé) ; elle finance les projets en Phase C.
  processEconomy(board);
  // 7n · R-147 : transitions d'ÈRE par comptage de techs (au tour suivant,
  // techs gratuites du palier, événement EraChanged).
  processEraChanges(board);
  // 7l · R-134/R-136 : intérêts de trésorerie (hook 7n) puis paliers
  // économiques (une seule fois chacun, dans l'ordre des seuils).
  processTreasury(board);
  // 7k · R-132 : effets continus de merveilles (Grande Bibliothèque — ≥ 2 rivaux).
  processWonderEffects(board);
  // 7h · R-123 : GP Leader au seuil T-31 de victoires de combat (spawn capitale).
  checkLeaderGreatPerson(board);
  // 7h · R-124 : victoire scientifique — les 4 composants du vaisseau contrôlés.
  checkScienceVictory(board);

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
