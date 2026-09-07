// HABILLER-FUSILLER — adaptation du fusiller Tripo (mode peintre : géométrie + UV conservées,
// texture repeinte + couche émissive, matériaux STYLE-3D). Session FONDERIE-LOT (mode peintre).
// Usage :
//   node outils/habiller-fusiller.mjs --preview    rend 5 vues du source (détection du « avant »)
//   node outils/habiller-fusiller.mjs --calibre    diagnostics géométriques (pieds, bandes Y, histogramme X)
//   node outils/habiller-fusiller.mjs --zones      rend 5 vues colorées par zone + néon (vérif de la sélection)
//   node outils/habiller-fusiller.mjs              peint + exporte modeles/fusiller_v3.glb (+ cartes à plat)
//
// Source : image_ref/fusiller_tripo.glb (5 492 tris, 6 965 sommets, UV, texture cuite,
// origine au sol Y 0→1, hauteur 1.0). Le knight regarde +Z (confirmé --preview) => pivot 180°.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { rendreVues, VUES } from './raster.mjs';
import { encoderPNG, construireGLB } from './glb.mjs';

const SOURCE = '../../image_ref/fusiller_tripo.glb';
const SORTIE = '../modeles/fusiller_v3.glb';
const RES = 1024; // STYLE §4 : 512 ; 1K car la texture porte liserés + glyphes (à montrer à Erik)

// ---------- lecture du GLB source ----------
function lireGlb(chemin) {
  const buf = readFileSync(new URL(chemin, import.meta.url));
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const c = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(c.toString('utf8'));
    else if (type === 0x004e4942) bin = c;
    off += 8 + len;
  }
  return { json, bin };
}

const { json, bin } = lireGlb(SOURCE);
const prim = json.meshes[0].primitives[0];
const accP = json.accessors[prim.attributes.POSITION];
const bvP = json.bufferViews[accP.bufferView];
const posSrc = new Float32Array(bin.buffer, bin.byteOffset + bvP.byteOffset + (accP.byteOffset || 0), accP.count * 3);
const accN = json.accessors[prim.attributes.NORMAL];
const bvN = json.bufferViews[accN.bufferView];
const norSrc = new Float32Array(bin.buffer, bin.byteOffset + bvN.byteOffset + (accN.byteOffset || 0), accN.count * 3);
const accU = json.accessors[prim.attributes.TEXCOORD_0];
const bvU = json.bufferViews[accU.bufferView];
const uvSrc = new Float32Array(bin.buffer, bin.byteOffset + bvU.byteOffset + (accU.byteOffset || 0), accU.count * 2);
const accI = json.accessors[prim.indices];
const bvI = json.bufferViews[accI.bufferView];
const idxSrc = new Uint16Array(bin.buffer, bin.byteOffset + bvI.byteOffset + (accI.byteOffset || 0), accI.count);

const NB_SOMMETS = accP.count, NB_TRIS = idxSrc.length / 3;

// ---------- paramètres (table unique, à la mode habiller-guerrier.mjs) ----------
const S = {
  pivot180: true,           // confirmé --preview : visée ~-Z après rotation +90° Y (pose Tripo biaisée ~25° vers +X)
  echelle: 2.6,            // hauteur cible en unités de tuile (STYLE §5 ~2,5-2,75)
  // recentrage sur les CORPS (pieds y<0.12), pas sur les bornes — cf. v2 découverte #5
  recentrerPieds: true,
  dihedreLiseres: 35,      // degré => arête de plaque (liserés texture)
  dihedreNeon: 15,         // degré => arête néon LINES (zones pleines)
  seuilUV: 0.06,           // saut UV => couture (segment texture ignoré)
  epLiseres: 1.7,          // px (à RES) des liserés d'arêtes
  alphaLiseresEmissif: 0.5,
  alphaCorps: 1.0,       // 0.55 translucide (STYLE) ; 1.0 = essai opaque demandé par Erik pour juger
  nGlyphes: 40,            // amas de lignes de code
  // zones (espace modèle APRÈS rotation +90°Y + recentrage, AVANT échelle) :
  teteY: [0.82, 1.01],
  teteXmax: 0.22,          // visière du casque (face avant z<0)
  teteZmin: 0.0,
  lame: { xMax: -0.14, y0: 0.42, y1: 0.68, zMax: -0.05 }, // fusil (avant-gauche)
  jitterPanneaux: 0.05,    // variation de luminance par triangle (relief discret)
};

