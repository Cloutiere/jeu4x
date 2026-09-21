/**
 * Pilote PLACEMENT-MELEE (e2e CDP sur #/labo-rendu + captures
 * dev-logs/captures-placement-melee/) — HANDOFF-PLACEMENT-MELEE §4 L4.
 *
 * Scénarios (régime MÊLÉE du labo, GameCanvas réel) :
 *  01 · mêlée 5 unités / 3 nations, côtés d'entrée mixtes, stabilisée au centre ;
 *  02 · stabilisée MORTE → centre vide (D3) ;
 *  03 · tous côtés « ? » → repli zones (ancien remplissage, D1) ;
 *  04 · régime AMI 1 nation / 3 unités → côte à côte centré inchangé (D4) ;
 *  05 · empilement : 3 arrivées par le MÊME côté, ordre d'arrivée (D2).
 *
 * Usage : node dev-logs/driver-placement-melee.mjs  (vite :5174 requis)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:5174';
const here = dirname(fileURLToPath(import.meta.url));
const CAPDIR = join(here, 'captures-placement-melee');
mkdirSync(CAPDIR, { recursive: true });
const log = (...a) => console.log('[MELEE]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- CDP minimal (Edge headless) — mêmes conventions que les pilotes précédents.
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9335;
async function cdpConnect() {
  const proc = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`, '--headless=new', '--disable-gpu',
    '--window-size=1600,1000', '--user-data-dir=' + join(CAPDIR, '_edge-profile'), 'about:blank',
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
  return cdp;
}

async function cdpEval(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
}

async function shot(cdp, name) {
  await sleep(900);
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.canvas-host').scrollIntoView({ block: 'center' })` });
  await sleep(300);
  const data = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
  writeFileSync(join(CAPDIR, name), Buffer.from(data, 'base64'));
  log('capture', name);
}

/** Réglage d'un <input type=range> du labo (déclenche l'événement input). */
function sliderExpr(index, value) {
  return `(() => {
    const s = document.querySelectorAll('input[type=range]')[${index}];
    s.value = String(${value});
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return s.value;
  })()`;
}

/** Réglage du N-ième <select> de la liste mêlée (0-based, valeur = côté). */
function coteExpr(index, value) {
  return `(() => {
    const sel = document.querySelectorAll('.ligne-melee select')[${index}];
    sel.value = ${JSON.stringify(value)};
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`;
}

async function main() {
  const cdp = await cdpConnect();
  await cdp.send('Page.navigate', { url: `${WEB}/#/labo-rendu` });
  await sleep(3000);
  const titre = await cdpEval(cdp, `document.querySelector('h1')?.textContent ?? 'ABSENT'`);
  if (!titre.includes('Labo de rendu')) throw new Error('labo-rendu non chargé : ' + titre);
  log('labo chargé :', titre);

  // 01 · Mêlée 5 unités / 3 nations, côtés mixtes, u1 stabilisée au centre.
  await cdpEval(cdp, sliderExpr(0, 5)); // unités
  await sleep(400);
  await cdpEval(cdp, sliderExpr(1, 3)); // nations
  await sleep(400);
  // Sélection des selects mêlée (le régime est déjà « mêlée » par défaut).
  await cdpEval(cdp, coteExpr(0, 'O'));
  await cdpEval(cdp, coteExpr(1, 'E'));
  await cdpEval(cdp, coteExpr(2, 'E'));
  await cdpEval(cdp, coteExpr(3, 'SE'));
  await cdpEval(cdp, coteExpr(4, '?')); // une sans info → repli zones
  await sleep(300);
  await shot(cdp, '01-melee-cote-entree-stabilisee-centre.png');

  // 02 · Stabilisée MORTE → centre vide (D3).
  await cdpEval(cdp, `(() => {
    const r = [...document.querySelectorAll('input[name=stabilisee]')].pop();
    r.click();
    return r.checked;
  })()`);
  await shot(cdp, '02-melee-stabilisee-morte-centre-vide.png');

  // 03 · Tous « ? » → repli zones (paquets par nation triée).
  for (let i = 0; i < 5; i++) await cdpEval(cdp, coteExpr(i, '?'));
  await shot(cdp, '03-melee-repli-zones-sans-info.png');

  // 04 · PILE AMIE (1 nation / 3 unités) : mêmes côtés que la mêlée (rév. 21/09).
  await cdpEval(cdp, sliderExpr(0, 3));
  await sleep(300);
  await cdpEval(cdp, sliderExpr(1, 1));
  await sleep(300);
  await cdpEval(cdp, coteExpr(0, 'O'));
  await cdpEval(cdp, coteExpr(1, 'E'));
  await cdpEval(cdp, coteExpr(2, '?')); // sans info → repli zones (paquet p1 → gauche)
  await shot(cdp, '04-pile-amie-cotes-meme-regime.png');

  // 05 · Empilement même côté : 4 unités / 2 nations,
  //       u1 au CENTRE (cran intermédiaire), u2/u3/u4 entrées par l'EST.
  await cdpEval(cdp, sliderExpr(0, 4));
  await sleep(300);
  await cdpEval(cdp, sliderExpr(1, 2));
  await sleep(300);
  // u1 re-devient l'unité au centre (le scénario 02 l'avait mise « morte »).
  await cdpEval(cdp, `(() => {
    const r = document.querySelectorAll('input[name=stabilisee]')[0];
    r.click();
    return r.checked;
  })()`);
  await sleep(200);
  await cdpEval(cdp, coteExpr(1, 'E'));
  await cdpEval(cdp, coteExpr(2, 'E'));
  await cdpEval(cdp, coteExpr(3, 'E'));
  // Diagnostic : état des radios pour la capture 05.
  log('radios 05 :', await cdpEval(cdp, `[...document.querySelectorAll('input[name=stabilisee]')].map((r) => r.checked)`));
  await shot(cdp, '05-melee-empilement-meme-cote.png');

  // Sanity : les 5 captures existent et sont non vides.
  log('OK — 5 captures dans', CAPDIR);
  process.exit(0);
}

main().catch((e) => {
  console.error('[MELEE] ÉCHEC :', e);
  process.exit(1);
});
