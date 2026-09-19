/**
 * Pont sécurisé renderer (M1/M3) — le seul accès du jeu à la coquille.
 * Sandbox actif : uniquement les modules Electron autorisés ici.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gameShell', {
  /** Présence de la coquille desktop (le client web peut l'ignorer poliment). */
  isDesktop: true,
  /** Quitter proprement — passe par la confirmation native si une partie est en cours. */
  quit: (): void => {
    void ipcRenderer.invoke('shell:quit');
  },
  /** Plein écran letterbox (F11 / Échap / bouton futur du jeu). */
  toggleFullscreen: (): void => {
    void ipcRenderer.invoke('shell:toggle-fullscreen');
  },
});

// M2 : zoom molette neutralisé (Ctrl+molette) — le canvas PixiJS gère son propre zoom.
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);
