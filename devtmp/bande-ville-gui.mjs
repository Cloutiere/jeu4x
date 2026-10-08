/**
 * BANDE-VILLE — vérification GUI réelle (L3, handoff 07/10).
 * Partie solo légale ; capitale fondée AU BORD (couture E↔O proche).
 * Captures dev-logs/captures-bande-ville/ :
 *  t1 capitale file vide (rangée 2 masquée — D4),
 *  t2 capitale item UNITÉ (Guerrier : initiale G + ETA + croissance 🌾 — D1),
 *  t3 capitale item BÂTIMENT (Temple : initiale T),
 *  t4 ville ENNEMIE visible : nom/pop/capitale seuls, AUCUNE fuite (D3),
 *  t5 ville à cheval sur la COUTURE (base + copie, bannière reflétée),
 *  t6/t7 zoom avant/arrière (lisible au zoom par défaut — D5),
 *  t8 CLIC BANNIÈRE = clic ville (PanneauVille s'ouvre — D6, clic souris RÉEL).
 * Asserts par inspection de la scène Pixi (labels des enfants du conteneur
 * ville) + dump admin (les données ennemies EXISTENT — masquage = affichage).
 * Usage : node devtmp/bande-ville-gui.mjs [portWorker] [portVite]
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
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-bande-ville';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
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
    execSync('powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Erik/ZCodeProject/devtmp/tue-wrangler.ps1', { stdio: 'ignore', timeout: 60000 });
  } catch {}
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
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, civId: 'france' } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g2, order) => g2.send({ proto: 1, type: 'SubmitOrder', order });
const mesVillesDe = (st) => Object.values(st.cities).filter((c) => c.owner === MOI).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
async function assurerSocket(codeJeu) {
  if (g && g.readyState === 1) return;
  try { g?.close(); } catch {}
  g = wsConnect(`/ws/game/${codeJeu}`, tokenGlobal);
  await g.open;
  await g.waitFor('Welcome');
  console.log('  [ws] reconnecté');
}
/** Fin de tour : R-184 (recherche ÉLIGIBLE reposée — complétée = refus en
 *  boucle) + repos de la production par ITEM ATTENDU (BLOCAGE-NAVIGATION :
 *  file vide = EndTurn refusé ; un ordre perdu pendant le verrou de
 *  résolution est reposé chaque tour — piège consigné). null = ne rien
 *  reposer (les instants de FILE VIDE font partie du scénario t1/t3). */
