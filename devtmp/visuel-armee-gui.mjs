/**
 * VISUEL-ARMEE — captures locales AVANT commit (L2, handoff 05/11).
 * La bannière d'armée : 3 mini-icônes sur une première ligne + barre de vie
 * segmentée proportionnelle. Captures visées (1280×720) :
 *   1. armée PLEINE (9/9) sélectionnée + unité simple à côté (contraste 1 vs 3)
 *   2. armée BLESSÉE (hp < 9) sélectionnée (barre proportionnelle)
 *   3. armée non sélectionnée en campagne
 *
 * Mise en scène headless (miroir geste-armee-gui.mjs) : croissance 3
 * guerriers → convergence garnison → FormArmy → BLESSURE par barbares
 * (armée parquée près d'un camp/campement, attaque des barbares ou de
 * l'armée — canon BATAILLE-COMPLETE, l'armée 9 PV survit) → captures.
 *
 * Pièges consignés (REPORT-GESTE-ARMEE §4) : TOUT sur LE MÊME worker 8787
 * (proxy Vite figé) ; socket headless fermé AVANT chaque ouverture navigateur
 * (2e socket du même joueur = éviction) ; résolution pilotée headless par WS.
 * Captures : dev-logs/captures-visuel-armee/
 * Usage : node devtmp/visuel-armee-gui.mjs [portWorker]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8787'; // PIÈGE : proxy Vite (5174) vise 8787 — page, ws et admin sur LE MÊME worker.
const PORTG = '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-visuel-armee';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikVisuel${STAMP}`;
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const BARBARIEN = 'barbarien';

let wrangler = null;
let code = null;
let token = null;

async function demarrerWrangler() {
  try { await fetch(`${BASE}/`); console.log('[wrangler] instance déjà en vie — réutilisée'); return; } catch {}
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server',
    shell: true,
    stdio: ['ignore', fs.openSync('C:/Users/Erik/ZCodeProject/devtmp/wrangler-visuel.log', 'w'), fs.openSync('C:/Users/Erik/ZCodeProject/devtmp/wrangler-visuel.err.log', 'w')],
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(`${BASE}/`); return; } catch {}
  }
  throw new Error('wrangler ne redémarre pas');
}
async function dumpFull(codeJeu) {
  const res = await fetch(`${BASE}/admin/game/${codeJeu}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  return await res.json();
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
async function login(nom) {
  // Login dev local : GET /auth/dev?name=… → redirect + cookie de session
  // (le POST /login du script geste-armee 04/11 n'existe plus côté serveur).
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(nom)}`, { redirect: 'manual' });
  const cookie = res.headers.get('set-cookie') ?? '';
  const m = /session=([^;]+)/.exec(cookie);
  if (!m) throw new Error(`pas de cookie de session (status ${res.status})`);
  return m[1];
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
  try { await fetch(GUI); console.log('[vite] déjà en vie — réutilisée'); return; } catch {}
  const vite = spawn('pnpm', ['dev'], { cwd: 'C:/Users/Erik/ZCodeProject/apps/web', shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(GUI); console.log('[vite] démarré'); return; } catch {}
  }
  void vite;
  throw new Error('vite ne démarre pas');
}

// ---------------------------------------------------------------------------
// Headless (WS) — miroir geste-armee-gui.mjs
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
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
    } else if (!(ville.production?.kind === 'unit' && ville.production.id === 'guerrier')) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } });
    }
    ws.send({ proto: 1, type: 'EndTurn' });
    const resultat = await ws.waitFor('TurnResult');
    etat = resultat.state;
    console.log(`[croissance] tour ${etat.turn} — ${unitesP1(etat).filter((u) => u.type === 'guerrier').length} guerriers`);
  }
  throw new Error('croissance non aboutie en 45 tours');
}
async function endTurnHeadless(ws, etat) {
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
function voisinsHex(h, W, H) {
  return [[h[0] + 1, h[1]], [h[0] - 1, h[1]], [h[0], h[1] + 1], [h[0], h[1] - 1], [h[0] + 1, h[1] - 1], [h[0] - 1, h[1] + 1]]
    .filter(([q, r]) => r >= 0 && r < H);
}
function bfsChemin(state, from, to) {
  const W = state.mapWidth, H = state.mapHeight;
  const tile = (q, r) => state.map[`${q},${r}`];
  const passable = (q, r) => {
    const t = tile(q, r);
    return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
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
      if (!estBut && !passable(n[0], n[1])) continue;
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
/** Fusion headless : dès 3 guerriers (peu importe où), FormArmy D'ABORD
 *  (l'exemption R-44 à la troncature R-159 des co-destinations amies exige
 *  l'ordre — sans lui les Moves vers la ville sont tronqués), puis Move de
 *  chaque membre (chemin BFS complet) vers le rendez-vous = la ville.
 *  EndTurn jusqu'à la FUSION (R-44) — l'armée est une NOUVELLE unité. */
