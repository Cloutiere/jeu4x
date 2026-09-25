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
import { activePlayerIds } from './state.js';
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

  // CARTE-MULTI (2-5 joueurs) : un forfait ÉLIMINE son joueur. À 2 joueurs
  // la partie se clôt (victoire du survivant — flux IDENTIQUE au historique :
  // un seul événement Victory 'forfeit') ; à 3+ elle CONTINUE (PlayerDefeated
  // public) jusqu'au dernier en lice. Les joueurs déjà éliminés ne forfaits
  // plus. Départage déterministe R-81 : plus petit playerId d'abord.
  const ids = Object.keys(state.players).sort();
  for (const loserId of ids) {
    if (state.players[loserId]?.defeated === true) continue;
    if (state.winner !== null) break;
    const missed = state.players[loserId]?.missedTurns ?? 0;
    if (missed < FORFEIT_MISSED_TURNS) continue;
    state.players[loserId]!.defeated = true;
    const enLice = activePlayerIds(state);
    const seq = state.lastEventSeq + 1;
    if (enLice.length === 1) {
      const winner = enLice[0]!;
      events.push({ seq, type: 'Victory', winner, reason: 'forfeit' });
      state.lastEventSeq = seq;
      state.winner = winner;
      break; // la partie est close : un seul survivant
    }
    events.push({ seq, type: 'PlayerDefeated', player: loserId, byPlayer: null, cause: 'forfeit' });
    state.lastEventSeq = seq;
  }
  return { state, events };
}
