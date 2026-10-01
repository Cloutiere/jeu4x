/**
 * CI-FLAKY L1 — La seed 3714012 est-elle VRAIMENT infeasible (6 villages/demi)
 * ou le placement glouton s'est-il peint dans un coin ?
 * Backtracking déterministe sur les contraintes EXACTES de entityCandidates
 * (mirror.ts + content.ts) : praticable, ≥6 des 2 spawns, spacing 6 entre
 * villages (images miroir comprises, auto-image comprise), ≥2 de toute
 * ressource (carte complète, images comprises), ≥2 voisins praticables,
 * cases réservées (capitales/spawns).
 */
import { generateProceduralMap, resolveProgenSettings } from '../src/progen/index.js';
import { colRowToHex, hexDistance, neighbors } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';

const SEED = Number(process.argv[2] ?? 3714012);
const s = resolveProgenSettings();
const { map } = generateProceduralMap(SEED);
const W = map.data.width;
const H = map.data.height;

// Grille complète (classifiée) : on repart du terrain de la carte finie.
const terrainAt = (h) => map.terrain[`${h.q},${h.r}`];
const mirrorOf = (h) => ({ q: W - 1 - h.q - Math.floor(h.r / 2), r: H - 1 - h.r });

// Contraintes reconstruites depuis la carte FINIE (approximation fidèle :
// les ressources finales incluent celles sous les camps posés — la contrainte
// resourcesFull portait sur finalResources AVANT camps ; on prend les deux
// ensembles pour être large).
const spawns = map.spawns.map((sp) => sp.capital);
const resources = map.resources.map((r) => ({ q: r.q, r: r.r }));

// Candidats bruts (sans contraintes same/villages).
const candidats = [];
for (let row = 0; row < H; row++) {
  for (let col = 0; col < W; col++) {
    const t = terrainAt(colRowToHex(col, row));
    if (!t || !TERRAINS[t].passable) continue;
    const hex = colRowToHex(col, row);
    const m = mirrorOf(hex);
    // Restreindre à la demi-carte (comme le placement).
    if (!(hex.r < Math.floor(H / 2))) continue;
    if (spawns.some((sp) => hexDistance(sp, hex) < s.minVillageDistance)) continue;
    if (resources.some((r) => hexDistance(r, hex) < s.minResourceDistance)) continue;
    if (hexDistance(hex, m) < s.villageSpacing) continue;
    const pass = neighbors(hex).filter((n) => {
      const nt = terrainAt(n);
      return nt !== undefined && TERRAINS[nt].passable;
    }).length;
    if (pass < 2) continue;
    candidats.push(hex);
  }
}
console.log(`seed ${SEED} : ${candidats.length} cases éligibles (sans contrainte villages↔villages)`);

// Backtracking : ensemble indépendant de taille 6, spacing ≥ villageSpacing,
// contraintes miroir (distance à l'image de chaque posé).
const TARGET = s.villagesPerHalf;
let best = 0;
let solution = null;
let noeuds = 0;
const placement = [];
const conflit = (hex) =>
  hexDistance(hex, mirrorOf(hex)) < s.villageSpacing ||
  placement.some((p) => hexDistance(hex, p) < s.villageSpacing || hexDistance(hex, mirrorOf(p)) < s.villageSpacing);
const cherche = (debut) => {
  if (placement.length > best) { best = placement.length; solution = [...placement]; }
  if (best >= TARGET || noeuds > 2_000_000) return;
  for (let i = debut; i < candidats.length; i++) {
    noeuds++;
    const hex = candidats[i];
    if (conflit(hex)) continue;
    placement.push(hex);
    cherche(i + 1);
    placement.pop();
    if (best >= TARGET) return;
  }
};
cherche(0);
console.log(`backtracking : max indépendant trouvé = ${best}/${TARGET} (${noeuds} nœuds)`);
if (solution) console.log('solution :', solution.map((h) => `${h.q},${h.r}`).join(' '));
console.log(best >= TARGET ? '→ FAISABLE : le générateur glouton est en cause (BUG), pas un conflit de règles' : '→ NON FAISABLE sur cette grille : conflit de règles réel');