async function finirTourSimple(codeJeu, reposProduction = null) {
  for (let essai = 0; essai < 6; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket(codeJeu);
    if (!stv.players[MOI].researching) {
      // R-184 : une recherche VALIDÉE (prereqs connus, non connue) — poser une
      // tech complétée est refusé et bloque la fin de tour pour toujours.
      const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
      const connue = new Set(stv.players[MOI].techsUnlocked);
      const eligibles = Object.entries(TECHS_DATA)
        .filter(([k, t]) => !connue.has(k) && (t.prereqs ?? []).every((pr) => connue.has(pr)))
        .sort((a, b) => a[1].cost - b[1].cost)
        .map(([k]) => k);
      const cand = ['alphabet', ...eligibles].find((t) => t && eligibles.includes(t));
      if (cand) {
        g.send({ proto: 1, type: 'SetResearch', techId: cand });
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
    console.log('  [finirTour] tour non avancé — nouvelle essaie');
    if (essai >= 2) {
      console.log('  [finirTour] redémarrage wrangler forcé');
      await demarrerWrangler(true);
      await assurerSocket(codeJeu);
    }
  }
  return false;
}
async function tourJusqua(codeJeu, condition, maxTours = 60, label = '', reposProduction = null) {
  for (let i = 0; i < maxTours; i++) {
    const st = (await dumpFull(codeJeu)).state;
    if (condition(st)) return st;
    if (!(await finirTourSimple(codeJeu, reposProduction))) throw new Error(`tour non avancé (${label})`);
  }
  throw new Error(`condition non remplie en ${maxTours} tours (${label})`);
}

// ---- inspection de la scène Pixi (labels du conteneur ville) ----------------
async function banniereInfo(page, cityId) {
  return page.evaluate((cid) => {
    const app = window.__gameCanvas.app();
    const world = app.stage.children[0];
    const ents = world.children[3]; // [tiles, resources, overlay, ENTITIES, effects]
    const tous = ents.children.filter((k) => k.label === cid);
    if (tous.length === 0) return null;
    const c = tous[0];
    const lab = (l) => {
      const e = c.children.find((x) => x.label === l);
      if (!e) return null;
      return { visible: e.visible, text: typeof e.text === 'string' ? e.text : null };
    };
    return {
      copies: tous.length,
      popBgPresent: c.children.some((x) => x.label === 'popBg'), // critère 4 : plus de doublon
      pop: lab('pop'),
      bandeNom: lab('bandeNom'),
      bandeEtoile: lab('bandeEtoile'),
      bandeLogo: lab('bandeLogo'),
      drapeauToursFond: lab('drapeauToursFond'),
      drapeauTours: lab('drapeauTours'),
      drapeauCroissanceFond: lab('drapeauCroissanceFond'),
      bandeCroissance: lab('bandeCroissance'),
      prodCercle: lab('prodCercle'),
      prodInitiale: lab('prodInitiale'),
      drapeauProdFond: lab('drapeauProdFond'),
      prodEta: lab('prodEta'),
    };
  }, cityId);
}
/** Point PAGE du CENTRE de la bannière (bande principale y=-86) — pour un
 *  clic souris RÉEL (le hook __game.clickHex court-circuite le picking). */
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
async function ouvrirPage(ctx, code, token) {
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  return page;
}

// ---- Phase 0 -----------------------------------------------------------------
await demarrerWrangler();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

const NOM = `ErikBande${STAMP}`;
const token = await login(NOM);
tokenGlobal = token;

// ---- Phase 1 : partie dont le continent TOUCHE la couture E↔O ----------------
// Le bord de la carte procédurale est océanique : le continent ne touche pas
// toujours la couture (piège connu « cartes commises non traversables »).
// Sélection de carte : BFS extrême du colon — col ≤3 ou ≥ W−4 exigé, sinon
// nouvelle partie (≤ 5 essais).
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const cle = (q, r) => `${q},${r}`;
const distAx = (a, b) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
function colWrap(q, r, W) {
  return (((q + (r >> 1)) % W) + W) % W;
}
function bfsExtreme(st, unite) {
  const W = st.mapWidth;
  const passable = (q, r) => {
    const t = st.map[`${q},${r}`];
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
  const voisin = (q, r, t) => {
    for (let dq = -1; dq <= 1; dq++) for (let dr = Math.max(-1, -dq - 1); dr <= Math.min(1, -dq + 1); dr++) {
      if (dq === 0 && dr === 0) continue;
      const x = st.map[`${q + dq},${r + dr}`];
      if (x && x.terrain === t) return true;
    }
    return false;
  };
  const file = [[unite.q, unite.r]];
  const prec = new Map([[cle(unite.q, unite.r), null]]);
  let meilleur = { q: unite.q, r: unite.r };
  const auBordDe = (h) => Math.min(colWrap(h.q, h.r, W), W - 1 - colWrap(h.q, h.r, W));
  const frange = [];
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (auBordDe({ q, r }) < auBordDe(meilleur)) meilleur = { q, r };
    // Frange couture : toute case atteignable à col ≤4 avec eau (science)
    // ET forêt/colline (marteaux) adjacents — la fondation s'y porte.
    if (auBordDe({ q, r }) <= 4 && voisin(q, r, 'eau') && (voisin(q, r, 'foret') || voisin(q, r, 'colline'))) frange.push({ q, r });
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (prec.has(k) || !passable(nq, nr)) continue;
      prec.set(k, cle(q, r));
      file.push([nq, nr]);
    }
  }
  frange.sort((a, b) => distAx(a, unite) - distAx(b, unite));
  // Bord EST de préférence (col ≥ W-2) : centré sur la couture (col 0), la
  // base de la ville est hors fenêtre et SA COPIE s'affiche à gauche —
  // c'est la seule configuration où les deux existent (copies ≥ 2, t5).
  // Et SEULEMENT joignable SANS traverser un camp (le colon isolé y meurt).
  const coteEst = frange.filter((h) => colWrap(h.q, h.r, W) >= W - 2);
  const sansCampProche = (h) => !(st.villages ?? []).some((v) => distAx(v, h) <= 4);
  const ordonnees = [...coteEst.filter(sansCampProche), ...coteEst, ...frange.filter((h) => !coteEst.includes(h) && sansCampProche(h)), ...frange.filter((h) => !coteEst.includes(h))];
  for (const cand of ordonnees.slice(0, 8)) {
    const sansCamp = bfsChemin(st, unite, cand, true);
    if (sansCamp) return { but: cand, chemin: sansCamp, prec };
  }
  const but = ordonnees[0] ?? meilleur;
  const chemin = [];
  let k = cle(but.q, but.r);
  while (k) { const [a, b] = k.split(',').map(Number); chemin.unshift({ q: a, r: b }); k = prec.get(k); }
  return { but, chemin, prec };
}
function bfsChemin(st, unite, but, eviterCamps = true) {
  const passable = (q, r) => {
    const t = st.map[`${q},${r}`];
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
  const interdites = new Set(Object.values(st.cities).map((c) => `${c.q},${c.r}`));
  if (eviterCamps) for (const v of st.villages ?? []) interdites.add(`${v.q},${v.r}`);
  const dep = `${unite.q},${unite.r}`;
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
/** Case TERRE atteignable minimisant la distance à la ville adverse. */
function caseTerreLaPlusProche(st, unite, cible) {
  const W = st.mapWidth;
  const passable = (q, r) => {
    const t = st.map[`${q},${r}`];
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
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
      // ne pas ENTRER dans une ville (capture) — mais une case ville voisine
      // évalue comme cible potentielle (distance minimale) sans s'y poser
      vus.add(k);
      if (Object.values(st.cities).some((c) => c.q === nq && c.r === nr)) continue;
      file.push([nq, nr]);
    }
  }
  return meilleur;
}

let code = null;
let cap = null;
let st = null;
let W = 0;
let precBord = null;
let meilleur = null;
let cheminBord = null;
let carteOk = false;
for (let tentative = 1; tentative <= 12 && !carteOk; tentative++) {
  code = await creerPartie(token);
  console.log(`[partie ${tentative}] ${code}`);
  g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
  st = (await dumpFull(code)).state;
  W = st.mapWidth;
  const colon = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
  const colonBot = Object.values(st.units).find((u) => u.owner !== MOI && u.type === 'colon');
  ({ but: meilleur, chemin: cheminBord, prec: precBord } = bfsExtreme(st, colon));
  const memeContinent = !!bfsChemin(st, colon, { q: colonBot.q, r: colonBot.r });
  // Camps barbares : plus de filtre carte — le défenseur fortifié (t4) couvre
  // la ville (la razie du run 12 frappait une capitale sans garnison).
  console.log(`  même continent : ${memeContinent} — fondation choisie (${meilleur.q},${meilleur.r})`);
  if (!memeContinent) continue; // îles — la capitale bot serait inatteignable
  const auBord = Math.min(colWrap(meilleur.q, meilleur.r, W), W - 1 - colWrap(meilleur.q, meilleur.r, W)) <= 3;
  console.log(`  colon (${colon.q},${colon.r}) → extrême (${meilleur.q},${meilleur.r}) col=${colWrap(meilleur.q, meilleur.r, W)}/${W} — couture à ≤3 : ${auBord}`);
  if (!auBord) continue; // carte sans terre sur la couture — suivante
  carteOk = true;
  ordre(g, { type: 'Move', unitId: colon.id, path: cheminBord.slice(1) });
  let mort = false;
  for (let i = 0; i < 48; i++) {
    const dstatut = (await dumpFull(code)).meta?.status;
    if (dstatut && dstatut !== 'active') { console.log(`  🔶 partie terminée (${dstatut}) pendant la marche — carte suivante`); carteOk = false; break; }
    if (!(await finirTourSimple(code))) throw new Error('tour non avancé (marche colon)');
    st = (await dumpFull(code)).state;
    const u = st.units[colon.id];
    if (!u) { mort = true; break; }
    if (u.q === meilleur.q && u.r === meilleur.r) break;
  }
  if (mort) { console.log('  colon perdu (barbare 🔶) — carte suivante'); carteOk = false; continue; }
  if (!carteOk) continue;
  ordre(g, { type: 'FoundCity', unitId: colon.id });
  await finirTourSimple(code);
  st = (await dumpFull(code)).state;
  cap = mesVillesDe(st)[0];
  if (!cap) { console.log('  🔶 fondation ratée (colon bloqué ?) — carte suivante'); carteOk = false; continue; }
  console.log(`[fondation] t${st.turn} capitale ${cap.id} (${cap.q},${cap.r}) col=${colWrap(cap.q, cap.r, st.mapWidth)}/${st.mapWidth}`);
  // R-90 : la science ne coule qu'en conversion science (défaut or — piège
  // connu) : sans cela aucune tech n'arrive et t3 (Bibliothèque) est nul.
  g.send({ proto: 1, type: 'SetConversion', cityId: cap.id, target: 'science' });
}
if (!carteOk) { console.log('🔴 aucune carte sur 5 n\'a de terre praticable près de la couture'); process.exit(1); }

const page = await ouvrirPage(ctx, code, token);
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
await sleep(1500);

let echecs = [];
const assert = (ok, label) => {
  if (ok) console.log(`  ✓ ${label}`);
  else { console.log(`  🔴 ${label}`); echecs.push(label); }
};

// ---- t1 : capitale, FILE VIDE (D4 : cercle production + ETA masqués) ---------
{
  const dump = await dumpFull(code);
  const ville = dump.state.cities[cap.id];
  console.log(`[t1] civId=${dump.state.players[MOI].civId} file vide : production=${JSON.stringify(ville.production)} queue=${(ville.queue ?? []).length}`);
  const info = await banniereInfo(page, cap.id);
  console.log('  bannière:', JSON.stringify(info));
  assert(info && !info.popBgPresent, 'critère 4 — ancien badge pop (popBg) disparu');
  assert(info && info.pop && info.pop.visible && info.pop.text === String(ville.pop), `cercle pop = ${ville.pop}`);
  assert(info && info.bandeNom && info.bandeNom.visible && (info.bandeNom.text ?? '').length > 0, 'nom de ville affiché');
  assert(info && info.bandeEtoile && info.bandeEtoile.visible, 'D2 — étoile capitale visible');
  assert(info && info.bandeLogo && info.bandeLogo.visible, 'D1 — logo de nation visible (préchargé)');
  assert(info && info.prodCercle && !info.prodCercle.visible, 'D4 — cercle production masqué (file vide)');
  assert(info && info.prodEta && !info.prodEta.visible, 'D4 — ETA masqué (pas de zéro/Infinity)');
  if (info.bandeCroissance.visible) {
    assert(/^\d+$/.test(info.bandeCroissance.text ?? ''), 't1 — croissance en nombre nu affichée (le cercle production reste masqué)');
  } else {
    assert(info && info.drapeauToursFond && !info.drapeauToursFond.visible, 't1 — drapeaux entièrement masqués (rien à montrer)');
  }
  await page.screenshot({ path: `${CAP}/t1-capitale-file-vide.png` });
  // Défense immédiate (les barbares rasent une ville sans garnison — T-18).
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
}

// ---- t2 : item UNITÉ (Guerrier → initiale G, ETA, croissance) ----------------
// ⚠ handleOrder ne broadcast PAS le snapshot de l'ordre : la page ne voit un
// ordre posé par le script qu'à la RÉSOLUTION suivante — on attend l'état.
{
  // Pop ≥ 4 : quatre citoyens — 2 auto nourriture + forêt (marteaux) + eau
  // (science) ; à pop 3 il faut choisir entre science et marteaux.
  await tourJusqua(code, (s2) => s2.cities[cap.id].pop >= 4, 30, 'pop 4', { kind: 'unit', id: 'guerrier' });
  const stAvant = (await dumpFull(code)).state;
  const v = stAvant.cities[cap.id];
  const enPlace = new Set(v.workedTiles ?? []);
  let caseEau = null, caseMarteaux = null;
  for (let dq = -1; dq <= 1; dq++) {
    for (let dr = Math.max(-1, -dq - 1); dr <= Math.min(1, -dq + 1); dr++) {
      if (dq === 0 && dr === 0) continue;
      const k = `${v.q + dq},${v.r + dr}`;
      const t = stAvant.map[k];
      if (!t || enPlace.has(k)) continue;
      if (!caseEau && (t.terrain === 'eau' || t.terrain === 'ocean')) caseEau = k;
      if (!caseMarteaux && (t.terrain === 'foret' || t.terrain === 'colline')) caseMarteaux = k;
    }
  }
  const migrer = [caseEau, caseMarteaux].filter(Boolean);
  if (migrer.length > 0) {
    console.log(`[t2] migrations : ${migrer.join(' + ')}`);
    await assurerSocket(code);
    let retires = 0;
    for (const cible of migrer) {
      if ((v.workedTiles ?? []).length - retires >= v.pop) {
        ordre(g, { type: 'SetWorkedTile', cityId: cap.id, tile: null }); // le null retire le DERNIER assigné
        retires += 1;
        await sleep(400);
      }
      ordre(g, { type: 'SetWorkedTile', cityId: cap.id, tile: cible });
      await sleep(400);
    }
  } else console.log('[t2] rien à migrer 🔶 — ETA peut rester masqué');
  // worked migrés d'abord (le marteau avant l'item) : la production est
  // posée une fois les rendements en place — l'ETA lit l'état final.
  if (migrer.length > 0) {
    await tourJusqua(code, (s2) => {
      const w = s2.cities[cap.id].workedTiles ?? [];
      return migrer.every((k) => w.includes(k));
    }, 20, 'worked migrés', { kind: 'unit', id: 'guerrier' });
  }
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
  const stP = await tourJusqua(code, (s) => s.cities[cap.id].production?.item?.id === 'guerrier', 20, 'guerrier en tête', { kind: 'unit', id: 'guerrier' });
  console.log(`[t2] t${stP.turn} guerrier en tête — worked appliqués : ${JSON.stringify(stP.cities[cap.id].workedTiles)}`);
  const info = await banniereInfo(page, cap.id);
  console.log('  bannière:', JSON.stringify({ drapeau: info.drapeauTours, crois: info.bandeCroissance, init: info.prodInitiale, eta: info.prodEta }));
  assert(info.drapeauToursFond.visible && (info.drapeauTours.text ?? '') === 'Tours', 'D1 — drapeau étiquette « Tours » visible');
  assert(info.bandeCroissance.visible && /^\d+$/.test(info.bandeCroissance.text ?? ''), `croissance en nombre nu (${info.bandeCroissance.text})`);
  assert(info.prodInitiale.visible && info.prodInitiale.text === 'G', 'D1 — initiale du nom (Guerrier → G)');
  assert(info.prodEta.visible && /^\d+$/.test(info.prodEta.text ?? ''), `D1 — ETA en nombre nu (${info.prodEta.text})`);
  await page.screenshot({ path: `${CAP}/t2-capitale-item-unite.png` });
}

// ---- t3 : item BÂTIMENT (Bibliothèque → initiale B — bâtiment sans
// remplaçant ; tech alphabet, la plus accessible) ------------------------
{
  const stFin = await tourJusqua(code, (s) => !s.cities[cap.id].production, 40, 'complétion guerrier');
  console.log(`[t3] t${stFin.turn} guerrier complété — file redevenue vide`);
  // Garnison immédiate : le guerrier FORTIFIÉ reste sur la ville (les razies
  // frappent entre la complétion et t4 — run 24).
  const stG = (await dumpFull(code)).state;
  const garnison = Object.values(stG.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && u.q === cap.q && u.r === cap.r);
  if (garnison) { await assurerSocket(code); ordre(g, { type: 'Fortify', unitId: garnison.id }); }
  const vide = await banniereInfo(page, cap.id);
  assert(!vide.prodCercle.visible, 'D4 — file vide après complétion : cercle masqué');
  // alphabet d'abord (la Bibliothèque l'exige) — la science coule depuis la
  // conversion posée à la fondation.
  const stAl = await tourJusqua(code, (s) => s.players[MOI].techsUnlocked.includes('alphabet'), 45, 'alphabet', { kind: 'unit', id: 'guerrier' });
  console.log(`[t3] t${stAl.turn} alphabet débloquée — Bibliothèque en tête`);
  await assurerSocket(code);
  ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'building', id: 'bibliotheque' } });
  await tourJusqua(code, (s) => s.cities[cap.id].production?.item?.id === 'bibliotheque', 25, 'bibliotheque en tête', { kind: 'building', id: 'bibliotheque' });
  const info = await banniereInfo(page, cap.id);
  console.log('  bannière:', JSON.stringify({ init: info.prodInitiale, eta: info.prodEta }));
  assert(info.prodInitiale.visible && info.prodInitiale.text === 'B', 'D1 — initiale du bâtiment (Bibliothèque → B)');
  await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: cap.q, r: cap.r });
  await sleep(800);
  await page.screenshot({ path: `${CAP}/t3-capitale-item-batiment.png` });
}

