/**
 * Worker d'entrée — Phase 1 (socle infra).
 *
 * Routes :
 *  - GET  /api/health            healthcheck
 *  - GET  /ws/lobby              upgrade WebSocket → LobbyDO (L4)
 *  - GET  /ws/game/:code         upgrade WebSocket → GameDO (L3)
 *  - GET  /admin/game/:code      dump d'état (Authorization: Bearer ADMIN_TOKEN, L3)
 *  - (L5) /auth/:provider, /auth/:provider/callback, /auth/dev, /auth/logout, /api/me
 */
import type { Env } from './env.js';
import { jsonResponse, sessionOfRequest } from './env.js';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return jsonResponse({ ok: true });

    // --- WebSocket de lobby → LobbyDO (singleton, L4)
    if (url.pathname === '/ws/lobby') {
      const stub = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
      return stub.fetch(request);
    }

    // --- WebSocket de partie → GameDO (un DO par code de partie, §3.2)
    const gameWsMatch = /^\/ws\/game\/([A-Z0-9]{6})$/.exec(url.pathname);
    if (gameWsMatch) {
      const stub = env.GAME.get(env.GAME.idFromName(gameWsMatch[1]!));
      return stub.fetch(request);
    }

    // --- Admin debug : dump NON filtré d'une partie (protégé par ADMIN_TOKEN)
    const adminMatch = /^\/admin\/game\/([A-Z0-9]{6})$/.exec(url.pathname);
    if (adminMatch) {
      const auth = request.headers.get('authorization') ?? '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      const stub = env.GAME.get(env.GAME.idFromName(adminMatch[1]!));
      return stub.fetch('https://game.internal/internal/admin', { method: 'POST' });
    }

    // --- Exemple de route authentifiée (sanity check session)
    if (url.pathname === '/api/me') {
      const session = await sessionOfRequest(request, env);
      if (!session) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ playerId: session.sub, name: session.name });
    }

    return jsonResponse({ error: 'notFound' }, 404);
  },
} satisfies ExportedHandler<Env>;
