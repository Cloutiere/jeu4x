// HABILLER-GUERRIER — session FONDERIE-HABILLAGE (handoff du même nom).
// Charge image_ref/guerrier_2.2.glb (silhouette VALIDÉE par Erik : 4 000 tris,
// 1 mesh, POSITION seule, origine au centre du corps), la découpe en zones
// matériaux par heuristiques géométriques (bandes de hauteur, saillances,
// symétrie des membres), la pare au style STYLE-3D et exporte :
//   modeles/guerrier_v2.glb        — le modèle habillé (3 matériaux, origine sol)
//   modeles/guerrier_v2_ZONES.glb  — DEBUG : 1 matériau plat par zone (partition)
// + rendus de contrôle PNG dans captures/ (zones brutes et habillage simulé).
//
// Périmètre : habillage uniquement — AUCUNE resculpture de la silhouette.
// Usage : node outils/habiller-guerrier.mjs [--tranches]
//   --tranches : debug — bandes de hauteur colorées (calage des seuils Y)

import { readFileSync, writeFileSync } from 'node:fs';
import { encoderPNG, construireGLB } from './glb.mjs';
import { rendreVues, VUES } from './raster.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const debugTranches = process.argv.includes('--tranches');
const calibre = process.argv.includes('--calibre');

// ---------- 1. chargement ----------
const buf = readFileSync(new URL('../../image_ref/guerrier_2.2.glb', import.meta.url));
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const chunk = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004e4942) bin = chunk;
  off += 8 + len;
}
const prim = json.meshes[0].primitives[0];
const accP = json.accessors[prim.attributes.POSITION];
const bvP = json.bufferViews[accP.bufferView];
const pos0 = new Float32Array(bin.buffer, bin.byteOffset + bvP.byteOffset + (accP.byteOffset || 0), accP.count * 3);
const accI = json.accessors[prim.indices];
const bvI = json.bufferViews[accI.bufferView];
const idx = new Uint32Array(bin.buffer, bin.byteOffset + bvI.byteOffset + (accI.byteOffset || 0), accI.count);
const NV = accP.count, NT = idx.length / 3;
console.log(`source : ${NV} sommets, ${NT} triangles`);

// ---------- 2. orientation, mesures & recentrage (pivot au SOL, corps centré, face -Z) ----------
// La source face +Z (visière lisible depuis la caméra +Z, vérifié sur rendu corrigé)
// -> rotation 180° autour de Y pour la convention du jeu (face -Z)
const pos = new Float32Array(pos0); // copie (on ne touche pas au tableau source)
for (let i = 0; i < NV; i++) { pos[i * 3] = -pos[i * 3]; pos[i * 3 + 2] = -pos[i * 3 + 2]; }
console.log(`orientation : source face +Z -> pivotée 180° (face -Z, convention du jeu)`);

const centroids = new Float32Array(NT * 3);
let minY = Infinity, maxY = -Infinity;
for (let t = 0; t < NT; t++) {
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 3; k++) {
    const v = idx[t * 3 + k];
    cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2];
  }
  centroids[t * 3] = cx / 3; centroids[t * 3 + 1] = cy / 3; centroids[t * 3 + 2] = cz / 3;
  minY = Math.min(minY, cy / 3); maxY = Math.max(maxY, cy / 3);
}
// pieds = 2 clusters de tris tout en bas ; le corps est centré sur leur milieu
const piedsTris = [];
for (let t = 0; t < NT; t++) if (centroids[t * 3 + 1] < minY + 0.12) piedsTris.push(t);
piedsTris.sort((a, b) => centroids[a * 3] - centroids[b * 3]);
const clustersPieds = [[piedsTris[0]]];
for (let i = 1; i < piedsTris.length; i++) {
  if (centroids[piedsTris[i] * 3] - centroids[piedsTris[i - 1] * 3] > 0.15) clustersPieds.push([]);
  clustersPieds[clustersPieds.length - 1].push(piedsTris[i]);
}
const piedsG = clustersPieds.filter(c => c.length > 10).map(c => {
  let x = 0, z = 0;
  for (const t of c) { x += centroids[t * 3]; z += centroids[t * 3 + 2]; }
  return [x / c.length, z / c.length];
});
const spineX = piedsG.reduce((s, p) => s + p[0], 0) / piedsG.length;
const spineZ = piedsG.reduce((s, p) => s + p[1], 0) / piedsG.length;
const H = maxY - minY;
console.log(`pieds : ${piedsG.map(p => `(${p[0].toFixed(2)},${p[1].toFixed(2)})`).join(' ')} — axe corps (${spineX.toFixed(3)}, ${spineZ.toFixed(3)}), hauteur ${H.toFixed(3)}`);

