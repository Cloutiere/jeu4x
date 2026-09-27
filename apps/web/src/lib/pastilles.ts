/**
 * LOBBY-PREMIUM v3 — pastilles de couleur des joueurs : SVG d'Erik, une
 * version ALLUMÉE (siège sélectionné) et une ÉTEINTE (non sélectionné).
 * Mapping paletteId (accents.json, factions4) → fichiers
 * public/interface/pastilles/. 🔶 vert.svg (allumé) manquant chez Erik le
 * 27/09 — l'éteint sert de repli en attendant.
 */
import brut from './pastilles.json';

export interface Pastille {
  allumee: string;
  eteinte: string;
}

export const PASTILLES = brut as unknown as Record<string, Pastille>;

export function pastilleDe(paletteId: string): Pastille | undefined {
  return PASTILLES[paletteId];
}
