/**
 * Palette officielle des accents — source unique (accents.json, décision
 * Erik 20/09, HANDOFF-ACCENTS-7-FACTIONS). 7 joueurs × 3 teintes (reflet /
 * base / ombre) + le Barbare (rouge sang dédié, option B) = 8 palettes.
 *
 * Le fichier JSON est LU et VALIDÉ ici (schéma : 7 joueurs + barbare, hex
 * valides, 3 teintes distinctes par faction) ; le pipeline import_svg.mjs
 * lit le MÊME fichier — toute couleur d'accent doit venir d'ici, plus aucun
 * hex de faction codé en dur. Tonalité BASE par défaut pour les traits fins
 * (anneaux, liserés, frontières, worked tiles, sélection, tooltips).
 * Zéro gameplay : données de présentation uniquement.
 */
import brut from './accents.json';

/** Une faction = 3 teintes. `base` est la tonalité de lisibilité par défaut. */
export interface Faction {
  nom: string;
  reflet: string;
  base: string;
  ombre: string;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function valider(data: typeof brut): void {
  const entrees = Object.entries(data.factions);
  const joueurs = entrees.filter(([cle]) => cle !== 'barbare');
  if (joueurs.length !== 7) {
    throw new Error(`accents.json : 7 joueurs attendus, ${joueurs.length} trouvés`);
  }
  for (const cle of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'barbare']) {
    const f = (data.factions as Record<string, Faction | undefined>)[cle];
    if (!f) throw new Error(`accents.json : faction « ${cle} » manquante`);
    for (const ton of ['reflet', 'base', 'ombre'] as const) {
      if (!HEX_RE.test(f[ton])) {
        throw new Error(`accents.json : ${cle}.${ton} = « ${f[ton]} » n'est pas un hex #RRGGBB`);
      }
    }
    const teintes = [f.reflet, f.base, f.ombre].map((h) => h.toLowerCase());
    if (new Set(teintes).size !== 3) {
      throw new Error(`accents.json : ${cle} — les 3 teintes doivent être distinctes`);
    }
  }
}
valider(brut);

export const FACTIONS = brut.factions as Readonly<Record<string, Faction>>;

/** Clés canoniques, dans l'ordre des joueurs (le barbare en dernier). */
export const CLES_JOUEURS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const;
export const CLE_BARBARE = 'barbare';

/** Le moteur nomme le camp barbare « barbarien » (BARBARIAN_ID de @game/rules) ;
 *  la palette le porte sous la clé « barbare ». */
export const clePalette = (owner: string): string => (owner === 'barbarien' ? 'barbare' : owner);

export function factionDe(owner: string): Faction {
  return FACTIONS[clePalette(owner)] ?? FACTIONS.p1!;
}

/** hex #RRGGBB → nombre 0xRRGGBB (PixiJS). */
export function hexEnNombre(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Couleur d'accent d'un propriétaire, tonalité au choix (défaut : BASE —
 *  la tonalité de lisibilité pour les traits fins). */
export function couleurAccent(owner: string, tonalite: 'reflet' | 'base' | 'ombre' = 'base'): number {
  return hexEnNombre(factionDe(owner)[tonalite]);
}

/** Table plate consommée par les rendus (clé moteur : p1..p7 + barbarien). */
export const PLAYER_COLORS: Record<string, number> = Object.fromEntries([
  ...CLES_JOUEURS.map((cle) => [cle, hexEnNombre(FACTIONS[cle]!.base)]),
  ['barbarien', hexEnNombre(FACTIONS.barbare!.base)],
]);

/** Suffixe de fichier des variantes cuites (import_svg) : p1 → j1 … barbare. */
export const suffixeCuit = (cle: string): string => (cle === 'barbare' ? 'barbare' : cle.replace(/^p/, 'j'));

/** Liste ordonnée des 8 palettes (affichages, atelier). */
export const LISTE_FACTIONS: Array<{ cle: string; nom: string; base: string; reflet: string; ombre: string; suffixe: string }> = [
  ...CLES_JOUEURS.map((cle) => ({ cle, suffixe: suffixeCuit(cle), ...FACTIONS[cle]! })),
  { cle: 'barbare', suffixe: 'barbare', ...FACTIONS.barbare! },
];
