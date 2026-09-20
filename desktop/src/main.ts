/**
 * Process principal de la coquille Electron (M1/M2/M3/M4).
 *
 * Option A (tranchée avec Erik le 19/09) : la fenêtre charge l'URL du serveur
 * de prod — client toujours à jour, OAuth sans friction d'origine (la session
 * est un cookie posé par le serveur sur sa propre origine ; voir
 * REPORT-ELECTRON-SOCLE.md pour le verdict d'investigation sur l'option B).
 * L'URL serveur vient d'un fichier de configuration par environnement, jamais
 * du code.
 *
 * Résolution logique fixe (ELECTRON-RESOLUTION, décision d'Erik du 18/09) :
 * le contenu du jeu vit dans une WebContentsView de taille logique fixe
 * (resolutionBase, défaut 1280×720) au cœur d'une BaseWindow — la vue de jeu
 * est ainsi indépendante de la taille de la fenêtre :
 *  - mode fenêtre (défaut) : fenêtre non redimensionnable dont le contenu fait
 *    exactement resolutionBase (bordures/barre de titre en sus) ;
 *  - plein écran (F11/Échap/bouton) : la vue est mise à l'échelle au maximum
 *    en préservant le ratio (letterbox, bandes noires) — jamais d'étirement,
 *    jamais de crop.
 */
import { app, BaseWindow, WebContentsView, Menu, dialog, ipcMain, session } from 'electron';
import * as path from 'node:path';
import { configDirOf, EnvConfig, resolveConfig } from './config';
import { estEnPartie, navigationDecision } from './navigation';
import { shortcutDecision } from './shortcuts';
import { cspPolicyFor } from './csp';
import { computeLetterbox } from './letterbox';

// Départ propre : pas de fichier .js généré à côté des sources.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Profil de substitution optionnel (`--profil=<chemin>`) : sessions isolées
// (tests e2e, deuxième instance) sans toucher au profil persistant d'Erik.
const profilArg = process.argv.find((a) => a.startsWith('--profil='));
if (profilArg) app.setPath('userData', path.resolve(profilArg.slice('--profil='.length)));

let mainWindow: BaseWindow | null = null;
let gameView: WebContentsView | null = null;
let config: EnvConfig;
/** Zoom de base de normalisation DPR (1 si le switch a été pris en compte). */
let zoomBase = 1;

/** `--env=dev` sur la ligne de commande (défaut : prod). */
function cliEnv(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--env='));
  return arg ? arg.slice('--env='.length) : undefined;
}

// La config est lue avant le ready : le DPR forcé doit être posé avant que
// Chromium ne démarre (switch ligne de commande, pas d'API runtime).
let configCharge: EnvConfig | null = null;
let erreurConfig: unknown = null;
try {
  configCharge = resolveConfig({
    cliEnv: cliEnv(),
    envVar: process.env.GAME4X_ENV,
    serverUrlOverride: process.env.GAME_SERVER_URL,
    configDir: configDirOf(process.resourcesPath ?? '', app.getAppPath(), app.isPackaged),
  });
} catch (e) {
  erreurConfig = e;
}
if (configCharge?.deviceScaleFactor != null) {
  app.commandLine.appendSwitch('force-device-scale-factor', String(configCharge.deviceScaleFactor));
}

/** Bounds de la vue : tout le contenu de la fenêtre (mode fenêtré). */
function boundsFenetres(): Electron.Rectangle {
  const [width, height] = mainWindow!.getContentSize();
  return { x: 0, y: 0, width, height };
}

/** Letterbox : contenu à l'échelle max, ratio préservé, centré (bandes noires). */
function appliquerLetterboxPleinEcran(): void {
  if (!mainWindow || !gameView || !mainWindow.isFullScreen()) return;
  const [width, height] = mainWindow.getContentSize();
  const lb = computeLetterbox({ width, height }, config.resolutionBase);
  gameView.setBounds(lb.rect);
  // Le zoom ré-échantillonne le rendu à l'échelle (le texte reste net, ce
  // n'est pas un étirement bitmap) ; viewport logique = resolutionBase.
  gameView.webContents.setZoomFactor(zoomBase * lb.echelle);
}

