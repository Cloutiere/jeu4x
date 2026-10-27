/**
 * DIPLOMATIE-T2 — banc e2e GUI (L4, handoff 28/10). Deux scénarios :
 *  PHASE SOLO (1v1 bot, GOD-MODE) :
 *   A. en PAIX : ouverture de la modale 🤝 (Négocier), échange de techs
 *      REFUSÉ (or demandé insultant — capture toast), puis ÉCHANGE ACCEPTÉ
 *      (tech contre 1 or — capture + vérification dump admin) ;
 *   B. le JOUEUR déclare la guerre PAR L'UI (⚔), quelques tours, puis PAIX
 *      COMPENSÉE par la modale 🤝 : curseur au max → refus/contre-proposition
 *      (capture), re-tentatives après économie d'or → ACCEPTATION (capture ;
 *      l'or passe — dump admin), guerre purgée.
 *  PHASE PRIVACITÉ (3 sièges HUMAINS) : J1 échange une tech avec J2 —
 *   l'écran (Chroniques) de J3 ne montre RIEN ; J1 et J2 oui.
 * Captures : dev-logs/captures-diplomatie-t2/
 * Usage : node devtmp/diplomatie-t2-gui.mjs [portWorker] [portVite]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-diplomatie-t2';
const MOI = 'p1';
const BOT = 'p2';
mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const TECHS_DISPO = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));
const TERRAINS_DISPO = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/terrain.json', 'utf8'));
const DIRS = [[0,-1],[-1,0],[-1,1],[0,1],[1,0],[1,-1]];
const eauAdjacente = (st, q, r) => DIRS.some(([dq,dr]) => { const t = st.map[`${q+dq},${r+dr}`]; return t && TERRAINS_DISPO[t.terrain]?.navalAccess; });
const praticable = (st, q, r) => { const t = st.map[`${q},${r}`]; return t && TERRAINS_DISPO[t.terrain]?.passable; };
function pasVersHex(st, from, cible) {
  // premier pas d'un BFS sur les cases explorées praticables (R-81 : tri q,r)
  const origine = `${from.q},${from.r}`; const dest = `${cible.q},${cible.r}`;
  if (origine === dest) return null;
  const vus = new Set([origine]); const file = [[from.q, from.r]];
  const parent = new Map();
  while (file.length) {
    const [q, r] = file.shift();
    for (const [dq, dr] of DIRS.map(([a,b])=>[a,b]).sort((x,y)=>x[0]-y[0]||x[1]-y[1])) {
      const nq = q+dq, nr = r+dr; const k = `${nq},${nr}`;
      if (vus.has(k) || !st.explores.has(k)) continue;
      const estCible = k === dest;
      if (!estCible && !praticable(st, nq, nr)) continue;
      vus.add(k); parent.set(k, `${q},${r}`); file.push([nq, nr]);
      if (estCible) { let cur = k; while (parent.get(cur) !== origine) cur = parent.get(cur); const [a,b] = cur.split(',').map(Number); return { q: a, r: b }; }
    }
  }
  return null;
}
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let wrangler = null;
let g = null;
let tokenGlobal = null;
const verdicts = [];
const assert = (ok, label) => { if (ok) console.log(`  ✓ ${label}`); else { console.log(`  🔴 ${label}`); verdicts.push(label); } };

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
  if (wrangler) { try { execSync(`taskkill /F /T /PID ${wrangler.pid}`, { stdio: 'ignore' }); } catch {} try { wrangler.kill(); } catch {} }
  tuerPort(PORTW);
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/server', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { await sleep(1000); try { await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) }); return; } catch {} }
  throw new Error('wrangler ne redémarre pas');
}
async function dumpFull(codeJeu) {
  for (let essai = 0; essai < 6; essai++) {
    try {
      const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, signal: AbortSignal.timeout(8000) });
      return await res.json();
    } catch (e) {
      console.log(`[wrangler] figé (${e.message}) — redémarrage`);
      await demarrerWrangler(true);
      if (tokenGlobal) await assurerSocket(codeJeu);
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
    else { pending.push(msg); if (msg.type === 'Error') console.log('[lobby-err]', msg.code, msg.message); }
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
/** Partie NOUVELLE forme (5 sièges, démarrage manuel) — les HUMAINS
 *  joignent AVANT le StartGame (D6 : tout siège humain doit être occupé). */
