/**
 * ORIENTATION-UNITES — vérification GUI réelle (L4, handoff 17/10, D1-D5).
 * Scénario : début de partie à droite → pas vers l'Est (droite) → pas vers
 * l'Ouest (FLIP au rendu) → persistance entre tours → pile en ville à
 * orientations mixtes. Captures dev-logs/captures-orientation-unites/.
 * Ports dédiés (leçon wrangler figé).
 * Usage : node devtmp/orientation-unites-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8795';
const PORTG = process.argv[3] ?? '5189';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-orientation-unites';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
console.log('[orientation-unites] début');
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
/** État du conteneur unité : visibilité + SIGNE de scale.x du sprite et de l'icône. */
async function etatUnite(page, unitId) {
  return page.evaluate((uid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const c = ents.children.find((k) => k.label === uid && k.getChildByLabel('barreFond'));
    if (!c) return null;
    const lbl = (l) => {
      const x = c.getChildByLabel(l);
      return x ? { visible: x.visible, scaleX: x.scale?.x ?? null } : null;
    };
    return { conteneurVisible: c.visible, base: lbl('base'), accent: lbl('accent'), iconeImg: lbl('iconeImg') };
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

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikOrient${STAMP}`);
tokenGlobal = token;

let echecs = [];
// Table D3 : guerrier = art natif à GAUCHE → « à droite » = flip (scale.x < 0).
const signeAttendu = (fg) => (fg === true ? 1 : -1);
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

// ---- t1 : début de partie — le guerrier regarde à DROITE (champ absent) ------
let w1 = null;
{
  const stG = await tourJusqua(code, (s) => Object.values(s.units).some((u) => u.owner === MOI && u.type === 'guerrier'), 30, 'guerrier produit', { kind: 'unit', id: 'guerrier' });
  w1 = Object.values(stG.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
  await assurerSocket(code);
  if (!(w1.q === cap.q && w1.r === cap.r)) {
    ordre(g, { type: 'Move', unitId: w1.id, path: [{ q: cap.q, r: cap.r }] });
    await sleep(600);
    await tourJusqua(code, (s) => { const u = s.units[w1.id]; return u && u.q === cap.q && u.r === cap.r; }, 6, 'guerrier rentré');
  }
  await recentrer(page, cap);
  const stNow = (await dumpFull(code)).state;
  const u = stNow.units[w1.id];
  assert(typeof u.faceGauche === 'boolean', `t1 — la rentrée en ville A ORIENTÉ (faceGauche=${u.faceGauche}) ; les jamais déplacées restent ABSENT (t5, w2)`);
  // sélection pour sprite complet (alternance R-2)
  let vu = null;
  for (let i = 0; i < 3 && !vu; i++) {
    await clicCase(page, cap);
    vu = (await etatUnite(page, w1.id))?.base?.visible;
  }
  const e = await etatUnite(page, w1.id);
  console.log(`[t1] état : ${JSON.stringify(e)}`);
  assert(!!vu, 't1 — sprite complet affiché (sélection)');
  assert(!!e && e.base && Math.sign(e.base.scaleX) === signeAttendu(u.faceGauche), `t1 — rendu COHÉRENT avec la table D3 (faceGauche=${u.faceGauche} → signe ${signeAttendu(u.faceGauche)})`);
  await capture(page, '1-debut-droite');
}

// ---- t2 : pas vers l'EST → regarde à droite (faceGauche false) ----------------
{
  const st = (await dumpFull(code)).state;
  const cible = [{ q: cap.q + 1, r: cap.r }, { q: cap.q + 1, r: cap.r - 1 }, { q: cap.q, r: cap.r - 1 }]
    .find((h) => { const t = st.map[`${h.q},${h.r}`]; return t && !['eau', 'ocean', 'montagne'].includes(t.terrain) && !Object.values(st.cities).some((c) => c.q === h.q && c.r === h.r) && !Object.values(st.units).some((x) => x.q === h.q && x.r === h.r && x.id !== w1.id); });
  assert(!!cible, `t2 — case LIBRE à l'Est de la ville trouvée (${cible ? `${cible.q},${cible.r}` : 'aucune'})`);
  await assurerSocket(code);
  ordre(g, { type: 'Move', unitId: w1.id, path: [cible] });
  await finirTourSimple(code);
  const st2 = (await dumpFull(code)).state;
  const u = st2.units[w1.id];
  console.log(`[t2] unité (${u.q},${u.r}) faceGauche=${u.faceGauche}`);
  assert(u.faceGauche === false, 't2 — pas vers l\'Est : faceGauche = false (droite)');
  await recentrer(page, u);
  await assurerSocket(code);
  let vu = false;
  for (let i = 0; i < 3 && !vu; i++) {
    await clicCase(page, u);
    vu = (await etatUnite(page, w1.id))?.base?.visible;
  }
  const e = await etatUnite(page, w1.id);
  assert(!!e && e.base && Math.sign(e.base.scaleX) === signeAttendu(false), 't2 — rendu : regarde à DROITE (flip, art natif gauche → scale.x < 0)');
  await capture(page, '2-pas-est');
}

// ---- t3 : pas vers l'OUEST → FLIP au rendu (faceGauche true) ------------------
{
  const st = (await dumpFull(code)).state;
  const u0 = st.units[w1.id];
  const cible = [{ q: u0.q - 1, r: u0.r }, { q: u0.q - 1, r: u0.r + 1 }, { q: u0.q, r: u0.r + 1 }]
    .find((h) => { const t = st.map[`${h.q},${h.r}`]; return t && !['eau', 'ocean', 'montagne'].includes(t.terrain) && !Object.values(st.units).some((x) => x.q === h.q && x.r === h.r && x.id !== w1.id); });
  assert(!!cible, `t3 — case LIBRE à l'Ouest trouvée (${cible ? `${cible.q},${cible.r}` : 'aucune'})`);
  await assurerSocket(code);
  ordre(g, { type: 'Move', unitId: w1.id, path: [cible] });
  await finirTourSimple(code);
  const st2 = (await dumpFull(code)).state;
  const u = st2.units[w1.id];
  console.log(`[t3] unité (${u.q},${u.r}) faceGauche=${u.faceGauche}`);
  assert(u.faceGauche === true, 't3 — pas vers l\'Ouest : faceGauche = true');
  await recentrer(page, u);
  await assurerSocket(code);
  let vu = false;
  for (let i = 0; i < 3 && !vu; i++) {
    await clicCase(page, u);
    vu = (await etatUnite(page, w1.id))?.base?.visible;
  }
  const e = await etatUnite(page, w1.id);
  console.log(`[t3] état : ${JSON.stringify(e)}`);
  assert(!!e && e.base && e.base.scaleX > 0, 't3 — rendu : regarde à GAUCHE = art NATIF (scale.x > 0, pas de flip)');
  if (e?.accent) assert(e.accent.scaleX > 0, 't3 — calque accent cohérent');
  await capture(page, '3-pas-ouest-flip');
}

// ---- t4 : persistance entre tours (sans mouvement) -----------------------------
{
  const avant = (await dumpFull(code)).state.units[w1.id].faceGauche;
  await finirTourSimple(code);
  const st2 = (await dumpFull(code)).state;
  const u = st2.units[w1.id];
  assert(u.faceGauche === avant, `t4 — orientation PERSISTE entre les tours (faceGauche=${u.faceGauche})`);
  await recentrer(page, u);
  await assurerSocket(code);
  let vu = false;
  for (let i = 0; i < 3 && !vu; i++) {
    await clicCase(page, u);
    vu = (await etatUnite(page, w1.id))?.base?.visible;
  }
  const e = await etatUnite(page, w1.id);
  assert(!!e && e.base && e.base.scaleX > 0, 't4 — rendu toujours à gauche après un tour sans mouvement');
  await capture(page, '4-persistance');
}

// ---- t5 : PILE en ville à orientations MIXTES ---------------------------------
{
  const st = await tourJusqua(code, (s) => Object.values(s.units).filter((x) => x.owner === MOI && x.type === 'guerrier' && !x.aboard).length >= 2, 50, '2e guerrier', { kind: 'unit', id: 'guerrier' });
  const deux = Object.values(st.units).filter((x) => x.owner === MOI && x.type === 'guerrier' && !x.aboard);
  const w2 = deux.find((x) => x.id !== w1.id);
  // w2 reste en ville (créé = droite) ; w1 (gauche) y rentre — pile mixte.
  if (!(w2.q === cap.q && w2.r === cap.r)) {
    await assurerSocket(code);
    ordre(g, { type: 'Move', unitId: w2.id, path: [{ q: cap.q, r: cap.r }] });
    await sleep(600);
    await tourJusqua(code, (s) => { const x = s.units[w2.id]; return x && x.q === cap.q && x.r === cap.r; }, 6, 'w2 rentré');
  }
  await assurerSocket(code);
  ordre(g, { type: 'Move', unitId: w1.id, path: [{ q: cap.q, r: cap.r }] });
  await sleep(600);
  await tourJusqua(code, (s) => { const x = s.units[w1.id]; return x && x.q === cap.q && x.r === cap.r; }, 6, 'w1 rentré en ville');
  const st2 = (await dumpFull(code)).state;
  const f1 = st2.units[w1.id].faceGauche;
  const f2 = st2.units[w2.id].faceGauche;
  console.log(`[t5] pile : w1 faceGauche=${f1}, w2 faceGauche=${f2}`);
  assert(f1 === true && (f2 === undefined || f2 === false), 't5 — pile à orientations MIXTES (une à gauche, une à droite)');
  await recentrer(page, cap);
  const e1 = await etatUnite(page, w1.id);
  const e2 = await etatUnite(page, w2.id);
  console.log(`[t5] états : w1=${JSON.stringify(e1)} w2=${JSON.stringify(e2)}`);
  // En garnison les icônes compactes portent le flip — signes opposés attendus
  // sur au moins une paire lisible (icône OU sprite selon sélection).
  const signe = (e) => (e?.base?.visible ? e.base.scaleX : e?.iconeImg?.scaleX);
  assert(signe(e1) !== null && signe(e2) !== null && Math.sign(signe(e1)) !== Math.sign(signe(e2)), 't5 — rendu : orientations opposées VISIBLES dans la pile');
  // désélection + fermeture du panneau ville pour une capture LISIBLE de la pile
  const stL = (await dumpFull(code)).state;
  const libre = [[cap.q + 2, cap.r], [cap.q - 2, cap.r], [cap.q, cap.r + 2]]
    .find(([q, r]) => { const t = stL.map[`${q},${r}`]; return t && !['eau', 'ocean', 'montagne'].includes(t.terrain); });
  if (libre) await clicCase(page, { q: libre[0], r: libre[1] });
  await recentrer(page, cap);
  await capture(page, '5-pile-mixte');
}

console.log('================================');
console.log('🔶 non capturé : couture (copies synchronisées par syncCopie — largeur signée) et relecture (l\'orientation voyage dans l\'état, même rendu) — à l\'œil en ligne (REPORT)');
if (echecs.length > 0) {
  console.log(`🔴 ÉCHECS (${echecs.length}) : ${echecs.join(' | ')}`);
  process.exit(1);
} else {
  console.log('✓ ORIENTATION-UNITES — tous les asserts GUI passent');
}
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(0);
