/**
 * HANDOFF-RESOLUTION-DEPLACEMENTS §4 — historique d'événements PERSISTANT du
 * menu de droite. Les messages transitoires (toasts : événements de
 * résolution, bonus de hutte, refus d'ordre, avertissements du conseiller)
 * sont captés à l'affichage et accumulés ici (zéro gameplay : présentation
 * seule). Chronologique, horodaté au tour, plafonné (FIFO).
 */
import { writable } from 'svelte/store';

export interface EventHistoryEntry {
  id: number;
  turn: number;
  text: string;
  kind: 'good' | 'bad' | 'info';
}

/** Plafond de l'historique (les plus anciennes entrées sont éjectées). */
export const EVENT_HISTORY_MAX = 150;

export const eventHistory = writable<EventHistoryEntry[]>([]);

let nextId = 1;

/** Ajoute une entrée (appelé au moment où le toast est affiché). */
export function pushHistory(text: string, kind: 'good' | 'bad' | 'info', turn: number): void {
  eventHistory.update((list) => {
    const next = [...list, { id: nextId++, turn, text, kind }];
    return next.length > EVENT_HISTORY_MAX ? next.slice(next.length - EVENT_HISTORY_MAX) : next;
  });
}

/** Vidage (nouvelle partie / tests). */
export function resetHistory(): void {
  eventHistory.set([]);
  nextId = 1;
}
