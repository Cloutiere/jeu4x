/**
 * COLON-FONDATION (chantier 2D, décisions Erik 13/09) — décision PURE de
 * rendu de l'état « en train de fonder » (le rendu Pixi/Three n'est pas
 * rejouable en vitest ; même split que correctifs-selection). L'état bascule
 * dès l'ordre posé (action finale `foundCity` vivante — ordre courant ou
 * chemin gelé R-158) et disparaît à l'annulation comme à la consommation :
 * `fondateurs` est dérivé de l'aperçu existant, donc tombe avec l'ordre —
 * aucun état UI inventé (miroir du moteur).
 */
export interface EtatFondation {
  /** L'unité est un Colon qui fonde à la fin de son chemin. */
  actif: boolean;
  /** Afficher l'art dédié du slot `colonFondation` (à la place du sprite de base). */
  art: boolean;
  /** Afficher le badge provisoire (art `unite_colonFondation.png` absent). */
  badge: boolean;
}

/** Constantes 🔶 du badge provisoire (marqueur de fondation au-dessus du
 *  Colon, au-dessus de l'écu de fortification) — à l'œil, comme les fantômes. */
export const BADGE_FONDATION = {
  /** Pointe du losange (anchor du conteneur unité, y vers le haut). */
  losange: [
    [0, -196],
    [9, -205],
    [0, -214],
    [-9, -205],
  ] as Array<[number, number]>,
  /** Tige + point vert (l'avenir « ville » qui pousse). */
  tige: { de: [0, -214] as [number, number], vers: [0, -224] as [number, number], point: [0, -227] as [number, number], rayon: 3.5 },
  remplissage: 0xf0c419,
  contour: 0x2b2620,
  point: 0x8ce99a,
} as const;

export function etatFondationColon(opts: {
  type: string;
  unitId: string;
  fondateurs: Set<string>;
  artPresent: boolean;
  modele3d: boolean;
}): EtatFondation {
  const actif = opts.type === 'colon' && opts.fondateurs.has(opts.unitId);
  const art = actif && opts.artPresent;
  return {
    actif,
    art: art && !opts.modele3d,
    badge: actif && !opts.artPresent,
  };
}
