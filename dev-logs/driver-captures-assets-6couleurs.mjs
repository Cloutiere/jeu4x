/**
 * Pilote ASSETS-6COULEURS (L3) — captures dev-logs/captures-assets-6couleurs/ :
 * labo #/labo-rendu (GameCanvas réel) — guerrier ×6 et archer ×6 (SVG peints
 * d'Erik) seuls sur les tuiles du nouveau style, cohabitation 3 nations,
 * barbare (unité peinte + camp tuile_barbare), zoom extrêmes (netteté ×2).
 * Fiches composées : A/B avant/après (guerrier, archer, barbare, camp,
 * icônes de rendement).
 * Usage : node dev-logs/driver-captures-assets-6couleurs.mjs  (vite :5174 requis)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CAPDIR = join(here, 'captures-assets-6couleurs');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[6COUL]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);
function chargerSharp() {
  try { return require('sharp'); } catch {
    const store = join(ROOT, 'node_modules', '.pnpm');
    const entree = require('node:fs').readdirSync(store).find((d) => /^sharp@/.test(d));
    return require(join(store, entree, 'node_modules', 'sharp'));
  }
}
const sharp = chargerSharp();

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9342;
async function cdpConnect() {
  const proc = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, '--headless=new', '--disable-gpu',
    '--window-size=1920,1080', '--user-data-dir=' + join(CAPDIR, `_edge-profile-${Date.now()}`), 'about:blank',
  ], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 30 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      target = (await res.json()).find((t) => t.type === 'page');
    } catch { /* retry */ }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('Edge CDP indisponible');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = { id: 0, pending: new Map(), ws };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && cdp.pending.has(msg.id)) {
      const { resolve, reject } = cdp.pending.get(msg.id);
      cdp.pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  cdp.send = (method, params = {}) => {
    const id = ++cdp.id;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => cdp.pending.set(id, { resolve, reject }));
  };
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { cdp, proc };
}

async function cdpEval(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
}

async function shot(cdp, name) {
  await sleep(700);
  const data = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
  writeFileSync(join(CAPDIR, name), Buffer.from(data, 'base64'));
  log('capture', name);
}

async function molette(cdp, deltaY, fois) {
  for (let i = 0; i < fois; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 960, y: 700, deltaX: 0, deltaY });
    await sleep(60);
  }
}

// ------------------------------------------------------------- fiches composées
const ART = join(ROOT, 'apps', 'web', 'public', 'art');
const EXPORTS = join(ROOT, 'assets-src', 'exports');
const AVANT = join(CAPDIR, 'avant');
const NOMS = ['J1 saphir', 'J2 rouge royal', 'J3 émeraude', 'J4 jaune d\'or', 'J5 cuivre ardent', 'J6 ardoise'];

