/**
 * GESTE-ARMEE (04/11) — le geste joueur CivRev : former une armée de 3 unités
 * du même type (R-44). La fusion existe au moteur (`formArmy`, processFormArmy)
 * et les bots l'utilisent ; ce module BRANCHE le geste côté client : éligibilité
 * du bouton, candidats coéquipiers, pré-vérification du rendez-vous, libellé de
 * suivi n/3. PURE et testée — le client ne calcule aucune règle : il pré-vérifie
 * sur l'état filtré ce que le serveur tranchera de toute façon (OrderAck).
 *
 * D4 : zéro logique de fusion ici — le contrat moteur (3 membres, co-location
 * R-44, fusion à la résolution) n'est PAS dupliqué.
 */
import { unitType } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import type { Order, UnitId } from '@game/shared';
import type { GameView } from './gameClient.js';
import { enterableKnown, myEngineId, ordersEditable, passableKnown, pathTo, unitAtHex } from './render/interaction.js';

/** Le joueur a-t-il déjà posé un FormArmy porté par cette unité ce tour ? */
export function estMembreFormArmy(view: GameView, unitId: UnitId): boolean {
  return view.orders.some((o) => o.type === 'FormArmy' && o.members.includes(unitId));
}

/**
 * D1-1 : le bouton « ⚔ Former une armée » est-il visible pour l'unité ?
 * Terrestre non-navire, PAS déjà armée, PAS déjà membre d'un FormArmy en
 * cours, ordres modifiables, et ≥ 2 autres unités du même type amies
 * praticables (chemin terrestre existant — le BFS client `pathTo`).
 */
export function peutFormerArmee(view: GameView, unit: NonNullable<GameView['state']>['units'][UnitId] & object): boolean {
  if (!unit || !view.state || !ordersEditable(view)) return false;
  if (unit.owner !== myEngineId(view)) return false;
  if (unit.isArmy || unit.aboard) return false;
  if (unitType(unit.type).aquatic) return false;
  if (estMembreFormArmy(view, unit.id)) return false;
  return candidatsArmee(view.state, view, unit, myEngineId(view)!).length >= 2;
}

/**
 * D1-2 : les candidats coéquipiers — unités AMIES du MÊME TYPE, praticables
 * (entrables sur leur case + chemin terrestre existant depuis le chef, BFS
 * client), hors embarquement, hors armée, hors FormArmy en cours. Un membre
 * d'un autre FormArmy est exclu (le moteur n'accepterait qu'un groupe).
 */
export function candidatsArmee(
  state: GameState,
  view: GameView,
  chef: { id: UnitId; type: string; owner: string; q: number; r: number },
  myId: string | null,
): Array<{ id: UnitId; type: string }> {
  if (!state) return [];
  const out: Array<{ id: UnitId; type: string }> = [];
  for (const u of Object.values(state.units)) {
    if (u.id === chef.id) continue;
    if (u.owner !== myId) continue;
    if (u.type !== chef.type) continue;
    if (u.aboard || u.isArmy) continue;
    if (estMembreFormArmy(view, u.id)) continue;
    if (!enterableKnown(state, u, u)) continue;
    if (!pathTo(state, chef, { q: u.q, r: u.r })) continue;
    out.push({ id: u.id, type: u.type });
  }
  return out;
}

/**
 * D1-3 : pré-vérification LOCALE du rendez-vous — case connue praticable,
 * atteignable par les TROIS membres (BFS client par membre), jamais une case
 * portant une unité ennemie visible (y entrer déclencherait un combat, pas
 * une fusion). Une case amie est admise : les membres d'un même FormArmy sont
 * exemptés de la troncature de dispute côté moteur (R-44). Le serveur tranche
 * en dernier ressort (refus propre OrderAck).
 */
export function rallyValide(
  state: GameState,
  view: GameView,
  chef: { id: UnitId; type: string },
  coequipiers: UnitId[],
  hex: Hex,
): boolean {
  if (!state) return false;
  if (!passableKnown(state, hex)) return false;
  const occupant = unitAtHex(state, hex);
  if (occupant && occupant.owner !== myEngineId(view)) return false;
  const membres = [chef.id, ...coequipiers]
    .map((id) => state.units[id])
    .filter((u): u is NonNullable<typeof u> => !!u && !u.aboard);
  if (membres.length !== 3) return false;
  return membres.every((m) => {
    if (m.q === hex.q && m.r === hex.r) return true;
    return pathTo(state, m, hex) !== null;
  });
}

/**
 * Le moteur ne déplace pas les membres d'un FormArmy (miroir botPolicy
 * 'converger') : chaque membre reçoit son propre Move (BFS client) vers le
 * rendez-vous — le membre DÉJÀ AU rendez-vous ne bouge pas, un membre à bord
 * non plus. Pur, testé.
 */
export function mouvementsVersRally(
  state: GameState,
  membres: UnitId[],
  rally: Hex,
): Array<{ unitId: UnitId; path: Hex[] }> {
  const out: Array<{ unitId: UnitId; path: Hex[] }> = [];
  for (const id of membres) {
    const m = state?.units[id];
    if (!m || m.aboard) continue;
    if (m.q === rally.q && m.r === rally.r) continue;
    const chemin = pathTo(state, m, rally);
    if (chemin && chemin.length > 0) out.push({ unitId: id, path: chemin });
  }
  return out;
}

/**
 * D2 — libellé de suivi du FormArmy posé : « en route vers le rendez-vous
 * (n/3) » où n = membres DÉJÀ SUR la case de rendez-vous (l'état filtré ne
 * connaît pas les PM restants — le compteur est honnête, pas prédictif).
 */
export function libelleFormation(state: GameState, order: Extract<Order, { type: 'FormArmy' }>): string {
  const presents = order.members.filter((id) => {
    const u = state?.units[id];
    return !!u && u.q === order.rally.q && u.r === order.rally.r;
  }).length;
  return `Formation d'armée — en route vers le rendez-vous (${presents}/3) (${order.rally.q},${order.rally.r})`;
}
