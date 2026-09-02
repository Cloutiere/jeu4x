/**
 * Contrats du protocole réseau — DESIGN.md §3.3/§3.4 (Phase 1, L2).
 *
 * Chaque message porte `proto` (PROTO_VERSION) ; un client ou un serveur qui
 * reçoit une version inconnue répond `Error { code: 'badProto' }` et ferme.
 *
 * Source unique des types métier : les ordres, événements et le GameState
 * sont RÉ-EXPORTÉS de @game/rules — aucune duplication.
 */
import type { CityId, GameEvent, GameState, HutReward, Order, PlayerId, Unit, UnitId } from '@game/rules';

export type { CityId, GameEvent, GameState, HutReward, Order, PlayerId, Unit, UnitId };

/** Version du protocole — incrémenter à toute rupture de compatibilité. */
export const PROTO_VERSION = 1;

export interface ProtoMessage {
  proto: number;
}

/** Cartes préfabriquées disponibles à la création (packages/rules/src/data/maps). */
export type MapId = 'pedagogique-40' | 'pangee-40' | 'variee-40';

export interface GameCreationSettings {
  mapId: MapId;
  /** Timer par partie en minutes (null = pas de timer → pas de forfait T-06). */
  turnTimerMinutes: number | null;
  /** Les parties publiques en attente apparaissent dans GameList. */
  isPublic: boolean;
}

export interface PlayerInfo {
  id: PlayerId;
  name: string;
}

/** Joueur vu du protocole : id de session + id dans le GameState moteur (spawn de carte, "p1"/"p2"). */
export interface GamePlayerInfo extends PlayerInfo {
  engineId: string;
}

export type GameStatus = 'waiting' | 'active' | 'finished';

export interface GameSummary {
  code: string;
  status: GameStatus;
  isPublic: boolean;
  players: PlayerInfo[];
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
    /** --- Messages de lobby (socket LobbyDO) --- */
    | { type: 'CreateGame'; settings: GameCreationSettings }
    | { type: 'JoinGame'; code: string }
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
