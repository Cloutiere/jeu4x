/**
 * BOT-TC-OBSERVATION (décisions Erik 25/10) — banc d'observation des guerres
 * IA : extraction des CHRONOLOGIES de guerre du banc T-D (même corpus 40
 * seeds × 3 difficultés, D1) + métriques agrégées (D3). AUCUN changement de
 * comportement : le moteur et le bot ne sont pas touchés — le banc rejoue la
 * boucle exacte de bancBotTd.simulerPartie en OBSERVANT (D2).
 *
 * Pur : extraire/mesurer consomment zéro IO — testés sur fixture (L1),
 * exécutés par le banc complet (tests-banc, gate BANC_BOT_TD).
 */
import {
  CIVILIZATIONS,
  UNIT_TYPES,
  applyDeclareWar,
  applyProposePeace,
  createInitialState,
  createRng,
  generateProceduralMap,
  resolveTurn,
} from '@game/rules';
import { hexDistanceW } from '@game/rules';
import { agressiviteDe } from '@game/rules';
import type { GameEvent } from '@game/rules';
import type { BotDifficulte } from '@game/shared';
import type { GameState, Order, PlayerId } from '@game/rules';
import { botPolicy, botTurnSeed, deciderPaix, forcesDe, profileDuBot } from './botPolicy.js';
import { BANC_TOURS } from './bancBotTd.js';

/** Types d'événements conservés dans l'observation (guerres, combats, paix). */
const TYPES_OBSERVES = new Set([
  'WarDeclared',
  'PeaceAccepted',
  'PeaceRefused',
  'CombatExchange',
  'UnitDestroyed',
  'CityCaptured',
  'PlayerDefeated',
]);

/** Événement observé — les événements de DIPLOMATIE portent en plus les
 *  forces des deux camps au moment de la décision (forcesDe, D2). */
export interface EvenementObserve {
  type: 'WarDeclared' | 'PeaceAccepted' | 'PeaceRefused' | 'CombatExchange' | 'UnitDestroyed' | 'CityCaptured' | 'PlayerDefeated';
  from?: string;
  on?: string;
  player?: string;
  byPlayer?: string | null;
  cause?: string;
  attackerId?: string;
  defenderId?: string;
  owner?: string;
  cityId?: string;
  toOwner?: string;
  fromOwner?: string;
  /** WarDeclared : forces des deux camps À LA DÉCLARATION. */
  forcesDeclarant?: number;
  forcesCible?: number;
  /** PeaceAccepted/Refused : forces du proposeur et du décideur. */
  forcesFrom?: number;
  forcesOn?: number;
}

/** Photographie compacte d'un tour résolu (fin de tour t). `declarations` et
 *  `paix` listent les décisions de diplomatie PRISES pendant ce tour (entre
 *  deux résolutions) — fusionnées dans `evenements` pour l'extracteur. */
export interface TourObserve {
  tour: number;
  forces: Record<string, number>;
  civs: Record<string, string>;
  capitale: Record<string, { q: number; r: number } | null>;
  ownerOf: Record<string, string>;
  posOf: Record<string, { q: number; r: number }>;
  /** Paires en guerre (clé canonique « a|b ») APRÈS le tour. */
  paires: string[];
  /** Largeur de carte (wrap Est↔Ouest des distances — CARTE-RONDE T1). */
  largeur: number;
  evenements: EvenementObserve[];
  winner: string | null;
  defaits: string[];
}

/** Chronologie d'UNE guerre (D2). */
export interface ChronologieGuerre {
  declarant: string;
  cible: string;
  tourDeclaration: number;
  forcesDeclarant: number;
  forcesCible: number;
  /** Rapport forcesDe(declarant)/forcesDe(cible) à la déclaration. */
  ratioDeclaration: number;
  batailles: number;
  pertes: { declarant: number; cible: number };
  /** Distance min atteinte des unités du DÉCLARANT à la capitale cible
   *  pendant la guerre (progression de l'offensive — D3 « offensives »). */
  progressionCapitale: number | null;
  paixProposees: Array<{ tour: number; par: 'declarant' | 'cible'; rapportForces: number; acceptee: boolean }>;
  tourFin: number | null;
  duree: number;
  issue: 'paix' | 'elimination-declarant' | 'elimination-cible' | 'enCours' | 'fin-inconnue';
}

