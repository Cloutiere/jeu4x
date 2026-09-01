/**
 * Recherche technologique — Phase 7a (RULES.md §8.1, R-85).
 *
 * `SetResearch` est une ACTION IMMÉDIATE (hors ordres de tour) : traitée à la
 * réception par le serveur via `applySetResearch` (pure). La science produite
 * par les villes (Phase C) est créditée par `creditScience` sur la tech
 * courante ; sans choix, elle s'accumule en réserve (`scienceStored`) et se
 * verse au premier choix. La progression est conservée PAR technologie ;
 * le débordement est reporté en réserve (R-85).
 */
import { TECHS, prereqsMet } from './techs.js';
import type { GameEvent } from './events.js';
import type { GameState, PlayerId } from './state.js';

/** Événement TechResearched (sans seq — séquencé par l'appelant). */
export type TechResearchedPayload = { type: 'TechResearched'; player: PlayerId; tech: string };

/**
 * Crédite `amount` de science au joueur (Phase C — R-85). Mute `st` (état de
 * travail du moteur) ; `onResearched` est appelé à chaque complétion (l'appelant
 * émet l'événement `TechResearched` avec sa propre séquence).
 */
export function creditScience(
  st: GameState,
  playerId: PlayerId,
  amount: number,
  onResearched?: (playerId: PlayerId, techId: string) => void,
): void {
  if (amount <= 0) return;
  const player = st.players[playerId];
  if (!player) return;
  if (!player.researching) {
    player.scienceStored += amount; // R-85 : sans choix → réserve
    return;
  }
  const current = player.researching;
  const progress = (player.scienceProgress[current] ?? 0) + amount;
  const tech = TECHS[current];
  if (!tech) {
    // tech inconnue (données éditées entre deux tours) : la science va en réserve
    player.researching = null;
    player.scienceProgress[current] = progress;
    player.scienceStored += progress;
    return;
  }
  if (progress < tech.cost) {
    player.scienceProgress[current] = progress;
    return;
  }
  // Complétion : déblocage immédiat (R-87), débordement reporté (R-85).
  const overflow = progress - tech.cost;
  delete player.scienceProgress[current];
  if (!player.techsUnlocked.includes(tech.id)) player.techsUnlocked.push(tech.id);
  player.techsUnlocked.sort();
  player.researching = null;
  player.scienceStored += overflow;
  onResearched?.(playerId, tech.id);
}

export type SetResearchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: string };

/**
 * R-85 · SetResearch (action immédiate, pure) : choisit/change la tech
 * courante. Validation : tech existante, non déjà débloquée, prérequis
 * satisfaits. La réserve (`scienceStored`) est versée immédiatement sur la
 * tech choisie — complétion immédiate possible (événement TechResearched
 * séquencé sur `lastEventSeq`). Le changement de tech conserve la progression
 * accumulée par technologie (R-85).
 */
export function applySetResearch(input: GameState, playerId: PlayerId, techId: string): SetResearchResult {
  const st = structuredClone(input);
  const player = st.players[playerId];
  if (!player) return { ok: false, reason: `joueur inconnu : ${playerId}` };
  const tech = TECHS[techId];
  if (!tech) return { ok: false, reason: `technologie inconnue : ${techId}` };
  if (player.techsUnlocked.includes(techId)) return { ok: false, reason: 'technologie déjà débloquée' };
  if (!prereqsMet(tech, player.techsUnlocked)) return { ok: false, reason: `prérequis non satisfaits pour ${tech.name}` };

  const events: GameEvent[] = [];
  player.researching = techId;
  const stored = player.scienceStored;
  if (stored > 0) {
    player.scienceStored = 0;
    creditScience(st, playerId, stored, (pid, tid) => {
      st.lastEventSeq += 1;
      events.push({ seq: st.lastEventSeq, type: 'TechResearched', player: pid, tech: tid });
    });
  }
  return { ok: true, state: st, events };
}
