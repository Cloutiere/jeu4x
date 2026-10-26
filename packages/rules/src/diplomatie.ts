/**
 * DIPLOMATIE-T1 (décisions Erik 19/10, HANDOFF-DIPLOMATIE-T1) — module pur :
 * l'état de guerre PUBLIC par paire de nations (`diplomacy.war`, défaut
 * absent = Paix) et l'action immédiate `DeclareWar` (même contrat que
 * SetGovernment — appliquée à la réception par le DO, hors ordres de tour).
 *
 * T1 volontairement minimal : PAS de négociation (T2), PAS de paix imposée
 * (T3), les bots ne déclarent JAMAIS (D4 — leur politique ne porte pas
 * l'action). Re-déclaration après paix : permise par conception (T2 la
 * négociera) — mais la re-déclaration SANS paix est refusée.
 */
import type { GameEvent } from './events.js';
import type { GameState, PlayerId } from './state.js';
import { areAtWar, activePlayerIds } from './state.js';

export interface DeclareWarOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}
export interface DeclareWarKo {
  ok: false;
  reason: string;
}

/** Paire canonique (ids triés) — miroir des paires stockées dans `war`. */
export function paireGuerre(a: PlayerId, b: PlayerId): [PlayerId, PlayerId] {
  return a < b ? [a, b] : [b, a];
}

/**
 * D3 · DeclareWar { player } — action IMMÉDIATE, PUBLIQUE (aucun fog sur les
 * guerres) et MUTUELLE : la paire rejoint `diplomacy.war`, débloquant les
 * attaques DANS LES DEUX SENS (gate D2). Pur : l'état d'entrée est cloné,
 * jamais muté. L'événement `WarDeclared` prolonge le journal diffusé (le DO
 * l'ajoute à `lastEvents`, miroir SetGovernment/GovernmentChanged).
 *
 * BOT-TC (Erik 25/10) : le tour de DÉBUT est consigné dans
 * `diplomacy.warsDepuis` (champ optionnel — zéro migration) pour la durée de
 * guerre (paix minimale, délai entre guerres).
 */
export function applyDeclareWar(input: GameState, playerId: PlayerId, target: PlayerId): DeclareWarOk | DeclareWarKo {
  if (playerId === target) return { ok: false, reason: 'on ne se déclare pas la guerre à soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(playerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${playerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (areAtWar(input, playerId, target)) return { ok: false, reason: 'déjà en guerre' };
  const st = structuredClone(input);
  const [a, b] = paireGuerre(playerId, target);
  st.diplomacy.war = [...st.diplomacy.war, paireGuerre(playerId, target)].sort(
    (x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]),
  );
  st.diplomacy.warsDepuis = { ...st.diplomacy.warsDepuis, [`${a},${b}`]: st.turn };
  const events: GameEvent[] = [{ seq: 0, type: 'WarDeclared', from: playerId, on: target }];
  return { ok: true, state: st, events };
}

/** Clé canonique d'une paire dans `warsDepuis`. */
function cleDepuis(a: PlayerId, b: PlayerId): string {
  const [x, y] = paireGuerre(a, b);
  return `${x},${y}`;
}

/**
 * PAIX-RYTHME (Erik 27/10, D3) · Nombre de BATAILLES de la guerre (a, b) —
 * les échanges de combat comptés par le moteur (compterBataille). 0 si
 * absen­t/champ pré-PAIX-RYTHME.
 */
export function bataillesDe(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.diplomacy.batailles?.[cleDepuis(a, b)] ?? 0;
}

/**
 * PAIX-RYTHME (Erik 27/10, D3) · Compte UNE bataille de la guerre (a, b) —
 * appelé par le moteur à chaque échange de combat entre deux joueurs dont la
 * paire est dans `diplomacy.war` (les barbares n'y figurent jamais). Mute
 * l'état MOTEUR (contexte de résolution — miroir des compteurs du board) ;
 * champ optionnel créé à la première bataille (zéro migration).
 */
export function compterBataille(state: GameState, a: PlayerId, b: PlayerId): void {
  const cle = cleDepuis(a, b);
  const batailles = { ...state.diplomacy.batailles };
  batailles[cle] = (batailles[cle] ?? 0) + 1;
  state.diplomacy.batailles = batailles;
}

/**
 * BOT-TC (Erik 25/10, D3) · Durée de la guerre (a, b) en tours — 0 si la
 * guerre est inconnue/pré-BOT-TC (pas d'entrée `warsDepuis`) ou finie.
 */
export function dureeGuerre(state: GameState, a: PlayerId, b: PlayerId): number {
  const depuis = state.diplomacy.warsDepuis?.[cleDepuis(a, b)];
  return depuis === undefined ? 0 : Math.max(0, state.turn - depuis);
}

/**
 * BOT-TC (Erik 25/10, D3) · ProposePeace { player } — action immédiate,
 * PUBLIQUE, même contrat que DeclareWar (forme validée EN PREMIER côté DO,
 * leçon 7f). La DÉCISION d'accepter est EXTERNE (le bot la calcule : écrasé
 * ou guerre traînante ⇒ oui — botPolicy.deciderPaix) ; ici on l'applique :
 *   accepte  → la paire quitte `wars` (purge), `warsDepuis` effacée,
 *              `dernieresGuerres` (fin de guerre) posée pour le délai D1,
 *              événement `PeaceAccepted` ;
 *   refuse   → `wars` intacte, événement `PeaceRefused` (crédibilité T1).
 * Re-déclaration après paix : permise (miroir T1).
 */
export function applyProposePeace(
  input: GameState,
  proposerId: PlayerId,
  target: PlayerId,
  accepte: boolean,
): DeclareWarOk | DeclareWarKo {
  if (proposerId === target) return { ok: false, reason: 'on ne se propose pas la paix à soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(proposerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${proposerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (!areAtWar(input, proposerId, target)) return { ok: false, reason: 'pas en guerre' };
  if (!accepte) {
    return {
      ok: true,
      state: structuredClone(input),
      events: [{ seq: 0, type: 'PeaceRefused', from: proposerId, on: target }],
    };
  }
  const st = structuredClone(input);
  const [a, b] = paireGuerre(proposerId, target);
  st.diplomacy.war = st.diplomacy.war.filter(([x, y]) => !(x === a && y === b));
  const warsDepuis = { ...st.diplomacy.warsDepuis };
  delete warsDepuis[cleDepuis(a, b)];
  st.diplomacy.warsDepuis = warsDepuis;
  // PAIX-RYTHME : le compteur de batailles repart à zéro avec la guerre.
  const batailles = { ...st.diplomacy.batailles };
  delete batailles[cleDepuis(a, b)];
  st.diplomacy.batailles = batailles;
  st.diplomacy.dernieresGuerres = {
    ...st.diplomacy.dernieresGuerres,
    [a]: st.turn,
    [b]: st.turn,
  };
  return { ok: true, state: st, events: [{ seq: 0, type: 'PeaceAccepted', from: proposerId, on: target }] };
}
