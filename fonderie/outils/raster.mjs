// RASTER — rasteriseur PNG orthographique partagé (z-buffer + Lambert plat).
// Utilisé par rendre-png.mjs (aperçu brut d'un .glb) et habiller-guerrier.mjs
// (mode zones brutes + simulation d'habillage) pour itérer sans navigateur.

import { writeFileSync, mkdirSync } from 'node:fs';
import { encoderPNG } from './glb.mjs';

const FOND = [14, 18, 30];

function normaliser(v) { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; }

// triangles : [{ positions: Float32Array(xyz,xyz,...), groupe }] — déjà expandus
// lignes : [{ positions: Float32Array(x1,y1,z1,x2,y2,z2,...), groupe }]
// vues : { nom: [droite(3), haut(3), avant(3)] }
export function rendreVues({ triangles, lignes = [], vues, taille = 420, destBase, palette, paletteLignes = null, groupesPlein = null, nomFichier = (v) => `${destBase}-${v}.png` }) {
  mkdirSync(new URL('../captures/', import.meta.url), { recursive: true });
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of triangles) {
    const p = t.positions;
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  }
  const ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const rayon = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 0.55;

  for (const [nom, [droite, haut, avant]] of Object.entries(vues)) {
    const img = new Uint8Array(taille * taille * 4);
    for (let i = 0; i < taille * taille; i++) {
      img[i * 4] = FOND[0]; img[i * 4 + 1] = FOND[1]; img[i * 4 + 2] = FOND[2]; img[i * 4 + 3] = 255;
    }
    const zbuf = new Float32Array(taille * taille).fill(Infinity);
    const proj = (x, y, z) => {
      x -= ctr[0]; y -= ctr[1]; z -= ctr[2];
      return {
        u: (x * droite[0] + y * droite[1] + z * droite[2]) / rayon,
        v: (x * haut[0] + y * haut[1] + z * haut[2]) / rayon,
        d: -(x * avant[0] + y * avant[1] + z * avant[2]), // distance CAMÉRA (petit = proche)
      };
    };
    const L = normaliser([-0.45, 0.8, 0.35]);

    for (const tset of triangles) {
      const p = tset.positions, coul = palette[tset.groupe] || [0.5, 0.5, 0.5];
      const plein = groupesPlein && groupesPlein.includes(tset.groupe); // émissif simulé
      const NT = p.length / 9;
      for (let t = 0; t < NT; t++) {
        const i0 = t * 9, i1 = i0 + 3, i2 = i0 + 6;
        const ux = p[i1] - p[i0], uy = p[i1 + 1] - p[i0 + 1], uz = p[i1 + 2] - p[i0 + 2];
        const vx = p[i2] - p[i0], vy = p[i2 + 1] - p[i0 + 1], vz = p[i2 + 2] - p[i0 + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-12) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const clair = plein ? 1 : 0.25 + 0.75 * Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
        const p0 = proj(p[i0], p[i0 + 1], p[i0 + 2]), p1 = proj(p[i1], p[i1 + 1], p[i1 + 2]), p2 = proj(p[i2], p[i2 + 1], p[i2 + 2]);
        const sx0 = (p0.u * 0.5 + 0.5) * taille, sy0 = (0.5 - p0.v * 0.5) * taille;
        const sx1 = (p1.u * 0.5 + 0.5) * taille, sy1 = (0.5 - p1.v * 0.5) * taille;
        const sx2 = (p2.u * 0.5 + 0.5) * taille, sy2 = (0.5 - p2.v * 0.5) * taille;
        const aire = (sx1 - sx0) * (sy2 - sy0) - (sy1 - sy0) * (sx2 - sx0);
        if (Math.abs(aire) < 1e-7) continue;
        const x0 = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2))), x1 = Math.min(taille - 1, Math.ceil(Math.max(sx0, sx1, sx2)));
        const y0 = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2))), y1 = Math.min(taille - 1, Math.ceil(Math.max(sy0, sy1, sy2)));
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          const ppx = gx + 0.5, ppy = gy + 0.5;
          const w0 = ((sx1 - ppx) * (sy2 - ppy) - (sy1 - ppy) * (sx2 - ppx)) / aire;
          const w1 = ((sx2 - ppx) * (sy0 - ppy) - (sy2 - ppy) * (sx0 - ppx)) / aire;
          const w2 = ((sx0 - ppx) * (sy1 - ppy) - (sy0 - ppy) * (sx1 - ppx)) / aire;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const d = w0 * p0.d + w1 * p1.d + w2 * p2.d;
          const i = gy * taille + gx;
          if (d < zbuf[i]) {
            zbuf[i] = d;
            img[i * 4] = Math.min(255, Math.round(coul[0] * clair * 255));
            img[i * 4 + 1] = Math.min(255, Math.round(coul[1] * clair * 255));
            img[i * 4 + 2] = Math.min(255, Math.round(coul[2] * clair * 255));
          }
        }
      }
    }

    // lignes néon (dessinées après, test de profondeur avec biais)
    for (const lset of lignes) {
      const p = lset.positions, coul = (paletteLignes && paletteLignes[lset.groupe]) || [0.24, 1.0, 0.81];
      for (let i = 0; i < p.length; i += 6) {
        tracerLigne(img, zbuf, taille, proj(p[i], p[i + 1], p[i + 2]), proj(p[i + 3], p[i + 4], p[i + 5]), coul);
      }
    }

    const dest = nomFichier(nom);
    writeFileSync(new URL(dest, import.meta.url), encoderPNG(taille, taille, Buffer.from(img)));
    console.log(`écrit ${dest}`);
  }
}

function tracerLigne(img, zbuf, taille, a, b, coul) {
  const ax = (a.u * 0.5 + 0.5) * taille, ay = (0.5 - a.v * 0.5) * taille;
  const bx = (b.u * 0.5 + 0.5) * taille, by = (0.5 - b.v * 0.5) * taille;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const gx = Math.round(ax + (bx - ax) * t), gy = Math.round(ay + (by - ay) * t);
    if (gx < 0 || gy < 0 || gx >= taille || gy >= taille) continue;
    const d = a.d + (b.d - a.d) * t - 0.015; // biais de profondeur
    const k = gy * taille + gx;
    if (d <= zbuf[k] + 0.02) {
      img[k * 4] = Math.round(coul[0] * 255);
      img[k * 4 + 1] = Math.round(coul[1] * 255);
      img[k * 4 + 2] = Math.round(coul[2] * 255);
    }
  }
}

// vues standard (même convention que rendre-png)
export const VUES = {
  avant: [[1, 0, 0], [0, 1, 0], [0, 0, -1]],
  arriere: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
  gauche: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]],
  droite: [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
  dessus: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
};
