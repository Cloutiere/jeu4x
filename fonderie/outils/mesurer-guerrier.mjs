// MESURER-GUERRIER — mesures anatomiques du guerrier_2.2.glb (lecture seule).
// Sert à caler les seuils de découpe de habiller-guerrier.mjs.
// Usage : node outils/mesurer-guerrier.mjs

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
const NT = idx.length / 3;

const C = (t) => {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  return [(pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3];
};
const ct = Array.from({ length: NT }, (_, t) => C(t));

const f3 = (v) => v.map(x => x.toFixed(3)).join(',');
const bbox = (ts) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of ts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], ct[t][k]); mx[k] = Math.max(mx[k], ct[t][k]); }
  return { mn, mx };
};

console.log(`triangles : ${NT}`);
// 1. pieds
const pieds = ct.map((c, t) => [c, t]).filter(([c]) => c[1] < -0.88).map(([, t]) => t);
console.log(`\npieds (cY < -0.88) : ${pieds.length} tris, bbox ${f3(bbox(pieds).mn)} -> ${f3(bbox(pieds).mx)}`);
// clusters par X
const trie = [...pieds].sort((a, b) => ct[a][0] - ct[b][0]);
let clusters = [[trie[0]]];
for (let i = 1; i < trie.length; i++) {
  if (ct[trie[i]][0] - ct[trie[i - 1]][0] > 0.12) clusters.push([]);
  clusters[clusters.length - 1].push(trie[i]);
}
clusters = clusters.filter(c => c.length > 10);
for (const c of clusters) {
  const bb = bbox(c);
  const g = [0, 1, 2].map(k => c.reduce((s, t) => s + ct[t][k], 0) / c.length);
  console.log(`  cluster ${c.length} tris : centre ${f3(g)} X[${bb.mn[0].toFixed(2)},${bb.mx[0].toFixed(2)}] Z[${bb.mn[2].toFixed(2)},${bb.mx[2].toFixed(2)}]`);
}

// 2. sections par tranche de Y : nombre de tris, étendue XZ, centre XZ
console.log(`\nsections horizontales (40 tranches) :`);
const NB = 40;
for (let b = 0; b < NB; b++) {
  const y0 = -1 + (b / NB) * 1.96, y1 = -1 + ((b + 1) / NB) * 1.96;
  const ts = [];
  for (let t = 0; t < NT; t++) if (ct[t][1] >= y0 && ct[t][1] < y1) ts.push(t);
  if (ts.length < 4) continue;
  const bb = bbox(ts);
  const gx = ts.reduce((s, t) => s + ct[t][0], 0) / ts.length;
  const gz = ts.reduce((s, t) => s + ct[t][2], 0) / ts.length;
  console.log(`  Y[${y0.toFixed(2)},${y1.toFixed(2)}] n=${String(ts.length).padStart(3)} X[${bb.mn[0].toFixed(2)},${bb.mx[0].toFixed(2)}] Z[${bb.mn[2].toFixed(2)},${bb.mx[2].toFixed(2)}] c=(${gx.toFixed(2)},${gz.toFixed(2)})`);
}

// 3. extrêmes -X (lame) : les 30 tris les plus à -X, Y>0.2
const cotes = ct.map((c, t) => t).filter(t => ct[t][0] < -0.2 && ct[t][1] > 0.05).sort((a, b) => ct[a][0] - ct[b][0]);
console.log(`\ncôté -X (X<-0.2, Y>0.05) : ${cotes.length} tris`);
if (cotes.length) {
  const tip = cotes.slice(0, 30);
  console.log(`  30 plus -X : bbox X[${bbox(tip).mn[0].toFixed(2)},${bbox(tip).mx[0].toFixed(2)}] Y[${bbox(tip).mn[1].toFixed(2)},${bbox(tip).mx[1].toFixed(2)}] Z[${bbox(tip).mn[2].toFixed(2)},${bbox(tip).mx[2].toFixed(2)}]`);
}

