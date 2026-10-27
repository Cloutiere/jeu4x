#!/usr/bin/env node
/**
 * BANC JEV-BANC-JOUEUR (décisions Erik 28/10) — 10 parties 1v1 Jev JOUEUR vs
 * bot standard : seeds fixes du corpus banc (corpusBanc), civs réelles P7
 * tirées du seed (tiragePaireCivs), 150 tours max ou victoire, garde-fou
 * budget GLOBAL 10 $ (arrêt immédiat, rapport partiel acceptable), reprise
 * sur interruption, journal JSONL complet par partie. HORS LIGNE.
 *
 *   node src/banc-joueur.mjs --generer-plan bancs/joueur-2026-10-27
 *   node src/banc-joueur.mjs --plan bancs/joueur-2026-10-27 [--faux] [--budget-global 10]
 *   node src/banc-joueur.mjs --plan bancs/joueur-2026-10-27 --rapport
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusBanc } from '../../apps/server/src/bancBotTd.js';
import { tiragePaireCivs } from '../../apps/server/src/bancObservation.js';
import { Journal } from './journal.mjs';
import { jouerPartie } from './partie.mjs';
import { creerFauxJev } from './faux-jev.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAFOND_TOURS = 150;
const N_PARTIES = 10;
const DIFFICULTE = 'normal';

function arg(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : defaut;
}

async function genererPlan() {
  const dossier = arg('generer-plan');
  if (existsSync(join(dossier, 'plan.json'))) {
    console.error(`Refus : ${dossier}/plan.json existe déjà — jamais écraser un banc en cours.`);
    process.exit(1);
  }
  const seeds = corpusBanc(40).slice(0, N_PARTIES);
  const parties = seeds.map((seed, i) => {
    const paire = tiragePaireCivs(seed);
    return { idx: i + 1, seed, civs: { p1: paire.p1, p2: paire.p2 } };
  });
  const plan = { date: new Date().toISOString(), nParties: N_PARTIES, plafondTours: PLAFOND_TOURS, difficulte: DIFFICULTE, corpus: 'corpusBanc(40)[:10]', parties };
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'plan.json'), JSON.stringify(plan, null, 2));
  writeFileSync(join(dossier, 'etat.json'), JSON.stringify({ parties: {} }, null, 2));
  console.log(`Plan écrit : ${dossier}/plan.json (${N_PARTIES} parties 1v1, seeds corpus, civs P7 du seed)`);
}

async function creerClient(faux) {
  if (faux) return creerFauxJev({ graine: 77 });
  process.env.TYPESAFE_API_KEY = readFileSync(join(racine, '.env.local'), 'utf8').match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
  const { TypeSafeClient } = await import('@typesafe-ai/sdk');
  return new TypeSafeClient({ model: 'jev-latest' });
}

function coutBanc(etatBanc) {
  return Object.values(etatBanc.parties).reduce((s, p) => s + (p.coutUsd ?? 0), 0);
}

async function executer() {
  const dossier = arg('plan');
  const faux = arg('faux', false) === true;
  const budgetGlobal = Number(arg('budget-global', 10));
  const plan = JSON.parse(readFileSync(join(dossier, 'plan.json'), 'utf8'));
  const cheminEtat = join(dossier, 'etat.json');
  const etatBanc = JSON.parse(readFileSync(cheminEtat, 'utf8'));
  const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));
  const client = await creerClient(faux);
  const coutBase = faux ? 0 : coutReelAvant();
  let coupe = false;

  for (const p of plan.parties) {
    const precedent = etatBanc.parties[p.idx];
    if (precedent?.statut) {
      console.log(`[${p.idx}/${plan.parties.length}] déjà ${precedent.statut} — sautée`);
      continue;
    }
    const restant = budgetGlobal - coutBase - coutBanc(etatBanc);
    if (restant < 0.005) {
      console.log(`Budget global ${budgetGlobal} $ atteint — partie ${p.idx} NON JOUÉE (rapport partiel, D2).`);
      etatBanc.parties[p.idx] = { statut: 'coupe-budget' };
      ecrire(cheminEtat, etatBanc);
      coupe = true;
      continue;
    }
    const civSetup = { p1: { civId: p.civs.p1 }, p2: { civId: p.civs.p2 } };
    const fichier = join(dossier, 'journaux', `partie-${String(p.idx).padStart(2, '0')}-seed${p.seed}.jsonl`);
    let ok = false;
    for (let tentative = 1; tentative <= 2 && !ok; tentative++) {
      const journal = new Journal(fichier);
      const t0 = Date.now();
      try {
        const { etat, coupeParBudget } = await jouerPartie({
          client, config, seed: p.seed, plafondTours: plan.plafondTours, journal,
          budgetUsd: Math.min(restant, 5),
          playerCount: 2,
          civSetup,
          engineJev: 'p1',
          modeJoueur: true,
        });
        const fin = { statut: coupeParBudget ? 'coupe-budget' : 'fait', fichier: basename(fichier), coutUsd: journal.coutUsd(), tours: etat.turn, gagnant: etat.winner, ms: Date.now() - t0 };
        etatBanc.parties[p.idx] = fin;
        ok = true;
        console.log(`[${p.idx}/${plan.parties.length}] seed ${p.seed} (${p.civs.p1} vs ${p.civs.p2}) → gagnant ${etat.winner ?? 'aucun'} en ${etat.turn} tours, coût ${journal.coutUsd().toFixed(4)} $, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      } catch (e) {
        console.error(`[${p.idx}] tentative ${tentative} échouée : ${e.message}`);
        if (tentative === 2) etatBanc.parties[p.idx] = { statut: 'echec', cause: String(e.message ?? e) };
      }
      ecrire(cheminEtat, etatBanc);
    }
  }
  console.log(`Exécution terminée${coupe ? ' (BUDGET ATTEINT — rapport partiel)' : ''}. --rapport pour RAPPORT.md.`);
}

/** Coût réel cumulé des bancs Jev précédents (journaux racine). */
function coutReelAvant() {
  let total = 0;
  try {
    for (const f of readdirSync(join(racine, 'journaux'))) {
      if (!f.endsWith('.jsonl')) continue;
      const lignes = readFileSync(join(racine, 'journaux', f), 'utf8').trim().split('\n');
      const fin = lignes.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o?.type === 'fin');
      if (fin?.coutTotalUsd) total += fin.coutTotalUsd;
    }
  } catch { /* pas de journaux */ }
  return total;
}

