/**
 * TECHTREE (handoff HANDOFF-TECHTREE, décisions Erik 05/10, rév. 05/10) —
 * données d'AFFICHAGE de l'arbre technologique plein écran. Client seul :
 * l'ère MOTEUR (techs.json, T-36) reste intacte — ce fichier ne porte que
 * l'affichage.
 *
 * Règle d'Erik (retour visuel 05/10) : JAMAIS de flèche vers la gauche — la
 * colonne d'une tech est STRICTEMENT à droite de tous ses prérequis :
 *   col(tech) = max(col(prereqs)) + 1, racines en colonne 0.
 * Les ères d'AFFICHAGE sont des bandes contiguës de colonnes à répartition
 * équitable (~12 techs) — une tech peut être REPORTÉE sous une bande
 * ultérieure ; les titres sont renommables (pas d'exactitude historique).
 * Fonctions PURES et déterministes (R-81) — partagées par TechTree.svelte
 * et les tests.
 */
import { TECHS, ERA_ORDER, BUILDINGS, WONDERS, UNIT_TYPES, availableTechs } from '@game/rules';
import type { TechData, TechEra } from '@game/rules';

// ---------------------------------------------------------------------------
// D6 — table d'images recuites (public/art/techtree/). Toute tech absente de
// TECHS_AVEC_IMAGE = fallback icône (consigné : corporation, acier,
// electricite ; source future_tech.jpeg sans tech correspondante).
// ---------------------------------------------------------------------------
export const DOSSIER_IMAGES = '/art/techtree';
export const IMAGE_FALLBACK = '/art/icone_science.png';

/** URL de l'icône de repli (tech sans image d'Erik). */
export function imageTechFallback(): string {
  return IMAGE_FALLBACK;
}

const TECHS_AVEC_IMAGE: ReadonlySet<string> = new Set([
  'alphabet', 'travail_du_bronze', 'equitation', 'poterie', 'rites_funeraires',
  'travail_du_fer', 'maconnerie', 'ecriture', 'code_des_lois', 'construction',
  'irrigation', 'litteratie', 'mathematiques', 'monnaie', 'monarchie',
  'democratie', 'navigation', 'ingenierie', 'feudalite', 'religion',
  'invention', 'banque', 'universite', 'poudre_a_canon', 'machine_a_vapeur',
  'chemin_de_fer', 'metallurgie', 'imprimerie', 'industrialisation',
  'communisme', 'medias_de_masse', 'production_de_masse', 'combustion',
  'theorie_atomique', 'electronique', 'aviation', 'automobile',
  'aviation_avancee', 'energie_nucleaire', 'reseautage', 'mondialisation',
  'vol_spatial', 'supraconducteur',
]);

/** URL de la carte d'une tech (fallback icône science si source absente). */
export function imageTech(techId: string): string {
  return TECHS_AVEC_IMAGE.has(techId) ? `${DOSSIER_IMAGES}/tech_${techId}.jpg` : IMAGE_FALLBACK;
}

/** La tech a-t-elle une image d'Erik recuite (sinon fallback) ? */
export function aImageTech(techId: string): boolean {
  return TECHS_AVEC_IMAGE.has(techId);
}

// ---------------------------------------------------------------------------
// D3 (rév.) — flot de gauche à droite : colonnes calculées depuis les
// prérequis (col = max(col prereqs) + 1). Les surcharges manuelles restent
// possibles (vides à l'arrivée) mais NE PEUVENT PAS re-créer de flèche
// vers la gauche (l'invariant est testé).
// ---------------------------------------------------------------------------
/** Surcharges manuelles de colonne (vide — calcul automatique actif). */
export const SURCHARGE_COLONNE: Partial<Record<string, number>> = {};

const COLONNES_CALCULEES: Readonly<Record<string, number>> = (() => {
  const out: Record<string, number> = {};
  const calc = (id: string): number => {
    if (out[id] !== undefined) return out[id]!;
    const t = TECHS[id]!;
    const v = t.prereqs.length === 0 ? 0 : Math.max(...t.prereqs.map((p) => calc(p))) + 1;
    out[id] = v;
    return v;
  };
  for (const id of Object.keys(TECHS).sort()) calc(id);
  return out;
})();

/** Colonne d'affichage d'une tech (surcharge manuelle ou calcul). */
export function colonneDe(techId: string): number {
  return SURCHARGE_COLONNE[techId] ?? COLONNES_CALCULEES[techId] ?? 0;
}

/** Nombre de colonnes de l'arbre. */
export const NB_COLONNES: number = Math.max(...Object.keys(TECHS).map(colonneDe)) + 1;

