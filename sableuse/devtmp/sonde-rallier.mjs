import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Journal } from '../src/journal.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import { jouerPartie } from '../src/partie.mjs';
import { pasVersRoutier, pasVers } from '../../apps/server/src/botPolicy.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));
const captures = new Map();
const client = creerFauxJev({ graine: 77 });
await jouerPartie({
  client, config, seed: 3947827986, plafondTours: 16,
  journal: new Journal(join(racine, 'devtmp', 'sonde-rallier-journal.jsonl')),
  budgetUsd: 5, playerCount: 2,
  civSetup: { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } },
  modeJoueur: true,
  sonde: (tour, filtre, jev, etat) => { if (tour >= 10 && tour <= 14) captures.set(tour, JSON.parse(JSON.stringify(etat))); },
});
const cible = { q: 1, r: 8 };
for (const [tour, etat] of captures) {
  const u4 = etat.units.u4;
  if (!u4) continue;
  const routier = pasVersRoutier(u4, etat, cible);
  const glouton = pasVers(u4, etat, cible);
  // unités autour de u4
  const autour = Object.values(etat.units).filter((u) => !u.aboard && u !== u4 && Math.abs(u.q - u4.q) <= 2 && Math.abs(u.r - u4.r) <= 2).map((u) => `${u.owner}:${u.id}(${u.type.slice(0,4)})@${u.q},${u.r}`);
  console.log(`t${tour} u4@${u4.q},${u4.r} routier=${routier ? routier.q+','+routier.r : 'null'} glouton=${glouton ? glouton.q+','+glouton.r : 'null'} autour: ${autour.join(' ') || '-'}`);
}
