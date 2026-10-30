/**
 * ZII-GLM-VOIX · L3 — vérification locale RÉELLE (clé .dev.vars via wrangler dev).
 * Dialogue scripté avec Zii (GLM génération naturelle) : bonjour → menace →
 * demande de paix. Puis preuve de REPLI : wrangler relancé SANS clé
 * (ZII_GLM_API_KEY="") → répliques v1 (candidats zii.json).
 * Sorties : dev-logs/captures-zii-glm/dialogue-glm.json, repli-v1.json.
 * Usage : node devtmp/zii-glm-dialogue.mjs <portWorker=8798> [--repli]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '8798';
const REPLI = process.argv.includes('--repli');
const BASE = `http://127.0.0.1:${PORT}`;
const CAP = 'C:/Users/Erik/ZCodeProject/dev-logs/captures-zii-glm';
mkdirSync(CAP, { recursive: true });
const STAMP = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible (vite 5174 actif ? DEV_STUB_AUTH=1 ?)');
  return m[1];
}

function wsConnect(path, token) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`);
  const hist = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    hist.push(msg);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
  });
  ws.attendre = (pred, ms = 40000) =>
    new Promise((resolve, reject) => {
      const found = hist.find(pred);
      if (found) return resolve(found);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timeout attente')), ms);
    });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.hist = hist;
  const orig = ws.send.bind(ws);
  ws.envoi = (m) => orig(JSON.stringify(m));
  return ws;
}

async function dumpZii(code, adminToken) {
  const res = await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${adminToken}` } });
  return (await res.json()).zii ?? null;
}

async function phaseDialogue() {
  const token = await login(`ZiiGlmHote${STAMP}`);
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.attendre((m) => m.type === 'GameList');
  lobby.envoi({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true } });
  const created = await lobby.attendre((m) => m.type === 'GameCreated');
  const code = created.code;
  console.log('partie', code);
  const sock = wsConnect(`/ws/game/${code}`, token);
  await sock.open;
  await sock.attendre((m) => m.type === 'Snapshot');

  const adminToken = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();

  const echanges = [];
  const dialogue = [
    ['bonjour', 'Bonjour Zii ! Enchanté de faire votre connaissance.'],
    ['menace', 'Préparez vos murailles : mon armée écrasera votre capitale !'],
    ['demandePaix', 'Cessons cette folie — je vous propose la paix immédiate.'],
  ];
  for (const [etiquette, texte] of dialogue) {
    const avant = sock.hist.length;
    sock.envoi({ proto: 1, type: 'ChatSend', canal: 'general', texte });
    // La réponse de Zii (GLM ~ 0,5-3 s) arrive en ChatMessage ; on attend du calme.
    let reponse = null;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const nouveaux = sock.hist.slice(avant).filter((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1');
      if (nouveaux.length > 0) {
        // attendre un peu plus (réponse complète + journal)
        await sleep(1500);
        reponse = nouveaux.map((m) => m.message.texte).join(' | ');
        break;
      }
    }
    const zii = await dumpZii(code, adminToken);
    const derniere = zii?.journal?.[zii.journal.length - 1] ?? null;
    echanges.push({ etiquette, envoye: texte, reponseZii: reponse, journal: derniere });
    console.log(`[${etiquette}] Zii → ${reponse ?? '(PAS DE RÉPONSE)'}`);
    if (derniere) console.log(`    source=${derniere.source} latence=${derniere.latenceMs}ms jetons=${derniere.jetonsEntree} budget=${derniere.budgetApresUsd}`);
  }
  const ziiFinal = await dumpZii(code, adminToken);
  writeFileSync(`${CAP}/dialogue-glm.json`, JSON.stringify({ partie: code, echanges, resumesPourJev: ziiFinal?.resumesPourJev ?? [], journal: ziiFinal?.journal ?? [] }, null, 2));
  sock.close();
  lobby.close();
  const gen = echanges.filter((e) => e.journal?.source === 'glm').length;
  console.log(`GÉNÉRATIONS GLM : ${gen}/3 — relais resumePourJev : ${(ziiFinal?.resumesPourJev ?? []).length}`);
  return gen;
}

try {
  if (REPLI) {
    console.log('=== PHASE REPLI (sans clé) ===');
    const token = await login(`ZiiRepliHote${STAMP}`);
    const lobby = wsConnect('/ws/lobby', token);
    await lobby.open;
    await lobby.attendre((m) => m.type === 'GameList');
    lobby.envoi({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true } });
    const created = await lobby.attendre((m) => m.type === 'GameCreated');
    const code = created.code;
    const sock = wsConnect(`/ws/game/${code}`, token);
    await sock.open;
    await sock.attendre((m) => m.type === 'Snapshot');
    const adminToken = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8'))[1].trim();
    const avant = sock.hist.length;
    sock.envoi({ proto: 1, type: 'ChatSend', canal: 'general', texte: 'Bonjour Jev, que vaut ton armée ?' });
    let reponse = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const nouveaux = sock.hist.slice(avant).filter((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1');
      if (nouveaux.length > 0) { reponse = nouveaux.map((m) => m.message.texte).join(' | '); break; }
    }
    const zii = await dumpZii(code, adminToken);
    const derniere = zii?.journal?.[zii.journal.length - 1] ?? null;
    console.log(`[repli] Zii → ${reponse ?? '(PAS DE RÉPONSE)'} ; source=${derniere?.source}`);
    writeFileSync(`${CAP}/repli-v1.json`, JSON.stringify({ partie: code, reponse, journal: derniere }, null, 2));
    sock.close();
    lobby.close();
  } else {
    await phaseDialogue();
  }
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exit(1);
}
