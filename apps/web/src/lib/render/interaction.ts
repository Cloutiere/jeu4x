/**
 * Logique de clic sur la carte (L3) — PURE et testée.
 *
 * Le client ne calcule JAMAIS de règle : il n'affiche/agit que sur ce que
 * l'état filtré autorise (entités présentes = visibles ; cases connues =
 * présentes dans `state.map`). La validation métier reste côté serveur.
 */
import { hexDistance, hexToPixel, neighbors, TERRAINS, tileKeyOf, unitType, workRadiusOf, canEnterTerrain, isCoastalCityHex, cargoCapacityOf } from '@game/rules';
import type { Hex } from '@game/rules';
import type { CityId, GameState, UnitId } from '@game/shared';
import type { GameView } from '../gameClient.js';
import type { ProgramPreview } from '@game/rules';
import type { UiState } from './ui.js';

export type ClickAction =
  | { kind: 'none' }
  | { kind: 'deselect' }
  /** Sélection d'une unité (amie si `mine`, sinon ennemie visible — lecture seule). */
  | { kind: 'selectUnit'; unitId: UnitId; mine: boolean }
  | { kind: 'selectCity'; cityId: CityId }
  /** CORRECTIFS-SELECTION (schéma d'Erik du 08/09) : clic droit = DESTINATION
   *  du déplacement — chemin complet construit (`pathTo`) et soumis. */
  | { kind: 'moveDraft'; path: Hex[]; unitId: UnitId }
  /** Clic droit sans destination valide : annulation unifiée de l'ordre de
   *  l'unité sélectionnée (cf. `annulationOrdre` — M2). */
  | { kind: 'cancelOrder'; unitId: UnitId }
  /** R-60 (Phase 6) : réassignation d'un citoyen — ville sélectionnée, case
   *  cliquée (`null` = désassignation, cf. toggle de la case courante). */
  | { kind: 'setWorkedTile'; cityId: CityId; tile: string | null }
  /** 7m · R-139 : ciblage d'ICBM armée — la case cliquée devient la cible
   *  pressentie (la confirmation reste à l'écran, avant l'ordre `Launch`). */
  | { kind: 'nukeTarget'; hex: Hex };

export function unitAtHex(state: GameState, hex: Hex): { id: UnitId; owner: string } | null {
  for (const u of Object.values(state.units)) {
    // 7g · R-117 : une unité EMBARQUÉE n'est pas une entité de carte — le clic
    // sur le navire sélectionne le navire (la cargaison est dans son panneau).
    if (u.aboard) continue;
    if (u.q === hex.q && u.r === hex.r) return { id: u.id, owner: u.owner };
  }
  return null;
}

/**
 * PILE-AFFICHÉE (retour d'Erik du 17/09) — position DESSINÉE d'une unité :
 * une unité amie programmée est affichée à sa case d'ARRÊT de la prochaine
 * résolution (position optimiste), pas à sa case moteur. Map UnitId → Hex ;
 * les unités sans position affichée (pas d'aperçu, ennemis, arrivée sur
 * ennemi visible) en sont absentes et restent à leur case moteur.
 */
export type PositionsAffichees = Map<UnitId, Hex>;

/** Position affichée PURE d'une unité (miroir de `GameCanvas.positionAfficheeDe`,
 *  consumé par le rendu ET la couche de clic) : case d'arrêt de la prochaine
 *  résolution d'après les aperçus DÉJÀ calculés (`previewPrograms`), null sinon. */
export function positionAfficheeDe(
  state: GameState,
  previews: ProgramPreview[],
  unit: { id: UnitId; owner: string; type?: string },
  myId: string | null,
): Hex | null {
  if (!state || !myId || unit.owner !== myId) return null;
  const p = previews.find((pv) => pv.unitId === unit.id);
  if (!p || p.path.length === 0) return null;
  const type = unit.type ?? state.units[unit.id]?.type;
  const mp = type ? unitType(type).movement : 1;
  return arretProchaineResolution(p.path, mp) ?? p.destination;
}

/**
 * PILE-AFFICHÉE (retour d'Erik du 17/09) — occupants d'une case AU SENS DESSINÉ :
 * une unité programmée est sélectionnable sur sa case d'arrêt affichée (pas sa
 * case de départ — elle n'y est plus visible), les autres sur leur case moteur.
 * Ordre d'insertion de `state.units` (déterministe, miroir du rendu). Pur.
 */
export function unitesSurHex(
  state: GameState,
  hex: Hex,
  positions?: PositionsAffichees,
): Array<{ id: UnitId; owner: string }> {
  const out: Array<{ id: UnitId; owner: string }> = [];
  for (const u of Object.values(state.units)) {
    // 7g · R-117 : une unité EMBARQUÉE n'est pas une entité de carte.
    if (u.aboard) continue;
    const posee = positions?.get(u.id) ?? u;
    if (posee.q === hex.q && posee.r === hex.r) out.push({ id: u.id, owner: u.owner });
  }
  return out;
}

