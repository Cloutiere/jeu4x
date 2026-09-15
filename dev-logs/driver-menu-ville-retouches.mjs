#!/usr/bin/env node
/**
 * Pilote MENU-VILLE-RETOUCHES (captures : badge de population sur la case de
 * ville + icônes de rendement reflétant la conversion R-90 en vue ville).
 * Client p1 « ErikMR » : login stub → lobby → partie PROCÉDURALE (start
 * « colon ») ; le colon est dirigé vers la case passable la plus proche
 * ayant une case MARITIME (eau/océan) adjacente — pour une tuile de rendement
 * commerce dans le rayon de la ville — puis FONDE la ville et se met en pause
 * (le navigateur prend la main pour les captures et la bascule ⇄).
 *
 * Usage : node dev-logs/driver-menu-ville-retouches.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:8787';
const NAME = 'ErikMR';
const PROTO = 1;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ADMIN_TOKEN = 'dev-only-admin-token';

mkdirSync(join(here, 'captures-menu-ville-retouches'), { recursive: true });
const log = (...a) => console.log('[MR]', ...a);

const DIRS = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];
const key = (q, r) => `${q},${r}`;
const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

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
  const waitFor = (type, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const idx = pending.findIndex((m) => m.type === type);
    if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
    const timer = setTimeout(() => reject(new Error(`timeout ${type}`)), timeoutMs);
    waiters.push({ type, resolve: (m) => { clearTimeout(timer); resolve(m); } });
  });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('WS impossible ' + wsUrl)));
  });
  return { ws, open, waitFor, send };
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
  writeFileSync(join(here, 'captures-menu-ville-retouches/game-code.txt'), created.code);

  const bot = spawn(process.execPath, [join(root, 'apps/server/src/bot.mjs'), created.code, 'BotMR'], {
    env: { ...process.env, GAME_URL: BASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bot.stdout.on('data', (d) => process.stdout.write('[bot] ' + d));
  await new Promise((r) => setTimeout(r, 2000));

  const game = wsConnect(`/ws/game/${created.code}`, token);
  await game.open;
  await game.waitFor('Welcome');
  game.send({ type: 'ResyncRequest', lastSeq: null });
  let snap = await game.waitFor('Snapshot');
  log('snapshot — tour', snap.state?.turn, 'phase', snap.state?.phase);

  const admin = await fetch(`${BASE}/admin/game/${created.code}`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  }).then((r) => r.json());

  const me = Object.values(admin.state.players).find((p) => p.name === NAME) ?? { id: 'p1' };
  log('mon id moteur :', me.id);
  const units = Object.values(admin.state.units).filter((u) => u.owner === me.id);
  const colon = units.find((u) => u.type === 'colon');
  if (!colon) throw new Error('pas de colon (start colon attendu)');
  log('colon en', colon.q + ',' + colon.r);

  // Site côtier : case passable AYANT une case maritime (eau/océan) adjacente,
  // la plus proche du colon — la ville y aura une tuile de rendement commerce
  // dans son rayon (rayon 1 au départ).
  const passable = (t) => t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
  const maritime = (t) => t && (t.terrain === 'eau' || t.terrain === 'ocean');
  let best = null;
  for (const [k, t] of Object.entries(admin.state.map)) {
    if (!passable(t)) continue;
    const [q, r] = k.split(',').map(Number);
    if (!DIRS.some(([dq, dr]) => maritime(admin.state.map[key(q + dq, r + dr)]))) continue;
    const d = hexDist([colon.q, colon.r], [q, r]);
    if (!best || d < best.d) best = { d, q, r };
  }
  if (!best) throw new Error('aucun site côtier sur la carte ?');
  log('site côtier le plus proche :', best.q + ',' + best.r, 'à', best.d, 'cases');

  const prev = new Map([[key(colon.q, colon.r), null]]);
  const queue = [[colon.q, colon.r]];
  while (queue.length) {
    const [q, r] = queue.shift();
    if (q === best.q && r === best.r) break;
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      if (prev.has(key(nq, nr))) continue;
      if (!passable(admin.state.map[key(nq, nr)])) continue;
      prev.set(key(nq, nr), [q, r]);
      queue.push([nq, nr]);
    }
  }
  const path = [];
  let cur = [best.q, best.r];
  while (cur) { path.unshift(cur); cur = prev.get(key(...cur)); }
  path.shift();
  log('chemin :', path.length, 'case(s)');

  while (path.length > 0) {
    const step = path.splice(0, 2).map(([q, r]) => ({ q, r }));
    game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: colon.id, path: step } });
    game.send({ type: 'EndTurn' });
    const res = await game.waitFor('TurnResult', 30000);
    log('tour résolu — restant', path.length);
    snap = { state: res.state };
  }

  // Fondation sur le site côtier.
  game.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
  game.send({ type: 'EndTurn' });
  const res = await game.waitFor('TurnResult', 30000);
  const ville = Object.values(res.state.cities).find((c) => c.owner === me.id);
  if (!ville) throw new Error('fondation échouée ?');
  log('VILLE FONDÉE :', ville.name ?? ville.id, 'en', ville.q + ',' + ville.r, 'conversion', ville.conversion, '— pause pour captures navigateur.');
  writeFileSync(join(here, 'captures-menu-ville-retouches/city.json'), JSON.stringify(ville, null, 2));
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => { console.error('[MR!]', e.message); process.exit(1); });
