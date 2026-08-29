/**
 * Worker d'entrée — Phase 1 (socle infra).
 * L1 : squelette (healthcheck). Les routes complètes arrivent avec L3-L5 :
 *  - /auth/:provider, /auth/:provider/callback, /auth/dev (L5)
 *  - /api/me, /admin/game/:code (L3/L5)
 *  - upgrades WebSocket → LobbyDO et GameDO (L3/L4)
 */
import type { Env } from './env.js';
import { jsonResponse } from './env.js';

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'notFound' }, 404);
  },
} satisfies ExportedHandler<Env>;
