/**
 * DEFENSE-VILLE-A (canon Erik 12/11, diag DIAG-DEFENSE-VILLE) — primitives
 * PURES de la défense de ville, mécanique PARTAGÉE (botPolicy bot ET branche
 * Jev — zéro nouvelle question LLM).
 *
 * Le fait déclencheur : au banc joueur-escorte (n=10), 7 captures bot p2 +
 * 6 RAZES barbares, dont 4 sur des villes d'1-4 tours garnies d'un COLON
 * SEUL, prises SANS COMBAT ; 5/13 chutes avec des combattants à d=1-2
 * jamais DANS la tuile ; la menace était visible 2-13 tours avant chaque
 * chute mais ni localisée ni suivie d'effet.
 *
 * Les trois leviers de la tranche A :
 *   L1 — garnison d=0 : toute ville compte ≥ 1 COMBATTANT sur sa tuile
 *        (colon exclu — un colon ne défend pas, leçon p08) ;
 *   L2 — rappel défensif avec HYSTÉRÉSIS : menace visible à ≤ menaceDist
 *        tours de MARCHE (BFS portée réelle, miroir escortColon) → les
 *        combattantes les plus proches rentrent vers LA tuile ; le rappel ne
 *        se lève que quand plus aucune menace n'est visible à ≤
 *        menaceDist + hysteresisMarge (bande de dissolution SANS ÉTAT —
 *        schemaVersion intacte ; anti ping-pong, leçon OSCILLATION-MARCHE) ;
 *   L6 — hygiène de fondation : tout site à ≤ fondationBarbareDist d'un
 *        barbare visible est REFUSÉ (« fondé sous les griffes, ce n'est pas
 *        un pari évalué »).
 *
 * Comme escortColon, l'appelant passe l'état QU'IL connaît : le botPolicy
 * l'état complet, le port Jev l'état filtré par la brume. Pur,
 * déterministe, data-driven (bot.json `defense` — zéro durcissement).
 */
import { BOT_SETTINGS, TERRAINS, UNIT_TYPES } from './data.js';
import { isBarbarian } from './state.js';
import { hexDistanceW } from './hex.js';
import { porteeMarche } from './escortColon.js';
import type { BotDefenseData } from './types.js';
import type { City, GameState, PlayerId, Unit } from './state.js';

/** Table defense (bot.json `defense`). */
export function defenseDuBot(): BotDefenseData {
  return BOT_SETTINGS.defense;
}

/** Les ennemis CONNUS du joueur (barbares permanents — R-95 — ou guerre
 *  déclarée), hors embarquées. Miroir escortColon `ennemisConnus`. */
function ennemisConnus(state: GameState, joueurId: PlayerId): Unit[] {
  const enGuerre = new Set<PlayerId>();
  for (const [a, b] of state.diplomacy.war) {
    if (a === joueurId) enGuerre.add(b);
    if (b === joueurId) enGuerre.add(a);
  }
  return Object.values(state.units).filter(
    (u) => !u.aboard && (isBarbarian(u.owner) || enGuerre.has(u.owner)),
  );
}

/** Combattante terrestre (canon planGarnison : canAttack, hors embarquée,
 *  hors navale). Le COLON n'est JAMAIS un combattant (canAttack false —
 *  leçon p08 : ville garnie d'un colon seul = capture sans combat). */
function estCombattante(u: Unit): boolean {
  return (
    !u.aboard &&
    (UNIT_TYPES[u.type]?.canAttack ?? false) &&
    UNIT_TYPES[u.type]?.aquatic !== true
  );
}

/**
 * L1 · Déficit de GARNISON de la ville : combattantes requises sur la tuile
 * (seuil data) − combattantes PRÉSENTES (d=0, sur la case même). Pur.
 */
export function garnisonDeficit(
  state: GameState,
  ville: City,
  joueurId: PlayerId,
  seuil: number = defenseDuBot().seuilGarnison,
): number {
  const presentes = Object.values(state.units).filter(
    (u) =>
      u.owner === joueurId &&
      estCombattante(u) &&
      u.q === ville.q &&
      u.r === ville.r,
  ).length;
  return Math.max(0, seuil - presentes);
}

/**
 * L2 · Menaces VISIBLES de la ville : ennemis capables d'atteindre la tuile
 * de la ville en ≤ `limiteTours` tours de MARCHE (BFS portée réelle ×
 * mouvement — pas à vol d'oiseau ; un barbare derrière un lac n'est pas une
 * menace de raze). Pur. Ordre canon (id — R-81).
 */
export function menacesVille(
  state: GameState,
  ville: City,
  joueurId: PlayerId,
  limiteTours: number = defenseDuBot().menaceDist,
): Unit[] {
  const cleVille = `${ville.q},${ville.r}`;
  const out: Unit[] = [];
  for (const e of ennemisConnus(state, joueurId)) {
    const mouvement = UNIT_TYPES[e.type]?.movement ?? 1;
    const portee = porteeMarche(state, e, limiteTours * mouvement);
    if (portee.has(cleVille)) out.push(e);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // R-81
}

/**
 * L6 · Le site est-il sous les GRIFFES : un barbare visible à distance ≤
 * `distMax` (à vol d'oiseau — la fondation POSE la ville là, c'est la
 * distance qui compte au moment de l'entrée). Pur.
 */
export function fondationProcheBarbare(
  state: GameState,
  site: { q: number; r: number },
  distMax: number = defenseDuBot().fondationBarbareDist,
): boolean {
  return Object.values(state.units).some(
    (u) => !u.aboard && isBarbarian(u.owner) && hexDistanceW(u, site, state.mapWidth) <= distMax,
  );
}

/**
 * L2 · Bande de DISSOLUTION (hystérésis sans état) : une menace encore
 * visible à ≤ menaceDist + hysteresisMarge maintient le rappel actif. Pur.
 */
export function menaceDansBande(
  state: GameState,
  ville: City,
  joueurId: PlayerId,
): boolean {
  const d = defenseDuBot();
  return menacesVille(state, ville, joueurId, d.menaceDist + d.hysteresisMarge).length > 0;
}
