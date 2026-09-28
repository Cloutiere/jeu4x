#!/usr/bin/env node
/**
 * CLI de la sableuse (HANDOFF-JEV-POC L2).
 *   npm run partie -- --seed 12345 --tours 50 [--faux] [--budget 2]
 * Sans --faux : appelle la vraie API Jev (clé dans sableuse/.env.local).
 * Journal : sableuse/journaux/partie-<seed>-<horodatage>.jsonl
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Journal } from './journal.mjs';
import { jouerPartie } from './partie.mjs';
import { creerFauxJev } from './faux-jev.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : defaut;
}

const seed = Number(arg('seed', Date.now() % 1_000_000));
const tours = Number(arg('tours', 50));
const budget = Number(arg('budget', 2));
const faux = arg('faux', false) === true;
const injection = arg('injection', false) === true;
const fichierQuestions = typeof arg('questions', 'questions.json') === 'string' ? arg('questions', 'questions.json') : 'questions.json';

let client;
if (faux) {
  client = creerFauxJev({ graine: seed });
  console.log('FAUX client Jev (déterministe, zéro appel réseau)');
} else {
  process.env.TYPESAFE_API_KEY = readFileSync(join(racine, '.env.local'), 'utf8').match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
  const { TypeSafeClient } = await import('@typesafe-ai/sdk');
  client = new TypeSafeClient({ model: 'jev-latest' });
  console.log('VRAI client Jev (jev-latest)');
}

const config = JSON.parse(readFileSync(join(racine, fichierQuestions), 'utf8'));
const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
const tag = [fichierQuestions.replace(/^questions-?|\.json$/g, '') || 'v2', injection ? 'injection' : null]
  .filter(Boolean)
  .join('-');
const journal = new Journal(join(racine, 'journaux', `partie-${seed}-${tag}-${horodatage}.jsonl`));

console.log(`Partie : seed ${seed}, plafond ${tours} tours, budget ${budget} $, questions ${fichierQuestions}${injection ? ', INJECTION menace (scenario:test)' : ''}`);
const t0 = Date.now();
const { etat, jev, coupeParBudget } = await jouerPartie({
  client,
  config,
  seed,
  plafondTours: tours,
  journal,
  budgetUsd: budget,
  scenario: injection ? { contact: true, injectionMenace: true } : null,
});
const duree = ((Date.now() - t0) / 1000).toFixed(1);

console.log('----------------------------------------');
console.log(`Fin : gagnant=${etat.winner ?? 'aucun'} tours=${etat.turn} nationJev=${jev}`);
console.log(`Coût réel : ${journal.coutUsd().toFixed(4)} $ (${journal.jetonsTotal} jetons, ${journal.appels} appels)`);
console.log(`Latence moy/max : ${journal.latencesMs.length ? Math.round(journal.latencesMs.reduce((a, b) => a + b, 0) / journal.latencesMs.length) : '-'} / ${journal.latencesMs.length ? Math.max(...journal.latencesMs) : '-'} ms`);
console.log(`Ordres rejetés : ${journal.ordresRejetes} — replis : ${journal.replis} — distributions plates : ${journal.distributionsPlates}`);
console.log(`Durée murale : ${duree} s — coupe budget : ${coupeParBudget ? 'OUI' : 'non'}`);
console.log(`Journal : journaux/partie-${seed}-${horodatage}.jsonl`);