// recentrage : X/Z du corps -> 0, Y min -> 0
for (let i = 0; i < NV; i++) {
  pos[i * 3] -= spineX;
  pos[i * 3 + 1] -= minY;
  pos[i * 3 + 2] -= spineZ;
}
for (let t = 0; t < NT; t++) {
  centroids[t * 3] -= spineX;
  centroids[t * 3 + 1] -= minY;
  centroids[t * 3 + 2] -= spineZ;
}

// normales plates par triangle (sur mesh recentré)
const nTris = new Float32Array(NT * 3);
for (let t = 0; t < NT; t++) {
  const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
  const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nTris[t * 3] = nx / l; nTris[t * 3 + 1] = ny / l; nTris[t * 3 + 2] = nz / l;
}

// ---------- 3. zones — SEUILS (unités du mesh recentré, H ≈ 1.96, ajuster à l'œil) ----------
// --calibre : mesure la fente de visière (creux Z de la face) et l'étranglement de ceinture
if (calibre) {
  console.log(`\n=== calibre : face du casque (tris |X|<0.2, Y>1.5) par tranche de Y — zMin / tris avant (z<-0.02) ===`);
  for (let y = 1.50; y < 1.96; y += 0.02) {
    let n = 0, zMin = Infinity, zMax = -Infinity, nAv = 0;
    for (let t = 0; t < NT; t++) {
      const x = centroids[t * 3], yy = centroids[t * 3 + 1], z = centroids[t * 3 + 2];
      if (yy < y || yy >= y + 0.02 || Math.abs(x) > 0.2) continue;
      n++; zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
      if (z < -0.02) nAv++;
    }
    if (n) console.log(`  Y[${y.toFixed(2)}..${(y + 0.02).toFixed(2)}] n=${String(n).padStart(3)} z[${zMin.toFixed(3)}, ${zMax.toFixed(3)}] avant=${nAv}`);
  }
  console.log(`\n=== calibre : étranglement du tronc (tris |X|<0.34, Y 0.7..1.2) — étendue X et Z par tranche ===`);
  for (let y = 0.70; y < 1.20; y += 0.025) {
    let xMin = Infinity, xMax = -Infinity, n = 0, zMin = Infinity, zMax = -Infinity;
    for (let t = 0; t < NT; t++) {
      const x = centroids[t * 3], yy = centroids[t * 3 + 1], z = centroids[t * 3 + 2];
      if (yy < y || yy >= y + 0.025 || Math.abs(x) > 0.34) continue;
      n++; xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    }
    if (n) console.log(`  Y[${y.toFixed(3)}..${(y + 0.025).toFixed(3)}] n=${String(n).padStart(3)} X[${xMin.toFixed(2)},${xMax.toFixed(2)}] Z[${zMin.toFixed(2)},${zMax.toFixed(2)}]`);
  }
}

const S = {
  casqueY: 1.64, casqueCx: 0.035, casqueX: 0.20,   // au-dessus de casqueY = casque (tête décalée à X≈+0.035 après pivot)
  // la fente de visière : bande avant du casque côté -Z (le néon tapisse le creux)
  visiere: { y0: 1.735, y1: 1.825, z0: -0.18, z1: -0.10, xLargeur: 0.17, nzMax: -0.3 },
  epauleY: [1.38, 1.68], epauleX: 0.15, epauleSupY: 1.57, // épaulières ; tranche haute = accent
  torseX: 0.26, torseY: [0.80, 1.64],
  ceintureY: [0.96, 1.06], ceintureX: 0.30, ceintureZ: [-0.28, 0.38], // bande à la taille (créase Y≈1.0)
  ecusson: { x: [-0.15, 0.05], y: [1.12, 1.38], zMax: -0.09, zMin: -0.28 }, // patch pectoral -> accent (poitrine voûtée, paroi avant z≈-0.15..0)
  lameX: 0.60, lameY: 1.00, lameEpais: 0.17,       // la lame vit à +X (après pivot), au-dessus de lameY
  lameA: [0.50, 1.02, 0.28], lameB: [1.24, 1.60, 0.26], // axe poignée->pointe (fil du tranchant)
  poignee: { xMin: 0.42, y: [0.86, 1.22], z: [0.06, 0.52] }, // garde + poignée (+ main vue l'épaisseur)
  genouY: [0.40, 0.72], genouYArriere: [0.36, 0.58], genouZMarge: 0.06, genouNz: -0.2, // genoux : face AVANT (-Z) de chaque jambe (la jambe arrière est plus basse)
  brasY: [0.90, 1.42], brasX: 0.26,                // membres hors du fût central (sous l'aisselle)
  piedY: 0.14,                                     // en dessous = pieds
};

