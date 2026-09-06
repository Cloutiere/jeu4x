// FABRIQUER-CHAR — FONDERIE-3D. Exécuteur Blindé, char d'assaut rapide
// (image_ref/char.jpg + char.txt). Châssis bas et agressif à chenilles, tourelle
// jumelle de rail-canons à impulsions cinétiques haute densité, face -Z.
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
  let graine = 44881;
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

// ---------- construction de l'Exécuteur Blindé ----------
// Long ~2.0 le long de Z (nez -Z), large ~1.1, bas (hauteur ~0.95). Face -Z.

// --- chenilles basses et longues ---
for (const cote of [-1, 1]) {
  const x = 0.46 * cote;
  cuire(bloc(0.2, 0.3, 1.9), M_CORPS, m4(x, 0.2, 0));                             // chenille
  for (let i = 0; i < 6; i++) {                                                   // galets
    const roue = new THREE.CylinderGeometry(0.085, 0.085, 0.1, 20, 1).rotateZ(Math.PI / 2);
    cuire(roue, M_CORPS, m4(x, 0.14, -0.75 + i * 0.3), { aretes: false });
  }
  cuire(bloc(0.02, 0.12, 1.8), M_ACCENT, m4(x + 0.13 * cote, 0.24, 0), { aretes: false }); // bande (accent)
  cuire(bloc(0.06, 0.14, 1.6), M_CORPS, m4(x + 0.12 * cote, 0.42, 0), { aretes: false }); // aile au-dessus
}
// --- caisse basse ---
cuire(bloc(0.56, 0.22, 1.9), M_CORPS, m4(0, 0.46, 0));                            // caisse principale
cuire(prisme(0.1, 0.13, 0.08, 12), M_ACCENT, m4(0, 0.63, -0.3), { aretes: false }); // tourelle de mitrailleuse (accent)
for (const cote of [-1, 1])
  cuire(bloc(0.12, 0.04, 0.3), M_CORPS, m4(0.17 * cote, 0.68, -0.35, 0.4), { aretes: false }); // hachages avant
cuire(bloc(0.6, 0.09, 0.6), M_CORPS, m4(0, 0.56, -0.55, 0.4));                    // glacis avant
cuire(bloc(0.54, 0.1, 0.5), M_CORPS, m4(0, 0.58, 0.7, -0.35));                    // poupe
cuire(bloc(0.36, 0.05, 0.24), M_ACCENT, m4(0, 0.62, -0.42, 0.4), { aretes: false }); // plaque avant (accent)
// optiques avant
for (const cote of [-1, 1])
  cuire(new THREE.OctahedronGeometry(0.035, 0), M_NEON, m4(0.16 * cote, 0.5, -0.88), { aretes: false });
// grilles de refroidissement arrière
for (let i = 0; i < 4; i++)
  cuire(bloc(0.34, 0.025, 0.05), M_ACCENT, m4(0, 0.52, 0.82 + i * 0.05), { aretes: false });
// échappements arrière
// panneaux de pont et coffres latéraux
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.14, 0.03, 0.4), M_CORPS, m4(0.2 * cote, 0.62, -0.3 + i * 0.45), { aretes: false });
  cuire(bloc(0.04, 0.12, 0.4), M_ACCENT, m4(0.51 * cote, 0.48, 0.3), { aretes: false });
  cuire(bloc(0.05, 0.1, 0.3), M_CORPS, m4(0.52 * cote, 0.55, -0.3), { aretes: false });
}
for (const cote of [-1, 1])
  cuire(bloc(0.08, 0.04, 0.04), M_ACCENT, m4(0.14 * cote, 0.5, -0.85), { aretes: false });
for (const cote of [-1, 1]) {
  const ech = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10, 1).rotateX(Math.PI / 2);
  cuire(ech, M_CORPS, m4(0.22 * cote, 0.62, 0.88), { aretes: false });
}
// -- Tourelle --

// --- tourelle jumelle basse (centre-avant) ---
cuire(prisme(0.24, 0.3, 0.2, 18), M_CORPS, m4(0, 0.72, -0.1));                     // tourelle
cuire(bloc(0.4, 0.08, 0.3), M_CORPS, m4(0, 0.86, -0.05));                         // masque
for (const cote of [-1, 1])
  cuire(bloc(0.1, 0.08, 0.2), M_ACCENT, m4(0.12 * cote, 0.82, -0.24), { aretes: false }); // miroirs de visée (accent)
// antenne
// toit de tourelle : trappes et capteur
cuire(prisme(0.08, 0.1, 0.06, 8), M_CORPS, m4(-0.1, 0.95, -0.02));
cuire(bloc(0.1, 0.05, 0.12), M_ACCENT, m4(0.1, 0.93, 0.08), { aretes: false });
// anneaux de charge sur les canons jumels
for (const cote of [-1, 1]) {
  const x2 = 0.12 * cote;
  for (const [yy, zz] of [[0.95, -0.5], [0.98, -0.85]]) {
    const an2 = new THREE.CylinderGeometry(0.075, 0.075, 0.035, 12, 1);
    cuire(an2, M_NEON, m4(x2, yy, zz), { aretes: false });
  }
}
// petite rampe arrière
for (const cote of [-1, 1]) {
  const tambour = new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12, 1).rotateX(Math.PI / 2);
  cuire(tambour, M_CORPS, m4(0.3 * cote, 0.66, 0.92), { aretes: false });
}
cuire(bloc(0.44, 0.06, 0.16), M_CORPS, m4(0, 0.56, 1.1), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.1, 0.05, 0.3), M_ACCENT, m4(0.24 * cote, 0.64, 1.02), { aretes: false });
cuire(bloc(0.3, 0.04, 0.2), M_CORPS, m4(0, 0.5, 1.05, -0.35), { aretes: false });
cuire(prisme(0.015, 0.015, 0.3, 6), M_CORPS, m4(0.24, 0.98, 0.15, 0.15), { aretes: false });

// --- les deux rail-canons jumels (x = ±0.12, vers -Z, léger dévers) ---
for (const cote of [-1, 1]) {
  const x = 0.12 * cote;
  const A = [x, 0.9, -0.18], B = [x, 1.02, -1.35];   // culasse -> bouche
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const centre = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  const corps = new THREE.CylinderGeometry(0.06, 0.075, l, 20, 1);
  cuire(corps, M_CORPS, new THREE.Matrix4().compose(V(...centre), q, V(1, 1, 1)));
  // culasse
  const culasse = new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12, 1);
  cuire(culasse, M_CORPS, new THREE.Matrix4().compose(V(A[0] + u[0] * 0.05, A[1] + u[1] * 0.05, A[2] + u[2] * 0.05), q, V(1, 1, 1)));
  // anneau de bouche néon
  const an = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12, 1);
  cuire(an, M_NEON, new THREE.Matrix4().compose(V(B[0] - u[0] * 0.02, B[1] - u[1] * 0.02, B[2] - u[2] * 0.02), q, V(1, 1, 1)), { aretes: false });
  // énergie de charge : ligne néon sur le dessus du canon
  const Q = [B[0] + u[0] * 0.1, B[1] + u[1] * 0.1 + 0.09, B[2] + u[2] * 0.1];
  polyline([
    [A[0], A[1] + 0.09, A[2]],
    [A[0], A[1] + u[1] * l * 0.5 + 0.09, A[2] + u[2] * l * 0.5],
    [B[0], B[1] + 0.09, B[2]],
    Q]);
  // pulse de bouche
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(B[0], B[1] + 0.02, B[2] - 0.06), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'char.glb');
writeFileSync(dest, glb);
console.log(`char.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
