/**
 * GESTE-ARMEE — captures locales AVANT commit (L2, handoff 04/11).
 * Le geste CivRev complet dans une partie solo vs bots : bouton
 * « ⚔ Former une armée » → choix des 2 coéquipiers (clics carte) → pose du
 * rendez-vous → ordre FormArmy soumis → fusion à la résolution → armée jouée.
 *
 * Piège consigné (exécutions 04/11) : avec la page ouverte, la résolution
 * locale n'avance pas (le DO se rend qu'après fermeture du navigateur) — la
 * CROISSANCE (production des 3 guerriers) est donc pilotée headless par WS
 * (miroir des bancs), le navigateur n'ouvre que pour le geste.
 * Captures : dev-logs/captures-geste-armee/ (navigateur 1280×720 — piège connu).
 * Usage : node devtmp/geste-armee-gui.mjs [portWorker]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // PIÈGE : le proxy Vite (5174) vise 8787 — la page, les ws et l'admin doivent partager LE MÊME worker, sinon ordres perdus (mémoires DO séparées).
// Piège connu (mémoire serveurs-locaux-dev) : Vite est FIXÉ au port 5174.
const PORTG = '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-geste-armee';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikArmee${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

let wrangler = null;
let code = null;
let token = null;

async function demarrerWrangler() {
  try {
    await fetch(`${BASE}/`);
    console.log('[wrangler] instance déjà en vie — réutilisée');
    return;
  } catch {}
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server',
    shell: true,
    stdio: ['ignore', fs.openSync('C:/Users/Erik/ZCodeProject/devtmp/wrangler-geste.log', 'w'), fs.openSync('C:/Users/Erik/ZCodeProject/devtmp/wrangler-geste.err.log', 'w')],
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
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
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
    if (process.env.GESTE_DEBUG) console.log('[ws]', msg.type, msg.code ?? '', msg.reason ?? '', msg.accepted ?? '');
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, ms = 120000) => new Promise((resolve, reject) => {
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
async function creerPartie(tok) {
  const lobby = wsConnect('/ws/lobby', tok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
async function demarrerVite() {
  try {
    await fetch(GUI);
    console.log('[vite] déjà en vie — réutilisée');
    return;
  } catch {}
  const vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {}
  }
  void vite;
  throw new Error('vite ne démarre pas');
}

// ---------------------------------------------------------------------------
// Croissance HEADLESS (WS) — miroir des bancs : ordres + EndTurn + Snapshot.
// ---------------------------------------------------------------------------
function unitesP1(state) {
  const units = Array.isArray(state.units) ? state.units : Object.values(state.units ?? {});
  return units.filter((u) => u.owner === 'p1' && !u.aboard && !u.cargo);
}
function villeP1(state) {
  const cities = Array.isArray(state.cities) ? state.cities : Object.values(state.cities ?? {});
  return cities.find((c) => c.owner === 'p1') ?? null;
}

async function croissanceHeadless(ws, etatInitial) {
  let etat = etatInitial;
  for (let garde = 0; garde < 45; garde++) {
    const guerriers = unitesP1(etat).filter((u) => u.type === 'guerrier');
    if (guerriers.length >= 3) return { etat, guerriers };
    const ville = villeP1(etat);
    if (!ville) {
      const colon = unitesP1(etat).find((u) => u.type === 'colon');
      if (!colon) throw new Error('ni ville ni colon — état imprévu');
      console.log(`[fondation] colon ${colon.id} en (${colon.q},${colon.r})`);
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
    } else if (!(ville.production?.kind === 'unit' && ville.production.id === 'guerrier')) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } });
    }
    ws.send({ proto: 1, type: 'EndTurn' });
    // Après EndTurn, le serveur diffuse TurnResult (état résolu inclus) —
    // PAS un nouveau Snapshot (exécution 04/11, trace GESTE_DEBUG).
    const resultat = await ws.waitFor('TurnResult');
    etat = resultat.state;
    console.log(`[croissance] tour ${etat.turn} — ${unitesP1(etat).filter((u) => u.type === 'guerrier').length} guerriers`);
  }
  throw new Error('croissance non aboutie en 45 tours');
}

/** Fin de tour headless jusqu'à ce qu'un prédicat soit vrai sur l'état. */
async function endTurnHeadless(ws, etat) {
  // FIN-DE-TOUR-PRODUCTION : toute ville p1 à marteaux sans production
  // bloque le EndTurn — on arme Guerrier avant de verrouiller.
  for (const ville of Object.values(etat.cities ?? {}).filter((c) => c.owner === 'p1')) {
    if (!ville.production) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } });
      await ws.waitFor('OrderAck');
    }
  }
  ws.send({ proto: 1, type: 'EndTurn' });
  const resultat = await ws.waitFor('TurnResult');
  return resultat.state;
}

