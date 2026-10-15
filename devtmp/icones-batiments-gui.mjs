/**
 * ICONES-BATIMENTS — vérification GUI réelle (L3, handoff 14/10, D1-D5).
 * Bannière : icône bâtiment (t1) puis merveille (t2) dans le cercle prod ;
 * menu 3 onglets + file avec icônes (t3) ; repli initiale quand l'art est
 * absente (t4 — requête /art/icone_batiment_grenier.png avortée = simule une
 * source manquante, le vrai chemin de repli du rendu). Captures
 * dev-logs/captures-icones-batiments/. Ports dédiés (leçon wrangler figé).
 * Usage : node devtmp/icones-batiments-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8794';
const PORTG = process.argv[3] ?? '5187';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-icones-batiments';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
console.log('[icones-batiments] début');
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
async function ouvrirPage(ctx, code, token, bloquer = null) {
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  if (bloquer) await page.route(bloquer, (route) => route.abort());
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  return page;
}
/** État du cercle production de la BANNIÈRE de la ville (labels Pixi). */
async function etatBanniere(page, cityId) {
  return page.evaluate((cid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const c = ents.children.find((k) => k.label === cid && k.getChildByLabel('prodIcone'));
    if (!c) return null;
    const lbl = (l) => {
      const x = c.getChildByLabel(l);
      return x ? { visible: x.visible, text: x.text ?? undefined } : null;
    };
    const ic = c.getChildByLabel('prodIcone');
    return {
      prodCercle: lbl('prodCercle'),
      prodInitiale: lbl('prodInitiale'),
      prodIcone: { visible: ic.visible, texture: ic.texture?.label ?? String(ic.texture?.uid ?? '') },
    };
  }, cityId);
}
async function recentrer(page, hex) {
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: hex.q, r: hex.r });
  await sleep(900);
}
async function capture(page, nom) {
  await page.screenshot({ path: `${CAP}/${nom}.png` });
  console.log(`  [capture] ${nom}.png`);
}
/** Capture de la SECTION choix du panneau (la liste est sous le pli —
 *  scroll interne : element screenshot après scrollIntoView). */
