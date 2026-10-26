/**
 * BOT-TD (décisions Erik 24/10) — banc de calibrage de la difficulté.
 *
 * Parties BOT vs BOT (1v1, carte procédurale miroir — même génération que le
 * serveur) où LES DEUX joueurs suivent botPolicy à la difficulté testée,
 * 150 tours max. Mesures par partie (D3) : villes fondées, population,
 * unités, trésorerie, techs, PV militaires. Motif CI-FLAKY : corpus fixe de
 * seeds, RNG dérivés (botTurnSeed par joueur/tour — zéro hasard hors moteur),
 * zéro flaky — même corpus ⇒ mêmes chiffres (verrouillé par test).
 *
 * Pur : aucune IO, aucun état global — réutilisable en test (déterminisme)
 * et par le banc complet (vitest.banc.config.ts, 40 parties × 3 difficultés).
 */
import {
  UNIT_TYPES,
  applyDeclareWar,
  applyProposePeace,
  createInitialState,
  createRng,
  generateProceduralMap,
  resolveTurn,
} from '@game/rules';
import type { BotDifficulte } from '@game/shared';
import type { GameState, Order } from '@game/rules';
import { botPolicy, botTurnSeed, deciderPaix, profileDuBot } from './botPolicy.js';

/** Durée d'une partie du banc (décision D3 — 150 tours). */
export const BANC_TOURS = 150;

/** Corpus fixe de seeds du banc complet (40 parties par difficulté). */
export function corpusBanc(taille: number): number[] {
  // Dérivation déterministe du corpus (R-80) — indépendante de l'exécution.
  const seeds: number[] = [];
  let h = 0x7e5b0d;
  for (let i = 0; i < taille; i++) {
    h = (Math.imul(h ^ (i + 1), 0x01000193) >>> 0) >>> 0;
    seeds.push(h);
  }
  return seeds;
}

/** Mesures de fin de partie (par EMPIRE COMBINÉ des deux bots — la
 *  difficulté teste le « niveau » du bot, pas l'issue du duel). */
export interface MesuresPartie {
  seed: number;
  difficulte: BotDifficulte;
  /** Tour atteint (arrêt anticipé si victoire — winner non nul). */
  tours: number;
  winner: string | null;
  villes: number;
  population: number;
  unites: number;
  tresorerie: number;
  techs: number;
  /** Σ PV des unités de combat (canAttack) — puissance militaire. */
  pvMilitaires: number;
  /** BOT-TC (D5) : guerres déclarées (entre bots) et paix acceptées. */
  guerres: number;
  paix: number;
}

/** Une partie bot vs bot à difficulté fixée. Déterministe : même
 *  (difficulté, seed, tours) ⇒ mêmes mesures bit à bit.
 *  BOT-TC (Erik 25/10) : les actions de DIPLOMATIE du bot (DeclareWar /
 *  ProposePeace) sont appliquées par le banc — miroir exact du GameDO
 *  (startResolution), mêmes helpers purs et même dérivation de RNG paix. */
export function simulerPartie(difficulte: BotDifficulte, seed: number, tours = BANC_TOURS): MesuresPartie {
  const { map } = generateProceduralMap(seed, { playerCount: 2 });
  let state: GameState = createInitialState(map, seed);
  const seedPartie = state.rngSeed;
  let guerres = 0;
  let paix = 0;
  for (let t = 0; t < tours && state.winner === null; t++) {
    const orders: Record<string, Order[]> = { p1: [], p2: [] };
    for (const id of ['p1', 'p2'] as const) {
      if (state.players[id]?.defeated === true) continue;
      const rng = createRng(botTurnSeed(seedPartie, state.turn, id));
      const plan = botPolicy(state, id, rng, difficulte);
      orders[id] = plan.orders;
      for (const action of plan.actions) {
        if (action.type === 'DeclareWar') {
          const r = applyDeclareWar(state, id, action.player);
          if (r.ok) {
            state = r.state;
            guerres++;
          }
        } else if (action.type === 'ProposePeace') {
          const rngPaix = createRng(botTurnSeed(seedPartie, state.turn, `paix:${action.player}`));
          const accepte = deciderPaix(state, action.player, id, profileDuBot(difficulte), rngPaix);
          const r = applyProposePeace(state, id, action.player, accepte);
          if (r.ok) {
            state = r.state;
            if (accepte) paix++;
          }
        }
      }
    }
    state = resolveTurn(state, orders, state.rngSeed).newState;
  }
  return { ...mesures(state, difficulte, seed), guerres, paix };
}

function mesures(state: GameState, difficulte: BotDifficulte, seed: number): MesuresPartie {
  const unites = Object.values(state.units);
  return {
    seed,
    difficulte,
    tours: state.turn,
    winner: state.winner ?? null,
    villes: Object.values(state.cities).length,
    population: Object.values(state.cities).reduce((s, c) => s + c.pop, 0),
    unites: unites.length,
    tresorerie: Object.values(state.players).reduce((s, p) => s + (p.defeated ? 0 : p.treasury), 0),
    techs: Object.values(state.players).reduce((s, p) => s + (p.techsUnlocked?.length ?? 0), 0),
    pvMilitaires: unites.reduce((s, u) => s + ((UNIT_TYPES[u.type]?.canAttack ?? false) ? u.hp : 0), 0),
    // BOT-TC : comptés par simulerPartie (défauts pour les autres usages).
    guerres: 0,
    paix: 0,
  };
}

/** Agrégat par difficulté : moyenne des mesures sur le corpus (tableau du
 *  rapport — les chiffres « normal » sont la BASELINE de calibrage). */
export interface AggregateDifficulte {
  difficulte: BotDifficulte;
  parties: number;
  victoires: Record<string, number>;
  villes: number;
  population: number;
  unites: number;
  tresorerie: number;
  techs: number;
  pvMilitaires: number;
  tours: number;
  /** BOT-TC (D5) : guerres déclarées et paix acceptées (moyennes). */
  guerres: number;
  paix: number;
}

export function agrege(mesures: MesuresPartie[]): AggregateDifficulte[] {
  const parDiff = new Map<BotDifficulte, MesuresPartie[]>();
  for (const m of mesures) {
    const list = parDiff.get(m.difficulte) ?? [];
    list.push(m);
    parDiff.set(m.difficulte, list);
  }
  return [...parDiff.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([difficulte, list]) => {
      const n = list.length || 1;
      const victoires: Record<string, number> = {};
      for (const m of list) if (m.winner) victoires[m.winner] = (victoires[m.winner] ?? 0) + 1;
      return {
        difficulte,
        parties: list.length,
        victoires,
        villes: list.reduce((s, m) => s + m.villes, 0) / n,
        population: list.reduce((s, m) => s + m.population, 0) / n,
        unites: list.reduce((s, m) => s + m.unites, 0) / n,
        tresorerie: list.reduce((s, m) => s + m.tresorerie, 0) / n,
        techs: list.reduce((s, m) => s + m.techs, 0) / n,
        pvMilitaires: list.reduce((s, m) => s + m.pvMilitaires, 0) / n,
        tours: list.reduce((s, m) => s + m.tours, 0) / n,
        guerres: list.reduce((s, m) => s + m.guerres, 0) / n,
        paix: list.reduce((s, m) => s + m.paix, 0) / n,
      };
    });
}
