/**
 * ZONE-CULTURELLE-DEGRADE (décisions Erik 07/10) — profil d'alpha PUR du
 * dégradé CONTINU de la zone d'influence culturelle.
 *
 * Fini les 3 couches concentriques à alpha constant (paliers visibles) : une
 * SEULE pente douce (smoothstep) part du bord extérieur de la zone (au
 * liseré, alpha maximal) et décroît graduellement vers l'intérieur, jusqu'au
 * VOILE DE FOND constant qui teinte toute tuile intérieure (la zone se lit
 * comme un bloc). Les transitions inter-tuiles ne montrent aucune marche :
 * l'alpha ne dépend que de la distance au centre de la ville.
 *
 * D1 progression continue · D2 voile de fond · D4 data-driven · D5 textures
 * en cache (la texture radiale est construite À PARTIR de ce profil, cf.
 * GameCanvas) · D6 paliers R-162 / frontierRadius intouchés (gameplay).
 */

/** Bloc de calibrage D4 — à ajuster À L'ŒIL sans toucher au code. */
export const CALIBRAGE_ZONE_CULTURELLE = {
  /** Alpha au bord extérieur de la zone (au liseré) — pente maximale. */
  alphaExt: 0.3,
  /** Voile translucide faible et constant sur tout l'intérieur de la zone. */
  alphaVoile: 0.09,
  /** Portée de la pente, en fraction du rayon, depuis le bord (0..1] :
   *  la zone est au voile pur pour t ≤ 1 − portee. */
  porteePente: 0.5,
  /** Résolution (px) de la texture radiale générée (mise en cache). */
  resolutionTexture: 512,
} as const;

export type CalibrageZoneCulturelle = typeof CALIBRAGE_ZONE_CULTURELLE;

/** Smoothstep canonique 3x² − 2x³ (dérivée nulle aux deux bouts : aucune
 *  marche visible ni au raccord de la pente ni au liseré). */
function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * Profil d'alpha : t = distance au centre normalisée (0 = centre de la
 * ville, 1 = bord extérieur de la zone, au liseré). Valeur du voile en
 * dessous de la pente, montée smoothstep jusqu'à alphaExt au liseré.
 */
export function profilAlpha(t: number, cal: CalibrageZoneCulturelle = CALIBRAGE_ZONE_CULTURELLE): number {
  const deb = 1 - cal.porteePente;
  if (t <= deb) return cal.alphaVoile;
  return cal.alphaVoile + (cal.alphaExt - cal.alphaVoile) * smoothstep((t - deb) / cal.porteePente);
}

/**
 * Arrêts du dégradé radial (CanvasGradient) reproduisant le profil : liste
 * [offset 0..1, alpha] assez dense pour que l'interpolation linéaire du
 * canvas suive le smoothstep sans marche perceptible (la borne
 * continuité des tests s'applique aux arrêts échantillonnés).
 */
export function arretsCanvas(cal: CalibrageZoneCulturelle = CALIBRAGE_ZONE_CULTURELLE, pas = 0.02): Array<[number, number]> {
  const arrets: Array<[number, number]> = [];
  for (let t = 0; t <= 1 + 1e-9; t += pas) {
    arrets.push([Math.min(1, t), profilAlpha(t, cal)]);
  }
  return arrets;
}