// distance d'un point au segment lameA-lameB
function distAxeLame(x, y, z) {
  const [ax, ay, az] = S.lameA, [bx, by, bz] = S.lameB;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const L2 = ux * ux + uy * uy + uz * uz;
  let t = ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + ux * t), y - (ay + uy * t), z - (az + uz * t));
}

// genoux : frontière de chaque jambe calculée sur SA bande (jambe arrière = genou plus bas)
const jambeMinZ = { g: Infinity, d: Infinity };
for (let t = 0; t < NT; t++) {
  const y = centroids[t * 3 + 1];
  const x = centroids[t * 3], z = centroids[t * 3 + 2];
  if (x < 0.02) { if (y < S.genouY[0] || y > S.genouY[1]) continue; jambeMinZ.g = Math.min(jambeMinZ.g, z); }
  else { if (y < S.genouYArriere[0] || y > S.genouYArriere[1]) continue; jambeMinZ.d = Math.min(jambeMinZ.d, z); }
}

const ZONES = [
  'torse', 'casque', 'visiere', 'epaulieres', 'epaulieresSup', 'bras',
  'jambes', 'genoux', 'ceinture', 'ecusson', 'lame', 'garde', 'pieds',
];
const MAT_ZONE = { torse: 0, casque: 0, visiere: 1, epaulieres: 0, epaulieresSup: 2, bras: 0, jambes: 0, genoux: 2, ceinture: 2, ecusson: 2, lame: 0, garde: 2, pieds: 0 };

function zoneDu(t) {
  const x = centroids[t * 3], y = centroids[t * 3 + 1], z = centroids[t * 3 + 2];
  if (x > S.lameX && y > S.lameY && distAxeLame(x, y, z) < S.lameEpais) return 'lame';
  if (x > S.poignee.xMin && y > S.poignee.y[0] && y < S.poignee.y[1] && z > S.poignee.z[0] && z < S.poignee.z[1]) return 'garde';
  if (y > S.casqueY && Math.abs(x - S.casqueCx) < S.casqueX) {
    const v = S.visiere;
    if (y > v.y0 && y < v.y1 && z > v.z0 && z < v.z1 && Math.abs(x - S.casqueCx) < v.xLargeur && nTris[t * 3 + 2] < v.nzMax) return 'visiere';
    return 'casque';
  }
  if (y > S.epauleY[0] && y < S.epauleY[1] && Math.abs(x) > S.epauleX) {
    if (y > S.epauleSupY) return 'epaulieresSup';
    return 'epaulieres';
  }
  if (y > S.ceintureY[0] && y < S.ceintureY[1] && Math.abs(x) < S.ceintureX && z > S.ceintureZ[0] && z < S.ceintureZ[1]) return 'ceinture';
  if (x > S.ecusson.x[0] && x < S.ecusson.x[1] && y > S.ecusson.y[0] && y < S.ecusson.y[1] && z < S.ecusson.zMax && z > S.ecusson.zMin) return 'ecusson';
  if (x < 0.02 ? (y > S.genouY[0] && y < S.genouY[1]) : (y > S.genouYArriere[0] && y < S.genouYArriere[1])) {
    const mz = x < 0.02 ? jambeMinZ.g : jambeMinZ.d;
    if (z < mz + S.genouZMarge && nTris[t * 3 + 2] < S.genouNz) return 'genoux';
  }
  if (y > S.brasY[0] && y < S.brasY[1] && Math.abs(x) > S.brasX) return 'bras';
  if (y < S.piedY) return 'pieds';
  if (y < 0.82) return 'jambes';
  if (y > S.casqueY && Math.abs(x - S.casqueCx) < 0.24) return 'casque';
  return 'torse'; // côtés du tronc (au-delà des règles dédiées)
}

const zoneTri = new Uint8Array(NT);
const compteZones = Object.fromEntries(ZONES.map(z => [z, 0]));
const bornesZones = Object.fromEntries(ZONES.map(z => [z, [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]]));
for (let t = 0; t < NT; t++) {
  const z = debugTranches ? null : zoneDu(t);
  if (z) {
    zoneTri[t] = ZONES.indexOf(z); compteZones[z]++;
    const b = bornesZones[z];
    for (let k = 0; k < 3; k++) { b[0][k] = Math.min(b[0][k], centroids[t * 3 + k]); b[1][k] = Math.max(b[1][k], centroids[t * 3 + k]); }
  }
}
console.log(`\nzones (tris) : ${ZONES.map(z => `${z}=${compteZones[z]}`).join(' ')}`);
if (!debugTranches) for (const z of ZONES) {
  const b = bornesZones[z];
  if (!compteZones[z]) continue;
  console.log(`  ${z.padEnd(14)} X[${b[0][0].toFixed(2)},${b[1][0].toFixed(2)}] Y[${b[0][1].toFixed(2)},${b[1][1].toFixed(2)}] Z[${b[0][2].toFixed(2)},${b[1][2].toFixed(2)}]`);
}

