// DIAGNOSTIC OSCILLATION 3 — capture l'état aux tours 10-14 puis rejoue
// pasVersRoutier/pasVers pour u4 (cible rallier (1,8)) : pourquoi le pas
// bascule.
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
  journal: new Journal(join(racine, 'devtmp', 'sonde-pas-journal.jsonl')),
  budgetUsd: 5, playerCount: 2,
  civSetup: { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } },
  modeJoueur: true,
  sonde: (tour, filtre, jev, etat) => {
    if (tour >= 9 && tour <= 14) captures.set(tour, JSON.parse(JSON.stringify(etat)));
  },
});

const hexD = (a, b) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
};

for (const [tour, etat] of captures) {
  const u4 = etat.units.u4;
  if (!u4) continue;
  const cible = { q: 1, r: 8 };
  const routier = pasVersRoutier(u4, etat, cible);
  const glouton = pasVers(u4, etat, cible);
  // voisinage de u4 : passable / occupé
  const voisins = [];
  for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
    const h = { q: u4.q + dq, r: u4.r + dr };
    const tile = etat.map[`${h.q},${h.r}`];
    const occ = Object.values(etat.units).find((u) => !u.aboard && u.q === h.q && u.r === h.r);
    voisins.push(`${h.q},${h.r}:${tile ? tile.terrain.slice(0, 6) : 'absent'}${occ ? '/OCC(' + occ.owner + ':' + occ.type + ')' : ''} d=${tile ? hexD(h, cible) : '-'}`);
  }
  console.log(`t${tour} u4@${u4.q},${u4.r} d(cible)=${hexD(u4, cible)} routier=${routier ? routier.q + ',' + routier.r : 'null'} glouton=${glouton ? glouton.q + ',' + glouton.r : 'null'}`);
  console.log('  ' + voisins.join('\n  '));
}