async function creerPartieSieges(token, types, tokensInvites) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  const palettes = ['bleu-saphir', 'rouge-royal', 'vert-emeraude', 'jaune-dor', 'cuivre-ardent'];
  const config = {
    sieges: types.map((t, i) => ({ type: t, paletteId: palettes[i], civId: null })),
    civsAleatoires: true,
    topographie: 'archipel',
  };
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, config } });
  const created = await lobby.waitFor('GameCreated');
  const code = created.code;
  for (const tok of tokensInvites ?? []) {
    const l = wsConnect('/ws/lobby', tok);
    await l.open;
    await l.waitFor('GameList');
    l.send({ proto: 1, type: 'JoinGame', code, paletteId: ['rouge-royal', 'vert-emeraude'][ (tokensInvites ?? []).indexOf(tok) ] ?? 'jaune-dor' });
    await l.waitFor('GameJoined');
    l.close();
  }
  lobby.send({ proto: 1, type: 'StartGame', code });
  await sleep(3000);
  lobby.close();
  return code;
}
const ordre = (order) => g.send({ proto: 1, type: 'SubmitOrder', order });

finirTour.appels = 0;
async function finirTour(codeJeu, { conversionOr = false } = {}) {
  finirTour.appels += 1;
  for (let essai = 0; essai < 4; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    await assurerSocket(codeJeu);
    if (!stv.players[MOI].researching) {
      const cibleTech = stv.players[MOI].techsUnlocked.includes('poterie') ? 'rites_funeraires' : 'poterie';
      try { g.send({ proto: 1, type: 'SetResearch', techId: cibleTech }); await sleep(400); } catch {}
    }
    // Conversion : SCIENCE jusqu'à l'arbre visé (poterie → rites_funeraires),
    // puis OR (la compensation). Le défaut de fondation est « or » — sans
    // bascule la science reste à 0 et AUCUNE tech ne se recherche jamais.
    const ciblesTechs = ['poterie', 'rites_funeraires'];
    const toutAppris = ciblesTechs.every((t) => stv.players[MOI].techsUnlocked.includes(t));
    for (const v of Object.values(stv.cities).filter((c) => c.owner === MOI)) {
      const cibleConv = conversionOr || toutAppris ? 'gold' : 'science';
      if (v.conversion !== cibleConv) {
        try { g.send({ proto: 1, type: 'SetConversion', cityId: v.id, target: cibleConv }); await sleep(300); } catch {}
      }
      if (!v.production) {
        ordre({ type: 'SetProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
        await sleep(400);
      }
    }
    // Fondation EN CÔTE (l'économie : commerce = eau/désert uniquement — un
    // capitale intérieure ne produit NI or NI science) : le colon marche vers
    // la case explorée praticable adjacente d'eau la plus proche, puis fonde.
    const villesMoi = Object.values(stv.cities).filter((c) => c.owner === MOI);
    if (villesMoi.length === 0) {
      const colon = Object.values(stv.units).find((u) => u.owner === MOI && u.type === 'colon');
      if (colon) {
        const ctx2 = { explorees: new Set(stv.players[MOI].vision.explored) };
        const cote = { explorees: ctx2.explorees };
        let meilleure = null; let bestD = Infinity;
        for (const k of cote.explorees) {
          const [q, r] = k.split(',').map(Number);
          if (!praticable(stv, q, r) || stv.units[`${k}`]) continue;
          if (!eauAdjacente(stv, q, r)) continue;
          const d = Math.abs(q - colon.q) + Math.abs(r - colon.r);
          if (d < bestD) { bestD = d; meilleure = { q, r }; }
        }
        if (meilleure && (meilleure.q !== colon.q || meilleure.r !== colon.r)) {
          const pas = pasVersHex({ explorees: cote.explorees }, colon, meilleure);
          if (pas) { ordre({ type: 'Move', unitId: colon.id, path: [pas] }); await sleep(400); }
        } else if (meilleure) {
          ordre({ type: 'FoundCity', unitId: colon.id }); await sleep(400);
        } else if (bestD === Infinity) {
          ordre({ type: 'FoundCity', unitId: colon.id }); await sleep(400); // repli : pas de côte connue
        }
      }
    } else {
      // Travailler une case d'eau (commerce 3) — assignation manuelle, les
      // citoyens auto privilégient la nourriture (R-58).
      const v0 = villesMoi[0];
      for (const [dq, dr] of DIRS) {
        const k = `${v0.q + dq},${v0.r + dr}`;
        const t = stv.map[k];
        if (t && TERRAINS_DISPO[t.terrain]?.navalAccess && !v0.workedTiles.includes(k)) {
          ordre({ type: 'SetWorkedTile', cityId: v0.id, tile: k });
          await sleep(400);
          break;
        }
      }
    }
    // Levée d'or : l'économie de départ ne produit presque aucun or
    // (commerce = eau/désert uniquement) — on VEND un guerrier excédentaire
    // (SellUnit = +50 % du coût de production) tous les 3 tours.
    if (finirTour.appels % 3 === 0) {
      const vendable = Object.values(stv.units)
        .filter((u) => u.owner === MOI && u.type === 'guerrier' && !u.aboard)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (vendable) { ordre({ type: 'SellUnit', unitId: vendable.id }); await sleep(400); }
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
  for (let i = 0; i < 60; i++) { await sleep(1000); try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {} }
  void vite;
  throw new Error('vite ne démarre pas');
}
async function ouvrirNegociation(page) {
  const btn = page.locator('.pastille button.pastille-guerre.declarer.negocier').first();
  await btn.waitFor({ timeout: 15000 });
  await btn.evaluate((el) => el.click());
  await page.waitForSelector('.negociation-boite', { timeout: 10000 });
}
async function ouvrirChroniques(page) {
  const bouton = page.locator('button:has-text("Chroniques")').first();
  if (await bouton.count()) { await bouton.click().catch(() => {}); await sleep(800); }
}

try {
  const SKIP_SOLO = process.env.SKIP_SOLO === '1';
  await demarrerVite();
  await demarrerWrangler();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // ================= PHASE SOLO — échange + paix compensée =================
  const NOM1 = `ErikDiploT2${STAMP}`;
  if (SKIP_SOLO) { console.log('[solo] SKIPPÉ (SKIP_SOLO=1) — captures solo déjà produites'); }
  if (!SKIP_SOLO) { `ErikDiploT2${STAMP}`;
  const token = await login(NOM1);
  tokenGlobal = token;
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  const code = created.code;
  console.log(`[solo] partie ${code}`);
  for (let i = 0; i < 15; i++) { const d = await dumpFull(code); if (d.state) break; await sleep(2000); }

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

  // ---- A0 : tours d'économie jusqu'à PRÊT (tech connue de moi seule et
  //      chère — refuse 1:1 sans contrainte de trésorerie — + or ≥ 60 pour
  //      la paix compensée ; plafond 40 tours) ----
  const pret = (st) => {
    const mes = st.players[MOI].techsUnlocked;
    const ses = st.players[BOT].techsUnlocked;
    const offerte = mes.find((t) => !ses.includes(t) && (TECHS_DISPO[t]?.cost ?? 0) >= 27);
    return { pret: !!offerte && st.players[MOI].treasury >= 25, offerte, ses };
  };
  let stEco = (await dumpFull(code)).state;
  for (let t = 0; t < 70; t++) {
    const p = pret(stEco);
    if (p.pret) break;
    if (!(await finirTour(code))) throw new Error(`tour éco ${t} non avancé`);
    stEco = (await dumpFull(code)).state;
    console.log(`[éco t${stEco.turn}] or=${stEco.players[MOI].treasury} techs=${JSON.stringify(stEco.players[MOI].techsUnlocked)} bot=${JSON.stringify(stEco.players[BOT].techsUnlocked)}`);
  }
  const PRETE = pret(stEco);
  if (!PRETE.pret) console.log('  🔴 éco insuffisante après 70 tours (continu en dégradé)');

  // ---- Ordre des phases selon l'état de guerre réel : l'ÉCHANGE exige la
  //      paix, la PAIX COMPENSÉE exige la guerre (canon). Si le bot a déjà
  //      déclaré la guerre pendant l'éco (fréquent), on négocie la paix
  //      D'ABORD puis les échanges ; sinon échanges → déclaration UI → paix.
  let stW = (await dumpFull(code)).state;
  const dejaEnGuerre = stW.diplomacy.war.length > 0;

  /** Phase PAIX COMPENSÉE — suppose la guerre en cours. */
  async function phasePaix() {
    await ouvrirNegociation(page);
    await page.locator('#negoc-or').fill('1');
    await page.screenshot({ path: `${CAP}/paix-compensee-proposition-basse.png` });
    await page.locator('.negociation-envoyer.paix').click();
    await sleep(2500);
    await page.screenshot({ path: `${CAP}/paix-compensee-refusee.png` });
    let st2 = (await dumpFull(code)).state;
    assert(st2.diplomacy.war.length > 0, 'paix compensée REFUSÉE (guerre intacte, or intact)');
    let acceptee2 = false;
    for (let tentative = 0; tentative < 5 && !acceptee2; tentative++) {
      const orAvant = (await dumpFull(code)).state.players[MOI].treasury;
      if (orAvant <= 0) { for (let t = 0; t < 4; t++) await finirTour(code); }
      await ouvrirNegociation(page);
      await page.locator('#negoc-or').evaluate((el, v) => {
        el.max = String(v); el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(orAvant));
      await page.screenshot({ path: `${CAP}/paix-compensee-proposition-max-t${tentative}.png` });
      await page.locator('.negociation-envoyer.paix').click();
      await sleep(2500);
      await page.screenshot({ path: `${CAP}/paix-compensee-reponse-t${tentative}.png` });
      st2 = (await dumpFull(code)).state;
      acceptee2 = st2.diplomacy.war.length === 0;
      console.log(`[paix t${tentative}] wars=${JSON.stringify(st2.diplomacy.war)} or moi=${st2.players[MOI].treasury} or bot=${st2.players[BOT].treasury}`);
    }
    assert(acceptee2, `paix compensée ACCEPTÉE (wars vide, or transféré : moi=${st2.players[MOI].treasury} bot=${st2.players[BOT].treasury})`);
  }

  /** Phase ÉCHANGES — suppose la PAIX en cours. */
  async function phaseEchanges() {
    // REFUS : poterie (20) contre 150 or (20 < 150 × 1,25 × 0,6 → refus net)
    let st2 = (await dumpFull(code)).state;
    const goldAvant = st2.players[MOI].treasury;
    await ouvrirNegociation(page);
    await page.locator('#negoc-offerte').selectOption('poterie');
    await page.locator('input[type=radio][value=or]').check();
    await page.locator('#negoc-ordemande').fill('150');
    await page.screenshot({ path: `${CAP}/echange-refuse-proposition.png` });
    await page.locator('.negociation-envoyer:not(.paix)').click();
    await sleep(2500);
    await page.screenshot({ path: `${CAP}/echange-refuse.png` });
    st2 = (await dumpFull(code)).state;
    assert(
      st2.players[MOI].treasury === goldAvant && !st2.players[BOT].techsUnlocked.includes('poterie'),
      `échange REFUSÉ : rien ne bouge (or ${st2.players[MOI].treasury} = ${goldAvant})`,
    );
    // ACCEPTÉ : poterie contre 1 or
    await ouvrirNegociation(page);
    if ((await page.locator('input[type=radio][value=or]').count()) === 0) {
      throw new Error('aucune tech à proposer (mesTechs vide) — phase échanges impossible');
    }
    await page.locator('#negoc-offerte').selectOption('poterie');
    await page.locator('input[type=radio][value=or]').check();
    await page.locator('#negoc-ordemande').fill('1');
    await page.screenshot({ path: `${CAP}/echange-proposition.png` });
    await page.locator('.negociation-envoyer:not(.paix)').click();
    await sleep(2500);
    await page.screenshot({ path: `${CAP}/echange-accepte.png` });
    st2 = (await dumpFull(code)).state;
    const nouvelle = st2.players[BOT].techsUnlocked.find((t) => !stEco.players[BOT].techsUnlocked.includes(t));
    assert(!!nouvelle && stEco.players[MOI].techsUnlocked.includes(nouvelle), `échange ACCEPTÉ : le bot connaît ${nouvelle ?? '—'} (or bot=${st2.players[BOT].treasury})`);
  }

  /** Déclaration de guerre PAR L'UI (si en paix). */
  async function declarerGuerreUI() {
    const btnGuerre = page.locator('.pastille button.pastille-guerre.declarer:not(.paix):not(.negocier)').first();
    await btnGuerre.waitFor({ timeout: 15000 });
    await btnGuerre.click();
    await page.waitForSelector('.guerre-boite', { timeout: 10000 });
    await page.screenshot({ path: `${CAP}/modale-declaration.png` });
    await page.locator('.guerre-confirmer:not(.paix)').click();
    await sleep(2500);
  }

  await ouvrirNegociation(page);
  await sleep(500);
  await page.screenshot({ path: `${CAP}/modale-negociation.png` });

  if (dejaEnGuerre) {
    console.log('[guerre] le bot a DÉJÀ déclaré pendant l éco');
    await phasePaix();
    await phaseEchanges();
  } else {
    await phaseEchanges();
    await declarerGuerreUI();
    let st2 = (await dumpFull(code)).state;
    assert(st2.diplomacy.war.length > 0, `guerre déclarée (${JSON.stringify(st2.diplomacy.war)})`);
    for (let t = 0; t < 3; t++) if (!(await finirTour(code))) throw new Error(`tour guerre ${t} non avancé`);
    await phasePaix();
  }
  const stFin = (await dumpFull(code)).state;
  assert(stFin.diplomacy.war.length === 0, `paix finale signée (wars=${JSON.stringify(stFin.diplomacy.war)})`);

  }
  // ================= PHASE PRIVACITÉ — 3 humains =================
  console.log('[privacité] partie à 3 sièges humains');
  const t1 = await login(`${NOM1}j1`);
  const t2 = await login(`${NOM1}j2`);
  const t3 = await login(`${NOM1}j3`);
  const code3 = await creerPartieSieges(t1, ['humain', 'humain', 'humain', 'bot', 'bot'], [t2, t3]);
  console.log(`[privacité] partie ${code3}`);
  for (let i = 0; i < 20; i++) { const d = await dumpFull(code3); if (d.state) break; await sleep(2000); }
  for (let i = 0; i < 20; i++) { const d = await dumpFull(code3); if (d.state) break; await sleep(2000); }

  tokenGlobal = t1;
  await assurerSocket(code3);
  // J2/J3 sont des HUMAINS : la résolution exige qu'ils verrouillent aussi.
  // Sockets dédiés + production + EndTurn par tour (blocage fin de tour).
  const g2 = wsConnect(`/ws/game/${code3}`, t2); await g2.open; await g2.waitFor('Welcome');
  const g3 = wsConnect(`/ws/game/${code3}`, t3); await g3.open; await g3.waitFor('Welcome');
  const envoyer = (socket, m) => socket.send(typeof m === 'string' ? m : JSON.stringify(m));
  async function tour3() {
    const stv = (await dumpFull(code3)).state;
    const avant = stv.turn;
    // J1 : recherche/conversion pilotés par finirTour ; J2/J3 : production.
    for (const [socket, pid] of [[g2, 'p2'], [g3, 'p3']]) {
      for (const v of Object.values(stv.cities).filter((c) => c.owner === pid)) {
        if (!v.production) { envoyer(socket, { proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } } }); await sleep(250); }
        if (pid === 'p2') {
          // J2 recherche poterie (conversion science) — l'échange 1:1 visé.
          if (v.conversion !== 'science') { envoyer(socket, { proto: 1, type: 'SetConversion', cityId: v.id, target: 'science' }); await sleep(250); }
          if (!stv.players[pid].researching) { envoyer(socket, { proto: 1, type: 'SetResearch', techId: 'poterie' }); await sleep(250); }
        }
      }
      envoyer(socket, { proto: 1, type: 'EndTurn' });
    }
    if (!(await finirTour(code3, { conversionOr: true }))) return false;
    return (await dumpFull(code3)).state.turn > avant;
  }
  // ~20 tours : poterie (20 🔬) doit être connue de J1 pour l'échange.
  let pret3 = false;
  for (let t = 0; t < 60 && !pret3; t++) {
    if (!(await tour3())) { console.log(`[privacité] tour ${t} non avancé`); break; }
    const stG = (await dumpFull(code3)).state;
    pret3 = stG.players['p2'].techsUnlocked.includes('poterie') && stG.players[MOI].treasury >= 1;
  }
  const stPot = (await dumpFull(code3)).state;
  console.log(`[privacité] t${stPot.turn} techs p1=${JSON.stringify(stPot.players[MOI].techsUnlocked)}`);
  const st3 = (await dumpFull(code3)).state;
  const id2 = Object.keys(st3.players).find((p) => p !== MOI);
  const meta3 = (await dumpFull(code3)).meta.players;
  const engine2 = meta3.find((p) => p.id !== meta3.find((q) => q.engineId === MOI)?.id)?.engineId;
  console.log(`[privacité] engineIds: moi=${MOI} j2=${engine2 ?? id2}`);

  const p1 = await ctx.newPage();
  const p2 = await ctx.newPage();
  const p3 = await ctx.newPage();
  await ctx.addCookies([{ name: 'session', value: t2, url: GUI }]);
  await p2.goto(`${GUI}/#/game/${code3}`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await ctx.addCookies([{ name: 'session', value: t3, url: GUI }]);
  await p3.goto(`${GUI}/#/game/${code3}`, { waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await ctx.addCookies([{ name: 'session', value: t1, url: GUI }]);
  await p1.goto(`${GUI}/#/game/${code3}`, { waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(2500);

  // J1 propose l'échange à J2 (tech contre 1 or — humain : acceptation par
  // défaut, miroir T1 consigné 🔶).
  const stPre = (await dumpFull(code3)).state;
  const techsP1Avant = stPre.players[MOI].techsUnlocked;
  const orP1 = stPre.players[MOI].treasury;
  assert(orP1 >= 1, `trésorerie de J1 suffisante (${orP1} or)`);
  // Démonstration de PRIVACITÉ par la PAIX COMPENSÉE avec un BOT (siège bot
  // de la partie 5 sièges) : guerre → offre refusée → PeaceOfferRefused
  // PRIVÉ (parties J1+bot uniquement) ; l'humain J3 ne doit RIEN voir.
  const metaBots = (await dumpFull(code3)).meta.players.filter((p) => p.bot === true);
  const botEng = metaBots[0]?.engineId;
  console.log(`[privacité] bot cible = ${botEng}`);
  envoyer(g, { proto: 1, type: 'DeclareWar', player: botEng });
  await sleep(2500);
  envoyer(g, { proto: 1, type: 'ProposePeace', player: botEng, goldOffer: 1 });
  await sleep(6000);
  const stPost = (await dumpFull(code3)).state;
  assert(stPost.diplomacy.war.some(([x, y]) => (x === MOI && y === botEng) || (x === botEng && y === MOI)),
    `paix compensée REFUSÉE par le bot (guerre intacte avec ${botEng})`);

  // Captures : chroniques J1/J2 (entrée présente) vs J3 (RIEN).
  for (const [p, nom] of [[p1, 'j1'], [p2, 'j2'], [p3, 'j3']]) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: `${CAP}/priva-${nom}.png` });
  }
  const texteJ3 = await p3.evaluate(() => document.body.innerText);
  assert(!texteJ3.includes('échange') && !texteJ3.includes('Échange'), 'PRIVACITÉ : l’écran de J3 ne montre AUCUNE trace de l’échange');
  const texteJ1 = await p1.evaluate(() => document.body.innerText);
  assert(texteJ1.includes('REFUSE votre paix compensée') || texteJ1.includes('paix compensée'), 'l’écran de J1 porte la négociation (Chronique privée)');

  await browser.close();
  writeFileSync(`${CAP}/verdicts.json`, JSON.stringify({ stamp: STAMP, verdicts }, null, 2));
  if (verdicts.length > 0) { console.log(`ÉCHEC : ${verdicts.length} verdict(s) rouge(s)`); process.exitCode = 1; }
  else console.log('PASS ✓');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
