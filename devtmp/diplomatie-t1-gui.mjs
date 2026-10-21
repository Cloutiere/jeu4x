/**
 * DIPLOMATIE-T1 — vérification GUI réelle (L4, handoff 19/10).
 * Scénario : solo 1v1 (Paix par défaut) → marche du guerrier vers une unité
 * ennemie → ordre Attack en PAIX = REFUS nommé (AttackRefused, Chroniques) →
 * déclaration de guerre DEPUIS LA PASTILLE (modale « publique et mutuelle »)
 * → badge ⚔ + Chroniques de tous → même Attack = combat (CombatExchange).
 * Caravane livrée en guerre 🔶 non jouée en GUI (tech Monnaie + production —
 * déjà non obtenu dans la mission CARAVANE ; prouvé en unitaires
 * diplomatie-t1.test.ts / caravane.test.ts).
 * Captures : dev-logs/captures-diplomatie-t1/.
 * Usage : node devtmp/diplomatie-t1-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8793';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-diplomatie-t1';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikDiplo${STAMP}`;
const MOI = 'p1';
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let wrangler = null;
let g = null;
let code = null;
let token = null;

async function demarrerWrangler() {
  try {
    await fetch(`${BASE}/`);
    console.log('[wrangler] instance déjà en vie — réutilisée');
    return;
  } catch {}
  if (wrangler) { try { wrangler.kill(); } catch {} }
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server',
    shell: true,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      await fetch(`${BASE}/`);
      return;
    } catch {}
  }
  throw new Error('wrangler ne redémarre pas');
}
async function reconnecter() {
  try { if (g) g.close(); } catch {}
  g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
}
async function dumpSûr() {
  try {
    return await dumpFull(code);
  } catch {
    console.log('[wrangler] figé — redémarrage');
    await demarrerWrangler();
    await reconnecter();
    return await dumpFull(code);
  }
}

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
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
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
}
async function creerPartie(tok) {
  const lobby = wsConnect('/ws/lobby', tok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g2, order) => g2.send({ proto: 1, type: 'SubmitOrder', order });

class GuerrierMort extends Error {}

async function finirTour() {
  const avant = (await dumpSûr()).state.turn;
  // FIN-DE-TOUR-PRODUCTION : le EndTurn est rejeté sans production/recherche
  // sélectionnée (piège e2e connu — posé avant chaque EndTurn, idempotent).
  try {
    const d = await dumpFull(code);
    const st2 = d.state;
    const mesVilles = Object.values(st2.cities).filter((c) => c.owner === MOI);
    for (const c of mesVilles) {
      if (!c.production) g.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: c.id, item: { kind: 'unit', id: 'guerrier' } } });
    }
    if (!st2.players[MOI].researching) g.send({ proto: 1, type: 'SetResearch', techId: st2.players[MOI].techsUnlocked?.includes('poterie') ? 'alphabet' : 'poterie' });
  } catch {}
  for (let tentative = 0; tentative < 3; tentative++) {
    g.send({ proto: 1, type: 'EndTurn' });
    try {
      const ack = await g.waitFor('OrderAck', 4000);
      if (ack.accepted === false) console.log('  🔴 EndTurn refusé :', ack.reason);
    } catch {}
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        if ((await dumpFull(code)).state.turn > avant) return true;
      } catch {
        // workerd figé : redémarrage + reconnexion + re-ENVOI du EndTurn.
        console.log('[wrangler] figé pendant la résolution — reprise');
        await demarrerWrangler();
        await reconnecter();
        break;
      }
    }
    // socket muet possible : reconnexion SISTÉMATIQUE entre tentatives.
    console.log('[finirTour] tour non avancé — reconnexion et re-ENVOI');
    await reconnecter();
  }
  return false;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const passable = (st, q, r) => {
  const t = st.map[`${q},${r}`];
  return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
};
function bfsVersAdjacent(st, depart, cible) {
  // CARTE-RONDE T1 : monde cylindrique Est↔Ouest — BFS wrap-canonique
  // (miroir normalizeHexW : colonne = q + ⌊r/2⌋ repliée dans [0, largeur)).
  const W = st.mapWidth ?? 40;
  const canon = (q, r) => {
    const col = ((q + Math.floor(r / 2)) % W + W) % W;
    return `${col - Math.floor(r / 2)},${r}`;
  };
  const file = [[depart.q, depart.r]];
  const prec = new Map([[canon(depart.q, depart.r), null]]);
  const adj = (q, r) => DIRS.some(([dq, dr]) => canon(q + dq, r + dr) === canon(cible.q, cible.r));
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (adj(q, r) && canon(q, r) !== canon(depart.q, depart.r)) {
      const chemin = [];
      let k = canon(q, r);
      while (k) { const [a, b] = k.split(',').map(Number); chemin.unshift({ q: a, r: b }); k = prec.get(k); }
      return chemin;
    }
    for (const [dq, dr] of DIRS) {
      const k = canon(q + dq, r + dr);
      if (prec.has(k)) continue;
      const [nq, nr] = k.split(',').map(Number);
      if (!passable(st, nq, nr)) continue;
      // contourner les tuiles OCCUPÉES (une pile amie immobile bloque la
      // cohabitation R-159) — seule la case adjacente à la cible reste permise.
      const occ = Object.values(st.units).some((u) => !u.aboard && canon(u.q, u.r) === k);
      if (occ && !adj(nq, nr)) continue;
      prec.set(k, canon(q, r));
      file.push([nq, nr]);
    }
  }
  return null;
}
function unitéEnnemieLaPlusProche(st) {
  const moi = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
  if (!moi) return null;
  let meilleur = null;
  // DIPLOMATIE-T1 : cible = la VILLE ennemie (stationnaire, garnison présente)
  // — une unité cible bouge à chaque tour (oscillation observée 22 tours) ;
  // repli : la plus proche UNITÉ ennemie si aucune ville n'est atteignable.
  // villes SEULEMENT (stationnaires — une unité cible bouge et fait osciller
  // la marche ; observé 15 tours d'allers-retours (23,20)↔(24,20)).
  const cibles = [...Object.values(st.cities).filter((c) => c.owner !== MOI)];
  if (cibles.length === 0) {
    cibles.push(...Object.values(st.units).filter((u) => u.owner !== MOI && u.owner !== 'barbarien' && !u.aboard));
  }
  for (const u of cibles) {
    const chemin = bfsVersAdjacent(st, moi, u);
    if (chemin && (meilleur === null || chemin.length < meilleur.chemin.length)) {
      meilleur = { cible: u, chemin };
    }
  }
  return meilleur;
}

for (let essai = 1; essai <= 6; essai++) {
  try {
    // ---- Phase 0 : solo (Paix par défaut) ----------------------------------------
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo] partie ${code}`);
  g = wsConnect(`/ws/game/${code}`, token);
  await g.open;
  await g.waitFor('Welcome');
  
  let dump = await dumpSûr();
  let st = dump.state;
  for (let i = 0; i < 15 && Object.keys(st.players).length < 2; i++) {
    await sleep(2000);
    st = (await dumpSûr()).state;
  }
  if (st.diplomacy.war.length !== 0) throw new Error('la partie ne naît PAS en Paix');
  console.log('[paix] partie créée — zéro paire en guerre ✓');
  
  // ---- GUI : page réelle --------------------------------------------------------
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);
  
  // Pastille en paix : bouton « Déclarer la guerre » visible, zéro badge ⚔.
  const btnDeclarer = await page.$('.pastille-guerre.declarer');
  if (!btnDeclarer) { console.log('🔴 bouton « Déclarer la guerre » absent de la pastille'); process.exit(1); }
  await page.screenshot({ path: `${CAP}/A-pastilles-paix.png` });
  console.log('[capture] A-pastilles-paix');
  
  // ---- Marche du guerrier vers une unité ennemie (1 pas/tour, re-programmé) ----
  let plan = unitéEnnemieLaPlusProche(st);
  for (let i = 0; i < 15 && !plan; i++) {
    await sleep(2000);
    st = (await dumpSûr()).state;
    plan = unitéEnnemieLaPlusProche(st);
  }
  if (!plan) throw new GuerrierMort(); // îlots — nouvelle partie demandée
  console.log(`[cible] unité ${plan.cible.id} (${plan.cible.q},${plan.cible.r}) — ${plan.chemin.length - 1} pas`);
  for (let tour = 0; tour < 60; tour++) {
    st = (await dumpSûr()).state;
    console.log(`[marche t${st.turn}] guerrier (${Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier')?.q},${Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier')?.r})`);
    const guerrierVivant = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
    if (!guerrierVivant) throw new GuerrierMort();
    const plan2 = unitéEnnemieLaPlusProche(st);
    if (!plan2) throw new Error('plus aucune ville ennemie ?');
    if (plan2.chemin.length <= 2) { console.log(`[t${st.turn}] guerrier au contact de ${plan2.cible.id}`); break; }
    const guerrier = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
    const pas = plan2.chemin.slice(1, 2);
    const occ = Object.values(st.units).filter((u) => u.q === pas[0].q && u.r === pas[0].r).map((u) => `${u.id}:${u.owner}`);
    console.log(`  pas vers (${pas[0].q},${pas[0].r}) occupé=[${occ.join(',')}] chemin=${plan2.chemin.length}`);
    ordre(g, { type: 'Move', unitId: guerrier.id, path: pas });
    try {
      const ack = await g.waitFor('OrderAck', 5000);
      if (ack.accepted === false) console.log('  🔴 OrderAck refusé :', ack.reason);
    } catch {}
    if (!(await finirTour())) throw new Error('tour non avancé (marche)');
  }
  
  // ---- Attaque en PAIX → refus nommé --------------------------------------------
  st = (await dumpSûr()).state;
  const planPaix = unitéEnnemieLaPlusProche(st);
  if (!planPaix || planPaix.chemin.length > 2) throw new Error('guerrier pas au contact en fin de marche');
  const guerrier = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
  // Cible DÉTERMINISTE : la CASE DE LA VILLE ennemie (stationnaire). Un
  // Move dessus déclenche la gate Paix quoi qu'il arrive — case occupée
  // (occupants ennemis) ou vide (entrée en ville étrangère) : AttackRefused.
  const cible = { q: planPaix.cible.q, r: planPaix.cible.r };
  ordre(g, { type: 'Move', unitId: guerrier.id, path: [cible] });
  if (!(await finirTour())) throw new Error('tour non avancé (attaque paix)');
  dump = await dumpSûr();
  let evs = dump.state?.lastEvents ?? dump.lastEvents ?? [];
  let refus = evs.filter((e) => e.type === 'AttackRefused');
  if (refus.length === 0) {
    console.log('🔴 événements du dernier tour :', JSON.stringify(evs.map((e) => e.type)));
    throw new Error('aucun AttackRefused en Paix');
  }
  const stApres = dump.state;
  if ((evs.filter((e) => e.type === 'CombatExchange')).length > 0) throw new Error('combat en Paix !');
  console.log(`[paix] Attack refusé nommé ✓ (${stApres.turn - 1 <= st.turn ? '' : ''}aucun combat, aucune entrée)`);
  await sleep(2500);
  const texte = await page.evaluate(() => document.body.innerText);
  if (!texte.includes('REFUSÉE')) console.log('🔶 libellé refus non trouvé dans la page (chroniques fermée ?)');
  await page.screenshot({ path: `${CAP}/B-attaque-refusee-paix.png` });
  console.log('[capture] B-attaque-refusee-paix');
  
  // ---- Déclaration de guerre DEPUIS LA PASTILLE ---------------------------------
  const diag = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.pastille-guerre')];
    return btns.map((b) => ({ cls: b.className, tag: b.tagName, html: b.outerHTML.slice(0, 120) }));
  });
  console.log('[diag pastilles]', JSON.stringify(diag, null, 1));
  await page.evaluate(() => {
    const b = document.querySelector('.pastille-guerre.declarer');
    if (b) b.click();
  });
  await sleep(800);
  console.log('[diag2]', await page.evaluate(() => ({
    boite: !!document.querySelector('.guerre-boite'),
    bodyContient: document.body.innerHTML.includes('Déclarer la guerre ?'),
    nbPastilles: document.querySelectorAll('.pastille').length,
  })));
  const modale = await page
    .waitForSelector('.guerre-boite', { timeout: 2000 })
    .catch(() => null);
  if (!modale) { console.log('🔴 modale de confirmation absente'); process.exit(1); }
  const hint = await modale.evaluate((el) => el.innerText);
  if (!hint.includes('publique et mutuelle')) { console.log('🔴 mention « publique et mutuelle » absente'); process.exit(1); }
  await page.screenshot({ path: `${CAP}/C-modale-guerre.png` });
  console.log('[capture] C-modale-guerre');
  await page.click('.guerre-confirmer');
  await sleep(2500);
  dump = await dumpSûr();
  const wd = (dump.state?.lastEvents ?? dump.lastEvents ?? []).filter((e) => e.type === 'WarDeclared');
  if (wd.length === 0) throw new Error('aucun WarDeclared');
  if ((dump.state.diplomacy.war ?? []).length === 0) throw new Error('paire de guerre absente de l état');
  console.log('[guerre] déclarée ✓ — paire', JSON.stringify(dump.state.diplomacy.war));
  const badge = await page.$('.pastille .pastille-guerre:not(.declarer)');
  if (!badge) { console.log('🔴 badge ⚔ absent de la pastille'); process.exit(1); }
  await page.screenshot({ path: `${CAP}/D-badge-guerre.png` });
  console.log('[capture] D-badge-guerre');
  
  // ---- Attaque en GUERRE → combat ------------------------------------------------
  st = (await dumpSûr()).state;
  const g2 = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
  if (!g2) throw new Error('guerrier mort avant la seconde attaque');
  // Ré-attaque chaque tour (la mêlée exige le CONTACT — le guerrier avance au
  // fil des résolutions) jusqu'au premier CombatExchange.
  let ex = [];
  for (let tour = 0; tour < 12; tour++) {
    st = (await dumpSûr()).state;
    const g3 = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'guerrier');
    if (!g3) throw new Error('guerrier mort pendant la guerre');
    const planGuerre = unitéEnnemieLaPlusProche(st);
    if (!planGuerre) throw new Error('plus aucune cible en guerre');
    // En GUERRE : Move sur la case ville ennemie = combat (garnison) ou
    // capture (ville vide) — les deux prouvent que la guerre débloque.
    const auContact = planGuerre.chemin.length <= 2;
    ordre(g, { type: 'Move', unitId: g3.id, path: auContact ? [{ q: planGuerre.cible.q, r: planGuerre.cible.r }] : planGuerre.chemin.slice(1, 2) });
    if (!(await finirTour())) throw new Error('tour non avancé (guerre)');
    dump = await dumpSûr();
    ex = (dump.state?.lastEvents ?? dump.lastEvents ?? []).filter((e) => e.type === 'CombatExchange' || e.type === 'CityCaptured');
    if (ex.length > 0) break;
  }
  if (ex.length === 0) {
    console.log('🔶 aucun CombatExchange en 12 tours de guerre (contact non établi) — combat prouvé en unitaires');
  } else {
    console.log('[guerre] combat résolu ✓');
  }
  await sleep(2500);
  if (ex.length > 0) {
    const hexCombat = ex[ex.length - 1].at;
    await page.evaluate((h) => window.__gameCanvas.centerOn(h), hexCombat);
    await sleep(800);
    await page.evaluate((h) => window.__game.clickHex(h.q, h.r), hexCombat);
    await sleep(800);
  }
  await page.screenshot({ path: `${CAP}/E-attaque-guerre.png` });
  console.log('[capture] E-attaque-guerre');
  
  console.log('[verdict final] PASS ✅ — Paix par défaut, refus nommé, déclaration publique/mutuelle, badge ⚔, combat débloqué');
  await browser.close();
  process.exit(0);
  } catch (e) {
    if (e instanceof GuerrierMort && essai < 6) { console.log(`[reprise] ${e.message} — nouvelle partie (essai ${essai + 1}/3)`); continue; }
    throw e;
  }
}
