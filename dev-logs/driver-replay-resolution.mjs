/**
 * Pilote REPLAY-RESOLUTION (e2e solo + captures dev-logs/captures-replay/).
 *
 * Scénario (HANDOFF-REPLAY-RESOLUTION §4 L4) :
 *  1. partie solo contre le bot ; le navigateur (CDP) est connecté AVANT la
 *     résolution — c'est LUI qui reçoit le TurnResult et mémorise la paire
 *     {pré-état, événements} (L2) ;
 *  2. tour 1 : fondation de la capitale ; tour 2 : déplacement du guerrier
 *     (2 pas) + EndTurn → résolution avec un Move cliquable au journal ;
 *  3. AVANT : capture (unités à destination) + clic journal → centrage sans
 *     zoom (assert position page ≈ centre canvas) ;
 *  4. « Rejouer la résolution » : PENDANT (positions d'origine, playback
 *     actif), APRÈS (retour automatique à l'état réel, positions identiques) ;
 *  5. relance (D4) + sortie par Échap (retour immédiat) ;
 *  6. rechargement de page (Snapshot) → bouton indisponible + tooltip (L2).
 *
 * Usage : node dev-logs/driver-replay-resolution.mjs  (wrangler :8787 + vite :5174)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:8787';
const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const NAME = 'ErikMR';
const PROTO = 1;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CAPDIR = join(here, 'captures-replay');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[REPLAY]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (res.status !== 302 || !m) throw new Error('login stub impossible');
  return m[1];
}

function wsConnect(path, token) {
  const wsUrl = `${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
    const i = waiters.findIndex((w) => w.type === null || w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const idx = pending.findIndex((m) => m.type === type);
    if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
    const timer = setTimeout(() => reject(new Error(`timeout ${type}`)), timeoutMs);
    waiters.push({ type, resolve, reject: (e) => { clearTimeout(timer); reject(e); } });
  });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('WS impossible ' + wsUrl)));
  });
  return { ws, open, waitFor, send };
}

// --- CDP minimal (Edge headless) — mêmes conventions que les pilotes précédents.
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9333; // 9227/9229 : pris par les zombies Edge/wrangler des sessions précédentes
async function cdpConnect() {
  const proc = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, '--headless=new', '--disable-gpu',
    '--window-size=1600,1000', '--user-data-dir=' + join(CAPDIR, '_edge-profile'), 'about:blank',
  ], { stdio: 'ignore' });
  proc.on('error', (e) => log('spawn error :', e.message));
  proc.on('exit', (c) => log('Edge exit code :', c));
  let target = null;
  for (let i = 0; i < 30 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      target = (await res.json()).find((t) => t.type === 'page');
      if (!target && i % 5 === 0) log('CDP /json ok, pas de page (essai ' + i + ')');
    } catch (e) {
      if (i % 5 === 0) log('CDP fetch err (essai ' + i + ') :', e.cause?.message ?? e.message);
    }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('Edge CDP indisponible');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = { id: 0, pending: new Map(), ws };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && cdp.pending.has(msg.id)) {
      const { resolve, reject } = cdp.pending.get(msg.id);
      cdp.pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  cdp.send = (method, params = {}) => {
    const id = ++cdp.id;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => cdp.pending.set(id, { resolve, reject }));
  };
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

async function cdpNav(cdp, url) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url });
  await sleep(2500);
}

async function cdpEval(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
}

async function shot(cdp, name) {
  await sleep(900);
  const data = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
  writeFileSync(join(CAPDIR, name), Buffer.from(data, 'base64'));
  log('capture', name);
}

/** Capture SANS délai — pour saisir une phase brève (annonce du replay). */
async function shotNow(cdp, name) {
  const data = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
  writeFileSync(join(CAPDIR, name), Buffer.from(data, 'base64'));
  log('capture', name);
}

