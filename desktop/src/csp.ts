/**
 * Politique de sécurité du contenu (M3) — PUR, testé.
 *
 * Injectée en en-tête de réponse sur les documents servis par le serveur de
 * jeu uniquement (jamais sur les pages OAuth des fournisseurs, qui portent
 * leur propre CSP). Limitée au nécessaire : scripts/styles du jeu, images du
 * jeu, connexions HTTP(S) même origine et WebSocket vers le serveur de jeu.
 * Deux compromis assumés, imposés par le client web (que la coquille ne
 * modifie pas) :
 *  - 'unsafe-inline' : l'inline script de debug de index.html + les styles
 *    inline de Svelte/PixiJS ;
 *  - 'unsafe-eval' : PixiJS 8 génère ses programmes shader via `new Function()`
 *    (WebGLRenderer._unsafeEvalCheck) — sans lui, le renderer WebGL refuse de
 *    se créer et la carte reste noire (constaté 19/09, debug-cartenoire).
 */
import { URL } from 'node:url';

export function cspPolicyFor(serverUrl: string): string {
  const url = new URL(serverUrl);
  const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsOrigin = `${wsProto}//${url.host}`;
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${wsOrigin}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
