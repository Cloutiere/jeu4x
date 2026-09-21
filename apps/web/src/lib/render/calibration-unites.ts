/**
 * CALIBRATION-UNITES (retour d'Erik du 20/09) — constantes 🔶 de pose des
 * sprites d'unités, éditables à l'œil SANS code (miroir de badge-population.ts).
 *
 * Le CALIBRE est le guerrier Recraft (unite_guerrier, 256×320) : sa hauteur
 * écran fait référence, toutes les autres tailles se règlent relativement à
 * lui via `AJUST_HAUTEUR`. L'ancrage est posé SUR LES PIEDS (anchor 0.5,1
 * dans GameCanvas + offset `PIEDS_Y`) : le bas du sprite touche le bas/
 * centre-bas de l'hexagone quel que soit le ratio du PNG.
 *
 * Zéro gameplay : pose visuelle seulement (rendu 2D, le 3D est intouché).
 */

/** Hauteur d'une unité SEULE, en ratio de la hauteur de l'hexagone (2×HEX_SIZE).
 *  Retour d'Erik du 20/09 : la taille PRÉCÉDENTE (painter 320 px × échelle 0.5 =
 *  160 px écran) = 1.25 × hauteur d'hex. */
export const HAUTEUR_UNITE = 1.25;

/** Hauteur d'une unité EN COHABITATION (taille validée à l'œil par Erik sur la
 *  capture du guerrier — c'est CELLE-LÀ la taille des paquets). L'échelle de
 *  pile de `dispositionCohabitationParNation` en dérive : HAUTEUR_UNITE_PILE /
 *  HAUTEUR_UNITE — le changement de HAUTEUR_UNITE ne change pas la taille des
 *  paquets. */
export const HAUTEUR_UNITE_PILE = 0.55;

/** Hauteur de l'unité STABILISÉE/FORTIFIÉE au centre d'une mêlée — cran
 *  intermédiaire (demande d'Erik du 21/09) entre la pleine grandeur (1.25) et
 *  les petites versions de cohabitation (0.55). L'échelle en dérive dans
 *  render/interaction.ts : HAUTEUR_UNITE_CENTRE / HAUTEUR_UNITE. Calibrage 🔶. */
export const HAUTEUR_UNITE_CENTRE = 0.8;

/** Ajustement INDIVIDUEL par type (1.0 = calibre guerrier). Le guerrier
 *  Recraft EST la référence — ne pas le modifier sans redéfinir le calibre.
 *  Les anciens sprites painter (archer, colon…) se règlent ici s'ils semblent
 *  géants ou nains à côté. */
export const AJUST_HAUTEUR: Record<string, number> = {
  guerrier: 1.0,
};

/** Offset vertical (px, échelle sprite) : les pieds au QUART BAS de la tuile
 *  (retour d'Erik du 20/09 — « posée au milieu » était trop haute ; bord bas de
 *  l'hex à +64, quart bas → +32 avec HEX_SIZE = 64). */
export const PIEDS_Y = 32;

/** Hauteur écran cible d'une unité seule, en px, pour un hex de demi-largeur
 *  `hexSize` (pointy-top : hauteur = 2×hexSize). */
export function hauteurUnitePx(hexSize: number): number {
  return HAUTEUR_UNITE * 2 * hexSize;
}

/**
 * Échelle du sprite d'un type pour que sa hauteur écran (hauteurTexture ×
 * échelle) respecte `hauteurUnitePx` × ajustement du type — quel que soit le
 * ratio du PNG (Recraft 256×320, painter, futur art). Texture dégénérée :
 * repli sur l'ancienne échelle historique 0.5. Pur, testé.
 */
export function echelleUnite(type: string, hauteurTexture: number, hexSize = 64): number {
  if (!(hauteurTexture > 0)) return 0.5;
  return (hauteurUnitePx(hexSize) * (AJUST_HAUTEUR[type] ?? 1)) / hauteurTexture;
}
