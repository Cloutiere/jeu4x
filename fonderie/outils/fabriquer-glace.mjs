// FABRIQUER-GLACE — FONDERIE-3D. Processus GLACE, lourd d'assaut (image_ref/legion.jpg).
// Brute cyber massive : plaques cristallines denses, épaules géantes, poings ÉNORMES,
// gladius de brèche à impulsions haute densité (fil néon + éclats glitch).
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
  let graine = 8804;
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

// ---------- construction de GLACE ----------
// Massif : largeur d'épaules ~1.5, hauteur ~2.35, empreinte large (tuile rayon 1).

// --- jambes courtes et énormes, stance large ---
for (const cote of [-1, 1]) {
  const x = 0.34 * cote;
  barre([x, 1.0, 0], [x + 0.06 * cote, 0.6, 0.04], 0.15, 0.13, M_CORPS, 16);      // cuisse
  cuire(prisme(0.14, 0.14, 0.12, 8), M_ACCENT, m4(x + 0.06 * cote, 0.56, 0.04), { aretes: false }); // genou (accent)
  barre([x + 0.06 * cote, 0.52, 0.04], [x + 0.08 * cote, 0.2, 0.02], 0.13, 0.11, M_CORPS, 16);      // tibia
  cuire(bloc(0.3, 0.14, 0.42), M_CORPS, m4(x + 0.08 * cote, 0.07, -0.04));         // Pied-cale massif
  cuire(bloc(0.22, 0.05, 0.18), M_ACCENT, m4(x + 0.08 * cote, 0.36, 0.14), { aretes: false }); // lame tibia (accent)
  cuire(bloc(0.2, 0.3, 0.07), M_CORPS, m4(x + 0.16 * cote, 0.78, 0.14), { aretes: false });   // plaque de cuisse
}
// --- bassin massif ---
cuire(prisme(0.36, 0.3, 0.26, 8), M_CORPS, m4(0, 1.14, 0));
for (const cote of [-1, 1]) {
  cuire(bloc(0.2, 0.16, 0.24), M_CORPS, m4(0.22 * cote, 1.12, 0.06, 0, 0.3 * cote, 0.12 * cote), { aretes: false }); // plaques de bassin
  cuire(bloc(0.08, 0.3, 0.24), M_CORPS, m4(0.14 * cote, 1.24, -0.2, 0.1, 0, -0.15 * cote), { aretes: false }); // abdominal
}
// --- torse en pyramide inversée (colosse) ---
cuire(prisme(0.4, 0.36, 0.3, 8), M_CORPS, m4(0, 1.4, 0));
cuire(prisme(0.46, 0.4, 0.32, 8), M_CORPS, m4(0, 1.7, 0));
cuire(bloc(0.62, 0.3, 0.44), M_CORPS, m4(0, 1.94, 0));                            // pectoraux hauts
cuire(bloc(0.66, 0.1, 0.4), M_CORPS, m4(0, 2.06, 0.02));                          // clavicules géantes
cuire(prisme(0.3, 0.22, 0.18, 8), M_CORPS, m4(0, 2.02, 0.28, 0.5));               // bosse dorsale blindée
cuire(prisme(0.14, 0.1, 0.08, 8), M_ACCENT, m4(0, 2.1, 0.16), { aretes: false }); // protège-nuque (accent)
// plaques cristallines denses (blocs anguleux posés en vrac)
for (const [x, y, z, rz, ry] of [
  [-0.14, 1.62, -0.24, 0.2, 0.1], [0.12, 1.55, -0.25, -0.25, -0.1], [0.02, 1.78, -0.26, 0.12, 0.2],
  [-0.2, 1.45, 0.22, -0.18, 0.15], [0.18, 1.5, 0.22, 0.22, -0.12]]) {
  cuire(bloc(0.24, 0.2, 0.1), M_CORPS, m4(x, y, z, 0, ry, rz), { aretes: false });
}
cuire(bloc(0.18, 0.2, 0.08), M_ACCENT, m4(0, 1.7, -0.27, 0, 0, 0.05), { aretes: false }); // écusson central (accent)
cuire(new THREE.OctahedronGeometry(0.08, 0), M_NEON, m4(0, 1.72, -0.12), { aretes: false }); // cœur néon
cuire(prisme(0.11, 0.11, 0.5, 6), M_NEON, m4(0, 1.38, 0.09), { aretes: false }); // colonne interne
// circuits dorsaux (lignes néon)
polyline([[-0.2, 1.9, 0.24], [-0.24, 1.7, 0.24], [-0.2, 1.5, 0.24]]);
polyline([[0.2, 1.9, 0.24], [0.24, 1.7, 0.24], [0.2, 1.5, 0.24]]);
polyline([[-0.1, 1.85, 0.24], [0, 1.75, 0.24], [0.1, 1.85, 0.24]]);
// --- tête minuscule enfoncée entre les épaules ---
cuire(prisme(0.11, 0.1, 0.22, 8), M_CORPS, m4(0, 2.14, 0.06));
cuire(bloc(0.18, 0.04, 0.05), M_NEON, m4(0, 2.16, -0.08), { aretes: false });     // visière émissive
cuire(bloc(0.07, 0.1, 0.14), M_ACCENT, m4(0, 2.22, 0.14), { aretes: false });     // casque (accent)
// --- pauldrons géants en strates cristallines ---
for (const cote of [-1, 1]) {
  const x = 0.62 * cote;
  cuire(bloc(0.5, 0.14, 0.42), M_CORPS, m4(x, 2.0, 0, 0, 0.15 * cote, 0.28 * cote));           // strate basse
  cuire(bloc(0.44, 0.14, 0.38), M_CORPS, m4(x - 0.02 * cote, 2.14, 0.02, 0, -0.12 * cote, 0.36 * cote)); // strate médiane
  cuire(bloc(0.34, 0.12, 0.3), M_CORPS, m4(x - 0.04 * cote, 2.27, 0.04, 0, 0.18 * cote, 0.42 * cote));   // strate haute
  cuire(bloc(0.26, 0.05, 0.24), M_ACCENT, m4(x, 2.36, 0.04, 0, 0, 0.3 * cote), { aretes: false });        // faîte (accent)
  cuire(bloc(0.24, 0.05, 0.2), M_CORPS, m4(x + 0.06 * cote, 2.06, -0.22, 0.25, 0, 0.4 * cote), { aretes: false }); // jante avant
}
// --- bras colossaux, avancés (poings au niveau des hanches) ---
for (const cote of [-1, 1]) {
  const x = 0.6 * cote;
  barre([x, 1.88, 0], [x + 0.1 * cote, 1.5, 0.08], 0.13, 0.12, M_CORPS, 12);      // bras
  barre([x + 0.1 * cote, 1.5, 0.08], [x + 0.12 * cote, 1.14, 0.04], 0.12, 0.11, M_CORPS, 12); // avant-bras
  cuire(prisme(0.13, 0.13, 0.1, 8), M_ACCENT, m4(x + 0.11 * cote, 1.48, 0.06), { aretes: false }); // coude (accent)
  cuire(bloc(0.3, 0.28, 0.3), M_CORPS, m4(x + 0.13 * cote, 0.94, 0.02));           // POING énorme
  cuire(bloc(0.22, 0.06, 0.22), M_ACCENT, m4(x + 0.13 * cote, 1.08, 0.02), { aretes: false }); // jointure (accent)
  cuire(bloc(0.16, 0.26, 0.08), M_CORPS, m4(x + 0.24 * cote, 1.66, 0.02, 0, 0, 0.15 * cote), { aretes: false }); // plaque externe
}

