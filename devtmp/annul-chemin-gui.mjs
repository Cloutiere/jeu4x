/**
 * ANNUL-CHEMIN — vérification GUI réelle (L3, handoff 24/10).
 * Scénario d'Erik : le guerrier reçoit un chemin 2 cases (clic droit, chemin
 * complet soumis) → fin de tour → 1 PM consommé, le reste du chemin est GELÉ
 * → le panneau unité montre « Chemin gelé : Move » ET le bouton « Annuler le
 * chemin » (capture AVANT) → clic → unité libre, ordre effacé (capture APRÈS).
 * Captures : dev-logs/captures-annul-chemin/.
 * Usage : node devtmp/annul-chemin-gui.mjs [portWorker] [portVite]
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
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-annul-chemin';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikAnnul${STAMP}`;
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

// Vite de dev : port dédié (l'instance 5174 d'Erik ne doit pas être touchée —
// on la réutilise si elle est déjà en vie).
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

/** Trouve une case à distance 2 praticable en ligne depuis l'unité (dump). */
function cibleADistance2(dump, unit) {
  const blockers = ['eau', 'ocean', 'montagne', 'ville'];
  for (const dq of [-2, -1, 0, 1, 2]) {
    for (const dr of [-2, -1, 0, 1, 2]) {
      if (Math.abs(dq) + Math.abs(dr) !== 2) continue;
      const tile = dump.state.map[`${unit.q + dq},${unit.r + dr}`];
      if (tile && !blockers.includes(tile.terrain)) return { q: unit.q + dq, r: unit.r + dr };
    }
  }
  return null;
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo] partie ${code}`);
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

  // Position réelle du guerrier (après résolution t0→t1 éventuelle)
  dump = await dumpFull(code);
  const unit = dump.state.units.u1;
  if (!unit) throw new Error('u1 introuvable');
  const cible = cibleADistance2(dump, unit);
  if (!cible) throw new Error('aucune case à distance 2 praticable autour de u1');
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), cible);
  await sleep(1500);

  // Sélection du guerrier (clic gauche sur sa case)
  await page.evaluate((h) => window.__game.clickHex(h.q, h.r), { q: unit.q, r: unit.r });
  await sleep(800);

  // Clic droit sur la case à distance 2 → chemin complet soumis (2 cases)
  const pos = await page.evaluate((h) => window.__gameCanvas.hexToPage(h), cible);
  if (!pos) throw new Error('cible hors écran');
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await sleep(1000);
  dump = await dumpFull(code);
  const ordre = (dump.orders.p1 ?? []).find((o) => o.unitId === 'u1');
  if (!ordre || !ordre.path || ordre.path.length !== 2) throw new Error(`chemin 2 cases non soumis : ${JSON.stringify(dump.orders.p1)}`);
  console.log('[ordre] chemin 2 cases soumis :', JSON.stringify(ordre.path));

  // Fin du tour PAR L'UI (piège : une 2e socket évine la page)
  await page.click('.fin-tour-rond');
  await page.click('text=Finir le tour quand même').catch(() => {});
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if ((await dumpFull(code)).state.turn > dump.state.turn) break;
  }
  dump = await dumpFull(code);
  const gele = dump.state.units.u1.order;
  if (!gele || gele.type !== 'Move' || gele.path.length !== 1) throw new Error(`chemin gelé attendu (1 case restante), obtenu : ${JSON.stringify(gele)}`);
  console.log('[gel] chemin gelé confirmé :', JSON.stringify(gele.path));

  // Sélection du guerrier sur sa nouvelle case → panneau avec chemin gelé.
  // La page reçoit le TurnResult après le dump : on attend que SON état
  // montre l'unité sur sa nouvelle case avant de cliquer (sinon clic dans le
  // vide), puis on reboucle la sélection.
  const u2 = dump.state.units.u1;
  // L'unité programmée est DESSINÉE (et sélectionnable) sur sa case d'arrêt
  // affichée — pas sa case moteur (PILE-AFFICHÉE, retour Erik 17/09) : on
  // clique là où la scène la dessine réellement (sonde debug).
  let dessin = null;
  for (let i = 0; i < 10 && !dessin; i++) {
    await sleep(1000);
    dessin = await page.evaluate(() => {
      try { return window.__game.sondePile().positions['u1'] ?? null; } catch { return null; }
    });
  }
  if (!dessin) throw new Error('u1 non dessinée (sonde vide)');
  console.log('[dessin] u1 dessinée à', JSON.stringify(dessin));
  await page.evaluate((h) => window.__game.centerOn(h.q, h.r), dessin);
  await sleep(1500);
  let selectionne = false;
  for (let i = 0; i < 5 && !selectionne; i++) {
    await page.evaluate((h) => window.__game.clickHex(h.q, h.r), dessin);
    selectionne = await page.waitForSelector('text=Tenir la position', { timeout: 4000 }).then(() => true).catch(() => false);
  }
  if (!selectionne) throw new Error('guerrier non sélectionnable (panneau absent)');
  await page.waitForSelector('text=Chemin gelé : Move', { timeout: 10000 });
  await page.waitForSelector('button:has-text("Annuler le chemin")', { timeout: 10000 });
  console.log('[panneau] « Chemin gelé : Move » + bouton « Annuler le chemin » visibles');
  const panel = page.locator('section.panel', { hasText: 'Tenir la position' }).first();
  await page.screenshot({ path: `${CAP}/avant-chemin-gele.png`, clip: await panel.boundingBox().then((b) => b ?? undefined) });
  await page.screenshot({ path: `${CAP}/avant-complet.png` });
  console.log('[capture] avant-chemin-gele (panneau) + avant-complet (flèche visible)');

  // Clic sur « Annuler le chemin » → l'unité redevient libre
  await page.click('button:has-text("Annuler le chemin")');
  await page.waitForSelector('text=Chemin gelé : Move', { state: 'detached', timeout: 10000 });
  await page.waitForSelector('button:has-text("Annuler le chemin")', { state: 'detached', timeout: 10000 });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    dump = await dumpFull(code);
    if (!dump.state.units.u1.order) break;
  }
  if (dump.state.units.u1.order) throw new Error(`ordre toujours présent côté serveur : ${JSON.stringify(dump.state.units.u1.order)}`);
  console.log('[annul] ordre effacé côté serveur, panneau net');
  const panel2 = page.locator('section.panel', { hasText: 'Tenir la position' }).first();
  await page.screenshot({ path: `${CAP}/apres-annulation.png`, clip: await panel2.boundingBox().then((b) => b ?? undefined) });
  await page.screenshot({ path: `${CAP}/apres-complet.png` });
  console.log('[capture] apres-annulation (panneau) + apres-complet (flèche disparue)');

  await browser.close();
  console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