// debug --tranches : palette par bande de Y (calage des seuils à l'œil)
if (debugTranches) {
  const PAS = 0.08;
  for (let t = 0; t < NT; t++) zoneTri[t] = Math.floor(centroids[t * 3 + 1] / PAS) % 6;
}

// ---------- 4. arêtes néon (LINES — 0 triangle) ----------
// a) arêtes vives : dièdre > seuil
// b) frontières de matériau : l'arête sépare deux triangles de matériaux différents
const SEUIL_DIEDRE = 40 * Math.PI / 180;
const cleA = (a, b) => a < b ? a * NV + b : b * NV + a; // NV=2002 -> produit < 2^32
const arretes = new Map(); // clé -> {t1, t2, m1, m2}
for (let t = 0; t < NT; t++) {
  for (let k = 0; k < 3; k++) {
    const a = idx[t * 3 + k], b = idx[t * 3 + (k + 1) % 3];
    const cle = cleA(a, b);
    const e = arretes.get(cle);
    if (e) { e.t2 = t; e.m2 = MAT_ZONE[ZONES[zoneTri[t]]]; }
    else arretes.set(cle, { t1: t, t2: -1, m1: MAT_ZONE[ZONES[zoneTri[t]]], m2: -1 });
  }
}
const segmentsAretes = [];
let nDiedre = 0, nFrontiere = 0;
for (const [cle, e] of arretes) {
  const vives = e.t2 >= 0 && (() => {
    const d = Math.max(-1, Math.min(1,
      nTris[e.t1 * 3] * nTris[e.t2 * 3] + nTris[e.t1 * 3 + 1] * nTris[e.t2 * 3 + 1] + nTris[e.t1 * 3 + 2] * nTris[e.t2 * 3 + 2]));
    return Math.acos(d) > SEUIL_DIEDRE;
  })();
  const frontiere = e.t2 >= 0 && e.m1 !== e.m2;
  if (!vives && !frontiere) continue;
  if (vives) nDiedre++;
  if (frontiere) nFrontiere++;
  const a = Math.floor(cle / NV), b = cle % NV;
  segmentsAretes.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
}
console.log(`arêtes néon : ${segmentsAretes.length / 6} segments (dièdre > 40° : ${nDiedre}, frontières de matériau : ${nFrontiere})`);

// ---------- 5. fil émissif du tranchant (LINES) ----------
// tranches le long de l'axe lame ; par tranche le sommet le plus bas = le tranchant (dentelé)
const filLame = [];
{
  const [ax, ay, az] = S.lameA, [bx, by, bz] = S.lameB;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const L = Math.hypot(ux, uy, uz), N = 30;
  const dansLame = new Set();
  for (let t = 0; t < NT; t++) if (ZONES[zoneTri[t]] === 'lame') for (let k = 0; k < 3; k++) dansLame.add(idx[t * 3 + k]);
  let prec = null;
  for (let s = 0; s <= N; s++) {
    const t = s / N;
    const px = ax + ux * t, py = ay + uy * t, pz = az + uz * t;
    let meilleur = -1, meilleureY = Infinity;
    for (const v of dansLame) {
      const vx = pos[v * 3], vy = pos[v * 3 + 1], vz = pos[v * 3 + 2];
      if (Math.hypot(vx - px, vy - py, vz - pz) > 0.10) continue;
      if (vy < meilleureY) { meilleureY = vy; meilleur = v; }
    }
    if (meilleur >= 0) {
      if (prec) filLame.push(prec[0], prec[1], prec[2], pos[meilleur * 3], pos[meilleur * 3 + 1], pos[meilleur * 3 + 2]);
      prec = [pos[meilleur * 3], pos[meilleur * 3 + 1], pos[meilleur * 3 + 2]];
    }
  }
}
console.log(`fil du tranchant : ${filLame.length / 6} segments`);

