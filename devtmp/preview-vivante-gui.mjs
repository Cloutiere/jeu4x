/**
 * PREVIEW-VIVANTE — vérification GUI réelle (L3, handoff 19/10, D1-D5).
 * Scénario : guerrier sélectionné → survol multi-tours (préview complète +
 * badges) → survol tuile inconnue (troncature fog) → couture → désélection =
 * disparition → 60 FPS au mouvement continu du curseur.
 * Captures dev-logs/captures-preview-vivante/. Ports dédiés (leçon wrangler).
 * Usage : node devtmp/preview-vivante-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8796';
const PORTG = process.argv[3] ?? '5190';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-preview-vivante';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
console.log('[preview-vivante] début');
process.on('exit', (c) => console.log(`[exit] code=${c}`));
process.on('uncaughtException', (e) => console.log('[uncaught]', e));
process.on('unhandledRejection', (e) => console.log('[unhandledRejection]', e));

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
    if (msg.type === 'OrderAck' && msg.accepted === false) console.log('  [refus]', msg.reason);
    if (msg.type === 'Error') console.log('  [erreur]', msg.code, msg.message);
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
let wrangler = null;
function tuerPort(P) {
  const { execSync } = require('node:child_process');
  try {
    const out = execSync(`netstat -ano | findstr ":${P} .*LISTENING"`, { shell: true }).toString();
    const pids = [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
  } catch {}
}
async function demarrerWrangler(force = false) {
  console.log('[wrangler] health check...');
  if (!force && !wrangler) {
    try {
      const r = await fetch(`${BASE}/admin/health`, { signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      if (r && r.status < 500) { console.log('[wrangler] adopté (déjà en place)'); return; }
    } catch (e) { console.log('[wrangler] health KO:', String(e).slice(0, 120)); }
  }
  if (wrangler) {
    try { require('node:child_process').execSync(`taskkill /F /T /PID ${wrangler.pid}`, { stdio: 'ignore' }); } catch {}
    try { wrangler.kill(); } catch {}
  }
  tuerPort(PORTW);
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server', shell: true, stdio: 'ignore',
  });
  console.log(`[wrangler] spawn pid=${wrangler.pid}`);
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) }); console.log(`[wrangler] prêt en ${i + 1}s`); return; } catch {}
  }
  throw new Error('wrangler ne redémarre pas');
}
let g = null;
let tokenGlobal = null;
async function dumpFull(codeJeu) {
  for (let essai = 0; essai < 6; essai++) {
    try {
      const res = await fetch(`${BASE}/admin/game/${codeJeu}`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      return await res.json();
    } catch (e) {
      console.log(`[wrangler] figé (${e.message}) — redémarrage`);
      await demarrerWrangler(true);
      if (g) {
        try { g.close(); } catch {}
        g = wsConnect(`/ws/game/${codeJeu}`, tokenGlobal);
        await g.open;
        await g.waitFor('Welcome');
      }
    }
  }
  throw new Error('dump impossible après redémarrages');
}
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, civId: 'france' } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g2, order) => g2.send({ proto: 1, type: 'SubmitOrder', order });
const mesVillesDe = (st) => Object.values(st.cities).filter((c) => c.owner === MOI);
async function assurerSocket(codeJeu) {
  if (g && g.readyState === 1) return;
  try { g?.close(); } catch {}
  g = wsConnect(`/ws/game/${codeJeu}`, tokenGlobal);
  await g.open;
  await g.waitFor('Welcome');
}
async function finirTourSimple(codeJeu, reposProduction = null) {
  for (let essai = 0; essai < 6; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket(codeJeu);
    if (!stv.players[MOI].researching) {
      const connue = new Set(stv.players[MOI].techsUnlocked);
      const eligibles = Object.entries(TECHS_DATA)
        .filter(([k, t]) => !connue.has(k) && (t.prereqs ?? []).every((pr) => connue.has(pr)))
        .sort((a, b) => a[1].cost - b[1].cost)
        .map(([k]) => k);
      if (eligibles.length > 0) {
        g.send({ proto: 1, type: 'SetResearch', techId: eligibles[0] });
        await sleep(600);
      }
    }
    if (reposProduction) {
      for (const v of mesVillesDe(stv)) {
        if (!v.production && (v.queue ?? []).length === 0) {
          ordre(g, { type: 'SetProduction', cityId: v.id, item: reposProduction });
          await sleep(400);
        }
      }
    }
    g.send({ proto: 1, type: 'EndTurn' });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(codeJeu)).state.turn > avant) return true;
    }
    if (essai >= 2) { console.log('  [finirTour] redémarrage wrangler forcé'); await demarrerWrangler(true); await assurerSocket(codeJeu); }
  }
  return false;
}
async function ouvrirPage(ctx, code, token) {
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  return page;
}
async function recentrer(page, hex) {
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: hex.q, r: hex.r });
  await sleep(900);
}
async function clicCase(page, hex) {
  const p = await page.evaluate((h) => window.__gameCanvas.hexToPage(h), { q: hex.q, r: hex.r });
  if (!p) throw new Error('hexToPage null');
  await page.mouse.click(p.x, p.y);
  await sleep(700);
}
async function capture(page, nom) {
  await page.screenshot({ path: `${CAP}/${nom}.png` });
  console.log(`  [capture] ${nom}.png`);
}
/** Contenu de la couche flèche (flecheCouche, zIndex -95), comptage récursif.
 *  ⚠ Pixi v8 : les classes s'appellent _Graphics/_Text (jamais préfixer le
 *  nom exact — leçon de la première passe, faux négatif 'Graphics'). */
