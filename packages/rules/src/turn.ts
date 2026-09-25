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
 *   arrêt, repris au tour suivant) ; les autres ordres sont consommés.
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
import { areAtWar, compareCityIds, compareIds, compareUnitIds, isBarbarian, nextId, allKnownTechs, activePlayerIds } from './state.js';
import type { BarbarianVillage, City, CityId, GameState, Order, Player, PlayerId, ProductionItem, TileKey, Unit, UnitId } from './state.js';
import { BARBARIAN_ID, BARBARIANS, CULTURE, DEPLACEMENT, TERRAINS, unitType, building, BUILDINGS, HUT_REWARDS, RESOURCES, isWaterTerrain, isSpyUnit } from './data.js';
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
} from './constants.js';
import type { DestructionCause, GameEvent, GpCanal, HutReward } from './events.js';
import { creditScience } from './research.js';
import { conversionGains, CONVERSION_DEFAULT, goldMultOf, scienceMultOf } from './conversion.js';
import { WONDERS, TECHS, canSetProduction, buildingCostDiscount, isUnitObsolete, unitReplacementFor } from './techs.js';
import type { WonderData } from './types.js';
import {
  cultureGains,
  cultureEmpireOf,
  villeLaPlusCultivee,
  greatPersonThresholdFor,
  greatPersonClassTire,
  GP_CULTURE_SEED_SALT,
  isWonderObsolete,
  goldMilestoneGpClass,
  settledGpMultiplier,
  settledGpCostFactor,
  settledGreatPersonsOfCities,
  isGreatPersonType,
  leaderGpVictoriesNeeded,
  wonderProductionIssue,
  wonderAttackBonusEmpireOf,
  wonderBlocksEnemyAttacks,
  wondersOwnedBy,
  cityGoldMultOf,
  empireGoldMultOf,
  militaryCostMultOf,
} from './culture.js';
import { effectsFor, isInAnarchy, landCombatBonus, populationCostOf } from './governments.js';
import { prochainNomVille } from './noms.js'; // MENU-VILLE : noms VilleN (compteur par joueur)
import { applyCapitalStartBonuses } from './civStartBonus.js'; // CIV-CAPITALE-FONDEE
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
  civGrowthThresholdDivisorOf,
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
// ENGAGEMENT · R-180 : mêlée pondérée + étau (T-54/T-55).
import { drawWeightedMelee, meleeTauMultiplier } from './melee.js';
import { MELEE_LOSER_DAMAGE, MELEE_MIDDLE_DAMAGE } from './constants.js';
import type { ArtefactActivationContext } from './artefacts.js';
// HANDOFF-TRACE-RESOLUTION · collecteur de trace passif (défaut absent = zéro coût).
import { TraceCollector } from './trace.js';
import type { TracePhaseId } from './trace.js';

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
  /** R-159 rév. B : entrée RETENUE — l'attaquant entre à son tour R-177 (P1). */
  latent?: boolean;
}
/** R-96 (rév. ENGAGEMENT) · Entrée sur la case du camp barbare : le GARDIEN défend (attaque normale). */
interface VillageAttackPlan {
  kind: 'villageAttack';
  at: Hex;
  attackerId: UnitId;
  villageId: string;
  /** R-159 rév. B : entrée RETENUE — l'attaquant entre à son tour R-177 (P1). */
  latent?: boolean;
}
type CombatPlan = AttackPlan | VillageAttackPlan;

interface FormGroup {
  members: UnitId[];
  rally: Hex;
}

/** État de travail mutable pendant la résolution (copie profonde de l'état). */
interface Board {
  st: GameState;
  rng: SeededRng;
  seq: number;
  events: GameEvent[];
  planned: CombatPlan[];
  /** Position de chaque unité au début du tour (R-176a : échange au passage). */
  origin: Map<UnitId, Hex>;
  /** Unités ayant exécuté ≥ 1 pas ce tour (R-42 ; R-175 : perte des bonus, R-177 : ordre d'attaque). */
  moved: Set<UnitId>;
  /** Cases parcourues ce tour (tie-break R-177-d). */
  steps: Map<UnitId, number>;
  /** Unités ayant participé à un échange de combat (R-71 : pas de soin). */
  fought: Set<UnitId>;
  /** Groupes FormArmy de ce tour (co-location transitoire, R-44). */
  formGroups: Map<UnitId, FormGroup>;
  /**
   * Villes dont les citoyens doivent être auto-assignés en Phase C : fondation
   * et capture uniquement (R-60). Une désassignation manuelle ou une case devenue
   * invalide LIBÈRE un citoyen sans re-remplissage (règle d'Erik : le joueur
   * réassigne explicitement).
   */
  pendingFill: Set<CityId>;
  /**
   * DEPLACEMENT-PLANIFIE · R-161 (D6) : unités ayant DÉJÀ entré une case
   * INCONNUE (non explorée) ce tour — la limite `fogUnknownEntriesPerTurn`
   * interdit une seconde entrée (l'unité s'arrête).
   */
  unknownEntered: Set<UnitId>;
  /** R-161 : cases explorées par joueur en début de tour (référence du fog). */
  explored: Map<PlayerId, Set<TileKey>>;
  /**
   * R-178 rév. A (décision d'Erik du 17/09) : cases où un DÉFENSEUR STABILISÉ
   * a été attaqué ce tour — la mêlée d'instabilité y est REPORTÉE au tour
   * suivant (les entrants se contentent de leurs attaques R-176/R-177).
   */
  meleeDifferees: Set<TileKey>;
  /**
   * R-159 rév. B (décision d'Erik du 17/09) : entrées PHYSIQUES de ce tour —
   * case → propriétaires y ayant déplacé une unité (mouvement, attaque de
   * mêlée, débarquement). Suspend la dispersion d'une pile amie (H2/H3) et
   * légalise l'entrée d'une unité retenue.
   */
  entrees: Map<TileKey, Set<PlayerId>>;
  /**
   * R-159 rév. B : cases (clé `owner|q,r`) visées par ≥ 2 attaquants du MÊME
   * camp ce tour (chemins aboutissant + ordres Attack explicites) — l'entrée
   * y est RETENUE et séquencée en Phase B dans l'ordre R-177 (la mort du
   * défenseur ferme la porte aux suivants du même camp, P1).
   */
  coAttaquees: Set<string>;
  /**
   * R-159 rév. B : cases (clé `owner|q,r`) où UN ennemi peut se trouver à la
   * résolution (occupant ennemi au départ, chemin ennemi aboutissant, ordre
   * Attack ennemi) — condition de légalité de la co-destination amie.
   */
  potentielEnnemi: Set<string>;
  /**
   * R-159 rév. B : unités RETENUES devant leur case d'entrée (dernier pas non
   * payé) — activées à leur tour R-177 (attaque latente) ou après la Phase B
   * (renfort / jointure d'instabilité, ordre de priorité de programmation).
   */
  retenus: Array<{ unitId: UnitId; at: Hex; priorite: number; active: boolean }>;
  /**
   * R-158 (D5) : actions finales multi-étapes à exécuter en Phase C — unité
   * ayant atteint le terme de son chemin composite avec les PM requis.
   */
  finalActions: Map<UnitId, 'foundCity'>;
  /**
   * HANDOFF-TRACE-RESOLUTION : récolteur passif (null = instrumentation
   * absente, zéro coût — aucun comportement, RNG ni ordre modifiés).
   */
  trace: TraceCollector | null;
  /** Étiquette d'usage du prochain roll (compte de seed — trace uniquement). */
  traceUsage: string;
  /** Phase courante pour l'attribution des décisions (trace uniquement). */
  tracePhase: TracePhaseId;
}

/**
 * RNG TRACÉ : même mulberry32, chaque next() rapporté au collecteur avec
 * l'étiquette d'usage courante. Zéro influence : la suite des valeurs est
 * bit à bit identique (le wrapper ne consomme rien de plus).
 */
