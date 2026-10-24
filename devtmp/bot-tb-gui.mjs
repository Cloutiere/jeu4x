/**
 * BOT-TB — banc e2e GUI (L3, handoff 24/10). Partie solo légale contre le
 * bot (carte procédurale, GOD-MODE) : le bot « gère son empire » — D1
 * worked tiles pondérés, D2 production arbitrée, D3 recherche orientée,
 * D4 rush discipliné. Erik jugera à l'ŒIL (villes qui croissent, marteaux
 * bien placés, files cohérentes).
 * Captures : dev-logs/captures-bot-tb/
 * Usage : node devtmp/bot-tb-gui.mjs [portWorker] [portVite] [tours]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // le proxy Vite (/api,/ws) est figé sur 8787
const PORTG = process.argv[3] ?? '5174'; // port strict (vite.config.ts, APP_BASE_URL)
const NBTOURS = Number(process.argv[4] ?? '12');
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bot-tb';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikBotTB${STAMP}`;
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
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
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

/** Résumé économie du bot pour un tour (trace data-driven). */
function resumeBot(st) {
  const villes = Object.values(st.cities)
    .filter((c) => c.owner === BOT)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      hex: `${c.q},${c.r}`,
      pop: c.pop,
      foodStored: c.foodStored,
      workedTiles: c.workedTiles,
      production: c.production ? `${c.production.item.kind}:${c.production.item.id} (${c.production.progress})` : null,
      batiments: c.buildings,
      merveilles: c.wonders,
    }));
  const p = st.players[BOT];
  return {
    turn: st.turn,
    treasury: p.treasury,
    researching: p.researching,
    techs: (p.techsUnlocked ?? []).length,
    government: p.government,
    unites: Object.values(st.units).filter((u) => u.owner === BOT).length,
    villes,
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
  const st0 = (await dumpFull(code)).state;

  const page = await ctx.newPage();
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  // GOD-MODE : révélation complète pour observer le bot
  await page.keyboard.press('Control+j'); await sleep(150);
  await page.keyboard.press('w');
  await page.waitForSelector('.godmode', { timeout: 10000 });
  console.log('[god-mode] ON');

  let capHex = null;
  for (let t = 0; t < NBTOURS; t++) {
    if (!(await finirTour(code))) throw new Error(`tour ${t} non avancé`);
    const st = (await dumpFull(code)).state;
    const r = resumeBot(st);
    trace.push(r);
    const cap = Object.values(st.cities).find((c) => c.owner === BOT && c.capital) ?? Object.values(st.cities).find((c) => c.owner === BOT);
    if (cap) capHex = { q: cap.q, r: cap.r };
    console.log(`[t${st.turn}] trésor=${r.treasury} tech=${r.researching ?? '—'} (${r.techs}) villes=${r.villes.map((v) => `${v.hex} p${v.pop} [${v.production ?? '—'}] wt=${v.workedTiles.length}`).join(' | ')}`);
    if (t === 2 || t === Math.floor(NBTOURS / 2)) {
      if (capHex) {
        await page.evaluate((h) => window.__gameCanvas.centerOn(h), capHex);
        await sleep(1800);
        await page.screenshot({ path: `${CAP}/t${st.turn}-zoom-capitale.png` });
        console.log(`  [capture] t${st.turn} zoom capitale`);
      }
    }
  }
  if (capHex) {
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), capHex);
    await sleep(1800);
  }
  await page.screenshot({ path: `${CAP}/final.png` });

  // ---- verdicts (l'ŒIL d'Erik juge les captures ; ici : les mécaniques) ----
  const dernier = trace[trace.length - 1];
  const premier = trace.find((e) => e.villes.length > 0) ?? dernier;
  assert(dernier.villes.length > 0, `le bot a des villes (${dernier.villes.length})`);
  assert(dernier.villes.some((v) => v.pop > premier.villes[0].pop), `les villes CROISSENT (pop ${premier.villes[0].pop} → ${Math.max(...dernier.villes.map((v) => v.pop))})`);
  assert(dernier.villes.every((v) => v.workedTiles.length > 0 || v.pop === 0), 'worked tiles assignés dans chaque ville (D1)');
  const sommeWt = dernier.villes.reduce((s, v) => s + v.workedTiles.length, 0);
  const sommePop = dernier.villes.reduce((s, v) => s + v.pop, 0);
  assert(sommeWt <= sommePop, `worked tiles ≤ pop (plafond respecté : ${sommeWt}/${sommePop})`);
  assert(dernier.researching !== null || dernier.techs > 0, `recherche orientée en cours ou techs débloquées (${dernier.researching}, ${dernier.techs} techs)`);
  assert(dernier.techs >= premier.techs, `la tech progression ne régresse pas (${premier.techs} → ${dernier.techs})`);
  assert(dernier.villes.every((v) => v.production !== null), 'chaque ville a une file de production (D2)');
  const items = new Set(dernier.villes.map((v) => v.production));
  console.log(`  [info] files en fin de banc : ${[...items].join(', ')}`);

  writeFileSync(`${CAP}/trace-tours.json`, JSON.stringify(trace, null, 2));
  writeFileSync(
    `${CAP}/trace.md`,
    `# BOT-TB — banc e2e ${STAMP} (partie ${code})\n\n` +
      trace.map((e) =>
        `t${e.turn} trésor=${e.treasury} recherche=${e.researching ?? '—'} techs=${e.techs} unités=${e.unites}\n` +
        e.villes.map((v) => `  ${v.hex} pop=${v.pop} food=${v.foodStored} workedTiles=[${v.workedTiles.join(' ')}] prod=${v.production} bât=[${v.batiments.join(',')}]\n`).join(''),
      ).join('\n'),
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
