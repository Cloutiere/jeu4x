/**
 * Comparaison « vue identique au pixel » (ELECTRON-RESOLUTION M2.3) :
 * la fenêtre Electron (resolutionBase, DPR 1) vs un navigateur Chromium (Edge)
 * au même viewport / DPR 1, sur la même page de prod. Base lue dans dist/config.js. Un diff de pixels
 * faible (animations/moment de peinture) atteste la même composition.
 * Usage : pnpm exec node scripts/compare-vue.mjs
 */
import { _electron as electron, chromium } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { fileURLToPath } from 'node:url';
import { RESOLUTION_DEFAUT } from '../dist/config.js';

const BASE = RESOLUTION_DEFAUT;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.dirname(HERE);
const CAPTURES = path.join(DESKTOP, '..', 'dev-logs', 'captures-fenetre-grande');
fs.mkdirSync(CAPTURES, { recursive: true });
const URL_PROD = 'https://game-4x-server-prod.erik-ai-studio.workers.dev/';

const échec = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

// 1. Capture navigateur (référence : viewport = resolutionBase).
let nav;
try {
  nav = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  nav = await chromium.launch({ headless: true });
}
const pageNav = await nav.newPage({ viewport: { width: BASE.largeur, height: BASE.hauteur }, deviceScaleFactor: 1 });
await pageNav.goto(URL_PROD, { waitUntil: 'domcontentloaded', timeout: 30_000 });
await pageNav.waitForTimeout(3000); // peinture + polices stables
await pageNav.screenshot({ path: path.join(CAPTURES, 'reference-navigateur.png') });
await nav.close();
ok('capture navigateur : reference-navigateur.png');

// 2. Capture coquille Electron (mode fenêtre resolutionBase, DPR 1) — profil
// temporaire : même état non connecté que le navigateur de référence.
const profilTmp = path.join(DESKTOP, '..', 'dev-logs', 'tmp-profil-compare');
const app = await electron.launch({ args: ['.', `--profil=${profilTmp}`], cwd: DESKTOP });
let bufElectron;
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await win.waitForTimeout(3000);
  bufElectron = await win.screenshot({ path: path.join(CAPTURES, 'electron-fenetre.png') });
  ok('capture coquille : electron-fenetre.png');
} finally {
  await app.close();
}

// 3. Diff de pixels.
const imgNav = PNG.sync.read(fs.readFileSync(path.join(CAPTURES, 'reference-navigateur.png')));
const imgElectron = PNG.sync.read(bufElectron);
if (imgNav.width !== imgElectron.width || imgNav.height !== imgElectron.height) {
  échec(`dimensions différentes : nav ${imgNav.width}×${imgNav.height} vs electron ${imgElectron.width}×${imgElectron.height}`);
} else {
  const diff = new PNG({ width: imgNav.width, height: imgNav.height });
  const pixelsDifferents = pixelmatch(imgNav.data, imgElectron.data, diff.data, imgNav.width, imgNav.height, {
    threshold: 0.2,
  });
  const total = imgNav.width * imgNav.height;
  const pourcent = ((pixelsDifferents / total) * 100).toFixed(2);
  fs.writeFileSync(path.join(CAPTURES, 'diff-electron-vs-navigateur.png'), PNG.sync.write(diff));
  console.log(`pixels différents (seuil tolérant) : ${pixelsDifferents}/${total} (${pourcent} %)`);
  if (Number(pourcent) < 5) ok(`composition identique : ${pourcent} % de pixels différents (< 5 %, écarts d'animation/moment de peinture)`);
  else échec(`composition trop différente : ${pourcent} % de pixels différents`);
}
console.log(process.exitCode ? 'COMPARAISON VUE : ÉCHEC' : 'COMPARAISON VUE : OK');