async function etatFleche(page) {
  return page.evaluate(() => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const fleche = ents.children.find((k) => k.zIndex === -95);
    if (!fleche) return { conteneurs: -1, graphiques: 0, textes: 0 };
    let graphiques = 0;
    let textes = 0;
    const walk = (c, d) => {
      const t = c.constructor.name;
      if (t.endsWith('Graphics')) graphiques += 1;
      else if (t.endsWith('Text')) textes += 1;
      if (d > 0) for (const k of c.children) walk(k, d - 1);
    };
    for (const cont of fleche.children) walk(cont, 3);
    return { conteneurs: fleche.children.length, graphiques, textes };
  });
}
async function survole(page, hex) {
  const p = await page.evaluate((h) => window.__gameCanvas.hexToPage(h), { q: hex.q, r: hex.r });
  if (!p) throw new Error('hexToPage null');
  await page.mouse.move(p.x - 60, p.y - 40);
  await sleep(80);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await sleep(350); // ≥ une frame rAF (throttle D4)
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikPreview${STAMP}`);
tokenGlobal = token;

let echecs = [];
const assert = (ok, label) => {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  🔴 ${label}`); echecs.push(label); }
};

let code = null;
let cap = null;
for (let tentative = 1; tentative <= 8 && !cap; tentative++) {
  code = await creerPartie(token);
  console.log(`[partie ${tentative}] ${code}`);
  g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
  const st = (await dumpFull(code)).state;
  const colon = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
  if (!colon) continue;
  ordre(g, { type: 'FoundCity', unitId: colon.id });
  await finirTourSimple(code, { kind: 'unit', id: 'guerrier' });
  const st2 = (await dumpFull(code)).state;
  cap = mesVillesDe(st2)[0];
  if (!cap) { console.log('  🔶 fondation ratée — partie suivante'); continue; }
  await assurerSocket(code);
  g.send({ proto: 1, type: 'SetConversion', cityId: cap.id, target: 'science' });
  console.log(`[fondation] t${st2.turn} capitale ${cap.id} (${cap.q},${cap.r})`);
}
if (!cap) { console.log('🔴 aucune fondation possible'); process.exit(1); }

const page = await ouvrirPage(ctx, code, token);
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });

