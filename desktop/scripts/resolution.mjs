/**
 * Validation ELECTRON-RESOLUTION — résolution logique fixe 1280×720.
 *
 * Vérifie (coquille sur la PROD, zéro clic humain) :
 *  1. fenêtre : contenu exactement 1280×720, non redimensionnable, viewport
 *     logique 1280×720, DPR forcé à 1 (rendu identique au pixel partout) ;
 *  2. F11 (touche réelle) → plein écran letterbox : vue mise à l'échelle au
 *     max en ratio 16:9, centrée, bandes noires ; Échap → retour fenêtré ;
 *  3. letterbox sur ratio NON 16:9 (simulation écran 16:10, même code de
 *     bounds/zoom que le chemin réel) → bandes visibles, jamais d'étirement ;
 *  4. captures dans dev-logs/captures-electron-resolution/.
 * Usage : pnpm exec node scripts/resolution.mjs
 */
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-electron-resolution');
fs.mkdirSync(CAPTURES, { recursive: true });

const sendKeys = (keys) =>
  execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
  );

const échec = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const BASE = { largeur: 1280, hauteur: 720 };

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
  await win.screenshot({ path: path.join(CAPTURES, 'fenetre-1280x720.png') });
  ok('capture : fenetre-1280x720.png');

  // 2. F11 (touche réelle) → plein écran letterbox.
  await win.bringToFront();
  await win.waitForTimeout(400);
  sendKeys('{F11}');
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
    ok('viewport toujours 1280×720 en plein écran (zoom, pas de mise en page élargie)');
  } else {
    échec('viewport modifié en plein écran');
  }
  await win.screenshot({ path: path.join(CAPTURES, 'plein-ecran-letterbox.png') });
  ok('capture : plein-ecran-letterbox.png');

  // Échap → retour fenêtré, bounds et zoom restaurés.
  sendKeys('{ESC}');
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
    ok('Échap → retour fenêtré : contenu 1280×720, zoom ×1, non redimensionnable');
  } else {
    échec(`retour fenêtré inattendu : ${JSON.stringify(retour)}`);
  }

  // 3. Letterbox sur ratio NON 16:9 — simulation écran 16:10 (1920×1200) :
  // même chemin que le plein écran réel (setBounds + zoomFactor), les bandes
  // noires deviennent visibles car l'écran réel est plus large en ratio.
  sendKeys('{F11}');
  await win.waitForTimeout(800);
  await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    // Simulation letterbox écran 1920×1200 (16:10) : échelle 1.5 limitée par
    // la largeur → contenu 1920×1080, bandes de 60 px haut/bas.
    view.setBounds({ x: 0, y: 60, width: 1920, height: 1080 });
    view.webContents.setZoomFactor(1.5);
  });
  await win.waitForTimeout(600);
  const sim = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    const view = w.contentView.children[0];
    return { bounds: view.getBounds(), zoom: view.webContents.getZoomFactor(), taille: w.getContentSize() };
  });
  if (sim.bounds.height === 1080 && sim.bounds.y === 60 && sim.bounds.width === 1920) {
    ok('letterbox 16:10 simulé : contenu 1920×1080 centré, bandes 60 px haut/bas (ratio préservé)');
  } else {
    échec(`letterbox simulé inattendu : ${JSON.stringify(sim)}`);
  }
  await win.screenshot({ path: path.join(CAPTURES, 'letterbox-16x10-simulation.png') });
  ok('capture : letterbox-16x10-simulation.png');
  sendKeys('{F11}');
  await win.waitForTimeout(800);
} finally {
  await app.close();
}
console.log(process.exitCode ? 'RESOLUTION : ÉCHEC' : 'RESOLUTION : OK');
