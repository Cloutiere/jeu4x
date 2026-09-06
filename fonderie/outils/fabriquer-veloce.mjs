// FABRIQUER-VELOCE — FONDERIE-3D. Sonde Véloce, éclaireur rapide (image_ref/cavalier.jpg).
// Pilote cyber couché vers l'avant sur une light-cycle : roues-anneaux facettées,
// carénage effilé, traînée de particules binaires et de traînées de vitesse (LINES).
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte joueur compatible).
// Convention : face avant -Z (la moto « avance » vers -Z, la traînée fuit vers +Z).

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
  let graine = 5120;
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

// ---------- construction de la Sonde Véloce ----------
// Empreinte allongée dans la tuile (longueur ~1.7, largeur ~0.4), hauteur ~1.4.

// --- roues-anneaux façon TRON (cylindres facettés 14 segments) ---
function roue(z) {
  const pneu = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 24, 1).rotateX(Math.PI / 2);
  cuire(pneu, M_CORPS, m4(0, 0.36, z), { seuilArete: 1 });                        // toutes les arêtes = jante lumineuse
  const moyeu = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8, 1).rotateX(Math.PI / 2);
  cuire(moyeu, M_CORPS, m4(0, 0.36, z), { aretes: false });
}
// rayons simplifiés (3 rayons en croix, plans YZ)
function rayons(z) {
  for (const [dy, dz] of [[0.3, 0], [-0.15, 0.26], [-0.15, -0.26]])
    polyline([[0, 0.36, z], [0, 0.36 + dy, z + dz]]);
}
roue(-0.55);
rayons(-0.55);
roue(0.55);
rayons(0.55);

// --- fourche avant + guidon ---
barre([-0.12, 0.75, -0.42], [-0.05, 0.42, -0.55], 0.035, 0.035, M_CORPS, 8);
barre([0.12, 0.75, -0.42], [0.05, 0.42, -0.55], 0.035, 0.035, M_CORPS, 8);
cuire(bloc(0.3, 0.05, 0.08), M_CORPS, m4(0, 0.78, -0.42));                       // plateau
cuire(bloc(0.34, 0.04, 0.06), M_ACCENT, m4(0, 0.82, -0.44), { aretes: false });  // guidon (accent)
for (const cote of [-1, 1]) cuire(prisme(0.035, 0.035, 0.1, 6), M_CORPS, m4(0.15 * cote, 0.84, -0.44, Math.PI / 2), { aretes: false }); // poignées
// --- carénage central effilé ---
cuire(fuseCar(0.16, 0.22, 0.42, 12), M_CORPS, m4(0, 0.62, 0.05));                 // flancs arrière
cuire(fuseCar(0.22, 0.12, 0.5, 12), M_CORPS, m4(0, 0.6, -0.3));                   // nez plongeant
cuire(prisme(0.12, 0.06, 0.14, 8), M_NEON, m4(0, 0.52, -0.6), { aretes: false }); // phare néon
cuire(bloc(0.34, 0.14, 0.3), M_CORPS, m4(0, 0.74, 0.28));                        // selle/bosse arrière
cuire(bloc(0.28, 0.05, 0.22), M_ACCENT, m4(0, 0.85, 0.32), { aretes: false });   // coque de selle (accent)
// prisme couché le long de Z pour le carénage
function fuseCar(rt, rb, longueur, seg) {
  return new THREE.CylinderGeometry(rt, rb, longueur, Math.round(seg * 2.4), 1).rotateX(-Math.PI / 2);
}
// lignes néon du carénage
polyline([[-0.14, 0.55, -0.5], [-0.17, 0.6, 0.1], [-0.15, 0.62, 0.4]]);
polyline([[0.14, 0.55, -0.5], [0.17, 0.6, 0.1], [0.15, 0.62, 0.4]]);
// plaques de carénage supplémentaires
for (const cote of [-1, 1]) {
  cuire(bloc(0.05, 0.22, 0.4), M_CORPS, m4(0.19 * cote, 0.62, 0.02), { aretes: false });  // flancs
  cuire(bloc(0.04, 0.1, 0.24), M_ACCENT, m4(0.22 * cote, 0.74, -0.08), { aretes: false }); // grilles latérales (accent)
  cuire(bloc(0.06, 0.12, 0.06), M_CORPS, m4(0.16 * cote, 0.5, 0.5), { aretes: false });   // échappements
  cuire(new THREE.OctahedronGeometry(0.03, 0), M_NEON, m4(0.16 * cote, 0.5, 0.58), { aretes: false }); // lueurs d'échappement
}
cuire(bloc(0.2, 0.08, 0.14), M_CORPS, m4(0, 0.66, -0.55), { aretes: false });   // garde-boue avant
cuire(bloc(0.16, 0.06, 0.3), M_ACCENT, m4(0, 0.72, -0.5, 0.35), { aretes: false }); // becquet avant (accent)
// réservoir
cuire(prisme(0.13, 0.17, 0.24, 8), M_CORPS, m4(0, 0.86, -0.08, 0.5));
// plaques aérodynamiques supplémentaires (capotage bas + dérives)
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.04, 0.07, 0.16), M_CORPS, m4(0.2 * cote, 0.52 + i * 0.06, 0.12 + i * 0.1), { aretes: false }); // capotage bas en marches
  cuire(bloc(0.03, 0.16, 0.2), M_ACCENT, m4(0.21 * cote, 0.68, 0.36, -0.3, 0, 0), { aretes: false }); // dérives arrière (accent)
  cuire(bloc(0.05, 0.14, 0.05), M_CORPS, m4(0.1 * cote, 0.98, -0.24), { aretes: false });  // tour de cou
}
// cadre visible sous le pilote
barre([-0.1, 0.6, 0.3], [-0.06, 0.5, -0.4], 0.03, 0.03, M_CORPS, 8);
barre([0.1, 0.6, 0.3], [0.06, 0.5, -0.4], 0.03, 0.03, M_CORPS, 8);
barre([-0.1, 0.6, 0.3], [0.1, 0.6, 0.3], 0.03, 0.03, M_CORPS, 8);

