/**
 * Logique de clic sur la carte (L3) — PURE et testée.
 *
 * Le client ne calcule JAMAIS de règle : il n'affiche/agit que sur ce que
 * l'état filtré autorise (entités présentes = visibles ; cases connues =
 * présentes dans `state.map`). La validation métier reste côté serveur.
 */
import { hexDistance, neighbors, TERRAINS, tileKeyOf, unitType } from '@game/rules';
import type { Hex, Order } from '@game/rules';
import type { CityId, GameState, UnitId } from '@game/shared';
import type { GameView } from '../gameClient.js';
import type { UiState } from './ui.js';

export type ClickAction =
  | { kind: 'none' }
  | { kind: 'deselect' }
  /** Sélection d'une unité (amie si `mine`, sinon ennemie visible — lecture seule). */
  | { kind: 'selectUnit'; unitId: UnitId; mine: boolean }
  | { kind: 'selectCity'; cityId: CityId }
  /** Extension/troncature du chemin en construction (`unitId` : armer un
   *  brouillon frais sur cette unité si aucun n'est actif — entrée de ville). */
  | { kind: 'extend'; path: Hex[]; unitId?: UnitId }
  | { kind: 'truncate'; path: Hex[] }
  /** Attaque directe d'une case ennemie visible adjacente. */
  | { kind: 'attack'; order: Order };

/** Clic droit (Phase 5 L1) : chemin complet vers la case visée, ou annulation. */
export type RightClickAction = { kind: 'moveDraft'; path: Hex[]; unitId: UnitId } | { kind: 'cancelDraft' };