// ---- t4 : ville ENNEMIE visible — nom/pop/capitale seuls (D3) ----------------
let ennemieCapturee = false;
{
  // La capitale bot existe dès que le bot a fondé — on s'en approche jusqu'à
  // ce qu'elle entre dans la VISION (rayon 2 de l'unité) ; les îles sont un
  // hasard de carte (🔶 consigné si inatteignable par la terre).
  const stBot = await tourJusqua(code, (s) => Object.values(s.cities).some((c) => c.owner !== MOI), 30, 'fondation bot');
  const villeBot = Object.values(stBot.cities).find((c) => c.owner !== MOI);
  console.log(`[t4] capitale bot ${villeBot.id} (${villeBot.q},${villeBot.r}) — production au dump : ${JSON.stringify(villeBot.production?.item ?? null)}`);
  // Le défenseur (sur la capitale, fortifié) ne part JAMAIS — les barbares
  // rasent une ville sans garnison (CityRazed, run 12).
  {
    const stD = (await dumpFull(code)).state;
    const defenseur = Object.values(stD.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && u.q === cap.q && u.r === cap.r);
    if (defenseur) { await assurerSocket(code); ordre(g, { type: 'Fortify', unitId: defenseur.id }); }
  }
  for (let vague = 0; vague < 5 && !ennemieCapturee; vague++) {
    let stNow = (await dumpFull(code)).state;
    let marcheur = Object.values(stNow.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard && !(u.q === cap.q && u.r === cap.r));
    if (!marcheur) {
      ordre(g, { type: 'SetProduction', cityId: cap.id, item: { kind: 'unit', id: 'guerrier' } });
      stNow = await tourJusqua(code, (s) => Object.values(s.units).some((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard), 40, 'guerrier de relève', { kind: 'unit', id: 'guerrier' });
      marcheur = Object.values(stNow.units).find((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard);
    }
    if (!marcheur) break;
    // Case TERRE atteignable minimisant la distance hexagonale à la ville bot.
    const cible = caseTerreLaPlusProche(stNow, marcheur, villeBot);
    if (!cible) { console.log('  🔶 aucune terre atteignable vers la capitale bot'); break; }
    if (marcheur.q === cible.q && marcheur.r === cible.r) { console.log('  🔶 marcheur déjà au plus près — continent séparé 🔶'); break; }
    const chemin = bfsChemin(stNow, marcheur, cible) ?? bfsChemin(stNow, marcheur, cible, false);
    if (!chemin) { console.log('  🔶 chemin introuvable vers la cible'); break; }
    console.log(`[t4] vague ${vague + 1} : marcheur (${marcheur.q},${marcheur.r}) → cible (${cible.q},${cible.r}) à ${distAx(cible, villeBot)} de la ville bot`);
    await assurerSocket(code);
    ordre(g, { type: 'Move', unitId: marcheur.id, path: chemin });
    let visible = false;
    for (let i = 0; i < 40; i++) {
      const statut = (await dumpFull(code)).meta?.status;
      if (statut && statut !== 'active') { console.log(`  🔶 partie terminée (${statut}) — le bot a gagné avant la marche 🔶`); break; }
      if (!(await finirTourSimple(code, { kind: 'unit', id: 'guerrier' }))) throw new Error('tour non avancé (marche guerrier)');
      const s2 = (await dumpFull(code)).state;
      const u2 = s2.units[marcheur.id];
      if (!u2) { console.log('  [t4] marcheur perdu (barbare 🔶) — relève'); break; }
      if ((s2.players[MOI].vision?.visible ?? []).includes(`${villeBot.q},${villeBot.r}`)) { visible = true; break; }
    }
    if (!visible) { console.log('  🔶 ville bot toujours hors vision — relève'); continue; }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
    await sleep(2500);
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), { q: villeBot.q, r: villeBot.r });
    await sleep(1200);
    const info = await banniereInfo(page, villeBot.id);
    console.log('  bannière ennemie:', JSON.stringify(info));
    assert(info && info.pop && info.pop.visible, 'D3 — pop ennemie affichée');
    assert(info && info.bandeNom && info.bandeNom.visible, 'D3 — nom ennemi affiché');
    assert(info && info.drapeauToursFond && !info.drapeauToursFond.visible, 'D3 — AUCUN drapeau sur l’ennemie');
    assert(info && info.prodEta && (info.prodEta.text ?? '') === '' && !info.prodEta.visible, 'D3 — production/ETA ennemis absents');
    // La PREUVE du masquage : les données EXISTENT au dump (ville visible = état entier).
    const dump = await dumpFull(code);
    const avecProd = !!dump.state.cities[villeBot.id]?.production;
    console.log(`[t4] preuve anti-fuite : production ennemie dans l'état=${avecProd} → masquée à l'écran`);
    assert(avecProd === true, 'D3 — le masquage est un choix d\'affichage (données présentes)');
    await page.screenshot({ path: `${CAP}/t4-ennemie-sans-fuite.png` });
    ennemieCapturee = true;
  }
  if (!ennemieCapturee) { console.log('  🔶 t4 non produit (capitale bot hors de portée terrestre — hasard de carte)'); echecs.push('t4:ennemie-inaccessible'); }
}


