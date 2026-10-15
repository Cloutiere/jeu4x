/**
 * ICONES-UNITES (décisions Erik 07/10) — icônes d'unités : bannière (D1),
 * terrain (D2), garnison compacte (D3), pipeline data-driven (D4).
 *
 * PUR et testé (suite icones-unites.test.ts), SANS PixiJS — le motif des
 * modules bande-ville/calibration-unites : le MAPPING et la GÉOMÉTRIE ici,
 * le dessin dans GameCanvas.svelte. L'art vient d'Erik (`new_icones/units/`,
 * JAMAIS commité tel quel) cuit par le pipeline import_svg (mode « icône »)
 * vers /art/icone_unite_<type>.png ; l'ABSENCE du PNG est l'état « initiale
 * en repli » (aucun trou visuel — D1).
 */
import type { ProductionItem } from '@game/rules';

/** R-148 · ALIAS des unités uniques (source partagée avec textures.ts) :
 *  chaque unique sans art dédiée rend le sprite — ici l'ICÔNE — de l'unité
 *  qu'il remplace. Un PNG `icone_unite_<id>.png` ajouté plus tard prend
 *  automatiquement la main (l'art dédiée prime sur l'alias, cf. nomIcone). */
export const UNIQUE_UNIT_ALIASES: Record<string, string> = {
  guerrier_jaguar: 'guerrier',
  guerrier_impi: 'guerrier',
  hoplite: 'piquier',
  piquier_ashigaru: 'piquier',
  triheme: 'galere',
  archer_long: 'archer',
  keshik: 'cavalier',
  cossaque: 'cavalier',
  cataphracte: 'chevalier',
  conquistador: 'chevalier',
  chevalier_samourai: 'chevalier',
  trebuchet: 'catapulte',
  obusier: 'artillerie',
  canon_88: 'artillerie',
  char_sherman: 'char_d_assaut',
  char_panzer: 'char_d_assaut',
  char_t34: 'char_d_assaut',
  // Val (Japon, bombardier lourd — units.json `replaces`, non implémenté) :
  // icône et sprite suivent le bombardier.
  val: 'bombardier',
  // Avions de l'ère moderne sans planche dédiée 🔶 : silhouette de chasseur.
  flying_fortress: 'chasseur',
  heinkel: 'chasseur',
  lancaster: 'chasseur',
  me109: 'chasseur',
  mustang: 'chasseur',
  spitfire: 'chasseur',
  zero: 'chasseur',
};

/** Type de BASE portant l'art : l'unité elle-même, sinon l'alias R-148. */
export function typeBaseIcone(type: string): string {
  return UNIQUE_UNIT_ALIASES[type] ?? type;
}

/** Nom d'asset PNG de l'icône d'un type (/art/<nom>.png) — mapping D4
 *  data-driven, un seul endroit. */
export function nomIconeUnite(type: string): string {
  return `icone_unite_${typeBaseIcone(type)}`;
}

/** ICONES-BATIMENTS (décisions Erik 14/10) — mapping des BÂTIMENTS et des
 *  MERVEILLES : le moteur nomme en français (`grenier`, `stonehenge`), les
 *  sources d'Erik en anglais — la traduction vit dans les PROFILS du pipeline
 *  (import_svg.profiles.json : `icone_batiment_<id>` / `icone_merveille_<id>`
 *  = nom de moteur). Ici : la règle de nommage seule, data-driven. Une
 *  source absente (ex. `atelier`) = pas de PNG cuit = repli initiale. */
export function nomIconeBatiment(id: string): string {
  return `icone_batiment_${id}`;
}

export function nomIconeMerveille(id: string): string {
  return `icone_merveille_${id}`;
}

/** D1 — icône de bannière pour l'item en tête de file : TOUTE sorte d'item
 *  (unités, bâtiments ET merveilles — Erik 14/10) et seulement si l'art est
 *  chargé ; `null` = initiale en repli (aucun trou visuel, D3 universel). */
export function iconeBannierePour(item: ProductionItem, iconesDisponibles: readonly string[]): string | null {
  const nom =
    item.kind === 'unit'
      ? nomIconeUnite(item.id)
      : item.kind === 'building'
        ? nomIconeBatiment(item.id)
        : item.kind === 'wonder'
          ? nomIconeMerveille(item.id)
          : null;
  return nom !== null && iconesDisponibles.includes(nom) ? nom : null;
}

/** D2 — URL de l'icône d'un item pour l'UI HTML (PanneauVille : liste des
 *  onglets + rangs de la file). Les unités suivent l'alias R-148 ; un PNG
 *  ABSENT (404) est masqué par l'UI (`onerror`) — repli propre, aucun trou. */
export function urlIconeProduction(item: ProductionItem): string {
  const nom =
    item.kind === 'unit'
      ? nomIconeUnite(item.id)
      : item.kind === 'building'
        ? nomIconeBatiment(item.id)
        : item.kind === 'wonder'
          ? nomIconeMerveille(item.id)
          : null;
  return nom === null ? '' : `/art/${nom}.png`;
}

