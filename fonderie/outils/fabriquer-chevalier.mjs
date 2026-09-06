// FABRIQUER-CHEVALIER — FONDERIE-3D. Traqueur Avancé, chevalier lourd d'incursion
// (image_ref/chevalier.jpg + chevalier.txt). Armure lourde héroïque, lance digitale
// massive à éclats de corruption tenue en diagonale, écu sur l'avant-bras gauche,
// propulseur d'épaule. Style : STYLE-3D.md — mêmes 3 matériaux (teinte joueur compatible).

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
  let graine = 424242;
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

// ---------- construction du Chevalier ----------
// Hauteur ~2.45, carrure large, pose héroïque avancée (jambe gauche devant, -Z).

// --- jambes : fente du traqueur ---
for (const [x0, zH, zG, zP, ry] of [[-0.24, -0.06, -0.16, -0.3, -0.45], [0.26, 0.1, 0.14, 0.24, 0.5]]) {
  const hanche = [x0, 1.02, zH];
  const genou = [x0 + 0.03, 0.6, (zH + zG) / 2 + 0.03];
  const cheville = [x0 + 0.03, 0.16, zP];
  barre(hanche, genou, 0.11, 0.09, M_CORPS, 14);
  cuire(prisme(0.095, 0.095, 0.09, 8), M_ACCENT, m4(...genou), { aretes: false });
  barre(genou, cheville, 0.085, 0.07, M_CORPS, 14);
  cuire(bloc(0.2, 0.1, 0.34), M_CORPS, m4(cheville[0], 0.05, cheville[2] - 0.06, 0, ry, 0)); // sabaton
  cuire(bloc(0.2, 0.3, 0.07), M_CORPS, m4(x0 + 0.1, 0.66, zP + 0.08), { aretes: false }); // garde-tibia
  cuire(bloc(0.17, 0.05, 0.13), M_ACCENT, m4(x0 + 0.06, 0.4, zP + 0.04), { aretes: false }); // genouillère basse (accent)
}
// --- bassin ceinturé ---
cuire(prisme(0.27, 0.21, 0.24, 8), M_CORPS, m4(0, 1.14, 0));
for (const cote of [-1, 1])
  cuire(bloc(0.18, 0.14, 0.2), M_ACCENT, m4(0.2 * cote, 1.14, 0.04, 0, 0.3 * cote, 0.15 * cote), { aretes: false }); // tassettes (accent)
// --- torse héroïque ---
cuire(prisme(0.32, 0.27, 0.3, 8), M_CORPS, m4(0, 1.44, 0));
cuire(prisme(0.36, 0.32, 0.3, 8), M_CORPS, m4(0, 1.72, 0));
cuire(bloc(0.52, 0.28, 0.36), M_CORPS, m4(0, 1.94, 0));
for (let i = 0; i < 3; i++)
  cuire(bloc(0.32 - i * 0.05, 0.1, 0.05), M_CORPS, m4(0, 1.84 - i * 0.16, -0.21), { aretes: false }); // plastron avant
cuire(bloc(0.2, 0.16, 0.08), M_ACCENT, m4(0, 1.76, -0.22), { aretes: false });   // écusson Y (accent)
cuire(new THREE.OctahedronGeometry(0.075, 0), M_NEON, m4(0, 1.76, -0.1), { aretes: false }); // cœur néon
cuire(prisme(0.1, 0.1, 0.5, 6), M_NEON, m4(0, 1.42, 0.08), { aretes: false });   // colonne interne
// --- tête : heaume anguleux à double visière ---
cuire(prisme(0.15, 0.12, 0.28, 8), M_CORPS, m4(0, 2.2, -0.02));
cuire(prisme(0.12, 0.15, 0.05, 8), M_CORPS, m4(0, 2.36, -0.02));
cuire(bloc(0.06, 0.1, 0.06), M_NEON, m4(0, 2.24, -0.16), { aretes: false });     // triangle de visière
for (const cote of [-1, 1])
  cuire(bloc(0.07, 0.03, 0.05), M_NEON, m4(0.045 * cote, 2.3, -0.15, 0, 0, -0.5 * cote), { aretes: false }); // yeux obliques