// ============================================================
// PHASE B — couture (t5), zoom (t6/t7), clic bannière (t8) sur une partie
// PROPRE au bord EST : ces scénarios ne dépendent ni du bot ni des marches
// longues (la victoire du bot achevait la partie avant t8 — run 27).
// ============================================================
async function phaseB(tok) {
  for (let tentative = 1; tentative <= 12; tentative++) {
    const codeB = await creerPartie(tok);
    console.log(`[partie B${tentative}] ${codeB}`);
    g = wsConnect(`/ws/game/${codeB}`, tok);
    await g.open;
    await g.waitFor('Welcome');
    const stB = (await dumpFull(codeB)).state;
    W = stB.mapWidth;
    const colon = Object.values(stB.units).find((u) => u.owner === MOI && u.type === 'colon');
    ({ but: meilleur, chemin: cheminBord } = bfsExtreme(stB, colon));
    if (colWrap(meilleur.q, meilleur.r, W) < W - 2) { console.log('  🔶 bord Est non joignable — carte suivante'); continue; }
    ordre(g, { type: 'Move', unitId: colon.id, path: cheminBord.slice(1) });
    let mort = false;
    let finie = false;
    for (let i = 0; i < 48; i++) {
      const dstatut = (await dumpFull(codeB)).meta?.status;
      if (dstatut && dstatut !== 'active') { console.log(`  🔶 partie terminée (${dstatut}) — tentative suivante`); finie = true; break; }
      if (!(await finirTourSimple(codeB))) throw new Error('tour non avancé (marche colon B)');
      const u = (await dumpFull(codeB)).state.units[colon.id];
      if (!u) { mort = true; break; }
      if (u.q === meilleur.q && u.r === meilleur.r) break;
    }
    if (mort || finie) { console.log('  colon perdu ou partie finie — tentative suivante'); continue; }
    ordre(g, { type: 'FoundCity', unitId: colon.id });
    await finirTourSimple(codeB);
    const capB = mesVillesDe((await dumpFull(codeB)).state)[0];
    if (!capB) { console.log('  🔶 fondation ratée — tentative suivante'); continue; }
    console.log(`[B] fondation ${capB.id} (${capB.q},${capB.r}) col=${colWrap(capB.q, capB.r, W)}/${W}`);
    const pageB = await ouvrirPage(ctx, codeB, tok);
    pageB.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[console]', m.text().slice(0, 160)); });
    await pageB.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capB.q, r: capB.r });
    await sleep(1500);

