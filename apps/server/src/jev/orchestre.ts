/**
 * JEV-FUMEE-LOBBY · L2 — orchestration du tour de Jev dans le GameDO
 * (miroir du harnais sableuse/src/partie.mjs, mode « Jev JOUEUR ») :
 *  - le plan bot de base (botPolicy — le TACTIQUE) est conservé pour le siège
 *    Jev ; les overrides du pipeline v3 (le STRATÉGIQUE) le fusionnent par
 *    domaine (fusionnerPlan) ;
 *  - Jev a le dernier mot sur la guerre : la déclaration du plan bot de son
 *    siège est TOUJOURS retirée ; un choix `guerre` (même 'aucun') retire
 *    aussi les déclarations des autres bots ce tour ;
 *  - le bot tactique ne re-tourne JAMAIS un colon en fondation programmée ;
 *  - la diplomatie argumentée de Jev (guerre/paix/échange) est appliquée sur
 *    l'état complet avec la réponse seedée canon T2 (deciderPaixNegociee /
 *    deciderEchangeTechs — tirage dédié negoc-*, une itération). 🔶 la cible
 *    est ici souvent le JOUEUR HUMAIN : sa réponse est simulée par le même
 *    décideur déterministe que les bots (précédent BOT-TC « la décision
 *    s'applique aux DEUX sens », consigné au rapport) ;
 *  - budget (D3) et replis (D4) sont tenus dans JevEtat (etat.ts) ;
 *  - le journal de tour (condensé + questions + réponses + décisions) est
 *    retourné pour persistance sous `jevjournal:<tour>`.
 */
import {
  applyDeclareWar,
  applyProposePeace,
  applyTradeTechs,
  agressiviteDe,
  createRng,
  getFilteredState,
  type GameEvent,
  type GameState,
  type Order,
} from '@game/rules';
import type { EnginePlayerId } from '../game.js';
import { botTurnSeed, deciderEchangeTechs, deciderPaixNegociee, negociationDuBot, profileDuBot } from '../botPolicy.js';
import type { ClientJev, DecisionJev } from './joueur.js';
import { fusionnerPlan, memoRefusEchange, tourJevJoueur } from './joueur.js';
import { coutAppelUsd, enregistrerAppel, jevActif, type JevEtat, type JevJournalEntree } from './etat.js';

type AnyEtat = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Actions immédiates de Jev — appliquées par le GameDO via les mêmes
 * helpers purs que les messages humains (applySetResearch/applySetConversion). */
export type ActionJev = { type: 'SetResearch'; techId: string } | { type: 'SetConversion'; cityId: string; vers: 'gold' | 'science' };

export interface PlanJev {
  /** Overrides traduits du pipeline v3 — à fusionner sur le plan bot. */
  ordres: Order[];
  /** Actions immédiates — à appliquer APRÈS celles du bot (dernier mot). */
  actions: ActionJev[];
  /** Intentions diplomatiques BRUTES — appliquées APRÈS les actions
   * (appliquerDiplomatieJev), sur l'état complet. */
  intentions: Array<{ genre: 'guerre'; cible: string } | { genre: 'paix'; cible: string; or: number } | { genre: 'echange'; cible: string; techOfferte: string; techDemandee: string }>;
  /** Unitaire(s) dont les ordres bot doivent être retirés (fondation programmée). */
  retiresUnitIds: string[];
  /** Un choix 'guerre' (même 'aucun') bloque toute déclaration du bot pour
   * Jev ce tour — y compris celles des AUTRES bots. */
  bloqueGuerreBot: boolean;
  /** Attentes de fondation — persistées dans le motif de résolution pour la
   * liste noire post-résolution (attentesPostResolution). */
  attentes: Array<{ genre: string; unitId?: string; case?: string }>;
  entreeJournal: JevJournalEntree | null;
};

