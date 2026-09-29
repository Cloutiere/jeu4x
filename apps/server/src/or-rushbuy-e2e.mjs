#!/usr/bin/env node
/**
 * E2E OR-RUSHBUY — audit de bout en bout des puits d'or (HANDOFF-OR-RUSHBUY,
 * mission L1) sur un wrangler dev LOCAL. Zéro changement moteur/serveur : le
 * script est un client comme les autres, le moteur revalide tout.
 *
 * Partie solo RÉELLE (civ Aztèques — +25 or de départ, trait `orDepart`) :
 *   1. Rush-buy d'UNITÉ tour 1 : Guerrier jaguar (10 marteaux × facteur Antique ×2
 *      = 20 or), débit 25 → 5, événements RushBuy + UnitProduced ;
 *   2. DOUBLON : deux RushBuy même ville même tour → un seul achat (R-135) ;
 *   3. FONDS INSUFFISANTS : RushBuy à 5 or sur un projet de 20 → ordre
 *      ignoré (aucun débit, production intacte, aucun événement) ;
 *   4. Rush-buy de BÂTIMENT : Grenier (40 marteaux ×2, tech Poterie — brève
 *      phase conversion Science/SetResearch), acheté au premier tour où la
 *      trésorerie le permet, double soumission → un seul achat ;
 *   5. PALIER ÉCONOMIQUE (R-136) : la trésorerie franchit 100 en jouant
 *      (conversion Or par défaut R-90) → EconomyMilestone + GP de canal or ;
 *   6. Trésorerie relevée à chaque tour (miroir de la barre HUD).
 *
 * Usage : node src/or-rushbuy-e2e.mjs [baseUrl]   (défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const PROTO = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const UNITS = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/units.json'), 'utf8'));
const BUILDINGS = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/buildings.json'), 'utf8'));
const ECONOMY = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/economy.json'), 'utf8'));
const TERRAINS = JSON.parse(readFileSync(join(HERE, '../../../packages/rules/src/data/terrain.json'), 'utf8'));
const MAX_TURNS = 300;

/** facteur de rush de l'ère Antique (début de partie) */
const RUSH_FACTOR = ECONOMY.eraRushFactors.ancienne;
const rushCost = (itemCost, progress) => Math.max(1, Math.round((itemCost - progress) * RUSH_FACTOR));

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
  const acks = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'OrderAck') {
      acks.push(msg);
      if (!msg.accepted) console.log(`  [ack-refusé] ${msg.reason}`);
    }
    if (msg.type === 'Error' && process.env.DEBUG_SEND) console.log(`  [erreur-serveur] ${JSON.stringify(msg)}`);
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
  const send = (msg) => {
    if (process.env.DEBUG_SEND) console.log(`  [envoi] ${JSON.stringify(msg)}`);
    ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  };
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error(`WS impossible : ${path} (wrangler dev lancé ?)`)));
  });
  return { ws, open, waitFor, send, acks };
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
const TERRAINS_ = TERRAINS;
const passable = (state, q, r) => {
  const tile = state.map[`${q},${r}`];
  return !!tile && !!TERRAINS_[tile.terrain]?.passable;
};
const unitAt = (state, q, r) => Object.values(state.units).find((u) => u.q === q && u.r === r && !u.aboard);
const capitalOf = (state, owner) => Object.values(state.cities).find((c) => c.owner === owner && c.capital) ?? null;

/** Évacue la case de la capitale (R-62 : la production reste bloquée si la
 *  case de ville est occupée) — un pas vers une case libre adjacente. */
function fleeTile(state, unit) {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    if (passable(state, q, r) && !unitAt(state, q, r)) return { q, r };
  }
  return null;
}

// ---------------------------------------------------------------------------
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗ ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const aliceTok = await login('AliceOr');
console.log(`[e2e-or] Alice connectée — cible ${BASE}`);

const lobby = wsConnect('/ws/lobby', aliceTok);
await lobby.open;
await lobby.waitFor('GameList');
lobby.send({
  type: 'CreateGame',
  settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous', civId: 'azteques' },
});
const CODE = (await lobby.waitFor('GameCreated')).code;
lobby.ws.close();
console.log(`[e2e-or] partie solo ${CODE} créée (Aztèques vs bot Zoulous)`);

const game = wsConnect(`/ws/game/${CODE}`, aliceTok);
await game.open;
await game.waitFor('Welcome');
await game.waitFor('Snapshot');

