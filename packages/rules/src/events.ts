/**
 * Journal d'événements séquencé — RULES.md §9 R-73.
 * Chaque mutation du moteur émet un événement typé ; le journal alimente
 * l'animation client, les notifications et (plus tard) le replay.
 * Les `seq` sont consécutifs et persistent entre les tours (GameState.lastEventSeq).
 */
import type { Hex } from './hex.js';
import type { CityId, PlayerId, TileKey, UnitId } from './state.js';

/** Cause de destruction d'une unité. */
export type DestructionCause = 'combat' | 'collision' | 'capture';

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
  | { seq: number; type: 'CityCaptured'; cityId: CityId; fromOwner: PlayerId; toOwner: PlayerId; at: Hex }
  /** Production d'une unité par une ville (R-62). */
  | { seq: number; type: 'UnitProduced'; unitId: UnitId; cityId: CityId; owner: PlayerId; unitType: string; at: Hex }
  /** Technologie complétée (R-85, Phase 7a) : déblocages immédiats (R-87). */
  | { seq: number; type: 'TechResearched'; player: PlayerId; tech: string }
  /** Croissance d'une ville : +1 pop = +1 citoyen (R-63, Phase 6). */
  | { seq: number; type: 'PopulationGrew'; cityId: CityId; owner: PlayerId; pop: number; at: Hex }
  /** Bâtiment construit par une ville (R-66, Phase 6). */
  | { seq: number; type: 'BuildingCompleted'; cityId: CityId; owner: PlayerId; building: string; at: Hex }
  /** Point d'accroche diplomatie (R-58-b) — inactif en v1 (guerre permanente). */
  | { seq: number; type: 'DiplomaticIncident'; between: [PlayerId, PlayerId]; at: Hex }
  /** Victoire — v1 : 'domination' (capture de la capitale adverse, R-65),
   *  'forfait' (T-06) ou 'razedCapital' (capitale rasée par les barbares,
   *  R-97 — Phase 7d : le propriétaire perd, l'adversaire réel gagne). */
  | { seq: number; type: 'Victory'; winner: PlayerId; reason: 'domination' | 'forfeit' | 'razedCapital' }
  /** R-96 · Engendrement d'une unité barbare par un village (Phase 7d). */
  | { seq: number; type: 'BarbarianSpawned'; unitId: UnitId; villageId: string; owner: PlayerId; at: Hex }
  /** R-96 · Village barbare détruit (0 PV) — or T-20 au vainqueur (BootyGold). */
  | { seq: number; type: 'VillageDestroyed'; villageId: string; byPlayer: PlayerId; byUnitId: UnitId | null; at: Hex }
  /** R-97 · Ville rasée par les barbares (capture barbare : aucun changement de
   *  propriétaire, la ville disparaît avec ses bâtiments). */
  | { seq: number; type: 'CityRazed'; cityId: CityId; owner: PlayerId; byPlayer: PlayerId; at: Hex }
  /** R-98 · Hutte ouverte — récompense tirée au RNG seedé (table huttes.json). */
  | { seq: number; type: 'HutOpened'; hutId: string; byPlayer: PlayerId; byUnitId: UnitId | null; at: Hex; reward: HutReward }
  /** Fin de résolution : newState est l'état du tour indiqué. */
  | { seq: number; type: 'TurnResolved'; turn: number };

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
    case 'PopulationGrew':
      refs.cityIds.push(event.cityId);
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
    case 'HutOpened':
      refs.players.push(event.byPlayer);
      hex(event.at);
      break;
    case 'TurnResolved':
      break;
  }
  return refs;
}
