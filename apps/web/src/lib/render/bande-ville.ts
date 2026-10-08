/**
 * BANDE-VILLE (décisions Erik 07/10) — bannière de ville style Civ VI.
 *
 * PUR et testé (suite bande-ville.test.ts), SANS PixiJS — le motif des
 * modules wrap/jauges : les SEGMENTS et la GÉOMÉTRIE ici, le dessin dans
 * GameCanvas.svelte (conteneur ville, textes durables — zéro allocation par
 * frame, leçon VUE-VILLE-PERF).
 *
 * D1 bande AAA or-sur-sombre au-dessus du sprite ville : logo de nation à
 * gauche, nom (+ étoile capitale D2), cercle pop ; rangée 2 = tours avant
 * croissance, puis cercle production (INITIALE du nom — `nomItem` — en
 * attendant l'art d'Erik : la structure texte est prête à l'accueillir) et
 * tours restants. Aucun visage, aucun sourire.
 *
 * D3 — rien ne fuit sur l'ennemi : `getFilteredState` garde les villes
 * VISIBLES entières (production/foodStored inclus), donc le masquage
 * croissance/production/ETA est un choix d'AFFICHAGE porté par
 * `construireBanniere` (miroir du panneau, jamais une donnée filtrée).
 *
 * D4 — file vide : cercle production + ETA masqués (pas d'« Infinity » ni
 * de zéro).
 *
 * Les calculs de rendement sont des MIROIRS EXACTS des formules d'affichage
 * de PanneauVille (`yields`, `prodPerTurn`, `growthEta`, `etas[0]`) — mêmes
 * sources de vérité moteur (@game/rules + `coutItem`), zéro duplication de
 * données. La géométrie est partagée par le dessin ET le picking (D6 : le
 * clic bannière = clic ville — une seule source de vérité du rect).
 */
import { BUILDINGS, growthThresholdFor, interiorCitizenFor, interiorCountOf, tileYield, tileKeyOf, toursAvantCroissance } from '@game/rules';
import type { City, GameState, ProductionItem } from '@game/rules';
import { coutItem } from '../fileProduction.js';

/** Constantes 🔶 de calibrage (miroir de badge-population.ts — tailles,
 *  couleurs et positions éditables à l'œil SANS code). Coordonnées locales
 *  du conteneur ville : (0,0) = centre de l'hex, y vers le bas ; le sprite
 *  ville est ancré au sommet bas (+64), son sommet visuel ≈ −64. */
export const BANDE_VILLE = {
  /** Bande UNIQUE (retour d'Erik 08/10 : une seule barre, la production à
   *  droite de la pop) — largeur FIXE ; un nom trop long est ramené par
   *  échelle (jamais de débordement hors du liseré). */
  largeur: 156,
  hauteurBande: 26,
  yBande: -86,
  /** Drapeaux : petites plaquettes sombres NUES (sans liseré, nombres sans
   *  icône — langage Civ VI) pendues sous la bande : l'étiquette « Tours »
   *  à gauche, puis tours avant croissance, puis tours de production. */
  hauteurDrapeaux: 18,
  yDrapeaux: -62,
  largeurDrapeauEtiquette: 46,
  largeurDrapeauNombre: 26,
  gapDrapeaux: 3,
  // Alignés SUR les cercles du dessus (Erik 08/10) : croissance sous le pop,
  // production sous le G ; l'étiquette complète le duo à gauche.
  xDrapeauTours: 1,
  xDrapeauCroissance: 40,
  xDrapeauProd: 63,
  texteEtiquette: 'Tours',
  coin: 6,
  /** Palette AAA or-sur-sombre (mêmes ors que l'UI : #e8c96a / #c9a227). */
  fond: 0x1b1b22,
  alphaFond: 0.85,
  liserOr: { couleur: 0xe8c96a, largeur: 1.5, alpha: 0.9 },
  blanc: 0xffffff,
  or: 0xe8c96a,
  etoile: 0xffd54f,
  contourTexte: 0x1b1b22,
  /** Bande — logo de nation (SVG or du lobby, même table nations.ts). */
  xLogo: -62,
  tailleLogo: 20,
  xNom: -44,
  largeurNomMax: 52,
  policeNom: 12,
  /** Cercle pop (taille de la ville) puis cercle production À SA DROITE. */
  xPop: 40,
  rayonPop: 11,
  policePop: 12,
  xProdCercle: 63,
  rayonProd: 10,
  policeDetail: 12,
} as const;

/** Rect LOCAL (conteneur ville) de la bannière complète (bande + drapeaux,
 *  qui lui sont collés) — source unique du dessin (Graphics) et du picking
 *  (D6 : clic bannière = clic ville). */
export function rectBanniereLocale(): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: -BANDE_VILLE.largeur / 2,
    x1: BANDE_VILLE.largeur / 2,
    y0: BANDE_VILLE.yBande - BANDE_VILLE.hauteurBande / 2,
    y1: BANDE_VILLE.yDrapeaux + BANDE_VILLE.hauteurDrapeaux / 2,
  };
}

