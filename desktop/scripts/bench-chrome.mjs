/**
 * Bench navigateur de référence — même stack dev, même mesure rAF que parcours.mjs.
 * Comparaison navigateur (Edge, moteur Chromium) vs Electron (attendu : identique, ~60 FPS).
 * (Chrome n'est pas installé sur la machine d'Erik ; Edge = même moteur que Chrome/Electron.)
 * Usage : pnpm exec node scripts/bench-chrome.mjs
 */
import { chromium } from 'playwright-core';

const URL_DEV = 'http://localhost:5174';

const navigateur = await chromium.launch({ channel: 'msedge', headless: false });
try {
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL_DEV + '/#/login');
  await page.waitForSelector('input[placeholder="Alice"]', { timeout: 15_000 });
  await page.fill('input[placeholder="Alice"]', 'BenchChrome');
  await page.click('button:has-text("Entrer")');
  await page.waitForURL(/#\/lobby/, { timeout: 15_000 });

  await page.locator('label.check:has-text("Partie solo") input[type="checkbox"]').check();
  await page.click('button:has-text("Créer")');
  await page.waitForURL(/#\/game\/[A-Z0-9]{6}/, { timeout: 20_000 });
  await page.waitForTimeout(5000); // rendu initial stabilisé

  const fps = await page.evaluate(
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
  console.log(`FPS_NAVIGATEUR=${fps}`);
  if (Number.isFinite(fps) && fps >= 55) console.log('bench navigateur (Edge) : OK');
  else {
    console.error('bench navigateur (Edge) : FPS bas');
    process.exitCode = 1;
  }
} finally {
  await navigateur.close();
}
