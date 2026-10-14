/**
 * ZONE-CULTURELLE-DEGRADE — pousse les tours d'une partie existante jusqu'à
 * la culture cible (palier 2), SANS polling admin (il sérialisait le DO et
 * ralentissait la résolution à l'extrême) : EndTurn → broadcast TurnResult
 * sur le ws seul ; sur timeout (freeze workerd connu ~10 tours), redémarrage
 * wrangler + rebranchage + renvoi. Usage :
 *   node devtmp/zonecult-tours.mjs <code> <jetonSession> [cultureCible=110]
 */
import { readFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:8787';
const code = process.argv[2];
const token = process.argv[3];
const CIBLE = Number(process.argv[4] ?? 110);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wsConnect() {
  const ws = new WebSocket(`ws://127.0.0.1:8787/ws/game/${code}?token=${encodeURIComponent(token)}`);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.type === (msg.type ?? null));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, ms = 90000) => new Promise((resolve, reject) => {
    const idx = pending.findIndex((m) => m.type === type);
    if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
    const t = setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
    waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
  const send = (msg) => ws.send(JSON.stringify({ proto: 1, ...msg }));
  return { ws, open: new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); }), waitFor, send };
}

async function redemarrerWrangler() {
  console.log('[wrangler] redémarrage');
  try { execSync('taskkill /F /IM workerd /T 2>nul', { shell: true }); } catch {}
  spawn('cmd', ['/c', 'npx', 'pnpm', '-C', 'apps/server', 'exec', 'wrangler', 'dev', '--port', '8787'], {
    cwd: 'C:/Users/Erik/ZCodeProject', detached: true, stdio: 'ignore',
  }).on('error', () => {}).unref();
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await fetch(`${BASE}/auth/dev?name=probe-tours-${i}&next=/`, { redirect: 'manual' });
      if (r.status === 302) { console.log('[wrangler] prêt'); return; }
    } catch {}
  }
  throw new Error('wrangler ne revient pas');
}

let jeu = wsConnect();
await jeu.open;
await jeu.waitFor('Welcome');
const culture = (tr) => Object.values(tr.state.cities).find((v) => v.owner === 'p1')?.cultureCumulee ?? 0;

let cult = 0, tour = 0;
// Ville p1 (du Snapshot initial) : on (re)pose une production GUERRIER avant
// chaque EndTurn — la « fin de tour bloquée — production » refusait sinon.
let villeId = null;
const snap0 = await jeu.waitFor('Snapshot', 20000).catch(() => null);
if (snap0) {
  const ville = Object.values(snap0.state.cities).find((v) => v.owner === 'p1');
  if (ville) { villeId = ville.id; tour = snap0.state.turn; cult = culture(snap0); }
}
for (let t = 0; t < 300 && cult < CIBLE; t++) {
  try {
    if (villeId) {
      jeu.send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: villeId, item: { kind: 'unit', id: 'guerrier' } } });
      await sleep(200);
    }
    jeu.send({ type: 'EndTurn' });
    const tr = await jeu.waitFor('TurnResult', 90000);
    cult = culture(tr);
    tour = tr.turn;
    console.log(`tour ${tour} culture ${cult}`);
  } catch {
    console.log(`[timeout] au tour ${tour}`);
    await redemarrerWrangler();
    try { jeu.ws.close(); } catch {}
    jeu = wsConnect();
    await jeu.open;
    await jeu.waitFor('Welcome');
    jeu.send({ type: 'EndTurn' });
    try {
      const tr = await jeu.waitFor('TurnResult', 90000);
      cult = culture(tr);
      tour = tr.turn;
      console.log(`tour ${tour} culture ${cult} (après redémarrage)`);
    } catch {}
  }
}
console.log(cult >= CIBLE ? `[fin] culture ${cult} au tour ${tour} — CIBLE ATTEINTE` : `[fin] culture ${cult} au tour ${tour} — CIBLE NON ATTEINTE`);
jeu.ws.close();
process.exit(cult >= CIBLE ? 0 : 1);
