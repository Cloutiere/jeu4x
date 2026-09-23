/**
 * Tests du convertisseur import_svg (M3 du handoff IMPORT-SVG) :
 *   node --test assets-src/tools/import_svg.test.mjs
 *
 * Couverture : gates (blanc impur rejeté, vrai trou rejeté, dimensions/ratio
 * faux rejetés), résolutions produites, clip hexagone, idempotence du
 * pipeline. Aucun réseau ; fixtures SVG synthétiques + le guerrier d'Erik.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const require = createRequire(import.meta.url);
const sharp = require(path.join(ROOT, 'node_modules', '.pnpm',
  fs.readdirSync(path.join(ROOT, 'node_modules', '.pnpm')).find((d) => /^sharp@/.test(d)),
  'node_modules', 'sharp'));

const outils = await import('./import_svg.mjs');
const { extraireAccent, gateBlancPure, gateTrous, gateDimensions, gateTeintes, importer, lireFactions, suffixeFaction } = outils;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'import-svg-'));
}

const svgBlancPlein = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="100" y="100" width="500" height="500" fill="#333333"/>
  <rect x="150" y="150" width="400" height="400" fill="#FFFFFF"/>
  <circle cx="350" cy="350" r="60" fill="#222222"/>
</svg>`;

function profil(cible, texte = svgBlancPlein, stem = 'test_fixt') {
  return { svg: ecrire(texte), stem, cible };
}

let compteur = 0;
function ecrire(texte) {
  const rel = path.join('dev-logs', 'tmp-chk', `fixture-${Date.now()}-${compteur++}.svg`);
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(path.join(ROOT, rel), texte);
  return rel;
}

test('extraireAccent : isole les paths blancs, garde le viewBox', () => {
  const { svg, nb } = extraireAccent(svgBlancPlein);
  assert.equal(nb, 1);
  assert.match(svg, /<svg[^>]*viewBox="0 0 1024 1024"/);
  assert.match(svg, /fill="#FFFFFF"/);
  assert.doesNotMatch(svg, /#333333/);
});

test('G1 : blanc impur rejeté', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="10" y="10" width="40" height="40" fill="#FEFEFE"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const fautes = await gateBlancPure(png);
  assert.ok(fautes.length > 0, 'le gris 254 doit être rejeté');
});

test('G1 : blanc pur accepté (bords AA tolérés)', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="10" y="10" width="40" height="40" fill="#FFFFFF"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  assert.equal((await gateBlancPure(png)).length, 0);
});

test('G2 : vrai trou (zone claire non couverte) rejeté', async () => {
  // trou dans le blanc posé sur une base CLAIRE : la teinte ne s'y appliquera
  // pas → rejet. (Un trou sur base sombre est légitime : détail percé.)
  const txt = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="4" y="4" width="56" height="56" fill="#EEEECC"/>
    <path fill="#FFFFFF" fill-rule="evenodd" d="M8 8h48v48H8Z M20 20h24v24H20Z"/></svg>`;
  const { svg: accentSvg } = extraireAccent(txt);
  const accent = await sharp(Buffer.from(accentSvg)).png().toBuffer();
  const base = await sharp(Buffer.from(txt)).png().toBuffer();
  const trous = await gateTrous(accent, base);
  assert.ok(trous.length > 0, 'le trou sur base claire doit être rejeté');
  assert.ok(trous[0].taille > 16, 'le trou de 24×24 dépasse la tolérance AA');
});

test('G2 : détails percés acceptés (transparence sur base sombre)', async () => {
  // accent = rendu des formes blanches SEULES, base = rendu complet : le disque
  // sombre est transparent dans l'accent, sombre et opaque dans la base.
  const txt = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="8" y="8" width="48" height="48" fill="#FFFFFF"/>
    <circle cx="32" cy="32" r="12" fill="#222222"/>
  </svg>`;
  const { svg: accentSvg } = extraireAccent(txt);
  const accent = await sharp(Buffer.from(accentSvg)).png().toBuffer();
  const base = await sharp(Buffer.from(txt)).png().toBuffer();
  assert.equal((await gateTrous(accent, base)).length, 0);
});

test('G2 : fentes AA (jonctions de paths) acceptées', async () => {
  // fente de 1 px enfermée entre deux rects blancs, au-dessus d'un fond sombre
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect x="8" y="8" width="48" height="48" fill="#222222"/>
    <rect x="8" y="8" width="27" height="48" fill="#FFFFFF"/>
    <rect x="36" y="8" width="20" height="48" fill="#FFFFFF"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  assert.equal((await gateTrous(png, png)).length, 0);
});

test('percement des détails : l\'accent est percé là où la base est sombre', async () => {
  const dossier = tmp();
  await importer('fixture', {
    profil: profil({ mode: 'unite', w: 128, h: 128, margeX: 8, margeHaut: 8, margeBas: 8 }),
    exports: dossier,
    diagnostics: dossier,
  });
  const acc = await sharp(path.join(dossier, 'test_fixt_accent.png')).raw().toBuffer({ resolveWithObject: true });
  const bas = await sharp(path.join(dossier, 'test_fixt.png')).raw().toBuffer({ resolveWithObject: true });
  const n = acc.info.width * acc.info.height;
  let percés = 0, blancsPleins = 0;
  for (let i = 0; i < n; i++) {
    const aAcc = acc.data[i * 4 + 3], aBas = bas.data[i * 4 + 3];
    if (aAcc === 0 && aBas === 255) percés++;              // détail percé
    if (aAcc === 255 && aBas === 255) blancsPleins++;      // blanc conservé
  }
  assert.ok(percés > 20, `le cercle sombre doit être percé dans l'accent (trouvés : ${percés})`);
  assert.ok(blancsPleins > 500, `le blanc doit rester plein autour (trouvés : ${blancsPleins})`);
});

test('G3 : dimensions/ratio faux rejetés, profil respecté sinon', async () => {
  // porte pure : une production 200×300 contre la cible du catalogue est rejetée
  assert.deepEqual(gateDimensions([200, 300], { w: 256, h: 320 }),
    { attendu: [256, 320], obtenu: [200, 300] });
  assert.equal(gateDimensions([256, 320], { w: 256, h: 320 }), null);
  // intégration : la composition respecte toujours les dimensions du profil
  const dossier2 = tmp();
  const r = await importer('fixture', {
    profil: profil({ mode: 'unite', w: 256, h: 320, margeX: 14, margeHaut: 6, margeBas: 10 }),
    exports: dossier2,
    diagnostics: dossier2,
  });
  assert.equal(r.stem, 'test_fixt');
  for (const f of ['test_fixt.png', 'test_fixt_accent.png']) {
    const meta = await sharp(path.join(dossier2, f)).metadata();
    assert.deepEqual([meta.width, meta.height], [256, 320]);
  }
  // ratio du profil non respecté par un import contournant la cible → rejet
  // (simulation : la porte joue au retour de composition, avant écriture)
});

test('génère les résolutions du catalogue + hexagone (clip + contour)', async () => {
  // grand format
  const d1 = tmp();
  await importer('fixture', {
    profil: profil({ mode: 'unite', w: 256, h: 256, margeX: 8, margeHaut: 8, margeBas: 8 }),
    exports: d1, diagnostics: d1,
  });
  const meta = await sharp(path.join(d1, 'test_fixt.png')).metadata();
  assert.deepEqual([meta.width, meta.height], [256, 256]);

  // tuile hexagonale : décor clippé, contour encre, 224×256
  const decor = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="#A8C86A"/>
    <circle cx="512" cy="512" r="300" fill="#8FB35A"/></svg>`;
  const d2 = tmp();
  await importer('fixture-hex', {
    profil: { svg: ecrire(decor), stem: 'tile_test_hex', cible: { mode: 'hex', w: 224, h: 256 } },
    exports: d2, diagnostics: d2,
  });
  const hexPath = path.join(d2, 'tile_test_hex.png');
  const metaHex = await sharp(hexPath).metadata();
  assert.deepEqual([metaHex.width, metaHex.height], [224, 256]);
  // coin hors hexagone = transparent, centre = opaque
  const { data, info } = await sharp(hexPath).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[(4 * info.width + 2) * 4 + 3], 0, 'coin haut-gauche clippé');
  assert.equal(data[(info.height / 2 * info.width + info.width / 2) * 4 + 3], 255, 'centre opaque');
  // contour encre #2B2620 présent quelque part sur l'axe vertical central (sommet)
  let encre = false;
  for (let y = 0; y < 4; y++) {
    const i = (y * info.width + 112) * 4;
    if (data[i] === 0x2b && data[i + 1] === 0x26 && data[i + 2] === 0x20) encre = true;
  }
  assert.ok(encre, 'contour #2B2620 tracé au sommet de l\'hexagone');
});

test('mode tuile : SVG déjà clippé hexagone → 224×256, contour encre, trou rejeté', async () => {
  // hexagone pointy-top synthétique (comme les tuiles d'Erik : fond
  // transparent autour, décor plein dedans)
  const hexSvg = (contenu) => {
    const w = 1024, h = 1024, hw = w * Math.sqrt(3) / 2, cx = w / 2;
    const pts = [
      [cx, 0], [cx + hw / 2, h / 4], [cx + hw / 2, 3 * h / 4],
      [cx, h], [cx - hw / 2, 3 * h / 4], [cx - hw / 2, h / 4],
    ].map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <polygon points="${pts}" fill="#A8C86A"/>${contenu}</svg>`;
  };
  const cible = { mode: 'tuile', w: 224, h: 256 };

  // décor complet : clip jeu, contour encre, 224×256
  const d1 = tmp();
  await importer('fixture-tuile', {
    profil: { svg: ecrire(hexSvg('')), stem: 'tile_test_tuile', cible },
    exports: d1, diagnostics: d1,
  });
  const pngPath = path.join(d1, 'tile_test_tuile.png');
  const meta = await sharp(pngPath).metadata();
  assert.deepEqual([meta.width, meta.height], [224, 256]);
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[(4 * info.width + 2) * 4 + 3], 0, 'coin haut-gauche hors hexagone = transparent');
  assert.equal(data[(info.height / 2 * info.width + info.width / 2) * 4 + 3], 255, 'centre opaque');
  let encre = false;
  for (let y = 0; y < 4; y++) {
    const i = (y * info.width + 112) * 4;
    if (data[i] === 0x2b && data[i + 1] === 0x26 && data[i + 2] === 0x20) encre = true;
  }
  assert.ok(encre, 'contour #2B2620 tracé au sommet de l\'hexagone');

  // trou intérieur > 16 px² → G2 refuse
  const trou = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs><mask id="m"><rect width="1024" height="1024" fill="#FFFFFF"/>
      <circle cx="512" cy="512" r="120" fill="#000000"/></mask></defs>
    <polygon points="${hexSvg('').match(/points="([^"]+)"/)[1]}" fill="#A8C86A" mask="url(#m)"/></svg>`;
  const d2 = tmp();
  assert.rejects(
    () => importer('fixture-tuile-trou', {
      profil: { svg: ecrire(trou), stem: 'tile_test_trou', cible },
      exports: d2, diagnostics: d2,
    }),
    /décor incomplet/,
  );
});

test('variante cuite : les couleurs sont remplacées dans le PNG (sans accent)', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#FFFFFF"/>
    <rect x="16" y="16" width="96" height="96" fill="#FEFEFE"/>
    <rect x="32" y="32" width="64" height="64" fill="#8C8C8C"/>
  </svg>`;
  const dossier = tmp();
  const r = await importer('j1', {
    profil: {
      svg: ecrire(svg),
      stem: 'test_j1',
      cible: { mode: 'unite', w: 64, h: 64, margeX: 2, margeHaut: 2, margeBas: 2 },
      remplacements: { '#FFFFFF': '#B84239', '#FEFEFE': '#D55B52', '#8C8C8C': '#8A3029' },
    },
    exports: dossier,
    diagnostics: dossier,
  });
  assert.equal(r.stem, 'test_j1');
  // pas de calque accent : seul le PNG de base existe
  assert.ok(fs.existsSync(path.join(dossier, 'test_j1.png')));
  assert.ok(!fs.existsSync(path.join(dossier, 'test_j1_accent.png')));
  // les trois couleurs cibles sont présentes à l'identique dans le rendu
  const { data, info } = await sharp(path.join(dossier, 'test_j1.png')).raw().toBuffer({ resolveWithObject: true });
  const cibles = new Set(['B84239', 'D55B52', '8A3029']);
  const vus = new Set();
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] < 250) continue;
    const k = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
      .map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (cibles.has(k)) vus.add(k);
  }
  assert.deepEqual([...vus].sort(), ['8A3029', 'B84239', 'D55B52']);
});

test('remplacementsPalette : 8 variantes (7 joueurs + barbare), teintes de la palette au pixel', async () => {
  // SVG maître synthétique portant les 3 gris : chaque variante doit rendre
  // EXACTEMENT les 3 teintes de sa faction (±2, gate G5).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#FFFFFF"/>
    <rect x="16" y="16" width="96" height="96" fill="#FEFEFE"/>
    <rect x="32" y="32" width="64" height="64" fill="#8C8C8C"/>
  </svg>`;
  const dossier = tmp();
  const r = await importer('palette-fixture', {
    profil: {
      svg: ecrire(svg),
      stem: 'test_palette',
      cible: { mode: 'unite', w: 64, h: 64, margeX: 2, margeHaut: 2, margeBas: 2 },
      remplacementsPalette: { '#FFFFFF': 'base', '#FEFEFE': 'reflet', '#8C8C8C': 'ombre' },
    },
    exports: dossier,
    diagnostics: dossier,
  });
  const factions = lireFactions();
  assert.deepEqual(r.variantes, Object.keys(factions).map(suffixeFaction).map((s) => `test_palette_${s}`));
  assert.equal(r.variantes.length, 8);
  for (const [cle, f] of Object.entries(factions)) {
    const stem = `test_palette_${suffixeFaction(cle)}`;
    assert.ok(fs.existsSync(path.join(dossier, `${stem}.png`)), stem);
    assert.ok(!fs.existsSync(path.join(dossier, `${stem}_accent.png`)), `${stem} : pas de calque accent (cuit)`);
    const attendues = [f.reflet, f.base, f.ombre];
    assert.deepEqual(await gateTeintes(path.join(dossier, `${stem}.png`), attendues), [], `${stem} : les 3 teintes doivent être au pixel`);
  }
  // La variante p5 reproduit la table Erik (rouge brique, ordre final de la
  // palette : J1 = Bleu Acier) et le barbare le rouge sang dédié (option B
  // tranchée 20/09).
  const { data, info } = await sharp(path.join(dossier, 'test_palette_j5.png')).raw().toBuffer({ resolveWithObject: true });
  const vues = new Set();
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] < 250) continue;
    vues.add([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  for (const hex of ['B84239', 'D55B52', '782822']) assert.ok(vues.has(hex), `p5 (rouge brique) doit porter ${hex}`);
});

test('G5 gateTeintes : tolérance ±2 par canal, teinte absente signalée', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect width="32" height="32" fill="#B84239"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  assert.deepEqual(await gateTeintes(png, ['#B84239']), []);       // exact
  assert.deepEqual(await gateTeintes(png, ['#BA4339']), []);       // +2/+1/+0 → toléré
  assert.deepEqual(await gateTeintes(png, ['#B84340']), ['#B84340']); // +7 bleu → refusé
});

test('idempotence : deux imports du guerrier = mêmes octets', async () => {
  const d1 = tmp(), d2 = tmp();
  const prof = {
    svg: 'full-body-game-sprite-of-an-ancient-bronze-age-war.svg',
    stem: 'unite_guerrier',
    cible: { mode: 'unite', w: 256, h: 320, margeX: 14, margeHaut: 6, margeBas: 10, echelle: 0.75 },
  };
  await importer('guerrier', { profil: prof, exports: d1, diagnostics: d1 });
  await importer('guerrier', { profil: prof, exports: d2, diagnostics: d2 });
  for (const f of ['unite_guerrier.png', 'unite_guerrier_accent.png']) {
    const h1 = crypto.createHash('sha256').update(fs.readFileSync(path.join(d1, f))).digest('hex');
    const h2 = crypto.createHash('sha256').update(fs.readFileSync(path.join(d2, f))).digest('hex');
    assert.equal(h1, h2, `${f} doit être déterministe`);
  }
});

test('remplacementsPalette4 : 8 variantes 4 tons (J1-J7 + barbare=Rouge Royal), G5 4 teintes', async () => {
  // Fixture « peinte à la main » : les 4 hex sources du maître guerrier
  // (rampes saphir d'Erik), SANS forme blanche (pas de calque accent).
  const svg4 = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect x="32" y="32" width="192" height="48" fill="#649EFF"/>
    <rect x="32" y="80" width="192" height="48" fill="#233A9D"/>
    <rect x="32" y="128" width="192" height="48" fill="#4571C4"/>
    <rect x="32" y="176" width="192" height="48" fill="#0d174f"/>
  </svg>`;
  const dossier = tmp();
  const r = await importer('palette4-fixture', {
    profil: {
      svg: ecrire(svg4),
      stem: 'test_p4',
      cible: { mode: 'unite', w: 64, h: 64, margeX: 2, margeHaut: 2, margeBas: 2 },
      remplacementsPalette4: { '#649EFF': 'lightest', '#233A9D': 'base', '#4571C4': 'dark', '#0D174F': 'darkest' },
    },
    exports: dossier,
    diagnostics: dossier,
  });
  // 8 variantes : j1..j7 + barbare (ordre_joueurs4 de accents.json).
  assert.deepEqual(r.variantes, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7', 'barbare'].map((s) => `test_p4_${s}`));
  const { factions4, ordre_joueurs4, barbare4 } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'lib', 'render', 'accents.json'), 'utf8'),
  );
  const cles = [...ordre_joueurs4, barbare4];
  for (const [i, cle] of cles.entries()) {
    const suffixe = i === 7 ? 'barbare' : `j${i + 1}`;
    const stem = `test_p4_${suffixe}`;
    assert.ok(fs.existsSync(path.join(dossier, `${stem}.png`)), stem);
    const f = factions4[cle];
    // G5 étendue : les 4 tons au pixel (±2/canal) — la source #0d174f en
    // minuscules dans la fixture doit être remplacée aussi (casse-insensible).
    assert.deepEqual(
      await gateTeintes(path.join(dossier, `${stem}.png`), [f.lightest, f.base, f.dark, f.darkest]),
      [],
      `${stem} : les 4 tons de ${cle} doivent être au pixel`,
    );
  }
  // Décision Erik 23/09 : le barbare EST le Rouge Royal (identique à J2).
  const lu = fs.readFileSync(path.join(dossier, 'test_p4_barbare.png'));
  const j2 = fs.readFileSync(path.join(dossier, 'test_p4_j2.png'));
  assert.equal(
    crypto.createHash('sha256').update(lu).digest('hex'),
    crypto.createHash('sha256').update(j2).digest('hex'),
    'barbare (rouge royal) = pixels identiques à j2',
  );
  // Le maître n'a pas de calque accent : aucune sortie *_accent.
  assert.ok(!fs.existsSync(path.join(dossier, 'test_p4_accent.png')));
});
