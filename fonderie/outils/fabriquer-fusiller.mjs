// FABRIQUER-FUSILLER — FONDERIE-3D. Garde de Noyau, sentinelle d'infanterie
// (image_ref/fusiller.jpg + fusiller.txt). Posture disciplinée, fusil d'exploit
// numérique long tenu en travers du torse (canon vers -Z haut), énergie de charge
// néon le long du canon. Style : STYLE-3D.md — mêmes 3 matériaux (teinte compatible).

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
  let graine = 1701;
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

// ---------- construction du Fusiller ----------
// Debout, discipliné, hauteur ~2.4, face -Z. Fusil en travers, canon vers -Z haut.

// --- jambes : posture droite stable, pieds écartés ---
for (const cote of [-1, 1]) {
  const x = 0.18 * cote;
  cuire(prisme(0.1, 0.085, 0.38, 14), M_CORPS, m4(x, 1.04, 0));                   // cuisse
  cuire(bloc(0.17, 0.08, 0.17), M_ACCENT, m4(x, 0.85, 0), { aretes: false });     // genou (accent)
  cuire(prisme(0.08, 0.065, 0.44, 14), M_CORPS, m4(x, 0.48, 0));                  // tibia
  cuire(prisme(0.07, 0.08, 0.1, 10), M_CORPS, m4(x, 0.17, 0));                    // cheville
  cuire(bloc(0.16, 0.26, 0.06), M_CORPS, m4(x + 0.07 * cote, 0.55, 0.12), { aretes: false }); // garde-tibia
  cuire(bloc(0.19, 0.09, 0.32), M_CORPS, m4(x, 0.05, -0.05));                     // pied
  cuire(bloc(0.14, 0.24, 0.05), M_ACCENT, m4(x + 0.13 * cote, 1.06, 0.1), { aretes: false }); // plaque de cuisse (accent)
}
// --- ceinture tactique + pouches ---
cuire(prisme(0.25, 0.21, 0.14, 8), M_CORPS, m4(0, 1.24, 0));
for (const [dx, s] of [[-0.16, 1], [0.02, 1.2], [0.18, 0.9]])
  cuire(bloc(0.09 * s, 0.12, 0.07), M_ACCENT, m4(dx, 1.2, -0.14), { aretes: false }); // pouches (accent)
cuire(bloc(0.07, 0.3, 0.08), M_CORPS, m4(-0.24, 1.0, 0.05), { aretes: false });  // holster
// --- torse ---
cuire(prisme(0.31, 0.26, 0.3, 12), M_CORPS, m4(0, 1.52, 0));
cuire(prisme(0.35, 0.31, 0.3, 10), M_CORPS, m4(0, 1.8, 0));
cuire(bloc(0.5, 0.26, 0.34), M_CORPS, m4(0, 2.02, 0));
for (let i = 0; i < 3; i++)
  cuire(bloc(0.32 - i * 0.05, 0.1, 0.05), M_CORPS, m4(0, 1.92 - i * 0.15, -0.2), { aretes: false }); // plastron
