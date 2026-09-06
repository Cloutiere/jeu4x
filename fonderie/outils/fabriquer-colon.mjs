// FABRIQUER-COLON — FONDERIE-3D. Sonde de déploiement (référence image_ref/colon.jpg).
// Construct utilitaire non-combat : fuselage facetté en vol stationnaire, deux
// capsules de données néon sous le ventre, projecteur holographique projetant
// des blueprints de nœuds serveurs au sol (LINES — 0 triangle).
// Style : STYLE-3D.md — mêmes 3 matériaux que le Guerrier (teinte joueur compatible).

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
// prisme couché le long de Z (nose -Z)
const fuse = (rt, rb, longueur, seg) => new THREE.CylinderGeometry(rt, rb, longueur, Math.round(seg * 2.4), 1).rotateX(Math.PI / 2);

// --- texture des glyphes (réutilise le motif du Guerrier, graine différente) ---
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
  let graine = 777;
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

// ---------- construction du Colon ----------
// Corps en vol stationnaire (centre ~1.0), empreinte dans la tuile rayon 1, face -Z.

// --- fuselage principal (alongé, nez -Z) ---
cuire(fuse(0.17, 0.24, 0.5, 12), M_CORPS, m4(0, 1.0, 0.1));                    // arrière élargi
cuire(fuse(0.24, 0.19, 0.34, 12), M_CORPS, m4(0, 1.0, -0.28));                 // maître brie
cuire(fuse(0.19, 0.03, 0.3, 12), M_CORPS, m4(0, 1.0, -0.58));                  // nez conique
cuire(fuse(0.03, 0.012, 0.12, 8), M_NEON, m4(0, 1.0, -0.78), { aretes: false }); // pointe émissive
// --- spine dorsale + ailerons ---
cuire(bloc(0.06, 0.1, 0.5), M_CORPS, m4(0, 1.22, -0.05), { aretes: false });   // dos
cuire(bloc(0.02, 0.1, 0.16), M_ACCENT, m4(0, 1.31, -0.14), { aretes: false }); // aileron avant (accent)
cuire(bloc(0.02, 0.16, 0.12), M_ACCENT, m4(0, 1.34, -0.32), { aretes: false }); // aileron arrière (accent)
for (const cote of [-1, 1]) {
  cuire(bloc(0.26, 0.03, 0.3), M_CORPS, m4(0.2 * cote, 1.08, -0.05, 0, 0, 0.22 * cote)); // ailes
  cuire(bloc(0.14, 0.02, 0.18), M_ACCENT, m4(0.34 * cote, 1.14, -0.14, 0, 0, 0.3 * cote), { aretes: false }); // pointes d'aile (accent)
  cuire(prisme(0.09, 0.06, 0.1, 8), M_CORPS, m4(0.3 * cote, 1.0, 0.28));       // nacelles arrière
  cuire(new THREE.OctahedronGeometry(0.045, 0), M_NEON, m4(0.3 * cote, 1.0, 0.38), { aretes: false }); // poussée néon
}
// --- poste d'observation avant (dôme facetté, accent) ---
cuire(prisme(0.11, 0.13, 0.1, 8), M_ACCENT, m4(0, 1.13, -0.32), { aretes: false });
// --- les deux capsules de données (sous le ventre, côte à côte selon X) ---
for (const cote of [-1, 1]) {
  const x = 0.15 * cote;
  cuire(fuse(0.075, 0.075, 0.3, 8), M_NEON, m4(x, 0.72, -0.05), { aretes: true, seuilArete: 45 }); // capsule néon
  cuire(prisme(0.1, 0.1, 0.045, 8), M_CORPS, m4(x, 0.72, -0.2));                // anneau avant
  cuire(prisme(0.1, 0.1, 0.045, 8), M_CORPS, m4(x, 0.72, 0.1));                 // anneau arrière
  cuire(bloc(0.035, 0.18, 0.035), M_CORPS, m4(x, 0.86, -0.05));                 // bras de suspension
}
// --- ventre + projecteur holographique ---
cuire(prisme(0.2, 0.14, 0.18, 8), M_CORPS, m4(0, 0.86, -0.02));                // ventre
cuire(prisme(0.1, 0.03, 0.16, 8), M_ACCENT, m4(0, 0.74, -0.3, Math.PI / 2.6), { aretes: false }); // projectId. avant
cuire(new THREE.OctahedronGeometry(0.06, 0), M_NEON, m4(0, 1.0, -0.42), { aretes: false }); // cœur néon
cuire(prisme(0.12, 0.09, 0.06, 10), M_CORPS, m4(0, 0.76, 0.05));               // quille ventrale
// --- baies de données latérales (racks compacts) ---
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.045, 0.05, 0.09), M_ACCENT, m4(0.245 * cote, 0.93 + i * 0.055, -0.32 + i * 0.02), { aretes: false });
}
// --- pylône d'antenne replié ---
cuire(prisme(0.02, 0.02, 0.3, 6), M_CORPS, m4(-0.1, 1.3, 0.28, 0.5), { aretes: false });

