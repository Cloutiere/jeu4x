// HABILLER-VILLE — adaptation de la ville Tripo (handoff HANDOFF-VILLE-TRIPO, mode peintre).
// Les ANNEAUX sont clonés en un second mesh `accent_joueur` (teinté par le jeu, multiplication) ;
// la texture du CORPS reste octet pour octet celle de Tripo (variante A).
// Usage :
//   node outils/habiller-ville.mjs --preview    rend 5 vues du source (détection du « avant »)
//   node outils/habiller-ville.mjs --calibre    diagnostics radiaux par bande Y (réglage des anneaux)
//   node outils/habiller-ville.mjs --zones      rend 5 vues colorées corps/anneaux (vérif de la sélection)
//   node outils/habiller-ville.mjs              exporte modeles/ville_v1.glb (variante S.variante 'A'|'B')
//
// Source : image_ref/ville.glb (3 664 tris, 5 212 sommets, UV + texture JPEG Tripo,
// origine au sol Y 0→1, hauteur 1.0, X/Z ~symétriques).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { rendreVues, VUES } from './raster.mjs';
import { encoderPNG, construireGLB } from './glb.mjs';

const SOURCE = '../../image_ref/ville.glb';
const SORTIE = '../modeles/ville_v1.glb';

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
  return { json, bin, brut: buf };
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
// la texture JPEG du source, copiée telle quelle (variante A : corps intact)
const imgSrc = json.images[json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
const bvImg = json.bufferViews[imgSrc.bufferView];
const textureTripo = bin.subarray(bvImg.byteOffset, bvImg.byteOffset + bvImg.byteLength);

const NB_SOMMETS = accP.count, NB_TRIS = idxSrc.length / 3;

// ---------- paramètres (table unique) ----------
const S = {
  pivot180: false,         // à confirmer --preview (ville probablement symétrique)
  echelle: 2.6,            // hauteur cible (handoff §2.4 : ~2,5-2,75)
  // détection des anneaux : rayon du centroïde > enveloppe(tour à cette hauteur) + marge
  bandesY: 40,             // résolution de l'enveloppe radiale de la tour
  percentileTour: 0.15,    // percentile bas du rayon par bande = rayon « tour » (les bandes à anneaux sont envahies)
  margeAnneau: 0.03,       // marge au-dessus de l'enveloppe => anneau
  lissageEnveloppe: 2,     // enveloppe lissée sur N bandes voisines (la tour est conique)
  monotone: true,          // l'enveloppe est non-croissante en Y (cône) : clamp descendant
  ySocle: 0.12,            // sous cette hauteur, tout est socle (mur d'enceinte) => jamais anneau
  minBandes: 40,           // nb mini de triangles « au-delà » dans une bande pour la déclarer anneau
  margeInterne: 0.02,      // dans une bande anneau, tout tri au-delà de (rMin - marge) est anneau
  variante: (process.argv.find(a => a.startsWith('--variante=')) || '--variante=A').split('=')[1], // 'A' = corps Tripo intact ; 'B' = corps accent_joueur neutre-clair
  resAnneau: 128,          // texture des anneaux (neutre-claire + glyphes) — variante A
  facteurCorps: 1.2,       // compensation luminance variante B : texture 235 déjà claire, un facteur
                           // élevé (6.6, hérité du knight) sature tous les canaux > 1 et tue la teinte joueur
  emissifCorps: 0.7,       // variante A : la texture Tripo est AUSSI utilisée comme emissiveMap du corps
                           // (toujours octet pour octet — aucune repeinte) ; ses lignes néon cuites brillent.
                           // 0 = désactivé
};

// copies mutables
const pos = new Float32Array(posSrc);
const nor = new Float32Array(norSrc);
const uv = new Float32Array(uvSrc);
const idx = new Uint16Array(idxSrc);

if (S.pivot180) {
  for (let i = 0; i < pos.length; i += 3) { pos[i] = -pos[i]; pos[i + 2] = -pos[i + 2]; }
  for (let i = 0; i < nor.length; i += 3) { nor[i] = -nor[i]; nor[i + 2] = -nor[i + 2]; }
}

// centroïdes + rayon des triangles
const centroid = new Float32Array(NB_TRIS * 3);
const rayon = new Float32Array(NB_TRIS);
for (let t = 0; t < NB_TRIS; t++) {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  for (let k = 0; k < 3; k++)
    centroid[t * 3 + k] = (pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3;
  rayon[t] = Math.hypot(centroid[t * 3], centroid[t * 3 + 2]);
}

// ---------- enveloppe radiale de la tour (percentile par bande Y, lissée) ----------
function enveloppeTour() {
  const minY = 0, maxY = 1;
  const bandes = new Array(S.bandesY);
  for (let b = 0; b < S.bandesY; b++) {
    const y0 = minY + (b / S.bandesY) * (maxY - minY), y1 = y0 + (maxY - minY) / S.bandesY;
    const rs = [];
    for (let t = 0; t < NB_TRIS; t++) {
      const cy = centroid[t * 3 + 1];
      if (cy >= y0 && cy < y1) rs.push(rayon[t]);
    }
    rs.sort((x, y) => x - y);
    bandes[b] = rs.length ? rs[Math.floor(rs.length * S.percentileTour)] : 0;
  }
  // lissage : max glissant sur ±N bandes (l'enveloppe ne doit pas être trouée par une bande riche en anneaux)
  const lisse = bandes.slice();
  for (let b = 0; b < S.bandesY; b++)
    for (let d = -S.lissageEnveloppe; d <= S.lissageEnveloppe; d++) {
      const v = bandes[Math.min(S.bandesY - 1, Math.max(0, b + d))];
      lisse[b] = Math.max(lisse[b], v);
    }
  if (S.monotone) for (let b = 1; b < S.bandesY; b++) lisse[b] = Math.min(lisse[b], lisse[b - 1]);
  return lisse;
}

// ---------- zones ----------
// Un anneau est une BOUCLE dense : on ne retient comme « bandes d'anneaux » que les bandes Y
// au-dessus du socle (y > ySocle) où BEAUCOUP de triangles dépassent l'enveloppe ; dans ces
// bandes seuls les triangles au-delà de l'enveloppe + marge sont anneau (les balcons isolés
// de la tour, en bandes pauvres, restent corps).
const Z = { CORPS: 0, ANNEAU: 1 };
const zone = new Uint8Array(NB_TRIS);
const ENV = enveloppeTour();
const depasse = (t) => {
  const cy = Math.min(0.9999, Math.max(0, centroid[t * 3 + 1]));
  return rayon[t] > ENV[Math.floor(cy * S.bandesY)] + S.margeAnneau;
};
{
  const bandeDe = (t) => Math.min(S.bandesY - 1, Math.floor(Math.max(0, centroid[t * 3 + 1]) * S.bandesY));
  const compte = new Uint32Array(S.bandesY), rMin = new Float32Array(S.bandesY).fill(Infinity);
  for (let t = 0; t < NB_TRIS; t++) {
    const cy = centroid[t * 3 + 1];
    if (cy > S.ySocle && depasse(t)) { const b = bandeDe(t); compte[b]++; rMin[b] = Math.min(rMin[b], rayon[t]); }
  }
  for (let t = 0; t < NB_TRIS; t++) {
    const cy = centroid[t * 3 + 1];
    if (cy <= S.ySocle) continue;
    const b = bandeDe(t);
    if (compte[b] >= S.minBandes && rayon[t] > rMin[b] - S.margeInterne) zone[t] = Z.ANNEAU;
  }
}

// ---------- modes diagnostic ----------
if (process.argv.includes('--preview') || process.argv.includes('--zones')) {
  const tri = process.argv.includes('--zones');
  const groupes = new Array(NB_TRIS);
  const tris = [];
  const expandre = (liste) => {
    const p = new Float32Array(liste.length * 9);
    liste.forEach((t, i) => {
      for (let v = 0; v < 3; v++) {
        const s = idx[t * 3 + v];
        p.set([pos[s * 3], pos[s * 3 + 1], pos[s * 3 + 2]], i * 9 + v * 3);
      }
    });
    return p;
  };
  if (tri) {
    for (let t = 0; t < NB_TRIS; t++) (groupes[zone[t]] ??= []).push(t);
    groupes.forEach((liste, g) => { if (liste) tris.push({ positions: expandre(liste), groupe: g }); });
  } else {
    const tous = [];
    for (let t = 0; t < NB_TRIS; t++) tous.push(t);
    tris.push({ positions: expandre(tous), groupe: 0 });
  }
  rendreVues({
    triangles: tris,
    vues: VUES,
    destBase: 'captures/ville',
    palette: [[0.62, 0.78, 0.72], [1.0, 0.35, 0.35]],
    nomFichier: (v) => `../captures/ville-${tri ? 'zones-' : ''}${v}.png`,
  });
  console.log('aperçus écrits dans captures/ville-*.png');
  process.exit(0);
}

if (process.argv.includes('--calibre')) {
  console.log(`source : ${NB_TRIS} tris, ${NB_SOMMETS} sommets`);
  console.log('bande  y          env    nTris  nAnneaux');
  let total = 0;
  for (let b = 0; b < S.bandesY; b++) {
    const y0 = b / S.bandesY;
    let n = 0, na = 0;
    for (let t = 0; t < NB_TRIS; t++) {
      const cy = centroid[t * 3 + 1];
      if (cy >= y0 && cy < y0 + 1 / S.bandesY) { n++; if (zone[t] === Z.ANNEAU) na++; }
    }
    total += na;
    console.log(`${String(b).padStart(3)}  y ${y0.toFixed(3)}  ${ENV[b].toFixed(3)}  ${String(n).padStart(4)}  ${String(na).padStart(4)}`);
  }
  console.log(`total anneaux : ${total} / ${NB_TRIS} tris`);
  process.exit(0);
}

// ---------- export ----------
// expandre (construireGLB ne gère pas les indices)
const E = S.echelle;
const exp = (liste, avecUV) => {
  const p = new Float32Array(liste.length * 9), n = new Float32Array(liste.length * 9), u = new Float32Array(liste.length * 6);
  liste.forEach((t, i) => {
    for (let v = 0; v < 3; v++) {
      const s = idx[t * 3 + v];
      p.set([pos[s * 3] * E, pos[s * 3 + 1] * E, pos[s * 3 + 2] * E], i * 9 + v * 3);
      n.set([nor[s * 3], nor[s * 3 + 1], nor[s * 3 + 2]], i * 9 + v * 3);
      u.set([uv[s * 2], uv[s * 2 + 1]], i * 6 + v * 2);
    }
  });
  return avecUV ? { positions: p, normals: n, uvs: u } : { positions: p, normals: n };
};
const corps = [], anneaux = [];
for (let t = 0; t < NB_TRIS; t++) (zone[t] === Z.ANNEAU ? anneaux : corps).push(t);

// texture des anneaux : neutre-claire (la teinte joueur se lit en multiplication) + glyphes discrets
const RES = S.resAnneau;
const NEON8 = [61, 255, 206];
function carteAnneaux() {
  const carte = new Uint8ClampedArray(RES * RES * 4);
  const BASE = [235, 238, 236];
  for (let p = 0; p < RES * RES; p++) {
    carte[p * 4] = BASE[0]; carte[p * 4 + 1] = BASE[1]; carte[p * 4 + 2] = BASE[2]; carte[p * 4 + 3] = 255;
  }
  // émissive : mêmes UV que la texture Tripo — les anneaux brillent uniformément + quelques barres de code
  const emissive = new Uint8ClampedArray(RES * RES * 4);
  for (let p = 0; p < RES * RES; p++) { emissive[p * 4 + 3] = 255; }
  // glyphes néon posés dans les triangles d'anneaux (PRNG déterministe)
  let graine = 20260908;
  const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pixel = (c, u, v, rgb, a) => {
    const x = Math.min(RES - 1, Math.max(0, Math.round(u * RES))), y = Math.min(RES - 1, Math.max(0, Math.round(v * RES)));
    const i = (y * RES + x) * 4;
    c[i] += (rgb[0] - c[i]) * a; c[i + 1] += (rgb[1] - c[i + 1]) * a; c[i + 2] += (rgb[2] - c[i + 2]) * a;
  };
  let posees = 0;
  for (let g = 0; g < 90 && anneaux.length; g++) {
    const t = anneaux[Math.floor(alea() * anneaux.length)];
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const nB = 2 + Math.floor(alea() * 3);
    for (let k = 0; k < nB; k++) {
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
      const n = Math.max(1, Math.ceil(Math.hypot((u1 - u0) * RES, (v1 - v0) * RES)));
      for (let i = 0; i <= n; i++) {
        const tt = i / n;
        pixel(carte, u0 + (u1 - u0) * tt, v0 + (v1 - v0) * tt, NEON8, 0.8);
        pixel(emissive, u0 + (u1 - u0) * tt, v0 + (v1 - v0) * tt, [255, 255, 255], 0.9);
      }
      posees++;
    }
  }
  console.log(`anneaux : ${posees} barres de glyphes`);
  return { carte, emissive };
}
const { carte, emissive } = carteAnneaux();

const prims = [], materiaux = [], images = [], textures = [];
if (S.variante === 'A') {
  // corps : matériau Tripo tel quel (texture JPEG copiée octet pour octet) ;
  // la MÊME texture sert d'emissiveMap (S.emissifCorps) pour faire briller ses lignes néon cuites
  images.push({ data: textureTripo, mimeType: 'image/jpeg' });
  textures.push({ source: 0 });
  materiaux.push({
    name: 'corps_tripo',
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 },
    ...(S.emissifCorps > 0 && {
      emissiveTexture: { index: 0 },
      emissiveFactor: [1, 1, 1],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: S.emissifCorps } },
    }),
    doubleSided: true,
  });
} else {
  // variante B : corps accent_joueur neutre-clair sur les UV Tripo (texture uniforme claire)
  const RC = 128;
  const carteB = new Uint8ClampedArray(RC * RC * 4);
  for (let p = 0; p < RC * RC; p++) { carteB[p * 4] = 235; carteB[p * 4 + 1] = 238; carteB[p * 4 + 2] = 236; carteB[p * 4 + 3] = 255; }
  images.push({ data: Buffer.from(encoderPNG(RC, RC, Buffer.from(carteB.buffer, carteB.byteOffset, carteB.length))), mimeType: 'image/png' });
  textures.push({ source: images.length - 1 });
  materiaux.push({
    name: 'accent_joueur',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      baseColorFactor: [S.facteurCorps, S.facteurCorps, S.facteurCorps, 1],
      metallicFactor: 0.15, roughnessFactor: 0.5,
    },
    doubleSided: true,
  });
}
// anneaux : accent_joueur (teinté, multiplication) + couche émissive (les anneaux brillent)
images.push({ data: Buffer.from(encoderPNG(RES, RES, Buffer.from(carte.buffer, carte.byteOffset, carte.length))), mimeType: 'image/png' });
images.push({ data: Buffer.from(encoderPNG(RES, RES, Buffer.from(emissive.buffer, emissive.byteOffset, emissive.length))), mimeType: 'image/png' });
materiaux.push({
  name: 'accent_joueur',
  pbrMetallicRoughness: {
    baseColorTexture: { index: images.length - 2 },
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.15, roughnessFactor: 0.5,
  },
  emissiveTexture: { index: images.length - 1 },
  emissiveFactor: [NEON8[0] / 255, NEON8[1] / 255, NEON8[2] / 255],
  extensions: { KHR_materials_emissive_strength: { emissiveStrength: 1.6 } },
  doubleSided: true,
});

const pc = exp(corps, true), pa = exp(anneaux, true);
prims.push({ mode: 'TRIANGLES', ...pc, material: 0 });
prims.push({ mode: 'TRIANGLES', ...pa, material: 1 });

mkdirSync(new URL('../modeles/', import.meta.url), { recursive: true });
const SORTIEFINALE = `../modeles/ville_v1_${S.variante}.glb`;
const glb = construireGLB({
  primitives: prims,
  materiaux,
  imagesCustom: images.map(im => ({ data: im.data, mimeType: im.mimeType })),
  extensionsUtilisees: ['KHR_materials_emissive_strength'],
  nom: 'ville_v1',
});
writeFileSync(new URL(SORTIEFINALE, import.meta.url), glb);
console.log(`${SORTIEFINALE} écrit : ${NB_TRIS} tris (corps ${corps.length}, anneaux ${anneaux.length}), ${materiaux.length} matériaux, hauteur ${E}, variante ${S.variante}`);
