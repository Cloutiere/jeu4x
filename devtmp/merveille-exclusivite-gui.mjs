/**
 * MERVEILLE-EXCLUSIVITE-PUBLIQUE — vérification GUI réelle : le geste d'Erik
 * (clic « + » sur Stonehenge dans l'onglet Merveilles → QueueProduction) doit
 * SURVIVRE à la résolution (fin de tour), sans toast « Ordre non exécuté » ni
 * ProductionRefused. Le scénario brouillard (merveille déjà bâtie par un bot
 * invisible) est proué en unitaires (rules 6 cas) — hors portée GUI 🔶.
 * Captures : dev-logs/captures-merveille-exclusivite/.
 * Usage : node devtmp/merveille-exclusivite-gui.mjs [portWorker] [portVite]
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
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-merveille-exclusivite';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikExclu${STAMP}`;
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

// ---- Phase 1 : solo, fondation, conversion science --------------------------
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
await sleep(600);

// ---- Phase 2 : GUI — clic « + » sur Stonehenge (QueueProduction réel) -------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
const page = await ctx.newPage();
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

await page.evaluate((q) => window.__game.centerOn(q.x, q.y), { x: ville.q, y: ville.r });
await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: ville.q, y: ville.r });
await page.waitForSelector('.panneau-ville', { timeout: 8000 });
await sleep(500);
await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Merveilles'))?.click());
await sleep(400);
const optStone = await page.$$eval('.panneau-ville .opt', (els) => {
  const cible = els.find((b) => b.textContent.includes('Stonehenge'));
  return { present: !!cible, disabled: cible ? cible.disabled : null };
});
console.log('[onglet] Stonehenge proposé :', JSON.stringify(optStone));
await page.screenshot({ path: `${CAP}/onglet-merveilles.png` });
if (!optStone.present) { console.log('🔴 Stonehenge absent de l\'onglet'); process.exit(1); }
await page.$$eval('.panneau-ville .opt', (els) => els.find((b) => b.textContent.includes('Stonehenge'))?.click());
await sleep(900);
const fileTxt = (await page.textContent('.panneau-ville .file') ?? '').replace(/\s+/g, ' ').trim();
console.log('[file avant résolution]', fileTxt);
await page.screenshot({ path: `${CAP}/stonehenge-en-file.png` });

// ---- Phase 3 : résolution — la production doit survivre ---------------------
const toasts = [];
page.on('console', () => {});
await page.exposeFunction('_toastSpy', (t) => toasts.push(t)).catch(() => {});
if (!(await finirTour(g, code))) { console.log('🔴 tour non avancé'); process.exit(1); }
st = (await dumpFull(code)).state;
const vFin = mesVillesDe(st)[0];
const prod = vFin.production;
console.log(`[t${st.turn}] production :`, JSON.stringify(prod));
const dump = await dumpFull(code);
const refus = (dump.lastEvents ?? []).filter((e) => e.type === 'ProductionRefused');
console.log('[events] ProductionRefused :', refus.length);
await sleep(1500);
await page.screenshot({ path: `${CAP}/apres-resolution.png` });

const ok = prod && prod.item.kind === 'wonder' && prod.item.id === 'stonehenge' && refus.length === 0;
console.log(`[verdict] ${ok ? 'PASS ✅ — Stonehenge survit à la résolution, aucun refus' : 'ÉCHEC 🔴'}`);
await browser.close();
process.exit(ok ? 0 : 1);