/**
 * PILE-AFFICHÉE (retour d'Erik du 17/09) — disposition VISUELLE d'une
 * cohabitation : plusieurs unités sur la même case sont réduites et décalées
 * pour rester lisibles individuellement (l'empilement n'est plus un régime
 * R-173, mais il existe visuellement — instabilités, arrivées partagées).
 * Étalement horizontal en éventail, bords légèrement à l'avant. Pur, calibrage
 * 🔶 à l'œil (fractions de HEX_SIZE côté appelant).
 */
export function dispositionPile(total: number, index: number): { dx: number; dy: number; echelle: number } {
  if (total <= 1 || index < 0 || index >= total) return { dx: 0, dy: 0, echelle: 1 };
  const mid = (total - 1) / 2;
  return { dx: (index - mid) * 0.5, dy: Math.abs(index - mid) * 0.12, echelle: 0.66 };
}

import { HAUTEUR_UNITE, HAUTEUR_UNITE_PILE, HAUTEUR_UNITE_CENTRE } from './calibration-unites.js';
// PLACEMENT-MELEE : mémoires client (côté d'entrée, stabilisée à la création).
import type { ContexteMelee, Cote } from '../melee.js';

/**
 * CALIBRATION-UNITES (retour d'Erik du 20/09, rév. ZONES-HEX) — disposition
 * VISUELLE d'une cohabitation : l'hexagone (pointy-top) offre 6 ZONES, une par
 * côté, ancrées AU BORD du côté (axes : gauche, droite, haut-gauche,
 * haut-droite, bas-gauche, bas-droite — ordre de REMPLISSAGE). Les nations
 * (triées R-81) remplissent les zones dans l'ordre ; les unités d'une même
 * nation sont EMPILÉES EN ESCALIER DIAGONAL dans leur zone. UNE SEULE nation
 * à plusieurs unités : escalier diagonal centré sur la tuile (même pas que
 * les sections de mêlée — retour d'Erik 21/09). Décalages en
 * fractions de HEX_SIZE côté appelant. Pur, testé. Calibrage 🔶.
 */
const ZONES_HEX: Array<{ x: number; y: number }> = [
  { x: -0.62, y: 0 }, // 1 · gauche (côté ouest)
  { x: 0.62, y: 0 }, // 2 · droite (côté est)
  { x: -0.31, y: -0.54 }, // 3 · haut-gauche (côté nord-ouest)
  { x: 0.31, y: -0.54 }, // 4 · haut-droite (côté nord-est)
  { x: -0.31, y: 0.54 }, // 5 · bas-gauche (côté sud-ouest)
  { x: 0.31, y: 0.54 }, // 6 · bas-droite (côté sud-est)
];
const PAS_ESCALIER = 0.09; // pas diagonal d'empilement intra-zone (fraction de HEX_SIZE)
export const ECHELLE_PILE = HAUTEUR_UNITE_PILE / HAUTEUR_UNITE;
/** Cran INTERMÉDIAIRE (Erik 21/09) de l'unité stabilisée/fortifiée au centre
 *  d'une cohabitation — entre la pleine grandeur et les petites versions. */
export const ECHELLE_CENTRE = HAUTEUR_UNITE_CENTRE / HAUTEUR_UNITE;

/**
 * PLACEMENT-MELEE — offset de bord (fraction de HEX_SIZE) par côté d'entrée :
 * miroir des ZONES_HEX repositionnées par côté RÉEL d'entrée (E = droite,
 * O = gauche, NO/NE = haut, SO/SE = bas). Pointy-top.
 */
const OFFSETS_COTES: Record<Cote, { x: number; y: number }> = {
  O: { x: -0.62, y: 0 },
  E: { x: 0.62, y: 0 },
  NO: { x: -0.31, y: -0.54 },
  NE: { x: 0.31, y: -0.54 },
  SO: { x: -0.31, y: 0.54 },
  SE: { x: 0.31, y: 0.54 },
};

/**
 * PLACEMENT-MELEE (demande d'Erik du 20/09, D1..D7 ; rév.
 * 21/09) — disposition
 * de TOUTE cohabitation (mêlée comme pile amie — décision du 21/09 : mêmes
 * côtés d'hexagone partout) :
 * - unité SEULE : centrée, pleine grandeur (comportement historique) ;
 * - la stabilisée À LA CRÉATION de la mêlée (mémoire client, lib/melee.ts)
 *   est AU CENTRE au CRAN INTERMÉDIAIRE (ECHELLE_CENTRE, demande d'Erik du
 *   21/09), premier plan absolu (z = +1) — c'est LA référence visuelle ;
 *   centre VIDE si elle est morte (D3). Après la fin de la mêlée, les
 *   survivantes GARDENT leur place de mêlée (centre compris, décision du
 *   21/09 — l'escalier centré des piles amies est abrogé) ;
 * - chaque autre unité est posée sur le CÔTÉ par lequel elle a pénétré la
 *   tuile (dernier mouvement connu, D1) ; sans info, repli sur le remplissage
 *   par zones de l'ancienne logique (paquets par nation triée, D1) ;
 * - intra-section : escalier diagonal existant, ordre d'ARRIVÉE — le premier
 *   entré reste au premier plan ancré au bord, chaque nouvelle arrivante se
 *   place DERRIÈRE (z décroissant, D2) ; les nations se MELANGENT dans une
 *   section (D4/D7 — barbares compris).
 * Pur, testé. Calibrage 🔶 : offsets de bord, pas d'escalier, z de la centrale.
 */