// copies mutables
const pos = new Float32Array(posSrc);
const nor = new Float32Array(norSrc);
const uv = new Float32Array(uvSrc);
const idx = new Uint16Array(idxSrc);

// ---------- pivot 180° (+Z => -Z) ----------
if (S.pivot180) {
  for (let i = 0; i < pos.length; i += 3) { pos[i] = -pos[i]; pos[i + 2] = -pos[i + 2]; }
  for (let i = 0; i < nor.length; i += 3) { nor[i] = -nor[i]; nor[i + 2] = -nor[i + 2]; }
}

// ---------- recentrage sur les pieds ----------
if (S.recentrerPieds) {
  let fx = 0, fz = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > 0.12) continue;
    fx += pos[i]; fz += pos[i + 2]; n++;
  }
  const dx = -fx / n, dz = -fz / n;
  console.log(`recentrage pieds : dx ${dx.toFixed(3)}, dz ${dz.toFixed(3)}`);
  for (let i = 0; i < pos.length; i += 3) { pos[i] += dx; pos[i + 2] += dz; }
}

// centroïdes de triangles (espace pivoté/recentré)
const centroid = new Float32Array(NB_TRIS * 3);
for (let t = 0; t < NB_TRIS; t++) {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  for (let k = 0; k < 3; k++)
    centroid[t * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3;
}

// ---------- zones ----------
const Z = { CORPS: 0, VISIERE: 1, LAME: 2 }; // VISIERE=visière, LAME=fusil
const zone = new Uint8Array(NB_TRIS);
for (let t = 0; t < NB_TRIS; t++) {
  const cx = centroid[t * 3], cy = centroid[t * 3 + 1], cz = centroid[t * 3 + 2];
  if (cy >= S.teteY[0] && cy <= S.teteY[1] && cz < S.teteZmin && Math.abs(cx) < S.teteXmax) zone[t] = Z.VISIERE;
  else if (cx < S.lame.xMax && cy > S.lame.y0 && cy < S.lame.y1 && cz < S.lame.zMax) zone[t] = Z.LAME;
}

// ---------- soudure des sommets (Tripo peut dupliquer) ----------
const cle = new Map();
const soude = new Uint32Array(NB_SOMMETS);
for (let i = 0; i < NB_SOMMETS; i++) {
  const k = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
  if (!cle.has(k)) cle.set(k, i);
  soude[i] = cle.get(k);
}

// ---------- arêtes à dièdre fort ----------
function aretesFortes(seuilDeg, filtreZone) {
  const nrm = new Float32Array(NB_TRIS * 3);
  for (let t = 0; t < NB_TRIS; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[t * 3] = nx / l; nrm[t * 3 + 1] = ny / l; nrm[t * 3 + 2] = nz / l;
  }
  const vu = new Map(), out = [];
  const cosSeuil = Math.cos(seuilDeg * Math.PI / 180);
  for (let t = 0; t < NB_TRIS; t++) {
    if (filtreZone && zone[t] !== filtreZone) continue;
    const f = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]].map(i => soude[i]);
    for (let e = 0; e < 3; e++) {
      const a = f[e], b = f[(e + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (vu.has(k)) {
        const [t2, stocke] = vu.get(k);
        if (stocke) {
          const d = nrm[t * 3] * nrm[t2 * 3] + nrm[t * 3 + 1] * nrm[t2 * 3 + 1] + nrm[t * 3 + 2] * nrm[t2 * 3 + 2];
          if (d < cosSeuil) out.push([a, b]);
          vu.set(k, [t2, false]);
        }
      } else vu.set(k, [t, true]);
    }
  }
  return out;
}

// premier sommet ORIGINAL pour chaque sommet soudé (pour les UV)
const originel = new Map();
for (let i = 0; i < NB_SOMMETS; i++) if (!originel.has(soude[i])) originel.set(soude[i], i);

// ---------- modes preview / calibre ----------
if (process.argv.includes('--preview') || process.argv.includes('--zones')) {
  const ex = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) {
    ex[i * 3] = pos[idx[i] * 3]; ex[i * 3 + 1] = pos[idx[i] * 3 + 1]; ex[i * 3 + 2] = pos[idx[i] * 3 + 2];
  }
  const tri = process.argv.includes('--zones');
  const groupes = new Array(NB_TRIS);
  const tris = [];
  if (tri) {
    for (let t = 0; t < NB_TRIS; t++) (groupes[zone[t]] ??= []).push(t);
    groupes.forEach((liste, g) => {
      if (!liste) return;
      const p = new Float32Array(liste.length * 9);
      liste.forEach((t, i) => {
        for (let v = 0; v < 3; v++) {
          const s = idx[t * 3 + v];
          p.set([pos[s * 3], pos[s * 3 + 1], pos[s * 3 + 2]], i * 9 + v * 3);
        }
      });
      tris.push({ positions: p, groupe: g });
    });
  } else tris.push({ positions: ex, groupe: 0 });

  const lignes = tri ? [{
    positions: lignesNeonZone(),
    groupe: 0,
  }] : [];
  rendreVues({
    triangles: tris,
    lignes,
    vues: VUES,
    destBase: 'captures/archer',
    palette: [[0.62, 0.78, 0.72], [1.0, 0.35, 0.35], [0.3, 0.45, 0.95]],
    nomFichier: (v) => `../captures/fusiller-${tri ? 'zones-' : ''}${v}.png`,
  });
  console.log('aperçus écrits dans captures/fusiller-*.png');
  process.exit(0);
}

