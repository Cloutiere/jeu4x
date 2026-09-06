// FABRIQUER-CUIRASSE — FONDERIE-3D. Dreadnought Grid, capital ship ultime
// (image_ref/cuirasse.jpg + cuirasse.txt). Méga-vaisseau cuirassé : coque massive
// à strates, **tourelles quadruples** de rail-canons, tourelles de pulse lourdes,
// émetteurs de barrières pare-feu latéraux (LINES — 0 triangle). Face -Z.
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte compatible).

import * as THREE from '../lib/three.module.min.js';
import { encoderPNG, construireGLB } from './glb.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NEON = new THREE.Color('#3DFFCE');
const CORPS = new THREE.Color('#1C2E3C');

const tris = [];
const lignes = [];
const M_CORPS = 0, M_NEON = 1, M_ACCENT = 2;

function cuire(geo, mat, mat4, { aretes = true, seuilArete = 24 } = {}) {
  const g = mat4 ? geo.clone().applyMatrix4(mat4) : geo;
  const ni = g.index ? g.toNonIndexed() : g;
  ni.computeVertexNormals();
  tris.push({
    positions: ni.attributes.position.array,
    normals: ni.attributes.normal.array,
    uvs: ni.attributes.uv ? ni.attributes.uv.array : undefined,
    material: mat,
  });
  if (aretes) {
    const e = new THREE.EdgesGeometry(g, seuilArete);
    lignes.push({ positions: e.attributes.position.array, material: M_NEON });
  }
}

const m4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz));

const prisme = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, Math.round(seg * 2.4));
const bloc = (l, h, p) => new THREE.BoxGeometry(l, h, p);
const fuse = (rt, rb, longueur, seg) => new THREE.CylinderGeometry(rt, rb, longueur, Math.round(seg * 2.4), 1).rotateX(Math.PI / 2);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const polyline = (points) => {
  const f = [];
  for (let i = 0; i < points.length - 1; i++) f.push(...points[i], ...points[i + 1]);
  lignes.push({ positions: new Float32Array(f), material: M_NEON });
};

// --- texture des glyphes (graine propre) ---
function textureGlyphes() {
  const T = 256, px = new Uint8Array(T * T * 4);
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    px[i] = 0; px[i + 1] = Math.round(NEON.g * 255) * v; px[i + 2] = Math.round(NEON.b * 255) * v; px[i + 3] = 255;
  };
  const chiffre = (x0, y0, c) => {
    const carres = c === '0'
      ? [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [0, 4], [1, 4], [2, 4]]
      : [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
    for (const [dx, dy] of carres) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) set(x0 + dx * 2 + a, y0 + dy * 2 + b, 1);
  };
  let graine = 918273;
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

// ---------- construction du Dreadnought ----------
// Long ~2.5 le long de Z (proue -Z), large ~0.9, hauteur ~1.1.

// --- coque principale en strates ---
cuire(fuse(0.05, 0.22, 0.6, 26), M_CORPS, m4(0, 0.55, -0.85));                   // proue aiguise
cuire(fuse(0.22, 0.28, 0.7, 26), M_CORPS, m4(0, 0.55, -0.35));                   // section avant
cuire(fuse(0.28, 0.24, 0.9, 26), M_CORPS, m4(0, 0.55, 0.4));                     // maître brie
cuire(fuse(0.24, 0.15, 0.55, 26), M_CORPS, m4(0, 0.55, 1.05));                   // arrière
// strates blindées latérales
for (const cote of [-1, 1]) {
  cuire(bloc(0.12, 0.16, 1.3), M_CORPS, m4(0.28 * cote, 0.5, 0.15));
  cuire(bloc(0.06, 0.1, 0.9), M_ACCENT, m4(0.36 * cote, 0.52, 0.15), { aretes: false });
}
// --- superstructure massive ---
cuire(bloc(0.3, 0.14, 0.8), M_CORPS, m4(0, 0.76, 0.1));
cuire(bloc(0.22, 0.1, 0.4), M_CORPS, m4(0, 0.88, 0.2));
cuire(bloc(0.14, 0.08, 0.2), M_ACCENT, m4(0, 0.96, 0.24), { aretes: false });    // passerelle (accent)
cuire(bloc(0.05, 0.03, 0.05), M_NEON, m4(0, 1.0, 0.1), { aretes: false });       // mât optique
for (const cote of [-1, 1])
  cuire(prisme(0.02, 0.02, 0.3, 6), M_CORPS, m4(0.14 * cote, 1.0, 0.35, -0.2 * cote), { aretes: false }); // mâts
// plaques de pont et renforts
for (let i = 0; i < 4; i++)
  cuire(bloc(0.3, 0.03, 0.16), M_CORPS, m4(0, 0.72, -0.6 + i * 0.32), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.08, 0.04, 0.4), M_ACCENT, m4(0.14 * cote, 0.73, -0.3), { aretes: false });