/** Chronologie complète d'UNE partie (D6 — artefact devtmp). */
export interface ChronologiePartie {
  seed: number;
  difficulte: BotDifficulte;
  tours: number;
  winner: string | null;
  civs: Record<string, string>;
  guerres: ChronologieGuerre[];
  captures: Array<{ tour: number; cityId: string; de: string; vers: string }>;
  eliminations: Array<{ tour: number; joueur: string; par: string | null; cause: string }>;
}

/** Une partie bot vs bot OBSERVÉE — boucle identique à bancBotTd.simulerPartie
 *  (mêmes RNG, mêmes décisions), plus la photographie de chaque tour. */
export function simulerPartieObservee(
  difficulte: BotDifficulte,
  seed: number,
  tours = BANC_TOURS,
  options: { civs?: { p1: string; p2: string } } = {},
): ChronologiePartie {
  const { map } = generateProceduralMap(seed, { playerCount: 2 });
  // BOT-P7-CIVS (D1) : par défaut, le banc porte de VRAIES civs tirées de
  // façon déterministe du seed (miroir lobby) — « neutre » reste possible en
  // passant explicitement { civs: { p1: 'neutre', p2: 'neutre' } } (baseline).
  const civs = options.civs ?? tiragePaireCivs(seed);
  let state: GameState = createInitialState(map, seed, {
    p1: { civId: civs.p1 },
    p2: { civId: civs.p2 },
  });
  const seedPartie = state.rngSeed;
  const profils = profileDuBot(difficulte);
  const toursObs: TourObserve[] = [];
  for (let t = 0; t < tours && state.winner === null; t++) {
    const declarations: EvenementObserve[] = [];
    const paix: EvenementObserve[] = [];
    const orders: Record<string, Order[]> = { p1: [], p2: [] };
    for (const id of ['p1', 'p2'] as const) {
      if (state.players[id]?.defeated === true) continue;
      const rng = createRng(botTurnSeed(seedPartie, state.turn, id));
      const plan = botPolicy(state, id, rng, difficulte);
      orders[id] = plan.orders;
      for (const action of plan.actions) {
        if (action.type === 'DeclareWar') {
          const fMe = forcesDe(state, id);
          const fCible = forcesDe(state, action.player);
          const r = applyDeclareWar(state, id, action.player);
          if (r.ok) {
            state = r.state;
            declarations.push({
              type: 'WarDeclared',
              from: id,
              on: action.player,
              forcesDeclarant: fMe,
              forcesCible: fCible,
            });
          }
        } else if (action.type === 'ProposePeace') {
          const fFrom = forcesDe(state, id);
          const fOn = forcesDe(state, action.player);
          const accepte = deciderPaix(state, action.player, id, profils);
          const r = applyProposePeace(state, id, action.player, accepte);
          if (r.ok) {
            state = r.state;
            paix.push({
              type: accepte ? 'PeaceAccepted' : 'PeaceRefused',
              from: id,
              on: action.player,
              forcesFrom: fFrom,
              forcesOn: fOn,
            });
          }
        }
      }
    }
    const res = resolveTurn(state, orders, state.rngSeed);
    state = res.newState;
    toursObs.push(observationTour(state, [...declarations, ...paix, ...res.events] as GameEvent[]));
  }
  return extraireChronologies(toursObs, { seed, difficulte });
}

function observationTour(state: GameState, evenements: GameEvent[]): TourObserve {
  const forces: Record<string, number> = {};
  const civs: Record<string, string> = {};
  const capitale: Record<string, { q: number; r: number } | null> = {};
  const ownerOf: Record<string, string> = {};
  const posOf: Record<string, { q: number; r: number }> = {};
  const defaits: string[] = [];
  for (const p of Object.values(state.players)) {
    forces[p.id] = forcesDe(state, p.id);
    civs[p.id] = p.civId;
    const cap = Object.values(state.cities).find((c) => c.owner === p.id && c.capital)
      ?? Object.values(state.cities).find((c) => c.owner === p.id);
    capitale[p.id] = cap ? { q: cap.q, r: cap.r } : null;
    if (p.defeated === true) defaits.push(p.id);
  }
  for (const u of Object.values(state.units)) {
    ownerOf[u.id] = u.owner;
    posOf[u.id] = { q: u.q, r: u.r };
  }
  const paires = (state.diplomacy.war ?? []).map(([a, b]) => `${a}|${b}`);
  return {
    tour: state.turn,
    largeur: state.mapWidth,
    forces,
    civs,
    capitale,
    ownerOf,
    posOf,
    paires,
    evenements: evenements.flatMap((e) => (TYPES_OBSERVES.has(e.type) ? [e as EvenementObserve] : [])),
    winner: state.winner ?? null,
    defaits,
  };
}

