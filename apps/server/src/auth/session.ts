/**
 * Cookies de session / anti-CSRF (L5).
 * Session = JWT signé (auth/jwt.ts) en cookie HttpOnly (DESIGN.md §3.6).
 */

export const SESSION_COOKIE = 'session';
export const STATE_COOKIE = 'oauth_state';

function cookieParts(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    // Secure en prod (https). En local http://localhost, les navigateurs
    // modernes acceptent Secure sur les origines fiables — on reste prudent
    // et on ne l'ajoute qu'en https.
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function sessionSetCookie(token: string, secure: boolean): string {
  return cookieParts(SESSION_COOKIE, token, 7 * 24 * 3600, secure);
}

export function sessionClearCookie(secure: boolean): string {
  return cookieParts(SESSION_COOKIE, '', 0, secure);
}

export function stateSetCookie(state: string, secure: boolean): string {
  return cookieParts(STATE_COOKIE, state, 600, secure);
}

export function stateClearCookie(secure: boolean): string {
  return cookieParts(STATE_COOKIE, '', 0, secure);
}

/** Valeur d'un cookie donné (header brut). */
export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || null;
  }
  return null;
}

/** Jeton aléatoire hexadécimal (state anti-CSRF). */
export function randomToken(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identifiant stable pour le stub dev : slug déterministe du nom. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'joueur'
  );
}
