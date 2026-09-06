// FABRIQUER-INFANTERIE — FONDERIE-3D. Noyau GLACE Léthal, sentinelle de défense
// ultime (image_ref/infanterie.jpg + infanterie.txt). Monolithe cyber-soldat :
// plaques hyper-denses, écu pare-feu tour à pleine hauteur intégré au bras gauche,
// fusil à faisceau de contre-intrusion au poignet droit. Face -Z.
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
  let graine = 777001;
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

// ---------- construction du Noyau GLACE Léthal ----------
// Monolithe : hauteur ~2.5, largeur d'épaules ~1.35, face -Z.

// --- jambes colossales ---
for (const cote of [-1, 1]) {
  const x = 0.24 * cote;
  cuire(prisme(0.13, 0.105, 0.42, 16), M_CORPS, m4(x, 0.98, 0));                  // cuisse
  cuire(prisme(0.1, 0.1, 0.1, 8), M_ACCENT, m4(x, 0.76, 0), { aretes: false });   // genou (accent)
  cuire(prisme(0.095, 0.075, 0.4, 16), M_CORPS, m4(x, 0.52, 0));                  // tibia
  cuire(prisme(0.08, 0.1, 0.1, 10), M_CORPS, m4(x, 0.18, 0));                     // cheville
  cuire(bloc(0.24, 0.1, 0.36), M_CORPS, m4(x, 0.05, -0.06));                      // pied
  cuire(bloc(0.2, 0.06, 0.16), M_ACCENT, m4(x + 0.08 * cote, 0.42, 0.1), { aretes: false }); // genouillère (accent)
  cuire(bloc(0.22, 0.34, 0.08), M_CORPS, m4(x + 0.15 * cote, 0.72, 0.12), { aretes: false }); // plaque de cuisse
  cuire(bloc(0.12, 0.06, 0.06), M_ACCENT, m4(x, 0.62, 0.1), { aretes: false });   // insert (accent)
}
// --- bassin ---
cuire(prisme(0.3, 0.24, 0.26, 8), M_CORPS, m4(0, 1.26, 0));
for (const cote of [-1, 1])
  cuire(bloc(0.18, 0.16, 0.22), M_CORPS, m4(0.21 * cote, 1.22, 0.04, 0, 0.25 * cote, 0.12 * cote), { aretes: false }); // tassettes
// --- torse monolithique ---
cuire(prisme(0.36, 0.3, 0.3, 12), M_CORPS, m4(0, 1.52, 0));
cuire(prisme(0.42, 0.36, 0.3, 12), M_CORPS, m4(0, 1.8, 0));
cuire(bloc(0.6, 0.28, 0.38), M_CORPS, m4(0, 2.0, 0));                             // pectoraux hauts
for (let i = 0; i < 4; i++)
  cuire(bloc(0.36 - i * 0.06, 0.1, 0.06), M_CORPS, m4(0, 1.9 - i * 0.15, -0.24 - i * 0.01), { aretes: false }); // abdos plaqués
cuire(bloc(0.24, 0.18, 0.08), M_ACCENT, m4(0, 1.86, -0.24), { aretes: false });   // écusson (accent)
cuire(new THREE.OctahedronGeometry(0.06, 0), M_NEON, m4(0, 1.84, -0.14), { aretes: false }); // cœur néon
cuire(prisme(0.055, 0.055, 0.3, 6), M_NEON, m4(0, 1.55, 0.12), { aretes: false });  // colonne interne
// circuits latéraux
polyline([[-0.26, 1.86, 0.2], [-0.3, 1.66, 0.2], [-0.26, 1.46, 0.2]]);
polyline([[0.26, 1.86, 0.2], [0.3, 1.66, 0.2], [0.26, 1.46, 0.2]]);
// --- tête casquée à visière fente ---
cuire(prisme(0.13, 0.11, 0.26, 8), M_CORPS, m4(0, 2.26, -0.01));
cuire(bloc(0.2, 0.04, 0.05), M_NEON, m4(0, 2.28, -0.14), { aretes: false });      // visière émissive
cuire(bloc(0.05, 0.12, 0.15), M_ACCENT, m4(0, 2.32, 0.06), { aretes: false });    // crête (accent)
// --- épaulières hyper-denses (2 strates + faîte) ---
for (const cote of [-1, 1]) {
  const x = 0.5 * cote;
  cuire(prisme(0.22, 0.17, 0.22, 8), M_CORPS, m4(x, 2.04, 0, 0, 0, 0.26 * cote));
  cuire(prisme(0.18, 0.13, 0.16, 8), M_CORPS, m4(x, 2.19, 0, 0, 0, 0.32 * cote));
  cuire(bloc(0.24, 0.05, 0.24), M_ACCENT, m4(x, 2.31, 0, 0, 0, 0.3 * cote), { aretes: false });
}
// --- bras gauche : porte l'écu tour (l'avant-bras disparaît derrière) ---
barre([-0.5, 1.9, 0], [-0.54, 1.6, -0.1], 0.075, 0.065, M_CORPS, 12);
// --- bras droit : tient le fusil bas ---
barre([0.5, 1.9, 0], [0.54, 1.56, -0.04], 0.075, 0.065, M_CORPS, 12);
barre([0.54, 1.56, -0.04], [0.48, 1.3, -0.18], 0.062, 0.055, M_CORPS, 12);
cuire(prisme(0.08, 0.08, 0.09, 8), M_ACCENT, m4(0.54, 1.54, -0.02), { aretes: false }); // coude (accent)
cuire(bloc(0.13, 0.14, 0.13), M_CORPS, m4(0.47, 1.26, -0.2));                    // moufle

