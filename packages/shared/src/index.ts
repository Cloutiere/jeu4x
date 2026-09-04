/**
 * Contrats du protocole réseau — DESIGN.md §3.3/§3.4 (Phase 1, L2).
 *
 * Chaque message porte `proto` (PROTO_VERSION) ; un client ou un serveur qui
 * reçoit une version inconnue répond `Error { code: 'badProto' }` et ferme.
 *
 * Source unique des types métier : les ordres, événements et le GameState
 * sont RÉ-EXPORTÉS de @game/rules — aucune duplication.
 */
import type { CityId, GameEvent, GameState, HutReward, Order, PlayerId, SpyActionKind, Unit, UnitId } from '@game/rules';

export type { CityId, GameEvent, GameState, HutReward, Order, PlayerId, SpyActionKind, Unit, UnitId };

/** Version du protocole — incrémenter à toute rupture de compatibilité. */
export const PROTO_VERSION = 1;

export interface ProtoMessage {
  proto: number;
}

/** Cartes disponibles à la création : les 3 préfabriquées (packages/rules/src/
 *  data/maps) + la carte aléatoire procédurale (Phase 6b, générée par le
 *  moteur pur depuis la graine de partie — déterministe et rejouable). */
export type MapId = 'pedagogique-40' | 'pangee-40' | 'variee-40' | 'procedural-40';

/** Identifiant de la carte procédurale (Phase 6b). */
export const PROCEDURAL_MAP_ID: MapId = 'procedural-40';

export interface GameCreationSettings {
  mapId: MapId;
  /** Timer par partie en minutes (null = pas de timer → pas de forfait T-06). */
  turnTimerMinutes: number | null;
  /** Les parties publiques en attente apparaissent dans GameList. */
  isPublic: boolean;
  /** Phase 6b (pérennité multi-joueurs) : nombre de joueurs visés — 2 en v1
   *  (miroir) ; la génération procédurale est déjà paramétrée pour accueillir
   *  2-5 joueurs via la future stratégie `regionalMulti`. */
  playerCount?: number;
  /** 7n · R-145 · Civilisation de l'HÔTE (choix à la création — défaut 🔶 :
   *  absent = 'neutre', aucun trait). Le choix du 2e joueur se fait au join. */
  civId?: string;
  /** 7n · R-150 🔶 : Merveille Antique de l'Égypte (choix au setup, liste
   *  fermée `egypteWonderChoices` de civilizations.json — sinon ignoré). */
  wonderId?: string;
}

export interface PlayerInfo {
  id: PlayerId;
  name: string;
}

/** Joueur vu du protocole : id de session + id dans le GameState moteur (spawn de carte, "p1"/"p2"). */
export interface GamePlayerInfo extends PlayerInfo {
  engineId: string;
  /** 7n · R-145 : civilisation choisie ('neutre' = aucune — parties migrées). */
  civId?: string;
  /** 7n · R-150 🔶 : Merveille Antique (Égypte uniquement — validée serveur). */
  wonderId?: string;
}

export type GameStatus = 'waiting' | 'active' | 'finished';

