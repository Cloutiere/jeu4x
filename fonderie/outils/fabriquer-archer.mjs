// FABRIQUER-ARCHER — FONDERIE-3D. Sentinelle défensive à distance (image_ref/acher.jpg).
// Avatar cyber en position de tir bandé : arc à filaments laser (LINES), flèche de
// données néon, réticules de visée holographiques flottants. Face -Z = direction de tir.
// Style : STYLE-3D.md — mêmes 3 matériaux que Guerrier/Colon (teinte joueur compatible).

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

// barre orientée entre deux articulations (membre posé)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function barre(a, b, rt, rb, mat, seg = 12, { aretes = true } = {}) {
  const A = V(...a), B = V(...b);
  const dir = B.clone().sub(A);
  const long = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, long, 1));
  cuire(new THREE.CylinderGeometry(rt, rb, 1, Math.round(seg * 2.4)), mat, m, { aretes });
}
// poly-ligne néon
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
  let graine = 2049;
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

// ---------- construction de l'Archer ----------
// Hauteur ~2.5, origine au sol, face -Z (direction de tir).

// --- jambes en grand écart de tireur (hanches basses) ---
// jambe avant (x<0, pied vers -Z) et jambe arrière (x>0, pied vers +Z)
for (const [x0, z0, ry] of [[-0.22, -0.1, -0.5], [0.26, 0.16, 0.55]]) {
  const hanche = [x0, 0.95, z0];
  const genou = [x0 + 0.04, 0.55, z0 + 0.05 * Math.sign(z0)];
  const cheville = [x0 + 0.02, 0.18, z0 + 0.02];
  barre(hanche, genou, 0.1, 0.08, M_CORPS, 14);
  cuire(prisme(0.085, 0.085, 0.09, 8), M_ACCENT, m4(...genou), { aretes: false }); // rotule (accent)
  barre(genou, cheville, 0.075, 0.065, M_CORPS, 14);
  cuire(bloc(0.18, 0.09, 0.3), M_CORPS, m4(cheville[0], 0.05, cheville[1 === 1 ? 2 : 2] - 0.06, 0, ry, 0)); // pied
  cuire(bloc(0.2, 0.04, 0.14), M_ACCENT, m4(cheville[0], 0.28, cheville[2], 0, ry, 0), { aretes: false }); // garde-tibia (accent)
}
// --- bassin ---
cuire(prisme(0.23, 0.18, 0.22, 8), M_CORPS, m4(0, 1.06, 0));
// --- torse (tourné vers la cible : épaules alignées selon la ligne de tir) ---
cuire(prisme(0.28, 0.23, 0.28, 8), M_CORPS, m4(0, 1.34, 0));
cuire(prisme(0.32, 0.28, 0.3, 8), M_CORPS, m4(0, 1.62, 0));
cuire(bloc(0.46, 0.28, 0.34), M_CORPS, m4(0, 1.84, 0));                          // plastron haut
cuire(bloc(0.3, 0.15, 0.28), M_CORPS, m4(0, 2.0, 0));                            // clavicules
for (let i = 0; i < 3; i++)
  cuire(bloc(0.3 - i * 0.05, 0.1, 0.05), M_CORPS, m4(0, 1.76 - i * 0.15, -0.18), { aretes: false }); // plastron avant
cuire(bloc(0.2, 0.16, 0.09), M_ACCENT, m4(0, 1.68, -0.19), { aretes: false });   // écusson (accent)
cuire(new THREE.OctahedronGeometry(0.07, 0), M_NEON, m4(0, 1.66, -0.08), { aretes: false }); // cœur néon
cuire(prisme(0.1, 0.1, 0.42, 6), M_NEON, m4(0, 1.34, 0.07), { aretes: false });  // colonne interne
// --- carquois dorsal (accent) ---
for (let i = 0; i < 3; i++)
  cuire(prisme(0.028, 0.028, 0.42, 6), M_ACCENT, m4(-0.1 + i * 0.1, 1.86, 0.24, 0.32, 0, 0.08 * (i - 1)), { aretes: false });
