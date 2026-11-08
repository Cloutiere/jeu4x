// DIAGNOSTIC OSCILLATION — rejeu local GRATUIT (faux Jev) du seed banc
// 3947827986, plafond 60 tours, pour capturer les ordres bot (OSCILLATION_DEBUG).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Journal } from '../src/journal.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import { jouerPartie } from '../src/partie.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));
const seed = Number(process.argv[2] ?? 3947827986);
const plafond = Number(process.argv[3] ?? 60);

const client = creerFauxJev({ graine: 77 });
// Hook de diagnostic (instrumentation temporaire botPolicy) :
globalThis.__oscLog = (o) => {
  import('node:fs').then((m) => m.appendFileSync(join(racine, 'devtmp', 'objectifs-osc.jsonl'), JSON.stringify(o) + '\n'));
};
const { etat } = await jouerPartie({
  client, config, seed, plafondTours: plafond,
  journal: new Journal(join(racine, 'devtmp', 'replay-oscillation-journal.jsonl')),
  budgetUsd: 5,
  playerCount: 2,
  civSetup: { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } },
  modeJoueur: true,
});
console.log(`fin t${etat.turn}, gagnant ${etat.winner ?? 'aucun'}`);
