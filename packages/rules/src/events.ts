/**
 * Journal d'événements séquencé — RULES.md §9 R-73.
 * Chaque mutation du moteur émet un événement typé ; le journal alimente
 * l'animation client, les notifications et (plus tard) le replay.
 * Les `seq` sont consécutifs et persistent entre les tours (GameState.lastEventSeq).
 */
import type { Hex } from './hex.js';
import type { CityId, PlayerId, TileKey, UnitId } from './state.js';
import type { TechEra } from './types.js';

/** Cause de destruction d'une unité. 7g : `sunk` (cargaison d'un navire
 *  coulé — R-117), `mission` (Espion consommé par une mission réussie — R-119 ;
 *  7m : ICBM consommée par son lancement — R-139). 7m : `nuke` (unité détruite
 *  dans le rayon d'une détonation — C13.4/R-139) ; `capture` sert aussi à
 *  l'élimination SANS COMBAT d'un espion hors ville (R-142). */
export type DestructionCause = 'combat' | 'collision' | 'capture' | 'sunk' | 'mission' | 'nuke';

/** R-98 · Récompense structurée d'une hutte ouverte (contenu de HutOpened). */
export type HutReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'unit'; unitType: string; unitIds: UnitId[] }
  | { kind: 'science'; amount: number }
  | { kind: 'reveal'; radius: number }
  | { kind: 'ambush'; unitIds: UnitId[] }
  | { kind: 'nothing' };

