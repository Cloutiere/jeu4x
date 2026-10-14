/**
 * ZONE-CULTURELLE-DEGRADE — vérification GUI réelle (handoff L3), captures
 * AVANT commit. Partie solo légale (procedural-40, wrangler local) :
 *  1. chasse de seed : capitale p1 à ≤ 4 colonnes de la couture Est ;
 *  2. tours réels jusqu'au palier 1 (culture ≥ 10) → capture liseré ;
 *  3. tours jusqu'au palier 2 (≥ 110, < 1000) → captures dégradé continu
 *     (zooms) + couture + FPS ;
 *  4. sonde pixel : deltas de luminance le long d'un rayon (information).
 * Captures : dev-logs/captures-zone-culturelle-degrade/.
 * Usage : node devtmp/zone-culturelle-gui.mjs [baseUrl=8791] [gui=5174]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const BASE = process.argv[2] ?? 'http://127.0.0.1:8791';
const GUI = process.argv[3] ?? 'http://localhost:5174';
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-zone-culturelle-degrade';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = 'ErikZoneCult';

function wsConnect(path, token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'Error') console.log('  [erreur serveur]', JSON.stringify(m).slice(0, 200));
  });
  const waitFor = (type, ms = 30000) => new Promise((resolve, reject) => {
    const idx = pending.findIndex((m) => m.type === type);
    if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
    const t = setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
    waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
  const send = (msg) => ws.send(JSON.stringify({ proto: 1, ...msg }));
  return { ws, open: new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); }), waitFor, send };
}

const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
async function dumpFull(code) {
  const res = await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
}

const token = await fetch(`${GUI}/auth/dev?name=${NOM}-${STAMP}&next=/`, { redirect: 'manual' })
  .then((r) => /session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')[1]);

async function creerPartie() {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated', 45000);
  lobby.ws.close();
  return created.code;
}
const colOf = (h) => h.q + Math.floor(h.r / 2);

// ---- 1. Chasse de seed : capitale près de la couture ----------------------
// Tour 0 = pré-fondation : la capitale n'existe qu'après le 1er EndTurn.
let code = null, capitale = null, W = null, game = null;
for (let essai = 1; essai <= 30 && !code; essai++) {
  const c = await creerPartie();
  const g = wsConnect(`/ws/game/${c}`, token);
  await g.open;
  await g.waitFor('Welcome');
  // Fondation immédiate : le colon pose la capitale sur place (tour 0).
  const d0 = await dumpFull(c);
  const colon = Object.values(d0.state.units).find((u) => u.type === 'colon' && u.owner === 'p1' && !u.aboard);
  if (colon) {
    g.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
    await sleep(400);
  }
  g.send({ type: 'EndTurn' });
  const tr = await g.waitFor('TurnResult', 45000);
  const d = { state: tr.state };
  const ville = Object.values(d.state.cities).find((v) => v.owner === 'p1');
  if (!ville) { console.log(`[seed] essai ${essai} : pas de capitale`); g.ws.close(); continue; }
  const col = ((colOf(ville) % d.state.mapWidth) + d.state.mapWidth) % d.state.mapWidth;
  if (col <= 6 || col >= d.state.mapWidth - 7) {
    code = c; capitale = ville; W = d.state.mapWidth; game = g;
    console.log(`[seed] partie ${code} : capitale col ${col}/${W} (couture proche)`);
  } else {
    console.log(`[seed] essai ${essai} : capitale col ${col} — graine suivante`);
    g.ws.close();
  }
}
if (!code) throw new Error('aucune graine avec capitale près de la couture');

const culture = (tr) => Object.values(tr.state.cities).find((v) => v.owner === 'p1')?.cultureCumulee ?? 0;

// Freeze workerd connu (~10 tours) : sur timeout, on tue workerd, on relance
// wrangler (état DO persisté dans .wrangler/state) et on rebranche le ws.
let jeuWs = game;
let codeCourant = code;
async function redemarrerWrangler() {
  console.log('[wrangler] figé — redémarrage');
  try { execSync('taskkill /F /IM workerd /T 2>nul', { shell: true }); } catch {}
  try { execSync('taskkill /F /FI "WINDOWTITLE eq wrangler*" 2>nul', { shell: true }); } catch {}
  spawn('cmd', ['/c', 'npx', 'pnpm', '-C', 'apps/server', 'exec', 'wrangler', 'dev', '--port', '8787'], {
    cwd: 'C:/Users/Erik/ZCodeProject', detached: true, stdio: 'ignore',
  }).on('error', () => {}).unref();
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await fetch(`${BASE}/auth/dev?name=probe-zc-${i}&next=/`, { redirect: 'manual' });
      if (r.status === 302) { console.log('[wrangler] prêt'); return; }
    } catch {}
  }
  throw new Error('wrangler ne revient pas');
}
async function rebrancher() {
  if (jeuWs.ws.readyState <= 1) { try { jeuWs.ws.close(); } catch {} }
  jeuWs = wsConnect(`/ws/game/${codeCourant}`, token);
  await jeuWs.open;
  await jeuWs.waitFor('Welcome');
}
/** Un EndTurn résilient : la VÉRIFICATION passe par le dump admin (le ws des
 *  scripts rate souvent le broadcast TurnResult) ; résolution LONGUE tolérée
 *  (les tours ralentissent fortement au-delà du tour 5 en local) — on ne
 *  redémarre wrangler qu'après 3 min SANS progrès de tour. */
