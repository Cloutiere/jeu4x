// FABRIQUER-BOMBARDIER — FONDERIE-3D. Bombardier Mémétique, bombardier stratégique
// lourd (image_ref/bombardier.jpg + bombardier.txt). Aile volante furtive au
// planform en chevron (ExtrudeGeometry), soute ventrale ouverte larguant des
// **ogives mémétiques** : étoiles néon (octaèdre + rayons LINES) avec traînées.
// Style : STYLE-3D.md — mêmes 3 matériaux que les autres unités (teinte compatible).
// Face -Z = nez de l'aile.

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
const bloc = (l, h, p, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(l, h, p, sx, sy, sz);

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
  let graine = 31415;
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

// ---------- construction du Bombardier ----------
// Aile volante : envergure ~2.1, longueur ~1.5, vol à ~0.72 (soute ouverte dessous).

// --- planform de l'aile volante : profil en W extrudé ---
{
  const forme = new THREE.Shape();
  forme.moveTo(0, -0.85);            // nez (proue -Z -> mappé sur l'axe extrudé)
  forme.lineTo(0.16, -0.7);
  forme.lineTo(0.98, 0.18);          // bord d'attaque droit
  forme.lineTo(1.04, 0.3);           // pointe d'aile droite
  forme.lineTo(0.55, 0.36);
  forme.lineTo(0.3, 0.62);           // rentrée arrière droite
  forme.lineTo(0.14, 0.6);
  forme.lineTo(0, 0.72);             // queue centrale
  forme.lineTo(-0.14, 0.6);
  forme.lineTo(-0.3, 0.62);
  forme.lineTo(-0.55, 0.36);
  forme.lineTo(-1.04, 0.3);          // pointe d'aile gauche
  forme.lineTo(-0.98, 0.18);
  forme.lineTo(-0.16, -0.7);
  forme.closePath();
  const geo = new THREE.ExtrudeGeometry(forme, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);         // le profil XY devient le plan XZ (extrusion vers -Y)
  geo.translate(0, 0.76, 0);         // pose à l'altitude de vol
  cuire(geo, M_CORPS, null, { seuilArete: 40 });
}

// --- fuselage dorsal (bosse centrale) + verrière ---
cuire(prisme(0.09, 0.13, 0.5, 12), M_CORPS, m4(0, 0.84, 0.05, Math.PI / 2));
cuire(bloc(0.12, 0.03, 0.12), M_NEON, m4(0, 0.84, -0.3), { aretes: false });     // verrière néon
cuire(bloc(0.14, 0.05, 0.22), M_ACCENT, m4(0, 0.9, 0.3), { aretes: false });     // crête dorsale (accent)
// échappements flush arrière
for (const cote of [-1, 1]) {
  const ech = new THREE.CylinderGeometry(0.045, 0.055, 0.16, 12, 1).rotateX(Math.PI / 2);
  cuire(ech, M_CORPS, m4(0.13 * cote, 0.78, 0.62), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(0.13 * cote, 0.78, 0.72), { aretes: false });
}

// --- panneaux de pont segmentés (dessus des ailes) ---
for (const cote of [-1, 1]) {
  for (let i = 0; i < 5; i++) {
    const w = 0.34 + i * 0.13, z = -0.42 + i * 0.28;
    cuire(bloc(w, 0.02, 0.2, 4, 1, 2), M_CORPS, m4(0.42 * cote + 0.06 * cote * i, 0.84, z), { aretes: false });
  }
  cuire(bloc(0.5, 0.02, 0.06), M_ACCENT, m4(0.55 * cote, 0.86, 0.28, 0, -0.5 * cote, 0), { aretes: false }); // bord d'attaque lumineux (accent)
}

// panneaux segmentés du dessus (grille d'aile gauche et droite)
for (const cote of [-1, 1]) {
  let cw = 0.3;
  for (let i = 0; i < 8; i++) {
    const px = (0.24 + i * 0.11) * cote;
    const pz = -0.5 + i * 0.24;
    cuire(bloc(cw, 0.02, 0.3, 6, 1, 3), M_CORPS, m4(px, 0.845, pz), { aretes: false });
    cw += 0.1;
  }
}
// --- soute ventrale ouverte + rails ---
cuire(bloc(0.24, 0.05, 0.6), M_CORPS, m4(0, 0.66, 0.1), { aretes: false });
cuire(bloc(0.16, 0.02, 0.45), M_ACCENT, m4(0, 0.63, 0.1), { aretes: false });    // rail interne (accent)
for (const cote of [-1, 1])
  cuire(bloc(0.03, 0.06, 0.5), M_CORPS, m4(0.11 * cote, 0.68, 0.1), { aretes: false }); // lèvres

// nacelles moteur encastrées (bord de fuite arrière)
for (const cote of [-1, 1]) {
  const nac = new THREE.CylinderGeometry(0.07, 0.09, 0.34, 18, 1).rotateX(Math.PI / 2);
  cuire(nac, M_CORPS, m4(0.28 * cote, 0.76, 0.52), { aretes: false });
  const lueur = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12, 1).rotateX(Math.PI / 2);
  cuire(lueur, M_NEON, m4(0.28 * cote, 0.76, 0.68), { aretes: false });
}
// bodegaies arrière et points d'emport
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.12, 0.03, 0.14), M_ACCENT, m4((0.35 + i * 0.16) * cote, 0.83, 0.42 - i * 0.05, 0, -0.5 * cote, 0), { aretes: false });
}

// dessous : trappes de soute et carénages
for (const cote of [-1, 1]) {
  cuire(bloc(0.2, 0.03, 0.5), M_CORPS, m4(0.22 * cote, 0.66, 0.2), { aretes: false });
  cuire(bloc(0.1, 0.05, 0.2), M_ACCENT, m4(0.3 * cote, 0.64, 0.55), { aretes: false });
}
cuire(bloc(0.3, 0.04, 0.2), M_CORPS, m4(0, 0.66, 0.55), { aretes: false });

// --- ogives mémétiques larguées (étoiles néon en dessous) ---
let graine = 20461;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function ogive(ox, oy, oz, r) {
  cuire(new THREE.OctahedronGeometry(r, 0), M_NEON, m4(ox, oy, oz), { aretes: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    polyline([
      [ox, oy, oz],
      [ox + r * 2.2 * Math.cos(a), oy + r * 2.2 * Math.sin(a) * 0.7, oz + r * Math.sin(a * 2)]]);
  }
}
for (let i = 0; i < 6; i++) {
  const ox = (alea() - 0.5) * 0.8;
  const oz = -0.3 + alea() * 0.7;
  const oy = 0.38 - i * 0.16 - alea() * 0.12;
  ogive(ox, oy, oz, 0.035 + alea() * 0.015);
  polyline([[ox, oy + 0.07, oz], [ox * 0.7, oy + 0.35, oz - 0.05], [0, 0.6, oz - 0.12]]);
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'bombardier.glb');
writeFileSync(dest, glb);
console.log(`bombardier.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