cuire(bloc(0.2, 0.26, 0.08), M_CORPS, m4(0, 1.72, 0.26, 0.25));
// --- tête : casque à visière aligné sur la ligne de tir ---
cuire(prisme(0.15, 0.13, 0.28, 8), M_CORPS, m4(0, 2.22, -0.02));
cuire(prisme(0.13, 0.15, 0.06, 8), M_CORPS, m4(0, 2.37, -0.02));
cuire(bloc(0.22, 0.05, 0.06), M_NEON, m4(0, 2.24, -0.15), { aretes: false });    // visière émissive
cuire(bloc(0.05, 0.14, 0.18), M_ACCENT, m4(0, 2.3, 0.06), { aretes: false });    // crête (accent)
// --- épaulières ---
for (const cote of [-1, 1]) {
  cuire(prisme(0.15, 0.11, 0.16, 8), M_CORPS, m4(0.36 * cote, 1.94, 0, 0, 0, 0.2 * cote));
  cuire(prisme(0.13, 0.09, 0.1, 8), M_ACCENT, m4(0.36 * cote, 2.05, 0, 0, 0, 0.25 * cote), { aretes: false });
}
// --- bras d'arc (gauche, x<0) tendu vers l'avant, main à la poignée de l'arc ---
barre([-0.36, 1.9, 0], [-0.32, 2.0, -0.3], 0.065, 0.06, M_CORPS, 10);
barre([-0.32, 2.0, -0.3], [-0.28, 2.04, -0.58], 0.055, 0.05, M_CORPS, 10);
cuire(prisme(0.07, 0.07, 0.09, 8), M_ACCENT, m4(-0.32, 2.02, -0.36), { aretes: false }); // garde-bras (accent)
cuire(bloc(0.11, 0.13, 0.11), M_CORPS, m4(-0.28, 2.04, -0.62));                  // moufle à la poignée
// --- bras de corde (droit, x>0) replié, main à la joue ---
barre([0.36, 1.9, 0], [0.42, 1.98, 0.22], 0.065, 0.06, M_CORPS, 10);
barre([0.42, 1.98, 0.22], [0.14, 2.26, 0.18], 0.055, 0.05, M_CORPS, 10);
cuire(prisme(0.07, 0.07, 0.08, 8), M_ACCENT, m4(0.42, 2.0, 0.11), { aretes: false }); // coude (accent)
cuire(bloc(0.11, 0.12, 0.11), M_CORPS, m4(0.12, 2.28, 0.18));                    // moufle de corde
// --- gants de tir ---
cuire(bloc(0.06, 0.1, 0.06), M_ACCENT, m4(0.05, 2.34, 0.1), { aretes: false });

// ---------- l'arc à filaments laser (entièrement en LINES — 0 triangle) ----------
// plan de l'arc : XY à z ≈ -0.68 ; grip à (-0.28, 2.04)
const arcs = [];
for (const sens of [-1, 1]) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;                                   // 0 = poignée, 1 = extrémité
    const y = 2.02 + sens * (0.05 + t * 0.5);
    const z = -0.62 - 0.12 * Math.sin(t * Math.PI * 0.85) - 0.04 * t * t; // recurve vers la cible
    pts.push([-0.28 + 0.025 * Math.sin(t * 5), y, z]);
  }
  polyline(pts);
  // filament doublé (épaisseur visuelle sans géométrie tri)
  polyline(pts.map(([x, y, z]) => [x + 0.018, y, z + 0.012]));
  arcs.push(pts[pts.length - 1]);
}
// corde bandée : pointe haute -> main de corde -> pointe basse
polyline([arcs[1], [0.12, 2.3, 0.16], arcs[0]]);
// flèche de données : fût néon + pointe octaèdre + empennage
polyline([[0.12, 2.3, 0.14], [0.1, 2.28, -1.5]]);
cuire(new THREE.OctahedronGeometry(0.05, 0), M_NEON, m4(0.1, 2.28, -1.56), { aretes: false });
polyline([[0.06, 2.24, 0.1], [0.12, 2.3, 0.14], [0.09, 2.35, 0.12]]);
// poignée et panneaux d'arc (un peu de matière)
cuire(bloc(0.05, 0.18, 0.06), M_ACCENT, m4(-0.28, 2.02, -0.6), { aretes: false });
cuire(bloc(0.035, 0.26, 0.03), M_CORPS, m4(-0.22, 2.3, -0.72, 0, 0, 0.5), { aretes: false }); // limb décoratif

// --- plaques supplémentaires (cible de tris + lisibilité) ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.06, 0.26, 0.2), M_CORPS, m4(0.24 * cote, 1.62, 0.02), { aretes: false });   // flancs de torse
  cuire(bloc(0.1, 0.2, 0.05), M_ACCENT, m4(0.27 * cote, 1.62, -0.16), { aretes: false });  // plaques pectorales (accent)
  cuire(bloc(0.09, 0.24, 0.06), M_CORPS, m4(0.28 * cote, 0.98, 0.05), { aretes: false });  // plaques de hanche
}
cuire(prisme(0.2, 0.16, 0.1, 10), M_CORPS, m4(0, 2.06, 0.02));                   // collerette

// ---------- réticules de visée holographiques (LINES) ----------
function cercle(cx, cy, cz, r, axe = 'z') {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push(axe === 'z' ? [cx + r * Math.cos(a), cy + r * Math.sin(a), cz] : [cx + r * Math.cos(a), cy, cz + r * Math.sin(a)]);
  }
  polyline(pts);
}
cercle(0.1, 2.28, -1.05, 0.1);
cercle(0.1, 2.28, -1.18, 0.16);
cercle(0.1, 2.28, -1.18, 0.05);
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])   // ticks de visée
  polyline([[0.1 + dx * 0.2, 2.28 + dy * 0.2, -1.18], [0.1 + dx * 0.26, 2.28 + dy * 0.26, -1.18]]);
polyline([[0.1, 2.28, -1.05], [0.1, 2.28, -0.9]]);           // axe laser court

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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'archer.glb');
writeFileSync(dest, glb);
console.log(`archer.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