export function dispositionMelee(
  unites: Array<{ id: UnitId; owner: string }>,
  cleCase: string,
  contexte: ContexteMelee | null,
): Map<UnitId, { dx: number; dy: number; echelle: number; z: number }> {
  const out = new Map<UnitId, { dx: number; dy: number; echelle: number; z: number }>();
  // Seule sur la case : CENTRÉE, pleine grandeur (historique) — la place de
  // mêlée ne vaut que pour les cohabitations (retour d'Erik 21/09 : une
  // unité seule ne doit jamais être décentrée par son côté d'entrée).
  if (unites.length === 1) {
    out.set(unites[0]!.id, { dx: 0, dy: 0, echelle: 1, z: 0 });
    return out;
  }
  const echelleSection = ECHELLE_PILE;
  // Centre : l'ancienne stabilisée (mémoire persistante tant qu'elle vit sur
  // la case), au cran intermédiaire dès qu'il y a cohabitation.
  const stabiliseeId = contexte?.stabiliseeParCase.get(cleCase);
  if (stabiliseeId && unites.some((u) => u.id === stabiliseeId)) {
    out.set(stabiliseeId, { dx: 0, dy: 0, echelle: ECHELLE_CENTRE, z: 1 });
  }
  // Sections par côté d'entrée connu — ordre d'arrivée (seq), id en bris de
  // égalité (déterminisme si deux événements partageaient un seq).
  const sections = new Map<Cote, Array<{ id: UnitId; owner: string; ordre: number }>>();
  const sansInfo: Array<{ id: UnitId; owner: string }> = [];
  for (const u of unites) {
    if (u.id === stabiliseeId) continue;
    const entree = contexte?.coteParUnite.get(u.id);
    if (entree) {
      const section = sections.get(entree.cote);
      if (section) section.push({ ...u, ordre: entree.ordre });
      else sections.set(entree.cote, [{ ...u, ordre: entree.ordre }]);
    } else {
      sansInfo.push(u);
    }
  }
  for (const [cote, section] of sections) {
    section.sort((a, b) => a.ordre - b.ordre || (a.id < b.id ? -1 : 1));
    const bord = OFFSETS_COTES[cote]!;
    section.forEach((u, ui) => {
      out.set(u.id, { dx: bord.x + ui * PAS_ESCALIER, dy: bord.y - ui * PAS_ESCALIER, echelle: echelleSection, z: ui === 0 ? 0 : -ui });
    });
  }
  // Repli (D1) : les unités sans côté connu reprennent l'ancien remplissage
  // par zones (paquets par nation triée R-81, zone = index de nation) ; une
  // SEULE unité sans aucune info reste centrée (pleine grandeur).
  const parNation = new Map<string, Array<{ id: UnitId; owner: string }>>();
  for (const u of sansInfo) {
    const paquet = parNation.get(u.owner);
    if (paquet) paquet.push(u);
    else parNation.set(u.owner, [u]);
  }
  [...parNation.keys()].sort().forEach((o, ni) => {
    const zone = ZONES_HEX[ni % ZONES_HEX.length]!;
    parNation.get(o)!.forEach((u, ui) => {
      out.set(u.id, { dx: zone.x + ui * PAS_ESCALIER, dy: zone.y - ui * PAS_ESCALIER, echelle: echelleSection, z: ui === 0 ? 0 : -ui });
    });
  });
  return out;
}

/**
 * CALIBRATION-UNITES — disposition pour TOUTES les cases dessinées d'un coup
 * (miroir `pilesAffichees`) : Map UnitId → pose. Pur.
 * PLACEMENT-MELEE rév. 21/09 : TOUTE cohabitation (mêlée OU pile amie —
 * décision d'Erik) passe par `dispositionMelee` (côtés d'entrée, stabilisée
 * au centre au cran intermédiaire, survivantes sur leur place). Une unité
 * seule reste centrée pleine grandeur. `contexte` (mémoires client,
 * lib/melee.ts) est optionnel : null = repli zones pour les cohabitations.
 */
export function dispositionsCohabitation(
  state: GameState,
  positions: PositionsAffichees,
  contexte: ContexteMelee | null = null,
): Map<UnitId, { dx: number; dy: number; echelle: number; z: number }> {
  const groupes = new Map<string, Array<{ id: UnitId; owner: string }>>();
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    const posee = positions.get(u.id) ?? u;
    const key = tileKeyOf(posee);
    const groupe = groupes.get(key);
    if (groupe) groupe.push({ id: u.id, owner: u.owner });
    else groupes.set(key, [{ id: u.id, owner: u.owner }]);
  }
  const out = new Map<UnitId, { dx: number; dy: number; echelle: number; z: number }>();
  for (const [key, groupe] of groupes) {
    const poses = dispositionMelee(groupe, key, contexte);
    for (const [id, pose] of poses) out.set(id, pose);
  }
  return out;
}

/**
 * PILE-AFFICHÉE — indices de pile par unité d'après ses positions DESSINÉES :
 * Map UnitId → { index, total } au sein de sa case (ordre d'insertion du
 * state, miroir exact du rendu et du clic). Pur.
 */
