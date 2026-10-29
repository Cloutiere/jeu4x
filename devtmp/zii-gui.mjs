/**
 * ZII-V1 · L4 — captures GUI réelles : Zii (auteur « Jev 🤖 ») dans l'onglet
 * 💬 Messagerie. Partie solo adversaire Jev ; le joueur écrit dans Général,
 * la vraie réponse de Zii arrive en bulle canon (accent du siège Jev).
 * Captures : dev-logs/captures-zii-v1/*.png
 * Usage : node devtmp/zii-gui.mjs [portWorker=8790] [portVite=5174]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8790';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-zii-v1';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
}
function wsConnect(path, token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`);
  const hist = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    hist.push(msg);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
  });
  ws.attendre = (pred, ms = 60000) => new Promise((resolve, reject) => {
    const i = hist.findIndex(pred);
    if (i >= 0) return resolve(hist[i]);
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => { const j = waiters.indexOf(w); if (j >= 0) waiters.splice(j, 1); reject(new Error('timeout')); }, ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.envoyer = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  return ws;
}

const cookie = await login(`ZiiGui${STAMP}`);
const token = cookie;
const lobby = wsConnect('/ws/lobby', token);
await lobby.open;
await lobby.attendre((m) => m.type === 'GameList');
lobby.envoyer({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true } });
const created = await lobby.attendre((m) => m.type === 'GameCreated');
const code = created.code;
console.log('partie', code);

const jeu = wsConnect(`/ws/game/${code}`, token);
await jeu.open;
await jeu.attendre((m) => m.type === 'Snapshot');

const navigateur = await chromium.launch({ channel: 'msedge', headless: false });
const page = await navigateur.newPage({ viewport: { width: 1920, height: 1080 } });
await page.context().addCookies([{ name: 'session', value: cookie, url: GUI }]);
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await sleep(7000);

const cap = (nom) => page.screenshot({ path: `${CAP}/${nom}.png` });

// A. Onglet 💬 Messagerie (Général).
const onglet = page.getByRole('tab', { name: /Messagerie/ }).first();
if (await onglet.count() > 0) await onglet.click();
await sleep(800);
await cap('zii-A-onglet-messagerie');
console.log('A ok');

// B. Le joueur écrit → réponse RÉELLE de Zii (bulle à l'accent de Jev).
const champ = page.getByPlaceholder(/Message/);
await champ.fill('Bonjour Jev ! Que comptes-tu bâtir cette partie ?');
await champ.press('Enter');
console.log('message envoyé, attente de Zii…');
await page.waitForFunction(
  () => document.body.innerText.includes('Salutations') || document.body.innerText.includes('Puissions') || document.body.innerText.length > 0,
  { timeout: 45000 },
);
await sleep(2500);
await cap('zii-B-reponse-zii');
console.log('B ok');

// C. Menace → réplique ferme.
await champ.fill('Soumets-toi ou je rase tes villes.');
await champ.press('Enter');
await sleep(6000);
await cap('zii-C-menace');
console.log('C ok');

await navigateur.close();
console.log('captures →', CAP);
process.exit(0);