/** Une rangée de 6 cases : sprite posé sur sa tuile. */
async function rangée(tuile, stem, label) {
  const TU = 224, TH = 256, GAP = 8;
  const W = 6 * (TU + GAP) + GAP, H = TH + 2 * GAP + 30;
  const comps = [];
  for (let c = 0; c < 6; c++) {
    const x = GAP + c * (TU + GAP), y = 30;
    comps.push({ input: await sharp(join(ART, `${tuile[c]}.png`)).toBuffer(), left: x, top: y });
    const h = 190;
    const buf = await sharp(join(ART, `${stem}${c + 1}.png`)).resize({ height: h }).png().toBuffer();
    comps.push({ input: buf, left: x + Math.round((TU - Math.round(h * 0.8)) / 2), top: y + TH - h - 12 });
  }
  const etiquette = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="21" font-family="sans-serif" font-size="16" fill="#222">${label} — ${NOMS.join(', ')}</text></svg>`,
  );
  comps.push({ input: etiquette, left: 0, top: 0 });
  return sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite(comps).png().toBuffer();
}

async function ficheDeuxRangées() {
  const T = ['tile_prairie', 'tile_plaine', 'tile_colline', 'tile_desert', 'tile_foret', 'tile_montagne'];
  const guerrier = await rangée(T, 'unite_guerrier_j', 'Guerrier ×6 (SVG peints d\'Erik)');
  const archer = await rangée(T, 'unite_archer_j', 'Archer ×6 (même calibre guerrier — 71,3 % de hauteur)');
  const W = Math.max(guerrier.width ?? 1408, 1408);
  const GH = Math.round(190 / 640 * 640); // noop, hauteurs réelles lues ci-dessous
  const gM = await sharp(guerrier).metadata();
  const aM = await sharp(archer).metadata();
  const H = gM.height + aM.height + 10;
  await sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite([{ input: guerrier, left: 0, top: 0 }, { input: archer, left: 0, top: gM.height + 10 }])
    .png().toFile(join(CAPDIR, 'fiche-6couleurs-guerrier-archer.png'));
  log('capture fiche-6couleurs-guerrier-archer.png');
}

/** A/B avant/après : sprites (ancien PNG à gauche, nouveau à droite). */
async function ficheAB(stemAvant, stemApres, fichier, label) {
  const TU = 224, TH = 256, GAP = 8;
  const W = 2 * (TU + GAP) + GAP, H = TH + 2 * GAP + 30;
  const comps = [];
  for (const [c, stem] of [[0, stemAvant], [1, stemApres]]) {
    const x = GAP + c * (TU + GAP), y = 30;
    comps.push({ input: await sharp(join(ART, 'tile_prairie.png')).toBuffer(), left: x, top: y });
    const h = 190;
    const buf = await sharp(stem).resize({ height: h }).png().toBuffer();
    comps.push({ input: buf, left: x + Math.round((TU - Math.round(h * 0.8)) / 2), top: y + TH - h - 12 });
  }
  const etiquette = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="21" font-family="sans-serif" font-size="16" fill="#222">${label} — AVANT (peintre) / APRÈS (SVG d'Erik)</text></svg>`,
  );
  comps.push({ input: etiquette, left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite(comps).png().toFile(join(CAPDIR, fichier));
  log('capture', fichier);
}

/** Icônes de rendement avant/après (64×64 zoomées ×3 pour lecture). */
async function ficheIcones() {
  const noms = ['nourriture', 'production', 'or', 'science', 'culture', 'commerce'];
  const S = 64, Z = 3, GAP = 10;
  const W = noms.length * (S * Z + GAP) + GAP, H = 2 * (S * Z) + 3 * GAP + 30;
  const comps = [];
  for (let c = 0; c < noms.length; c++) {
    const n = noms[c];
    const x = GAP + c * (S * Z + GAP);
    const avant = join(AVANT, `icone_${n}.png`);
    const apres = join(ART, `icone_${n}.png`);
    comps.push({ input: await sharp(avant).resize(S * Z, S * Z, { kernel: 'nearest' }).png().toBuffer(), left: x, top: 30 });
    const existeApres = true; // 6 SVG sources (balance = commerce, 26/09 v2)
    if (existeApres) {
      comps.push({ input: await sharp(apres).resize(S * Z, S * Z, { kernel: 'nearest' }).png().toBuffer(), left: x, top: 30 + S * Z + GAP });
    }
  }
  const etiquette = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="21" font-family="sans-serif" font-size="16" fill="#222">Icônes rendement ×3 — HAUT : ancien peintre / BAS : SVG d'Erik (SVG sources 26/09, balance = commerce)</text></svg>`,
  );
  comps.push({ input: etiquette, left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite(comps).png().toFile(join(CAPDIR, 'fiche-icones-avant-apres.png'));
  log('capture fiche-icones-avant-apres.png');
}

const { cdp, proc } = await cdpConnect();
try {
  await ficheDeuxRangées();
  await ficheAB(join(ART, 'unite_guerrier_avant.png'), join(ART, 'unite_guerrier_j1.png'), 'fiche-ab-guerrier.png', 'Guerrier');
  await ficheAB(join(ART, 'unite_archer_avant.png'), join(ART, 'unite_archer_j1.png'), 'fiche-ab-archer.png', 'Archer');
  await ficheAB(join(ART, 'unite_barbare_guerrier_avant.png'), join(ART, 'unite_barbare_guerrier.png'), 'fiche-ab-barbare.png', 'Barbare (unité)');
  await ficheIcones();

  await cdp.send('Page.navigate', { url: `${WEB}/#/labo-rendu` });
  await sleep(5000);

  // Rangée guerrier ×6 (r=2)
  await cdpEval(cdp, `window.__game.centerOn(2.5, 2)`);
  await shot(cdp, 'labo-guerrier-6couleurs.png');

  // Rangée archer ×6 (r=4)
  await cdpEval(cdp, `window.__game.centerOn(2.5, 4)`);
  await shot(cdp, 'labo-archer-6couleurs.png');

  // Cohabitation 3 nations (0,6)
  await cdpEval(cdp, `window.__game.centerOn(0, 6)`);
  await shot(cdp, 'labo-melee-3-nations.png');

  // Barbare : unité + camp (6,0)-(7,0)
  await cdpEval(cdp, `window.__game.centerOn(6.5, 0)`);
  await shot(cdp, 'labo-barbare-camp.png');

  // Zoom max sur l'archer j1 (netteté export ×2)
  await cdpEval(cdp, `window.__game.centerOn(0, 4)`);
  await molette(cdp, -240, 40);
  await sleep(400);
  await shot(cdp, 'labo-archer-zoom-max.png');

  // Dézoom max — lisibilité au dézoom
  await molette(cdp, 240, 80);
  await sleep(400);
  await shot(cdp, 'labo-dezoom-max.png');
} finally {
  proc.kill();
}
log('fin');
