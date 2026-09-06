// FABRIQUER-GALERE — FONDERIE-3D. Trameur de Surface, transporteur réseau basique
// (image_ref/galere.jpg + galere.txt). Coque effilée minimaliste, nacelle de charge
// lumineuse centrale avec paquets de sous-routines flottants (octaèdres néon).
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte compatible).
// Face -Z = proue.

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
// tronçon de coque couché le long de Z
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
  let graine = 60606;
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

// ---------- construction du Trameur de Surface ----------
// Long ~1.9, large ~0.7, hauteur ~0.6. Coque basse, proue -Z, nacelle au centre.

// --- proue (coin plongeant) ---
cuire(fuse(0.02, 0.2, 0.45, 20), M_CORPS, m4(0, 0.34, -0.72));
cuire(prisme(0.05, 0.02, 0.08, 14), M_NEON, m4(0, 0.34, -0.98, Math.PI / 2), { aretes: false }); // éperon néon
// --- coque avant ---
cuire(fuse(0.2, 0.26, 0.55, 24), M_CORPS, m4(0, 0.36, -0.28));
// --- puits central de la nacelle (la coque s'ouvre au milieu) ---
cuire(bloc(0.5, 0.14, 0.3), M_CORPS, m4(0, 0.42, -0.02), { aretes: false });     // rail avant du puits
cuire(bloc(0.5, 0.14, 0.3), M_CORPS, m4(0, 0.42, 0.42), { aretes: false });      // rail arrière du puits
// --- coque arrière ---
cuire(fuse(0.26, 0.2, 0.6, 24), M_CORPS, m4(0, 0.36, 0.62));
cuire(fuse(0.2, 0.13, 0.3, 20), M_CORPS, m4(0, 0.36, 1.02));
// poupe : moteurs
for (const cote of [-1, 1]) {
  const ech = new THREE.CylinderGeometry(0.06, 0.075, 0.16, 10, 1).rotateX(Math.PI / 2);
  cuire(ech, M_CORPS, m4(0.12 * cote, 0.36, 1.18), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(0.12 * cote, 0.36, 1.3), { aretes: false }); // lueurs
}
// --- dérives et ailerons ---
cuire(bloc(0.04, 0.16, 0.3), M_ACCENT, m4(0, 0.6, 0.75), { aretes: false });     // dérive dorsale (accent)
for (const cote of [-1, 1]) {
  cuire(bloc(0.3, 0.03, 0.24), M_CORPS, m4(0.24 * cote, 0.44, 0.75, 0, 0, -0.18 * cote)); // ailerons
  cuire(bloc(0.16, 0.02, 0.14), M_ACCENT, m4(0.3 * cote, 0.5, 0.8, 0, 0, -0.24 * cote), { aretes: false }); // pointes (accent)
}

