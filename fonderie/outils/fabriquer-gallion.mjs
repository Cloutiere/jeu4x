// FABRIQUER-GALLION — FONDERIE-3D. Routeur Optique, transporteur lourd de profondeur
// (image_ref/gallion.jpg + gallion.txt). Coque multi-niveaux renforcée, voiles
// fibre-optique en arcs néon au-dessus du pont (LINES — 0 triangle), dérives
// optiques directionnelles, cales de paquets de données illuminées. Face -Z.
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
  let graine = 8008;
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

// ---------- construction du Routeur Optique ----------
// Long ~2.3 le long de Z (proue -Z), large ~0.9, hauteur ~1.5 avec les voiles.

// --- coque inférieure (quille) ---
cuire(bloc(0.34, 0.2, 1.7), M_CORPS, m4(0, 0.32, 0.05));                          // quille renforcée
cuire(bloc(0.26, 0.1, 0.5), M_CORPS, m4(0, 0.24, -0.7, 0.35));                    // proue basse
// --- pont principal (tous niveaux) ---
cuire(fuse(0.26, 0.3, 0.7, 32), M_CORPS, m4(0, 0.55, -0.35));                     // gaillard avant
cuire(fuse(0.3, 0.26, 0.8, 32), M_CORPS, m4(0, 0.55, 0.45));                      // pont central
cuire(bloc(0.42, 0.16, 0.5), M_CORPS, m4(0, 0.56, 0.95));                         // château arrière
// proue : éperon facetté
cuire(fuse(0.16, 0.03, 0.4, 14), M_CORPS, m4(0, 0.55, -0.85));
cuire(prisme(0.04, 0.015, 0.1, 8), M_NEON, m4(0, 0.55, -1.08, Math.PI / 2), { aretes: false }); // éperon néon
// --- cales ouvertes à paquets de données (2 bays avec pods illuminés) ---
for (const [z, n] of [[-0.05, 3], [0.55, 2]]) {
  for (let i = 0; i < n; i++) {
    const pz = z + i * 0.24;
    const pod = new THREE.BoxGeometry(0.18, 0.14, 0.18);
    cuire(pod, M_ACCENT, m4(0, 0.62, pz), { aretes: false });
    const noyau = new THREE.OctahedronGeometry(0.035, 0);
    cuire(noyau, M_NEON, m4(0, 0.62, pz), { aretes: false });
  }
  // montants du bay
  for (const cote of [-1, 1]) {
    cuire(bloc(0.04, 0.22, 0.05), M_CORPS, m4(0.16 * cote, 0.62, z - 0.08), { aretes: false });
    cuire(bloc(0.04, 0.22, 0.05), M_CORPS, m4(0.16 * cote, 0.62, z + (n - 1) * 0.24 + 0.08), { aretes: false });
  }
}
// --- dérives optiques directionnelles (arrière, en éventail) ---
for (const [rz, ry] of [[-0.5, -0.3], [-0.5, 0.3], [-0.5, 0]]) {
  cuire(bloc(0.03, 0.16, 0.34), M_ACCENT, m4(0, 0.78, 1.0, 0.3, ry, rz), { aretes: false });
}
for (const cote of [-1, 1]) {
  cuire(bloc(0.03, 0.14, 0.3), M_ACCENT, m4(0.24 * cote, 0.8, 1.05, 0.3, 0.5 * cote, 0.4 * cote), { aretes: false });
}
// tourelle principale haute (batterie de routeur)
cuire(prisme(0.2, 0.24, 0.16, 20), M_CORPS, m4(0, 0.92, 0.15));
for (const cote of [-1, 1]) {
  const rail = new THREE.CylinderGeometry(0.03, 0.035, 0.5, 10, 1).rotateX(Math.PI / 2);
  cuire(rail, M_CORPS, m4(0.09 * cote, 0.98, -0.2), { aretes: false });
  const bouche = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12, 1).rotateX(Math.PI / 2);
  cuire(bouche, M_NEON, m4(0.09 * cote, 0.98, -0.46), { aretes: false });
}
// --- passerelle et tourelle de conduite avant ---
cuire(bloc(0.24, 0.08, 0.2), M_CORPS, m4(0, 0.76, -0.5));
cuire(bloc(0.1, 0.04, 0.04), M_NEON, m4(0, 0.8, -0.6), { aretes: false });        // visière de passerelle