/** Retour fenêtré : bounds plein contenu, zoom ×1, fenêtre fixe à nouveau. */
function restaurerFenetre(): void {
  if (!mainWindow || !gameView || mainWindow.isFullScreen()) return;
  mainWindow.setResizable(false);
  gameView.setBounds(boundsFenetres());
  gameView.webContents.setZoomFactor(zoomBase);
}

/** F11/Échap/bouton : bascule fenêtré ↔ plein écran letterbox. */
function toggleFullscreen(): void {
  if (!mainWindow) return;
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
    // Windows : l'état final (et la taille d'écran) n'est stable qu'après le
    // redimensionnement — on applique en différé, idempotent.
    setTimeout(() => restaurerFenetre(), 100);
  } else {
    // Windows : le plein écran ne passe pas toujours sur une fenêtre non
    // redimensionnable — on le permet le temps du plein écran.
    mainWindow.setResizable(true);
    mainWindow.setFullScreen(true);
    setTimeout(() => appliquerLetterboxPleinEcran(), 100);
  }
}

/**
 * Normalisation du zoom à chaque chargement (retour d'Erik 19/09 : « zoom
 * vraiment grand aléatoire »).
 *
 * Cause racine : Chromium PERSISTE le zoom par origine dans le profil — un
 * zoomFactor posé par le letterbox (F11) ou par un script de test réapparaît
 * aux lancements suivants, d'où un zoom aléatoire selon la session précédente.
 * `setZoomFactor` remplaçant le zoom effectif, la séquence déterministe est :
 *  1. zoom 1 → le devicePixelRatio lu est alors le DPR de BASE (système) ;
 *  2. zoom de base = cible / base (neutralise aussi le cas où le switch
 *     `force-device-scale-factor` n'a pas été pris en compte).
 * Le zoom de base sert ensuite de multiplicateur au letterbox plein écran.
 */
async function normaliserDpr(): Promise<void> {
  if (!gameView || config.deviceScaleFactor == null) return;
  const cible = config.deviceScaleFactor;
  try {
    const wc = gameView.webContents;
    wc.setZoomFactor(1);
    let zoomBaseLocale = 1;
    for (let passe = 0; passe < 3; passe++) {
      const dpr = await wc.executeJavaScript('window.devicePixelRatio');
      if (typeof dpr !== 'number' || !(dpr > 0)) return;
      if (Math.abs(dpr - cible) <= 1e-6) break;
      zoomBaseLocale *= cible / dpr;
      wc.setZoomFactor(zoomBaseLocale);
    }
    if (Math.abs(zoomBaseLocale - zoomBase) > 1e-9) {
      console.log(`[coquille] zoom de base ${zoomBaseLocale} (dpr cible ${cible})`);
      zoomBase = zoomBaseLocale;
      if (mainWindow?.isFullScreen()) appliquerLetterboxPleinEcran();
    }
  } catch {
    // page en cours de navigation : la prochaine tentative corrigera
  }
}