// --- tourelles quadruples de rail-canons (2 avant, 2 arrière) ---
for (const [z, s] of [[-0.45, 1.15], [0.15, 1]]) {
  const y = 0.9 + (s - 1) * 0.2;
  cuire(prisme(0.13, 0.16, 0.1, 12), M_CORPS, m4(0, y, z));                      // base
  cuire(bloc(0.2, 0.08, 0.2), M_ACCENT, m4(0, y + 0.07, z), { aretes: false });  // casemate (accent)
  for (const dx of [-0.06, -0.02, 0.02, 0.06]) {                                 // 4 canons
    const rail = new THREE.CylinderGeometry(0.016, 0.02, 0.42, 8, 1).rotateX(Math.PI / 2);
    cuire(rail, M_CORPS, m4(z * 0 + dx, y + 0.08, z - 0.32), { aretes: false });
    const bouche = new THREE.CylinderGeometry(0.026, 0.026, 0.03, 8, 1).rotateX(Math.PI / 2);
    cuire(bouche, M_NEON, m4(dx, y + 0.08, z - 0.54), { aretes: false });
  }
}
// --- tourelles de pulse lourdes (2 latérales) ---
for (const cote of [-1, 1]) {
  const x = 0.36 * cote;
  cuire(prisme(0.09, 0.11, 0.08, 10), M_CORPS, m4(x, 0.86, -0.15));
  for (const dx of [-0.03, 0.03]) {
    const rail = new THREE.CylinderGeometry(0.018, 0.022, 0.26, 8, 1).rotateX(Math.PI / 2);
    cuire(rail, M_CORPS, m4(x + dx, 0.94, -0.3), { aretes: false });
  }
  cuire(new THREE.OctahedronGeometry(0.025, 0), M_NEON, m4(x, 0.94, -0.45), { aretes: false });
}
// --- émetteurs de barrières pare-feu latéraux (LINES — 0 triangle) ---
for (const cote of [-1, 1]) {
  const ex = 0.5 * cote, ey = 0.85, ez = 0.2;
  cuire(prisme(0.07, 0.09, 0.08, 8), M_CORPS, m4(ex * 0.72, ey - 0.06, ez));      // émetteur
  for (const r of [0.28, 0.42, 0.55]) {                                           // halos hexagonaux-circulaires
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      pts.push([ex * 0.72, ey + r * Math.sin(a), ez + r * Math.cos(a)]);
    }
    polyline(pts);
  }
  // rayons internes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    polyline([
      [ex * 0.72, ey + 0.08 * Math.sin(a), ez + 0.08 * Math.cos(a)],
      [ex * 0.72, ey + 0.5 * Math.sin(a), ez + 0.5 * Math.cos(a)]]);
  }
}
// --- tuyères arrière ---
for (const [dx, dy] of [[-0.16, 0.5], [0, 0.56], [0.16, 0.5]]) {
  const tuy = new THREE.CylinderGeometry(0.06, 0.075, 0.16, 12, 1).rotateX(Math.PI / 2);
  cuire(tuy, M_CORPS, m4(dx, dy, 1.34), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.045, 0), M_NEON, m4(dx, dy, 1.46), { aretes: false });
}

// ---------- assemblage & export ----------
const prims = [
  ...tris.map(t => ({ mode: 'TRIANGLES', positions: t.positions, normals: t.normals, uvs: t.uvs, material: t.material })),
  ...lignes.map(l => ({ mode: 'LINES', positions: l.positions, material: l.material })),
];
const trisTotal = tris.reduce((s, t) => s + t.positions.length / 9, 0);

const materiaux = [
  {
    name: 'corps',
    pbrMetallicRoughness: {
      baseColorFactor: [CORPS.r * 2.2, CORPS.g * 2.2, CORPS.b * 2.2, 0.55],
      metallicFactor: 0.15, roughnessFactor: 0.5,
    },
    emissiveFactor: [NEON.r * 0.55, NEON.g * 0.55, NEON.b * 0.55],
    emissiveTexture: { index: 0 },
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 0.9 } },
    alphaMode: 'BLEND',
    doubleSided: true,
  },
  {
    name: 'neon',
    pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
    emissiveFactor: [NEON.r, NEON.g, NEON.b],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3.5 } },
  },
  {
    name: 'accent_joueur',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.45 },
    emissiveFactor: [0.05, 0.05, 0.05],
  },
];

const glb = construireGLB({
  primitives: prims, materiaux, image: textureGlyphes(),
  extensionsUtilisees: ['KHR_materials_emissive_strength'],
});
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'cuirasse.glb');
writeFileSync(dest, glb);
console.log(`cuirasse.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
