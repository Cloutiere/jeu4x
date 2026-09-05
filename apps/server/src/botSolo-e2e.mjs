#!/usr/bin/env node
/**
 * Vérification « conditions réelles » du Chantier BOT-SOLO (L4) sur un
 * wrangler dev local — LE critère d'Erik :
 *   1. création d'une partie SOLO depuis le lobby (case solo, civ du bot
 *      imposée) → partie ACTIVE immédiatement avec p2 = « Bot » ;
 *   2. le bot JOUE chaque tour sans processus externe (recherche, production,
 *      déplacements de ses unités) ;
 *   3. victoire par DOMINATION du joueur contre le bot (capture de la
 *      capitale adverse) ;
 *   4. les parties pré-solo (2 joueurs) restent inchangées (création + join +
 *      résolution classique).
 *
 * Usage : node src/botSolo-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const PROTO = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const TERRAINS = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/terrain.json'), 'utf8'));
const UNIT_TYPES = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/units.json'), 'utf8'));
const MAX_TURNS = 300;

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
  const waitFor = (type, ms = 20000) =>
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
const passable = (state, q, r) => {
  const tile = state.map[`${q},${r}`];
  return !!tile && !!TERRAINS[tile.terrain]?.passable;
};
const unitAt = (state, q, r) => Object.values(state.units).find((u) => u.q === q && u.r === r && !u.aboard);

/** Champ de distances BFS depuis un ensemble de buts. Les cases tenues par un
 *  ennemi MILITAIRE sont évitées (contourner les murs barbares) sauf si
 *  `throughEnemies` — la victoire passe par la capitale, mur compris. */
function bfsField(state, goals, throughEnemies = false) {
  const blocked = new Set();
  if (!throughEnemies) {
    for (const u of Object.values(state.units)) {
      if (u.aboard) continue;
      if (u.owner !== 'p1' && UNIT_TYPES[u.type]?.canAttack !== false) blocked.add(`${u.q},${u.r}`);
    }
  }
  const dist = new Map();
  const queue = [];
  for (const g of goals) {
    if (!passable(state, g.q, g.r)) continue;
    dist.set(`${g.q},${g.r}`, 0);
    queue.push(g);
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = dist.get(`${cur.q},${cur.r}`);
    for (const [dq, dr] of DIRS) {
      const q = cur.q + dq;
      const r = cur.r + dr;
      const key = `${q},${r}`;
      if (dist.has(key) || !passable(state, q, r) || blocked.has(key)) continue;
      dist.set(key, d + 1);
      queue.push({ q, r });
    }
  }
  return dist;
}

/** Prochain pas vers les buts : praticable, libre d'amie.
 *  - case tenue par un ennemi PACIFIQUE : entrée libre (R-43 — capture
 *    sans combat + butin, mets libres pour le siège) ;
 *  - case tenue par un ennemi MILITAIRE : seulement en meute (≥ 2 alliés
 *    adjacents à la case). */
function stepToward(state, unit, field, myEngineId) {
  let best = null;
  const here = field.get(`${unit.q},${unit.r}`);
  const adjacentAllies = (q, r) =>
    DIRS.filter(([dq, dr]) => {
      const u = unitAt(state, q + dq, r + dr);
      return u && u.owner === myEngineId && !u.aboard;
    }).length;
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const d = field.get(`${q},${r}`);
    if (d === undefined || !passable(state, q, r)) continue;
    const occupied = unitAt(state, q, r);
    if (occupied?.owner === myEngineId) continue; // R-30 : pas d'empilement amie
    if (occupied) {
      const isPacific = UNIT_TYPES[occupied.type]?.canAttack === false;
      if (!isPacific && adjacentAllies(q, r) < 2) continue; // attaque groupée seulement
    }
    if (here === undefined || d < here) {
      if (!best || d < best.d) best = { q, r, d };
    }
  }
  return best;
}

function capitalOf(state, owner) {
  return Object.values(state.cities).find((c) => c.owner === owner && c.capital) ?? null;
}

// ---------------------------------------------------------------------------
// 1-3. Partie solo contre le bot — création, tours, victoire par domination.
// ---------------------------------------------------------------------------
const aliceTok = await login('AliceSolo');
console.log(`[e2e] Alice connectée (dev stub) — cible ${BASE}`);

const lobby = wsConnect('/ws/lobby', aliceTok);
await lobby.open;
await lobby.waitFor('GameList');
lobby.send({
  type: 'CreateGame',
  settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' },
});
const created = await lobby.waitFor('GameCreated');
const CODE = created.code;
console.log(`[e2e] partie solo ${CODE} créée (case à cocher)`);
lobby.ws.close();

