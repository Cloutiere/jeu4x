/**
 * Client du socket de lobby (L6) : créer/rejoindre/lister/abandonner des parties.
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { GameCreationSettings, GameSummary, ServerToClientMessage } from '@game/shared';
import { connectWs } from './net.js';
import type { NetStatus, SocketHandle } from './net.js';

export interface LobbyClient {
  games: Writable<{ waiting: GameSummary[]; mine: GameSummary[] }>;
  status: Writable<NetStatus>;
  error: Writable<string | null>;
  createGame(settings: GameCreationSettings): void;
  join(code: string): void;
  abandon(code: string): void;
  close(): void;
}

export function createLobbyClient(): LobbyClient {
  const games = writable<{ waiting: GameSummary[]; mine: GameSummary[] }>({ waiting: [], mine: [] });
  const status = writable<NetStatus>('connecting');
  const error = writable<string | null>(null);
  let handle: SocketHandle;

  function apply(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'GameList':
        games.set({ waiting: message.waiting, mine: message.mine });
        break;
      case 'GameCreated':
        // Le créateur ouvre directement sa partie (socket de partie dédié).
        window.location.hash = `#/game/${message.code}`;
        break;
      case 'GameJoined':
        window.location.hash = `#/game/${message.code}`;
        break;
      case 'Error':
        error.set(`${message.code} : ${message.message}`);
        break;
      default:
        break;
    }
  }

  handle = connectWs('/ws/lobby', apply, (s) => status.set(s));

  return {
    games,
    status,
    error,
    createGame(settings) {
      handle.send({ type: 'CreateGame', settings });
    },
    join(code) {
      handle.send({ type: 'JoinGame', code });
    },
    abandon(code) {
      handle.send({ type: 'AbandonGame', code });
    },
    close() {
      handle.close();
    },
  };
}