cuire(bloc(0.18, 0.15, 0.08), M_ACCENT, m4(0, 1.8, -0.2), { aretes: false });    // écusson (accent)
cuire(new THREE.OctahedronGeometry(0.07, 0), M_NEON, m4(0, 1.8, -0.08), { aretes: false }); // cœur néon
cuire(prisme(0.1, 0.1, 0.48, 6), M_NEON, m4(0, 1.5, 0.08), { aretes: false });   // colonne interne
// --- heaume à visière en T ---
cuire(prisme(0.15, 0.12, 0.26, 10), M_CORPS, m4(0, 2.22, -0.01));
cuire(prisme(0.13, 0.15, 0.05, 8), M_CORPS, m4(0, 2.36, -0.01));
cuire(bloc(0.04, 0.14, 0.04), M_NEON, m4(0, 2.28, -0.15), { aretes: false });    // barre verticale du T
cuire(bloc(0.18, 0.04, 0.04), M_NEON, m4(0, 2.32, -0.15), { aretes: false });    // barre horizontale du T
cuire(bloc(0.05, 0.12, 0.15), M_ACCENT, m4(0, 2.28, 0.06), { aretes: false });   // crête (accent)
// --- épaulières + bras ---
for (const cote of [-1, 1]) {
  cuire(prisme(0.16, 0.12, 0.17, 8), M_CORPS, m4(0.4 * cote, 2.06, 0, 0, 0, 0.24 * cote));
  cuire(prisme(0.14, 0.1, 0.11, 8), M_ACCENT, m4(0.4 * cote, 2.18, 0, 0, 0, 0.3 * cote), { aretes: false });
}
// bras droit : main à la poignée (avant du fusil côté corps)
barre([0.4, 1.98, 0], [0.34, 1.7, -0.14], 0.065, 0.058, M_CORPS, 12);
barre([0.34, 1.7, -0.14], [0.16, 1.5, -0.24], 0.058, 0.052, M_CORPS, 12);
cuire(prisme(0.07, 0.07, 0.08, 8), M_ACCENT, m4(0.34, 1.68, -0.1), { aretes: false }); // coude (accent)
cuire(bloc(0.11, 0.12, 0.11), M_CORPS, m4(0.14, 1.48, -0.26));                   // moufle avant
// bras gauche : main à la détente (crosse)
barre([-0.4, 1.98, 0], [-0.36, 1.74, -0.08], 0.065, 0.058, M_CORPS, 12);
barre([-0.36, 1.74, -0.08], [-0.1, 1.52, -0.1], 0.058, 0.052, M_CORPS, 12);
cuire(prisme(0.07, 0.07, 0.08, 8), M_ACCENT, m4(-0.36, 1.72, -0.04), { aretes: false }); // coude (accent)
cuire(bloc(0.11, 0.12, 0.11), M_CORPS, m4(-0.08, 1.5, -0.12));                   // moufle arrière

// ---------- le fusil d'exploit numérique (en travers, canon -Z haut) ----------
{
  const A = [-0.05, 1.34, 0.18], B = [-0.3, 1.9, -0.72];   // crosse bas-arrière -> bouche haut-avant
  barre(A, B, 0.06, 0.05, M_CORPS, 10);                    // corps
  // canon long effilé dans le prolongement
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const M = [B[0] + u[0] * 0.42, B[1] + u[1] * 0.42, B[2] + u[2] * 0.42];
  barre(B, M, 0.035, 0.02, M_CORPS, 10);
  // énergie de charge néon le long du canon (ligne double)
  polyline([
    [A[0] + 0.02, A[1] + 0.06, A[2] - 0.03],
    [B[0] + 0.02, B[1] + 0.06, B[2] - 0.03],
    [M[0] + 0.02, M[1] + 0.06, M[2] - 0.03]]);
  polyline([
    [M[0] - 0.03, M[1] + 0.04, M[2] + 0.02], [M[0] + 0.04, M[1] + 0.09, M[2] - 0.04]]);
  // crosse, poignée, lunette, garde
  cuire(bloc(0.09, 0.18, 0.1), M_CORPS, m4(A[0] - 0.02, A[1] - 0.04, A[2] + 0.06, 0.5, 0, 0), { aretes: false }); // crosse
  cuire(bloc(0.05, 0.12, 0.05), M_ACCENT, m4(0.02, 1.4, 0.02), { aretes: false }); // poignée (accent)
  cuire(bloc(0.05, 0.06, 0.2), M_ACCENT, m4(B[0] + 0.02, B[1] + 0.12, B[2] - 0.1, 0.5, 0, 0), { aretes: false }); // lunette (accent)
  cuire(bloc(0.03, 0.1, 0.06), M_ACCENT, m4(-0.16, 1.52, -0.14), { aretes: false }); // garde (accent)
  // chargeur incliné
  cuire(bloc(0.08, 0.2, 0.06), M_CORPS, m4(-0.12, 1.34, 0.0, 0.35, 0, 0), { aretes: false });
  // pointeau de bouche néon
  cuire(new THREE.OctahedronGeometry(0.045, 0), M_NEON, m4(M[0], M[1], M[2]), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'fusiller.glb');
writeFileSync(dest, glb);
console.log(`fusiller.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