export function pilesAffichees(
  state: GameState,
  positions: PositionsAffichees,
): Map<UnitId, { index: number; total: number }> {
  const groupes = new Map<string, UnitId[]>();
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    const posee = positions.get(u.id) ?? u;
    const key = tileKeyOf(posee);
    const groupe = groupes.get(key);
    if (groupe) groupe.push(u.id);
    else groupes.set(key, [u.id]);
  }
  const out = new Map<UnitId, { index: number; total: number }>();
  for (const groupe of groupes.values()) {
    groupe.forEach((id, index) => out.set(id, { index, total: groupe.length }));
  }
  return out;
}

export function cityAtHex(state: GameState, hex: Hex): { id: CityId; owner: string } | null {
  for (const c of Object.values(state.cities)) {
    if (c.q === hex.q && c.r === hex.r) return { id: c.id, owner: c.owner };
  }
  return null;
}

/** Case connue (présente dans l'état filtré) et praticable — jamais inventée. */
export function passableKnown(state: GameState, hex: Hex): boolean {
  const tile = state.map[tileKeyOf(hex)];
  return !!tile && (TERRAINS[tile.terrain]?.passable ?? false);
}

/**
 * 7g · R-117 : case connue et ENTRABLE PAR CETTE UNITÉ — l'eau est praticable
 * pour les unités navales selon leur classe (`navalAccess`), les villes
 * portuaires acceptent les navires ; pour un terrestre, identique à
 * `passableKnown` (T-11 inchangé).
 */
export function enterableKnown(state: GameState, unit: { type: string } | null, hex: Hex): boolean {
  const tile = state.map[tileKeyOf(hex)];
  if (!tile) return false;
  if (!unit) return passableKnown(state, hex);
  try {
    return canEnterTerrain(unitType(unit.type), tile.terrain, isCoastalCityHex(state.map, hex));
  } catch {
    return passableKnown(state, hex);
  }
}

/** 7g · R-117 : l'entité occupant la case est-elle un transport ami EMBARQUABLE
 *  pour cette unité terrestre (cargaison libre, capacité > 0) ? */
export function boardableTransport(
  state: GameState,
  unit: { id: UnitId; owner: string; type: string },
  occupantId: UnitId,
): boolean {
  if (unitType(unit.type).aquatic) return false;
  const occupant = state.units[occupantId];
  return (
    !!occupant &&
    occupant.owner === unit.owner &&
    !occupant.isArmy &&
    !occupant.cargo &&
    cargoCapacityOf(occupant) > 0
  );
}

/** L'ordre peut-il être modifié (phase « orders », non verrouillé, partie active) ? */
export function ordersEditable(view: GameView): boolean {
  return view.status === 'active' && view.phase === 'orders' && !view.locked;
}

/**
 * Décision de clic PURE (clic GAUCHE — schéma d'Erik du 08/09, réaffirmé le
 * 12/09 ; PILE-AFFICHÉE rev. 17/09) : le clic gauche SÉLECTIONNE UNIQUEMENT
 * (unité/ville, worked tiles d'une ville sélectionnée R-60). La programmation
 * (déplacement, préview multi-tours au clic maintenu, attaque-par-entrée
 * R-42) passe par le CLIC DROIT (`rightClickAction`).
 *
 * `positions` (optionnel) = positions DESSINÉES des unités programmées : le
 * clic cible la case où l'unité est AFFICHÉE (sa case d'arrêt — Erik : « je
 * dois pouvoir la sélectionner en cliquant sur la case où elle se trouve »).
 * Plusieurs unités sur la même case : CHAQUE NOUVEAU CLIC passe à l'unité
 * suivante (cycle, Erik 17/09) ; après la dernière, la ville s'il y en a une,
 * sinon retour à la première.
 */
