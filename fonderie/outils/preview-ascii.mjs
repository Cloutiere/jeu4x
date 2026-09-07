// PREVIEW-ASCII — rendu ombré en ASCII d'un .glb (lecture seule) — FONDERIE-HABILLAGE.
// Rasterisation maison : z-buffer + ombrage Lambert plat, 4 vues. Sert à juger
// l'orientation (visière, épée) et, plus tard, la découpe des zones.
// Usage : node outils/preview-ascii.mjs [chemin.glb]

import { readFileSync } from 'node:fs';

const chemin = process.argv[2] || '../../image_ref/guerrier_2.2.glb';
const buf = readFileSync(new URL(chemin, import.meta.url));
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

const COLS = 110, LIGNES = 52;
const RAMPE = ' .:-=+*#%@';

let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < accP.count; i++)
  for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i * 3 + k]); mx[k] = Math.max(mx[k], pos[i * 3 + k]); }
const tX = mx[0] - mn[0], tY = mx[1] - mn[1], tZ = mx[2] - mn[2];

function normale(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l < 1e-12 ? null : [nx / l, ny / l, nz / l];
}

// uv(i) -> [u,v] normalisés écran (u vers la droite, v vers le haut), prof(i) = distance caméra (petit = proche)
function rendre(uv, prof, nom) {
  const zbuf = new Float32Array(COLS * LIGNES).fill(Infinity);
  const lumi = new Float32Array(COLS * LIGNES).fill(0);
  const L = [0.4, 0.75, -0.52];
  const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;

  const P = (i) => uv(i);
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    // pixels
    const ax = (a[0] + 0.5 / COLS) * COLS, ay = (a[1] + 0.5 / LIGNES) * LIGNES;
    const bx = (b[0] + 0.5 / COLS) * COLS, by = (b[1] + 0.5 / LIGNES) * LIGNES;
    const cx = (c[0] + 0.5 / COLS) * COLS, cy = (c[1] + 0.5 / LIGNES) * LIGNES;
    const n = normale(pos[idx[t] * 3], pos[idx[t] * 3 + 1], pos[idx[t] * 3 + 2],
                      pos[idx[t + 1] * 3], pos[idx[t + 1] * 3 + 1], pos[idx[t + 1] * 3 + 2],
                      pos[idx[t + 2] * 3], pos[idx[t + 2] * 3 + 1], pos[idx[t + 2] * 3 + 2]);
    const shade = n ? Math.max(0.15, Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2])) : 0.3;
    const aire = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(aire) < 1e-7) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(COLS - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(LIGNES - 1, Math.ceil(Math.max(ay, by, cy)));
    const pa = prof(idx[t]), pb = prof(idx[t + 1]), pc = prof(idx[t + 2]);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const px = gx + 0.5, py = gy + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / aire;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / aire;
      const w2 = ((ax - px) * (by - py) - (ay - py) * (bx - px)) / aire;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const d = w0 * pa + w1 * pb + w2 * pc;
      const i = gy * COLS + gx;
      if (d < zbuf[i]) { zbuf[i] = d; lumi[i] = shade; }
    }
  }
  console.log(`\n--- ${nom} ---`);
  for (let gy = LIGNES - 1; gy >= 0; gy--) {
    let ligne = '';
    for (let gx = 0; gx < COLS; gx++) {
      const i = gy * COLS + gx;
      ligne += zbuf[i] === Infinity ? ' ' : RAMPE[Math.min(9, 1 + Math.floor(lumi[i] * 9))];
    }
    console.log(ligne);
  }
}

const nX = (x) => (x - mn[0]) / tX, nY = (y) => (y - mn[1]) / tY, nZ = (z) => (z - mn[2]) / tZ;

// AVANT : caméra en -Z -> u=X, v=Y, proche = z petit
rendre((i) => [nX(pos[i * 3]), nY(pos[i * 3 + 1])], (i) => pos[i * 3 + 2], `AVANT (caméra -Z) — X[${mn[0].toFixed(2)}..${mx[0].toFixed(2)}] Y[${mn[1].toFixed(2)}..${mx[1].toFixed(2)}]`);
// ARRIÈRE : caméra en +Z -> u=-X
rendre((i) => [1 - nX(pos[i * 3]), nY(pos[i * 3 + 1])], (i) => -pos[i * 3 + 2], `ARRIÈRE (caméra +Z)`);
// CÔTÉ -X : caméra à -X -> u=Z, proche = x petit
rendre((i) => [nZ(pos[i * 3 + 2]), nY(pos[i * 3 + 1])], (i) => pos[i * 3], `CÔTÉ -X (caméra à gauche)`);
// CÔTÉ +X : caméra à +X -> u=-Z, proche = x grand
rendre((i) => [1 - nZ(pos[i * 3 + 2]), nY(pos[i * 3 + 1])], (i) => -pos[i * 3], `CÔTÉ +X (caméra à droite)`);
console.log(`\nbornes : X[${mn[0].toFixed(3)},${mx[0].toFixed(3)}] Y[${mn[1].toFixed(3)},${mx[1].toFixed(3)}] Z[${mn[2].toFixed(3)},${mx[2].toFixed(3)}]`);