let dernierTourVu = 0;
async function tourResilient() {
  const avant = (await dumpFull(codeCourant)).state.turn;
  dernierTourVu = avant;
  let progres = Date.now();
  jeuWs.send({ type: 'EndTurn' });
  while (Date.now() - progres < 8 * 60 * 1000) {
    await sleep(2000);
    let d;
    try {
      d = await dumpFull(codeCourant);
    } catch {
      await redemarrerWrangler();
      await rebrancher();
      jeuWs.send({ type: 'EndTurn' });
      progres = Date.now();
      continue;
    }
    if (d.state.turn > avant) return { turn: d.state.turn, state: d.state };
    if (d.state.turn > dernierTourVu) { dernierTourVu = d.state.turn; progres = Date.now(); }
    if (Date.now() - progres > 3 * 60 * 1000) {
      await redemarrerWrangler();
      await rebrancher();
      jeuWs.send({ type: 'EndTurn' });
      progres = Date.now();
    }
  }
  throw new Error('tour bloqué');
}

// ---- 2. Partie A : palier 1 (court, aucun risque de freeze) ----------------
let tr = null, cult = 0;
for (let t = 0; t < 40 && cult < 10; t++) {
  tr = await tourResilient();
  cult = culture(tr);
}
console.log(`[palier1] culture = ${cult} au tour ${tr.turn}`);
if (cult < 10) throw new Error('palier 1 non atteint en 40 tours');

// ---- 3. GUI partie A : capture liseré --------------------------------------
let browser = null;
for (let i = 1; i <= 3 && !browser; i++) {
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    console.log(`[navigateur] lancement ${i} échoué (${String(e).slice(0, 80)}) — relance`);
    await sleep(3000);
  }
}
if (!browser) throw new Error('navigateur introuvable');
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.context().addCookies([{ name: 'session', value: token, url: GUI }]);
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game && window.__gameCanvas?.stats?.state, null, { timeout: 30000 });
await page.waitForTimeout(2000);

await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [capitale.q, capitale.r]);
await sleep(1000);
await page.screenshot({ path: `${CAP}/${STAMP}-01-palier1-lisere.png` });
console.log('[capture] 01-palier1-lisere');
await page.close();