/** Fallback initiale de l'item en production : premier GRAPHEME du nom
 *  (`nomItem` — jamais l'id brut), majuscule ; nom vide → chaîne vide
 *  (repli honnête, jamais un crash). */
export function initialeDe(nom: string): string {
  return [...nom.trim()][0]?.toLocaleUpperCase('fr-FR') ?? '';
}

/** Entrée du constructeur : les CANDIDATS d'affichage (croissance/ETA)
 *  calculés par l'appelant au rythme courant — `null` = indéterminé. */
export interface EntreeBanniereVille {
  nom: string;
  pop: number;
  capitale: boolean;
  /** Ville du joueur courant — sinon D3 masque tout détail. */
  mienne: boolean;
  croissance: number | null;
  itemNom: string | null;
  eta: number | null;
}

/** Segments affichés de la bannière — tout ce que le rendu lit, rien de plus. */
export interface BanniereVille {
  nom: string;
  pop: number;
  capitale: boolean;
  /** Tours avant croissance — `null` = masqué (ennemi, plafond, arrêt). */
  croissance: number | null;
  /** Initiale de l'item en production — `null` = masqué (ennemi, file vide D4). */
  initiale: string | null;
  /** Tours restants de l'item — `null` = masqué (ennemi, file vide, arrêt). */
  eta: number | null;
}

/** Données → segments (D1-D4). Une ville ENNEMIE expose nom, pop et
 *  capitale — JAMAIS sa croissance ni sa production, même quand les
 *  candidats existent dans l'état filtré (D3). */
export function construireBanniere(e: EntreeBanniereVille): BanniereVille {
  if (!e.mienne) {
    return { nom: e.nom, pop: e.pop, capitale: e.capitale, croissance: null, initiale: null, eta: null };
  }
  return {
    nom: e.nom,
    pop: e.pop,
    capitale: e.capitale,
    croissance: e.croissance,
    initiale: e.itemNom === null ? null : initialeDe(e.itemNom),
    eta: e.itemNom === null ? null : e.eta,
  };
}

/** Rendements d'affichage d'une ville — MIROIR de PanneauVille (`yields` +
 *  `prodPerTurn`) : centre-ville (case `ville`, 0 nourriture — R-66 rév.) +
 *  tuiles travaillées + citoyens intérieurs, marteaux = ⌊brut × productionMult
 *  × (1 + 0,25×(pop−1))⌋. Pur (ne mute jamais l'état). */
export function rendementsVille(
  state: GameState,
  city: City,
  workedKeys: readonly string[],
  allTechs: readonly string[],
): { food: number; prodPerTurn: number } {
  const p = state.players[city.owner];
  const civ = p && p.civId !== 'neutre' ? { civId: p.civId, era: p.era } : undefined;
  const techs = p?.techsUnlocked ?? [];
  const tier = interiorCitizenFor(city.pop);
  const interior = interiorCountOf(city.pop, workedKeys.length);
  const base =
    tileYield(state.map, city.buildings, tileKeyOf(city), techs, city.wonders, allTechs, civ) ??
    { food: 0, production: 0, commerce: 0 };
  let food = base.food;
  let brut = base.production + interior * tier.production;
  for (const key of workedKeys) {
    const y = tileYield(state.map, city.buildings, key, techs, city.wonders, allTechs);
    if (!y) continue;
    food += y.food;
    brut += y.production;
  }
  let factoryMult = 1;
  for (const b of city.buildings) factoryMult = Math.max(factoryMult, BUILDINGS[b]?.productionMult ?? 1);
  return { food, prodPerTurn: Math.floor(brut * factoryMult * (1 + 0.25 * (city.pop - 1))) };
}

/** Tours avant croissance — MIROIR de `growthEta` (PanneauVille) : plafond
 *  (jauge pleine) ou réserve déjà au seuil → `null` (croissance à la
 *  prochaine résolution) ; surplus nul → `null` (à l'arrêt, pas de zéro). */
export function toursCroissanceBanniere(city: City, foodSurplus: number): number | null {
  let reduction = 0;
  for (const b of city.buildings) reduction = Math.max(reduction, BUILDINGS[b]?.growthThresholdReduction ?? 0);
  const seuil = growthThresholdFor(city.pop, reduction);
  if (seuil === null) return null;
  if (city.foodStored >= seuil) return null;
  return toursAvantCroissance(city.pop, city.foodStored, foodSurplus, reduction);
}

/** Tours restants de l'item en production — miroir de `etas[0]`
 *  (PanneauVille) : `ceil((coût − progression) / marteaux-par-tour)`.
 *  Erik 08/10 : un item en tête EXIGE son drapeau — rythme nul → `Infinity`
 *  (rendu « ∞ », la ville ne produit aucun marteau) ; seul un coût inconnu
 *  reste `null` (repli honnête, masqué). */
export function etaProductionBanniere(item: ProductionItem, progress: number, prodPerTurn: number): number | null {
  const cout = coutItem(item);
  if (cout === null) return null;
  if (prodPerTurn <= 0) return Infinity;
  return Math.ceil((cout - progress) / prodPerTurn);
}
