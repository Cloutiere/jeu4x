// RENDRE-PNG — aperçu brut d'un .glb sans navigateur (lecture seule du glb).
// 5 vues orthographiques z-buffer + Lambert plat, via le raster partagé.
// Usage : node outils/rendre-png.mjs [chemin.glb]

import { readFileSync } from 'node:fs';
import { rendreVues, VUES } from './raster.mjs';

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

const expandu = new Float32Array(idx.length * 3);
for (let i = 0; i < idx.length; i++) {
  expandu[i * 3] = pos[idx[i] * 3];
  expandu[i * 3 + 1] = pos[idx[i] * 3 + 1];
  expandu[i * 3 + 2] = pos[idx[i] * 3 + 2];
}

rendreVues({
  triangles: [{ positions: expandu, groupe: 0 }],
  vues: VUES,
  destBase: 'captures/preview',
  palette: [[0.62, 0.78, 0.72]],
  nomFichier: (v) => `../captures/preview-${v}.png`,
});
