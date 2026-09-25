#!/usr/bin/env node
/**
 * CARTE-MULTI · e2e « conditions réelles » sur wrangler dev local — critère
 * d'acceptation n°1 du handoff : une partie à 5 sièges (1 humain + 4 bots)
 * se joue de BOUT EN BOUT en ligne jusqu'à une victoire, sans erreur.
 *
 * Déroulé :
 *   0. création solo 5 sièges (carte libre libreMulti) — retry sur les seeds
 *      dont les 5 spawns ne partagent PAS une même masse terrestre (la
 *      conquête de l'e2e est terrestre ; le naval est hors scripts) ;
 *   1. Alice fonde sa capitale (démarrage Colon — R-64), produit des
 *      guerriers, rush-buy (R-135) et marche vers la capitale bot la plus
 *      proche ; sièges R-57 (2 assiégeants par tour) ;
 *   2. les bots se GUERRENT entre eux (guerre universelle — R-58) : leurs
 *      éliminations mutuelles (PlayerDefeated) accélèrent la fin ;
 *   3. victoire par DOMINATION au DERNIER joueur en lice (CARTE-MULTI) —
 *      méta « domination », winner p1.
 *
 * Usage : node src/carte-multi-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const PROTO = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const UNIT_TYPES = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/units.json'), 'utf8'));
const MAX_TURNS = 400;
const MAX_RETRIES = 12;

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
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, ms = 30000) =>
    new Promise((resolve, reject) => {
      const idx = pending.findIndex((m) => m.type === type);
      if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
      const t = setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
      waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
    });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error(`WS impossible : ${path} (wrangler dev lancé ?)`)));
  });
  return { ws, open, waitFor, send };
}

async function admin(code) {
  const vars = readFileSync(join(HERE, '../.dev.vars'), 'utf8');
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(vars)[1].trim();
  const res = await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`admin impossible : HTTP ${res.status}`);
  return res.json();
}

const DIRS = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const key = (q, r) => `${q},${r}`;
const passable = (state, q, r) => {
  const tile = state.map[key(q, r)];
  return !!tile && tile.terrain !== 'eau' && tile.terrain !== 'ocean';
};
const unitAt = (state, q, r) => Object.values(state.units).find((u) => u.q === q && u.r === r && !u.aboard);

function bfsField(state, goals) {
  const dist = new Map();
  const queue = [];
  for (const g of goals) {
    if (!passable(state, g.q, g.r)) continue;
    dist.set(key(g.q, g.r), 0);
    queue.push(g);
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = dist.get(key(cur.q, cur.r));
    for (const [dq, dr] of DIRS) {
      const q = cur.q + dq;
      const r = cur.r + dr;
      if (dist.has(key(q, r)) || !passable(state, q, r)) continue;
      dist.set(key(q, r), d + 1);
      queue.push({ q, r });
    }
  }
  return dist;
}

/** Composante terrestre d'un point (BFS) — pour le critère de retry (0). */
function landComponentOf(state, start) {
  const seen = new Set([key(start.q, start.r)]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dq, dr] of DIRS) {
      const q = cur.q + dq;
      const r = cur.r + dr;
      if (seen.has(key(q, r)) || !passable(state, q, r)) continue;
      seen.add(key(q, r));
      queue.push({ q, r });
    }
  }
  return seen;
}

function capitalOf(state, owner) {
  return Object.values(state.cities).find((c) => c.owner === owner && c.capital) ?? null;
}

const aliceTok = await login('AliceMulti');
console.log(`[e2e] Alice connectée (dev stub) — cible ${BASE}`);

