/**
 * Contrats du protocole réseau — DESIGN.md §3.3/§3.4 (Phase 1, L2).
 *
 * Chaque message porte `proto` (PROTO_VERSION) ; un client ou un serveur qui
 * reçoit une version inconnue répond `Error { code: 'badProto' }` et ferme.
 *
 * Source unique des types métier : les ordres, événements et le GameState
 * sont RÉ-EXPORTÉS de @game/rules — aucune duplication.
 */
import type { CityId, GameEvent, GameState, Order, PlayerId, UnitId } from '@game/rules';

export type { CityId, GameEvent, GameState, Order, PlayerId, UnitId };

/** Version du protocole — incrémenter à toute rupture de compatibilité. */
export const PROTO_VERSION = 1;

export interface ProtoMessage {
  proto: number;
}

/** Cartes préfabriquées disponibles à la création (packages/rules/src/data/maps). */
export type MapId = 'pedagogique-40' | 'pangee-40';

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
    | /** Demande un snapshot complet (trou de seq détecté, §3.4-3). */
      { type: 'ResyncRequest' }
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

export type ServerToClientMessage = ProtoMessage &
  (
    | /** Accueil sur un socket de partie : identité confirmée + position dans la partie. */
      {
          type: 'Welcome';
          playerId: PlayerId;
          gameCode: string;
          turn: number;
          phase: 'orders' | 'resolving';
          /** Dernier seq du journal (= seq du snapshot qui suit). */
          seq: number;
        }
    | /** État complet filtré par brouillard (au connect/reconnect/resync, §3.4-1). */
      { type: 'Snapshot'; seq: number; state: GameState }
    | /**
       * Résultat d'une résolution de tour : événements filtrés par joueur
       * (rejoués côté client, §3.4-4) + état post-résolution filtré. `seq`
       * est le dernier seq du journal après la résolution.
       */
      { type: 'TurnResult'; seq: number; turn: number; events: GameEvent[]; state: GameState }
    | /** Accusé de réception d'un ordre (accepté, ou refusé avec motif). */
      { type: 'OrderAck'; accepted: boolean; order: Order | null; reason: string | null }
    | { type: 'Error'; code: ErrorCode; message: string }
    | /** Listes de parties : publiques en attente + les miennes (actives). */
      { type: 'GameList'; waiting: GameSummary[]; mine: GameSummary[] }
    | /** Réponse à CreateGame — le code EST le lien d'invitation /join/<code>. */
      { type: 'GameCreated'; code: string }
    | /** Réponse à JoinGame : la place est réservée, connecter le socket de partie. */
      { type: 'GameJoined'; code: string }
  );