// BFS terrestre (passable engine : terrains passables, unités contournées) —
// miroir simplifié de pathTo client, suffisant pour la convergence de mise
// en scène. Retourne le chemin SANS l'origine, ou null.
function voisinsHex(h, W, H) {
  // Monde cylindrique E↔O : q boucle (négatif valide), r borné.
  return [[h[0] + 1, h[1]], [h[0] - 1, h[1]], [h[0], h[1] + 1], [h[0], h[1] - 1], [h[0] + 1, h[1] - 1], [h[0] - 1, h[1] + 1]]
    .filter(([, r]) => r >= 0 && r < H);
}
function bfsChemin(state, from, to) {
  const W = state.mapWidth, H = state.mapHeight;
  const tile = (q, r) => state.map[`${q},${r}`];
  const passable = (q, r) => {
    const t = tile(q, r);
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
  const occupé = (q, r) => unitesP1(state).some((u) => u.q === q && u.r === r) || unitesP1(state).length < 0; // unités contournées
  const debut = [from.q, from.r], but = [to.q, to.r];
  if (debut[0] === but[0] && debut[1] === but[1]) return [];
  const came = new Map([[debut.join(','), null]]);
  const file = [debut];
  while (file.length) {
    const cur = file.shift();
    for (const n of voisinsHex(cur, W, H)) {
      const k = n.join(',');
      if (came.has(k)) continue;
      const estBut = n[0] === but[0] && n[1] === but[1];
      if (!estBut && (!passable(n[0], n[1]) || occupé(n[0], n[1]))) continue;
      came.set(k, cur.join(','));
      if (estBut) {
        const chemin = [];
        let c = k;
        while (c && c !== debut.join(',')) {
          const [q, r] = c.split(',').map(Number);
          chemin.unshift({ q, r });
          c = came.get(c);
        }
        return chemin;
      }
      file.push(n);
    }
  }
  return null;
}

/**
 * GESTE-ARMEE rév. 2 — convergence vers la VILLE (la garnison autorise la
 * co-location ; une case ordinaire tronquerait les co-destinations amies,
 * R-159) : chaque guerrier marche vers la ville ; quand tous sont adjacents
 * ou dessus, les Move finaux vers la ville sont soumis SANS EndTurn — les
 * ordres persistent, la page ouverte ensuite montre la carte de proposition.
 */
async function convergerVersVille(ws, etatInitial) {
  let etat = etatInitial;
  const ville = villeP1(etat);
  if (!ville) throw new Error('ville absente pour la convergence');
  const rally = { q: ville.q, r: ville.r };
  for (let i = 0; i < 25; i++) {
    const gs = unitesP1(etat).filter((u) => u.type === 'guerrier');
    const hors = gs.filter((u) => !(u.q === rally.q && u.r === rally.r));
    const adjacenteOuSur = (u) => u.q === rally.q && u.r === rally.r
      || voisinsHex([u.q, u.r], etat.mapWidth, etat.mapHeight).some(([q, r]) => q === rally.q && r === rally.r);
    console.log(`[conv-diag] tour ${etat.turn} hors=${hors.length} ${hors.map((u) => `${u.id}(${u.q},${u.r})${adjacenteOuSur(u) ? '✓' : '✗'}`).join(' ')}`);
    if (hors.every(adjacenteOuSur)) {
      for (const u of hors) {
        ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: u.id, path: [rally] } });
        await ws.waitFor('OrderAck');
      }
      console.log(`[convergence] Move finaux soumis (tour ${etat.turn}) — ${hors.length} unités`);
      return etat;
    }
    for (const u of hors) {
      const chemin = bfsChemin(etat, u, rally);
      if (chemin && chemin.length > 0) {
        ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: u.id, path: [chemin[0]] } });
        await ws.waitFor('OrderAck');
      }
    }
    etat = await endTurnHeadless(ws, etat);
    console.log(`[convergence] tour ${etat.turn}`);
  }
  throw new Error('convergence non aboutie en 25 tours');
}