async function formerArmee(ws, etatInitial) {
  let etat = etatInitial;
  const ville = villeP1(etat);
  if (!ville) throw new Error('ville absente pour la convergence');
  const rally = { q: ville.q, r: ville.r };
  let formSoumis = false;
  for (let i = 0; i < 30; i++) {
    const armies = unitesP1(etat).filter((u) => u.isArmy);
    if (armies.length > 0) return { etat, armee: armies[0] };
    const gs = unitesP1(etat).filter((u) => u.type === 'guerrier' && !u.isArmy);
    if (!formSoumis && gs.length >= 3) {
      const membres = gs.slice(0, 3);
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'FormArmy', members: membres.map((u) => u.id), rally } });
      const ack = await ws.waitFor('OrderAck').catch(() => null);
      if (!ack) throw new Error('FormArmy rejeté (OrderAck absent)');
      formSoumis = true;
      console.log(`[fusion] FormArmy soumis (tour ${etat.turn}) — membres ${membres.map((u) => u.id).join(',')}`);
      for (const u of membres) {
        if (u.q === rally.q && u.r === rally.r) continue;
        const chemin = bfsChemin(etat, u, rally);
        if (chemin && chemin.length > 0) {
          ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: u.id, path: chemin } });
          await ws.waitFor('OrderAck');
        }
      }
      console.log(`[fusion] chemins des membres soumis (tours estimés ${Math.max(...membres.map((u) => (bfsChemin(etat, u, rally) ?? []).length))})`);
    }
    etat = await endTurnHeadless(ws, etat);
    const gsApres = unitesP1(etat);
    console.log(`[convergence] tour ${etat.turn} — ${gsApres.map((u) => `${u.id}(${u.q},${u.r}) hp${u.hp}${u.isArmy ? ' ARMÉE' : ''}`).join(' ')}`);
  }
  throw new Error('fusion non aboutie en 30 tours');
}
/** BLESSURE de l'armée (canon BATAILLE-COMPLETE, 9 PV survivent) : chaque
 *  tour, si un barbare est adjacent → attaque (Move sur sa case) ; sinon un
 *  pas vers le barbare/camp le plus proche. Les barbares apparaissent t15. */
async function blesserArmee(ws, etatInitial, armeeId) {
  let etat = etatInitial;
  const barbares = (s) => {
    const units = Array.isArray(s.units) ? s.units : Object.values(s.units ?? {});
    return units.filter((u) => u.owner === BARBARIEN && !u.aboard);
  };
  for (let i = 0; i < 60; i++) {
    const armee = (Array.isArray(etat.units) ? Object.values(etat.units) : Object.values(etat.units ?? {})).find((u) => u.id === armeeId);
    if (!armee) throw new Error('armée disparue (morte au combat ?)');
    if (armee.hp < 9) return { etat, armee };
    const bs = barbares(etat);
    if (bs.length === 0) {
      etat = await endTurnHeadless(ws, etat);
      continue;
    }
    const vois = voisinsHex([armee.q, armee.r], etat.mapWidth, etat.mapHeight);
    const cibleAdjacente = bs.find((b) => vois.some(([q, r]) => q === b.q && r === b.r));
    if (cibleAdjacente) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: armee.id, path: [{ q: cibleAdjacente.q, r: cibleAdjacente.r }] } });
      const ack = await ws.waitFor('OrderAck').catch(() => null);
      if (!ack) { etat = await endTurnHeadless(ws, etat); continue; }
      console.log(`[blessure] attaque du barbare ${cibleAdjacente.id} (tour ${etat.turn})`);
    } else {
      let meilleur = null;
      for (const b of bs) {
        const chemin = bfsChemin(etat, armee, b);
        if (chemin && (!meilleur || chemin.length < meilleur.length)) meilleur = chemin;
      }
      if (meilleur && meilleur.length > 0) {
        ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: armee.id, path: [meilleur[0]] } });
        await ws.waitFor('OrderAck').catch(() => null);
      }
    }
    etat = await endTurnHeadless(ws, etat);
    const armeeApres = (Array.isArray(etat.units) ? Object.values(etat.units) : Object.values(etat.units ?? {})).find((u) => u.id === armeeId);
    console.log(`[blessure] tour ${etat.turn} — armée ${armeeApres ? `${armeeApres.hp}/9 en (${armeeApres.q},${armeeApres.r})` : 'MORTE'}`);
  }
  return { etat, armee: null }; // jamais blessée — capture quand même, consigné
}
async function ouvrirPage(tokenJeu, codeJeu) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'session', value: tokenJeu, url: GUI }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${GUI}/#/game/${codeJeu}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await sleep(3000);
  return { browser, page };
}
/** Sélection + centrage caméra (raccourci C, panneau « Centrer la caméra »). */
async function centrerSur(page, q, r) {
  await page.evaluate(([qq, rr]) => window.__game.clickHex(qq, rr), [q, r]);
  await sleep(500);
  await page.keyboard.press('c');
  await sleep(800);
}
/** Une unité p1 simple (non armée) pour la capture de contraste. */
function uniteSimple(etat) {
  return unitesP1(etat).find((u) => !u.isArmy) ?? null;
}

