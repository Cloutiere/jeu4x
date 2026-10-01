/**
 * VILLAGES-5SIEGES — Preuve de bit-identité : empreinte de la carte complète
 * (villages + huttes + ressources id/case + spawns + artefacts) pour N seeds
 * × 3/4/5 sièges. Exécuté AVANT et APRÈS le correctif : seules les seeds
 * fautives (villages < attendus avant correctif) doivent changer.
 * Usage : npx tsx devtmp/verif-invariance-5sieges.mjs [N] > empreintes.json
 */
import { createHash } from 'node:crypto';
import { generateProceduralMap } from '../src/progen/index.js';

const N = Number(process.argv[2] ?? 200);
const seeds = Array.from({ length: N }, (_, i) => 1 + i * 7919);
const out = {};
for (const playerCount of [3, 4, 5]) {
  for (const seed of seeds) {
    let empreinte;
    try {
      const { map } = generateProceduralMap(seed, { playerCount });
      const materiel = JSON.stringify({
        v: map.villages,
        h: map.huts,
        r: map.resources,
        s: map.spawns,
        a: map.artefacts,
      });
      empreinte = createHash('md5').update(materiel).digest('hex');
    } catch (e) {
      empreinte = `ERREUR: ${e.message}`;
    }
    out[`s${playerCount}/${seed}`] = empreinte;
  }
}
console.log(JSON.stringify(out, null, 1));
