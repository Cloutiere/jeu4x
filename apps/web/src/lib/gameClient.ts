/**
 * Client du socket de partie (L6) : stores Svelte alimentés par les messages
 * WS (§3.4). Toute mise à jour d'état passe par Snapshot / TurnResult — le
 * client n'applique jamais de diffs approximatifs ; au moindre doute il
 * demande un resync (ResyncRequest avec son dernier seq).
 */
import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { GameEvent, GameState, Order, ServerToClientMessage, Unit, UnitId } from '@game/shared';
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
  lastSeq: number;
}

export interface GameClient {
  view: Writable<GameView>;
  status: Writable<NetStatus>;
  error: Writable<string | null>;
  submitOrder(order: Order): void;
  cancelOrderFor(unitId: UnitId): void;
  endTurn(): void;
  resync(): void;
  close(): void;
}

function initialView(code: string): GameView {
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
  };
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

export function createGameClient(code: string): GameClient {
  const view = writable<GameView>(initialView(code));
  const status = writable<NetStatus>('connecting');
  const error = writable<string | null>(null);
  let handle: SocketHandle;

  function resync(): void {
    const seq = get(view).lastSeq;
    handle?.send({ type: 'ResyncRequest', lastSeq: seq < 0 ? null : seq });
  }

  function apply(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'Welcome':
        view.update((v) => ({
          ...v,
          playerId: message.playerId,
          players: message.players,
          status: message.status,
          turn: message.turn,
          phase: message.phase,
          lastSeq: message.seq,
        }));
        break;
      case 'Snapshot':
        view.update((v) => ({
          ...v,
          state: message.state,
          orders: message.orders,
          locked: message.locked,
          status: 'active',
          turn: message.state.turn,
          phase: message.state.phase,
          lastSeq: message.seq,
          // Reprise d'animation : événements de résolution non encore vus
          // (dédoublonnés par seq — §3.4).
          events: [...v.events, ...message.missedEvents.filter((e) => e.seq > v.lastSeq)],
        }));
        break;
      case 'TurnResult': {
        if (message.seq <= get(view).lastSeq) return; // message obsolète
        view.update((v) => ({
          ...v,
          state: message.state,
          turn: message.turn,
          phase: message.state.phase,
          lastSeq: message.seq,
          locked: false,
          orders: [],
          events: [...v.events, ...message.events],
        }));
        break;
      }
      case 'OrderAck':
        if (!message.accepted) {
          error.set(message.reason ?? 'ordre refusé');
          break;
        }
        if (message.order) {
          // Remplacement local du brouillon du même sujet (miroir du serveur).
          view.update((v) => ({ ...v, orders: [...v.orders.filter((o) => !sameSubject(o, message.order!)), message.order!] }));
        } else if (message.reason === 'verrouillé') {
          view.update((v) => ({ ...v, locked: true }));
        }
        break;
      case 'GameList':
      case 'GameCreated':
      case 'GameJoined':
        break; // messages de lobby
      case 'Error':
        error.set(`${message.code} : ${message.message}`);
        break;
    }
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