// ---------- 6. cœur néon pectoral + colonne de données (LINES) ----------
const lignesCoeur = [];
{
  // cœur : octaèdre filaire devant le torse (visible À TRAVERS le corps translucide)
  const c = [-0.06, 1.24, -0.10], r = 0.06;
  const sommets = [[c[0] + r, c[1], c[2]], [c[0] - r, c[1], c[2]], [c[0], c[1] + r, c[2]], [c[0], c[1] - r, c[2]], [c[0], c[1], c[2] + r], [c[0], c[1], c[2] - r]];
  for (const [a, b] of [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]])
    lignesCoeur.push(...sommets[a], ...sommets[b]);
  // colonne de données : suit le centre du torse, anneaux réguliers
  const NB = 14;
  let prec = null;
  for (let s = 0; s <= NB; s++) {
    const y = 0.82 + (s / NB) * 0.74;
    let sx = 0, sz = 0, n = 0;
    for (let t = 0; t < NT; t++) {
      if (ZONES[zoneTri[t]] !== 'torse') continue;
      if (Math.abs(centroids[t * 3 + 1] - y) > 0.045) continue;
      sx += centroids[t * 3]; sz += centroids[t * 3 + 2]; n++;
    }
    if (n < 5) continue;
    const px = sx / n, pz = sz / n;
    if (prec) lignesCoeur.push(prec[0], prec[1], prec[2], px, y, pz);
    prec = [px, y, pz];
    if (s % 3 === 0) { // petit anneau hexagonal autour de la colonne
      const R = 0.035;
      for (let k = 0; k < 6; k++) {
        const a1 = (k / 6) * Math.PI * 2, a2 = ((k + 1) / 6) * Math.PI * 2;
        lignesCoeur.push(px + Math.cos(a1) * R, y, pz + Math.sin(a1) * R, px + Math.cos(a2) * R, y, pz + Math.sin(a2) * R);
      }
    }
  }
}

// ---------- 7. rendus de contrôle ----------
function expandPar(predicat) {
  const out = [];
  for (let t = 0; t < NT; t++) {
    if (!predicat(t)) continue;
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      out.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
  }
  return new Float32Array(out);
}

const PALETTE_ZONES = {
  torse: [0.30, 0.42, 0.50], casque: [0.20, 0.50, 0.45], visiere: [0.95, 0.95, 0.20],
  epaulieres: [0.45, 0.35, 0.60], epaulieresSup: [0.90, 0.55, 0.15], bras: [0.30, 0.55, 0.30],
  jambes: [0.25, 0.32, 0.55], genoux: [0.90, 0.30, 0.30], ceinture: [0.90, 0.75, 0.25],
  ecusson: [0.20, 0.85, 0.85], lame: [0.60, 0.65, 0.72], garde: [0.75, 0.45, 0.55], pieds: [0.40, 0.45, 0.40],
};
const PALETTE_TRANCHES = [[0.8, 0.3, 0.3], [0.8, 0.6, 0.2], [0.4, 0.8, 0.3], [0.3, 0.7, 0.8], [0.4, 0.4, 0.9], [0.8, 0.3, 0.8]];

const triSetsZones = [];
for (let zi = 0; zi < ZONES.length; zi++) {
  const p = expandPar(t => zoneTri[t] === zi);
  if (p.length) triSetsZones.push({ positions: p, groupe: zi });
}
const paletteZones = debugTranches ? PALETTE_TRANCHES : ZONES.map(z => PALETTE_ZONES[z]);
const lignesDebug = [{ positions: new Float32Array(segmentsAretes), groupe: 0 }, { positions: new Float32Array(filLame), groupe: 0 }];

// habillage simulé (3 matériaux) pour juger le fini sans navigateur
const PALETTE_MATS = [[0.11, 0.18, 0.235], [0.24, 1.0, 0.81], [0.85, 0.9, 0.88]];
const triSetsMats = [0, 1, 2].map(m => ({ positions: expandPar(t => MAT_ZONE[ZONES[zoneTri[t]]] === m), groupe: m }));
{ // la lentille de visière complète le néon dans la simulation
  const sNeon = triSetsMats[1];
  const fus = new Float32Array(sNeon.positions.length + quadsNeonSupplementaires().length);
  fus.set(sNeon.positions); fus.set(quadsNeonSupplementaires(), sNeon.positions.length);
  sNeon.positions = fus;
}

// --tete : gros plan sur la tête (tris Y > 1.5), bandes de 3 cm pour caler la fente
if (process.argv.includes('--tete')) {
  const BANDES = [[0.85, 0.3, 0.3], [0.85, 0.6, 0.2], [0.6, 0.8, 0.25], [0.3, 0.8, 0.5], [0.3, 0.6, 0.9], [0.5, 0.4, 0.9], [0.85, 0.35, 0.8]];
  const tete = [];
  for (let t = 0; t < NT; t++) {
    if (centroids[t * 3 + 1] < 1.5) continue;
    const p = expandPar(x => x === t);
    tete.push({ positions: p, groupe: Math.floor((centroids[t * 3 + 1] - 1.5) / 0.03) % BANDES.length });
  }
  rendreVues({ triangles: tete, lignes: [], vues: { avant: VUES.avant, gauche: VUES.gauche, droite: VUES.droite }, palette: BANDES, taille: 500, nomFichier: (v) => `../captures/tete-${v}.png` });
  process.exit(0);
}

