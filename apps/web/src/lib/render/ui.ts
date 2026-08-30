/**
 * État d'interface de la carte (L3/L5) — sélection, chemin en construction.
 * Créé par page de partie (une instance par partie) et partagé entre le
 * canvas PixiJS et les panneaux Svelte.
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { Hex } from '@game/rules';
import type { CityId, UnitId } from '@game/shared';

/** Chemin en construction (brouillon LOCAL — le serveur ne connaît pas). */
export interface DraftPath {
  unitId: UnitId;
  /** Étapes SANS la case de départ (contrat de l'ordre Move). */
  path: Hex[];
}

export interface UiState {
  selectedUnitId: UnitId | null;
  selectedCityId: CityId | null;
  draft: DraftPath | null;
}

export type UiStore = Writable<UiState>;

export function createUiState(): UiStore {
  return writable<UiState>({ selectedUnitId: null, selectedCityId: null, draft: null });
}

/** Réinitialisation complète (changement de sélection). */
export function selectNothing(ui: UiStore): void {
  ui.set({ selectedUnitId: null, selectedCityId: null, draft: null });
}
