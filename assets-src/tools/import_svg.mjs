#!/usr/bin/env node
/**
 * import_svg — Porte d'entrée des assets SVG fournis par Erik (Recraft).
 *
 * Transforme un SVG validé en PNG de catalogue, dans la même chaîne que
 * generate.py (exports/ → sync-art → public/art). Zéro dépendance réseau :
 * rastérisation via sharp (libvips/librsvg, déjà dans node_modules).
 *
 * Usage :
 *   node tools/import_svg.mjs <profil>            # importe et applique les gates
 *   node tools/import_svg.mjs <profil> --check    # rejoue et vérifie l'idempotence
 *
 * Les profils vivent dans import_svg.profiles.json (un profil = un SVG désigné
 * explicitement par Erik + une cible de catalogue). Politique : le pipeline
 * n'importe QUE les fichiers qu'Erik désigne (profils versionnés).
 *
 * Gates (échec = refus + rendu de diagnostic) :
 *   G1  calque accent blanc PUR : tout pixel opaque = (255,255,255)
 *       (seule tolérance : semi-transparence d'anti-aliasing en bord, où le
 *       blanc reste blanc à alpha partiel) ;
 *   G2  pas de trou : aucun pixel transparent enfermé dans le calque accent ;
 *   G3  dimensions exactes du profil (ratio) ;
 *   G4  poids raisonnable (≤ POIDS_MAX octets par PNG).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPORTS = path.join(ROOT, 'assets-src', 'exports');
const PROFILS = path.join(ROOT, 'assets-src', 'tools', 'import_svg.profiles.json');
const SS = 2;          // rastérisation 2× la cible puis LANCZOS (anti-aliasing)
const POIDS_MAX = 300 * 1024;
const ENCRE = '#2B2620'; // contour hexagonal (identique generate.py INK)

function chargerSharp() {
  const require = createRequire(import.meta.url);
  try {
    return require('sharp');
  } catch {
    // pnpm n'hoiste pas sharp à la racine : résolution directe dans le store
    const store = path.join(ROOT, 'node_modules', '.pnpm');
    const entree = fs.readdirSync(store).find((d) => /^sharp@/.test(d));
    if (!entree) throw new Error('sharp introuvable (node_modules/.pnpm)');
    return require(path.join(store, entree, 'node_modules', 'sharp'));
  }
}

const sharp = chargerSharp();

// ---------------------------------------------------------------- profils

function lireProfils() {
  return JSON.parse(fs.readFileSync(PROFILS, 'utf8'));
}

// ------------------------------------------------- extraction du calque accent

/** Sous-SVG ne contenant que les formes à remplissage blanc (le calque accent).
 *  Même viewBox/defs : la géométrie est pixel-alignée avec le rendu complet. */
function extraireAccent(svgText) {
  const formes = '(?:path|rect|circle|ellipse|polygon)';
  const blancs = svgText.match(
    new RegExp(`<${formes}\\b[^>]*fill="#(?:FFFFFF|ffffff|white)"[^>]*/?>(?:</${formes}>)?`, 'g'),
  ) ?? [];
  if (blancs.length === 0) throw new Error('aucune forme blanche (calque accent) dans le SVG');
  // en-tête = déclaration XML + balise <svg …> complète (le fichier Recraft
  // porte un bloc <metadata> C2PA juste après, qu'il faut exclure)
  const iSvg = svgText.indexOf('<svg');
  const ouverture = svgText.slice(0, svgText.indexOf('>', iSvg) + 1).replace(/<\?xml[^>]*\?>\s*/, '');
  const defs = svgText.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
  return { svg: `${ouverture}${defs}${blancs.join('')}</svg>`, nb: blancs.length };
}

// ---------------------------------------------------------------- rastérisation

/** Rend le SVG à SS× la taille cible (canvas carré viewBox) et renvoie les
 *  pixels bruts RGBA + dimensions, pour bbox et gates. */