export type GameEvent =
  /** Un pas de mouvement exécuté (un événement par case traversée). */
  | { seq: number; type: 'Move'; unitId: UnitId; owner: PlayerId; from: Hex; to: Hex }
  /** Une attaque engagée (y compris chaque itération d'attaques répétées R-55). */
  | { seq: number; type: 'Attack'; attackerId: UnitId; defenderId: UnitId; at: Hex }
  /** Le résultat d'un échange (T-03 round(s)) : PV après échange. */
  | {
      seq: number;
      type: 'CombatExchange';
      attackerId: UnitId;
      defenderId: UnitId;
      at: Hex;
      attackerHpAfter: number;
      defenderHpAfter: number;
    }
  | { seq: number; type: 'UnitDestroyed'; unitId: UnitId; owner: PlayerId; at: Hex; cause: DestructionCause; byUnitId: UnitId | null }
  /** Repli (R-54) ou déplacement forcé (formation ratée, R-44). */
  | { seq: number; type: 'Retreat'; unitId: UnitId; owner: PlayerId; from: Hex; to: Hex }
  /**
   * Capture d'une unité pacifique (R-43). En guerre (v1) : outcome 'destroyed'
   * (+ BootyGold). En paix (Phase 7) : 'detained'.
   */
  | { seq: number; type: 'Captured'; unitId: UnitId; owner: PlayerId; byPlayer: PlayerId; at: Hex; outcome: 'destroyed' | 'detained' }
  /** Butin en or (T-12 capture, T-20 destruction de village R-96) — la source
   *  est une unité (`sourceUnitId`) OU un village (`sourceVillageId`). */
  | {
      seq: number;
      type: 'BootyGold';
      player: PlayerId;
      amount: number;
      sourceUnitId: UnitId | null;
      sourceVillageId?: string;
    }
  /** Fusion d'armée réussie (R-31/R-44) : les 3 membres deviennent l'entité unitId. */
  | { seq: number; type: 'ArmyFormed'; unitId: UnitId; owner: PlayerId; memberIds: UnitId[]; at: Hex }
  | { seq: number; type: 'CityFounded'; cityId: CityId; owner: PlayerId; at: Hex; capital: boolean; byUnitId: UnitId | null }
  /** R-65 : ville sans défenseur investie → capture (capitale = victoire). R-97 : capture BARBARE → rasement. */
  /** 7l · R-134 : `plunder` = sac de ville — part de la trésorerie du perdant
   *  créditée au captreur (economy.json `cityCapturePlunderPct` 🔶 0.5). */
  | { seq: number; type: 'CityCaptured'; cityId: CityId; fromOwner: PlayerId; toOwner: PlayerId; at: Hex; plunder?: number }
  /** Production d'une unité par une ville (R-62). */
  | { seq: number; type: 'UnitProduced'; unitId: UnitId; cityId: CityId; owner: PlayerId; unitType: string; at: Hex }
  /** Technologie complétée (R-85, Phase 7a) : déblocages immédiats (R-87). */
  | { seq: number; type: 'TechResearched'; player: PlayerId; tech: string }
  /** 7e · Premier découvrir : récompense CivRev appliquée au premier joueur
   *  à compléter la tech (unité/bâtiment gratuit, or, population, perCity,
   *  remises, révélation de carte). */
  | {
      seq: number;
      type: 'FirstDiscovered';
      player: PlayerId;
      tech: string;
      label: string;
      unitType?: string;
      unitIds?: UnitId[];
      building?: string;
      cityId?: CityId;
      gold?: number;
      population?: number;
      perCity?: { gold?: number; science?: number; production?: number; commerce?: number };
      mapReveal?: boolean;
      /** 7j · D5.1 · R-109 étendu : classe du GP gratuit engendré
       *  (Premier découvrir de l'Invention / de la Monarchie). */
      greatPerson?: string;
    }
  /** Croissance d'une ville : +1 pop = +1 citoyen (R-63, Phase 6). */
  | { seq: number; type: 'PopulationGrew'; cityId: CityId; owner: PlayerId; pop: number; at: Hex }
  /** 7e · Population consommée par la PRODUCTION d'une unité (Colon : 2 pop —
   *  comportement officiel CivRev adopté par Erik le 02/09). */
  | { seq: number; type: 'PopulationConsumed'; cityId: CityId; owner: PlayerId; pop: number; byUnitType: string; at: Hex }
  /** 7i · D5 · R-64 (rév.) : fonder une ville sur une case à ressource la
   *  DÉTRUIT définitivement (effacée de la carte). */
  | { seq: number; type: 'ResourceDestroyed'; resource: string; at: Hex; cityId: CityId | null; owner: PlayerId }
  /** Bâtiment construit par une ville (R-66, Phase 6). */
  | { seq: number; type: 'BuildingCompleted'; cityId: CityId; owner: PlayerId; building: string; at: Hex }
  /** Point d'accroche diplomatie (R-58-b) — inactif en v1 (guerre permanente). */
  | { seq: number; type: 'DiplomaticIncident'; between: [PlayerId, PlayerId]; at: Hex }
  /** Victoire — v1 : 'domination' (capture de la capitale adverse, R-65),
   *  'forfait' (T-06), 'razedCapital' (capitale rasée par les barbares,
   *  R-97 — Phase 7d), 'culture' (Nations Unies — R-116), 'science'
   *  (Vaisseau spatial — R-124) ou 'economique' (Banque mondiale — 7l ·
   *  R-137). */
  | { seq: number; type: 'Victory'; winner: PlayerId; reason: 'domination' | 'forfeit' | 'razedCapital' | 'culture' | 'science' | 'economique' }
  /** 7h · R-122 : adoption d'un régime — `anarchy: true` = transition manuelle
   *  (1 tour d'Anarchie), `false` = bascule à la complétion de la tech. */
  | { seq: number; type: 'GovernmentChanged'; player: PlayerId; government: string; anarchy: boolean }
  /** 7h · R-124 : les 4 composants du Vaisseau spatial sont contrôlés —
   *  lancement (précède immédiatement Victory 'science'). */
  | { seq: number; type: 'Launch'; player: PlayerId; at: Hex }
  /** R-96 · Engendrement d'une unité barbare par un village (Phase 7d). */
  | { seq: number; type: 'BarbarianSpawned'; unitId: UnitId; villageId: string; owner: PlayerId; at: Hex }
  /** R-96 · Village barbare détruit (0 PV) — or T-20 au vainqueur (BootyGold). */
  | { seq: number; type: 'VillageDestroyed'; villageId: string; byPlayer: PlayerId; byUnitId: UnitId | null; at: Hex }
  /** R-97 · Ville rasée par les barbares (capture barbare : aucun changement de
   *  propriétaire, la ville disparaît avec ses bâtiments). */
  | { seq: number; type: 'CityRazed'; cityId: CityId; owner: PlayerId; byPlayer: PlayerId; at: Hex }
  /** R-98 · Hutte ouverte — récompense tirée au RNG seedé (table huttes.json). */
  | { seq: number; type: 'HutOpened'; hutId: string; byPlayer: PlayerId; byUnitId: UnitId | null; at: Hex; reward: HutReward }
  /** 7f · R-114 : Personnage illustre de culture engendré par une ville (seuil
   *  T-27 franchi) — unité pacifique Artiste/Penseur. */
  | { seq: number; type: 'GreatPersonSpawned'; unitId: UnitId; unitType: string; cityId: CityId; owner: PlayerId; at: Hex }
  /** 7f · R-115 : un GP s'installe définitivement dans une ville amie (+1 jalon). */
  | { seq: number; type: 'InstallPerson'; unitId: UnitId; unitType: string; cityId: CityId; owner: PlayerId; at: Hex }
  /** 7j · R-126 : un GP est CONSOMMÉ (Consume) — effet massif immédiat selon
   *  la classe, le GP disparaît ; `effect` décrit l'effet appliqué (UI). */
  | { seq: number; type: 'GreatPersonConsumed'; unitId: UnitId; unitType: string; player: PlayerId; cityId: CityId | null; effect: string }
  /** 7f · R-115/R-116 : variation des jalons culturels (GP installés,
   *  merveilles construites/capturées/perdues) — `total` = compteur résultant. */
  | {
      seq: number;
      type: 'CultureMilestone';
      player: PlayerId;
      delta: number;
      total: number;
      reason: 'install' | 'wonderBuilt' | 'wonderCaptured' | 'wonderLost' | 'gpStolen' | 'obtain' | 'nuke';
    }
  /** 7f · R-116 : merveille achevée dans une ville (jalon, effet, ONU → victoire). */
  | { seq: number; type: 'WonderCompleted'; cityId: CityId; owner: PlayerId; wonder: string; at: Hex }
  /**
   * 7k · R-130 · M3 · Récupération de marteaux : un rival a complété la
   * merveille qui était en chantier dans `cityId` (ou départage C8 d'une
   * complétion simultanée) — les marteaux investis (`amount`) basculent en
   * RÉSERVE PERMANENTE (`pendingSalvage`, 7l · C7 : plus de dissipation,
   * révisée — le littéral 'dissipated' de 7k est RETIRÉ de l'union, choix
   * documenté). La réserve finance le projet choisi par le joueur (R-130
   * rév.) jusqu'à épuisement.
   */
  | {
      seq: number;
      type: 'HammerSalvage';
      cityId: CityId;
      owner: PlayerId;
      /** Merveille concernée — null pour un départage C8 sans mérite. */
      wonder: string | null;
      amount: number;
      outcome: 'available';
    }
  /** 7l · R-136 · Palier économique franchi (trésorerie ≥ seuil, une seule
   *  fois, dans l'ordre des seuils) — `reward` est la clé de récompense
   *  (settler | tech | greatPerson | granary | population | aqueduct |
   *  worldBank) et `label` le libellé FR (economy.json). */
  | {
      seq: number;
      type: 'EconomyMilestone';
      player: PlayerId;
      threshold: number;
      reward: string;
      label: string;
    }
  /** 7l · R-135 · Achat instantané (rush-buy) : la production courante de la
   *  ville est complétée immédiatement, la trésorerie est débitée du coût
   *  (marteaux restants × facteur d'ère × réductions — R-135). Les
   *  événements de complétion usuels suivent (UnitProduced, BuildingCompleted,
   *  WonderCompleted…). */
  | {
      seq: number;
      type: 'RushBuy';
      cityId: CityId;
      owner: PlayerId;
      item: { kind: 'unit' | 'building' | 'wonder'; id: string };
      cost: number;
      at: Hex;
    }
  /** 7k · R-132 · Atelier de Léonard : les unités obsolètes de l'empire ont
   *  été mises à niveau (R-111 — `upgradeTo` en chaîne, vétérans/PV conservés). */
  | { seq: number; type: 'UnitsUpgraded'; player: PlayerId; upgrades: Array<{ unitId: UnitId; from: string; to: string }> }
  /** 7g · R-117 : embarquement d'une unité terrestre sur un transport ami
   *  (Galère/Galion, capacité 1) — l'unité quitte la carte (à bord). */
  | { seq: number; type: 'Embark'; unitId: UnitId; owner: PlayerId; transportId: UnitId; at: Hex }
  /** 7g · R-117 : débarquement — l'unité quitte son transport vers une case
   *  terrestre libre adjacente. */
  | { seq: number; type: 'Disembark'; unitId: UnitId; owner: PlayerId; transportId: UnitId; at: Hex }
  /** 7g · R-119 : mission d'espionnage tentée — `success` (vol effectué,
   *  espion consommé) ou `failed` (conditions non remplies, espion survit). */
  | { seq: number; type: 'SpyMission'; unitId: UnitId; owner: PlayerId; cityId: CityId; target: PlayerId; outcome: 'success' | 'failed' }
  /** 7g · R-119 : un GP installé a été volé (jalon retiré à la victime, jalon
   *  crédité au voleur — escalade T-27 inchangée, décision d'Erik). */
  | { seq: number; type: 'GreatPersonStolen'; spyId: UnitId; thief: PlayerId; victim: PlayerId; cityId: CityId; at: Hex }
  // --- 7n · R-145..R-150 : civilisations & traits ---
  /** 7n · R-147 : l'ère d'un joueur change (COMPAGE de techs — seuils 5/14/24,
   *  transition appliquée AU TOUR SUIVANT). Public (l'ère est une information
   *  publique, comme la civ adverse — canon). */
  | { seq: number; type: 'EraChanged'; player: PlayerId; era: TechEra; turn: number }
  // --- 7m · R-138..R-144 : nucléaire & espionnage jeu de base ---
  /** 7m · R-139 : lancement d'ICBM résolu — `detonated` (frappe C13),
   *  `intercepted` (SDI de la ville ciblée, R-141), `blocked` (7n · C17 :
   *  Grande Muraille du propriétaire — missile consommé, aucun dégât) ou
   *  `refused` (Démocratie R-140 / cible invisible — missile non consommé).
   *  `cityId` porte la ville ciblée (détonation), interceptrice ou protégée ;
   *  `reason` documente un refus. */
  | {
      seq: number;
      type: 'NukeLaunched';
      unitId: UnitId;
      owner: PlayerId;
      at: Hex;
      target: Hex;
      outcome: 'detonated' | 'intercepted' | 'blocked' | 'refused';
      cityId?: CityId;
      reason?: 'democratie' | 'cibleInvisible' | 'grandeMuraille';
    }
  /** 7m · C13/R-139 : une ville ciblée a subi la résolution C13 — survit, pop
   *  résultante (`popAfter` = min(pop, 2) 🔶), bâtiments détruits (moitié
   *  seedée, Palais exclu — C13.2). Merveilles et GP installés préservés. */
  | {
      seq: number;
      type: 'CityNuked';
      cityId: CityId;
      owner: PlayerId;
      at: Hex;
      popAfter: number;
      buildingsDestroyed: string[];
    }
  /** 7m · R-143 : action d'espionnage tentée par un espion infiltré —
   *  `success` (action exécutée, espion consommé sauf `leave`) ou `failed`
   *  (aucune cible valable — espion survit). Précédée d'un `SpyDuel` si
   *  garnison adverse (R-144). */
  | {
      seq: number;
      type: 'SpyAction';
      unitId: UnitId;
      owner: PlayerId;
      cityId: CityId;
      target: PlayerId;
      action: 'stealGold' | 'kidnapGreatPerson' | 'sabotageProduction' | 'destroyBuilding' | 'destroyFortifications' | 'leave';
      outcome: 'success' | 'failed';
    }
  /** 7m · R-144 : duel d'espions — garnison adverse dans la ville ciblée.
   *  Le perdant est détruit sans exécuter sa mission ; le gagnant survit
   *  (l'attaquant gagnant consomme ensuite son action — R-143). */
  | {
      seq: number;
      type: 'SpyDuel';
      cityId: CityId;
      attackerId: UnitId;
      defenderId: UnitId;
      thief: PlayerId;
      defender: PlayerId;
      winner: PlayerId;
    }
  /** 7m · R-143 : or volé (`stealGold`) — débité à la victime, crédité au
   *  voleur ; l'événement ne révèle que le MONTANT (la trésorerie adverse
   *  reste non publique — fog R-134). */
  | { seq: number; type: 'GoldStolen'; spyId: UnitId; thief: PlayerId; victim: PlayerId; cityId: CityId; amount: number }
  /** 7m · R-143 : GP « en attente de choix » enlevé (`kidnapGreatPerson`) —
   *  transféré au voleur (aucun jalon ni escalade ne varie — miroir C2). */
  | {
      seq: number;
      type: 'GreatPersonKidnapped';
      spyId: UnitId;
      thief: PlayerId;
      victim: PlayerId;
      cityId: CityId;
      unitId: UnitId;
      gpType: string;
    }
  /** 7m · R-143 : bâtiment détruit par un espion (`destroyBuilding` — cible
   *  non-Palais choisie 🔶 ; les merveilles sont épargnées). */
  | { seq: number; type: 'SpyBuildingDestroyed'; spyId: UnitId; thief: PlayerId; victim: PlayerId; cityId: CityId; building: string; at: Hex }
  /** Fin de résolution : newState est l'état du tour indiqué. */
  | { seq: number; type: 'TurnResolved'; turn: number };

