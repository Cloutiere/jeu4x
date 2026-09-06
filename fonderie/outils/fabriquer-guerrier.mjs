// FABRIQUER-GUERRIER — FONDERIE-3D, mission T2.
// Construit le Guerrier en vraie géométrie de mesh facettée (hard-surface)
// et exporte ../modeles/guerrier.glb (origine au sol, Y-up, face -Z).
// Style : STYLE-3D.md — corps translucide #1C2E3C, néon #3DFFCE,
// arêtes néon en lignes, glyphes binaires en texture émissive, claque accent joueur.

import * as THREE from '../lib/three.module.min.js';
import { encoderPNG, construireGLB } from './glb.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NEON = new THREE.Color('#3DFFCE');
const CORPS = new THREE.Color('#1C2E3C');

// ---------- atelier de géométrie ----------
const tris = [];   // { positions, normals, uvs?, material }
const lignes = []; // { positions, material: M_NEON }
const M_CORPS = 0, M_NEON = 1, M_ACCENT = 2;

function cuire(geo, mat, mat4, { aretes = true, seuilArete = 24 } = {}) {
  const g = mat4 ? geo.clone().applyMatrix4(mat4) : geo;
  const ni = g.index ? g.toNonIndexed() : g;
  ni.computeVertexNormals(); // normales plates => facettage net
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

// Prisme facetté (le bloc de base du style : cylindre à faible segmentage, ombre plate)
const prisme = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, Math.round(seg * 2.4)); // facettage fin
const bloc = (l, h, p) => new THREE.BoxGeometry(l, h, p);

// ---------- texture des glyphes binaires (émissive, 256²) ----------
function textureGlyphes() {
  const T = 256, px = new Uint8Array(T * T * 4);
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    px[i] = 0; px[i + 1] = Math.round(NEON.g * 255) * v; px[i + 2] = Math.round(NEON.b * 255) * v; px[i + 3] = 255;
  };
  // motif « 0/1 » en blocs 3x5 + tirets de code
  const chiffre = (x0, y0, c) => {
    const carres = c === '0'
      ? [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [0, 4], [1, 4], [2, 4]]
      : [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
    for (const [dx, dy] of carres) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) set(x0 + dx * 2 + a, y0 + dy * 2 + b, 1);
  };
  let graine = 42;
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let ligne = 0; ligne < 9; ligne++) {
    const y = 6 + ligne * 28 + ((alea() * 4) | 0);
    let x = 6 + ((alea() * 14) | 0);
    const n = 4 + ((alea() * 7) | 0);
    for (let k = 0; k < n; k++) {
      if (alea() < 0.16) { for (let d = 0; d < 10; d++) set(x + d, y + 2, 1); x += 14; } // tiret de code
      else { chiffre(x, y, alea() < 0.5 ? '0' : '1'); x += 10; }
      if (x > T - 12) break;
    }
  }
  return encoderPNG(T, T, Buffer.from(px));
}

// ---------- construction du Guerrier ----------
// Silhouette humanoïde, hauteur ~1.85, face -Z, centré sur l'origine au sol.

