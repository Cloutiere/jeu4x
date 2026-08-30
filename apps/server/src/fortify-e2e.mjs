#!/usr/bin/env node
/**
 * Vérification « conditions réelles » du cycle Fortify (Phase 5 L2) :
 * deux clients stub sur un wrangler dev local — les guerriers marchent
 * l'un vers l'autre, le guerrier d'Alice se fortifie, Bob attaque ;
 * le PV résultant est comparé à la prédiction du tir §7.4 (T-17 vs sans
 * bonus, même graine — l'échange est le premier tir du RNG de la partie).
 *
 * Usage : node src/fortify-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const PROTO = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const TERRAINS = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/terrain.json'), 'utf8'));

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
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
  const waitFor = (type, ms = 20000) => new Promise((resolve, reject) => {
    const idx = pending.findIndex((m) => m.type === type);
    if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
    const t = setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
    waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  return { ws, open: new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); }), waitFor, send };
}

const NEIGHBORS = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];
function stepToward(unit, target, state, myId) {
  let best = null;
  for (const [dq, dr] of NEIGHBORS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile || !TERRAINS[tile.terrain]?.passable) continue;
    if (Object.values(state.units).some((u) => u.q === q && u.r === r && u.owner === myId)) continue;
    const d = Math.abs(q - target.q) + Math.abs(r - target.r);
    if (!best || d < best.d) best = { q, r, d };
  }
  return best;
}

async function admin(code) {
  const vars = readFileSync(join(HERE, '../.dev.vars'), 'utf8');
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(vars)[1].trim();
  const res = await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${token}` } });
  return res.json();
}

const aliceTok = await login('AliceE2E');
const bobTok = await login('BobE2E');
const lobby = wsConnect('/ws/lobby', aliceTok);
await lobby.open;
await lobby.waitFor('GameList');
lobby.send({ type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false } });
const created = await lobby.waitFor('GameCreated');
const CODE = created.code;
console.log('partie', CODE);
lobby.ws.close();

const lobbyB = wsConnect('/ws/lobby', bobTok);
await lobbyB.open;
await lobbyB.waitFor('GameList');
lobbyB.send({ type: 'JoinGame', code: CODE });
await lobbyB.waitFor('GameJoined');
lobbyB.ws.close();

const A = wsConnect(`/ws/game/${CODE}`, aliceTok);
const B = wsConnect(`/ws/game/${CODE}`, bobTok);
await Promise.all([A.open, B.open]);
await A.waitFor('Welcome');
await B.waitFor('Welcome');
await A.waitFor('Snapshot');
await B.waitFor('Snapshot');

// État COMPLET (admin) : la marche d'approche ignore volontairement le brouillard.
let state = (await admin(CODE)).state;
const myWarrior = () => Object.values(state.units).find((u) => u.owner === 'p1' && u.type === 'guerrier');
const enemyWarrior = () => Object.values(state.units).find((u) => u.owner === 'p2' && u.type === 'guerrier');

let turns = 0;
while (turns++ < 25) {
  const w = myWarrior();
  const e = enemyWarrior();
  const dist = Math.max(Math.abs(w.q - e.q), Math.abs(w.r - e.r), Math.abs(w.q + w.r - e.q - e.r));
  if (dist <= 2) break;
  const step = stepToward(w, e, state, 'p1');
  A.send({ type: 'SubmitOrder', order: step ? { type: 'Move', unitId: w.id, path: [step] } : { type: 'Hold', unitId: w.id } });
  const stepB = stepToward(e, w, state, 'p2');
  B.send({ type: 'SubmitOrder', order: stepB ? { type: 'Move', unitId: e.id, path: [stepB] } : { type: 'Hold', unitId: e.id } });
  A.send({ type: 'EndTurn' });
  B.send({ type: 'EndTurn' });
  await A.waitFor('TurnResult');
  await B.waitFor('TurnResult');
  state = (await admin(CODE)).state;
  console.log(`approche : tour ${state.turn}`);
}

const before = (await admin(CODE)).state;
const w = myWarrior();
const e = enemyWarrior();
const dist = Math.max(Math.abs(w.q - e.q), Math.abs(w.r - e.r), Math.abs(w.q + w.r - e.q - e.r));
if (dist !== 1) throw new Error(`pas au contact (dist ${dist}) — augmenter le budget de tours`);
console.log(`contact : ${w.id} (${w.q},${w.r}) PV ${w.hp} vs ${e.id} (${e.q},${e.r}) PV ${e.hp}`);

// Boucle : Alice (re)fortifie, Bob attaque — jusqu'à un tir DISCRIMINANT
// (roll dans [pFort, 0.5) : le défenseur serait touché sans T-17, épargné avec).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pFort = 1 / (1 + Math.pow(1 + 0.25, 2));
let verdict = false;
let last = null;
for (let attack = 0; attack < 40 && !verdict; attack++) {
  const before = (await admin(CODE)).state;
  const w = before.units[Object.keys(before.units).find((id) => before.units[id].owner === 'p1' && before.units[id].type === 'guerrier')];
  const e = before.units[Object.keys(before.units).find((id) => before.units[id].owner === 'p2' && before.units[id].type === 'guerrier')];
  if (!w || !e) { console.log('un guerrier est mort avant un tir discriminant — relancer le script (nouvelle partie)'); process.exit(2); }
  A.send({ type: 'SubmitOrder', order: { type: 'Fortify', unitId: w.id } });
  B.send({ type: 'SubmitOrder', order: { type: 'Attack', unitId: e.id, target: { q: w.q, r: w.r } } });
  A.send({ type: 'EndTurn' });
  B.send({ type: 'EndTurn' });
  const result = await B.waitFor('TurnResult');
  await A.waitFor('TurnResult');
  const exchange = result.events.find((ev) => ev.type === 'CombatExchange');
  const roll = mulberry32(before.rngSeed)();
  const discriminating = roll >= pFort && roll < 0.5;
  const defHitReal = exchange && exchange.defenderHpAfter < w.hp;
  last = { turn: before.turn, roll: roll.toFixed(4), defHitReal, discriminating, exchange };
  console.log(`attaque #${attack + 1} (tour ${before.turn}) : roll ${roll.toFixed(4)} — défenseur touché ? ${defHitReal ? 'oui' : 'non'}${discriminating ? '  ← tir discriminant' : ''}`);
  if (discriminating) {
    const after = (await admin(CODE)).state;
    verdict = after.units[w.id].fortified === true && defHitReal === false;
  }
}
console.log('=== RESULTAT ===');
console.log(JSON.stringify(last));
console.log(verdict
  ? 'OK bonus T-17 visible en conditions reels : sur un tir discriminant (touche sans T-17), le defenseur fortifie n a PAS ete touche'
  : 'KO tir discriminant non observe ou ecart inattendu');
A.ws.close();
B.ws.close();
process.exit(verdict ? 0 : 1);
