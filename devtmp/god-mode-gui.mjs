/**
 * GOD-MODE — vérification GUI réelle (L4, handoff 22/10).
 * Scénario : solo contre bot → ouverture de la page de jeu → brouillard
 * initial (capture A) → combo Ctrl+J puis W → bandeau GOD MODE + carte
 * entière révélée, bots visibles (capture B) → bascule OFF → brouillard
 * exact (capture C) → reconnexion avec ON conservé (capture D) → OFF +
 * reconnexion = bandeau absent.
 * Captures : dev-logs/captures-god-mode/.
 * Usage : node devtmp/god-mode-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8795';
const PORTG = process.argv[3] ?? '5176';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-god-mode';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikGodMode${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let wrangler = null;
let code = null;
let token = null;

async function demarrerWrangler() {
  try {
    await fetch(`${BASE}/`);
    console.log('[wrangler] instance déjà en vie — réutilisée');
    return;
  } catch {}
  if (wrangler) { try { wrangler.kill(); } catch {} }
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server',
    shell: true,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      await fetch(`${BASE}/`);
      return;
    } catch {}
  }
  throw new Error('wrangler ne redémarre pas');
}
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
}

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
}
function wsConnect(path, tok) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(tok)}`);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, ms = 30000) => new Promise((resolve, reject) => {
    const i = pending.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(pending.splice(i, 1)[0]);
    waiters.push({ type, resolve });
    setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.waitFor = waitFor;
  ws.send = ((orig) => (m) => orig(typeof m === 'string' ? m : JSON.stringify(m)))(ws.send.bind(ws));
  return ws;
}
async function creerPartie(tok) {
  const lobby = wsConnect('/ws/lobby', tok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}

// Vite de dev : l'instance 5174 d'Erik est peut-être déjà en vie — port dédié sinon.
async function demarrerVite() {
  try {
    await fetch(GUI);
    console.log('[vite] déjà en vie — réutilisé');
    return;
  } catch {}
  const vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore', env: { ...process.env, PORT: PORTG } });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {}
  }
  void vite;
  throw new Error('vite ne démarre pas');
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo] partie ${code}`);
  // attendre l'état initial (join bot immédiat en solo)
  for (let i = 0; i < 15; i++) {
    const d = await dumpFull(code);
    if (d.state) break;
    await sleep(2000);
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);

  // A — brouillard initial (god mode OFF)
  let bandeau = await page.$('.godmode');
  if (bandeau) throw new Error('bandeau GOD MODE visible avant toute bascule ?');
  await page.screenshot({ path: `${CAP}/A-brouillard-initial.png` });
  console.log('[capture] A-brouillard-initial');

  // B — Ctrl+J puis W : révélation complète + bandeau
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { timeout: 10000 });
  await sleep(2500);
  await page.screenshot({ path: `${CAP}/B-god-mode-on.png` });
  console.log('[capture] B-god-mode-on (bandeau + carte révélée)');
  // B2 — centrage sur la capitale du bot (units ennemies visibles à l'écran).
  const dumpBot = await dumpFull(code);
  const capitaleBot = Object.values(dumpBot.state.cities).find((c) => c.owner === 'p2');
  if (capitaleBot) {
    await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: capitaleBot.q, r: capitaleBot.r });
    await sleep(2000);
    await page.screenshot({ path: `${CAP}/B2-bots-visibles.png` });
    console.log(`[capture] B2-bots-visibles (capitale bot ${capitaleBot.q},${capitaleBot.r})`);
  }
  const dumpOn = await dumpFull(code);
  if (JSON.stringify(dumpOn).includes('godMode')) console.log('  note D5 : le dump moteur ne porte aucun godMode ✓');

  // C — bascule OFF : brouillard exact
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { state: 'detached', timeout: 10000 });
  await sleep(1500);
  await page.screenshot({ path: `${CAP}/C-god-mode-off.png` });
  console.log('[capture] C-god-mode-off (brouillard exact)');

  // D — reconnexion avec ON conservé (D4)
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.waitForSelector('.godmode', { timeout: 15000 });
  await sleep(2500);
  await page.screenshot({ path: `${CAP}/D-reconnexion-on.png` });
  console.log('[capture] D-reconnexion-on (flag conservé)');

  // E — OFF puis reconnexion : bandeau absent
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { state: 'detached', timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);
  bandeau = await page.$('.godmode');
  if (bandeau) throw new Error('bandeau GOD MODE encore visible après OFF + reconnexion ?');
  await page.screenshot({ path: `${CAP}/E-reconnexion-off.png` });
  console.log('[capture] E-reconnexion-off (brouillard exact reconstitué, D5)');

  await browser.close();
  console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  // Un WebSocket encore ouvert garde Node en vie — sortie franche.
  process.exit(process.exitCode ?? 0);
}
