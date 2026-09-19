/**
 * Calcul du letterbox (M1.3) — PUR, testé.
 *
 * En plein écran, le contenu à résolution logique fixe (1280×720) est mis à
 * l'échelle au maximum en préservant le ratio de la base, centré dans l'écran ;
 * les bandes restantes sont noires (fond de la fenêtre). Jamais d'étirement,
 * jamais de crop : l'échelle est le MINIMUM des deux rapports.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LetterboxResult {
  /** Facteur d'échelle appliqué (zoomFactor du webContents). */
  echelle: number;
  /** Rect du contenu mis à l'échelle, centré dans le contenant. */
  rect: Rect;
  /** Bandes noires resultantes (0 si le contenant est au ratio de la base). */
  bandeGauche: number;
  bandeHaut: number;
}

/** Conteneur (écran en plein écran, fenêtre en mode fenêtré). */
export interface Conteneur {
  width: number;
  height: number;
}

/** Base de résolution logique (config `resolutionBase`). */
export interface ResolutionBase {
  largeur: number;
  hauteur: number;
}

/**
 * Letterbox maximal d'une base {largeur, hauteur} dans un contenant, en
 * préservant le ratio. Arrondis au sol pour le rect (jamais dépasser le
 * contenant) et au centre pour l'offset.
 */
export function computeLetterbox(conteneur: Conteneur, base: ResolutionBase): LetterboxResult {
  const echelle = Math.min(conteneur.width / base.largeur, conteneur.height / base.hauteur);
  const width = Math.floor(base.largeur * echelle);
  const height = Math.floor(base.hauteur * echelle);
  const x = Math.floor((conteneur.width - width) / 2);
  const y = Math.floor((conteneur.height - height) / 2);
  return { echelle, rect: { x, y, width, height }, bandeGauche: x, bandeHaut: y };
}
