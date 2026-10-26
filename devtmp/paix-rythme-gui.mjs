/**
 * PAIX-RYTHME — banc e2e GUI (L3, handoff 27/10). Miroir bot-armee-gui avec
 * l'observation D1 : le bot FORME des ARMÉES de siège (canon R-31 — unités
 * isArmy visibles dans l'état) au ralliement, assiège avec, et PREND des
 * villes. Le joueur reste passif à garnison faible (1 guerrier) pour
 * laisser la percée se produire. Captures : dev-logs/captures-paix-rythme/
 * Usage : node devtmp/paix-rythme-gui.mjs [portWorker] [portVite] [tours]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787';
const PORTG = process.argv[3] ?? '5174';
const TOURS = Number(process.argv[4] ?? '60');
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-paix-rythme';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikPaixRythme${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let wrangler = null;
let g = null;
let tokenGlobal = null;

function tuerPort(P) {
  try { execSync('powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Erik/ZCodeProject/devtmp/tue-wrangler.ps1', { stdio: 'ignore', timeout: 60000 }); } catch {}
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
    try { execSync(`taskkill /F /T /PID ${wrangler.pid}`, { stdio: 'ignore' }); } catch {}
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
      if (tokenGlobal) { await assurerSocket(codeJeu); }
    }
  }
  throw new Error('dump impossible après redémarrages');
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
async function assurerSocket(codeJeu) {
  if (g && g.readyState === 1) return;
  try { g?.close(); } catch {}
  g = wsConnect(`/ws/game/${codeJeu}`, tokenGlobal);
  await g.open;
  await g.waitFor('Welcome');
}
async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
}
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, botDifficulte: 'difficile' } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (order) => g.send({ proto: 1, type: 'SubmitOrder', order });

async function finirTour(codeJeu) {
  for (let essai = 0; essai < 4; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket(codeJeu);
    // Départ COLON (cartes procédurales R-64) : le joueur humain doit FONDER
    // sa capitale lui-même — sinon aucune ville, donc jamais de guerre.
    if (Object.values(stv.cities).filter((c) => c.owner === MOI).length === 0) {
      const colon = Object.values(stv.units).find((u) => u.owner === MOI && u.type === 'colon');
      if (colon) { ordre({ type: 'FoundCity', unitId: colon.id }); await sleep(600); }
    }
    if (!stv.players[MOI].researching) {
      try { g.send({ proto: 1, type: 'SetResearch', techId: 'poterie' }); await sleep(400); } catch {}
    }
    for (const v of Object.values(stv.cities).filter((c) => c.owner === MOI)) {
      if (!v.production) {
        ordre({ type: 'SetProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
        await sleep(400);
      }
    }
    g.send({ proto: 1, type: 'EndTurn' });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(codeJeu)).state.turn > avant) return true;
    }
    if (essai >= 1) { console.log('  [finirTour] redémarrage wrangler forcé'); await demarrerWrangler(true); await assurerSocket(codeJeu); }
  }
  return false;
}

async function demarrerVite() {
  try { await fetch(GUI); console.log('[vite] déjà en vie — réutilisé'); return; } catch {}
  const vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore', env: { ...process.env, PORT: PORTG } });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {}
  }
  void vite;
  throw new Error('vite ne démarre pas');
}

/** Distance axiale avec wrap Est↔Ouest (miroir hexDistanceW). */
function distW(a, b, w) {
  const dq = a.q - b.q, dr = a.r - b.r;
  let d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  const dqw = dq > 0 ? dq - w : dq + w;
  d = Math.min(d, (Math.abs(dqw) + Math.abs(dr) + Math.abs(dqw + dr)) / 2);
  return d;
}

/** Observation campagne : plus gros amas d'unités bot de combat autour d'une
 *  de MES villes (anneau ≤ 2), distance des unités bot à ma ville la plus
 *  proche, captures. */
function resumeCampagne(st) {
  const mesVilles = Object.values(st.cities).filter((c) => c.owner === MOI);
  const botUnits = Object.values(st.units).filter((u) => u.owner === BOT && !u.aboard);
  const armees = Object.values(st.units).filter((u) => u.owner === BOT && u.isArmy);
  let meilleurAmas = { ville: null, n: 0 };
  for (const v of mesVilles) {
    const n = botUnits.filter((u) => distW(u, v, st.mapWidth) <= 3).length;
    if (n > meilleurAmas.n) meilleurAmas = { ville: v, n };
  }
  const plusProche = mesVilles.length && botUnits.length
    ? Math.min(...botUnits.map((u) => Math.min(...mesVilles.map((v) => distW(u, v, st.mapWidth)))))
    : null;
  return {
    turn: st.turn,
    wars: st.diplomacy.war,
    unitesBot: botUnits.length,
    amas: meilleurAmas.n,
    villeCible: meilleurAmas.ville ? `${meilleurAmas.ville.q},${meilleurAmas.ville.r}` : null,
    distBotVilleLaPlusProche: plusProche,
    mesVilles: mesVilles.length,
    armees: armees.length,
    armeePres: armees.length && mesVilles.length
      ? Math.min(...armees.map((u) => Math.min(...mesVilles.map((v) => distW(u, v, st.mapWidth)))))
      : null,
    villesBot: Object.values(st.cities).filter((c) => c.owner === BOT).length,
    winner: st.winner,
  };
}

const trace = [];
let echecs = [];
const assert = (ok, label) => { if (ok) console.log(`  ✓ ${label}`); else { console.log(`  🔴 ${label}`); echecs.push(label); } };

