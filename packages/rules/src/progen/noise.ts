/**
 * Phase 6b L0 — Bruit fractal seedé (implémentation maison, R-80/R-82).
 *
 * Le PDF d'Erik (§FractalWorld) : la topographie repose sur la superposition
 * d'octaves de bruit de Perlin/Simplex normalisées 0..100, seuillées ensuite
 * (niveau de la mer). Version allégée : Perlin 2D à gradients hashés + fBm.
 *
 * Déterminisme : aucune source d'aléa hors la graine ; le même (seed, x, y)
 * retourne toujours la même valeur, indépendamment de l'ordre d'appel
 * (fonction pure — pas d'état interne).
 */

/** Hash entier 2D + seed → [0, 1). avalanche complète, déterministe. */
function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Gradient de Perlin pour la cellule entière (xi, yi) : angle → vecteur unitaire. */
function gradient(seed: number, xi: number, yi: number): { x: number; y: number } {
  const angle = hash2(seed, xi, yi) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Courbe de fondu de Perlin (quintique — C2 continue). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Perlin 2D brut, plage ≈ [-√2/2, √2/2] (normalisée ci-dessous). */
function perlin(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const g00 = gradient(seed, x0, y0);
  const g10 = gradient(seed, x0 + 1, y0);
  const g01 = gradient(seed, x0, y0 + 1);
  const g11 = gradient(seed, x0 + 1, y0 + 1);
  const d00 = g00.x * fx + g00.y * fy;
  const d10 = g10.x * (fx - 1) + g10.y * fy;
  const d01 = g01.x * fx + g01.y * (fy - 1);
  const d11 = g11.x * (fx - 1) + g11.y * (fy - 1);
  const u = fade(fx);
  const v = fade(fy);
  const a = d00 + u * (d10 - d00);
  const b = d01 + u * (d11 - d01);
  return a + v * (b - a);
}

export interface Noise2d {
  /** Bruit fractal (fBm) dans [0, 1] — 4 octaves, lacunarité 2, gain 0.5. */
  fbm(x: number, y: number): number;
}

/** Fabrique un champ de bruit fBm déterministe par graine. */
export function createNoise2d(seed: number): Noise2d {
  const s = seed | 0;
  // Normalisation : somme des amplitudes = 1 + 0.5 + 0.25 + 0.125 = 1.875.
  const AMP_SUM = 1.875;
  return {
    fbm(x: number, y: number): number {
      let amp = 1;
      let freq = 1;
      let sum = 0;
      for (let octave = 0; octave < 4; octave++) {
        sum += amp * perlin(s + octave * 1013904223, x * freq, y * freq);
        amp *= 0.5;
        freq *= 2;
      }
      // Mappe [-AMP_SUM/2 × √2/2, +…] → [0, 1] (borne théorique √2/2 par axe).
      const v = sum / (AMP_SUM * 0.70710678) / 2 + 0.5;
      return Math.min(1, Math.max(0, v));
    },
  };
}

/** Dérive déterministe d'une sous-graine (mixage entier, sans RNG d'état). */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt | 0, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
