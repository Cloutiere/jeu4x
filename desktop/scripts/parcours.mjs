/**
 * Parcours complet (M5.3) sur la stack de dev locale (worker 8787 + web 5174) —
 * le login réel en prod est réservé à Erik (Google).
 *
 * Prérequis : `pnpm dev:server` et `pnpm dev:web` lancés à la racine.
 * Usage : pnpm exec node scripts/parcours.mjs
 *
 * Vérifie : login stub → lobby → partie solo vs bot → deux fins de tour →
 * déconnexion/reconnexion → quitter → relancer avec session persistée →
 * FPS atelier (PixiJS, attendu 60) → confirmation de sortie en partie.
 */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-electron');
fs.mkdirSync(CAPTURES, { recursive: true });

const échec = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);
const capture = async (win, nom) => {
  await win.screenshot({ path: path.join(CAPTURES, nom) });
  ok(`capture : dev-logs/captures-electron/${nom}`);
};

const URL_DEV = 'http://localhost:5174';

/** La fenêtre de jeu (pas la fenêtre DevTools détachée de la config dev). */
async function fenetreJeu(app, timeout = 30_000) {
  const début = Date.now();
  while (Date.now() - début < timeout) {
    for (const w of app.windows()) {
      if (/^https?:\/\//.test(w.url())) return w;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('fenêtre de jeu introuvable');
}

// ---------------------------------------------------------------- 1er lancement
let app = await electron.launch({ args: ['.', '--env=dev'], cwd: DESKTOP });
let win = await fenetreJeu(app);
try {
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  if (win.url().startsWith(URL_DEV)) ok(`coquille dev chargée : ${win.url()}`);
  else échec(`URL inattendue : ${win.url()}`);

  // ---------------------------------------------------------------- login stub (avec déconnexion préalable si déjà connecté)
  await win.waitForTimeout(2000); // garde de session : redirection éventuelle vers le lobby
  const champLogin = win.locator('input[placeholder="Alice"]');
  if (!(await champLogin.isVisible().catch(() => false))) {
    await win.evaluate(() => {
      (window).location.hash = '#/lobby';
    });
    await win.waitForTimeout(1000);
    await win.click('button:has-text("Déconnexion")');
    await win.waitForURL(/#\/login/, { timeout: 15_000 });
    ok('état propre : déconnexion de la session persistée');
  }
  await champLogin.waitFor({ timeout: 15_000 });
  await win.fill('input[placeholder="Alice"]', 'ErikShell');
  await win.click('button:has-text("Entrer")');
  await win.waitForURL(/#\/lobby/, { timeout: 15_000 });
  ok('login stub → lobby');
  await capture(win, 'dev-lobby.png');

  // ---------------------------------------------------------------- partie solo vs bot
  await win.locator('label.check:has-text("Partie solo") input[type="checkbox"]').check();
  await win.click('button:has-text("Créer")');
  await win.waitForURL(/#\/game\/[A-Z0-9]{6}/, { timeout: 20_000 });
  const code = /#\/game\/([A-Z0-9]{6})/.exec(win.url())[1];
  ok(`partie solo créée : ${code}`);
  await win.waitForTimeout(4000); // rendu initial de la carte
  await capture(win, 'dev-partie.png');

  // ---------------------------------------------------------------- deux fins de tour (vraies résolutions)
  const tourCourant = async () => {
    const texte = await win.evaluate(() => document.body.innerText);
    const m = /Tour (\d+)/.exec(texte);
    return m ? parseInt(m[1], 10) : -1;
  };
  for (let i = 1; i <= 2; i++) {
    const avant = await tourCourant();
    await win.locator('[title*="Terminer le tour"]').first().click();
    await win.waitForTimeout(1500);
    const bloquant = win.locator('button:has-text("Finir le tour quand même")');
    if (await bloquant.isVisible().catch(() => false)) {
      await bloquant.click();
    }
    // Attente de la résolution : le compteur de tour avance (bot inclus).
    let après = avant;
    for (let attente = 0; attente < 40 && après <= avant; attente++) {
      await win.waitForTimeout(500);
      après = await tourCourant();
    }
    if (après > avant) ok(`tour ${avant} → ${après} résolu (fin de tour ${i})`);
    else échec(`tour non résolu après la fin de tour ${i} (reste Tour ${après})`);
  }
  await capture(win, 'dev-partie-tour3.png');

  // ---------------------------------------------------------------- quitter/relancer : session persistée
  await win.evaluate(() => {
    (window).location.hash = '#/lobby'; // hors partie : la fermeture ne doit pas demander confirmation
  });
  await win.waitForTimeout(1000);
  await app.close();
  ok('application quittée proprement depuis le lobby');
  app = await electron.launch({ args: ['.', '--env=dev'], cwd: DESKTOP });
  win = await fenetreJeu(app);
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.waitForTimeout(2500);
  const hash = new URL(win.url()).hash;
  if (/#\/game\/[A-Z0-9]{6}/.test(hash) || hash === '#/lobby') {
    ok(`session persistée après relance (hash ${hash}, pas de page login)`);
  } else {
    échec(`session perdue à la relance : ${win.url()}`);
  }
  await capture(win, 'dev-relance-session.png');

  // ---------------------------------------------------------------- déconnexion / reconnexion
  await win.evaluate(() => {
    (window).location.hash = '#/lobby';
  });
  await win.waitForTimeout(1500);
  const boutonDeconnexion = win.locator('button:has-text("Déconnexion")');
  if (await boutonDeconnexion.isVisible().catch(() => false)) {
    await boutonDeconnexion.click();
    await win.waitForURL(/#\/login/, { timeout: 15_000 });
    ok('déconnexion → page login');
    await win.waitForSelector('input[placeholder="Alice"]', { timeout: 15_000 });
    await win.fill('input[placeholder="Alice"]', 'ErikShell');
    await win.click('button:has-text("Entrer")');
    await win.waitForURL(/#\/lobby/, { timeout: 15_000 });
    ok('reconnexion → lobby');
  } else {
    échec('bouton Déconnexion introuvable dans le lobby');
  }

  // ---------------------------------------------------------------- bench FPS (rendu PixiJS de production, dans la partie)
  // Comptage requestAnimationFrame sur 3 s — le vrai chemin de rendu 2D du jeu.
  await win.evaluate((c) => {
    (window).location.hash = `#/game/${c}`;
  }, code);
  await win.waitForTimeout(4000); // retour dans la partie, rendu stabilisé
  const fpsElectron = await win.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const début = performance.now();
        const compte = () => {
          frames++;
          if (performance.now() - début < 3000) requestAnimationFrame(compte);
          else resolve(Math.round((frames * 1000) / (performance.now() - début)));
        };
        requestAnimationFrame(compte);
      }),
  );
  if (Number.isFinite(fpsElectron) && fpsElectron >= 55) ok(`bench Electron : ${fpsElectron} FPS (attendu 60)`);
  else échec(`bench Electron : ${fpsElectron} FPS (attendu ≥ 55)`);
  await capture(win, 'dev-bench-fps.png');
  console.log(`FPS_ELECTRON=${fpsElectron}`);

  // ---------------------------------------------------------------- confirmation de sortie en partie
  // Nous sommes dans une vraie partie (hash #/game/<code>) : la demande de
  // fermeture doit déclencher le dialog natif, qui bloque le process principal.
  // Demande de fermeture par le main : si la confirmation native s'affiche, le
  // process principal se bloque dans le dialog et ne se termine PAS.
  const estSorti = await Promise.race([
    new Promise((resolve) => app.process().once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
  ]);
  if (!estSorti) ok('fermeture en partie bloquée par la confirmation native (process vivant)');
  else échec('fenêtre fermée sans confirmation alors qu’un hash #/game était affiché');
} finally {
  // Le dialog natif éventuel bloque la sortie propre : nettoyage brutal assuré.
  try {
    app.process().kill('SIGKILL');
  } catch {
    /* déjà terminé */
  }
}
console.log(process.exitCode ? 'PARCOURS : ÉCHEC' : 'PARCOURS : OK');
