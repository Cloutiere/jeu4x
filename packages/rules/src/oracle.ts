/**
 * ORACLE-VERDICT (canon Erik 09/11, Chemin B) — l'Oracle de Delphes révèle
 * VRAIMENT l'issue des batailles planifiées (les jets mêlée sont un dérivé
 * déterministe par bataille, voir derive.ts) : verdict VICTOIRE/DÉFAITE
 * CERTAIN, plus jamais une probabilité (R-125 interprétation 🔶 remplacée).
 *
 * La gate d'activité est GENERIC (data-driven) : toute mervelle portant
 * `battleForeknowledge: true` (wonders.json) ouvre la révélation, tant
 * qu'elle n'est pas obsolète — obsolescence GLOBALE R-128 (l'Oracle meurt si
 * QUI QUE CE SOIT découvre la Religion).
 */
import { allKnownTechs } from './state.js';
import type { GameState, PlayerId } from './state.js';
import { isWonderObsolete } from './culture.js';
import { WONDERS } from './techs.js';

/**
 * La révélation de combat est active pour `playerId` : son empire contrôle
 * une ville qui a bâti une mervelle à `battleForeknowledge` non obsolète.
 */
export function oracleActif(st: GameState, playerId: PlayerId): boolean {
  const allTechs = allKnownTechs(st);
  return Object.values(st.cities).some(
    (c) =>
      c.owner === playerId &&
      c.wonders.some((w) => WONDERS[w]?.battleForeknowledge && !isWonderObsolete(w, allTechs)),
  );
}