// ---------- l'écu pare-feu tour (bras gauche, pleine hauteur) ----------
{
  const cx = -0.62, cz = -0.32;
  // plat allongé hexagonal
  const plat = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 6, 1).rotateZ(Math.PI / 2).scale(1, 1.7, 1);
  cuire(plat, M_CORPS, m4(cx, 1.25, cz, 0, 0.25, 0));
  // circuits concentriques en face avant (LINES)
  function hexa(r, dx) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push([cx + dx, 1.25 + r * 1.7 * Math.sin(a), cz + r * Math.cos(a)]);
    }
    polyline(pts);
  }
  hexa(0.26, -0.045); hexa(0.16, -0.045);
  polyline([[cx - 0.05, 0.95, cz - 0.045], [cx - 0.05, 1.55, cz - 0.045]]);
  polyline([[cx - 0.05, 1.25, cz - 0.29], [cx - 0.05, 1.25, cz + 0.25]]);
  for (const yy of [0.85, 1.25, 1.62])                                            // barreaux
    polyline([[cx - 0.05, yy, cz - 0.22], [cx - 0.05, yy + 0.04, cz + 0.22]]);
}

// ---------- le fusil à faisceau (main droite, pointé bas-avant) ----------
{
  const A = [0.47, 1.3, -0.22], B = [0.38, 0.85, -0.95];   // crosse haute -> bouche bas-avant
  barre(A, B, 0.055, 0.045, M_CORPS, 12);                  // corps
  // faisceau néon sur le dessus
  const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const l = Math.hypot(...dir);
  const u = dir.map(v => v / l);
  polyline([
    [A[0], A[1] + 0.07, A[2]],
    [A[0] + u[0] * l * 0.5, A[1] + u[1] * l * 0.5 + 0.07, A[2] + u[2] * l * 0.5],
    [B[0] + u[0] * 0.05, B[1] + u[1] * 0.05 + 0.07, B[2] + u[2] * 0.05]]);
  // crosse et poignée
  cuire(bloc(0.08, 0.16, 0.09), M_CORPS, m4(A[0] + 0.06, A[1] + 0.06, A[2] + 0.08, 0.6, 0, 0), { aretes: false });
  cuire(bloc(0.05, 0.1, 0.05), M_ACCENT, m4(A[0] - 0.06, A[1] - 0.1, A[2] + 0.02), { aretes: false });
  // bouche : anneau + pulse
  const an = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...u));
  cuire(an, M_ACCENT, new THREE.Matrix4().compose(V(B[0], B[1], B[2]), q, V(1, 1, 1)), { aretes: false });
  cuire(new THREE.OctahedronGeometry(0.04, 0), M_NEON,
    m4(B[0] - u[0] * 0.07, B[1] - u[1] * 0.07, B[2] - u[2] * 0.07), { aretes: false });
  // cellules de charge latérales
  for (const cote of [-1, 1])
    cuire(bloc(0.03, 0.06, 0.2), M_ACCENT, m4(A[0] + 0.07 * cote, A[1] + 0.02, A[2] - 0.15), { aretes: false });
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
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 0.55 } },
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
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'modeles', 'infanterie.glb');
writeFileSync(dest, glb);
console.log(`infanterie.glb écrit : ${dest}`);
console.log(`Triangles : ${trisTotal} | Matériaux : ${materiaux.length} | primitives : ${tris.length} tris + ${lignes.length} lignes`);
