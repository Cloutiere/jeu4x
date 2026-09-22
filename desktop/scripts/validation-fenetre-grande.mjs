/**
 * FENETRE-GRANDE — validation de bout en bout (demande Erik 21/09) :
 *  1. coquille dev (localhost:5174, profil isolé) : fenêtre fenêtrée = 1920×1080
 *     (resolutionBase), DPR 1, jeu net ;
 *  2. lobby : AUCUNE scrollbar parasite (document ≤ viewport) ;
 *  3. partie solo (bot) : AUCUNE scrollbar verticale/horizontale en partie,
 *     captures fenêtré puis F11 (letterbox) puis retour fenêtré.
 * Captures : dev-logs/captures-fenetre-grande/.
 * Usage : pnpm exec node scripts/validation-fenetre-grande.mjs
 */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLUTION_DEFAUT } from '../dist/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const OUT = path.join(DESKTOP, '..', 'dev-logs', 'captures-fenetre-grande');
fs.mkdirSync(OUT, { recursive: true });

const échec = (msg) => { console.error(`✗ ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`✓ ${msg}`);
const BASE = RESOLUTION_DEFAUT;

// Métriques de débordement, exécutées dans la page.
const scroll = () => ({
  inner: [window.innerWidth, window.innerHeight],
  doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  client: [document.documentElement.clientWidth, document.documentElement.clientHeight],
  barreV: window.innerWidth - document.documentElement.clientWidth,
  barreH: window.innerHeight - document.documentElement.clientHeight,
});

const app = await electron.launch({
  args: ['.', '--env=dev', '--profil=' + path.join(DESKTOP, 'tmp-profil-fenetre-grande')],
  cwd: DESKTOP,
});
try {
  const win = await (async () => {
    for (let i = 0; i < 20; i++) {
      for (const w of app.windows()) {
        if (w.url().includes('localhost:5174')) return w;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('fenêtre de jeu introuvable');
  })();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.waitForTimeout(4000);

  // 1. Fenêtre fenêtrée = resolutionBase exact (useContentSize), DPR 1.
  const fenetre = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    return { contentSize: w.getContentSize(), resizable: w.isResizable(), fullscreen: w.isFullScreen() };
  });
  if (fenetre.contentSize[0] === BASE.largeur && fenetre.contentSize[1] === BASE.hauteur && !fenetre.resizable && !fenetre.fullscreen)
    ok(`fenêtre : contenu ${fenetre.contentSize[0]}×${fenetre.contentSize[1]}, non redimensionnable`);
  else échec(`fenêtre inattendue : ${JSON.stringify(fenetre)}`);
  const vp = await win.evaluate(() => ({ inner: [innerWidth, innerHeight], dpr: devicePixelRatio }));
  if (vp.inner[0] === BASE.largeur && vp.inner[1] === BASE.hauteur && vp.dpr === 1)
    ok(`viewport logique ${vp.inner[0]}×${vp.inner[1]}, DPR ${vp.dpr}`);
  else échec(`viewport/DPR inattendus : ${JSON.stringify(vp)}`);

  // 2. Lobby : pas de scrollbar PARASITE (le contenu long peut défiler normalement,
  // D2) — échec seulement si débordement horizontal ou barre sans contenu long.
  await win.waitForTimeout(1500);
  const lobby = await win.evaluate(scroll);
  console.log('lobby :', JSON.stringify(lobby));
  if (lobby.barreH === 0 && lobby.doc[0] <= lobby.inner[0] && (lobby.barreV === 0 || lobby.doc[1] > lobby.inner[1]))
    ok(`lobby : pas de scrollbar parasite (document ${lobby.doc[0]}×${lobby.doc[1]}, contenu long → défilement normal)`);
  else échec(`lobby : débordement anormal ${JSON.stringify(lobby)}`);
  await win.screenshot({ path: path.join(OUT, 'lobby-1920x1080-sans-scrollbar.png') });
  ok('capture : lobby-1920x1080-sans-scrollbar.png');

  // 3. Partie solo (bot) — connexion stub ignorée si déjà connecté.
  const connecte = await win.evaluate(() => {
    const input = document.querySelector('input');
    const btn = [...document.querySelectorAll('button')].find((b) => /entrer/i.test(b.textContent));
    if (!input || !btn) return false;
    input.value = 'Erik';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return true;
  });
  console.log('connexion stub :', connecte);
  await win.waitForTimeout(2500);
  const solo = await win.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => /partie solo/i.test(l.textContent || ''));
    const box = label?.querySelector('input[type=checkbox]') ?? null;
    if (!box) return 'checkbox introuvable';
    if (!box.checked) box.click();
    return box.checked ? 'solo coché' : 'solo non coché';
  });
  console.log(solo);
  await win.waitForTimeout(400);
  await win.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Créer');
    if (el) el.click();
  });
  let enJeu = false;
  for (let i = 0; i < 30; i++) {
    await win.waitForTimeout(1000);
    if (/#\/game/.test(await win.evaluate(() => location.hash))) { enJeu = true; break; }
  }
  const hash = await win.evaluate(() => location.hash);
  console.log('hash :', hash);
  if (!enJeu) échec('partie non atteinte');

  // En partie, fenêtré : aucune scrollbar, canvas pleine vue.
  const partie = await win.evaluate(scroll);
  console.log('partie :', JSON.stringify(partie));
  if (partie.barreV === 0 && partie.barreH === 0 && partie.doc[1] <= partie.inner[1] && partie.doc[0] <= partie.inner[0])
    ok(`partie fenêtrée : aucune scrollbar (document ${partie.doc[0]}×${partie.doc[1]} = viewport)`);
  else échec(`partie fenêtrée : débordement ${JSON.stringify(partie)}`);
  const canvas = await win.evaluate(() => {
    const el = document.querySelector('canvas');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { css: [Math.round(r.width), Math.round(r.height)], buffer: [el.width, el.height], dpr: devicePixelRatio };
  });
  if (canvas && canvas.buffer[0] === Math.round(canvas.css[0] * canvas.dpr) && canvas.buffer[1] === Math.round(canvas.css[1] * canvas.dpr) && canvas.dpr === 1 && canvas.css[0] <= BASE.largeur && canvas.css[1] <= BASE.hauteur)
    ok(`canvas : css ${canvas.css[0]}×${canvas.css[1]}, buffer ${canvas.buffer[0]}×${canvas.buffer[1]} (net 1:1, DPR ${canvas.dpr})`);
  else échec(`canvas inattendu : ${JSON.stringify(canvas)}`);

  // Zoom de départ (retour Erik 22/09, captures à l'appui) : 4 crans de molette ⇒ scale ≈ 1.749.
  const zoom = await win.evaluate(() => window.__game?.camera?.().scale ?? null);
  if (zoom !== null && Math.abs(zoom - 1.15 ** 4) < 1e-9)
    ok(`zoom de départ : scale ${zoom.toFixed(4)} = 4 crans de molette (×1,15⁴)`);
  else échec(`zoom de départ inattendu : ${JSON.stringify(zoom)}`);
  await win.screenshot({ path: path.join(OUT, 'partie-1920x1080-fenetree-sans-scrollbar.png') });
  ok('capture : partie-1920x1080-fenetree-sans-scrollbar.png');

  // 4. F11 → letterbox plein écran (touche réelle via le pont preload).
  await win.evaluate(() => window.gameShell?.toggleFullscreen?.());
  await win.waitForTimeout(2500);
  const plein = await win.evaluate(scroll);
  const pleinWin = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    return { fullscreen: w.isFullScreen(), bounds: w.contentView.children[0].getBounds(), zoom: w.contentView.children[0].webContents.getZoomFactor(), taille: w.getContentSize() };
  });
  console.log('plein :', JSON.stringify({ page: plein, win: pleinWin }));
  if (plein.barreV === 0 && plein.barreH === 0) ok('partie plein écran : aucune scrollbar');
  else échec('partie plein écran : scrollbar');
  await win.screenshot({ path: path.join(OUT, 'partie-pleinecran-letterbox.png') });
  ok('capture : partie-pleinecran-letterbox.png');

  // 5. Retour fenêtré propre.
  await win.evaluate(() => window.gameShell?.toggleFullscreen?.());
  await win.waitForTimeout(1500);
  const retour = await app.evaluate(({ BaseWindow }) => {
    const w = BaseWindow.getAllWindows()[0];
    return { fullscreen: w.isFullScreen(), contentSize: w.getContentSize() };
  });
  if (!retour.fullscreen && retour.contentSize[0] === BASE.largeur && retour.contentSize[1] === BASE.hauteur)
    ok(`retour fenêtré : contenu ${retour.contentSize[0]}×${retour.contentSize[1]}`);
  else échec(`retour fenêtré inattendu : ${JSON.stringify(retour)}`);
} finally {
  await app.close();
}
console.log(process.exitCode ? 'FENETRE-GRANDE : ÉCHEC' : 'FENETRE-GRANDE : OK');
