/**
 * Recherche technologique — Phase 7a (RULES.md §8.1, R-85).
 *
 * `SetResearch` est une ACTION IMMÉDIATE (hors ordres de tour) : traitée à la
 * réception par le serveur via `applySetResearch` (pure). La science produite
 * par les villes (Phase C) est créditée par `creditScience` sur la tech
 * courante ; sans choix, elle s'accumule en réserve (`scienceStored`) et se
 * verse au premier choix. La progression est conservée PAR technologie ;
 * le débordement est converti 1:1 en OR à la complétion (R-134, rév. 7l —
 * le canon remplace le report R-85).
 */
import { TECHS, prereqsMet } from './techs.js';
import type { FirstDiscoveredPayload, GameEvent } from './events.js';
import type { GameState, PlayerId, TileKey } from './state.js';
import { applyFirstToDiscover } from './firstDiscovery.js';
import { tileWorkable, tileYield, workRadiusOf } from './economy.js';
import { hexDistance, hexesWithinRadius, tileKeyOf } from './hex.js';

/** Événement TechResearched (sans seq — séquencé par l'appelant). */
export type TechResearchedPayload = { type: 'TechResearched'; player: PlayerId; tech: string };

/** Callbacks de complétion (l'appelant séquence ses événements). */
export interface CompletionCallbacks {
  onResearched?: (playerId: PlayerId, techId: string) => void;
  /** 7e : appelée si le joueur est le PREMIER à compléter la tech — la
   *  récompense est déjà appliquée à l'état (or, unité/bâtiment gratuit…).
   *  `citiesToFill` : villes dont la population a augmenté (citoyens à
   *  assigner selon le contexte de l'appelant). */
  onFirstDiscovered?: (payload: FirstDiscoveredPayload, citiesToFill: string[]) => void;
}

/**
 * Crédite `amount` de science au joueur (Phase C — R-85). Mute `st` (état de
 * travail du moteur) ; `callbacks.onResearched` est appelé à chaque complétion
 * (l'appelant émet l'événement `TechResearched` avec sa propre séquence) et
 * `callbacks.onFirstDiscovered` après application de la récompense 7e.
 */
export function creditScience(
  st: GameState,
  playerId: PlayerId,
  amount: number,
  callbacks?: CompletionCallbacks | ((playerId: PlayerId, techId: string) => void),
): void {
  // Rétrocompatibilité : l'ancien appelant passait une fonction unique.
  const cb: CompletionCallbacks = typeof callbacks === 'function' ? { onResearched: callbacks } : (callbacks ?? {});
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
  // Complétion : déblocage immédiat (R-87).
  // 7l · R-134 (révision de R-85 « débordement reporté ») : le canon CivRev
  // convertit l'excédent de fioles 1:1 en OR à la découverte — il ne le
  // conserve pas (écart appliqué, signalé 🔶). La réserve `scienceStored`
  // reste la science accumulée SANS tech choisie (inchangée).
  const overflow = progress - tech.cost;
  delete player.scienceProgress[current];
  if (!player.techsUnlocked.includes(tech.id)) player.techsUnlocked.push(tech.id);
  player.techsUnlocked.sort();
  // 7h · R-122 : la tech complète la fenêtre d'adoption sans Anarchie du
  // régime correspondant (invitation du conseiller — réinitialisée à chaque
  // résolution, R-122).
  player.techsUnlockedThisTurn = [...(player.techsUnlockedThisTurn ?? []), tech.id];
  player.researching = null;
  player.treasury += overflow; // R-134 : surplus de recherche converti 1:1 en or
  cb.onResearched?.(playerId, tech.id);
  // 7e · Premier découvrir : récompense appliquée ici, événement émis par
  // l'appelant. L'assignation des nouveaux citoyens reste à l'appelant
  // (pendingFill en résolution, remplissage append-only pour l'action
  // immédiate — jamais de re-assignation globale, règle d'Erik R-60).
  let citiesFilled: string[] = [];
  applyFirstToDiscover(st, playerId, tech.id, (payload, cities) => {
    citiesFilled = cities;
    cb.onFirstDiscovered?.(payload, cities);
  });
  for (const cityId of citiesFilled) appendFillWorkedTiles(st, cityId);
}

/** Remplissage APPEND-ONLY des citoyens manquants (miroir de fillWorkedTiles
 *  du moteur, hors Board — utilisé par les actions immédiates du serveur). */
function appendFillWorkedTiles(st: GameState, cityId: string): void {
  const city = st.cities[cityId];
  if (!city) return;
  const radius = workRadiusOf(city.buildings);
  const cityHex = { q: city.q, r: city.r };
  const taken = new Set<TileKey>();
  for (const c of Object.values(st.cities)) {
    for (const key of c.workedTiles) taken.add(key);
    taken.add(`${c.q},${c.r}`);
  }
  const candidates = hexesWithinRadius(cityHex, radius)
    .filter((h) => hexDistance(cityHex, h) >= 1)
    .map((h) => ({ key: tileKeyOf(h), hex: h }))
    .filter(({ key }) => tileWorkable(st.map, key) && !taken.has(key) && !city.workedTiles.includes(key))
    .map(({ key, hex }) => ({ key, hex, y: tileYield(st.map, city.buildings, key, st.players[city.owner]?.techsUnlocked ?? [])! }))
    .sort(
      (a, b) =>
        b.y.food - a.y.food ||
        b.y.production - a.y.production ||
        b.y.commerce - a.y.commerce ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
  for (const c of candidates) {
    if (city.workedTiles.length >= city.pop) break;
    city.workedTiles.push(c.key);
    taken.add(c.key);
  }
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
    creditScience(st, playerId, stored, {
      onResearched: (pid, tid) => {
        st.lastEventSeq += 1;
        events.push({ seq: st.lastEventSeq, type: 'TechResearched', player: pid, tech: tid });
      },
      onFirstDiscovered: (payload) => {
        st.lastEventSeq += 1;
        events.push({ ...payload, seq: st.lastEventSeq });
      },
    });
  }
  return { ok: true, state: st, events };
}