// lignes néon (visière + fusil) en espace modèle pivoté/recentré, AVANT échelle
function lignesNeonZone() {
  const segs = [];
  for (const [a, b] of aretesFortes(S.dihedreNeon, Z.VISIERE))
    segs.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  for (const [a, b] of aretesFortes(S.dihedreNeon, Z.LAME))
    segs.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  console.log(`lignes néon : ${segs.length / 6} segments`);
  return new Float32Array(segs);
}

// ---------- cartes texture ----------
mkdirSync(new URL('../captures/', import.meta.url), { recursive: true });
const carteBase = new Uint8ClampedArray(RES * RES * 4);
const carteEmissive = new Uint8ClampedArray(RES * RES * 4);
const CORPS = [148, 156, 154]; // gris-vert désaturé ; la luminance finale vient du facteur 2.2 (compensation v1)
const NEON8 = [61, 255, 206];  // #3DFFCE
for (let p = 0; p < RES * RES; p++) {
  carteBase[p * 4] = CORPS[0]; carteBase[p * 4 + 1] = CORPS[1]; carteBase[p * 4 + 2] = CORPS[2]; carteBase[p * 4 + 3] = 255;
}

function pixel(carte, u, v, rgb, alpha) {
  const x = Math.min(RES - 1, Math.max(0, Math.round(u * RES)));
  const y = Math.min(RES - 1, Math.max(0, Math.round(v * RES)));
  const i = (y * RES + x) * 4;
  carte[i] += (rgb[0] - carte[i]) * alpha;
  carte[i + 1] += (rgb[1] - carte[i + 1]) * alpha;
  carte[i + 2] += (rgb[2] - carte[i + 2]) * alpha;
}

