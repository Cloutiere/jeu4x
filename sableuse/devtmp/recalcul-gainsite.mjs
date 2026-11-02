// RECALCUL L1 HANDOFF-JEV-CROISSANCE — sites corrects avant/après calibrage
// data `configCondense.gainSite`, SANS LLM (client faux, banc gratuit).
// Rejoue 3 seeds du corpus vanilla via jouerPartie (trajectoire fidèle),
// échantillonne l'état filtré à t50/t100/t200/t300 et compte `sitesCorrects`
// sous plusieurs jeux de valeurs (configCondense muté entre les comptages —
// comptage PUR sur l'échantillon figé).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const { creerFauxJev } = await import('../src/faux-jev.mjs');
const { jouerPartie } = await import('../src/partie.mjs');
const { Journal } = await import('../src/journal.mjs');
const { sitesCorrects } = await import('../src/joueur.mjs');
const { configCondense } = await import('../src/condense.mjs');

const SEEDS = [3538506724, 3947827986, 214915776];
const ECHANTILLONS = [50, 100, 200, 300];
const PLAFOND = 301;

// Variantes de calibrage (D1) :
//  V0 témoin (pd=2, c1=0.5, c2=0.25, maturité 0.65)
//  V1 penaliteDistance 2→1 (levier fort D1)
//  V2 V1 + partCouronne1 0.75 / partCouronne2 0.375 (équivalent « seuil abaissé »)
//  V3 V1 + facteurMaturite 0.65→0.85 (rendements jeunes sous-estimés)
const VARIANTES = {
  V0: {},
  V1: { penaliteDistance: 1 },
  V2: { penaliteDistance: 1, partCouronne1: 0.75, partCouronne2: 0.375 },
  V3: { penaliteDistance: 1, facteurMaturite: 0.85 },
};
const TEMOIN = { ...configCondense.gainSite };
function appliquer(v) {
  configCondense.gainSite = { ...TEMOIN, ...v };
}

const faux = creerFauxJev({ graine: 77 });
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));
const dossierSortie = join(racine, 'devtmp', 'recalcul-gainsite');
mkdirSync(dossierSortie, { recursive: true });

// Échantillonnage pendant la partie (état filtré figé par copie JSON).
const echantillons = {};
for (const seed of SEEDS) echantillons[seed] = {};
const sonde = (tour, filtre, jev) => {
  if (!ECHANTILLONS.includes(tour)) return;
  echantillons[filtreSeed] [tour] = JSON.parse(JSON.stringify({
    map: filtre.map, units: filtre.units, cities: filtre.cities,
  }));
};

let filtreSeed = null;
for (const seed of SEEDS) {
  filtreSeed = seed;
  const journal = new Journal(join(dossierSortie, `tmp-partie-${seed}.jsonl`));
  const { etat } = await jouerPartie({
    client: faux, config, seed, plafondTours: PLAFOND, journal,
    budgetUsd: 5, playerCount: 2,
    civSetup: { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } },
    engineJev: 'p1', modeJoueur: true, sonde,
  });
  console.error(`seed ${seed} fini : tour ${etat.turn}, gagnant ${etat.winner ?? 'aucun'}`);
}

// Comptage sous chaque variante (configCondense muté entre les comptages).
const table = {};
for (const [nom, v] of Object.entries(VARIANTES)) {
  appliquer(v);
  table[nom] = {};
  for (const seed of SEEDS) {
    table[nom][seed] = {};
    for (const tour of ECHANTILLONS) {
      const f = echantillons[seed][tour];
      table[nom][seed][tour] = f ? sitesCorrects(f, 'p1').length : null;
    }
  }
}
appliquer(TEMOIN);

const sortie = { variantes: VARIANTES, temoin: TEMOIN, table };
writeFileSync(join(dossierSortie, 'table.json'), JSON.stringify(sortie, null, 2));
console.log(JSON.stringify(sortie.table, null, 1));
