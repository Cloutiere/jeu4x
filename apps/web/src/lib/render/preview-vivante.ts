/**
 * PREVIEW-VIVANTE (décisions Erik 19/10) — préview de trajet au survol.
 *
 * Fonctions PURES et testées : le survol d'une tuile avec une unité amie
 * sélectionnée affiche la préview COMPLÈTE du chemin de clic droit (MÊME
 * calcul que la préview maintenue — `creeCacheChemins().chemin`, priorité de
 * destination, fog R-161, PM — aucune règle nouvelle), au visuel AAA.
 *
 * Ici vivent uniquement : le bloc de style D3 (calibrage data-driven, 🔶 à
 * l'œil Erik — AUCUN littéral de rendu éparillé dans GameCanvas), la coupe
 * tour courant / suite du trajet (tour courant = or plein, suite discrète)
 * et le prédicat d'exclusion D5.
 */
import type { Hex } from '@game/rules';

/**
 * D3 — bloc de style AAA. Toutes les valeurs 🔶 sont calibrables à l'œil
 * sans toucher au rendu : couleurs (hex), alphas (0..1), épaisseurs (px
 * monde), tailles de pointes.
 */
export const STYLE_PREVIEW_VIVANTE = {
  /** Tour courant : or PLEIN (le trajet de la prochaine résolution). */
  couleurTourCourant: 0xffd54f,
  alphaTourCourant: 0.95,
  largeurTourCourant: 6,
  /** Suite du trajet (tours suivants) : discrète, même teinte atténuée. */
  couleurSuite: 0xffe082,
  alphaSuite: 0.35,
  largeurSuite: 3,
  /** Longueur d'un tiret / trou de la suite discrète (unités monde). */
  tiretSuite: 18,
  trouSuite: 14,
  /** Contour sombre sous le tracé — lisibilité sur tous les terrains. */
  couleurContour: 0x2b2620,
  alphaContour: 0.8,
  /** Épaisseur ajoutée de part et d'autre du trait pour le contour. */
  surplusContour: 3,
  /** Pointes : petite sur chaque case traversée, grande à l'arrivée. */
  couleurPointe: 0xffd54f,
  taillePointeCase: 16,
  taillePointeArrivee: 30,
  /** Badge de tours (1), (2)… aux ruptures de tour. */
  couleurBadge: 0xffd54f,
} as const;

/**
 * D3 — coupe un chemin prévu en « tour courant » (les `mp` premières cases —
 * 1 case = 1 PM, miroir du moteur) et « suite du trajet » (tours suivants).
 * Le tour courant est borné à au moins une case (un chemin existant avance
 * toujours) ; un chemin plus court que les PM rend une suite vide. Pur.
 */
export function coupeTourCourant(path: Hex[], mp: number): { courant: Hex[]; reste: Hex[] } {
  if (path.length === 0) return { courant: [], reste: [] };
  const idx = Math.min(Math.max(mp, 1), path.length);
  return { courant: path.slice(0, idx), reste: path.slice(idx) };
}

/**
 * D5 — exclusions de la préview vivante : vue ville, relecture (playback),
 * ordres non modifiables (tour adverse, résolution) et unité ennemie
 * sélectionnée (lecture seule). Les modales et saisies texte couvrent le
 * canvas (le pointermove n'atteint jamais la carte). Pur.
 */
export interface EtatPreviewVivante {
  /** Ordres modifiables (ordersEditable) — tour du joueur, pas de résolution. */
  editable: boolean;
  /** Relecture du dernier tour en cours. */
  playback: boolean;
  /** Vue ville active. */
  vueVille: boolean;
  /** L'unité sélectionnée appartient au joueur. */
  uniteAmie: boolean;
}

export function previewVivanteAutorisee(e: EtatPreviewVivante): boolean {
  return e.editable && !e.playback && !e.vueVille && e.uniteAmie;
}