function segmentUV(carte, u0, v0, u1, v1, rgb, ep, alpha = 1) {
  if (Math.hypot(u1 - u0, v1 - v0) > S.seuilUV) return false; // couture UV
  const n = Math.max(1, Math.ceil(Math.hypot((u1 - u0) * RES, (v1 - v0) * RES) * 2));
  const r = Math.max(0.5, ep / 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = (u0 + (u1 - u0) * t) * RES, cy = (v0 + (v1 - v0) * t) * RES;
    for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++)
      for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
        if (ox * ox + oy * oy > r * r) continue;
        pixel(carte, (cx + ox) / RES, (cy + oy) / RES, rgb, alpha);
      }
  }
  return true;
}

// PRNG déterministe
let graine = 202609086;
const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ---------- 1) jitter de panneaux (relief discret, remplissage par triangle) ----------
{
  const carteTriangle = (a, b, c, rgb) => {
    const P = [[uv[a * 2] * RES, uv[a * 2 + 1] * RES], [uv[b * 2] * RES, uv[b * 2 + 1] * RES], [uv[c * 2] * RES, uv[c * 2 + 1] * RES]];
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(RES - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(RES - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const aire = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
    if (Math.abs(aire) < 1e-6) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[1][1] - py) * (P[2][0] - px)) / aire;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[2][1] - py) * (P[0][0] - px)) / aire;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      pixel(carteBase, x / RES, y / RES, rgb, 1);
    }
  };
  for (let t = 0; t < NB_TRIS; t++) {
    if (zone[t] !== Z.CORPS) continue;
    const j = 1 + (alea() * 2 - 1) * S.jitterPanneaux;
    carteTriangle(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2], [CORPS[0] * j, CORPS[1] * j, CORPS[2] * j]);
  }
}

// ---------- 2) liserés d'arêtes (toutes zones) : cyan base + émissif modéré ----------
let coutures = 0;
for (const [a, b] of aretesFortes(S.dihedreLiseres, null)) {
  const oa = originel.get(a), ob = originel.get(b);
  const ok = segmentUV(carteBase, uv[oa * 2], uv[oa * 2 + 1], uv[ob * 2], uv[ob * 2 + 1], NEON8, S.epLiseres, 0.85);
  if (ok) segmentUV(carteEmissive, uv[oa * 2], uv[oa * 2 + 1], uv[ob * 2], uv[ob * 2 + 1], [255, 255, 255], S.epLiseres, S.alphaLiseresEmissif);
  else coutures++;
}
console.log(`liserés : coutures UV ignorées ${coutures}`);

// ---------- 3) glyphes (lignes de code éparses sur le corps) ----------
const candidats = [];
for (let t = 0; t < NB_TRIS; t++) if (zone[t] === Z.CORPS) candidats.push(t);
let posés = 0;
for (let g = 0; g < S.nGlyphes && candidats.length; g++) {
  const t = candidats[Math.floor(alea() * candidats.length)];
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  const nBarres = 2 + Math.floor(alea() * 4);
  for (let k = 0; k < nBarres; k++) {
    // segment aléatoire À L'INTÉRIEUR du triangle (jamais hors îlot UV)
    let r1 = alea(), r2 = alea();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const r3 = 1 - r1 - r2;
    const u0 = uv[a * 2] * r1 + uv[b * 2] * r2 + uv[c * 2] * r3;
    const v0 = uv[a * 2 + 1] * r1 + uv[b * 2 + 1] * r2 + uv[c * 2 + 1] * r3;
    let r4 = alea(), r5 = alea();
    if (r4 + r5 > 1) { r4 = 1 - r4; r5 = 1 - r5; }
    const r6 = 1 - r4 - r5;
    const u1 = uv[a * 2] * r4 + uv[b * 2] * r5 + uv[c * 2] * r6;
    const v1 = uv[a * 2 + 1] * r4 + uv[b * 2 + 1] * r5 + uv[c * 2 + 1] * r6;
    segmentUV(carteBase, u0, v0, u1, v1, NEON8, 2.2, 0.9);
    segmentUV(carteEmissive, u0, v0, u1, v1, [255, 255, 255], 2.2, 0.95);
    posés++;
  }
}
console.log(`glyphes : ${posés} barres posées`);