// --- nervures de coque + plaques (enrichissement facetté) ---
for (const [z, r] of [[-0.14, 0.26], [0.0, 0.255], [0.16, 0.245], [-0.3, 0.24], [0.3, 0.23]]) {
  cuire(prisme(r, r, 0.035, 10), M_CORPS, m4(0, 1.0, z));                       // cerclages de coque
}
for (const cote of [-1, 1]) {
  cuire(bloc(0.05, 0.12, 0.3), M_CORPS, m4(0.19 * cote, 1.0, -0.05), { aretes: false });  // flancs renfort
  cuire(bloc(0.04, 0.05, 0.22), M_ACCENT, m4(0.22 * cote, 1.16, 0.08), { aretes: false }); // lisses dorsales (accent)
  cuire(prisme(0.035, 0.025, 0.14, 8), M_CORPS, m4(0.36 * cote, 0.94, 0.05));   // mâts capteurs
  cuire(new THREE.OctahedronGeometry(0.03, 0), M_NEON, m4(0.36 * cote, 0.86, 0.05), { aretes: false }); // sondes néon
  cuire(bloc(0.09, 0.03, 0.12), M_CORPS, m4(0.3 * cote, 1.0, -0.32), { aretes: false }); // plans canards
}
// --- tourelle capteur dorsale ---
cuire(prisme(0.07, 0.09, 0.08, 8), M_CORPS, m4(0, 1.3, 0.12));
cuire(prisme(0.05, 0.05, 0.06, 8), M_ACCENT, m4(0, 1.37, 0.12), { aretes: false });
// --- jupe de containment des capsules ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.03, 0.1, 0.24), M_CORPS, m4(0.06 * cote, 0.76, -0.05), { aretes: false });
  cuire(bloc(0.03, 0.1, 0.24), M_CORPS, m4(0.24 * cote, 0.76, -0.05), { aretes: false });
}

// --- projection au sol : blueprints de nœuds serveurs (LINES, 0 triangle) ---
function rect(x, z, lx, lz, y) {
  const s = [
    [x - lx, y, z - lz], [x + lx, y, z - lz], [x + lx, y, z + lz], [x - lx, y, z + lz], [x - lx, y, z - lz]];
  return s.flatMap(p => p);
}
function tour(x, z, lx, lz, h) {
  const v = []; // arêtes verticales + étages
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) v.push(x + lx * sx, 0.01, z + lz * sz, x + lx * sx, h, z + lz * sz);
  for (const hh of [0.01, h * 0.55, h]) {
    v.push(x - lx, hh, z - lz, x + lx, hh, z - lz, x + lx, hh, z - lz, x + lx, hh, z + lz,
      x + lx, hh, z + lz, x - lx, hh, z + lz, x - lx, hh, z + lz, x - lx, hh, z - lz);
  }
  return v;
}
const sol = [
  ...rect(0, -0.35, 0.55, 0.3, 0.01),          // dalle principale
  ...rect(0, 0.45, 0.4, 0.22, 0.01),           // dalle secondaire
  ...tour(-0.3, -0.35, 0.09, 0.09, 0.22),      // nœud serveur 1
  ...tour(0.28, -0.35, 0.07, 0.07, 0.15),      // nœud 2
  ...tour(0, 0.45, 0.11, 0.08, 0.18),          // nœud 3 (centre futur)
  ...tour(0.42, 0.45, 0.05, 0.05, 0.1),        // nœud 4
];
// rayon de projection du projecteur -> dalle
sol.push(0, 0.66, -0.38, 0, 0.01, -0.3, 0, 0.66, -0.38, 0.28, 0.01, -0.35, 0, 0.66, -0.38, -0.28, 0.01, -0.35);
// flux binaires traînants derrière la sonde
let graine = 31;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 10; i++) {
  const x = (alea() - 0.5) * 0.7, y = 0.7 + alea() * 0.7, z = 0.45 + alea() * 0.45, l = 0.05 + alea() * 0.1;
  sol.push(x, y, z, x, y, z + l);
}
lignes.push({ positions: new Float32Array(sol), material: M_NEON });

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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'colon.glb');
writeFileSync(dest, glb);
console.log(`colon.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
