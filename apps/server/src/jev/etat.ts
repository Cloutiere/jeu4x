/**
 * JEV-FUMEE-LOBBY · D3/D4 — état Jev PAR PARTIE, hors état moteur (aucune
 * migration, schemaVersion 28) : mémoire inter-tours du pipeline v3, compteur
 * de budget (plafond 0,25 $/partie — au plafond, Jev devient bot pur pour le
 * reste de la partie), compteur d'échecs consécutifs (3 → Jev désactivé),
 * et répertoire du journal de partie (une entrée par tour, clé dédiée en
 * storage — réutilisable pour l'itération 4).
 */

export const PLAFOND_BUDGET_USD = 0.25;
export const MAX_ECHECS_CONSECUTIFS = 3;
/** Prix ENTRÉE jev-latest utilisé par le harnais ($/M jetons) — même formule
 * de coût que le banc (journal.mjs : jetonsEntree * 0.042 / 1e6). */
export const PRIX_ENTREE_USD_PAR_MILLION = 0.042;

/** Mémoire inter-tours du pipeline v3 (joueur.ts). Côté harnais, deux champs
 * sont des `Set` ; ici, des arrays sérialisables en JSON storage. */
export interface JevMemo {
  techRecherche?: string | null;
  fondationEnCours?: { case: string; tour: number; unitId: string | null } | null;
  casesFondationEchouees?: string[];
  echangesRefuses?: string[];
  colonProduit?: string[];
  gainNetPredits?: Record<string, { gainNet: number | null; tour: number }>;
  relevesJeunes?: Array<{ ville: string; owner: string; tour: number; gainNetPredite: number | null }>;
  /** ZII-V1 · D5 : résumés de chat en attente — injectés au condensé
   *  (`chatsPourJev`) puis consommés par le GameDO. */
  resumesPourJev?: Array<{ tour: number; de: string; resume: string }>;
}

export interface JevEtat {
  /** Budget consommé depuis le début de la partie (USD — formule harnais). */
  budgetUsd: number;
  /** Erreurs API consécutives (D4 : 3 → désactivation pour la partie). */
  echecsConsecutifs: number;
  /** D4 : désactivé (3 échecs ou plafond budget) → bot pur, consigné. */
  desactive: 'non' | 'budget' | 'echecs';
  memo: JevMemo;
  /** Numéros de tour présents dans le journal (`jevjournal:<tour>`). */
  journalTours: number[];
}

export function jevEtatInitial(): JevEtat {
  return { budgetUsd: 0, echecsConsecutifs: 0, desactive: 'non', memo: {}, journalTours: [] };
}

export function coutAppelUsd(jetonsEntree: number): number {
  return (jetonsEntree * PRIX_ENTREE_USD_PAR_MILLION) / 1_000_000;
}

/** Jev peut-il décider ce tour ? (actif, budget sous le plafond, pas
 * désactivé). L'échec/le dépassement est enregistré par l'appelant. */
export function jevActif(etat: JevEtat): boolean {
  return etat.desactive === 'non' && etat.budgetUsd < PLAFOND_BUDGET_USD;
}

/** Enregistre le résultat d'UN appel : succès (budget + remise à zéro des
 * échecs) ou échec (échecs consécutifs + désactivation au 3e — D4). */
export function enregistrerAppel(etat: JevEtat, ok: boolean, jetonsEntree: number): void {
  if (ok) {
    etat.budgetUsd += coutAppelUsd(jetonsEntree);
    etat.echecsConsecutifs = 0;
    if (etat.budgetUsd >= PLAFOND_BUDGET_USD) etat.desactive = 'budget';
    return;
  }
  etat.echecsConsecutifs += 1;
  if (etat.echecsConsecutifs >= MAX_ECHECS_CONSECUTIFS) etat.desactive = 'echecs';
}

/** Journal de tour — persisté sous `jevjournal:<tour>` (condensé + questions
 * + réponses + décisions + latence : le corpus de l'itération 4). */
export interface JevJournalEntree {
  tour: number;
  condense: unknown;
  questions: unknown;
  reponses: unknown;
  repli: boolean;
  plate: boolean;
  ordres: unknown[];
  actions: unknown[];
  diplomatie: unknown[];
  latenceMs: number | null;
  jetonsEntree: number;
  erreur: string | null;
  budgetApresUsd: number;
}