// ---- t5 : couture — base + copie des deux côtés (CARTE-RONDE T2) -------------
{
  await pageB.evaluate((h) => window.__gameCanvas.centerOn(h), { q: W, r: capB.r }); // col W = col 0 (wrap)
  await sleep(1200);
  const info = await banniereInfo(pageB, capB.id);
  console.log(`[t5] copies de la capitale à l'écran : ${info?.copies ?? 0}`);
  assert(info && info.copies >= 2, 'couture — base + copie affichées');
  await pageB.screenshot({ path: `${CAP}/t5-couture-ville-double.png` });
}

// ---- t6/t7 : zoom avant / arrière (D5 — lisible au zoom par défaut) ----------
{
  await pageB.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capB.q, r: capB.r });
  await sleep(800);
  const centre = await pageB.evaluate(() => {
    const app = window.__gameCanvas.app();
    const rect = app.canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await pageB.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 3; i++) { await pageB.mouse.wheel(0, -120); await sleep(250); }
  await sleep(800);
  await pageB.screenshot({ path: `${CAP}/t6-zoom-avant.png` });
  for (let i = 0; i < 8; i++) { await pageB.mouse.wheel(0, 120); await sleep(250); }
  await sleep(800);
  await pageB.screenshot({ path: `${CAP}/t7-zoom-arriere.png` });
  // Retour au zoom de départ pour t8 (3 wheel down de trop — on re-centre et re-zoom).
  await pageB.evaluate((h) => window.__gameCanvas.centerOn(h), { q: capB.q, r: capB.r });
  for (let i = 0; i < 5; i++) { await pageB.mouse.wheel(0, -120); await sleep(200); }
  await sleep(800);
}

