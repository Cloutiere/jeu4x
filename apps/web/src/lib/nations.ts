/**
 * LOBBY-PREMIUM · D5 — table nations↔civs (source : src/lib/nations.json,
 * croisée avec civilizations.json et vérifiée pilot). 16 civs actives ;
 * 6 nations en réserve (futures civs — JAMAIS affichées, assets conservés
 * dans assets-src/interface/). Une nation sans logo fichier → pas d'icône
 * (D4, pas de crash).
 */
import brut from './nations.json';

export interface Nation {
  banderole: string;
  logo: string | null;
  reserve?: boolean;
  /** Taille d'affichage du logo en multiple de la base (5 rem) — les SVG
   *  n'ont pas tous le même remplissage de canevas (demande Erik 27/09) :
   *  1,5 par défaut, 1,25 pour les gros de base agrandis, 0,75 pour les
   *  réduction explicites (Égypte, Espagne, Russie). */
  logoEchelle?: number;
}

const table = brut.nations as unknown as Record<string, Nation>;

/** Nation d'une civ — `undefined` pour les civs inconnues et les réserve. */
export function nationDe(civId: string | null | undefined): Nation | undefined {
  if (!civId) return undefined;
  const n = table[civId];
  return n && !n.reserve ? n : undefined;
}
