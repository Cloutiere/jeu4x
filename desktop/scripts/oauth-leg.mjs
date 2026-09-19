/**
 * M4 — jambe OAuth côté coquille, contre la PROD (sans identifiants — le login
 * complet avec compte Google/Discord reste le test manuel d'Erik).
 *
 * Vérifie : CSP réellement appliquée (image externe bloquée), clic Google →
 * navigation pleine page autorisée vers accounts.google.com (allowlist), page
 * Google rendue dans la fenêtre, retour propre au jeu. Usage :
 * pnpm exec node scripts/oauth-leg.mjs
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

const PROD = 'https://game-4x-server-prod.erik-ai-studio.workers.dev';

const app = await electron.launch({ args: ['.'], cwd: DESKTOP });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  // CSP appliquée ? Une image externe doit être bloquée (img-src 'self' data: blob:).
  const verdict = await win.evaluate(
    () =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve('chargée — CSP absente !');
        img.onerror = () => resolve('bloquée');
        img.src = 'https://exemple.com/pixel.png';
        setTimeout(() => resolve('indéterminé'), 5000);
      }),
  );
  if (verdict === 'bloquée') ok('CSP appliquée : image externe bloquée');
  else échec(`CSP : ${verdict}`);

  // Jambe OAuth Google : navigation pleine page autorisée par l'allowlist.
  await win.click('button:has-text("Se connecter avec Google")');
  await win.waitForURL(/accounts\.google\.com/, { timeout: 25_000 });
  ok(`navigation OAuth autorisée : ${win.url().slice(0, 60)}…`);
  await win.waitForTimeout(2500); // rendu de la page Google
  await win.screenshot({ path: path.join(CAPTURES, 'prod-oauth-google.png') });
  ok('capture : dev-logs/captures-electron/prod-oauth-google.png');

  // Retour au jeu (le flux complet avec identifiants reviendrait tout seul via le callback).
  await win.goto(PROD + '/#/login');
  await win.waitForURL(() => true);
  if (win.url().startsWith(PROD)) ok('retour au jeu propre');
  else échec(`retour impossible : ${win.url()}`);
} finally {
  await app.close().catch(() => app.process().kill());
}
console.log(process.exitCode ? 'JAMBE OAUTH : ÉCHEC' : 'JAMBE OAUTH : OK');