try {
  await demarrerVite();
  await demarrerWrangler();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const token = await login(NOM);
  tokenGlobal = token;
  const code = await creerPartie(token);
  console.log(`[solo] partie ${code}`);
  for (let i = 0; i < 15; i++) {
    const d = await dumpFull(code);
    if (d.state) break;
    await sleep(2000);
  }

  const page = await ctx.newPage();
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  await page.keyboard.press('Control+j'); await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { timeout: 10000 });
  console.log('[god-mode] ON');

  let picAmas = 0;
  let distMin = Infinity;
  let capture = false;
  let guerreVue = false;
  let picArmees = 0;
  let distArmees = Infinity;
  let villesBot0 = null;
  const shots = new Set();
  for (let t = 0; t < TOURS; t++) {
    if (!(await finirTour(code))) throw new Error(`tour ${t} non avancé`);
    const st = (await dumpFull(code)).state;
    if (st.winner) { console.log(`[fin] winner=${st.winner} à t${st.turn}`); break; }
    const r = resumeCampagne(st);
    trace.push(r);
    if (villesBot0 === null) villesBot0 = r.villesBot;
    if (r.wars.length > 0) guerreVue = true;
    picAmas = Math.max(picAmas, r.amas);
    picArmees = Math.max(picArmees, r.armees);
    if (r.armeePres !== null) distArmees = Math.min(distArmees, r.armeePres);
    if (r.distBotVilleLaPlusProche !== null) distMin = Math.min(distMin, r.distBotVilleLaPlusProche);
    console.log(`[t${r.turn}] wars=${JSON.stringify(r.wars)} bot=${r.unitesBot} ARMEES=${r.armees}(${r.armeePres ?? '-'}) amas=${r.amas}@${r.villeCible ?? '-'} distMin=${r.distBotVilleLaPlusProche ?? '-'} mesVilles=${r.mesVilles}`);
    // Capture d'écran à la FORMATION d'une armée (D1 — canon R-31).
    if (r.armees > 0 && !shots.has('armee') && r.villeCible) {
      shots.add('armee');
      const h = r.villeCible.split(',').map(Number);
      await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: h[0], r: h[1] });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/armee-formee-t${r.turn}.png` });
    }
    // Siège par l'ARMÉE (au contact).
    if (r.armees > 0 && r.armeePres !== null && r.armeePres <= 2 && !shots.has('siege') && r.villeCible) {
      shots.add('siege');
      const h = r.villeCible.split(',').map(Number);
      await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: h[0], r: h[1] });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/siege-armee-t${r.turn}.png` });
    }
    // CAPTURE DE VILLE : le bot gagne une ville (plus qu'au départ).
    if (!capture && villesBot0 !== null && r.villesBot > villesBot0 && r.villeCible) {
      capture = true;
      const h = r.villeCible.split(',').map(Number);
      await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: h[0], r: h[1] });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/capture-ville-t${r.turn}.png` });
      console.log(`  ⭐ CAPTURE de ville observée à t${r.turn}`);
    }
    // Captures aux moments forts : rassemblement puis contact.
    if (guerreVue && picAmas >= 3 && r.amas >= picAmas && r.turn % 5 === 0 && r.villeCible) {
      const h = r.villeCible.split(',').map(Number);
      await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: h[0], r: h[1] });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/rassemblement-t${r.turn}.png` });
    }
    if (r.distBotVilleLaPlusProche !== null && r.distBotVilleLaPlusProche <= 5 && guerreVue && r.turn % 4 === 0) {
      const st2 = r;
      const h = st2.villeCible ? st2.villeCible.split(',').map(Number) : null;
      if (h) {
        await page.evaluate((hex) => window.__gameCanvas.centerOn(hex), { q: h[0], r: h[1] });
        await sleep(1800);
        await page.screenshot({ path: `${CAP}/assaut-t${r.turn}.png` });
      }
    }
    if (st.diplomacy.war.length === 0 && trace.length > 2) {
      const avant = trace[trace.length - 2];
      if (avant && avant.wars.length > 0 && r.mesVilles < (trace.find((x) => x.wars.length > 0)?.mesVilles ?? 99)) {
        // ville perdue sans guerre restante = capturée puis paix — on note.
      }
    }
  }
  const finale = (await dumpFull(code)).state;
  capture = capture || (finale ? Object.values(finale.cities).some((c) => c.owner === BOT && c.wasCaptured === true) : false) || (finale?.winner === BOT);
  assert(guerreVue, 'guerre déclarée par le bot pendant la partie');
  assert(picArmees >= 1, `ARMÉE FORMÉE (canon R-31) observée (max ${picArmees})`);
  assert(distArmees <= 3, `armée de siège au contact (distance min ${distArmees === Infinity ? '∞' : distArmees})`);
  assert(picAmas >= 3, `rassemblement observé (amas max ${picAmas} unités bot à ≤3 d'une ville)`);
  assert(capture, `CAPTURE de ville observée (winner=${finale?.winner ?? 'aucun'})`);
  writeFileSync(`${CAP}/trace-tours.json`, JSON.stringify(trace, null, 2));
  writeFileSync(
    `${CAP}/trace.md`,
    `# PAIX-RYTHME — banc e2e ${STAMP} (partie ${code})\n\n` +
      trace.map((e) =>
        `t${e.turn} wars=${JSON.stringify(e.wars)} bot=${e.unitesBot} amas=${e.amas}@${e.villeCible ?? '-'} distMin=${e.distBotVilleLaPlusProche ?? '-'} mesVilles=${e.mesVilles}\n`,
      ).join(''),
  );
  await browser.close();
  if (echecs.length > 0) { console.log(`ÉCHEC : ${echecs.length} verdict(s) rouge(s)`); process.exitCode = 1; }
  else console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
