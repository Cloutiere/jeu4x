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
}

const table = brut.nations as unknown as Record<string, Nation>;

/** Nation d'une civ — `undefined` pour les civs inconnues et les réserve. */
export function nationDe(civId: string | null | undefined): Nation | undefined {
  if (!civId) return undefined;
  const n = table[civId];
  return n && !n.reserve ? n : undefined;
}
