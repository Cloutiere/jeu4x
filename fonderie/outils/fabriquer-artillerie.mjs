// FABRIQUER-ARTILLERIE — FONDERIE-3D. Payload Zero-Day, lanceur de siège à
// ultra-longue portée (image_ref/artillerie.jpg + artillerie.txt). Véhicule chenillé
// en stance de tir verrouillée : rail-canon ultra-long incliné vers -Z, béquilles de
// stabilisation déployées, cœur zero-day volatil qui charge à la bouche.
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
  let graine = 245;
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

// ---------- construction de l'Artillerie ----------
// Chenillé long (~2.1) le long de Z, canon incliné ~40° vers -Z (pointe à ~1.9 de haut).

// --- châssis chenillé ---
for (const cote of [-1, 1]) {
  const x = 0.44 * cote;
  cuire(bloc(0.2, 0.3, 1.9), M_CORPS, m4(x, 0.2, 0.1));                           // chenille
  for (let i = 0; i < 6; i++) {
    const roue = new THREE.CylinderGeometry(0.085, 0.085, 0.1, 20, 1).rotateZ(Math.PI / 2);
    cuire(roue, M_CORPS, m4(x, 0.14, -0.7 + i * 0.32), { aretes: false });        // galets
  }
  cuire(bloc(0.02, 0.12, 1.8), M_ACCENT, m4(x + 0.13 * cote, 0.24, 0.1), { aretes: false }); // bande (accent)
  cuire(bloc(0.06, 0.14, 1.6), M_CORPS, m4(x + 0.12 * cote, 0.42, 0.1), { aretes: false });  // aile
}
cuire(bloc(0.52, 0.24, 1.8), M_CORPS, m4(0, 0.48, 0.1));                          // caisse
cuire(prisme(0.1, 0.13, 0.08, 12), M_ACCENT, m4(0, 0.63, -0.3), { aretes: false }); // tourelle de conduite de tir (accent)
for (const cote of [-1, 1])
  cuire(bloc(0.12, 0.04, 0.3), M_CORPS, m4(0.17 * cote, 0.68, -0.35, 0.4), { aretes: false }); // hachages avant
cuire(bloc(0.58, 0.09, 0.6), M_CORPS, m4(0, 0.56, -0.55, 0.4));                   // glacis avant
cuire(bloc(0.5, 0.12, 0.5), M_CORPS, m4(0, 0.58, 0.75, -0.35));                   // poupe
for (let i = 0; i < 4; i++)
  cuire(bloc(0.32, 0.025, 0.05), M_ACCENT, m4(0, 0.52, 0.85 + i * 0.05), { aretes: false }); // grilles arrière
for (const cote of [-1, 1])
  cuire(new THREE.OctahedronGeometry(0.035, 0), M_NEON, m4(0.17 * cote, 0.5, -0.85), { aretes: false }); // optiques

// --- blockhaus de tir arrière (abrite la culasse) ---
cuire(bloc(0.44, 0.4, 0.5), M_CORPS, m4(0, 0.85, 0.6));
cuire(bloc(0.34, 0.08, 0.4), M_ACCENT, m4(0, 1.08, 0.6), { aretes: false });      // toit (accent)
cuire(prisme(0.02, 0.02, 0.34, 10), M_CORPS, m4(-0.15, 1.28, 0.72, 0.15), { aretes: false }); // antenne
// conduits d'alimentation vers le canon
for (const cote of [-1, 1])
  barre([0.12 * cote, 0.92, 0.42], [0.08 * cote, 1.12, 0.16], 0.03, 0.03, M_CORPS, 8);

// --- berceau du canon ---
cuire(prisme(0.17, 0.2, 0.22, 24), M_CORPS, m4(0, 1.16, 0.05, 0.65));