cuire(bloc(0.05, 0.13, 0.16), M_ACCENT, m4(0, 2.28, 0.06), { aretes: false });   // crête (accent)
// --- épaulières lourdes en strates ---
for (const cote of [-1, 1]) {
  const x = 0.44 * cote;
  cuire(prisme(0.19, 0.14, 0.2, 8), M_CORPS, m4(x, 1.98, 0, 0, 0, 0.26 * cote));
  cuire(prisme(0.16, 0.11, 0.14, 8), M_CORPS, m4(x, 2.12, 0, 0, 0, 0.32 * cote));
  cuire(bloc(0.22, 0.05, 0.22), M_ACCENT, m4(x, 2.22, 0, 0, 0, 0.3 * cote), { aretes: false });
}
// --- propulseur d'épaule droit ---
{
  const x = 0.52;
  cuire(bloc(0.2, 0.24, 0.34), M_CORPS, m4(x, 2.2, 0.22, -0.2, 0, 0.25));         // nacelle
  cuire(prisme(0.06, 0.045, 0.16, 8), M_CORPS, m4(x + 0.02, 2.12, 0.44, -0.5), { aretes: false }); // tuyère
  cuire(new THREE.OctahedronGeometry(0.05, 0), M_NEON, m4(x + 0.02, 2.06, 0.5), { aretes: false }); // flamme néon
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.16, 0.02, 0.05), M_ACCENT, m4(x, 2.14 + i * 0.05, 0.1 - i * 0.02), { aretes: false }); // grilles (accent)
}
// --- bras droit : tient la lance par la poignée centrale ---
barre([0.44, 1.86, 0], [0.5, 1.52, -0.06], 0.07, 0.062, M_CORPS, 12);
barre([0.5, 1.52, -0.06], [0.44, 1.32, -0.2], 0.06, 0.055, M_CORPS, 12);
cuire(prisme(0.075, 0.075, 0.09, 8), M_ACCENT, m4(0.5, 1.5, -0.04), { aretes: false }); // coude (accent)
cuire(bloc(0.12, 0.13, 0.12), M_CORPS, m4(0.44, 1.28, -0.22));                   // moufle
// --- bras gauche + écu sur l'avant-bras ---
barre([-0.44, 1.86, 0], [-0.46, 1.56, -0.12], 0.07, 0.062, M_CORPS, 12);
barre([-0.46, 1.56, -0.12], [-0.42, 1.34, -0.3], 0.06, 0.055, M_CORPS, 12);
cuire(prisme(0.075, 0.075, 0.09, 8), M_ACCENT, m4(-0.46, 1.54, -0.1), { aretes: false }); // coudière (accent)
cuire(bloc(0.12, 0.13, 0.12), M_CORPS, m4(-0.42, 1.3, -0.32));                   // moufle

// --- écu elongé sur l'avant-bras gauche ---
{
  const cx = -0.56, cy = 1.44, cz = -0.42;
  const plat = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 6, 1).rotateZ(Math.PI / 2).rotateX(0.15).scale(1, 1.5, 1);
  cuire(plat, M_CORPS, m4(cx, cy, cz));
  polyline([[cx - 0.2, cy - 0.34, cz - 0.04], [cx - 0.2, cy + 0.34, cz - 0.04], [cx + 0.2, cy + 0.2, cz - 0.04]]);
  polyline([[cx + 0.12, cy - 0.22, cz - 0.045], [cx + 0.12, cy + 0.24, cz - 0.045]]);
}

// --- la lance digitale massive : diagonale, pointe bas-avant ---
{
  const A = [0.62, 1.52, 0.3], B = [-0.3, 0.72, -0.85];   // crosse haute-arrière -> pointe bas-avant
  barre(A, B, 0.035, 0.035, M_CORPS, 8);                  // fût
  // lame centrale effilée néon à la pointe
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const T = [B[0] + u[0] * 0.1, B[1] + u[1] * 0.1, B[2] + u[2] * 0.1];
  const mp = new THREE.Matrix4().compose(
    V((B[0] + T[0]) / 2, (B[1] + T[1]) / 2, (B[2] + T[2]) / 2), q, V(1, 0.55, 1));
  cuire(new THREE.ConeGeometry(0.07, 1, 6), M_NEON, mp, { aretes: true, seuilArete: 1 });
  // ailerons dentés de la lame (accent) le long des derniers 30 %
  for (const t of [0.78, 0.86, 0.94]) {
    const P = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    cuire(bloc(0.03, 0.16 - (t - 0.78) * 0.6, 0.06), M_ACCENT,
      m4(P[0] + 0.05, P[1] + 0.06, P[2], 0, 0, 0.6), { aretes: false });
    cuire(bloc(0.03, 0.14 - (t - 0.78) * 0.5, 0.06), M_ACCENT,
      m4(P[0] - 0.05, P[1] - 0.05, P[2], 0, 0, -0.6), { aretes: false });
  }
  // poignée renfort + garde
  const G = [A[0] + (B[0] - A[0]) * 0.3, A[1] + (B[1] - A[1]) * 0.3, A[2] + (B[2] - A[2]) * 0.3];
  cuire(bloc(0.12, 0.05, 0.12), M_ACCENT, m4(...G, 0, 0.5, 0), { aretes: false });
  // impulsions de corruption : octaèdres néon + tirets LINES autour de la lame
  for (const [dx, dy, dz, s] of [[0.1, -0.1, -0.08, 0.03], [-0.12, 0.06, -0.02, 0.025], [0.06, -0.2, -0.12, 0.035]]) {
    cuire(new THREE.OctahedronGeometry(s, 0), M_NEON, m4(G[0] + dx - 0.3, G[1] + dy - 0.3, G[2] + dz - 0.4), { aretes: false });
  }
  polyline([[G[0] - 0.05, G[1] - 0.15, G[2] - 0.15], [G[0] - 0.16, G[1] - 0.24, G[2] - 0.28]]);
  polyline([[G[0] + 0.08, G[1] - 0.3, G[2] - 0.2], [G[0] - 0.02, G[1] - 0.42, G[2] - 0.36]]);
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'chevalier.glb');
writeFileSync(dest, glb);
console.log(`chevalier.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
