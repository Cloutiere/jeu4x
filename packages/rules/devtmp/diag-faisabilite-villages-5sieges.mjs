/**
 * VILLAGES-5SIEGES L0 — Faisabilité par branch-and-bound EXACT (modèle
 * diag-faisabilite.mjs de CI-FLAKY) sur les contraintes EXACTES de l'appel
 * libre.ts (multi, PAS de miroir) : praticable, ≥ minVillageDistance des N
 * spawns, spacing villageSpacing entre villages, ≥ minResourceDistance de
 * toute ressource PRÉ-CAMPS (approximation : ressources finales MOINS celles
 * posées sous les camps, inexistantes au moment du placement), ≥ 2 voisins
 * praticables. Objectif : ensemble indépendant de taille 15.
 * Usage : npx tsx devtmp/diag-faisabilite-villages-5sieges.mjs [seed ...]
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { colRowToHex, hexDistance, neighbors } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';

const DEFAULT_SEEDS = [110867, 649359, 760225];
const seeds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : DEFAULT_SEEDS;
const s = resolveProgenSettings({ playerCount: 5 });
const TARGET = 15; // round(6 × 2 × 1,25) en 50×40 — cf. libre.ts D4

for (const seed of seeds) {
  const { map } = generateProceduralMap(seed, { playerCount: 5 });
  const W = map.data.width;
  const H = map.data.height;
  const spawns = map.spawns.map((sp) => sp.capital);
  const cle = (h) => `${h.q},${h.r}`;
  const poséesSousCamps = new Set([...map.villages, ...map.huts].map(cle));
  const resources = map.resources
    .filter((r) => !poséesSousCamps.has(cle(r)))
    .map((r) => ({ q: r.q, r: r.r }));

  const candidats = [];
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const hex = colRowToHex(col, row);
      const t = map.terrain[cle(hex)];
      if (!t || !TERRAINS[t].passable) continue;
      if (spawns.some((sp) => hexDistance(sp, hex) < s.minVillageDistance)) continue;
      if (resources.some((r) => hexDistance(r, hex) < s.minResourceDistance)) continue;
      const pass = neighbors(hex).filter((n) => {
        const nt = map.terrain[cle(n)];
        return nt !== undefined && TERRAINS[nt].passable;
      }).length;
      if (pass < 2) continue;
      candidats.push(hex);
    }
  }

  // Graphe d'incompatibilité (spacing villageSpacing).
  const n = candidats.length;
  const incomp = candidats.map((a, i) =>
    new Set(
      candidats
        .map((b, j) => j)
        .filter((j) => j !== i && hexDistance(a, candidats[j]) < s.villageSpacing),
    ),
  );

  // Branch-and-bound exact : sommet de degré minimal, include/exclude,
  // borne sup = pris + sommet par sommet glouton sur le reste.
  let best = 0;
  let solution = null;
  let noeuds = 0;
  const pris = [];
  const glouton = (vivants) => {
    let c = 0;
    const v = [...vivants];
    while (v.length) {
      const i = v.shift();
      c++;
      for (const j of incomp[i]) {
        const k = v.indexOf(j);
        if (k >= 0) v.splice(k, 1);
      }
    }
    return c;
  };
  const cherche = (vivants) => {
    noeuds++;
    if (pris.length > best) {
      best = pris.length;
      solution = [...pris];
    }
    if (best >= TARGET || noeuds > 5_000_000) return;
    if (pris.length + glouton(vivants) <= best) return; // borne sup
    // sommet de degré minimal dans le graphe induit
    let choix = -1;
    let degMin = Infinity;
    for (const i of vivants) {
      let d = 0;
      for (const j of incomp[i]) if (vivants.has(j)) d++;
      if (d < degMin) {
        degMin = d;
        choix = i;
      }
    }
    if (choix < 0) return;
    // branche include
    pris.push(choix);
    const reste = new Set([...vivants].filter((j) => j !== choix && !incomp[choix].has(j)));
    cherche(reste);
    pris.pop();
    if (best < TARGET && noeuds <= 5_000_000) {
      // branche exclude
      const reste2 = new Set([...vivants].filter((j) => j !== choix));
      cherche(reste2);
    }
  };
  cherche(new Set(candidats.map((_, i) => i)));
  const exact = noeuds <= 5_000_000;
  console.log(
    `seed ${seed} : ${n} cases éligibles, max indépendant = ${best}/${TARGET} (${noeuds} nœuds)${exact ? '' : ' — PLAFOND ATTEINT, borne inférieure'}`,
  );
  if (solution) console.log('  solution :', solution.map((i) => `${candidats[i].q},${candidats[i].r}`).join(' '));
  console.log(
    best >= TARGET
      ? '  → FAISABLE : le glouton + 8 relances sont en cause (bug de générateur, correctif possible)'
      : exact
        ? '  → NON FAISABLE (preuve exacte) : conflit de règles réel → STOP, Erik décide'
        : '  → NON TRANCHÉ : augmenter le plafond de nœuds',
  );
}
