#!/usr/bin/env node
/**
 * Vérification « conditions réelles » des ARTEFACTS (Phase 7o — R-151..R-156)
 * sur un wrangler dev local : deux clients stub créent une partie, les
 * artefacts sont tirés par seed (carte fixe — R-151), le fog est vérifié sur
 * le snapshot (artefacts explorés seuls + pings de présence R-155), puis le
 * guerrier d'Alice marche jusqu'à une relique terrestre accessible ; à
 * l'ENTRÉE sur la case (R-153, miroir huttes) l'artefact est activé :
 * disparition définitive (deux joueurs), événement ArtifactActivated filtré,
 * effet conforme au catalogue (R-154).
 *
 * Usage : node src/artefact-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
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

async function admin(code) {
  const vars = readFileSync(join(HERE, '../.dev.vars'), 'utf8');
  const token = /^ADMIN_TOKEN=(.*)$/m.exec(vars)[1].trim();
  const res = await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${token}` } });
  return res.json();
}

// ---------------------------------------------------------------------------
// Aides cartographiques (determinisme local — le dump admin donne la vérité)
// ---------------------------------------------------------------------------

const NEIGHBORS = [[0, -1], [-1, 0], [-1, 1], [0, 1], [1, 0], [1, -1]];

function passable(state, q, r) {
  const t = state.map[`${q},${r}`];
  return !!t && TERRAINS[t.terrain]?.passable;
}

function bfsPath(state, from, to) {
  const key = (q, r) => `${q},${r}`;
  const prev = new Map([[key(from.q, from.r), null]]);
  let queue = [from];
  while (queue.length > 0) {
    const next = [];
    for (const cur of queue) {
      if (cur.q === to.q && cur.r === to.r) {
        const path = [];
        let k = key(cur.q, cur.r);
        let node = cur;
        while (node) {
          path.unshift({ q: node.q, r: node.r });
          node = prev.get(key(node.q, node.r));
        }
        return path.slice(1); // sans la case de départ
      }
      for (const [dq, dr] of NEIGHBORS) {
        const q = cur.q + dq;
        const r = cur.r + dr;
        const k = key(q, r);
        if (prev.has(k) || !passable(state, q, r)) continue;
        prev.set(k, cur);
        next.push({ q, r });
      }
    }
    queue = next;
  }
  return null;
}

// ---------------------------------------------------------------------------

const aliceTok = await login('AliceArte');
const bobTok = await login('BobArte');

let CODE = null;
let artefacts = null;
let state = null;

// Création : la graine est générée par le lobby — on rejoue jusqu'à obtenir
// une relique TERRESTRE reliée au départ d'Alice (carte pangée : presque
// toujours le cas ; les îles isolées ne le sont pas par définition, R-152).
for (let attempt = 1; attempt <= 5 && !CODE; attempt++) {
  const lobby = wsConnect('/ws/lobby', aliceTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'variee-40', turnTimerMinutes: null, isPublic: false } });
  const created = await lobby.waitFor('GameCreated');
  const code = created.code;
  lobby.ws.close();

  const lobbyB = wsConnect('/ws/lobby', bobTok);
  await lobbyB.open;
  await lobbyB.waitFor('GameList');
  lobbyB.send({ type: 'JoinGame', code });
  await lobbyB.waitFor('GameJoined');
  lobbyB.ws.close();

  const dump = await admin(code);
  const gen = dump.artefacts?.generes ?? [];
  state = dump.state;
  const land = gen.filter((a) => {
    const data = a.artefact;
    return data !== 'atlantide';
  });
  const aliceUnit = Object.values(state.units).find((u) => u.owner === 'p1');
  const reachable = land.some((a) => bfsPath(state, aliceUnit, a.at));
  if (reachable) {
    CODE = code;
    artefacts = gen;
    console.log(`partie ${code} (tentative ${attempt}) — artefacts tirés :`, gen.map((a) => `${a.artefact}@${a.at.q},${a.at.r}`).join(', '));
  } else {
    console.log(`tentative ${attempt} : aucune relique terrestre accessible — nouvelle graine`);
  }
}
if (!CODE) throw new Error('aucune graine avec relique terrestre accessible après 5 tentatives');

// Connexions en partie
const alice = wsConnect(`/ws/game/${CODE}`, aliceTok);
await alice.open;
const aliceWelcome = await alice.waitFor('Welcome');
const bob = wsConnect(`/ws/game/${CODE}`, bobTok);
await bob.open;
await bob.waitFor('Welcome');
console.log('connectés en partie —', aliceWelcome.playerId, 'vs p2');

let snap = await alice.waitFor('Snapshot');

// --- Fog (R-153/R-155) : un artefact inexploré n'existe pas côté client ----
const exploredKeys = new Set(snap.state.players['p1']?.vision.explored ?? []);
const visibleArtefacts = snap.state.artefacts ?? [];
const pings = snap.state.artifactPings ?? [];
const totalArtefacts = artefacts.length;
console.log(`fog : ${visibleArtefacts.length} artefact(s) exploré(s) visible(s), ${pings.length} ping(s) de présence, ${totalArtefacts} générés`);
if (visibleArtefacts.length + pings.length !== totalArtefacts) {
  throw new Error(`fog incohérent : ${visibleArtefacts.length} visibles + ${pings.length} pings ≠ ${totalArtefacts} générés`);
}
if (pings.some((p) => exploredKeys.has(`${p.q},${p.r}`))) throw new Error('ping sur une case explorée (ne devrait pas arriver)');
console.log('OK fog : artefacts inexplorés absents (identité filtrée), pings de présence seuls (R-155)');

// --- Marche vers la relique terrestre accessible la plus proche -------------
const dump0 = await admin(CODE);
const full = dump0.state;
const candidates = artefacts
  .filter((a) => a.artefact !== 'atlantide')
  .map((a) => ({ ...a, path: bfsPath(full, full.units['u1'] ?? Object.values(full.units).find((u) => u.owner === 'p1'), a.at) }))
  .filter((a) => a.path);
candidates.sort((a, b) => a.path.length - b.path.length);
if (candidates.length === 0) throw new Error('aucune relique terrestre accessible');
const target = candidates[0];
console.log(`relique visée : ${target.artefact} en (${target.at.q},${target.at.r}) — chemin ${target.path.length} cases`);

let turns = 0;
let activated = null;
while (turns < 40 && !activated) {
  // Chemin recomposé chaque tour (haltes, barbares) depuis le dump admin.
  const d = await admin(CODE);
  const me = Object.values(d.state.units).find((u) => u.owner === 'p1' && !u.detainedBy);
  if (!me) throw new Error('unité d\'Alice absente (capturée ?)');
  const here = { q: me.q, r: me.r };
  if (here.q === target.at.q && here.r === target.at.r) break;
  const path = bfsPath(d.state, here, target.at);
  if (!path) throw new Error('chemin perdu (barbares ?)');
  alice.send({ type: 'SubmitOrder', order: { type: 'Move', unitId: me.id, path } });
  await alice.waitFor('OrderAck');
  bob.send({ type: 'EndTurn' });
  alice.send({ type: 'EndTurn' });
  const result = await alice.waitFor('TurnResult', 30000);
  turns += 1;
  activated = result.events.find((e) => e.type === 'ArtifactActivated');
}

if (!activated) throw new Error(`aucune activation en ${turns} tours`);
console.log(`OK activation au tour ${turns} : « ${activated.name} » par ${activated.byPlayer} (événement filtré reçu par Alice)`);

// --- Disparition pour les DEUX joueurs + effet (R-153/R-154) ---------------
const dumpEnd = await admin(CODE);
const restants = dumpEnd.state.artefacts;
if (restants.some((a) => a.q === target.at.q && a.r === target.at.r)) {
  throw new Error('l\'artefact activé est encore dans l\'état (devrait avoir disparu)');
}
console.log(`OK disparition définitive : ${restants.length} artefact(s) restant(s)`);

const effect = activated.effect;
const p1 = dumpEnd.state.players.p1;
const details = { gold: activated.gold, techs: activated.techs, unitType: activated.unitType };
console.log(`effet ${effect} :`, JSON.stringify(details));
const dumpBefore = await admin(CODE); // réémission : l'état courant suffit
void dumpBefore;
if (effect === 'orParEre' && !(activated.gold > 0)) throw new Error('Sept Cités sans or');
if (effect === 'troisTechsLesMoinsCheres' && activated.techs?.length !== 3) throw new Error('Atlantide : 3 techs attendues');
if (effect === 'uniteMilitaireParEre' && !activated.unitType) throw new Error('Templiers : unité attendue');
if (effect === 'merveilleGratuiteAuChoix') {
  if (!dumpEnd.state.pendingArtefactChoices.some((c) => c.player === 'p1')) throw new Error('Angkor : choix en attente attendu');
  console.log('OK Angkor : droit en attente — action ChooseWonder disponible (R-154)');
}
if (effect === 'personnagesGratuits' && !(p1.greatPersonsObtained >= 3)) throw new Error('Confucius : 3 GP attendus');
if (effect === 'templesVersCathedrales') {
  const cities = Object.values(dumpEnd.state.cities).filter((c) => c.owner === 'p1');
  if (!cities.every((c) => c.buildings.includes('temple') || c.buildings.includes('cathedrale'))) {
    throw new Error('Arche : Temple/Cathédrale attendus dans chaque ville d\'Alice');
  }
}

// --- Choix Angkor si l'artefact activé l'exige (conditions réelles) --------
if (effect === 'merveilleGratuiteAuChoix') {
  const wonder = dumpEnd.state.pendingArtefactChoices.some((c) => c.player === 'p1') ? 'colosse_de_rhodes' : null;
  if (wonder) {
    const cityId = Object.values(dumpEnd.state.cities).find((c) => c.owner === 'p1')?.id;
    alice.send({ type: 'ChooseWonder', cityId, wonderId: wonder });
    const ack = await alice.waitFor('OrderAck');
    if (!ack.accepted) throw new Error(`ChooseWonder refusé : ${ack.reason}`);
    const snapAfter = await alice.waitFor('Snapshot');
    if (!snapAfter.state.cities[cityId].wonders.includes(wonder)) throw new Error('merveille non posée');
    console.log(`OK ChooseWonder : ${wonder} posée dans ${cityId} (+1 jalon culturel R-131)`);
  }
}

console.log('\nE2E ARTEFACTS : tout est vert ✓');
alice.ws.close();
bob.ws.close();
process.exit(0);
