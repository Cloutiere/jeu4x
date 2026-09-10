// HABILLER-PLAINE-GRENIER — variante « grenier » de la tuile plaine (asset Tripo,
// demande d'Erik 08/09) : seul le bus de données CENTRAL reste illuminé ; les
// 2 bus de chaque côté deviennent CUIVRE ÉTEINT.
//
// Les bus sont PEINTS dans la texture (aucun relief) : détection par couverture
// néon des triangles en espace UV (texture décodée via `sharp` — seule
// dépendance, déjà présente dans le dépôt), regroupement en bandes parallèles
// dans l'espace tuile, puis :
//   - triangles des bus latéraux → matériau `bus_cuivre` (couleur pleine, ZÉRO émissif) ;
//   - carte émissive = texture source masquée (régions UV des bus latéraux en noir).
// La texture BASECOLOR du corps reste celle du source (les bus latéraux sont
// recouverts par le matériau cuivre).
//
// Usage :
//   node outils/habiller-plaine-grenier.mjs --diagnostic   (bandes détectées)
//   node outils/habiller-plaine-grenier.mjs                (export)

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { construireGLB } from './glb.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SOURCE = 'C:/Users/Erik/ZCodeProject/image_ref/plaine_on_tripo.glb';
const SORTIE = 'C:/Users/Erik/ZCodeProject/fonderie/modeles/plaine_v1.glb';

const S = {
  neonG: 130,           // seuil de vert pour un pixel « néon »
  couverture: 0.22,     // fraction mini de pixels néon => triangle de bus
  bande: 0.045,         // demi-largeur d'attachement à une bande (espace tuile)
  echelle: 1.0,
  dy: -0.099,           // affleure le haut du prisme (comme la prairie)
  forceEmissive: 0.7,
  cuivre: 0xb87333,
  cuivreMetal: 0.6,
  cuivreRough: 0.6,
};

// ---------- lecture GLB ----------
const buf = readFileSync(SOURCE);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const c = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(c.toString('utf8'));
  else if (type === 0x004e4942) bin = c;
  off += 8 + len;
}
const prim = json.meshes[0].primitives[0];
const lire = (nom, comps) => {
  const acc = json.accessors[prim.attributes[nom]];
  const bv = json.bufferViews[acc.bufferView];
  return new Float32Array(bin.buffer, bin.byteOffset + bv.byteOffset + (acc.byteOffset || 0), acc.count * comps);
};
const pos = lire('POSITION', 3);
const nor = lire('NORMAL', 3);
const uv = lire('TEXCOORD_0', 2);
const idx = new Uint16Array(bin.buffer, bin.byteOffset + json.bufferViews[json.accessors[prim.indices].bufferView].byteOffset + (json.accessors[prim.indices].byteOffset || 0), json.accessors[prim.indices].count);
const NT = idx.length / 3;

// ---------- décodage texture + masque néon ----------
const img = json.images[0];
const bvImg = json.bufferViews[img.bufferView];
const jpeg = bin.subarray(bvImg.byteOffset, bvImg.byteOffset + bvImg.byteLength);
const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const estNeon = (x, y) => {
  const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
  const r = data[i], g = data[i + 1];
  return g > S.neonG && g > r * 1.25;
};

// couverture néon par triangle (échantillonnage de la rasterisation UV)
const couverture = new Float32Array(NT);
for (let t = 0; t < NT; t++) {
  const P = [0, 1, 2].map((v) => [uv[idx[t * 3 + v] * 2] * W, uv[idx[t * 3 + v] * 2 + 1] * H]);
  const x0 = Math.floor(Math.min(...P.map((p) => p[0]))), x1 = Math.ceil(Math.max(...P.map((p) => p[0])));
  const y0 = Math.floor(Math.min(...P.map((p) => p[1]))), y1 = Math.ceil(Math.max(...P.map((p) => p[1])));
  const pas = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 8));
  let tot = 0, neon = 0;
  for (let y = y0; y <= y1; y += pas) for (let x = x0; x <= x1; x += pas) {
    tot++;
    if (estNeon(x, y)) neon++;
  }
  couverture[t] = tot ? neon / tot : 0;
}

