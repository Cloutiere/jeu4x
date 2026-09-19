/**
 * Smoke test de la coquille contre la PROD — zéro clic humain requis.
 * Vérifie : chargement de la prod, pont preload, neutralisation des navigations
 * interdites + popups, titre fenêtre, raccourcis (Ctrl+R / zoom), capture d'écran.
 * Usage : pnpm exec node scripts/smoke-prod.mjs
 */
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-electron');
fs.mkdirSync(CAPTURES, { recursive: true });

/**
 * Touches clavier RÉELLES (SendKeys) — les touches injectées par CDP ne
 * traversent pas before-input-event, seule l'entrée système valide M2.
 * La fenêtre doit être au premier plan.
 */
const sendKeys = (keys) =>
  execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
  );

const échec = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const app = await electron.launch({ args: ['.'], cwd: DESKTOP });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  // 1. La fenêtre charge la prod.
  const url = win.url();
  if (url.startsWith('https://game-4x-server-prod.erik-ai-studio.workers.dev')) ok(`URL prod chargée : ${url}`);
  else échec(`URL inattendue : ${url}`);

  // 2. Titre propre (configuration, non surchargé par la page).
  const title = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getTitle());
  if (title === '4X multijoueur asynchrone') ok(`titre : ${title}`);
  else échec(`titre inattendu : ${title}`);

  // 3. Pont preload exposé, Node absent du renderer.
  const pont = await win.evaluate(() => ({
    isDesktop: (window).gameShell?.isDesktop === true,
    nodeAbscent: typeof (window).require === 'undefined' && typeof (window).process === 'undefined',
  }));
  if (pont.isDesktop) ok('pont preload gameShell exposé');
  else échec('pont preload manquant');
  if (pont.nodeAbscent) ok('pas de Node dans le renderer (contextIsolation + sandbox)');
  else échec('Node visible dans le renderer !');

  // 4. Navigation interdite refusée (https externe).
  await win.evaluate(() => {
    (window).__sentinelle = 42;
    (window).location.href = 'https://exemple.com/';
  });
  await win.waitForTimeout(1500);
  if (win.url().startsWith('https://game-4x-server-prod') && (await win.evaluate(() => (window).__sentinelle)) === 42) {
    ok('navigation externe refusée (page intacte)');
  } else {
    échec(`navigation externe non bloquée : ${win.url()}`);
  }

  // 5. Popup refusée (window.open retourne null quand setWindowOpenHandler refuse).
  const retourOpen = await win.evaluate(() => String((window).open('https://exemple.com/')));
  if (retourOpen === 'null') ok('popup window.open interceptée (aucune fenêtre nouvelle)');
  else échec(`window.open non bloquée : ${retourOpen}`);

  // 6. Ctrl+R neutralisé (touche réelle — la sentinelle survivrait à un rechargement ? non).
  await win.bringToFront();
  await win.waitForTimeout(500);
  sendKeys('^r');
  await win.waitForTimeout(1200);
  if ((await win.evaluate(() => (window).__sentinelle)) === 42) ok('Ctrl+R neutralisé (touche réelle)');
  else échec('Ctrl+R a rechargé la page !');

  // 7. Zoom molette neutralisé (devicePixelRatio stable).
  const dprAvant = await win.evaluate(() => (window).devicePixelRatio);
  await win.keyboard.down('Control');
  await win.mouse.wheel(0, -240);
  await win.waitForTimeout(400);
  await win.keyboard.up('Control');
  const dprAprès = await win.evaluate(() => (window).devicePixelRatio);
  if (dprAvant === dprAprès) ok(`zoom molette neutralisé (dpr ${dprAvant})`);
  else échec(`zoom appliqué : dpr ${dprAvant} → ${dprAprès}`);

  // 8. F11 plein écran (touche réelle).
  sendKeys('{F11}');
  await win.waitForTimeout(800);
  let plein = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].isFullScreen());
  if (plein) ok('F11 → plein écran');
  else échec('F11 n’a pas basculé le plein écran');
  sendKeys('{F11}');
  await win.waitForTimeout(800);
  plein = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].isFullScreen());
  if (!plein) ok('F11 → retour fenêtré');
  else échec('F11 n’est pas revenu en fenêtré');

  // 9. Capture.
  await win.screenshot({ path: path.join(CAPTURES, 'prod-login.png') });
  ok('capture : dev-logs/captures-electron/prod-login.png');
} finally {
  await app.close();
}
console.log(process.exitCode ? 'SMOKE PROD : ÉCHEC' : 'SMOKE PROD : OK');