// ---------------------------------------------------------------------------
// D1 (rév.) — bandes d'ère d'affichage : plages CONTIGUËS de colonnes à
// répartition équitable (13/14/11/8). Une tech est affichée sous la bande de
// SA colonne — report sous une ère ultérieure assumé (Erik : « pas
// d'exactitude historique »). Titres renommables sans code.
// ---------------------------------------------------------------------------
export interface EraAffichage {
  era: TechEra;
  titre: string;
  sousTitre: string;
  fond: string;
  /** Dernière colonne de la bande (la première = précédente + 1, ou 0). */
  derniereCol: number;
}

export const BANDES_AFFICHAGE: readonly EraAffichage[] = [
  { era: 'ancienne', titre: 'Ère ancienne', sousTitre: 'Les premiers pas', fond: `${DOSSIER_IMAGES}/era_ancienne.jpg`, derniereCol: 2 },
  { era: 'medievale', titre: 'Ère médiévale', sousTitre: 'Foi, commerce et empires', fond: `${DOSSIER_IMAGES}/era_medievale.jpg`, derniereCol: 5 },
  { era: 'industrielle', titre: 'Ère industrielle', sousTitre: 'La machine change le monde', fond: `${DOSSIER_IMAGES}/era_industrielle.jpg`, derniereCol: 7 },
  { era: 'moderne', titre: 'Ère moderne', sousTitre: 'Un demain meilleur par le savoir', fond: `${DOSSIER_IMAGES}/era_moderne.jpg`, derniereCol: NB_COLONNES - 1 },
];

/** Surcharges d'ère d'affichage par tech (vide — bande de la colonne). */
export const SURCHARGE_ERA_AFFICHAGE: Partial<Record<string, TechEra>> = {};

/** Première colonne d'une bande. */
export function premiereColonneDe(bande: EraAffichage): number {
  const i = BANDES_AFFICHAGE.indexOf(bande);
  return i === 0 ? 0 : BANDES_AFFICHAGE[i - 1]!.derniereCol + 1;
}

/** L'ère d'affichage d'une colonne (bande contenant la colonne). */
export function eraDeColonne(col: number): TechEra {
  for (const b of BANDES_AFFICHAGE) {
    if (col <= b.derniereCol) return b.era;
  }
  throw new Error(`Colonne hors bandes : ${col}`);
}

/** Ère d'affichage d'une tech (surcharge manuelle ou bande de sa colonne). */
export function eraAffichageDe(techId: string): TechEra {
  const surcharge = SURCHARGE_ERA_AFFICHAGE[techId];
  if (surcharge) return surcharge;
  return eraDeColonne(colonneDe(techId));
}

// ---------------------------------------------------------------------------
// D5 (rév.) — placement : colonnes calculées (flot strict) + rangées
// séquentielles par colonne dans un ordre de préférence stable (ordre de
// l'ancien placement main, sinon id — R-81). Réajustable sans code via
// ORDRE_PREFERENCE.
// ---------------------------------------------------------------------------
/** Ordre de préférence vertical (hérité du placement initial d'Erik 05/10) —
 *  les techs d'une même colonne se rangent dans cet ordre, sinon par id. */
const ORDRE_PREFERENCE: Readonly<Record<string, number>> = Object.fromEntries(
  [
    'alphabet', 'travail_du_bronze', 'equitation', 'poterie',
    'ecriture', 'maconnerie', 'code_des_lois', 'rites_funeraires',
    'litteratie', 'travail_du_fer', 'mathematiques', 'irrigation',
    'monarchie', 'construction', 'democratie', 'monnaie', 'navigation',
    'ingenierie', 'feudalite', 'religion', 'banque', 'universite',
    'invention', 'poudre_a_canon', 'machine_a_vapeur', 'metallurgie',
    'imprimerie', 'acier', 'industrialisation', 'electricite',
    'corporation', 'combustion', 'communisme', 'medias_de_masse',
    'production_de_masse', 'theorie_atomique', 'aviation', 'electronique',
    'automobile', 'aviation_avancee', 'energie_nucleaire', 'reseautage',
    'mondialisation', 'vol_spatial', 'supraconducteur',
  ].map((id, i) => [id, i]),
);

