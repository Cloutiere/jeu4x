// FABRIQUER-CATAPULTE — FONDERIE-3D. Injecteur de Tampon, artillery de siège
// (image_ref/catapulte.jpg + catapulte.txt). Châssis à chenilles, rail-lanceur
// incliné vers -Z chargeant un cœur de données volatil (amas néon + arcs électriques).
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
  let graine = 65535;
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

// ---------- construction de la Catapulte ----------
// Longueur ~1.9 le long de Z (nez -Z), largeur ~1.0, hauteur ~1.6. Face -Z.

// --- châssis à chenilles ---
for (const cote of [-1, 1]) {
  const x = 0.42 * cote;
  cuire(bloc(0.22, 0.34, 1.6), M_CORPS, m4(x, 0.24, 0));                          // chenille
  for (let i = 0; i < 6; i++) {                                                   // galets
    const roue = new THREE.CylinderGeometry(0.09, 0.09, 0.1, 14, 1).rotateZ(Math.PI / 2);
    cuire(roue, M_CORPS, m4(x, 0.18, -0.72 + i * 0.29), { aretes: false });
    const moyeu = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8, 1).rotateZ(Math.PI / 2);
    cuire(moyeu, M_ACCENT, m4(x, 0.18, -0.72 + i * 0.29), { aretes: false });
  }
  cuire(bloc(0.08, 0.36, 1.5), M_ACCENT, m4(x + 0.13 * cote, 0.24, 0), { aretes: false }); // bande de chenille (accent)
}
cuire(bloc(0.5, 0.26, 1.5), M_CORPS, m4(0, 0.5, 0));                              // caisse centrale
for (const cote of [-1, 1]) {
  cuire(bloc(0.18, 0.04, 0.9), M_CORPS, m4(0.15 * cote, 0.66, 0.15), { aretes: false });
  cuire(bloc(0.08, 0.03, 0.5), M_ACCENT, m4(0.15 * cote, 0.69, 0.1), { aretes: false });
}
cuire(bloc(0.2, 0.06, 0.4), M_CORPS, m4(0, 0.65, 0.35), { aretes: false });
cuire(bloc(0.56, 0.1, 0.5), M_CORPS, m4(0, 0.62, -0.45, 0.35));                   // glacis avant
cuire(bloc(0.5, 0.12, 0.4), M_CORPS, m4(0, 0.6, 0.6, -0.3));                      // poupe
cuire(bloc(0.4, 0.06, 0.3), M_ACCENT, m4(0, 0.66, -0.28, 0.35), { aretes: false }); // plaque de glacis (accent)
// juventés / jupes latérales et coffres
for (const cote of [-1, 1]) {
  for (let i = 0; i < 3; i++)
    cuire(bloc(0.05, 0.2, 0.3), M_CORPS, m4(0.53 * cote, 0.42, -0.45 + i * 0.45), { aretes: false }); // jupes de chenille
  cuire(bloc(0.1, 0.14, 0.3), M_ACCENT, m4(0.5 * cote, 0.62, 0.4), { aretes: false });  // coffres arrière (accent)
  cuire(bloc(0.06, 0.1, 0.2), M_CORPS, m4(0.53 * cote, 0.55, -0.25), { aretes: false }); // boîtiers
}
// trappes et détails de caisse
cuire(prisme(0.09, 0.11, 0.06, 8), M_ACCENT, m4(-0.12, 0.66, 0.2), { aretes: false });  // trappe (accent)
cuire(bloc(0.16, 0.05, 0.24), M_CORPS, m4(0.12, 0.65, 0.24), { aretes: false });        // gril de ventilation
for (let i = 0; i < 5; i++)
  cuire(bloc(0.24, 0.02, 0.04), M_CORPS, m4(0, 0.56, -0.6 + i * 0.07), { aretes: false }); // lamelles avant
// grilles de refroidissement arrière
for (let i = 0; i < 4; i++)
  cuire(bloc(0.3, 0.03, 0.05), M_ACCENT, m4(0, 0.5, 0.75 + i * 0.05), { aretes: false });
// optiques avant néon
for (const cote of [-1, 1])
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON, m4(0.18 * cote, 0.58, -0.72), { aretes: false });

// --- tourelle pivot ---
cuire(prisme(0.22, 0.26, 0.18, 12), M_CORPS, m4(0, 0.78, -0.02));
cuire(prisme(0.16, 0.16, 0.08, 8), M_ACCENT, m4(0, 0.9, -0.02), { aretes: false });
for (const cote of [-1, 1]) {
  cuire(bloc(0.16, 0.2, 0.24), M_CORPS, m4(0.2 * cote, 0.88, 0.02, 0, 0, -0.2 * cote), { aretes: false }); // joues de tourelle
  cuire(bloc(0.06, 0.3, 0.5), M_CORPS, m4(0.2 * cote, 1.16, 0.12, 0.55, 0, 0), { aretes: false }); // coffrage du lanceur
  cuire(bloc(0.05, 0.22, 0.34), M_CORPS, m4(0.2 * cote, 1.3, -0.24, 0.55, 0, 0), { aretes: false });
}
// béliers de recul
for (const cote of [-1, 1])
  barre([0.14 * cote, 0.86, 0.3], [0.1 * cote, 1.0, 0.05], 0.03, 0.03, M_CORPS, 8);