export const PLAN_JEV_VIDE: PlanJev = {
  ordres: [],
  actions: [],
  intentions: [],
  retiresUnitIds: [],
  bloqueGuerreBot: false,
  attentes: [],
  entreeJournal: null,
};

function entreeDe(seat: string, tour: number, decision: DecisionJev, budgetUsd: number): JevJournalEntree {
  return {
    tour,
    condense: decision.condense,
    questions: decision.questions,
    reponses: decision.reponses,
    repli: decision.repli,
    plate: decision.plate,
    ordres: decision.ordres,
    actions: decision.actions,
    diplomatie: decision.diplomatie,
    latenceMs: decision.latenceMs,
    jetonsEntree: decision.jetonsEntree,
    erreur: decision.erreur,
    budgetApresUsd: Math.round((budgetUsd + coutAppelUsd(decision.jetonsEntree)) * 10000) / 10000,
  };
}

/**
 * Décide le tour de Jev (1 appel LLM maximum) et retourne le plan à appliquer.
 * Repli D4 silencieux : clé absente, Jev désactivé (budget/échecs), rien de
 * décidable, erreur/timeout API → PLAN_JEV_VIDE (le plan bot standard joue).
 * Met à jour `etat` (budget, échecs consécutifs, memo inter-tours).
 */
export async function planifierJev(opts: {
  client: ClientJev | null;
  game: GameState;
  seed: number;
  seat: EnginePlayerId;
  config: AnyEtat;
  etat: JevEtat;
}): Promise<PlanJev> {
  const { game, seat } = opts;
  const etat = opts.etat;
  if (!opts.client || !jevActif(etat)) return PLAN_JEV_VIDE;

  const filtre = getFilteredState(game, seat as AnyEtat);
  let decision: DecisionJev;
  try {
    decision = await tourJevJoueur(opts.client, opts.config, filtre, seat, etat.memo);
  } catch {
    // Défense en profondeur : tourJevJoueur capture déjà ses erreurs API.
    enregistrerAppel(etat, false, 0);
    return PLAN_JEV_VIDE;
  }

  if (decision.erreur) {
    enregistrerAppel(etat, false, 0);
    return { ...PLAN_JEV_VIDE, entreeJournal: entreeDe(seat, game.turn, decision, etat.budgetUsd) };
  }
  enregistrerAppel(etat, true, decision.jetonsEntree);

  // Discipline v3 (canon harnais) : le bot tactique ne touche pas au colon
  // d'une fondation programmée ; fondation perdue → programmation levée.
  const fondation = etat.memo.fondationEnCours;
  let retiresUnitIds: string[] = [];
  if (fondation?.unitId) {
    if (!(game.units as AnyEtat)[fondation.unitId]) delete etat.memo.fondationEnCours;
    else retiresUnitIds = [fondation.unitId];
  }

  return {
    ordres: fusionnerPlan([], decision.ordres),
    actions: decision.actions as ActionJev[],
    intentions: decision.diplomatie as PlanJev['intentions'],
    retiresUnitIds,
    bloqueGuerreBot: decision.bloqueGuerreBot,
    attentes: (decision.attentes ?? []).map((a: AnyEtat) => ({ genre: a.genre, unitId: a.unitId, case: a.case })),
    entreeJournal: entreeDe(seat, game.turn, decision, etat.budgetUsd),
  };
}

/**
 * Diplomatie argumentée de Jev — appliquée sur l'état COMPLET, APRÈS les
 * actions immédiates (ordre canon du harnais). Réponse de la cible seedée
 * (grille negociation canon T2, tirage dédié, une seule itération). Un refus
 * d'échange est mémorisé (memo.echangesRefuses) pour ne pas re-proposer.
 */
