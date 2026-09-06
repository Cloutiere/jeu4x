// FABRIQUER-PIQUIER — FONDERIE-3D. Protocole Anti-Probe, sentinelle défensive
// (image_ref/piquier.jpg). Stance ancrée de garde : longue lance de disruption
// tendue vers -Z (deux mains), écu pare-feu holographique large sur l'avant-bras gauche.
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte joueur compatible).

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
  let graine = 31337;
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

// ---------- construction du Piquier ----------
// Hauteur ~2.3, stance basse et large ancrée vers -Z.

// --- jambes : stance de garde, genoux fléchis, ancrage au sol ---
for (const [x0, z0, z1, ry] of [[-0.26, -0.06, -0.18, -0.4], [0.28, 0.12, 0.2, 0.45]]) {
  const hanche = [x0, 0.98, z0];
  const genou = [x0 + 0.03, 0.58, (z0 + z1) / 2 - 0.02];
  const cheville = [x0 + 0.04, 0.16, z1];
  barre(hanche, genou, 0.1, 0.085, M_CORPS, 18);
  cuire(prisme(0.09, 0.09, 0.08, 8), M_ACCENT, m4(...genou), { aretes: false });
  barre(genou, cheville, 0.08, 0.07, M_CORPS, 18);
  cuire(bloc(0.19, 0.09, 0.32), M_CORPS, m4(cheville[0], 0.05, cheville[2] - 0.05, 0, ry, 0)); // pied ancré
  cuire(bloc(0.18, 0.26, 0.06), M_CORPS, m4(x0 + 0.09, 0.62, z1 + 0.1), { aretes: false }); // garde-tibia
  cuire(bloc(0.16, 0.05, 0.14), M_ACCENT, m4(x0 + 0.06, 0.36, z1 + 0.06), { aretes: false }); // boucle (accent)
}
// --- bassin bas ---
cuire(prisme(0.25, 0.2, 0.22, 12), M_CORPS, m4(0, 1.1, 0.02));
// --- torse penché vers l'avant ---
cuire(prisme(0.3, 0.25, 0.28, 12), M_CORPS, m4(0, 1.38, 0.04, 0.18));
cuire(prisme(0.34, 0.3, 0.3, 10), M_CORPS, m4(0, 1.66, -0.02, 0.18));
cuire(bloc(0.48, 0.26, 0.34), M_CORPS, m4(0, 1.88, -0.06, 0.18));
for (let i = 0; i < 3; i++)
  cuire(bloc(0.3 - i * 0.05, 0.1, 0.05), M_CORPS, m4(0, 1.82 - i * 0.15, -0.24 - i * 0.02, 0.18), { aretes: false }); // plastron avant
for (const cote of [-1, 1])
  cuire(bloc(0.06, 0.24, 0.18), M_CORPS, m4(0.24 * cote, 1.6, 0.02, 0.18), { aretes: false }); // flancs
cuire(bloc(0.2, 0.16, 0.09), M_ACCENT, m4(0, 1.74, -0.22, 0.18), { aretes: false }); // écusson (accent)
cuire(new THREE.OctahedronGeometry(0.07, 0), M_NEON, m4(0, 1.72, -0.1), { aretes: false }); // cœur néon
cuire(prisme(0.1, 0.1, 0.46, 6), M_NEON, m4(0, 1.38, 0.12), { aretes: false }); // colonne interne
// --- tête à visière, regard vers la cible ---
cuire(prisme(0.14, 0.12, 0.26, 10), M_CORPS, m4(0, 2.12, -0.06));
cuire(bloc(0.2, 0.045, 0.05), M_NEON, m4(0, 2.14, -0.19), { aretes: false });    // visière émissive
cuire(bloc(0.05, 0.13, 0.16), M_ACCENT, m4(0, 2.2, 0.05), { aretes: false });    // crête (accent)
// --- épaulières ---
for (const cote of [-1, 1]) {
  cuire(prisme(0.15, 0.11, 0.16, 10), M_CORPS, m4(0.38 * cote, 1.94, 0, 0, 0, 0.22 * cote));
  cuire(prisme(0.13, 0.09, 0.1, 8), M_ACCENT, m4(0.38 * cote, 2.05, 0, 0, 0, 0.28 * cote), { aretes: false });
}
// --- bras droit : main arrière sur la lance (près du flanc) ---
barre([0.38, 1.88, 0], [0.42, 1.6, 0.06], 0.065, 0.06, M_CORPS, 10);
barre([0.42, 1.6, 0.06], [0.3, 1.34, -0.02], 0.055, 0.05, M_CORPS, 10);
cuire(bloc(0.11, 0.12, 0.11), M_CORPS, m4(0.28, 1.3, -0.03));                    // moufle sur la lance
// --- bras gauche : tendu sous l'écu, main avant sur la lance ---
barre([-0.38, 1.88, 0], [-0.36, 1.62, -0.28], 0.065, 0.06, M_CORPS, 10);
barre([-0.36, 1.62, -0.28], [-0.22, 1.44, -0.5], 0.055, 0.05, M_CORPS, 10);
cuire(prisme(0.07, 0.07, 0.09, 8), M_ACCENT, m4(-0.36, 1.6, -0.14), { aretes: false }); // coudière (accent)
cuire(bloc(0.11, 0.12, 0.11), M_CORPS, m4(-0.2, 1.42, -0.52));                   // moufle avant

