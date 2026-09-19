/**
 * Politique de navigation (M3) — PUR, testé.
 *
 * Pas de navigation libre : la fenêtre ne quitte l'origine du serveur de jeu
 * que vers les fournisseurs OAuth déclarés dans la configuration (le flux de
 * login est une redirection pleine page : jeu → Google/Discord → callback jeu).
 * Toute autre destination (publicité, lien externe, protocole exotique) est
 * refusée.
 */

export type NavigationDecision = 'allow' | 'deny';

export interface NavigationRules {
  /** URL de base du serveur de jeu. */
  gameServerUrl: string;
  /** Hôtes additionnels autorisés (fournisseurs OAuth). */
  oauthHosts: string[];
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** Hash d'une URL (#/game/AB12CD → /game/AB12CD). */
export function hashOfUrl(url: string): string {
  const i = url.indexOf('#');
  return i === -1 ? '' : url.slice(i + 1);
}

/** Une partie est-elle en cours dans la fenêtre ? (hash #/game/<code> — M2, confirmation de sortie) */
export function estEnPartie(url: string): boolean {
  return /^\/game\/[A-Z0-9]{6}/.test(hashOfUrl(url));
}

/** Décision pour une URL demandée dans la fenêtre de jeu. */
export function navigationDecision(url: string, rules: NavigationRules): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'deny';
  }
  // http réservé au dev local ; tout le reste est https.
  if (parsed.protocol === 'http:') {
    return isLocalHost(parsed.hostname) ? 'allow' : 'deny';
  }
  if (parsed.protocol !== 'https:') {
    return 'deny';
  }
  const host = parsed.hostname.toLowerCase();
  const serverHost = new URL(rules.gameServerUrl).hostname.toLowerCase();
  if (host === serverHost) return 'allow';
  if (rules.oauthHosts.includes(host)) return 'allow';
  // Rejet des ressemblances : un host qui FINIT par un hôte autorisé est un
  // sous-domaine adversaire (evil-accounts.google.com), pas l'hôte lui-même.
  return 'deny';
}
