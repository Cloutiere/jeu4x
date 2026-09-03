/**
 * Helpers de test des DO (L7) : sessions signées, WebSockets clients via
 * SELF.fetch, pompe à messages par type, création de partie de bout en bout.
 */
import { SELF, env } from 'cloudflare:test';
import { expect } from 'vitest';
import { PROTO_VERSION } from '@game/shared';
import type { GameCreationSettings, ServerToClientMessage } from '@game/shared';
import { signSession } from '../src/auth/jwt.js';
import type { Env } from '../src/env.js';

export const AUTH_SECRET = 'test-secret';
export const ADMIN_TOKEN = 'test-admin-token';

/** Bindings typés (env de cloudflare:test est typé Cloudflare.Env, générique). */
const workerEnv = env as unknown as Env;
export const gameNamespace = workerEnv.GAME;

export function makeToken(playerId: string, name: string): Promise<string> {
  return signSession(playerId, name, AUTH_SECRET);
}

/** Pompe à messages : receive() par type, les autres sont mis en attente. */
class MessagePump {
  private pending: ServerToClientMessage[] = [];
  private waiters: Array<{ type: string | null; resolve: (m: ServerToClientMessage) => void }> = [];

  push(message: ServerToClientMessage): void {
    const idx = this.waiters.findIndex((w) => w.type === null || w.type === message.type);
    if (idx >= 0) {
      const waiter = this.waiters.splice(idx, 1)[0]!;
      waiter.resolve(message);
      return;
    }
    this.pending.push(message);
  }

  async waitFor(type: ServerToClientMessage['type']): Promise<ServerToClientMessage> {
    const idx = this.pending.findIndex((m) => m.type === type);
    if (idx >= 0) return this.pending.splice(idx, 1)[0]!;
    return new Promise((resolve) => this.waiters.push({ type, resolve }));
  }
}

export interface TestSocket {
  send(message: Record<string, unknown>): void;
  waitFor(type: ServerToClientMessage['type']): Promise<ServerToClientMessage>;
  close(): void;
}

/** Ouvre un WebSocket authentifié vers le Worker de test. */
export async function openSocket(path: string, token: string): Promise<TestSocket> {
  const res = await SELF.fetch(`https://example.com${path}?token=${encodeURIComponent(token)}`, {
    headers: { upgrade: 'websocket' },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  expect(ws).toBeDefined();
  const pump = new MessagePump();
  ws.addEventListener('message', (ev: MessageEvent) => {
    try {
      pump.push(JSON.parse(ev.data as string) as ServerToClientMessage);
    } catch {
      // ignore
    }
  });
  ws.accept();
  return {
    send(message) {
      ws.send(JSON.stringify({ proto: PROTO_VERSION, ...message }));
    },
    waitFor: (type) => pump.waitFor(type),
    close: () => ws.close(),
  };
}

export async function openLobbySocket(token: string): Promise<TestSocket> {
  return openSocket('/ws/lobby', token);
}

export async function openGameSocket(code: string, token: string): Promise<TestSocket> {
  return openSocket(`/ws/game/${code}`, token);
}

/** Crée une partie via le socket de lobby et retourne le code. */
export async function createGame(
  host: { id: string; name: string },
  settings: GameCreationSettings,
): Promise<string> {
  const token = await makeToken(host.id, host.name);
  const lobby = await openLobbySocket(token);
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings });
  const created = await lobby.waitFor('GameCreated');
  if (created.type !== 'GameCreated') throw new Error('GameCreated attendu');
  lobby.close();
  return created.code;
}

/** Join via le socket de lobby (validation LobbyDO + démarrage GameDO). */
export async function joinGame(player: { id: string; name: string }, code: string): Promise<void> {
  const token = await makeToken(player.id, player.name);
  const lobby = await openLobbySocket(token);
  await lobby.waitFor('GameList');
  lobby.send({ type: 'JoinGame', code });
  await lobby.waitFor('GameJoined');
  lobby.close();
}

/** Phase 6b : rapport de génération de la carte procédurale (sous-ensemble). */
export interface ProgenReportShape {
  seed: number;
  strategy: string;
  attempts: number;
  landTiles: number;
  landRatio: number;
  counts: { resources: number; villages: number; huts: number };
  fertility: { p1: number; p2: number; delta: number; threshold: number; normalized: boolean };
  connected: boolean;
}

export interface AdminDump {
  meta: {
    code: string;
    status: string;
    finishedReason?: string;
    deadline: number | null;
    players: Array<{ id: string; engineId: string }>;
    seed?: number;
    settings?: { mapId?: string };
    /** Phase 6b : présent uniquement pour procedural-40. */
    progen?: ProgenReportShape;
  } | null;
  state: {
    turn: number;
    phase: string;
    rngSeed: number;
    winner: string | null;
    lastEventSeq: number;
    schemaVersion?: number;
    mapId?: string | null;
    villages?: Array<{ id: string; q: number; r: number; hp: number; spawnCountdown: number; spawnedUnits: string[] }>;
    huts?: Array<{ id: string; q: number; r: number }>;
    players: Record<string, { missedTurns: number }>;
    units: Record<string, { id: string; q: number; r: number; owner: string; hp: number }>;
    cities: Record<string, unknown>;
  } | null;
  orders: Record<string, unknown[]>;
  locked: Record<string, boolean>;
  resolving: unknown;
  lastEvents: Array<{ seq: number; type: string }>;
  /** Phase 7d : résumé barbares (villages/huttes/compteurs). */
  barbares?: {
    villages: Array<{ id: string; q: number; r: number; hp: number; spawnCountdown: number; unitésVivantes: number }>;
    huts: Array<{ id: string; q: number; r: number }>;
  } | null;
  /** Phase 7h : résumé gouvernements + Vaisseau spatial (R-121..R-124). */
  gouvernements?: {
    players: Record<
      string,
      { regime: string; anarchyUntil: number | null; enAnarchie: boolean; gpParType: Record<string, number>; victoiresCombat: number }
    >;
    vaisseau: Record<string, Record<string, boolean>>;
  };
}

/** Dump NON filtré d'une partie (endpoint admin, protégé par ADMIN_TOKEN). */
export async function adminDump(code: string): Promise<AdminDump> {
  const res = await SELF.fetch(`https://example.com/admin/game/${code}`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<AdminDump>;
}
