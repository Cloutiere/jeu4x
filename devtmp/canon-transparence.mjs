// ASSETS-UNITS-4K VAGUE5 · D2 — dérivation de transparence des 6 canon JPEG
// (Erik n'a livré que des opaques). Fond = blanc légèrement bruité (~250) ;
// seul le fond CONNECTÉ aux bords devient transparent (les blancs du dessin
// — reflets, fumée — sont préservés), frontière adoucie 1 px.
// Sorties : assets-src/modeles/4k/canon_<c>_trsp.png + planches A/B dev-logs.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
function chargerSharp() {
  try {
    return require('sharp');
  } catch {
    const store = path.join(path.resolve(import.meta.dirname, '..'), 'node_modules', '.pnpm');
    const entree = readdirSync(store).find((d) => /^sharp@/.test(d));
    if (!entree) throw new Error('sharp introuvable (node_modules/.pnpm)');
    return require(path.join(store, entree, 'node_modules', 'sharp'));
  }
}
const sharp = chargerSharp();

const RACINE = path.resolve(import.meta.dirname, '..');
const SEUIL = 26; // distance RGB au blanc sous laquelle un pixel est « fond »
const COULEURS = ['bleu', 'rouge', 'vert', 'jaune', 'orange', 'ardoise'];

mkdirSync(path.join(RACINE, 'assets-src', 'modeles', '4k'), { recursive: true });
const dossierAB = path.join(RACINE, 'dev-logs', 'captures-assets-units-4k-vague5', 'canon');
mkdirSync(dossierAB, { recursive: true });

for (const c of COULEURS) {
  const source = path.join(RACINE, 'new_units', 'new_canon', `canon_${c}.jpeg`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const N = w * h;
  // candidat fond : proche du blanc
  const candidat = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = 255 - data[i * 4], g = 255 - data[i * 4 + 1], b = 255 - data[i * 4 + 2];
    const dist = Math.sqrt(r * r + g * g + b * b);
    candidat[i] = dist < SEUIL ? 1 : 0;
  }
  // flood fill depuis les bords
  const fond = new Uint8Array(N);
  const pile = [];
  const pousser = (i) => { if (candidat[i] && !fond[i]) { fond[i] = 1; pile.push(i); } };
  for (let x = 0; x < w; x++) { pousser(x); pousser((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pousser(y * w); pousser(y * w + w - 1); }
  while (pile.length) {
    const i = pile.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) pousser(i - 1);
    if (x < w - 1) pousser(i + 1);
    if (y > 0) pousser(i - w);
    if (y < h - 1) pousser(i + w);
  }
  // alpha : fond 0, contenu 255, frontière adoucie (boîte 3×3 sur l'alpha binaire)
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) alpha[i] = fond[i] ? 0 : 255;
  const doux = Buffer.alloc(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i] === 255 && !candidat[i]) { doux[i] = 255; continue; }
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) { s += alpha[ny * w + nx]; n++; }
      }
      doux[i] = Math.round(s / n);
    }
  }
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = data[i * 4];
    rgba[i * 4 + 1] = data[i * 4 + 1];
    rgba[i * 4 + 2] = data[i * 4 + 2];
    rgba[i * 4 + 3] = doux[i];
  }
  const sortie = path.join(RACINE, 'assets-src', 'modeles', '4k', `canon_${c}_trsp.png`);
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(sortie);
  // bbox seuil 9 (contrôle)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (doux[y * w + x] >= 9) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  // planche A/B (gauche = JPEG opaque, droite = dérivé sur damier)
  const petit = await sharp(await sharp(source).resize(512, 512).png().toBuffer()).png().toBuffer();
  const apres = await sharp(sortie).resize(512, 512).png().toBuffer();
  const damier = Buffer.alloc(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const clair = ((x >> 4) + (y >> 4)) % 2 === 0;
    damier[i] = damier[i + 1] = damier[i + 2] = clair ? 90 : 60;
    damier[i + 3] = 255;
  }
  const fondDamier = await sharp(damier, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
  const droite = await sharp(fondDamier).composite([{ input: apres }]).png().toBuffer();
  await sharp({ create: { width: 1024, height: 512, channels: 3, background: { r: 40, g: 40, b: 48 } } })
    .composite([{ input: petit, left: 0, top: 0 }, { input: droite, left: 512, top: 0 }])
    .png().toFile(path.join(dossierAB, `ab_canon_${c}.png`));
  console.log(c, `bbox (${x0},${y0}) ${x1 - x0 + 1}×${y1 - y0 + 1}`);
}
