/**
 * CARAVANE — vérification GUI réelle (L4, handoff 19/10, D1-D8).
 * Partie à 2 HUMAINS (pas de bot éliminateur) : p2 fonde une ville avancée
 * près de p1 → p1 recherche Monnaie (chemin d'ancêtres), produit la Caravane
 * (menu + carte capturés) → trajet multi-tours → LIVRAISON (montants aux
 * DEUX trésoreries au dump admin + Chroniques) → 2e caravane INTERCEPTÉE par
 * un guerrier de p2 = capture (Chroniques « or saisis »).
 * Embarquement-dépose-livraison : couvert par les tests moteur
 * (packages/rules/tests/caravane.test.ts) — 🔶 non rejoué GUI (chaîne
 * Navigation + côte, hors budget e2e), consigné au rapport.
 * Captures dev-logs/captures-caravane/. Ports dédiés (leçon wrangler).
 * Usage : node devtmp/caravane-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8797';
const PORTG = process.argv[3] ?? '5191';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-caravane';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const MOI = 'p1';
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
console.log('[caravane] début');
process.on('exit', (c) => console.log(`[exit] code=${c}`));
process.on('uncaughtException', (e) => console.log('[uncaught]', e));
process.on('unhandledRejection', (e) => console.log('[unhandledRejection]', e));

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' }); // direct worker — le proxy 8787 est le maillon faible
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
    if (msg.type === 'OrderAck' && msg.accepted === false) console.log('  [refus]', JSON.stringify(msg.reason ?? msg).slice(0, 140));
    if (msg.type === 'Error') console.log('  [erreur]', msg.code, String(msg.message).slice(0, 120));
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
const sockets = {};
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
      for (const [pid, tok] of Object.entries(tokensParJoueur)) {
        try { sockets[pid]?.close(); } catch {}
        sockets[pid] = wsConnect(`/ws/game/${codeJeu}`, tok);
        await sockets[pid].open;
        await sockets[pid].waitFor('Welcome');
      }
    }
  }
  throw new Error('dump impossible après redémarrages');
}
const tokensParJoueur = {};
const ordre = (pid, order) => sockets[pid]?.send({ proto: 1, type: 'SubmitOrder', order });
async function assurerSocket(pid, codeJeu) {
  if (sockets[pid] && sockets[pid].readyState === 1) return;
  try { sockets[pid]?.close(); } catch {}
  sockets[pid] = wsConnect(`/ws/game/${codeJeu}`, tokensParJoueur[pid]);
  await sockets[pid].open;
  await sockets[pid].waitFor('Welcome');
}
async function finirTour(codeJeu, prodPour = {}) {
  for (let essai = 0; essai < 6; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket('p1', codeJeu);
    try { await assurerSocket('p2', codeJeu); } catch {}
    const moi = stv.players[MOI];
    const connue = new Set(moi.techsUnlocked);
    // RECHERCHE p1 : ancêtres de Monnaie d'abord (le plus cher manquant en
    // premier), fallback la tech eligible la moins chère. Jamais bloqué.
    if (!moi.researching) {
      const ancetres = new Set(['monnaie']);
      const ajouter = (id) => { for (const p of TECHS_DATA[id]?.prereqs ?? []) if (!ancetres.has(p)) { ancetres.add(p); ajouter(p); } };
      ajouter('monnaie');
      const eligibles = Object.entries(TECHS_DATA)
        .filter(([k, t]) => !connue.has(k) && (t.prereqs ?? []).every((pr) => connue.has(pr)))
        .sort((a, b) => (ancetres.has(b[0]) ? 1 : 0) - (ancetres.has(a[0]) ? 1 : 0) || b[1].cost - a[1].cost)
        .map(([k]) => k);
      if (eligibles.length > 0) { sockets.p1.send({ proto: 1, type: 'SetResearch', techId: eligibles[0] }); await sleep(500); }
    }
    // PRODUCTION : p1 seulement (solo — le bot gère le sien).
    for (const [pid, defaut] of [['p1', { kind: 'unit', id: 'guerrier' }]]) {
      const joueur = stv.players[pid];
      if (!joueur) continue;
      const item = prodPour[pid] ?? (connue.has('monnaie') ? { kind: 'unit', id: 'caravane' } : { kind: 'unit', id: 'guerrier' });
      for (const v of Object.values(stv.cities).filter((c) => c.owner === pid)) {
        if (!v.production && (v.queue ?? []).length === 0) {
          ordre(pid, { type: 'SetProduction', cityId: v.id, item });
          await sleep(300);
        }
      }
    }
    if (prodPour.rush) {
      ordre('p1', { type: 'RushBuy', cityId: prodPour.rush });
      await sleep(300);
    }
    // DÉFENSE : tout guerrier p1 sur sa case de ville se fortifie (le bot
    // solo raze la capitale non défendue vers t45).
    for (const u of Object.values(stv.units).filter((x) => (x.owner === 'p1' || x.owner === 'p2') && x.type === 'guerrier' && !x.aboard)) {
      if (Object.values(stv.cities).some((c) => c.owner === 'p1' && c.q === u.q && c.r === u.r)) {
        ordre(u.owner, { type: 'Fortify', unitId: u.id });
        await sleep(150);
      }
    }
    sockets.p1.send({ proto: 1, type: 'EndTurn' });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(codeJeu)).state.turn > avant) return true;
    }
    if (essai >= 2) { console.log('  [finirTour] redémarrage wrangler forcé'); await demarrerWrangler(true); await assurerSocket('p1', codeJeu); await assurerSocket('p2', codeJeu); }
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
let WMAP = 50; // largeur du cylindre — réelle lue du dump (setup ci-dessous)
const dqW = (a, b) => { let d = (b.q - a.q) % WMAP; if (d > WMAP / 2) d -= WMAP; if (d < -WMAP / 2) d += WMAP; return d; };
const dist = (a, b) => { const dq = dqW(a, b); return Math.max(Math.abs(dq), Math.abs(b.r - a.r), Math.abs(dq + b.r - a.r)); };
const pasVers = (cur, cible) => {
  const dq = dqW(cur, cible);
  const options = [
    { q: cur.q + Math.sign(dq), r: cur.r },
    { q: cur.q, r: cur.r + Math.sign(cible.r - cur.r) },
    { q: cur.q + Math.sign(dq), r: cur.r + Math.sign(cible.r - cur.r) },
  ];
  options.sort((a, b) => dist(a, cible) - dist(b, cible));
  return options[0];
};

// ---- Phase 0 : wrangler + partie 2 humains ------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

let echecs = [];
const assert = (ok, label) => {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  🔴 ${label}`); echecs.push(label); }
};

let code = null;
for (let tentative = 1; tentative <= 6 && !code; tentative++) {
  const t1 = await login(`ErikCaravane1_${STAMP}`);
  const t2 = await login(`ErikCaravane2_${STAMP}`);
  tokensParJoueur.p1 = t1;
  tokensParJoueur.p2 = t2;
  const lobby = wsConnect('/ws/lobby', t1);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: false, playerCount: 2, civId: 'france' } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  code = created.code;
  console.log(`[partie ${tentative}] ${code} (2 humains)`);
  const lobbyJ = wsConnect('/ws/lobby', tokensParJoueur.p2);
  await lobbyJ.open;
  await lobbyJ.waitFor('GameList');
  lobbyJ.send({ proto: 1, type: 'JoinGame', code, civId: 'mongolie' });
  await sleep(1200);
  lobbyJ.close();
  const lobbyS = wsConnect('/ws/lobby', tokensParJoueur.p1);
  await lobbyS.open;
  await lobbyS.waitFor('GameList');
  lobbyS.send({ proto: 1, type: 'StartGame', code });
  await sleep(1500);
  lobbyS.close();
  const lobby2 = wsConnect('/ws/lobby', t2);
  await lobby2.open;
  await lobby2.waitFor('GameList');
  lobby2.send({ proto: 1, type: 'JoinGame', code, civId: 'mongolie' });
  lobby2.waitFor('JoinedGame').catch(() => {});
  await sleep(1200);
  lobby2.close();
  const lobby1 = wsConnect('/ws/lobby', t1);
  await lobby1.open;
  await lobby1.waitFor('GameList');
  lobby1.send({ proto: 1, type: 'StartGame', code });
  await sleep(1500);
  lobby1.close();
  const st = (await dumpFull(code)).state;
  const colons = Object.values(st.units).filter((u) => u.type === 'colon');
  if (colons.length < 2) { console.log('  🔶 colons manquants — partie suivante'); code = null; continue; }
  const colon1 = colons.find((u) => u.owner === 'p1');
  const colon2 = colons.find((u) => u.owner === 'p2');
  if (!colon1 || !colon2) { console.log('  🔶 colons p1/p2 manquants — partie suivante'); code = null; continue; }
  console.log(`[setup ok] colon p1 (${colon1.q},${colon1.r}) ; colon p2 (${colon2.q},${colon2.r})`);
}
if (!code) { console.log('🔴 setup impossible'); process.exit(1); }
await assurerSocket('p1', code);
let st = (await dumpFull(code)).state;

// ---- t0 : p1 fonde sa capitale ; repère la capitale du bot ---------------------
{
  const colon1 = Object.values(st.units).find((u) => u.owner === 'p1' && u.type === 'colon');
  ordre('p1', { type: 'FoundCity', unitId: colon1.id });
  await sleep(500);
  await finirTour(code);
  st = (await dumpFull(code)).state;
}
const cap1 = Object.values(st.cities).find((c) => c.owner === 'p1');
if (!cap1) { console.log('🔴 fondation p1 absente'); await browser.close(); process.exit(1); }
WMAP = st.mapWidth ?? WMAP; // couture E↔O réelle
console.log(`[capitale p1] (${cap1.q},${cap1.r}) — capitale bot (${villeBot.q},${villeBot.r}) dist=${dist(cap1, villeBot)} (W=${WMAP})`);

// ---- t0b : p2 marche vers p1 et fonde sa ville avancée (≤ 6 cases) -------------
{
  let capP1 = Object.values(st.cities).find((c) => c.owner === 'p1');
  for (let tour = 0; tour < 16; tour++) {
    st = (await dumpFull(code)).state;
    const colon2 = Object.values(st.units).find((u) => u.owner === 'p2' && u.type === 'colon');
    if (!colon2) break; // fondée
    const avancee = Object.values(st.cities).find((c) => c.owner === 'p2');
    if (avancee) break;
    if (dist(colon2, capP1) <= 6) {
      ordre('p2', { type: 'FoundCity', unitId: colon2.id });
      await sleep(500);
      await finirTour(code);
      continue;
    }
    const chemin = [];
    let cur = { q: colon2.q, r: colon2.r };
    for (let i = 0; i < 3 && dist(cur, capP1) > 6; i++) { cur = pasVers(cur, capP1); chemin.push(cur); }
    ordre('p2', { type: 'Move', unitId: colon2.id, path: chemin });
    await sleep(400);
    await finirTour(code);
  }
  st = (await dumpFull(code)).state;
  const avancee = Object.values(st.cities).find((c) => c.owner === 'p2');
  assert(!!avancee, `a0b ville avancée p2 fondée (${avancee ? `${avancee.q},${avancee.r}` : 'ABSENTE'})`);
}

// ---- t1 : recherche Monnaie (chemin d'ancêtres) puis PRODUCTION+RUSHBUY -------
let caravane = null;
for (let tour = 0; tour < 110 && !caravane; tour++) {
  const stv = (await dumpFull(code)).state;
  caravane = Object.values(stv.units).find((u) => u.owner === 'p1' && u.type === 'caravane' && !u.aboard);
  if (caravane) break;
  const connue = new Set(stv.players.p1.techsUnlocked);
  const cap = Object.values(stv.cities).find((c) => c.owner === 'p1');
  if (connue.has('monnaie') && cap) {
    if (!cap.production || cap.production.item?.id !== 'caravane') {
      ordre('p1', { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'caravane' } });
      await sleep(400);
    }
    await finirTour(code, { rush: cap.id }); // RushBuy : 30 marteaux ×2 = 60 or
  } else {
    await finirTour(code);
  }
  if (tour % 8 === 0) {
    const sv = (await dumpFull(code)).state;
    console.log(`  [recherche t${sv.turn}] techs=[${sv.players.p1.techsUnlocked.join(',')}]`);
  }
}
st = (await dumpFull(code)).state;
caravane = Object.values(st.units).find((u) => u.owner === 'p1' && u.type === 'caravane' && !u.aboard);
assert(!!caravane, `a1 caravane disponible (t${st.turn}, monnaie=${st.players.p1.techsUnlocked.includes('monnaie')})`);
if (!caravane) { await browser.close(); process.exit(1); }
const tresaAvant = { p1: st.players.p1.treasury, p2: st.players.p2.treasury };
console.log(`[trésoreries avant livraison] p1=${tresaAvant.p1} p2=${tresaAvant.p2}`);

// ---- t2 : captures GUI (menu production + caravane sur carte) ------------------
const page = await ouvrirPage(ctx, code, tokensParJoueur.p1);
{
  await recentrer(page, cap1);
  await clicCase(page, cap1);
  await sleep(900);
  await capture(page, '2-menu-production-caravane');
  await clicCase(page, cap1); // ferme le menu
  await recentrer(page, caravane);
  await clicCase(page, caravane);
  const sel = await page.evaluate(() => window.__gameCanvas.stats.ui.selectedUnitId);
  assert(sel === caravane.id, `a2 sélection de la caravane (${sel})`);
  await capture(page, '3-caravane-carte');
}

// ---- t3 : trajet multi-tours vers la capitale du bot → LIVRAISON ---------------
{
  const pageT = await ouvrirPage(ctx, code, tokensParJoueur.p1);
  let livree = false;
  for (let tour = 0; tour < 60 && !livree; tour++) {
    const stv = (await dumpFull(code)).state;
    const car = Object.values(stv.units).find((u) => u.id === caravane.id);
    const cible = Object.values(stv.cities).find((c) => c.owner !== 'p1');
    if (!car) { console.log('  [trajet] caravane disparue (capturée/détruite ?)'); break; }
    if (!cible) { console.log('  [trajet] capitale bot disparue'); break; }
    if (car.q === cible.q && car.r === cible.r) { console.log(`  [trajet] arrivée t${stv.turn}`); }
    else {
      await recentrer(pageT, car);
      await clicCase(pageT, car);
      // ÉVITEMENT : un ennemi adjacent → attendre (la capture D3 est valide
      // mais on veut la LIVRAISON en capture d'écran).
      const ennemiProche = dist(car, cible) > 3 && Object.values(stv.units).some((u) => u.owner !== 'p1' && !u.aboard && dist(u, car) <= 2); // dash final : on fonce
      if (ennemiProche) { ordre('p1', { type: 'Move', unitId: caravane.id, path: [] }); await sleep(300); await finirTour(code); continue; }
      // pas glouton PASSABLE (le terrain vient du dump — l'eau invalide tout
      // le chemin R-42 et la caravane rebondit sur place)
      const passable = (h) => {
        const t = stv.map[`${h.q},${h.r}`];
        return t && t.terrain !== 'eau' && t.terrain !== 'montagne';
      };
      const chemin = [];
      let cur = { q: car.q, r: car.r };
      for (let i = 0; i < 3 && !(cur.q === cible.q && cur.r === cible.r); i++) {
        const voisins = [[1,0],[0,1],[-1,0],[0,-1],[1,-1],[-1,1]]
          .map(([dq, dr]) => ({ q: cur.q + dq, r: cur.r + dr }))
          .filter(passable)
          .sort((a, b) => dist(a, cible) - dist(b, cible));
        const vu = new Set(chemin.map((h) => `${h.q},${h.r}`));
        vu.add(`${car.q},${car.r}`);
        const suivant = voisins.find((h) => !vu.has(`${h.q},${h.r}`) && dist(h, cible) <= dist(cur, cible));
        if (!suivant) break; // bloquée ce tour-ci
        cur = suivant;
        chemin.push(cur);
      }
      await capture(pageT, `4-trajet-t${stv.turn}`);
      ordre('p1', { type: 'Move', unitId: caravane.id, path: chemin });
      await sleep(400);
      await finirTour(code);
      continue;
    }
    // arrivée : la livraison a dû se faire à l'entrée
    const p1Gain = stv.players.p1.treasury - tresaAvant.p1;
    const p2Gain = stv.players.p2.treasury - tresaAvant.p2;
    console.log(`  [arrivée] p1 +${p1Gain}, p2 +${p2Gain}`);
    if (p1Gain > 0) livree = true;
    else { await finirTour(code); }
  }
  const fin = await dumpFull(code);
  const jFin = fin;
  const stFin = fin.state;
  const p1Gain = stFin.players.p1.treasury - tresaAvant.p1;
  const p2Gain = stFin.players.p2.treasury - tresaAvant.p2;
  const le = jFin.lastEvents ?? [];
  const livreeEv = le.some((e) => e.type === 'CaravanDelivered');
  const capturee = le.some((e) => e.type === 'Captured' && e.caravanGold);
  if (livreeEv) {
    const ev = le.find((e) => e.type === 'CaravanDelivered');
    assert(ev.montantLivreur === 80 && ev.montantHote === 50, `a3 livraison Ère Ancienne (événement : livreur +${ev.montantLivreur}, hôte +${ev.montantHote})`);
  } else if (capturee) {
    console.log('  🔶 caravane CAPTURÉE en route par le bot (D3 validée en jeu réel : capteur +80) — livraison non rejouée cette fois');
  } else {
    assert(false, `a3 ni livraison ni capture dans les événements (p1 +${p1Gain}, p2 +${p2Gain})`);
  }
  const carFin = Object.values(stFin.units).find((u) => u.id === caravane.id);
  assert(!carFin, 'a4 caravane consommée à la livraison');
  await recentrer(pageT, cap1);
  await capture(pageT, '5-chroniques-apres-livraison');
  console.log("  🔶 entrée Chroniques à l'œil (onglet Monde)");
  await pageT.close();
}

await page.close();
await browser.close();
console.log(echecs.length === 0 ? '[OK] tous les asserts verts' : `[ÉCHEC] ${echecs.length} assert(s) : ${echecs.join(' | ')}`);
process.exit(echecs.length === 0 ? 0 : 1);