// ---------- la lance de disruption (tenue à deux mains, pointe -Z) ----------
// axe : de la crosse (0.5, 1.22, 0.28) à la pointe (-0.4, 1.5, -1.35)
{
  const A = [0.5, 1.22, 0.28], B = [-0.35, 1.48, -1.25];
  barre(A, B, 0.028, 0.028, M_CORPS, 8);                                         // hampe
  // pointe : long cône néon + empennage accent
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const T = [B[0] - u[0] * 0.05, B[1] - u[1] * 0.05, B[2] - u[2] * 0.05];
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const mp = new THREE.Matrix4().compose(
    V((T[0] + B[0]) / 2, (T[1] + B[1]) / 2, (T[2] + B[2]) / 2), q, V(1, 0.5, 1));
  cuire(new THREE.ConeGeometry(0.05, 1, 8), M_NEON, mp, { aretes: true, seuilArete: 1 }); // pointe émissive
  // empennage (2 ailettes croisées en accent) à 15 % de la pointe
  const F = [B[0] - u[0] * 0.28, B[1] - u[1] * 0.28, B[2] - u[2] * 0.28];
  cuire(bloc(0.24, 0.02, 0.1), M_ACCENT, m4(F[0], F[1], F[2], 0, 0.35, 0), { aretes: false });
  cuire(bloc(0.02, 0.24, 0.1), M_ACCENT, m4(F[0], F[1], F[2], 0.35, 0, 0), { aretes: false });
  // anneaux d'impulsion le long de la hampe (octaèdres néon)
  for (const t of [0.25, 0.45, 0.65]) {
    const P = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + 0.045, A[2] + (B[2] - A[2]) * t];
    cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(...P), { aretes: false });
  }
  // arc électrique de haute densité autour de la pointe
  polyline([[T[0] + 0.06, T[1] + 0.02, T[2]], [T[0] + 0.02, T[1] + 0.09, T[2] - 0.05], [T[0] - 0.05, T[1] + 0.05, T[2] - 0.02]]);
  polyline([[T[0] - 0.06, T[1] - 0.04, T[2] + 0.03], [T[0], T[1] - 0.1, T[2] + 0.06], [T[0] + 0.07, T[1] - 0.02, T[2] + 0.02]]);
}

// ---------- l'écu pare-feu holographique (avant-bras gauche) ----------
{
  const cx = -0.52, cy = 1.52, cz = -0.6;
  // plat large : prisme hexagonal plat (6 segments) face -Z
  const plat = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 6, 1).rotateZ(Math.PI / 2).rotateX(0.12);
  cuire(plat, M_ACCENT, m4(cx, cy, cz));
  // circuits pare-feu en surface (concentriques + croisillons), LINES
  function hexa(r, dz) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), cz + dz]);
    }
    polyline(pts);
  }
  hexa(0.34, -0.045); hexa(0.22, -0.045); hexa(0.1, -0.045);
  polyline([[cx - 0.3, cy, cz - 0.05], [cx + 0.3, cy, cz - 0.05]]);
  polyline([[cx, cy - 0.3, cz - 0.05], [cx, cy + 0.3, cz - 0.05]]);
  // barreaux du pare-feu (rangées de « briques » lumineuses)
  for (let r = -1; r <= 1; r++)
    polyline([[cx - 0.26, cy + r * 0.12, cz - 0.05], [cx - 0.08, cy + r * 0.12 + 0.03, cz - 0.05],
      [cx + 0.08, cy + r * 0.12, cz - 0.05], [cx + 0.26, cy + r * 0.12 - 0.03, cz - 0.05]]);
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'piquier.glb');
writeFileSync(dest, glb);
console.log(`piquier.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