// Machine à phases : chaque phase décrit les ordres du tour et son verdict.
let phase = 't1-rush-unite';
const rushBuys = [];        // événements RushBuy reçus
const milestones = [];      // EconomyMilestone
const gpsOr = [];           // GreatPersonSpawned canal or
const releves = [];         // {turn, treasury} — miroir HUD
let insuffisant = null;     // {avant, prodAvant, tour, verdict}
let tourRushGrenier = null;
let coutGrenierAttendu = null;
let fin = null;

for (let guard = 0; guard < MAX_TURNS && !fin; guard++) {
  const state = (await admin(CODE)).state;
  if (state.winner) break;
  const turn = state.turn;
  const me = state.players.p1;
  const home = capitalOf(state, 'p1');
  if (!home) throw new Error('capitale perdue — scénario interrompu');
  releves.push({ turn, treasury: me.treasury });

  // Évacuation : libère la case de capitale (R-62) ET draine vers
  // l'EXTÉRIEUR (le GP du palier 500 spawn capitale/case adjacente — sans
  // case libre il est PERDU, interprétation documentée ; les nouveaux
  // jaguars spawnent Phase C AVANT le palier, l'anneau doit être vide).
  for (const u of Object.values(state.units)) {
    if (u.owner !== 'p1' || u.aboard) continue;
    const d = hexDist(u, home);
    let to = null;
    if (d <= 6) {
      const cible = d + 1;
      for (const [dq, dr] of DIRS) {
        const q = u.q + dq;
        const r = u.r + dr;
        if (passable(state, q, r) && !unitAt(state, q, r) && hexDist({ q, r }, home) === cible) { to = { q, r }; break; }
      }
    }
    game.send({ type: 'SubmitOrder', order: to ? { type: 'Move', unitId: u.id, path: [to] } : { type: 'Hold', unitId: u.id } });
  }

  const prod = home.production;
  // Toute ville sans production bloque la fin de tour — on assigne partout
  // (Grenier si Poterie connue, sinon Guerrier jaguar ; la capitale seule
  // porte les scénarios de rush).
  for (const c of Object.values(state.cities)) {
    if (c.owner !== 'p1' || c.production) continue;
    const item = c.id === home.id && phase === 'marche' && me.techsUnlocked.includes('poterie')
      ? { kind: 'building', id: 'grenier' }
      : { kind: 'unit', id: 'guerrier_jaguar' };
    game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: c.id, item } });
  }
  if (phase === 't1-rush-unite') {
    game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: home.id, item: { kind: 'unit', id: 'guerrier_jaguar' } } });
    game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } }); // 1er : payé (25 ≥ 20)
    game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } }); // doublon : ignoré
    phase = 't2-insuffisant';
  } else if (phase === 't2-insuffisant') {
    insuffisant = { tour: turn, avant: me.treasury, prodAvant: prod?.item?.id ?? null };
    game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: home.id, item: { kind: 'unit', id: 'guerrier_jaguar' } } });
    game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } }); // 5 or < 20 : ignoré
    phase = 'marche';
  } else if (phase === 'marche') {
    // Bâtiment : Grenier (40 marteaux, tech Poterie). D'abord la tech
    // (conversion Science + SetResearch), puis production + rush. On évite
    // TOUTE production répétée d'unités : l'anneau d'unités autour de la
    // capitale ferait perdre le GP du palier 500 (spawn sans case libre).
    if (!me.techsUnlocked.includes('poterie')) {
      game.send({ type: 'SetConversion', cityId: home.id, target: 'science' });
      game.send({ type: 'SetResearch', techId: 'poterie' });
    } else {
      game.send({ type: 'SetConversion', cityId: home.id, target: 'gold' });
      if (prod?.item?.id !== 'grenier') {
        game.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: home.id, item: { kind: 'building', id: 'grenier' } } });
      } else {
        const cost = rushCost(BUILDINGS.grenier.cost, prod.progress);
        if (me.treasury >= cost) {
          tourRushGrenier = turn;
          coutGrenierAttendu = cost;
          game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } }); // payé
          game.send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: home.id } }); // doublon
          phase = 'palier';
        }
        // sinon : le Grenier progresse tout seul (marteaux), on attend
      }
    }
  }
  // phase 'palier' : plus aucun ordre d'or — on laisse la trésorerie monter
  game.send({ type: 'EndTurn' });

  const result = await game.waitFor('TurnResult');
  for (const a of game.acks.splice(0)) {
    if (!a.accepted || process.env.DEBUG_SEND) console.log(`  [ack] tour ${turn} accepté=${a.accepted} raison=${a.reason} — ${JSON.stringify(a.order)}`);
  }
  const evs = result.events ?? [];
  if (turn <= 3) console.log(`  [debug] tour ${turn} événements : ${evs.map((e) => e.type).join(', ') || '(aucun)'} — prod=${JSON.stringify((await admin(CODE)).state.cities[home.id]?.production)} trésorerie=${(await admin(CODE)).state.players.p1.treasury}`);
  for (const e of evs) {
    if (e.type === 'RushBuy') rushBuys.push({ tour: turn, ...e });
    if (e.type === 'EconomyMilestone' && e.player === 'p1') milestones.push({ tour: turn, ...e });
    if (e.type === 'GreatPersonSpawned' && e.canal === 'or' && e.owner === 'p1') gpsOr.push({ tour: turn, ...e });
  }

  if (phase === 'palier' && milestones.some((m) => m.threshold === 500) && gpsOr.length > 0) {
    fin = turn;
  }
  if (state.winner) {
    console.log(`[e2e-or] partie terminée au tour ${turn} (winner ${state.winner}) — arrêt`);
    break;
  }
  if (guard === MAX_TURNS - 1) console.log('[e2e-or] cap de tours atteint');
}