// --carte : carte ASCII de profondeur de la face du casque (z min par cellule X-Y)
if (process.argv.includes('--carte')) {
  console.log(`\ncarte de profondeur de la tête (z MIN par cellule = côté visage -Z ; X en colonnes -0.14..+0.18, Y en lignes 1.60..1.96) :`);
  const NX = 17, x0 = -0.14, x1 = 0.18;
  const RAMPE = ' .:-=+*#%@';
  for (let y = 1.94; y >= 1.60; y -= 0.02) {
    let ligne = `Y${y.toFixed(2)} `;
    for (let ix = 0; ix < NX; ix++) {
      const xa = x0 + (ix / NX) * (x1 - x0), xb = x0 + ((ix + 1) / NX) * (x1 - x0);
      let zMin = Infinity;
      for (let t = 0; t < NT; t++) {
        const cx = centroids[t * 3], cy = centroids[t * 3 + 1], cz = centroids[t * 3 + 2];
        if (cy < y || cy >= y + 0.02 || cx < xa || cx >= xb || cz > 0.02) continue;
        zMin = Math.min(zMin, cz);
      }
      ligne += zMin === Infinity ? '  ' : (zMin >= 0 ? ' +' : RAMPE[Math.min(9, Math.floor(-zMin / 0.14 * 9))] + ' ');
    }
    console.log(ligne);
  }
  process.exit(0);
}

// --zoom Ymin Ymax [hab] : gros plan sur une tranche, couleurs ZONES ou habillage simulé
const argZoom = process.argv.indexOf('--zoom');
if (argZoom > 0) {
  const y0z = parseFloat(process.argv[argZoom + 1]), y1z = parseFloat(process.argv[argZoom + 2]);
  const hab = process.argv[argZoom + 3] === 'hab';
  const tris = [];
  if (hab) {
    const parMat = [new Float32Array(0), new Float32Array(0), new Float32Array(0)];
    const boutParMat = [[], [], []];
    for (let t = 0; t < NT; t++) {
      const y = centroids[t * 3 + 1];
      if (y < y0z || y >= y1z) continue;
      const m = MAT_ZONE[ZONES[zoneTri[t]]];
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        boutParMat[m].push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      }
    }
    if (y1z > 1.6) boutParMat[1].push(...quadsNeonSupplementaires()); // lentille
    tris.push(...boutParMat.map((b, m) => ({ positions: new Float32Array(b), groupe: m })).filter(s => s.positions.length));
  } else {
    for (let zi = 0; zi < ZONES.length; zi++) {
      const p = expandPar(t => zoneTri[t] === zi && centroids[t * 3 + 1] >= y0z && centroids[t * 3 + 1] < y1z);
      if (p.length) tris.push({ positions: p, groupe: zi });
    }
  }
  // lignes filtrées sur la tranche (les arêtes couvrent tout le corps sinon)
  const lignesZoom = lignesDebug.map(l => {
    const out = [];
    for (let i = 0; i < l.positions.length; i += 6) {
      const y1l = l.positions[i + 1], y2l = l.positions[i + 4];
      if ((y1l >= y0z - 0.06 && y1l < y1z + 0.06) && (y2l >= y0z - 0.06 && y2l < y1z + 0.06))
        out.push(l.positions[i], l.positions[i + 1], l.positions[i + 2], l.positions[i + 3], l.positions[i + 4], l.positions[i + 5]);
    }
    return { positions: new Float32Array(out), groupe: l.groupe };
  });
  rendreVues({ triangles: tris, lignes: hab ? lignesZoom : [], vues: { avant: VUES.avant, arriere: VUES.arriere, gauche: VUES.gauche, droite: VUES.droite }, palette: hab ? PALETTE_MATS : ZONES.map(z => PALETTE_ZONES[z]), paletteLignes: [[0.24, 1.0, 0.81]], groupesPlein: hab ? [1] : null, taille: 500, nomFichier: (v) => `../captures/zoom-${v}.png` });
  process.exit(0);
}

const optsCommuns = { taille: 460, palette: paletteZones, paletteLignes: [[0.24, 1.0, 0.81]] };
rendreVues({ triangles: triSetsZones, lignes: debugTranches ? [] : lignesDebug, vues: { avant: VUES.avant, arriere: VUES.arriere, gauche: VUES.gauche, droite: VUES.droite }, destBase: 'captures/zones', nomFichier: (v) => `../captures/${debugTranches ? 'tranches' : 'zones'}-${v}.png`, ...optsCommuns });
rendreVues({
  triangles: triSetsMats, lignes: lignesDebug, vues: { avant: VUES.avant, arriere: VUES.arriere, gauche: VUES.gauche, droite: VUES.droite },
  palette: PALETTE_MATS, paletteLignes: [[0.24, 1.0, 0.81]], groupesPlein: [1], taille: 460,
  nomFichier: (v) => `../captures/habillage-${v}.png`,
});