function createWindow(): void {
  const base = config.resolutionBase;
  mainWindow = new BaseWindow({
    width: base.largeur,
    height: base.hauteur,
    useContentSize: true, // le CONTENU fait resolutionBase ; bordures en sus
    resizable: false, // résolution fixe : pas de redimensionnement
    maximizable: false,
    fullscreenable: true,
    title: config.windowTitle,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    show: false,
    backgroundColor: '#000000', // bandes letterbox en plein écran
  });

  gameView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // M3 : pont explicite uniquement (preload)
      nodeIntegration: false, // M3 : jamais
      sandbox: true, // M3 : renderer confiné
      spellcheck: false,
    },
  });
  mainWindow.contentView.addChildView(gameView);
  gameView.setBounds(boundsFenetres());

  // Affichage sans flash blanc une fois la première peinture prête.
  gameView.webContents.once('did-finish-load', () => mainWindow?.show());
  mainWindow.on('resize', () => {
    // En plein écran, les bounds/zoom de la vue sont ceux du letterbox —
    // ne pas les écraser par un plein contenu pendant la transition.
    if (mainWindow?.isFullScreen()) return;
    gameView?.setBounds(boundsFenetres());
  });

  // Plein écran letterbox : repositionnement différé en secours des events.
  mainWindow.on('enter-full-screen', () => setTimeout(() => appliquerLetterboxPleinEcran(), 100));
  mainWindow.on('leave-full-screen', () => setTimeout(() => restaurerFenetre(), 100));

  // ------------------------------------------------------------------
  // M3 — sécurité : navigation confinée, pas de fenêtre/iframe nouvelle.
  // ------------------------------------------------------------------
  gameView.webContents.setWindowOpenHandler((details) => {
    console.warn(`[sécurité] ouverture de fenêtre refusée : ${details.url}`);
    return { action: 'deny' };
  });
  gameView.webContents.on('will-attach-webview', (e) => e.preventDefault());
  gameView.webContents.on('will-navigate', (e, url) => {
    const decision = navigationDecision(url, {
      gameServerUrl: config.gameServerUrl,
      oauthHosts: config.oauthHosts,
    });
    if (decision === 'allow') return;
    console.warn(`[sécurité] navigation refusée : ${url}`);
    e.preventDefault();
  });

  // ------------------------------------------------------------------
  // M2 — raccourcis navigateur neutralisés, F11/Échap = plein écran letterbox.
  // ------------------------------------------------------------------
  gameView.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  const debugClavier = process.env.GAME4X_DEBUG === '1';
  gameView.webContents.on('before-input-event', (event, input) => {
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
      toggleFullscreen();
    } else if (decision === 'fullscreen-exit' && mainWindow?.isFullScreen()) {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  // ------------------------------------------------------------------
  // M2 — quitter propre : confirmation native si une partie est en cours.
  // ------------------------------------------------------------------
  mainWindow.on('close', (e) => {
    if (!mainWindow || !gameView) return;
    if (!estEnPartie(gameView.webContents.getURL())) return;
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
  gameView.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer] process gone : ${details.reason}`);
    if (gameView && !gameView.webContents.isDestroyed()) gameView.webContents.reload();
  });

  // Serveur injoignable : quelques re-tentatives, puis message natif.
  let loadRetries = 0;
  gameView.webContents.on('did-fail-load', (_e, errorCode, _desc, url, isMainFrame) => {
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
        void gameView?.webContents.loadURL(config.gameServerUrl);
      } else {
        app.quit();
      }
      return;
    }
    loadRetries += 1;
    setTimeout(() => void gameView?.webContents.loadURL(config.gameServerUrl), 1000 * loadRetries);
  });
  gameView.webContents.on('did-finish-load', () => {
    loadRetries = 0;
    void normaliserDpr();
  });

  if (config.devtools) gameView.webContents.openDevTools({ mode: 'detach' });

  void gameView.webContents.loadURL(config.gameServerUrl);

  // Mode par défaut de la config (défaut : fenêtre).
  if (config.modeDefaut === 'pleine-ecran') {
    mainWindow.once('show', () => toggleFullscreen());
  }
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
  if (erreurConfig) {
    dialog.showErrorBox(
      'Configuration de la coquille invalide',
      erreurConfig instanceof Error ? erreurConfig.message : String(erreurConfig),
    );
    app.quit();
    return;
  }
  config = configCharge!;

  console.log(`[coquille] env=${config.env} serveur=${config.gameServerUrl} ` +
    `résolution=${config.resolutionBase.largeur}x${config.resolutionBase.hauteur} mode=${config.modeDefaut} ` +
    `dpr=${config.deviceScaleFactor ?? 'système'}`);

  app.setAppUserModelId('com.erikaistudio.game4x');
  Menu.setApplicationMenu(null); // M2 : pas de menu Chromium
  installCsp();
  installPermissionDeny();

  // Pont preload : quitter proprement depuis le jeu (même confirmation que la croix,
  // l'événement close de la fenêtre fait le travail) ; plein écran (bouton futur).
  ipcMain.handle('shell:quit', () => {
    app.quit();
  });
  ipcMain.handle('shell:toggle-fullscreen', () => {
    toggleFullscreen();
  });

  createWindow();

  app.on('activate', () => {
    if (mainWindow === null || (mainWindow.isDestroyed() && gameView?.webContents.isDestroyed())) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit(); // Windows : quitter quand la fenêtre se ferme
});