/** Extraction PURE des chronologies depuis la suite de tours observés (D2) —
 *  testée sur une fixture à guerre connue (L1). */
export function extraireChronologies(
  tours: TourObserve[],
  meta: { seed: number; difficulte: BotDifficulte },
): ChronologiePartie {
  const guerres: ChronologieGuerre[] = [];
  const captures: ChronologiePartie['captures'] = [];
  const eliminations: ChronologiePartie['eliminations'] = [];
  const actives = new Map<string, ChronologieGuerre>();
  const cle = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  let winner: string | null = null;

  for (const obs of tours) {
      // 1) Nouvelles guerres (déclaration CE tour).
    for (const ev of obs.evenements) {
      if (ev.type === 'WarDeclared' && ev.from && ev.on) {
        const g: ChronologieGuerre = {
          declarant: ev.from,
          cible: ev.on,
          tourDeclaration: obs.tour,
          forcesDeclarant: ev.forcesDeclarant ?? 0,
          forcesCible: ev.forcesCible ?? 0,
          ratioDeclaration: (ev.forcesCible ?? 0) > 0 ? (ev.forcesDeclarant ?? 0) / (ev.forcesCible ?? 1) : Infinity,
          batailles: 0,
          pertes: { declarant: 0, cible: 0 },
          progressionCapitale: null,
          paixProposees: [],
          tourFin: null,
          duree: 0,
          issue: 'enCours',
        };
        guerres.push(g);
        actives.set(cle(ev.from, ev.on), g);
      }
    }

    // 2) Batailles / pertes / captures / éliminations attribués aux guerres actives.
    for (const ev of obs.evenements) {
      if (ev.type === 'CombatExchange') {
        const oa = obs.ownerOf[ev.attackerId ?? ''];
        const od = obs.ownerOf[ev.defenderId ?? ''];
        if (!oa || !od || oa === od) continue;
        const g = actives.get(cle(oa, od));
        if (g) g.batailles++;
      } else if (ev.type === 'UnitDestroyed' && ev.owner) {
        for (const g of actives.values()) {
          if (ev.owner === g.declarant) g.pertes.declarant++;
          else if (ev.owner === g.cible) g.pertes.cible++;
        }
      } else if (ev.type === 'CityCaptured') {
        captures.push({ tour: obs.tour, cityId: ev.cityId ?? '', de: ev.fromOwner ?? '', vers: ev.toOwner ?? '' });
      } else if (ev.type === 'PlayerDefeated' && ev.player) {
        eliminations.push({ tour: obs.tour, joueur: ev.player, par: ev.byPlayer ?? null, cause: ev.cause ?? '' });
      }
    }

    // 3) Progression vers la capitale cible (min dist du déclarant).
    for (const [k, g] of actives) {
      const cap = obs.capitale[g.cible];
      if (cap) {
        for (const [uid, owner] of Object.entries(obs.ownerOf)) {
          if (owner !== g.declarant) continue;
          const pos = obs.posOf[uid];
          if (!pos) continue;
          const d = hexDistanceW(pos, cap, obs.largeur);
          if (g.progressionCapitale === null || d < g.progressionCapitale) g.progressionCapitale = d;
        }
      }
      // Fermeture : paire disparue (paix acceptée) ou un camp éliminé.
      if (!obs.paires.includes(k) || obs.defaits.includes(g.declarant) || obs.defaits.includes(g.cible)) {
        g.tourFin = obs.tour;
        g.duree = obs.tour - g.tourDeclaration;
        if (obs.defaits.includes(g.declarant)) g.issue = 'elimination-declarant';
        else if (obs.defaits.includes(g.cible)) g.issue = 'elimination-cible';
        else if (obs.evenements.some((e) => e.type === 'PeaceAccepted' && memePaire(e, g))) g.issue = 'paix';
        else g.issue = 'fin-inconnue';
        actives.delete(k);
      }
    }

    // 4) Propositions de paix (avant fermeture ? non — acceptée ferme en 3,
    //    on l'enregistre donc ICI avant la fermeture du tour suivant ; ordre :
    //    la proposition CE tour est enregistrée puis la fermeture du MÊME
    //    tour l'a déjà consommée — on traite donc la paix AVANT la fermeture.
    for (const ev of obs.evenements) {
      if ((ev.type === 'PeaceAccepted' || ev.type === 'PeaceRefused') && ev.from && ev.on) {
        // Guerre EN COURS de cette paire d'abord (une paire peut re-déclarer
        // après une paix — les propositions vont à la guerre active, pas à
        // l'historique) ; repli : la plus récente de la paire.
        const g =
          guerres.find((x) => x.issue === 'enCours' && memePaire(ev, x)) ??
          [...guerres].reverse().find((x) => memePaire(ev, x));
        if (!g) continue;
        g.paixProposees.push({
          tour: obs.tour,
          par: ev.from === g.declarant ? 'declarant' : 'cible',
          rapportForces: (ev.forcesOn ?? 0) > 0 ? (ev.forcesFrom ?? 0) / (ev.forcesOn ?? 1) : Infinity,
          acceptee: ev.type === 'PeaceAccepted',
        });
      }
    }

    if (obs.winner) winner = obs.winner;
  }

  const derniere = tours[tours.length - 1];
  return {
    seed: meta.seed,
    difficulte: meta.difficulte,
    tours: derniere?.tour ?? 0,
    winner,
    civs: derniere?.civs ?? {},
    guerres,
    captures,
    eliminations,
  };
}