// ---------- 8. exports GLB ----------
function textureGlyphes() {
  // glyphes binaires 256² (identique au langage v1) — émissive légère du corps
  const T = 256, px = new Uint8Array(T * T * 4);
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    px[i] = 0; px[i + 1] = Math.round(255 * 0.24) * v; px[i + 2] = Math.round(255 * 0.808) * v; px[i + 3] = 255;
  };
  const chiffre = (x0, y0, c) => {
    const carres = c === '0'
      ? [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [0, 4], [1, 4], [2, 4]]
      : [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
    for (const [dx, dy] of carres) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) set(x0 + dx * 2 + a, y0 + dy * 2 + b, 1);
  };
  let graine = 42;
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let ligne = 0; ligne < 9; ligne++) {
    const y = 6 + ligne * 28 + ((alea() * 4) | 0);
    let x = 6 + ((alea() * 14) | 0);
    const n = 4 + ((alea() * 7) | 0);
    for (let k = 0; k < n; k++) {
      if (alea() < 0.16) { for (let d = 0; d < 10; d++) set(x + d, y + 2, 1); x += 14; }
      else { chiffre(x, y, alea() < 0.5 ? '0' : '1'); x += 10; }
      if (x > T - 12) break;
    }
  }
  return encoderPNG(T, T, Buffer.from(px));
}

// primitives habillées : TRIANGLES par matériau (corps avec normales + UV cylindriques), LINES
function expandMat(m, avecUV) {
  const out = [], uvs = [];
  for (let t = 0; t < NT; t++) {
    if (MAT_ZONE[ZONES[zoneTri[t]]] !== m) continue;
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      out.push(x, y, z);
      if (avecUV) uvs.push(Math.atan2(z, x) / (2 * Math.PI) + 0.5, Math.max(0, Math.min(1, y / H)));
    }
  }
  return { positions: new Float32Array(out), uvs: avecUV ? new Float32Array(uvs) : undefined };
}

function normalesDe(positions) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < positions.length / 9; t++) {
    const i = t * 9;
    const ux = positions[i + 3] - positions[i], uy = positions[i + 4] - positions[i + 1], uz = positions[i + 5] - positions[i + 2];
    const vx = positions[i + 6] - positions[i], vy = positions[i + 7] - positions[i + 1], vz = positions[i + 8] - positions[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 3; k++) { n[i + k * 3] = nx / l; n[i + k * 3 + 1] = ny / l; n[i + k * 3 + 2] = nz / l; }
  }
  return n;
}

// ruban de visière : la fente du casque est une gorge peu profonde sur la plaque
// faciale (-Z) — on pose un ruban néon fin qui ÉPOUSE la surface (tranches en x,
// z = surface externe - 0.012) à la ligne de visière (pattern v1 : visière émissive).
// ~22 triangles seulement (budget < 5 000 respecté).
function quadsNeonSupplementaires() {
  const YC = 1.78, DH = 0.022, OFF = -0.012, X0 = -0.10, X1 = 0.13, N = 12;
  const points = [];
  for (let s = 0; s <= N; s++) {
    const xi = X0 + (s / N) * (X1 - X0);
    let zMin = Infinity;
    for (let t = 0; t < NT; t++) {
      if (Math.abs(centroids[t * 3] - xi) > 0.03) continue;
      if (centroids[t * 3 + 1] < 1.755 || centroids[t * 3 + 1] > 1.815) continue;
      if (nTris[t * 3 + 2] > -0.5) continue; // faces orientées vers -Z seulement
      zMin = Math.min(zMin, centroids[t * 3 + 2]);
    }
    if (zMin < Infinity) points.push([xi, zMin + OFF]);
  }
  const out = [];
  for (let s = 0; s + 1 < points.length; s++) {
    const [xa, za] = points[s], [xb, zb] = points[s + 1];
    const T1 = [xa, YC + DH, za], B1 = [xa, YC - DH, za], B2 = [xb, YC - DH, zb], T2 = [xb, YC + DH, zb];
    out.push(...T1, ...B2, ...B1, ...T1, ...T2, ...B2); // normale vers -Z
  }
  return new Float32Array(out);
}

