/**
 * Forfait T-06 (RULES.md §1, §11 ; DESIGN.md §4.6).
 *
 * Le compteur `missedTurns` de chaque joueur est tenu côté serveur (GameDO :
 * incrément à chaque échéance de timer sans verrouillage, remise à zéro au
 * verrouillage). Cette fonction PURE décide l'issue : au-delà du seuil T-06,
 * l'adversaire remporte la partie par forfait (événement `Victory` public,
 * séquencé sur la continuité du journal).
 */
import { FORFEIT_MISSED_TURNS } from './constants.js';
import type { GameEvent } from './events.js';
import type { GameState } from './state.js';

export interface ForfeitResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Vérifie le forfait. Fonction pure : l'état d'entrée n'est jamais muté.
 * Interprétations (documentées) :
 *  - RULES.md §1 « défaite par forfait après T-06 timers manqués » : le seuil
 *    est atteint dès que `missedTurns` vaut T-06 ;
 *  - si les deux joueurs atteignent le seuil simultanément (partie entièrement
 *    inactive), le départage est déterministe (R-81) : le plus petit `playerId`
 *    est déclaré perdant.
 */
export function checkForfeit(input: GameState): ForfeitResult {
  const state = structuredClone(input);
  const events: GameEvent[] = [];
  if (state.winner !== null) return { state, events };

  const ids = Object.keys(state.players).sort();
  for (const loserId of ids) {
    const missed = state.players[loserId]?.missedTurns ?? 0;
    if (missed < FORFEIT_MISSED_TURNS) continue;
    const winner = ids.find((id) => id !== loserId);
    if (!winner) continue;
    const seq = state.lastEventSeq + 1;
    events.push({ seq, type: 'Victory', winner, reason: 'forfeit' });
    state.lastEventSeq = seq;
    state.winner = winner;
    break; // la partie est close : un seul vainqueur
  }
  return { state, events };
}