// Trouver un guerrier ami HORS ville (évite la sélection garnison + flèches posées).
const stBase = (await dumpFull(code)).state;
let guerrier = Object.values(stBase.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
if (!guerrier) {
  console.log('[setup] guerrier seulement en ville — production d’un second');
  await finirTourSimple(code, { kind: 'unit', id: 'guerrier' });
  const st2 = (await dumpFull(code)).state;
  guerrier = Object.values(st2.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
}
if (!guerrier) { console.log('🔴 aucun guerrier'); process.exit(1); }
console.log(`[guerrier] ${guerrier.id} (${guerrier.q},${guerrier.r}) t${(await dumpFull(code)).state.turn}`);

// Si le guerrier est SUR la capitale, sélection garnison — acceptable (D1 :
// toute unité amie sélectionnée). On sélectionne par clic sur sa case.
await recentrer(page, guerrier);
const avant = await etatFleche(page);
await clicCase(page, guerrier);
const sel = await page.evaluate(() => window.__gameCanvas.stats.ui.selectedUnitId);
assert(!!sel, `a1 sélection du guerrier (selectedUnitId=${sel})`);

// ---- t1 : survol multi-tours — préview complète + badges ----------------------
{
  // Cases PROCHEES (zoom ×1,75 : 5 cases à l'est = hors viewport — leçon de
  // la première passe). PM 1 = 1 case/tour : 2 cases → badges (1) ET (2).
  const cibles = [
    { q: guerrier.q + 2, r: guerrier.r },
    { q: guerrier.q + 1, r: guerrier.r },
    { q: guerrier.q + 1, r: guerrier.r + 1 },
    { q: guerrier.q, r: guerrier.r + 2 },
    { q: guerrier.q - 1, r: guerrier.r + 1 },
  ];
  let ok = false;
  for (const c of cibles) {
    await survole(page, c);
    const e = await etatFleche(page);
    if (e.graphiques >= 2) { ok = true; break; } // anneau destination + tracé
  }
  assert(ok, 'a2 survol multi-tours → préview complète dessinée (couche flèche)');
  const e = await etatFleche(page);
  assert(e.textes >= 1, `a3 badge(s) de tour présent(s) (textes=${e.textes})`);
  await capture(page, '1-survol-multitours');
}

// ---- t2 : survol tuile inconnue — troncature fog (R-161) ----------------------
{
  // Caméra sur l'UNITÉ, survol d'une tuile AU BORD du fog (3 cases à l'ouest) :
  // la préview s'arrête après la première case inconnue (un pas dans l'inconnu).
  await recentrer(page, guerrier);
  const W = stBase.mapWidth;
  for (const c of [
    { q: (guerrier.q - 3 + W) % W, r: guerrier.r - 1 },
    { q: (guerrier.q - 3 + W) % W, r: guerrier.r },
    { q: (guerrier.q + 3) % W, r: guerrier.r - 1 },
  ]) {
    await survole(page, c);
    const e = await etatFleche(page);
    if (e.graphiques >= 2) break;
  }
  await capture(page, '2-survol-fog');
  console.log('  🔶 capture fog — troncature à l’œil');
}

// ---- t3 : désélection = disparition -------------------------------------------
{
  await recentrer(page, guerrier); // t2 a laissé la caméra dans la brume
  const avantSel = await page.evaluate(() => window.__gameCanvas.stats.ui.selectedUnitId);
  // Désélection : clic sur une case vide voisine (le re-clic sur l'unité
  // elle-même la re-sélectionne — alternance de pile, comportement voulu).
  await clicCase(page, { q: guerrier.q, r: guerrier.r + 1 });
  const apresSel = await page.evaluate(() => window.__gameCanvas.stats.ui.selectedUnitId);
  assert(apresSel === null && avantSel !== null, `a4 désélection (sel=${apresSel})`);
  await survole(page, { q: guerrier.q + 1, r: guerrier.r });
  const e = await etatFleche(page);
  assert(e.graphiques === 0 && e.textes === 0, `a5 préview disparue après désélection (graphiques=${e.graphiques}, textes=${e.textes})`);
  await capture(page, '3-deselection-disparition');
}

// ---- t4 : 60 FPS au mouvement continu du curseur -------------------------------
{
  await clicCase(page, guerrier); // re-sélection
  await page.evaluate(() => {
    window.__frames = 0;
    const tick = () => { window.__frames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const dep = await page.evaluate((h) => window.__gameCanvas.hexToPage(h), { q: guerrier.q, r: guerrier.r });
  const arr = await page.evaluate((h) => window.__gameCanvas.hexToPage(h), { q: guerrier.q + 2, r: guerrier.r + 1 });
  const t0 = Date.now();
  for (let i = 0; i <= 60; i++) {
    const x = dep.x + ((arr.x - dep.x) * i) / 60;
    const y = dep.y + ((arr.y - dep.y) * i) / 60;
    await page.mouse.move(x, y);
    await sleep(16);
  }
  const dt = (Date.now() - t0) / 1000;
  const frames = await page.evaluate(() => window.__frames);
  const fps = frames / dt;
  assert(fps >= 45, `a6 FPS au mouvement continu (≈${fps.toFixed(0)} FPS sur ${dt.toFixed(1)}s)`);
}

// ---- t5 : couture (🔶 capture à l'œil) ------------------------------------------
{
  const stNow = (await dumpFull(code)).state;
  const W = stNow.mapWidth;
  const bordOuest = { q: (guerrier.q - 6 + W) % W, r: guerrier.r + 1 };
  await recentrer(page, bordOuest);
  await survole(page, { q: (bordOuest.q - 2 + W) % W, r: bordOuest.r });
  await capture(page, '4-survol-couture');
  console.log('  🔶 capture couture à l’œil');
}

await browser.close();
console.log(echecs.length === 0 ? '[OK] tous les asserts verts' : `[ÉCHEC] ${echecs.length} assert(s) : ${echecs.join(' | ')}`);
process.exit(echecs.length === 0 ? 0 : 1);