// --- pilote : assis au tiers avant, penché sur le réservoir ---
// jambes repliées : hanche -> genou -> repose-pied
for (const cote of [-1, 1]) {
  const x = 0.14 * cote;
  barre([x, 0.94, 0.12], [x + 0.03 * cote, 0.78, -0.1], 0.06, 0.055, M_CORPS, 16);  // cuisse
  barre([x + 0.03 * cote, 0.78, -0.1], [x + 0.02 * cote, 0.5, 0.08], 0.05, 0.045, M_CORPS, 16); // tibia
  cuire(bloc(0.1, 0.06, 0.18), M_CORPS, m4(x + 0.02 * cote, 0.48, 0.14));           // pied sur le repose-pied
  cuire(bloc(0.06, 0.16, 0.05), M_ACCENT, m4(x, 1.18, 0.14), { aretes: false });    // Protectorat de hanche (accent)
}
// torse couché vers l'avant
cuire(prisme(0.14, 0.17, 0.4, 12), M_CORPS, m4(0, 1.14, 0.06, 1.0));              // torse incliné
cuire(bloc(0.24, 0.1, 0.22), M_ACCENT, m4(0, 1.26, -0.06, 1.0), { aretes: false }); // dos blindé (accent)
cuire(bloc(0.2, 0.08, 0.14), M_CORPS, m4(0, 1.18, 0.22, 1.0), { aretes: false }); // bas du dos
// bras vers le guidon
barre([-0.12, 1.28, -0.04], [-0.14, 1.0, -0.34], 0.045, 0.04, M_CORPS, 8);
barre([0.12, 1.28, -0.04], [0.14, 1.0, -0.34], 0.045, 0.04, M_CORPS, 8);
cuire(bloc(0.09, 0.08, 0.09), M_CORPS, m4(-0.15, 0.92, -0.4));                   // moufles
cuire(bloc(0.09, 0.08, 0.09), M_CORPS, m4(0.15, 0.92, -0.4));
// casque aérodynamique avec visière
cuire(prisme(0.1, 0.12, 0.24, 10), M_CORPS, m4(0, 1.42, -0.16, 1.0));
cuire(bloc(0.14, 0.035, 0.05), M_NEON, m4(0, 1.4, -0.28, 1.0), { aretes: false }); // visière émissive
cuire(bloc(0.04, 0.06, 0.16), M_ACCENT, m4(0, 1.52, -0.08, 1.0), { aretes: false }); // crête (accent)

// --- traînée de vitesse derrière (+Z) : traînées + particules binaires (LINES) ---
let graine = 909;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 12; i++) {
  const y = 0.3 + alea() * 0.6;
  const x = (alea() - 0.5) * 0.5 * (y / 0.9);
  const z0 = 0.85 + alea() * 0.35;
  const long = 0.35 + alea() * 0.75;
  polyline([[x, y, z0], [x * 1.3, y, z0 + long]]);
}
// stries collées aux roues (sens de course)
polyline([[-0.2, 0.36, 0.75], [-0.24, 0.36, 1.6]]);
polyline([[0.2, 0.36, 0.75], [0.24, 0.36, 1.6]]);

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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'veloce.glb');
writeFileSync(dest, glb);
console.log(`veloce.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