// --- rail-lanceur incliné (~32°) vers -Z ---
// axe : de la culasse (0, 0.95, 0.42) à la bouche (0, 1.7, -0.85)
{
  const A = [0, 0.95, 0.5], B = [0, 1.78, -1.05];
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  const centre = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  const mCanon = new THREE.Matrix4().compose(V(...centre), q, V(1, 1, 1));
  // corps du canon : prisme couché le long de l'axe
  const canon = new THREE.CylinderGeometry(0.13, 0.16, l, 20, 1);
  cuire(canon, M_CORPS, mCanon);
  // rails intérieurs (l'« âme » ouverte du rail-lanceur) + ligne de charge néon au sommet
  for (const cote of [-1, 1]) {
    const off = new THREE.Vector3(0.08 * cote, 0.03, 0).applyQuaternion(q);
    cuire(bloc(0.03, 0.03, 0.9), M_CORPS,
      new THREE.Matrix4().compose(V(centre[0] + off.x, centre[1] + off.y, centre[2] + off.z), q, V(1, 1, 1)), { aretes: false });
  }
  polyline([
    [A[0], A[1] + 0.19, A[2]],
    [A[0] + u[0] * l * 0.33, A[1] + u[1] * l * 0.33 + 0.19, A[2] + u[2] * l * 0.33],
    [A[0] + u[0] * l * 0.66, A[1] + u[1] * l * 0.66 + 0.19, A[2] + u[2] * l * 0.66],
    [B[0], B[1] + 0.19, B[2]]]);
  // mors de bouche (deux mâchoires ouvertes vers l'avant)
  for (const cote of [-1, 1]) {
    const off = new THREE.Vector3(0.13 * cote, 0.1, 0).applyQuaternion(q);
    cuire(bloc(0.07, 0.2, 0.14), M_CORPS,
      new THREE.Matrix4().compose(V(B[0] + off.x - u[0] * 0.05, B[1] + off.y - u[1] * 0.05, B[2] + off.z - u[2] * 0.05), q, V(1, 1, 1)));
  }
  // anneaux de renfort le long du canon
  for (const t of [0.15, 0.32, 0.5, 0.68]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t, A[2] + u[2] * l * t];
    const an = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 14, 1);
    cuire(an, M_CORPS, new THREE.Matrix4().compose(V(...P), q, V(1, 1, 1)), { aretes: false });
  }
  // ailettes de refroidissement sous le canon
  for (const t of [0.25, 0.4, 0.55, 0.7]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t - 0.15, A[2] + u[2] * l * t];
    cuire(bloc(0.06, 0.12, 0.05), M_CORPS, new THREE.Matrix4().compose(V(...P), q, V(1, 1, 1)), { aretes: false });
  }
  // culasse arrière renflée
  const culasse = new THREE.CylinderGeometry(0.24, 0.24, 0.3, 14, 1);
  cuire(culasse, M_CORPS, new THREE.Matrix4().compose(V(A[0] + u[0] * 0.1, A[1] + u[1] * 0.1, A[2] + u[2] * 0.1), q, V(1, 1, 1)));

  // --- cœur de données volatil (dans le canal, vers les 2/3 avant) ---
  const C = [A[0] + u[0] * l * 0.68, A[1] + u[1] * l * 0.68, A[2] + u[2] * l * 0.68];
  cuire(new THREE.OctahedronGeometry(0.13, 0), M_NEON, m4(...C), { aretes: false });      // noyau
  for (const [dx, dy, dz, s] of [[0.06, 0.04, -0.05, 0.05], [-0.07, -0.02, 0.04, 0.045],
    [0.02, -0.06, 0.07, 0.04], [-0.04, 0.07, -0.06, 0.035]]) {
    cuire(new THREE.OctahedronGeometry(s, 0), M_NEON, m4(C[0] + dx, C[1] + dy, C[2] + dz), { aretes: false }); // éclats
  }
  // arcs électriques autour du cœur
  polyline([[C[0] + 0.1, C[1], C[2]], [C[0] + 0.04, C[1] + 0.09, C[2] + 0.03], [C[0] - 0.06, C[1] + 0.05, C[2] - 0.04]]);
  polyline([[C[0] - 0.1, C[1] - 0.02, C[2]], [C[0] - 0.03, C[1] - 0.08, C[2] - 0.04], [C[0] + 0.07, C[1] - 0.04, C[2] + 0.04]]);
  // lueurs de charge le long des rails
  for (const t of [0.45, 0.55, 0.85]) {
    const P = [A[0] + u[0] * l * t, A[1] + u[1] * l * t, A[2] + u[2] * l * t];
    cuire(new THREE.OctahedronGeometry(0.03, 0), M_NEON, m4(...P), { aretes: false });
  }
  // anneau de bouche émissif
  const anneau = new THREE.CylinderGeometry(0.155, 0.155, 0.04, 14, 1);
  cuire(anneau, M_NEON, new THREE.Matrix4().compose(V(B[0] - u[0] * 0.02, B[1] - u[1] * 0.02, B[2] - u[2] * 0.02), q, V(1, 1, 1)), { aretes: false });
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'catapulte.glb');
writeFileSync(dest, glb);
console.log(`catapulte.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