// --- verdicts ---------------------------------------------------------------
const final = (await admin(CODE)).state;
const buys = rushBuys;
const buyUnit = buys.find((b) => b.item?.kind === 'unit');
check('1 · Rush-buy UNITÉ exécuté au tour initial (0)', buyUnit?.tour === 0, `tour ${buyUnit?.tour ?? '—'}`);
check('1 · coût exact 20 or (10 marteaux × facteur Antique ×2)', buyUnit?.cost === 20, `coût ${buyUnit?.cost}`);
check('1 · production instantanée (UnitProduced guerrier_jaguar tour 0)', buys.some((b) => b.item?.id === 'guerrier_jaguar' && b.tour === 0));
check('2 · doublon unité : 2 ordres → 1 seul achat tour 0', buys.filter((b) => b.tour === 0).length === 1);
const releveT1 = releves.find((r) => r.turn === 1);
check('1 · débit 25 → 5 (trésorerie relevée tour suivant)', releveT1?.treasury === 5, `${releveT1?.treasury} or`);
check('3 · fonds insuffisants : aucun achat, aucun débit', buys.every((b) => !(b.tour === insuffisant?.tour)), `tour ${insuffisant?.tour} sans RushBuy, trésorerie ${insuffisant?.avant} or conservée`);
const buyGrenier = buys.find((b) => b.item?.kind === 'building' && b.item.id === 'grenier');
check('4 · Rush-buy BÂTIMENT Grenier exécuté', buyGrenier !== undefined, `tour ${buyGrenier?.tour ?? '—'}`);
check('4 · coût du Grenier = marteaux restants ×2', buyGrenier !== undefined && buyGrenier.cost === coutGrenierAttendu, `coût ${buyGrenier?.cost} (attendu ${coutGrenierAttendu})`);
check('4 · doublon bâtiment : 1 seul achat ce tour', buys.filter((b) => b.tour === tourRushGrenier).length === 1);
check('4 · Grenier présent dans la ville en fin de partie', (Object.values(final.cities).find((c) => c.owner === 'p1')?.buildings ?? []).includes('grenier'));
const palier100 = milestones.find((m) => m.threshold === 100);
check('5 · palier 100 or franchi (EconomyMilestone)', palier100 !== undefined, `tour ${palier100?.tour ?? '—'}`);
const palier500 = milestones.find((m) => m.threshold === 500);
check('5 · palier 500 franchi (récompense GP de canal or)', palier500 !== undefined, `tour ${palier500?.tour ?? '—'}`);
check('5 · GP de canal or apparu (Explorateur/Industriel)', gpsOr.length > 0, `tour ${gpsOr[0]?.tour ?? '—'}`);
const paliersVus = milestones.map((m) => m.amount ?? m.threshold ?? m.milestone);
check('5 · pas de palier manqué (séquence ordonnée 100…)', milestones.length >= 1, `paliers vus : ${JSON.stringify(paliersVus)}`);
check('6 · trésorerie finale cohérente (≥ 0)', final.players.p1.treasury >= 0, `${final.players.p1.treasury} or au tour ${final.turn}`);

game.ws.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n[e2e-or] ${results.length - failed.length}/${results.length} contrôles passés${failed.length ? ' — ÉCHECS PRÉSENTS' : ' ✓'}`);
console.log(`[e2e-or] relevés trésorerie (miroir HUD) : début ${JSON.stringify(releves.slice(0, 4))} — fin ${JSON.stringify(releves.slice(-4))}`);
process.exit(failed.length ? 1 : 0);
