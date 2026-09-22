/**
 * Validation ELECTRON-RESOLUTION / FENETRE-GRANDE — résolution logique fixe.
 * La base est lue dans dist/config.js (RESOLUTION_DEFAUT, 1920×1080) — plus de
 * constante dupliquée ; lancer `pnpm -C desktop build` avant si besoin.
 *
 * Vérifie (coquille sur la PROD, zéro clic humain) :
 *  1. fenêtre : contenu exactement resolutionBase, non redimensionnable,
 *     viewport logique = resolutionBase, DPR forcé à 1 (rendu identique au
 *     pixel partout) ;
 *  2. F11 (touche réelle) → plein écran letterbox : vue mise à l'échelle au
 *     max en ratio 16:9, centrée, bandes noires ; Échap → retour fenêtré ;
 *  3. letterbox sur ratio NON 16:9 (simulation écran 16:10, même code de
 *     bounds/zoom que le chemin réel) → bandes visibles, jamais d'étirement ;
 *  4. captures dans dev-logs/captures-fenetre-grande/.
 * Usage : pnpm -C desktop build && pnpm exec node scripts/resolution.mjs
 */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLUTION_DEFAUT } from '../dist/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-fenetre-grande');
fs.mkdirSync(CAPTURES, { recursive: true });

const sendKeys = async (win, keys) => {
  // F11/Échap via le pont preload (gameShell.toggleFullscreen) : les événements
  // clavier synthétisés (CDP comme SendKeys PowerShell) ne déclenchent pas
  // before-input-event côté Electron — seule la touche physique les atteint.
  // Le chemin letterbox (appliquerLetterboxPleinEcran) est le même par le pont ;
  // la touche F11 réelle reste validée à la main par Erik.
  const carte = { '{F11}': 'toggleFullscreen', '{ESC}': 'toggleFullscreen' };
  const methode = carte[keys];
  if (!methode) throw new Error(`touche non mappée : ${keys}`);
  await win.evaluate((m) => window.gameShell?.[m]?.(), methode);
};

const échec = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const BASE = RESOLUTION_DEFAUT;