function rngTrace(board: Board): void {
  const base = board.rng;
  board.rng = {
    next(): number {
      const v = base.next();
      board.trace?.roll(v, board.traceUsage);
      return v;
    },
    nextInt(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
    get state(): number {
      return base.state;
    },
  };
}

/** Trace une décision si le récolteur est présent (zéro coût sinon). */
function decide(board: Board, kind: string, rule: string, ligne: string, detail?: Record<string, unknown>): void {
  board.trace?.decide(board.tracePhase, kind, rule, ligne, detail);
}

/** Roll tracé d'un tirage : étiquette d'usage posée autour de l'appel. */
function rollTrace(board: Board, usage: string, tirer: () => number): number {
  const prev = board.traceUsage;
  board.traceUsage = usage;
  const v = board.rng.next();
  board.traceUsage = prev;
  return v;
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

/**
 * ENGAGEMENT · R-174 · Le défenseur d'une case = son unité STABILISÉE (seule
 * occupante en fin du tour précédent, R-173). Une case instable n'a AUCUN
 * défenseur : les unités qui y entrent ne combattent pas en Phase B — elles
 * rejoignent l'instabilité, résolue en Phase E par la mêlée pondérée
 * (R-178/R-180).
 * Cas de double marquage (co-location de deux stabilisées en cours de Phase A,
 * ex. une unité amie qui rejoint la case d'une autre) : défense décroissante,
 * puis PV décroissants, puis unitId croissant (R-81).
 */
function defenseurStabilise(board: Board, hex: Hex, ennemiDe: PlayerId): Unit | null {
  const ici = occupants(board, hex).filter((u) => u.stabilized && u.owner !== ennemiDe);
  if (ici.length === 0) return null;
  const tri = [...ici].sort(
    (a, b) =>
      unitType(b.type).defense - unitType(a.type).defense ||
      b.hp - a.hp ||
      compareUnitIds(a.id, b.id),
  );
  // TRACE · choix du défenseur : les valeurs comparées (défense, PV, R-81).
  if (board.trace && tri.length > 1) {
    decide(board, 'choix-defenseur', 'R-174', `Défenseur de (${hex.q},${hex.r}) : ${tri[0]!.id} (défense ${unitType(tri[0]!.type).defense}, PV ${tri[0]!.hp}) — comparé à ${tri.slice(1).map((u) => `${u.id} (défense ${unitType(u.type).defense}, PV ${u.hp})`).join(', ')}`, {
      case: hex, elu: tri[0]!.id, candidats: ici.map((u) => ({ id: u.id, defense: unitType(u.type).defense, hp: u.hp })),
    });
  }
  return tri[0]!;
}

/**
 * R-159 rév. B (H2, Erik 17/09) : occupante militaire ENNEMIE la mieux fondée
 * d'une case — cible d'un tir à distance quand la case ne porte pas de
 * défenseur stabilisé (pile instable) : fortifiée d'abord, puis plus de PV,
 * puis unitId croissant (R-81). Les pacifiques ne sont jamais ciblées (R-43 :
 * capture — jamais de combat).
 */
function mieuxFondeeSur(board: Board, hex: Hex, attaquant: PlayerId): Unit | null {
  const candidats = occupants(board, hex)
    .filter((u) => u.owner !== attaquant && !isPeaceful(u));
  const elue = candidats.sort(
    (a, b) =>
      Number(b.fortified) - Number(a.fortified) ||
      b.hp - a.hp ||
      compareUnitIds(a.id, b.id),
  )[0] ?? null;
  // TRACE · R-159-d : la cible d'un tir sur pile, valeurs comparées.
  if (board.trace && candidats.length > 1 && elue) {
    decide(board, 'choix-cible-tir', 'R-159-d', `Tir sur pile (${hex.q},${hex.r}) sans défenseur stabilisé : cible ${elue.id} (fortifiée ${elue.fortified}, PV ${elue.hp}) — mieux fondée (fortifiée > PV > R-81)`, {
      case: hex, elue: elue.id, candidats: candidats.map((u) => ({ id: u.id, fortified: u.fortified, hp: u.hp })),
    });
  }
  return elue;
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
      cultureCumulee: 0, // EXPANSION-CULTURELLE phase 1 : cumul jamais consommé
      wonders: [],
      pendingSalvage: 0,
      settledGreatPersons: [],
      wasCaptured: false,
      name: prochainNomVille(board.st.cities, opener.owner, civIdOf(player)), // MENU-VILLE
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
  board.traceUsage = 'récompense hutte (R-98)';
  const reward: HutReward = drawHutReward(board.rng);
  board.traceUsage = '';

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
          stabilized: false, // ENGAGEMENT · R-173
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
  // R-161 (D6) : l'entrée sur une case INCONNUE (non explorée en début de
  // tour) est mémorisée — la limite `fogUnknownEntriesPerTurn` (deplacement.json)
  // interdit toute poursuite au-delà (l'unité s'y arrête). Un joueur SANS
  // cases explorées (fixtures — fog non modélisé) n'est pas soumis à la limite.
  if (board.explored.get(unit.owner)?.has(tileKeyOf(to)) === false) {
    board.unknownEntered.add(unit.id);
  }
  const from = { q: unit.q, r: unit.r };
  unit.q = to.q;
  unit.r = to.r;
  // ENGAGEMENT · R-173/R-175 : tout déplacement fait perdre la stabilisation
  // ET la fortification (elle ne demeure que sur la case occupée).
  unit.stabilized = false;
  unit.fortified = false;
  // R-159 rév. B : entrée PHYSIQUE enregistrée (suspend la dispersion d'une
  // pile amie, H2/H3, et légalise l'entrée des unités retenues).
  {
    const cleEntree = tileKeyOf(to);
    const set = board.entrees.get(cleEntree) ?? new Set<PlayerId>();
    set.add(unit.owner);
    board.entrees.set(cleEntree, set);
  }
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
  // CARTE-MULTI : dernière entité perdue → élimination par annihilation.
  verifierAnnihilation(board, unit.owner);
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
  // ENGAGEMENT · R-174/R-175 : la fortification est ACQUISE par l'ordre
  // Fortify — réservé à l'unité STABILISÉE (une unité instable ne se
  // fortifie pas, ordre ignoré) — puis CONSERVÉE tant que l'unité est en vie
  // et demeure sur sa case (même en mêlée, même combat). Elle est perdue par
  // tout déplacement (moveUnit) — plus par le type d'ordre reçu.
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'Fortify') continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue; // consigne ennemie ignorée
      if (!unit.stabilized) continue; // R-174 : réservé au stabilisé
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
// Phase B — combats planifiés (RULES.md §7, contrat ENGAGEMENT R-176/R-177)
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
  // ENGAGEMENT · R-174 : le défenseur STABILISÉ (seul occupant d'une case
  // stable au tour précédent) utilise ses VALEURS DE DÉFENSE ; toute autre
  // unité attaquée utilise ses VALEURS D'ATTAQUE (#4 de la spécification).
  // ENGAGEMENT · R-175 : les BONUS (terrain T-02/forêt/colline, fortification
  // T-17, bâtiments de ville) sont conservés tant que l'unité DEMEURE sur sa
  // case (elle n'a pas bougé ce tour) — même hors stabilisation, même en
  // cohabitation : c'est l'avantage de l'occupation du terrain.
  const stabilise = defender.stabilized;
  const demeure = !board.moved.has(defender.id);
  const baseDefense = stabilise
    ? dStats.defense + civUnitStatBonusOf(defPlayer, 'unitDefense', defender.type)
    : dStats.attack + civUnitStatBonusOf(defPlayer, 'unitAttack', defender.type);
  const bonusDefense =
    stabilise || (defender.fortified && demeure)
      ? terrainDefenseBonus(board, combatTile) +
        (defender.fortified ? FORTIFY_DEFENSE_BONUS : 0) +
        cityBuildingDefenseBonus(board, combatTile, defender.owner)
      : 0;
  const sDef = effectiveStrength(
    baseDefense,
    defender.veteran,
    bonusDefense,
  ) + (defPlayer && !defAnarchy ? landCombatBonus(effectsFor(defPlayer), dStats, 'defense') : 0);
  return { sAtt, sDef, sAttBase };
}

/**
 * Un échange (T-03 rounds). R-59-b : un défenseur non-à-distance ne riposte
 * jamais contre une unité à distance ; interprétation (documentée, 🔶) : le
 * round lui retire alors directement 1 PV (p = 1 côté attaquant), ce qui
 * garantit la terminaison de l'échange (« chaque itération retire ≥ 1 PV »).
 */
function performExchange(board: Board, attacker: Unit, defender: Unit, combatTile: Hex): void {
  const aStats = unitType(attacker.type);
  const dStats = unitType(defender.type);
  const noRiposte = isRanged(attacker) && !isRanged(defender);
  const { sAtt, sDef } = combatStrengthsOf(board, attacker, defender, combatTile);
  const pTouche = sAtt * sAtt / (sAtt * sAtt + sDef * sDef);
  for (let i = 0; i < EXCHANGES_PER_ATTACK && attacker.hp > 0 && defender.hp > 0; i++) {
    if (noRiposte) {
      defender.hp -= 1;
      continue;
    }
    const winner = combatRound(
      sAtt,
      sDef,
      rollTrace(board, `combat att=${attacker.id} def=${defender.id} round=${i + 1}/${EXCHANGES_PER_ATTACK} p(att)=${pTouche.toFixed(3)}`, () => board.rng.next()),
    );
    if (winner === 'defender') defender.hp -= 1;
    else attacker.hp -= 1;
  }
  attacker.hp = Math.max(0, attacker.hp);
  defender.hp = Math.max(0, defender.hp);
  decide(board, 'echange', 'R-51', `Échange att=${attacker.id} (S_att ${sAtt.toFixed(2)}) vs def=${defender.id} (S_def ${sDef.toFixed(2)}) — p(touche att)=${pTouche.toFixed(3)} → PV att ${attacker.hp}, PV def ${defender.hp}`, {
    attaquant: attacker.id, defenseur: defender.id, sAtt, sDef, pTouche,
    pvAttaquant: attacker.hp, pvDefenseur: defender.hp, sansRiposte: noRiposte,
  });
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
 * Attaque d'un défenseur (R-176 : les entrants ne combattent QUE le défenseur
 * stabilisé ; survie mutuelle = cohabitation → mêlée en Phase E) et cas R-59.
 */
function resolveAttack(board: Board, attacker: Unit, defender: Unit, combatTile: Hex): void {
  // R-43/R-57 : défenseur pacifique → capture, jamais de combat.
  if (isPeaceful(defender)) {
    capturePeaceful(board, defender, attacker.owner, attacker.id);
    if (board.st.units[attacker.id]) advanceIfMelee(board, attacker, combatTile);
    return;
  }
  // R-58-b / I-1 (hook, inactif en v1) : nation en paix — l'échange se
  // déroule normalement (ENGAGEMENT : plus de repli mutuel) + incident
  // diplomatique, sans rupture de paix.
  if (!areAtWar(board.st, attacker.owner, defender.owner)) {
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
      decide(board, 'overrun', 'R-149', `ÉCRASEMENT : ${attacker.id} (S_att base ${sAttBase.toFixed(2)}) ≥ ratio × S_def ${sDef.toFixed(2)} — ${defender.id} détruit instantanément (aucun round R-51)`, {
        attaquant: attacker.id, defenseur: defender.id, sAttBase, sDef,
      });
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
  // ENGAGEMENT · fin des replis (R-54/R-55/R-56 abrogées) : survie mutuelle =
  // COHABITATION. Les deux unités demeurent sur la case ; l'instabilité qui en
  // résulte est résolue en Phase E par la mêlée pondérée (R-180/R-181).
  // R-59-a : l'attaquant à distance est déjà resté sur sa case ; R-59-d est
  // ABROGÉE — le défenseur à distance qui ne vainc pas cohabite aussi.
  return;
}

// ---------------------------------------------------------------------------
// Attaque d'un camp barbare (R-96 rév. ENGAGEMENT · R-183 : le gardien défend)
// ---------------------------------------------------------------------------

/**
 * ENGAGEMENT · R-183 : le camp est tenu par son GARDIEN — le plus ancien
 * barbare vivant SUR LA CASE MÊME du village (tri R-81, unitId croissant).
 * Les satellites demeurent dans le rayon d'une case (cases adjacentes) et ne
 * défendent pas la case du camp elle-même.
 */
function gardienDuCamp(board: Board, village: BarbarianVillage): Unit | null {
  const surCase = Object.keys(board.st.units)
    .sort(compareUnitIds)
    .map((id) => board.st.units[id]!)
    .filter((u) => u.owner === BARBARIAN_ID && u.q === village.q && u.r === village.r);
  return surCase[0] ?? null;
}

/**
 * ENGAGEMENT · R-183 · Capture du camp : mort du GARDIEN — le vainqueur (déjà
 * entré sur la case en Phase A) l'occupe, le camp est DÉTRUIT (nettoyé de
 * l'état) et la récompense est le BONUS ALÉATOIRE DES HUTTES (table pondérée
 * huttes.json, tirage seedé au RNG de résolution — même philosophie que
 * l'ouverture de hutte R-98). Événements journal : VillageDestroyed +
 * VillageLooted.
 */
function captureCamp(board: Board, village: BarbarianVillage, winner: Unit): void {
  board.st.villages = board.st.villages.filter((v) => v.id !== village.id);
  emit(board, {
    type: 'VillageDestroyed',
    villageId: village.id,
    byPlayer: winner.owner,
    byUnitId: winner.id,
    at: { q: village.q, r: village.r },
  });
  winner.veteran = true; // R-32 : coup fatal
  recordCombatVictory(board, winner); // 7h · R-123 (T-31) + soin Aztèque
  board.traceUsage = 'récompense camp (R-183)';
  const reward: HutReward = drawHutReward(board.rng);
  board.traceUsage = '';
  applyCampReward(board, winner, { q: village.q, r: village.r }, reward);
  emit(board, {
    type: 'VillageLooted',
    villageId: village.id,
    byPlayer: winner.owner,
    byUnitId: winner.id,
    at: { q: village.q, r: village.r },
    reward,
  });
}

/**
 * Application de la récompense de capture (miroir R-98 de `openHutAt`, sans
 * hutte) : or (×trait Espagnol), unité gratuite (case adjacente libre — perdue
 * si aucune), science, révélation, indice d'artefact. Le kind `ambush`
 * (poids 0 — table R-98) est SANS EFFET pour une capture de camp : engendrer
 * des barbares sur un camp qui vient d'être purgé n'a pas de sens (choix
 * documenté au rapport).
 */
function applyCampReward(board: Board, winner: Unit, campHex: Hex, reward: HutReward): void {
  const player = board.st.players[winner.owner];
  if (!player) return;
  switch (reward.kind) {
    case 'gold':
      player.treasury += reward.amount * civHutGoldMultOf(player);
      break;
    case 'unit': {
      const tile = freeSpawnTiles(board.st, campHex, 1)[0];
      if (tile) {
        const effectiveType = effectiveUnitTypeFor(board.st, winner.owner, HUT_REWARDS.freeUnit);
        const stats = unitType(effectiveType);
        const unitId = nextId(board.st.units, 'u');
        board.st.units[unitId] = {
          id: unitId,
          type: effectiveType,
          owner: winner.owner,
          q: tile.q,
          r: tile.r,
          hp: stats.hpMax,
          mp: maxMovementOf(board.st, winner.owner, effectiveType),
          veteran: civVeteranUnitsOf(player).has(HUT_REWARDS.freeUnit) || civVeteranUnitsOf(player).has(effectiveType),
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          stabilized: false, // ENGAGEMENT · R-173
          aboard: null,
          cargo: null,
        };
        reward.unitIds = [unitId];
      }
      break;
    }
    case 'science':
      creditScience(board.st, winner.owner, reward.amount, (pid, techId) => {
        emit(board, { type: 'TechResearched', player: pid, tech: techId });
      });
      break;
    case 'reveal': {
      const explored = new Set(player.vision.explored);
      for (const h of hexesWithinRadius(campHex, reward.radius)) {
        if (board.st.map[tileKeyOf(h)]) explored.add(tileKeyOf(h));
      }
      player.vision = { explored: [...explored].sort(), visible: player.vision.visible };
      break;
    }
    case 'artefact_indice': {
      const hint = applyArtefactIndiceReward(board.st, winner.owner, campHex, board.rng);
      reward.remaining = hint.remaining;
      if (hint.position) reward.position = hint.position;
      break;
    }
    case 'ambush':
    case 'nothing':
      break;
  }
}

/**
 * ENGAGEMENT · R-183 · Attaque du camp = UN combat contre le GARDIEN (le plus
 * ancien barbare vivant sur la case du village — R-81) : combat complet
 * R-51/R-52. À la mort du gardien, le camp est capturé (`captureCamp`). En
 * survie mutuelle, les deux cohabitent et l'instabilité sera résolue en
 * Phase E (mêlée pondérée — R-181/D4). Le camp n'est jamais ciblé en soi
 * (plus de PV — `villageExchange` supprimé).
 */
function resolveVillageAttack(board: Board, attacker: Unit, village: BarbarianVillage, combatTile: Hex): void {
  // ENGAGEMENT · R-183 : plus d'assaut un par un — le gardien encaisse UNE
  // attaque (combat complet R-51/R-52). À sa mort, le camp est capturé
  // (récompense hutte seedée) ; en survie mutuelle, les deux cohabitent et
  // l'instabilité sera résolue en Phase E (mêlée pondérée — R-181/D4).
  const guardian = gardienDuCamp(board, village);
  if (!guardian) {
    captureCamp(board, village, attacker);
    return;
  }
  resolveAttack(board, attacker, guardian, combatTile);
  // ENGAGEMENT · R-183 : à la mort du gardien, le camp est capturé (le
  // vainqueur occupe la case — il y a pris place à l'entrée — et reçoit la
  // récompense hutte seedée).
  if (
    !board.st.units[guardian.id] &&
    board.st.units[attacker.id] &&
    board.st.villages.some((v) => v.id === village.id)
  ) {
    captureCamp(board, village, attacker);
  }
}


// ---------------------------------------------------------------------------
// Phase A — mouvements (RULES.md §6)
// ---------------------------------------------------------------------------

/**
 * Exécute le chemin d'une unité, pas à pas, dans la limite des PM (R-40..R-43).
 * Met à jour unit.order : chemin restant (gelé si arrêt en cours) ou null.
 * Interprétations documentées :
 *  - chemin invalide (hors carte / infranchissable) → le reste du chemin est effacé ;
 *  - blocage amical → l'unité s'arrête ce tour, le chemin restant est conservé ;
 *  - X-2 (halte à la découverte d'un ennemi) ABROGÉE (décision d'Erik du
 *    18/09) : entrer sur un ennemi visible déclenche l'attaque prévue
 *    (R-176) ou rejoint l'instabilité de la case, résolue en Phase E.
 */
function executeMoveOrder(
  board: Board,
  unit: Unit,
  path: Hex[],
  source: Extract<Order, { type: 'Move' | 'MultiStep' }>,
  priorite: number,
): void {
  while (unit.mp > 0 && path.length > 0) {
    const next = path[0]!;
    // X-2 ABROGÉE (décision d'Erik du 18/09) : la découverte d'un ennemi
    // n'arrête PLUS le chemin — une unité exécute son ordre quelle que soit
    // la vision révélée en cours de route (par elle ou par une autre unité).

    // R-161 (D6) : limite de pénétration du fog — après UNE entrée en case
    // inconnue ce tour, le reste du chemin est ignoré (l'unité s'arrête).
    if (board.unknownEntered.has(unit.id)) {
      path = [];
      break;
    }

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
    if (here.some((u) => u.owner === unit.owner) && !defenseurStabilise(board, next, unit.owner)) {
      // ENGAGEMENT · R-173 + R-159 rév. B (décision d'Erik du 17/09) : entrer
      // sur une case portant des AMIES.
      //  - un ennemi y cohabite (case mixte instable, aucun défenseur
      //    stabilisé) : entrée DIRECTE — sa présence légalise la co-destination ;
      //  - un rendez-vous FormArmy (R-44) : entrée directe (exemption) ;
      //  - un PAS INTERMÉDIAIRE (traversée) : entrée directe (co-location
      //    transitoire, l'unité repart — pas une pile de fin de tour) ;
      //  - sinon (case amie seule, dernier pas) : la cohabitation hors attaque
      //    est ILLÉGALE — si un ennemi peut encore arriver ce tour (potentiel),
      //    l'unité est RETENUE devant la case (décision après la Phase B :
      //    renfort défensive P3 / jointure d'instabilité) ; sinon le pas est
      //    REFUSÉ — l'unité a avancé au maximum, elle s'arrête avant la case.
      const ennemiIci = here.some((u) => u.owner !== unit.owner);
      const dernierPas = path.length === 1;
      // RESOLUTION-DEPLACEMENTS (arbitrage Erik 18/09) : les amies présentes
      // programment TOUTES de quitter la case ce tour (chemin actif, premier
      // pas ailleurs que la case de l'entrant — l'échange de cases reste
      // interdit) → entrée DIRECTE, cohabitation transitoire de Phase A : la
      // fenêtre de refus due à l'ordre unitId (R-41) est levée. Si un départ
      // échoue finalement, la cohabitation persiste et l'action finale obéit
      // à l'option B (fondation annulée — processFoundCity).
      const amiesPartent =
        !ennemiIci &&
        here
          .filter((u) => u.owner === unit.owner)
          .every((u) => {
            const o = u.order;
            if (!o || (o.type !== 'Move' && o.type !== 'MultiStep') || o.path.length === 0) return false;
            return o.path[0]!.q !== unit.q || o.path[0]!.r !== unit.r;
          });
      if (!ennemiIci && dernierPas && !board.formGroups.has(unit.id) && !amiesPartent) {        if (board.potentielEnnemi.has(`${unit.owner}|${tileKeyOf(next)}`)) {
          path = [];
          board.retenus.push({ unitId: unit.id, at: { ...next }, priorite, active: false });
          decide(board, 'entree-retenue', 'R-159 rév. B', `${unit.id} RETENU devant (${next.q},${next.r}) — un ennemi peut encore s'y trouver à la résolution (décision après la Phase B : renfort ou jointure d'instabilité)`, { unitId: unit.id, case: next, priorite });
          break;
        }
        path = path.slice(1); // destination refusée — le chemin gelé s'arrête ici
        decide(board, 'destination-refusee', 'R-159 rév. B', `${unit.id} AVANCE AU MAXIMUM et s'arrête avant (${next.q},${next.r}) — destination amie sans menace ennemie : la cohabitation hors attaque est illégale`, { unitId: unit.id, case: next });
        break;
      }
      if (amiesPartent) {
        decide(board, 'entree-cohabitation-transitoire', 'R-159 rév. B', `${unit.id} ENTRE sur (${next.q},${next.r}) — les amies présentes programment de quitter la case (cohabitation transitoire de Phase A)`, { unitId: unit.id, case: next });
      }
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
    // ENGAGEMENT · R-176/R-178 : entrée sur une case ENNEMIE — l'unité y ENTRE
    // toujours (fin des collisions R-53 et des replis). Combat planifié SEULEMENT
    // si la case porte un défenseur STABILISÉ (R-174) ; sinon l'entrant se joint
    // à l'instabilité de la case, résolue en Phase E (mêlée pondérée — R-180).
    const defender = defenseurStabilise(board, next, unit.owner);
    const campIci = villageAt(board, next);
    const gardienCamp = campIci ? gardienDuCamp(board, campIci) : null;
    // R-159 rév. B (P1) : quand plusieurs attaquants du MÊME camp visent la
    // même case DÉFENDUE, l'entrée est RETENUE — elle se séquencera en Phase B
    // dans l'ordre R-177 ; la mort du défenseur ferme la porte aux suivants du
    // même camp (les ennemis, eux, ne sont JAMAIS retenus).
    if (
      (defender || (campIci && gardienCamp)) &&
      board.coAttaquees.has(`${unit.owner}|${tileKeyOf(next)}`)
    ) {
      path = []; // plus rien à geler : la décision tombe à l'activation (Phase B)
      board.retenus.push({ unitId: unit.id, at: { ...next }, priorite, active: false });
      decide(board, 'entree-retenue', 'R-159 rév. B', `${unit.id} RETENU devant (${next.q},${next.r}) — case défendue visée par ≥ 2 attaquants du même camp : l'entrée se séquencera en Phase B (R-177)`, { unitId: unit.id, case: next, priorite });
      if (campIci && gardienCamp) {
        board.planned.push({ kind: 'villageAttack', at: next, attackerId: unit.id, villageId: campIci.id, latent: true });
      } else {
        board.planned.push({ kind: 'attack', at: next, attackerId: unit.id, defenderId: defender!.id, latent: true });
      }
      break;
    }
    path = [];
    unit.mp -= 1;
    moveUnit(board, unit, next);
    openHutAt(board, next, unit); // R-98 : la hutte s'ouvre avant le combat planifié
    activateArtefactAt(artefactCtxOf(board), unit, next); // 7o · R-153
    if (campIci && gardienCamp) {
      // R-96 rév. ENGAGEMENT : entrer sur un camp GARDÉ = attaquer le gardien.
      board.planned.push({ kind: 'villageAttack', at: next, attackerId: unit.id, villageId: campIci.id });
    } else if (defender) {
      board.planned.push({ kind: 'attack', at: next, attackerId: unit.id, defenderId: defender.id });
    }
    // sans défenseur stabilisé : aucune Phase B — mêlée en Phase E.
    break;
  }
  if (!board.st.units[unit.id]) return; // capturée en cours de route
  // Le chemin gelé conserve la FORME de l'ordre source (Move pour le bot et
  // les clients simples, MultiStep pour un composite — R-158) avec son
  // action finale si le composite n'a pas atteint son terme.
  unit.order =
    path.length > 0 ? ({ ...source, unitId: unit.id, path } as Extract<Order, { type: 'Move' | 'MultiStep' }>) : null;
}

/** Ordres de mouvement effectifs : nouvel ordre du tour (Move ou composite
 *  MultiStep — R-158), sinon chemin gelé (reprise multi-tours). */
interface MoveAssignment {
  unit: Unit;
  path: Hex[];
  /** Ordre source (Move ou MultiStep) — l'écriture du chemin gelé conserve
   *  sa forme (compat bot : le bot émet des Move). */
  source: Extract<Order, { type: 'Move' | 'MultiStep' }>;
  /** R-158 : action finale (composite uniquement). */
  final: 'foundCity' | undefined;
  /** R-159 (D2/D3) : priorité de programmation — 0 = chemin gelé (programmé
   *  dans un tour antérieur), sinon 1 + index de l'ordre dans la liste du
   *  joueur (chronologie de programmation du tour). */
  priority: number;
}

function collectMoveOrders(
  board: Board,
  ordersByPlayer: Record<PlayerId, Order[]>,
): Array<MoveAssignment> {
  const claimed = new Map<UnitId, { path: Hex[]; source: Extract<Order, { type: 'Move' | 'MultiStep' }>; priority: number }>();
  for (const playerId of Object.keys(ordersByPlayer).sort()) {
    let index = 0;
    for (const order of ordersByPlayer[playerId] ?? []) {
      if (order.type !== 'Move' && order.type !== 'MultiStep') continue;
      index += 1;
      if (claimed.has(order.unitId)) continue;
      const unit = board.st.units[order.unitId];
      if (!unit || unit.owner !== playerId) continue;
      claimed.set(order.unitId, { path: order.path.map((h) => ({ ...h })), source: order, priority: index });
    }
  }
  // Unités sans nouvel ordre mais avec un chemin gelé : reprise multi-tours
  // (Move OU MultiStep normalisé par la migration 19).
  for (const id of sortUnitIds(board)) {
    const unit = board.st.units[id]!;
    const claim = claimed.get(id);
    if (claim) {
      unit.order = { ...claim.source, path: claim.path.map((h) => ({ ...h })) };
    } else if (unit.order && (unit.order.type === 'Move' || unit.order.type === 'MultiStep')) {
      claimed.set(id, {
        path: unit.order.path.map((h) => ({ ...h })),
        source: unit.order,
        priority: 0, // programmé dans un tour antérieur : priorité la plus ancienne
      });
    }
  }
  // R-159 (D2) : destinations DISPUTÉES entre unités AMIES — la première
  // programmée obtient la case ; les suivantes voient leur chemin tronqué
  // AVANT la destination contestée (elles avancent au maximum de leurs PM
  // jusqu'à la dernière case libre avant elle, puis s'arrêtent — R-42).
  // Le traitement reste en ordre `unitId` croissant (R-41) : la troncature
  // pré-résolution rend la priorité effective sans réordonner le moteur.
  const byDestination = new Map<string, MoveAssignment[]>();
  const assignments = [...claimed.entries()]
    .map(([unitId, claim]) => ({
      unit: board.st.units[unitId]!,
      path: claim.path,
      source: claim.source,
      final: claim.source.type === 'MultiStep' ? claim.source.final : undefined,
      priority: claim.priority,
    }))
    .sort((a, b) => compareUnitIds(a.unit.id, b.unit.id));
  for (const a of assignments) {
    if (a.path.length === 0) continue;
    const dest = a.path[a.path.length - 1]!;
    const key = `${a.unit.owner}|${dest.q},${dest.r}`;
    const group = byDestination.get(key) ?? [];
    group.push(a);
    byDestination.set(key, group);
  }
  // R-159 rév. B (décision d'Erik du 17/09) : potentiel ennemi et co-attaques
  // par case, calculés AVANT la troncature de dispute.
  //  - `potentielEnnemi` (`owner|q,r`) : un ennemi PEUT se trouver sur la case
  //    à la résolution — occupant ennemi au départ, chemin ennemi aboutissant,
  //    ou ordre Attack ennemi ciblant la case. Légalise la co-destination amie.
  //  - `coAttaquees` (`owner|q,r`) : ≥ 2 attaquants du MÊME camp (chemins
  //    aboutissant + Attack explicites de mêlée) visent la case défendue —
  //    leurs entrées y sont RETENUES et séquencées en Phase B (P1).
  {
    const attaquantsParCase = new Map<string, number>();
    const compte = (owner: PlayerId, hex: Hex): void => {
      const cle = `${owner}|${tileKeyOf(hex)}`;
      attaquantsParCase.set(cle, (attaquantsParCase.get(cle) ?? 0) + 1);
    };
    for (const [unitId, claim] of claimed) {
      if (claim.path.length === 0) continue;
      const unit = board.st.units[unitId];
      if (!unit) continue;
      compte(unit.owner, claim.path[claim.path.length - 1]!);
    }
    for (const playerId of Object.keys(ordersByPlayer).sort()) {
      for (const order of ordersByPlayer[playerId] ?? []) {
        if (order.type !== 'Attack') continue;
        const unit = board.st.units[order.unitId];
        if (!unit || unit.owner !== playerId || isRanged(unit)) continue; // un tir n'entre pas
        compte(playerId, order.target);
      }
    }
    for (const [cle, n] of attaquantsParCase) {
      if (n >= 2) board.coAttaquees.add(cle);
    }
    const potentielEnnemi = (owner: PlayerId, dest: Hex): boolean => {
      if (occupants(board, dest).some((u) => u.owner !== owner)) return true;
      const cle = tileKeyOf(dest);
      for (const [unitId, claim] of claimed) {
        if (claim.path.length === 0) continue;
        const unit = board.st.units[unitId];
        if (!unit || unit.owner === owner) continue;
        const dernier = claim.path[claim.path.length - 1]!;
        if (dernier.q === dest.q && dernier.r === dest.r) return true;
      }
      for (const playerId of Object.keys(ordersByPlayer).sort()) {
        if (playerId === owner) continue;
        for (const order of ordersByPlayer[playerId] ?? []) {
          if (order.type === 'Attack' && order.target.q === dest.q && order.target.r === dest.r) return true;
        }
      }
      return false;
    };
    for (const a of assignments) {
      if (a.path.length === 0) continue;
      const dest = a.path[a.path.length - 1]!;
      if (potentielEnnemi(a.unit.owner, dest)) board.potentielEnnemi.add(`${a.unit.owner}|${tileKeyOf(dest)}`);
    }
  }
  for (const group of byDestination.values()) {
    if (group.length < 2) continue;
    // R-159 rév. B : la co-destination amie est LÉGALE quand un ennemi peut se
    // trouver sur la case à la résolution — pas de troncature (l'arbitrage se
    // fait à l'exécution, à l'heure de chaque entrée).
    if (board.potentielEnnemi.has(`${group[0]!.unit.owner}|${tileKeyOf(group[0]!.path[group[0]!.path.length - 1]!)}`)) {
      continue;
    }
    // R-44 : les membres désignés d'un même FormArmy peuvent se co-localiser
    // au rendez-vous — jamais soumis à la troncature de dispute.
    const candidates = group.filter((a) => !board.formGroups.has(a.unit.id));
    if (candidates.length < 2) continue;
    const dest = group[0]!.path[group[0]!.path.length - 1]!;
    const winner = [...candidates].sort(
      (x, y) => x.priority - y.priority || compareUnitIds(x.unit.id, y.unit.id),
    )[0]!;
    for (const loser of candidates) {
      if (loser === winner) continue;
      // Troncature : la destination (dernier pas) et au-delà sont retirés.
      loser.path = loser.path.slice(0, -1);
      loser.final = undefined; // l'action finale portait sur la case disputée
      decide(board, 'dispute-tronquee', 'R-159 rév. B', `${loser.unit.id} CÈDE la case (${dest.q},${dest.r}) à ${winner.unit.id} — co-destination amie sans menace : la première programmée (priorité ${winner.priority}) obtient la case, l'autre avance au maximum`, {
        perdant: loser.unit.id, gagnant: winner.unit.id, case: dest,
        priorites: candidates.map((c) => ({ unitId: c.unit.id, priorite: c.priority })),
      });
    }
  }
  return assignments;
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
      stabilized: false, // ENGAGEMENT · R-173
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
  // ENGAGEMENT · R-179 : les membres excédentaires (fusion ratée/partial)
  // DEMEURENT co-localisés — la Phase E expulse l'excédent amiable comme pour
  // toute cohabitation (plus de déplacement forcé spécial R-44).
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
          stabilized: false, // ENGAGEMENT · R-173
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
    stabilized: false, // ENGAGEMENT · R-173
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
 * R-60 rév. WORKED-TILE-EXACT · SetWorkedTile — assignation/désélection
 * manuelle d'un citoyen (ordre Phase 6). Validations : ville possédée, case
 * null (désassignation du dernier assigné, déterministe) ou dans le rayon
 * de travail (bâtiments compris), travaillable, pas une case de ville, pas
 * travaillée par une AUTRE ville. Cibler une case DÉJÀ TRAVAILLÉE par la
 * même ville = DÉSÉLECTION EXACTE de cette case (le citoyen redevient
 * intérieur R-60bis) — l'ancien « échange » automatique est abrogé ; la
 * ré-affectation vers une nouvelle tuile est un second ordre explicite.
 * Ville pleine : cibler une case libre est ignoré — désélectionner d'abord.
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
    if (city.workedTiles.includes(order.tile)) {
      // Déjà travaillée par cette ville : DÉSÉLECTION EXACTE (R-60 rév.) —
      // CETTE case précise sort des terrains cultivés, pas la dernière assignée.
      // (AVANT le test takenByOthers, qui inclut les cases de la ville elle-même.)
      // La case est LIBÉRÉE pour la suite de la file : un ordre ultérieur
      // (re-clic sur la même tuile, ou une autre ville) peut la reprendre.
      city.workedTiles.splice(city.workedTiles.indexOf(order.tile), 1);
      takenByOthers.delete(order.tile);
      continue;
    }
    if (takenByOthers.has(order.tile)) continue; // travaillée par une autre ville (ou ville elle-même)
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
          stabilized: false, // ENGAGEMENT · R-173
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
 * la victime en possède au moins un (settledGreatPersons non vide) : le GP
 * le plus récemment installé change de camp (AUCUN jalon échangé — GP-CULTURE-
 * EVENEMENTS · D7, décision d'Erik du 13/09 : R-126 abrogée, l'espion vole le
 * GP et ses rendements, pas un point de victoire) ; l'Espion est consommé. Échec (rien à voler / conditions non remplies) : l'Espion SURVIT
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
    if (!board.st.players[city.owner]) continue; // aucune ville barbare — garde-fou
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
    // 7j · D4.3 (rév. GP-CULTURE-EVENEMENTS · D7 — décision d'Erik du 13/09) :
    // le GP volé est RETIRÉ de la liste d'installation de la ville cible (le
    // plus récemment installé — déterministe) et réputé installé d'office dans
    // la capitale du voleur (sinon première ville — R-81) : le bonus Settle
    // change de camp. AUCUN jalon n'est échangé (R-126 abrogée) : l'espion
    // vole le GP et ses rendements, pas un point de victoire — la suspension
    // ONU « jalons redescendus par vol » (R-116) disparaît par la même occasion.
    const stolen = board.st.cities[city.id]?.settledGreatPersons.pop();
    if (stolen) {
      const thiefCities = Object.values(board.st.cities)
        .filter((c) => c.owner === unit.owner)
        .sort((a, b) => Number(b.capital) - Number(a.capital) || compareCityIds(a.id, b.id));
      thiefCities[0]?.settledGreatPersons.push(stolen);
    }
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
        board.traceUsage = 'nucléaire — destruction de bâtiments (C16)';
        for (let i = 0; i < Math.ceil(pool.length / 2); i++) {
          const j = i + Math.floor(board.rng.next() * (pool.length - i));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          destroyed.push(pool[i]!);
        }
        destroyed.sort();
        board.traceUsage = '';
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
        verifierAnnihilation(board, razed.owner); // CARTE-MULTI : dernière ville perdue
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

/**
 * CARTE-MULTI (2-5 joueurs) — élimination d'un joueur qui perd SA capitale
 * ORIGINALE (jamais capturée avant : `wasCaptured` false — la recapture d'une
 * capitale déjà volée à un tiers n'élimine personne). Marque `defeated` puis :
 *  - élimination NON décisive (≥ 2 joueurs en lice restent) → événement
 *    PUBLIC PlayerDefeated, la partie continue, retour null ;
 *  - élimination DÉCISIVE (un seul joueur en lice) → AUCUN PlayerDefeated
 *    (le flux 1v1 — Victory seul, sans doublon — reste IDENTIQUE), retour du
 *    survivant : l'appelant pose `winner` et émet Victory.
 */
function eliminerJoueur(
  board: Board,
  loserId: PlayerId,
  byPlayer: PlayerId | null,
  cause: 'capitalCaptured' | 'capitalRazed' | 'forfeit' | 'attrition',
): PlayerId | null {
  const loser = board.st.players[loserId];
  if (loser) loser.defeated = true;
  const enLice = activePlayerIds(board.st);
  if (enLice.length > 1) {
    emit(board, { type: 'PlayerDefeated', player: loserId, byPlayer, cause });
    return null;
  }
  return enLice[0] ?? null;
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
    // CARTE-MULTI : la capture justement posée ci-dessous (`wasCaptured = true`,
    // R-149) ne doit pas masquer le test « capitale ORIGINALE » — figé AVANT
    // toute mutation de la ville.
    const capitaleOriginale = city.capital && city.wasCaptured !== true;
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
      if (capitaleOriginale) {
        // R-97 : la capitale (ORIGINALE) rasée = défaite de son propriétaire —
        // les barbares ne gagnent jamais (CARTE-MULTI : élimination, victoire
        // du DERNIER joueur en lice ; à 2 joueurs : l'autre joueur, identique).
        const survivant = eliminerJoueur(board, fromOwner, null, 'capitalRazed');
        if (survivant) {
          board.st.winner = survivant;
          emit(board, { type: 'Victory', winner: survivant, reason: 'razedCapital' });
        }
      } else {
        // CARTE-MULTI : ville ordinaire rasée — le propriétaire a-t-il perdu
        // sa dernière entité ? (après la priorité capitale R-97)
        verifierAnnihilation(board, fromOwner);
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
    if (capitaleOriginale) {
      // R-65 · CARTE-MULTI : la capture de la capitale ORIGINALE d'un joueur
      // l'élimine ; victoire par domination = DERNIER joueur en lice (à 2
      // joueurs : le captreur, flux d'événements inchangé).
      const survivant = eliminerJoueur(board, fromOwner, invader.owner, 'capitalCaptured');
      if (survivant) {
        board.st.winner = survivant; // R-65 : victoire par domination
        emit(board, { type: 'Victory', winner: survivant, reason: 'domination' });
      }
    } else {
      // CARTE-MULTI : ville ordinaire capturée — le perdant a-t-il perdu sa
      // dernière entité ? (après la priorité capitale R-65)
      verifierAnnihilation(board, fromOwner);
    }
  }
}

/**
 * CARTE-MULTI — élimination par ANNIHILATION : un joueur EN LICE qui vient
 * de perdre sa DERNIÈRE entité (unité ou ville) est éliminé (un colon tué
 * avant la fondation, la dernière unité détruite…). Sans ceci, un tel
 * joueur reste mort-vivant : ni vainqueur possible pour lui, ni domination
 * complète pour les autres. Vérifié ÉVÉNEMENTIELLEMENT (à la mort d'une
 * unité, à la perte d'une ville) — jamais par balayage de l'état : un
 * joueur qui n'a jamais rien possédé ne déclenche rien. PlayerDefeated
 * public (cause 'attrition') ; victoire du dernier en lice si décisive.
 */
function verifierAnnihilation(board: Board, ownerId: PlayerId): void {
  if (board.st.winner) return;
  const p = board.st.players[ownerId];
  if (!p || p.defeated === true) return;
  if (Object.values(board.st.units).some((u) => u.owner === ownerId)) return;
  if (Object.values(board.st.cities).some((c) => c.owner === ownerId)) return;
  const survivant = eliminerJoueur(board, ownerId, null, 'attrition');
  if (survivant) {
    board.st.winner = survivant;
    emit(board, { type: 'Victory', winner: survivant, reason: 'domination' });
  }
}

/**
 * R-96 · Engendrement barbare par les villages (Phase C — l'unité produite
 * n'agit pas le tour de sa naissance). Compteur décrémenté à chaque
 * résolution. Rév. ENGAGEMENT (R-183) : le rengendrement remplit d'abord le
 * rôle de GARDIEN SUR LA CASE MÊME du camp (si elle n'en porte plus), sinon
 * une case adjacente libre (satellite du camp, rayon d'une case), cap T-22
 * d'unités vivantes par village, type selon l'escalade R-95.
 */
function processVillages(board: Board): void {
  for (const village of [...board.st.villages].sort((a, b) => compareIds(a.id, b.id))) {
    village.spawnCountdown -= 1;
    if (village.spawnCountdown > 0) continue;
    village.spawnCountdown = BARBARIANS.spawnInterval;
    village.spawnedUnits = village.spawnedUnits.filter((id) => board.st.units[id]);
    if (village.spawnedUnits.length >= BARBARIANS.capPerVillage) continue; // cap T-22
    const type = barbarianUnitType(board.st.turn + 1); // tour résultant
    // ENGAGEMENT · R-183 : le rengendrement remplit d'abord le CAMP (si la
    // case n'a plus de gardien), sinon une case ADJACENTE LIBRE (rayon d'une
    // case — la pile est abrogée). Aucune case disponible : pas de spawn.
    const campOccupe = gardienDuCamp(board, village) !== null;
    const tile = campOccupe
      ? freeSpawnTiles(board.st, { q: village.q, r: village.r }, 1)[0]
      : { q: village.q, r: village.r };
    if (!tile) continue;
    const unit = createBarbarianUnit(board.st, { q: tile.q, r: tile.r }, type);
    village.spawnedUnits.push(unit.id);
    emit(board, {
      type: 'BarbarianSpawned',
      unitId: unit.id,
      villageId: village.id,
      owner: BARBARIAN_ID,
      at: { q: tile.q, r: tile.r },
    });
  }
}

/**
 * 7f/7h · R-114/R-123 (rév. GP-CULTURE-EVENEMENTS · D7 — décision d'Erik du
 * 13/09) : engendre un Personnage illustre de la classe donnée sur la case de
 * la ville (sinon première case adjacente libre — perdu si aucune,
 * interprétation R-114). Escalades : compteurs PAR TYPE (T-30) et
 * `greatPersonsObtained` pour TOUTE classe — l'escalade reste alimentée par
 * toute obtention de GP, mais les GP n'ÉMETTENT PLUS AUCUN jalon (R-126
 * abrogée — le compteur des 20 ne progresse que par paliers T-27, reason
 * 'cultureLevel', et merveilles R-115/R-131).
 * CULTURE-FRONTIERES (M2 — décision d'Erik du 14/09) : `canal` porte la
 * SOURCE du GP (culture/science/or/production/combat) — émise telle quelle
 * dans GreatPersonSpawned, le journal l'affiche (« GP de [canal] »).
 */
function spawnGreatPerson(board: Board, city: City, gpType: string, canal: GpCanal): void {
  const player = board.st.players[city.owner]!;
  const gpStats = unitType(gpType);
  const cityHex = { q: city.q, r: city.r };
  const spot = occupiedByUnit(board, cityHex) ? (freeSpawnTiles(board.st, cityHex, 1)[0] ?? null) : cityHex;
  if (gpStats.greatPerson) {
    player.greatPersonsByType[gpType] = (player.greatPersonsByType[gpType] ?? 0) + 1;
    player.greatPersonsObtained += 1; // escalade T-30 — sans effet sur les jalons (D7)
  }
  if (!spot) return; // aucune case libre : le GP est perdu (interprétation documentée)
  const gpId = nextId(board.st.units, 'u');
  board.st.units[gpId] = {
    id: gpId,
    type: gpType,
    stabilized: false, // ENGAGEMENT · R-173
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
    canal,
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
    if (board.st.players[playerId]?.defeated === true) continue; // CARTE-MULTI : un éliminé ne gagne plus
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
    if (city) spawnGreatPerson(board, city, 'leader', 'combat');
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
    // RESOLUTION-DEPLACEMENTS · option B (arbitrage Erik 18/09) : une amie
    // cohabite ENCORE sur la case à l'arrivée (son départ programmé a échoué)
    // → fondation ANNULÉE ; le colon cohabite et fondera au tour suivant si
    // la case se libère.
    if (occupants(board, hex).some((u) => u.id !== unit.id && u.owner === unit.owner)) {
      decide(
        board,
        'fondation-annulee-cohabitation',
        'R-64',
        `${unit.id} ne fonde pas sur (${hex.q},${hex.r}) — une unité amie cohabite encore sur la case (option B : fondation annulée, le colon cohabite)`,
        { unitId: unit.id, case: hex },
      );
      continue;
    }
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
    // MENU-VILLE : nom « VilleN » (compteur par joueur) ou table de la civ.
    const name = prochainNomVille(board.st.cities, unit.owner, civIdOf(board.st.players[unit.owner]));
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
      cultureCumulee: 0, // EXPANSION-CULTURELLE phase 1 : cumul jamais consommé
      wonders: [], // 7f · R-115
      pendingSalvage: 0, // 7k · R-130 (M3)
      settledGreatPersons: [], // 7j · R-126
      wasCaptured: false, // 7n · R-149
      name,
    };
    board.st.map[tileKeyOf(hex)] = { terrain: 'ville', resource: null };
    delete board.st.units[unit.id];
    board.pendingFill.add(cityId); // les citoyens initiaux sont auto-assignés en Phase C
    emit(board, { type: 'CityFounded', cityId, owner: unit.owner, at: hex, capital: !ownerHasCity, byUnitId: unit.id });
    // CIV-CAPITALE-FONDEE : une capitale FONDÉE reçoit les mêmes bonus
    // capital-dépendants que les capitales préfabriquées du setup (R-150 ×
    // R-64) — bâtiments gratuits, merveille Égypte (RNG seedé dédié, le RNG de
    // résolution n'est pas consommé), GP Amérique. Miroir map.ts §setup.
    applyCapitalStartBonuses(board.st, unit.owner, board.st.cities[cityId]!, {
      emit: (event) => emit(board, event),
    });
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
  // CARTE-MULTI : un joueur ÉLIMINÉ peut achever l'ONU/la Banque mondiale
  // (sa zombie-économie continue) mais ne gagne PLUS la partie — la merveille
  // se complète sans émission de Victory.
  const proprietaireEnLice = board.st.players[city.owner]?.defeated !== true;
  if (wonderData.cultureVictory && proprietaireEnLice) {
    board.st.winner = city.owner;
    emit(board, { type: 'Victory', winner: city.owner, reason: 'culture' });
  }
  if (wonderData.economicVictory && proprietaireEnLice) {
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
        stabilized: false, // ENGAGEMENT · R-173
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
  /** Part OR brute de la conversion R-90 (0 en Anarchie) — les multiplicateurs
   *  merveilles/empire/Settle restent appliqués par la boucle Phase C. */
  rawGold: number;
  /** Science FINALE créditée par cette ville ce tour (conversion R-90 × Settle
   *  Savant + Temples R-149 + bonus empire — exactement le montant versé à
   *  creditScience en Phase C ; 0 fiole en Anarchie, bonus empire inchangé).
   *  Source unique avec le prédicat de fin de tour (blocagesFinDeTour). */
  science: number;
}

export function cityEconomyInputs(st: GameState, city: City, allTechs: readonly string[]): CityEconomyInputs {
  const player = st.players[city.owner]!;
  // 7h · R-121/R-122 : Anarchie — marteaux, fioles, or et culture TOMBENT À
  // ZÉRO (la nourriture n'est PAS paralysée — interprétation documentée).
  const anarchy = isInAnarchy(player, st.turn);
  const govEffects = anarchy ? {} : effectsFor(player);
  // 7e · Premier découvrir : bonus d'empire par ville (Littératie +1 science,
  // Chemin de fer +2 production, Industrialisation +5 or…).
  const empireBonus = empirePerCityBonus(st, city.owner);

  // Rendements : centre-ville automatique et gratuit + Σ cases travaillées
  // (base §2 + bonus bâtiments R-66 + bonus ressource si accès, R-93).
  // ALIGNEMENT-CROISSANCE : le centre passe par tileYield (source unique) et
  // rapporte 0/0/0 (le socle R-66 rév. 06/09 est ABROGÉ) — le commerce de
  // tranche R-60bis s'ajoute par-dessus ce zéro.
  const center = tileYield(
    st.map,
    city.buildings,
    tileKeyOf(city),
    player.techsUnlocked,
    city.wonders,
    allTechs,
    player,
  )!;
  const tier = interiorCitizenFor(city.pop);
  let food = center.food;
  let rawProduction = center.production + empireBonus.production;
  let commerce = center.commerce + tier.commerce + empireBonus.commerce;
  let directGold = 0;
  for (const key of city.workedTiles) {
    // 7k · R-132 / 7l · C9 : les merveilles portent des bonus par terrain
    // travaillé (Cie des Indes : +1 Commerce par case d'EAU — côte incluse).
    // 7n · R-149 : le contexte civ active les bonus de TERRAIN (Amérique/Russie
    // plaine, Égypte désert, Allemagne forêt, Mongolie montagne, maritime) et
    // l'accès aux ressources SANS tech (Inde).
    const y = tileYield(st.map, city.buildings, key, player.techsUnlocked, city.wonders, allTechs, player)!;
    food += y.food;
    rawProduction += y.production;
    commerce += y.commerce;
    // 7l · R-134 : or direct des ressources (Gemmes +2, Or +3 dès Monnaie —
    // canon ; correction du canal commerce D3 de 7c, la trésorerie existe).
    // 7n · R-149 : l'Inde (`toutesRessources`) ignore la tech d'accès.
    const res = st.map[key]?.resource;
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
  // R-90 révisée (Phase 7b) : conversion or/science du commerce — extraite
  // ICI (source unique) : la boucle Phase C et le prédicat de fin de tour
  // (blocagesFinDeTour) lisent exactement les mêmes montants.
  const rawGains = anarchy
    ? { gold: 0, science: 0 } // R-122 : fioles et or à zéro
    : conversionGains(commerce, city.conversion, city.buildings, govEffects);
  // Science finale créditée (miroir bit à bit de la Phase C) : conversion ×
  // Settle Savant (R-126) + Temples R-149 (hors Anarchie) + bonus empire
  // (crédité même en Anarchie — comportement existant de processEconomy).
  const science =
    (anarchy ? 0 : Math.round(rawGains.science * settledGpMultiplier(city, 'savant'))) +
    (anarchy ? 0 : civBuildingScienceOf(player, city.buildings)) +
    empireBonus.science;
  return {
    anarchy,
    govEffects,
    empireBonus,
    food,
    production,
    commerce,
    directGold: anarchy ? 0 : directGold,
    rawGold: rawGains.gold,
    science,
  };
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
    economyInputs.set(cityId, cityEconomyInputs(board.st, board.st.cities[cityId]!, allTechs));
  }
  // 7l · C8 · R-129 : départage des complétions SIMULTANÉES d'une même
  // merveille (le perdant bascule intégralement en réserve C7).
  resolveWonderRaces(board, economyInputs);

  for (const cityId of Object.keys(board.st.cities).sort()) {
    const city = board.st.cities[cityId]!;
    const player = board.st.players[city.owner]!;
    const { anarchy, govEffects, empireBonus, food, production, commerce, directGold, rawGold, science } =
      economyInputs.get(cityId)!;
    // R-90 révisée (Phase 7b) : le commerce est converti en TOTALITÉ en or ou
    // en science selon le choix de la ville. 7e : Marché ×2 / Banque ×4 or,
    // Bibliothèque ×1,5 / Université ×4 science (data-driven, conversion.ts).
    // 7h · R-121 : Démocratie +50 % or/science (avant répartition) ;
    // Fondamentalisme : science Bibliothèque/Université = 0.
    // La part SCIENCE est calculée dans cityEconomyInputs (source unique —
    // lue aussi par blocagesFinDeTour) ; la part OR est multipliée ici.
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
      gold: Math.round(rawGold * goldWonderMult * civEmpireGoldMultOf(player) * settledGpMultiplier(city, 'explorateur')),
      science,
    };
    // 7l · R-134 : la trésorerie d'empire crédite la part OR des villes focus
    // Or (R-90) + bonus empire + or direct des ressources (Gemmes/Or).
    player.treasury += gains.gold + empireBonus.gold + directGold;
    // R-85 (rév. R-134) : la science alimente la tech courante ; le SURPLUS à
    // la complétion est converti 1:1 en or (creditScience) ; sans tech choisie,
    // la réserve `scienceStored` reste inchangée.
    // 7e : à la complétion, la récompense de Premier découvrir est appliquée
    // (firstDiscovery.ts) ; les nouveaux citoyens sont auto-assignés ici.
    creditScience(board.st, city.owner, gains.science, {
      onResearched: (pid, techId) => {
        emit(board, { type: 'TechResearched', player: pid, tech: techId });
      },
      onFirstDiscovered: (payload, citiesToFill) => {
        emit(board, payload);
        for (const id of citiesToFill) board.pendingFill.add(id);
      },
    });

    // ALIGNEMENT-CROISSANCE (partie réelle d'Erik du 13/09 — valeurs faites
    // foi) : AUCUN citoyen ne consomme de nourriture — le SURPLUS alimentaire
    // = la nourriture produite, point (la consommation 7i D1 est abrogée).
    // D2 · seuils LINÉAIRES 10 × population ACTUELLE (table growth.json,
    // indexée par la population actuelle) ; plafond absolu 31 (croissance
    // bloquée au-delà). Aqueduc : seuil réduit d'un tiers (data-driven).
    let growthReduction = 0;
    for (const b of city.buildings) {
      growthReduction = Math.max(growthReduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
    }
    // 7n · R-146 (rév. Calibrage canon — Erik 06/09) · trait Zoulou
    // `croissanceSeuilDivise` : mécanique canon « Aqueduc passif » — les
    // seuils de growth.json sont DIVISÉS par deux pour toutes les villes
    // zouloues dès l'ère Médiévale (ni nourriture ni vitesse — structurel).
    // Se combine MULTIPLICATIVEMENT avec la réduction de l'Aqueduc :
    // seuil effectif = base × (1 − r_aqueduc) ÷ divisor.
    growthReduction = 1 - (1 - growthReduction) / civGrowthThresholdDivisorOf(player);
    // 7j · R-126 · Settle · Humanitaire : +50 % du taux de croissance (le
    // SURPLUS alimentaire est multiplié, additif 🔶, arrondi au plus proche) ;
    // un déficit n'est PAS amplifié.
    // 7j · R-123 complétée · surplus alimentaire = nourriture produite (aucune
    // consommation — ALIGNEMENT-CROISSANCE) — alimentait aussi l'accumulateur
    // de croissance du Grand Humanitaire (canal GP unifié 7k · C1, dormant).
    const foodSurplus = food;
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
    // RETRAIT-GP-ACCUMULATEURS (décision d'Erik du 14/09) : les accumulateurs
    // R-123 (`gpAccum*`, seuil T-30) sont SUPPRIMÉS — aucun GP ne sort d'un
    // rendement (science/or/production/nourriture).
    // 7h · R-121/R-122 : culture à zéro pendant l'Anarchie ; Monarchie (Palais
    // ×2) et Communisme (Temples/Cathédrales = 0) via les effets de régime ;
    // Magna Carta (Tribunal +1) via les merveilles (R-125).
    // EXPANSION-CULTURELLE phase 1 (M2, décision d'Erik du 13/09) : le CUMUL
    // `cultureCumulee` additionne les MÊMES gains chaque tour, JAMAIS consommé
    // — GP-CULTURE-EVENEMENTS (D1/D5, décision d'Erik du 13/09) : le réservoir
    // consommé `cultureStored` est SUPPRIMÉ ; le canal GP lit le CUMUL EMPIRE
    // (Σ `cultureCumulee`) contre les paliers T-27 (processCulturePaliers, en
    // fin de processEconomy) ; l'expansion culturelle lit le même cumul
    // (rayonCulturelDe). Gelé en Anarchie (R-122).
    const gainCulture = anarchy
      ? 0
      : Math.round(
          cultureGains(city, empireBonus.culture, allTechs, govEffects) * // M1/R-128 : union des techs
            settledGpMultiplier(city, 'artiste_penseur'),
        );
    city.cultureCumulee += gainCulture;
    // RETRAIT-GP-ACCUMULATEURS (décision d'Erik du 14/09) : le bloc d'émission
    // des GP à rendement (R-123 — science → or → production, seuils T-30) est
    // SUPPRIMÉ. Le canal CULTURE reste traité PAR PALIER de culture de
    // civilisation (Σ empire), APRÈS la boucle des villes (GP-CULTURE-
    // EVENEMENTS · D6) ; Leader (T-31) et paliers d'or (R-136) inchangés.

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

  // GP-CULTURE-EVENEMENTS · D6 (décision d'Erik du 13/09) : résolution des
  // PALIERS T-27 de culture de civilisation — APRÈS la boucle des villes (le
  // cumul empire de CE tour est complet), par joueur en ordre déterministe
  // (R-81). Chaque palier franchi = DEUX conséquences ATOMIQUES, dans cet
  // ordre : (a) +1 jalon culturel (reason 'cultureLevel') PUIS (b) 1 GP —
  // classe tirée (D2, RNG seedé dédié), posé dans la ville la plus cultivée
  // (D3). La culture n'est JAMAIS soustraite (D1) et plusieurs paliers peuvent
  // être franchis dans la même résolution. Gelés en Anarchie (R-122 — la
  // culture du tour est à zéro).
  for (const playerId of Object.keys(board.st.players) as PlayerId[]) {
    const player = board.st.players[playerId]!;
    const cumul = cultureEmpireOf(board.st.cities, playerId);
    if (cumul <= 0) continue;
    const gpMult = civGpThresholdMultOf(player);
    // RNG seedé DÉDIÉ (D2) : dérivé du seed de partie, ne touche pas au RNG de
    // Phase B — une résolution se rejoue à l'identique (miroir R-154).
    const rng = createRng((board.st.rngSeed ^ GP_CULTURE_SEED_SALT) >>> 0);
    while (cumul >= Math.round(greatPersonThresholdFor(player.culturePaliers) * gpMult)) {
      player.culturePaliers += 1;
      player.cultureMilestones += 1; // D6(a) : le palier EST l'événement
      emit(board, {
        type: 'CultureMilestone',
        player: playerId,
        delta: 1,
        total: player.cultureMilestones,
        reason: 'cultureLevel',
      });
      // D6(b) : le GP suit le jalon, dans la ville la plus cultivée (D3).
      const bestCity = villeLaPlusCultivee(board.st.cities, playerId);
      if (bestCity) {
        const cls = greatPersonClassTire(rng, player.greatPersonsByType, player.greatPersonsObtained);
        spawnGreatPerson(board, board.st.cities[bestCity]!, cls, 'culture');
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
        stabilized: false, // ENGAGEMENT · R-173
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
      // SANS jalon (miroir C2). Révision Calibrage canon (Erik 06/09) : la
      // classe est EXPLICITE — Grand Explorateur/Industriel (R-136), rotation
      // de secours Bâtisseur puis Savant si les figures de la classe sont
      // épuisées ; le ciblage technologique R-127 reste propre au canal culture.
      const idx = ECONOMY.milestones.indexOf(milestone);
      const goldGpIndex = ECONOMY.milestones
        .slice(0, idx)
        .filter((m) => m.reward === 'greatPerson').length;
      if (capital) spawnGreatPerson(board, capital, goldMilestoneGpClass(goldGpIndex), 'or');
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

/**
 * ENGAGEMENT · Phase E — stabilité de fin de tour (R-173..R-182).
 * Ordre : expulsions de cohabitation (R-179) → mêlées (R-178/R-180/R-181,
 * une par case et par tour) → captures de pacifiques à la stabilisation
 * (R-182) → marquage `stabilized` (R-173).
 */
function processStability(board: Board): void {
  const st = board.st;

  // Groupe les unités vivantes hors embarquées par case.
  const parCase = (): Map<string, Unit[]> => {
    const map = new Map<string, Unit[]>();
    for (const id of Object.keys(st.units).sort(compareUnitIds)) {
      const u = st.units[id]!;
      if (u.aboard) continue;
      const key = `${u.q},${u.r}`;
      const list = map.get(key) ?? [];
      list.push(u);
      map.set(key, list);
    }
    return map;
  };

  // ---- 1 · Dispersion de pile amie (R-159 rév. B, décision d'Erik du 17/09
  // — R-179 abrogée). La cohabitation amie n'est plus expulsée au tour de sa
  // formation : c'est un ÉTAT RÉSIDUEL LÉGAL qui persiste (P2). L'excédent
  // n'est dispersé qu'en Phase E d'un tour où RIEN n'est physiquement entré
  // sur la case (H2 : le tir d'archer ne compte pas — il ne vient pas sur la
  // case) et où aucun défenseur stabilisé n'y a été attaqué (résidu de
  // combat). Une entrée ennemie suspend la dispersion : la pile DEMEURE pour
  // la mêlée (H3 — étau T-54 : rester en pile sous menace est un choix).
  // Celle qui RESTE est la mieux fondée : fortifiée d'abord, puis plus de PV,
  // puis unitId croissant (R-81) — hypothèse H1 validée par Erik. Les autres,
  // en ordre unitId croissant, rejoignent la case adjacente libre la plus
  // proche (tie : (q, r) croissant). Sans case admissible : la pile persiste,
  // nouvel essai au tour suivant. La dispersée ne combat pas et n'ouvre pas
  // de hutte ; elle perd fortification et stabilisation (R-175).
  {
    const groups = parCase();
    for (const key of [...groups.keys()].sort()) {
      const here = (groups.get(key) ?? []).filter((u) => st.units[u.id]);
      if (here.length < 2) continue;
      const owners = new Set(here.map((u) => u.owner));
      if (owners.size !== 1) continue; // cohabitation ennemie → mêlée, pas de dispersion
      const entreesEtrangeres = [...(board.entrees.get(key as TileKey) ?? [])].some(
        (o) => o !== here[0]!.owner,
      );
      if (entreesEtrangeres || board.meleeDifferees.has(key as TileKey)) continue;
      const keeper = [...here].sort(
        (a, b) =>
          Number(b.fortified) - Number(a.fortified) ||
          b.hp - a.hp ||
          compareUnitIds(a.id, b.id),
      )[0]!;
      decide(board, 'dispersion-reste', 'R-179-b', `Dispersion de la pile amie (${key}) : ${keeper.id} RESTE (mieux fondée — fortifiée, puis PV décroissants, puis R-81)`, {
        case: key, restante: keeper.id, candidates: here.map((u) => ({ id: u.id, fortified: u.fortified, hp: u.hp })),
      });
      for (const u of here.filter((x) => x.id !== keeper.id).sort((a, b) => compareUnitIds(a.id, b.id))) {
        const candidates = neighbors({ q: u.q, r: u.r })
          .filter((h) => canEnter(board, u, h))
          .filter((h) => !occupiedByUnit(board, h))
          .filter((h) => {
            const city = cityAt(board, h);
            return !villageAt(board, h) && (!city || city.owner === u.owner);
          })
          .sort((a, b) => compareHex(a, b));
        const cible = candidates[0];
        if (!cible) {
          decide(board, 'dispersion-impossible', 'R-179-b', `${u.id} ne peut pas être dispersé depuis (${key}) — aucune case adjacente admissible : la pile persiste (P2)`, { unitId: u.id, case: key });
          continue; // aucune case admissible : la pile persiste (P2)
        }
        decide(board, 'dispersion-part', 'R-179-b', `${u.id} quitte la pile (${key}) pour (${cible.q},${cible.r}) — première case adjacente libre tri (q, r) parmi ${candidates.length} candidate(s)`, {
          unitId: u.id, case: key, destination: cible, candidates: candidates.map((h) => tileKeyOf(h)),
        });
        const from = { q: u.q, r: u.r };
        u.q = cible.q;
        u.r = cible.r;
        u.fortified = false; // R-175 : perdue au déplacement
        u.stabilized = false;
        board.moved.add(u.id); // a quitté sa case : pas de bonus de demeure
        emit(board, { type: 'UnitDispersed', unitId: u.id, owner: u.owner, from, to: { ...cible } });
      }
    }
  }

  // ---- 2 · Mêlées d'instabilité (R-178/R-180/R-181) : toute case portant
  // ≥ 2 unités militaires d'au moins DEUX propriétaires résout UNE mêlée ce
  // tour (défenseur vivant ou pas — décision D4 d'Erik : la mêlée tranche).
  {
    const groups = parCase();
    for (const key of [...groups.keys()].sort()) {
      const here = (groups.get(key) ?? []).filter((u) => st.units[u.id]);
      const participants = here.filter((u) => !isPeaceful(u));
      const owners = new Set(participants.map((u) => u.owner));
      if (participants.length < 2 || owners.size < 2) continue;
      const tile = { q: participants[0]!.q, r: participants[0]!.r };
      // R-178 rév. A : un défenseur stabilisé a été attaqué ici ce tour — la
      // mêlée est REPORTÉE au tour suivant (les unités pourront partir, être
      // renforcées… ; le défenseur qui demeure garde ses bonus, R-175).
      if (board.meleeDifferees.has(tileKeyOf(tile))) {
        decide(board, 'melee-reportee-phase-e', 'R-178 rév. A', `Instabilité (${tile.q},${tile.r}) : mêlée REPORTÉE au tour suivant (un défenseur stabilisé y a été attaqué)`, { case: tile, participants: participants.map((u) => u.id) });
        continue;
      }
      // Poids = attaque effective² × étau. Les bonus de DEMEURE (terrain,
      // fortification, bâtiments de ville) tiennent pour l'unité qui n'a pas
      // bougé ce tour (R-175 : l'avantage de l'occupation du terrain).
      const compteAllies = new Map<string, number>();
      for (const u of participants) {
        compteAllies.set(u.owner, (compteAllies.get(u.owner) ?? 0) + 1);
      }
      const poids = new Map<string, number>();
      const tracePoids: Array<{ id: UnitId; eff: number; tau: number; poids: number }> = [];
      for (const u of participants) {
        const stats = unitType(u.type);
        const demeure = !board.moved.has(u.id);
        const bonus = demeure
          ? terrainDefenseBonus(board, tile) +
            (u.fortified ? FORTIFY_DEFENSE_BONUS : 0) +
            cityBuildingDefenseBonus(board, tile, u.owner)
          : 0;
        const eff = effectiveStrength(
          stats.attack + civUnitStatBonusOf(st.players[u.owner], 'unitAttack', u.type),
          u.veteran,
          bonus,
        );
        const tau = meleeTauMultiplier(compteAllies.get(u.owner) ?? 1);
        poids.set(u.id, eff * eff * tau);
        tracePoids.push({ id: u.id, eff, tau, poids: eff * eff * tau });
      }
      const rollDebut = board.trace?.marque() ?? 0;
      board.traceUsage = 'mêlée tirage gagnant/perdant (R-180)';
      const roles = drawWeightedMelee(
        participants.map((u) => ({ id: u.id, weight: poids.get(u.id) ?? 0 })),
        board.rng,
      );
      board.traceUsage = '';
      if (board.trace) {
        const somme = tracePoids.reduce((acc, p) => acc + p.poids, 0);
        const rollsMelee = board.trace.trace.rolls.slice(rollDebut).map((r) => r.valeur);
        const winnerRole = roles.find((r) => r.role === 'winner');
        const w = tracePoids.find((p) => p.id === winnerRole?.id);
        decide(board, 'mêlée', 'R-180', `Mêlée (${tile.q},${tile.r}) — ${tracePoids.map((p) => `poids ${p.id}=${p.poids.toFixed(2)} (eff² ${p.eff.toFixed(2)}, étau ×${p.tau.toFixed(2)})`).join(', ')} ; Σw=${somme.toFixed(2)} ; tirage ${rollsMelee.join(' puis ')} → GAGNANTE ${winnerRole?.id ?? '—'} (w/Σw=${w && somme > 0 ? (w.poids / somme).toFixed(2) : '—'}) ; perdante −2 PV, intermédiaires −1 PV`, {
          case: tile, participants: tracePoids, sommePoids: somme, rolls: rollsMelee, roles,
        });
      }
      const winnerRole = roles.find((r) => r.role === 'winner');
      const winner = winnerRole ? st.units[winnerRole.id] : undefined;
      const results: Array<{ unitId: UnitId; role: 'winner' | 'loser' | 'middle'; hpAfter: number }> = [];
      const morts: Unit[] = [];
      for (const role of roles) {
        const u = st.units[role.id];
        if (!u) continue; // cargaison coulée en cascade (sécurité)
        if (role.role === 'winner') {
          results.push({ unitId: u.id, role: 'winner', hpAfter: u.hp });
          continue;
        }
        u.hp = Math.max(0, u.hp - (role.role === 'loser' ? MELEE_LOSER_DAMAGE : MELEE_MIDDLE_DAMAGE));
        results.push({ unitId: u.id, role: role.role, hpAfter: u.hp });
        if (u.hp <= 0) morts.push(u);
      }
      // Journal : la MÊLÉE est émise AVANT les MORT qu'elle cause (lisibilité).
      for (const r of roles) board.fought.add(r.id); // R-71 : pas de soin
      emit(board, {
        type: 'MeleeResolved',
        at: tile,
        participants: participants.map((u) => u.id),
        results,
      });
      let quelquUnEstMort = false;
      for (const u of morts) {
        quelquUnEstMort = true;
        kill(board, u, 'combat', winner?.id ?? null);
      }
      if (winner && quelquUnEstMort) {
        winner.veteran = true; // R-32 : coup fatal
        recordCombatVictory(board, winner); // 7h · R-123 (T-31) + soin Aztèque
      }
    }
  }

  // ---- 3 · Capture des unités pacifiques à la stabilisation (R-182) : une
  // case qui ne porte plus qu'UNE unité militaire stabilise sous elle — toute
  // unité pacifique ENNEMIE encore présente y est capturée (R-43 : butin,
  // barbares sans trésor). Une pacifique peut toujours FUIR avant (Phase A).
  {
    const groups = parCase();
    for (const key of [...groups.keys()].sort()) {
      const here = (groups.get(key) ?? []).filter((u) => st.units[u.id]);
      const military = here.filter((u) => !isPeaceful(u));
      if (military.length !== 1) continue;
      const maitre = military[0]!;
      for (const p of here.filter((u) => isPeaceful(u) && u.owner !== maitre.owner)) {
        // 7m · R-142 : un espion INFILTRÉ dans une ville est à l'abri — la
        // stabilisation de la ville ne le capture pas.
        if (isSpyUnit(p) && cityAt(board, { q: p.q, r: p.r })) continue;
        decide(board, 'capture-stabilisation', 'R-182', `${p.id} (pacifique) est capturé par ${maitre.id} à la stabilisation de (${p.q},${p.r})`, { pacifique: p.id, maitre: maitre.id, case: { q: p.q, r: p.r } });
        capturePeaceful(board, p, maitre.owner, maitre.id);
      }
    }
  }

  // ---- 4 · Marquage de stabilité (R-173) : exactement UNE unité sur la case
  // (pacifique comprise) → l'unité est stabilisée pour le tour suivant.
  {
    const groups = parCase();
    for (const id of Object.keys(st.units).sort(compareUnitIds)) {
      const u = st.units[id]!;
      if (u.aboard) continue;
      const count = groups.get(`${u.q},${u.r}`)?.length ?? 0;
      u.stabilized = count === 1;
    }
  }
}

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
  trace?: TraceCollector,
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
    formGroups: new Map(),
    pendingFill: new Set(),
    unknownEntered: new Set(),
    explored: new Map(),
    meleeDifferees: new Set(),
    entrees: new Map(),
    coAttaquees: new Set(),
    potentielEnnemi: new Set(),
    retenus: [],
    finalActions: new Map(),
    trace: trace ?? null,
    traceUsage: '',
    tracePhase: 'A',
  };

  // HANDOFF-TRACE-RESOLUTION : récolteur passif — le RNG est enveloppé pour
  // RAPPORTER chaque roll (aucun tirage ajouté, suite bit à bit identique).
  if (board.trace) rngTrace(board);
  trace?.phaseIn('A', st);

  for (const id of sortUnitIds(board)) {
    const u = st.units[id]!;
    board.origin.set(id, { q: u.q, r: u.r });
    board.steps.set(id, 0);
  }
  for (const playerId of Object.keys(st.players).sort()) {
    // R-161 (D6) : référence du fog — les cases explorées en DÉBUT de tour
    // (vision.explored n'est mise à jour qu'en Phase D). Une liste VIDE
    // (fixtures : fog non modélisé) est sans objet — aucune limite appliquée.
    const explored = st.players[playerId]!.vision.explored;
    if (explored.length > 0) board.explored.set(playerId, new Set(explored));
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
  // R-158 (D5) : un ordre composite MultiStep enchaîne déplacement(s) puis
  // UNE action finale ; l'action est exécutée en Phase C si l'unité a atteint
  // le terme du chemin, vivante, avec les PM requis (deplacement.json).
  for (const { unit, path, source, final, priority } of collectMoveOrders(board, allOrders)) {
    if (!st.units[unit.id] || unit.detainedBy) continue;
    const plannedLength = path.length; // executeMoveOrder consomme le tableau
    executeMoveOrder(board, unit, path, source, priority);
    if (!final || final !== 'foundCity') continue;
    const after = st.units[unit.id];
    if (!after) continue; // capturée en route (R-43) : rien à fonder
    if (plannedLength === 0) continue; // aucun déplacement programmé
    // R-161 (D6) : une entrée en case inconnue ce tour annule l'action finale
    // (l'étape suivante partirait d'une case inconnue — le reste est tu).
    if (board.unknownEntered.has(after.id)) continue;
    const last = path[path.length - 1] ?? source.path[source.path.length - 1];
    if (!last || after.q !== last.q || after.r !== last.r) continue; // terme du chemin non atteint (arrêt, blocage, fog R-161)
    const mpRequired = DEPLACEMENT.mpCostOfFinalAction;
    if (after.mp < mpRequired) continue; // PM insuffisants : action annulée, mouvement conservé
    board.finalActions.set(after.id, 'foundCity');
  }
  // R-158 : les actions finales foundCity sont injectées comme ordres
  // FoundCity synthétiques — processFoundCity re-applique TOUTES les
  // validations métier (Colon, terrain, T-09…). Annulée proprement sinon.
  const allOrdersWithFinals: Record<PlayerId, Order[]> = { ...allOrders };
  for (const [unitId] of board.finalActions) {
    const unit = st.units[unitId];
    if (!unit) continue;
    allOrdersWithFinals[unit.owner] = [
      ...(allOrdersWithFinals[unit.owner] ?? []),
      { type: 'FoundCity', unitId },
    ];
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
    // ENGAGEMENT · R-176 : un attaquant de MÊLÉE prend place sur la case
    // attaquée (fin des replis — il y demeurera en cas de survie mutuelle,
    // R-181) ; il doit donc être ADJACENT et payer le pas d'entrée.
    // R-59 : une unité à distance attaque depuis sa case, portée T-13 🔶
    // (1 = adjacente en v1) — elle n'entre jamais.
    if (unit.mp < 1) continue;
    const defender = defenseurStabilise(board, target, unit.owner);
    const campCible = villageAt(board, target);
    const gardienCamp = campCible ? gardienDuCamp(board, campCible) : null;
    // ENGAGEMENT · R-183 : le GARDIEN d'un camp attaque depuis SA CASE (il
    // demeure dans le camp, même en contre-attaque adjacente — R-97 rév.).
    const estGardien =
      isBarbarian(unit.owner) && villageAt(board, { q: unit.q, r: unit.r }) !== null;
    let cibleAttaque: UnitId | null = defender?.id ?? null;
    if (isRanged(unit) || estGardien) {
      // à distance / gardien : il faut une cible désignable (défenseur stabilisé/gardien)
      if (hexDistance(unit, target) > RANGED_RANGE) continue;
      let cible = defender;
      if (!cible && !gardienCamp && isRanged(unit) && !estGardien) {
        // R-159 rév. B (H2, Erik 17/09) : tir sur une case SANS défenseur
        // stabilisé (pile instable) — la cible est l'occupante militaire
        // ennemie la mieux fondée (fortifiée > PV > unitId) ; elle défend en
        // VALEURS D'ATTAQUE (R-174, non stabilisée) et le tir ne suspend ni
        // ne reporte rien (pas d'entrée physique).
        cible = mieuxFondeeSur(board, target, unit.owner);
      }
      if (!cible && !gardienCamp) continue;
      unit.mp -= 1;
      cibleAttaque = cible?.id ?? null;
    } else {
      if (hexDistance(unit, target) !== 1) continue; // l'entrée exige le contact
      // R-159 rév. B (P1) : ≥ 2 attaquants du MÊME camp sur la même case
      // défendue → entrée RETENUE, séquencée en Phase B (R-177) : la mort du
      // défenseur par le premier ferme la porte aux suivants du même camp.
      // Un camp barbare visé reste un villageAttack (capture R-183 à la clé).
      const viaCamp = !defender && !!campCible && !!gardienCamp && !isBarbarian(unit.owner);
      if (
        (defender || viaCamp) &&
        board.coAttaquees.has(`${unit.owner}|${tileKeyOf(target)}`)
      ) {
        board.retenus.push({ unitId: unit.id, at: { ...target }, priorite: 0, active: false });
        decide(board, 'entree-retenue', 'R-159 rév. B', `${unit.id} RETENU devant (${target.q},${target.r}) — ordre Attack explicite sur une case co-attaquée : l'entrée se séquencera en Phase B (R-177)`, { unitId: unit.id, case: target });
        if (viaCamp) {
          board.planned.push({ kind: 'villageAttack', at: target, attackerId: unit.id, villageId: campCible!.id, latent: true });
        } else {
          board.planned.push({ kind: 'attack', at: target, attackerId: unit.id, defenderId: defender!.id, latent: true });
        }
        continue;
      }
      unit.mp -= 1;
      // Interprétation ENGAGEMENT : une unité qui ne peut pas ENTRER sur la
      // case (ex. navire en mer attaqué depuis la rive) attaque depuis sa
      // position ; en survie mutuelle il n'y a alors pas de cohabitation
      // (pas d'instabilité) — la case ne peut pas être occupée.
      if (canEnter(board, unit, target)) moveUnit(board, unit, target);
    }
    if (campCible && gardienCamp && !isBarbarian(unit.owner)) {
      // R-96 rév. ENGAGEMENT : attaquer le gardien du camp (capture à sa
      // mort) — les CIVILISATIONS seulement : un barbare n'attaque jamais son
      // camp (un satellite qui vise un ennemi posé sur le camp se joint
      // simplement à l'instabilité de la case — R-174).
      board.planned.push({ kind: 'villageAttack', at: target, attackerId: unit.id, villageId: campCible.id });
    } else if (cibleAttaque) {
      board.planned.push({ kind: 'attack', at: target, attackerId: unit.id, defenderId: cibleAttaque });
    }
    // sans défenseur stabilisé : l'attaquant de mêlée s'est simplement joint
    // à l'instabilité de la case (mêlée de Phase E).
  }
  // R-44 : formation d'armées en fin de Phase A.
  processFormArmy(board, allOrdersFlattened(allOrders));
  trace?.phaseOut('A', st);

  // ---- Phase B : combats (R-50 : tri par case puis attaquant croissant).
  // ENGAGEMENT · R-177 : sur une même case, les attaquants résolvent UN PAR UN
  // dans l'ordre : plus de PM restants d'abord, puis plus forte ATTAQUE, puis
  // DÉFENSE croissante, puis plus de PV ; à égalité, tirage aléatoire seedé.
  // La séquence s'arrête quand le défenseur est détruit (les attaquants
  // suivants n'attaquent pas — ils demeurent, instabilité → mêlée Phase E).
  trace?.phaseIn('B', st);
  board.tracePhase = 'B';
  const ordreAleatoire = new Map<string, number>();
  for (const plan of board.planned) {
    ordreAleatoire.set(
      clePlan(plan),
      rollTrace(board, `R-177 tirage d'égalité att=${plan.attackerId}`, () => board.rng.next()),
    );
  }
  board.planned.sort(
    (a, b) =>
      compareHex(a.at, b.at) ||
      cleR166(board, a, b, ordreAleatoire),
  );
  // TRACE · R-177 : la séquence d'attaque retenue par case, avec ses entrées.
  if (board.trace) {
    const parCase = new Map<string, string[]>();
    for (const plan of board.planned) {
      const k = tileKeyOf(plan.at);
      const l = parCase.get(k) ?? [];
      l.push(plan.attackerId);
      parCase.set(k, l);
    }
    for (const [k, attaquants] of [...parCase.entries()].sort()) {
      if (attaquants.length < 2) continue;
      decide(board, 'ordre-attaque', 'R-177', `Case (${k}) : séquence d'attaque ${attaquants.join(' → ')} (PM restants → attaque → défense croissante → PV → tirage seedé)`, { case: k, attaquants, ordreAleatoire: attaquants.map((a) => ordreAleatoire.get(a)) });
    }
  }
  for (const plan of board.planned) {
    if (plan.kind === 'attack') {
      const attacker = st.units[plan.attackerId];
      const defender = st.units[plan.defenderId];
      if (!attacker) continue; // morte entre-temps
      const caseCible = plan.at;
      if (plan.latent) {
        // R-159 rév. B (P1) : entrée RETENUE — activation au tour R-177 de
        // l'attaquant. Défenseur vivant → entrer PUIS attaquer ; défenseur
        // déjà mort → entrer SANS combattre seulement si des ennemis demeurent
        // (P1) ; sinon refus — l'unité reste devant la case.
        const retenue = board.retenus.find((r) => r.unitId === plan.attackerId && !r.active);
        if (!retenue) continue;
        retenue.active = true;
        if (hexDistance(attacker, caseCible) !== 1 || attacker.mp < 1) {
          decide(board, 'entree-retenue-refus', 'R-159 rév. B', `${attacker.id} RETENU reste devant (${caseCible.q},${caseCible.r}) — hors de portée ou sans PM`, { unitId: attacker.id, case: caseCible, mp: attacker.mp });
          continue;
        }
        if (!defender) {
          if (!occupants(board, caseCible).some((u) => u.owner !== attacker.owner)) {
            decide(board, 'entree-retenue-refus', 'R-159-b', `${attacker.id} n'entre pas : défenseur déjà mort et aucun ennemi ne demeure sur (${caseCible.q},${caseCible.r})`, { unitId: attacker.id, case: caseCible });
            continue;
          }
          attacker.mp -= 1;
          moveUnit(board, attacker, caseCible); // entrée sans combat (P1)
          decide(board, 'entree-retenue-sans-combat', 'R-159-b', `${attacker.id} entre SANS combattre sur (${caseCible.q},${caseCible.r}) — le défenseur est mort, des ennemis demeurent`, { unitId: attacker.id, case: caseCible });
          continue;
        }
        attacker.mp -= 1;
        moveUnit(board, attacker, caseCible);
        decide(board, 'entree-retenue-activation', 'R-159-b', `${attacker.id} entre PUIS attaque ${defender.id} sur (${caseCible.q},${caseCible.r}) — séquence R-177 des entrées retenues`, { unitId: attacker.id, defenseur: defender.id, case: caseCible });
        resolveAttack(board, attacker, defender, { q: defender.q, r: defender.r });
        if (defender.stabilized) board.meleeDifferees.add(tileKeyOf(caseCible));
        continue;
      }
      if (!defender) continue; // l'un est mort entre-temps
      // R-59 : portée T-13 pour l'attaquant à distance, contact sinon.
      const range = isRanged(attacker) ? RANGED_RANGE : 1;
      if (hexDistance(attacker, defender) > range) continue; // plus au contact
      // R-176a : le défenseur a QUITTÉ la case visée pendant la Phase A —
      // l'échange a lieu sur sa case actuelle (coup en passant).
      const origineDef = board.origin.get(defender.id);
      if (origineDef && (origineDef.q !== plan.at.q || origineDef.r !== plan.at.r)) {
        decide(board, 'coup-en-passant', 'R-176a', `${attacker.id} attaque ${defender.id} EN PASSANT sur (${defender.q},${defender.r}) — il a quitté la case visée (${plan.at.q},${plan.at.r}) et se défend en valeurs d'attaque (R-174)`, { attaquant: attacker.id, defenseur: defender.id, caseVisee: plan.at, caseReelle: { q: defender.q, r: defender.r } });
      }
      resolveAttack(board, attacker, defender, { q: defender.q, r: defender.r });
      // R-178 rév. A : un défenseur STABILISÉ attaqué → mêlée REPORTÉE au
      // tour suivant. Un tir/attaque sur unité non stabilisée (pile) ne
      // reporte rien — la dispersion de pile amie n'est pas suspendue (H2).
      if (defender.stabilized) {
        board.meleeDifferees.add(tileKeyOf({ q: defender.q, r: defender.r }));
        decide(board, 'melee-reportee', 'R-178 rév. A', `Mêlée REPORTÉE au tour suivant sur (${defender.q},${defender.r}) — un défenseur stabilisé y a été attaqué ; il conserve ses bonus (R-175)`, { case: { q: defender.q, r: defender.r }, defenseur: defender.id });
      }
    } else {
      // R-96 (rév. ENGAGEMENT) : le gardien défend sa case s'il est vivant.
      const attacker = st.units[plan.attackerId];
      const village = st.villages.find((v) => v.id === plan.villageId);
      if (!attacker || !village) continue;
      if (plan.latent) {
        const retenue = board.retenus.find((r) => r.unitId === plan.attackerId && !r.active);
        if (!retenue) continue;
        retenue.active = true;
        if (hexDistance(attacker, { q: village.q, r: village.r }) !== 1 || attacker.mp < 1) continue;
        attacker.mp -= 1;
        moveUnit(board, attacker, { q: village.q, r: village.r });
      } else if (hexDistance(attacker, village) > 1) {
        continue; // plus au contact
      }
      resolveVillageAttack(board, attacker, village, { q: village.q, r: village.r });
      board.meleeDifferees.add(tileKeyOf({ q: village.q, r: village.r }));
    }
  }

  // R-159 rév. B : activation des retenues NON attaquantes (renfort défensive
  // P3, jointure d'une instabilité) APRÈS la Phase B — l'ennemi est-il là ?
  // (occupant ennemi, ou entrée physique ennemie ce tour — H2 : un tir à
  // distance n'entre jamais et ne légalise pas l'entrée). Ordre : priorité de
  // programmation (la « première programmée » entre), puis unitId (R-81).
  for (const r of [...board.retenus].sort(
    (x, y) => x.priorite - y.priorite || compareUnitIds(x.unitId, y.unitId),
  )) {
    if (r.active) continue;
    r.active = true;
    const u = st.units[r.unitId];
    if (!u || u.mp < 1) {
      decide(board, 'renfort-refus', 'R-159 rév. B', `${r.unitId} retenu n'entre pas sur (${r.at.q},${r.at.r}) — plus de PM ou morte`, { unitId: r.unitId, case: r.at });
      continue;
    }
    const ennemiIci = occupants(board, r.at).some((x) => x.owner !== u.owner);
    const entreeEnnemie = [...(board.entrees.get(tileKeyOf(r.at)) ?? [])].some((o) => o !== u.owner);
    if (ennemiIci || entreeEnnemie) {
      u.mp -= 1;
      moveUnit(board, u, r.at);
      decide(board, 'renfort-entree', 'R-159 rév. B', `${u.id} entre sur (${r.at.q},${r.at.r}) — un ennemi y demeure ou y est entré ce tour (priorité ${r.priorite})`, { unitId: u.id, case: r.at, priorite: r.priorite, ennemiIci, entreeEnnemie });
    } else {
      decide(board, 'renfort-refus', 'R-159 rév. B', `${u.id} retenu n'entre pas sur (${r.at.q},${r.at.r}) — aucun ennemi présent ni entré ce tour (un tir ne compte pas, H2)`, { unitId: u.id, case: r.at, priorite: r.priorite });
    }
  }
  trace?.phaseOut('B', st);

  // ---- Phase C : économie (R-60 à R-66) + barbares (R-96 : villages).
  trace?.phaseIn('C', st);
  board.tracePhase = 'C';
  applyLaunches(board, allOrders); // 7m · R-139 : frappes nucléaires (en tête de Phase C)
  applySetProduction(board, allOrders);
  applyRushBuys(board, allOrders); // 7l · R-135 : achat instantané (avant l'économie)
  applyGreatPersonActions(board, allOrders); // 7j · R-126 (alias InstallPerson R-115)
  applySpyMissions(board, allOrders); // 7g · R-119
  applySpyActions(board, allOrders); // 7m · R-143 : actions d'espionnage en ville ennemie
  processCityCaptures(board);
  processFoundCity(board, allOrdersWithFinals);
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
  trace?.phaseOut('C', st);

  // ---- Phase E : stabilité (ENGAGEMENT — R-173..R-182, fin de tour).
  // 1) expulsion de cohabitation (R-179 : case à plusieurs AMIES) ;
  // 2) mêlées d'instabilité (R-178/R-180/R-181 : une par case et par tour) ;
  // 3) capture des unités pacifiques à la stabilisation (R-182) ;
  // 4) marquage `stabilized` (R-173) pour le tour suivant.
  // Avant la Phase D : les mêlées marquent `fought` — une unité qui a combattu
  // ne se soigne pas (R-71).
  trace?.phaseIn('E', st);
  board.tracePhase = 'E';
  const stabiliseesAvant = board.trace
    ? Object.values(st.units).filter((u) => u.stabilized).map((u) => u.id)
    : [];
  processStability(board);
  if (board.trace) {
    const nouveautes = Object.values(st.units)
      .filter((u) => u.stabilized && !stabiliseesAvant.includes(u.id))
      .map((u) => u.id);
    decide(board, 'stabilisation', 'R-173', `${nouveautes.length} unité(s) marquée(s) STABILISÉE(s) pour le tour suivant (case à exactement une unité)`, { stabilisees: nouveautes });
  }
  trace?.phaseOut('E', st);

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

/** Clé stable d'un plan (son attaquant). */
function clePlan(plan: CombatPlan): string {
  return plan.attackerId;
}

/**
 * ENGAGEMENT · R-177 : comparaison de DEUX attaquants d'une même case —
 * plus de PM restants d'abord, puis plus forte ATTAQUE, puis DÉFENSE
 * croissante, puis plus de PV ; à égalité complète, tirage aléatoire seedé
 * (une valeur par plan, tirée en tête de Phase B), puis unitId (R-81).
 */
function cleR166(
  board: { st: { units: Record<string, Unit | undefined> } },
  a: CombatPlan,
  b: CombatPlan,
  ordreAleatoire: Map<string, number>,
): number {
  const ua = board.st.units[a.attackerId]!;
  const ub = board.st.units[b.attackerId]!;
  return (
    ub.mp - ua.mp ||
    unitType(ub.type).attack - unitType(ua.type).attack ||
    unitType(ua.type).defense - unitType(ub.type).defense ||
    ub.hp - ua.hp ||
    (ordreAleatoire.get(clePlan(a)) ?? 0) - (ordreAleatoire.get(clePlan(b)) ?? 0) ||
    compareUnitIds(a.attackerId, b.attackerId)
  );
}