// --- le gladius de brèche (main droite x>0), lame large vers le bas-avant ---
{
  const hx = 0.73, hy = 0.94, hz = 0.02;
  cuire(prisme(0.045, 0.04, 0.2, 8), M_CORPS, m4(hx, hy + 0.06, hz));              // poignée
  cuire(bloc(0.3, 0.06, 0.1), M_ACCENT, m4(hx, hy - 0.07, hz), { aretes: false }); // garde massive (accent)
  // lame large : nez de prisme couché, pointe vers le bas-avant
  const lame = new THREE.CylinderGeometry(0.06, 0.005, 0.8, 12, 1).rotateX(Math.PI / 2);
  cuire(lame, M_CORPS, m4(hx + 0.06, hy - 0.5, hz - 0.14, 0.55, 0, 0), { aretes: true, seuilArete: 1 });
  // fil émissif sur les deux tranchants + pointe pulsée
  polyline([[hx - 0.07, hy - 0.16, hz - 0.06], [hx - 0.02, hy - 0.72, hz - 0.44]]);
  polyline([[hx + 0.19, hy - 0.16, hz - 0.06], [hx + 0.14, hy - 0.72, hz - 0.44]]);
  cuire(new THREE.OctahedronGeometry(0.07, 0), M_NEON, m4(hx + 0.06, hy - 0.88, hz - 0.5), { aretes: false });
  // éclats de glitch autour de la lame (petits octaèdres néon + tirets)
  for (const [dx, dy, dz, s] of [
  [-0.18, -0.68, -0.32, 0.028], [0.26, -0.3, -0.14, 0.022],[-0.14, -0.3, -0.1, 0.03], [0.2, -0.42, -0.2, 0.025], [-0.06, -0.55, -0.3, 0.035], [0.12, -0.24, -0.22, 0.02]]) {
    cuire(new THREE.OctahedronGeometry(s, 0), M_NEON, m4(hx + dx, hy + dy, hz + dz), { aretes: false });
  }
  polyline([[hx - 0.1, hy - 0.36, hz - 0.2], [hx - 0.2, hy - 0.4, hz - 0.28]]);
  polyline([[hx + 0.24, hy - 0.52, hz - 0.26], [hx + 0.34, hy - 0.58, hz - 0.34]]);
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'glace.glb');
writeFileSync(dest, glb);
console.log(`glace.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
