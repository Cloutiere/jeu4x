/**
 * BANDE-VILLE — capture t4 seule (ville ENNEMIE visible : AUCUNE fuite, D3).
 * Partie propre au bord Est (phase B de bande-ville-gui.mjs réduite à
 * l'essentiel : fondation, page, clics en boucle — cycle R-2 compris).
 * Usage : node devtmp/bande-ville-t4.mjs [portWorker] [portVite]
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
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bande-ville';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  return /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')[1];
}
function wsConnect(path, token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'OrderAck' && msg.accepted === false) console.log('  [refus]', msg.reason);
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
async function demarrerWrangler(force = false) {
  if (!force && !wrangler) {
    try {
      const r = await fetch(`${BASE}/admin/health`, { signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      if (r && r.status < 500) { console.log('[wrangler] adopté'); return; }
    } catch {}
  }
  if (wrangler) { try { wrangler.kill(); } catch {} }
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/server', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { await sleep(1000); try { await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) }); return; } catch {} }
  throw new Error('wrangler ne démarre pas');
}
const dumpFull = (code) => fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } }).then((r) => r.json());
const ordre = (g2, order) => g2.send({ proto: 1, type: 'SubmitOrder', order });
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, civId: 'france' } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const cle = (q, r) => `${q},${r}`;
const distAx = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const colWrap = (q, r, W) => (((q + (r >> 1)) % W) + W) % W;
function bfsChemin(st, unite, but, eviterCamps = true) {
  const passable = (q, r) => { const t = st.map[`${q},${r}`]; return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne'; };
  const interdites = new Set(Object.values(st.cities).map((c) => `${c.q},${c.r}`));
  if (eviterCamps) for (const v of st.villages ?? []) interdites.add(`${v.q},${v.r}`);
  const dep = cle(unite.q, unite.r);
  const file = [[unite.q, unite.r]];
  const prec = new Map([[dep, null]]);
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (q === but.q && r === but.r) {
      const chemin = [];
      let k = cle(q, r);
      while (k && k !== dep) { const [a, b] = k.split(',').map(Number); chemin.unshift({ q: a, r: b }); k = prec.get(k); }
      return chemin;
    }
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (prec.has(k) || interdites.has(k)) continue;
      if (!passable(nq, nr)) continue;
      prec.set(k, cle(q, r));
      file.push([nq, nr]);
    }
  }
  return null;
}
function frangeEst(st, unite) {
  const W = st.mapWidth;
  const passable = (q, r) => { const t = st.map[`${q},${r}`]; return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne'; };
  const file = [[unite.q, unite.r]];
  const vus = new Set([cle(unite.q, unite.r)]);
  const frange = [];
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (colWrap(q, r, W) >= W - 2) frange.push({ q, r });
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (vus.has(k) || !passable(nq, nr)) continue;
      vus.add(k);
      file.push([nq, nr]);
    }
  }
  frange.sort((a, b) => distAx(a, unite) - distAx(b, unite));
  for (const cand of frange.slice(0, 4)) {
    const chemin = bfsChemin(st, unite, cand, true);
    if (chemin) return { but: cand, chemin };
  }
  // Passage en force (camps sur le chemin) : le colon peut mourir — l'appel
  // détecte la perte et passe à la carte suivante.
  if (frange.length > 0) return { but: frange[0], chemin: bfsChemin(st, unite, frange[0], false) ?? [] };
  return null;
}
function caseProche(st, unite, cible) {
  const passable = (q, r) => { const t = st.map[`${q},${r}`]; return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne'; };
  const file = [[unite.q, unite.r]];
  const vus = new Set([cle(unite.q, unite.r)]);
  let meilleur = null;
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (!meilleur || distAx({ q, r }, cible) < distAx(meilleur, cible)) meilleur = { q, r };
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (vus.has(k) || !passable(nq, nr)) continue;
      vus.add(k);
      if (Object.values(st.cities).some((c) => c.q === nq && c.r === nr)) continue;
      file.push([nq, nr]);
    }
  }
  return meilleur;
}

async function ouvrirPage(ctx, code, token) {
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  return page;
}
async function pointBanniere(page, cityId) {
  return page.evaluate((cid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3];
    const c = ents.children.find((k) => k.label === cid);
    if (!c) return null;
    const rect = app.canvas.getBoundingClientRect();
    const gp = c.getGlobalPosition();
    const wt = c.worldTransform;
    return { x: rect.left + gp.x, y: rect.top + gp.y + -86 * wt.d };
  }, cityId);
}

await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const token = await login(`ErikT8${STAMP}`);
let ok = false;
for (let tentative = 1; tentative <= 12 && !ok; tentative++) {
  const code = await creerPartie(token);
  console.log(`[partie ${tentative}] ${code}`);
  let g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
  let st = (await dumpFull(code)).state;
  const W = st.mapWidth;
  const colon = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
  const colonBot = Object.values(st.units).find((u) => u.owner !== MOI && u.type === 'colon');
  const cible = frangeEst(st, colon);
  if (!cible) { console.log('  🔶 bord Est non joignable — carte suivante'); continue; }
  const cheminBot = colonBot ? bfsChemin(st, colon, { q: colonBot.q, r: colonBot.r }, true) : null;
  if (!colonBot || !cheminBot) { console.log(`  🔶 bot sur une autre île (colonBot=${!!colonBot}, chemin=${!!cheminBot}) — carte suivante`); continue; }
  console.log(`  frange Est (${cible.but.q},${cible.but.r}) à ${distAx(colon, cible.but)} du colon`);
  ordre(g, { type: 'Move', unitId: colon.id, path: cible.chemin.slice(1) });
  let mort = false, finie = false;
  for (let i = 0; i < 48; i++) {
    const dstatut = (await dumpFull(code)).meta?.status;
    if (dstatut && dstatut !== 'active') { console.log('  🔶 partie terminée — tentative suivante'); finie = true; break; }
    const stv = (await dumpFull(code)).state;
    await new Promise((r) => { if (g.readyState === 1) r(); else { try { g.close(); } catch {} } });
    g = wsConnect(`/ws/game/${code}`, token);
    await g.open; await g.waitFor('Welcome');
    if (!stv.players[MOI].researching) { g.send({ proto: 1, type: 'SetResearch', techId: 'alphabet' }); await sleep(400); }
    g.send({ proto: 1, type: 'EndTurn' });
    const avant = stv.turn;
    let avance = false;
    for (let k = 0; k < 30; k++) { await sleep(500); if ((await dumpFull(code)).state.turn > avant) { avance = true; break; } }
    if (!avance) break;
    const u = (await dumpFull(code)).state.units[colon.id];
    if (!u) { mort = true; break; }
    if (u.q === cible.but.q && u.r === cible.but.r) break;
  }
  if (mort || finie) continue;
  ordre(g, { type: 'FoundCity', unitId: colon.id });
  await sleep(500);
  g.send({ proto: 1, type: 'EndTurn' });
  await sleep(8000);
  st = (await dumpFull(code)).state;
  const cap = Object.values(st.cities).find((c) => c.owner === MOI);
  if (!cap) continue;
  console.log(`[t8] capitale ${cap.id} (${cap.q},${cap.r})`);
  // Ville bot atteignable : le même continent est déjà garanti par le check
  // colon→colonBot avant fondation (le chemin vers la case VILLE serait
  // toujours nul : bfsChemin exclut les villes).
  const bot = Object.values(st.cities).find((c) => c.owner !== MOI);
  if (!bot) { console.log('  🔶 aucune ville bot — carte suivante'); continue; }
  // Produire un guerrier hors de la ville et le faire marcher jusqu'à ce que
  // la capitale bot entre dans la VISION (rayon 2).
  let capture = false;
  for (let essai = 1; essai <= 3 && !capture; essai++) {
    let stNow = (await dumpFull(code)).state;
    let marcheur = Object.values(stNow.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && !(u.q === cap.q && u.r === cap.r));
    if (!marcheur) {
      g.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } } });
      await sleep(600);
      for (let i = 0; i < 40 && !marcheur; i++) {
        const dstatut = (await dumpFull(code)).meta?.status;
        if (dstatut && dstatut !== 'active') break;
        const d0 = (await dumpFull(code)).state;
        await new Promise((r) => { try { g.close(); } catch {} });
        g = wsConnect(`/ws/game/${code}`, token);
        await g.open; await g.waitFor('Welcome');
        if (!d0.players[MOI].researching) { g.send({ proto: 1, type: 'SetResearch', techId: 'alphabet' }); await sleep(300); }
        g.send({ proto: 1, type: 'EndTurn' });
        const avant = d0.turn;
        for (let k = 0; k < 30; k++) { await sleep(500); if ((await dumpFull(code)).state.turn > avant) break; }
        stNow = (await dumpFull(code)).state;
        marcheur = Object.values(stNow.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && !(u.q === cap.q && u.r === cap.r));
      }
    }
    if (!marcheur) break;
    stNow = (await dumpFull(code)).state;
    const cible = caseProche(stNow, marcheur, { q: bot.q, r: bot.r });
    if (!cible) break;
    if (marcheur.q === cible.q && marcheur.r === cible.r) { console.log('  🔶 déjà au plus près — continent séparé'); break; }
    const chemin = bfsChemin(stNow, marcheur, cible, true) ?? bfsChemin(stNow, marcheur, cible, false);
    if (!chemin) break;
    ordre(g, { type: 'Move', unitId: marcheur.id, path: chemin });
    let visible = false;
    for (let i = 0; i < 45 && !visible; i++) {
      const dstatut = (await dumpFull(code)).meta?.status;
      if (dstatut && dstatut !== 'active') break;
      const d1 = (await dumpFull(code)).state;
      await new Promise((r) => { try { g.close(); } catch {} });
      g = wsConnect(`/ws/game/${code}`, token);
      await g.open; await g.waitFor('Welcome');
      if (!d1.players[MOI].researching) { g.send({ proto: 1, type: 'SetResearch', techId: 'alphabet' }); await sleep(300); }
      g.send({ proto: 1, type: 'EndTurn' });
      const avant = d1.turn;
      let avance = false;
      for (let k = 0; k < 30; k++) { await sleep(500); if ((await dumpFull(code)).state.turn > avant) { avance = true; break; } }
      if (!avance) break;
      const d2 = (await dumpFull(code)).state;
      const u2 = d2.units[marcheur.id];
      if (!u2) { console.log('  🔶 marcheur perdu (barbare 🔶) — relève'); break; }
      if ((d2.players[MOI].vision?.visible ?? []).includes(`${bot.q},${bot.r}`)) visible = true;
    }
    if (!visible) { console.log('  🔶 capitale bot toujours hors vision — relève'); continue; }
    const page = await ouvrirPage(ctx, code, token);
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: bot.q, r: bot.r });
    await sleep(1500);
    const info = await page.evaluate((cid) => {
      const app = window.__gameCanvas.app();
      const world = app.stage.children[0];
      const ents = world.children[3];
      const c = ents.children.find((k) => k.label === cid);
      if (!c) return null;
      const lab = (l) => { const e = c.children.find((x) => x.label === l); return e ? { visible: e.visible, text: typeof e.text === 'string' ? e.text : null } : null; };
      return {
        pop: lab('pop'), bandeNom: lab('bandeNom'), bandeEtoile: lab('bandeEtoile'),
        drapeauToursFond: lab('drapeauToursFond'), bandeCroissance: lab('bandeCroissance'),
        prodCercle: lab('prodCercle'), prodInitiale: lab('prodInitiale'), prodEta: lab('prodEta'),
      };
    }, bot.id);
    console.log('  bannière ennemie:', JSON.stringify(info));
    const dumpFin = await dumpFull(code);
    const avecProd = !!dumpFin.state.cities[bot.id]?.production;
    console.log(`[t4] preuve anti-fuite : production ennemie dans l'état=${avecProd} → masquée à l'écran`);
    if (info && info.pop?.visible && info.bandeNom?.visible && info.drapeauToursFond && !info.drapeauToursFond.visible && !info.prodEta.visible && !info.prodCercle.visible) {
      await page.screenshot({ path: `${CAP}/t4-ennemie-sans-fuite.png` });
      console.log(`[t4] ✓ capture ennemie sans fuite (production dans l'état : ${avecProd})`);
      capture = true;
    }
    await page.close().catch(() => {});
  }
  await page.close().catch(() => {});
}
console.log(ok ? '✓ t8 capturé' : '🔴 t8 non produit');
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(ok ? 0 : 1);
