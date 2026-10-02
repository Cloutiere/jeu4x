/**
 * SUR-OCCUPATION-POSE — e2e solo en vraie partie (wrangler local 8787 + Vite 5174).
 * Reproduit le scénario d'Erik du 02/10 en JEU LÉGAL :
 *   1. production d'un guerrier (occupante de la case de ville) ;
 *   2. production d'un colon → posé SUR la case occupée (arrivante flaguée,
 *      plus de blocage 20/20) ;
 *   3. fin de tour sans rien bouger → régularisation auto (ArrivanteRegularisee,
 *      colon relogé sur la première adjacente libre).
 * Captures → dev-logs/captures-sur-occupation/. Usage : node devtmp/sur-occupation-e2e.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-sur-occupation';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = 'dev-only-admin-token';
const NOM = 'ErikSurOcc1';

async function dump(code) {
  const res = await fetch(`${BASE}/admin/game/${code}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
  return (await res.json()).state;
}
const voisins = (q, r) => [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]];
const cle = (q, r) => `${q},${r}`;

for (const url of [`${BASE}/auth/dev?name=Sonde`, 'http://localhost:5174/']) {
  const r = await fetch(url, { redirect: 'manual' });
  if (!r.ok && r.status !== 302) throw new Error(`serveur absent : ${url}`);
}

// ------------------------------------------------------- partie + préparation
const rep = await fetch(`${BASE}/auth/dev?name=${NOM}&next=/`, { redirect: 'manual' });
const jeton = /session=([^;]+)/.exec(rep.headers.get('set-cookie') ?? '')[1];
const ws = new WebSocket(`ws://127.0.0.1:8787/ws/lobby?token=${jeton}`);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let code = null;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'GameCreated') code = m.code;
});
ws.send(JSON.stringify({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' } }));
while (!code) await sleep(300);
ws.close();
console.log('partie', code);

const g = new WebSocket(`ws://127.0.0.1:8787/ws/game/${code}?token=${jeton}`);
await new Promise((r, j) => { g.addEventListener('open', r); g.addEventListener('error', j); });
let tour = 0;
let dernierTourResult = null;
g.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'TurnResult') { tour = m.turn; dernierTourResult = m; }
});
const envoyer = (o) => g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: o }));
const finDeTour = async () => {
  const avant = tour;
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  let garde = 0;
  while (tour === avant && garde < 300) { await sleep(400); garde++; }
  if (garde >= 300) throw new Error('résolution WS trop lente');
  return dernierTourResult;
};

let st = await dump(code);
const ville = Object.values(st.cities).find((c) => c.owner === 'p1');
console.log(`capitale ${ville.id} en (${ville.q},${ville.r}) pop ${ville.pop}`);

// 1) Produire l'OCCUPANTE : un guerrier qui reste sur la case de ville.
let occupant = null;
for (let i = 0; i < 40 && !occupant; i++) {
  st = await dump(code);
  occupant = Object.values(st.units).find((u) => u.owner === 'p1' && u.q === ville.q && u.r === ville.r);
  if (occupant) break;
  envoyer({ type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } });
  await finDeTour();
}
if (!occupant) { console.log('ECHEC : occupante non produite en 40 tours'); process.exit(3); }
console.log(`occupante ${occupant.id} sur la case de ville (tour ${st.turn})`);

// 2) Produire le COLON — doit être posé SUR la case occupée (arrivante).
let arrivante = null;
for (let i = 0; i < 45 && !arrivante; i++) {
  st = await dump(code);
  const colonDeja = Object.values(st.units).find((u) => u.owner === 'p1' && u.type === 'colon');
  if (colonDeja) { arrivante = colonDeja; break; }
  if (st.cities[ville.id].production?.item?.id !== 'colon') {
    envoyer({ type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'colon' } });
  }
  const tr = await finDeTour();
  const prod = tr?.events?.find((e) => e.type === 'UnitProduced' && e.unitType === 'colon');
  if (prod) {
    st = await dump(code);
    arrivante = st.units[prod.unitId];
  }
}
if (!arrivante) { console.log('ECHEC : colon non produit en 45 tours'); process.exit(3); }
st = await dump(code);
const surCase = Object.values(st.units).filter((u) => u.q === ville.q && u.r === ville.r);
console.log(`colon ${arrivante.id} posé (tour ${st.turn}) — units sur la case ville: ${surCase.length}, arrivanteSurCase=${arrivante.arrivanteSurCase}`);
if (surCase.length !== 2 || arrivante.arrivanteSurCase !== true) {
  console.log('ECHEC : pose en sur-occupation non constatée', JSON.stringify(surCase.map((u) => ({ id: u.id, t: u.type, a: u.arrivanteSurCase }))));
  process.exit(3);
}

// --------------------------------------------------------------- navigateur
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5174/#/login', { waitUntil: 'domcontentloaded' });
await page.locator('input[placeholder="Alice"]').waitFor({ timeout: 15000 });
await page.fill('input[placeholder="Alice"]', NOM);
await page.click('button:has-text("Entrer")');
await page.waitForURL(/#\/lobby/, { timeout: 15000 });
await page.goto(`http://localhost:5174/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

const cadre = async (h) => {
  await page.evaluate((c) => window.__game.centerOn(c.q, c.r), h);
  await page.mouse.move(800, 450);
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await sleep(120); }
  await sleep(500);
};

// Capture 1 — la pile sur la case de ville (sur-occupation temporaire).
await cadre({ q: ville.q, r: ville.r });
await page.screenshot({ path: `${CAP}/1-colon-pose-sur-ville-occupee.png` });
console.log('capture 1 ok (pile sur la case de ville)');

// 3) Fin de tour SANS rien bouger → régularisation automatique.
const boutonFin = page.locator('button.fin-tour-rond').first();
await boutonFin.click();
await sleep(800);
const quandMeme = page.locator('button:has-text("Finir le tour quand même")');
if (await quandMeme.isVisible().catch(() => false)) await quandMeme.click();
for (let i = 0; i < 200; i++) {
  const pret = await page.evaluate(() => {
    const b = document.querySelector('button.fin-tour-rond');
    return !!b && !b.disabled;
  });
  if (pret) break;
  await sleep(400);
}
await sleep(1200); // laisser le playback finir

st = await dump(code);
const colon2 = st.units[arrivante.id];
const regOK = colon2 && (colon2.q !== ville.q || colon2.r !== ville.r) && colon2.arrivanteSurCase === undefined;
console.log(`régularisation — colon en (${colon2.q},${colon2.r}) flag=${colon2.arrivanteSurCase} → ${regOK ? 'OK' : 'ECHEC'}`);

// Capture 2 — le colon relogé sur l'adjacente libre.
await cadre({ q: colon2.q, r: colon2.r });
await page.screenshot({ path: `${CAP}/2-regularisation-colon-reloge.png` });
// Capture 3 — le journal du tour (ligne « relogée » visible à droite).
await page.screenshot({ path: `${CAP}/3-journal-regularisation.png` });

console.log(regOK ? 'E2E SUR-OCCUPATION : OK' : 'E2E SUR-OCCUPATION : ECHEC');
await nav.close();
process.exit(regOK ? 0 : 3);
