/**
 * ZONE-CULTURELLE-DEGRADE — captures GUI d'une partie déjà poussée au
 * palier 2. Usage : node devtmp/zonecult-captures.mjs <code> <q> <r> <stamp>
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const GUI = 'http://localhost:5174';
const code = process.argv[2];
const Q = Number(process.argv[3]);
const R = Number(process.argv[4]);
const STAMP = process.argv[5];
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-zone-culturelle-degrade';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const r0 = await fetch(`${GUI}/auth/dev?name=ErikZoneCult-2026-10-14-11-44-30&next=/`, { redirect: 'manual' });
const token = /session=([^;]+)/.exec(r0.headers.get('set-cookie'))[1];

let browser = null;
for (let i = 1; i <= 3 && !browser; i++) {
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    console.log(`[navigateur] lancement ${i} échoué — relance`);
    await sleep(3000);
  }
}
if (!browser) throw new Error('navigateur introuvable');
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.context().addCookies([{ name: 'session', value: token, url: GUI }]);
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game && window.__gameCanvas?.stats?.state, null, { timeout: 30000 });
await page.waitForTimeout(2500);

await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [Q, R]);
await sleep(1200);
await page.screenshot({ path: `${CAP}/${STAMP}-02-palier2-defaut.png` });
console.log('[capture] 02-palier2-defaut');

const box = await (await page.$('.canvas-host canvas')).boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -240); await sleep(250); }
await sleep(800);
await page.screenshot({ path: `${CAP}/${STAMP}-03-palier2-zoom.png` });
console.log('[capture] 03-palier2-zoom');
for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, 240); await sleep(200); }
await sleep(800);
await page.screenshot({ path: `${CAP}/${STAMP}-04-palier2-dezoom.png` });
console.log('[capture] 04-palier2-dezoom');

// Couture : caméra calée sur la colonne 0 à la hauteur de la capitale.
await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [-Math.floor(R / 2), R]);
await sleep(1200);
await page.screenshot({ path: `${CAP}/${STAMP}-05-couture.png` });
console.log('[capture] 05-couture');

const perf = await page.evaluate(() => window.__game.perfResume());
console.log('[perf]', JSON.stringify(perf));
const cam = await page.evaluate(() => window.__game.camera());
console.log('[camera]', JSON.stringify(cam));
await browser.close();
process.exit(0);
