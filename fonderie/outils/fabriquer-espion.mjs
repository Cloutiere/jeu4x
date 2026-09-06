// FABRIQUER-ESPION — FONDERIE-3D. Trojan / Agent Noir, infiltrateur furtif
// (image_ref/espion.jpg + espion.txt). Posture accroupie rampante, capuche et cape
// de données translucides, dague leeche de données et outil d'injection de malware.
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte compatible).
// Face -Z = direction de progression.

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
  let graine = 1337;
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

// ---------- construction de l'Espion ----------
// Accroupi, bas (~1.1 de haut), penché vers l'avant (-Z).

// --- jambes repliées en accroupi ---
// jambe droite : accroupie sous le corps
barre([0.14, 0.78, 0.05], [0.18, 0.45, -0.08], 0.085, 0.075, M_CORPS, 14);      // cuisse
barre([0.18, 0.45, -0.08], [0.16, 0.16, 0.06], 0.07, 0.06, M_CORPS, 14);        // tibia
cuire(prisme(0.08, 0.08, 0.07, 8), M_ACCENT, m4(0.18, 0.44, -0.07), { aretes: false }); // genou (accent)
cuire(bloc(0.18, 0.08, 0.3), M_CORPS, m4(0.16, 0.05, 0.02));                    // pied
// jambe gauche : déployée vers l'avant
barre([-0.16, 0.78, 0.0], [-0.3, 0.5, -0.24], 0.085, 0.07, M_CORPS, 14);
barre([-0.3, 0.5, -0.24], [-0.3, 0.18, -0.14], 0.07, 0.06, M_CORPS, 14);
cuire(prisme(0.08, 0.08, 0.07, 8), M_ACCENT, m4(-0.3, 0.5, -0.23), { aretes: false });
cuire(bloc(0.18, 0.08, 0.3), M_CORPS, m4(-0.3, 0.05, -0.2));
// genouillères plaquées
for (const cote of [-1, 1])
  cuire(bloc(0.14, 0.2, 0.05), M_CORPS, m4(0.16 * cote, 0.6, 0.12), { aretes: false });