export function clickAction(view: GameView, ui: UiState, hex: Hex, positions?: PositionsAffichees): ClickAction {
  const state = view.state;
  if (!state) return { kind: 'none' };

  // 7m · R-139 : ICBM ARMÉE — n'importe quel clic carte choisit une cible
  // (le lancement n'est soumis qu'après la modale de confirmation, côté page).
  if (ui.nukeArmed) return { kind: 'nukeTarget', hex };

  // Occupants AU SENS DESSINÉ (position affichée prime sur la case moteur).
  const occupants = unitesSurHex(state, hex, positions);
  const unit = occupants[0] ?? null;
  const city = cityAtHex(state, hex);

  // 0. Re-clic sur la case de l'unité sélectionnée : CYCLE parmi les
  //    cohabitantes (Erik 17/09) — ou, seule sur sa case, désélection
  //    (retour Phase 5 L1). Exception capitale défendue : après le dernier
  //    occupant, le clic sélectionne la ville (alternance préservée, le
  //    re-clic sur la ville reprend l'unité via la règle 2).
  if (ui.selectedUnitId && occupants.some((o) => o.id === ui.selectedUnitId)) {
    if (occupants.length > 1) {
      const idx = occupants.findIndex((o) => o.id === ui.selectedUnitId);
      const next = occupants[idx + 1];
      if (next) return { kind: 'selectUnit', unitId: next.id, mine: next.owner === myEngineId(view) };
      // Dernier occupant : la ville s'il y en a une (alternance capitale), sinon retour à la première.
      if (city) return { kind: 'selectCity', cityId: city.id };
      return { kind: 'selectUnit', unitId: occupants[0]!.id, mine: occupants[0]!.owner === myEngineId(view) };
    }
    if (city) return { kind: 'selectCity', cityId: city.id };
    return { kind: 'deselect' };
  }
  if (ui.selectedCityId) {
    if (city && city.id === ui.selectedCityId) return { kind: 'deselect' };
  }

  // 1. Ville amie sélectionnée et ordres modifiables : un clic sur une case
  //    réassigne un citoyen (R-60, Phase 6) — avec validation LOCALE des
  //    mêmes contraintes que le moteur, pour un retour immédiat honnête.
  //    INTERACTION-3D : la validation porte sur l'ÉTAT EFFECTIF (ordres
  //    SetWorkedTile en attente appliqués, miroir pop/push du moteur) —
  //    sinon, après une désélection, la ville paraît pleine tout le tour
  //    (l'état connu n'est mis à jour qu'à la résolution) et le re-clic est
  //    refusé à tort. `unit`/`city` sont AU SENS DESSINÉ (calculés en tête) :
  //    une unité partie ailleurs ne bloque plus sa case d'origine.
  if (ui.selectedCityId && ordersEditable(view) && !ui.draft) {
    const selCity = state.cities[ui.selectedCityId];
    if (selCity && selCity.owner === myEngineId(view)) {
      const key = tileKeyOf(hex);
      if (!unit && !city) {
        const effective = effectiveWorkedTiles(view, selCity);
        if (effective.tiles.includes(key)) {
          // R-60 rév. WORKED-TILE-EXACT : CETTE tuile précise sort des
          // terrains cultivés (l'ordre porte la case, plus tile:null).
          return { kind: 'setWorkedTile', cityId: selCity.id, tile: key };
        }
        const dist = hexDistance(selCity, hex);
        const workable = !!state.map[key] && !!TERRAINS[state.map[key].terrain]?.yields;
        const free =
          workable &&
          dist >= 1 &&
          dist <= workRadiusOf(selCity.buildings) &&
          !Object.values(state.cities).some((c) => c.q === hex.q && c.r === hex.r) &&
          !Object.values(state.cities).some((c) => c.id !== selCity.id && c.workedTiles.includes(key)) &&
          effective.tiles.length < selCity.pop;
        if (free) return { kind: 'setWorkedTile', cityId: selCity.id, tile: key };
        return { kind: 'none' };
      }
    }
  }

  // 2. Sélection. Case avec unité ET ville (capitale défendue) : le premier
  //    occupant (au sens dessiné) ; l'alternance via ville sélectionnée.
  if (unit && city) {
    return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  }
  if (unit) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  if (city) return { kind: 'selectCity', cityId: city.id };

  // 3. Vide (connu ou brouillard) : déselection.
  //    (RAFFINEMENT-MOUVEMENT, décision d'Erik du 12/09 : la programmation
  //    redevient l'apanage du CLIC DROIT — destination, clic maintenu pour la
  //    préview multi-tours, relâcher = confirmer. L'essai FLECHE-MOUVEMENT du
  //    matin « clic gauche = tuile d'arrivée » est retiré.)
  return { kind: 'deselect' };
}

/** Id moteur du joueur local ('p1'/'p2'), null si pas encore connu. */
export function myEngineId(view: GameView): string | null {
  return view.players.find((p) => p.id === view.playerId)?.engineId ?? null;
}

/**
 * MENU-VILLE (décisions d'Erik du 13/09) — décision de clic PURE en VUE VILLE :
 * le clic sur une tuile du rayon de travail (workRadiusOf — 6 cases, 18 avec
 * Tribunal) assigne/désassigne un citoyen (même file d'ordres SetWorkedTile
 * que le simple clic hors vue, même validation locale — miroir de la règle 1
 * de `clickAction`). Toute autre case : aucun effet (les actions de carte sont
 * inaccessibles pendant la vue ville ; la sortie passe par fermer/Échap/
 * double-clic hors de la ville).
 */
export function clickActionVueVille(view: GameView, cityId: CityId, hex: Hex): ClickAction {
  const state = view.state;
  const city = state?.cities[cityId] ?? null;
  if (!state || !city || !ordersEditable(view)) return { kind: 'none' };
  const key = tileKeyOf(hex);
  if (hex.q === city.q && hex.r === city.r) return { kind: 'none' };
  const dist = hexDistance(city, hex);
  if (dist < 1 || dist > workRadiusOf(city.buildings)) return { kind: 'none' };
  // État EFFECTIF (ordres SetWorkedTile en attente appliqués) — miroir du
  // prédicat de clic hors vue : re-clic sur une case assignée = DÉSÉLECTION
  // EXACTE de CETTE case (R-60 rév., l'ordre porte la case, plus tile:null).
  const effective = effectiveWorkedTiles(view, city);
  if (effective.tiles.includes(key)) return { kind: 'setWorkedTile', cityId: city.id, tile: key };
  const workable = !!state.map[key] && !!TERRAINS[state.map[key].terrain]?.yields;
  const free =
    workable &&
    !unitAtHex(state, hex) &&
    !Object.values(state.cities).some((c) => c.q === hex.q && c.r === hex.r) &&
    !Object.values(state.cities).some((c) => c.id !== city.id && c.workedTiles.includes(key)) &&
    effective.tiles.length < city.pop;
  if (free) return { kind: 'setWorkedTile', cityId: city.id, tile: key };
  return { kind: 'none' };
}