async function captureChoix(page, nom) {
  const section = page.locator('.panneau-ville .choix');
  await section.scrollIntoViewIfNeeded();
  await sleep(300);
  await section.screenshot({ path: `${CAP}/${nom}.png` });
  console.log(`  [capture] ${nom}.png`);
}
/** Attend que la bannière reflète la production (round-trip vue client). */
async function banniereJusqua(page, cityId, condition, ms = 8000) {
  const t0 = Date.now();
  let e = null;
  while (Date.now() - t0 < ms) {
    e = await etatBanniere(page, cityId);
    if (e && condition(e)) return e;
    await sleep(500);
  }
  return e;
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikIconBat${STAMP}`);
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

// ---- t1 : grenier en tête → icône BÂTIMENT dans le cercle prod (D1) ----------
// Le geste passe par l'UI réelle (clic Bâtiments → grenier) : le panneau et
// la bannière appartiennent au même client, le rebuild suit la commande.
async function ouvrirPanneau(page, hex) {
  await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: hex.q, y: hex.r });
  await page.waitForSelector('.panneau-ville', { timeout: 8000 });
  await sleep(400);
}
{
  // poterie (prérequis du grenier) — la boucle cherche la tech la moins chère.
  await tourJusqua(code, (s) => s.players[MOI].techsUnlocked.includes('poterie'), 20, 'poterie', { kind: 'unit', id: 'guerrier' });
  await recentrer(page, cap);
  await ouvrirPanneau(page, cap);
  await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Bâtiments'))?.click());
  await sleep(400);
  const clique = await page.$$eval('.panneau-ville .opt', (els) => {
    const b = els.find((e) => /^Grenier \(/.test(e.querySelector('b')?.textContent.trim() ?? ''));
    if (b) { b.click(); return true; }
    return false;
  });
  assert(clique, 't1 — grenier cliqué dans l\'onglet Bâtiments');
  await page.keyboard.press('Escape');
  await sleep(600);
  const e = await banniereJusqua(page, cap.id, (x) => x.prodIcone.visible === true);
  console.log(`[t1] bannière : ${JSON.stringify(e)}`);
  assert(!!e && e.prodIcone && e.prodIcone.visible === true, 't1 — D1 : icône BÂTIMENT (grenier) visible dans le cercle prod');
  assert(!!e && e.prodInitiale && e.prodInitiale.visible === false, 't1 — initiale masquée quand l\'icône existe');
  await capture(page, '1-banniere-batiment-grenier');
}

// ---- t2 : stonehenge en tête → icône MERVEILLE dans le cercle prod (D1) ------
{
  await ouvrirPanneau(page, cap);
  // vider la file (croix du rang 1 — les marteaux engagés retournent en réserve)
  await page.$$eval('.panneau-ville .rangs .croix', (els) => els[0]?.click());
  await sleep(700);
  await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Merveilles'))?.click());
  await sleep(600);
  const libelles = await page.$$eval('.panneau-ville .opt b', (els) => els.map((e) => e.textContent.trim()));
  console.log(`[t2] options merveilles : ${JSON.stringify(libelles)}`);
  const clique = await page.$$eval('.panneau-ville .opt', (els) => {
    const b = els.find((e) => /^Stonehenge \(/i.test(e.querySelector('b')?.textContent.trim() ?? ''));
    if (b) { b.click(); return true; }
    return false;
  });
  assert(clique, 't2 — stonehenge cliqué dans l\'onglet Merveilles');
  await page.keyboard.press('Escape');
  await sleep(600);
  const e = await banniereJusqua(page, cap.id, (x) => x.prodIcone.visible === true);
  console.log(`[t2] bannière : ${JSON.stringify(e)}`);
  assert(!!e && e.prodIcone && e.prodIcone.visible === true, 't2 — D1 : icône MERVEILLE (stonehenge) visible dans le cercle prod');
  await capture(page, '2-banniere-merveille-stonehenge');
}

// ---- t3 : menu 3 onglets + file avec icônes (D2) ------------------------------
{
  await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: cap.q, y: cap.r });
  const panneau = await page.waitForSelector('.panneau-ville', { timeout: 8000 }).catch(() => null);
  assert(!!panneau, 't3 — PanneauVille ouvert');
  // grenier (bâtiment) rejoint la file par le VRAI geste (clic onglet) —
  // la tête reste stonehenge (merveille) : les deux sortes dans la file.
  await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Bâtiments'))?.click());
  await sleep(400);
  await page.$$eval('.panneau-ville .opt', (els) => els.find((e) => /^Grenier \(/.test(e.querySelector('b')?.textContent.trim() ?? ''))?.click());
  await sleep(900);
  const imgsRangees = await page.$$eval('.panneau-ville .rangs .rang-icone', (els) =>
    els.map((im) => ({ src: im.getAttribute('src'), charge: im.naturalWidth > 0 })));
  console.log(`[t3] file : ${JSON.stringify(imgsRangees)}`);
  assert(imgsRangees.length >= 2 && imgsRangees.every((i) => i.charge), 't3 — D2 : rangs de la file avec icônes CHARGÉES (bâtiment + merveille)');
  await capture(page, '3-file-icone');

  await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Bâtiments'))?.click());
  await sleep(500);
  const imgsBat = await page.$$eval('.panneau-ville .onglet-batiments, .panneau-ville .options', (els) => els.length);
  const bat = await page.$$eval('.panneau-ville .options .opt-icone', (els) =>
    els.map((im) => ({ src: im.getAttribute('src'), charge: im.naturalWidth > 0 })));
  console.log(`[t3] onglet bâtiments : ${bat.length} lignes, ${JSON.stringify(bat.slice(0, 6))}`);
  assert(bat.length >= 1 && bat.every((i) => i.charge), 't3 — D2 : lignes BÂTIMENTS avec icônes chargées');
  await captureChoix(page, '3-onglet-batiments');

  await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Merveilles'))?.click());
  await sleep(500);
  const mer = await page.$$eval('.panneau-ville .options .opt-icone', (els) =>
    els.map((im) => ({ src: im.getAttribute('src'), charge: im.naturalWidth > 0 })));
  console.log(`[t3] onglet merveilles : ${mer.length} lignes`);
  assert(mer.length >= 1 && mer.every((i) => i.charge), 't3 — D2 : lignes MERVEILLES avec icônes chargées');
  await captureChoix(page, '3-onglet-merveilles');
}

// ---- t4 : repli initiale quand l'art est absente (D3 — atelier n'a pas de
//      source Erik ; on simule l'absence en avortant la requête du PNG) --------
{
  // La TÊTE de file reste stonehenge (SetProduction socket ne remplace pas une
  // production en cours) : on simule l'art absente sur la TÊTE elle-même
  // (stonehenge + grenier bloqués) — le chemin de repli du rendu est le même.
  const page2 = await ouvrirPage(ctx, code, token, /\/art\/icone_(batiment_grenier|merveille_stonehenge)\.png/);
  await recentrer(page2, cap);
  const e = await etatBanniere(page2, cap.id);
  console.log(`[t4] bannière sans art : ${JSON.stringify(e)}`);
  assert(!!e && e.prodIcone && e.prodIcone.visible === false, 't4 — D3 : art absente → PAS d\'icône (aucun trou)');
  assert(!!e && e.prodInitiale && e.prodInitiale.visible === true && e.prodInitiale.text === 'S', 't4 — D3 : repli initiale « S » affiché');
  await page2.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: cap.q, y: cap.r });
  await page2.waitForSelector('.panneau-ville', { timeout: 8000 });
  await page2.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Bâtiments'))?.click());
  await sleep(500);
  const imgs = await page2.$$eval('.panneau-ville .opt-icone', (els) =>
    els.filter((im) => (im.getAttribute('src') ?? '').includes('grenier')).map((im) => ({ charge: im.naturalWidth > 0, cache: im.style.display === 'none' })));
  console.log(`[t4] menu grenier : ${JSON.stringify(imgs)}`);
  assert(imgs.length >= 1 && imgs.every((i) => !i.charge), 't4 — D3 : menu sans image pour le type sans art (img masquée, ligne propre)');
  await capture(page2, '4-repli-initiale-sans-art');
}

console.log(`\n=== RÉSULTAT : ${echecs.length === 0 ? 'TOUS LES ASSERTS PASSENT' : `${echecs.length} ÉCHEC(S)`} ===`);
for (const e of echecs) console.log('  🔴', e);
await browser.close();
process.exit(echecs.length === 0 ? 0 : 1);
