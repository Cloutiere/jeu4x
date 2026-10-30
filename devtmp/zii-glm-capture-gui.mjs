/**
 * ZII-GLM-VOIX · L3 — capture GUI : bulle de Zii GÉNÉRÉE par GLM dans la
 * Messagerie (navigateur réel). Usage : node devtmp/zii-glm-capture-gui.mjs <portWorker=8798>
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORT = process.argv[2] ?? '8798';
const BASE = `http://127.0.0.1:${PORT}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-zii-glm';
fs.mkdirSync(CAP, { recursive: true });
const STAMP = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  ws.attendre = (pred, ms = 40000) => new Promise((resolve, reject) => {
    const f = hist.find(pred);
    if (f) return resolve(f);
    waiters.push({ pred, resolve });
    setTimeout(() => reject(new Error('timeout')), ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.hist = hist;
  const orig = ws.send.bind(ws);
  ws.envoi = (m) => orig(JSON.stringify(m));
  return ws;
}

const token = await login(`ZiiGui${STAMP}`);
const lobby = wsConnect('/ws/lobby', token);
await lobby.open;
await lobby.attendre((m) => m.type === 'GameList');
lobby.envoi({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true } });
const created = await lobby.attendre((m) => m.type === 'GameCreated');
const code = created.code;
console.log('partie', code);
const sock = wsConnect(`/ws/game/${code}`, token);
await sock.open;
await sock.attendre((m) => m.type === 'Snapshot');
sock.envoi({ proto: 1, type: 'ChatSend', canal: 'general', texte: 'Bonjour Zii ! Votre empire semble prospère — que souhaitez-vous de cette partie ?' });
// attendre la RÉPONSE RÉELLE de Zii (génération GLM 5-10 s) avant la capture
let bulleZii = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const recus = sock.hist.filter((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1' && !/Salutations à tous/.test(m.message.texte));
  if (recus.length > 0) { bulleZii = recus; break; }
}
console.log('réponse Zii reçue :', bulleZii ? bulleZii.map((m) => m.message.texte).join(' | ') : 'AUCUNE');
await sleep(2000);

const navigateur = await chromium.launch({ channel: 'msedge', headless: false });
const page = await navigateur.newPage({ viewport: { width: 1920, height: 1080 } });
await page.context().addCookies([{ name: 'session', value: token, url: 'http://localhost:5174' }]);
await page.goto(`http://localhost:5174/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await sleep(6000);
try {
  await page.getByRole('tab', { name: /Messagerie/ }).click({ timeout: 8000 });
} catch {
  // diagnostic : on capture l'état réel de la page
  await page.screenshot({ path: `${CAP}/GUI-diagnostic.png` });
  console.log('URL page :', page.url());
  const tabs = await page.locator('[role=tab]').allTextContents();
  console.log('onglets :', JSON.stringify(tabs));
}
await sleep(800);
await page.screenshot({ path: `${CAP}/GUI-bulle-zii-glm.png` });
console.log('capture OK');
await navigateur.close();
sock.close();
lobby.close();
