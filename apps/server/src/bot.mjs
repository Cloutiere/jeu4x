#!/usr/bin/env node
/**
 * Bot aléatoire — mode solo (L6, Phase 3).
 *
 * Le bot est un client COMME LES AUTRES : login stub → socket de partie →
 * à chaque tour, ordres aléatoires VALIDES (Hold, ou Move d'un pas vers une
 * case adjacente praticable connue de son état filtré) puis EndTurn.
 * AUCUNE logique dans le serveur ; le moteur revalide tout à la résolution.
 *
 * Usage : pnpm bot -- <code> <nom>   (base API : GAME_URL, défaut http://127.0.0.1:8787)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBotArgs } from './botArgs.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:8787';

// `pnpm bot -- <CODE>` : le `--` est transmis littéralement par pnpm — filtré
// dans parseBotArgs (régression Phase 5, L2).
const { code: CODE, name: NAME, valid: argsValid } = parseBotArgs(process.argv.slice(2));

if (!argsValid) {
  console.error('Usage : pnpm bot -- <CODE6> [nom]\n       GAME_URL=http://127.0.0.1:8787 par défaut.');
  process.exit(1);
}

// Terrains praticables : lu depuis les données du moteur (source unique) —
// RULES.md §2 (montagne et eau infranchissables en v1, T-11).
const terrainPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/terrain.json');
const TERRAINS = JSON.parse(readFileSync(terrainPath, 'utf8'));
const techsPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/techs.json');
const TECHS = JSON.parse(readFileSync(techsPath, 'utf8'));
// Phase 7e (L2) : le bot produit aléatoirement — items lus des mêmes JSON que
// le moteur, filtrage R-87 (tech débloquée, implémenté, prérequis de bâtiment).
const unitsPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/units.json');
const UNITS = JSON.parse(readFileSync(unitsPath, 'utf8'));
const buildingsPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/buildings.json');
const BUILDINGS = JSON.parse(readFileSync(buildingsPath, 'utf8'));
// 7l · R-135 : facteurs d'ère du rush-buy (même JSON que le moteur).
const economyPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/economy.json');
const ECONOMY = JSON.parse(readFileSync(economyPath, 'utf8'));
const WONDERS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/wonders.json');
const WONDERS = JSON.parse(readFileSync(WONDERS_PATH, 'utf8'));
/** 7l · R-135 : ère de l'empire = la plus avancée des techs débloquées
 *  (miroir minimal de growth.ts — même table era de techs.json). */
const ERA_ORDER = ['ancienne', 'medievale', 'industrielle', 'moderne'];
function techEraOf(techsUnlocked) {
  let best = 'ancienne';
  for (const era of ERA_ORDER) {
    if (techsUnlocked.some((t) => TECHS[t]?.era === era)) best = era;
  }
  return best;
}
// Phase 7f (L2) : les merveilles à effets simples + l'ONU entrent dans les
// choix du bot (R-116) ; les constantes culturelles viennent de culture.json.
const wondersPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/wonders.json');
const WONDERS = JSON.parse(readFileSync(wondersPath, 'utf8'));
const culturePath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/culture.json');
const CULTURE = JSON.parse(readFileSync(culturePath, 'utf8'));
// Phase 7h (L2) : le bot adopte ses régimes (R-122) et vise les composants du
// Vaisseau spatial en fin d'arbre (R-124) — données gouvernements/buildings.
const govsPath = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/rules/src/data/governments.json');
const GOVERNMENTS = JSON.parse(readFileSync(govsPath, 'utf8')).governments;

