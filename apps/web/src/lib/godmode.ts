// GODMODE-BOUTON (Erik 04/11) — helpers purs du god mode, extraits de
// Game.svelte pour être testés : la garde de visibilité (solo/bots, miroir
// exact du refus serveur `aAutreHumain`) et la reconnaissance du chord
// Ctrl+J → G (l'ancien W ferme l'onglet en navigateur — jamais écouté).

/** D3 : un autre humain (non-bot) participe-t-il à la partie ? Miroir de la
 *  garde serveur (game.ts `aAutreHumain`) — le bouton se cache et le chord
 *  reste sans effet côté UI ; le serveur tranche en dernier ressort. */
export function autreHumainPresent(
  players: Array<{ id: string; bot?: boolean }>,
  playerId: string | null,
): boolean {
  if (playerId === null) return false;
  return players.some((p) => p.id !== playerId && !p.bot);
}

/** Fenêtre de validation du chord (deux touches successives), en ms. */
export const GODMODE_FENETRE_MS = 1500;

export type ActionGodMode = 'armer' | 'basculer' | null;

/** Reconnaissance du chord : Ctrl+J arme, G (dans la fenêtre) bascule.
 *  D2 : W n'est PLUS écouté — Ctrl+W ferme l'onglet en navigateur. */
export function actionGodMode(
  key: string,
  ctrl: boolean,
  alt: boolean,
  meta: boolean,
  arme: number,
  maintenant: number,
): ActionGodMode {
  if (ctrl && !alt && !meta && key === 'j') return 'armer';
  if (key === 'g' && arme > 0 && maintenant - arme < GODMODE_FENETRE_MS) return 'basculer';
  return null;
}