function ecrire(chemin, objet) {
  writeFileSync(chemin, JSON.stringify(objet, null, 2));
}

/** Agrège un journal de partie → métriques D3. */
function metriquesPartie(chemin, entree) {
  const lignes = readFileSync(chemin, 'utf8').trim().split('\n');
  const meta = JSON.parse(lignes.find((l) => l.includes('"type":"meta"')));
  const joueurs = Object.fromEntries(meta.joueurs.map((j) => [j.id, j]));
  const guerresDeclarations = [];
  const paix = [];
  const echanges = [];
  const captVilles = [];
  const compteDecisions = { produire: 0, rechercher: 0, convertir: 0, guerre: 0, paix: 0, echange: 0, aucun: 0 };
  let replis = 0, appels = 0, plates = 0, jetons = 0, latences = [];
  for (const l of lignes) {
    if (l.includes('"type":"diplomatie"')) {
      const d = JSON.parse(l);
      if (d.genre === 'guerre') guerresDeclarations.push(d);
      else if (d.genre === 'paix') paix.push(d);
      else if (d.genre === 'echange') echanges.push(d);
      continue;
    }
    if (l.includes('"type":"decision"')) {
      const d = JSON.parse(l);
      appels += 1;
      if (d.repli) replis += 1;
      if (d.plate) plates += 1;
      jetons += d.jetonsEntree ?? 0;
      if (d.latenceMs != null) latences.push(d.latenceMs);
      for (const o of d.ordresJev ?? []) if (o.type === 'SetProduction') compteDecisions.produire += 1;
      for (const a of d.actionsJev ?? []) {
        if (a.type === 'SetResearch') compteDecisions.rechercher += 1;
        if (a.type === 'SetConversion') compteDecisions.convertir += 1;
      }
      for (const dpl of d.diplomatieJev ?? []) {
        if (dpl.genre === 'guerre') compteDecisions.guerre += 1;
        else if (dpl.genre === 'paix') compteDecisions.paix += 1;
        else if (dpl.genre === 'echange') compteDecisions.echange += 1;
      }
      continue;
    }
    if (l.includes('"type":"evenement"')) {
      const ev = JSON.parse(l).evenement;
      if (ev.type === 'CityCaptured' && ev.fromOwner !== 'barbarien' && ev.toOwner !== 'barbarien') captVilles.push(ev);
    }
  }
  const fin = JSON.parse(lignes.reverse().find((l) => l.includes('"type":"fin"')));
  latences.sort((a, b) => a - b);
  return {
    idx: entree.idx, seed: meta.seed, civs: meta.joueurs.map((j) => ({ id: j.id, civId: j.civId, pilote: j.pilote })),
    tours: fin.toursJoues, coupeParBudget: fin.coupeParBudget ?? false,
    gagnant: fin.gagnant, gagnantJev: fin.gagnant ? joueurs[fin.gagnant]?.pilote === 'jev' : false,
    joueursFin: fin.joueursFin ?? {}, scores: fin.scores ?? null,
    guerresDeclarations, paix, echanges, captVilles,
    compteDecisions, replis, appels, plates,
    jetonsMoy: appels ? Math.round(jetons / appels) : 0,
    latenceMoy: latences.length ? Math.round(latences.reduce((a, b) => a + b, 0) / latences.length) : null,
    latenceMed: latences.length ? latences[Math.floor(latences.length / 2)] : null,
    coutUsd: fin.coutTotalUsd ?? 0,
    erreursJev: fin.erreursJev ?? 0,
  };
}