/** R-85 : une tech aléatoire disponible (non débloquée, prérequis satisfaits). */
function pickResearch(player) {
  const unlocked = player.techsUnlocked ?? [];
  const available = Object.values(TECHS).filter(
    (t) => !unlocked.includes(t.id) && t.prereqs.every((p) => unlocked.includes(p)),
  );
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Phase 7e : un item de production aléatoire VALIDE pour la ville (R-87) —
 * unités implémentées non obsolètes (HORS GP, R-114) + bâtiments non possédés
 * dont le prérequis de bâtiment est satisfait + merveilles 7f (R-116 : non
 * bâties/en chantier dans l'empire, ONU exigée à 20 jalons et PRIORISÉE).
 * Le Colon exige la population officielle (2 — R-112) ; 7g (R-117) : les
 * unités NAVALES n'entrent dans le tirage que pour une ville côtière.
 * Le serveur revalide tout de toute façon.
 */
function pickProduction(city, player, myCities, cultureMilestones, cityIsCoastal) {
  const unlocked = player.techsUnlocked ?? [];
  const obsolete = new Set();
  for (const techId of unlocked) for (const u of TECHS[techId]?.obsoleteUnits ?? []) obsolete.add(u);
  const obsoleteWonders = new Set();
  for (const techId of unlocked) for (const w of TECHS[techId]?.obsoleteWonders ?? []) obsoleteWonders.add(w);
  const empireWonders = new Set(myCities.flatMap((c) => c.wonders ?? []));
  const empireChantiers = new Set(
    myCities.filter((c) => c.production?.item?.kind === 'wonder').map((c) => c.production.item.id),
  );
  const options = [];
  // R-116 : à 20 jalons, le bot VISE l'ONU (victoire culturelle) — ajoutée en
  // tête, le tirage aléatoire la laisse gagner avec les autres options sinon.
  const unLocked = cultureMilestones >= CULTURE.milestonesTarget;
  if (unLocked) options.unshift({ kind: 'wonder', id: 'nations_unies' });
  for (const u of Object.values(UNITS)) {
    if (u.implemented === false || u.greatPerson) continue; // R-114 : GP jamais produits
    if (u.tech && !unlocked.includes(u.tech)) continue;
    if (obsolete.has(u.id)) continue;
    if ((u.populationCost ?? 0) > 0 && city.pop < u.populationCost) continue;
    if (u.aquatic && !cityIsCoastal) continue; // 7g · R-117 : accès à la mer
    options.push({ kind: 'unit', id: u.id });
  }
  for (const b of Object.values(BUILDINGS)) {
    if (b.fixed || b.implemented === false) continue;
    if (city.buildings.includes(b.id)) continue;
    if (b.replaces && city.buildings.includes(b.replaces)) continue;
    if (b.tech && !unlocked.includes(b.tech)) continue;
    if (b.requiresBuilding && !city.buildings.includes(b.requiresBuilding)) continue;
    options.push({ kind: 'building', id: b.id });
  }
  for (const w of Object.values(WONDERS)) {
    if (w.implemented === false || w.cultureVictory) continue; // ONU déjà priorisée
    if (w.tech && !unlocked.includes(w.tech)) continue;
    if (obsoleteWonders.has(w.id)) continue;
    if (empireWonders.has(w.id) || empireChantiers.has(w.id)) continue; // unicité R-116
    options.push({ kind: 'wonder', id: w.id });
  }
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 7h · R-122 : le régime à adopter — République dès Code des lois, puis
 * Démocratie ou Communisme selon les rendements de l'empire (or/science vs
 * production), LORSQUE la tech a été complétée CE tour (bascule sans
 * Anarchie — l'invitation du conseiller). Sinon : null (pas d'adoption, le
 * bot évite de payer un tour d'Anarchie).
 */
function pickGovernment(me, myCities, state) {
  const fresh = me.techsUnlockedThisTurn ?? [];
  const current = me.government ?? 'despotisme';
  const canFree = (id) => {
    const tech = GOVERNMENTS[id]?.tech;
    return current !== id && (!tech || fresh.includes(tech));
  };
  if (canFree('republique')) return 'republique';
  // Démocratie vs Communisme selon les rendements d'EMPIRE : commerce total
  // des cases travaillées (or/science) contre production totale — approximation
  // documentée, le moteur reste la seule source de vérité.
  let commerce = 0;
  let production = 0;
  for (const c of myCities) {
    for (const key of [...(c.workedTiles ?? []), `${c.q},${c.r}`]) {
      const tile = state.map[key];
      const y = tile && TERRAINS[tile.terrain]?.yields;
      if (!y) continue;
      commerce += y.gold ?? y.commerce ?? 0;
      production += y.production ?? 0;
    }
  }
  if (commerce >= production && canFree('democratie')) return 'democratie';
  if (production > commerce && canFree('communisme')) return 'communisme';
  // Fallback : un régime frais disponible vaut mieux que rien.
  if (canFree('democratie')) return 'democratie';
  if (canFree('communisme')) return 'communisme';
  return null;
}

const SHIP_COMPONENTS = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];

/** 7h · R-124 : un composant du vaisseau manquant (fin d'arbre — Vol spatial). */
function missingShipComponent(myCities) {
  const batis = new Set(myCities.flatMap((c) => c.buildings ?? []));
  return SHIP_COMPONENTS.find((id) => !batis.has(id)) ?? null;
}

const PROTO = 1;
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

async function loginStub() {
  const res = await fetch(`${BASE}/auth/dev?name=${encodeURIComponent(NAME)}&next=/`, { redirect: 'manual' });
  if (res.status !== 302) throw new Error(`login stub impossible : HTTP ${res.status}`);
  const cookie = res.headers.get('set-cookie') ?? '';
  const m = /session=([^;]+)/.exec(cookie);
  if (!m) throw new Error('cookie de session absent de la réponse /auth/dev');
  return m[1];
}

function wsConnect(path, token) {
  const wsUrl = `${BASE.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  const waiters = [];
  const pending = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    const i = waiters.findIndex((w) => w.type === null || w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else pending.push(msg);
  });
  const waitFor = (type, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const idx = pending.findIndex((m) => m.type === type);
      if (idx >= 0) return resolve(pending.splice(idx, 1)[0]);
      const timer = setTimeout(() => reject(new Error(`timeout en attendant ${type}`)), timeoutMs);
      waiters.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  const send = (msg) => ws.send(JSON.stringify({ proto: PROTO, ...msg }));
  const open = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error(`connexion WS impossible à ${wsUrl} (wrangler dev lancé ?)`)));
  });
  return { ws, open, waitFor, send };
}

/** Un pas vers une case adjacente praticable CONNUE (état filtré) et libre d'unité amie. */
function randomStep(unit, state, myEngineId) {
  const dirs = [
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 0],
    [1, -1],
  ];
  const candidates = [];
  for (const [dq, dr] of dirs) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue; // inconnue (brouillard) : jamais inventée
    if (!TERRAINS[tile.terrain]?.passable) continue;
    const occupiedByMine = Object.values(state.units).some((u) => u.q === q && u.r === r && u.owner === myEngineId);
    if (occupiedByMine) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const DIRS = [
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
  [1, -1],
];

function unitAtHex(state, q, r, owner) {
  return Object.values(state.units).find((u) => u.q === q && u.r === r && (!owner || u.owner === owner));
}

/** 7g · R-117 : pas NAVAL — case d'eau connue selon la classe de l'unité
 *  (navalAccess : 'coast' = côte seule, 'ocean' = côte + océan), libre d'amie. */
function navalStep(unit, state, myEngineId) {
  const stats = UNITS[unit.type];
  const candidates = [];
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    const access = TERRAINS[tile.terrain]?.navalAccess;
    if (!access) continue; // pas de l'eau
    if (access === 'ocean' && stats.navalAccess !== 'ocean') continue; // côte seule
    if (unitAtHex(state, q, r, myEngineId)) continue;
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** 7g · R-117 : débarquement — case terrestre connue, libre, adjacente. */
function landStep(unit, state, myEngineId) {
  const candidates = [];
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    if (!TERRAINS[tile.terrain]?.passable) continue;
    if (unitAtHex(state, q, r)) continue; // débarquement vers une case LIBRE
    candidates.push({ q, r });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** 7g · R-117 : transport ami adjacent à cargaison libre (Galère/Galion). */
function adjacentFreeTransport(unit, state, myEngineId) {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const t = unitAtHex(state, q, r, myEngineId);
    if (t && !t.cargo && !t.isArmy && (UNITS[t.type]?.cargoCapacity ?? 0) > 0) return { q, r };
  }
  return null;
}

/** 7g · R-119 : ville ennemie VISIBLE adjacente avec un GP installé à voler. */
function spyTarget(unit, state, myEngineId) {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const city = Object.values(state.cities).find((c) => c.q === q && c.r === r && c.owner !== myEngineId);
    if (!city) continue;
    // GP installés dérivables : jalons du propriétaire − merveilles visibles.
    const wonders = Object.values(state.cities)
      .filter((c) => c.owner === city.owner)
      .flatMap((c) => c.wonders ?? []).length;
    const gpInstalled = Math.max(0, (state.players[city.owner]?.cultureMilestones ?? 0) - wonders);
    if (gpInstalled > 0) return city;
  }
  return null;
}

/** 7g · R-117 : la ville est-elle côtière (adjacente à une case d'eau connue) ? */
function isCoastal(city, state) {
  for (const [dq, dr] of DIRS) {
    const tile = state.map[`${city.q + dq},${city.r + dr}`];
    if (tile && TERRAINS[tile.terrain]?.navalAccess) return true;
  }
  return false;
}

async function main() {
  const token = await loginStub();
  log(`Connecté en tant que « ${NAME} » (dev stub).`);

  // 1. Join via le socket de LOBBY (le GameDO refuse tout joueur non inscrit).
  const lobby = wsConnect('/ws/lobby', token);
  await lobby.open;
  await lobby.waitFor('GameList');
  lobby.send({ type: 'JoinGame', code: CODE });
  const joined = await lobby.waitFor('GameJoined', 10000);
  log(`Partie ${joined.code} rejointe via le lobby.`);
  lobby.ws.close();

  // 2. Socket de partie.
  const { ws, open, waitFor, send } = wsConnect(`/ws/game/${CODE}`, token);
  await open;
  log('Socket de partie ouvert.');

  const welcome = await waitFor('Welcome');
  const myEngineId = welcome.players.find((p) => p.id === welcome.playerId)?.engineId;
  log(`Bienvenue — tour ${welcome.turn}, statut ${welcome.status}, id moteur ${myEngineId ?? '?'}.`);
  if (!myEngineId) throw new Error('engineId introuvable dans le Welcome');

  let lastEndedTurn = -1;

  async function planTurn(snapshot) {
    const state = snapshot.state;
    if (!state || state.phase !== 'orders' || state.winner) return;
    if (snapshot.locked) {
      log(`Tour ${state.turn} : ordres déjà verrouillés, en attente de l'adversaire.`);
      return;
    }
    if (lastEndedTurn >= state.turn) return; // tour déjà traité

    const mine = Object.values(state.units).filter((u) => u.owner === myEngineId);
    let moves = 0;
    let holds = 0;
    let fortifies = 0;
    let embarks = 0;
    let disembarks = 0;
    let sails = 0;
    let missions = 0;
    for (const unit of mine) {
      const hasOrder = snapshot.orders.some((o) => 'unitId' in o && o.unitId === unit.id);
      if (hasOrder) continue; // brouillon conservé côté serveur : ne pas doubler
      const stats = UNITS[unit.type];
      // 7g · R-117 : unité EMBARQUÉE → débarquement vers une rive libre.
      if (unit.aboard) {
        const step = landStep(unit, state, myEngineId);
        if (step) {
          send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [step] } });
          disembarks += 1;
        } else {
          send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
          holds += 1;
        }
        continue;
      }
      // 7g · R-117 : unité navale → navigation sur ses eaux (côte/océan).
      if (stats?.aquatic) {
        const step = navalStep(unit, state, myEngineId);
        if (step && Math.random() < 0.8) {
          send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [step] } });
          sails += 1;
        } else {
          send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
          holds += 1;
        }
        continue;
      }
      // 7g · R-119 : l'Espion mène sa mission dès qu'une ville ennemie visible
      // adjacente a un GP installé à voler.
      if (stats?.spy) {
        const target = spyTarget(unit, state, myEngineId);
        if (target) {
          send({
            type: 'SubmitOrder',
            order: { type: 'SpyMission', unitId: unit.id, cityId: target.id, mission: 'stealGreatPerson' },
          });
          missions += 1;
          continue;
        }
      }
      // R-33 : fortifier parfois (état persistant — une unité déjà fortifiée
      // est laissée telle quelle, l'ordre n'est pas consommé).
      if (!unit.fortified && Math.random() < 0.15) {
        send({ type: 'SubmitOrder', order: { type: 'Fortify', unitId: unit.id } });
        fortifies += 1;
        continue;
      }
      // 7g · R-117 : embarquement occasionnel sur un transport ami libre.
      const transport = adjacentFreeTransport(unit, state, myEngineId);
      if (transport && Math.random() < 0.35) {
        send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [transport] } });
        embarks += 1;
        continue;
      }
      if (Math.random() < 0.4) {
        send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        holds += 1;
        continue;
      }
      const step = randomStep(unit, state, myEngineId);
      if (step) {
        send({ type: 'SubmitOrder', order: { type: 'Move', unitId: unit.id, path: [step] } });
        moves += 1;
      } else {
        send({ type: 'SubmitOrder', order: { type: 'Hold', unitId: unit.id } });
        holds += 1;
      }
    }
    // Phase 6 : de temps en temps, réassigner aléatoirement un citoyen d'une
    // ville (SetWorkedTile valide — dans le rayon, case libre ; le moteur
    // revalide tout, un ordre invalide est simplement ignoré).
    let reassigns = 0;
    const myCities = Object.values(state.cities).filter((c) => c.owner === myEngineId);
    for (const city of myCities) {
      if (Math.random() >= 0.2) continue;
      const candidates = Object.keys(state.map).filter((key) => {
        const [q, r] = key.split(',').map(Number);
        const dist = (Math.abs(q - city.q) + Math.abs(r - city.r) + Math.abs(q + r - city.q - city.r)) / 2;
        return dist >= 1 && dist <= 2;
      });
      if (candidates.length === 0) continue;
      const tile = candidates[Math.floor(Math.random() * candidates.length)];
      send({ type: 'SubmitOrder', order: { type: 'SetWorkedTile', cityId: city.id, tile } });
      reassigns += 1;
    }
    // Phase 7a (R-85) : dès qu'il n'a pas de tech en cours, le bot en choisit
    // une aléatoirement parmi les disponibles.
    const me = state.players[myEngineId];
    let research = null;
    if (me && !me.researching) {
      const tech = pickResearch(me);
      if (tech) {
        send({ type: 'SetResearch', techId: tech.id });
        research = tech.id;
      }
    }
    // 7h · R-122 : adoption de régime SANS Anarchie (bascule du conseiller).
    let adopted = null;
    if (me) {
      const gov = pickGovernment(me, myCities, state);
      if (gov) {
        send({ type: 'SetGovernment', government: gov });
        adopted = gov;
      }
    }
    // Phase 7e (L2) : villes sans file de production → un item aléatoire
    // valide (R-87 inchangé : le moteur filtre et revalide à la résolution).
    // Phase 7f (R-116) : le bot vise l'ONU à 20 jalons et bâtit les merveilles
    // à effets simples quand il peut.
    let productions = 0;
    for (const city of myCities) {
      const pendingProd = snapshot.orders.some((o) => o.type === 'SetProduction' && o.cityId === city.id);
      if (city.production || pendingProd) continue;
      // 7h · R-124 : en fin d'arbre, le bot bâtit en priorité les composants
      // du Vaisseau spatial manquants (Vol spatial débloqué).
      const component =
        (me?.techsUnlocked ?? []).includes('vol_spatial') ? missingShipComponent(myCities) : null;
      const item = component
        ? { kind: 'building', id: component }
        : pickProduction(city, me ?? {}, myCities, me?.cultureMilestones ?? 0, isCoastal(city, state));
      if (item) {
        send({ type: 'SubmitOrder', order: { type: 'SetProduction', cityId: city.id, item } });
        productions += 1;
      }
    }
    // 7l · R-135 : rush-buy déterministe simple 🔶 — achète la production
    // courante si la trésorerie couvre le coût + une réserve de sécurité
    // (30 % du coût). Items interdits (ONU/Banque mondiale) exclus ; le
    // moteur revalide tout (trésorerie, éligibilité, 1 rush/ville/tour).
    let rushes = 0;
    const SAFETY = 1.3;
    for (const city of myCities) {
      if (!city.production) continue;
      const item = city.production.item;
      const id = item.id;
      const base =
        item.kind === 'unit' ? (UNITS[id]?.cost ?? null)
        : item.kind === 'wonder' ? (WONDERS[id]?.cost ?? null)
        : (BUILDINGS[id]?.cost ?? null);
      if (base === null) continue;
      if (item.kind === 'wonder' && ECONOMY.rushForbiddenWonders.includes(id)) continue;
      const eraFactor = ECONOMY.eraRushFactors[techEraOf(me?.techsUnlocked ?? [])] ?? 2;
      const remaining = Math.max(0, base - city.production.progress);
      const cost = Math.max(1, Math.round(remaining * eraFactor));
      const treasury = me?.treasury ?? 0;
      if (treasury >= cost * SAFETY && treasury - cost > 0) {
        send({ type: 'SubmitOrder', order: { type: 'RushBuy', cityId: city.id } });
        rushes += 1;
      }
    }
    // 7j · R-126 : le bot SETTLE DÈS QUE POSSIBLE ses GP dans une ville amie
    // (choix déterministe simple 🔶 — Settle toujours, jamais Consume) via la
    // nouvelle forme d'ordre GreatPersonAction.
    let installs = 0;
    for (const unit of mine) {
      if (!UNITS[unit.type]?.greatPerson) continue;
      if (snapshot.orders.some((o) => (o.type === 'GreatPersonAction' || o.type === 'InstallPerson') && o.unitId === unit.id)) continue;
      const target = myCities.find((c) => {
        const d = (Math.abs(unit.q - c.q) + Math.abs(unit.r - c.r) + Math.abs(unit.q + unit.r - c.q - c.r)) / 2;
        return d <= 1;
      });
      if (target) {
        send({ type: 'SubmitOrder', order: { type: 'GreatPersonAction', action: 'settle', unitId: unit.id, cityId: target.id } });
        installs += 1;
      }
    }
    log(`Tour ${state.turn} : ${mine.length} unité(s) — ${moves} déplacement(s), ${holds} tenue(s), ${fortifies} fortif., ${reassigns} réassign., ${productions} prod., ${rushes} rush(s), ${installs} install. GP, ${sails} navigation(s), ${embarks} embarquement(s), ${disembarks} débarquement(s), ${missions} mission(s) d'espion.${adopted ? ` Régime adopté : ${adopted}.` : ''}`);
    send({ type: 'EndTurn' });
    lastEndedTurn = state.turn;
  }

  // Boucle de messages : planifie à chaque Snapshot, log les résultats.
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return;
    }
    if (msg.type === 'Snapshot') void planTurn(msg);
    if (msg.type === 'TurnResult') {
      log(`Tour ${msg.turn} résolu (${msg.events.length} événement(s) visibles).`);
      // Après une résolution, les deux joueurs sont déverrouillés : planifier
      // le nouveau tour depuis l'état post-résolution.
      void planTurn({ state: msg.state, orders: [], locked: false });
    }
    if (msg.type === 'OrderAck' && msg.accepted === false && msg.reason) log(`Ordre refusé : ${msg.reason}`);
    if (msg.type === 'Error') log(`Erreur serveur : ${msg.code} ${msg.message}`);
    if (msg.type === 'TurnResult' && msg.events.some((e) => e.type === 'Victory')) {
      log('Partie terminée (Victoire). Arrêt du bot.');
      ws.close();
      process.exit(0);
    }
  });

  // Le Welcome/Snapshot initiaux ont pu arriver avant la boucle : replanifie.
  void waitFor('Snapshot').then((snap) => planTurn(snap));

  const keepAlive = setInterval(() => {}, 1 << 30);
  ws.addEventListener('close', () => {
    clearInterval(keepAlive);
    log('Socket fermé.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[bot]', err.message);
  process.exit(1);
});