// --- 0. Création + retry connexité (les 5 spawns sur UNE masse terrestre) --
let CODE = null;
let state = null;
let game = null;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const lobby = wsConnect('/ws/lobby', aliceTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({
    type: 'CreateGame',
    settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 5 },
  });
  const created = await lobby.waitFor('GameCreated');
  lobby.ws.close();
  const dump = await admin(created.code);
  // Démarrage COLON : aucune ville au tour 0 — les sites de spawn viennent
  // du rapport de génération (meta.progen.multi.spawns).
  const capitals = (dump.meta?.progen?.multi?.spawns ?? []).map((s) => s.capital);
  if (capitals.length !== 5) throw new Error('rapport multi absent du dump admin');
  const island = landComponentOf(dump.state, capitals[0]);
  const communs = capitals.filter((c) => island.has(key(c.q, c.r))).length;
  if (communs === 5) {
    CODE = created.code;
    state = dump.state;
    console.log(`[e2e] tentative ${attempt} : partie ${CODE} retenue — les 5 capitales partagent une masse terrestre`);
    break;
  }
  console.log(`[e2e] tentative ${attempt} : ${communs}/5 spawns sur la masse du premier — nouvelle partie (seed suivant)`);
}
if (!CODE) throw new Error(`pas de carte connexe en ${MAX_RETRIES} tentatives`);

game = wsConnect(`/ws/game/${CODE}`, aliceTok);
await game.open;
const welcome = await game.waitFor('Welcome');
const bots = welcome.players.filter((p) => p.bot === true);
if (welcome.players.length !== 5 || bots.length !== 4) {
  throw new Error(`Welcome inattendu : ${welcome.players.length} joueurs, ${bots.length} bots`);
}
console.log(`[e2e] Welcome : joueurs = ${welcome.players.map((p) => `${p.name}${p.bot ? '(bot)' : ''}`).join(', ')}`);
await game.waitFor('Snapshot');

// --- 1-3. La partie ---------------------------------------------------------
// Démarrage COLON (carte procédurale — R-64) : fonder la capitale au tour 0.
{
  const colon = Object.values(state.units).find((u) => u.owner === 'p1' && u.type === 'colon');
  if (colon) {
    game.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: colon.id } });
    console.log('[e2e] fondation de la capitale programmée (démarrage Colon — R-64)');
  }
}