export const PLACEMENT: Readonly<Record<string, { col: number; row: number }>> = (() => {
  const parCol = new Map<number, string[]>();
  for (const id of Object.keys(TECHS)) {
    const col = colonneDe(id);
    if (!parCol.has(col)) parCol.set(col, []);
    parCol.get(col)!.push(id);
  }
  const out: Record<string, { col: number; row: number }> = {};
  for (const [col, ids] of [...parCol.entries()].sort((a, b) => a[0] - b[0])) {
    ids.sort(
      (a, b) =>
        (ORDRE_PREFERENCE[a] ?? Number.MAX_SAFE_INTEGER) - (ORDRE_PREFERENCE[b] ?? Number.MAX_SAFE_INTEGER) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
    ids.forEach((id, row) => {
      out[id] = { col, row };
    });
  }
  return out;
})();

/** Rangée maximale du placement (hauteur de la grille d'affichage). */
export function rangeeMax(): number {
  return Math.max(...Object.values(PLACEMENT).map((p) => p.row));
}

// ---------------------------------------------------------------------------
// D2 — états des cartes (mêmes règles moteur que l'ancien panneau R-85/R-86).
// ---------------------------------------------------------------------------
export type EtatTech = 'acquise' | 'en_cours' | 'disponible' | 'verrouillee';

export interface JoueurRecherche {
  techsUnlocked: string[];
  researching: string | null;
}

/** État d'affichage d'une tech pour un joueur (pur, règles moteur intactes). */
export function etatTech(player: JoueurRecherche, techId: string): EtatTech {
  if (player.techsUnlocked.includes(techId)) return 'acquise';
  if (player.researching === techId) return 'en_cours';
  if (availableTechs(player).some((t) => t.id === techId)) return 'disponible';
  return 'verrouillee';
}

/** Les techs regroupées par état (une seule par carte). */
export function etatsTechs(player: JoueurRecherche): Record<string, EtatTech> {
  const out: Record<string, EtatTech> = {};
  for (const id of Object.keys(TECHS)) out[id] = etatTech(player, id);
  return out;
}

/** D4 — tours restants estimés à la science courante (rate > 0), sinon null. */
export function toursRestants(cost: number, progress: number, scienceParTour: number): number | null {
  if (scienceParTour <= 0) return null;
  return Math.max(1, Math.ceil((cost - progress) / scienceParTour));
}

/** D4 — débloqués EN NOMS SEULS (libellés FR existants, sans passage moteur). */
export function libellesDebloques(t: TechData): string[] {
  const out: string[] = [];
  for (const b of t.unlocks.buildings) out.push(BUILDINGS[b]?.name ?? b);
  for (const w of t.unlocks.wonders) out.push(`Merveille : ${WONDERS[w]?.name ?? w}`);
  for (const u of t.unlocks.units) out.push(UNIT_TYPES[u]?.name ?? u);
  return out;
}

/** Prérequis manquants d'une tech verrouillée (noms FR, tri R-81). */
export function prerequisManquants(t: TechData, techsUnlocked: readonly string[]): string[] {
  return t.prereqs
    .filter((p) => !techsUnlocked.includes(p))
    .map((p) => TECHS[p]?.name ?? p)
    .sort();
}

/** Vérification d'intégrité du mapping (test + garde). */
export function integrityMapping(): string[] {
  const erreurs: string[] = [];
  for (const id of Object.keys(TECHS)) {
    const t = TECHS[id]!;
    for (const p of t.prereqs) {
      if (colonneDe(id) <= colonneDe(p)) erreurs.push(`flèche vers la gauche : ${p} → ${id}`);
    }
    const pos = PLACEMENT[id];
    if (!pos) erreurs.push(`tech non placée : ${id}`);
    else if (pos.col !== colonneDe(id)) erreurs.push(`tech ${id} : colonne placée ≠ colonne calculée`);
  }
  for (const id of Object.keys(PLACEMENT)) if (!TECHS[id]) erreurs.push(`placement d'une tech inconnue : ${id}`);
  const vues = new Set<string>();
  for (const [id, p] of Object.entries(PLACEMENT)) {
    const cle = `${p.col}:${p.row}`;
    if (vues.has(cle)) erreurs.push(`collision de placement ${cle} (${id})`);
    vues.add(cle);
  }
  if (BANDES_AFFICHAGE.length !== ERA_ORDER.length) erreurs.push('bandes d’ère ≠ ERA_ORDER');
  let attendu = 0;
  for (const b of BANDES_AFFICHAGE) {
    if (b.derniereCol < attendu) erreurs.push(`bande ${b.era} : bornes non croissantes`);
    attendu = b.derniereCol + 1;
  }
  if (attendu - 1 !== NB_COLONNES - 1) erreurs.push('les bandes ne couvrent pas toutes les colonnes');
  return erreurs;
}
