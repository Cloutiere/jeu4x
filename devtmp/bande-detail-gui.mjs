/**
 * BANDE-DETAIL — vérification GUI réelle (L4, handoff 07/10).
 * Capitale fondée sur place (pas de couture, pas d'ennemi — L4 : survol
 * croissance finie, croissance stagnante ±0, production unité puis
 * bâtiment, lisible au zoom par défaut + anti-clic D5).
 * Captures dev-logs/captures-bande-detail/.
 * Usage : node devtmp/bande-detail-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bande-detail';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));

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
    execSync('powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Erik/ZCodeProject/devtmp/tue-wrangler.ps1', { stdio: 'ignore', timeout: 60000 });
  } catch {}
  try {
    const out = execSync(`netstat -ano | findstr ":${P} .*LISTENING"`, { shell: true }).toString();
    const pids = [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
  } catch {}
}
async function demarrerWrangler(force = false) {
  if (!force && !wrangler) {
    try {
      const r = await fetch(`${BASE}/admin/health`, { signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      if (r && r.status < 500) { console.log('[wrangler] adopté (déjà en place)'); return; }
    } catch {}
  }
  if (wrangler) {
    try { require('node:child_process').execSync(`taskkill /F /T /PID ${wrangler.pid}`, { stdio: 'ignore' }); } catch {}
    try { wrangler.kill(); } catch {}
  }
  tuerPort(PORTW);
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server', shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) }); return; } catch {}
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
async function tourJusqua(codeJeu, condition, maxTours = 40, label = '', reposProduction = null) {
  for (let i = 0; i < maxTours; i++) {
    const st = (await dumpFull(codeJeu)).state;
    if (condition(st)) return st;
    if (!(await finirTourSimple(codeJeu, reposProduction))) throw new Error(`tour non avancé (${label})`);
  }
  throw new Error(`condition non remplie en ${maxTours} tours (${label})`);
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
/** Point PAGE du centre d'une zone locale (x, y) du conteneur bannière. */
async function pointZone(page, cityId, lx, ly) {
  return page.evaluate(([cid, X, Y]) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const tous = ents.children.filter((k) => k.label === cid);
    const c = tous.find((k) => k.children.some((x) => x.label === 'bandeNom'));
    if (!c) return null;
    const rect = app.canvas.getBoundingClientRect();
    const gp = c.getGlobalPosition();
    const wt = c.worldTransform;
    return { x: rect.left + gp.x + X * wt.a, y: rect.top + gp.y + Y * wt.d };
  }, [cityId, lx, ly]);
}
async function tipTexte(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.bande-tip');
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  });
}
async function survoler(page, pt) {
  await page.mouse.move(pt.x, pt.y);
  await sleep(600); // pointermove + rendu Svelte
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikDetail${STAMP}`);
tokenGlobal = token;

let echecs = [];
const assert = (ok, label) => {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  🔴 ${label}`); echecs.push(label); }
};
// Constantes locales des zones (bande-ville.ts — D5) : croissance = drapeau
// (40,−62) ; production = drapeau tours (63,−62).
const Z_CROISSANCE = [40, -62];
const Z_PROD = [63, -62];

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
  // Garnison impossible avant la ville : fondation SUR PLACE (la case de
  // départ du colon est toujours fondable — R-1).
  ordre(g, { type: 'FoundCity', unitId: colon.id });
  await finirTourSimple(code, { kind: 'unit', id: 'guerrier' });
  const st2 = (await dumpFull(code)).state;
  cap = mesVillesDe(st2)[0];
  if (!cap) { console.log('  🔶 fondation ratée — partie suivante'); continue; }
  // R-90 : la science ne coule qu'en conversion science (piège connu).
  await assurerSocket(code);
  g.send({ proto: 1, type: 'SetConversion', cityId: cap.id, target: 'science' });
  console.log(`[fondation] t${st2.turn} capitale ${cap.id} (${cap.q},${cap.r})`);
}
if (!cap) { console.log('🔴 aucune fondation possible'); process.exit(1); }

const page = await ouvrirPage(ctx, code, token);
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
await sleep(1500);