export function unitAtHex(state: GameState, hex: Hex): { id: UnitId; owner: string } | null {
  for (const u of Object.values(state.units)) {
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

function areNeighbors(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1 && neighbors(a).some((n) => n.q === b.q && n.r === b.r);
}

/** L'ordre peut-il être modifié (phase « orders », non verrouillé, partie active) ? */
export function ordersEditable(view: GameView): boolean {
  return view.status === 'active' && view.phase === 'orders' && !view.locked;
}

/** Décision de clic PURE : hex cliquée + vue + état UI → action. */
export function clickAction(view: GameView, ui: UiState, hex: Hex): ClickAction {
  const state = view.state;
  if (!state) return { kind: 'none' };

  const selected = ui.selectedUnitId ? state.units[ui.selectedUnitId] : null;

  // 0. Re-clic sur l'entité sélectionnée = désélection (retour Phase 5 L1,
  //    1re partie en ligne). Exception : capitale défendue — le re-clic sur
  //    l'unité sélectionne la ville (alternance deterministic préservée,
  //    le re-clic sur la ville reprend l'unité via la règle 3).
  if (ui.selectedUnitId && !ui.draft?.path.length) {
    const clicked = unitAtHex(state, hex);
    if (clicked && clicked.id === ui.selectedUnitId) {
      const city = cityAtHex(state, hex);
      if (city) return { kind: 'selectCity', cityId: city.id };
      return { kind: 'deselect' };
    }
  }
  if (ui.selectedCityId && !ui.draft) {
    const city = cityAtHex(state, hex);
    if (city && city.id === ui.selectedCityId) return { kind: 'deselect' };
  }

  // 1. Un chemin est en construction : priorité aux interactions de chemin.
  if (selected && ui.draft && ui.draft.unitId === selected.id && ordersEditable(view)) {
    const trunc = truncateOf(ui.draft.path, hex);
    if (trunc) return { kind: 'truncate', path: trunc };
    const last = ui.draft.path[ui.draft.path.length - 1] ?? selected;
    if (last.q === hex.q && last.r === hex.r) {
      // Clic sur la case courante : no-op si le chemin a commencé, sinon on
      // laisse passer (alternance unité ↔ ville sur une capitale défendue).
      if (ui.draft.path.length > 0) return { kind: 'none' };
    } else if (areNeighbors(last, hex) && passableKnown(state, hex)) {
      // Case finale/intermédiaire occupée par un ALLIÉ refusée côté client
      // (R-30, polish Phase 5). Une case ennemie reste traçable : y entrer
      // déclenche le combat d'entrée (R-42) — comportement de la Phase 3.
      const occupant = unitAtHex(state, hex);
      if (occupant && occupant.owner === selected.owner) return { kind: 'none' };
      return { kind: 'extend', path: [...ui.draft.path, { q: hex.q, r: hex.r }] };
    }
    // Clic ailleurs : on abandonne le brouillon et on retombe sur la sélection.
  }

  // 2. Attaque directe : unité amie combattante sélectionnée + UNITÉ ennemie
  //    visible adjacente (présente dans l'état filtré ⇒ visible). Une ville
  //    ennemie SANS unité visible ne se « combat » pas : on entre dessus
  //    (capture si vide — R-57/R-65 ; assaut du défenseur sinon, R-42), ce
  //    qui revient à une simple étape de déplacement.
  if (selected && selected.owner === myEngineId(view) && ordersEditable(view) && !ui.draft) {
    const enemy = unitAtHex(state, hex);
    const enemyCity = enemy ? null : cityAtHex(state, hex);
    const adjacent = hexDistance({ q: selected.q, r: selected.r }, hex) === 1;
    if (adjacent && enemy && enemy.owner !== selected.owner && unitType(selected.type).canAttack) {
      return { kind: 'attack', order: { type: 'Attack', unitId: selected.id, target: { q: hex.q, r: hex.r } } };
    }
    if (adjacent && enemyCity && enemyCity.owner !== selected.owner) {
      return { kind: 'extend', path: [{ q: hex.q, r: hex.r }], unitId: selected.id };
    }
  }

  // 3. Sélection. Case avec unité ET ville (capitale défendue) : alterner —
  //    1er clic l'unité, 2e clic la ville (le re-clic sur l'unité sélectionnée
  //    est déjà traité en règle 0).
  const unit = unitAtHex(state, hex);
  const city = unit ? cityAtHex(state, hex) : null;
  if (unit && city) {
    if (ui.selectedCityId === city.id) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
    return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  }
  if (unit) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  const aloneCity = cityAtHex(state, hex);
  if (aloneCity) return { kind: 'selectCity', cityId: aloneCity.id };

  // 4. Vide (connu ou brouillard) : déselection.
  return { kind: 'deselect' };
}

function truncateOf(path: Hex[], hex: Hex): Hex[] | null {
  for (let i = 0; i < path.length; i++) {
    if (path[i]!.q === hex.q && path[i]!.r === hex.r) return path.slice(0, i + 1);
  }
  return null;
}

/** Id moteur du joueur local ('p1'/'p2'), null si pas encore connu. */
export function myEngineId(view: GameView): string | null {
  return view.players.find((p) => p.id === view.playerId)?.engineId ?? null;
}

// ---------------------------------------------------------------------------
// Phase 5 L1 — clic droit = ordre de déplacement, unités sans ordre
// ---------------------------------------------------------------------------

/**
 * Chemin pas à pas (BFS déterministe) vers une case connue praticable, à
 * travers les cases CONNUES praticables uniquement (jamais inventé). La case
 * de destination occupée par une unité ALLIÉE est refusée (R-30, retour
 * Phase 3) ; une case ennemie est admise (l'entrée déclenche le combat R-42,
 * la capture d'une ville vide R-57/R-65). Retourne le chemin SANS l'origine,
 * ou null si aucune case de départ/arrivée invalide ou inatteignable.
 */
export function pathTo(state: GameState, from: Hex, to: Hex): Hex[] | null {
  if (!passableKnown(state, from) || !passableKnown(state, to)) return null;
  const destUnit = unitAtHex(state, to);
  if (destUnit && destUnit.owner === (unitAtHex(state, from)?.owner ?? '')) return null; // allié sur l'arrivée
  if (from.q === to.q && from.r === to.r) return [];
  // BFS avec voisinage trié (q, r) croissant — déterministe.
  const cameFrom = new Map<string, string | null>();
  const keyOf = (h: Hex): string => `${h.q},${h.r}`;
  const origin = keyOf(from);
  cameFrom.set(origin, null);
  const queue: Hex[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nexts = neighbors(current)
      .filter((h) => passableKnown(state, h))
      // pas d'étape intermédiaire sur une unité connue (alliée : interdit R-30 ;
      // ennemie : s'y arrêter pour combattre est un choix explicite, pas un transit)
      .filter((h) => !unitAtHex(state, h))
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
      queue.push(n);
    }
  }
  return null;
}

/**
 * Décision de clic droit PURE (Phase 5 L1) : avec une unité amie sélectionnée
 * et des ordres modifiables, un clic droit sur une case connue praticable
 * construit le chemin complet et le soumet (moveDraft) ; sinon le clic droit
 * annule le brouillon courant (cancelDraft).
 */
export function rightClickAction(view: GameView, ui: UiState, hex: Hex): RightClickAction {
  const state = view.state;
  if (!state || !ordersEditable(view)) return { kind: 'cancelDraft' };
  const selected = ui.selectedUnitId ? state.units[ui.selectedUnitId] : null;
  if (!selected || selected.owner !== myEngineId(view)) return { kind: 'cancelDraft' };
  const path = pathTo(state, selected, hex);
  if (path && path.length > 0) return { kind: 'moveDraft', path, unitId: selected.id };
  return { kind: 'cancelDraft' };
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
      if (u.order) return false; // chemin gelé
      if (u.fortified) return false; // R-33 : tenue permanente
      return !view.orders.some((o) => 'unitId' in o && o.unitId === id);
    });
}
