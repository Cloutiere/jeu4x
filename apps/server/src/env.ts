/**
 * Bindings et secrets du Worker (wrangler.jsonc + .dev.vars / wrangler secret).
 */
import { verifySession } from './auth/jwt.js';
import type { SessionClaims } from './auth/jwt.js';

export interface Env {
  /** Durable Objects (wrangler.jsonc). */
  GAME: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;

  /** Secrets / variables (voir .dev.vars.example). */
  AUTH_SECRET: string;
  ADMIN_TOKEN: string;
  DEV_STUB_AUTH?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  APP_BASE_URL?: string;
}

/** JSON typé pour une Response. */
export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Session = cookie `session` (navigateur) ou query param `?token=` (tests/client natif). */
export function sessionTokenOfRequest(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'session') return rest.join('=') || null;
  }
  return null;
}

/** Vérifie la session du token fourni. Retourne null si absente/invalide. */
export async function sessionOfToken(token: string | null, env: Env): Promise<SessionClaims | null> {
  if (!token || !env.AUTH_SECRET) return null;
  return verifySession(token, env.AUTH_SECRET);
}

export async function sessionOfRequest(request: Request, env: Env): Promise<SessionClaims | null> {
  return sessionOfToken(sessionTokenOfRequest(request), env);
}