function memePaire(e: EvenementObserve, g: { declarant: string; cible: string }): boolean {
  return (
    (e.from === g.declarant && e.on === g.cible) || (e.from === g.cible && e.on === g.declarant)
  );
}

// ---------------------------------------------------------------------------
// D3 — métriques agrégées (par difficulté et par civ).
// ---------------------------------------------------------------------------

export interface MetriquesDifficulte {
  difficulte: BotDifficulte;
  parties: number;
  guerres: number;
  guerresParPartie: number;
  /** Guerres par 30 tours (fréquence D3, normalisée par la durée jouée). */
  guerresPar30Tours: number;
  tourPremiereGuerre: number | null;
  ratioDeclarationMoyen: number;
  /** Part des déclarations où le DÉCLARANT était le plus fort (ratio ≥ 1). */
  declarantFort: number;
  dureeMoyenne: number;
  /** Guerres sans AUCUNE bataille (stériles, D3). */
  tauxSteriles: number;
  paixProposees: number;
  paixAcceptees: number;
  /** Taux d'acceptation quand le proposeur est PERDANT (rapport < 1) / GAGNANT. */
  tauxAcceptePerdant: number;
  tauxAccepteGagnant: number;
  captures: number;
  eliminations: number;
  /** Parties terminées avant t30 / t50 (écrasement D3). */
  finiesAvantT30: number;
  finiesAvantT50: number;
  toursMoyens: number;
}

