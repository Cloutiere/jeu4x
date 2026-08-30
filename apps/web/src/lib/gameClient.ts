/**
 * Client du socket de partie (L6) : stores Svelte alimentés par les messages
 * WS (§3.4). Toute mise à jour d'état passe par Snapshot / TurnResult — le
 * client n'applique jamais de diffs approximatifs ; au moindre doute il
 * demande un resync (ResyncRequest avec son dernier seq).
 *
 * L0 (Phase 3) : la vue est produite par `reduceView`, fonction PURE testée.
 * Deux marques de lecture distinctes :
 *  - `lastSeq` : dernier seq de protocole reçu (Welcome/Snapshot/TurnResult) —
 *    sert à la détection d'obsolescence et au ResyncRequest ;
 *  - `seenEventSeq` : dernier seq d'événement réellement AJOUTÉ au journal.
 *    Welcome ne doit jamais y toucher : son `seq` est le bout du journal
 *    serveur, or les `missedEvents` du Snapshot qui suit ont des seq ≤ ce
 *    bout — les dédoublonner contre `lastSeq` les supprimait tous (journal
 *    vide à la reconnexion).
 */
import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { CityId, GameEvent, GameState, Order, ServerToClientMessage, Unit, UnitId } from '@game/shared';
import { connectWs } from './net.js';
import type { NetStatus, SocketHandle } from './net.js';

export interface GameView {
  code: string;
  playerId: string | null;
  players: Array<{ id: string; name: string; engineId: string }>;
  status: 'waiting' | 'active' | 'finished';
  turn: number;
  phase: 'orders' | 'resolving';
  state: GameState | null;
  /** Brouillons d'ordres de CE joueur (miroir du serveur). */
  orders: Order[];
  /** Ordres verrouillés (Fin de tour validé) pour le tour courant. */
  locked: boolean;
  /** Journal cumulé (événements filtrés reçus, dans l'ordre). */
  events: GameEvent[];
  /** Dernier seq de protocole reçu (ResyncRequest, obsolescence TurnResult). */
  lastSeq: number;
  /** Dernier seq ajouté au journal (dédoublonnage missedEvents/événements). */
  seenEventSeq: number;
}

export interface GameClient {
  view: Writable<GameView>;
  status: Writable<NetStatus>;
  error: Writable<string | null>;
  submitOrder(order: Order): void;
  cancelOrderFor(unitId: UnitId): void;
  cancelCityOrder(cityId: CityId): void;
  endTurn(): void;
  resync(): void;
  close(): void;
}

export function initialView(code: string): GameView {
  return {
    code,
    playerId: null,
    players: [],
    status: 'waiting',
    turn: 0,
    phase: 'orders',
    state: null,
    orders: [],
    locked: false,
    events: [],
    lastSeq: -1,
    seenEventSeq: -1,
  };
}

/** Ajoute au journal les événements non encore vus (dédoublonnage par seq — §3.4). */
export function appendJournalEvents(v: GameView, incoming: GameEvent[]): GameView {
  const fresh = incoming.filter((e) => e.seq > v.seenEventSeq);
  if (fresh.length === 0) return v;
  let maxSeq = v.seenEventSeq;
  for (const e of fresh) if (e.seq > maxSeq) maxSeq = e.seq;
  return { ...v, events: [...v.events, ...fresh], seenEventSeq: maxSeq };
}

/** Sujet d'un ordre (miroir du GameDO) pour remplacer/annuler localement. */
function sameSubject(a: Order, b: Order): boolean {
  if (a.type === 'SetProduction' || b.type === 'SetProduction') {
    return a.type === 'SetProduction' && b.type === 'SetProduction' && a.cityId === b.cityId;
  }
  if (a.type === 'FormArmy' && b.type === 'FormArmy') {
    return [...a.members].sort().join(',') === [...b.members].sort().join(',');
  }
  const ua = 'unitId' in a ? a.unitId : null;
  const ub = 'unitId' in b ? b.unitId : null;
  return ua !== null && ub !== null && ua === ub;
}