/** Fin de tour headless jusqu'à ce qu'un prédicat soit vrai sur l'état. */
async function toursJusqua(ws, etat, predicat, tours, label) {
  for (let i = 0; i < tours; i++) {
    if (predicat(etat)) return etat;
    etat = await endTurnHeadless(ws, etat);
    console.log(`[tour] ${label} — tour ${etat.turn}`);
  }
  throw new Error(`${label} non atteint en ${tours} tours`);
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo/bots] partie ${code}`);

  // Croissance headless : 3 guerriers p1.
  const ws = wsConnect(`/ws/game/${code}`, token);
  await ws.open;
  await ws.waitFor('Welcome');
  // Le Snapshot initial peut être absent si la partie finissait de s'initialiser
  // — un ResyncRequest (proto 1) le redéclenche (miroir du client).
  let premier = null;
  try {
    premier = await ws.waitFor('Snapshot', 5000);
  } catch {
    ws.send({ proto: 1, type: 'ResyncRequest', lastSeq: -1 });
    premier = await ws.waitFor('Snapshot');
  }
  const { etat: etatFin, guerriers } = await croissanceHeadless(ws, premier.state);
  console.log(`[croissance] OK — ${guerriers.length} guerriers p1 (tour ${etatFin.turn})`);

  // Convergence vers la ville (garnison = co-location légale), Move finaux
  // soumis SANS EndTurn : la carte de proposition doit apparaître à l'ouverture.
  const etatConvergence = await convergerVersVille(ws, etatFin);

  // Piège (exécutions 04/11) : le socket headless qui reste connecté ÉVINE
  // la page (2e socket du même joueur) — les soumissions de la page partent
  // alors dans le vide. Fermeture AVANT d'ouvrir le navigateur.
  ws.close();

  // Navigateur 1280×720 (piège connu).
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);

  // GESTE-ARMEE rév. 2 : la PROPOSITION automatique — les 3 guerriers
  // produits sont co-localisés (production de la capitale) : la carte doit
  // proposer la formation sans aucun clic de geste.
  const carte = page.locator('.prop-armee');
  if (!(await carte.isVisible().catch(() => false))) throw new Error('carte de proposition absente (3 guerriers co-localisés attendus)');
  const texte = (await carte.textContent()) ?? '';
  console.log('[proposition]', texte.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: `${CAP}/1-proposition-automatique.png` });

  // Confirmation → FormArmy soumis (les unités sont déjà au rendez-vous).
  await carte.locator('button', { hasText: "Former l'armée" }).first().click();
  await sleep(600);
  if (await carte.isVisible().catch(() => false)) throw new Error('carte toujours visible après confirmation');
  console.log('[geste] proposition confirmée — FormArmy soumis');
  await sleep(2000);
  const dumpConfirm = await dumpFull(code);
  console.log('[diag] ordres p1 après confirmation :', JSON.stringify(dumpConfirm.orders?.p1 ?? []));
  await page.screenshot({ path: `${CAP}/2-proposition-confirmee.png` });

  // Résolution : la page est FERMÉE (piège de l'exécution 04/11 — le DO ne
  // résout quasiment plus tant qu'un navigateur tient un socket). La page a
  // ÉVINÉ notre socket headless (piège 2e socket du même joueur) : on se
  // reconnecte, puis la fusion est pilotée headless ; la page est rouverte
  // ensuite pour la capture D3.
  await browser.close();
  // Connexion FRAÎCHE inconditionnelle : la page a éviné le socket headless
  // (piège 2e socket du même joueur) et un socket à demi-mort avale les
  // EndTurn sans erreur — exécutions 04/11.
  try { ws.close(); } catch {}
  const wsFin = wsConnect(`/ws/game/${code}`, token);
  await wsFin.open;
  await wsFin.waitFor('Welcome');
  const snapFin = await wsFin.waitFor('Snapshot');
  const etatCourant = snapFin.state;
  const tourAvant = etatCourant.turn;  const etatFinal = await toursJusqua(
    wsFin, etatCourant,
    (s) => unitesP1(s).some((u) => u.isArmy),
    6, 'fusion armée',
  );
  const armee = unitesP1(etatFinal).find((u) => u.isArmy);
  if (!armee) throw new Error('aucune armée formée');
  console.log(`[fusion] ARMÉE FORMÉE : ${armee.id} en (${armee.q},${armee.r}) — tour ${etatFinal.turn - tourAvant} après le rendez-vous`);

  const browser2 = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx2 = await browser2.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx2.addCookies([{ name: 'session', value: token, url: GUI }]);
  const page2 = await ctx2.newPage();
  page2.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page2.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);
  await page2.evaluate(([qq, rr]) => window.__game.clickHex(qq, rr), [armee.q, armee.r]);
  await sleep(800);
  const titre = await page2.locator('.panel .title').first().textContent().catch(() => '');
  if (!titre || !titre.includes('armée')) throw new Error(`l'armée ne s'affiche pas comme entité jouable : ${titre}`);
  console.log('[D3] armée sélectionnable et affichée :', titre.trim());
  await page2.screenshot({ path: `${CAP}/5-armee-formee-jouable.png` });
  await browser2.close();
  wsFin.close();
  console.log(`[OK] captures dans ${CAP} — partie ${code}`);
} finally {
  if (wrangler) { try { wrangler.kill(); } catch {} }
}
