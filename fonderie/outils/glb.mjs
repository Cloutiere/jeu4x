// Exporteur GLB minimal (pur Node, zéro dépendance) — fonderie FONDERIE-3D.
// Supporte : primitives TRIANGLES (POSITION/NORMAL) et LINES (POSITION),
// N matériaux glTF (baseColor, alphaMode BLEND, emissive + emissiveTexture
// via KHR_materials_emissive_strength), 1 image PNG optionnelle (glyphes).

import { deflateSync } from 'node:zlib';

// ---------- PNG (RGBA, sans filtre) ----------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
export function encoderPNG(largeur, hauteur, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (largeur * 4 + 1)] = 0; // filtre none
    rgba.copy(brut, y * (largeur * 4 + 1) + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- utilitaires buffers glTF ----------
class Blob {
  constructor() { this.morceaux = []; this.taille = 0; }
  ajouter(buf) { this.morceaux.push(buf); this.taille += buf.length; return this.offset(); }
  offset() { return this.taille; }
  aligner4() {
    const pad = (4 - (this.taille % 4)) % 4;
    if (pad) this.ajouter(Buffer.alloc(pad));
  }
  buffer() { return Buffer.concat(this.morceaux); }
}

// imagesCustom : [{ data: Buffer, mimeType }] — liste libre d'images (les index de texture
// des matériaux s'y réfèrent directement). Prioritaire sur image/imageEmissive (villes, JPEG Tripo).
export function construireGLB({ primitives, materiaux, image, imageEmissive, imagesCustom, extensionsUtilisees = [], nom = 'guerrier' }) {
  // primitives: [{ mode:'TRIANGLES'|'LINES', positions:Float32Array, normals?:Float32Array, material:index }]
  const blob = new Blob();
  const bufferViews = [], accessors = [], meshes = [];
  let min = [0, 0, 0], max = [0, 0, 0];

  function ajouterBufferView(u8, target) {
    blob.aligner4();
    const offset = blob.taille; // offset de DÉBUT (ajouter() retourne la fin)
    blob.ajouter(u8);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: u8.length, target });
    return bufferViews.length - 1;
  }
  function ajouterAccessorF32(composantes, compte, u8, cible) {
    const bv = ajouterBufferView(u8, cible);
    accessors.push({ bufferView: bv, componentType: 5126, count: compte, type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][composantes - 1], min, max });
    return accessors.length - 1;
  }

  const prims = [];
  for (const p of primitives) {
    const pos = Buffer.from(p.positions.buffer, p.positions.byteOffset, p.positions.byteLength);
    const accPos = ajouterAccessorF32(3, p.positions.length / 3, pos, 34962);
    // bornes
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i += 3)
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
    accessors[accPos].min = mn; accessors[accPos].max = mx;
    min = max = undefined;
    const prim = { mode: p.mode === 'LINES' ? 1 : 4, attributes: { POSITION: accPos }, material: p.material };
    if (p.normals) {
      const nor = Buffer.from(p.normals.buffer, p.normals.byteOffset, p.normals.byteLength);
      prim.attributes.NORMAL = ajouterAccessorF32(3, p.normals.length / 3, nor, 34962);
    }
    if (p.uvs) {
      const uv = Buffer.from(p.uvs.buffer, p.uvs.byteOffset, p.uvs.byteLength);
      prim.attributes.TEXCOORD_0 = ajouterAccessorF32(2, p.uvs.length / 2, uv, 34962);
    }
    prims.push(prim);
  }
  meshes.push({ name: nom, primitives: prims });

  let images, textures;
  if (imagesCustom) {
    images = [], textures = [];
    for (const im of imagesCustom) {
      blob.aligner4();
      images.push({ bufferView: ajouterBufferView(im.data, 0), mimeType: im.mimeType });
      textures.push({ source: images.length - 1 });
    }
  } else if (image) {
    blob.aligner4();
    images = [{ bufferView: ajouterBufferView(image, 0), mimeType: 'image/png' }];
    textures = [{ source: 0 }];
    if (imageEmissive) {
      blob.aligner4();
      images.push({ bufferView: ajouterBufferView(imageEmissive, 0), mimeType: 'image/png' });
      textures.push({ source: 1 });
    }
  }

  blob.aligner4();
  const json = {
    asset: { version: '2.0', generator: 'fonderie/outils/glb.mjs (exporteur minimal)' },
    extensionsUsed: extensionsUtilisees.length ? extensionsUtilisees : undefined,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: nom, mesh: 0 }],
    meshes,
    materials: materiaux,
    accessors,
    bufferViews,
    buffers: [{ byteLength: blob.taille }],
  };
  if (images) { json.images = images; json.textures = textures; }

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const padJson = (4 - (jsonBuf.length % 4)) % 4;
  const jsonFinal = Buffer.concat([jsonBuf, Buffer.alloc(padJson, 0x20)]);

  const total = 12 + 8 + jsonFinal.length + 8 + blob.taille;
  const entete = Buffer.alloc(12);
  entete.writeUInt32LE(0x46546c67, 0); entete.writeUInt32LE(2, 4); entete.writeUInt32LE(total, 8);
  const enteteJson = Buffer.alloc(8);
  enteteJson.writeUInt32LE(jsonFinal.length, 0); enteteJson.writeUInt32LE(0x4e4f534a, 4);
  const enteteBin = Buffer.alloc(8);
  enteteBin.writeUInt32LE(blob.taille, 0); enteteBin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([entete, enteteJson, jsonFinal, enteteBin, blob.buffer()]);
}
