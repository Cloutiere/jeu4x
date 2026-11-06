/**
 * FLUIDITE-SELECTION — captures locales AVANT commit (L2, handoff 05/11).
 * Preuves 1280×720 : toggle « Cyclage auto » (D-D, barre DEV, ACTIVÉ par
 * défaut) ; touche N = cyclage manuel + caméra qui GLISSE (sonde __game.camera
 * : positions intermédiaires ≠ départ ≠ arrivée) ; ordre passif (S Sommeil) =
 * cyclage AUTOMATIQUE vers la suivante ; fin de file = désélection (inactif).
 * Le mouvement lui-même est TRANCHÉ AU LABO (Erik regarde la vitesse — L3).
 * Usage : node devtmp/fluidite-selection-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-fluidite-selection';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikFluidite${STAMP}`;
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

/** Unités p1 cyclables (la garnison de la capitale compte — sélectionnable). */
function unitesP1(etat) {
  return Object.values(etat.state.units).filter((u) => u.owner === 'p1' && !u.aboard);
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo/bots] partie ${code}`);

  // SETUP (socket WS fermé AVANT l'ouverture de la page — piège : un 2e
  // socket du même joueur évine la page) : fondation tour 1, production
  // guerrier, résolutions jusqu'à DEUX guerriers disponibles.
  const ws = wsConnect(`/ws/game/${code}`, token);
  await ws.open;
  await ws.waitFor('Welcome');
  let snap = null;
  try { snap = await ws.waitFor('Snapshot', 5000); }
  catch { ws.send({ proto: 1, type: 'ResyncRequest', lastSeq: -1 }); snap = await ws.waitFor('Snapshot'); }
  ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'FoundCity', unitId: Object.values(snap.state.units).find((u) => u.owner === 'p1').id } });
  await ws.waitFor('OrderAck');
  ws.send({ proto: 1, type: 'EndTurn' });
  await ws.waitFor('TurnResult');
  let tourVu = 1;
  let etat = null;
  for (let t = 0; t < 11 && tourVu <= 11; t++) {
    await sleep(1500);
    const dump = await dumpFull(code);
    etat = { state: dump.state };
    tourVu = dump.state.turn;
    const nb = unitesP1(etat).length;
    console.log(`[setup] tour ${tourVu} — ${nb} unité(s) p1`);
    if (nb >= 2) break;
    const ville = Object.values(etat.state.cities).find((c) => c.owner === 'p1');
    if (ville && !ville.production) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } });
      await ws.waitFor('OrderAck');
    }
    ws.send({ proto: 1, type: 'EndTurn' });
    await ws.waitFor('TurnResult').catch(() => null);
  }
  ws.close();
  const unites = unitesP1(etat);
  if (unites.length < 2) throw new Error(`setup incomplet : ${unites.length} unité(s) seulement`);
  console.log(`[setup] prêt — ${unites.length} unités en ${unites.map((u) => `(${u.q},${u.r})`).join(' ')}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);

  // Barre DEV ouverte + toggle « Cyclage auto » ACTIVÉ par défaut (D-D)
  const visible = await page.locator('.bar-dev').isVisible().catch(() => false);
  if (!visible) await page.click('.engrenage');
  await sleep(500);
  const toggle = page.locator('.bar-dev button', { hasText: 'Cyclage auto' });
  if (!(await toggle.isVisible())) throw new Error('toggle Cyclage auto invisible');
  const etatActif = await toggle.evaluate((el) => el.classList.contains('active-toggle'));
  if (!etatActif) throw new Error('cyclage auto pas ACTIVÉ par défaut (D-D)');
  await page.screenshot({ path: `${CAP}/1-toggle-actif-defaut.png` });

  // Toggle : désactivé puis réactivé (réversible)
  await toggle.click();
  await sleep(300);
  if (await toggle.evaluate((el) => el.classList.contains('active-toggle'))) throw new Error('toggle non désactivé');
  await page.screenshot({ path: `${CAP}/2-toggle-desactive.png` });
  await toggle.click();
  await sleep(300);
  if (!(await toggle.evaluate((el) => el.classList.contains('active-toggle')))) throw new Error('toggle non réactivé');
  console.log('[D-D] toggle Cyclage auto : ACTIVÉ par défaut, réversible');

  // D-C — touche N : sélection du guerrier A puis cyclage manuel vers B,
  // caméra qui GLISSE (3 échantillons caméra : départ ≠ intermédiaire ≠ arrivée).
  const [a, b] = unites;
  await page.evaluate(([qq, rr]) => window.__game.clickHex(qq, rr), [a.q, a.r]);
  await sleep(400);
  async function cam() { return await page.evaluate(() => window.__game.camera()); }
  await sleep(600);
  const c0 = await cam();
  await page.keyboard.press('n');
  const c1 = await cam(); // ~0 ms après : à peine parti
  await sleep(150);
  const c2 = await cam(); // milieu de glissement
  await sleep(700);
  const c3 = await cam(); // arrivée
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  console.log('[N] caméra départ', c0, '→ +0ms', c1, '→ +150ms', c2, '→ +850ms', c3);
  if (dist(c0, c3) < 1) console.log('[N] caméra déjà centrée sur la cible (unités proches) — glissement non démontrable ici');
  else {
    // Glissement : la caméra PROGRESSE (+0ms ≈ départ, +150ms intermédiaire,
    // arrivée au-delà — interpolation monotone, jamais un saut sec).
    if (dist(c2, c0) > dist(c1, c0) && dist(c3, c0) > dist(c2, c0)) console.log('[GLISSE] progression monotone 0ms → 150ms → arrivée OK');
    else throw new Error(`caméra sautée d un coup ? ${JSON.stringify({ c0, c1, c2, c3 })}`);
  }
  await page.screenshot({ path: `${CAP}/3-cyclage-N-unite-suivante.png` });

  // D-B — ordre passif (S = Sommeil) sur l'unité sélectionnée → cyclage AUTO
  // (toggle actif). Sélectionner A explicitement puis S : la sélection doit
  // basculer seule vers B (et la caméra glisser).
  await page.evaluate(([qq, rr]) => window.__game.clickHex(qq, rr), [a.q, a.r]);
  await sleep(400);
  const cA = await cam();
  await page.keyboard.press('s');
  await sleep(120);
  const cAuto1 = await cam();
  await sleep(900);
  const cAuto2 = await cam();
  console.log('[AUTO] caméra avant S', cA, '→ +120ms', cAuto1, '→ fin', cAuto2);
  await page.screenshot({ path: `${CAP}/4-ordre-passif-cyclage-auto.png` });
  // B n'a pas d'ordre : le panneau unité doit être PEUPLED (pas le hint vide).
  const hint = await page.locator('.panel .hint', { hasText: 'Cliquez sur une unité' }).isVisible().catch(() => false);
  if (hint) throw new Error('après ordre passif : aucune unité sélectionnée (cyclage auto inopérant)');

  // Fin de file : S sur la dernière unité → désélection (retour inactif).
  await page.keyboard.press('s');
  await sleep(900);
  const vide = await page.locator('.panel .hint', { hasText: 'Cliquez sur une unité' }).isVisible().catch(() => false);
  if (!vide) throw new Error('fin de file : la sélection ne retombe pas à inactif');
  console.log('[D-B] fin de file → inactif OK');
  await page.screenshot({ path: `${CAP}/5-fin-de-file-inactif.png` });

  await browser.close();
  console.log(`[OK] captures dans ${CAP} — partie ${code}`);
} finally {
  if (wrangler) { try { wrangler.kill(); } catch {} }
}
