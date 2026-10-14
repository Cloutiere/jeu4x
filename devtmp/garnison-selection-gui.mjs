/**
 * GARNISON-SELECTION — vérification GUI réelle (L3, handoff 14/10,
 * décisions Erik D1-D5). Le scénario d'Erik : unité en ville compacte →
 * clic (alternance R-2) → sprite complet → désélect → compacte ; pile :
 * la sélectionnée seule complète. Captures
 * dev-logs/captures-garnison-selection/. Ports dédiés (leçon wrangler figé).
 * Usage : node devtmp/garnison-selection-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8793';
const PORTG = process.argv[3] ?? '5186';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-garnison-selection';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
console.log('[garnison-selection] début');
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
  const trace = (m) => fs.appendFileSync('C:/Users/Erik/ZCodeProject/devtmp/gs-trace.log', `${new Date().toISOString()} ${m}\n`);
  trace(`spawn pid=${wrangler.pid}`);
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
/** État du conteneur unité (labels Pixi) : sprite, carré, icône, barre, pile. */
async function etatUnite(page, unitId) {
  return page.evaluate((uid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const c = ents.children.find((k) => k.label === uid && k.getChildByLabel('barreFond'));
    if (!c) return null;
    const lbl = (l) => {
      const x = c.getChildByLabel(l);
      return x ? { visible: x.visible, width: x.width ?? undefined, text: x.text ?? undefined } : null;
    };
    return {
      conteneurVisible: c.visible,
      base: lbl('base'),
      iconeFond: lbl('iconeFond'),
      iconeImg: lbl('iconeImg'),
      barreFond: lbl('barreFond'),
      pile: lbl('pileGarnison'),
    };
  }, unitId);
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
/** Clic d'alternance R-2 sur la case ville : 1er clic = ville, re-clic =
 *  unité. Retourne le nombre de clics quand `attendu` (fn état → bool) est
 *  vrai, null sinon. */
async function alternerJusqua(page, hex, attendu, maxClics = 3) {
  for (let i = 1; i <= maxClics; i++) {
    await clicCase(page, hex);
    if (attendu()) return i;
  }
  return null;
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikGarnSel${STAMP}`);
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

// ---- t1 : guerrier en ville → GARNISON compacte (baseline D2/D3 ICONES) ------
let guerrier = null;
{
  const stG = await tourJusqua(code, (s) => Object.values(s.units).some((u) => u.owner === MOI && u.type === 'guerrier'), 30, 'guerrier produit', { kind: 'unit', id: 'guerrier' });
  guerrier = Object.values(stG.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
  await assurerSocket(code);
  if (!(guerrier.q === cap.q && guerrier.r === cap.r)) {
    ordre(g, { type: 'Move', unitId: guerrier.id, path: [{ q: cap.q, r: cap.r }] });
    await sleep(600);
    await tourJusqua(code, (s) => { const u = s.units[guerrier.id]; return u && u.q === cap.q && u.r === cap.r; }, 6, 'guerrier rentré en ville');
  }
  await recentrer(page, cap);
  const e = await etatUnite(page, guerrier.id);
  console.log(`[t1] état : ${JSON.stringify(e)}`);
  assert(!!e && e.base && e.base.visible === false, 't1 — baseline : sprite masqué en ville (compacte)');
  assert(!!e && e.iconeFond && e.iconeFond.visible === true, 't1 — baseline : icône compacte affichée');
  await capture(page, '1-compacte');
}

// ---- t2 : alternance R-2 → sélection unité → SPRITE COMPLET (D1) -------------
{
  const complet = async () => {
    const e = await etatUnite(page, guerrier.id);
    return !!e && e.base && e.base.visible === true;
  };
  const clics = await alternerJusqua(page, cap, complet);
  const e = await etatUnite(page, guerrier.id);
  console.log(`[t2] après ${clics ?? '?'} clic(s) : ${JSON.stringify(e)}`);
  assert(clics !== null, 'D1 — sélection (alternance R-2) → sprite complet visible en ville');
  assert(!!e && e.iconeFond && e.iconeFond.visible === true, 'D1 — carré accent + barre normaux (rendu terrain) sur le sprite complet');
  await capture(page, '2-selectionne-sprite-complet');
}

// ---- t3 : désélect (clic ailleurs) → retour compacte immédiat (D2) -----------
{
  const st = (await dumpFull(code)).state;
  const voisines = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [-1, 1]]
    .map(([dq, dr]) => ({ q: cap.q + dq, r: cap.r + dr }))
    .filter((h) => { const t = st.map[`${h.q},${h.r}`]; return t && !['eau', 'ocean', 'montagne'].includes(t.terrain) && !Object.values(st.cities).some((c) => c.q === h.q && c.r === h.r); });
  assert(voisines.length > 0, 't3 — une case voisine libre pour désélectionner');
  const compact = async () => {
    const e = await etatUnite(page, guerrier.id);
    return !!e && e.base && e.base.visible === false;
  };
  let ok = false;
  for (const v of voisines) {
    await clicCase(page, v);
    if (await compact()) { ok = true; break; }
  }
  const e = await etatUnite(page, guerrier.id);
  console.log(`[t3] état : ${JSON.stringify(e)}`);
  assert(ok, 'D2 — désélection (clic ailleurs) → retour icône compacte');
  await capture(page, '3-deselect-compacte');
}

// ---- t4 : PILE en ville — la sélectionnée seule complète (D3) ----------------
{
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
  const st = await tourJusqua(code, (s) => Object.values(s.units).filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard).length >= 2, 50, '2e guerrier');
  const deux = Object.values(st.units).filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
  const second = deux.find((u) => u.id !== guerrier.id);
  if (!(second.q === cap.q && second.r === cap.r)) {
    await assurerSocket(code);
    ordre(g, { type: 'Move', unitId: second.id, path: [{ q: cap.q, r: cap.r }] });
    await sleep(600);
    await tourJusqua(code, (s) => { const u = s.units[second.id]; return u && u.q === cap.q && u.r === cap.r; }, 6, '2e guerrier rentré');
  }
  await recentrer(page, cap);
  // baseline pile : les deux compactes (une icône, ×2)
  const avant = [await etatUnite(page, deux[0].id), await etatUnite(page, deux[1].id)];
  console.log(`[t4] avant clic : ${JSON.stringify(avant)}`);
  assert(avant.every((e) => e && e.base && !e.base.visible), 'D3 — pile : les deux compactes avant sélection');
  // sélection (alternance) : au moins une doit passer au sprite complet
  const quelquUnComplet = async () => {
    for (const u of deux) {
      const e = await etatUnite(page, u.id);
      if (e && e.base && e.base.visible) return u.id;
    }
    return null;
  };
  let selectionne = null;
  for (let i = 0; i < 3 && !selectionne; i++) {
    await clicCase(page, cap);
    selectionne = await quelquUnComplet();
  }
  console.log(`[t4] sélectionné : ${selectionne}`);
  assert(selectionne !== null, 'D3 — pile : la SÉLECTIONNÉE passe au sprite complet');
  const autres = deux.filter((u) => u.id !== selectionne);
  const etatsAutres = [];
  for (const u of autres) etatsAutres.push(await etatUnite(page, u.id));
  console.log(`[t4] autres : ${JSON.stringify(etatsAutres)}`);
  assert(etatsAutres.every((e) => e && e.base && !e.base.visible), 'D3 — les AUTRES de la pile restent compactes/masquées');
  // GARNISON-SELECTION : le badge ×N reste visible sur la pile (porteur =
  // index 0, sélectionné ou non) — il résume les unités restées compactes.
  let badgeVu = null;
  for (const u of deux) {
    const e = await etatUnite(page, u.id);
    if (e?.pile?.visible && /^×\d+$/.test(e.pile.text)) badgeVu = e.pile.text;
  }
  assert(badgeVu !== null, `D3 — badge pile ×N toujours visible sur la pile (lu : ${badgeVu})`);
  await capture(page, '4-pile-selection');
}

console.log('================================');
if (echecs.length > 0) {
  console.log(`🔴 ÉCHECS (${echecs.length}) : ${echecs.join(' | ')}`);
  process.exit(1);
} else {
  console.log('✓ GARNISON-SELECTION — tous les asserts GUI passent');
}
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(0);