export function metriquesParDifficulte(parties: ChronologiePartie[]): MetriquesDifficulte[] {
  const parDiff = new Map<BotDifficulte, ChronologiePartie[]>();
  for (const p of parties) {
    const l = parDiff.get(p.difficulte) ?? [];
    l.push(p);
    parDiff.set(p.difficulte, l);
  }
  return [...parDiff.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([difficulte, list]) => {
      const n = list.length || 1;
      const guerres = list.flatMap((p) => p.guerres);
      const finies = guerres.filter((g) => g.tourFin !== null);
      const props = guerres.flatMap((g) => g.paixProposees);
      const perdant = props.filter((x) => x.rapportForces < 1);
      const gagnant = props.filter((x) => x.rapportForces >= 1);
      const premieres = list.map((p) => p.guerres[0]?.tourDeclaration).filter((x): x is number => x !== undefined);
      const toursMoyens = list.reduce((s, p) => s + p.tours, 0) / n;
      return {
        difficulte,
        parties: list.length,
        guerres: guerres.length,
        guerresParPartie: guerres.length / n,
        guerresPar30Tours: (guerres.length / (list.reduce((s, p) => s + p.tours, 0) || 1)) * 30,
        tourPremiereGuerre: premieres.length ? premieres.reduce((s, x) => s + x, 0) / premieres.length : null,
        ratioDeclarationMoyen: guerres.length
          ? guerres.reduce((s, g) => s + Math.min(g.ratioDeclaration, 10), 0) / guerres.length
          : 0,
        declarantFort: guerres.length ? guerres.filter((g) => g.ratioDeclaration >= 1).length / guerres.length : 0,
        dureeMoyenne: finies.length ? finies.reduce((s, g) => s + g.duree, 0) / finies.length : 0,
        tauxSteriles: guerres.length ? guerres.filter((g) => g.batailles === 0).length / guerres.length : 0,
        paixProposees: props.length,
        paixAcceptees: props.filter((x) => x.acceptee).length,
        tauxAcceptePerdant: perdant.length ? perdant.filter((x) => x.acceptee).length / perdant.length : 0,
        tauxAccepteGagnant: gagnant.length ? gagnant.filter((x) => x.acceptee).length / gagnant.length : 0,
        captures: list.reduce((s, p) => s + p.captures.length, 0),
        eliminations: list.reduce((s, p) => s + p.eliminations.length, 0),
        finiesAvantT30: list.filter((p) => p.winner && p.tours < 30).length,
        finiesAvantT50: list.filter((p) => p.winner && p.tours < 50).length,
        toursMoyens,
      };
    });
}

export interface MetriquesCiv {
  civId: string;
  agressiviteDeclaree: number;
  declarations: number;
  /** Guerres subies (cible). */
  subies: number;
  partiesJouees: number;
  /** Déclarations par partie — l'agressivité OBSERVÉE (D3). */
  declarationsParPartie: number;
}

export function metriquesParCiv(parties: ChronologiePartie[]): MetriquesCiv[] {
  const acc = new Map<string, { declarations: number; subies: number; parties: number }>();
  for (const p of parties) {
    for (const [pid, civ] of Object.entries(p.civs)) {
      if (pid !== 'p1' && pid !== 'p2') continue;
      const a = acc.get(civ) ?? { declarations: 0, subies: 0, parties: 0 };
      a.parties++;
      a.declarations += p.guerres.filter((g) => g.declarant === pid).length;
      a.subies += p.guerres.filter((g) => g.cible === pid).length;
      acc.set(civ, a);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([civId, a]) => ({
      civId,
      agressiviteDeclaree: agressiviteDe(civId),
      declarations: a.declarations,
      subies: a.subies,
      partiesJouees: a.parties,
      declarationsParPartie: a.parties ? a.declarations / a.parties : 0,
    }));
}

// ---------------------------------------------------------------------------
// BOT-P7-CIVS — tirage de la paire de civs d'une partie du banc (D1).
// Miroir du tirage seedé lobby (R-80/R-81) : RNG dérivé du seed de partie,
// mêmes ids triés R-81, sans remise (civs distinctes). Salage 0x5ebc0
// (déterministe, choisi pour zéro paire ordonnée dupliquée + couverture
// 16/16 civs sur le corpus 40 — vérifié par tests L1).
// Le tirage NE touche aucune valeur de comportement — il assigne seulement
// des civs réelles aux deux bots du banc.
// ---------------------------------------------------------------------------

export function tiragePaireCivs(seed: number): { p1: string; p2: string } {
  const ids = Object.keys(CIVILIZATIONS.civs).sort(); // R-81
  const rng = createRng((seed ^ 0x5ebc0) >>> 0);
  const p1 = ids[rng.nextInt(ids.length)]!;
  let p2 = ids[rng.nextInt(ids.length)]!;
  while (p2 === p1) p2 = ids[rng.nextInt(ids.length)]!;
  return { p1, p2 };
}

/** PV militaires d'un état (miroir bancBotTd — pour les stats de fin). */
export function pvMilitaires(state: GameState): number {
  return Object.values(state.units).reduce(
    (s, u) => s + ((UNIT_TYPES[u.type]?.canAttack ?? false) ? u.hp : 0),
    0,
  );
}
