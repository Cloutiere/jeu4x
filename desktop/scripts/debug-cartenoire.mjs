/**
 * Diagnostic carte noire : coquille dev avec CSP ACTIVÉE, jeu solo, capture
 * de tous les messages console (violations CSP notamment) + screenshot.
 * Usage : pnpm exec node scripts/debug-cartenoire.mjs
 */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-electron');
fs.mkdirSync(CAPTURES, { recursive: true });

const fenetreJeu = async (app) => {
  const début = Date.now();
  while (Date.now() - début < 30_000) {
    const w = app.windows().find((w) => /^https?:\/\//.test(w.url()));
    if (w) return w;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('fenêtre introuvable');
};

const app = await electron.launch({ args: ['.', '--env=dev'], cwd: DESKTOP });
const win = await fenetreJeu(app);
await win.waitForLoadState('domcontentloaded');

// Tous les messages console du renderer (erreurs CSP incluses).
win.on('console', (msg) => {
  const texte = msg.text();
  if (msg.type() === 'error' || /violat|Refused|security/i.test(texte)) {
    console.log(`[console:${msg.type()}] ${texte.slice(0, 300)}`);
  }
});

// État de session / partie.
await win.waitForTimeout(2500);
const champLogin = win.locator('input[placeholder="Alice"]');
if (await champLogin.isVisible().catch(() => false)) {
  await champLogin.fill('DebugNoir');
  await win.click('button:has-text("Entrer")');
  await win.waitForURL(/#\/lobby/, { timeout: 15_000 });
  console.log('login OK');
} else {
  console.log('déjà connecté :', win.url());
  await win.evaluate(() => { window.location.hash = '#/lobby'; });
  await win.waitForTimeout(1500);
}

await win.locator('label.check:has-text("Partie solo") input[type="checkbox"]').check();
await win.click('button:has-text("Créer")');
await win.waitForURL(/#\/game\/[A-Z0-9]{6}/, { timeout: 20_000 });
console.log('partie créée :', win.url());
await win.waitForTimeout(6000);

// Diagnostics renderer.
const diagnostic = await win.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const ctxt = canvas
    ? { webgl2: !!canvas.getContext('webgl2'), webgl: !!canvas.getContext('webgl') }
    : null;
  return {
    hash: window.location.hash,
    canvasPrésent: !!canvas,
    dimensionsCanvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
    contexts: ctxt,
    erreurs: window.__errs ?? null,
  };
});
console.log(JSON.stringify(diagnostic, null, 2));

await win.screenshot({ path: path.join(CAPTURES, 'debug-cartenoire.png') });
console.log('capture : debug-cartenoire.png');
// Sortie PROPRE : retour au lobby d'abord — sinon la confirmation native de
// sortie en partie s'affiche à l'écran (comportement voulu du jeu, bruyant en test).
await win.evaluate(() => {
  (window).location.hash = '#/lobby';
});
await win.waitForTimeout(1000);
await app.close().catch(() => app.process().kill());