// --- jambes (x = ±0.19) ---
for (const cote of [-1, 1]) {
  const x = 0.19 * cote;
  cuire(prisme(0.115, 0.095, 0.36, 10), M_CORPS, m4(x, 1.06, 0));                       // cuisse
  cuire(bloc(0.2, 0.1, 0.2), M_ACCENT, m4(x, 0.86, 0), { aretes: false });              // genou (accent)
  cuire(prisme(0.085, 0.07, 0.34, 10), M_CORPS, m4(x, 0.55, 0));                        // tibia
  cuire(prisme(0.075, 0.09, 0.1, 10), M_CORPS, m4(x, 0.36, 0));                         // cheville
  cuire(bloc(0.19, 0.1, 0.34), M_CORPS, m4(x, 0.05, -0.05));                            // pied-cale
  cuire(bloc(0.21, 0.05, 0.16), M_ACCENT, m4(x, 0.5, 0.09), { aretes: false });         // lame de tibia (accent)
}
// --- bassin ---
cuire(prisme(0.24, 0.19, 0.24, 8), M_CORPS, m4(0, 1.32, 0));
// --- torse : plastronne facettée en plaques superposées ---
cuire(prisme(0.3, 0.24, 0.3, 8), M_CORPS, m4(0, 1.6, 0));            // abdomen
cuire(prisme(0.34, 0.3, 0.32, 8), M_CORPS, m4(0, 1.9, -0.01));       // cage
cuire(bloc(0.5, 0.3, 0.36), M_CORPS, m4(0, 2.12, -0.01));            // plastron haut
cuire(bloc(0.34, 0.16, 0.3), M_CORPS, m4(0, 2.3, -0.02));            // clavicules
cuire(bloc(0.22, 0.18, 0.1), M_ACCENT, m4(0, 1.95, -0.2), { aretes: false }); // écusson pectoral (accent)
cuire(prisme(0.26, 0.22, 0.1, 8), M_CORPS, m4(0, 2.42, -0.01));               // collerette
// --- cœur néon + structure interne (visibles À TRAVERS le corps translucide) ---
cuire(new THREE.OctahedronGeometry(0.09, 0), M_NEON, m4(0, 1.92, -0.1), { aretes: false });
cuire(prisme(0.12, 0.12, 0.5, 6), M_NEON, m4(0, 1.6, 0.08), { aretes: false });       // colonne
cuire(new THREE.OctahedronGeometry(0.05, 0), M_NEON, m4(0, 2.32, -0.02), { aretes: false });
// --- épaulières (2 plaques superposées, accent sur la supérieure) ---
for (const cote of [-1, 1]) {
  const x = 0.42 * cote;
  cuire(prisme(0.17, 0.13, 0.18, 8), M_CORPS, m4(x, 2.22, 0, 0, 0, 0.2 * cote));
  cuire(prisme(0.15, 0.1, 0.12, 8), M_ACCENT, m4(x, 2.34, 0, 0, 0, 0.25 * cote));
  // --- bras ---
  cuire(prisme(0.075, 0.065, 0.34, 8), M_CORPS, m4(x, 1.95, 0));
  cuire(prisme(0.065, 0.06, 0.1, 8), M_ACCENT, m4(x, 1.74, 0), { aretes: false });    // coude
  cuire(prisme(0.07, 0.06, 0.3, 8), M_CORPS, m4(x, 1.54, 0.02));
  cuire(bloc(0.13, 0.18, 0.13), M_CORPS, m4(x, 1.32, 0.02));                          // moufle
}
// --- casque à visière (le pattern du style) ---
cuire(prisme(0.17, 0.14, 0.3, 8), M_CORPS, m4(0, 2.55, -0.01));
cuire(prisme(0.15, 0.17, 0.06, 8), M_CORPS, m4(0, 2.71, -0.01));                     // crête support
cuire(bloc(0.26, 0.055, 0.1), M_NEON, m4(0, 2.57, -0.16), { aretes: false });        // visière émissive
cuire(bloc(0.06, 0.16, 0.2), M_ACCENT, m4(0, 2.62, 0.06), { aretes: false });        // crête (accent)
// --- jupe de plaques bassin ---
for (const [dx, dz, ry] of [[-0.2, 0, Math.PI / 2], [0.2, 0, Math.PI / 2], [0, -0.18, 0]]) {
  cuire(bloc(0.16, 0.24, 0.05), M_CORPS, m4(dx, 1.2, dz, 0, ry, 0));
}
// --- plaques de protection supplémentaires (plastron, dos, membres) ---
for (let i = 0; i < 3; i++)
  cuire(bloc(0.34 - i * 0.06, 0.12, 0.06), M_CORPS, m4(0, 2.02 - i * 0.17, -0.2 - i * 0.015), { aretes: false }); // plastron avant
for (let i = 0; i < 3; i++)
  cuire(bloc(0.3 - i * 0.05, 0.11, 0.05), M_CORPS, m4(0, 2.02 - i * 0.17, 0.2), { aretes: false });               // épine dorsale
