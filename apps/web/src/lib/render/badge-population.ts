/**
 * MENU-VILLE-RETOUCHES (retour d'Erik du 14/09) — constantes 🔶 du badge de
 * population, posé SUR la case de la ville (auparavant décalé sur la tuile
 * voisine NE, dont il cachait l'icône de rendement). Coordonnées locales du
 * conteneur ville (0,0 = centre de l'hex, y vers le bas, sommets de l'hex à
 * ±HEX_SIZE) ; position/échelle/contraste à calibrer à l'œil par Erik.
 */
export const BADGE_POPULATION = {
  /** Centre du disque, en haut à DROITE de l'hex de la ville — décalé pour ne
   * pas masquer l'asset du bâtiment (retour d'Erik 15/09). */
  x: 22,
  y: -32,
  rayon: 14,
  remplissage: 0x1b1b22,
  alpha: 0.85,
  /** Liseré clair : reste lisible sur les terrains sombres comme clairs. */
  contour: { couleur: 0xe8e4d8, largeur: 2, alpha: 0.9 },
  police: 18,
} as const;
