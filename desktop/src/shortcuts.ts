/**
 * Politique des raccourcis clavier (M2/M3) — PUR, testé.
 *
 * Raccourcis navigateur neutralisés : rechargement (Ctrl+R, F5), zoom
 * (Ctrl+ +/-/0 ; le zoom molette est neutralisé côté preload), DevTools
 * (F12, Ctrl+Shift+I — sauf dev). F11 bascule le plein écran (défaut d'Erik :
 * fenêtrable + plein écran F11).
 */

export interface KeyEvent {
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export type ShortcutDecision = 'block' | 'fullscreen-toggle' | 'allow';

export interface ShortcutRules {
  /** DevTools accessibles (config dev uniquement). */
  devtoolsAllowed: boolean;
}

/** Décision pour un événement clavier système (before-input-event). */
export function shortcutDecision(e: KeyEvent, rules: ShortcutRules): ShortcutDecision {
  const key = e.key;
  const ctrl = e.control || e.meta; // Ctrl sous Windows/Linux, Cmd si jamais porté sur macOS

  if (key === 'F11' && !ctrl && !e.alt && !e.shift) return 'fullscreen-toggle';

  // Rechargement / navigation navigateur : jamais.
  if (ctrl && !e.alt && (key === 'r' || key === 'R')) return 'block';
  if (key === 'F5') return 'block';

  // Zoom clavier : jamais (le canvas PixiJS gère son propre zoom).
  if (ctrl && !e.alt && (key === '+' || key === '-' || key === '=' || key === '0')) return 'block';

  // DevTools : bloqués hors dev (les menus sont supprimés, ceci couvre le clavier).
  if ((key === 'F12' || (ctrl && e.shift && !e.alt && (key === 'I' || key === 'i')))) {
    return rules.devtoolsAllowed ? 'allow' : 'block';
  }

  return 'allow';
}
