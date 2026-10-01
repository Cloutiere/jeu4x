/**
 * HANG-LOCAL UX (Erik 01/10 · option 2) — orientation vers la ville fautive
 * quand un blocage de fin de tour apparaît (miroir du menu « unités sans
 * ordre » : sélection + centrage, zoom préservé).
 */
import type { BlocageFinDeTour } from '@game/rules';

/**
 * La ville à montrer pour un lot de blocages : premier blocage production
 * porteur d'une ville (l'ordre du tableau `blocagesFinDeTour` est déjà
 * déterministe — villes par id croissant R-81, recherche en dernier).
 * `null` si blocage recherche seul ou lot vide.
 */
export function villeDuPremierBlocageProduction(blocages: readonly BlocageFinDeTour[]): string | null {
  for (const b of blocages) {
    if (b.kind === 'production') return b.cityId;
  }
  return null;
}