async function rasteriser(svgBuffer, taille) {
  const grand = taille * SS;
  const buf = await sharp(svgBuffer, { density: (72 * grand) / 1024 })
    .resize(grand, grand, { fit: 'fill' })
    .png()
    .toBuffer();
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Boîte englobante du contenu opaque (alpha > 0) au pixel près. */
function bboxAlpha({ data, w, h }) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('SVG rendu vide (aucun pixel opaque)');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Composition de la cible : extraction de la bbox à haute résolution,
 *  réduction LANCZOS, ancrage selon le profil. Base et accent partagent la
 *  MÊME transformation (bbox calculée sur la base) → alignement au pixel. */
async function composer(svgBuffer, accentSvg, cible) {
  const W = cible.w, H = cible.h;
  const pleine = await rasteriser(svgBuffer, 1024);
  const bbox = bboxAlpha(pleine);

  const decoupe = { left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height };
  // cible.echelle (défaut 1) : taille du contenu DANS le canvas — le PNG reste
  // aux dimensions du profil (G3), seul le dessin est réduit/agrandi.
  const echelle = Math.min(
    (W - 2 * cible.margeX) / bbox.width,
    (H - cible.margeHaut - cible.margeBas) / bbox.height,
    SS,
  ) * (cible.echelle ?? 1);
  const tw = Math.max(1, Math.round(bbox.width * echelle));
  const th = Math.max(1, Math.round(bbox.height * echelle));
  const left = Math.round((W - tw) / 2);
  const top = H - cible.margeBas - th;

  const rendu = async (buf) => {
    // extract AVANT resize : sharp applique l'extraction à l'image d'entrée
    // (2048² à density 144) — l'ordre inverse est réinterprété pré-resize.
    const r = await sharp(buf, { density: (72 * 1024 * SS) / 1024 })
      .extract(decoupe)
      .resize(tw, th, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    return { buf: r, info: await sharp(r).metadata() };
  };
  const base = await rendu(svgBuffer);
  const accent = await rendu(Buffer.from(accentSvg));

  const canvas = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: base.buf, left, top },
      { input: accent.buf, left, top },
    ])
    .png()
    .toBuffer();
  const accentSeul = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: accent.buf, left, top }])
    .png()
    .toBuffer();
  // normalisation blanc pur : le downscale LANCZOS (prémultiplié) laisse des
  // px (254,254,254) aux bords — le calque accent doit être blanc EXACT.
  const brut = await sharp(accentSeul).raw().toBuffer({ resolveWithObject: true });
  const d = brut.data;
  for (let i = 0; i < brut.info.width * brut.info.height; i++) {
    if (d[i * 4 + 3] > 0) {
      d[i * 4] = 255;
      d[i * 4 + 1] = 255;
      d[i * 4 + 2] = 255;
    }
  }
  const accentPur = await sharp(d, {
    raw: { width: brut.info.width, height: brut.info.height, channels: 4 },
  }).png().toBuffer();
  return { base: canvas, accent: accentPur };
}

// ------------------------------------------------------------------ tuile hex

/** Variante hexagone (terrasse) : SVG = décor SANS bordure, clippé dans la
 *  géométrie exacte du jeu (hex_points de generate.py : 224×256 pointy-top,
 *  largeur h·√3/2) puis contour #2B2620 tracé en code. */
