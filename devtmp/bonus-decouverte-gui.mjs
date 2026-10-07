/**
 * BONUS-DECOUVERTE — vérification GUI réelle (L4, handoff 07/10).
 * Scénarios (décisions Erik D1-D5) :
 *  A. partie solo, capitale CÔTIÈRE (science R-107) → chaîne alphabet →
 *     ecriture → maconnerie → mathematiques → NAVIGATION : le Galion bonus
 *     spawn sur une case d'EAU du rayon (JAMAIS sur terre) avec une MILICE à
 *     bord (dump naval.transports cargoType=milice) ; captures carte + chroniques.
 *  B. même partie → CODE DES LOIS : Comptoir dans la ville au plus de déserts
 *     (rayon actuel, sinon potentiel) — ou annulation chroniquée si aucun
 *     désert (D5, issue valide).
 *  C. partie solo INTÉRIEURE (aucune case d'eau dans le rayon de la capitale)
 *     → Navigation : AUCUN galion, chronique « aucun port valide — Galion non
 *     accordé » (D5).
 * Captures : dev-logs/captures-bonus-decouverte/.
 * Usage : node devtmp/bonus-decouverte-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // port du proxy Vite — page et script partagent UNE instance
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bonus-decouverte';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
const MOI = 'p1';

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
// ---- wrangler : workerd fige après ~10-15 tours (piège connu) — port DÉDIÉ,
// redémarrage automatique, adoption d'un wrangler sain déjà en place.
let wrangler = null;
function tuerPort(P) {
  const { execSync } = require('node:child_process');
  // 1. Les parents node wrangler d'abord (sinon ils relancent leur proxy).
  try {
    execSync('powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Erik/ZCodeProject/devtmp/tue-wrangler.ps1', { stdio: 'ignore', timeout: 60000 });
  } catch {}
  // 2. Les écouteurs restants du port.
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
let tokenGlobal = null;
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g, order) => g.send({ proto: 1, type: 'SubmitOrder', order });
const mesVillesDe = (st) => Object.values(st.cities).filter((c) => c.owner === MOI).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
/** Piège connu : le WebSocket meurt EN SILENCE (workerd à moitié figé — HTTP
 *  vivant, WS mort) et l'EndTurn part dans le vide. On vérifie la socket. */
async function assurerSocket(codeJeu) {
  if (g && g.readyState === 1) return;
  try { g?.close(); } catch {}
  g = wsConnect(`/ws/game/${codeJeu}`, tokenGlobal);
  await g.open;
  await g.waitFor('Welcome');
  console.log('  [ws] reconnecté');
}
/** La science ne coule que si des citoyens travaillent l'EAU (3 commerce —
 *  R-107) : l'auto-assignation met tout sur la nourriture. Migration UN
 *  citoyen par tour vers la case d'eau la plus proche (SetWorkedTile). */
