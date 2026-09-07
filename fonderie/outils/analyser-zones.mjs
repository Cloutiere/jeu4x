// ANALYSER-ZONES — analyse spatiale du guerrier_2.2.glb (lecture seule) — FONDERIE-HABILLAGE.
// Objectifs :
//   1. déterminer la face AVANT (visière/épée d'après image_ref/guerrier.jpg)
//   2. repérer les grandes zones anatomiques (composantes connexes, bandes de hauteur)
// Usage : node outils/analyser-zones.mjs

import { readFileSync } from 'node:fs';

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
const pos = new Float32Array(bin.buffer, bin.byteOffset + bvP.byteOffset + (accP.byteOffset || 0), accP.count * 3);
const accI = json.accessors[prim.indices];
const bvI = json.bufferViews[accI.bufferView];
const idx = new Uint32Array(bin.buffer, bin.byteOffset + bvI.byteOffset + (accI.byteOffset || 0), accI.count);

const nv = accP.count;
const V = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];

// ---------- composantes connexes (par sommets partagés) ----------
const adj = Array.from({ length: nv }, () => new Set());
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
  adj[a].add(b).add(c); adj[b].add(a).add(c); adj[c].add(a).add(b);
}
const comp = new Int32Array(nv).fill(-1);
const comps = [];
for (let s = 0; s < nv; s++) {
  if (comp[s] !== -1) continue;
  const id = comps.length, pile = [s], membres = [];
  comp[s] = id;
  while (pile.length) {
    const v = pile.pop(); membres.push(v);
    for (const w of adj[v]) if (comp[w] === -1) { comp[w] = id; pile.push(w); }
  }
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], nb = 0;
  for (const v of membres) {
    const [x, y, z] = V(v); nb++;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], [x, y, z][k]); mx[k] = Math.max(mx[k], [x, y, z][k]); }
  }
  comps.push({ id, nb, mn, mx });
}
comps.sort((a, b) => b.nb - a.nb);
console.log(`=== composantes connexes : ${comps.length} ===`);
for (const c of comps.slice(0, 12)) {
  const d = c.mx.map((v, k) => (v - c.mn[k]).toFixed(2));
  console.log(`  #${c.id} sommets=${c.nb} bornes X[${c.mn[0].toFixed(2)},${c.mx[0].toFixed(2)}] Y[${c.mn[1].toFixed(2)},${c.mx[1].toFixed(2)}] Z[${c.mn[2].toFixed(2)},${c.mx[2].toFixed(2)}] taille=[${d}]`);
}

// ---------- avant : asymétrie Z par bandes de hauteur ----------
console.log(`\n=== asymétrie Z par bande de Y (moyenne Z |Z|>0.15, et extrêmes) ===`);
const NB = 14;
for (let b = 0; b < NB; b++) {
  const y0 = -1 + (b / NB) * 1.96, y1 = -1 + ((b + 1) / NB) * 1.96;
  let n = 0, sz = 0, zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < nv; i++) {
    const [x, y, z] = V(i);
    if (y < y0 || y >= y1) continue;
    n++; sz += z;
    zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
  }
  if (!n) continue;
  console.log(`  Y[${y0.toFixed(2)}..${y1.toFixed(2)}] n=${String(n).padStart(4)} zMoy=${(sz / n).toFixed(3)} Zmin=${zmin.toFixed(2)} Zmax=${zmax.toFixed(2)} Xmin=${xmin.toFixed(2)} Xmax=${xmax.toFixed(2)}`);
}

// ---------- épée : sommets loin de l'axe du corps ----------
console.log(`\n=== sommets |X|>0.55 (hors carrure) ===`);
const hors = [];
for (let i = 0; i < nv; i++) {
  const [x, y, z] = V(i);
  if (Math.abs(x) > 0.55) hors.push(i);
}
if (hors.length) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const i of hors) {
    const v = V(i);
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
  }
  console.log(`  n=${hors.length} bornes X[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] Y[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] Z[${mn[2].toFixed(2)},${mx[2].toFixed(2)}]`);
  const cs = new Set(hors.map(i => comp[i]));
  console.log(`  composantes impliquées : ${[...cs].join(', ')}`);
}

// ---------- pied / orteils : direction avant au sol ----------
console.log(`\n=== sommets Y < -0.93 (pieds) : distribution Z ===`);
let nf = 0, sz = 0;
for (let i = 0; i < nv; i++) { const [x, y, z] = V(i); if (y < -0.93) { nf++; sz += z; } }
console.log(`  n=${nf} zMoy=${(sz / Math.max(1, nf)).toFixed(3)} (négatif = orteils vers -Z)`);

// ---------- tête : fente de visière (creux) ----------
console.log(`\n=== tête (Y > 0.55) : histogramme Z ===`);
const HZ = 16, hz = new Array(HZ).fill(0);
let nt = 0;
for (let i = 0; i < nv; i++) {
  const [x, y, z] = V(i);
  if (y < 0.55) continue;
  nt++;
  hz[Math.min(HZ - 1, Math.floor(((z + 0.5) / 1.0) * HZ))]++;
}
hz.forEach((n, i) => console.log(`  z~${(-0.5 + (i + 0.5) / HZ).toFixed(2).padStart(6)} ${'#'.repeat(Math.round(n / nt * 200))} ${n}`));
