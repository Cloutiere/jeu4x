// FABRIQUER-CANON — FONDERIE-3D. Charge de Corruption, artillery lourde sur mech
// (image_ref/canon.jpg + canon.txt). Quadripode lourd : caisse blindée, quatre jambes
// mécaniques à pads, rail-canon massif à anneaux de charge, vortex de virus à la bouche.
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte compatible).
// Face -Z (direction de tir).

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

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function barre(a, b, rt, rb, mat, seg = 12, { aretes = true } = {}) {
  const A = V(...a), B = V(...b);
  const dir = B.clone().sub(A);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, dir.length(), 1));
  cuire(new THREE.CylinderGeometry(rt, rb, 1, Math.round(seg * 2.4)), mat, m, { aretes });
}
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
  let graine = 99173;
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

// ---------- construction du Canon (Charge de Corruption) ----------
// Quadripode : caisse centrale ~1.0 de haut, envergure de jambes ~1.9, canon vers -Z.

// --- caisse blindée centrale ---
cuire(bloc(0.6, 0.34, 1.0), M_CORPS, m4(0, 1.0, 0.05));                           // caisse
cuire(bloc(0.68, 0.12, 0.9), M_CORPS, m4(0, 1.2, 0.05));                          // toit
cuire(bloc(0.5, 0.1, 0.4), M_ACCENT, m4(0, 0.88, -0.3, 0.4), { aretes: false });  // glacis (accent)
for (const cote of [-1, 1]) {
  cuire(bloc(0.08, 0.2, 0.7), M_CORPS, m4(0.33 * cote, 1.05, 0.05), { aretes: false }); // flancs blindés
  cuire(bloc(0.03, 0.12, 0.4), M_ACCENT, m4(0.38 * cote, 1.1, 0.1), { aretes: false }); // panneaux (accent)
}
// bloc capteur dorsal
// épaulements de caisse et antennes
for (const cote of [-1, 1]) {
  cuire(bloc(0.14, 0.14, 0.3), M_CORPS, m4(0.42 * cote, 1.24, 0.25, 0, 0, -0.15 * cote), { aretes: false });
  cuire(prisme(0.02, 0.02, 0.28, 6), M_CORPS, m4(0.3 * cote, 1.42, 0.3, 0.2 * cote), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.03, 0), M_NEON, m4(0.3 * cote, 1.56, 0.32), { aretes: false });
}
cuire(bloc(0.2, 0.12, 0.24), M_CORPS, m4(-0.1, 1.36, 0.2));
cuire(bloc(0.12, 0.04, 0.05), M_NEON, m4(-0.1, 1.4, 0.1), { aretes: false });     // senseur néon
// ligne de circuits latérale
polyline([[-0.32, 1.02, -0.3], [-0.32, 1.02, 0.35]]);
polyline([[0.32, 1.02, -0.3], [0.32, 1.02, 0.35]]);

// --- quatre jambes mécaniques (hanches basses, pads larges) ---
for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  const hanche = [0.3 * sx, 0.9, 0.3 * sz];
  const genou = [0.55 * sx, 0.55, 0.42 * sz];
  const cheville = [0.48 * sx, 0.22, 0.52 * sz];
  barre(hanche, genou, 0.09, 0.075, M_CORPS, 16);
  barre(genou, cheville, 0.075, 0.06, M_CORPS, 16);
  cuire(prisme(0.085, 0.085, 0.08, 8), M_ACCENT, m4(...genou), { aretes: false }); // rotule (accent)
  // pad pied
  cuire(bloc(0.26, 0.12, 0.34), M_CORPS, m4(cheville[0], 0.06, cheville[2] + 0.04 * sz));
  cuire(bloc(0.2, 0.04, 0.26), M_ACCENT, m4(cheville[0], 0.15, cheville[2] + 0.04 * sz), { aretes: false }); // semelle (accent)
  // plaque de cuisse
  cuire(bloc(0.2, 0.26, 0.07), M_CORPS, m4(0.42 * sx, 0.78, 0.38 * sz, 0, 0.25 * sx * sz, 0.12 * sx), { aretes: false });
}

// --- rail-canon massif (léger dévers vers -Z) ---
{
  const A = [0, 1.16, -0.3], B = [0, 1.42, -1.5];   // culasse -> bouche
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const centre = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  // corps principal
  const corps = new THREE.CylinderGeometry(0.14, 0.18, l, 20, 1);
  cuire(corps, M_CORPS, new THREE.Matrix4().compose(V(...centre), q, V(1, 1, 1)));
  // culasse massive
  const culasse = new THREE.CylinderGeometry(0.24, 0.26, 0.34, 16, 1);
  cuire(culasse, M_CORPS, new THREE.Matrix4().compose(V(A[0] + u[0] * 0.1, A[1] + u[1] * 0.1, A[2] + u[2] * 0.1), q, V(1, 1, 1)));
  // anneaux de charge néon (le long du canon)
  for (const t of [0.2, 0.36, 0.52, 0.68, 0.84]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t, A[2] + u[2] * l * t];
    const an = new THREE.CylinderGeometry(0.165, 0.165, 0.07, 20, 1);
    cuire(an, M_NEON, new THREE.Matrix4().compose(V(...P), q, V(1, 1, 1)), { aretes: false });
  }
  // bouche : couronne + vortex de virus (LINES)
  const an = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20, 1);
  cuire(an, M_CORPS, new THREE.Matrix4().compose(V(B[0] - u[0] * 0.02, B[1] - u[1] * 0.02, B[2] - u[2] * 0.02), q, V(1, 1, 1)));
  const MZ = [B[0] - u[0] * 0.08, B[1] - u[1] * 0.08, B[2] - u[2] * 0.08];
  for (const r of [0.1, 0.16, 0.22]) {                                            // cercles concentriques face -Z
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([MZ[0] + r * Math.cos(a), MZ[1] + r * Math.sin(a), MZ[2]]);
    }
    polyline(pts);
  }
  for (let i = 0; i < 8; i++) {                                                   // rayons du vortex
    const a = (i / 8) * Math.PI * 2;
    polyline([
      [MZ[0] + 0.05 * Math.cos(a), MZ[1] + 0.05 * Math.sin(a), MZ[2] - 0.04],
      [MZ[0] + 0.2 * Math.cos(a + 0.4), MZ[1] + 0.2 * Math.sin(a + 0.4), MZ[2] + 0.06]]);
  }
  // noyau de virus chargé (octaèdre néon encastré)
  cuire(new THREE.OctahedronGeometry(0.1, 0), M_NEON,
    m4(A[0] + u[0] * l * 0.9, A[1] + u[1] * l * 0.9, A[2] + u[2] * l * 0.9), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'canon.glb');
writeFileSync(dest, glb);
console.log(`canon.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
