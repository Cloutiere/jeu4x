/**
 * Session courante du client (L6). undefined = chargement en cours,
 * null = non connecté.
 */
import { writable } from 'svelte/store';
import { apiGet } from './net.js';

export interface SessionUser {
  id: string;
  name: string;
}

export const session = writable<SessionUser | null | undefined>(undefined);

export async function loadSession(): Promise<SessionUser | null | undefined> {
  try {
    const data = await apiGet<{ player: SessionUser | null }>('/api/me');
    session.set(data.player);
    return data.player;
  } catch {
    session.set(null);
    return null;
  }
}

export function logout(): void {
  void fetch(`${''}/auth/logout`).then(() => {
    session.set(null);
    window.location.hash = '#/login';
  });
}
