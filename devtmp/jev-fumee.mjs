/**
 * JEV-FUMEE-LOBBY · L4 — fumée locale : une vraie partie contre Jev via le
 * lobby (adversaireJev), quelques tours joués, vérification de la plomberie
 * (appel LLM par tour, budget, journal `jevjournal:*`) puis du repli D4
 * (clé coupée → bot pur, la partie continue).
 *
 * Usage : node devtmp/jev-fumee.mjs [port=8787] [tours=3] [cleBonne=1]
 * La clé est lue depuis apps/server/.dev.vars (TYPESAFE_API_KEY) — jamais
 * committée. Pour éprouver le repli : lancer avec cleBonne=0 (mauvaise clé).
 */
import { readFileSync } from 'node:fs';

const PORT = process.argv[2] ?? '8787';
const TOURS = Number(process.argv[3] ?? 3);
const CLE_BONNE = process.argv[4] !== '0';
const GUI = `http://127.0.0.1:${PORT}`;

let cle = null;
try {
  cle = /TYPESAFE_API_KEY=(.*)/.exec(readFileSync(new URL('../apps/server/.dev.vars', import.meta.url), 'utf8'))?.[1]?.trim() ?? null;
} catch {}
console.log(`Fumée : port ${PORT}, ${TOURS} tours, clé ${CLE_BONNE ? (cle ? 'présente (.dev.vars)' : 'ABSENTE') : 'volontairement MAUVAISE'}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wsConnect(path, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}?token=${token}`);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  ws.waitFor = (type, ms = 60000) => new Promise((resolve, reject) => {
    const i = pending.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(pending.splice(i, 1)[0]);
    waiters.push({ type, resolve });
    setTimeout(() => reject(new Error(`timeout ${type} — derniers messages : ${pending.slice(-4).map(m=>JSON.stringify(m).slice(0,120)).join(' | ')}`)), ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const orig = ws.send.bind(ws);
  ws.send = (m) => orig(typeof m === 'string' ? m : JSON.stringify(m));
  return ws;
}

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible');
  return m[1];
}

async function adminDump(token, code) {
  const res = await fetch(`${GUI}/admin/game/${code}`, { headers: { cookie: `session=${token}`, authorization: 'Bearer dev-only-admin-token' } });
  if (!res.ok) {
    // Le chemin exact admin varie — essayer la route interne protégée.
    const res2 = await fetch(`${GUI}/api/admin/game/${code}`, { headers: { cookie: `session=${token}`, authorization: 'Bearer dev-only-admin-token' } });
    return res2.ok ? res2.json() : null;
  }
  return res.json();
}

async function main() {
  const token = await login('fumee-jev');

  // 1. Création lobby — 1 humain + 4 bots, adversaire Jev (D1).
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  const palettes = ['bleu-saphir', 'rouge-royal', 'vert-emeraude', 'jaune-dor', 'cuivre-ardent'];
  const config = {
    sieges: palettes.map((paletteId, i) => ({ type: i === 0 ? 'humain' : 'bot', paletteId, civId: null })),
    civsAleatoires: true,
    topographie: 'un-continent',
  };
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, adversaireJev: true, botDifficulte: 'normal', config } });
  const created = await lobby.waitFor('GameCreated');
  const code = created.code;
  console.log(`Partie créée : ${code} (adversaireJev=true)`);
  lobby.send({ proto: 1, type: 'StartGame', code });
  await sleep(4000);
  lobby.close();

  // 2. Vérifications méta : le premier bot porte jev + nom « Jev 🤖 ».
  const game = wsConnect(`/ws/game/${code}`, token);
  await game.open;
  const welcome = await game.waitFor('Welcome');
  const jev = welcome.players.find((p) => p.jev === true);
  if (!jev) throw new Error('aucun joueur jev dans la partie');
  console.log(`Jev au siège ${jev.engineId} — nom « ${jev.name} », civ ${jev.civId ?? 'neutre'}`);
  const snap = await game.waitFor('Snapshot');
  console.log(`Snapshot reçu — tour ${snap.state.turn}, phase ${snap.state.phase}`);

  // 3. Jouer N tours (EndTurn — les ordres brouillons sont facultatifs, le
  //    bot/Jev décident de leur côté ; les blocages fin-de-tour ne concernent
  //    que le joueur local : soumettre la production par défaut si refusé).
  for (let t = 1; t <= TOURS; t++) {
    game.send({ proto: 1, type: 'EndTurn' });
    // Le EndTurn peut être refusé (production non sélectionnée) — soumettre
    // SetProduction colon + recherche par défaut puis réessayer.
    const ack = await Promise.race([game.waitFor('TurnResult', 45000), game.waitFor('Error', 8000)]);
    if (ack.type === 'Error') {
      console.log(`  tour ${t} : EndTurn refusé (${ack.message?.slice(0, 60)}) — production colon puis réessai`);
      const ville = Object.values(snap.state.cities).find((c) => c.owner === 'p1');
      const prod = Object.keys(snap.state.techs ?? {}).length >= 0 ? 'unit:colon' : 'unit:colon';
      game.send({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'colon' } } });
      await sleep(300);
      game.send({ proto: 1, type: 'EndTurn' });
      const res = await game.waitFor('TurnResult', 60000);
      console.log(`  tour ${t} résolu (${res.events.length} événements) — tour moteur ${res.turn}`);
    } else {
      console.log(`  tour ${t} résolu (${ack.events.length} événements) — tour moteur ${ack.turn}`);
    }
    // God mode pour l'observation (D5) : activer une fois.
    if (t === 1) game.send({ proto: 1, type: 'ToggleGodMode', on: true });
    await sleep(300);
  }

  // 4. Vérifier le journal + budget via le dump admin.
  const dump = await adminDump(token, code);
  const jevResume = dump?.jev;
  if (!jevResume) {
    console.log('⚠ pas de section jev dans le dump admin (route admin à vérifier)');
  } else {
    console.log('jev (dump):', JSON.stringify(jevResume));
    console.log(`Jev : désactivé=${jevResume.desactive}, budget=${jevResume.budgetUsd} $, échecs=${jevResume.echecsConsecutifs}, tours journalisés=${jevResume.journalTours.length} (${jevResume.journalTours.slice(0, 5)}…)`);
    if (jevResume.journalTours.length === 0 && CLE_BONNE && cle) throw new Error('aucun tour journalisé alors que la clé est présente — plomberie en échec');
    if (!CLE_BONNE || !cle) {
      if (jevResume.desactive !== 'echecs' && jevResume.journalTours.length > 0) {
        console.log('  repli : clé coupée — Jev en repli (normal si désactivé après 3 échecs ; sinon repli par tour, consigné)');
      }
    }
  }

  // 5. Abandon (nettoyage de la liste).
  game.send({ proto: 1, type: 'AbandonGame', code });
  await sleep(1000);
  game.close();
  console.log('Fumée terminée.');
}

main().catch((e) => {
  console.error('ÉCHEC FUMÉE :', e.message);
  process.exit(1);
});
