/**
 * OAuth code flow — Google + Discord (L5, DESIGN.md §3.6).
 * Pas de mot de passe géré ; les secrets vivent en wrangler secret / .dev.vars.
 * Si les secrets sont absents : le mode stub (/auth/dev) reste disponible et
 * les routes OAuth répondent un avertissement clair (jamais de crash).
 */
import type { Env } from '../env.js';

export type ProviderId = 'google' | 'discord';

export interface OAuthProfile {
  /** Id stable chez le fournisseur. */
  id: string;
  name: string;
}

interface ProviderDef {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId(env: Env): string | undefined;
  clientSecret(env: Env): string | undefined;
  configured(env: Env): boolean;
  fetchProfile(env: Env, accessToken: string): Promise<OAuthProfile>;
}

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid profile',
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    clientSecret: (env) => env.GOOGLE_CLIENT_SECRET,
    configured: (env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
    async fetchProfile(_env, accessToken) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`profil Google inaccessible (${res.status})`);
      const data = (await res.json()) as { sub?: string; name?: string };
      if (!data.sub) throw new Error('profil Google incomplet');
      return { id: data.sub, name: data.name ?? data.sub };
    },
  },
  discord: {
    authorizeUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scope: 'identify',
    clientId: (env) => env.DISCORD_CLIENT_ID,
    clientSecret: (env) => env.DISCORD_CLIENT_SECRET,
    configured: (env) => !!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET,
    async fetchProfile(_env, accessToken) {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`profil Discord inaccessible (${res.status})`);
      const data = (await res.json()) as { id?: string; username?: string; global_name?: string | null };
      if (!data.id) throw new Error('profil Discord incomplet');
      return { id: data.id, name: data.global_name || data.username || data.id };
    },
  },
};

export function isProvider(id: string): id is ProviderId {
  return id === 'google' || id === 'discord';
}

/** Au moins un fournisseur OAuth est configuré ? */
export function anyOAuthConfigured(env: Env): boolean {
  return PROVIDERS.google.configured(env) || PROVIDERS.discord.configured(env);
}

/**
 * Mode stub actif : DEV_STUB_AUTH=1, OU aucun secret OAuth configuré (l'app
 * démarre et fonctionne en local sans aucun compte, avec avertissement).
 */
export function stubAuthAllowed(env: Env): boolean {
  return env.DEV_STUB_AUTH === '1' || !anyOAuthConfigured(env);
}

/** URL de base des redirections (APP_BASE_URL en priorité — voir README). */
export function baseUrlOf(env: Env, url: URL): string {
  return (env.APP_BASE_URL ?? url.origin).replace(/\/+$/, '');
}

export function redirectUriOf(env: Env, url: URL, provider: ProviderId): string {
  return `${baseUrlOf(env, url)}/auth/${provider}/callback`;
}

/** URL d'autorisation (code flow + state anti-CSRF passé en query). */
export function authorizeUrl(env: Env, url: URL, provider: ProviderId, state: string): string {
  const def = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: def.clientId(env) ?? '',
    redirect_uri: redirectUriOf(env, url, provider),
    response_type: 'code',
    scope: def.scope,
    state,
  });
  return `${def.authorizeUrl}?${params.toString()}`;
}

/** Échange du code contre un access token (POST form-url-encoded). */
async function exchangeCode(env: Env, url: URL, provider: ProviderId, code: string): Promise<string> {
  const def = PROVIDERS[provider];
  const res = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: def.clientId(env) ?? '',
      client_secret: def.clientSecret(env) ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUriOf(env, url, provider),
    }),
  });
  if (!res.ok) throw new Error(`échange de code refusé par ${provider} (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('access token manquant');
  return data.access_token;
}

export async function fetchProfile(env: Env, url: URL, provider: ProviderId, code: string): Promise<OAuthProfile> {
  const accessToken = await exchangeCode(env, url, provider, code);
  return PROVIDERS[provider].fetchProfile(env, accessToken);
}

/** Page d'avertissement quand un fournisseur OAuth n'est pas configuré. */
export function stubWarningPage(provider: ProviderId): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>OAuth non configuré</title></head>
<body style="font-family: system-ui; max-width: 40rem; margin: 4rem auto;">
<h1>OAuth ${provider} non configuré</h1>
<p>Les secrets <code>${provider.toUpperCase()}_CLIENT_ID</code> / <code>${provider.toUpperCase()}_CLIENT_SECRET</code>
ne sont pas définis : l'application fonctionne en <strong>mode stub</strong> (local/tests).</p>
<p><a href="/auth/dev?name=Joueur">Continuer avec le faux login local →</a></p>
</body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
