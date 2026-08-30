/**
 * Couche réseau du client (L6) : base d'API, WebSocket avec reconnexion en
 * backoff exponentiel + gigue, et détection de reprise (visibilitychange →
 * ResyncRequest, §3.4-3).
 */
import { PROTO_VERSION } from '@game/shared';
import type { ClientToServerMessage, ServerToClientMessage } from '@game/shared';

export type NetStatus = 'connecting' | 'open' | 'closed';

/** Base HTTP du Worker (vide = même origine — dev via proxy Vite). */
export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
}

function wsUrl(path: string): string {
  const base = apiBase();
  if (base) return `${base.replace(/^http/, 'ws')}${path}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export function apiGet<T>(path: string): Promise<T> {
  return fetch(`${apiBase()}${path}`).then((res) => {
    if (!res.ok) throw new Error(`GET ${path} : ${res.status}`);
    return res.json() as Promise<T>;
  });
}

/** Omit distributif : préserve l'union des messages client (comme @game/rules). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface SocketHandle {
  send(message: DistributiveOmit<ClientToServerMessage, 'proto'>): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Ouvre un WebSocket et le ré-ouvre avec backoff exponentiel + gigue en cas de
 * coupure. `onReopen` est appelé après chaque reconnexion (le client y envoie
 * typiquement un ResyncRequest pour restaurer snapshot + événements manqués).
 */
export function connectWs(
  path: string,
  onMessage: (message: ServerToClientMessage) => void,
  onStatus: (status: NetStatus) => void,
  onReopen?: () => void,
): SocketHandle {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closedByUser = false;
  let everOpened = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Messages envoyés avant l'ouverture du socket (ou pendant une coupure) —
  // vidés à la (re)connexion. Tous les messages du protocole sont idempotents
  // côté serveur, donc rejouer après une coupure est sûr.
  const MAX_QUEUED = 32;
  let queue: Array<DistributiveOmit<ClientToServerMessage, 'proto'>> = [];

  const open = (): void => {
    if (closedByUser) return;
    onStatus('connecting');
    const socket = new WebSocket(wsUrl(path));
    ws = socket;
    socket.onopen = () => {
      const reopened = everOpened;
      attempt = 0;
      everOpened = true;
      onStatus('open');
      const pending = queue;
      queue = [];
      for (const m of pending) {
        socket.send(JSON.stringify({ ...m, proto: PROTO_VERSION }));
      }
      if (reopened) onReopen?.();
    };
    socket.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data as string) as ServerToClientMessage);
      } catch {
        // message non-JSON : ignoré (le serveur n'en émet pas)
      }
    };
    socket.onclose = () => {
      onStatus('closed');
      ws = null;
      if (closedByUser) return;
      const delay = Math.min(15_000, 500 * 2 ** attempt) + Math.random() * 250;
      attempt += 1;
      retryTimer = setTimeout(open, delay);
    };
  };
  open();

  return {
    send(message) {
      if (socketOpen(ws)) {
        ws!.send(JSON.stringify({ ...message, proto: PROTO_VERSION }));
      } else if (queue.length < MAX_QUEUED) {
        queue.push(message);
      }
    },
    close() {
      closedByUser = true;
      queue = [];
      if (retryTimer) clearTimeout(retryTimer);
      socketOpen(ws) && ws!.close();
    },
    isOpen() {
      return socketOpen(ws);
    },
  };
}

function socketOpen(ws: WebSocket | null): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
