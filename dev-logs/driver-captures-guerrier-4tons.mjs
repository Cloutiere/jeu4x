/**
 * Pilote GUERRIER-4TONS (L3) — captures dev-logs/captures-guerrier-4tons/ :
 * labo #/labo-rendu (GameCanvas réel, nouvelles tuiles) — les 7 variantes
 * cuites J1-J7 du guerrier 4 tons posées SEULES sur les tuiles du nouveau
 * style + cohabitation 3 nations, aux deux extrêmes de zoom (netteté export
 * ×2). La variante barbare (unite_guerrier_barbare.png, Rouge Royal) est
 * composée en fiche locale (le rendu barbare en jeu garde ses sprites dédiés).
 * Usage : node dev-logs/driver-captures-guerrier-4tons.mjs  (vite :5174 requis)
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CAPDIR = join(here, 'captures-guerrier-4tons');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[4TONS]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);
function chargerSharp() {
  try {
    return require('sharp');
  } catch {
    const store = join(ROOT, 'node_modules', '.pnpm');
    const entree = require('node:fs').readdirSync(store).find((d) => /^sharp@/.test(d));
    return require(join(store, entree, 'node_modules', 'sharp'));
  }
}
const sharp = chargerSharp();

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9341;
async function cdpConnect() {
  const proc = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, '--headless=new', '--disable-gpu',
    '--window-size=1920,1080', '--user-data-dir=' + join(CAPDIR, `_edge-profile-${Date.now()}`), 'about:blank',
  ], { stdio: 'ignore' });
  proc.on('error', (e) => log('spawn error :', e.message));
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

/** Molette CDP sur le canvas du labo (position centre-écran). */
async function molette(cdp, deltaY, fois) {
  for (let i = 0; i < fois; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 960, y: 700, deltaX: 0, deltaY,
    });
    await sleep(60);
  }
}

// ---------------------------------------------------------------- fiche locale
// Fiche des 8 variantes : chaque PNG cuit posé sur sa tuile (PNG du jeu),
// hauteur calée sur le calibre (contenu ≈ 0,713 de la hauteur du sprite).
async function ficheVariantes() {
  const ART = join(ROOT, 'apps', 'web', 'public', 'art');
  const lignes = [
    [['tile_prairie', 'unite_guerrier_j1'], ['tile_plaine', 'unite_guerrier_j2'], ['tile_colline', 'unite_guerrier_j3'], ['tile_desert', 'unite_guerrier_j4']],
    [['tile_foret', 'unite_guerrier_j5'], ['tile_montagne', 'unite_guerrier_j6'], ['tile_prairie', 'unite_guerrier_j7'], ['tile_colline', 'unite_guerrier_barbare']],
  ];
  const TU = 224, TH = 256, GAP = 8;
  const W = 4 * (TU + GAP) + GAP, H = 2 * (TH + GAP) + GAP + 30;
  const comps = [];
  for (let l = 0; l < 2; l++) {
    for (let c = 0; c < 4; c++) {
      const [tuile, unite] = lignes[l][c];
      const x = GAP + c * (TU + GAP), y = 30 + l * (TH + GAP);
      comps.push({ input: await sharp(join(ART, `${tuile}.png`)).toBuffer(), left: x, top: y });
      const h = 190;
      const buf = await sharp(join(ART, `${unite}.png`)).resize({ height: h }).png().toBuffer();
      comps.push({ input: buf, left: x + Math.round((TU - Math.round(h * 0.8)) / 2), top: y + TH - h - 12 });
    }
  }
  const etiquette = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="21" font-family="sans-serif" font-size="16" fill="#222">Guerrier 4 tons — J1 saphir, J2 rouge royal, J3 émeraude, J4 jaune d'or / J5 améthyste, J6 cuivre, J7 cyan, barbare (rouge royal)</text></svg>`,
  );
  comps.push({ input: etiquette, left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#DDD8CE' } })
    .composite(comps).png().toFile(join(CAPDIR, 'fiche-8-variantes.png'));
  log('capture fiche-8-variantes.png');
}

const { cdp, proc } = await cdpConnect();
try {
  await ficheVariantes();
  await cdp.send('Page.navigate', { url: `${WEB}/#/labo-rendu` });
  await sleep(5000);
  log('zoom de départ', await cdpEval(cdp, `window.__game?.camera?.().scale ?? null`));

  // Ligne des 7 variantes seules (tuiles variées), centrée sur (3,2)
  await cdpEval(cdp, `window.__game.centerOn(3, 2)`);
  await shot(cdp, 'labo-ligne-7-variantes.png');

  // Cohabitation 3 nations sur colline (0,4) au zoom de départ
  await cdpEval(cdp, `window.__game.centerOn(0, 4)`);
  await shot(cdp, 'labo-cohabitation-3-nations.png');

  // Zoom max (ZOOM_MAX) — netteté de l'export ×2 (close-up accent)
  await cdpEval(cdp, `window.__game.centerOn(3, 2)`);
  await molette(cdp, -240, 40);
  await sleep(400);
  log('zoom max', await cdpEval(cdp, `window.__game.camera().scale`));
  await shot(cdp, 'labo-variantes-zoom-max.png');

  // Dézoom max — lisibilité de l'accent au dézoom
  await molette(cdp, 240, 80);
  await sleep(400);
  log('zoom min', await cdpEval(cdp, `window.__game.camera().scale`));
  await shot(cdp, 'labo-variantes-dezoom-max.png');

  // Sonde : les sprites des démo sont bien posés (debug)
  const sonde = await cdpEval(cdp, `(() => { const s = window.__game?.sondePile?.(); return s ? Object.keys(s.sprites).length : null })()`);
  log('sprites posés :', sonde);
} finally {
  proc.kill();
}
log('fin');