// --- bassin bas ---
cuire(prisme(0.2, 0.17, 0.2, 12), M_CORPS, m4(0, 0.88, 0.04));
// --- torse penché vers l'avant ---
cuire(prisme(0.24, 0.2, 0.34, 16), M_CORPS, m4(0, 1.06, -0.08, 0.55));
cuire(prisme(0.26, 0.22, 0.24, 16), M_CORPS, m4(0, 1.22, -0.18, 0.55));
cuire(bloc(0.36, 0.18, 0.24), M_CORPS, m4(0, 1.34, -0.28, 0.55));
cuire(bloc(0.14, 0.1, 0.06), M_ACCENT, m4(0, 1.26, -0.32, 0.55), { aretes: false }); // plastron (accent)
cuire(new THREE.OctahedronGeometry(0.05, 0), M_NEON, m4(0, 1.24, -0.16), { aretes: false }); // cœur néon
// --- tête + capuche ---
cuire(prisme(0.09, 0.11, 0.2, 14), M_CORPS, m4(0, 1.42, -0.34, 0.55));           // tête baissée
cuire(prisme(0.16, 0.13, 0.24, 10), M_CORPS, m4(0, 1.48, -0.3, 0.75));           // capuche
cuire(bloc(0.12, 0.02, 0.04), M_NEON, m4(0, 1.4, -0.44, 0.55), { aretes: false }); // visière lueur
// --- cape de données translucide (derrière, avec glyphes) ---
for (const [dx, dy, dz, rx, rz] of [[-0.12, 0.92, 0.3, 0.35, -0.12], [0.1, 0.9, 0.32, 0.35, 0.1], [0, 0.82, 0.42, 0.3, 0]]) {
  cuire(bloc(0.26, 0.75, 0.02), M_CORPS, m4(dx, dy, dz, rx, 0, rz), { aretes: false });
}
// --- bras droit : dague leeche vers l'avant-bas ---
barre([0.28, 1.16, -0.1], [0.34, 1.0, -0.3], 0.055, 0.05, M_CORPS, 12);
barre([0.34, 1.0, -0.3], [0.28, 0.9, -0.52], 0.05, 0.045, M_CORPS, 12);
cuire(bloc(0.1, 0.1, 0.1), M_CORPS, m4(0.28, 0.88, -0.56));                     // moufle
// dague : lame effilée néon + garde
cuire(prisme(0.02, 0.008, 0.3, 8), M_NEON, m4(0.26, 0.82, -0.72, Math.PI / 2 - 0.2), { aretes: true, seuilArete: 1 });
cuire(bloc(0.1, 0.025, 0.04), M_ACCENT, m4(0.27, 0.86, -0.56, 0, 0, 0), { aretes: false });
// --- bras gauche : outil d'injection de malware ---
barre([-0.28, 1.14, -0.08], [-0.4, 1.0, -0.34], 0.055, 0.05, M_CORPS, 12);
barre([-0.4, 1.0, -0.34], [-0.42, 0.92, -0.56], 0.05, 0.045, M_CORPS, 12);
cuire(bloc(0.1, 0.1, 0.1), M_CORPS, m4(-0.42, 0.9, -0.58));                     // moufle
// outil : corps cylindrique + aiguille néon + poignées
cuire(prisme(0.045, 0.055, 0.26, 10), M_CORPS, m4(-0.44, 0.86, -0.66, Math.PI / 2 - 0.25));
cuire(prisme(0.008, 0.002, 0.18, 8), M_NEON, m4(-0.48, 0.82, -0.83, Math.PI / 2 - 0.25), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.02, 0.1, 0.03), M_ACCENT, m4(-0.44 + 0.045 * cote, 0.9, -0.62), { aretes: false });
// plaques de survêtement tactique + pouches
for (const cote of [-1, 1]) {
  cuire(bloc(0.1, 0.26, 0.05), M_CORPS, m4(0.14 * cote, 0.95, -0.16, 0.55), { aretes: false }); // flancs
  cuire(bloc(0.06, 0.08, 0.1), M_ACCENT, m4(0.15 * cote, 1.1, -0.28, 0.55), { aretes: false }); // épaulettes (accent)
  cuire(bloc(0.08, 0.12, 0.05), M_ACCENT, m4(0.12 * cote, 0.92, 0.14), { aretes: false });      // pouches ceinture (accent)
}
// renforts de cape (bordures)
for (const cote of [-1, 1])
  cuire(bloc(0.02, 0.75, 0.03), M_ACCENT, m4(0.13 * cote, 0.92, 0.32, 0.35, 0, 0.11 * cote), { aretes: false });
// panneau dorsal de la cape (supérieur)
cuire(bloc(0.24, 0.3, 0.02), M_CORPS, m4(0, 1.18, 0.24, 0.5), { aretes: false });

// fourreau de dague de cuisse + second couteau
cuire(bloc(0.06, 0.24, 0.05), M_ACCENT, m4(0.2, 0.68, 0.18), { aretes: false });
cuire(prisme(0.015, 0.006, 0.2, 8), M_NEON, m4(0.2, 0.52, 0.18), { aretes: false });
// liseré néon de capuche
polyline([[0.13, 1.52, -0.34], [0, 1.58, -0.44], [-0.13, 1.52, -0.34]]);
polyline([[0.13, 1.46, -0.3], [0, 1.52, -0.4], [-0.13, 1.46, -0.3]]);

// --- éclats de cloaking flottants ---
let graine = 500;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 8; i++) {
  const dx = (alea() - 0.5) * 0.7, dy = 0.5 + alea() * 0.9, dz = -0.5 + alea() * 0.8;
  const s = 0.015 + alea() * 0.018;
  cuire(new THREE.OctahedronGeometry(s, 0), M_NEON, m4(dx, dy, dz), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'espion.glb');
writeFileSync(dest, glb);
console.log(`espion.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
