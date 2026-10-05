/**
 * MERVEILLE-COUT-FILE — vérification GUI réelle (handoff L3) : une MERVEILLE
 * en file de production affiche son coût WONDERS et une ETA finie (plus de
 * « Infinity marteaux — à l'arrêt »).
 *
 * Partie solo légale (procedural-40) : fondation, conversion science,
 * SetProduction Stonehenge (aucun prérequis — cost 50), tours avancés pour
 * entamer la tête, puis PanneauVille capturé.
 * Captures : dev-logs/captures-merveille-cout-file/.
 * Usage : node devtmp/merveille-cout-file-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-merveille-cout-file';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikMerveille${STAMP}`;
const MOI = 'p1';
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
}
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
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
}
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g, order) => g.send({ proto: 1, type: 'SubmitOrder', order });
const mesVillesDe = (st) => Object.values(st.cities).filter((c) => c.owner === MOI).sort((a, b) => (a.id < b.id ? -1 : 1));
async function finirTour(g, codeJeu) {
  const avant = (await dumpFull(codeJeu)).state.turn;
  g.send({ proto: 1, type: 'EndTurn' });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if ((await dumpFull(codeJeu)).state.turn > avant) return true;
  }
  return false;
}

// ---- Phase 1 : partie solo, fondation, Stonehenge en tête de file -----------
const token = await login(NOM);
const code = await creerPartie(token);
console.log(`[solo] partie ${code}`);
const g = wsConnect(`/ws/game/${code}`, token);
await g.open;
await g.waitFor('Welcome');

let st = (await dumpFull(code)).state;
const colon0 = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
ordre(g, { type: 'FoundCity', unitId: colon0.id });
await finirTour(g, code);
st = (await dumpFull(code)).state;
const ville = mesVillesDe(st)[0];
console.log(`[t${st.turn}] capitale ${ville.id} (${ville.q},${ville.r})`);

ordre(g, { type: 'SetConversion', cityId: ville.id, target: 'science' });
ordre(g, { type: 'SetProduction', cityId: ville.id, item: { kind: 'wonder', id: 'stonehenge' } });
await sleep(1000);

// Tours avancés jusqu'à progression > 0 (et recherche au fil de l'eau).
for (let t = 0; t < 12; t++) {
  st = (await dumpFull(code)).state;
  const v = mesVillesDe(st)[0];
  if (v.production?.progress > 0) break;
  if (!st.players[MOI].researching) {
    ordre(g, { type: 'SetResearch', techId: 'travail_du_bronze' });
    await sleep(600);
  }
  if (!(await finirTour(g, code))) { console.log('🔴 tour non avancé'); break; }
}
st = (await dumpFull(code)).state;
const vFin = mesVillesDe(st)[0];
console.log(`[t${st.turn}] production :`, JSON.stringify(vFin.production));

// ---- Phase 2 : GUI ----------------------------------------------------------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
const page = await ctx.newPage();
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

await page.evaluate((q) => window.__game.centerOn(q.x, q.y), { x: vFin.q, y: vFin.r });
await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: vFin.q, y: vFin.r });
const panneau = await page.waitForSelector('.panneau-ville', { timeout: 8000 }).catch(() => null);
if (!panneau) { console.log('🔴 panneau de ville absent'); process.exit(1); }
await sleep(800);

const fileTxt = (await page.textContent('.panneau-ville .file') ?? '').replace(/\s+/g, ' ').trim();
console.log('[file]', fileTxt);
await page.screenshot({ path: `${CAP}/merveille-en-file.png` });

const infini = /infinity/i.test(fileTxt);
const aLArret = /à l'arrêt/.test(fileTxt);
const coutOk = /50 marteaux/.test(fileTxt);
const etaOk = /dans \d+ tour/.test(fileTxt);
console.log(`[verdict] Infinity:${infini ? 'PRÉSENT 🔴' : 'absent ✅'} | à l'arrêt:${aLArret ? 'PRÉSENT 🔴' : 'absent ✅'} | coût 50:${coutOk ? '✅' : '🔴'} | ETA:${etaOk ? '✅' : '🔴'}`);
await browser.close();
process.exit(infini || aLArret || !coutOk || !etaOk ? 1 : 0);