// pont supérieur : panneaux et passerelle
cuire(bloc(0.3, 0.05, 0.3), M_CORPS, m4(0, 0.56, 0.35, -0.25));
cuire(bloc(0.2, 0.04, 0.2), M_ACCENT, m4(0, 0.61, 0.5, -0.25), { aretes: false });
for (const cote of [-1, 1]) {
  for (let i = 0; i < 5; i++)
    cuire(bloc(0.16, 0.03, 0.34), M_CORPS, m4(0.14 * cote, 0.5, -0.35 + i * 0.42), { aretes: false });
  cuire(bloc(0.05, 0.06, 0.5), M_ACCENT, m4(0.14 * cote, 0.55, 0.15), { aretes: false });
}
// blister latéraux (capteurs)
for (const cote of [-1, 1]) {
  cuire(prisme(0.06, 0.08, 0.14, 10), M_CORPS, m4(0.26 * cote, 0.36, -0.3));
  cuire(new THREE.OctahedronGeometry(0.035, 0), M_NEON, m4(0.26 * cote, 0.36, -0.42), { aretes: false });
}
// rambarde du puits (deux rambardes néon en LINES)
polyline([[-0.24, 0.56, -0.1], [-0.24, 0.56, 0.44]]);
polyline([[0.24, 0.56, -0.1], [0.24, 0.56, 0.44]]);
// passerelles latérales (bimini du transporteur)
for (const cote of [-1, 1]) {
  for (let i = 0; i < 4; i++)
    cuire(bloc(0.05, 0.03, 0.22), M_CORPS, m4(0.24 * cote, 0.55, -0.5 + i * 0.42), { aretes: false });
}
// mini-tourelle de conduite avant
cuire(prisme(0.07, 0.09, 0.07, 10), M_CORPS, m4(0, 0.56, -0.35));
cuire(bloc(0.08, 0.03, 0.04), M_ACCENT, m4(0, 0.6, -0.37), { aretes: false });
// structures de renfort du puits (berceaux de la nacelle)
for (const cote of [-1, 1]) {
  cuire(bloc(0.06, 0.1, 0.24), M_CORPS, m4(0.2 * cote, 0.44, -0.12), { aretes: false });
  cuire(bloc(0.06, 0.1, 0.24), M_CORPS, m4(0.2 * cote, 0.44, 0.52), { aretes: false });
  cuire(bloc(0.04, 0.08, 0.2), M_ACCENT, m4(0.2 * cote, 0.56, 0.2), { aretes: false });
}
// rivets de coque (petits blocs néon répartis)
let gr = 12;
const ar = () => (gr = (gr * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 16; i++) {
  const rx = (ar() - 0.5) * 0.36, rz = -0.7 + ar() * 1.7;
  const g2 = ar() < 0.5 ? new THREE.BoxGeometry(0.03, 0.03, 0.03) : new THREE.OctahedronGeometry(0.03, 0);
  cuire(g2, M_ACCENT, m4(rx, 0.52, rz), { aretes: false });
}
// réservoirs latéraux avant (blisters allongés)
for (const cote of [-1, 1]) {
  const r1 = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 14, 1).rotateX(Math.PI / 2);
  cuire(r1, M_CORPS, m4(0.26 * cote, 0.3, -0.05), { aretes: false });
}
// quille et stabilisateur ventral
cuire(bloc(0.14, 0.08, 1.1), M_CORPS, m4(0, 0.22, 0.15), { aretes: false });
cuire(bloc(0.1, 0.06, 0.24), M_ACCENT, m4(0, 0.16, -0.45, 0.4), { aretes: false });
// lignes de coque néon
polyline([[-0.16, 0.42, -0.55], [-0.22, 0.44, -0.05], [-0.2, 0.42, 0.95]]);
polyline([[0.16, 0.42, -0.55], [0.22, 0.44, -0.05], [0.2, 0.42, 0.95]]);

// --- nacelle de charge lumineuse (au centre du puits) ---
{
  const tuyau = new THREE.CylinderGeometry(0.17, 0.17, 0.6, 40, 1, true).rotateX(Math.PI / 2); // tube ouvert
  cuire(tuyau, M_CORPS, m4(0, 0.46, 0.2), { aretes: true, seuilArete: 45 });
  const bord1 = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 40, 1).rotateX(Math.PI / 2);
  cuire(bord1, M_CORPS, m4(0, 0.46, -0.1), { aretes: false });
  const bord2 = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 40, 1).rotateX(Math.PI / 2);
  cuire(bord2, M_CORPS, m4(0, 0.46, 0.5), { aretes: false });
  // paquets de sous-routines flottants : cubes + octaèdres néon
  for (const [dx, dy, dz, s, k] of [
    [-0.07, 0.5, 0.05, 0.055, 0], [0.05, 0.42, -0.02, 0.065, 1], [0.08, 0.5, 0.22, 0.05, 0],
    [-0.06, 0.44, 0.3, 0.06, 1], [0.0, 0.55, 0.14, 0.045, 0], [-0.04, 0.49, 0.38, 0.05, 1]]) {
    const g = k ? new THREE.OctahedronGeometry(s, 0) : new THREE.BoxGeometry(s, s, s);
    cuire(g, M_NEON, m4(dx, dy, dz), { aretes: false });
  }
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'galere.glb');
writeFileSync(dest, glb);
console.log(`galere.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