export interface GameSummary {
  code: string;
  status: GameStatus;
  isPublic: boolean;
  /** 7n : la civ choisie (optionnelle — affichage lobby) accompagne chaque joueur. */
  players: Array<PlayerInfo & { civId?: string; wonderId?: string }>;
  settings: GameCreationSettings;
  turn: number;
  /** Création, epoch ms (méta lobby — jamais dans le GameState moteur). */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Client → Serveur
// ---------------------------------------------------------------------------

export type ClientToServerMessage = ProtoMessage &
  (
    | /** Soumet un ordre pour une unité/ville (remplace tout ordre existant du même sujet). */
      { type: 'SubmitOrder'; order: Order }
    | /** Alias explicite de SubmitOrder (remplace l'ordre courant du sujet). */
      { type: 'ReplaceOrder'; order: Order }
    | /** Annule l'ordre brouillon d'une unité ou d'une ville (un des deux champs). */
      { type: 'CancelOrder'; unitId?: UnitId; cityId?: CityId }
    | /** Verrouille les ordres courants — irrévocable (RULES.md §4). */
      { type: 'EndTurn' }
    | /** Demande un snapshot complet (trou de seq détecté, §3.4-3). `lastSeq` = dernier seq reçu par le client (null si jamais reçu). */
      { type: 'ResyncRequest'; lastSeq: number | null }
    /** R-85 · Choix/changement de technologie — ACTION IMMÉDIATE (hors ordres
     *  de tour) : validée et appliquée à la réception, diffusion immédiate. */
    | { type: 'SetResearch'; techId: string }
    /** R-90 · Conversion or/science d'une ville — ACTION IMMÉDIATE (hors
     *  ordres de tour) : validée et appliquée à la réception, diffusion
     *  immédiate (Phase 7b). */
    | { type: 'SetConversion'; cityId: CityId; target: 'gold' | 'science' }
    /** R-122 (7h) · Adoption d'un régime politique — ACTION IMMÉDIATE (hors
     *  ordres de tour, même contrat que SetResearch/SetConversion) : validée
     *  et appliquée à la réception, diffusion immédiate. Transition manuelle
     *  = 1 tour d'Anarchie (T-29) ; bascule sans Anarchie à la complétion de
     *  la tech (fenêtre R-122). */
    | { type: 'SetGovernment'; government: string }
    /** 7o · R-154 · Choix Angkor Wat (artefact — merveille gratuite) — ACTION
     *  IMMÉDIATE (hors ordres de tour, même contrat que SetGovernment) :
     *  validée et appliquée à la réception (moteur pur applyAngkorChoice),
     *  diffusion immédiate. N'existe que lorsqu'un droit est en attente
     *  (`pendingArtefactChoices`). */
    | { type: 'ChooseWonder'; cityId: CityId; wonderId: string }
    /** --- Messages de lobby (socket LobbyDO) --- */
    | { type: 'CreateGame'; settings: GameCreationSettings }
    /** 7n · R-145 : `civId` (+ `wonderId` pour la Merveille Antique de
     *  l'Égypte 🔶) — choix de civilisation du joueur B au join. */
    | { type: 'JoinGame'; code: string; civId?: string; wonderId?: string }
    | { type: 'ListGames' }
    | { type: 'AbandonGame'; code: string }
  );

// ---------------------------------------------------------------------------
// Serveur → Client
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'badProto'
  | 'unauthorized'
  | 'notFound'
  | 'gameFull'
  | 'gameFinished'
  | 'badPhase'
  | 'badOrder'
  | 'badMessage'
  | 'internal';

/** Accueil sur un socket de partie : identité confirmée + position dans la partie. */
export interface Welcome extends ProtoMessage {
  type: 'Welcome';
  playerId: PlayerId;
  gameCode: string;
  turn: number;
  phase: 'orders' | 'resolving';
  /** Dernier seq du journal (= seq du snapshot qui suit). */
  seq: number;
  /** Les joueurs inscrits (attente → 1, active → 2). */
  players: GamePlayerInfo[];
  status: GameStatus;
  /** Ordres du joueur déjà verrouillés pour le tour courant. */
  locked: boolean;
}

/**
 * État complet filtré par brouillard (au connect/reconnect/resync, §3.4-1).
 * `orders` = brouillons d'ordres du joueur (conservés côté serveur) ;
 * `missedEvents` = événements de la DERNIÈRE résolution non reçus par le
 * client (reprise d'animation — l'état, lui, est toujours complet).
 */
export interface Snapshot extends ProtoMessage {
  type: 'Snapshot';
  seq: number;
  state: GameState;
  orders: Order[];
  missedEvents: GameEvent[];
  locked: boolean;
}

/**
 * Résultat d'une résolution de tour : événements filtrés par joueur (rejoués
 * côté client, §3.4-4) + état post-résolution filtré. `seq` est le dernier
 * seq du journal après la résolution.
 */
export interface TurnResult extends ProtoMessage {
  type: 'TurnResult';
  seq: number;
  turn: number;
  events: GameEvent[];
  state: GameState;
}

/** Accusé de réception d'un ordre ou d'un verrouillage (EndTurn). */
export interface OrderAck extends ProtoMessage {
  type: 'OrderAck';
  accepted: boolean;
  order: Order | null;
  reason: string | null;
}

export interface ErrorMessage extends ProtoMessage {
  type: 'Error';
  code: ErrorCode;
  message: string;
}

/** Listes de parties : publiques en attente + les miennes (actives). */
export interface GameList extends ProtoMessage {
  type: 'GameList';
  waiting: GameSummary[];
  mine: GameSummary[];
}

/** Réponse à CreateGame — le code EST le lien d'invitation /join/<code>. */
export interface GameCreated extends ProtoMessage {
  type: 'GameCreated';
  code: string;
}

/** Réponse à JoinGame : la place est réservée, connecter le socket de partie. */
export interface GameJoined extends ProtoMessage {
  type: 'GameJoined';
  code: string;
}

export type ServerToClientMessage =
  | Welcome
  | Snapshot
  | TurnResult
  | OrderAck
  | ErrorMessage
  | GameList
  | GameCreated
  | GameJoined;
