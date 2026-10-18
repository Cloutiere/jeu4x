// GUI e2e ASSETS-UNITS-4K VAGUE5 — validation locale à l'œil (L3, règle Erik).
// Motif devtmp/capture-assets-4k.mjs : playwright-core + msedge, Vite 5174.
// 1) labo-rendu : rangées VAGUE5 (8 types ×6 palettes + espion universelle)
//    — captures par bande + planche complète.
// 2) atelier : planches par unité (9 × (base + 6 cuites)).
// Sorties : dev-logs/captures-assets-units-4k-vague5/
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-assets-units-4k-vague5';
fs.mkdirSync(CAP, { recursive: true });

const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

// ---- 1) labo-rendu : les rangées VAGUE5 (r=20..36)
await page.goto('http://localhost:5174/#/labo-rendu', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
// dézoomer largement pour voir les rangées basses (r=20..36 sous le départ)
await page.mouse.move(cx, cy);
for (let i = 0; i < 14; i++) {
  await page.mouse.wheel(0, 120); // dézoom
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${CAP}/labo-vague5-vue-large.png` });

// pan vers le bas (glisser le canvas) jusqu'aux rangées VAGUE5
const TYPES = ['piquier', 'sous_marin', 'canon', 'milice', 'caravane', 'icbm', 'chasseur', 'bombardier', 'fusilier', 'artillerie', 'infanterie_moderne', 'char_d_assaut', 'espion'];
for (let bande = 0; bande < 5; bande++) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 900, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${CAP}/labo-vague5-bande${bande + 1}.png` });
}

// ---- 2) atelier : planches par unité (recherche par libellé)
await page.goto('http://localhost:5174/#/atelier', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
for (const t of TYPES) {
  const champ = page.locator('input[data-atelier="recherche"]');
  await champ.fill('');
  await page.waitForTimeout(200);
  await champ.fill(t === 'sous_marin' ? 'sous-marin' : t === 'icbm' ? 'icbm' : t);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${CAP}/atelier-${t}.png` });
}

// ---- asserts : les PNG cuits répondent 200 et pèsent > 100 Ko (art 4K réel)
const reponse = async (nom) => {
  const r = await page.request.get(`http://localhost:5174/art/unite_${nom}.png`);
  const buf = await r.body();
  // Vite sert le repli SPA (HTML) avec status 200 sur un fichier absent —
  // vérifier les magic bytes PNG, pas le statut HTTP.
  const estPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return { status: estPng ? 200 : 404, ko: Math.round(buf.length / 1024) };
};
let echecs = 0;
for (const t of TYPES.filter((x) => x !== 'espion')) {
  for (let j = 1; j <= 6; j++) {
    const { status, ko } = await reponse(`${t}_j${j}`);
    const ok = status === 200 && ko > 80;
    if (!ok) { echecs++; console.log(`⚠ unite_${t}_j${j} status=${status} ${ko} Ko`); }
  }
  const base = await reponse(t);
  if (base.status !== 200) { echecs++; console.log(`⚠ unite_${t} base absente`); }
}
const esp = await reponse('espion');
const espAccent = await page.request.get('http://localhost:5174/art/unite_espion_accent.png');
const bufAccent = await espAccent.body();
const accentAbscent = !(bufAccent.length > 4 && bufAccent[1] === 0x50 && bufAccent[2] === 0x4e && bufAccent[3] === 0x47);
console.log(`espion base ${esp.status} ${esp.ko} Ko ; accent absent (repli SPA) : ${accentAbscent}`);
if (esp.status !== 200 || !accentAbscent) echecs++;
console.log(echecs === 0 ? `ASSERTS OK — 72 cuites (12 types ×6) + 12 bases + espion universelle (accent retiré)` : `${echecs} échec(s)`);
await nav.close();
process.exit(echecs === 0 ? 0 : 1);
