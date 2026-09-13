/**
 * MENU-VILLE (décisions d'Erik du 13/09) — noms des villes fondées.
 * « Ville1, Ville2… » avec un compteur PAR JOUEUR (le Ville1 d'Erik et le
 * Ville1 du bot coexistent). La table `NOMS_PAR_CIVILISATION` est data-driven
 * et VIDE pour l'instant : Erik la remplira plus tard sans code (une liste de
 * noms par civId — les noms non consommés de la liste sont proposés dans
 * l'ordre avant le fallback « VilleN »). Fonctions PURES et déterministes.
 */
import type { City } from './state.js';

/**
 * Table en réserve (vide = fallback VilleN partout) : civId → liste de noms.
 * Remplie par Erik sans code — le premier nom non encore porté par une ville
 * du joueur est proposé, puis le fallback « VilleN » reprend.
 */
export const NOMS_PAR_CIVILISATION: Record<string, string[]> = {};

/**
 * Nom de la PROCHAINE ville fondée par `owner` (villes existantes passées en
 * argument — l'état complet ou un sous-ensemble filtré au propriétaire).
 * Déterministe : les noms de la table sont proposés dans l'ordre, premier non
 * utilisé d'abord (id de ville croissant pour l'usage) ; sinon VilleN avec
 * N = (nombre de villes du joueur) + 1.
 */
export function prochainNomVille(
  cities: Record<string, City>,
  owner: string,
  civId?: string,
): string {
  const mine = Object.values(cities).filter((c) => c.owner === owner);
  const table = civId ? NOMS_PAR_CIVILISATION[civId] : undefined;
  if (table && table.length > 0) {
    const pris = new Set(mine.map((c) => c.name).filter((n): n is string => !!n));
    for (const nom of table) {
      if (!pris.has(nom)) return nom;
    }
  }
  return `Ville${mine.length + 1}`;
}

/** Nom affiché d'une ville : `name` si porté, sinon l'id (états anciens). */
export function nomDeVille(city: { id: string; name?: string }): string {
  return city.name ?? city.id;
}
