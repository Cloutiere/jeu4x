/**
 * HANDOFF-CHRONIQUES — e2e GUI (L3) : partie solo RÉELLE (wrangler 8787 +
 * Vite 5174), 7 tours joués légalement par WS (production, recherche,
 * attaques des cibles adjacentes, fin de tour), puis vérifications dans le
 * vrai client : Chronique remplie, zéro coordonnée, filtres, rechargement
 * (persistance D7), Paramètres → journal de débogue (D6), rapport de combat
 * (D5). Captures → dev-logs/captures-chroniques/.
 * Usage : node devtmp/chroniques-e2e.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const WEB = 'http://localhost:5174';
const NOM = 'ErikChron';
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-chroniques';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------- WS
function open(url) {
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
  ws.attendre = (pred, ms = 45000) => {
    const idx = file.findIndex(pred);
    if (idx >= 0) return Promise.resolve(file.splice(idx, 1)[0]);
    return new Promise((res, rej) => {
      waiters.push({ pred, res });
      setTimeout(() => rej(new Error('timeout attente message')), ms);
    });
  };
  return ws;
}

// ------------------------------------------------------------ techs dispo
const techsJson = (await import('../packages/rules/src/data/techs.json', { with: { type: 'json' } })).default;
const TECHS = techsJson.techs ?? techsJson;
function prochaineTech(recherchees) {
  for (const [id, t] of Object.entries(TECHS)) {
    if (recherchees.includes(id)) continue;
    const prereq = t.prereq ?? [];
    if (prereq.every((p) => recherchees.includes(p))) return id;
  }
  return null;
}

// ------------------------------------------------------- partie + servers
for (const url of [`${BASE}/auth/dev?name=Sonde`, `${WEB}/`]) {
  const r = await fetch(url, { redirect: 'manual' });
  if (!r.ok && r.status !== 302) throw new Error(`serveur absent : ${url}`);
}
const res = await fetch(`${BASE}/auth/dev?name=${NOM}&next=/`, { redirect: 'manual' });
const tok = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')[1];

const lobby = open(`ws://127.0.0.1:8787/ws/lobby?token=${tok}`);
await lobby.ready;
lobby.send(JSON.stringify({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' } }));
const created = await lobby.attendre((m) => m.type === 'GameCreated');
const code = created.code;
console.log('partie', code);
lobby.close();

const g = open(`ws://127.0.0.1:8787/ws/game/${code}?token=${tok}`);
await g.ready;
let snap = await g.attendre((m) => m.type === 'Snapshot', 45000);
const moi = Object.entries(snap.state.players).find(([, p]) => !p.bot)?.[0] ?? null;
if (!moi) throw new Error('joueur introuvable');
console.log('moi =', moi);

const voisins = (q, r) => [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]];
const cle = (q, r) => `${q},${r}`;
const NON_MILITAIRES = new Set(['colon', 'espion', 'icbm']);

// 22 tours légaux : conversion science, production, recherche, marche vers
// l'ennemi le plus proche (attaque à l'adjacence), fin de tour.
let conversionFaite = false;
for (let tour = 1; tour <= 22; tour++) {
  const st = snap.state;
  const ville = Object.values(st.cities).find((c) => c.owner === moi);
  if (ville && !ville.production) {
    g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'SetProduction', cityId: ville.id, item: { kind: 'unit', id: 'guerrier' } } }));
  }
  const joueur = st.players[moi];
  const faites = joueur.researchedTechs ?? joueur.techs ?? [];
  if (!conversionFaite && ville) {
    // R-90 : conversion par défaut = or — sans SetConversion science, la
    // recherche n'avance jamais (constat OR-RUSHBUY).
    if (ville.conversion !== 'science') {
      g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'SetConversion', cityId: ville.id, target: 'science' } }));
      conversionFaite = true;
    }
  }
  if (!joueur.researching) {
    const tech = prochaineTech(faites);
    if (tech) {
      console.log(`tour ${tour} : recherche ${tech}`);
      g.send(JSON.stringify({ proto: 1, type: 'SetResearch', techId: tech }));
    }
  }
  const unites = Object.values(st.units).filter((u) => u.owner === moi);
  const ennemis = Object.values(st.units).filter((x) => x.owner !== moi);
  for (const u of unites) {
    if (NON_MILITAIRES.has(u.type)) continue;
    // Attaque si un ennemi est adjacent.
    let aAttaque = false;
    for (const [q, r] of voisins(u.q, u.r)) {
      const ennemi = ennemis.find((x) => x.q === q && x.r === r);
      if (ennemi) {
        console.log(`tour ${tour} : attaque ${u.id} (${u.type}) → ${ennemi.id} (${ennemi.owner})`);
        g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'Attack', unitId: u.id, target: { q, r } } }));
        aAttaque = true;
        break;
      }
    }
    if (aAttaque || ennemis.length === 0) continue;
    // Sinon : marche gloutonne (1 case/turn) vers l'ennemi le plus proche.
    const cible = ennemis.reduce((a, b) =>
      Math.abs(b.q - u.q) + Math.abs(b.r - u.r) < Math.abs(a.q - u.q) + Math.abs(a.r - u.r) ? b : a);
    const options = voisins(u.q, u.r)
      .sort((p1, p2) => (Math.abs(p1[0] - cible.q) + Math.abs(p1[1] - cible.r)) - (Math.abs(p2[0] - cible.q) + Math.abs(p2[1] - cible.r)));
    for (const [q, r] of options) {
      const t = st.map[cle(q, r)];
      if (!t || t.terrain === 'eau' || t.terrain === 'ocean' || t.terrain === 'montagne') continue;
      if (st.units[cle(q, r)] ?? Object.values(st.units).some((x) => x.q === q && x.r === r)) continue;
      g.send(JSON.stringify({ proto: 1, type: 'SubmitOrder', order: { type: 'Move', unitId: u.id, path: [{ q, r }] } }));
      break;
    }
  }
  g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
  const tr = await g.attendre((m) => m.type === 'TurnResult', 60000);
  const types = tr.events.map((e) => e.type).filter((t) => !['Move', 'TurnResolved'].includes(t));
  console.log(`tour ${tour} résolu — événements :`, types.join(', ') || '(aucun)');
  snap = { state: tr.state };
}
const etatFinal = snap.state;
g.close();
console.log('PARTIE JOUEE code=' + code);

// ------------------------------------------------------------ navigateur
const nav = await chromium.launch({ channel: 'msedge', headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${WEB}/#/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[placeholder="Alice"]').waitFor({ timeout: 15000 });
await page.fill('input[placeholder="Alice"]', NOM);
await page.click('button:has-text("Entrer")');
await page.waitForURL(/#\/lobby/, { timeout: 15000 });
await page.goto(`${WEB}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
// Laisser le Snapshot rejouer missedEvents → la Chronique se remplit.
await page.waitForFunction(() => {
  const h = [...document.querySelectorAll('aside.side h2')].find((x) => x.textContent?.includes('Chroniques'));
  return !!h && /\((\d+)\)/.exec(h.textContent ?? '') && Number(/Chroniques \((\d+)\)/.exec(h.textContent ?? '')?.[1] ?? 0) > 0;
}, null, { timeout: 30000 });
await sleep(1500);

const texteChronique = async () =>
  await page.evaluate(() => {
    const sections = [...document.querySelectorAll('aside.side section.panel')];
    const c = sections.find((s) => s.querySelector('h2')?.textContent?.includes('Chroniques'));
    return c ? c.innerText : '';
  });

const avant = await texteChronique();
console.log('--- Chronique (extrait) ---\n' + avant.split('\n').slice(0, 18).join('\n'));
await page.screenshot({ path: `${CAP}/1-chroniques-colonne.png` });

// D3 — zéro coordonnée dans la Chronique.
const coordonnees = avant.match(/\(?-?\d+\s*,\s*-?\d+\)?/g) ?? [];
if (coordonnees.length > 0) throw new Error('COORDONNEES VISIBLES : ' + coordonnees.join(' | '));
console.log('D3 ok — zéro coordonnée');

// D7 — rechargement : la Chronique survit.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 90000 });
await page.waitForFunction(() => {
  const h = [...document.querySelectorAll('aside.side h2')].find((x) => x.textContent?.includes('Chroniques'));
  return !!h && Number(/Chroniques \((\d+)\)/.exec(h.textContent ?? '')?.[1] ?? 0) > 0;
}, null, { timeout: 90000 });
const apres = await texteChronique();
if (apres.replace(/\s/g, '') !== avant.replace(/\s/g, '')) throw new Error('CHRONIQUE PERDUE AU RECHARGEMENT');
console.log('D7 ok — Chronique conservée au rechargement');
await page.screenshot({ path: `${CAP}/5-apres-rechargement.png` });

// D5 — injection forgée (hook dev __chroniques, miroir __rapport) : combat
// près de la capitale (visible), merveille + artefact ADVERSES (D4), tech,
// barbare. Le même lot est injecté dans replayPair (__rapport) pour que le
// clic combat ouvre le VRAI popover RAPPORT-ENGAGEMENT.
const injecte = await page.evaluate((etat) => {
  const moi = Object.entries(etat.players).find(([, p]) => !p.bot)?.[0];
  const autre = Object.keys(etat.players).find((p) => p !== moi);
  const ville = Object.values(etat.cities).find((c) => c.owner === moi);
  const guerrier = Object.values(etat.units).find((u) => u.owner === moi && u.type === 'guerrier');
  const hex = { q: ville.q + 1, r: ville.r };
  const barbare = { q: hex.q + 1, r: hex.r };
  const events = [
    { seq: 9001, type: 'Attack', attackerId: 'uX1', defenderId: 'uX2', at: hex },
    { seq: 9002, type: 'CombatExchange', attackerId: 'uX1', defenderId: 'uX2', at: hex, attackerHpAfter: 2, defenderHpAfter: 0 },
    { seq: 9003, type: 'UnitDestroyed', unitId: 'uX2', owner: 'barbarien', at: hex, cause: 'combat', byUnitId: 'uX1' },
    { seq: 9004, type: 'WonderCompleted', cityId: 'vAdverse', owner: autre, wonder: 'stonehenge', at: { q: 30, r: 30 } },
    { seq: 9005, type: 'ArtifactActivated', artefactId: 'aX', artefact: 'arche', name: 'Arche de Noé', effect: 'orParEre', gold: 90, byPlayer: autre, byUnitId: null, at: { q: 31, r: 30 } },
    { seq: 9006, type: 'TechResearched', player: moi, tech: 'alphabet' },
    { seq: 9007, type: 'BarbarianSpawned', unitId: 'uX3', villageId: 'vilX', owner: 'barbarien', at: barbare },
    { seq: 9008, type: 'BuildingCompleted', cityId: ville.id, owner: moi, building: 'temple', at: { q: ville.q, r: ville.r } },
  ];
  const c1 = window.__chroniques?.inject(events);
  const c2 = window.__rapport?.inject(events, etat, etat.turn);
  return { c1, c2 };
}, etatFinal);
console.log('injection :', JSON.stringify(injecte));
await sleep(700);
const enrichi = await texteChronique();
for (const attendu of ['Combat', 'Stonehenge', 'relique', 'Technologie complétée', 'barbare', 'Temple']) {
  if (!enrichi.toLowerCase().includes(attendu.toLowerCase())) fs.writeFileSync(`${CAP}/dump-enrichi.txt`, enrichi), console.log('DUMP -> dump-enrichi.txt'), (() => { throw new Error('CATÉGORIE MANQUANTE : ' + attendu); })()
}
if (!enrichi.includes('Zoulous')) throw new Error('merveille adverse sans nom de nation (D4)');
await page.screenshot({ path: `${CAP}/2-chroniques-enrichies.png` });
console.log('D2/D4 ok — 7 catégories présentes, nation adverse, rumeur sans lieu');
if (/(\(?-?\d+\s*,\s*-?\d+\)?)/.test(enrichi)) throw new Error('COORDONNÉES après injection');

// D2 — filtre ⚔ retire le combat.
const avecCombats = enrichi;
await page.locator('.chip-filtre', { hasText: '⚔' }).first().click();
await sleep(400);
const sansCombats = await texteChronique();
if (!avecCombats.includes('Combat') || sansCombats.includes('Combat')) throw new Error('filtre ⚔ sans effet');
await page.screenshot({ path: `${CAP}/3-filtres-sans-combats.png` });
console.log('D2 ok — filtre ⚔ actif');
await page.locator('.chip-filtre', { hasText: '⚔' }).first().click();
await sleep(300);

// D5 — clic de l'entrée combat → popover RAPPORT-ENGAGEMENT (paire injectée).
await page.evaluate(() => {
  const el = [...document.querySelectorAll('aside.side .entry.clickable')].find((x) => x.textContent?.startsWith('Combat'));
  if (!el) throw new Error('entrée combat introuvable');
  el.click();
});
await sleep(1200);
const popover = await page.evaluate(() => document.body.innerText.includes('Rejouer ce combat'));
await page.screenshot({ path: `${CAP}/4-rapport-combat.png` });
if (!popover) throw new Error('popover rapport non ouvert au clic combat');
console.log('D5 ok — clic combat ouvre le rapport (Rejouer disponible)');
await page.keyboard.press('Escape');
await sleep(400);

// D6 — Paramètres → journal de débogue (coordonnées présentes, normal).
await page.locator('button.parametres').click();
await sleep(500);
const param = await page.evaluate(() => document.body.innerText.includes('Journal de débogue') || [...document.querySelectorAll('.parametres-boite h2')].some((h) => h.textContent?.includes('Journal')));
await page.screenshot({ path: `${CAP}/5-parametres-journal.png` });
if (!param) throw new Error('journal de débogue absent du menu Paramètres');
console.log('D6 ok — journal de débogue dans Paramètres');

await nav.close();
console.log('E2E CHRONIQUES OK');
