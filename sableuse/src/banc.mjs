#!/usr/bin/env node
/**
 * Banc de calibrage (HANDOFF-JEV-BANC L1) — séries de parties 5 nations
 * (50×40 libreMulti) pilotées par Jev v2 + armée de contrôle all-bot, avec
 * plan pré-généré (D3), reprise sur interruption (D1/D7), garde-fou budget
 * 2 $ global (D7) et RAPPORT.md lisible (D6). Outil HORS LIGNE.
 *
 *   node src/banc.mjs --generer-plan bancs/banc-2026-09-28 [--parties 30] [--controle 10] [--plan-seed N]
 *   node src/banc.mjs --plan bancs/banc-2026-09-28 [--faux] [--base 0.0932]
 *   node src/banc.mjs --plan bancs/banc-2026-09-28 --rapport
 *
 * Zéro changement moteur/serveur : le harnais (partie.mjs) consomme
 * generateProceduralMap({playerCount:5}) + civSetup (R-150), identiques au
 * serveur. Adapter/questions/condensé GELÉS (D2) — appelés tels quels.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allKnownTechs, cityEconomyInputs } from '@game/rules';
import { Journal } from './journal.mjs';
import { jouerPartie } from './partie.mjs';
import { creerFauxJev } from './faux-jev.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les 16 civilisations du jeu (packages/rules data/civilizations.json). */
const CIVS = ['amerique', 'arabie', 'azteques', 'chine', 'egypte', 'angleterre', 'france', 'allemagne', 'grece', 'inde', 'japon', 'mongolie', 'rome', 'russie', 'espagne', 'zoulous'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 24)) >>> 0) / 4294967296;
  };
}

function arg(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : defaut;
}

/** Rotation équilibrée SANS REMISE (D3 banc 2) : 5 civs DISTINCTES par partie
 * (le doublon Égypte/Égypte du banc 1 venait du tirage avec remise du
 * plan-generator), mélange seedé par partie — l'équilibre global des 16 civs
 * est conservé en moyenne et verrouillé par test. */
function attribuerCivs(rng, nSieges, nParties) {
  const parPartie = [];
  for (let p = 0; p < nParties; p++) {
    const deck = [...CIVS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const cle = {};
    deck.slice(0, nSieges).forEach((c, i) => { cle[`p${i + 1}`] = c; });
    parPartie.push(cle);
  }
  return parPartie;
}

async function genererPlan() {
  const dossier = arg('generer-plan');
  const nJev = Number(arg('parties', 30));
  const nControle = Number(arg('controle', 10));
  const planSeed = Number(arg('plan-seed', Date.now() % 1_000_000_000));
  if (existsSync(join(dossier, 'plan.json'))) {
    console.error(`Refus : ${dossier}/plan.json existe déjà — jamais écraser un banc en cours (D3).`);
    process.exit(1);
  }
  const rng = mulberry32(planSeed);
  const parties = [];
  let seedBase = 1_000_000 + Math.floor(rng() * 8_000_000);
  const civsJev = attribuerCivs(rng, 5, nJev);
  const civsControle = attribuerCivs(rng, 5, nControle);
  for (let i = 0; i < nJev; i++) {
    parties.push({ idx: i + 1, seed: seedBase + i * 7919, controle: false, siegeJev: 1 + ((i * 3) % 5), civs: civsJev[i] });
  }
  for (let i = 0; i < nControle; i++) {
    parties.push({ idx: nJev + i + 1, seed: seedBase + 100_000 + i * 7919, controle: true, siegeJev: null, civs: civsControle[i] });
  }
  const plan = { planSeed, date: new Date().toISOString(), nJev, nControle, playerCount: 5, plafondTours: 150, parties };
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'plan.json'), JSON.stringify(plan, null, 2));
  writeFileSync(join(dossier, 'etat.json'), JSON.stringify({ parties: {} }, null, 2));
  console.log(`Plan écrit : ${dossier}/plan.json (${nJev} Jev + ${nControle} contrôle, planSeed ${planSeed})`);
}