async function migrerCitoyensVersEau(g, codeJeu, st) {
  for (const v of mesVillesDe(st)) {
    const candidates = [];
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        if (dq === 0 && dr === 0) continue;
        const t = st.map[`${v.q + dq},${v.r + dr}`];
        if (t && (t.terrain === 'eau' || t.terrain === 'ocean')) candidates.push({ q: v.q + dq, r: v.r + dr });
      }
    }
    if (candidates.length === 0) continue;
    const surEau = new Set((v.workedTiles ?? []).filter((k) => {
      const [q, r] = k.split(',').map(Number);
      const t = st.map[k];
      return t && (t.terrain === 'eau' || t.terrain === 'ocean');
    }));
    const aEau = candidates.find((h) => !surEau.has(`${h.q},${h.r}`));
    if (!aEau) continue;
    const plein = (v.workedTiles ?? []).length >= v.pop;
    if (plein) {
      // Ville pleine : le null retirerait le DERNIER assigné (éventuellement
      // notre propre eau — migration à l'identique). Désélection EXACTE d'une
      // case de nourriture travaillée (R-60), puis la case d'eau libre.
      const nourriture = (v.workedTiles ?? []).find((k) => !surEau.has(k));
      if (!nourriture) continue;
      ordre(g, { type: 'SetWorkedTile', cityId: v.id, tile: nourriture });
    }
    ordre(g, { type: 'SetWorkedTile', cityId: v.id, tile: `${aEau.q},${aEau.r}` });
  }
}
async function finirTour(g, codeJeu, techRepli = null) {
  for (let essai = 0; essai < 6; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket(codeJeu);
    for (const v of mesVillesDe(stv)) {
      if (!v.production && (v.queue ?? []).length === 0) {
        ordre(g, { type: 'QueueProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
        await sleep(600);
      }
    }
    await migrerCitoyensVersEau(g, codeJeu, stv);
    if (!stv.players[MOI].researching) {
      // R-184 : EndTurn refusé sans recherche — le repli VALIDE LES PRÉREQUIS
      // de chaque candidate (techRepli compris : un SetResearch refusé laisse
      // researching null et bloque la fin de tour pour toujours).
      const connue = new Set(stv.players[MOI].techsUnlocked);
      const eligibles = Object.entries(TECHS_DATA)
        .filter(([k, t]) => !connue.has(k) && (t.prereqs ?? []).every((pr) => connue.has(pr)))
        .sort((a, b) => a[1].cost - b[1].cost)
        .map(([k]) => k);
      const cand = [techRepli, ...eligibles].find((t) => t && !connue.has(t) && eligibles.includes(t));
      if (cand) {
        g.send({ proto: 1, type: 'SetResearch', techId: cand });
        await sleep(600);
      }
    }
    g.send({ proto: 1, type: 'EndTurn' });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(codeJeu)).state.turn > avant) return true;
    }
    console.log('  [finirTour] tour non avancé — nouvelle essaie');
    if (essai >= 2) {
      // Socket suspecte ou workerd à moitié figé : redémarrage complet.
      console.log('  [finirTour] redémarrage wrangler forcé');
      await demarrerWrangler(true);
      await assurerSocket(codeJeu);
    }
  }
  return false;
}
async function attendreTech(g, codeJeu, techId, maxTours = 120) {
  for (let i = 0; i < maxTours; i++) {
    const st = (await dumpFull(codeJeu)).state;
    if (st.players[MOI].techsUnlocked.includes(techId)) return st;
    if (i % 15 === 0) console.log(`  [tech] t${st.turn} ${techId} : progres=${st.players[MOI].scienceProgress[techId] ?? 0}`);
    g.send({ proto: 1, type: 'SetResearch', techId });
    for (const v of mesVillesDe(st)) {
      if (!v.production && (v.queue ?? []).length === 0) {
        ordre(g, { type: 'QueueProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
      }
    }
    g.send({ proto: 1, type: 'SetResearch', techId });
    await sleep(400);
    if (!(await finirTour(g, codeJeu, techId))) throw new Error(`tour non avancé (attente ${techId})`);
  }
  throw new Error(`tech ${techId} non complétée en ${maxTours} tours`);
}

// ---- helpers BONUS-DECOUVERTE ------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const distAx = (a, b) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
/** Cases du terrain dans le rayon (sans wrap — on reste loin des bords). */
function compterTerrain(st, hex, terrain, rayon) {
  let n = 0;
  for (let dq = -rayon; dq <= rayon; dq++) {
    for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
      const t = st.map[`${hex.q + dq},${hex.r + dr}`];
      if (t && t.terrain === terrain && !(dq === 0 && dr === 0)) n += 1;
    }
  }
  return n;
}
/** Plus proche case du terrain dans le rayon donné (pour centreOn). */
function caseTerrainProche(st, hex, terrain, rayon) {
  let best = null;
  const w = st.mapWidth;
  for (let dq = -rayon; dq <= rayon; dq++) {
    for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
      if (dq === 0 && dr === 0) continue;
      const h = { q: hex.q + dq, r: hex.r + dr };
      const t = st.map[`${h.q},${h.r}`];
      if (t && t.terrain === terrain && (!best || distAx(h, hex) < distAx(best, hex))) best = h;
    }
  }
  return best;
}