// ---------- 4) lignes néon (visière + tranchant) ----------
const lignesNeon = lignesNeonZone();

// ---------- 5) export ----------
// construireGLB ne gère pas les indices (les v1 sont non indexées) : on expandre.
const E = S.echelle;
const posExport = new Float32Array(idx.length * 3);
const norExport = new Float32Array(idx.length * 3);
const uvExport = new Float32Array(idx.length * 2);
for (let i = 0; i < idx.length; i++) {
  const s = idx[i];
  posExport[i * 3] = pos[s * 3] * E; posExport[i * 3 + 1] = pos[s * 3 + 1] * E; posExport[i * 3 + 2] = pos[s * 3 + 2] * E;
  norExport[i * 3] = nor[s * 3]; norExport[i * 3 + 1] = nor[s * 3 + 1]; norExport[i * 3 + 2] = nor[s * 3 + 2];
  uvExport[i * 2] = uv[s * 2]; uvExport[i * 2 + 1] = uv[s * 2 + 1];
}
for (let i = 0; i < lignesNeon.length; i++) lignesNeon[i] *= E;

const materiaux = [
  { // 0 — accent_joueur : LE corps entier (texture repeinte, translucide) — teinté par le jeu
    name: 'accent_joueur',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      baseColorFactor: [6.6, 6.6, 6.6, S.alphaCorps], // compensation luminance choisie par Erik (test 2.2 / 4.4 / 6.6 — le pipeline rend sombre)
      metallicFactor: 0.15, roughnessFactor: 0.5,
    },
    emissiveTexture: { index: 1 },
    emissiveFactor: [NEON8[0] / 255, NEON8[1] / 255, NEON8[2] / 255],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 0.9 } },
    alphaMode: S.alphaCorps >= 1 ? 'OPAQUE' : 'BLEND',
    doubleSided: true,
  },
  { // 1 — néon pur : visière + fusil (LINES) — JAMAIS teinté
    name: 'neon',
    pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
    emissiveFactor: [NEON8[0] / 255, NEON8[1] / 255, NEON8[2] / 255],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3.5 } },
  },
];

const glb = construireGLB({
  primitives: [
    { mode: 'TRIANGLES', positions: posExport, normals: norExport, uvs: uvExport, material: 0 },
    { mode: 'LINES', positions: lignesNeon, material: 1 },
  ],
  materiaux,
  image: Buffer.from(encoderPNG(RES, RES, Buffer.from(carteBase.buffer, carteBase.byteOffset, carteBase.length))),
  imageEmissive: Buffer.from(encoderPNG(RES, RES, Buffer.from(carteEmissive.buffer, carteEmissive.byteOffset, carteEmissive.length))),
  extensionsUtilisees: ['KHR_materials_emissive_strength'],
  nom: 'fusiller_v3',
});
writeFileSync(new URL(SORTIE, import.meta.url), glb);
console.log(`${SORTIE} écrit : ${NB_TRIS} tris + ${lignesNeon.length / 6} segments néon, ${materiaux.length} matériaux, hauteur ${E}`);

// cartes à plat pour validation Erik
writeFileSync(new URL('../captures/fusiller-carte-base.png', import.meta.url), encoderPNG(RES, RES, Buffer.from(carteBase.buffer, carteBase.byteOffset, carteBase.length)));
writeFileSync(new URL('../captures/fusiller-carte-emissive.png', import.meta.url), encoderPNG(RES, RES, Buffer.from(carteEmissive.buffer, carteEmissive.byteOffset, carteEmissive.length)));
console.log('cartes à plat : captures/fusiller-carte-base.png + fusiller-carte-emissive.png');
