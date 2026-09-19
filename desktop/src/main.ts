/**
 * Process principal de la coquille Electron (M1/M2/M3/M4).
 *
 * Option A (tranchée avec Erik le 19/09) : la fenêtre charge l'URL du serveur
 * de prod — client toujours à jour, OAuth sans friction d'origine (la session
 * est un cookie posé par le serveur sur sa propre origine ; voir
 * REPORT-ELECTRON-SOCLE.md pour le verdict d'investigation sur l'option B).
 * L'URL serveur vient d'un fichier de configuration par environnement, jamais
 * du code.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, session } from 'electron';
import * as path from 'node:path';
import { configDirOf, EnvConfig, resolveConfig } from './config';
import { estEnPartie, navigationDecision } from './navigation';
import { shortcutDecision } from './shortcuts';
import { cspPolicyFor } from './csp';

// Départ propre : pas de fichier .js généré à côté des sources.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let mainWindow: BrowserWindow | null = null;
let config: EnvConfig;

/** `--env=dev` sur la ligne de commande (défaut : prod). */
function cliEnv(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--env='));
  return arg ? arg.slice('--env='.length) : undefined;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: config.windowTitle,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    show: false,
    backgroundColor: '#1a1c22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // M3 : pont explicite uniquement (preload)
      nodeIntegration: false, // M3 : jamais
      sandbox: true, // M3 : renderer confiné
      spellcheck: false,
    },
  });

  // Le titre reste celui de la configuration (la page ne le surcharge pas).
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  // Affichage sans flash blanc une fois la première peinture prête.
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // ------------------------------------------------------------------
  // M3 — sécurité : navigation confinée, pas de fenêtre/iframe nouvelle.
  // ------------------------------------------------------------------
  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.warn(`[sécurité] ouverture de fenêtre refusée : ${details.url}`);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const decision = navigationDecision(url, {
      gameServerUrl: config.gameServerUrl,
      oauthHosts: config.oauthHosts,
    });
    if (decision === 'allow') return;
    console.warn(`[sécurité] navigation refusée : ${url}`);
    e.preventDefault();
  });

  // ------------------------------------------------------------------
  // M2 — raccourcis navigateur neutralisés, F11 = plein écran.
  // ------------------------------------------------------------------
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  const debugClavier = process.env.GAME4X_DEBUG === '1';
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const decision = shortcutDecision(
      { key: input.key, control: input.control, shift: input.shift, alt: input.alt, meta: input.meta },
      { devtoolsAllowed: config.devtools },
    );
    if (debugClavier) console.log(`[coquille] key ${input.type} ${input.key} → ${decision}`);
    if (decision === 'block') {
      event.preventDefault();
      return;
    }
    if (decision === 'fullscreen-toggle') {
      event.preventDefault();
      void mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // ------------------------------------------------------------------
  // M2 — quitter propre : confirmation native si une partie est en cours.
  // ------------------------------------------------------------------
  mainWindow.on('close', (e) => {
    if (!mainWindow) return;
    if (!estEnPartie(mainWindow.webContents.getURL())) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Quitter', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      message: 'Une partie est en cours.',
      detail: 'Voulez-vous vraiment quitter ? La partie reste en ligne et vos ordres posés seront résolus normalement.',
    });
    if (choice !== 0) e.preventDefault();
  });

  // Résilience : plantage du renderer → rechargement de la fenêtre.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer] process gone : ${details.reason}`);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  });

  // Serveur injoignable : quelques re-tentatives, puis message natif.
  let loadRetries = 0;
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = ABORTED (navigation remplacée)
    if (loadRetries >= 3) {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        buttons: ['Réessayer', 'Quitter'],
        defaultId: 0,
        message: 'Serveur de jeu injoignable.',
        detail: `Vérifiez votre connexion internet. (${url})`,
      });
      if (choice === 0) {
        loadRetries = 0;
        void mainWindow?.loadURL(config.gameServerUrl);
      } else {
        app.quit();
      }
      return;
    }
    loadRetries += 1;
    setTimeout(() => void mainWindow?.loadURL(config.gameServerUrl), 1000 * loadRetries);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    loadRetries = 0;
  });

  if (config.devtools) mainWindow.webContents.openDevTools({ mode: 'detach' });

  void mainWindow.loadURL(config.gameServerUrl);
}

/** M3 — CSP injectée sur les documents du serveur de jeu uniquement. */
function installCsp(): void {
  if (!config.csp) return;
  const policy = cspPolicyFor(config.gameServerUrl);
  const gameOrigin = new URL(config.gameServerUrl).origin;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    let origin: string | null = null;
    try {
      origin = new URL(details.url).origin;
    } catch {
      origin = null;
    }
    const headers = { ...details.responseHeaders };
    const hasCsp = Object.keys(headers).some((k) => k.toLowerCase() === 'content-security-policy');
    if (origin === gameOrigin && !hasCsp) {
      headers['Content-Security-Policy'] = [policy];
    }
    callback({ responseHeaders: headers });
  });
}

/** M3 — aucune permission renderer (géoloc, notifications, media…). */
function installPermissionDeny(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    console.warn(`[sécurité] permission refusée : ${permission}`);
    callback(false);
  });
}

// ------------------------------------------------------------------
// Cycle de vie de l'application.
// ------------------------------------------------------------------
app.whenReady().then(() => {
  try {
    config = resolveConfig({
      cliEnv: cliEnv(),
      envVar: process.env.GAME4X_ENV,
      serverUrlOverride: process.env.GAME_SERVER_URL,
      configDir: configDirOf(process.resourcesPath ?? '', app.getAppPath(), app.isPackaged),
    });
  } catch (e) {
    dialog.showErrorBox(
      'Configuration de la coquille invalide',
      e instanceof Error ? e.message : String(e),
    );
    app.quit();
    return;
  }
  console.log(`[coquille] env=${config.env} serveur=${config.gameServerUrl}`);

  app.setAppUserModelId('com.erikaistudio.game4x');
  Menu.setApplicationMenu(null); // M2 : pas de menu Chromium
  installCsp();
  installPermissionDeny();

  // Pont preload : quitter proprement depuis le jeu (même confirmation que la croix,
  // l'événement close de la fenêtre fait le travail).
  ipcMain.handle('shell:quit', () => {
    app.quit();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit(); // Windows : quitter quand la fenêtre se ferme
});