/** Constantes 🔶 de calibrage (éditables à l'œil SANS code). Le carré à
 *  l'accent + la barre de vie réduite occupent ENSEMBLE la largeur de la
 *  barre historique (80 px — D2 : réduction proportionnelle, jamais plus
 *  large qu'avant). */
export const ICONES_UNITES = {
  /** Emprise horizontale totale inchangée (largeur de la barre seule d'hier). */
  largeurTotale: 80,
  /** Carré à l'accent (D2) — côté du carré,-gap avant la barre, taille de
   *  l'icône posée dedans, épaisseur du liseré accent. */
  coteCarre: 20,
  gapCarreBarre: 2,
  tailleIcone: 16,
  liserCarre: 2,
  /** Padding du fond de barre (le fond déborde l'intérieur de 2 px de part
   *  et d'autre — géométrie historique 80/76 conservée). */
  paddingBarre: 2,
  /** Hauteur du carré vs barre (10) : le carré dépasse dessus/dessous. */
  hauteurCarre: 20,
  /** D3 — ligne (y local du conteneur) de l'icône+barre en garnison :
   *  compacte SOUS le centre de l'hex, la ville reste lisible. */
  yGarnison: 10,
} as const;

/** Géométrie de la rangée icône+barre (D2) — sans icône livrée : EXACTEMENT
 *  la géométrie historique (fond 80 à x −40, intérieur 76, cellules 70/3).
 *  Avec icône : le carré occupe la gauche (−40 → −20), la barre le reste
 *  (fond 58 à x −18, cellules proportionnelles) ; l'empreinte totale
 *  (x −40 → +40) est INVARIANTE (test largeur ≤ historique). */
export function geometrieBarre(avecIcone: boolean): {
  xCarre: number;
  xFond: number;
  largeurFond: number;
  xCellule: number;
  largeurInterieure: number;
  largeurCellule: number;
} {
  const interieure = avecIcone
    ? ICONES_UNITES.largeurTotale - ICONES_UNITES.coteCarre - ICONES_UNITES.gapCarreBarre - 2 * ICONES_UNITES.paddingBarre
    : ICONES_UNITES.largeurTotale - 2 * ICONES_UNITES.paddingBarre;
  const xCarre = -ICONES_UNITES.largeurTotale / 2;
  const xFond = avecIcone ? xCarre + ICONES_UNITES.coteCarre + ICONES_UNITES.gapCarreBarre : xCarre;
  return {
    xCarre,
    xFond,
    largeurFond: interieure + 2 * ICONES_UNITES.paddingBarre,
    xCellule: xFond + ICONES_UNITES.paddingBarre,
    largeurInterieure: interieure,
    largeurCellule: (interieure - 2 * 3) / 3, // 3 cellules, 2 encoches de 3 (historique)
  };
}

/** D3 — état d'affichage GARNISON d'une unité posée sur une case de ville
 *  (amie ou ennemie visible) : icône + barre de vie SEULE (sprite masqué),
 *  la pile résumée par le badge ×N existant sur la première unité. Pur. */
export function modeGarnison(entree: {
  /** Case de ville sous l'unité (positions DESSINÉES, ville visible). */
  ville: boolean;
  /** Anim de déplacement en cours : le sprite voyage, jamais compact. */
  anim: boolean;
  /** Rendu 3D actif avec modèle dédié (hors périmètre — sprite déjà masqué). */
  modele3d: boolean;
  /** État « en train de fonder » (le badge fondation prime). */
  fondationArt: boolean;
  /** GARNISON-SELECTION (D1, Erik 14/10) : l'unité est CELLE sélectionnée
   *  (selectedUnitId) — sprite complet à la place de l'icône compacte ;
   *  un ennemi n'est jamais sélectionnable, donc toujours compact. */
  selectionnee: boolean;
  /** Indice de pile (pilesAffichees). */
  index: number;
  total: number;
}): { actif: boolean; visible: boolean; badge: string | null } {
  const actif = entree.ville && !entree.anim && !entree.modele3d && !entree.fondationArt && !entree.selectionnee;
  if (!actif) {
    // GARNISON-SELECTION (D3) : la SÉLECTIONNÉE affiche le sprite complet,
    // mais si elle PORTE le badge de pile (×N), elle le garde — il résume
    // les N−1 autres, restées compactes. Sinon : rendus normaux, nul badge.
    return {
      actif: false,
      visible: true,
      badge:
        (actif || entree.selectionnee) && entree.index === 0 && entree.total > 1 ? `×${entree.total}` : null,
    };
  }
  // Pile : la première unité seule porte l'icône + « ×N » ; les suivantes
  // se masquent (une seule icône par case — la ville reste lisible).
  return { actif: true, visible: entree.index === 0, badge: entree.index === 0 && entree.total > 1 ? `×${entree.total}` : null };
}
