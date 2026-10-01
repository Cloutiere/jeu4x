/**
 * FULLSCREEN-PERF · L0 — mesures fenêtré vs plein écran émulé (DPR effectif).
 * Voie Roxy (playwright-core + msedge headful, GPU réel) — même protocole que
 * capture-assets-4k.mjs. Usage : node devtmp/perf-fullscreen.mjs [tourCible=12]
 *
 * Principe : le DPR effectif (backing store = CSS × DPR) est LA variable que
 * F11 change (PLEIN-ECRAN-NET suit le DPR, borne 4). On fige
 * window.devicePixelRatio à N (defineProperty) — suivreDpr() s'aligne à la
 * frame suivante — et on mesure le FPS rAF réel sur 3 s à chaque palier.
 * Isolements : minimap masquée (S2), UI DOM masquée (S3).
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Erik/ZCodeProject/desktop/package.json');
const { chromium } = require('playwright-core');
import * as fs from 'node:fs';

const BASE_WEB = 'http://localhost:5174';
const BASE_SRV = 'http://127.0.0.1:8787';
const TOUR = Number(process.argv[2] ?? 12);
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-fullscreen-perf';
const OUT = 'C:/Users/Erik/ZCodeProject/dev-logs/perf-fullscreen';
fs.mkdirSync(CAP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---- 1) partie solo poussée au tour cible (même voie que hang-creer-solo)
const res = await fetch(`${BASE_SRV}/auth/dev?name=PerfProbe&next=/`, { redirect: 'manual' });
const tok = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')[1];
const ws = new WebSocket(`ws://127.0.0.1:8787/ws/lobby?token=${tok}`);
let code = null;
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'GameCreated') { code = m.code; console.log('partie créée', code); ws.close(); jouer(); }
});
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
ws.send(JSON.stringify({ proto: 1, type: 'CreateGame', settings: { mapId: 'pangee-40', turnTimerMinutes: null, isPublic: false, solo: true, botCivId: 'zoulous' } }));

async function jouer() {
  const g = new WebSocket(`ws://127.0.0.1:8787/ws/game/${code}?token=${tok}`);
  await new Promise((r, j) => { g.addEventListener('open', r); g.addEventListener('error', j); });
  let tours = 0;
  g.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'TurnResult') {
      tours++;
      if (m.turn >= TOUR) { console.log(`prête : tour ${m.turn}`); g.close(); }
      else g.send(JSON.stringify({ proto: 1, type: 'EndTurn' }));
    }
  });
  setTimeout(() => g.send(JSON.stringify({ proto: 1, type: 'EndTurn' })), 1200);
  setTimeout(() => { console.log('timeout tours, tour atteint inconnu'); process.exit(1); }, 120000);
}
await new Promise((r) => setTimeout(r, 8000)); // laisse la partie se résoudre

// ---- 2) navigateur réel (headful, GPU machine) sur la partie
const nav = await chromium.launch({ channel: 'msedge', headless: false, args: ['--window-size=1920,1080', '--window-position=0,0'] });
const ctx = await nav.newContext({ viewport: null });
await ctx.addInitScript(() => { localStorage.setItem('calque-dev', 'true'); });
const page = await ctx.newPage();
await page.goto(`${BASE_WEB}/auth/dev?name=PerfProbe&next=/`, { waitUntil: 'domcontentloaded' });
await page.goto(`${BASE_WEB}/#/game/${code}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.perfResume, null, { timeout: 30000 });
await page.waitForTimeout(4000);

const meta = await page.evaluate(() => ({
  ecran: { w: screen.width, h: screen.height },
  dprOS: window.devicePixelRatio,
  gpu: (() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (e) { return null; } })(),
  ua: navigator.userAgent,
}));
console.log('environnement :', JSON.stringify(meta));

// dézoom complet (toute la carte dessinée = pire cas de remplissage)
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(120); }

// ---- 3) balayage DPR (émulation F11 : backing store = CSS × DPR)
async function mesurer(label, dpr, isolement = null) {
  const avant = await page.evaluate((d) => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => d });
    window.__game.perfReset();
    return window.__game.perfResume();
  }, dpr);
  await page.waitForTimeout(800); // suivreDpr s'aligne + rebuilds
  const echantillon = await page.evaluate(async () => {
    const n0 = performance.now();
    let frames = 0;
    await new Promise((fini) => {
      const boucle = () => { frames++; if (performance.now() - n0 < 3000) requestAnimationFrame(boucle); else fini(); };
      requestAnimationFrame(boucle);
    });
    const app = window.__gameCanvas.app();
    return {
      fps: Math.round((frames / (performance.now() - n0)) * 1000),
      ...window.__game.perfResume(),
      finalRes: app.renderer.resolution,
      finalW: app.canvas.width,
      finalH: app.canvas.height,
    };
  });
  const capture = `${CAP}/${label}.png`;
  await page.screenshot({ path: capture });
  console.log(label, JSON.stringify(echantillon));
  return { label, isolement, dprDemande: dpr, ...echantillon };
}

const mesures = [];
mesures.push(await mesurer('01-fenetree-dpr1', 1));
mesures.push(await mesurer('02-pleinecran-dpr2', 2));
mesures.push(await mesurer('03-pleinecran-dpr3', 3));
mesures.push(await mesurer('04-pleinecran-dpr4-borne', 4));
mesures.push(await mesurer('05-fenetree-dpr1-bis', 1));

// ---- 4) isolements au palier max
await page.evaluate(() => { document.querySelector('.minimap-site').style.display = 'none'; });
mesures.push(await mesurer('06-dpr4-sans-minimap', 4, 'sans-minimap'));
await page.evaluate(() => { document.querySelector('.minimap-site').style.display = ''; });
await page.evaluate(() => { document.querySelector('header').style.display = 'none'; document.querySelector('.minimap-site').style.display = 'none'; });
mesures.push(await mesurer('07-dpr4-sans-ui-dom', 4, 'sans-ui-dom'));
await page.evaluate(() => { document.querySelector('header').style.display = ''; document.querySelector('.minimap-site').style.display = ''; });

// ---- 5) rapport
const rapport = { date: new Date().toISOString(), code, tour: TOUR, meta, mesures };
fs.writeFileSync(`${OUT}/mesures.json`, JSON.stringify(rapport, null, 2));
console.log('\n=== TABLEAU ===');
for (const m of mesures) console.log(`${m.label.padEnd(28)} dpr=${m.dpr} backing=${m.finalW}x${m.finalH} fps=${m.fps} frameMoy=${m.frameMoyenneMs}ms frameMax=${m.frameMaxMs}ms`);
await nav.close();
process.exit(0);
