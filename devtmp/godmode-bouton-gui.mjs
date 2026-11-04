/**
 * GODMODE-BOUTON — captures locales AVANT commit (L2, handoff 04/11).
 * Bouton « God mode » dans la barre DEV : inactif → actif (carte révélée)
 * → inactif ; chord Ctrl+J→G bascule ; Ctrl+J→W ne fait plus rien (et ne
 * ferme plus l'onglet — headless : on vérifie l'état, pas la fermeture).
 * Captures : dev-logs/captures-godmode-bouton/ (navigateur 1280×720 — piège connu).
 * Usage : node devtmp/godmode-bouton-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8797';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-godmode-bouton';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikGodmode${STAMP}`;
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
async function demarrerVite() {
  try {
    await fetch(GUI);
    console.log('[vite] déjà en vie — réutilisé');
    return;
  } catch {}
  const vite = spawn('pnpm', ['dev', '--', '--port', PORTG, '--strictPort'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {}
  }
  void vite;
  throw new Error('vite ne démarre pas');
}
async function godModePage(page) {
  // Sonde DOM : bandeau GOD MODE + état visuel du bouton (pilotés par le
  // Snapshot serveur — le client n'active jamais localement).
  return await page.evaluate(() => ({
    bandeau: !!document.querySelector('.godmode'),
    boutonActif: !!document.querySelector('.bar-dev .active-toggle'),
  }));
}
async function ouvrirBarreDev(page) {
  const visible = await page.locator('.bar-dev').isVisible().catch(() => false);
  if (!visible) await page.click('.engrenage');
  await sleep(500);
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo/bots] partie ${code}`);
  let dump = null;
  for (let i = 0; i < 15; i++) {
    dump = await dumpFull(code);
    if (dump.state) break;
    await sleep(2000);
  }
  if (!dump?.state) throw new Error('état initial absent');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);

  // Barre DEV ouverte + bouton God mode visible (solo/bots — D3)
  await ouvrirBarreDev(page);
  const bouton = page.locator('.bar-dev button', { hasText: 'God mode' });
  if (!(await bouton.isVisible())) throw new Error('bouton God mode invisible (solo/bots — D3 attendu visible)');
  await page.screenshot({ path: `${CAP}/1-bouton-inactif.png` });

  // Clic → révélation (le serveur confirme par le Snapshot)
  await bouton.click();
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if ((await godModePage(page))?.bandeau) break;
  }
  const actif = await godModePage(page);
  if (!actif?.bandeau) throw new Error(`god mode non activé au clic : ${JSON.stringify(actif)}`);
  console.log('[clic] god mode ACTIF — bandeau + bouton actif :', JSON.stringify(actif));
  await sleep(1500);
  await page.screenshot({ path: `${CAP}/2-bouton-actif-carte-revelee.png` });

  // Re-clic → révélation retirée
  await bouton.click();
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (!(await godModePage(page))?.bandeau) break;
  }
  if ((await godModePage(page))?.bandeau) throw new Error('god mode non désactivé au 2e clic');
  await sleep(800);
  await page.screenshot({ path: `${CAP}/3-bouton-reclic-inactif.png` });
  console.log('[clic] god mode INACTIF — bascule réversible OK');

  // Chord Ctrl+J→G bascule (D2)
  await page.keyboard.press('Control+j');
  await sleep(200);
  await page.keyboard.press('g');
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if ((await godModePage(page))?.bandeau) break;
  }
  if (!(await godModePage(page))?.bandeau) throw new Error('chord Ctrl+J→G n’a pas activé le god mode');
  console.log('[chord] Ctrl+J→G → ACTIF');
  await sleep(1200);
  await page.screenshot({ path: `${CAP}/4-chord-ctrlj-g-actif.png` });

  // Ctrl+J→W : plus écouté — l'état NE CHANGE PAS et l'onglet survit
  const avant = await godModePage(page);
  await page.keyboard.press('Control+j');
  await sleep(200);
  await page.keyboard.press('w');
  await sleep(1500);
  const apres = await godModePage(page);
  if (JSON.stringify(apres) !== JSON.stringify(avant)) throw new Error(`W a changé l'état : ${JSON.stringify({ avant, apres })}`);
  await page.keyboard.press('Control+j'); // désarmer sans effet de bord
  console.log('[chord] Ctrl+J→W → aucun effet, onglet vivant (page toujours évaluée)');

  await browser.close();
  console.log(`[OK] captures dans ${CAP} — partie ${code}`);
} finally {
  if (wrangler) { try { wrangler.kill(); } catch {} }
}