// « Mes parties » : la partie solo est listée avec le badge (bot: true).
{
  const l2 = wsConnect('/ws/lobby', aliceTok);
  await l2.open;
  const list = await l2.waitFor('GameList');
  const mine = list.mine.find((g) => g.code === CODE);
  if (!mine) throw new Error('la partie solo n\'apparaît pas dans « Mes parties »');
  if (mine.settings.solo !== true) throw new Error('settings.solo absent du résumé (badge « solo » cassé)');
  if (mine.players.find((p) => p.bot)?.name !== 'Bot') throw new Error('joueur bot absent du résumé');
  if (mine.status !== 'active') throw new Error(`la partie solo devrait être active (${mine.status})`);
  console.log('[e2e] « Mes parties » : partie active, badge solo, adversaire « Bot » ✓');
  l2.ws.close();
}

const game = wsConnect(`/ws/game/${CODE}`, aliceTok);
await game.open;
const welcome = await game.waitFor('Welcome');
if (!welcome.players.some((p) => p.bot === true && p.engineId === 'p2')) {
  throw new Error('Welcome sans joueur bot en p2');
}
console.log(`[e2e] Welcome : tour ${welcome.turn}, joueurs =`, welcome.players.map((p) => `${p.name}${p.bot ? ' (bot)' : ''}`).join(' vs '));
await game.waitFor('Snapshot');

let state = (await admin(CODE)).state;
const botCapital0 = capitalOf(state, 'p2');
if (!botCapital0) throw new Error('pas de capitale bot dans l\'état initial');
console.log(`[e2e] capitale du bot en (${botCapital0.q},${botCapital0.r}) — marche de guerre engagée (cap ${MAX_TURNS} tours)`);

let victory = null;
let botMovedTurns = 0;
let lastBotPositions = JSON.stringify(Object.values(state.units).filter((u) => u.owner === 'p2').map((u) => [u.id, u.q, u.r]).sort());
let botProduced = 0;

for (let turn = state.turn; turn < MAX_TURNS; turn = state.turn) {
  // Ordres d'Alice : produire un guerrier (et rusher si possible), marcher
  // vers la capitale du bot, entrer dès qu'elle est SANS défenseur (R-65).
  const myCapital = capitalOf(state, 'p1');
  const botCapital = capitalOf(state, 'p2');
  if (!botCapital) throw new Error('capitale bot introuvable (rasée ?) — cas hors périmètre e2e');
  const goals = [{ q: botCapital.q, r: botCapital.r }];
  const field = bfsField(state, goals);

  const botGarrison = unitAt(state, botCapital.q, botCapital.r);
  // Stratégie (leçons des runs précédents) :
  //  - R-62 : une unité ne SPAWN PAS sur une case de ville occupée — le
  //    guerrier de garde ne doit rester sur la capitale que si des barbares
  //    rôdent (sinon la production reste bloquée à son coût, pour toujours) ;
  //  - R-135 : le rush-buy pose l'unité sur la case de ville SINON ADJACENTE
  //    — avec une garde sur la case, chaque rush fait apparaître un guerrier
  //    supplémentaire à côté : la machine de guerre d'Alice ;
  //  - fenêtre R-57 : les 2 assiégeants les plus anciens CHARGENT la
  //    capitale chaque tour — si la garnison du bot quitte sa case en Phase A
  //    avant leur passage, la capture se fait sans combat ; sinon c'est une
  //    attaque (usure de la garnison, jamais ripostée au-delà de l'échange).
  const home = capitalOf(state, 'p1');
  const myUnits = Object.values(state.units).filter((u) => u.owner === 'p1' && !u.aboard);
  const barbNearHome = home
    ? Object.values(state.units).some((u) => u.owner === 'barbarien' && hexDist(u, home) <= 3)
    : false;
  const homeGarrison = home ? myUnits.find((u) => u.q === home.q && u.r === home.r) : null;
  const siege = myUnits
    .filter((u) => hexDist(u, botCapital) === 1)
    .sort((a, b) => a.id.localeCompare(b.id));
  const siegeChargers = new Set(siege.slice(0, 2).map((u) => u.id));
  for (const unit of myUnits) {
    if (siegeChargers.has(unit.id)) {
      game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [{ q: botCapital.q, r: botCapital.r }] } });
      continue;
    }
    if (siege.some((u) => u.id === unit.id)) {
      game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } }); // siégeant en réserve
      continue;
    }
    if (homeGarrison && unit.id === homeGarrison.id && barbNearHome) {
      game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } }); // garrison anti-barbares
      continue;
    }
    // R-126 : un GP adjacent à une ville avec production le CONSUME (Bâtisseur :
    // achève la production en cours — unité gratuite immédiate).
    if (UNIT_TYPES[unit.type]?.greatPerson === true) {
      const target = Object.values(state.cities).find(
        (c) => c.owner === 'p1' && c.production && hexDist(unit, c) <= 1,
      );
      if (target) {
        game.send({ type: 'SubmitOrder', order: { type: 'GreatPersonAction', unitId: unit.id, action: 'consume', cityId: target.id } });
        continue;
      }
    }
    const step = stepToward(state, unit, field, 'p1');
    if (step && !unit.fortified) {
      game.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [step] } });
    } else {
      game.send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
    }
  }
  if (home && !home.production) {
    game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: home.id, item: { kind: 'unit', id: 'guerrier' } } });
  }
  // Rush-buy R-135 systématique au-delà d'une réserve de 40 or (le moteur
  // revalide : trésorerie, éligibilité, 1 rush/ville/tour).
  if (home?.production && state.players.p1.treasury >= 40) {
    game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } });
  }
  game.send({ type: 'EndTurn' });

  const result = await game.waitFor('TurnResult');
  if (result.type !== 'TurnResult') throw new Error('TurnResult attendu');
  state = (await admin(CODE)).state;
  const positions = JSON.stringify(Object.values(state.units).filter((u) => u.owner === 'p2').map((u) => [u.id, u.q, u.r]).sort());
  if (positions !== lastBotPositions) botMovedTurns += 1;
  lastBotPositions = positions;
  const botCity = Object.values(state.cities).find((c) => c.owner === 'p2');
  if (botCity?.production?.item) botProduced += 1;

  const victoryEvent = result.events.find((e) => e.type === 'Victory');
  if (victoryEvent) {
    victory = victoryEvent;
    break;
  }
  if (state.winner) break;
  if (turn % 10 === 0) console.log(`[e2e] tour ${state.turn} — Alice : ${Object.values(state.units).filter((u) => u.owner === 'p1').length} unité(s), trésorerie ${state.players.p1.treasury} ; bot : ${Object.values(state.units).filter((u) => u.owner === 'p2').length} unité(s)`);
}