async function ouvrirPage(ctx, code, token) {
  // Session posée par partie (le jeton change entre A et C).
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  return page;
}
async function captureChroniques(page, nom) {
  await sleep(800);
  const loc = page.locator('section.panel', { hasText: 'Chroniques' }).first();
  try {
    await loc.screenshot({ path: `${CAP}/${nom}.png` });
  } catch {
    await page.screenshot({ path: `${CAP}/${nom}.png` });
  }
  const txt = await page.evaluate(() => document.body.innerText);
  return txt.replace(/\s+/g, ' ');
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

/**
 * Fondation de la capitale : `cible` = 'cote' (case côtière) ou 'interieur'
 * (aucune case d'eau dans le rayon 2). Retourne { code, st } après fondation
 * + conversion science.
 */
async function partieAvecCapitale(token, suffixe, cible) {
  const code = await creerPartie(token);
  console.log(`[${suffixe}] partie ${code}`);
  g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
  let st = (await dumpFull(code)).state;
  const colon = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
  const passable = (q, r) => {
    const t = st.map[`${q},${r}`];
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
  const eauDansRayon = (q, r, rayon) => {
    for (let dq = -rayon; dq <= rayon; dq++) {
      for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
        const t = st.map[`${q + dq},${r + dr}`];
        if (t && (t.terrain === 'eau' || t.terrain === 'ocean')) return true;
      }
    }
    return false;
  };
  const okIci = (q, r) => (cible === 'cote' ? eauDansRayon(q, r, 1) : !eauDansRayon(q, r, 2));
  // BFS vers la première case satisfaisant `okIci` (≤ 12 pas).
  const cle = (q, r) => `${q},${r}`;
  const file = [[colon.q, colon.r]];
  const prec = new Map([[cle(colon.q, colon.r), null]]);
  let but = null;
  while (file.length > 0 && !but) {
    const [q, r] = file.shift();
    if (okIci(q, r) && (q !== colon.q || r !== colon.r)) { but = { q, r }; break; }
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (prec.has(k) || !passable(nq, nr)) continue;
      prec.set(k, cle(q, r));
      file.push([nq, nr]);
    }
  }
  if (but) {
    const chemin = [];
    let k = cle(but.q, but.r);
    while (k) { const [a, b] = k.split(',').map(Number); chemin.unshift({ q: a, r: b }); k = prec.get(k); }
    console.log(`[${suffixe}] marche ${chemin.length - 1} pas vers (${but.q},${but.r})`);
    ordre(g, { type: 'Move', unitId: colon.id, path: chemin.slice(1) });
    for (let i = 0; i < 24; i++) {
      if (!(await finirTour(g, code))) throw new Error('tour non avancé (marche)');
      st = (await dumpFull(code)).state;
      const u = st.units[colon.id];
      if (u.q === but.q && u.r === but.r) break;
    }
  } else {
    console.log(`[${suffixe}] aucune case ${cible} accessible — fondation sur place 🔶`);
  }
  ordre(g, { type: 'FoundCity', unitId: colon.id });
  await finirTour(g, code);
  st = (await dumpFull(code)).state;
  const ville = mesVillesDe(st)[0];
  console.log(`[${suffixe}] t${st.turn} capitale ${ville.id} (${ville.q},${ville.r}) — eau r1=${eauDansRayon(ville.q, ville.r, 1)} r2=${eauDansRayon(ville.q, ville.r, 2)}`);
  g.send({ proto: 1, type: 'SetConversion', cityId: ville.id, target: 'science' });
  return { code, st, ville };
}

