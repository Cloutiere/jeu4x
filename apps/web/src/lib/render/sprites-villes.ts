/**
 * ASSETS-VILLES-ERRES (décisions Erik 15/10) — sprites ville/capitale 4K par
 * ère, UNE image pour toutes les nations.
 *
 * PUR et testé (suite sprites-villes.test.ts), SANS PixiJS — le motif des
 * modules icones-unites/bande-ville : le MAPPING ici, le rendu dans
 * GameCanvas.svelte. D1 : plus aucune variante par accent/joueur pour les
 * villes (le joueur se lit sur la bannière et les frontières). D2 : le sprite
 * affiché suit l'ÈRE COURANTE du joueur propriétaire (R-147, champ `era` de
 * l'état filtré ; transition au tour suivant via EraChanged). D3 : repli —
 * ère absente du mapping ou PNG non cuit = sprite actuel (jamais de trou).
 *
 * Sources Erik `new_villes/` (JAMAIS commitées tel quel), cuites par le
 * pipeline import_svg (mode « unite » 448×512, sans calque accent) vers
 * /art/<stem>.png ; l'ABSENCE du PNG est l'état « repli ».
 */

/** Les 4 ères du moteur (TechEra, R-147) — dupliquées ici pour rester pur et
 *  sans dépendance au paquet rules côté module de rendu. */
export type EraVille = 'ancienne' | 'medievale' | 'industrielle' | 'moderne';

export const ERRES_VILLE: EraVille[] = ['ancienne', 'medievale', 'industrielle', 'moderne'];

/** Noms d'asset (/art/<nom>.png) par (type, ère) — PIÈGES des nommages Erik :
 *  `vile_ancient` (sans L), `vile_medievale` (fichier décalé), et un ESPACE
 *  dans `capitale industrielle_trsp.png` (côté cuisson seulement — le stem
 *  cuit est propre). */
const STEMS: Record<'ville' | 'capitale', Record<EraVille, string>> = {
  ville: {
    ancienne: 'ville_settlement_ancienne',
    medievale: 'ville_settlement_medievale',
    industrielle: 'ville_settlement_industrielle',
    moderne: 'ville_settlement_moderne',
  },
  capitale: {
    ancienne: 'ville_capitale_ancienne',
    medievale: 'ville_capitale_medievale',
    industrielle: 'ville_capitale_industrielle',
    moderne: 'ville_capitale_moderne',
  },
};

/** Sprites de REPLI (art 27/09, une version toutes ères) — utilisés tant que
 *  l'entrée (type, ère) n'est pas cuite. */
export const REPLI_VILLE = 'ville_settlement';
export const REPLI_CAPITALE = 'ville_capitale';

/** Nom d'asset du sprite d'une ville (/art/<nom>.png) — D2 : l'ère est celle
 *  du PROPRIÉTAIRE ; D3 : ère hors mapping → repli (jamais de trou). */
export function nomSpriteVille(capitale: boolean, era: string | undefined): string {
  const type = capitale ? 'capitale' : 'ville';
  const stem = ERRES_VILLE.includes(era as EraVille) ? STEMS[type][era as EraVille] : undefined;
  return stem ?? (capitale ? REPLI_CAPITALE : REPLI_VILLE);
}

/** Clé de rebuild : le conteneur ville est reconstruit (et ses copies couture
 *  recréées) quand cette clé change — c'est le mécanisme de mise à jour à
 *  EraChanged, jamais par frame. */
export function cleSpriteVille(capitale: boolean, era: string | undefined): string {
  return `${capitale ? 'capitale' : 'ville'}@${nomSpriteVille(capitale, era)}`;
}
