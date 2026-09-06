// FABRIQUER-SOUSMARIN — FONDERIE-3D. Intercepteur Furtif, sous-marin d'attaque
// furtif (image_ref/sousmarin.jpg + sousmarin.txt). Géométrie aiguise façon
// furtif : coque en losange effilé, baie torpille à flux haute tension à la proue
// (arcs électriques LINES), tuyères arrière lumineuses, éclats de cloaking.
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
const fuse = (rt, rb, longueur, seg) => new THREE.CylinderGeometry(rt, rb, longueur, Math.round(seg * 2.4), 1).rotateX(Math.PI / 2);

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
  let graine = 50505;
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

// ---------- construction de l'Intercepteur Furtif ----------
// Long ~2.3 le long de Z (proue -Z), fin (largeur ~0.6), hauteur ~0.7.

// --- coque principale en losange effilé ---
cuire(fuse(0.02, 0.16, 0.6, 36), M_CORPS, m4(0, 0.5, -0.75));                    // proue aiguise
cuire(fuse(0.16, 0.2, 0.7, 36), M_CORPS, m4(0, 0.5, -0.28));                     // section avant
cuire(fuse(0.2, 0.17, 0.7, 36), M_CORPS, m4(0, 0.5, 0.42));                      // section centrale
cuire(fuse(0.17, 0.08, 0.42, 36), M_CORPS, m4(0, 0.5, 0.95));                    // arrière
// épine dorsale anguleuse
cuire(bloc(0.08, 0.1, 1.1), M_CORPS, m4(0, 0.68, 0.15));
cuire(bloc(0.06, 0.08, 0.34), M_ACCENT, m4(0, 0.74, 0.5), { aretes: false });    // dorsale (accent)
// --- kile ventral + ailerons ---
cuire(bloc(0.1, 0.1, 0.9), M_CORPS, m4(0, 0.32, 0.2), { aretes: false });
cuire(bloc(0.04, 0.14, 0.28), M_CORPS, m4(0, 0.26, 0.6, 0.25));                  // aileron ventral
cuire(bloc(0.03, 0.16, 0.3), M_ACCENT, m4(0, 0.68, -0.15), { aretes: false });   // aileron dorsal (accent)
// --- ailes delta latérales (furtives, plates) ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.5, 0.03, 0.34), M_CORPS, m4(0.34 * cote, 0.5, 0.28, 0, 0.35 * cote, 0), { aretes: false });
  cuire(bloc(0.14, 0.025, 0.16), M_ACCENT, m4(0.52 * cote, 0.5, 0.42, 0, 0.5 * cote, 0), { aretes: false }); // pointe (accent)
}
// plaques de furtivité supplémentaires (biseaux latéraux et dorsaux)
for (const cote of [-1, 1]) {
  cuire(bloc(0.1, 0.04, 0.6), M_CORPS, m4(0.16 * cote, 0.6, 0.3, 0, 0, 0.3 * cote), { aretes: false });
  cuire(bloc(0.08, 0.03, 0.4), M_CORPS, m4(0.14 * cote, 0.38, 0.35, 0, 0, -0.25 * cote), { aretes: false });
  cuire(bloc(0.04, 0.05, 0.2), M_ACCENT, m4(0.12 * cote, 0.66, -0.2), { aretes: false });
}
cuire(bloc(0.12, 0.04, 0.7), M_CORPS, m4(0, 0.62, 0.35), { aretes: false });
cuire(bloc(0.2, 0.05, 0.2), M_CORPS, m4(0, 0.56, -0.85, 0.3));
// anneaux de segmentation de coque
for (const z of [-0.45, -0.05, 0.35, 0.75]) {
  const an = new THREE.CylinderGeometry(0.185, 0.185, 0.05, 36, 1).rotateX(Math.PI / 2);
  cuire(an, M_CORPS, m4(0, 0.5, z), { aretes: false });
}
// senseurs dorsaux
cuire(prisme(0.05, 0.06, 0.05, 10), M_ACCENT, m4(0, 0.72, 0.32), { aretes: false });
cuire(bloc(0.06, 0.03, 0.1), M_CORPS, m4(0, 0.7, -0.05), { aretes: false });

// --- tuyères arrière (3 lueurs) ---
for (const [dx, dy] of [[0, 0.5], [-0.12, 0.42], [0.12, 0.42]]) {
  const tuy = new THREE.CylinderGeometry(0.055, 0.07, 0.14, 10, 1).rotateX(Math.PI / 2);
  cuire(tuy, M_CORPS, m4(dx, dy, 1.16), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.045, 0), M_NEON, m4(dx, dy, 1.28), { aretes: false });
}
// dérives arrière en V
for (const cote of [-1, 1])
  cuire(bloc(0.03, 0.2, 0.24), M_CORPS, m4(0.14 * cote, 0.62, 1.02, 0.35, 0, -0.45 * cote));

// --- baie torpille à flux haute tension (proue, deux mâchoires) ---
for (const cote of [-1, 1]) {
  const x = 0.11 * cote;
  cuire(bloc(0.06, 0.1, 0.34), M_CORPS, m4(x, 0.46, -0.72, 0, 0.12 * cote, 0.06 * cote)); // mâchoire
  cuire(bloc(0.03, 0.03, 0.28), M_ACCENT, m4(x + 0.04 * cote, 0.4, -0.72), { aretes: false }); // arêtes (accent)
}
// tube torpille central : anneau néon + torpille encastrée
{
  const an = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12, 1).rotateX(Math.PI / 2);
  cuire(an, M_NEON, m4(0, 0.47, -0.68), { aretes: false });
  const torp = fuse(0.035, 0.05, 0.3, 24);
  cuire(torp, M_ACCENT, m4(0, 0.47, -0.5), { aretes: false });
  // flux haute tension : arcs électriques autour de la proue (LINES)
  for (let i = 0; i < 5; i++) {
    const z0 = -0.85 + i * 0.07;
    polyline([
      [0.02 * (i % 2 ? 1 : -1), 0.47 + 0.06 * (i % 3), z0],
      [-0.04 * (i % 2 ? 1 : -1), 0.52 - 0.04 * i, z0 - 0.1],
      [0.03, 0.44 + 0.03 * i, z0 - 0.18]]);
  }
  // éclats de cloaking flottants (petits octaèdres néon)
  let graine = 77;
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 7; i++) {
    const dx = (alea() - 0.5) * 0.5, dy = 0.36 + alea() * 0.3, dz = -0.9 + alea() * 0.5;
    const s = 0.015 + alea() * 0.02;
    cuire(new THREE.OctahedronGeometry(s, 0), M_NEON, m4(dx, dy, dz), { aretes: false });
  }
}
// --- lignes de circuits furtifs le long de la coque ---
polyline([[-0.12, 0.6, -0.4], [-0.15, 0.58, 0.2], [-0.1, 0.6, 0.7]]);
polyline([[0.12, 0.6, -0.4], [0.15, 0.58, 0.2], [0.1, 0.6, 0.7]]);
polyline([[-0.08, 0.66, -0.2], [0, 0.7, 0.1], [0.08, 0.66, -0.2]]);

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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'sousmarin.glb');
writeFileSync(dest, glb);
console.log(`sousmarin.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
