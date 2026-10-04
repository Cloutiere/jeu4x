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

/**
 * BLOCAGE-NAVIGATION (Erik 05/10 · D1/D2) — le menu à ouvrir au clic du
 * bouton « Fin de tour bloquée (n) » : Recherche PRIORITAIRE (D1) si un
 * blocage recherche existe, sinon la première ville fautive (ordre du
 * tableau, déjà tri R-81 par id croissant), sinon `null` (lot vide).
 */
export type MenuBlocage = { kind: 'recherche' } | { kind: 'ville'; cityId: string } | null;

export function menuAOuvrir(blocages: readonly BlocageFinDeTour[]): MenuBlocage {
  if (blocages.some((b) => b.kind === 'recherche')) return { kind: 'recherche' };
  const cityId = villeDuPremierBlocageProduction(blocages);
  return cityId ? { kind: 'ville', cityId } : null;
}

/**
 * BLOCAGE-NAVIGATION (Erik 05/10 · D3) — ville voisine des flèches ⟵ ⟶ de
 * l'en-tête de PanneauVille : suivante (delta 1) ou précédente (delta −1)
 * dans l'ordre R-81 (id croissant), CYCLIQUE. `null` si liste vide ou ville
 * absente (no-op) ; une ville seule renvoie elle-même (flèches masquées
 * côté UI dès n < 2).
 */
export function villeVoisine(cityIds: readonly string[], currentId: string, delta: 1 | -1): string | null {
  if (cityIds.length === 0) return null;
  const tri = [...cityIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const i = tri.indexOf(currentId);
  if (i === -1) return null;
  return tri[(i + delta + tri.length) % tri.length]!;
}