// 4. autour de la main : tris X in [-0.35,-0.05], Y in [-0.25,0.15]
const main = ct.map((c, t) => t).filter(t => ct[t][0] >= -0.35 && ct[t][0] <= -0.05 && ct[t][1] >= -0.25 && ct[t][1] <= 0.15);
console.log(`\nzone main/poignée (X[-0.35,-0.05] Y[-0.25,0.15]) : ${main.length} tris, bbox X[${bbox(main).mn[0].toFixed(2)},${bbox(main).mx[0].toFixed(2)}] Y[${bbox(main).mn[1].toFixed(2)},${bbox(main).mx[1].toFixed(2)}] Z[${bbox(main).mn[2].toFixed(2)},${bbox(main).mx[2].toFixed(2)}]`);

// 5. tête : tris Y > 0.5 près du centre X
const tete = ct.map((c, t) => t).filter(t => ct[t][1] > 0.5 && Math.abs(ct[t][0] - 0.38) < 0.3);
console.log(`\ntête (Y>0.5, X~0.38±0.3) : ${tete.length} tris, bbox X[${bbox(tete).mn[0].toFixed(2)},${bbox(tete).mx[0].toFixed(2)}] Y[${bbox(tete).mn[1].toFixed(2)},${bbox(tete).mx[1].toFixed(2)}] Z[${bbox(tete).mn[2].toFixed(2)},${bbox(tete).mx[2].toFixed(2)}]`);
// face : tris de la tête avec Z < Zmin+0.1
const zt = bbox(tete);
const face = tete.filter(t => ct[t][2] < zt.mn[2] + 0.1);
console.log(`  bande face (Z < ${(zt.mn[2] + 0.1).toFixed(2)}) : ${face.length} tris, Y[${bbox(face).mn[1].toFixed(2)},${bbox(face).mx[1].toFixed(2)}]`);

// 6. torse avant (écusson) : Y in [0.1,0.4], X in [0.2,0.6], Z minimal
const torse = ct.map((c, t) => t).filter(t => ct[t][1] > 0.1 && ct[t][1] < 0.45 && ct[t][0] > 0.15 && ct[t][0] < 0.65);
console.log(`\ntorse (Y[0.1,0.45] X[0.15,0.65]) : ${torse.length} tris, Zmin=${bbox(torse).mn[2].toFixed(2)}`);
const avantTorse = torse.sort((a, b) => ct[a][2] - ct[b][2]).slice(0, 25);
console.log(`  25 plus -Z : Y[${bbox(avantTorse).mn[1].toFixed(2)},${bbox(avantTorse).mx[1].toFixed(2)}] X[${bbox(avantTorse).mn[0].toFixed(2)},${bbox(avantTorse).mx[0].toFixed(2)}] Z[${bbox(avantTorse).mn[2].toFixed(2)},${bbox(avantTorse).mx[2].toFixed(2)}]`);

// 7. genoux : tris Y in [-0.45,-0.2], front
const genoux = ct.map((c, t) => t).filter(t => ct[t][1] > -0.5 && ct[t][1] < -0.2);
console.log(`\nbande genoux (Y[-0.5,-0.2]) : ${genoux.length} tris, bbox X[${bbox(genoux).mn[0].toFixed(2)},${bbox(genoux).mx[0].toFixed(2)}] Z[${bbox(genoux).mn[2].toFixed(2)},${bbox(genoux).mx[2].toFixed(2)}]`);

// 8. épaulières : Y in [0.35,0.7], |X-0.4|>0.25
const epaules = ct.map((c, t) => t).filter(t => ct[t][1] > 0.35 && ct[t][1] < 0.7 && Math.abs(ct[t][0] - 0.4) > 0.22);
console.log(`\népaulières (Y[0.35,0.7], |X-0.4|>0.22) : ${epaules.length} tris, bbox X[${bbox(epaules).mn[0].toFixed(2)},${bbox(epaules).mx[0].toFixed(2)}] Y[${bbox(epaules).mn[1].toFixed(2)},${bbox(epaules).mx[1].toFixed(2)}]`);
