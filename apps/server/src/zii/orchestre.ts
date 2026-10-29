/**
 * ZII-V1 · L2 — orchestration de Zii dans le GameDO (miroir jev/orchestre.ts) :
 *  - salutations (D2) DÉTERMINISTES : le tirage (sociabilité de la civ de Jev,
 *    nombre de joueurs) et le choix de l'énoncé sont seedés — même seed → même
 *    salutation, idempotent au rejeu de l'activation de partie, ZÉRO appel LLM ;
 *  - réponses (D1) : paquet léger → questions → LLM léger → décodeur → réplique
 *    canon de chat + resumePourJev (D5) ; réponse invalide/erreur/budget →
 *    repli SILENCIEUX (aucun message), consigné au journal (D6).
 */
import type { ChatMessageData, GameState } from '@game/shared';
import { botTurnSeed } from '../botPolicy.js';
import { CIVILIZATIONS, createRng, getFilteredState, sociabiliteDe } from '@game/rules';
import type { EnginePlayerId } from '../game.js';
import {
  candidatsDe,
  composerResume,
  decoderReponseZii,
  dirigeantDe,
  intentionDe,
  paquetZii,
  probabiliteSalutation,
  questionsZii,
  tirerSalutation,
  type ConfigZii,
  type IntentionZii,
  type SlotsZii,
} from './zii.js';
import {
  avecEntreeJournal,
  enregistrerAppelZii,
  ziiActif,
  type ZiiEtat,
  type ZiiJournalEntree,
} from './etat.js';

export interface ClientZii {
  systemOne(args: { state: unknown; questions: unknown; model?: string }): Promise<{
    answers: unknown;
    usage?: { input_tokens?: number };
  }>;
}

export interface SalutationZii {
  envoyee: boolean;
  /** Énoncé choisi (déjà substitué) — null si pas de salutation. */
  message: string | null;
}

function civJoueur(game: GameState, id: string): string {
  return (game.players as Record<string, { civId?: string }>)[id]?.civId ?? 'neutre';
}

/** D2a — salutation de DÉBUT DE PARTIE (canal Général). Une seule fois par
 *  partie (marqueur d'état) ; tirage sociabilité × joueurs, énoncé seedé. */
export function salutationDebutZii(
  config: ConfigZii,
  etat: ZiiEtat,
  seed: number,
  civJev: string | undefined,
  nbJoueurs: number,
): SalutationZii {
  if (etat.salutationDebutFaite) return { envoyee: false, message: null };
  etat.salutationDebutFaite = true;
  const p = probabiliteSalutation(sociabiliteDe(civJev), nbJoueurs);
  const rng = createRng(botTurnSeed(seed, 0, 'zii-salut-debut'));
  if (!tirerSalutation(rng.next, p)) return { envoyee: false, message: null };
  const candidats = candidatsDe(config, 'salutationDebut');
  const message = candidats[Math.floor(rng.next() * candidats.length)] ?? null;
  return { envoyee: message !== null, message };
}

/** D2b — salutation de PREMIÈRE RENCONTRE (canal individuel). Une fois par
 *  rencontre (marqueur d'état par engineId), toujours courtoise — pas de
 *  tirage ; l'énoncé est seedé par la civ du rencontré. */
export function salutationRencontreZii(
  config: ConfigZii,
  etat: ZiiEtat,
  seed: number,
  autre: string,
  slots: SlotsZii,
): SalutationZii {
  if (etat.salutationsRencontre.includes(autre)) return { envoyee: false, message: null };
  etat.salutationsRencontre = [...etat.salutationsRencontre, autre];
  const candidats = candidatsDe(config, 'salutationRencontre', slots);
  const rng = createRng(botTurnSeed(seed, 0, `zii-salut-rencontre-${autre}`));
  const message = candidats[Math.floor(rng.next() * candidats.length)] ?? null;
  return { envoyee: message !== null, message };
}

export interface ResultatReponseZii {
  message: ChatMessageData | null;
  resume: string | null;
  ton: string | null;
  intentionPercue: IntentionZii | null;
  repli: boolean;
  latenceMs: number | null;
  jetonsEntree: number;
  erreur: string | null;
}

function entreeDe(
  opts: { auteur: string; canal: string; texte: string; game: GameState },
  r: ResultatReponseZii,
  budgetApresUsd: number,
): ZiiJournalEntree {
  return {
    tour: opts.game.turn,
    auteur: opts.auteur,
    canal: opts.canal,
    texteRecu: opts.texte,
    message: r.message?.texte ?? null,
    ton: r.ton,
    intentionPercue: r.intentionPercue,
    resume: r.resume,
    repli: r.repli,
    latenceMs: r.latenceMs,
    jetonsEntree: r.jetonsEntree,
    erreur: r.erreur,
    budgetApresUsd,
  };
}

