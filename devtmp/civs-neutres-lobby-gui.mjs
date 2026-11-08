/**
 * CIVS-NEUTRES-LOBBY — captures locales AVANT commit (L2, handoff 08/11).
 * La civ neutre (R-147, « Sans civilisation ») devient sélectionnable au
 * lobby. Captures visées (1280×720) :
 *   1. éditeur 5 sièges — deux sièges en « Sans civilisation »
 *   2. duel miroir — les DEUX sélecteurs de civ (défaut Sans civilisation)
 *   3. rencontre en jeu — « Sans civilisation » vs « Sans civilisation »
 *      (duel neutre vs neutre créé DEPUIS LA PAGE — duel vs Jev)
 *
 * UN SEUL worker 8787 ; Vite relancé à neuf (piège module STALE). Toutes
 * les actions passent par la PAGE (aucun socket concurrent — piège éviction).
 * Captures : dev-logs/captures-civs-neutres-lobby/
 * Usage : node devtmp/civs-neutres-lobby-gui.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = '8787';
const PORTG = '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-civs-neutres-lobby';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikNeutre${STAMP}`;

let vite = null;

async function demarrerVite() {
  try { await fetch(GUI); console.log('[vite] déjà en vie — STALE possible : tuer le processus avant recapture'); return; } catch {}
  vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré À NEUF'); return; } catch {}
  }
  throw new Error('vite ne démarre pas');
}
async function login(nom) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(nom)}`, { redirect: 'manual' });
  const cookie = res.headers.get('set-cookie') ?? '';
  const m = /session=([^;]+)/.exec(cookie);
  if (!m) throw new Error(`pas de cookie de session (status ${res.status})`);
  return m[1];
}

try {
  await demarrerVite();
  const token = await login(NOM);
  console.log('[login]', NOM);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/lobby`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // 1. ÉDITEUR 5 sièges : sièges 2 et 3 en « Sans civilisation ».
  const selCiv = (i) => page.locator('.rangee').nth(i).locator('.civ select');
  await selCiv(1).selectOption({ label: 'Sans civilisation' });
  await sleep(300);
  await selCiv(2).selectOption({ label: 'Sans civilisation' });
  await sleep(300);
  const lu = [await selCiv(1).inputValue(), await selCiv(2).inputValue()];
  if (lu[0] !== 'neutre' || lu[1] !== 'neutre') throw new Error(`éditeur : neutre non posé (${lu.join(',')})`);
  console.log('[éditeur] sièges 2-3 = neutre ✓');
  await page.screenshot({ path: `${CAP}/1-editeur-deux-sans-civilisation.png` });
  console.log('[capture] 1 éditeur');

  // 2. DUEL miroir : les deux sélecteurs, défaut « Sans civilisation ».
  await page.locator('select').first().selectOption('duel');
  await sleep(400);
  const civHote = page.locator('.duel-civs select').nth(0);
  const civBot = page.locator('.duel-civs select').nth(1);
  const defauts = [await civHote.inputValue(), await civBot.inputValue()];
  if (defauts[0] !== 'neutre' || defauts[1] !== 'neutre') throw new Error(`duel : défauts non neutres (${defauts.join(',')})`);
  console.log('[duel] défauts neutre/neutre ✓');
  await page.screenshot({ path: `${CAP}/2-duel-selecteurs-sans-civilisation.png` });
  console.log('[capture] 2 duel');

  // 3. RENCONTRE neutre vs neutre en jeu : duel contre JEV créé DEPUIS LA
  //    PAGE (le duel démarre immédiatement), capture de la rencontre.
  await page.locator('select').nth(3).selectOption('jev').catch(async () => {
    // repli : repérer le select Adversaire par son libellé
    await page.getByRole('combobox').filter({ hasText: 'Jev 🤖' }).first().selectOption('jev');
  });
  await sleep(300);
  await page.getByRole('button', { name: /Créer la partie/ }).first().click();
  await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
  await sleep(4000);
  await page.screenshot({ path: `${CAP}/3-rencontre-sans-civilisation-vs-sans-civilisation.png` });
  console.log('[capture] 3 rencontre');

  await browser.close();
  console.log('[OK] captures dans', CAP);
} finally {
  if (vite) { try { vite.kill(); } catch {} }
}