// ---- t8 : CLIC BANNIÈRE = clic ville (D6 — clic souris RÉEL) ------------------
{
  // Désélection d'abord (clic sur une case vide proche), puis clic bannière.
  const ptBan = await pointBanniere(pageB, capB.id);
  console.log(`[t8] clic réel en (${Math.round(ptBan.x)},${Math.round(ptBan.y)}) — centre de la bande principale`);
  const nomVille = (await dumpFull(codeB)).state.cities[capB.id].name ?? capB.id;
  let txt = '';
  // Alternance/cycle R-2 : une ville DÉFENDUE (occupants sur la case) cycle
  // unité → unité → … → ville. Le clic bannière suit EXACTEMENT la sémantique
  // du clic case (D6) — on cycle jusqu'à l'ouverture du PanneauVille.
  for (let essai = 1; essai <= 6; essai++) {
    await pageB.mouse.click(ptBan.x, ptBan.y);
    await sleep(1000);
    txt = (await pageB.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    if (/file de production/i.test(txt)) break;
    if (essai === 1) console.log(`[t8] nom attendu au panneau : « ${nomVille} » — présent : ${txt.includes(nomVille)}`);
    console.log(`[t8] cycle R-2 clic ${essai} (occupant suivant) — la ville vient après le dernier`);
  }
  assert(txt.includes(nomVille), 'D6 — le clic bannière ouvre le PanneauVille (nom visible)');
  assert(/file de production/i.test(txt), 'D6 — le panneau de ville est bien ouvert (File de production, casse rendue uppercase)');
  await pageB.screenshot({ path: `${CAP}/t8-clic-banniere-panneau.png` });
}


    await pageB.close().catch(() => {});
    return true;
  }
  return false;
}

// ---- PHASE B (t5-t8) ---------------------------------------------------------
const okB = await phaseB(token);
if (!okB) { console.log('🔴 phase B non produite (aucune carte au bord Est viable)'); echecs.push('B:couture-inaccessible'); }

console.log('================================');
if (echecs.length > 0) {
  console.log(`🔴 ÉCHECS (${echecs.length}) : ${echecs.join(' | ')}`);
  process.exit(1);
} else {
  console.log('✓ BANDE-VILLE — tous les asserts GUI passent');
}
await browser.close();
try { wrangler?.kill(); } catch {}
process.exit(0);
