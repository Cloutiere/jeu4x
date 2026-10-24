/**
 * GOD-MODE-PRODUCTION — sonde debug : états réels des labels de la bannière
 * Pixi pour CHAQUE ville visible (prodCercle/prodInitiale/prodEta/
 * bandeCroissance). Usage : node devtmp/god-mode-prod-debug.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json')('playwright-core');
const PORTW = '8796';
const PORTG = '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikDbg${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  return /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
}
function wsConnect(path, tok) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(tok)}`);
  const waiters = []; const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    console.log('[ws]', msg.type);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg); else pending.push(msg);
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

const token = await login(NOM);
const lobby = wsConnect('/ws/lobby', token);
await lobby.open; await lobby.waitFor('GameList');
lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
const { code } = await lobby.waitFor('GameCreated'); lobby.close();
console.log('[solo]', code);
for (let i = 0; i < 15; i++) {
  const d = await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  if (d.state) break; await sleep(2000);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() !== 'info') console.log('[console]', m.type(), m.text().slice(0, 300)); });
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(3000);
await page.keyboard.press('Control+j'); await sleep(150);
await page.keyboard.press('w');
await page.waitForSelector('.godmode', { timeout: 10000 });
await sleep(2500);

// une résolution pour donner une production au bot — via le BOUTON de la
// page (une 2e socket du même joueur évine celle de la page).
const avant = (await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json()).state.turn;
for (let t = 0; t < 12; t++) {
  await page.click('.fin-tour-rond');
  await page.click('text=Finir le tour quand même').catch(() => {});
  let tour = avant;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    tour = (await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json()).state.turn;
    if (tour > avant) break;
  }
  const d = await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  if (Object.values(d.state.cities).some((c) => c.owner === 'p2' && c.production)) break;
}
await sleep(3000);

const dump = await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
for (const c of Object.values(dump.state.cities)) console.log('[dump]', c.id, c.owner, c.name, 'pop', c.pop, 'prod', JSON.stringify(c.production?.item ?? null));

const sonde = await page.evaluate(() => {
  const app = window.__gameCanvas.app();
  const out = [];
  const walk = (n) => {
    if (n.getChildByLabel && n.getChildByLabel('pop')) {
      const g = (l) => { const c = n.getChildByLabel(l); return c ? { visible: c.visible, text: c.text ?? null } : null; };
      out.push({ ville: n.label, pop: g('pop'), prodCercle: g('prodCercle'), prodInitiale: g('prodInitiale'), prodEta: g('prodEta'), bandeCroissance: g('bandeCroissance') });
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return out;
});
console.log(JSON.stringify(sonde, null, 1));
await browser.close();
process.exit(0);
