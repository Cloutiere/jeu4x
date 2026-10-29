/**
 * ZII-V1 · L4 — dialogue RÉEL scripté (wrangler local avec clé, LLM jev-latest).
 * Partie solo adversaire Jev → salutation de début (dans le chatLog) →
 * le joueur écrit dans Général → réponse réelle de Zii (canon ChatMessage)
 * → journal Zii (ton, intention perçue) → relais resumePourJev au journal Jev
 * du tour suivant (EndTurn).
 * Usage : node devtmp/zii-dialogue-e2e.mjs [portWorker=8790]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '8790';
const BASE = `http://127.0.0.1:${PORT}`;
const DEVVARS = readFileSync('C:/Users/Erik/ZCodeProject/apps/server/.dev.vars', 'utf8');
const ADMIN_TOKEN = /^ADMIN_TOKEN=(.*)$/m.exec(DEVVARS)[1].trim();
const STAMP = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const OUT = `C:/Users/Erik/ZCodeProject/dev-logs/captures-zii-v1/dialogue-${STAMP}.json`;
mkdirSync('C:/Users/Erik/ZCodeProject/dev-logs/captures-zii-v1', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(name) {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(name)}&next=/`, { redirect: 'manual' });
  const m = /session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error('login impossible (Vite 5174 requis)');
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
  ws.attendre = (pred, ms = 60000) => new Promise((resolve, reject) => {
    const i = hist.findIndex(pred);
    if (i >= 0) return resolve(hist[i]);
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => {
      const j = waiters.indexOf(w);
      if (j >= 0) waiters.splice(j, 1); // un waiter périmé ne vole JAMAIS un message
      reject(new Error('timeout attente'));
    }, ms);
  });
  ws.open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.envoyer = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  return ws;
}

const rapport = { etapes: [] };
try {
  const token = await login('ZiiErik');
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.attendre((m) => m.type === 'GameList');
  lobby.envoyer({ proto: 1, type: 'CreateGame', settings: { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false, solo: true, playerCount: 2, adversaireJev: true } });
  const created = await lobby.attendre((m) => m.type === 'GameCreated');
  const code = created.code;
  rapport.etapes.push({ etape: 'partie créée', code });

  const jeu = wsConnect(`/ws/game/${code}`, token);
  await jeu.open;
  const welcome = await jeu.attendre((m) => m.type === 'Welcome');
  const snap = await jeu.attendre((m) => m.type === 'Snapshot');
  rapport.etapes.push({ etape: 'connecté', rencontres: welcome.rencontres ?? [] });

  // 1. Salutation de début (tirage sociabilité seedé — peut être silencieuse).
  const salut = await jeu.attendre((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1', 5000).catch(() => null);
  rapport.salutationDebut = salut ? salut.message : null;
  rapport.etapes.push({ etape: 'salutation début', obtenue: !!salut });

  // 2. Le joueur écrit dans Général → Zii répond (LLM RÉEL).
  jeu.envoyer({ proto: 1, type: 'ChatSend', canal: 'general', texte: 'Bonjour Jev ! Comment comptes-tu jouer cette partie ?' });
  const reponse = await jeu.attendre((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1' && m.message.texte !== rapport.salutationDebut?.texte, 45000);
  rapport.reponseZii = reponse.message;
  rapport.etapes.push({ etape: 'réponse Zii', texte: reponse.message.texte });

  // 3. Deuxième échange — menace (intention perçue différente attendue).
  jeu.envoyer({ proto: 1, type: 'ChatSend', canal: 'general', texte: 'Soumets-toi ou je rase tes villes.' });
  const reponse2 = await jeu.attendre((m) => m.type === 'ChatMessage' && m.message.auteur !== 'p1' && m.message.texte !== reponse.message.texte, 45000);
  rapport.reponseZii2 = reponse2.message;
  rapport.etapes.push({ etape: 'réponse Zii (menace)', texte: reponse2.message.texte });

  // 4. Historique (canon ChatHistory).
  jeu.envoyer({ proto: 1, type: 'ChatHistory' });
  const hist = await jeu.attendre((m) => m.type === 'ChatHistory');
  rapport.historique = hist.messages;

  // 5. Relais : EndTurn → résolution → journal Jev du tour doit porter le resume.
  // (Le bot solo verrouille en même temps — la résolution part.)
  jeu.envoyer({ proto: 1, type: 'EndTurn' });
  await jeu.attendre((m) => m.type === 'TurnResult', 60000);
  const dump0 = await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  rapport.ziiEtatApresEchanges = dump0.zii;
  rapport.jevMemo = dump0.jev?.memo ?? null;
  // 6. Tour suivant → le condensé Jev porte chatsPourJev.
  jeu.envoyer({ proto: 1, type: 'EndTurn' });
  await jeu.attendre((m) => m.type === 'TurnResult', 60000);
  const dump = await (await fetch(`${BASE}/admin/game/${code}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  rapport.ziiEtatFinal = dump.zii;
  rapport.jevJournalTour2 = dump.jevjournal ?? null;
  rapport.etapes.push({ etape: 'tour résolu', resumesPourJevConsommes: dump.zii?.resumesPourJev?.length === 0 });

  writeFileSync(OUT, JSON.stringify(rapport, null, 2));
  console.log('RAPPORT →', OUT);
  console.log('réponse Zii :', reponse.message.texte);
  console.log('réponse menace :', reponse2.message.texte);
} catch (e) {
  rapport.erreur = String(e);
  writeFileSync(OUT, JSON.stringify(rapport, null, 2));
  console.error('ÉCHEC :', String(e), '\nrapport →', OUT);
  process.exit(1);
}
