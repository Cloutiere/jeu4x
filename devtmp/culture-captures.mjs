/** CULTURE-RESSOURCES — captures GUI du labo #/labo-culture (rendu réel).
 * Usage : node devtmp/culture-captures.mjs  (Vite 5174 doit tourner) */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-culture-ressources';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('filtres-carte', JSON.stringify({ rendements: 1, ressources: true, replie: false })));
await page.goto('http://localhost:5174/#/labo-culture', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(3500);

// 1 — encens TRAVAILLÉ avec Rites funéraires : glyphe +2 culture + or direct.
await page.screenshot({ path: `${CAP}/1-encens-travaille-glyphe-culture.png` });
console.log('1 ok (encens révélé +2 culture, panneau ville)');

// 2 — sans techs : encens caché (aucun glyphe culture), soie toujours cachée.
await page.uncheck('input[type=checkbox]');
await sleep(1800);
await page.screenshot({ path: `${CAP}/2-sans-rites-encens-cache.png` });
console.log('2 ok (encens caché — rien)');
await nav.close();