let victory = null;
let eliminations = 0;
for (let turn = state.turn; turn < MAX_TURNS; turn = state.turn) {
  // Recherche (le blocage fin-de-tour R-85 exige un choix si science produite).
  if (state.players.p1.researching === null) {
    game.send({ type: 'SetResearch', techId: 'ecriture' });
  }
  const myCapital = capitalOf(state, 'p1');
  const aliveBots = Object.keys(state.players).filter(
    (id) => id !== 'p1' && state.players[id].defeated !== true && capitalOf(state, id),
  );
  if (myCapital) {
    const myUnits = Object.values(state.units).filter((u) => u.owner === 'p1' && !u.aboard);
    // Capitale bot vivante la plus proche.
    const cibles = aliveBots.map((id) => capitalOf(state, id)).filter(Boolean);
    cibles.sort((a, b) => hexDist(a, myCapital) - hexDist(b, myCapital));
    const botCapital = cibles[0];
    const barbNearHome = Object.values(state.units).some(
      (u) => u.owner === 'barbarien' && hexDist(u, myCapital) <= 3,
    );
    const homeGarrison = myUnits.find((u) => u.q === myCapital.q && u.r === myCapital.r);
    const field = botCapital ? bfsField(state, [botCapital]) : new Map();
    const siege = botCapital
      ? myUnits.filter((u) => hexDist(u, botCapital) === 1).sort((a, b) => a.id.localeCompare(b.id))
      : [];
    const siegeChargers = new Set(siege.slice(0, 2).map((u) => u.id));
    for (const unit of myUnits) {
      if (botCapital && siegeChargers.has(unit.id)) {
        game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [{ q: botCapital.q, r: botCapital.r }] } });
        continue;
      }
      if (botCapital && siege.some((u) => u.id === unit.id)) {
        game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        continue;
      }
      if (homeGarrison && unit.id === homeGarrison.id && barbNearHome) {
        game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        continue;
      }
      if (UNIT_TYPES[unit.type]?.canFoundCity === true && unit.type === 'colon') {
        // les colons produits plus tard fondent une ville sur place (si terre)
        game.send({ type: 'SubmitOrder', order: { type: 'FoundCity', unitId: unit.id } });
        continue;
      }
      const here = field.get(key(unit.q, unit.r));
      let best = null;
      for (const [dq, dr] of DIRS) {
        const q = unit.q + dq;
        const r = unit.r + dr;
        const d = field.get(key(q, r));
        if (d === undefined || !passable(state, q, r)) continue;
        const occupied = unitAt(state, q, r);
        if (occupied?.owner === 'p1') continue; // R-30
        if (occupied) {
          const isPacific = UNIT_TYPES[occupied.type]?.canAttack === false;
          const alliesAdj = DIRS.filter(([x, y]) => {
            const a = unitAt(state, q + x, r + y);
            return a && a.owner === 'p1' && !a.aboard;
          }).length;
          if (!isPacific && alliesAdj < 2) continue; // attaque groupée seulement
        }
        if (here === undefined || d < here) {
          if (!best || d < best.d) best = { q, r, d };
        }
      }
      if (best && !unit.fortified) {
        game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [best] } });
      } else {
        game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
      }
    }
    // FIN-DE-TOUR-PRODUCTION : TOUTE ville à marteaux sans production bloque
    // le EndTurn — les villes capturées (production null) incluses.
    const mesVilles = Object.values(state.cities).filter((c) => c.owner === 'p1');
    for (const ville of mesVilles) {
      if (!ville.production) {
        game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } });
      } else if (state.players.p1.treasury >= 40) {
        game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: ville.id } });
      }
    }
  } else {
    for (const u of Object.values(state.units).filter((x) => x.owner === 'p1')) {
      // Pas de capitale : le colon fonde (R-64 — l'ordre est re-posé chaque
      // tour, upsert même sujet) ; le guerrier tient.
      const order = u.type === 'colon' ? { type: 'FoundCity', unitId: u.id } : { type: 'Hold', unitId: u.id };
      game.send({ type: 'SubmitOrder', order });
    }
  }
  game.send({ type: 'EndTurn' });
  const result = await game.waitFor('TurnResult');
  state = (await admin(CODE)).state;
  const defeatedNow = result.events.filter((e) => e.type === 'PlayerDefeated');
  if (defeatedNow.length > 0) {
    eliminations += defeatedNow.length;
    for (const e of defeatedNow) console.log(`[e2e] élimination (tour ${state.turn}) : ${e.player}${e.byPlayer ? ` par ${e.byPlayer}` : ''}`);
  }
  const victoryEvent = result.events.find((e) => e.type === 'Victory');
  if (victoryEvent) {
    victory = victoryEvent;
    break;
  }
  if (state.winner) break;
  if (state.turn % 25 === 0) {
    const vivants = Object.keys(state.players).filter((id) => state.players[id].defeated !== true);
    console.log(`[e2e] tour ${state.turn} — en lice : ${vivants.join(', ')} ; Alice : ${Object.values(state.units).filter((u) => u.owner === 'p1').length} unité(s), trésorerie ${state.players.p1.treasury}`);
  }
}

if (!victory) throw new Error(`pas de victoire après ${MAX_TURNS} tours — e2e échoué`);
const dumpEnd = await admin(CODE);
if (victory.winner !== 'p1' || dumpEnd.meta.finishedReason !== 'domination') {
  throw new Error(`victoire inattendue : ${JSON.stringify(victory)} / motif méta ${dumpEnd.meta.finishedReason}`);
}
console.log(`[e2e] VICTOIRE p1 par domination au tour ${state.turn} — motif méta « ${dumpEnd.meta.finishedReason} » ✓`);
console.log(`[e2e] ${eliminations} élimination(s) intermédiaire(s) — les 4 bots sont sortis, la partie a continué à N ✓`);
game.ws.close();
console.log('[e2e] CARTE-MULTI : partie 5 sièges (1 humain + 4 bots) jouée de bout en bout en ligne ✓');
