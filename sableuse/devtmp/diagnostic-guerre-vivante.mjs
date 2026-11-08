// DIAGNOSTIC L1 HANDOFF-GUERRE-VIVANTE — pourquoi la guerre du bot est vide ?
// Rejoue les seeds croissance via jouerPartie (client FAUX, gratuit) avec la
// sonde harnais (paramètre `sonde`, null par défaut — hors ligne) et observe,
// sur l'ÉTAT COMPLET, du côté du bot p2 ET de Jev p1 :
//   - la paire de guerre + dureeGuerre vs dureeMinGuerre (HORLOGE-DISTANCE)
//   - cibleCampagne, armée (ids/cases), effectif au rayon, assautAutorise
//   - deciderPaix des deux sens (pourquoi la paix ne passe jamais)
//   - les guerres sans bataille (guerreSterile data)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerFauxJev } = await import('../src/faux-jev.mjs');
const { jouerPartie } = await import('../src/partie.mjs');
const { Journal } = await import('../src/journal.mjs');
const bot = await import('../../apps/server/src/botPolicy.ts');
const rules = await import('../../packages/rules/src/index.ts');

const SEEDS = process.argv[2] ? [Number(process.argv[2])] : [3538506724];
const PLAFOND = Number(process.argv[3] ?? 120);
const ECHANTILLONS = new Set([15, 30, 50, 80, 110]);

const faux = creerFauxJev({ graine: 77 });
const config = JSON.parse(readFileSync(join(racine, 'sableuse', 'questions-joueur.json'), 'utf8'));
const profil = bot.profileDuBot();

function suivre(tour, filtre, jev, etat) {
  if (!ECHANTILLONS.has(tour)) return;
  const ligne = { tour };
  const war = etat.diplomacy?.war ?? [];
  ligne.war = war;
  ligne.warsDepuis = etat.diplomacy?.warsDepuis ?? null;
  for (const qui of ['p1', 'p2']) {
    const ennemis = bot.ennemisDe ? bot.ennemisDe(etat, qui) : [...new Set(war.flat().filter((x) => x !== qui))];
    const campagne = bot.cibleCampagne(etat, qui);
    const armeeIds = campagne ? [...bot.assignerArmee(etat, qui, profil, campagne)] : [];
    const membres = armeeIds.map((id) => etat.units[id]).filter(Boolean);
    const auRayon = campagne
      ? membres.filter((m) => rules.hexDistanceW ? rules.hexDistanceW({ q: m.q, r: m.r }, campagne, etat.mapWidth) <= profil.rayonRalliement : Math.max(Math.abs(m.q - campagne.q), Math.abs(m.r - campagne.r)) <= profil.rayonRalliement)
      : [];
    ligne[qui] = {
      ennemis: [...ennemis],
      dureeGuerreP1: rules.dureeGuerre(etat, 'p1', 'p2'),
      dureeMinP1: bot.dureeMinGuerre(etat, 'p1', 'p2', profil),
      deciderPaixP1: bot.deciderPaix(etat, 'p1', 'p2', profil),
      deciderPaixP2: bot.deciderPaix(etat, 'p2', 'p1', profil),
      campagne: campagne ? `${campagne.cityId}@${campagne.q},${campagne.r}` : null,
      armee: armeeIds.map((id) => `${id}@${etat.units[id]?.q ?? '?'},${etat.units[id]?.r ?? '?'}`),
      auRayon: auRayon.length,
      effectifAssaut: profil.effectifAssaut,
      tailleArmee: profil.tailleArmee,
      rayonRalliement: profil.rayonRalliement,
      villesP1: Object.values(etat.cities).filter((c) => c.owner === 'p1').map((c) => `${c.id}@${c.q},${c.r}`),
      villesP2: Object.values(etat.cities).filter((c) => c.owner === 'p2').map((c) => `${c.id}@${c.q},${c.r}`),
    };
  }
  console.log(JSON.stringify(ligne));
}

for (const seed of SEEDS) {
  const journal = new Journal(join(racine, 'sableuse', 'devtmp', 'tmp-diag-guerre.jsonl'));
  const { etat } = await jouerPartie({
    client: faux, config, seed, plafondTours: PLAFOND, journal,
    budgetUsd: 5, playerCount: 2,
    civSetup: { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } },
    engineJev: 'p1', modeJoueur: true, sonde: suivre,
  });
  console.error(`seed ${seed} fini : tour ${etat.turn}, gagnant ${etat.winner ?? 'aucun'}`);
}
