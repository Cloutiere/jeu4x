// FABRIQUER-ICBM — FONDERIE-3D. Bombe Logique, missile intercontinental
// (image_ref/icbm.jpg + icbm.txt). Corps balistique colossal à anneaux
// d'étagement, empennage en croix, ogive zero-day rayonnante à la pointe
// (arcs et halo en LINES — 0 triangle). Face -Z = pointe.
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
  let graine = 111011;
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

// ---------- construction de la Bombe Logique ----------
// Corps balistique : long ~2.6 le long de Z (pointe -Z), diamètre ~0.5.

// --- étages du missile ---
cuire(fuse(0.26, 0.26, 0.9, 42), M_CORPS, m4(0, 0.55, -0.55));                   // étage ogive
cuire(fuse(0.26, 0.26, 0.9, 42), M_CORPS, m4(0, 0.55, 0.35));                    // étage central
cuire(fuse(0.24, 0.24, 0.6, 42), M_CORPS, m4(0, 0.55, 1.05));                    // étage moteur
// anneaux d'étagement
for (const z of [-0.12, -0.05, 0.72, 0.79]) {
  const an = new THREE.CylinderGeometry(0.285, 0.285, 0.05, 42, 1).rotateX(Math.PI / 2);
  cuire(an, M_CORPS, m4(0, 0.55, z), { aretes: false });
}
// panneaux longitudinaux (conduits de purge)
for (const cote of [-1, 1]) {
  cuire(bloc(0.06, 0.04, 1.6), M_ACCENT, m4(0.22 * cote, 0.72, 0.1), { aretes: false });
  cuire(bloc(0.06, 0.04, 1.6), M_ACCENT, m4(0.22 * cote, 0.4, 0.1), { aretes: false });
}
// conduits longitudinaux et trappes
for (const cote of [-1, 1]) {
  cuire(bloc(0.05, 0.05, 1.7), M_CORPS, m4(0.12 * cote, 0.74, 0.15), { aretes: false });
  cuire(bloc(0.05, 0.05, 1.7), M_CORPS, m4(0.12 * cote, 0.38, 0.15), { aretes: false });
  cuire(bloc(0.12, 0.16, 0.04), M_ACCENT, m4(0.18 * cote, 0.56, -0.35), { aretes: false });
}
cuire(bloc(0.3, 0.06, 0.3), M_ACCENT, m4(0, 0.72, 0.45), { aretes: false });
// plaques d'inspection et trappes techniques
for (let i = 0; i < 5; i++)
  cuire(bloc(0.16, 0.03, 0.12), M_CORPS, m4(0, 0.72 - (i % 2) * 0.06, -0.5 + i * 0.34), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.04, 0.1, 0.16), M_ACCENT, m4(0.27 * cote, 0.5, 0.62), { aretes: false });
// hublots de surveillance
for (const [z, cote] of [[-0.4, -1], [0.2, 1], [0.5, -1]]) {
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12, 1).rotateX(Math.PI / 2);
  cuire(hub, M_ACCENT, m4(0.24 * cote, 0.62, z), { aretes: false });
}
// --- ogive zero-day (pointe -Z) ---
cuire(fuse(0.26, 0.1, 0.35, 42), M_CORPS, m4(0, 0.55, -1.22));                   // cône d'ogive
cuire(prisme(0.02, 0.06, 0.14, 12), M_ACCENT, m4(0, 0.55, -1.5, Math.PI / 2), { aretes: false }); // pointe
cuire(new THREE.OctahedronGeometry(0.1, 0), M_NEON, m4(0, 0.55, -1.18), { aretes: false }); // cœur zero-day
// halo de corruption autour de la pointe (LINES)
for (const r of [0.18, 0.28, 0.38]) {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    pts.push([r * Math.cos(a), 0.55 + r * Math.sin(a) * 0.9, -1.32 + r * Math.cos(a * 2) * 0.25]);
  }
  polyline(pts);
}
// arcs électriques
polyline([[0.05, 0.62, -1.3], [-0.06, 0.6, -1.38], [0.04, 0.55, -1.46]]);
polyline([[-0.05, 0.5, -1.32], [0.06, 0.48, -1.4], [-0.04, 0.46, -1.48]]);

// --- empennage en croix (arrière) ---
for (const [rx, rz] of [[0, 0], [0, Math.PI / 2]]) {
  for (const cote of [-1, 1]) {
    cuire(bloc(0.03, 0.42, 0.3), M_CORPS,
      m4(0.12 * cote * Math.cos(rx), 0.5, 1.12,
         rx ? 0 : 0.25 * -cote, rx, rx ? 0.25 * cote : 0), { aretes: false });
  }
}
// tuyères moteur (3)
for (const [dx, dz] of [[-0.12, 0.28], [0.12, 0.28], [0, -0.32]]) {
  const tuy = new THREE.CylinderGeometry(0.06, 0.075, 0.14, 12, 1);
  cuire(tuy, M_CORPS, m4(dx, 0.32, 1.35 + dz * 0.4), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.035, 0), M_NEON, m4(dx, 0.32, 1.42 + dz * 0.4), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'icbm.glb');
writeFileSync(dest, glb);
console.log(`icbm.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