/**
 * D1/D4/D5 — répond au message d'un joueur humain. JAMAIS d'ordre : la sortie
 * est un message de chat canon + un résumé factuel. Repli silencieux total :
 * clé absente, Zii désactivée (budget/échecs), réponse invalide, erreur API.
 */
export async function repondreZii(opts: {
  client: ClientZii | null;
  config: ConfigZii;
  game: GameState;
  partie: string;
  seed: number;
  seat: EnginePlayerId;
  rencontres: string[];
  etat: ZiiEtat;
  auteur: string;
  canal: string;
  texte: string;
  historique: ChatMessageData[];
}): Promise<ResultatReponseZii> {
  const vide: ResultatReponseZii = {
    message: null,
    resume: null,
    ton: null,
    intentionPercue: null,
    repli: true,
    latenceMs: null,
    jetonsEntree: 0,
    erreur: null,
  };
  const { config, etat } = opts;
  if (!opts.client || !ziiActif(etat, config.budgetPlafondUsd)) return vide;

  const etatFiltre = getFilteredState(opts.game, opts.seat as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  const paquet = paquetZii(etatFiltre, opts.seat, opts.rencontres, config, opts.historique);
  const civAuteur = civJoueur(opts.game, opts.auteur);
  const slots: SlotsZii = {
    moiCiv: String((paquet.moi as { civ: string }).civ),
    moiDirigeant: String((paquet.moi as { dirigeant: string }).dirigeant),
    toiCiv: civAuteur,
    toiDirigeant: dirigeantDe(civAuteur),
  };
  const intention = intentionDe(opts.texte, config);
  const { state, questions } = questionsZii(
    config,
    paquet,
    { auteur: opts.auteur, civ: civAuteur, texte: opts.texte },
    slots,
    intention,
  );

  const t0 = Date.now();
  let reponse: { answers: unknown; usage?: { input_tokens?: number } };
  try {
    reponse = await opts.client.systemOne({ state, questions, model: config.modele });
  } catch (e) {
    const erreur = String((e as Error)?.message ?? e);
    enregistrerAppelZii(etat, false, 0, config.budgetPlafondUsd);
    const out = { ...vide, latenceMs: Date.now() - t0, erreur };
    avecEntreeJournal(etat, entreeDe(opts, out, etat.budgetUsd));
    return out;
  }
  const latenceMs = Date.now() - t0;
  const decodee = decoderReponseZii(reponse.answers, config);
  if (!decodee) {
    // Repli silencieux (D4) — l'échec est compté, consigné.
    enregistrerAppelZii(etat, false, 0, config.budgetPlafondUsd);
    const out = { ...vide, latenceMs, erreur: 'réponse invalide (repli silencieux)' };
    avecEntreeJournal(etat, entreeDe(opts, out, etat.budgetUsd));
    return out;
  }
  const jetonsEntree = reponse.usage?.input_tokens ?? Math.ceil(JSON.stringify(state).length / 4);
  enregistrerAppelZii(etat, true, jetonsEntree, config.budgetPlafondUsd);
  const resume = composerResume(
    { auteur: opts.auteur, civ: civAuteur, texte: opts.texte, tour: opts.game.turn },
    decodee.intentionPercue,
  );
  etat.resumesPourJev = [...etat.resumesPourJev, { tour: opts.game.turn, de: opts.auteur, resume }];
  const message: ChatMessageData = {
    partie: opts.partie,
    tour: opts.game.turn,
    auteur: opts.seat,
    canal: opts.canal,
    texte: decodee.message,
    horodatage: Date.now(),
  };
  const out: ResultatReponseZii = {
    message,
    resume,
    ton: decodee.ton,
    intentionPercue: decodee.intentionPercue,
    repli: false,
    latenceMs,
    jetonsEntree,
    erreur: null,
  };
  avecEntreeJournal(etat, entreeDe(opts, out, etat.budgetUsd));
  return out;
}

/** Slots pour une salutation individuelle : Jev parle, `autre` est l'interlocuteur. */
export function slotsRencontre(game: GameState, seat: EnginePlayerId, autre: string): SlotsZii {
  const civMoi = civJoueur(game, seat);
  const civAutre = civJoueur(game, autre);
  return {
    moiCiv: CIVILIZATIONS.civs[civMoi]?.name ?? 'Empire neutre',
    moiDirigeant: CIVILIZATIONS.civs[civMoi]?.leader ?? 'Chef neutre',
    toiCiv: CIVILIZATIONS.civs[civAutre]?.name ?? 'Empire neutre',
    toiDirigeant: CIVILIZATIONS.civs[civAutre]?.leader ?? 'Chef neutre',
  };
}