// --- le rail-canon ultra-long (inclinaison ~40° vers -Z) ---
{
  const A = [0, 1.1, 0.28], B = [0, 1.85, -1.35];   // culasse -> bouche (longueur ~1.87)
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const centre = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  // corps segmenté (3 tronçons visuels)
  for (const [t0, t1, r0, r1] of [[0, 0.4, 0.17, 0.15], [0.4, 0.72, 0.15, 0.13], [0.72, 1, 0.13, 0.11]]) {
    const P0 = [A[0] + u[0] * l * t0, A[1] + u[1] * l * t0, A[2] + u[2] * l * t0];
    const P1 = [A[0] + u[0] * l * t1, A[1] + u[1] * l * t1, A[2] + u[2] * l * t1];
    const cm = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2, (P0[2] + P1[2]) / 2];
    const lm = Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]);
    const tr = new THREE.CylinderGeometry(r1, r0, lm * 1.02, 18, 1);
    cuire(tr, M_CORPS, new THREE.Matrix4().compose(V(...cm), q, V(1, 1, 1)));
  }
  // culasse renflée dans le blockhaus
  const culasse = new THREE.CylinderGeometry(0.24, 0.26, 0.36, 18, 1);
  cuire(culasse, M_CORPS, new THREE.Matrix4().compose(V(A[0] + u[0] * 0.06, A[1] + u[1] * 0.06, A[2] + u[2] * 0.06), q, V(1, 1, 1)));
  // anseaux de renfort
  for (const t of [0.18, 0.45, 0.72]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t, A[2] + u[2] * l * t];
    const an = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18, 1);
    cuire(an, M_CORPS, new THREE.Matrix4().compose(V(...P), q, V(1, 1, 1)), { aretes: false });
  }
  // --- bouche : anneau + cœur zero-day qui charge + vortex (LINES) ---
  const an = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14, 1);
  cuire(an, M_CORPS, new THREE.Matrix4().compose(V(B[0] - u[0] * 0.02, B[1] - u[1] * 0.02, B[2] - u[2] * 0.02), q, V(1, 1, 1)));
  const MZ = [B[0] - u[0] * 0.1, B[1] - u[1] * 0.1, B[2] - u[2] * 0.1];
  cuire(new THREE.OctahedronGeometry(0.11, 0), M_NEON, m4(...MZ), { aretes: false }); // cœur zero-day
  for (const [r, dz] of [[0.17, -0.02], [0.24, 0.02], [0.31, 0.08]]) {           // cercles de charge
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([MZ[0] + r * Math.cos(a), MZ[1] + r * Math.sin(a), MZ[2] + dz]);
    }
    polyline(pts);
  }
  for (let i = 0; i < 6; i++) {                                                  // rayons
    const a = (i / 6) * Math.PI * 2;
    polyline([
      [MZ[0] + 0.06 * Math.cos(a), MZ[1] + 0.06 * Math.sin(a), MZ[2] - 0.03],
      [MZ[0] + 0.28 * Math.cos(a + 0.5), MZ[1] + 0.28 * Math.sin(a + 0.5), MZ[2] + 0.07]]);
  }
  // petites impulsions le long du canon
  for (const t of [0.35, 0.6, 0.85]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t + 0.12, A[2] + u[2] * l * t];
    cuire(new THREE.OctahedronGeometry(0.03, 0), M_NEON, m4(...P), { aretes: false });
  }
}

// --- béquilles de stabilisation déployées à l'avant ---
for (const cote of [-1, 1]) {
  barre([0.3 * cote, 0.62, -0.6], [0.55 * cote, 0.2, -0.85], 0.045, 0.04, M_CORPS, 10);
  cuire(bloc(0.2, 0.08, 0.24), M_CORPS, m4(0.55 * cote, 0.12, -0.88));           // pad de béquille
  cuire(bloc(0.16, 0.04, 0.18), M_ACCENT, m4(0.55 * cote, 0.18, -0.86), { aretes: false }); // semelle (accent)
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'artillerie.glb');
writeFileSync(dest, glb);
console.log(`artillerie.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