if (!victory) throw new Error(`pas de victoire après ${MAX_TURNS} tours — e2e échoué`);
const dumpEnd = await admin(CODE);
if (victory.winner !== 'p1' || dumpEnd.meta.finishedReason !== 'domination') {
  throw new Error(`victoire inattendue : ${JSON.stringify(victory)} / motif méta ${dumpEnd.meta.finishedReason}`);
}
if (botMovedTurns === 0 || botProduced === 0) {
  throw new Error(`le bot n'a pas joué (tours avec déplacement bot : ${botMovedTurns}, productions bot : ${botProduced})`);
}
console.log(`[e2e] VICTOIRE par domination au tour ${state.turn} — motif méta « ${dumpEnd.meta.finishedReason} » ✓`);
console.log(`[e2e] le bot a joué : ${botMovedTurns} tour(s) avec déplacements, ${botProduced} tour(s) avec une production ✓`);
game.ws.close();

// ---------------------------------------------------------------------------
// 4. Parties pré-solo (2 joueurs) : création + join + résolution classique.
// ---------------------------------------------------------------------------
const bobTok = await login('BobSolo');
const lobbyA = wsConnect('/ws/lobby', aliceTok);
await lobbyA.open;
await lobbyA.waitFor('GameList');
lobbyA.send({ type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false } });
const duelCode = (await lobbyA.waitFor('GameCreated')).code;
lobbyA.ws.close();
const lobbyB = wsConnect('/ws/lobby', bobTok);
await lobbyB.open;
await lobbyB.waitFor('GameList');
lobbyB.send({ type: 'JoinGame', code: duelCode });
await lobbyB.waitFor('GameJoined');
lobbyB.ws.close();
{
  const duel = wsConnect(`/ws/game/${duelCode}`, aliceTok);
  await duel.open;
  const w = await duel.waitFor('Welcome');
  if (w.players.some((p) => p.bot)) throw new Error('une partie classique ne doit pas contenir de bot');
  await duel.waitFor('Snapshot');
  duel.send({ type: 'EndTurn' });
  await duel.waitFor('OrderAck');
  const d = await admin(duelCode);
  if (d.state.turn !== 0 || d.resolving) throw new Error('partie pré-solo : la résolution ne doit pas démarrer seule');
  console.log('[e2e] partie classique 2 joueurs : pas de bot, EndTurn seul ne résout pas ✓');
  duel.ws.close();
}

console.log('\n[e2e] BOT-SOLO : TOUS LES CONTRÔLES SONT PASSÉS ✓');
process.exit(0);