export function appliquerDiplomatieJev(
  game: GameState,
  seed: number,
  seat: EnginePlayerId,
  intentions: PlanJev['intentions'],
  etat: JevEtat,
): { game: GameState; events: GameEvent[] } {
  let courant = game;
  const events: GameEvent[] = [];
  for (const d of intentions) {
    if (d.genre === 'guerre') {
      const r = applyDeclareWar(courant, seat, d.cible);
      if (r.ok) {
        courant = r.state;
        events.push(...r.events);
      }
    } else if (d.genre === 'paix') {
      const rng = createRng(botTurnSeed(seed, courant.turn, `negoc-paix-${d.cible}-${seat}`));
      const reponse = deciderPaixNegociee(
        courant,
        d.cible as AnyEtat,
        seat as AnyEtat,
        d.or ?? 0,
        profileDuBot(),
        negociationDuBot(),
        rng,
        agressiviteDe((courant.players as AnyEtat)[d.cible]?.civId),
      ) as AnyEtat;
      const accepte = reponse === 'accepte';
      const r = applyProposePeace(courant, seat, d.cible, accepte, d.or > 0 ? d.or : undefined);
      if (r.ok) {
        courant = r.state;
        events.push(...r.events);
      }
    } else if (d.genre === 'echange' && d.cible) {
      const offre = { techOfferte: d.techOfferte, techDemandee: d.techDemandee };
      const rng = createRng(botTurnSeed(seed, courant.turn, `negoc-tech-${d.cible}-${seat}`));
      const reponse = deciderEchangeTechs(
        courant,
        d.cible as AnyEtat,
        seat as AnyEtat,
        offre,
        profileDuBot(),
        negociationDuBot(),
        rng,
        agressiviteDe((courant.players as AnyEtat)[d.cible]?.civId),
      ) as AnyEtat;
      const accepte = reponse === 'accepte';
      const r = applyTradeTechs(courant, seat, d.cible, offre, accepte);
      if (r.ok) {
        courant = r.state;
        events.push(...r.events);
        if (!accepte) memoRefusEchange(etat.memo, d.techOfferte, d.techDemandee);
      } else {
        memoRefusEchange(etat.memo, d.techOfferte, d.techDemandee);
      }
    }
  }
  return { game: courant, events };
}

/** Post-résolution (miroir compterRejets du harnais — seulement ce qui
 * alimente le memo v3). Les attentes de fondation sont persistées dans le
 * motif (`resolving.jevAttentes`) et rejouées ici de façon idempotente :
 * une fondation rejetée met sa case en liste noire, une fondation réalisée
 * consomme la programmation, un colon produit arme la règle « capitale
 * post-colon » du repli de conversion. */
export function attentesPostResolution(
  game: GameState,
  events: GameEvent[],
  attentes: Array<{ genre: string; unitId?: string; case?: string }>,
  etat: JevEtat,
  seat: EnginePlayerId,
): void {
  for (const a of attentes) {
    if (a.genre !== 'fondation' || !a.case || !a.unitId) continue;
    const fondee = events.some((e) => e.type === 'CityFounded' && (e as AnyEtat).byUnitId === a.unitId);
    const unite = (game.units as AnyEtat)[a.unitId];
    // Rejet au sens harnais : pas de fondation ET le colon existe encore
    // (la fondation réussie le consomme ; un colon mort n'est pas un rejet
    // réessayable).
    if (!fondee && unite) {
      etat.memo.casesFondationEchouees = etat.memo.casesFondationEchouees ?? [];
      if (!etat.memo.casesFondationEchouees.includes(a.case)) etat.memo.casesFondationEchouees.push(a.case);
    }
  }
  for (const ev of events) {
    if (ev.type === 'CityFounded' && (ev as AnyEtat).owner === seat && etat.memo.fondationEnCours) {
      delete etat.memo.fondationEnCours;
    }
    if (ev.type === 'UnitProduced' && (ev as AnyEtat).owner === seat && typeof (ev as AnyEtat).unitType === 'string' && (ev as AnyEtat).unitType.includes('colon')) {
      etat.memo.colonProduit = etat.memo.colonProduit ?? [];
      if (!etat.memo.colonProduit.includes(seat)) etat.memo.colonProduit.push(seat);
    }
  }
}
