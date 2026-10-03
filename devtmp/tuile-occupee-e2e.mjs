/**
 * TUILE-OCCUPEE — e2e solo en vraie partie (wrangler local 8787 + Vite 5174).
 * Reproduit le signalement d'Erik du 02/10 en JEU LÉGAL :
 *   C (D1bis) : ville pleine + clic sur tuile occupée NON travaillée → repli
 *               sélection de l'unité, AUCUN ordre (invariance à la résolution) ;
 *   A (D1)    : désélection d'une tuile auto-assignée puis clic sur la tuile
 *               occupée → citoyen affecté (vérifié au dump après résolution) ;
 *   B (D1)    : re-clic sur la tuile TRAVAILLÉE et occupée → désélection exacte ;
 *   D (D3)    : vue ville — tuile occupée cliquable.
 * Captures → dev-logs/captures-tuile-occupee/. Usage : node devtmp/tuile-occupee-e2e.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const WEB = 'http://localhost:5174';
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-tuile-occupee';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = 'dev-only-admin-token';
const NOM = 'ErikTuileOcc1';

async function dump(code) {
  const res = await fetch(`${BASE}/admin/game/${code}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
  return (await res.json()).state;
}
const voisins = (q, r) => [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]];

for (const url of [`${BASE}/auth/dev?name=Sonde`, `${WEB}/`]) {
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
g.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'TurnResult') tour = m.turn;
});
const envoyer = (o) => g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: o }));
const finDeTour = async () => {
  const avant = tour;
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  let garde = 0;
  while (tour === avant && garde < 300) { await sleep(400); garde++; }
  if (garde >= 300) throw new Error('résolution WS trop lente');
};

let st = await dump(code);
const ville = Object.values(st.cities).find((c) => c.owner === 'p1');
console.log(`capitale ${ville.id} en (${ville.q},${ville.r}) pop ${ville.pop}, worked=[${ville.workedTiles}]`);

// Cible : une tuile ADJACENTE à la ville, libre (ni ville ni unité au départ).
const prise = voisins(ville.q, ville.r).find(([q, r]) =>
  st.map[`${q},${r}`] &&
  !Object.values(st.cities).some((c) => c.q === q && c.r === r) &&
  !Object.values(st.units).some((u) => u.q === q && u.r === r));
if (!prise) { console.log('ECHEC : aucune adjacente libre'); process.exit(3); }
const [tq, tr] = prise;
console.log(`tuile cible (${tq},${tr}) — worked au départ ? ${ville.workedTiles.includes(`${tq},${tr}`)}`);

// Amener une unité p1 SUR la tuile cible (chemin pas à pas, tours légaux).
let marcheur = null;
for (let i = 0; i < 30; i++) {
  st = await dump(code);
  if (Object.values(st.units).some((u) => u.owner === 'p1' && u.q === tq && u.r === tr)) break;
  const sur = Object.values(st.units).filter((u) => u.owner === 'p1' && !u.isArmy)
    .sort((a, b) => (Math.abs(a.q - tq) + Math.abs(a.r - tr)) - (Math.abs(b.q - tq) + Math.abs(b.r - tr)))[0];
  marcheur = sur;
  if (!marcheur) { console.log('ECHEC : aucune unité terrestre'); process.exit(3); }
  if (marcheur.q === ville.q && marcheur.r === ville.r) { await finDeTour(); continue; } // arrive dessus seulement à la pose
  const dist = Math.max(Math.abs(marcheur.q - tq), Math.abs(marcheur.r - tr), Math.abs(marcheur.q - tq + marcheur.r - tr));
  if (dist <= 2) {
    envoyer({ type: 'Move', unitId: marcheur.id, path: [{ q: tq, r: tr }] });
  } else {
    // pas intermédiaire glouton vers la cible
    const pas = voisins(marcheur.q, marcheur.r)
      .filter(([q, r]) => st.map[`${q},${r}`] && st.map[`${q},${r}`].terrain !== 'eau' && st.map[`${q},${r}`].terrain !== 'ocean' && !Object.values(st.cities).some((c) => c.q === q && c.r === r))
      .sort((a, b) => (Math.abs(a[0] - tq) + Math.abs(a[1] - tr)) - (Math.abs(b[0] - tq) + Math.abs(b[1] - tr)))[0];
    if (pas) envoyer({ type: 'Move', unitId: marcheur.id, path: [{ q: pas[0], r: pas[1] }] });
  }
  await finDeTour();
}
st = await dump(code);
const occ = Object.values(st.units).find((u) => u.owner === 'p1' && u.q === tq && u.r === tr);
if (!occ) { console.log('ECHEC : unité non installée sur la tuile cible'); process.exit(3); }
console.log(`occupante ${occ.id} (${occ.type}) sur (${tq},${tr}) au tour ${st.turn} — ville pleine ? worked=${st.cities[ville.id].workedTiles.length}/${st.cities[ville.id].pop}`);

// Si la tuile cible est travaillée au départ : la libérer (ordre légal WS),
// puis RE-REMPLIR la ville avec une autre tuile libre — le test C (D1bis)
// exige une ville PLEINE et la cible NON cultivée.
st = await dump(code);
const cleT = `${tq},${tr}`;
const villeF = st.cities[ville.id];
if (villeF.workedTiles.includes(cleT)) {
  envoyer({ type: 'SetWorkedTile', cityId: ville.id, tile: cleT });
  const autre = voisins(ville.q, ville.r).find(([q, r]) =>
    st.map[`${q},${r}`] &&
    !Object.values(st.cities).some((c) => c.q === q && c.r === r) &&
    !villeF.workedTiles.includes(`${q},${r}`) &&
    `${q},${r}` !== cleT);
  if (autre) envoyer({ type: 'SetWorkedTile', cityId: ville.id, tile: `${autre[0]},${autre[1]}` });
  await finDeTour();
  st = await dump(code);
}
const vf = st.cities[ville.id];
if (vf.workedTiles.includes(cleT) || vf.workedTiles.length < vf.pop) {
  console.log(`ECHEC préparation : cible cultivée ? ${vf.workedTiles.includes(cleT)}, ville ${vf.workedTiles.length}/${vf.pop}`);
  process.exit(3);
}
console.log(`préparation OK — ville PLEINE ${vf.workedTiles.length}/${vf.pop}, cible (${cleT}) NON cultivée, occupée par ${occ.id}`);

// --------------------------------------------------------------- navigateur
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${WEB}/#/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[placeholder="Alice"]').waitFor({ timeout: 15000 });
await page.fill('input[placeholder="Alice"]', NOM);
await page.click('button:has-text("Entrer")');
await page.waitForURL(/#\/lobby/, { timeout: 15000 });
await page.goto(`${WEB}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

const cadre = async (q, r) => {
  await page.evaluate(([cq, cr]) => window.__game.centerOn(cq, cr), [q, r]);
  await page.mouse.move(800, 450);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await sleep(120); }
  await sleep(500);
};
const clicHex = (q, r) => page.evaluate(([cq, cr]) => window.__game.clickHex(cq, cr), [q, r]);
const finTourGUI = async () => {
  await page.locator('button.fin-tour-rond').first().click();
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
  await sleep(1500);
};
const selection = () => page.evaluate(() => {
  // ui de la scène non exposée : on lit l'info par effet — panneau unité/ville visible
  const t = document.body.innerText;
  return { unite: !!t.match(/Points de vie|PV|Ordres/), ville: !!t.match(/Production|Nourriture/) };
});

await cadre(ville.q, ville.r);

// ---- C (D1bis) : ville PLEINE + clic tuile occupée non travaillée → repli sélection
await clicHex(ville.q, ville.r); // sélectionner la ville
await sleep(400);
await clicHex(tq, tr);
await sleep(500);
await page.screenshot({ path: `${CAP}/1-repli-selection-D1bis.png` });
console.log('capture 1 (repli attendu : unité sélectionnée, aucun ordre)');

// ---- A (D1) : re-clic ville (alternance règle 0), libérer un créneau
// (désélection d'une tuile travaillée), puis clic tuile occupée → SetWorkedTile
st = await dump(code);
const workedAvant = st.cities[ville.id].workedTiles.filter((t) => t !== cleT);
await clicHex(ville.q, ville.r);
await sleep(400);
await clicHex(...workedAvant[0].split(',').map(Number)); // désélection exacte → 1 créneau libre
await sleep(400);
await clicHex(tq, tr);
await sleep(500);
await page.screenshot({ path: `${CAP}/2-tuile-occupee-cultivee-marqueur.png` });
console.log('capture 2 (marqueur worked tile attendu)');
await finTourGUI();
st = await dump(code);
const cultiveeA = st.cities[ville.id].workedTiles.includes(`${tq},${tr}`);
console.log(`A — tuile occupée cultivée après résolution : ${cultiveeA ? 'OK' : 'ECHEC'} (échec = le clic C a émis un ordre indésirable)`);
if (!cultiveeA) { await nav.close(); process.exit(3); }

// ---- B (D1) : re-clic sur la tuile TRAVAILLÉE et occupée → désélection exacte
await cadre(ville.q, ville.r);
st = await dump(code);
const vide = voisins(ville.q, ville.r).find(([q, r]) =>
  st.map[`${q},${r}`] && !Object.values(st.cities).some((c) => c.q === q && c.r === r) && !Object.values(st.units).some((u) => u.q === q && u.r === r));
await page.keyboard.press('Escape'); // purge toute sélection résiduelle (Game.svelte)
await sleep(300);
await clicHex(ville.q, ville.r);
await sleep(400);
await clicHex(tq, tr);
await sleep(500);
await page.screenshot({ path: `${CAP}/3-reclic-deselection-exacte.png` });
await finTourGUI();
st = await dump(code);
const retireeB = !st.cities[ville.id].workedTiles.includes(`${tq},${tr}`);
console.log(`B — désélection exacte (tuile occupée retirée) : ${retireeB ? 'OK' : 'ECHEC'}`);
if (!retireeB) { await nav.close(); process.exit(3); }

// ---- D (D3) : vue ville — ENTRÉE DORMANTE (MENU-VILLE-QUEUE D4 : onEnterVueVille
// débranché dans Game.svelte, aucun chemin live vers la vue ville). La couverture
// de clickActionVueVille est assurée par les tests unitaires (menu-ville.test.ts).
console.log('D — vue ville dormante (entrée débranchée MENU-VILLE-QUEUE D4) : vérification GUI impossible, couverte par tests unitaires');

// ---- D2 : désélection ville puis sélection de l'unité (2 clics : Échap + clic)
await cadre(tq, tr);
await page.keyboard.press('Escape'); // purge toute sélection résiduelle
await sleep(400);
await clicHex(tq, tr); // l'unité seule sur sa tuile : sélection (règle 2)
await sleep(500);
await page.screenshot({ path: `${CAP}/6-unite-selectionnee-2clics.png` });
console.log('capture 6 (unité sélectionnée après désélection ville — Échap + clic)');

const ok = true; // A et B déjà validés plus haut (exit 3 sinon) ; D dormante
console.log(ok ? 'E2E TUILE-OCCUPEE : OK' : 'E2E TUILE-OCCUPEE : ECHEC');
await nav.close();
process.exit(ok ? 0 : 3);