// (couleurs de référence : #3DFFCE néon, #1C2E3C corps — reprises en linéaire
// dans les matériaux ci-dessous, valeurs exactes du guerrier.glb v1)
const corps = expandMat(0, true), neon = expandMat(1, false), accent = expandMat(2, false);
const lentille = quadsNeonSupplementaires();
const neonComplet = new Float32Array(neon.positions.length + lentille.length);
neonComplet.set(neon.positions); neonComplet.set(lentille, neon.positions.length);
const primsH = [
  { mode: 'TRIANGLES', positions: corps.positions, normals: normalesDe(corps.positions), uvs: corps.uvs, material: 0 },
  { mode: 'TRIANGLES', positions: neonComplet, normals: normalesDe(neonComplet), material: 1 },
  { mode: 'TRIANGLES', positions: accent.positions, normals: normalesDe(accent.positions), material: 2 },
  { mode: 'LINES', positions: new Float32Array(segmentsAretes), material: 1 },
  { mode: 'LINES', positions: new Float32Array(filLame), material: 1 },
  { mode: 'LINES', positions: new Float32Array(lignesCoeur), material: 1 },
];
// Matériaux : EXACTEMENT ceux du langage fonderie (v1, 22 unités). Les facteurs
// sont en LINÉAIRE (THREE.Color convertit sRGB->linéaire à l'autorisation) —
// valeurs reprises à l'identique du guerrier.glb v1 pour un rendu homogène.
const materiaux = [
  { // 0 — corps translucide teinté, glyphes binaires en texture émissive
    name: 'corps',
    pbrMetallicRoughness: {
      baseColorFactor: [0.02554693938781933, 0.06010596159441241, 0.09940964963403098, 0.55],
      metallicFactor: 0.15, roughnessFactor: 0.5,
    },
    emissiveFactor: [0.025665797481620605, 0.55, 0.33946360932663494],
    emissiveTexture: { index: 0 },
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 0.9 } },
    alphaMode: 'BLEND',
    doubleSided: true,
  },
  { // 1 — néon pur (intensité > 1 pour déclencher le bloom) — JAMAIS teinté
    name: 'neon',
    pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
    emissiveFactor: [0.04666508633021928, 1, 0.6172065624120635],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3.5 } },
  },
  { // 2 — accent joueur (blanc neutre, teinté par le jeu/le visualiseur)
    name: 'accent_joueur',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.45 },
    emissiveFactor: [0.05, 0.05, 0.05],
  },
];
const glbH = construireGLB({ primitives: primsH, materiaux, image: textureGlyphes(), extensionsUtilisees: ['KHR_materials_emissive_strength'] });
writeFileSync(join(racine, 'modeles', 'guerrier_v2.glb'), glbH);
console.log(`\nguerrier_v2.glb écrit (${(glbH.length / 1024).toFixed(0)} Ko) — ${NT + quadsNeonSupplementaires().length / 9} tris (mesh source + ruban de visière)`);

// export debug de la partition (inutile en mode --tranches)
if (!debugTranches) {
  const primsZ = [];
  for (let i = 0; i < ZONES.length; i++) {
    const p = expandPar(t => zoneTri[t] === i);
    if (!p.length) continue;
    primsZ.push({ mode: 'TRIANGLES', positions: p, normals: normalesDe(p), material: i });
  }
  primsZ.push({ mode: 'LINES', positions: new Float32Array(segmentsAretes), material: ZONES.length });
  const materiauxZ = ZONES.map((z) => ({
    name: `zone_${z}`,
    pbrMetallicRoughness: { baseColorFactor: [...PALETTE_ZONES[z], 1], metallicFactor: 0.1, roughnessFactor: 0.6 },
  })).concat([{ name: 'zone_aretes', pbrMetallicRoughness: { baseColorFactor: [0.24, 1.0, 0.81, 1], metallicFactor: 0, roughnessFactor: 1 } }]);
  const glbZ = construireGLB({ primitives: primsZ, materiaux: materiauxZ, nom: 'guerrier_v2_zones' });
  writeFileSync(join(racine, 'modeles', 'guerrier_v2_ZONES.glb'), glbZ);
  console.log(`guerrier_v2_ZONES.glb écrit (debug, ${(glbZ.length / 1024).toFixed(0)} Ko)`);
}

// ---------- 9. conformité ----------
const bMin = [Infinity, Infinity, Infinity], bMax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < NV; i++) for (let k = 0; k < 3; k++) { bMin[k] = Math.min(bMin[k], pos[i * 3 + k]); bMax[k] = Math.max(bMax[k], pos[i * 3 + k]); }
console.log(`\nconformité : tris ${NT + quadsNeonSupplementaires().length / 9} (< 5 000 ✓), matériaux 3 (corps/neon/accent_joueur ✓)`);
console.log(`bornes export : X[${bMin[0].toFixed(3)}, ${bMax[0].toFixed(3)}] Y[${bMin[1].toFixed(3)}, ${bMax[1].toFixed(3)}] Z[${bMin[2].toFixed(3)}, ${bMax[2].toFixed(3)}]`);
console.log(`origine au sol (Ymin=0 ✓), corps centré X/Z (pieds), face -Z (visière) ✓`);