async function creerClient(faux) {
  if (faux) return creerFauxJev({ graine: 77 });
  process.env.TYPESAFE_API_KEY = readFileSync(join(racine, '.env.local'), 'utf8').match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
  const { TypeSafeClient } = await import('@typesafe-ai/sdk');
  return new TypeSafeClient({ model: 'jev-latest' });
}

/** Coût à date du dépôt (journaux hors bancs, racine journaux/ uniquement). */
function coutBaseline() {
  let total = 0;
  try {
    for (const f of readdirSync(join(racine, 'journaux'))) {
      if (!f.endsWith('.jsonl')) continue;
      const lignes = readFileSync(join(racine, 'journaux', f), 'utf8').trim().split('\n');
      const fin = lignes.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o?.type === 'fin');
      if (fin?.coutTotalUsd) total += fin.coutTotalUsd;
    }
  } catch { /* journaux absents : 0 */ }
  return total;
}

async function executer() {
  const dossier = arg('plan');
  const faux = arg('faux', false) === true;
  const budgetGlobal = Number(arg('budget-global', 2));
  const baseForcee = arg('base', null);
  const plan = JSON.parse(readFileSync(join(dossier, 'plan.json'), 'utf8'));
  const cheminEtat = join(dossier, 'etat.json');
  const etatBanc = JSON.parse(readFileSync(cheminEtat, 'utf8'));
  const config = JSON.parse(readFileSync(join(racine, 'questions.json'), 'utf8'));
  const client = await creerClient(faux);
  const dejaConsommee = baseForcee !== null ? Number(baseForcee) : coutBaseline();
  const clientFaux = faux;
  let echecsDoublons = 0;

  for (const p of plan.parties) {
    const precedent = etatBanc.parties[p.idx];
    if (precedent?.statut) {
      console.log(`[${p.idx}/${plan.parties.length}] déjà ${precedent.statut} — sautée`);
      continue;
    }
    const restant = Math.max(0, budgetGlobal - dejaConsommee - coutBanc(etatBanc));
    if (restant < 0.005 && !p.controle) {
      console.log(`Budget global atteint (${budgetGlobal} $) — parties Jev restantes non jouées.`);
      etatBanc.parties[p.idx] = { statut: 'coupe-budget' };
      ecrire(cheminEtat, etatBanc);
      continue;
    }
    const civSetup = {};
    Object.entries(p.civs).forEach(([sid, civId], i) => { civSetup[`p${i + 1}`] = { civId }; });
    const fichier = join(dossier, 'journaux', `partie-${String(p.idx).padStart(3, '0')}-${p.controle ? 'controle' : 'jev'}-seed${p.seed}.jsonl`);
    let ok = false;
    for (let tentative = 1; tentative <= 2 && !ok; tentative++) {
      const journal = new Journal(fichier);
      const t0 = Date.now();
      try {
        const { etat, coupeParBudget } = await jouerPartie({
          client, config, seed: p.seed, plafondTours: plan.plafondTours, journal,
          budgetUsd: Math.min(restant, 0.5),
          playerCount: plan.playerCount,
          civSetup,
          sansJev: p.controle,
          // D1 banc-suivi : le harnais consomme enfin la rotation des sièges
          // du plan (V4 §5 — Jev jouait toujours p2). siegeJev null
          // (contrôle) → défaut harnais inchangé (rétro-compat bancs).
          engineJev: p.siegeJev ? `p${p.siegeJev}` : undefined,
        });
        const fin = { statut: coupeParBudget ? 'coupe-budget' : 'fait', fichier: basename(fichier), coutUsd: journal.coutUsd(), tours: etat.turn, gagnant: etat.winner, ms: Date.now() - t0 };
        etatBanc.parties[p.idx] = fin;
        ok = true;
        console.log(`[${p.idx}/${plan.parties.length}] ${p.controle ? 'CONTRÔLE' : 'jev'} seed ${p.seed} → gagnant ${etat.winner ?? 'aucun'} en ${etat.turn} tours, coût ${journal.coutUsd().toFixed(4)} $, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      } catch (e) {
        console.error(`[${p.idx}] tentative ${tentative} échouée : ${e.message}`);
        if (tentative === 2) {
          etatBanc.parties[p.idx] = { statut: 'echec', cause: String(e.message ?? e) };
          echecsDoublons++;
        }
      }
      ecrire(cheminEtat, etatBanc);
    }
  }
  console.log(`Exécution terminée : ${Object.values(etatBanc.parties).filter((s) => s.statut === 'fait').length} faites, ${echecsDoublons} échecs définitifs. --rapport pour RAPPORT.md.`);
}

function ecrire(chemin, objet) {
  writeFileSync(chemin, JSON.stringify(objet, null, 2));
}

function coutBanc(etatBanc) {
  return Object.values(etatBanc.parties).reduce((s, p) => s + (p.coutUsd ?? 0), 0);
}

/** Lit un journal JSONL de partie → métriques D5. */
function metriquesPartie(chemin, entree) {
  const lignes = readFileSync(chemin, 'utf8').trim().split('\n');
  const meta = JSON.parse(lignes.find((l) => l.includes('"type":"meta"')));
  const joueurs = Object.fromEntries(meta.joueurs.map((j) => [j.id, j]));
  const villes = {};
  const techs = {};
  const victoires = [];
  for (const l of lignes) {
    if (!l.includes('"type":"evenement"')) continue;
    const ev = JSON.parse(l).evenement;
    if (ev.type === 'CityFounded') villes[ev.owner] = (villes[ev.owner] ?? 0) + 1;
    else if (ev.type === 'TechResearched') techs[ev.player] = (techs[ev.player] ?? 0) + 1;
    else if (ev.type === 'Victory') victoires.push(ev);
  }
  const fin = JSON.parse(lignes.reverse().find((l) => l.includes('"type":"fin"')));
  // D6 / critère 1 : fondations DÉCIDÉES par Jev = ordres FoundCity traduits
  // par l'adaptateur (vs repli bot) — l'arrivée de la ville est différée.
  let fondationsJev = 0;
  for (const l of lignes) {
    if (!l.includes('"type":"decision"')) continue;
    try {
      const d = JSON.parse(l);
      if ((d.ordresJev ?? []).some((o) => o.type === 'FoundCity')) fondationsJev += 1;
    } catch { /* ligne tronquée */ }
  }
  const gagnant = fin.gagnant ?? victoires.at(-1)?.winner ?? null;
  // V4 D2 : prédictions gainNet des fondations Jev (comparées aux rendements
  // réels finaux — table prédiction vs réel du rapport).
  const fondationsPredites = [];
  for (const l of lignes) {
    if (!l.includes('"type":"fondation"')) continue;
    try {
      const f = JSON.parse(l);
      if (f.gainNetPredite != null) fondationsPredites.push(f);
    } catch { /* ligne tronquée */ }
  }
  const regleConversion = fin.regleConversion ?? null;
  return {
    idx: entree.idx, controle: entree.controle, seed: meta.seed, tournee: fin.toursJoues,
    coupeParBudget: fin.coupeParBudget ?? false,
    gagnant, raison: victoires.at(-1)?.reason ?? null,
    gagnantCiv: gagnant ? joueurs[gagnant]?.civId : null,
    gagnantJev: gagnant ? joueurs[gagnant]?.pilote === 'jev' : false,
    civs: meta.joueurs.map((j) => ({ id: j.id, civId: j.civId, pilote: j.pilote })),
    villesFondees: villes, techs, fondationsJev,
    scores: fin.scores ?? null,
    scenario: meta.scenario ?? null,
    regleConversion,
    fondationsPredites,
    guerresInterNations: fin.guerresInterNations ?? [],
    replis: fin.replisTotaux ?? 0, appels: fin.appels ?? 0,
    coutUsd: fin.coutTotalUsd ?? 0,
    latenceMoyMs: fin.latenceMoyMs ?? null, latenceMaxMs: fin.latenceMaxMs ?? null,
  };
}

/** V4 : rendements réels finaux d'une partie — reconstruits depuis les lignes
 * 'fondation' (prédictions) ; les rendements par ville à l'arrivée sont lus
 * sur l'état final re-joué UNIQUEMENT via les journaux disponibles : ici on
 * agrège les rendements par ville fournis dans la ligne 'fin' par le harnais. */
function rendementsFinauxPartie(chemin) {
  const lignes = readFileSync(chemin, 'utf8').trim().split('\n');
  const fin = JSON.parse(lignes.reverse().find((l) => l.includes('"type":"fin"')));
  return fin.rendementsFinaux ?? null;
}

/** V4 : relevés de rendements des villes jeunes (âge 10 tours) — la table
 * prédiction vs réel honnête (le final d'une ville de 150 tours inclut les
 * bâtiments/multiplicateurs et n'est PAS comparable à la prédiction). */
function rendementsJeunesPartie(chemin) {
  const lignes = readFileSync(chemin, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const l of lignes) {
    if (!l.includes('"type":"rendement_jeune"')) continue;
    try {
      const r = JSON.parse(l);
      if (r.gainNetPredite != null) out.push(r);
    } catch { /* ligne tronquée */ }
  }
  return out;
}

function pct(n, d) { return d ? (100 * n / d).toFixed(0) + ' %' : '—'; }

async function rapport() {
  const dossier = arg('plan');
  const etatBanc = JSON.parse(readFileSync(join(dossier, 'etat.json'), 'utf8'));
  const plan = JSON.parse(readFileSync(join(dossier, 'plan.json'), 'utf8'));
  const m = [];
  const anomalies = [];
  for (const [idxStr, info] of Object.entries(etatBanc.parties)) {
    if (info.statut !== 'fait') continue;
    const chemin = join(dossier, 'journaux', info.fichier ?? `partie-${String(idxStr).padStart(3, '0')}`);
    if (!existsSync(chemin)) continue;
    m.push(metriquesPartie(chemin, { idx: Number(idxStr), controle: plan.parties[Number(idxStr) - 1]?.controle }));
    m[m.length - 1].rendementsFinaux = rendementsFinauxPartie(chemin);
    m[m.length - 1].rendementsJeunes = rendementsJeunesPartie(chemin);
  }
  // Sidecar facultatif guerres.json (recalcul par rejou moteur, filtre
  // barbarien corrigé après-coup — ne touche jamais aux journaux bruts).
  const cheminGuerres = join(dossier, 'guerres.json');
  if (existsSync(cheminGuerres)) {
    const g = JSON.parse(readFileSync(cheminGuerres, 'utf8'));
    for (const x of m) {
      const cle = Object.keys(g).find((f) => f.startsWith(`partie-${String(x.idx).padStart(3, '0')}-`));
      if (cle) x.guerresInterNations = g[cle] ?? [];
    }
  }
  const jev = m.filter((x) => !x.controle);
  const ctrl = m.filter((x) => x.controle);
  const out = [];
  out.push(`# RAPPORT DE BANC DE CALIBRAGE — ${basename(dossier)}\n`);
  out.push(`Plan seed ${plan.planSeed} — ${plan.nJev} parties Jev v2 + ${plan.nControle} contrôle, 5 nations, 50×40 libreMulti, plafond ${plan.plafondTours} tours.\n`);
  out.push(`> ⚠️ Échantillon COARSE (D1) : ~30 parties par bras = intervalles naïfs, détection d'anomalies — PAS un verdict définitif.\n`);

  const echecs = Object.entries(etatBanc.parties).filter(([, p]) => p.statut === 'echec' || p.statut === 'coupe-budget');
  if (echecs.length) out.push(`**Parties non abouties** : ${echecs.map(([i, p]) => `#${i} (${p.statut}${p.cause ? ' : ' + p.cause : ''})`).join(', ')}\n`);

  // V4 D3 : CLASSEMENT des 16 civs par score moyen à horizon fixe (bras Jev
  // et contrôle séparés + toutes parties) + distribution par composante.
  const parCiv = {};
  for (const x of m) {
    if (!x.scores) continue;
    for (const j of x.civs) {
      const s = x.scores[j.id];
      if (!s) continue;
      const e = parCiv[j.civId] ?? (parCiv[j.civId] = { n: 0, nJ: 0, nC: 0, tot: 0, totJ: 0, totC: 0, comp: { villes: 0, pop: 0, techs: 0, merveilles: 0, tresorerie: 0 } });
      e.n++; e.tot += s.total;
      if (x.controle) { e.nC++; e.totC += s.total; } else { e.nJ++; e.totJ += s.total; }
      for (const k of Object.keys(e.comp)) e.comp[k] += s.composantes[k] ?? 0;
    }
  }
  const classement = Object.entries(parCiv)
    .map(([civ, e]) => ({ civ, moy: e.tot / Math.max(1, e.n), moyJ: e.nJ ? e.totJ / e.nJ : null, moyC: e.nC ? e.totC / e.nC : null, n: e.n, nJ: e.nJ, nC: e.nC, comp: Object.fromEntries(Object.entries(e.comp).map(([k, v]) => [k, v / Math.max(1, e.n)])) }))
    .sort((a, b) => b.moy - a.moy);
  const configBanc = JSON.parse(readFileSync(join(racine, 'questions.json'), 'utf8'));
  const poids = configBanc.score ?? {};
  if (classement.length) {
    out.push(`## V4 — Classement des civilisations par score moyen (horizon ${plan.plafondTours} tours)\n`);
    out.push(`> Score = villes×${poids.villes ?? 10} + pop×${poids.pop ?? 2} + techs×${poids.techs ?? 30} + merveilles×${poids.merveilles ?? 100} + trésorerie/${poids.divTresorerie ?? 10}. Détection d'anomalies, PAS un verdict (D6).\n`);
    out.push(`| Rang | Civ | Score moy | Jev | Contrôle | Parties | villes | pop | techs | merveilles | trésorerie |`);
    out.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
    classement.forEach((c, i) => {
      out.push(`| ${i + 1} | ${c.civ} | ${c.moy.toFixed(1)} | ${c.moyJ != null ? c.moyJ.toFixed(1) : '—'} | ${c.moyC != null ? c.moyC.toFixed(1) : '—'} | ${c.n} | ${c.comp.villes.toFixed(1)} | ${c.comp.pop.toFixed(1)} | ${c.comp.techs.toFixed(1)} | ${c.comp.merveilles.toFixed(1)} | ${c.comp.tresorerie.toFixed(0)} |`);
    });
    out.push('');
    const médiane = classement[Math.floor(classement.length / 2)].moy;
    const anomaliesV4 = [];
    const ecrasante = classement[0];
    if (ecrasante && médiane > 0 && ecrasante.moy >= 1.5 * médiane) {
      anomaliesV4.push(`Civ candidate écrasante au score : **${ecrasante.civ}** (${ecrasante.moy.toFixed(1)} vs médiane ${médiane.toFixed(1)}) — banc de suivi ciblé recommandé.`);
    }
    const fantome = classement[classement.length - 1];
    if (fantome && médiane > 0 && fantome.moy <= 0.5 * médiane) {
      anomaliesV4.push(`Civ candidate fantôme au score : **${fantome.civ}** (${fantome.moy.toFixed(1)} vs médiane ${médiane.toFixed(1)}) — banc de suivi ciblé recommandé.`);
    }
    if (anomaliesV4.length) out.push(anomaliesV4.map((a) => `- ⚠️ ${a}`).join('\n') + '\n');
  }

  // V4 D2 : prédiction gainNet vs rendements réels des villes JEUNES (âge
  // 10 tours, propriétaire Jev — échelle comparable à la formule).
  const ecart = [];
  for (const x of m) {
    for (const r of x.rendementsJeunes ?? []) {
      ecart.push({ predite: r.gainNetPredite, reel: r.rendement, ratio: r.gainNetPredite / Math.max(0.1, r.rendement), ville: r.ville, tour: r.tour });
    }
  }
  if (ecart.length) {
    const ratioMoy = ecart.reduce((s, e) => s + e.ratio, 0) / ecart.length;
    const dans50 = ecart.filter((e) => e.ratio >= 0.5 && e.ratio <= 1.5).length;
    out.push(`## V4 — Prédiction gainNet vs rendements réels (fondations Jev, villes JEUNES à 10 tours)\n`);
    out.push(`- ${ecart.length} fondations comparées — ratio moyen prédit/réel : **${ratioMoy.toFixed(2)}×** (cible ±50 %), ${dans50}/${ecart.length} dans [0,5 ; 1,5].`);
    out.push(`- Détail (prédite → réel) : ${ecart.slice(0, 12).map((e) => `${e.predite.toFixed(1)}→${e.reel.toFixed(1)}`).join(', ')}${ecart.length > 12 ? ' …' : ''}\n`);
  }

  // Science débloquée (V4 critère 1) : techs complétées par empire.
  const techsParEmpire = m.map((x) => Object.values(x.techs).reduce((a, b) => a + b, 0) / Math.max(1, x.civs.length));
  if (techsParEmpire.length) {
    const moyTechs = techsParEmpire.reduce((a, b) => a + b, 0) / techsParEmpire.length;
    out.push(`## V4 — Science débloquée (règle regle:conversion)\n`);
    out.push(`- Techs complétées par empire : moyenne **${moyTechs.toFixed(1)}**, min ${Math.min(...techsParEmpire).toFixed(0)}, max ${Math.max(...techsParEmpire).toFixed(0)} (banc 2 : ~0). Parties sous le critère (≥ 2-3) : ${techsParEmpire.filter((t) => t < 2).length}/${m.length}.\n`);
  }

  // Anomalies en tête (D6)
  const winByCiv = {};
  for (const x of m) if (x.gagnantCiv) winByCiv[x.gagnantCiv] = (winByCiv[x.gagnantCiv] ?? 0) + 1;
  const jouesParCiv = {};
  for (const x of m) for (const c of x.civs) jouesParCiv[c.civId] = (jouesParCiv[c.civId] ?? 0) + 1;
  const tauxCiv = Object.entries(winByCiv).map(([c, w]) => [c, w, jouesParCiv[c] ?? 0, w / (jouesParCiv[c] ?? 1)]);
  tauxCiv.sort((a, b) => b[3] - a[3]);
  const nParties = m.length;
  if (tauxCiv[0] && tauxCiv[0][3] >= 0.5 && tauxCiv[0][2] >= 5) anomalies.push(`Civ écrasante : **${tauxCiv[0][0]}** gagne ${pct(tauxCiv[0][1], tauxCiv[0][2])} de ses parties (${tauxCiv[0][1]}/${tauxCiv[0][2]}).`);
  const civsAbsentes = CIVS.filter((c) => !(c in winByCiv) && (jouesParCiv[c] ?? 0) >= 5);
  if (civsAbsentes.length) anomalies.push(`Civs jamais gagnantes (≥5 parties jouées) : ${civsAbsentes.join(', ')}.`);
  const raisons = {};
  for (const x of m) if (x.raison) raisons[x.raison] = (raisons[x.raison] ?? 0) + 1;
  const raisonDom = Object.entries(raisons).sort((a, b) => b[1] - a[1])[0];
  if (raisonDom && raisonDom[1] / Math.max(1, m.filter((x) => x.gagnant).length) > 0.85) anomalies.push(`Type de victoire dominant : **${raisonDom[0]}** (${raisonDom[1]} sur ${m.filter((x) => x.gagnant).length} parties décidées).`);
  const longueurs = m.map((x) => x.tournee);
  const moy = longueurs.reduce((a, b) => a + b, 0) / Math.max(1, longueurs.length);
  const sd = Math.sqrt(longueurs.reduce((s, l) => s + (l - moy) ** 2, 0) / Math.max(1, longueurs.length - 1));
  const courtes = m.filter((x) => x.tournee <= 15);
  if (courtes.length) anomalies.push(`Parties très courtes (≤15 tours) : ${courtes.map((x) => `#${x.idx} (${x.tournee} tours, ${x.gagnantCiv ?? '—'})`).join(', ')}.`);
  const sansFin = m.filter((x) => !x.gagnant).length;
  if (sansFin / nParties > 0.5) anomalies.push(`${sansFin}/${nParties} parties non décidées au plafond de ${plan.plafondTours} tours — envisager un plafond supérieur pour le banc 2.`);
  out.push(`## Anomalies détectées\n`);
  out.push(anomalies.length ? anomalies.map((a) => `- ${a}`).join('\n') + '\n' : '- Aucune anomalie flagrante sur cet échantillon.\n');

  // Winrate par civ
  out.push(`## Winrate par civilisation (tous sièges et bras confondus)\n`);
  out.push(`| Civ | Parties | Victoires | Winrate | V. Jev | V. contrôle |`);
  out.push(`|---|---|---|---|---|---|`);
  for (const c of CIVS.sort((a, b) => (tauxCiv.find((t) => t[0] === b)?.[3] ?? 0) - (tauxCiv.find((t) => t[0] === a)?.[3] ?? 0))) {
    const vj = jev.filter((x) => x.gagnantCiv === c).length;
    const vc = ctrl.filter((x) => x.gagnantCiv === c).length;
    out.push(`| ${c} | ${jouesParCiv[c] ?? 0} | ${winByCiv[c] ?? 0} | ${pct(winByCiv[c] ?? 0, jouesParCiv[c] ?? 0)} | ${vj} | ${vc} |`);
  }
  out.push('');

  // Types de victoire + longueur
  out.push(`## Types de victoire\n`);
  out.push(`| Type | Jev | Contrôle | Total |`);
  out.push(`|---|---|---|---|`);
  const raisons2 = {};
  for (const x of m) if (x.raison) raisons2[x.raison] = raisons2[x.raison] ?? { j: 0, c: 0 };
  for (const x of jev) if (x.raison) raisons2[x.raison].j++;
  for (const x of ctrl) if (x.raison) raisons2[x.raison].c++;
  for (const [r, v] of Object.entries(raisons2)) out.push(`| ${r} | ${v.j} | ${v.c} | ${v.j + v.c} |`);
  out.push(`| non décidée (plafond) | ${jev.filter((x) => !x.gagnant).length} | ${ctrl.filter((x) => !x.gagnant).length} | ${sansFin} |`);
  out.push('');
  out.push(`## Longueur des parties\n`);
  out.push(`- Moyenne : **${moy.toFixed(1)} tours**, écart-type ${sd.toFixed(1)}, min ${Math.min(...longueurs)}, max ${Math.max(...longueurs)}.`);
  out.push(`- Jev : ${(jev.map((x) => x.tournee).reduce((a, b) => a + b, 0) / Math.max(1, jev.length)).toFixed(1)} tours en moyenne — contrôle : ${(ctrl.map((x) => x.tournee).reduce((a, b) => a + b, 0) / Math.max(1, ctrl.length)).toFixed(1)}.\n`);

  // Expansion (effet fonder-bot)
  out.push(`## Expansion — villes fondées par joueur (moyenne par partie)\n`);
  out.push(`| Bras | villes/joueur moy | max | Jev (nation pilotée) |`);
  out.push(`|---|---|---|---|`);
  const expBras = (bras) => {
    const toutes = [], jevSeule = [];
    for (const x of bras) {
      const vals = Object.values(x.villesFondees);
      toutes.push(vals.reduce((a, b) => a + b, 0) / Math.max(1, x.civs.length));
      const idJev = x.civs.find((c) => c.pilote === 'jev')?.id;
      if (idJev && x.villesFondees[idJev]) jevSeule.push(x.villesFondees[idJev]);
    }
    return [toutes.reduce((a, b) => a + b, 0) / Math.max(1, toutes.length), Math.max(0, ...toutes), jevSeule.reduce((a, b) => a + b, 0) / Math.max(1, jevSeule.length)];
  };
  const [eJ, eJm, eJev] = expBras(jev);
  const [eC, eCm, eCev] = expBras(ctrl);
  const fondJevMoy = jev.reduce((s, x) => s + (x.fondationsJev ?? 0), 0) / Math.max(1, jev.length);
  out.push(`| Jev | ${eJ.toFixed(2)} | ${eJm.toFixed(0)} | ${eJev.toFixed(2)} (dont fondations décidées par Jev : ${fondJevMoy.toFixed(2)}/partie) |`);
  out.push(`| Contrôle | ${eC.toFixed(2)} | ${eCm.toFixed(0)} | — |`);
  out.push('');

  // Techs
  const techMoy = (bras) => {
    const t = bras.map((x) => Object.values(x.techs).reduce((a, b) => a + b, 0) / Math.max(1, x.civs.length));
    return t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
  };
  out.push(`## Technologies complétées (moyenne par joueur)\n`);
  out.push(`- Jev : ${techMoy(jev).toFixed(2)} — contrôle : ${techMoy(ctrl).toFixed(2)}.\n`);

  // §5 banc 2 : guerres inter-nations (paires calculées par le harnais).
  const avecGuerre = m.filter((x) => (x.guerresInterNations ?? []).length > 0);
  out.push(`## Guerres inter-nations (hors barbares)\n`);
  out.push(`- ${avecGuerre.length}/${m.length} parties avec au moins un combat entre deux nations.`);
  const paires = {};
  for (const x of m) for (const g of x.guerresInterNations ?? []) paires[g] = (paires[g] ?? 0) + 1;
  const topPaires = Object.entries(paires).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topPaires.length) out.push(`- Paires les plus belligérantes : ${topPaires.map(([g, n]) => `${g} (${n})`).join(', ')}.\n`);
  else out.push('');

  // Jev vs contrôle + replis + coût
  const vJev = jev.filter((x) => x.gagnantJev).length;
  out.push(`## Jev vs bot\n`);
  out.push(`- La nation pilotée par Jev gagne **${vJev}/${jev.length}** de ses parties (${pct(vJev, jev.length)}) ; référence bot pur : chaque bras contrôle donne ${pct(1, 5)} par siège.`);
  const replisMoy = jev.reduce((s, x) => s + x.replis, 0) / Math.max(1, jev.reduce((s, x) => s + x.appels, 0) ? jev.reduce((s, x) => s + x.appels, 0) : 1);
  out.push(`- Taux de repli moyen : ${(100 * jev.reduce((s, x) => s + x.replis, 0) / Math.max(1, jev.reduce((s, x) => s + x.appels, 0))).toFixed(0)} % des tours (${jev.reduce((s, x) => s + x.replis, 0)} replis / ${jev.reduce((s, x) => s + x.appels, 0)} appels).`);
  const cout = jev.reduce((s, x) => s + x.coutUsd, 0);
  out.push(`- Coût banc : **${cout.toFixed(4)} $** (${(cout / Math.max(1, jev.length)).toFixed(4)} $/partie Jev), latence moy ${Math.round(jev.filter((x) => x.latenceMoyMs).reduce((s, x) => s + x.latenceMoyMs, 0) / Math.max(1, jev.filter((x) => x.latenceMoyMs).length))} ms, max ${Math.max(0, ...jev.map((x) => x.latenceMaxMs ?? 0))} ms.\n`);

  out.push(`## Détail par partie\n`);
  out.push(`| # | Bras | Seed | Gagnant (civ) | Type | Tours | Villes | Techs | Replis | Coût $ |`);
  out.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const x of m) {
    out.push(`| ${x.idx} | ${x.controle ? 'contrôle' : 'jev'} | ${x.seed} | ${x.gagnantCiv ?? '—'} | ${x.raison ?? '—'} | ${x.tournee} | ${Object.values(x.villesFondees).reduce((a, b) => a + b, 0)} | ${Object.values(x.techs).reduce((a, b) => a + b, 0)} | ${x.replis} | ${x.coutUsd.toFixed(4)} |`);
  }
  const cheminRapport = join(dossier, 'RAPPORT.md');
  writeFileSync(cheminRapport, out.join('\n') + '\n');
  console.log(`Rapport écrit : ${cheminRapport} (${m.length} parties agrégées)`);
}

if (arg('generer-plan')) await genererPlan();
else if (arg('rapport') === true) await rapport();
else if (arg('plan')) await executer();
else {
  console.error('Usage : --generer-plan <dossier> | --plan <dossier> [--faux] | --plan <dossier> --rapport');
  process.exit(1);
}