async function composerHex(svgBuffer, cible) {
  const W = cible.w, H = cible.h;
  const cx = W / 2;
  const hw = H * Math.sqrt(3) / 2; // 221.7 pour h=256
  const inset = 0.5;               // clip légèrement inset pour mordre l'AA du bord
  const pts = [
    [cx, inset], [cx + hw / 2 - inset / 2, H / 4], [cx + hw / 2 - inset / 2, (3 * H) / 4],
    [cx, H - inset], [cx - hw / 2 + inset / 2, (3 * H) / 4], [cx - hw / 2 + inset / 2, H / 4],
  ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const couverture = Math.ceil(hw);

  const decor = await sharp(svgBuffer, { density: 144 })
    .resize(couverture, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const gauche = Math.round(cx - couverture / 2);

  const masque = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<polygon points="${pts}" fill="#FFFFFF"/></svg>`,
  );
  const contour = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<polygon points="${pts}" fill="none" stroke="${ENCRE}" stroke-width="2.5"/></svg>`,
  );

  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: decor, left: gauche, top: 0 },
      { input: await sharp(masque).png().toBuffer(), blend: 'dest-in' },
      { input: contour, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  return { base, accent: null };
}

// ---------------------------------------------------------------------- gates

function raw(pngBuffer) {
  return sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
}

/** G1 : blanc pur. Renvoie la liste des violations (max 10, pour diagnostic). */
async function gateBlancPure(accentPng) {
  const { data, info } = await raw(accentPng);
  const fautes = [];
  for (let i = 0; i < info.width * info.height && fautes.length < 10; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a >= 254 && (r !== 255 || g !== 255 || b !== 255)) {
      fautes.push({ x: i % info.width, y: (i / info.width) | 0, rgba: [r, g, b, a] });
    }
  }
  return fautes;
}

/** G2 : aucun VRAI trou (pixel alpha 0 enfermé, zone > AA_TROUS px²) —
 *  flood-fill depuis les bords. Les fentes de 1 px aux jonctions de paths
 *  blancs adjacents sont de l'anti-aliasing (sans effet : la base blanche
 *  reste visible dessous) ; un trou visible plus grand est refusé. */
const AA_TROUS = 16;

async function gateTrous(accentPng) {
  const { data, info } = await raw(accentPng);
  const w = info.width, h = info.height;
  const transparent = (i) => data[i * 4 + 3] === 0;
  const vu = new Uint8Array(w * h);
  const pile = [];
  for (let x = 0; x < w; x++) {
    pile.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    pile.push(y * w, y * w + w - 1);
  }
  for (const i of pile) if (transparent(i)) vu[i] = 1;
  while (pile.length) {
    const i = pile.pop();
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!vu[j] && transparent(j)) {
        vu[j] = 1;
        pile.push(j);
      }
    }
  }
  // composantes connexes de pixels transparents enfermés
  const seen = new Uint8Array(w * h);
  const trous = [];
  for (let i = 0; i < w * h; i++) {
    if (vu[i] || seen[i] || !transparent(i)) continue;
    const q = [i];
    seen[i] = 1;
    let taille = 0, ex = 0, ey = 0;
    while (q.length) {
      const j = q.pop();
      taille++;
      ex = j % w; ey = (j / w) | 0;
      const x = ex, y = ey;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!seen[k] && !vu[k] && transparent(k)) {
          seen[k] = 1;
          q.push(k);
        }
      }
    }
    trous.push({ x: ex, y: ey, taille });
  }
  return trous.filter((t) => t.taille > AA_TROUS);
}

/** G3 : dimensions exactes (fonction pure — renvoie null si conforme,
 *  sinon {attendu, obtenu} ; `dims` = [largeur, hauteur] du PNG produit). */
function gateDimensions(dims, cible) {
  if (dims[0] === cible.w && dims[1] === cible.h) return null;
  return { attendu: [cible.w, cible.h], obtenu: dims };
}