// centroïdes tuile
const centroid = new Float32Array(NT * 3);
for (let t = 0; t < NT; t++) {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  for (let k = 0; k < 3; k++) centroid[t * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3;
}

// triangles de bus (forte couverture néon)
const busTris = [];
for (let t = 0; t < NT; t++) if (couverture[t] > S.couverture) busTris.push(t);
console.log(`triangles de bus (couverture néon > ${S.couverture}) : ${busTris.length}`);
if (busTris.length === 0) throw new Error('aucun triangle de bus — vérifier S.neonG / S.couverture');

// direction perpendiculaire aux bandes (plus petite variance des centroïdes)
let sxx = 0, szz = 0, sxz = 0, n = 0;
for (const t of busTris) {
  const x = centroid[t * 3], z = centroid[t * 3 + 2];
  sxx += x * x; szz += z * z; sxz += x * z; n++;
}
const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
const perp = [Math.cos(theta), Math.sin(theta)];
console.log(`perpendiculaire aux bandes : [${perp.map((v) => v.toFixed(3)).join(', ')}]`);
const uDe = (t) => centroid[t * 3] * perp[0] + centroid[t * 3 + 2] * perp[1];

// histogramme u des bus => bandes séparées
const hu = busTris.map(uDe);
const uMin = Math.min(...hu), uMax = Math.max(...hu);
const NB = 60;
const hist = new Array(NB).fill(0);
for (const u of hu) hist[Math.min(NB - 1, Math.floor((u - uMin) / (uMax - uMin + 1e-9) * NB))]++;
if (process.argv.includes('--diagnostic')) {
  console.log(`bandes u [${uMin.toFixed(2)}..${uMax.toFixed(2)}] :`);
  hist.forEach((v, i) => {
    const u = uMin + (i + 0.5) / NB * (uMax - uMin);
    if (v > 0) console.log(u.toFixed(3).padStart(7), '#'.repeat(Math.min(60, Math.round(v / 8))));
  });
}

// bandes = maxima locaux séparés d'au moins 0.1
const pics = [];
for (let i = 0; i < NB; i++) {
  if (hist[i] <= 5) continue;
  const u = uMin + (i + 0.5) / NB * (uMax - uMin);
  const derniere = pics[pics.length - 1];
  if (!derniere || u - derniere.u > 0.1) pics.push({ u, n: hist[i] });
  else if (hist[i] > derniere.n) { derniere.u = u; derniere.n = hist[i]; }
}
console.log(`pics (${pics.length}) : ${pics.map((p) => p.u.toFixed(3)).join(', ')}`);

// centre = bande la plus proche de u=0 ; attribution des triangles
const bandeCentre = pics.reduce((best, p) => (Math.abs(p.u) < Math.abs(best.u) ? p : best), pics[0]);
const uCotes = pics.filter((p) => p !== bandeCentre).map((p) => p.u);
console.log(`centre u=${bandeCentre.u.toFixed(3)} ; côtés u=${uCotes.map((v) => v.toFixed(3)).join(', ')}`);

const estCote = (t) => {
  if (couverture[t] <= 0.08) return false; // hors bus : ni cuivre ni masque
  const u = uDe(t);
  return uCotes.some((uc) => Math.abs(u - uc) < S.bande);
};
const triCote = [];
for (let t = 0; t < NT; t++) if (estCote(t)) triCote.push(t);
console.log(`triangles cuivre (bus latéraux) : ${triCote.length}`);

// ---------- émissive : texture source avec régions UV des bus latéraux en noir ----------
const emissive = Buffer.from(data);
for (const t of triCote) {
  const P = [0, 1, 2].map((v) => [uv[idx[t * 3 + v] * 2] * W, uv[idx[t * 3 + v] * 2 + 1] * H]);
  const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p[0])) - 2)), x1 = Math.min(W - 1, Math.ceil(Math.max(...P.map((p) => p[0])) + 2));
  const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p[1])) - 2)), y1 = Math.min(H - 1, Math.ceil(Math.max(...P.map((p) => p[1])) + 2));
  const aire = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
  if (Math.abs(aire) < 1e-6) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[1][1] - py) * (P[2][0] - px)) / aire;
    const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[2][1] - py) * (P[0][0] - px)) / aire;
    const w2 = 1 - w0 - w1;
    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
    const i = (y * W + x) * 4;
    emissive[i] = 0; emissive[i + 1] = 0; emissive[i + 2] = 0;
  }
}
const jpegEmissif = await sharp(emissive, { raw: { width: W, height: H, channels: 4 } }).jpeg({ quality: 88 }).toBuffer();
writeFileSync('C:/Users/Erik/ZCodeProject/fonderie/captures/plaine-grenier-emissive.jpg', jpegEmissif);

if (process.argv.includes('--diagnostic')) process.exit(0);

// ---------- export ----------
const E = S.echelle;
const expandre = (liste) => {
  const p = new Float32Array(liste.length * 9), nn = new Float32Array(liste.length * 9), u = new Float32Array(liste.length * 6);
  liste.forEach((t, i) => {
    for (let v = 0; v < 3; v++) {
      const s = idx[t * 3 + v];
      p.set([pos[s * 3] * E, (pos[s * 3 + 1] + S.dy) * E, pos[s * 3 + 2] * E], i * 9 + v * 3);
      nn.set([nor[s * 3], nor[s * 3 + 1], nor[s * 3 + 2]], i * 9 + v * 3);
      u.set([uv[s * 2], uv[s * 2 + 1]], i * 6 + v * 2);
    }
  });
  return { positions: p, normals: nn, uvs: u };
};
const dansCuivre = new Set(triCote);
const corps = [];
for (let t = 0; t < NT; t++) if (!dansCuivre.has(t)) corps.push(t);
console.log(`tris : corps ${corps.length}, cuivre ${triCote.length}`);

const glb = construireGLB({
  primitives: [
    { mode: 'TRIANGLES', ...expandre(corps), material: 0 },
    { mode: 'TRIANGLES', ...expandre(triCote), material: 1 },
  ],
  materiaux: [
    { // corps : texture source intacte en baseColor, émissive masquée (bus latéraux éteints)
      name: 'corps_tripo',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 },
      emissiveTexture: { index: 1 },
      emissiveFactor: [1, 1, 1],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: S.forceEmissive } },
      doubleSided: true,
    },
    { // bus latéraux : cuivre éteint (couleur pleine, aucune émissive)
      name: 'bus_cuivre',
      pbrMetallicRoughness: {
        baseColorFactor: [((S.cuivre >> 16) & 255) / 255, ((S.cuivre >> 8) & 255) / 255, (S.cuivre & 255) / 255, 1],
        metallicFactor: S.cuivreMetal, roughnessFactor: S.cuivreRough,
      },
      doubleSided: true,
    },
  ],
  imagesCustom: [
    { data: jpeg, mimeType: 'image/jpeg' },          // baseColor (source intacte)
    { data: jpegEmissif, mimeType: 'image/jpeg' },   // émissive masquée
  ],
  extensionsUtilisees: ['KHR_materials_emissive_strength'],
  nom: 'plaine_v1',
});
writeFileSync(SORTIE, glb);
console.log(`${SORTIE} écrit : ${NT} tris, 2 matériaux, dy ${S.dy}, echelle ${E}`);
