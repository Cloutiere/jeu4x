/**
 * CULTURE-RESSOURCES — préparation e2e : partie solo RÉELLE (wrangler local).
 * Chasse de seed : Rites funéraires en légal (conversion science), puis
 * recherche d'une case ENCENS à dist ≤ 2 de la capitale (identités révélées
 * par la tech) → pop 2 → encens TRAVAILLÉ → delta cultureCumulee vs baseline
 * palais mesuré sur 2 tours au dump serveur (attendu baseline + 2).
 * Usage : node devtmp/culture-prep.mjs
 * PRET code=... tour=... ville=cN (q,r) encens=q,r baseline=+N avecEncens=+N+2
 * NON_PRET_SEED (relancer = seed suivante) / NON_PRET_POP.
 */
const BASE = 'http://127.0.0.1:8787';
let essai = 0;
const MAPPE = 'pangee-40';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ouvrir(url) {
  const ws = new WebSocket(url);
  const file = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].res(m); waiters.splice(i, 1); break; }
    }
    file.push(m);
  });
  ws.ready = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'Error') console.log('  [erreur serveur]', JSON.stringify(m).slice(0, 200));
  });
  ws.attendre = (pred, ms = 30000) => {
    const idx = file.findIndex(pred);
    if (idx >= 0) return Promise.resolve(file.splice(idx, 1)[0]);
    return new Promise((res, rej) => {
      waiters.push({ pred, res });
      setTimeout(() => rej(new Error('timeout attente message')), ms);
    });
  };
  return ws;
}

const rep = await fetch(`${BASE}/auth/dev?name=ErikCult${++essai}&next=/`, { redirect: 'manual' });
const jeton = /session=([^;]+)/.exec(rep.headers.get('set-cookie') ?? '')[1];

async function creerPartie() {
  const lobby = ouvrir(`ws://127.0.0.1:8787/ws/lobby?token=${jeton}`);
  await lobby.ready;
  lobby.send(JSON.stringify({ proto: 1, type: 'CreateGame', settings: { mapId: MAPPE, turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' } }));
  const created = await lobby.attendre((m) => m.type === 'GameCreated', 45000);
  lobby.close();
  const g = ouvrir(`ws://127.0.0.1:8787/ws/game/${created.code}?token=${jeton}`);
  await g.ready;
  const snap = await g.attendre((m) => m.type === 'Snapshot', 45000);
  return { g, code: created.code, snap };
}

const dist = (q1, r1, q2, r2) => {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
const qR = (k) => k.split(',').map(Number);

let g = null, code = null, snap = null, moi = null, ville = null;
let tour = 1, snapCourant = null;
const etat = () => snapCourant.state;

async function finDeTour() {
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  const tr = await g.attendre((m) => m.type === 'TurnResult', 45000);
  console.log('  tour', tr.turn, 'pop', Object.values(tr.state.cities)[0]?.pop);
  tour = tr.turn;
  snapCourant = tr;
}
function produire() {
  for (const c of Object.values(etat().cities)) {
    if (c.owner === moi && (!c.production || c.production.item?.id !== 'guerrier')) {
      g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: c.id, item: { kind: 'unit', id: 'guerrier' } } }));
    }
  }
}
function convertirTout(target) {
  for (const c of Object.values(etat().cities)) {
    if (c.owner === moi && c.conversion !== target) {
      g.send(JSON.stringify({ proto: 1, type: 'SetConversion', cityId: c.id, target }));
    }
  }
}

for (let essai = 1; essai <= 8; essai++) {
  ({ g, code, snap } = await creerPartie());
  await sleep(300);
  moi = Object.entries(snap.state.players).find(([, p]) => !p.bot)?.[0] ?? null;
  ville = Object.values(snap.state.cities).find((c) => c.owner === moi);
  tour = snap.turn ?? 1;
  snapCourant = snap;
  console.log(`seed ${essai} code=${code} ville=(${ville.q},${ville.r})`);

  // Rites funéraires (conversion science), max 30 tours.
  g.send(JSON.stringify({ proto: 1, type: 'SetResearch', techId: 'rites_funeraires' }));
  let garde = 0;
  convertirTout('science');
  while (!etat().players[moi].techsUnlocked.includes('rites_funeraires') && garde++ < 30) {
    produire();
    convertirTout('science');
    await finDeTour();
  }
  if (!etat().players[moi].techsUnlocked.includes('rites_funeraires')) {
    console.log('  rites non atteintes — seed suivante');
  } else {
    const encens = Object.entries(etat().map).find(
      ([k, t]) => t.resource === 'encens' && dist(ville.q, ville.r, ...qR(k)) <= 2,
    );
    if (!encens) {
      console.log('  aucun encens à dist ≤ 2 — seed suivante');
    } else {
      await pousuite(encens[0]);
      process.exit(0);
    }
  }
  g.send(JSON.stringify({ proto: 1, type: 'AbandonGame', code }));
  g.close();
  await sleep(800);
}
console.log('NON_PRET_SEED — 8 seeds sans encens à portée');
process.exit(2);

// --- Suite de la mission sur la seed retenue -------------------------------
async function pousuite(encens) {
  console.log(`encens trouvé en ${encens}`);

  // Baseline culture/tour (palais seul), 2 tours SANS encens travaillé.
  const cumul0 = etat().cities[ville.id].cultureCumulee;
  produire();
  await finDeTour();
  await finDeTour();
  const baseline = etat().cities[ville.id].cultureCumulee - cumul0;
  console.log(`baseline culture/tour : +${baseline}`);

  // Pop 2 (conversion or = nourriture d'abord — défaut moteur).
  let garde = 0;
  while ((etat().cities[ville.id].pop ?? 1) < 2 && garde++ < 30) {
    produire();
    convertirTout('gold');
    await finDeTour();
  }
  const v2 = etat().cities[ville.id];
  if ((v2.pop ?? 1) < 2) { console.log('NON_PRET_POP — pop 2 non atteinte'); process.exit(4); }
  console.log(`tour ${tour} — pop ${v2.pop}, workedTiles ${JSON.stringify(v2.workedTiles)}`);

  // Travailler l'encens + delta sur 2 tours.
  if (!v2.workedTiles.includes(encens)) {
    g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'SetWorkedTile', cityId: ville.id, tile: encens } }));
  }
  await finDeTour();
  produire();
  const cumulA = etat().cities[ville.id].cultureCumulee;
  await finDeTour();
  const avecEncens = etat().cities[ville.id].cultureCumulee - cumulA;
  const encore = etat().cities[ville.id].workedTiles.includes(encens);
  console.log(`culture/tour encens travaillé : +${avecEncens} (attendu +${baseline + 2}) travaillé=${encore}`);
  if (!encore) { console.log('ENCENS_PERDU_DES_TRAVAILLEES'); process.exit(6); }
  if (avecEncens !== baseline + 2) { console.log('ECART_INATTENDU'); process.exit(5); }
  console.log(`PRET code=${code} tour=${tour} ville=${ville.id} (${ville.q},${ville.r}) encens=${encens} baseline=+${baseline} avecEncens=+${avecEncens}`);
}
