/**
 * GOD-MODE-PRODUCTION — vérification GUI réelle (L3, handoff 23/10).
 * Scénario : solo contre bot → god mode ON → centrage sur la capitale du
 * bot → bannière IA AVEC production/croissance (capture ON) → god mode OFF →
 * la même bannière est masquée (capture OFF).
 * Captures : dev-logs/captures-god-mode-production/.
 * Usage : node devtmp/god-mode-production-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8796';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-god-mode-production';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikGodProd${STAMP}`;
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

// Vite de dev : port dédié (l'instance 5174 d'Erik ne doit pas être touchée).
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

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo] partie ${code}`);
  // attendre l'état initial (join bot immédiat en solo) + 1 résolution pour
  // que le bot ait posé SA production (le dump sert de garde).
  let dump = null;
  for (let i = 0; i < 15; i++) {
    dump = await dumpFull(code);
    if (dump.state) break;
    await sleep(2000);
  }
  if (!dump?.state) throw new Error('état initial absent');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);

  // God mode ON
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { timeout: 10000 });
  await sleep(2500);

  // Centrage sur la capitale du bot, zoom rapproché pour lire la bannière.
  let capitaleBot = null;
  for (let t = 0; t < 12; t++) {
    const d = await dumpFull(code);
    capitaleBot = Object.values(d.state.cities).find((c) => c.owner === 'p2');
    if (capitaleBot?.production) break;
    // une résolution de plus si le bot n'a pas encore de file — via le
    // BOUTON de la page (une 2e socket du même joueur évine celle de la
    // page : la page ne recevrait jamais le TurnResult).
    await page.click('.fin-tour-rond');
    await page.click('text=Finir le tour quand même').catch(() => {});
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(code)).state.turn > d.state.turn) break;
    }
  }
  if (!capitaleBot?.production) throw new Error('le bot n’a jamais posé de production en 12 tours');
  console.log(`[bot] capitale ${capitaleBot.name ?? capitaleBot.id} (${capitaleBot.q},${capitaleBot.r}) production:`, JSON.stringify(capitaleBot.production?.item ?? null));
  await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: capitaleBot.q, r: capitaleBot.r });
  await sleep(2000);
  // Capture recadrée sur la bannière (au-dessus du sprite ville).
  const pos = await page.evaluate((hex) => window.__gameCanvas.hexToPage(hex), { q: capitaleBot.q, r: capitaleBot.r });
  if (!pos) throw new Error('capitale du bot hors écran');
  const clip = {
    x: Math.max(0, pos.x - 240),
    y: Math.max(0, pos.y - 230),
    width: 480,
    height: 280,
  };
  await page.screenshot({ path: `${CAP}/ON-banniere-production.png`, clip });
  console.log('[capture] ON-banniere-production (bannière IA avec production)');

  // God mode OFF : la même bannière se masque
  await page.keyboard.press('Control+j');
  await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { state: 'detached', timeout: 10000 });
  await sleep(2000);
  await page.screenshot({ path: `${CAP}/OFF-banniere-masquee.png`, clip });
  console.log('[capture] OFF-banniere-masquee (même cadrage, god mode OFF)');

  await browser.close();
  console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