// ---- t1 : croissance FINIE (pop ≥ 2, tuiles nourriture auto) ----------------
{
  await tourJusqua(code, (s) => s.cities[cap.id].pop >= 2, 30, 'pop 2', { kind: 'unit', id: 'guerrier' });
  // Garnison immédiate (les barbares rasent une ville sans garnison).
  const stG = (await dumpFull(code)).state;
  const garnison = Object.values(stG.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && u.q === cap.q && u.r === cap.r);
  if (garnison) { await assurerSocket(code); ordre(g, { type: 'Fortify', unitId: garnison.id }); }
  const pt = await pointZone(page, cap.id, Z_CROISSANCE[0], Z_CROISSANCE[1]);
  assert(!!pt, 't1 — point de zone croissance calculé');
  await survoler(page, pt);
  const t = await tipTexte(page);
  console.log(`[t1] tooltip : ${JSON.stringify(t)}`);
  assert(!!t && t.includes('nourriture'), 'D1 — « N / M fioles » visible au survol');
  assert(!!t && /Récolte \d+ − Consommation 0 = \+\d+ nourriture\/tour/.test(t), 'D1 — ligne de calcul nommée (récolte − consommation)');
  assert(!!t && t.includes('Nouveau citoyen dans'), 'D1 — « Nouveau citoyen dans N tours »');
  await page.screenshot({ path: `${CAP}/t1-survol-croissance.png` });
  await page.mouse.move(10, 10);
  await sleep(400);
  assert((await tipTexte(page)) === null, "D5 — l'infobulle disparaît à la sortie");
}

