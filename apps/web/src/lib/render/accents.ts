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

/** Suffixe de fichier des variantes cuites (import_svg) : p1 → j1 … barbare. */
export const suffixeCuit = (cle: string): string => (cle === 'barbare' ? 'barbare' : cle.replace(/^p/, 'j'));

/** Liste ordonnée des 8 palettes (affichages, atelier). */
export const LISTE_FACTIONS: Array<{ cle: string; nom: string; base: string; reflet: string; ombre: string; suffixe: string }> = [
  ...CLES_JOUEURS.map((cle) => ({ cle, suffixe: suffixeCuit(cle), ...FACTIONS[cle]! })),
  { cle: 'barbare', suffixe: 'barbare', ...FACTIONS.barbare! },
];

// ---------------------------------------------------------------------------
// SYSTÈME 4 TONS (GUERRIER-4TONS, décision Erik 23/09) — nouvelle génération
// d'assets : Erik peint les couleurs de faction directement dans le SVG maître
// (4 tons Lightest/Base/Dark/Darkest, rampes linéaires — la logique
// « Accent » 3 gris intermédiaire est abandonnée pour ces assets). Source
// unique : `factions4`/`ordre_joueurs4`/`barbare4` ci-dessus (accents.json) ;
// le pipeline import_svg.mjs (remplacementsPalette4) lit le MÊME fichier.
// La table 3 gris reste la source des AUTRES assets. Zéro gameplay.

/** Une faction 4 tons = rampes linéaires Lightest/Base/Dark/Darkest. */
export interface Faction4 {
  nom: string;
  lightest: string;
  base: string;
  dark: string;
  darkest: string;
}

const TONS4 = ['lightest', 'base', 'dark', 'darkest'] as const;

export const FACTIONS4 = brut.factions4 as Readonly<Record<string, Faction4>>;
/** Mapping joueur→faction (J1..J7 dans l'ordre, défaut non tranché par Erik
 *  — éditable dans accents.json). */
export const ORDRE_JOUEURS4 = brut.ordre_joueurs4 as Readonly<string[]>;
/** Faction du Barbare (décision Erik 23/09 : Rouge Royal). */
export const FACTION_BARBARE4 = brut.barbare4 as string;

function valider4(data: typeof brut): void {
  const entrees = Object.entries(data.factions4 as Record<string, Faction4>);
  if (entrees.length !== 7) {
    throw new Error(`accents.json : factions4 — 7 factions attendues, ${entrees.length} trouvées`);
  }
  for (const [cle, f] of entrees) {
    for (const ton of TONS4) {
      if (!HEX_RE.test(f[ton])) {
        throw new Error(`accents.json : factions4.${cle}.${ton} = « ${f[ton]} » n'est pas un hex #RRGGBB`);
      }
    }
    if (new Set(TONS4.map((t) => f[t].toLowerCase())).size !== 4) {
      throw new Error(`accents.json : factions4.${cle} — les 4 tons doivent être distincts`);
    }
  }
  if (ORDRE_JOUEURS4.length !== 7 || new Set(ORDRE_JOUEURS4).size !== 7) {
    throw new Error('accents.json : ordre_joueurs4 — 7 factions distinctes attendues');
  }
  for (const cle of ORDRE_JOUEURS4) {
    if (!FACTIONS4[cle]) {
      throw new Error(`accents.json : ordre_joueurs4 — faction « ${cle} » inconnue`);
    }
  }
  if (!FACTIONS4[FACTION_BARBARE4]) {
    throw new Error(`accents.json : barbare4 — faction « ${FACTION_BARBARE4} » inconnue`);
  }
}
valider4(brut);

/** Faction 4 tons d'un joueur : J1..J7 selon `ordre_joueurs4`. */
export function faction4DeJoueur(joueur: number): Faction4 {
  return FACTIONS4[ORDRE_JOUEURS4[joueur - 1]!]!;
}

/** Table plate consommée par les rendus (clé moteur : p1..p7 + barbarien).
 *  COULEUR DE BASE DU JOUEUR (demande Erik 23/09, GUERRIER-4TONS) : liée au
 *  SYSTÈME 4 TONS (factions4, tonalité `base`, ordre J1-J7 + barbare4) — les
 *  barres de PV, camps et traits fins suivent AUTOMATIQUEMENT la table éditée
 *  (l'ancienne table 3 gris ne sert plus que les assets non migrés). */
export const PLAYER_COLORS: Record<string, number> = Object.fromEntries([
  ...CLES_JOUEURS.map((cle, i) => [cle, hexEnNombre(FACTIONS4[ORDRE_JOUEURS4[i]!]!.base)]),
  ['barbarien', hexEnNombre(FACTIONS4[FACTION_BARBARE4]!.base)],
]);

// ---------------------------------------------------------------------------
// LOBBY-5 · D5 — LA PALETTE CHOISIE PILOTE L'ACCENT EN JEU. Aujourd'hui la
// couleur suit l'INDEX du siège (p1 → J1…) ; désormais la palette de chaque
// joueur est CELLE QU'IL A CHOISIE au lobby (paletteId, source accents.json).
// `definirPalettesJoueurs` est appelée une fois par partie (GameCanvas, au
// Welcome : engineId → paletteId) ; sans override (labos, parties anciennes),
// le défaut reste l'index de siège — zéro changement des appelants.

/** Override PAR PARTIE : engineId moteur (« p1 »..) → paletteId (factions4). */
type PalettesJoueurs = Record<string, string>;
let palettesJeu: PalettesJoueurs = {};

/** Installe la table paletteId de la partie courante (null = réinitialise). */
export function definirPalettesJoueurs(map: PalettesJoueurs | null): void {
  palettesJeu = map ? { ...map } : {};
}

/** PaletteId (factions4) d'un propriétaire moteur : override de la partie
 *  courante, sinon le défaut par index de siège ; le barbare garde sa
 *  faction dédiée (barbare4). */
export function paletteDe(owner: string): string {
  const override = palettesJeu[owner];
  if (override) return override;
  if (owner === 'barbarien') return FACTION_BARBARE4;
  const index = CLES_JOUEURS.indexOf(owner as (typeof CLES_JOUEURS)[number]);
  return index >= 0 ? ORDRE_JOUEURS4[index]! : ORDRE_JOUEURS4[0]!;
}

/** Couleur de BASE (tonalité lisibilité) d'un propriétaire — table 4 tons. */
export function couleurBaseJoueur(owner: string): number {
  const f = FACTIONS4[paletteDe(owner)] ?? FACTIONS4[ORDRE_JOUEURS4[0]!]!;
  return hexEnNombre(f.base);
}

/** Suffixe de fichier des variantes cuites pour UNE PALETTE : index dans
 *  `ordre_joueurs4` → j1..j7 (les PNG cuits par le pipeline import_svg). */
export function suffixeCuitPalette(paletteId: string): string {
  const index = ORDRE_JOUEURS4.indexOf(paletteId);
  return index >= 0 ? `j${index + 1}` : suffixeCuit('p1');
}
