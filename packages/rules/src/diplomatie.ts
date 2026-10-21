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
 */
export function applyDeclareWar(input: GameState, playerId: PlayerId, target: PlayerId): DeclareWarOk | DeclareWarKo {
  if (playerId === target) return { ok: false, reason: 'on ne se déclare pas la guerre à soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(playerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${playerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (areAtWar(input, playerId, target)) return { ok: false, reason: 'déjà en guerre' };
  const st = structuredClone(input);
  st.diplomacy.war = [...st.diplomacy.war, paireGuerre(playerId, target)].sort(
    (x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]),
  );
  const events: GameEvent[] = [{ seq: 0, type: 'WarDeclared', from: playerId, on: target }];
  return { ok: true, state: st, events };
}
