// FABRIQUER-CHASSEUR — FONDERIE-3D. Drone Intercepteur, chasseur de supériorité
// (image_ref/chasseur.jpg + chasseur.txt). Chasseur effilé : nez aigu, ailes en
// flèche, double dérive, pods de missiles ventraux à énergie chargée, tuyères à
// traînées de données. Style : STYLE-3D.md — mêmes 3 matériaux (teinte compatible).
// Face -Z = nez.

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
  let graine = 18181;
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

// ---------- construction du Chasseur ----------
// Long ~2.2 le long de Z (nez -Z), envergure ~1.7, hauteur ~0.7.

// --- fuselage : nez aigu -> corps -> queue ---
cuire(fuse(0.02, 0.13, 0.55, 34), M_CORPS, m4(0, 0.52, -0.75));                  // nez aigu
cuire(fuse(0.13, 0.17, 0.6, 34), M_CORPS, m4(0, 0.52, -0.25));                   // section cockpit
cuire(fuse(0.17, 0.15, 0.65, 34), M_CORPS, m4(0, 0.52, 0.35));                   // section centrale
cuire(fuse(0.15, 0.1, 0.4, 34), M_CORPS, m4(0, 0.52, 0.9));                      // queue
// verrière de cockpit (accent)
const verriere = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 18, 1).rotateX(Math.PI / 2);
cuire(verriere, M_ACCENT, m4(0, 0.62, -0.32));
cuire(bloc(0.1, 0.02, 0.08), M_NEON, m4(0, 0.64, -0.44), { aretes: false });     // cadre de verrière néon
// épine dorsale
cuire(bloc(0.08, 0.07, 0.8), M_CORPS, m4(0, 0.68, 0.25));
cuire(bloc(0.05, 0.04, 0.3), M_ACCENT, m4(0, 0.72, 0.3), { aretes: false });     // dorsale (accent)

// --- prises d'air latérales ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.1, 0.12, 0.4), M_CORPS, m4(0.18 * cote, 0.46, -0.05), { aretes: false });
  cuire(bloc(0.02, 0.06, 0.3), M_ACCENT, m4(0.235 * cote, 0.44, -0.02), { aretes: false }); // lèvres d'entrée (accent)
}

// --- ailes en flèche ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.72, 0.04, 0.42), M_CORPS, m4(0.36 * cote, 0.5, 0.32, 0, -0.55 * cote, 0));
  cuire(bloc(0.5, 0.02, 0.16), M_CORPS, m4(0.5 * cote, 0.5, 0.62, 0, -0.85 * cote, 0)); // panneaux externes
  cuire(bloc(0.44, 0.015, 0.04), M_NEON, m4(0.42 * cote, 0.52, 0.16, 0, -0.5 * cote, 0), { aretes: false }); // bord d'attaque néon
  cuire(bloc(0.36, 0.015, 0.05), M_ACCENT, m4(0.48 * cote, 0.49, 0.6, 0, -0.8 * cote, 0), { aretes: false }); // bord de fuite (accent)
}

// panneaux d'aile segmentés (dessus) + trappes
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.3 - i * 0.06, 0.015, 0.24), M_CORPS, m4((0.3 + i * 0.12) * cote, 0.52, 0.25 + i * 0.1, 0, -0.55 * cote, 0), { aretes: false });
  cuire(bloc(0.08, 0.03, 0.14), M_ACCENT, m4(0.3 * cote, 0.53, 0.42, 0, -0.55 * cote, 0), { aretes: false });
}

// --- dérives (2 verticales inclinées + 2 horizontales) ---
for (const cote of [-1, 1]) {
  cuire(bloc(0.03, 0.24, 0.26), M_CORPS, m4(0.12 * cote, 0.74, 0.78, 0, 0, -0.45 * cote));
  cuire(bloc(0.02, 0.1, 0.2), M_ACCENT, m4(0.12 * cote, 0.88, 0.8, 0, 0, -0.45 * cote), { aretes: false }); // pointes (accent)
  cuire(bloc(0.24, 0.02, 0.2), M_CORPS, m4(0.16 * cote, 0.56, 0.92, 0, 0, -0.3 * cote)); // empennage horizontal
}

// intakes supérieurs et antennes
for (const cote of [-1, 1]) {
  cuire(bloc(0.06, 0.04, 0.26), M_CORPS, m4(0.1 * cote, 0.64, -0.1), { aretes: false });
  cuire(prisme(0.012, 0.012, 0.2, 6), M_CORPS, m4(0.08 * cote, 0.72, 0.5, 0.3 * cote), { aretes: false });
}
// --- tuyères jumelles + traînées de données ---
for (const cote of [-1, 1]) {
  const x = 0.13 * cote;
  const tuy = new THREE.CylinderGeometry(0.075, 0.09, 0.2, 14, 1).rotateX(Math.PI / 2);
  cuire(tuy, M_CORPS, m4(x, 0.52, 1.05), { aretes: false });
  const col = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12, 1).rotateX(Math.PI / 2);
  cuire(col, M_NEON, m4(x, 0.52, 1.16), { aretes: false });
  // traînée de données (LINES)
  polyline([
    [x, 0.52, 1.24], [x * 1.3, 0.53, 1.6], [x * 0.8, 0.51, 1.9],
    [x * 1.4, 0.54, 2.2], [x, 0.52, 2.5]]);
}

// trappes et details de fuselage
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.05, 0.02, 0.16), M_ACCENT, m4((0.08 + i * 0.06) * cote, 0.63, 0.15 + i * 0.02), { aretes: false });
}

// canons de nez (2 canons jumeaux)
for (const cote of [-1, 1]) {
  const g = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8, 1).rotateX(Math.PI / 2);
  cuire(g, M_CORPS, m4(0.035 * cote, 0.48, -0.82), { aretes: false });
}

// --- pods de missiles ventraux à énergie chargée ---
for (const cote of [-1, 1]) {
  const x = 0.26 * cote;
  const pod = fuse(0.05, 0.06, 0.44, 18);
  cuire(pod, M_CORPS, m4(x, 0.44, 0.42));
  const ogive = new THREE.ConeGeometry(0.05, 0.12, 10, 1).rotateX(-Math.PI / 2);
  cuire(ogive, M_ACCENT, m4(x, 0.44, -0.36), { aretes: false });
  cuire(bloc(0.1, 0.02, 0.14), M_ACCENT, m4(x, 0.44, 0.3), { aretes: false });   // crémaillère (accent)
  // fenêtre de charge néon sur le flanc du pod
  const fen = new THREE.CylinderGeometry(0.052, 0.052, 0.16, 12, 1, true).rotateX(Math.PI / 2);
  cuire(fen, M_NEON, m4(x, 0.44, 0.05), { aretes: false });
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
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 2.8 } },
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'chasseur.glb');
writeFileSync(dest, glb);
console.log(`chasseur.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
