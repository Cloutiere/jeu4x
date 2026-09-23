/**
 * Pilote TUILES-SVG (L4) — captures dev-logs/captures-tuiles-svg/ :
 * labo #/labo-rendu (GameCanvas réel, nouvelles tuiles) aux deux extrêmes
 * de zoom (molette CDP → clamp ZOOM_MIN/ZOOM_MAX, mipmap check).
 * Usage : node dev-logs/driver-captures-tuiles-svg.mjs  (vite :5174 requis)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const here = dirname(fileURLToPath(import.meta.url));
const CAPDIR = join(here, 'captures-tuiles-svg');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[TUILES]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9339;
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

const { cdp, proc } = await cdpConnect();
try {
  await cdp.send('Page.navigate', { url: `${WEB}/#/labo-rendu` });
  await sleep(4000);
  const scale0 = await cdpEval(cdp, `window.__game?.camera?.().scale ?? null`);
  log('zoom de départ', scale0);

  // dézoom max (ZOOM_MIN 0.5) — lisibilité au dézoom
  await molette(cdp, 240, 40);
  await sleep(400);
  log('zoom min', await cdpEval(cdp, `window.__game.camera().scale`));
  await shot(cdp, 'carte-labo-dezoom-max.png');

  // retour puis zoom max (ZOOM_MAX 2.25) — netteté au gros plan
  await molette(cdp, -240, 40);
  await sleep(300);
  await molette(cdp, -240, 40);
  await sleep(400);
  log('zoom max', await cdpEval(cdp, `window.__game.camera().scale`));
  await shot(cdp, 'carte-labo-zoom-max.png');
} finally {
  proc.kill();
}
log('fin');
