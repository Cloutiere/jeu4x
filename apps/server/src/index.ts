/**
 * Worker d'entrée — Phase 1 (socle infra).
 *
 * Routes :
 *  - GET  /api/health            healthcheck
 *  - GET  /auth/:provider        OAuth code flow → redirection (google | discord, L5)
 *  - GET  /auth/:provider/callback  callback OAuth (state anti-CSRF, cookie session JWT)
 *  - GET  /auth/dev?name=…       faux login local (mode stub, L5)
 *  - GET  /auth/logout           purge du cookie de session
 *  - GET  /api/me                session courante ({ player: {id, name} | null })
 *  - GET  /ws/lobby              upgrade WebSocket → LobbyDO (L4)
 *  - GET  /ws/game/:code         upgrade WebSocket → GameDO (L3)
 *  - GET  /admin/game/:code      dump d'état (Authorization: Bearer ADMIN_TOKEN, L3)
 */
import type { Env } from './env.js';
import { jsonResponse, sessionOfRequest } from './env.js';
import { signSession } from './auth/jwt.js';
// Classes de Durable Objects : doivent être exportées du script principal.
export { GameDO } from './game.js';
export { LobbyDO } from './lobby.js';
import {
  authorizeUrl,
  baseUrlOf,
  fetchProfile,
  stubAuthAllowed,
  stubWarningPage,
} from './auth/oauth.js';
import type { ProviderId } from './auth/oauth.js';
import {
  STATE_COOKIE,
  cookieValue,
  randomToken,
  sessionClearCookie,
  sessionSetCookie,
  slugify,
  stateClearCookie,
  stateSetCookie,
} from './auth/session.js';

/** Redirection 302 avec en-têtes (Set-Cookie) — Response.redirect n'accepte pas d'init. */
function redirectWithHeaders(location: string, headers: Record<string, string>): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', ...headers } });
}

/** Redirection après login (évite les ouvertures arbitraires : chemins locaux seulement). */
function safeNext(url: URL): string {
  const next = url.searchParams.get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function providerConfigured(env: Env, provider: ProviderId): boolean {
  return provider === 'google'
    ? !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET
    : !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const secure = url.protocol === 'https:';

    if (url.pathname === '/api/health') return jsonResponse({ ok: true });

    // ------------------------------------------------------------------
    // Authentification (L5)
    // ------------------------------------------------------------------
    if (url.pathname === '/auth/dev') {
      if (!stubAuthAllowed(env)) return jsonResponse({ error: 'stubDisabled' }, 403);
      if (!env.AUTH_SECRET) return jsonResponse({ error: 'authSecretMissing' }, 500);
      const name = url.searchParams.get('name')?.trim() || 'Joueur';
      const token = await signSession(`dev:${slugify(name)}`, name, env.AUTH_SECRET);
      return redirectWithHeaders(`${baseUrlOf(env, url)}${safeNext(url)}`, {
        'set-cookie': sessionSetCookie(token, secure),
      });
    }

    const authMatch = /^\/auth\/(google|discord)$/.exec(url.pathname);
    if (authMatch) {
      const provider = authMatch[1] as ProviderId;
      // Mode stub avec avertissement si les secrets sont absents (L5) — jamais de crash.
      if (!providerConfigured(env, provider)) return stubWarningPage(provider);
      const state = randomToken();
      return redirectWithHeaders(authorizeUrl(env, url, provider, state), {
        'set-cookie': stateSetCookie(state, secure),
      });
    }

    const cbMatch = /^\/auth\/(google|discord)\/callback$/.exec(url.pathname);
    if (cbMatch) {
      const provider = cbMatch[1] as ProviderId;
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const expectedState = cookieValue(request, STATE_COOKIE);
      if (url.searchParams.get('error') || !code || !state || !expectedState || state !== expectedState) {
        return jsonResponse({ error: 'oauthStateMismatch' }, 400, { 'set-cookie': stateClearCookie(secure) });
      }
      try {
        const profile = await fetchProfile(env, url, provider, code);
        if (!env.AUTH_SECRET) return jsonResponse({ error: 'authSecretMissing' }, 500);
        const token = await signSession(`${provider}:${profile.id}`, profile.name, env.AUTH_SECRET);
        return redirectWithHeaders(`${baseUrlOf(env, url)}${safeNext(url)}`, {
          'set-cookie': `${sessionSetCookie(token, secure)}, ${stateClearCookie(secure)}`,
        });
      } catch (e) {
        return jsonResponse({ error: 'oauthFailed', message: e instanceof Error ? e.message : 'échec OAuth' }, 502, {
          'set-cookie': stateClearCookie(secure),
        });
      }
    }

    if (url.pathname === '/auth/logout') {
      return jsonResponse({ ok: true }, 200, { 'set-cookie': sessionClearCookie(secure) });
    }

    if (url.pathname === '/api/me') {
      const session = await sessionOfRequest(request, env);
      if (!session) return jsonResponse({ player: null });
      return jsonResponse({ player: { id: session.sub, name: session.name } });
    }

    // ------------------------------------------------------------------
    // WebSocket de lobby → LobbyDO (singleton, L4)
    // ------------------------------------------------------------------
    if (url.pathname === '/ws/lobby') {
      const stub = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
      return stub.fetch(request);
    }

    // ------------------------------------------------------------------
    // WebSocket de partie → GameDO (un DO par code de partie, §3.2)
    // ------------------------------------------------------------------
    const gameWsMatch = /^\/ws\/game\/([A-Z0-9]{6})$/.exec(url.pathname);
    if (gameWsMatch) {
      const stub = env.GAME.get(env.GAME.idFromName(gameWsMatch[1]!));
      return stub.fetch(request);
    }

    // ------------------------------------------------------------------
    // Admin debug : dump NON filtré d'une partie (protégé par ADMIN_TOKEN)
    // ------------------------------------------------------------------
    const adminMatch = /^\/admin\/game\/([A-Z0-9]{6})$/.exec(url.pathname);
    if (adminMatch) {
      const auth = request.headers.get('authorization') ?? '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      const stub = env.GAME.get(env.GAME.idFromName(adminMatch[1]!));
      return stub.fetch('https://game.internal/internal/admin', { method: 'POST' });
    }

    return jsonResponse({ error: 'notFound' }, 404);
  },
} satisfies ExportedHandler<Env>;