let echecs = [];
// ============================================================
// A + B — partie côtière : Galion+Milice (Navigation), Comptoir (Code des lois)
// ============================================================
{
  const NOM = `ErikBonusA${STAMP}`;
  const token = await login(NOM);
  tokenGlobal = token;
  let ok = false;
  for (let tentative = 1; tentative <= 2 && !ok; tentative++) {
    console.log(`=== Partie A (côtière), tentative ${tentative} ===`);
    const { code, ville } = await partieAvecCapitale(token, `A${tentative}`, 'cote');
    // La page est ouverte PENDANT la partie (piège connu : le snapshot ne
    // rejoue que la DERNIÈRE résolution — la Chronique doit vivre les
    // événements en direct, sinon l'entrée est perdue).
    const page = await ouvrirPage(ctx, code, token);
    console.log('[A] chaîne alphabet → ecriture → maconnerie → mathematiques → navigation…');
    await attendreTech(g, code, 'alphabet', 90);
    await attendreTech(g, code, 'ecriture', 120);
    await attendreTech(g, code, 'poterie', 90);
    await attendreTech(g, code, 'maconnerie', 120);
    await attendreTech(g, code, 'mathematiques', 150);
    const stNav = await attendreTech(g, code, 'navigation', 180);
    const premier = stNav.firstBy?.navigation;
    console.log(`[A] t${stNav.turn} Navigation complétée — Premier découvrir : ${premier}`);
    if (premier !== MOI) {
      console.log(`🔶 le bot (${premier}) a été Premier découvrir — l'annulation/récompense est allée chez lui ; nouvelle tentative`);
      await page.close().catch(() => {});
      continue;
    }
    // Le Galion bonus : case d'eau + Milice à bord (dump naval.transports).
    const dump = await dumpFull(code);
    const galions = Object.values(dump.state.units).filter((u) => u.owner === MOI && u.type === 'galion' && !u.aboard);
    if (galions.length !== 1) { console.log(`🔴 galions p1 = ${galions.length}`); process.exit(1); }
    const gal = galions[0];
    const tGal = dump.state.map[`${gal.q},${gal.r}`]?.terrain;
    const transport = (dump.naval?.transports ?? []).find((t) => t.id === gal.id);
    console.log(`[A] Galion ${gal.id} à (${gal.q},${gal.r}) terrain=${tGal} cargo=${transport?.cargoType ?? '?'}`);
    const milices = Object.values(dump.state.units).filter((u) => u.type === 'milice' && u.aboard === gal.id);
    if (!['eau', 'ocean'].includes(tGal)) { console.log('🔴 le Galion bonus est sur TERRE'); process.exit(1); }
    if (milices.length !== 1 || transport?.cargoType !== 'milice') { console.log('🔴 pas de Milice à bord'); process.exit(1); }
    // Captures : carte centrée sur le Galion + Chroniques. Si la socket de la
    // page est morte pendant la résolution, un RECHARGEMENT suffit : la
    // snapshot inclut les événements de la dernière résolution (Navigation).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
    await sleep(2500);
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: gal.q, r: gal.r });
    await sleep(1200);
    await page.screenshot({ path: `${CAP}/A1-galion-en-mer-milice-a-bord.png` });
    let txt = await captureChroniques(page, 'A2-chroniques-galion');
    if (!txt.includes('Un Galion gratuit')) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
      await sleep(3000);
      txt = await captureChroniques(page, 'A2-chroniques-galion');
    }
    const galionChronique = txt.includes('Un Galion gratuit');
    console.log(`[A] chronique « Un Galion gratuit » visible : ${galionChronique}`);
    if (!galionChronique) { console.log('🔴 entrée Chroniques absente'); await page.screenshot({ path: `${CAP}/Z-echec-chronique-galion.png` }); process.exit(1); }

    // ---- B — Code des lois : Comptoir (désert) ou annulation chroniquée ----
    console.log('[B] code_des_lois…');
    const stAvant = (await dumpFull(code)).state;
    const cap = stAvant.cities[ville.id];
    const desertsR1 = compterTerrain(stAvant, { q: cap.q, r: cap.r }, 'desert', 1);
    const desertsR2 = compterTerrain(stAvant, { q: cap.q, r: cap.r }, 'desert', 2);
    console.log(`[B] déserts autour de la capitale : r1=${desertsR1} r2=${desertsR2}`);
    const stCdl = await attendreTech(g, code, 'code_des_lois', 120);
    const premier2 = stCdl.firstBy?.code_des_lois;
    console.log(`[B] t${stCdl.turn} Code des lois complété — Premier découvrir : ${premier2}`);
    if (premier2 !== MOI) {
      console.log(`🔶 le bot (${premier2}) a été Premier découvrir de code_des_lois 🔶 (issue non rejouable cette partie)`);
    } else {
      const dump2 = await dumpFull(code);
      const cap2 = dump2.state.cities[ville.id];
      const aComptoir = cap2.buildings.includes('comptoir_commercial');
      const ev = (dump2.lastEvents ?? []).filter((e) => e.type === 'FirstDiscovered' && e.tech === 'code_des_lois').at(-1);
      console.log(`[B] comptoir=${aComptoir} notGranted=${ev?.notGranted ?? '(aucun)'}`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
      await sleep(2500);
      if (desertsR2 > 0) {
        if (!aComptoir) { console.log('🔴 Comptoir attendu dans la capitale (déserts présents) — absent'); process.exit(1); }
        const dCase = caseTerrainProche(dump2.state, { q: cap2.q, r: cap2.r }, 'desert', 2);
        await page.evaluate((h) => window.__gameCanvas.centerOn(h), dCase ?? { q: cap2.q, r: cap2.r });
        await sleep(1200);
        await page.screenshot({ path: `${CAP}/B1-comptoir-ville-desert.png` });
      } else {
        if (aComptoir) { console.log('🔴 Comptoir accordé SANS aucun désert (politique D3 violée)'); process.exit(1); }
        if (!/aucune case de Désert/.test(ev?.notGranted ?? '')) { console.log('🔴 annulation D3 non chroniquée'); process.exit(1); }
      }
      const txt2 = await captureChroniques(page, desertsR2 > 0 ? 'B2-chroniques-comptoir' : 'B2-chroniques-annulation-desert');
      if (desertsR2 === 0 && !txt2.includes('Comptoir commercial non accordé')) {
        console.log('🔴 la chronique d\'annulation n\'apparaît pas dans l\'UI');
        await page.screenshot({ path: `${CAP}/Z-echec-chronique-desert.png` });
        process.exit(1);
      }
    }
    await page.close().catch(() => {});
    ok = true;
  }
  if (!ok) { console.log('🔶 Partie A : le bot a remporté les deux courses — captures A/B non produites 🔶'); echecs.push('A:course-perdue'); }
}

