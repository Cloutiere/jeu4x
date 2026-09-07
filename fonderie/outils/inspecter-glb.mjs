// INSPECTER-GLB — diagnostic d'un .glb (lecture seule) — session FONDERIE-HABILLAGE.
// Usage : node outils/inspecter-glb.mjs [chemin.glb]
// Affiche : JSON glTF (meshes, primitives, accessors, noeuds) + bornes POSITION.

import { readFileSync } from 'node:fs';

const chemin = process.argv[2] || '../../image_ref/guerrier_2.2.glb';
const buf = readFileSync(new URL(chemin, import.meta.url));

const magie = buf.readUInt32LE(0);
if (magie !== 0x46546c67) throw new Error(`pas un GLB (magie 0x${magie.toString(16)})`);
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);

let off = 12;
let json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const chunk = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004e4942) bin = chunk;
  off += 8 + len;
}

console.log(`=== ${chemin} ===`);
console.log(`version glTF ${version}, taille ${(buf.length / 1024).toFixed(1)} Ko, chunk binaire ${bin ? (bin.length / 1024).toFixed(1) + ' Ko' : 'ABSENT'}`);

const nomsAccessor = (a) => `${a.type} x${a.count} (componentType ${a.componentType})`;

if (json.meshes) for (const [mi, m] of json.meshes.entries()) {
  console.log(`\nmesh[${mi}] "${m.name || ''}" — ${m.primitives.length} primitive(s)`);
  for (const [pi, p] of m.primitives.entries()) {
    console.log(`  prim[${pi}] mode=${p.mode} attributes=${JSON.stringify(p.attributes)} indices=${p.indices ?? 'AUCUN'} material=${p.material}`);
    const acc = json.accessors[p.attributes.POSITION];
    console.log(`    POSITION : ${nomsAccessor(acc)} min=[${acc.min.map(v => v.toFixed(3))}] max=[${acc.max.map(v => v.toFixed(3))}]`);
    if (p.indices !== undefined) {
      const accI = json.accessors[p.indices];
      console.log(`    INDICES : ${nomsAccessor(accI)} => ${accI.count / 3} triangles`);
    }
    if (acc.min && acc.max) {
      const h = acc.max[1] - acc.min[1];
      const dx = acc.max[0] - acc.min[0], dz = acc.max[2] - acc.min[2];
      console.log(`    hauteur Y=${h.toFixed(3)}, largeur X=${dx.toFixed(3)}, profondeur Z=${dz.toFixed(3)}`);
    }
  }
}
if (json.nodes) console.log(`\nnoeuds : ${JSON.stringify(json.nodes)}`);
if (json.materials) console.log(`materiaux : ${JSON.stringify(json.materials)}`);
else console.log('\nmateriaux : AUCUN');
console.log(`scenes : ${JSON.stringify(json.scenes)}, asset : ${JSON.stringify(json.asset)}`);
if (json.extensionsUsed) console.log(`extensionsUsed : ${json.extensionsUsed}`);

// Histogramme de hauteur (répartition verticale des triangles) pour guider la découpe
if (bin && json.meshes) {
  for (const m of json.meshes) for (const p of m.primitives) {
    const acc = json.accessors[p.attributes.POSITION];
    const bv = json.bufferViews[acc.bufferView];
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const fl = new Float32Array(bin.buffer, bin.byteOffset + base, acc.count * 3);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < fl.length; i += 3) { minY = Math.min(minY, fl[i]); maxY = Math.max(maxY, fl[i]); }
    const NB = 24;
    const hist = new Array(NB).fill(0);
    for (let i = 1; i < fl.length; i += 3) {
      const b = Math.min(NB - 1, Math.floor(((fl[i] - minY) / (maxY - minY)) * NB));
      hist[b]++;
    }
    console.log(`\nhistogramme Y (${minY.toFixed(3)} -> ${maxY.toFixed(3)}), ${NB} paniers, sommets ${acc.count} :`);
    hist.forEach((n, i) => {
      const y0 = minY + (i / NB) * (maxY - minY);
      console.log(`  y~${y0.toFixed(2).padStart(6)} ${'#'.repeat(Math.round(n / acc.count * 300))} ${n}`);
    });
  }
}
