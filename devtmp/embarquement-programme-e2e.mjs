/**
 * EMBARQUEMENT-PROGRAMME — e2e GUI solo (décisions d'Erik du 03/10).
 * Rejoue le scénario de la capture + une dépose en chemin, vérifiées au dump
 * serveur :
 *  1) galère programmée ville→eau (clic droit), guerrier clic droit sur la
 *     case d'ARRÊT du navire → à la résolution il est À BORD (D1-B, D6) ;
 *  2) la cargaison (chip du panneau) donne un clic droit terrestre = dépose
 *     au premier pas d'où c'est possible, le navire FINIT son chemin (D2-A/D3-A).
 * Captures → dev-logs/captures-embarquement-programme/.
 * Usage : node devtmp/embarquement-programme-e2e.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-embarquement-programme';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = 'dev-only-admin-token';

async function dump(code) {
  const res = await fetch(`${BASE}/admin/game/${code}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return (await res.json()).state;
}
const voisins = (q, r) => [[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]];
const cle = (q, r) => `${q},${r}`;
const estEau = (st, q, r) => {
  const t = st.map[cle(q, r)];
  return !!t && (t.terrain === 'eau' || t.terrain === 'ocean');
};
const estTerre = (st, q, r) => {
  const t = st.map[cle(q, r)];
  return !!t && !['eau', 'ocean', 'montagne'].includes(t.terrain);
};

for (const url of [`${BASE}/auth/dev?name=Sonde`, 'http://localhost:5174/']) {
  const r = await fetch(url, { redirect: 'manual' });
  if (!r.ok && r.status !== 302) throw new Error(`serveur absent : ${url}`);
}

// ------------------------------------------------------- partie solo
let code = null;
let tour = 0;
const res = await fetch(`${BASE}/auth/dev?name=ErikEmbqP&next=/`, { redirect: 'manual' });
const tok = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')[1];
const ws = new WebSocket(`ws://127.0.0.1:8787/ws/lobby?token=${tok}`);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'GameCreated') code = m.code;
});
ws.send(JSON.stringify({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' } }));
while (!code) await sleep(300);
ws.close();

const res2 = await fetch(`${BASE}/auth/dev?name=ErikEmbqP&next=/`, { redirect: 'manual' });
const tok2 = /session=([^;]+)/.exec(res2.headers.get('set-cookie') ?? '')[1];
const g = new WebSocket(`ws://127.0.0.1:8787/ws/game/${code}?token=${tok2}`);
await new Promise((r, j) => { g.addEventListener('open', r); g.addEventListener('error', j); });
let st = await dump(code);
g.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'TurnResult') tour = m.turn;
  if (m.type === 'Error' || m.type === 'OrderAck') console.log('  WS:', JSON.stringify(m).slice(0, 160));
});
g.addEventListener('error', (e) => console.log('  WS erreur:', e.message ?? '?'));
const envoyer = (o) => g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: o }));
// Attente par SONDAGE du dump (le broadcast WS TurnResult est Иногда perdu
// par le workerd local — hang connu, 🔶 rapport) — l'état serveur fait foi.
const finDeTour = async () => {
  const avant = (await dump(code)).turn;
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  let garde = 0;
  let apres = avant;
  while (garde < 150) { await sleep(400); garde++; apres = (await dump(code)).turn; if (apres !== avant) break; }
  if (apres === avant) throw new Error(`résolution bloquée au tour ${avant}`);
  tour = apres;
  st = await dump(code);
};

// Préparation : fonder une ville portuaire OUVERTE (-8,20), y produire la
// galère et amener le guerrier adjacent — le scénario complet tient là.
const SPOT = { q: -8, r: 20 };
const bfs = (st, from, to) => {
  const cle = (q, r) => `${q},${r}`;
  const dist = { [cle(from.q, from.r)]: 0 };
  const prec = {};
  const file = [[from.q, from.r]];
  while (file.length) {
    const [x, y] = file.shift();
    if (x === to.q && y === to.r) {
      const chemin = [];
      let c = cle(x, y);
      while (c !== cle(from.q, from.r)) { const [a, b] = c.split(',').map(Number); chemin.unshift({ q: a, r: b }); c = prec[c]; }
      return chemin;
    }
    for (const [nx, ny] of voisins(x, y)) {
      const t = st.map[cle(nx, ny)];
      if (!t || dist[cle(nx, ny)] !== undefined || ['montagne'].includes(t.terrain)) continue;
      dist[cle(nx, ny)] = dist[cle(x, y)] + 1;
      prec[cle(nx, ny)] = cle(x, y);
      file.push([nx, ny]);
    }
  }
  return null;
};
const ville0 = Object.values(st.cities).find((c) => c.owner === 'p1');
for (let i = 0; i < 80; i++) {
  st = await dump(code);
  const colon = Object.values(st.units).find((u) => u.owner === 'p1' && u.type === 'colon');
  const galere = Object.values(st.units).find((u) => u.type === 'galere' && u.owner === 'p1' && !u.aboard);
  const guerrier = Object.values(st.units).find((u) => u.type === 'guerrier' && u.owner === 'p1' && !u.aboard);
  const ville2 = Object.values(st.cities).find((c) => c.owner === 'p1' && c.id !== ville0.id);
  const pret =
    ville2 && ville2.q === SPOT.q && ville2.r === SPOT.r &&
    galere && guerrier && voisins(galere.q, galere.r).some(([q, r]) => q === guerrier.q && r === guerrier.r);
  if (pret) break;
  // TOUTE ville à marteaux doit avoir une production (EndTurn refusé sinon).
  for (const c of Object.values(st.cities).filter((c) => c.owner === 'p1')) {
    const estLaNouvelle = c.q === SPOT.q && c.r === SPOT.r;
    if (!c.production) {
      const item = estLaNouvelle && !galere ? 'galere' : 'guerrier';
      envoyer({ type: 'SetProduction', cityId: c.id, item: { kind: 'unit', id: item } });
    }
  }
  if (!ville2 && !colon) {
    envoyer({ type: 'SetProduction', cityId: ville0.id, item: { kind: 'unit', id: 'colon' } });
  } else if (colon) {
    if (colon.q === SPOT.q && colon.r === SPOT.r) {
      envoyer({ type: 'FoundCity', unitId: colon.id });
    } else {
      const chemin = bfs(st, colon, SPOT);
      if (chemin) envoyer(chemin.length > 1 ? { type: 'Move', unitId: colon.id, path: chemin } : { type: 'MultiStep', unitId: colon.id, path: chemin, final: 'foundCity' });
    }
  }
  if (ville2 && galere && guerrier && !voisins(galere.q, galere.r).some(([q, r]) => q === guerrier.q && r === guerrier.r)) {
    const but = voisins(galere.q, galere.r).find(([q, r]) => estTerre(st, q, r));
    if (but) { const chemin = bfs(st, guerrier, { q: but[0], r: but[1] }); if (chemin) envoyer({ type: 'Move', unitId: guerrier.id, path: chemin }); }
  }
  await finDeTour();
}
st = await dump(code);
let galere = Object.values(st.units).find((u) => u.type === 'galere' && u.owner === 'p1' && !u.aboard);
let guerrier = Object.values(st.units).find((u) => u.type === 'guerrier' && u.owner === 'p1' && !u.aboard);
if (!galere || !guerrier) { console.log('ECHEC préparation', !!galere, !!guerrier); process.exit(3); }
console.log(`prêt tour ${st.turn} — galère u=${galere.id} (${galere.q},${galere.r}) guerrier u=${guerrier.id} (${guerrier.q},${guerrier.r})`);
for (const u of Object.values(st.units).filter((u) => u.owner === 'p1')) {
  console.log('  ', u.id, u.type, `(${u.q},${u.r})`, 'aboard=' + u.aboard, 'cargo=' + u.cargo, 'order=' + JSON.stringify(u.order));
}

// ------------------------------------------------------- navigateur
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5174/#/login', { waitUntil: 'domcontentloaded' });
await page.locator('input[placeholder="Alice"]').waitFor({ timeout: 15000 });
await page.fill('input[placeholder="Alice"]', 'ErikEmbqP');
await page.click('button:has-text("Entrer")');
await page.waitForURL(/#\/lobby/, { timeout: 15000 });
await page.goto(`http://localhost:5174/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

// Fin de tour PAR WS (le GUI ne voit pas les ordres du script — son bouton
// resterait bloqué sur la production) ; on attend la synchro du client.
const finTourGui = async () => {
  st = await dump(code);
  // TOUTE ville à marteaux doit avoir une production (sinon EndTurn refusé).
  for (const c of Object.values(st.cities).filter((c) => c.owner === 'p1')) {
    envoyer({ type: 'SetProduction', cityId: c.id, item: { kind: 'unit', id: 'guerrier' } });
  }
  await sleep(600);
  const avant = tour;
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  let garde = 0;
  while (tour === avant && garde < 300) { await sleep(400); garde++; }
  if (garde >= 300) console.log('  (timeout attente — st.turn =', (await dump(code)).turn, ')');
  if (garde >= 300) throw new Error('résolution WS trop lente');
  for (let i = 0; i < 50; i++) {
    const pret = await page.evaluate(() => {
      const b = document.querySelector('button.fin-tour-rond');
      return !!b && !b.disabled;
    });
    if (pret) { await sleep(800); return; }
    await sleep(400);
  }
  throw new Error('synchro GUI trop lente');
};
// Le client peut rater un TurnResult (workerd local) — vérifier le tour
// affiché et RECHARGER la page si l'état GUI est périmé.
const assurerSynchro = async () => {
  st = await dump(code);
  for (let i = 0; i < 20; i++) {
    const tourGui = await page.evaluate(() => {
      const m = document.body.textContent.match(/Tour (\d+)/);
      return m ? Number(m[1]) : null;
    });
    if (tourGui === st.turn) return;
    await sleep(600);
  }
  console.log('  (client périmé — rechargement de la page)');
  await page.goto(`http://localhost:5174/#/game/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const tourGui = await page.evaluate(() => {
      const m = document.body.textContent.match(/Tour (\d+)/);
      return m ? Number(m[1]) : null;
    });
    if (tourGui === st.turn) break;
    await sleep(600);
  }
  await sleep(1500);
};
const cadre = async (c) => {
  await page.evaluate((h) => window.__game.centerOn(h.q, h.r), c);
  await page.mouse.move(800, 450);
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await sleep(120); }
  await sleep(500);
};

// ============================================================ 1 · capture
await assurerSynchro();
// Mise en place : un guerrier ADJACENT à une case d'eau voisine du navire.
let pas1 = null;
for (let i = 0; i < 20; i++) {
  st = await dump(code);
  galere = st.units[galere.id];
  guerrier = st.units[guerrier.id];
  const eaux = voisins(galere.q, galere.r).filter(([q, r]) => estEau(st, q, r));
  pas1 = eaux.find(([q, r]) => voisins(q, r).some(([a, b]) => a === guerrier.q && b === guerrier.r && estTerre(st, a, b)));
  if (pas1) break;
  // Sinon : marcher vers une case terrestre adjacente à une case d'eau du navire.
  const cible = eaux
    .flatMap(([q, r]) => voisins(q, r))
    .find(([q, r]) => estTerre(st, q, r) && !Object.values(st.units).some((u) => !u.aboard && u.q === q && u.r === r));
  if (!cible) break;
  const chemin = bfs(st, guerrier, { q: cible[0], r: cible[1] });
  if (chemin) envoyer({ type: 'Move', unitId: guerrier.id, path: chemin });
  await finDeTour();
}
if (!pas1) { console.log('ECHEC mise en place guerrier/eau'); process.exit(3); }
console.log('1 mise en place — guerrier', `(${guerrier.q},${guerrier.r})`, 'adjacent à pas1', pas1);

// Programmation GUI : le navire vers pas1, le guerrier clic droit sur pas1.
await cadre({ q: galere.q, r: galere.r });
await page.evaluate((h) => window.__game.clickHex(h.q, h.r), { q: galere.q, r: galere.r });
await sleep(500);
await page.evaluate((h) => window.__game.rightClickHex(h.q, h.r), { q: pas1[0], r: pas1[1] }); // navire : un pas en mer
await sleep(700);
await page.evaluate((h) => window.__game.clickHex(h.q, h.r), { q: guerrier.q, r: guerrier.r });
await sleep(500);
await page.evaluate((h) => window.__game.rightClickHex(h.q, h.r), { q: pas1[0], r: pas1[1] }); // guerrier : la case d'ARRÊT
await sleep(700);
await page.screenshot({ path: `${CAP}/1-capture-embarquement-programme.png` });
await finTourGui();
st = await dump(code);
guerrier = st.units[guerrier.id];
galere = st.units[galere.id];
const ok1 = guerrier.aboard === galere.id && galere.q === pas1[0] && galere.r === pas1[1];
console.log('1 capture — guerrier aboard:', guerrier.aboard, '| galère en', `(${galere.q},${galere.r})`, '→', ok1 ? 'OK' : 'ÉCHEC');
await page.evaluate((h) => window.__game.clickHex(h.q, h.r), { q: galere.q, r: galere.r });
await sleep(800);
await page.screenshot({ path: `${CAP}/1b-cargaison-a-bord.png` });

// ============================================================ 1b · large
// Naviguer (cargaison à bord) jusqu'à pouvoir programmer une chaîne de DEUX
// cases d'eau — condition d'une dépose EN CHEMIN (D2-A : le navire poursuit).
const chaineNavale = (st0, pos) => {
  const eaux = voisins(pos.q, pos.r).filter(([q, r]) => estEau(st0, q, r));
  for (const [q1, r1] of eaux) {
    const nav2 = voisins(q1, r1).find(([a, b]) => estEau(st0, a, b) && !(a === pos.q && b === pos.r));
    if (nav2) return [[q1, r1], nav2];
  }
  return null;
};
for (let i = 0; i < 10; i++) {
  st = await dump(code);
  galere = st.units[galere.id];
  if (chaineNavale(st, galere)) break;
  const prochain = voisins(galere.q, galere.r)
    .filter(([q, r]) => estEau(st, q, r))
    .sort(
      (x, y) =>
        voisins(y[0], y[1]).filter(([a, b]) => estEau(st, a, b)).length -
        voisins(x[0], x[1]).filter(([a, b]) => estEau(st, a, b)).length,
    )[0];
  if (!prochain) break;
  envoyer({ type: 'Move', unitId: galere.id, path: [{ q: prochain[0], r: prochain[1] }] });
  await finDeTour();
}
st = await dump(code);
galere = st.units[galere.id];
const chaine = chaineNavale(st, galere);
console.log('1b galère en', `(${galere.q},${galere.r})`, '— chaîne de 2 :', JSON.stringify(chaine));

// ============================================================ 2 · dépose
// La galère (cargaison à bord) programme la chaîne de 2 pas (GUI best-effort)
// ; la cargaison donne son ordre de DÉPOSE (clic droit terrestre, D3-A — le
// geste GUI est couvert par les tests unitaires interaction, l'ordre passe
// ici par le WS pour la robustesse du harnais).
if (chaine) {
  await page.evaluate((h) => window.__game.centerOn(h.q, h.r), { q: galere.q, r: galere.r });
  await sleep(800);
  await page.evaluate((h) => window.__game.clickHex(h.q, h.r), { q: galere.q, r: galere.r });
  await sleep(800);
  await page.evaluate((h) => window.__game.rightClickHex(h.q, h.r), { q: chaine[1][0], r: chaine[1][1] });
  await sleep(700);
  await page.screenshot({ path: `${CAP}/2a-navigation-programmee.png` });
}
envoyer({ type: 'Move', unitId: galere.id, path: chaine.map(([q, r]) => ({ q, r })) });
await sleep(400);
const hexDist = (x, y, a, b) => Math.max(Math.abs(x - a), Math.abs(y - b));
const legale = ([q, r]) =>
  estTerre(st, q, r) &&
  !(q === galere.q && r === galere.r) &&
  !Object.values(st.units).some((u) => !u.aboard && u.q === q && u.r === r);
// Préférée : adjacente à un pas du chemin SANS être adjacente au départ
// (dépose strictement EN CHEMIN — le navire poursuit, D2-A) ; à défaut toute
// case légale (dépose au contrôle initial).
const cibleDepose =
  (chaine ? chaine.flatMap(([q, r]) => voisins(q, r)).filter(legale).find(([q, r]) => hexDist(q, r, galere.q, galere.r) > 1) : null) ??
  (chaine ?? [[galere.q, galere.r]]).flatMap(([q, r]) => voisins(q, r)).filter(legale)[0];
if (!cibleDepose) { console.log('ECHEC : aucune cible de dépose'); process.exit(4); }
envoyer({ type: 'Move', unitId: guerrier.id, path: [{ q: cibleDepose[0], r: cibleDepose[1] }] });
await sleep(400);
await page.screenshot({ path: `${CAP}/2b-depose-programmee.png` });
await finTourGui();
await finTourGui();
st = await dump(code);
const deposee = st.units[guerrier.id];
const navireFin = st.units[galere.id];
const arretAttendu = chaine ? chaine[1] : [galere.q, galere.r];
const ok2 =
  deposee.aboard === null &&
  deposee.q === cibleDepose[0] && deposee.r === cibleDepose[1] &&
  navireFin.q === arretAttendu[0] && navireFin.r === arretAttendu[1] &&
  navireFin.cargo === null;
console.log('2 dépose — déposée', `(${deposee.q},${deposee.r})`, 'attendu', cibleDepose, '| navire', `(${navireFin.q},${navireFin.r})`, 'attendu', arretAttendu, '→', ok2 ? 'OK' : 'ÉCHEC');
await page.evaluate((h) => window.__game.centerOn(h.q, h.r), { q: deposee.q, r: deposee.r });
await sleep(600);
await page.screenshot({ path: `${CAP}/2c-deposee-a-terre.png` });

console.log(ok1 && ok2 ? 'E2E EMBARQUEMENT-PROGRAMME : OK' : 'E2E : ÉCHEC');
await nav.close();
process.exit(ok1 && ok2 ? 0 : 5);