// ============================================================
// C — partie intérieure : Navigation SANS port → annulation chroniquée (D5)
// ============================================================
{
  const NOM = `ErikBonusC${STAMP}`;
  const token = await login(NOM);
  tokenGlobal = token;
  let ok = false;
  for (let tentative = 1; tentative <= 2 && !ok; tentative++) {
    console.log(`=== Partie C (intérieure), tentative ${tentative} ===`);
    const { code } = await partieAvecCapitale(token, `C${tentative}`, 'interieur');
    const page = await ouvrirPage(ctx, code, token); // page ouverte PENDANT la partie
    console.log('[C] chaîne → navigation (aucune ville côtière attendue)…');
    await attendreTech(g, code, 'alphabet', 90);
    await attendreTech(g, code, 'ecriture', 120);
    await attendreTech(g, code, 'poterie', 90);
    await attendreTech(g, code, 'maconnerie', 120);
    await attendreTech(g, code, 'mathematiques', 150);
    const stNav = await attendreTech(g, code, 'navigation', 180);
    const premier = stNav.firstBy?.navigation;
    console.log(`[C] t${stNav.turn} Navigation complétée — Premier découvrir : ${premier}`);
    if (premier !== MOI) { console.log(`🔶 bot premier (${premier}) — nouvelle tentative`); await page.close().catch(() => {}); continue; }
    const dump = await dumpFull(code);
    const galionsP1 = Object.values(dump.state.units).filter((u) => u.owner === MOI && u.type === 'galion' && !u.aboard);
    const ev = (dump.lastEvents ?? []).filter((e) => e.type === 'FirstDiscovered' && e.tech === 'navigation').at(-1);
    console.log(`[C] galions p1=${galionsP1.length} notGranted=${ev?.notGranted ?? '(aucun)'}`);
    if (galionsP1.length !== 0) { console.log('🔴 un Galion est apparu alors qu\'aucune ville n\'a de case d\'eau'); process.exit(1); }
    if (!/aucun port valide — Galion non accordé/.test(ev?.notGranted ?? '')) {
      console.log('🔴 annulation D1 non consignée dans lastEvents');
      process.exit(1);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
    await sleep(2500);
    let txt = await captureChroniques(page, 'C1-chroniques-aucun-port-valide');
    if (!txt.includes('aucun port valide — Galion non accordé')) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
      await sleep(3000);
      txt = await captureChroniques(page, 'C1-chroniques-aucun-port-valide');
    }
    if (!txt.includes('aucun port valide — Galion non accordé')) {
      console.log('🔴 la chronique « aucun port valide » n\'apparaît pas dans l\'UI');
      await page.screenshot({ path: `${CAP}/Z-echec-chronique-port.png` });
      process.exit(1);
    }
    await page.close();
    ok = true;
  }
  if (!ok) { console.log('🔶 Partie C : bot premier deux fois — annulation non capturée 🔶'); echecs.push('C:course-perdue'); }
}

await browser.close();
const bloquant = echecs.filter((e) => !e.endsWith(':course-perdue'));
console.log(`[verdict] ${bloquant.length === 0 ? 'PASS ✅' : `ÉCHEC 🔴 ${bloquant.join(', ')}`} ${echecs.some((e) => e.endsWith(':course-perdue')) ? '(🔶 course Premier découvrir perdue contre le bot sur une partie)' : ''}`);
process.exit(bloquant.length === 0 ? 0 : 1);
