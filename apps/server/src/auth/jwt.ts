/**
 * Session JWT HS256 — signée et vérifiée avec crypto.subtle (zéro dépendance).
 * Cookie de session + query param du WS URL (DESIGN.md §3.6, L3 auth au connect).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SessionClaims {
  /** playerId stable = "{provider}:{providerId}" (DESIGN.md §3.6). */
  sub: string;
  name: string;
  iat: number;
  exp: number;
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeJson(value: unknown): string {
  return bytesToB64url(encoder.encode(JSON.stringify(value)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Comparaison en temps constant (signatures). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export async function signSession(sub: string, name: string, secret: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeJson({ sub, name, iat: now, exp: now + ttlSeconds });
  const data = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return `${data}.${bytesToB64url(new Uint8Array(signature))}`;
}

/** Vérifie signature + expiration. Retourne null si invalide (jamais d'exception). */
export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = bytesToB64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`${header}.${payload}`))),
  );
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const claims = JSON.parse(decoder.decode(b64urlToBytes(payload))) as Partial<SessionClaims>;
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    return { sub: claims.sub, name: typeof claims.name === 'string' ? claims.name : claims.sub, iat: claims.iat ?? 0, exp: claims.exp };
  } catch {
    return null;
  }
}
