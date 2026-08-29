/**
 * Bindings et secrets du Worker (wrangler.jsonc + .dev.vars / wrangler secret).
 * Rempli au fil des livrables L3-L5.
 */
export interface Env {
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
