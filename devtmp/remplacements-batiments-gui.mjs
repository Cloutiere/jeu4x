/**
 * REMPLACEMENTS-BATIMENTS — vérification GUI réelle (L3, handoff 06/10).
 * Scénario (le cas d'Erik) : solo → capitale côtière (science R-107) →
 *  A. chaîne alphabet → ecriture → litteratie → Bibliothèque construite ;
 *  B. chaîne jusqu'à la tech Université → panneau ville, onglet Bâtiments :
 *     l'Université est PROPOSÉE et constructible (« remplace Bibliothèque ») ;
 *  C. clic → en file → complétion au tour suivant : au dump, Bibliothèque
 *     PARTIE, Université présente (science ×4 seule — R-111).
 * Captures : dev-logs/captures-remplacements-batiments/.
 * Usage : node devtmp/remplacements-batiments-gui.mjs [portWorker] [portVite]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');

const PORTW = process.argv[2] ?? '8791';
const PORTG = process.argv[3] ?? '5174';
const BASE = `http://127.0.0.1:${PORTW}`;
const GUI = `http://localhost:${PORTG}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-remplacements-batiments';
fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const NOM = `ErikRempl${STAMP}`;
const MOI = 'p1';
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
const TECHS_DATA = JSON.parse(readFileSync('C:/Users/Erik/ZCodeProject/packages/rules/src/data/techs.json', 'utf8'));

async function login(name) {
  const res = await fetch(`${GUI}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
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
  const waitFor = (type, ms = 30000) => new Promise((resolve, reject) => {
    const i = pending.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(pending.splice(i, 1)[0]);
    waiters.push({ type, resolve });
    setTimeout(() => reject(new Error(`timeout ${type}`)), ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.waitFor = waitFor;
  ws.send = ((orig) => (m) => orig(typeof m === 'string' ? m : JSON.stringify(m)))(ws.send.bind(ws));
  return ws;
}
// ---- wrangler : le workerd local fige après ~10-15 tours (piège connu) —
// démarré ici sur un port DÉDIÉ et redémarré automatiquement ; l'état des
// GameDO persiste dans le stockage local de wrangler.
let wrangler = null;
function tuerPort(P) {
  // Tous les écouteurs du port (zombies compris) — arbres complets.
  const { execSync } = require('node:child_process');
  try {
    const out = execSync(`netstat -ano | findstr ":${P} .*LISTENING"`, { shell: true }).toString();
    const pids = [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch {} }
  } catch {}
}
async function demarrerWrangler(force = false) {
  if (!force && !wrangler) {
    // Un wrangler déjà en place et VIVANT ? On l'adopte (les multi-écouteurs
    // sur le même port font que les connexions tombent sur un zombie).
    try {
      const r = await fetch(`${BASE}/admin/health`, { signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      if (r && r.status < 500) { console.log('[wrangler] adopté (déjà en place)'); return; }
    } catch {}
  }
  if (wrangler) {
    // Piège connu : kill simple laisse des workerd ZOMBIES qui gardent le
    // port — on tue l'arbre complet (Windows).
    try { require('node:child_process').execSync(`taskkill /F /T /PID ${wrangler.pid}`, { stdio: 'ignore' }); } catch {}
    try { wrangler.kill(); } catch {}
  }
  tuerPort(PORTW);
  wrangler = spawn('npx', ['wrangler', 'dev', '--port', PORTW, '--local'], {
    cwd: 'C:/Users/Erik/ZCodeProject/apps/server', shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) }); return; } catch {}
  }
  throw new Error('wrangler ne redémarre pas');
}
let redemarrages = 0;
let g = null; // socket jeu courante (reconnectée après redémarrage)
async function dumpFull(codeJeu) {
  for (let essai = 0; essai < 6; essai++) {
    try {
      const res = await fetch(`${BASE}/admin/game/${codeJeu}`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      return await res.json();
    } catch (e) {
      redemarrages += 1;
      console.log(`[wrangler] figé (${e.message}) — redémarrage #${redemarrages}`);
      await demarrerWrangler(true);
      if (g) {
        try { g.close(); } catch {}
        g = wsConnect(`/ws/game/${codeJeu}`, token);
        await g.open;
        await g.waitFor('Welcome');
      }
    }
  }
  throw new Error('dump impossible après redémarrages');
}
async function creerPartie(token) {
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2 } });
  const created = await lobby.waitFor('GameCreated');
  lobby.close();
  return created.code;
}
const ordre = (g, order) => g.send({ proto: 1, type: 'SubmitOrder', order });
const mesVillesDe = (st) => Object.values(st.cities).filter((c) => c.owner === MOI).sort((a, b) => (a.id < b.id ? -1 : 1));
async function finirTour(g, codeJeu, techRepli = null) {
  // EndTurn réessayé : un envoi tombé pendant le verrou de résolution ou un
  // workerd figé (redémarré par dumpFull) perd le tour — on renvoie.
  for (let essai = 0; essai < 6; essai++) {
    const stv = (await dumpFull(codeJeu)).state;
    const avant = stv.turn;
    // R-184 : EndTurn REFUSÉ sans recherche sélectionnée — on repose une
    // recherche au besoin (l'appelant remettra la bonne au tour suivant).
    for (const v of mesVillesDe(stv)) {
      if (!v.production && (v.queue ?? []).length === 0) {
        ordre(g, { type: 'QueueProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
        await sleep(600);
      }
    }
    if (!stv.players[MOI].researching) {
      const connues = stv.players[MOI].techsUnlocked;
      // Repli général : la tech inconnue la moins chère dont les prérequis
      // sont satisfaits (sinon EndTurn refusé — R-184).
      const connue = new Set(connues);
      const cand = [techRepli, ...Object.entries(TECHS_DATA)
        .filter(([, t]) => (t.prereqs ?? []).every((p) => connue.has(p)) && !connue.has(t[0]))
        .sort((a, b) => a[1].cost - b[1].cost)
        .map(([k]) => k)].find((t) => t && !connue.has(t));
      if (cand) {
        g.send({ proto: 1, type: 'SetResearch', techId: cand });
        await sleep(600);
      }
    }
    g.send({ proto: 1, type: 'EndTurn' });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if ((await dumpFull(codeJeu)).state.turn > avant) return true;
    }
    console.log('  [finirTour] tour non avancé — nouvelle essaie');
  }
  return false;
}
async function attendreTech(g, codeJeu, techId, maxTours = 90) {
  for (let i = 0; i < maxTours; i++) {
    const st = (await dumpFull(codeJeu)).state;
    if (st.players[MOI].techsUnlocked.includes(techId)) return st;
    if (i % 10 === 0) console.log(`  [tech] t${st.turn} ${techId} : progres=${st.players[MOI].scienceProgress[techId] ?? 0}/${'?'}`);

    g.send({ proto: 1, type: 'SetResearch', techId });
    for (const v of mesVillesDe(st)) {
      if (!v.production && (v.queue ?? []).length === 0) {
        ordre(g, { type: 'QueueProduction', cityId: v.id, item: { kind: 'unit', id: 'guerrier' } });
      }
    }
    // L'ordre ne s'applique qu'à la RÉSOLUTION — inutile d'insister entre
    // deux tours : on repose la recherche à CHAQUE itération et finirTour
    // l'utilise en repli (EndTurn refusé sans recherche sélectionnée).
    g.send({ proto: 1, type: 'SetResearch', techId });
    await sleep(400);
    if (!(await finirTour(g, codeJeu, techId))) throw new Error(`tour non avancé (attente ${techId})`);
  }
  throw new Error(`tech ${techId} non complétée en ${maxTours} tours`);
}

// ---- Phase 0 : solo, capitale côtière, science ------------------------------
await demarrerWrangler();
const token = await login(NOM);
const code = await creerPartie(token);
console.log(`[solo] partie ${code}`);
g = wsConnect(`/ws/game/${code}`, token);
await g.open;
await g.waitFor('Welcome');

let st = (await dumpFull(code)).state;
const colon0 = Object.values(st.units).find((u) => u.owner === MOI && u.type === 'colon');
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const passable = (q, r) => {
  const t = st.map[`${q},${r}`];
  return !!t && t.terrain !== 'eau' && t.terrain !== 'ocean' && t.terrain !== 'montagne';
};
const cote = (q, r) => DIRS.some(([dq, dr]) => st.map[`${q + dq},${r + dr}`]?.terrain === 'eau');
function bfsVersCote(depart) {
  const cle = (q, r) => `${q},${r}`;
  const file = [[depart.q, depart.r]];
  const prec = new Map([[cle(depart.q, depart.r), null]]);
  while (file.length > 0) {
    const [q, r] = file.shift();
    if (cote(q, r) && (q !== depart.q || r !== depart.r)) {
      const chemin = [];
      let k = cle(q, r);
      while (k) { const [a, b] = k.split(',').map(Number); chemin.unshift({ q: a, r: b }); k = prec.get(k); }
      return chemin;
    }
    for (const [dq, dr] of DIRS) {
      const nq = q + dq, nr = r + dr;
      const k = cle(nq, nr);
      if (prec.has(k) || !passable(nq, nr)) continue;
      prec.set(k, cle(q, r));
      file.push([nq, nr]);
    }
  }
  return null;
}
const cheminCote = bfsVersCote({ q: colon0.q, r: colon0.r });
if (cheminCote) {
  console.log(`[côte] chemin de ${cheminCote.length} pas vers (${cheminCote.at(-1).q},${cheminCote.at(-1).r})`);
  ordre(g, { type: 'Move', unitId: colon0.id, path: cheminCote.slice(1) });
  for (let i = 0; i < 20; i++) {
    if (!(await finirTour(g, code))) throw new Error('tour non avancé (marche côte)');
    st = (await dumpFull(code)).state;
    const u = st.units[colon0.id];
    if (u.q === cheminCote.at(-1).q && u.r === cheminCote.at(-1).r) break;
  }
} else {
  console.log('[côte] aucune case côtière accessible — fondation sur place 🔴');
}
ordre(g, { type: 'FoundCity', unitId: colon0.id });
await finirTour(g, code);
st = (await dumpFull(code)).state;
const ville = mesVillesDe(st)[0];
console.log(`[t${st.turn}] capitale ${ville.id} (${ville.q},${ville.r})`);
g.send({ proto: 1, type: 'SetConversion', cityId: ville.id, target: 'science' });

// ---- Phase A : litteratie → Bibliothèque construite -------------------------
console.log('[A] alphabet → ecriture → litteratie…');
await attendreTech(g, code, 'alphabet', 80);
await attendreTech(g, code, 'ecriture', 100);
await attendreTech(g, code, 'litteratie', 100);
// La Bibliothèque part en tête (SetProduction — forme simple, remplace la
// file) ; à CHAQUE tour on repose production + recherche (R-184 : EndTurn
// refusé sans recherche sélectionnée — l'ordre tombé pendant le verrou de
// résolution est perdu, on renvoie).
let construite = false;
for (let i = 0; i < 60 && !construite; i++) {
  ordre(g, { type: 'SetProduction', cityId: ville.id, item: { kind: 'building', id: 'bibliotheque' } });
  const pl = (await dumpFull(code)).state.players[MOI];
  if (!pl.researching) g.send({ proto: 1, type: 'SetResearch', techId: 'poterie' });
  await finirTour(g, code);
  st = (await dumpFull(code)).state;
  construite = st.cities[ville.id].buildings.includes('bibliotheque');
}
if (!construite) { console.log('🔴 Bibliothèque jamais construite'); process.exit(1); }
console.log(`[A] t${st.turn} Bibliothèque construite :`, st.cities[ville.id].buildings);

// ---- Phase B : tech Université (chaîne longue) ------------------------------
console.log('[B] chaîne maconnerie → mathematiques → code_des_lois → democratie → universite…');
await attendreTech(g, code, 'maconnerie', 120);
await attendreTech(g, code, 'mathematiques', 180);
await attendreTech(g, code, 'code_des_lois', 180);
await attendreTech(g, code, 'democratie', 240);
st = await attendreTech(g, code, 'universite', 240);
console.log(`[B] t${st.turn} tech Université acquise`);

// ---- GUI : panneau ville, onglet Bâtiments ----------------------------------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'session', value: token, url: GUI }]);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[page-console]', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${GUI}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await sleep(2500);

// Ouverture du panneau : un redémarrage wrangler peut avoir tué le WebSocket
// de la page (état figé) — on recharge la page au besoin.
let panneau = null;
for (let essai = 0; essai < 3 && !panneau; essai++) {
  if (essai > 0) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 }); await sleep(2500); }
  // La ville est SOUS une pile de guerriers (file anti-barbares) : la règle
  // d'alternance (interaction.ts) cycle les occupants AVANT de sélectionner
  // la ville — on clique jusqu'à 10 fois.
  for (let k = 0; k < 10 && !panneau; k++) {
    await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: st.cities[ville.id].q, y: st.cities[ville.id].r });
    await sleep(500);
    panneau = await page.$('.panneau-ville');
  }
}
if (!panneau) {
  console.log('🔴 panneau de ville introuvable');
  const diag = await page.evaluate(() => {
    const g = window.__game;
    return { typeClickHex: typeof g?.clickHex, keys: g ? Object.keys(g) : null };
  }).catch((e) => ({ err: String(e) }));
  console.log('[diag]', JSON.stringify(diag));
  await page.screenshot({ path: `${CAP}/Z-echec-panneau.png` });
  process.exit(1);
}
await page.$$eval('.panneau-ville .onglets button', (els) => els.find((b) => b.textContent.includes('Bâtiments'))?.click());
await sleep(400);

const optUni = await page.$$eval('.panneau-ville .opt', (els) => {
  const el = els.find((e) => /^Université \(/.test(e.querySelector('b')?.textContent.trim() ?? ''));
  if (!el) return null;
  return { disabled: el.disabled, texte: el.textContent.replace(/\s+/g, ' ').trim() };
});
console.log('[B] option Université :', JSON.stringify(optUni));
const biblioDansMenu = await page.$$eval('.panneau-ville .opt b', (els) => els.some((e) => /^Bibliothèque \(/.test(e.textContent.trim())));
console.log('[B] Bibliothèque encore dans le menu :', biblioDansMenu);
await page.screenshot({ path: `${CAP}/A-menu-universite-constructible.png` });
if (!optUni) { console.log('🔴 Université absente du menu (le bug d’Erik)'); process.exit(1); }
if (optUni.disabled) { console.log('🔴 Université grisée alors que la Bibliothèque est construite'); process.exit(1); }
if (!optUni.texte.includes('remplace')) { console.log('🔴 mention « remplace » absente'); process.exit(1); }
if (biblioDansMenu) { console.log('🔴 Bibliothèque encore proposée (déjà construite)'); process.exit(1); }

// Clic = ajout en file
await page.$$eval('.panneau-ville .opt', (els) => els.find((e) => /^Université \(/.test(e.querySelector('b')?.textContent.trim() ?? ''))?.click());
await sleep(600);
const fileTxt = (await page.textContent('.panneau-ville .file') ?? '').replace(/\s+/g, ' ').trim();
console.log('[C] file :', fileTxt);
await page.screenshot({ path: `${CAP}/B-universite-en-file.png` });
if (!fileTxt.includes('Université')) { console.log('🔴 Université pas entrée en file'); process.exit(1); }

// ---- Phase C : complétion → Bibliothèque partie -----------------------------
// La ville est cernée (guerriers anti-barbares) : si l'Université n'est pas
// en tête, les guerriers devant ne peuvent plus être POSENT (aucune case
// libre) et la file stalle — on retire les rangs avant elle.
let fin = null;
for (let i = 0; i < 90 && !fin; i++) {
  // Si l'Université n'est pas en tête, on retire le rang 0 (les guerriers
  // devant ne peuvent plus être POSENT — ville cernée — et la file stalle).
  const stq = (await dumpFull(code)).state;
  const vq = stq.cities[ville.id];
  if (vq.production?.item?.id !== 'universite' && (vq.queue ?? []).some((it) => it.id === 'universite')) {
    ordre(g, { type: 'RemoveFromQueue', cityId: ville.id, index: 0 });
    await sleep(300);
  }
  await finirTour(g, code);
  st = (await dumpFull(code)).state;
  const b = st.cities[ville.id].buildings;
  if (b.includes('universite')) fin = b;
}
if (!fin) { console.log('🔴 Université jamais complétée'); process.exit(1); }
console.log(`[C] t${st.turn} bâtiments après complétion :`, fin);
const ok = fin.includes('universite') && !fin.includes('bibliotheque');
// relecture menu : plus ni Université (bâtie) ni Bibliothèque (remplacée)
for (let essai = 0; essai < 3; essai++) {
  if (essai > 0) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 }); await sleep(2500); }
  await page.evaluate((q) => window.__game.clickHex(q.x, q.y), { x: st.cities[ville.id].q, y: st.cities[ville.id].r });
  const ok2 = await page.waitForSelector('.panneau-ville', { timeout: 8000 }).catch(() => null);
  if (ok2) break;
}
await sleep(600);
const apres = await page.$$eval('.panneau-ville .opt b', (els) => ({
  uni: els.some((e) => /^Université \(/.test(e.textContent.trim())),
  biblio: els.some((e) => /^Bibliothèque \(/.test(e.textContent.trim())),
})).catch(() => ({ uni: 'page-fermée', biblio: '?' }));
console.log('[C] menu après complétion :', JSON.stringify(apres));
await page.screenshot({ path: `${CAP}/C-apres-completion.png` });
console.log(`[verdict] ${ok ? 'PASS ✅ — Université constructible, complétion = remplacement réel' : 'ÉCHEC 🔴'}`);
await browser.close();
process.exit(ok ? 0 : 1);
