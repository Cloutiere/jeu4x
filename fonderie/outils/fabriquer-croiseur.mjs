// FABRIQUER-CROISEUR — FONDERIE-3D. Navire d'Escorte, croiseur polyvalent
// (image_ref/croiseur.jpg + croiseur.txt). Coque de guerre effilée, trois tourelles
// rails jumelles, défenses ponctuelles, tuyères overclockées à traînées de pulses.
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
  let graine = 31073;
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

// ---------- construction du Croiseur ----------
// Long ~2.3 le long de Z (proue -Z), large ~0.7, hauteur ~0.8.

// --- coque de guerre effilée ---
cuire(fuse(0.03, 0.18, 0.55, 26), M_CORPS, m4(0, 0.5, -0.8));                    // proue aiguise
cuire(fuse(0.18, 0.24, 0.6, 26), M_CORPS, m4(0, 0.5, -0.35));                    // section avant
cuire(fuse(0.24, 0.21, 0.8, 26), M_CORPS, m4(0, 0.5, 0.3));                      // maître brie
cuire(fuse(0.21, 0.14, 0.5, 26), M_CORPS, m4(0, 0.5, 0.95));                     // arrière
// superstructure centrale
cuire(bloc(0.26, 0.12, 0.6), M_CORPS, m4(0, 0.72, 0.1));
cuire(bloc(0.16, 0.08, 0.26), M_ACCENT, m4(0, 0.8, 0.14), { aretes: false });     // passerelle (accent)
cuire(bloc(0.05, 0.03, 0.05), M_NEON, m4(0, 0.84, -0.02), { aretes: false });     // mât optique
// lignes de coque néon (rivalisent avec la référence)
polyline([[-0.19, 0.5, -0.6], [-0.24, 0.52, 0.0], [-0.2, 0.5, 0.85]]);
polyline([[0.19, 0.5, -0.6], [0.24, 0.52, 0.0], [0.2, 0.5, 0.85]]);
polyline([[-0.1, 0.66, -0.35], [0, 0.7, -0.05], [0.1, 0.66, -0.35]]);

// cloisons de coque et plateformes latérales
for (const z of [-0.35, 0.05, 0.5]) {
  cuire(bloc(0.42, 0.08, 0.04), M_CORPS, m4(0, 0.52, z), { aretes: false });
}
for (const cote of [-1, 1]) {
  cuire(bloc(0.12, 0.05, 0.3), M_CORPS, m4(0.26 * cote, 0.6, 0.1), { aretes: false }); // passerelles
  cuire(bloc(0.05, 0.04, 0.2), M_ACCENT, m4(0.28 * cote, 0.64, 0.3), { aretes: false }); // rambardes (accent)
  cuire(prisme(0.03, 0.04, 0.12, 8), M_CORPS, m4(0.25 * cote, 0.44, -0.15)); // sonars latéraux
}
// trappes de pont
for (let i = 0; i < 3; i++)
  cuire(bloc(0.12, 0.03, 0.16), M_ACCENT, m4(-0.12 + i * 0.12, 0.63, 0.28 + i * 0.06), { aretes: false });

// --- trois tourelles rails jumelles (avant, milieu, arrière) ---
for (const [z, s] of [[-0.5, 1], [0.0, 1.15], [0.5, 0.9]]) {
  const y = 0.66 + 0.12 * (s - 1);
  cuire(prisme(0.1, 0.13, 0.08, 12), M_CORPS, m4(0, y, z));                       // base
  for (const cote of [-1, 1]) {
    const rail = new THREE.CylinderGeometry(0.022, 0.028, 0.34, 10, 1).rotateX(Math.PI / 2);
    cuire(rail, M_CORPS, m4(0.05 * cote, y + 0.08, z - 0.2), { aretes: false });
    const bouche = new THREE.CylinderGeometry(0.032, 0.032, 0.035, 10, 1).rotateX(Math.PI / 2);
    cuire(bouche, M_NEON, m4(0.05 * cote, y + 0.08, z - 0.38), { aretes: false });
  }
  const casemate = bloc(0.14, 0.07, 0.16);
  cuire(casemate, M_ACCENT, m4(0, y + 0.06, z), { aretes: false });
}

// --- défenses ponctuelles (petits rails latéraux) ---
for (const cote of [-1, 1]) {
  for (const z of [0.05, 0.45]) {
    const pd = new THREE.CylinderGeometry(0.018, 0.022, 0.14, 8, 1).rotateX(Math.PI / 2);
    cuire(pd, M_CORPS, m4(0.24 * cote, 0.6, z), { aretes: false });
    cuire(new THREE.OctahedronGeometry(0.02, 0), M_NEON, m4(0.24 * cote, 0.6, z - 0.1), { aretes: false });
  }
}

// --- tuyères overclockées arrière + traînées de pulses ---
cuire(bloc(0.3, 0.16, 0.2), M_CORPS, m4(0, 0.5, 1.12));                           // bloc moteur
for (const [dx, dy] of [[-0.14, 0.44], [0, 0.52], [0.14, 0.44]]) {
  const tuy = new THREE.CylinderGeometry(0.06, 0.075, 0.16, 12, 1).rotateX(Math.PI / 2);
  cuire(tuy, M_CORPS, m4(dx, dy, 1.2), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.05, 0), M_NEON, m4(dx, dy, 1.32), { aretes: false });
  // traînée de pulse en LINES
  polyline([[dx, dy, 1.36], [dx * 1.2, dy, 1.75]]);
}
// ailettes stabilisatrices
for (const cote of [-1, 1])
  cuire(bloc(0.03, 0.14, 0.26), M_CORPS, m4(0.24 * cote, 0.5, 0.98, 0, 0, -0.3 * cote));
cuire(bloc(0.03, 0.16, 0.28), M_ACCENT, m4(0, 0.68, 1.0), { aretes: false });     // aileron dorsal (accent)

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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'croiseur.glb');
writeFileSync(dest, glb);
console.log(`croiseur.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