try {
  await demarrerVite();
  await demarrerWrangler();
  token = await login(NOM);
  code = await creerPartie(token);
  console.log(`[solo/bots] partie ${code}`);

  const ws = wsConnect(`/ws/game/${code}`, token);
  await ws.open;
  await ws.waitFor('Welcome');
  let premier = null;
  try { premier = await ws.waitFor('Snapshot', 5000); }
  catch { ws.send({ proto: 1, type: 'ResyncRequest', lastSeq: -1 }); premier = await ws.waitFor('Snapshot'); }

  // 1. Croissance + fusion headless.
  const { etat: etatFusion, armee } = await formerArmee(ws, premier.state);
  console.log(`[fusion] ARMÉE ${armee.id} ${armee.hp}/9 en (${armee.q},${armee.r}) — tour ${etatFusion.turn}`);

  // Mise en scène : l'armée SORT de la ville (pleine bannière en campagne,
  // pas le mode garnison compact) ; un guerrier simple reste en garnison.
  let etatScene = etatFusion;
  {
    const vois = voisinsHex([armee.q, armee.r], etatScene.mapWidth, etatScene.mapHeight)
      .filter(([q, r]) => { const t = etatScene.map[`${q},${r}`]; return t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne'; });
    if (vois.length > 0) {
      ws.send({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: armee.id, path: [{ q: vois[0][0], r: vois[0][1] }] } });
      await ws.waitFor('OrderAck');
      etatScene = await endTurnHeadless(ws, etatScene);
      const armeeScene = unitesP1(etatScene).find((u) => u.isArmy) ?? armee;
      armee.q = armeeScene.q; armee.r = armeeScene.r;
      console.log(`[scene] armée en campagne (${armee.q},${armee.r}) — tour ${etatScene.turn}`);
    }
  }

  // 2. Capture armée PLEINE (socket fermé avant — piège éviction).
  ws.close();
  {
    const { browser, page } = await ouvrirPage(token, code);
    await centrerSur(page, armee.q, armee.r);
    await page.screenshot({ path: `${CAP}/1-armee-pleine-selectionnee.png` });
    await browser.close();
  }
  console.log('[captures] armée pleine OK');

  // 3. BLESSURE par barbares (reconnexion headless fraîche — piège socket).
  const ws2 = wsConnect(`/ws/game/${code}`, token);
  await ws2.open;
  await ws2.waitFor('Welcome');
  const snap2 = await ws2.waitFor('Snapshot');
  const { etat: etatBlesse, armee: armeeBlessee } = await blesserArmee(ws2, snap2.state, armee.id);
  if (armeeBlessee) {
    console.log(`[blessure] armée ${armeeBlessee.hp}/9 en (${armeeBlessee.q},${armeeBlessee.r}) — tour ${etatBlesse.turn}`);
  } else {
    console.log('[blessure] NON OBTENUE en 60 tours — captures pleine seule (consigné au rapport)');
  }
  ws2.close();

  // 4. Captures armée BLESSÉE (centrée) + unité simple pour le contraste.
  if (armeeBlessee) {
    const { browser, page } = await ouvrirPage(token, code);
    await centrerSur(page, armeeBlessee.q, armeeBlessee.r);
    await page.screenshot({ path: `${CAP}/2-armee-blessee-selectionnee.png` });
    const simple = uniteSimple(etatBlesse);
    if (simple) {
      await centrerSur(page, simple.q, simple.r);
      await page.screenshot({ path: `${CAP}/1b-unite-simple-contraste.png` });
    }
    const dump = await dumpFull(code);
    const unitsDump = dump.state?.units ?? dump.units ?? {};
    const armeeDump = Object.values(unitsDump).find((u) => u.isArmy);
    console.log('[diag] armée au dump admin :', JSON.stringify(armeeDump ? { id: armeeDump.id, hp: armeeDump.hp, isArmy: armeeDump.isArmy } : null));
    await browser.close();
  }
  console.log(`[OK] captures dans ${CAP} — partie ${code}`);
} finally {
  if (wrangler) { try { wrangler.kill(); } catch {} }
}
