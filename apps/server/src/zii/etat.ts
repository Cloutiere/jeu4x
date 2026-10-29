/**
 * ZII-V1 · D6 — état Zii PAR PARTIE, hors état moteur (aucune migration,
 * schemaVersion 28) : budget léger (plafond data-driven zii.json — au plafond
 * Zii devient muette pour le reste de la partie), échecs consécutifs (3 →
 * désactivation), marqueurs de salutations (une fois par partie / par
 * rencontre — D2), relais resumePourJev (D5 — consommé au prochain tour de
 * décision de Jev) et journal complet (réutilisable pour l'itération Zii).
 * Le prix d'entrée est celui du SDK, miroir du harnais (jev/etat.ts).
 */
import { PRIX_ENTREE_USD_PAR_MILLION } from '../jev/etat.js';

export const MAX_ECHECS_CONSECUTIFS = 3;
/** Plafond du journal de tour (les plus anciens tombent — D6). */
export const ZII_JOURNAL_MAX = 50;

export interface ResumePourJev {
  tour: number;
  /** EngineId de l'auteur humain du message. */
  de: string;
  /** Résumé FACTUEL (D4) — Jev lit ceci, jamais le chat brut. */
  resume: string;
}

export interface ZiiJournalEntree {
  tour: number;
  auteur: string;
  canal: string;
  /** Message du joueur (donnée non fiable — journalisé tel quel). */
  texteRecu: string;
  /** Réplique de Zii (null = repli silencieux). */
  message: string | null;
  ton: string | null;
  intentionPercue: string | null;
  resume: string | null;
  repli: boolean;
  latenceMs: number | null;
  jetonsEntree: number;
  erreur: string | null;
  budgetApresUsd: number;
}

export interface ZiiEtat {
  budgetUsd: number;
  echecsConsecutifs: number;
  /** D6 : désactivée (3 échecs ou plafond budget) → muette, consigné. */
  desactive: 'non' | 'budget' | 'echecs';
  /** D2a : la salutation de début de partie a été tirée (une seule fois). */
  salutationDebutFaite: boolean;
  /** D2b : rencontres déjà saluées (engineIds — une seule fois chacune). */
  salutationsRencontre: string[];
  /** D5 : résumés en attente du prochain tour de décision de Jev. */
  resumesPourJev: ResumePourJev[];
  journal: ZiiJournalEntree[];
}

export function ziiEtatInitial(): ZiiEtat {
  return {
    budgetUsd: 0,
    echecsConsecutifs: 0,
    desactive: 'non',
    salutationDebutFaite: false,
    salutationsRencontre: [],
    resumesPourJev: [],
    journal: [],
  };
}

export function coutAppelZiiUsd(jetonsEntree: number): number {
  return (jetonsEntree * PRIX_ENTREE_USD_PAR_MILLION) / 1_000_000;
}

/** Zii peut-elle parler ? (active, budget sous le plafond data-driven). */
export function ziiActif(etat: ZiiEtat, plafondUsd: number): boolean {
  return etat.desactive === 'non' && etat.budgetUsd < plafondUsd;
}

/** Enregistre UN appel (miroir enregistrerAppel de Jev — plafond paramétré). */
export function enregistrerAppelZii(etat: ZiiEtat, ok: boolean, jetonsEntree: number, plafondUsd: number): void {
  if (ok) {
    etat.budgetUsd += coutAppelZiiUsd(jetonsEntree);
    etat.echecsConsecutifs = 0;
    if (etat.budgetUsd >= plafondUsd) etat.desactive = 'budget';
    return;
  }
  etat.echecsConsecutifs += 1;
  if (etat.echecsConsecutifs >= MAX_ECHECS_CONSECUTIFS) etat.desactive = 'echecs';
}

/** Ajout borné au journal (les plus anciens tombent). */
export function avecEntreeJournal(etat: ZiiEtat, entree: ZiiJournalEntree): void {
  etat.journal = [...etat.journal, entree];
  if (etat.journal.length > ZII_JOURNAL_MAX) etat.journal = etat.journal.slice(etat.journal.length - ZII_JOURNAL_MAX);
}
