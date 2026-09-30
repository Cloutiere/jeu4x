/**
 * Pilote SPRITES-GUERRIER-COLON (L2) — captures dev-logs/captures-sprites-guerrier-colon/ :
 * fiches 6 couleurs avant/après (guerrier, colon — PNG du HEAD vs nouveaux SVG d'Erik),
 * labo #/labo-ranu (GameCanvas réel) : rangées guerrier ×6 et colon ×6, cohabitations
 * (3 nations + guerrier+colon même nation), close-up zoom ×2.
 * Usage : node dev-logs/driver-captures-sprites-guerrier-colon.mjs  (vite :5174 requis)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CAPDIR = join(here, 'captures-sprites-guerrier-colon');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[GCOLON]', ...a);
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
const AVANT = join(ROOT, 'devtmp', 'ab-avant');
const ART = join(ROOT, 'apps', 'web', 'public', 'art');
const NOMS = ['J1 saphir', 'J2 rouge royal', 'J3 émeraude', 'J4 jaune d\'or', 'J5 cuivre ardent', 'J6 ardoise'];

/** Fiche A/B ×6 : rangée AVANT (HEAD, haut) / APRÈS (SVG v2 d'Erik, bas). */
async function ficheAB6(stem, fichier, label) {
  const TU = 224, TH = 256, GAP = 8, H_SPRITE = 170;
  const W = 6 * (TU + GAP) + GAP;
  const H = 2 * (TH + GAP) + 2 * 30 + 10;
  const comps = [];
  for (let c = 0; c < 6; c++) {
    const x = GAP + c * (TU + GAP);
    const tuile = await sharp(join(ART, 'tile_prairie.png')).resize(TU, TH, { cover: true }).toBuffer();
    for (const [rangée, base] of [[0, AVANT], [1, ART]]) {
      const y = 30 + rangée * (TH + GAP + 30);
      comps.push({ input: tuile, left: x, top: y });
      const buf = await sharp(join(base, `${stem}_j${c + 1}.png`)).resize({ height: H_SPRITE }).png().toBuffer();
      comps.push({ input: buf, left: x + Math.round((TU - Math.round(H_SPRITE * 0.8)) / 2), top: y + TH - H_SPRITE - 12 });
    }
  }
  for (const [rangée, txt] of [[0, `${label} — AVANT (HEAD)`], [1, `${label} — APRÈS (nouveaux SVG d'Erik) : ${NOMS.join(', ')}`]]) {
    const etiquette = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="21" font-family="sans-serif" font-size="16" fill="#222">${txt}</text></svg>`,
    );
    comps.push({ input: etiquette, left: 0, top: rangée === 0 ? 0 : 30 + TH + GAP });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite(comps).png().toFile(join(CAPDIR, fichier));
  log('capture', fichier);
}

const { cdp, proc } = await cdpConnect();
try {
  await ficheAB6('unite_guerrier', 'fiche-ab-6couleurs-guerrier.png', 'Guerrier ×6');
  await ficheAB6('unite_colon', 'fiche-ab-6couleurs-colon.png', 'Colon ×6');

  await cdp.send('Page.navigate', { url: `${WEB}/#/labo-rendu` });
  await sleep(5000);

  // Rangée guerrier ×6 (r=2)
  await cdpEval(cdp, `window.__game.centerOn(2.5, 2)`);
  await shot(cdp, 'labo-guerrier-6couleurs.png');

  // Rangée colon ×6 (r=16)
  await cdpEval(cdp, `window.__game.centerOn(-5.5, 16)`);
  await shot(cdp, 'labo-colon-6couleurs.png');

  // Cohabitation 3 nations guerriers (0,6)
  await cdpEval(cdp, `window.__game.centerOn(0, 6)`);
  await shot(cdp, 'labo-melee-3-nations.png');

  // Cohabitation guerrier + colon même nation (2,6)
  await cdpEval(cdp, `window.__game.centerOn(2, 6)`);
  await shot(cdp, 'labo-cohabitation-guerrier-colon.png');

  // Close-up zoom max sur le colon j1 (r=16, q=0)
  await cdpEval(cdp, `window.__game.centerOn(-8, 16)`);
  await molette(cdp, -240, 40);
  await sleep(400);
  await shot(cdp, 'labo-colon-zoom-max.png');
} finally {
  proc.kill();
}
log('fin');