async function main() {
  const token = await login(NAME);
  log('login ok');
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false } });
  const created = await lobby.waitFor('GameCreated', 20000);
  log('partie créée :', created.code);
  lobby.ws.close();

  const bot = spawn(process.execPath, [join(root, 'apps/server/src/bot.mjs'), created.code, 'BotMR'], {
    env: { ...process.env, GAME_URL: BASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bot.stdout.on('data', (d) => process.stdout.write('[bot] ' + d));
  await sleep(2500);

  // Navigateur connecté AVANT les résolutions : c'est lui qui mémorise la paire.
  const cdp = await cdpConnect();
  // Diagnostic : journal des types WS (Snapshot = purge de la paire — L2).
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__wslog = [];
    const OW = window.WebSocket;
    window.WebSocket = function (...a) {
      const w = new OW(...a);
      w.addEventListener('message', (e) => {
        try { const m = JSON.parse(e.data); window.__wslog.push(m.type + (m.seq != null ? ':' + m.seq : '')); } catch {}
      });
      return w;
    };
    window.WebSocket.prototype = OW.prototype;
  ` });
  await cdpNav(cdp, `${WEB}/auth/dev?name=${encodeURIComponent(NAME)}`);
  await cdpNav(cdp, `${WEB}/#/game/${created.code}`);
  await sleep(5000);
  log('hook __game :', await cdpEval(cdp, '!!window.__game'));

  // Socket WS du même joueur pour piloter les tours (le navigateur observe).
  const game = wsConnect(`/ws/game/${created.code}`, token);
  await game.open;
  await game.waitFor('Welcome');
  game.send({ type: 'ResyncRequest', lastSeq: null });
  const snap = await game.waitFor('Snapshot');
  const me = snap.players?.find?.((p) => p.name === NAME)?.engineId ?? 'p1';

  // Tour 1 : fondation de la capitale.
  const colon = Object.values(snap.state.units).find((u) => u.type === 'colon' && u.owner === me);
  const guerrier = Object.values(snap.state.units).find((u) => u.type === 'guerrier' && u.owner === me);
  if (!colon || !guerrier) throw new Error('unités de départ manquantes');
  game.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
  game.send({ type: 'EndTurn' });
  await game.waitFor('TurnResult');
  log('tour 1 résolu');

  // Tour 2 : déplacement du guerrier sur 2 cases passables (source du Move
  // cliquable au journal + matière de la relecture).
  const passable = (q, r) => {
    const t = snap.state.map[`${q},${r}`];
    return t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  };
  const voisins = (q, r) => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
  // Le guerrier a 1 PM : UN pas (le surplus de chemin resterait gelé et
  // fausserait la position affichée — affichage optimiste du chemin gelé).
  const pas2 = voisins(guerrier.q, guerrier.r).find((h) => passable(h.q, h.r));
  if (!pas2) throw new Error('pas de case passable autour du guerrier');
  game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: guerrier.id, path: [pas2] } });
  const ack = await game.waitFor('OrderAck');
  if (!ack.accepted) throw new Error('Move rejeté : ' + ack.reason);
  game.send({ type: 'EndTurn' });
  const t2 = await game.waitFor('TurnResult');
  log('tour 2 résolu — guerrier', `${guerrier.q},${guerrier.r}`, '→', `${pas2.q},${pas2.r}`);
  log('événements tour 2 :', JSON.stringify(t2.events.map((e) => ({ seq: e.seq, type: e.type, u: e.unitId ?? e.unitId ?? null, to: e.to ?? null }))));

  // Le navigateur a reçu le TurnResult : attendre la fin du playback
  // cosmétique (bouton « Rejouer la résolution » activé).
  let bouton = null;
  for (let i = 0; i < 40; i++) {
    bouton = await cdpEval(cdp, `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.className.includes('replay-btn')); return b ? { text: b.textContent.trim(), disabled: b.disabled, title: b.title } : null; })()`);
    if (bouton && !bouton.disabled) break;
    await sleep(500);
  }
  if (!bouton || bouton.disabled) {
    log('wslog :', JSON.stringify(await cdpEval(cdp, 'window.__wslog')));
    throw new Error('bouton Rejouer jamais activé : ' + JSON.stringify(bouton));
  }
  log('bouton prêt :', bouton.text);

  // Sonde : position MONDE du sprite du guerrier (wx/wy, indépendante de la
  // caméra). Les assertions AVANT/PENDANT/APRÈS comparent le delta sprite au
  // delta projeté (hexToPage linéaire) — preuve que le sprite est À L'ORIGINE
  // pendant la relecture et À DESTINATION sinon.
  const sonde = () => cdpEval(cdp, `(() => { const s = __game.sondePile(); return { sprite: s.sprites['${guerrier.id}'] ?? null, playback: s.playback }; })()`);
  const avant = await sonde();
  log('AVANT replay — sprite :', JSON.stringify(avant.sprite), 'playback :', avant.playback.actif);
  if (!avant.sprite) throw new Error('sprite du guerrier introuvable');
  await cdpEval(cdp, `__game.centerOn(${pas2.q},${pas2.r})`);
  await sleep(800);
  await shot(cdp, '01-avant-replay-destination.png');

  // L1 — clic journal : centrage SANS zoom sur la case du Move.
  const centreAvant = await cdpEval(cdp, `(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2, scale: null }; })()`);
  const cliqueJournal = await cdpEval(cdp, `(() => {
    const entrees = [...document.querySelectorAll('.panel li .entry')];
    const e = entrees.find((x) => x.textContent.includes('se déplace vers (${pas2.q},${pas2.r})'));
    if (!e) return null;
    e.click();
    return e.textContent.trim();
  })()`);
  if (!cliqueJournal) {
    log('entrées journal :', JSON.stringify(await cdpEval(cdp, `[...document.querySelectorAll('.panel li')].slice(0, 12).map((li) => li.textContent.trim())`)));
    throw new Error('entrée « se déplace vers » introuvable au journal');
  }
  log('clic journal :', cliqueJournal);
  await sleep(600);
  const centreApres = await cdpEval(cdp, `(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const p = __gameCanvas.hexToPage({ q: ${pas2.q}, r: ${pas2.r} });
    return { centreX: c.x + c.width / 2, centreY: c.y + c.height / 2, hexX: p ? p.x : null, hexY: p ? p.y : null };
  })()`);
  const dx = Math.abs(centreApres.hexX - centreApres.centreX);
  const dy = Math.abs(centreApres.hexY - centreApres.centreY);
  log('centrage journal — écart au centre canvas :', Math.round(dx), 'x', Math.round(dy), 'px');
  if (dx > 30 || dy > 30) throw new Error(`le clic journal n'a pas centré la case (écart ${dx}x${dy}px)`);
  void centreAvant;
  await shot(cdp, '02-apres-clic-journal-centre.png');

  // L3 — « Rejouer la résolution » : PENDANT la phase annonce, le guerrier
  // est affiché À SON ORIGINE (état de relecture = pré-résolution).
  await cdpEval(cdp, `[...document.querySelectorAll('button.replay-btn')].find((x) => x.textContent.includes('Rejouer')).click()`);
  await sleep(600); // phase annonce (1000 ms) — mouvements pas encore rejoués
  const pendant = await sonde();
  log('PENDANT replay — sprite :', JSON.stringify(pendant.sprite), 'playback :', pendant.playback.actif);
  if (!pendant.playback.actif) throw new Error('playback inactif juste après le lancement de la relecture');
  // Delta sprite AVANT→PENDANT == delta projeté destination→origine.
  const deltaProj = await cdpEval(cdp, `(() => { const a = __gameCanvas.hexToPage({ q: ${pas2.q}, r: ${pas2.r} }); const b = __gameCanvas.hexToPage({ q: ${guerrier.q}, r: ${guerrier.r} }); return { dx: b.x - a.x, dy: b.y - a.y }; })()`);
  const dxs = pendant.sprite.wx - avant.sprite.wx;
  const dys = pendant.sprite.wy - avant.sprite.wy;
  log('delta sprite :', Math.round(dxs), 'x', Math.round(dys), '— delta projeté origine :', Math.round(deltaProj.dx), 'x', Math.round(deltaProj.dy));
  if (Math.abs(dxs - deltaProj.dx) > 8 || Math.abs(dys - deltaProj.dy) > 8) {
    throw new Error(`pendant la relecture le guerrier devrait être à l'origine (${guerrier.q},${guerrier.r})`);
  }
  await shotNow(cdp, '03-pendant-replay-origine.png');

  // Fin de file → retour AUTOMATIQUE à l'état réel (D4).
  let fini = null;
  for (let i = 0; i < 40; i++) {
    fini = await cdpEval(cdp, `(() => { const b = [...document.querySelectorAll('button.replay-btn')][0]; return { text: b.textContent.trim(), disabled: b.disabled }; })()`);
    if (fini.text.includes('Rejouer')) break;
    await sleep(300);
  }
  log('après file :', fini.text);
  if (!fini.text.includes('Rejouer')) throw new Error('la relecture ne s\u2019est pas terminée d\u2019elle-même');
  const apres = await sonde();
  log('APRÈS replay — sprite :', JSON.stringify(apres.sprite));
  if (Math.abs(apres.sprite.wx - avant.sprite.wx) > 8 || Math.abs(apres.sprite.wy - avant.sprite.wy) > 8) {
    throw new Error('après la relecture le guerrier devrait être revenu à destination');
  }
  await shot(cdp, '04-apres-replay-etat-reel.png');

  // D4 — relançable : on relance puis Échap = sortie IMMÉDIATE (état réel).
  await cdpEval(cdp, `[...document.querySelectorAll('button.replay-btn')].find((x) => x.textContent.includes('Rejouer')).click()`);
  await sleep(500);
  const relance = await sonde();
  if (!relance.playback.actif) throw new Error('relance : playback inactif');
  await cdpEval(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(400);
  const echap = await sonde();
  log('Échap — sprite :', JSON.stringify(echap.sprite), 'playback :', echap.playback.actif);
  if (echap.playback.actif) throw new Error('Échap n\u2019a pas arrêté la relecture');
  if (Math.abs(echap.sprite.wx - avant.sprite.wx) > 8 || Math.abs(echap.sprite.wy - avant.sprite.wy) > 8) {
    throw new Error('après Échap, l\u2019état réel (destination) devrait être réaffiché');
  }
  await shot(cdp, '05-echap-retour-immediat.png');

  // L2 — rechargement (Snapshot) : bouton indisponible + tooltip explicatif.
  await cdpNav(cdp, `${WEB}/#/game/${created.code}`);
  await sleep(5000);
  const apresReload = await cdpEval(cdp, `(() => { const b = [...document.querySelectorAll('button.replay-btn')][0]; return b ? { text: b.textContent.trim(), disabled: b.disabled, title: b.title } : null; })()`);
  log('après rechargement :', JSON.stringify(apresReload));
  if (!apresReload || !apresReload.disabled) throw new Error('après reconnexion le bouton devrait être indisponible');
  await shot(cdp, '06-reconnexion-bouton-indisponible.png');

  log('OK — captures dans dev-logs/captures-replay/');
  game.ws.close();
  bot.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('[REPLAY] ÉCHEC :', e.message);
  process.exit(1);
});
