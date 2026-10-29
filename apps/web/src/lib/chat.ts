/**
 * CHAT-SOCLE (Erik 29/10) — store client du chat (colonne droite, onglet 💬).
 *
 * Miroir du noyau serveur (apps/server/src/chat.ts) : les messages sont des
 * données structurées { partie, tour, auteur, canal, texte, horodatage }
 * portées par le protocole (ChatMessage/ChatHistory/PlayerMet) — le client
 * n'invente rien. Le réducteur est PUR et testé ; le store est réinitialisé
 * à chaque changement de partie (miroir chronique).
 */
import { writable } from 'svelte/store';
import type { ChatMessageData, ServerToClientMessage } from '@game/shared';

export interface ChatEtat {
  /** Historique reçu (général + conversations individuelles du joueur). */
  messages: ChatMessageData[];
  /** EngineIds des joueurs déjà RENCONTREZ (conversations déverrouillées). */
  rencontres: string[];
  /** EngineId du joueur pour la popup de rencontre en cours (null = aucune). */
  popupRencontre: string | null;
}

export function etatInitialChat(): ChatEtat {
  return { messages: [], rencontres: [], popupRencontre: null };
}

/** Clé de déduplication d'un message (écho + ChatHistory peuvent se croiser). */
function cleMessage(m: ChatMessageData): string {
  return `${m.auteur}|${m.canal}|${m.horodatage}|${m.texte}`;
}

/**
 * Réducteur PUR : état suivant à partir de l'état courant et d'un message
 * serveur. Les messages hors périmètre chat sont ignorés.
 */
export function reduceChat(etat: ChatEtat, message: ServerToClientMessage): ChatEtat {
  switch (message.type) {
    case 'Welcome':
      // Reconnexion : les rencontres persistées servent (jamais de popup au
      // chargement — le popup ne joue que sur le PlayerMet EN DIRECT).
      return {
        ...etat,
        rencontres: [...new Set([...etat.rencontres, ...(message.rencontres ?? [])])].sort(),
      };
    case 'ChatMessage':
      if (etat.messages.some((m) => cleMessage(m) === cleMessage(message.message))) return etat;
      return { ...etat, messages: [...etat.messages, message.message] };
    case 'ChatHistory':
      // L'historique complet remplace le local (source de vérité serveur).
      return { ...etat, messages: message.messages };
    case 'PlayerMet':
      return {
        ...etat,
        rencontres: [...new Set([...etat.rencontres, message.joueur])].sort(),
        popupRencontre: message.joueur,
      };
    default:
      return etat;
  }
}

/** Store global (une partie = un chat — réinitialisé à l'entrée en partie). */
export const chat = writable<ChatEtat>(etatInitialChat());

/** Applique un message serveur au store (branché dans gameClient.apply). */
export function appliquerMessageChat(message: ServerToClientMessage): void {
  if (message.type !== 'Welcome' && message.type !== 'ChatMessage' && message.type !== 'ChatHistory' && message.type !== 'PlayerMet') {
    return;
  }
  chat.update((etat) => reduceChat(etat, message));
}

/** Changement de partie : remise à zéro (miroir resetChronique). */
export function reinitialiserChat(): void {
  chat.set(etatInitialChat());
}

/** Ferme la popup de rencontre (clic ou Échap). */
export function fermerPopupRencontre(): void {
  chat.update((etat) => (etat.popupRencontre === null ? etat : { ...etat, popupRencontre: null }));
}
