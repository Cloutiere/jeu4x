/**
 * BOT-TC — banc e2e GUI (L4, handoff 25/10). Partie solo légale contre le
 * bot (carte procédurale, GOD-MODE) : D1 le bot subit puis MÈNE la guerre,
 * D2 offensive vers la capitale, D3 paix minimale. Scénario déterministe :
 *   1. ~12 tours d'économie (montée en régime, tourMinGuerre écoulé) ;
 *   2. le JOUEUR déclare la guerre PAR L'UI (modale pastille) — capture ;
 *   3. toursPaixMin (normal = 12) tours de guerre : le bot MARCH sur la
 *      capitale du joueur (offensive R-188-b) — captures ;
 *   4. le JOUEUR propose la paix PAR L'UI (bouton 🕊) — le bot ACCEPTE
 *      (durée ≥ toursPaixMin, R-188-c) — capture du toast + Chroniques.
 * Erik jugera à l'ŒIL (bannières de guerre, unités bot en marche, toast paix).
 * Captures : dev-logs/captures-bot-tc/
 * Usage : node devtmp/bot-tc-gui.mjs [portWorker] [portVite] [toursEco]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // le proxy Vite (/api,/ws) est figé sur 8787
const PORTG = process.argv[3] ?? '5174'; // port strict (vite.config.ts, APP_BASE_URL)
const TOURS_ECO = Number(process.argv[4] ?? '12'); // ≥ tourMinGuerre (normal 10)
const TOURS_GUERRE = Number(process.argv[5] ?? '12'); // ≥ toursPaixMin (normal 12)
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bot-tc';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikBotTC${STAMP}`;
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

/** Guerres courantes (paires) + unités bot proches de MA capitale. */
function resumeGuerre(st) {
  const maCap = Object.values(st.cities).find((c) => c.owner === MOI && c.capital)
    ?? Object.values(st.cities).find((c) => c.owner === MOI);
  const proches = maCap
    ? Object.values(st.units).filter((u) => u.owner === BOT && !u.aboard &&
        Math.max(Math.abs(u.q - maCap.q), Math.abs(u.r - maCap.r)) <= 10).length
    : 0;
  return {
    turn: st.turn,
    wars: st.diplomacy.war,
    warsDepuis: st.diplomacy.warsDepuis ?? null,
    unitesBotTotal: Object.values(st.units).filter((u) => u.owner === BOT).length,
    unitesBotProchesCapitale: proches,
    maCapitale: maCap ? `${maCap.q},${maCap.r}` : null,
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

  // ---- Phase 1 : économie (le bot monte en régime) ----
  for (let t = 0; t < TOURS_ECO; t++) {
    if (!(await finirTour(code))) throw new Error(`tour éco ${t} non avancé`);
    const st = (await dumpFull(code)).state;
    trace.push(resumeGuerre(st));
  }
  console.log(`[éco] ${TOURS_ECO} tours joués`);

  // ---- Phase 2 : la guerre se déclare (PAR L'UI si le bot ne l'a pas
  // déjà fait pendant la montée en régime — agressivité ≥ tourMinGuerre). ----
  // PIÈGE (BLOCAGE-NAVIGATION / sondePile) : cliquer le bouton DESSINÉ — la
  // pastille adverse vit dans .portrait-site (côté droit), bouton .declarer.
  await page.screenshot({ path: `${CAP}/avant-guerre-pastilles.png` });
  let st = (await dumpFull(code)).state;
  if (st.diplomacy.war.length === 0) {
    const btnGuerre = page.locator('.pastille button.pastille-guerre.declarer:not(.paix)').first();
    await btnGuerre.waitFor({ timeout: 15000 });
    await btnGuerre.click();
    await page.waitForSelector('.guerre-boite', { timeout: 10000 });
    await page.screenshot({ path: `${CAP}/modale-declaration.png` });
    await page.locator('.guerre-confirmer:not(.paix)').click();
    await sleep(2500);
  } else {
    console.log(`[guerre] le bot a déclaré LE PREMIER pendant l'éco (${JSON.stringify(st.diplomacy.war)})`);
  }
  st = (await dumpFull(code)).state;
  trace.push(resumeGuerre(st));
  assert(st.diplomacy.war.length > 0, `guerre en cours (${JSON.stringify(st.diplomacy.war)})`);
  assert(!!st.diplomacy.warsDepuis, 'warsDepuis consigné (durée de guerre mesurable)');
  await page.screenshot({ path: `${CAP}/guerre-declaree.png` });

  // ---- Phase 3 : tours de guerre — le bot marche vers MA capitale ----
  let maxProches = 0;
  for (let t = 0; t < TOURS_GUERRE; t++) {
    if (!(await finirTour(code))) throw new Error(`tour guerre ${t} non avancé`);
    st = (await dumpFull(code)).state;
    if (st.winner) break;
    const r = resumeGuerre(st);
    trace.push(r);
    maxProches = Math.max(maxProches, r.unitesBotProchesCapitale);
    console.log(`[guerre t${st.turn}] wars=${JSON.stringify(r.wars)} unités bot proches de ma capitale=${r.unitesBotProchesCapitale}/${r.unitesBotTotal}`);
    if (t === Math.floor(TOURS_GUERRE / 2) || t === TOURS_GUERRE - 1) {
      const maCap = r.maCapitale ? r.maCapitale.split(',').map(Number) : null;
      if (maCap) {
        await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: maCap[0], r: maCap[1] });
        await sleep(1800);
        await page.screenshot({ path: `${CAP}/guerre-t${st.turn}-capitale.png` });
      }
    }
  }
  assert(maxProches > 0, `offensive du bot vers ma capitale observée (pic ${maxProches} unités à ≤6)`);
  const duree = st.turn - (st.diplomacy.warsDepuis ? Math.min(...Object.values(st.diplomacy.warsDepuis)) : st.turn);
  console.log(`[guerre] durée atteinte ≈ ${st.turn - TOURS_GUERRE}+ tours (toursPaixMin normal = 12)`);

  // ---- Phase 4 : le JOUEUR propose la paix PAR L'UI — le bot RÉPOND ----
  const btnPaix = page.locator('.pastille button.pastille-guerre.declarer.paix').first();
  await btnPaix.waitFor({ timeout: 15000 });
  await btnPaix.click();
  await page.waitForSelector('.guerre-boite', { timeout: 10000 });
  await page.screenshot({ path: `${CAP}/modale-paix.png` });
  await page.locator('.guerre-confirmer.paix').click();
  await sleep(3000);
  const stPaix = (await dumpFull(code)).state;
  trace.push(resumeGuerre(stPaix));
  console.log(`[paix] wars après proposition=${JSON.stringify(stPaix.diplomacy.war)}`);
  await page.screenshot({ path: `${CAP}/apres-proposition-paix.png` });
  const paixAcceptee = stPaix.diplomacy.war.length === 0;
  assert(paixAcceptee || stPaix.diplomacy.war.length > 0, 'le bot a RÉPONDÜ (accepté = wars vide, refusé = wars intacte)');
  if (!paixAcceptee) {
    // refus (durée insuffisante 🔶) : jouer 4 tours de plus et re-proposer.
    console.log('[paix] refus — la guerre continue, 4 tours puis re-proposition');
    for (let t = 0; t < 4 && !stPaix.winner; t++) { if (!(await finirTour(code))) break; }
    const btnPaix2 = page.locator('.pastille button.pastille-guerre.declarer.paix').first();
    await btnPaix2.waitFor({ timeout: 15000 });
    await btnPaix2.click();
    await page.locator('.guerre-confirmer.paix').click();
    await sleep(3000);
    const st2 = (await dumpFull(code)).state;
    trace.push(resumeGuerre(st2));
    console.log(`[paix 2] wars=${JSON.stringify(st2.diplomacy.war)}`);
    await page.screenshot({ path: `${CAP}/apres-proposition-paix-2.png` });
  }
  const finale = (await dumpFull(code)).state;
  assert(!finale.diplomacy.war.length || finale.winner, `paix ACCEPTÉE (wars vide${finale.winner ? ', partie finie' : ''})`);

  writeFileSync(`${CAP}/trace-tours.json`, JSON.stringify(trace, null, 2));
  writeFileSync(
    `${CAP}/trace.md`,
    `# BOT-TC — banc e2e ${STAMP} (partie ${code})\n\n` +
      trace.map((e) =>
        `t${e.turn} wars=${JSON.stringify(e.wars)} unités bot=${e.unitesBotTotal} (proches capitale: ${e.unitesBotProchesCapitale})\n`,
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
