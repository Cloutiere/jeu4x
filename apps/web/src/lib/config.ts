/**
 * Configuration de premier niveau du client — DRAPEAU UNIQUE du pivot du 11/09.
 *
 * `rendu3d: false` = la vue 3D est MISE DE CÔTÉ (code conservé dans le dépôt,
 * accès coupé en production) : le bouton « 3D » n'est pas rendu, la préférence
 * locale (localStorage) est ignorée, la bascule 2D↔3D est inerte. Le rendu 2D
 * est le seul chemin de production ; les outils d'atelier (#/lab3d, #/atelier,
 * #/progen) ne sont PAS concernés.
 *
 * `rendu3d: true` = comportement historique intact (bouton, préférence,
 * bascule). Toute reprise du 3D passe par ce seul drapeau — aucune valeur
 * codée en dur dispersée ailleurs.
 */
export const config = {
  rendu3d: false,
};

/** La vue 3D est-elle accessible ? Lit la préférence locale UNIQUEMENT si le drapeau l'autorise. */
export function rendu3dAutorise(preferenceLocale?: string | null): boolean {
  if (!config.rendu3d) return false;
  return preferenceLocale === '1';
}

/** La bascule 2D↔3D (bouton, raccourcis éventuels) est-elle active ? */
export function bascule3dAutorisee(): boolean {
  return config.rendu3d;
}