// ---- t2 : croissance STAGNANTE ±0 — tous les citoyens RETIRÉS des tuiles
// (case ville 0 nourriture, intérieurs production) → surplus 0 → « ∞ » ------
{
  const st = (await dumpFull(code)).state;
  const v = st.cities[cap.id];
  const nb = (v.workedTiles ?? []).length;
  if (nb > 0) {
    await assurerSocket(code);
    for (let i = 0; i < nb; i++) {
      ordre(g, { type: 'SetWorkedTile', cityId: cap.id, tile: null }); // null retire le DERNIER assigné
      await sleep(400);
    }
    await tourJusqua(code, (s2) => (s2.cities[cap.id].workedTiles ?? []).length === 0, 20, 'retrait des citoyens');
  }
  console.log(`[t2] worked vidé — worked : ${JSON.stringify((await dumpFull(code)).state.cities[cap.id].workedTiles ?? [])}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
  await sleep(1200);
  const pt = await pointZone(page, cap.id, Z_CROISSANCE[0], Z_CROISSANCE[1]);
  await survoler(page, pt);
  const t = await tipTexte(page);
  console.log(`[t2] tooltip : ${JSON.stringify(t)}`);
  assert(!!t && t.includes('±0 nourriture/tour'), 't2 — surplus nul affiché « ±0 »');
  assert(!!t && t.includes('Jamais tant que'), 't2 — stagnante : « Jamais tant que les citoyens ne nourrissent pas »');
  await page.screenshot({ path: `${CAP}/t2-survol-croissance-stagnante.png` });
  await page.mouse.move(10, 10);
}

// ---- t2b : réaffectation des citoyens sur des tuiles PRODUCTIVES -------------
// R-63 rév. Erik 10/10 : les intérieurs ne produisent plus — pour l'ETA,
// les citoyens doivent retravailler des tuiles (forêt/colline).
{
  const st = (await dumpFull(code)).state;
  const v = st.cities[cap.id];
  const voisines = [];
  for (let dq = -1; dq <= 1; dq++) {
    for (let dr = Math.max(-1, -dq - 1); dr <= Math.min(1, -dq + 1); dr++) {
      if (dq === 0 && dr === 0) continue;
      const k = `${v.q + dq},${v.r + dr}`;
      const tu = st.map[k];
      if (!tu || tu.terrain === 'eau' || tu.terrain === 'ocean' || tu.terrain === 'montagne') continue;
      voisines.push(k);
    }
  }
  const TECHS_D = null;
  // tuiles productives d'abord (terrain avec production > 0 via une table
  // embarquée : forêt 2, colline 1 — les autres tuiles de terre = 0)
  const PRODUCTIFS = new Set(['foret', 'colline']);
  voisines.sort((a, b) => Number(PRODUCTIFS.has(st.map[b].terrain)) - Number(PRODUCTIFS.has(st.map[a].terrain)));
  const nb = Math.min(v.pop, voisines.length);
  await assurerSocket(code);
  for (let i = 0; i < nb; i++) {
    ordre(g, { type: 'SetWorkedTile', cityId: cap.id, tile: voisines[i] });
    await sleep(400);
  }
  const stR = await tourJusqua(code, (s2) => (s2.cities[cap.id].workedTiles ?? []).length >= nb, 20, 'réaffectation');
  console.log(`[t2b] ${nb} citoyens réaffectés — worked : ${JSON.stringify(stR.cities[cap.id].workedTiles)}`);
  if (nb === 0) { console.log('  🔶 aucune tuile de terre voisine — ETA impossible 🔶'); echecs.push('t2b:aucune-tuile'); }
}

// ---- t3 : production UNITÉ en tête (Guerrier) --------------------------------
{
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
  const stP = await tourJusqua(code, (s) => s.cities[cap.id].production?.item?.id === 'guerrier', 20, 'guerrier en tête', { kind: 'unit', id: 'guerrier' });
  console.log(`[t3] t${stP.turn} guerrier en tête`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
  await sleep(1200);
  const pt = await pointZone(page, cap.id, Z_PROD[0], Z_PROD[1]);
  await survoler(page, pt);
  const t = await tipTexte(page);
  console.log(`[t3] tooltip : ${JSON.stringify(t)}`);
  assert(!!t && t.includes('Guerrier'), 'D2 — nom de l\'item (Guerrier)');
  assert(!!t && /Coût : \d+ marteaux \(déjà \d+\)/.test(t), 'D2 — coût total avec progression');
  assert(!!t && /Marteaux : \d+\/tour \(\d+ des tuiles/.test(t), 'D2 — marteaux/tour avec détail nommé (tuiles × bonus citoyens)');
  assert(!!t && /Multiplicateur bonus citoyen : [\d,]+ = 1 \+ \d+ citoyen[s]? non affecté[s]? × 0,25/.test(t), 'D2 — détail du multiplicateur bonus citoyen (rév. Erik 10/10)');
  assert(!!t && /Achèvement dans \d+ tours?/.test(t), 'D2 — « Achèvement dans N tours »');
  await page.screenshot({ path: `${CAP}/t3-survol-production-unite.png` });
  await page.mouse.move(10, 10);
}

// ---- t4 : production BÂTIMENT en tête (Grenier, agriculture) -----------------
{
  const st = (await dumpFull(code)).state;
  if (!st.players[MOI].techsUnlocked.includes('poterie')) {
    await assurerSocket(code);
    g.send({ proto: 1, type: 'SetResearch', techId: 'poterie' });
    await sleep(600);
  }
  await tourJusqua(code, (s) => s.players[MOI].techsUnlocked.includes('poterie'), 40, 'poterie', { kind: 'unit', id: 'guerrier' });
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'building', id: 'grenier' } });
  await tourJusqua(code, (s) => s.cities[cap.id].production?.item?.id === 'grenier', 25, 'grenier en tête', { kind: 'unit', id: 'guerrier' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
  await sleep(1200);
  const pt = await pointZone(page, cap.id, Z_PROD[0], Z_PROD[1]);
  await survoler(page, pt);
  const t = await tipTexte(page);
  console.log(`[t4] tooltip : ${JSON.stringify(t)}`);
  assert(!!t && t.includes('Grenier'), 'D2 — nom du bâtiment (Grenier)');
  await page.screenshot({ path: `${CAP}/t4-survol-production-batiment.png` });
  await page.mouse.move(10, 10);
}

// ---- t5 : D5 — le survol n'intercepte AUCUN clic (clic zone = clic ville) ----
{
  // Cycle R-2 : ville défendue (garnison) — cliquer la zone de production
  // cycle les occupants ; la ville vient après le dernier.
  const pt = await pointZone(page, cap.id, Z_PROD[0], Z_PROD[1]);
  let txt = '';
  for (let essai = 1; essai <= 6; essai++) {
    await page.mouse.click(pt.x, pt.y);
    await sleep(1000);
    txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    if (/file de production/i.test(txt)) break;
  }
  assert(/file de production/i.test(txt), 'D5 — le clic sur la zone ouvre le PanneauVille (aucun clic intercepté)');
  await page.screenshot({ path: `${CAP}/t5-clic-zone-panneau.png` });
  // Fermer le panneau (Échap) pour la capture zoom.
  await page.keyboard.press('Escape');
  await sleep(500);
}

// ---- t6 : lisible au zoom par défaut (capture pleine page déjà prise) -------
{
  const pt = await pointZone(page, cap.id, Z_CROISSANCE[0], Z_CROISSANCE[1]);
  await survoler(page, pt);
  const t = await tipTexte(page);
  assert(!!t, 't6 — infobulle visible au zoom par défaut');
  await page.screenshot({ path: `${CAP}/t6-zoom-par-defaut.png` });
  await page.mouse.move(10, 10);
}

console.log('================================');
if (echecs.length > 0) {
  console.log(`🔴 ÉCHECS (${echecs.length}) : ${echecs.join(' | ')}`);
  process.exit(1);
} else {
  console.log('✓ BANDE-DETAIL — tous les asserts GUI passent');
}
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(0);
