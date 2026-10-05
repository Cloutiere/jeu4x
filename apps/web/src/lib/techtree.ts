/**
 * TECHTREE (handoff HANDOFF-TECHTREE, décisions Erik 05/10) — données
 * d'AFFICHAGE de l'arbre technologique plein écran. Client seul : l'ère
 * MOTEUR (techs.json, T-36) reste intacte — ce fichier ne porte que la
 * colonne d'ère d'affichage (D3, défaut = ère moteur + surcharges vides),
 * le placement des cartes (D5) et la table d'images recuites (D6).
 * Fonctions PURES (R-81) — partagées par TechTree.svelte et les tests.
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
// D1 — bandes d'ère d'affichage (fonds recuits d'Erik). Ordre = ERA_ORDER.
// ---------------------------------------------------------------------------
export interface EraAffichage {
  era: TechEra;
  titre: string;
  sousTitre: string;
  fond: string;
}

export const ERAS_AFFICHAGE: readonly EraAffichage[] = [
  { era: 'ancienne', titre: 'Ère ancienne', sousTitre: 'Les premiers pas', fond: `${DOSSIER_IMAGES}/era_ancienne.jpg` },
  { era: 'medievale', titre: 'Ère médiévale', sousTitre: 'Foi, commerce et empires', fond: `${DOSSIER_IMAGES}/era_medievale.jpg` },
  { era: 'industrielle', titre: 'Ère industrielle', sousTitre: 'La machine change le monde', fond: `${DOSSIER_IMAGES}/era_industrielle.jpg` },
  { era: 'moderne', titre: 'Ère moderne', sousTitre: 'Un demain meilleur par le savoir', fond: `${DOSSIER_IMAGES}/era_moderne.jpg` },
];

// ---------------------------------------------------------------------------
// D3 — ère d'AFFICHAGE (colonne) : défaut = ère moteur ; surcharges vides à
// l'arrivée (réajustables sans code). L'ère MOTEUR n'est JAMAIS lue depuis
// ici pour le gameplay.
// ---------------------------------------------------------------------------
/** Surcharges d'ère d'affichage par tech (vide — Ère moteur = affichage). */
export const SURCHARGE_ERA_AFFICHAGE: Partial<Record<string, TechEra>> = {};

export function eraAffichageDe(techId: string): TechEra {
  const surcharge = SURCHARGE_ERA_AFFICHAGE[techId];
  if (surcharge) return surcharge;
  return TECHS[techId]!.era;
}

// ---------------------------------------------------------------------------
// D5 — placement des cartes (colonne, rangée). 7 colonnes : ancienne 0-1,
// médiévale 2, industrielle 3-4, moderne 5-6. Réajustable sans code.
// ---------------------------------------------------------------------------
export const COLONNES_PAR_ERA: Record<TechEra, number[]> = {
  ancienne: [0, 1],
  medievale: [2],
  industrielle: [3, 4],
  moderne: [5, 6],
};

export const PLACEMENT: Readonly<Record<string, { col: number; row: number }>> = {
  // Ère ancienne (18) — racines en rangée 0-1
  alphabet: { col: 0, row: 0 },
  travail_du_bronze: { col: 1, row: 0 },
  equitation: { col: 0, row: 1 },
  poterie: { col: 1, row: 1 },
  ecriture: { col: 0, row: 2 },
  maconnerie: { col: 1, row: 2 },
  code_des_lois: { col: 0, row: 3 },
  rites_funeraires: { col: 1, row: 3 },
  litteratie: { col: 0, row: 4 },
  travail_du_fer: { col: 1, row: 4 },
  mathematiques: { col: 0, row: 5 },
  irrigation: { col: 1, row: 5 },
  monarchie: { col: 0, row: 6 },
  construction: { col: 1, row: 6 },
  democratie: { col: 0, row: 7 },
  monnaie: { col: 1, row: 7 },
  navigation: { col: 0, row: 8 },
  ingenierie: { col: 1, row: 8 },
  // Ère médiévale (6)
  feudalite: { col: 2, row: 0 },
  religion: { col: 2, row: 1 },
  banque: { col: 2, row: 2 },
  universite: { col: 2, row: 3 },
  invention: { col: 2, row: 4 },
  poudre_a_canon: { col: 2, row: 5 },
  // Ère industrielle (12)
  machine_a_vapeur: { col: 3, row: 0 },
  chemin_de_fer: { col: 3, row: 1 },
  metallurgie: { col: 4, row: 1 },
  imprimerie: { col: 3, row: 2 },
  acier: { col: 4, row: 2 },
  industrialisation: { col: 3, row: 3 },
  electricite: { col: 4, row: 3 },
  corporation: { col: 3, row: 4 },
  combustion: { col: 4, row: 4 },
  communisme: { col: 3, row: 5 },
  medias_de_masse: { col: 4, row: 5 },
  production_de_masse: { col: 3, row: 6 },
  // Ère moderne (10)
  theorie_atomique: { col: 5, row: 0 },
  aviation: { col: 6, row: 0 },
  electronique: { col: 5, row: 1 },
  automobile: { col: 6, row: 1 },
  aviation_avancee: { col: 5, row: 2 },
  energie_nucleaire: { col: 6, row: 2 },
  reseautage: { col: 5, row: 3 },
  mondialisation: { col: 6, row: 3 },
  vol_spatial: { col: 5, row: 4 },
  supraconducteur: { col: 6, row: 4 },
};

// ---------------------------------------------------------------------------
// D2 — états des cartes (mêmes règles moteur que ResearchPanel : R-85/R-86).
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

/** Les techs regroupées par état (une seule par carte — « en cours » prime
 *  sur « disponible », impossible sinon : une seule recherche à la fois). */
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

/** Rangée maximale du placement (hauteur de la grille d'affichage). */
export function rangeeMax(): number {
  return Math.max(...Object.values(PLACEMENT).map((p) => p.row));
}

/** L'ère d'affichage est-elle cohérente avec l'ordre des colonnes ? */
export function eraDeColonne(col: number): TechEra {
  for (const [era, cols] of Object.entries(COLONNES_PAR_ERA) as [TechEra, number[]][]) {
    if (cols.includes(col)) return era;
  }
  throw new Error(`Colonne inconnue : ${col}`);
}

/** Vérification d'intégrité du mapping (test + garde à l'import). */
export function integrityMapping(): string[] {
  const erreurs: string[] = [];
  for (const id of Object.keys(TECHS)) {
    if (!PLACEMENT[id]) erreurs.push(`tech non placée : ${id}`);
    else if (eraDeColonne(PLACEMENT[id]!.col) !== eraAffichageDe(id))
      erreurs.push(`tech ${id} : colonne ${PLACEMENT[id]!.col} hors ère d'affichage ${eraAffichageDe(id)}`);
  }
  for (const id of Object.keys(PLACEMENT)) if (!TECHS[id]) erreurs.push(`placement d'une tech inconnue : ${id}`);
  const vues = new Set<string>();
  for (const [id, p] of Object.entries(PLACEMENT)) {
    const cle = `${p.col}:${p.row}`;
    if (vues.has(cle)) erreurs.push(`collision de placement ${cle} (${id})`);
    vues.add(cle);
  }
  if (ERAS_AFFICHAGE.length !== ERA_ORDER.length) erreurs.push('bandes d’ère ≠ ERA_ORDER');
  return erreurs;
}