async function rapport() {
  const dossier = arg('plan');
  const etatBanc = JSON.parse(readFileSync(join(dossier, 'etat.json'), 'utf8'));
  const plan = JSON.parse(readFileSync(join(dossier, 'plan.json'), 'utf8'));
  const m = [];
  for (const [idxStr, info] of Object.entries(etatBanc.parties)) {
    if (info.statut !== 'fait') continue;
    const chemin = join(dossier, 'journaux', info.fichier ?? '');
    if (!existsSync(chemin)) continue;
    m.push(metriquesPartie(chemin, { idx: Number(idxStr) }));
  }
  const out = [];
  out.push(`# RAPPORT DE BANC — JEV-BANC-JOUEUR (${basename(dossier)})\n`);
  out.push(`10 parties 1v1 Jev JOUEUR vs bot standard (${plan.difficulte}), seeds corpus, civs réelles P7 du seed, plafond ${plan.plafondTours} tours. Jev = p1 (recherche, conversion, production capitale, guerre/paix/échange T2) ; le bot exécute le tactique.\n`);
  const nonJouees = Object.entries(etatBanc.parties).filter(([, p]) => p.statut !== 'fait');
  if (nonJouees.length) out.push(`**Parties non jouées/abouties** : ${nonJouees.map(([i, p]) => `#${i} (${p.statut}${p.cause ? ' : ' + p.cause : ''})`).join(', ')}\n`);

  const cout = m.reduce((s, x) => s + x.coutUsd, 0);
  const victoiresJev = m.filter((x) => x.gagnantJev).length;
  out.push(`## Bilan\n`);
  out.push(`- Parties jouées : ${m.length} — victoires Jev : **${victoiresJev}/${m.length}** ; tours moyens ${(m.reduce((s, x) => s + x.tours, 0) / Math.max(1, m.length)).toFixed(0)}.`);
  out.push(`- Coût total : **${cout.toFixed(4)} $** (${(cout / Math.max(1, m.length)).toFixed(4)} $/partie) — garde-fou 10 $.`);
  const jetonsMoy = Math.round(m.reduce((s, x) => s + x.jetonsMoy, 0) / Math.max(1, m.length));
  out.push(`- Jetons moyens/décision : ${jetonsMoy} — latence médiane ${m.find((x) => x.latenceMed)?.latenceMed ?? '—'} ms.`);
  out.push(`- Replis (aucune décision traduite) : ${m.reduce((s, x) => s + x.replis, 0)}/${m.reduce((s, x) => s + x.appels, 0)} tours — erreurs API : ${m.reduce((s, x) => s + x.erreursJev, 0)}.\n`);

  out.push(`## Décisions par catégorie (toutes parties)\n`);
  const tot = {};
  for (const x of m) for (const [k, v] of Object.entries(x.compteDecisions)) tot[k] = (tot[k] ?? 0) + v;
  for (const [k, v] of Object.entries(tot)) out.push(`- ${k} : ${v}`);
  out.push(`- tours repliés bot pur : ${m.reduce((s, x) => s + x.replis, 0)} ; distributions plates : ${m.reduce((s, x) => s + x.plates, 0)}\n`);

  out.push(`## Diplomatie\n`);
  const decl = m.flatMap((x) => x.guerresDeclarations);
  out.push(`- Déclarations de guerre par Jev : ${decl.filter((d) => d.ok).length} (refusées par le moteur : ${decl.filter((d) => !d.ok).length}).`);
  const paixT = m.flatMap((x) => x.paix);
  const paixAcc = paixT.filter((d) => d.ok && d.reponseBot === 'accepte').length;
  const paixRef = paixT.filter((d) => d.ok && d.reponseBot !== 'accepte').length;
  out.push(`- Propositions de paix par Jev : ${paixT.length} — acceptées ${paixAcc}, refusées/contre-proposées ${paixRef} (or moyen offert ${paixT.length ? (paixT.reduce((s, d) => s + (d.or ?? 0), 0) / paixT.length).toFixed(0) : '—'}).`);
  const echT = m.flatMap((x) => x.echanges);
  out.push(`- Échanges de techs proposés : ${echT.length} — acceptés ${echT.filter((d) => d.ok && d.reponseBot === 'accepte').length}, refusés ${echT.filter((d) => d.ok && d.reponseBot !== 'accepte').length}.\n`);

  out.push(`## Table par partie (D3)\n`);
  out.push(`| # | Seed | Civs (Jev vs bot) | Gagnant | Tours | Villes Jev/bot | Techs Jev/bot | Trésorerie Jev/bot | Forces Jev/bot | Score Jev/bot | Coût $ |`);
  out.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const x of m) {
    const j = x.joueursFin.p1 ?? {}, b = x.joueursFin.p2 ?? {};
    const s = x.scores ?? {};
    out.push(`| ${x.idx} | ${x.seed} | ${x.civs.find((c) => c.id === 'p1')?.civId} vs ${x.civs.find((c) => c.id === 'p2')?.civId} | ${x.gagnant ?? '—'} | ${x.tours} | ${j.villes ?? '—'}/${b.villes ?? '—'} | ${j.techs ?? '—'}/${b.techs ?? '—'} | ${j.tresorerie ?? '—'}/${b.tresorerie ?? '—'} | ${j.forces ?? '—'}/${b.forces ?? '—'} | ${s.p1?.total ?? '—'}/${s.p2?.total ?? '—'} | ${x.coutUsd.toFixed(4)} |`);
  }
  const cheminRapport = join(dossier, 'RAPPORT.md');
  writeFileSync(cheminRapport, out.join('\n') + '\n');
  console.log(`Rapport écrit : ${cheminRapport} (${m.length} parties agrégées)`);
}

if (arg('generer-plan')) await genererPlan();
else if (arg('rapport') === true) await rapport();
else if (arg('plan')) await executer();
else {
  console.error('Usage : --generer-plan <dossier> | --plan <dossier> [--faux] [--budget-global 10] | --plan <dossier> --rapport');
  process.exit(1);
}
