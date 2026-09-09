// PREPARER-STRUCTURE-TRIPO — habillage minimal d'un asset Tripo de STRUCTURE
// (village barbare, handoff VILLE-TRIPO suite) : la texture du source reste
// octet pour octet (baseColor), elle est AUSSI branchée comme emissiveMap
// (même traitement « rendu de luminosité que la ville », validé par Erik).
// Aucune teinte joueur : les couleurs d'origine sont conservées.
//
// Réécriture SANS re-encodage : le chunk binaire du GLB est recopié tel quel,
// seul le JSON des matériaux est muté.
//
// Usage : node outils/preparer-structure-tripo.mjs <source.glb> <sortie.glb> [forceEmissive] [dy]
//   ex. node outils/preparer-structure-tripo.mjs ../../image_ref/barbare_tripo_2.glb ../modeles/village_barbare_v1.glb 0.7
//   dy : décalage vertical cuit dans le nœud (ex. -0.095 pour affleurer le haut d'un prisme de tuile).

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const [source, sortie, forceArg, dyArg] = process.argv.slice(2);
if (!source || !sortie) throw new Error('usage : preparer-structure-tripo.mjs <source.glb> <sortie.glb> [forceEmissive] [dy]');
const FORCE = forceArg ? Number(forceArg) : 0.7;
if (!Number.isFinite(FORCE) || FORCE < 0 || FORCE > 10) throw new Error(`force emissive invalide : ${forceArg}`);
const DY = dyArg ? Number(dyArg) : 0;
if (!Number.isFinite(DY)) throw new Error(`dy invalide : ${dyArg}`);

// ---------- lecture GLB ----------
const buf = readFileSync(new URL(source, import.meta.url));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const c = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(c.toString('utf8'));
  else if (type === 0x004e4942) bin = c;
  off += 8 + len;
}
if (!json || !bin) throw new Error('GLB incomplet');

// ---------- mutation des matériaux : emissiveMap = texture de base ----------
let traite = 0;
for (const m of json.materials ?? []) {
  const tex = m.pbrMetallicRoughness?.baseColorTexture;
  if (!tex) continue;
  m.emissiveTexture = { index: tex.index };
  m.emissiveFactor = [1, 1, 1];
  m.extensions = { ...(m.extensions ?? {}), KHR_materials_emissive_strength: { emissiveStrength: FORCE } };
  traite++;
}
if (traite === 0) throw new Error('aucun matériau texturé — rien à éclaircir');
json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_materials_emissive_strength'])];
if (DY !== 0) {
  // décalage vertical cuit dans le PREMIER nœud (aucun re-encodage des sommets)
  const noeud = json.nodes?.[0];
  if (!noeud) throw new Error('GLB sans nœud — dy impossible');
  const t = noeud.translation ?? [0, 0, 0];
  noeud.translation = [t[0], t[1] + DY, t[2]];
}
json.asset = { ...json.asset, generator: 'fonderie/outils/preparer-structure-tripo.mjs (emissive auto)' };

// ---------- réécriture GLB (JSON neuf, binaire intact) ----------
const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const padJson = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const jsonFinal = Buffer.concat([jsonBuf, padJson]);
const padBin = Buffer.alloc((4 - (bin.length % 4)) % 4, 0);
const binFinal = Buffer.concat([bin, padBin]);
const total = 12 + 8 + jsonFinal.length + 8 + binFinal.length;
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonFinal.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
jsonFinal.copy(out, 20);
out.writeUInt32LE(binFinal.length, 20 + jsonFinal.length); out.writeUInt32LE(0x004e4942, 24 + jsonFinal.length);
binFinal.copy(out, 28 + jsonFinal.length);

writeFileSync(new URL(sortie, import.meta.url), out);
console.log(`${sortie} écrit : ${traite} matériau(x) émissif(s) (force ${FORCE}), binaire source intact (${(bin.length / 1024).toFixed(0)} Ko)`);