/** 7e · Payload de `FirstDiscovered` SANS seq (l'appelant séquence) — partagé
 *  par le moteur (turn.ts), les actions immédiates (research.ts) et les huttes
 *  (barbares.ts, cascade science). */
export type FirstDiscoveredPayload = Omit<
  Extract<GameEvent, { type: 'FirstDiscovered' }>,
  'seq'
>;

/** Références extraites d'un événement, pour le filtrage par brouillard (L5). */
export interface EventRefs {
  tiles: TileKey[];
  unitIds: UnitId[];
  cityIds: CityId[];
  players: PlayerId[];
}

export function eventRefs(event: GameEvent): EventRefs {
  const refs: EventRefs = { tiles: [], unitIds: [], cityIds: [], players: [] };
  const hex = (h: Hex | undefined) => {
    if (h) refs.tiles.push(`${h.q},${h.r}`);
  };
  switch (event.type) {
    case 'Move':
    case 'Retreat':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.owner);
      hex(event.from);
      hex(event.to);
      break;
    case 'Attack':
    case 'CombatExchange':
      refs.unitIds.push(event.attackerId, event.defenderId);
      hex(event.at);
      break;
    case 'UnitDestroyed':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'Captured':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.owner, event.byPlayer);
      hex(event.at);
      break;
    case 'BootyGold':
      refs.players.push(event.player);
      if (event.sourceUnitId) refs.unitIds.push(event.sourceUnitId);
      break;
    case 'ArmyFormed':
      refs.unitIds.push(event.unitId, ...event.memberIds);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'CityFounded':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'CityCaptured':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.fromOwner, event.toOwner);
      hex(event.at);
      break;
    case 'UnitProduced':
      refs.unitIds.push(event.unitId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'TechResearched':
      refs.players.push(event.player);
      break;
    case 'FirstDiscovered':
      refs.players.push(event.player);
      if (event.unitIds) refs.unitIds.push(...event.unitIds);
      if (event.cityId) refs.cityIds.push(event.cityId);
      break;
    case 'PopulationGrew':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'PopulationConsumed':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'ResourceDestroyed':
      if (event.cityId) refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'BuildingCompleted':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'DiplomaticIncident':
      refs.players.push(...event.between);
      hex(event.at);
      break;
    case 'Victory':
      refs.players.push(event.winner);
      break;
    case 'GovernmentChanged':
      refs.players.push(event.player);
      break;
    case 'Launch':
      refs.players.push(event.player);
      hex(event.at);
      break;
    case 'BarbarianSpawned':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'VillageDestroyed':
      refs.players.push(event.byPlayer);
      hex(event.at);
      break;
    case 'CityRazed':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner, event.byPlayer);
      hex(event.at);
      break;
    case 'EraChanged':
      refs.players.push(event.player);
      break;
    case 'HutOpened':
      refs.players.push(event.byPlayer);
      hex(event.at);
      break;
    case 'GreatPersonSpawned':
    case 'InstallPerson':
      refs.unitIds.push(event.unitId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'GreatPersonConsumed':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.player);
      if (event.cityId) refs.cityIds.push(event.cityId);
      break;
    case 'CultureMilestone':
      refs.players.push(event.player);
      break;
    case 'WonderCompleted':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'HammerSalvage':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      break;
    case 'EconomyMilestone':
      refs.players.push(event.player);
      break;
    case 'RushBuy':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'UnitsUpgraded':
      refs.players.push(event.player);
      for (const u of event.upgrades) refs.unitIds.push(u.unitId);
      break;
    case 'Embark':
    case 'Disembark':
      refs.unitIds.push(event.unitId, event.transportId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'SpyMission':
      refs.unitIds.push(event.unitId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner, event.target);
      break;
    case 'GreatPersonStolen':
      refs.unitIds.push(event.spyId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.thief, event.victim);
      hex(event.at);
      break;
    case 'NukeLaunched':
      refs.unitIds.push(event.unitId);
      refs.players.push(event.owner);
      hex(event.at);
      hex(event.target);
      break;
    case 'CityNuked':
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner);
      hex(event.at);
      break;
    case 'SpyAction':
      refs.unitIds.push(event.unitId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.owner, event.target);
      break;
    case 'SpyDuel':
      refs.unitIds.push(event.attackerId, event.defenderId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.thief, event.defender);
      break;
    case 'GoldStolen':
      refs.unitIds.push(event.spyId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.thief, event.victim);
      break;
    case 'GreatPersonKidnapped':
      refs.unitIds.push(event.spyId, event.unitId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.thief, event.victim);
      break;
    case 'SpyBuildingDestroyed':
      refs.unitIds.push(event.spyId);
      refs.cityIds.push(event.cityId);
      refs.players.push(event.thief, event.victim);
      hex(event.at);
      break;
    case 'TurnResolved':
      break;
  }
  return refs;
}