cuire(prisme(0.09, 0.12, 0.26, 8), M_CORPS, m4(0, 2.14, 0.24));                                    // propulseur dorsal
for (const cote of [-1, 1]) {
  cuire(bloc(0.05, 0.22, 0.12), M_CORPS, m4(0.17 * cote, 2.16, 0.27, 0, 0, 0.35 * cote));          // ailettes dorsales
  cuire(bloc(0.1, 0.26, 0.06), M_ACCENT, m4(0.31 * cote, 1.98, 0.08, 0, 0, 0.12 * cote), { aretes: false }); // garde-épaule
  cuire(bloc(0.12, 0.3, 0.05), M_ACCENT, m4(0.28 * cote, 1.02, 0.12), { aretes: false });          // plaque de cuisse
  cuire(bloc(0.11, 0.26, 0.05), M_CORPS, m4(0.2 * cote, 0.58, 0.14), { aretes: false });           // garde-tibia
  cuire(bloc(0.14, 0.06, 0.14), M_CORPS, m4(0.26 * cote, 1.7, 0, 0, 0, 0), { aretes: false });     // spline de coude
}
for (const [dx, dz, ry] of [[0, 0.16, 0], [-0.26, -0.06, Math.PI / 2], [0.26, -0.06, Math.PI / 2], [-0.1, -0.2, 0.4], [0.1, -0.2, -0.4]]) {
  cuire(bloc(0.14, 0.2, 0.05), M_CORPS, m4(dx, 1.16, dz, 0, ry, 0));                               // jupe complète
}
for (let i = 0; i < 3; i++)
  cuire(bloc(0.06, 0.16, 0.04), M_ACCENT, m4(-0.1 + i * 0.1, 2.0, -0.235), { aretes: false });     // évents pectoraux

// --- épée : lame à fil émissif, tenue pointe vers le bas (main droite x=+0.42) ---
{
  const x = 0.46, z = 0.12;
  cuire(prisme(0.035, 0.03, 0.16, 8), M_CORPS, m4(x, 1.24, z));                    // poignée
  cuire(bloc(0.24, 0.05, 0.08), M_ACCENT, m4(x, 1.14, z), { aretes: false });      // garde (accent)
  cuire(prisme(0.055, 0.012, 0.66, 4), M_NEON, m4(x, 0.78, z), { aretes: true, seuilArete: 1 }); // lame néon
  // fil émissif sur le tranchant
  const f = [];
  for (const [a, b] of [[-0.12, 1.1], [-0.12, 0.47], [0.12, 0.47], [0.12, 1.1], [-0.12, 1.1]])
    f.push(x + a, b, z);
  lignes.push({ positions: new Float32Array(f), material: M_NEON });
}

// ---------- assemblage & comptage honnête ----------
const prims = [
  ...tris.map(t => ({ mode: 'TRIANGLES', positions: t.positions, normals: t.normals, uvs: t.uvs, material: t.material })),
  ...lignes.map(l => ({ mode: 'LINES', positions: l.positions, material: l.material })),
];
const trisTotal = tris.reduce((s, t) => s + t.positions.length / 9, 0);

const materiaux = [
  { // 0 — corps translucide teinté, glyphes binaires en texture émissive
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
  { // 1 — néon pur (intensité > 1 pour déclencher le bloom)
    name: 'neon',
    pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
    emissiveFactor: [NEON.r, NEON.g, NEON.b],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3.5 } },
  },
  { // 2 — accent joueur (teinté par le visualiseur : J1/J2)
    name: 'accent_joueur',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.45 },
    emissiveFactor: [0.05, 0.05, 0.05],
  },
];

const glb = construireGLB({
  primitives: prims, materiaux, image: textureGlyphes(),
  extensionsUtilisees: ['KHR_materials_emissive_strength'],
});
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'guerrier.glb');
writeFileSync(dest, glb);
const extensionsUsed = undefined; // emissiveStrength non requis (facteur <= 1 géré nativement)
console.log(`guerrier.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} (cible 2 500-4 000, plafond 5 000)`);
console.log(`Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
console.log(`Bornes : voir le visualiseur (origine au sol, Y-up, face -Z)`);
