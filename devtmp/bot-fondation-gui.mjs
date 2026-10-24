/**
 * BOT-FONDATION-MOUVEMENT — banc e2e GUI (L3, handoff 24/10).
 * Partie solo légale contre le bot sur carte procédurale (départ COLON —
 * R-64), GOD-MODE pour observer : à la PREMIÈRE résolution, le bot fonde SA
 * capitale ET son guerrier a DÉJÀ bougé (miroir BOT-EXPLORATION — plus de
 * gel du tour de fondation).
 * Captures : dev-logs/captures-bot-fondation/
 * Usage : node devtmp/bot-fondation-gui.mjs [portWorker] [portVite]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // le proxy Vite (/api,/ws) est figé sur 8787
const PORTG = process.argv[3] ?? '5174'; // port strict (vite.config.ts, APP_BASE_URL)
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bot-fondation';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikBotFonda${STAMP}`;
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
function dist(a, b, W) {
  const dq = a.q - b.q, dr = a.r - b.r;
  let x = Math.abs(dq), y = Math.abs(dr), z = Math.abs(dq + dr);
  if (Math.abs(dq + dr) * 2 > W) {
    const alt = Math.abs(dq - Math.sign(dq + dr) * W);
    x = Math.min(x, Math.abs(alt)); z = Math.min(z, Math.abs(alt + dr));
  }
  return Math.max(x, y, z);
}
const unitesBot = (st) => Object.values(st.units).filter((u) => u.owner === BOT && !u.aboard).sort((a, b) => a.id < b.id ? -1 : 1);

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
  if (Object.values(st0.cities).some((c) => c.owner === BOT)) throw new Error('carte sans départ colon : le bot a déjà une ville');
  const colon0 = unitesBot(st0).find((u) => u.type === 'colon');
  const guerrier0 = unitesBot(st0).find((u) => u.type !== 'colon');
  if (!colon0 || !guerrier0) throw new Error(`départ inattendu : colon=${!!colon0} guerrier=${!!guerrier0}`);
  const spawn = { q: guerrier0.q, r: guerrier0.r };
  console.log(`[t0] colon (${colon0.q},${colon0.r}), guerrier (${spawn.q},${spawn.r})`);

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
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), spawn);
  await sleep(1800);
  await page.screenshot({ path: `${CAP}/t0-avant-fondation.png` });
  console.log('  [capture] t0 avant fondation');

  // LA résolution du scénario d'Erik : tour de la FONDATION.
  if (!(await finirTour(code))) throw new Error('tour de fondation non avancé');
  const st1 = (await dumpFull(code)).state;
  const capBot = Object.values(st1.cities).find((c) => c.owner === BOT);
  const guerrier1 = unitesBot(st1).find((u) => u.type !== 'colon');
  const dGuerrier = guerrier1 ? dist(spawn, guerrier1, st1.mapWidth) : -1;
  trace.push({ turn: st1.turn, capitale: capBot ? `${capBot.q},${capBot.r}` : null, guerrier: guerrier1 ? `${guerrier1.q},${guerrier1.r}` : null, deplacement: dGuerrier });
  console.log(`[t1] capitale=${trace[0].capitale} guerrier=${trace[0].guerrier} déplacement=${dGuerrier}`);

  // deux tours de plus pour montrer que la patrouille continue (miroir BOT-EXPLORATION)
  for (let k = 0; k < 2; k++) {
    if (!(await finirTour(code))) throw new Error(`tour supplémentaire ${k} non avancé`);
    const st = (await dumpFull(code)).state;
    const u = unitesBot(st).find((x) => x.type !== 'colon');
    trace.push({ turn: st.turn, capitale: `${capBot?.q},${capBot?.r}`, guerrier: u ? `${u.q},${u.r}` : null, deplacement: u ? dist(spawn, u, st.mapWidth) : -1 });
  }
  if (capBot) {
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capBot.q, r: capBot.r });
    await sleep(1800);
    await page.screenshot({ path: `${CAP}/t1-fondation-guerrier-parti.png` });
    console.log('  [capture] t1 fondation + guerrier parti');
  }

  // ---- verdicts ----
  assert(!!capBot, `la capitale du bot est fondée dès la première résolution (${trace[0]?.capitale})`);
  assert(dGuerrier > 0, `le guerrier a DÉJÀ bougé au tour de la fondation (déplacement ${dGuerrier})`);
  const apres = trace.slice(1).filter((e) => e.guerrier);
  assert(apres.length >= 2 && apres.every((e) => e.guerrier !== trace[0].guerrier || apres.length === 0), 'le mouvement continue les tours suivants (miroir BOT-EXPLORATION)');

  writeFileSync(`${CAP}/trace-tours.json`, JSON.stringify(trace, null, 2));
  writeFileSync(`${CAP}/trace.md`, `# BOT-FONDATION-MOUVEMENT — banc e2e ${STAMP}\n\n${trace.map((e) => `t${e.turn} capitale=${e.capitale} guerrier=${e.guerrier} déplacementDepuisSpawn=${e.deplacement}`).join('\n')}\n`);
  await page.screenshot({ path: `${CAP}/final.png` });
  await browser.close();
  if (echecs.length > 0) { console.log(`ÉCHEC : ${echecs.length} verdict(s) rouge(s)`); process.exitCode = 1; }
  else console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
