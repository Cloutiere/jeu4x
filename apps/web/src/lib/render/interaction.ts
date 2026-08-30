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
  /** Extension/troncature du chemin en construction. */
  | { kind: 'extend'; path: Hex[] }
  | { kind: 'truncate'; path: Hex[] }
  /** Attaque directe d'une case ennemie visible adjacente. */
  | { kind: 'attack'; order: Order };

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

  // 1. Un chemin est en construction : priorité aux interactions de chemin.
  if (selected && ui.draft && ui.draft.unitId === selected.id && ordersEditable(view)) {
    const trunc = truncateOf(ui.draft.path, hex);
    if (trunc) return { kind: 'truncate', path: trunc };
    const last = ui.draft.path[ui.draft.path.length - 1] ?? selected;
    if (last.q === hex.q && last.r === hex.r) return { kind: 'none' };
    if (areNeighbors(last, hex) && passableKnown(state, hex)) {
      return { kind: 'extend', path: [...ui.draft.path, { q: hex.q, r: hex.r }] };
    }
    // Clic ailleurs : on abandonne le brouillon et on retombe sur la sélection.
  }

  // 2. Attaque directe : unité amie combattante sélectionnée + entité ennemie
  //    visible adjacente (présente dans l'état filtré ⇒ visible).
  if (selected && selected.owner === myEngineId(view) && ordersEditable(view) && !ui.draft) {
    const enemy = unitAtHex(state, hex);
    const enemyCity = enemy ? null : cityAtHex(state, hex);
    const adjacent = hexDistance({ q: selected.q, r: selected.r }, hex) === 1;
    const enemyOwner = enemy?.owner ?? enemyCity?.owner;
    if (adjacent && enemyOwner && enemyOwner !== selected.owner && unitType(selected.type).canAttack) {
      return { kind: 'attack', order: { type: 'Attack', unitId: selected.id, target: { q: hex.q, r: hex.r } } };
    }
  }

  // 3. Sélection.
  const unit = unitAtHex(state, hex);
  if (unit) return { kind: 'selectUnit', unitId: unit.id, mine: unit.owner === myEngineId(view) };
  const city = cityAtHex(state, hex);
  if (city) return { kind: 'selectCity', cityId: city.id };

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
