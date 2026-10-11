/**
 * ICONES-UNITES — vérification GUI réelle (L3, handoff 07/10, décisions
 * Erik D1-D5). Capitale fondée sur place ; guerrier produit : garnison
 * compacte (D3), campagne (D2 carré accent + barre réduite), pile ×N en
 * ville, bannière production guerrier (D1 icône) vs bâtiment (initiale),
 * repli colon sans carré (zéro régression). Captures
 * dev-logs/captures-icones-unites/. Ports dédiés (leçon wrangler figé).
 * Usage : node devtmp/icones-unites-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8791';
const PORTG = process.argv[3] ?? '5184';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-icones-unites';
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
/** Bannière : prodIcone / prodInitiale visibles ? */
async function etatBanniere(page, cityId) {
  return page.evaluate((cid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const c = ents.children.find((k) => k.label === cid && k.getChildByLabel('bandeNom'));
    if (!c) return null;
    const ic = c.getChildByLabel('prodIcone');
    const in_ = c.getChildByLabel('prodInitiale');
    return { icone: ic ? ic.visible : null, initiale: in_ ? in_.visible : null, texte: in_ ? in_.text : null };
  }, cityId);
}
async function captureUnite(page, code, capHex, unitId, nom) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capHex.q, r: capHex.r });
  await sleep(1200);
  const e = await etatUnite(page, unitId);
  console.log(`[${nom}] état unité : ${JSON.stringify(e)}`);
  await page.screenshot({ path: `C:/Users/Erik/ZCodeProject/dev-logs/captures-icones-unites/${nom}.png` });
  return e;
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikIcones${STAMP}`);
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

/** Chemin {q,r} vers une case voisine praticable (format serveur : objets). */
function versVoisine(st, u, cible) {
  const cibles = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [-1, 1]];
  for (const [dq, dr] of cibles) {
    const q = u.q + dq;
    const r = u.r + dr;
    const tu = st.map[`${q},${r}`];
    if (tu && !['eau', 'ocean', 'montagne'].includes(tu.terrain)) {
      if (cible) return { q, r };
      return [{ q, r }];
    }
  }
  return null;
}

// ---- t1 : guerrier produit → déplacé DANS la ville → GARNISON compacte (D3) --
{
  const stG = await tourJusqua(code, (s) => Object.values(s.units).some((u) => u.owner === MOI && u.type === 'guerrier'), 30, 'guerrier produit', { kind: 'unit', id: 'guerrier' });
  const guerrier = Object.values(stG.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
  console.log(`[t1] t${stG.turn} guerrier ${guerrier.id} en (${guerrier.q},${guerrier.r}) — ville (${cap.q},${cap.r})`);
  await assurerSocket(code);
  if (!(guerrier.q === cap.q && guerrier.r === cap.r)) {
    ordre(g, { type: 'Move', unitId: guerrier.id, path: [{ q: cap.q, r: cap.r }] });
    await sleep(600);
    await tourJusqua(code, (s) => { const u = s.units[guerrier.id]; return u && u.q === cap.q && u.r === cap.r; }, 6, 'guerrier rentré en ville');
  }
  const e = await captureUnite(page, code, cap, guerrier.id, 't1-garnison-compacte');
  assert(!!e, 't1 — conteneur unité trouvé');
  assert(e.base && e.base.visible === false, 'D3 — sprite complet MASQUÉ en ville');
  assert(e.iconeFond && e.iconeFond.visible === true, 'D3 — carré icône affiché en garnison');
  assert(e.iconeImg && e.iconeImg.visible === true, 'D3 — icône affichée en garnison');
}

// ---- t2 : 2e guerrier (spawn adjacent) en CAMPAGNE (D2 — carré + barre) ------
let guerrierCampagne = null;
{
  const st2 = await tourJusqua(code, (s) => {
    const gss = Object.values(s.units).filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
    return gss.some((u) => !(u.q === cap.q && u.r === cap.r));
  }, 40, 'guerrier en campagne', { kind: 'unit', id: 'guerrier' });
  guerrierCampagne = Object.values(st2.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && !(u.q === cap.q && u.r === cap.r));
  console.log(`[t2] guerrier en campagne (${guerrierCampagne.q},${guerrierCampagne.r})`);
  const e = await captureUnite(page, code, guerrierCampagne, guerrierCampagne.id, 't2-campagne-carre-accent');
  assert(!!e && e.base && e.base.visible === true, 'D2 — sprite complet visible en campagne');
  assert(!!e && e.iconeFond && e.iconeFond.visible === true, 'D2 — carré à l\'accent À GAUCHE de la barre');
  assert(!!e && e.barreFond && Math.abs(e.barreFond.width - 58) < 2, `D2 — barre réduite (58, total 80) — lu : ${e?.barreFond?.width}`);
}

// ---- t3 : PILE en ville (D3 — ×2, la 2e unité se masque) ---------------------
{
  // le guerrier de campagne RENTRE dans la ville → pile de 2.
  await assurerSocket(code);
  ordre(g, { type: 'Move', unitId: guerrierCampagne.id, path: [{ q: cap.q, r: cap.r }] });
  await sleep(600);
  const st3 = await tourJusqua(code, (s) => {
    const gss = Object.values(s.units).filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && u.q === cap.q && u.r === cap.r);
    return gss.length >= 2;
  }, 10, 'pile de 2 en ville');
  const enVille = Object.values(st3.units).filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && u.q === cap.q && u.r === cap.r);
  console.log(`[t3] t${st3.turn} ${enVille.length} guerriers en ville`);
  const e = await captureUnite(page, code, cap, enVille[0].id, 't3-pile-en-ville');
  assert(!!e, 't3 — conteneur trouvé');
  assert(e.pile && e.pile.visible === true && e.pile.text === '×2', `D3 — badge pile « ×2 » (lu : ${e.pile?.text})`);
  const e2 = await etatUnite(page, enVille[1].id);
  assert(e2 && e2.conteneurVisible === false, 'D3 — la 2e unité de la pile se masque (une icône par case)');
}

// ---- t4 : bannière production GUERRIER → icône dans le cercle (D1) -----------
{
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
  await tourJusqua(code, (s) => s.cities[cap.id].production?.item?.id === 'guerrier', 20, 'guerrier en tête');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
  await sleep(1200);
  const b = await etatBanniere(page, cap.id);
  console.log(`[t4] bannière : ${JSON.stringify(b)}`);
  assert(b && b.icone === true, 'D1 — icône GUERRIER dans le cercle production');
  assert(b && b.initiale === false, 'D1 — initiale masquée quand l\'icône est là');
  await page.screenshot({ path: 'C:/Users/Erik/ZCodeProject/dev-logs/captures-icones-unites/t4-banniere-production-guerrier.png' });
}

// ---- t5 : bannière production BÂTIMENT → initiale en repli (D1) --------------
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
  const b = await etatBanniere(page, cap.id);
  console.log(`[t5] bannière : ${JSON.stringify(b)}`);
  assert(b && b.icone === false, 'D1 — bâtiment : JAMAIS d\'icône');
  assert(b && b.initiale === true && b.texte === 'G', 'D1 — initiale « G » en repli');
  await page.screenshot({ path: 'C:/Users/Erik/ZCodeProject/dev-logs/captures-icones-unites/t5-banniere-production-batiment.png' });
}

// ---- t6 : COLON en campagne = repli SANS carré (zéro régression, D2/D4) ------
{
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'colon' } });
  const st = await tourJusqua(code, (s) => Object.values(s.units).some((u) => u.owner === MOI && u.type === 'colon'), 50, 'colon produit', { kind: 'unit', id: 'colon' });
  const colon = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon' && !u.aboard);
  if (colon.q === cap.q && colon.r === cap.r) {
    const chemin = versVoisine(st, colon, false);
    if (chemin) {
      ordre(g, { type: 'Move', unitId: colon.id, path: chemin });
      await sleep(600);
    }
    await tourJusqua(code, (s) => { const u = s.units[colon.id]; return u && !(u.q === cap.q && u.r === cap.r); }, 10, 'colon sorti');
  }
  const stF = (await dumpFull(code)).state;
  const colonF = stF.units[colon.id];
  console.log(`[t6] colon en (${colonF.q},${colonF.r})`);
  const e = await captureUnite(page, code, colonF, colon.id, 't6-colon-repli-sans-carre');
  assert(!!e && e.base && e.base.visible === true, 'repli — sprite complet visible');
  assert(!!e && (!e.iconeFond || e.iconeFond.visible === false), 'repli — AUCUN carré pour un type sans icône');
  assert(!!e && e.barreFond && Math.abs(e.barreFond.width - 80) < 2, `repli — barre à la largeur historique 80 — lu : ${e?.barreFond?.width}`);
}

console.log('================================');
if (echecs.length > 0) {
  console.log(`🔴 ÉCHECS (${echecs.length}) : ${echecs.join(' | ')}`);
  process.exit(1);
} else {
  console.log('✓ ICONES-UNITES — tous les asserts GUI passent');
}
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(0);