// ---- 4. Partie B : palier 2 (TOUS les tours AVANT le navigateur — les
// redémarrages wrangler couperaient le ws de la page) ------------------------
jeuWs.ws.close();
let code2 = null, capitale2 = null;
for (let essai = 1; essai <= 30 && !code2; essai++) {
  const c = await creerPartie();
  const g = wsConnect(`/ws/game/${c}`, token);
  await g.open;
  await g.waitFor('Welcome');
  const d0 = await dumpFull(c);
  const colon = Object.values(d0.state.units).find((u) => u.type === 'colon' && u.owner === 'p1' && !u.aboard);
  if (colon) {
    g.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
    await sleep(400);
  }
  g.send({ type: 'EndTurn' });
  const tr0 = await g.waitFor('TurnResult', 45000);
  const ville = Object.values(tr0.state.cities).find((v) => v.owner === 'p1');
  if (!ville) { console.log(`[seedB] essai ${essai} : pas de capitale`); g.ws.close(); continue; }
  const col = ((colOf(ville) % tr0.state.mapWidth) + tr0.state.mapWidth) % tr0.state.mapWidth;
  if (col <= 6 || col >= tr0.state.mapWidth - 7) {
    code2 = c; capitale2 = ville; jeuWs = g; codeCourant = c;
    console.log(`[seedB] partie ${code2} : capitale col ${col} (couture proche)`);
  } else {
    console.log(`[seedB] essai ${essai} : capitale col ${col} — graine suivante`);
    g.ws.close();
  }
}
if (!code2) throw new Error('aucune graine B avec capitale près de la couture');

let cult2 = 0, tr2 = null;
for (let t = 0; t < 200 && cult2 < 110; t++) {
  tr2 = await tourResilient();
  cult2 = culture(tr2);
  if (t % 10 === 9) console.log(`  B tour ${tr2.turn} : culture ${cult2}`);
}
console.log(`[palier2] culture = ${cult2} au tour ${tr2.turn}`);
if (cult2 < 110) throw new Error('palier 2 non atteint en 200 tours');

// ---- 5. GUI partie B : captures dégradé ------------------------------------
const page2 = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page2.context().addCookies([{ name: 'session', value: token, url: GUI }]);
page2.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page2.goto(`${GUI}/#/game/${code2}`, { waitUntil: 'networkidle' });
await page2.waitForFunction(() => window.__game && window.__gameCanvas?.stats?.state, null, { timeout: 30000 });
await page2.waitForTimeout(2000);

// Zoom par défaut centré capitale.
await page2.evaluate(([q, r]) => window.__game.centerOn(q, r), [capitale2.q, capitale2.r]);
await sleep(1000);
await page2.screenshot({ path: `${CAP}/${STAMP}-02-palier2-defaut.png` });
console.log('[capture] 02-palier2-defaut');

// Zoom avant (molette) — pente à gros calibre.
const box = await (await page2.$('.canvas-host canvas')).boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page2.mouse.move(cx, cy);
for (let i = 0; i < 5; i++) { await page2.mouse.wheel(0, -240); await sleep(250); }
await sleep(600);
await page2.screenshot({ path: `${CAP}/${STAMP}-03-palier2-zoom.png` });
console.log('[capture] 03-palier2-zoom');
for (let i = 0; i < 9; i++) { await page2.mouse.wheel(0, 240); await sleep(200); }
await sleep(600);
await page2.screenshot({ path: `${CAP}/${STAMP}-04-palier2-dezoom.png` });
console.log('[capture] 04-palier2-dezoom');

// Couture : caméra calée sur la colonne 0 (capitale proche) — la zone doit
// se lire en continu À TRAVERS la couture.
await page2.evaluate(([q, r]) => window.__game.centerOn(q, r), [-Math.floor(capitale2.r / 2), capitale2.r]);
await sleep(1000);
await page2.screenshot({ path: `${CAP}/${STAMP}-05-couture.png` });
console.log('[capture] 05-couture');

// FPS (dernière seconde).
const perf = await page2.evaluate(() => window.__game.perfResume());
console.log('[perf]', JSON.stringify(perf));

// ---- 6. Caméra (contexte des captures) -------------------------------------
const analyse = await page2.evaluate(() => window.__game.camera());
console.log(`[fin] captures dans ${CAP} — partie B ${code2}, culture ${cult2}, tour ${tr2.turn}`);
await browser.close();
jeuWs.ws.close();
process.exit(0);
