// Captures zoomées par rangée VAGUE5 (complément vague5-gui.mjs) : zoom molette
// centré sur le curseur, une capture par unité (9 rangées).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-assets-units-4k-vague5';
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5174/#/labo-rendu', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
// dézoomer pour faire tenir les 38 rangées
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(100); }
await page.waitForTimeout(1200);
// carte visible ~y 289..696 pour les rangées 0..37 (mesuré capture précédente)
const yHaut = 289, yBas = 696;
const RANGEES = [['piquier', 20], ['sous_marin', 22], ['canon', 24], ['milice', 26], ['caravane', 28], ['icbm', 30], ['chasseur', 32], ['bombardier', 34], ['espion', 36]];
const noms = { piquier: 'Piquier', sous_marin: 'Sous-marin', canon: 'Canon', milice: 'Milice', caravane: 'Caravane', icbm: 'ICBM', chasseur: 'Chasseur', bombardier: 'Bombardier', espion: 'Espion' };
for (const [type, r] of RANGEES) {
  const y = yHaut + ((r + 0.5) / 38) * (yBas - yHaut);
  const x = box.x + 600; // 2e copie horizontale (monde cylindrique)
  await page.mouse.move(x, y);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${CAP}/labo-rangée-${type}.png` });
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(80); }
  await page.waitForTimeout(400);
  console.log(noms[type], 'capturé');
}
await nav.close();
