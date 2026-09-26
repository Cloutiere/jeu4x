/**
 * Client du socket de lobby (L6) : créer/rejoindre/lister/abandonner des
 * parties. LOBBY-5 : config structurée à 5 sièges — UpdateGameConfig/
 * StartGame (salle d'attente), jointure avec couleur (paletteId).
 */
import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { ConfigPartie, GameCreationSettings, GameSummary, ServerToClientMessage } from '@game/shared';
import { connectWs } from './net.js';
import type { NetStatus, SocketHandle } from './net.js';

export interface LobbyClient {
  games: Writable<{ waiting: GameSummary[]; mine: GameSummary[] }>;
  status: Writable<NetStatus>;
  error: Writable<string | null>;
  createGame(settings: GameCreationSettings): void;
  /** 7n · R-145 : civ au join. LOBBY-5 · D2 : paletteId (couleur choisie). */
  join(code: string, civId?: string, paletteId?: string): void;
  abandon(code: string): void;
  /** LOBBY-5 · D6 : édition de la config par l'hôte (salle d'attente). */
  updateConfig(code: string, config: ConfigPartie): void;
  /** LOBBY-5 · D6 : démarrage par l'hôte (verrouillage + remplissage bots). */
  start(code: string): void;
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
        // LOBBY-5 : création structurée → SALLE D'ATTENTE (l'hôte démarre
        // quand il veut — D6). Les parties anciennes forme n'existent plus
        // dans l'UI de création.
        window.location.hash = `#/attente/${message.code}`;
        break;
      case 'GameJoined': {
        // Partie déjà active (flux historique 1v1 / ré-joindre) → en jeu ;
        // sinon salle d'attente (le statut peut arriver juste après).
        const toutes = [...get(games).waiting, ...get(games).mine];
        const summary = toutes.find((g) => g.code === message.code);
        window.location.hash = summary && summary.status === 'active' ? `#/game/${message.code}` : `#/attente/${message.code}`;
        break;
      }
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
    join(code: string, civId?: string, paletteId?: string) {
      handle.send({ type: 'JoinGame', code, ...(civId ? { civId } : {}), ...(paletteId ? { paletteId } : {}) });
    },
    abandon(code) {
      handle.send({ type: 'AbandonGame', code });
    },
    updateConfig(code: string, config: ConfigPartie) {
      handle.send({ type: 'UpdateGameConfig', code, config });
    },
    start(code: string) {
      handle.send({ type: 'StartGame', code });
    },
    close() {
      handle.close();
    },
  };
}
