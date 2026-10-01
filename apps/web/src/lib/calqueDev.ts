/**
 * UI-JEU-T1 · D1 — calque de développement (demande d'Erik du 01/10).
 * Les éléments d'interface de développement de l'écran de jeu (inventaire
 * D2 : lien Lobby, puce Ordres, Resync, Rendements, 3D, Debug, état brut,
 * statut réseau, code de partie) sont CACHÉS par défaut et réaffichables à
 * la demande : raccourci Ctrl+Alt+D ou bouton engrenage. L'état est
 * mémorisé par MACHINE (localStorage, défaut tranché par le handoff) ;
 * aucune valeur de jeu n'est touchée — les éléments gardent leur fonction
 * quand le calque est affiché.
 */
import { writable } from 'svelte/store';

const CLE = 'calque-dev';

function initial(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(CLE) === '1';
}

/** true = calque dev AFFICHÉ (défaut : caché). */
export const calqueDev = writable<boolean>(initial());

export function basculerCalqueDev(): void {
  calqueDev.update((v) => {
    const suivant = !v;
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLE, suivant ? '1' : '0');
    return suivant;
  });
}

/** Raccourci clavier (D1) : Ctrl+Alt+D bascule le calque. */
export function raccourciCalqueDev(e: KeyboardEvent): void {
  if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    basculerCalqueDev();
  }
}