/**
 * INTERACTION-3D · R-60 rév. WORKED-TILE-EXACT : état EFFECTIF des cases
 * travaillées d'une ville — les ordres SetWorkedTile en attente (file, un
 * par clic) sont appliqués en miroir exact du moteur (`applySetWorkedTile`) :
 * `null` retire le dernier assigné (pop, déterministe), une case DÉJÀ
 * TRAVAILLÉE retire CETTE case précise (désélection exacte — l'ancien
 * « échange » est abrogé), une case valide et libre ajoute un citoyen (push,
 * si la ville n'est pas pleine à l'état effectif). Sert au prédicat de clic
 * ET aux marqueurs d'attente 2D/3D. Plus `assigns` (cases gagnées) et
 * `unassigns` (cases libérées) pour l'affichage des anneaux pointillés.
 */
export function effectiveWorkedTiles(
  view: GameView,
  city: { id: CityId; pop: number; workedTiles: string[] },
): { tiles: string[]; assigns: string[]; unassigns: string[] } {
  const tiles = [...city.workedTiles];
  const assigns: string[] = [];
  const unassigns: string[] = [];
  for (const order of view.orders) {
    if (order.type !== 'SetWorkedTile' || order.cityId !== city.id) continue;
    if (order.tile === null) {
      const removed = tiles.pop();
      if (removed) unassigns.push(removed);
    } else if (tiles.includes(order.tile)) {
      // Déjà travaillée par cette ville : désélection EXACTE de cette case
      // (miroir du moteur — pas de permutation, pas de ré-affectation).
      // La case est libérée pour la suite de la file : un ordre ultérieur
      // (re-clic sur la même tuile) peut la remettre en culture.
      tiles.splice(tiles.indexOf(order.tile), 1);
      unassigns.push(order.tile);
    } else if (tiles.length < city.pop) {
      tiles.push(order.tile);
      assigns.push(order.tile);
    }
    // ville pleine, case hors rayon ou non travaillable : ignoré (miroir moteur)
  }
  return { tiles, assigns, unassigns };
}

// ---------------------------------------------------------------------------
// Phase 5 L1 — clic droit = ordre de déplacement, unités sans ordre
// ---------------------------------------------------------------------------

/**
 * Chemin pas à pas (BFS déterministe) vers une case connue praticable, à
 * travers les cases CONNUES praticables uniquement (jamais inventé).
 * INTERACTION-3D (retour d'Erik) : la case de DESTINATION occupée par une
 * unité ALLIÉE est admise — en résolution simultanée l'occupant peut partir
 * avant (R-41), sinon le moteur s'arrête proprement sur la case précédente
 * (R-42/R-30) ; le transit À TRAVERS une case occupée reste refusé. Une case
 * ennemie est admise (l'entrée déclenche le combat R-42, la capture d'une
 * ville vide R-57/R-65). Retourne le chemin SANS l'origine, ou null si
 * aucune case de départ/arrivée invalide ou inatteignable.
 */
export function pathTo(state: GameState, from: Hex, to: Hex): Hex[] | null {
  const fromUnit = unitAtHex(state, from);
  const mover = fromUnit ? state.units[fromUnit.id] ?? null : null;
  // DEPLACEMENT-PLANIFIE · R-161 (D6) : la case d'arrivée INCONNUE (absente de
  // l'état filtré) reste visable — l'unité y entre et s'arrête (un pas dans
  // l'inconnu, le moteur valide le terrain à la résolution).
  const toUnknown = !state.map[tileKeyOf(to)];
  if (!enterableKnown(state, mover, from) || (!enterableKnown(state, mover, to) && !toUnknown)) return null;
  if (from.q === to.q && from.r === to.r) return [];
  // BFS avec voisinage trié (q, r) croissant — déterministe. 7g : le
  // voisinage est évalué pour l'unité elle-même (naval ⇒ eau entrable).
  const cameFrom = new Map<string, string | null>();
  const keyOf = (h: Hex): string => `${h.q},${h.r}`;
  const origin = keyOf(from);
  cameFrom.set(origin, null);
  const queue: Hex[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nexts = neighbors(current)
      .filter((h) => enterableKnown(state, mover, h) || (h.q === to.q && h.r === to.r && toUnknown))
      // pas d'étape intermédiaire sur une unité connue (alliée : R-30 ;
      // ennemie : s'y arrêter pour combattre est un choix explicite, pas un
      // transit) — SAUF la destination elle-même (INTERACTION-3D : occupée
      // par un allié partant ou un ennemi à combattre, le moteur tranche).
      .filter((h) => (h.q === to.q && h.r === to.r) || !unitAtHex(state, h))
      // R-161 (D6) : une case inconnue n'est jamais TRAVERSÉE — seul le pas
      // final peut y entrer (l'aperçu s'arrête au bord du visible + un pas).
      .filter((h) => !!state.map[tileKeyOf(h)] || (h.q === to.q && h.r === to.r))
      .sort((a, b) => a.q - b.q || a.r - b.r);
    for (const n of nexts) {
      const k = keyOf(n);
      if (cameFrom.has(k)) continue;
      cameFrom.set(k, keyOf(current));
      if (n.q === to.q && n.r === to.r) {
        // Reconstituer le chemin origine → cible.
        const path: Hex[] = [];
        let cur: string | null = k;
        while (cur && cur !== origin) {
          const [q, r] = cur.split(',').map(Number);
          path.unshift({ q: q!, r: r! });
          cur = cameFrom.get(cur) ?? null;
        }
        return path;
      }
      if (state.map[tileKeyOf(n)]) queue.push(n); // les cases inconnues ne s'étendent pas
    }
  }
  return null;
}