/** Réducteur PUR : vue suivante à partir de la vue courante et d'un message serveur. */
export function reduceView(v: GameView, message: ServerToClientMessage): GameView {
  switch (message.type) {
    case 'Welcome':
      // `seenEventSeq` volontairement inchangé : le seq du Welcome est le bout
      // du journal serveur, pas une marque de lecture du journal client.
      return { ...v, playerId: message.playerId, players: message.players, status: message.status, turn: message.turn, phase: message.phase, lastSeq: Math.max(v.lastSeq, message.seq) };
    case 'Snapshot':
      return appendJournalEvents(
        {
          ...v,
          state: message.state,
          orders: message.orders,
          locked: message.locked,
          status: 'active',
          turn: message.state.turn,
          phase: message.state.phase,
          lastSeq: Math.max(v.lastSeq, message.seq),
        },
        message.missedEvents,
      );
    case 'TurnResult': {
      if (message.seq <= v.lastSeq) return v; // message obsolète
      return appendJournalEvents(
        {
          ...v,
          state: message.state,
          turn: message.turn,
          phase: message.state.phase,
          lastSeq: Math.max(v.lastSeq, message.seq),
          locked: false,
          orders: [],
        },
        message.events,
      );
    }
    case 'OrderAck':
      if (!message.accepted) return v;
      if (message.order) {
        // Remplacement local du brouillon du même sujet (miroir du serveur).
        return { ...v, orders: [...v.orders.filter((o) => !sameSubject(o, message.order!)), message.order!] };
      }
      if (message.reason === 'verrouillé') return { ...v, locked: true };
      return v;
    case 'GameList':
    case 'GameCreated':
    case 'GameJoined':
      return v; // messages de lobby
    case 'Error':
      return v; // erreur exposée via le store `error`, pas la vue
  }
}

export function createGameClient(
  code: string,
  hooks: { onMessage?: (message: ServerToClientMessage) => void } = {},
): GameClient {
  const view = writable<GameView>(initialView(code));
  const status = writable<NetStatus>('connecting');
  const error = writable<string | null>(null);
  let handle: SocketHandle;

  function resync(): void {
    const seq = get(view).lastSeq;
    handle?.send({ type: 'ResyncRequest', lastSeq: seq < 0 ? null : seq });
  }

  function apply(message: ServerToClientMessage): void {
    // Le hook est appelé AVANT la mise à jour de la vue (la page y purge par
    // ex. le playback sur un Snapshot, puis la souscription rejoue les
    // événements fraîchement ajoutés).
    hooks.onMessage?.(message);
    if (message.type === 'Error') {
      error.set(`${message.code} : ${message.message}`);
      return;
    }
    view.update((v) => reduceView(v, message));
  }

  handle = connectWs(
    `/ws/game/${code}`,
    apply,
    (s) => status.set(s),
    () => resync(), // reconnexion → snapshot + événements manqués (§3.4)
  );

  // Reprise après veille de l'onglet : demander un resync préventif.
  const onVisible = (): void => {
    if (document.visibilityState === 'visible' && handle.isOpen()) resync();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    view,
    status,
    error,
    submitOrder(order) {
      handle.send({ type: 'SubmitOrder', order });
    },
    cancelOrderFor(unitId) {
      handle.send({ type: 'CancelOrder', unitId });
    },
    cancelCityOrder(cityId) {
      handle.send({ type: 'CancelOrder', cityId });
    },
    endTurn() {
      handle.send({ type: 'EndTurn' });
    },
    resync,
    close() {
      document.removeEventListener('visibilitychange', onVisible);
      handle.close();
    },
  };
}

/** Unités du joueur courant (pour le formulaire d'ordres sans carte). */
export function unitsOf(view: GameView): Unit[] {
  if (!view.state || !view.playerId) return [];
  const mine = view.players.find((p) => p.id === view.playerId);
  if (!mine) return [];
  return Object.values(view.state.units).filter((u) => u.owner === mine.engineId);
}
