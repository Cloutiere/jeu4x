#!/usr/bin/env node
/**
 * Bot aléatoire — mode solo (L6, Phase 3).
 *
 * Le bot est un client COMME LES AUTRES : login stub → socket de partie →
 * à chaque tour, ordres aléatoires VALIDES (Hold, ou Move d'un pas vers une
 * case adjacente praticable connue de son état filtré) puis EndTurn.
 * AUCUNE logique dans le serveur ; le moteur revalide tout à la résolution.
 *
 * Usage : pnpm bot -- <code> <nom>   (base API : GAME_URL, défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBotArgs } from './botArgs.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:8787';

// `pnpm bot -- <CODE>` : le `--` est transmis littéralement par pnpm — filtré
// dans parseBotArgs (régression Phase 5, L2).
const { code: CODE, name: NAME, valid: argsValid } = parseBotArgs(process.argv.slice(2));

if (!argsValid) {
  console.error('Usage : pnpm bot -- <CODE6> [nom]\n       GAME_URL=http://127.0.0.1:8787 par défaut.');
  process.exit(1);
}

// Terrains praticables : lu depuis les données du moteur (source unique) —
// RULES.md §2 (montagne et eau infranchissables en v1, T-11).
const terrainPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/terrain.json');
const TERRAINS = JSON.parse(readFileSync(terrainPath, 'utf8'));

const PROTO = 1;
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

async function loginStub() {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(NAME)}&next=/`, { redirect: 'manual' });
  if (res.status !== 302) throw new Error(`login stub impossible : HTTP ${res.status}`);
  const cookie = res.headers.get('set-cookie') ?? '';
  const m = /session=([^;]+)/.exec(cookie);
  if (!m) throw new Error('cookie de session absent de la réponse /auth/dev');
  return m[1];
}

function wsConnect(path, token) {
  const wsUrl = `${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    const i = waiters.findIndex((w) => w.type === null || w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const idx = pending.findIndex((m) => m.type === type);
      if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
      const timer = setTimeout(() => reject(new Error(`timeout en attendant ${type}`)), timeoutMs);
      waiters.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error(`connexion WS impossible à ${wsUrl} (wrangler dev lancé ?)`)));
  });
  return { ws, open, waitFor, send };
}

/** Un pas vers une case adjacente praticable CONNUE (état filtré) et libre d'unité amie. */
function randomStep(unit, state, myEngineId) {
  const dirs = [
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 0],
    [1, -1],
  ];
  const candidates = [];
  for (const [dq, dr] of dirs) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue; // inconnue (brouillard) : jamais inventée
    if (!TERRAINS[tile.terrain]?.passable) continue;
    const occupiedByMine = Object.values(state.units).some((u) => u.q === q && u.r === r && u.owner === myEngineId);
    if (occupiedByMine) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function main() {
  const token = await loginStub();
  log(`Connecté en tant que « ${NAME} » (dev stub).`);

  // 1. Join via le socket de LOBBY (le GameDO refuse tout joueur non inscrit).
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'JoinGame', code: CODE });
  const joined = await lobby.waitFor('GameJoined', 10000);
  log(`Partie ${joined.code} rejointe via le lobby.`);
  lobby.ws.close();

  // 2. Socket de partie.
  const { ws, open, waitFor, send } = wsConnect(`/ws/game/${CODE}`, token);
  await open;
  log('Socket de partie ouvert.');

  const welcome = await waitFor('Welcome');
  const myEngineId = welcome.players.find((p) => p.id === welcome.playerId)?.engineId;
  log(`Bienvenue — tour ${welcome.turn}, statut ${welcome.status}, id moteur ${myEngineId ?? '?'}.`);
  if (!myEngineId) throw new Error('engineId introuvable dans le Welcome');

  let lastEndedTurn = -1;

  async function planTurn(snapshot) {
    const state = snapshot.state;
    if (!state || state.phase !== 'orders' || state.winner) return;
    if (snapshot.locked) {
      log(`Tour ${state.turn} : ordres déjà verrouillés, en attente de l'adversaire.`);
      return;
    }
    if (lastEndedTurn >= state.turn) return; // tour déjà traité

    const mine = Object.values(state.units).filter((u) => u.owner === myEngineId);
    let moves = 0;
    let holds = 0;
    let fortifies = 0;
    for (const unit of mine) {
      const hasOrder = snapshot.orders.some((o) => 'unitId' in o && o.unitId === unit.id);
      if (hasOrder) continue; // brouillon conservé côté serveur : ne pas doubler
      // R-33 : fortifier parfois (état persistant — une unité déjà fortifiée
      // est laissée telle quelle, l'ordre n'est pas consommé).
      if (!unit.fortified && Math.random() < 0.15) {
        send({ type: 'SubmitOrder', order: { type: 'Fortify', unitId: unit.id } });
        fortifies += 1;
        continue;
      }
      if (Math.random() < 0.4) {
        send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        holds += 1;
        continue;
      }
      const step = randomStep(unit, state, myEngineId);
      if (step) {
        send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [step] } });
        moves += 1;
      } else {
        send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        holds += 1;
      }
    }
    // Phase 6 : de temps en temps, réassigner aléatoirement un citoyen d'une
    // ville (SetWorkedTile valide — dans le rayon, case libre ; le moteur
    // revalide tout, un ordre invalide est simplement ignoré).
    let reassigns = 0;
    const myCities = Object.values(state.cities).filter((c) => c.owner === myEngineId);
    for (const city of myCities) {
      if (Math.random() >= 0.2) continue;
      const candidates = Object.keys(state.map).filter((key) => {
        const [q, r] = key.split(',').map(Number);
        const dist = (Math.abs(q - city.q) + Math.abs(r - city.r) + Math.abs(q + r - city.q - city.r)) / 2;
        return dist >= 1 && dist <= 2;
      });
      if (candidates.length === 0) continue;
      const tile = candidates[Math.floor(Math.random() * candidates.length)];
      send({ type: 'SubmitOrder', order: { type: 'SetWorkedTile', cityId: city.id, tile } });
      reassigns += 1;
    }
    log(`Tour ${state.turn} : ${mine.length} unité(s) — ${moves} déplacement(s), ${holds} tenue(s) de position, ${fortifies} fortification(s), ${reassigns} réassignation(s).`);
    send({ type: 'EndTurn' });
    lastEndedTurn = state.turn;
  }

  // Boucle de messages : planifie à chaque Snapshot, log les résultats.
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    if (msg.type === 'Snapshot') void planTurn(msg);
    if (msg.type === 'TurnResult') {
      log(`Tour ${msg.turn} résolu (${msg.events.length} événement(s) visibles).`);
      // Après une résolution, les deux joueurs sont déverrouillés : planifier
      // le nouveau tour depuis l'état post-résolution.
      void planTurn({ state: msg.state, orders: [], locked: false });
    }
    if (msg.type === 'OrderAck' && msg.accepted === false && msg.reason) log(`Ordre refusé : ${msg.reason}`);
    if (msg.type === 'Error') log(`Erreur serveur : ${msg.code} ${msg.message}`);
    if (msg.type === 'TurnResult' && msg.events.some((e) => e.type === 'Victory')) {
      log('Partie terminée (Victoire). Arrêt du bot.');
      ws.close();
      process.exit(0);
    }
  });

  // Le Welcome/Snapshot initiaux ont pu arriver avant la boucle : replanifie.
  void waitFor('Snapshot').then((snap) => planTurn(snap));

  const keepAlive = setInterval(() => {}, 1 << 30);
  ws.addEventListener('close', () => {
    clearInterval(keepAlive);
    log('Socket fermé.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[bot]', err.message);
  process.exit(1);
});