/**
 * RAFFINEMENT-MOUVEMENT (décisions d'Erik du 12/09, v2) — case d'ARRÊT de la
 * PROCHAINE résolution le long d'un chemin programmé : l'aperçu à l'écran ne
 * montre que ce qui se passera au prochain tour (l'unité s'affiche à cet
 * arrêt, PAS à la destination finale des tours subséquents — la flèche, elle,
 * montre le chemin complet). `mp` = PM de l'unité (1 case = 1 PM). Pur, testé.
 */
export function arretProchaineResolution(path: Hex[], mp: number): Hex | null {
  if (path.length === 0) return null;
  const idx = Math.min(Math.max(mp, 1), path.length) - 1;
  return path[idx] ?? null;
}

/**
 * RAFFINEMENT-MOUVEMENT (décision d'Erik du 12/09, style Civ 7) — jalons de
 * tours le long d'un chemin : avec `mpParTour` cases parcourues par tour
 * (coût moteur actuel : 1 PM par case), la case où se termine le mouvement
 * du tour N porte le badge N — (1) = arrivée au tour 1, (2) = tour 2… Pur,
 * testé. Un chemin plus court qu'un tour ne porte aucun badge.
 */
export function jalonsDeTours(path: Hex[], mpParTour: number): Array<{ hex: Hex; tour: number }> {
  if (mpParTour <= 0 || path.length === 0) return [];
  const jalons: Array<{ hex: Hex; tour: number }> = [];
  for (let i = mpParTour - 1; i < path.length; i += mpParTour) {
    jalons.push({ hex: path[i]!, tour: jalons.length + 1 });
  }
  // Multi-tours : la case d'ARRIVée porte aussi son badge (miroir Civ 7 — le
  // (2) de la capture d'Erik est sur la destination). Un chemin plus court
  // qu'un tour reste sans badge (redondant avec la pointe d'arrivée).
  if (path.length > mpParTour) {
    const dernier = path[path.length - 1]!;
    const dejaBadge = jalons[jalons.length - 1]!.hex.q === dernier.q && jalons[jalons.length - 1]!.hex.r === dernier.r;
    if (!dejaBadge) jalons.push({ hex: dernier, tour: jalons.length + 1 });
  }
  return jalons;
}

/**
 * FLECHE-MOUVEMENT (M1.3) — cache de pathfinding pour la flèche de survol :
 * le BFS (`pathTo`) n'est relancé que quand la case SOUS LE CURSEUR change —
 * une entrée par (unité, case cible), purgé à chaque nouvelle vue serveur
 * (l'état — unités, fog — a changé). Pur : testable et benché.
 */
export function creeCacheChemins(): {
  chemin(state: GameState, from: Hex, cible: Hex): Hex[] | null;
  purge(): void;
  taille(): number;
} {
  const cache = new Map<string, Hex[] | null>();
  return {
    chemin(state, from, cible) {
      const key = `${from.q},${from.r}|${cible.q},${cible.r}`;
      if (!cache.has(key)) cache.set(key, pathTo(state, from, cible));
      return cache.get(key)!;
    },
    purge: () => cache.clear(),
    taille: () => cache.size,
  };
}

/**
 * CORRECTIFS-SELECTION (schéma d'Erik du 08/09) — décision de clic droit
 * PURE : avec une unité AMIE sélectionnée et des ordres modifiables, le clic
 * droit est la DESTINATION du déplacement — le chemin complet est construit
 * (`pathTo`, BFS connu, R-161 fog) et soumis. Un ennemi en dernière case est
 * admis : y entrer déclenche le combat d'entrée (R-42) — c'est aussi la voie
 * d'attaque. Sans unité sélectionnée, hors ordres modifiables, ou sans
 * chemin valide : annulation UNIFIÉE de l'ordre de l'unité sélectionnée
 * (miroir d'Échap — purge brouillon + ordre, cf. M2), sinon aucun effet.
 */
export function rightClickAction(view: GameView, ui: UiState, hex: Hex): ClickAction {
  const state = view.state;
  if (!state || !ordersEditable(view)) return { kind: 'none' };
  const selected = ui.selectedUnitId ? state.units[ui.selectedUnitId] : null;
  if (!selected || selected.owner !== myEngineId(view)) return { kind: 'none' };
  const path = pathTo(state, selected, hex);
  if (path && path.length > 0) return { kind: 'moveDraft', path, unitId: selected.id };
  return { kind: 'cancelOrder', unitId: selected.id };
}

