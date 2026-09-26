#!/usr/bin/env node
/**
 * LOBBY-5 · e2e « conditions réelles » sur wrangler dev local — parcours
 * complet de la salle d'attente structurée à 5 sièges :
 *
 *   0. Hôte : CreateGame { config: 2 humains + 3 bots } → partie `waiting` ;
 *   1. Invité (2e session dev stub) : jointure avec la COULEUR de l'hôte →
 *      refus EXPLICITE (unicité serveur — D2), puis couleur libre → accepté ;
 *   2. UpdateGameConfig par l'hôte (topographie « un-continent ») ;
 *   3. StartGame par l'hôte : bots remplis, civs attribuées (défaut tirage
 *      seedé), état initial créé (p1..p5) ;
 *   4. Les DEUX humains reçoivent un Welcome dont players portent les
 *      paletteId choisis (D5) ; l'invité a sa civ ;
 *   5. Variante civsAleatoires : 5 civs tirées distinctes ;
 *   6. Un invité qui quitte la salle d'attente libère son siège.
 *
 * Usage : node src/lobby-5-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const PROTO = 1;
const HERE = dirname(fileURLToPath(import.meta.url));

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
  const waitFor = (type, ms = 60000) =>
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

const config5 = {
  sieges: [
    { type: 'humain', paletteId: 'bleu-saphir', civId: 'amerique' },
    { type: 'humain', paletteId: 'rouge-royal', civId: null },
    { type: 'bot', paletteId: 'vert-emeraude', civId: null },
    { type: 'bot', paletteId: 'jaune-dor', civId: null },
    { type: 'bot', paletteId: 'cuivre-ardent', civId: null },
  ],
  civsAleatoires: false,
  topographie: 'archipel',
};

const hostTok = await login('HoteLobby5');
const invTok = await login('InviteLobby5');
console.log(`[e2e] deux sessions dev stub créées — cible ${BASE}`);

// --- 0. Création ------------------------------------------------------------
{
  const lobby = wsConnect('/ws/lobby', hostTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: true, config: config5 } });
  var CODE = (await lobby.waitFor('GameCreated')).code;
  lobby.ws.close();
}
let dump = await admin(CODE);
if (dump.meta.status !== 'waiting' || dump.meta.players.length !== 1) throw new Error('création : partie non en attente');
console.log(`[e2e] 0. partie ${CODE} créée — waiting, hôte au siège 0 (${dump.meta.players[0].paletteId})`);

// --- 1. Jointure : collision de couleur, puis couleur libre ------------------
{
  const lobby = wsConnect('/ws/lobby', invTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'JoinGame', code: CODE, paletteId: 'bleu-saphir', civId: 'rome' });
  const err = await lobby.waitFor('Error');
  if (!/déjà prise/i.test(err.message)) throw new Error(`refus inattendu : ${err.message}`);
  console.log(`[e2e] 1a. collision couleur refusée : « ${err.message} »`);
  lobby.send({ type: 'JoinGame', code: CODE, paletteId: 'rouge-royal', civId: 'rome' });
  const joined = await lobby.waitFor('GameJoined');
  if (joined.code !== CODE) throw new Error('join libre échoué');
  lobby.ws.close();
}
console.log('[e2e] 1b. invité joint avec Rouge Royal + Rome ✓');

// --- 2. UpdateGameConfig (hôte) ----------------------------------------------
{
  const lobby = wsConnect('/ws/lobby', hostTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  const modifiee = structuredClone(config5);
  modifiee.topographie = 'un-continent';
  lobby.send({ type: 'UpdateGameConfig', code: CODE, config: modifiee });
  await lobby.waitFor('GameList'); // diffusion post-mutation
  lobby.ws.close();
}
dump = await admin(CODE);
if (dump.meta.settings.config.topographie !== 'un-continent') throw new Error('UpdateGameConfig non appliquée');
if (dump.meta.players.find((p) => p.id !== dump.meta.hostId).paletteId !== 'rouge-royal') {
  throw new Error('édition : le siège de l\'invité a été écrasé');
}
console.log('[e2e] 2. topographie modifiée par l\'hôte ; siège de l\'invité préservé ✓');

// --- 3-4. StartGame + Welcome des deux humains -------------------------------
{
  const lobby = wsConnect('/ws/lobby', hostTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'StartGame', code: CODE });
  await lobby.waitFor('GameList');
  lobby.ws.close();
}
dump = await admin(CODE);
if (dump.meta.status !== 'active') throw new Error(`démarrage : statut ${dump.meta.status}`);
if (dump.meta.players.length !== 5) throw new Error(`démarrage : ${dump.meta.players.length} joueurs`);
const palettes = dump.meta.players.map((p) => p.paletteId);
if (new Set(palettes).size !== 5) throw new Error('palettes non uniques au démarrage');
const bots = dump.meta.players.filter((p) => p.bot);
if (bots.length !== 3) throw new Error(`démarrage : ${bots.length} bots`);
if (bots.some((b) => !b.civId)) throw new Error('bot sans civ (tirage de confort absent)');
console.log(`[e2e] 3. démarré : 5 joueurs, palettes ${palettes.join(', ')} ; bots ${bots.map((b) => b.civId).join(', ')}`);

for (const [nom, tok] of [['hôte', hostTok], ['invité', invTok]]) {
  const game = wsConnect(`/ws/game/${CODE}`, tok);
  await game.open;
  const welcome = await game.waitFor('Welcome');
  if (welcome.players.length !== 5 || welcome.players.some((p) => !p.paletteId)) {
    throw new Error(`Welcome ${nom} : palettes absentes`);
  }
  const inv = welcome.players.find((p) => p.name === 'InviteLobby5');
  if (!inv || inv.civId !== 'rome') throw new Error(`Welcome ${nom} : civ de l'invité perdue`);
  await game.waitFor('Snapshot');
  game.ws.close();
}
console.log('[e2e] 4. Welcome hôte/invité : paletteId par joueur + civ de l\'invité ✓');

// --- 5. Variante civsAleatoires ----------------------------------------------
{
  const cfg = structuredClone(config5);
  cfg.civsAleatoires = true;
  cfg.sieges.forEach((s) => { delete s.civId; });
  const lobby = wsConnect('/ws/lobby', hostTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, config: cfg } });
  const code2 = (await lobby.waitFor('GameCreated')).code;
  const l2 = wsConnect('/ws/lobby', invTok);
  await l2.open;
  await l2.waitFor('GameList');
  l2.send({ type: 'JoinGame', code: code2, paletteId: 'rouge-royal' });
  await l2.waitFor('GameJoined');
  l2.ws.close();
  lobby.send({ type: 'StartGame', code: code2 });
  await lobby.waitFor('GameList');
  lobby.ws.close();
  const d = await admin(code2);
  const civs = d.meta.players.map((p) => p.civId);
  if (new Set(civs).size !== 5) throw new Error(`civs aléatoires non distinctes : ${civs.join(', ')}`);
  console.log(`[e2e] 5. civsAleatoires : 5 civs tirées distinctes (${civs.join(', ')}) ✓`);
}

// --- 6. Quitter la salle d'attente libère le siège ---------------------------
{
  const cfg = structuredClone(config5);
  const lobby = wsConnect('/ws/lobby', hostTok);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, config: cfg } });
  const code3 = (await lobby.waitFor('GameCreated')).code;
  const l2 = wsConnect('/ws/lobby', invTok);
  await l2.open;
  await l2.waitFor('GameList');
  l2.send({ type: 'JoinGame', code: code3, paletteId: 'rouge-royal' });
  await l2.waitFor('GameJoined');
  l2.send({ type: 'AbandonGame', code: code3 });
  await l2.waitFor('GameList');
  l2.ws.close();
  lobby.ws.close();
  const d = await admin(code3);
  if (d.meta.status !== 'waiting' || d.meta.players.length !== 1) throw new Error('quitter : siège non libéré');
  console.log('[e2e] 6. l\'invité quitte la salle d\'attente : siège libéré, partie intacte ✓');
}

console.log('[e2e] LOBBY-5 : parcours complet de création/jointure/démarrage validé ✓');