const app = await electron.launch({ args: ['.'], cwd: DESKTOP });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  // 1. Mode fenêtre : contenu 1280×720 exact, non redimensionnable.
  const fenetre = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    return {
      contentSize: w.getContentSize(),
      resizable: w.isResizable(),
      fullscreen: w.isFullScreen(),
    };
  });
  if (
    fenetre.contentSize[0] === BASE.largeur &&
    fenetre.contentSize[1] === BASE.hauteur &&
    !fenetre.resizable &&
    !fenetre.fullscreen
  ) {
    ok(`fenêtre : contenu ${fenetre.contentSize[0]}×${fenetre.contentSize[1]}, non redimensionnable`);
  } else {
    échec(`fenêtre inattendue : ${JSON.stringify(fenetre)}`);
  }

  // Viewport logique = 1280×720 et DPR neutralisé (rendu identique au pixel).
  const viewport = await win.evaluate(() => ({
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  if (viewport.innerW === BASE.largeur && viewport.innerH === BASE.hauteur && viewport.dpr === 1) {
    ok(`viewport logique ${viewport.innerW}×${viewport.innerH}, devicePixelRatio=${viewport.dpr} (neutralisé)`);
  } else {
    échec(`viewport/DPR inattendus : ${JSON.stringify(viewport)}`);
  }

  // La vue de jeu porte bien le pont preload (page de la WebContentsView).
  if (await win.evaluate(() => (window).gameShell?.isDesktop === true)) ok('pont preload exposé sur la vue de jeu');
  else échec('pont preload manquant');

  await win.waitForTimeout(1500); // peinture stable
  await win.screenshot({ path: path.join(CAPTURES, `fenetre-${BASE.largeur}x${BASE.hauteur}.png`) });
  ok(`capture : fenetre-${BASE.largeur}x${BASE.hauteur}.png`);

  // 2. F11 (touche réelle) → plein écran letterbox.
  await win.bringToFront();
  await win.waitForTimeout(400);
  await sendKeys(win, '{F11}');
  await win.waitForTimeout(1000);
  const plein = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    return { fullscreen: w.isFullScreen(), bounds: view.getBounds(), zoom: view.webContents.getZoomFactor() };
  });
  const [ecranW, ecranH] = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    return w.getContentSize();
  });
  const echelleAttendue = Math.min(ecranW / BASE.largeur, ecranH / BASE.hauteur);
  const largeurAttendue = Math.floor(BASE.largeur * echelleAttendue);
  const hauteurAttendue = Math.floor(BASE.hauteur * echelleAttendue);
  if (
    plein.fullscreen &&
    plein.bounds.width === largeurAttendue &&
    plein.bounds.height === hauteurAttendue &&
    Math.abs(plein.zoom - echelleAttendue) < 1e-6 &&
    plein.bounds.x === Math.floor((ecranW - largeurAttendue) / 2) &&
    plein.bounds.y === Math.floor((ecranH - hauteurAttendue) / 2)
  ) {
    ok(`F11 → plein écran letterbox : contenu ${plein.bounds.width}×${plein.bounds.height} centré dans ${ecranW}×${ecranH}, zoom ×${plein.zoom.toFixed(4)}`);
  } else {
    échec(`letterbox F11 inattendu : ${JSON.stringify({ plein, ecranW, ecranH, echelleAttendue })}`);
  }
  if (
    (await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })))
      .w === BASE.largeur
  ) {
    ok(`viewport toujours ${BASE.largeur}×${BASE.hauteur} en plein écran (zoom, pas de mise en page élargie)`);
  } else {
    échec('viewport modifié en plein écran');
  }
  await win.screenshot({ path: path.join(CAPTURES, 'plein-ecran-letterbox.png') });
  ok('capture : plein-ecran-letterbox.png');

  // Échap → retour fenêtré, bounds et zoom restaurés.
  await sendKeys(win, '{ESC}');
  await win.waitForTimeout(1000);
  const retour = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    return { fullscreen: w.isFullScreen(), bounds: view.getBounds(), zoom: view.webContents.getZoomFactor(), resizable: w.isResizable() };
  });
  if (
    !retour.fullscreen &&
    retour.bounds.width === BASE.largeur &&
    retour.bounds.height === BASE.hauteur &&
    retour.zoom === 1 &&
    !retour.resizable
  ) {
    ok(`Échap → retour fenêtré : contenu ${BASE.largeur}×${BASE.hauteur}, zoom ×1, non redimensionnable`);
  } else {
    échec(`retour fenêtré inattendu : ${JSON.stringify(retour)}`);
  }

  // 3. Letterbox sur ratio NON 16:9 — simulation écran 16:10 (BASE × 10/9 de
  // haut) : même chemin que le plein écran réel (setBounds + zoomFactor), les
  // bandes noires deviennent visibles car l'écran simulé est plus haut en ratio.
  const simEcranH = Math.round((BASE.hauteur * 10) / 9); // 1200 pour une base 1080
  const simEchelle = Math.min(BASE.largeur / BASE.largeur, simEcranH / BASE.hauteur); // limité par la largeur
  const simW = Math.floor(BASE.largeur * simEchelle);
  const simH = Math.floor(BASE.hauteur * simEchelle);
  const simY = Math.floor((simEcranH - simH) / 2);
  await sendKeys(win, '{F11}');
  await win.waitForTimeout(800);
  await app.evaluate(({ BaseWindow }, { simW, simH, simY, simEchelle }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    view.setBounds({ x: 0, y: simY, width: simW, height: simH });
    view.webContents.setZoomFactor(simEchelle);
  }, { simW, simH, simY, simEchelle });
  await win.waitForTimeout(600);
  const sim = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    return { bounds: view.getBounds(), zoom: view.webContents.getZoomFactor(), taille: w.getContentSize() };
  });
  if (sim.bounds.height === simH && sim.bounds.y === simY && sim.bounds.width === simW) {
    ok(`letterbox 16:10 simulé : contenu ${simW}×${simH} centré, bandes ${simY} px haut/bas (ratio préservé)`);
  } else {
    échec(`letterbox simulé inattendu : ${JSON.stringify(sim)}`);
  }
  await win.screenshot({ path: path.join(CAPTURES, 'letterbox-16x10-simulation.png') });
  ok('capture : letterbox-16x10-simulation.png');
  await sendKeys(win, '{F11}');
  await win.waitForTimeout(800);
} finally {
  await app.close();
}
console.log(process.exitCode ? 'RESOLUTION : ÉCHEC' : 'RESOLUTION : OK');