/**
 * CORRECTIFS-SELECTION · M2 — purge UNIFIÉE d'une annulation d'ordre. Cause
 * racine des « flèches orphelines » : l'annulation purgeait un seul des DEUX
 * pools de rendu — « Annuler l'ordre » retirait l'ordre soumis (la flèche
 * d'aperçu ET sa pointe disparaissaient) mais laissait le brouillon UI
 * `ui.draft` (la ligne jaune SANS pointe demeurait sur le terrain) ; à
 * l'inverse, Échap ne purgeait que le brouillon. Cette fonction pure retourne
 * ce que l'annulation de l'unité `unitId` doit produire : faut-il envoyer le
 * CancelOrder (un ordre soumis existe), et quel brouillon UI en résulte
 * (celui de la même unité part ENSEMBLE, les autres sont préservés).
 */
export function annulationOrdre(
  view: GameView,
  ui: UiState,
  unitId: UnitId,
): { ordreExistant: boolean; draft: UiState['draft'] } {
  const ordreExistant = view.orders.some((o) =>
    'unitId' in o ? o.unitId === unitId : o.type === 'FormArmy' && o.members.includes(unitId),
  );
  const draft = ui.draft && ui.draft.unitId === unitId ? null : ui.draft;
  return { ordreExistant, draft };
}

/**
 * ARRIVEE-ENNEMIE (M1, décisions d'Erik du 12/09) — détection PURE d'une
 * arrivée programmée sur une case occupée par une unité ENNEMIE VISIBLE.
 * Entrée : la case d'ARRÊT de la prochaine résolution (`arretProchaineResolution`),
 * la case d'où l'unité arrive (avant-dernière étape du chemin, ou sa position
 * moteur pour un chemin d'une case), l'état FILTRÉ et l'ensemble des cases
 * visibles. Sortie : l'ennemi présent + la direction d'arrivée (vecteur unitaire
 * px moteur, du bord d'où vient l'unité — le fantôme se décale de ce côté).
 *
 * Fog (R-161 prime) : une case non visible ne révèle RIEN — retour null même
 * si une entité existait (l'état filtré ne diffuse de toute façon les ennemis
 * que sur les cases visibles ; le garde est explicite par propreté).
 */
export function arriveeSurEnnemi(
  state: GameState,
  visible: Set<string>,
  arret: Hex,
  origine: Hex | null,
  myId: string | null,
): { ennemi: { id: UnitId; owner: string }; dirX: number; dirY: number } | null {
  if (!visible.has(tileKeyOf(arret))) return null;
  let ennemi: { id: UnitId; owner: string } | null = null;
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    if (u.q === arret.q && u.r === arret.r && u.owner !== myId) {
      ennemi = { id: u.id, owner: u.owner };
      break;
    }
  }
  if (!ennemi) return null;
  // Direction d'arrivée : de la case précédente vers l'arrivée (normalisée) ;
  // sans origine connue, pas de décalage (0, 0 — fantôme centré).
  let dirX = 0;
  let dirY = 0;
  if (origine && (origine.q !== arret.q || origine.r !== arret.r)) {
    const a = hexToPixel(origine, 1);
    const b = hexToPixel(arret, 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dirX = dx / len;
      dirY = dy / len;
    }
  }
  return { ennemi, dirX, dirY };
}

/**
 * ARRIVEE-ENNEMIE (M3) — compteur de « pile » par case d'arrêt : combine les
 * aperçus (`previewPrograms`) par case d'ARRÊT de la prochaine résolution.
 * Retourne une carte clé "q,r" → nombre d'unités programmées y arrivant (≥ 2
 * = badge ×N, un seul fantôme dessiné — langage « pile ×N » de
 * DEPLACEMENT-PLANIFIÉ, jamais d'empilement de fantômes). Pur, testé.
 */
export function arriveesPartagees(
  previews: ProgramPreview[],
  mpDe: (unitId: UnitId) => number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of previews) {
    if (p.path.length === 0) continue;
    const arret = arretProchaineResolution(p.path, mpDe(p.unitId));
    if (!arret) continue;
    const key = tileKeyOf(arret);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Unités du joueur local sans AUCUN ordre pour le tour (ni brouillon soumis,
 * ni chemin gelé, ni fortification R-33) — dialogue de confirmation du
 * « Fin de tour » (Phase 5 L1).
 */
export function unitsWithoutOrders(view: GameView): UnitId[] {
  const state = view.state;
  const mine = myEngineId(view);
  if (!state || !mine) return [];
  return Object.keys(state.units)
    .sort()
    .filter((id) => {
      const u = state.units[id]!;
      if (u.owner !== mine) return false;
      if (u.aboard) return false; // 7g · R-117 : une cargaison n'a pas d'ordre à donner
      if (u.order) return false; // chemin gelé
      if (u.fortified) return false; // R-33 : tenue permanente
      return !view.orders.some((o) => 'unitId' in o && o.unitId === id);
    });
}
