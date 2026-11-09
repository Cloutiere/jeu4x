/**
 * ORACLE-VERDICT (canon Erik 09/11, Chemin B) — côté client : la table des
 * verdicts CERTAINS reçus du serveur (BattlePrediction, réponse PRIVÉE) et la
 * cadence des demandes (D2 : une prédiction par planning, pas de spam — une
 * seule demande par (tour, attaquant, cible) ; purge au tour résolu).
 */
import { writable } from 'svelte/store';
import type { GameClient, GameView } from './gameClient.js';

export type VerdictOracle = 'victoire' | 'defaite' | 'refus';

/** Clé d'une bataille hypothétique (attaquant → cible). */
export function cleOracle(attaquant: string, cible: { q: number; r: number }): string {
  return `${attaquant}|${cible.q},${cible.r}`;
}

/** Verdicts reçus ce tour, par clé (attaquant|cible). */
export const predictionsBataille = writable<Record<string, VerdictOracle>>({});

/** Cadence : demandes déjà envoyées ce tour (clé tour|attaquant|cible). */
const envoyes = new Set<string>();

/** Demande au serveur la révélation d'une bataille hypothétique (cadencée). */
export function demanderPrediction(
  client: GameClient,
  view: GameView,
  attaquant: string,
  cible: { q: number; r: number },
): void {
  const cle = `${view.turn}|${cleOracle(attaquant, cible)}`;
  if (envoyes.has(cle)) return;
  envoyes.add(cle);
  client.predireBataille(attaquant, cible);
}

/** Enregistre un verdict reçu (réponse BattlePrediction). */
export function enregistrerPrediction(attaquant: string, cible: { q: number; r: number }, verdict: VerdictOracle): void {
  predictionsBataille.update((m) => ({ ...m, [cleOracle(attaquant, cible)]: verdict }));
}

/** Purge (tour résolu / snapshot) : les verdicts du tour précédent sont caducs. */
export function purgePrediction(): void {
  predictionsBataille.set({});
  envoyes.clear();
}

/** Libellé canon d'un verdict révélé (D2) — `null` si rien à révéler. */
export function libelleVerdict(verdict: VerdictOracle | undefined): string | null {
  if (verdict === 'victoire') return 'VICTOIRE';
  if (verdict === 'defaite') return 'DÉFAITE';
  return null;
}