// passerelle haute et blockhaus secondaire
cuire(bloc(0.3, 0.08, 0.34), M_CORPS, m4(0, 0.86, 0.62));
cuire(bloc(0.2, 0.05, 0.16), M_ACCENT, m4(0, 0.92, 0.62), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.06, 0.1, 0.3), M_CORPS, m4(0.13 * cote, 0.9, 0.55), { aretes: false });
// cloisons transversales et bastingages
for (const z of [-0.45, -0.1, 0.25, 0.6]) {
  cuire(bloc(0.44, 0.1, 0.04), M_CORPS, m4(0, 0.6, z), { aretes: false });
}
for (const cote of [-1, 1]) {
  cuire(bloc(0.05, 0.06, 1.2), M_ACCENT, m4(0.22 * cote, 0.64, 0.2), { aretes: false }); // bastingage (accent)
  cuire(bloc(0.1, 0.08, 0.24), M_CORPS, m4(0.24 * cote, 0.5, -0.4), { aretes: false });  // blinkers avant
  cuire(prisme(0.04, 0.05, 0.16, 8), M_CORPS, m4(0.26 * cote, 0.44, 0.9));               //OW pare-battage
}
// châssis intermédiaire (plateau renforcé entre quille et pont)
for (let i = 0; i < 6; i++)
  cuire(bloc(0.4, 0.04, 0.18), M_CORPS, m4(0, 0.4, -0.75 + i * 0.3), { aretes: false });
for (const cote of [-1, 1])
  cuire(bloc(0.03, 0.05, 1.6), M_NEON, m4(0.23 * cote, 0.42, 0.1), { aretes: false });
// tourelle optique dorsale arrière
cuire(prisme(0.11, 0.13, 0.08, 16), M_CORPS, m4(0, 0.78, 0.7));
cuire(bloc(0.1, 0.03, 0.05), M_NEON, m4(0, 0.82, 0.62), { aretes: false }, );
// passerelle secondaire
cuire(bloc(0.2, 0.06, 0.24), M_CORPS, m4(0, 0.7, -0.45), { aretes: false });
// second niveau de pont (batterie de pods supplémentaires)
cuire(bloc(0.34, 0.1, 0.9), M_CORPS, m4(0, 0.72, 0.3));
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.05, 0.06, 0.2), M_ACCENT, m4(0.14 * cote, 0.78, 0.0 + i * 0.3), { aretes: false });
  cuire(bloc(0.08, 0.06, 0.5), M_CORPS, m4(0.18 * cote, 0.76, 0.15), { aretes: false });
}
// sponsons latéraux de pods (niveau bas)
for (const cote of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    const pod = new THREE.BoxGeometry(0.1, 0.1, 0.16);
    cuire(pod, M_ACCENT, m4(0.3 * cote, 0.52, -0.35 + i * 0.3), { aretes: false });
    const n2 = new THREE.OctahedronGeometry(0.025, 0);
    cuire(n2, M_NEON, m4(0.3 * cote, 0.52, -0.35 + i * 0.3), { aretes: false });
  }
  cuire(bloc(0.04, 0.08, 1.3), M_CORPS, m4(0.36 * cote, 0.52, 0.1), { aretes: false });
}
// gouvernail et stabilisateurs
cuire(bloc(0.04, 0.3, 0.26), M_CORPS, m4(0, 0.42, 1.15));
for (const cote of [-1, 1]) {
  const st = new THREE.CylinderGeometry(0.04, 0.05, 0.3, 14, 1).rotateX(Math.PI / 2);
  cuire(st, M_CORPS, m4(0.2 * cote, 0.36, 1.15), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(0.2 * cote, 0.36, 1.32), { aretes: false });
}
// --- voiles fibre-optique : grands arcs au-dessus du pont (LINES — 0 triangle) ---
for (let k = 0; k < 3; k++) {
  const off = (k - 1) * 0.12;                       // écart latéral
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;                               // 0 = proue, 1 = poupe
    const z = -0.85 + t * 1.95;
    const y = 0.78 + 0.62 * Math.sin(t * Math.PI) - off * 0.3 * Math.sin(t * Math.PI);
    const x = off * (0.4 + 0.6 * Math.sin(t * Math.PI));
    pts.push([x, y, z]);
  }
  polyline(pts);
}
// arcs secondaires (miroir, plus bas)
for (let k = 0; k < 2; k++) {
  const off = (k - 0.5) * 0.14;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const z = -0.6 + t * 1.5;
    const y = 0.78 + 0.45 * Math.sin(t * Math.PI);
    const x = off * (0.3 + 0.7 * Math.sin(t * Math.PI));
    pts.push([x, y, z]);
  }
  polyline(pts);
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'gallion.glb');
writeFileSync(dest, glb);
console.log(`gallion.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