/** Rendu de diagnostic : violations encadrées en rouge sur l'accent. */
async function diagnostic(accentPng, points, chemin) {
  const info = await sharp(accentPng).metadata();
  const croix = points
    .map(({ x, y }) =>
      `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="none" stroke="#FF0000" stroke-width="1.5"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${croix}</svg>`;
  await sharp(accentPng)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(chemin);
}

// ----------------------------------------------------------------------- main

async function importer(nomProfil, options = {}) {
  const profils = lireProfils();
  const profil = options.profil ?? profils[nomProfil];
  if (!profil) {
    throw new Error(`profil inconnu « ${nomProfil} » (profils : ${Object.keys(profils).join(', ')})`);
  }
  const svgPath = path.join(ROOT, profil.svg);
  const dossier = options.exports ?? EXPORTS;
  const dirDiag = options.diagnostics ?? path.join(ROOT, 'dev-logs', 'captures-import-svg');
  const svgText = fs.readFileSync(svgPath, 'utf8');
  const svgBuffer = Buffer.from(svgText);
  const cible = profil.cible;
  // tuile hexagonale : pas de calque accent (décor plein), extraction inutile
  const { svg: accentSvg, nb: nbBlancs } = cible.mode === 'hex'
    ? { svg: null, nb: 0 }
    : extraireAccent(svgText);

  let resultat;
  if (cible.mode === 'hex') {
    resultat = await composerHex(svgBuffer, cible);
  } else {
    resultat = await composer(svgBuffer, accentSvg, cible);
  }

  const erreurs = [];
  const accentPng = resultat.accent ?? resultat.base;

  if (resultat.accent) {
    const fautesBlanc = await gateBlancPure(resultat.accent);
    if (fautesBlanc.length) {
      erreurs.push(`G1 blanc pur : ${fautesBlanc.length}+ pixels opaques non blancs (ex. ${JSON.stringify(fautesBlanc[0])})`);
      await diagnostic(resultat.accent, fautesBlanc, path.join(dirDiag, `diag-${nomProfil}-blanc.png`));
    }
    const trous = await gateTrous(resultat.accent);
    if (trous.length) {
      erreurs.push(`G2 trous : ${trous.length}+ pixels transparents enfermés (ex. ${JSON.stringify(trous[0])})`);
      await diagnostic(resultat.accent, trous, path.join(dirDiag, `diag-${nomProfil}-trous.png`));
    }
  } else if (cible.mode === 'hex') {
    // pas de calque accent sur une tuile : le décor doit couvrir tout l'hexagone
    const trous = await gateTrous(resultat.base);
    if (trous.length) {
      erreurs.push(`G2 hexagone : décor incomplet (${trous.length}+ trous)`);
    }
  }

  const baseMeta = await sharp(resultat.base).metadata();
  const echecDims = gateDimensions([baseMeta.width, baseMeta.height], cible);
  if (echecDims) {
    erreurs.push(`G3 dimensions : attendu ${echecDims.attendu.join('×')}, obtenu ${echecDims.obtenu.join('×')}`);
  }

  if (erreurs.length) {
    throw new Error(`GATES EN ÉCHEC pour « ${nomProfil} » :\n  - ${erreurs.join('\n  - ')}`);
  }

  const sorties = [{ stem: profil.stem, buf: resultat.base }];
  if (resultat.accent) sorties.push({ stem: `${profil.stem}_accent`, buf: resultat.accent });

  for (const { stem, buf } of sorties) {
    const chemin = path.join(dossier, `${stem}.png`);
    const meta = await sharp(buf).metadata();
    if (buf.length > POIDS_MAX) {
      throw new Error(`G4 poids : ${stem}.png = ${(buf.length / 1024).toFixed(0)} Ko > ${(POIDS_MAX / 1024).toFixed(0)} Ko`);
    }
    fs.writeFileSync(chemin, buf);
    console.log(`écrit ${chemin} (${meta.width}×${meta.height}, ${(buf.length / 1024).toFixed(0)} Ko)`);
  }
  console.log(`« ${nomProfil} » : ${nbBlancs} paths blancs → accent ; gates OK`);
  return { stem: profil.stem, nbBlancs };
}

const args = process.argv.slice(2);
if (args[0] && !args[0].startsWith('-')) {
  await importer(args[0]);
} else {
  console.log('usage : node tools/import_svg.mjs <profil>');
}
export { importer, extraireAccent, gateBlancPure, gateTrous, gateDimensions };
