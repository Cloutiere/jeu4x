/**
 * FONDATION-PREVIEW — captures locales AVANT commit (L2, handoff 05/11).
 * La case de fondation d'un colon se teinte à la couleur de sa nation
 * (rendu culturel, opacité d'aperçu). Captures visées (1280×720) :
 *   1. colon SUR PLACE — ordre FoundCity direct (touche B) → teinte sur sa case
 *   2. colon EN CHEMIN — destination programmée + bouton « → 2. Fonder » →
 *      teinte sur la DESTINATION (le contour du chemin cohabite, D1)
 *   3. ANNULÉ — « Annuler l'ordre » → teinte disparue (D3)
 *
 * Mise en scène : solo vs bots, le colon de départ (le joueur démarre colon).
 * TOUTES les actions passent par la PAGE (clickHex/keyboard/boutons panneau) :
 * les ordres brouillons vivent dans la session de la page — jamais de socket
 * headless concurrent (piège éviction 2e socket). UN SEUL worker 8787 ;
 * Vite relancé à neuf (piège module STALE). Captures :
 * dev-logs/captures-fondation-preview/
 * Usage : node devtmp/fondation-preview-gui.mjs [portWorker]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // PIÈGE : proxy Vite (5174) vise 8787.
const PORTG = '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-fondation-preview';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikFondPrev${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let vite = null;
let code = null;
let token = null;
let colon2 = null;

async function demarrerVite() {
  try { await fetch(GUI); console.log('[vite] déjà en vie — STALE possible : tuer le processus avant recapture'); return; } catch {}
  vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré À NEUF'); return; } catch {}
  }
  throw new Error('vite ne démarre pas');
}
async function login(nom) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(nom)}`, { redirect: 'manual' });
  const cookie = res.headers.get('set-cookie') ?? '';
  const m = /session=([^;]+)/.exec(cookie);
  if (!m) throw new Error(`pas de cookie de session (status ${res.status})`);
  return m[1];
}
function wsConnect(path, tok) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(tok)}`);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    ws.lastMessage = msg;
    if (ws.resolveFor && ws.resolveFor(msg.type, msg)) { ws.resolveFor = null; }
  });
  ws.waitFor = (type, timeout = 20000) => new Promise((res, rej) => {
    const timer = setTimeout(() => { ws.resolveFor = null; rej(new Error(`timeout ${type}`)); }, timeout);
    ws.resolveFor = (t, m) => { if (t === type) { clearTimeout(timer); res(m); return true; } return false; };
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.send = ((orig) => (m) => orig(typeof m === 'string' ? m : JSON.stringify(m)))(ws.send.bind(ws));
  return ws;
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
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
}
function unitsOf(dump) {
  const u = dump.state?.units ?? dump.units ?? {};
  return Array.isArray(u) ? u : Object.values(u);
}
async function ouvrirPage(tok, codeJeu) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: tok, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${codeJeu}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);
  return { browser, page };
}
const voisins = (q, r) => [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]];

try {
  await demarrerVite();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo/bots] partie ${code}`);

  // Coordonnées du colon p1 + une case de destination terrestre (dump admin).
  // Le joueur ne démarre PAS avec un colon : production headless d'abord
  // (socket fermé AVANT l'ouverture page — piège éviction 2e socket).
  {
    const ws = wsConnect(`/ws/game/${code}`, token);
    await ws.open;
    await ws.waitFor('Welcome');
    let snap = null;
    try { snap = await ws.waitFor('Snapshot', 5000); }
    catch { ws.send({ proto: 1, type: 'ResyncRequest', lastSeq: -1 }); snap = await ws.waitFor('Snapshot'); }
    let etat = snap.state;
    const villesP1 = () => Object.values(etat.cities ?? {}).filter((c) => c.owner === 'p1');
    const colons = () => Object.values(etat.units ?? {}).filter((u) => u.owner === 'p1' && u.type === 'colon' && !u.aboard);
    for (let i = 0; i < 40 && colons().length === 0; i++) {
      const ville = villesP1()[0];
      if (!ville) throw new Error('pas de capitale p1');
      if (!(ville.production?.kind === 'unit' && ville.production.id === 'colon')) {
        ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'colon' } } });
        await ws.waitFor('OrderAck').catch(() => null);
      }
      ws.send({ proto: 1, type: 'EndTurn' });
      const res = await ws.waitFor('TurnResult');
      etat = res.state;
      console.log(`[croissance] tour ${etat.turn} — colons p1 : ${colons().length}`);
    }
    if (colons().length === 0) throw new Error('colon non produit en 40 tours');
    colon2 = colons()[0];
    ws.close();
  }
  const colon = colon2;
  const dump = await dumpFull(code);
  if (!colon) throw new Error('aucun colon au démarrage');
  const monId = colon.owner;
  console.log(`[scene] colon ${colon.id} (${colon.q},${colon.r}) owner=${monId}`);
  const occupees = new Set(unitsOf(dump).filter((u) => !u.aboard).map((u) => `${u.q},${u.r}`));
  const dest = voisins(colon.q, colon.r).map(([q, r]) => ({ q, r }))
    .find((h) => {
      const t = dump.state?.map?.[`${h.q},${h.r}`];
      return t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne' && !occupees.has(`${h.q},${h.r}`);
    });
  if (!dest) throw new Error('aucune case terrestre voisine');
  console.log(`[scene] destination (${dest.q},${dest.r})`);

  const { browser, page } = await ouvrirPage(token, code);
  const diagSelection = async (label) => {
    const boutons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean));
    const unites = boutons.some((t) => /Tenir|Fortifier|Vendre|Fonder/.test(t));
    console.log(`[diag ${label}] sélection=${unites} previews=${JSON.stringify((await page.evaluate(() => window.__game.sondePile())).previews)}`);
  };
  const clicAnnuler = async () => {
    const b = page.getByRole('button', { name: /Annuler/ }).first();
    if (await b.count() === 0) throw new Error('bouton Annuler introuvable');
    await b.click();
    await sleep(500);
  };
  // Caméra centrée sur la destination (la ville voisine reste visible).
  const centrer = async () => {
    await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [dest.q, dest.r]);
    await sleep(600);
  };

  // Sortir le colon de la garnison POUR DE VRAI (un tour résolu) : la teinte
  // « sur place » sous le sprite de la ville ne se lirait pas.
  // Clic droit = Move draft, Pass au guerrier (badge d'attente), fin de tour.
  await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [colon.q, colon.r]);
  await sleep(400);
  await page.evaluate(([q, r]) => window.__game.rightClickHex(q, r), [dest.q, dest.r]);
  await sleep(500);
  const badgeAttente = page.getByRole('button', { name: /Unités en attente/ }).first();
  if (await badgeAttente.count() > 0) { await badgeAttente.click(); await sleep(400); }
  await page.keyboard.press('z'); // Pass sur l'unité pending (si le badge l'a sélectionnée)
  await sleep(300);
  await page.locator('button.fin-tour-rond').click();
  await sleep(6000); // résolution + playback bots

  // État frais après résolution : le colon est physiquement sur sa case ouverte.
  const dump2 = await dumpFull(code);
  const colonApres = unitsOf(dump2).find((u) => u.id === colon.id);
  if (!colonApres) throw new Error('colon disparu à la résolution');
  console.log(`[scene] colon après résolution (${colonApres.q},${colonApres.r}) tour ${dump2.state.turn}`);
  const occupees2 = new Set(unitsOf(dump2).filter((u) => !u.aboard).map((u) => `${u.q},${u.r}`));
  const villes2 = new Set(Object.values(dump2.state?.cities ?? {}).map((c) => `${c.q},${c.r}`));
  const dest2 = voisins(colonApres.q, colonApres.r).map(([q, r]) => ({ q, r }))
    .find((h) => {
      const t = dump2.state?.map?.[`${h.q},${h.r}`];
      const k = `${h.q},${h.r}`;
      return t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne' && !occupees2.has(k) && !villes2.has(k);
    });
  if (!dest2) throw new Error('aucune case ouverte voisine après résolution');

  await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [colonApres.q, colonApres.r]);
  await sleep(600);

  // 1. SUR PLACE (terrain ouvert) : sélection + B (FoundCity direct).
  await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [colonApres.q, colonApres.r]);
  await sleep(400);
  await page.keyboard.press('b');
  await sleep(600);
  await page.screenshot({ path: `${CAP}/1-colon-sur-place-fondation.png` });
  console.log('[capture] 1 sur place (FoundCity direct, teinte case courante)');

  // 2. EN CHEMIN : annulation, chemin posé au clic droit vers dest2,
  //    re-sélection du colon AFFICHÉ à dest2, bouton « → 2. Fonder ».
  await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [colonApres.q, colonApres.r]);
  await sleep(400);
  await clicAnnuler();
  await page.evaluate(([q, r]) => window.__game.rightClickHex(q, r), [dest2.q, dest2.r]);
  await sleep(500);
  await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [dest2.q, dest2.r]);
  await sleep(400);
  const fonderArrivee = page.getByRole('button', { name: /2\. Fonder/ }).first();
  if (await fonderArrivee.count() === 0) throw new Error('bouton « → 2. Fonder » introuvable');
  await fonderArrivee.click();
  await sleep(600);
  const sonde = await page.evaluate(() => window.__game.sondePile());
  console.log('[sonde] previews:', JSON.stringify(sonde.previews));
  await page.evaluate(([q, r]) => window.__game.centerOn(q, r), [dest2.q, dest2.r]);
  await sleep(600);
  await page.screenshot({ path: `${CAP}/2-colon-en-chemin-fondation.png` });
  console.log('[capture] 2 en chemin');

  // 3. ANNULÉ : la teinte suit l'état (D3) — disparition immédiate.
  //    (après « → 2. Fonder » la sélection RESTE : ne re-cliquer que si besoin)
  {
    let b = page.getByRole('button', { name: /Annuler/ }).first();
    if (await b.count() === 0) {
      await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [dest2.q, dest2.r]);
      await sleep(400);
      b = page.getByRole('button', { name: /Annuler/ }).first();
    }
    if (await b.count() === 0) throw new Error('bouton Annuler introuvable (étape 3)');
    console.log('[diag] bouton annulation :', JSON.stringify(await b.textContent()));
    await b.click();
    await sleep(600);
    let sonde2 = await page.evaluate(() => window.__game.sondePile());
    if (sonde2.previews.length > 0) {
      console.log('[diag] previews encore là — second essai après re-sélection');
      await page.evaluate(([q, r]) => window.__game.clickHex(q, r), [dest2.q, dest2.r]);
      await sleep(400);
      const b2 = page.getByRole('button', { name: /Annuler/ }).first();
      if (await b2.count() > 0) { await b2.click(); await sleep(600); }
      sonde2 = await page.evaluate(() => window.__game.sondePile());
    }
    console.log('[sonde] previews après annulation:', JSON.stringify(sonde2.previews));
    await page.screenshot({ path: `${CAP}/3-colon-annule-sans-teinte.png` });
    console.log('[capture] 3 annulé');
  }

  await browser.close();
  console.log(`[OK] captures dans ${CAP} — partie ${code}`);
} finally {
  if (vite) { try { vite.kill(); } catch {} }
}
