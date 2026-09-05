#!/usr/bin/env node
/**
 * E2E « conditions réelles » — chantier V1-bis : bascule 2D → 3D à chaud avec
 * devicePixelRatio > 1 (bug d'Erik du 04/09 : les unités de départ apparaissaient
 * hors du terrain, en haut à gauche, dès qu'un PC est en mise à l'échelle
 * 125/150 % — le canvas Three.js était rendu avec setSize(…, false) donc sans
 * taille CSS, et s'affichait en taille buffer dpr× tandis que le canvas PixiJS
 * (autoDensity) restait en px CSS).
 *
 * Séquence vérifiée (headless Edge/Chrome, CDP brut — aucune dépendance) :
 *   1. partie rendue en 2D (unités visibles) ;
 *   2. dpr simulé à 1.5 PUIS bascule 3D à chaud ;
 *   3. les deux canvases (Three + Pixi) ont la MÊME taille CSS ;
 *   4. chaque sprite d'entité est posé SUR sa case (pickAt ↔ screenOf, hooks dev) ;
 *   5. aller-retour 3D → 2D → 3D sans dérive.
 *
 * Usage : node apps/web/scripts/e2e-bascule-3d.mjs [baseUrl]
 *   baseUrl défaut http://localhost:5174 (vite dev, proxy /api → wrangler 8787).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5174';
const CDP_PORT = await new Promise((res) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(() => res(port)); });
});
const DPR = 1.5;

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const browserExe = BROWSERS.find((p) => existsSync(p));
if (!browserExe) {
  console.error('aucun Edge/Chrome trouvé pour le pilotage CDP');
  process.exit(1);
}

// --- CDP minimal -----------------------------------------------------------
let wsSeq = 0;
const wsWaiters = new Map();
function cdpSend(ws, method, params = {}, sessionId) {
  const id = ++wsSeq;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 30000);
    wsWaiters.set(id, { resolve: (m) => { clearTimeout(t); resolve(m); }, reject });
  });
}
function onCdpMessage(msg) {
  if (msg.id && wsWaiters.has(msg.id)) {
    const w = wsWaiters.get(msg.id);
    wsWaiters.delete(msg.id);
    if (msg.error) w.reject(new Error(msg.error.message));
    else w.resolve(msg.result);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(ws, sessionId, expression) {
  const r = await cdpSend(ws, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error('exception page: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}

// --- Lobby (même mécanique que fortify-e2e : node fetch/WS, cookies lisibles)
async function login(name) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible (' + name + ')');
  return m[1];
}
function wsLobby(token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws/lobby?token=${encodeURIComponent(token)}`);
  const pending = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  return {
    ws,
    open: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
    waitFor: (type, ms = 20000) => new Promise((resolve, reject) => {
      const idx = pending.findIndex((m) => m.type === type);
      if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
      const t = setTimeout(() => reject(new Error('timeout ' + type)), ms);
      waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
    }),
    send: (msg) => ws.send(JSON.stringify({ proto: 1, ...msg })),
  };
}

// --- Lancement navigateur --------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'civ4x-e2e-'));
const chrome = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' });

let exitCode = 0;
let alice, bob;
try {
  // Session Alice posée DANS le navigateur (cookie), partie créée/jointe côté node
  let version = null;
  for (let i = 0; i < 50 && !version; i++) {
    await sleep(200);
    try { version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { /* pas prêt */ }
  }
  if (!version) throw new Error('endpoint CDP injoignable');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', (ev) => onCdpMessage(JSON.parse(ev.data)));

  const { targetId } = await cdpSend(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdpSend(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await cdpSend(ws, 'Runtime.enable', {}, sessionId);
  await cdpSend(ws, 'Page.enable', {}, sessionId);

  await cdpSend(ws, 'Page.navigate', { url: `${BASE}/auth/dev?name=Alice3D&next=/` }, sessionId);
  await sleep(1500);

  alice = wsLobby(await login("Alice3D"));
  await alice.open; await alice.waitFor('GameList');
  alice.send({ type: 'CreateGame', settings: { mapId: 'variee-40', turnTimerMinutes: null, isPublic: false } });
  const created = await alice.waitFor('GameCreated');
  const CODE = created.code;
  bob = wsLobby(await login("Bob3D"));
  await bob.open;
  bob.send({ type: 'JoinGame', code: CODE });
  await bob.waitFor('GameJoined');
  bob.ws.close();
  console.log('partie', CODE);

  await cdpSend(ws, 'Page.navigate', { url: `${BASE}/#/game/${CODE}` }, sessionId);
  await sleep(2500);

  // 1) rendu 2D avec entités visibles
  const deuxD = await evaluate(ws, sessionId, `(async () => {
    for (let i = 0; i < 40; i++) {
      const g = window.__gameCanvas;
      if (g && g.stats.state && g.sprites().some((s) => s.layer === 'entities' && s.children > 0)) {
        return { ok: true, canvases: document.querySelectorAll('.canvas-host canvas').length };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: false, raison: 'état 2D ou entités jamais rendus' };
  })()`);
  if (!deuxD.ok) throw new Error(deuxD.raison);
  if (deuxD.canvases !== 1) throw new Error('attendu 1 canvas en 2D, obtenu ' + deuxD.canvases);
  console.log('2D rendu, entités visibles ✓');

  // 2) dpr 1.5 PUIS bascule 3D à chaud (l'ordre compte : les lectures dpr ont
  // lieu au montage 3D, comme sur un PC en mise à l'échelle 150 %)
  await evaluate(ws, sessionId, `Object.defineProperty(window, 'devicePixelRatio', { value: ${DPR}, configurable: true }); [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '3D').click();`);
  const troisD = await evaluate(ws, sessionId, `(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.querySelectorAll('.canvas-host canvas').length === 2) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 1500)); // laisser la boucle projeter
    const cs = [...document.querySelectorAll('.canvas-host canvas')];
    if (cs.length !== 2) return { ok: false, raison: 'canvas 3D absent' };
    const [trois, pixi] = cs;
    const memesCss = Math.abs(trois.clientWidth - pixi.clientWidth) <= 1 && Math.abs(trois.clientHeight - pixi.clientHeight) <= 1;
    const stylePose = !!trois.style.width;
    const ents = window.__gameCanvas.sprites().filter((s) => s.layer === 'entities' && s.children > 0);
    const horsChamp = [];
    for (const e of ents) {
      if (e.x < 0 || e.y < 0 || e.x > trois.clientWidth || e.y > trois.clientHeight) { horsChamp.push(e.label + ' (hors écran)'); continue; }
      const hex = window.__game.pickAt(e.x, e.y);
      if (!hex) { horsChamp.push(e.label + ' (hors case)'); continue; }
      const [q, r] = hex.split(',').map(Number);
      const s = window.__game.screenOf(q, r);
      if (Math.hypot(s.x - e.x, s.y - e.y) > 8) horsChamp.push(e.label + ' (écart ' + Math.round(Math.hypot(s.x - e.x, s.y - e.y)) + ' px)');
    }
    return { ok: memesCss && stylePose && horsChamp.length === 0, raison: memesCss ? (stylePose ? 'entités hors champ: ' + horsChamp.join(', ') : 'style CSS du canvas Three non posé') : 'tailles CSS divergentes', ents: ents.length };
  })()`);
  if (!troisD.ok) throw new Error('bascule 3D dpr ' + DPR + ' : ' + troisD.raison);
  console.log(`3D à chaud (dpr ${DPR}) : ${troisD.ents} entités, toutes SUR leur case ✓ (tailles CSS identiques ✓)`);

  // 3) aller-retour 3D → 2D → 3D
  for (const attendu of [1, 2]) {
    await evaluate(ws, sessionId, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '3D').click();`);
    await sleep(2500);
    const ok = await evaluate(ws, sessionId, `(async () => {
      for (let i = 0; i < 20; i++) {
        const n = document.querySelectorAll('.canvas-host canvas').length;
        const g = window.__gameCanvas;
        if (n === ${attendu} && g && g.sprites().some((s) => s.layer === 'entities' && s.children > 0)) {
          if (n === 2) {
            const cs = [...document.querySelectorAll('.canvas-host canvas')];
            if (Math.abs(cs[0].clientWidth - cs[1].clientWidth) > 1) return false;
            for (const e of g.sprites().filter((s) => s.layer === 'entities' && s.children > 0)) {
              if (!window.__game.pickAt(e.x, e.y)) return false;
            }
          }
          return true;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    })()`);
    if (!ok) throw new Error('aller-retour vers ' + (attendu === 1 ? '2D' : '3D') + ' : rendu ou alignement dégradé');
    console.log((attendu === 1 ? 'retour 2D' : 're-bascule 3D') + ' ✓');
  }

  console.log('E2E bascule 3D : VERT');
} catch (e) {
  console.error('E2E bascule 3D : ROUGE —', e.message);
  exitCode = 1;
} finally {
  try { alice?.ws?.close?.(); bob?.ws?.close?.(); } catch { /* ignore */ }
  try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { try { chrome.kill(); } catch { /* ignore */ } }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.exit(exitCode);
