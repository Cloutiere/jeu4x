/**
 * BOT-EXPLORATION — banc e2e GUI (L3, handoff 23/10).
 * Partie solo légale contre le bot, GOD-MODE pour observer : la PREMIÈRE
 * unité du bot PATROUILLE en boucle autour de sa capitale (jamais fortifiée
 * en ville), puis à la 2e unité la capitale est tenue (garnison).
 * Captures : dev-logs/captures-bot-exploration/ + trace des positions.
 * Usage : node devtmp/bot-exploration-gui.mjs [portWorker] [portVite]
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
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bot-exploration';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikBotExplo${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const RAYON_PATROUILLE = 3;

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
function dist(a, b, W) { // hexDistanceW miroir (axiale, wrap Est-Ouest)
  const dq = a.q - b.q, dr = a.r - b.r;
  let x = Math.abs(dq), y = Math.abs(dr), z = Math.abs(dq + dr);
  if (Math.abs(dq + dr) * 2 > W) { // wrap : ré-ancrage sur la largeur
    const alt = Math.abs(dq - Math.sign(dq + dr) * W);
    x = Math.min(x, Math.abs(alt)); z = Math.min(z, Math.abs(alt + dr));
  }
  return Math.max(x, y, z);
}
const combattantesBot = (st) => Object.values(st.units).filter((u) => u.owner === BOT && !u.aboard).sort((a, b) => a.id < b.id ? -1 : 1);

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
  let st0 = (await dumpFull(code)).state;
  // le bot fonde SA capitale à la résolution du tour 1 — on avance d'abord
  tokenGlobal = token;
  await assurerSocket(code);
  await finirTour(code);
  st0 = (await dumpFull(code)).state;
  const capBot = Object.values(st0.cities).find((c) => c.owner === BOT);
  if (!capBot) throw new Error('pas de capitale bot après t1');
  console.log(`[bot] capitale (${capBot.q},${capBot.r})`);

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

  // Boucle de tours : suivre le scout jusqu'à la montée en défense.
  let tour2eUnite = null;
  let tourCapitaleTenue = null;
  let captureBoucle = 0;
  const MOUVEMENTS_MIN = 4;
  const tourMax = 30;
  for (let t = st0.turn + 1; t <= tourMax; t++) {
    const st = (await dumpFull(code)).state;
    const unitees = combattantesBot(st);
    const scout = unitees[0];
    const dCap = dist({ q: scout.q, r: scout.r }, capBot, st.mapWidth);
    const capTenu = unitees.some((u) => u.id !== scout.id && u.q === capBot.q && u.r === capBot.r);
    const surVille = Object.values(st.cities).some((c) => c.owner === BOT && c.q === scout.q && c.r === scout.r);
    trace.push({ turn: st.turn, scout: `${scout.q},${scout.r}`, dCap, nbBot: unitees.length, capTenu, scoutFortifie: !!scout.fortified, scoutSurVille: surVille });
    console.log(`  t${st.turn} scout (${scout.q},${scout.r}) dCap=${dCap} bot×${unitees.length} capTenue=${capTenu}`);

    // captures : les 3 premiers tours de boucle, puis la 2e unité
    if (captureBoucle < 3 && unitees.length === 1 && !surVille) {
      captureBoucle++;
      await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: scout.q, r: scout.r });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/boucle-t${String(st.turn).padStart(2, '0')}-scout-${scout.q}-${scout.r}.png` });
      console.log(`  [capture] boucle t${st.turn}`);
    }
    if (unitees.length >= 2 && tour2eUnite === null) {
      tour2eUnite = st.turn;
      await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capBot.q, r: capBot.r });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/2e-unite-t${String(st.turn).padStart(2, '0')}.png` });
      console.log(`  [capture] 2e unité t${st.turn}`);
    }
    if (tour2eUnite !== null && tourCapitaleTenue === null && capTenu) {
      tourCapitaleTenue = st.turn;
      await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capBot.q, r: capBot.r });
      await sleep(1800);
      await page.screenshot({ path: `${CAP}/capitale-tenue-t${String(st.turn).padStart(2, '0')}.png` });
      console.log(`  [capture] capitale tenue t${st.turn}`);
    }

    // critères de sortie : boucle observée assez longtemps + défense en place
    const toursBoucle = trace.filter((e) => e.nbBot === 1 && !e.scoutSurVille && !e.scoutFortifie).length;
    if (tourCapitaleTenue !== null && toursBoucle >= MOUVEMENTS_MIN) break;
    if (!(await finirTour(code))) throw new Error(`tour t${st.turn} non avancé`);
  }

  // ---- verdicts ----
  const boucle = trace.filter((e) => e.nbBot === 1);
  assert(boucle.length >= MOUVEMENTS_MIN, `la boucle de patrouille est observable (${boucle.length} tours à 1 unité)`);
  assert(boucle.every((e) => !e.scoutFortifie), 'le scout n\'est JAMAIS fortifié pendant la patrouille');
  assert(boucle.every((e) => !e.scoutSurVille), 'le scout ne siège PAS en ville pendant la patrouille');
  const enBoucle = boucle.slice(1); // le 1er tour, il sort de la capitale
  assert(enBoucle.every((e) => e.dCap <= RAYON_PATROUILLE), `le scout reste dans le rayon ${RAYON_PATROUILLE} de la capitale (boucle, pas d'errance)`);
  assert(boucle.filter((e) => e.dCap > 0).length >= MOUVEMENTS_MIN, 'le scout BOUGE réellement (pas de siège immobile)');
  assert(tour2eUnite !== null, `une 2e unité bot est apparue (t${tour2eUnite})`);
  assert(tourCapitaleTenue !== null, `la capitale est tenue dès la 2e unité (t${tourCapitaleTenue})`);
  if (tour2eUnite !== null && tourCapitaleTenue !== null) {
    assert(tourCapitaleTenue - tour2eUnite <= 6, `montée en défense rapide (${tourCapitaleTenue - tour2eUnite} tours — production + marche, rappels D3 compris)`);
  }

  writeFileSync(`${CAP}/trace-tours.json`, JSON.stringify(trace, null, 2));
  const lignes = trace.map((e) => `t${e.turn} scout(${e.scout}) dCap=${e.dCap} bot×${e.nbBot} capTenue=${e.capTenu} fortifié=${e.scoutFortifie} surVille=${e.scoutSurVille}`);
  writeFileSync(`${CAP}/trace.md`, `# BOT-EXPLORATION — banc e2e ${STAMP}\n\n${lignes.join('\n')}\n`);
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
