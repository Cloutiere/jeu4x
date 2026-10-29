/**
 * CHAT-SOCLE (Erik 29/10) — noyau PUR du chat multijoueur (zéro LLM).
 *
 * Hors état moteur (miroir jev/etat.ts) : messages et rencontres vivent en
 * clés dédiées du storage GameDO (`chatLog`, `rencontres`) — AUCUNE
 * migration, schemaVersion 28 inchangée. La forme est validée EN PREMIER
 * (chatShapeError — leçon d'or 7f), la validité métier (joueur existant,
 * rencontré, partie active) est vérifiée par le GameDO.
 *
 * Privacité (D4, miroir DIPLOMATIE-T2) : le canal individuel ne parvient
 * qu'aux DEUX participants ; le canal Général à tous les joueurs de la
 * partie. `canauxPour` est la règle unique de filtrage — tests + handlers
 * passent par elle.
 */
import type { ChatCanal, ChatMessageData } from '@game/shared';
import type { GameState } from '@game/rules';
import { computeVisibleTiles, tileKeyOf } from '@game/rules';

/** Longueur maximale d'un message (D4). */
export const CHAT_LONGUEUR_MAX = 300;
/** Limite de débit (D4) : 10 messages par fenêtre glissante de 30 s par joueur. */
export const CHAT_DEBIT_MAX = 10;
export const CHAT_DEBIT_FENETRE_MS = 30_000;
/** Plafond de l'historique persisté (le futur LLM lira l'histoire récente). */
export const CHAT_LOG_MAX = 500;

/**
 * Validation de FORME d'un envoi de chat (pure, exportée pour tests —
 * miroir orderShapeError). Aucune dépendance à l'état de partie.
 */
export function chatShapeError(canal: unknown, texte: unknown): string | null {
  if (typeof canal !== 'string' || canal.length === 0 || canal.length > 64) return 'canal invalide';
  if (typeof texte !== 'string') return 'texte invalide';
  if (texte.trim().length === 0) return 'texte vide';
  if (texte.length > CHAT_LONGUEUR_MAX) return `texte trop long (${CHAT_LONGUEUR_MAX} caractères max)`;
  return null;
}

/** Débit dépassé ? Fenêtre glissante sur les horodatages d'envoi du joueur. */
export function debitDepasse(horodatages: number[], maintenant: number): boolean {
  const fenetre = horodatages.filter((t) => maintenant - t < CHAT_DEBIT_FENETRE_MS);
  return fenetre.length >= CHAT_DEBIT_MAX;
}

/** Horodatages de débit après acceptation d'un envoi (purge des anciens). */
export function debitApres(horodatages: number[], maintenant: number): number[] {
  return [...horodatages.filter((t) => maintenant - t < CHAT_DEBIT_FENETRE_MS), maintenant];
}

/** Un joueur (engineId) voit-il ce canal ? Règle UNIQUE de privacité (D4). */
export function voitCanal(engineId: string, auteur: string, canal: ChatCanal): boolean {
  if (canal === 'general') return true; // visible de tous les joueurs de la partie
  return engineId === auteur || engineId === canal; // conversation privée aux deux
}

/** Historique visible par un joueur (miroir exact du filtrage à la livraison). */
export function historiquePour(messages: ChatMessageData[], engineId: string): ChatMessageData[] {
  return messages.filter((m) => voitCanal(engineId, m.auteur, m.canal));
}

/** Ajout borné à l'historique persisté (les plus anciens tombent). */
export function avecMessage(log: ChatMessageData[], message: ChatMessageData): ChatMessageData[] {
  const out = [...log, message];
  return out.length > CHAT_LOG_MAX ? out.slice(out.length - CHAT_LOG_MAX) : out;
}

/**
 * CHAT-SOCLE (D2) — détection des RENCONTRES (fait de fog R-73) : A a
 * rencontré B dès qu'une entité de B (unité ou ville) est DANS le champ
 * visible courant de A. Pure ; `deja` = rencontres connues (engineId →
 * engineIds déjà rencontrés). Les barbares ne sont pas des rencontres.
 */
export function nouvellesRencontres(game: GameState, deja: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = { ...deja };
  const joueurs = Object.keys(game.players).sort();
  for (const moi of joueurs) {
    if (game.players[moi]?.defeated === true) continue;
    const visible = computeVisibleTiles(game, moi);
    for (const autre of joueurs) {
      if (autre === moi) continue;
      if (game.players[autre]?.defeated === true) continue;
      const dejaListe = out[moi] ?? [];
      if (dejaListe.includes(autre)) continue;
      const entites = [
        ...Object.values(game.units).filter((u) => u.owner === autre),
        ...Object.values(game.cities).filter((c) => c.owner === autre),
      ];
      if (entites.some((e) => visible.has(tileKeyOf(e)))) {
        out[moi] = [...dejaListe, autre].sort();
      }
    }
  }
  return out;
}

/** Paires fraîchement rencontrées (différence avant/après) — pour PlayerMet. */
export function pairesRencontrees(
  avant: Record<string, string[]>,
  apres: Record<string, string[]>,
): Array<{ joueur: string; rencontre: string }> {
  const out: Array<{ joueur: string; rencontre: string }> = [];
  for (const [joueur, liste] of Object.entries(apres)) {
    for (const rencontre of liste) {
      if (!(avant[joueur] ?? []).includes(rencontre)) out.push({ joueur, rencontre });
    }
  }
  return out;
}
