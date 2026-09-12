/**
 * Logique de clic sur la carte (L3) — PURE et testée.
 *
 * Le client ne calcule JAMAIS de règle : il n'affiche/agit que sur ce que
 * l'état filtré autorise (entités présentes = visibles ; cases connues =
 * présentes dans `state.map`). La validation métier reste côté serveur.
 */
import { hexDistance, neighbors, TERRAINS, tileKeyOf, unitType, workRadiusOf, canEnterTerrain, isCoastalCityHex, cargoCapacityOf } from '@game/rules';
import type { Hex } from '@game/rules';
import type { CityId, GameState, UnitId } from '@game/shared';
import type { GameView } from '../gameClient.js';
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
 * 12/09) : le clic gauche SÉLECTIONNE UNIQUEMENT (unité/ville, re-clic =
 * désélection, worked tiles d'une ville sélectionnée R-60). La programmation
 * (déplacement, préview multi-tours au clic maintenu, attaque-par-entrée
 * R-42) passe par le CLIC DROIT (`rightClickAction`).
 */
export function clickAction(view: GameView, ui: UiState, hex: Hex): ClickAction {
  const state = view.state;
  if (!state) return { kind: 'none' };

  // 7m · R-139 : ICBM ARMÉE — n'importe quel clic carte choisit une cible
  // (le lancement n'est soumis qu'après la modale de confirmation, côté page).
  if (ui.nukeArmed) return { kind: 'nukeTarget', hex };

  // 0. Re-clic sur l'entité sélectionnée = désélection (retour Phase 5 L1,
  //    1re partie en ligne). Exception : capitale défendue — le re-clic sur
  //    l'unité sélectionne la ville (alternance deterministic préservée,
  //    le re-clic sur la ville reprend l'unité via la règle 2).
  if (ui.selectedUnitId) {
    const clicked = unitAtHex(state, hex);
    if (clicked && clicked.id === ui.selectedUnitId) {
      const city = cityAtHex(state, hex);
      if (city) return { kind: 'selectCity', cityId: city.id };
      return { kind: 'deselect' };
    }
  }
  if (ui.selectedCityId) {
    const city = cityAtHex(state, hex);
    if (city && city.id === ui.selectedCityId) return { kind: 'deselect' };
  }

  // 1. Ville amie sélectionnée et ordres modifiables : un clic sur une case
  //    réassigne un citoyen (R-60, Phase 6) — avec validation LOCALE des
  //    mêmes contraintes que le moteur, pour un retour immédiat honnête.
  //    INTERACTION-3D : la validation porte sur l'ÉTAT EFFECTIF (ordres
  //    SetWorkedTile en attente appliqués, miroir pop/push du moteur) —
  //    sinon, après une désélection, la ville paraît pleine tout le tour
  //    (l'état connu n'est mis à jour qu'à la résolution) et le re-clic est
  //    refusé à tort.
  const unit = unitAtHex(state, hex);
  const city = unit ? cityAtHex(state, hex) : null;
  if (ui.selectedCityId && ordersEditable(view) && !ui.draft) {
    const selCity = state.cities[ui.selectedCityId];
    if (selCity && selCity.owner === myEngineId(view)) {
      const key = tileKeyOf(hex);
      if (!unit && !city) {
        const effective = effectiveWorkedTiles(view, selCity);
        if (effective.tiles.includes(key)) {
          return { kind: 'setWorkedTile', cityId: selCity.id, tile: null };
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

  // 2. Sélection. Case avec unité ET ville (capitale défendue) : alterner —
  //    1er clic l'unité, 2e clic la ville (le re-clic sur l'unité sélectionnée
  //    est déjà traité en règle 0).
  if (unit && city) {
    if (ui.selectedCityId === city.id) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
    return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  }
  if (unit) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  const aloneCity = cityAtHex(state, hex);
  if (aloneCity) return { kind: 'selectCity', cityId: aloneCity.id };

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
 * INTERACTION-3D · R-60 : état EFFECTIF des cases travaillées d'une ville —
 * les ordres SetWorkedTile en attente (file, un par clic) sont appliqués en
 * miroir exact du moteur (`applySetWorkedTile`) : `null` retire le dernier
 * assigné (pop), une case valide ajoute un citoyen (push, si la ville n'est
 * pas pleine à l'état effectif). Sert au prédicat de clic ET aux marqueurs
 * d'attente 2D/3D. Plus `assigns` (cases gagnées) et `unassigns` (cases
 * libérées) pour l'affichage des anneaux pointillés.
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
    } else if (!tiles.includes(order.tile) && tiles.length < city.pop) {
      tiles.push(order.tile);
      assigns.push(order.tile);
    }
    // case déjà travaillée par la ville, ou ville pleine : ignoré (miroir moteur)
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
