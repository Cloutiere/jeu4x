/**
 * ORIENTATION-UNITES · D3 (décisions d'Erik du 17/10) — faces NATIVES de l'art
 * par type d'unité : `true` = l'art regarde à DROITE nativement.
 *
 * La table est purement AFFICHAGE : le retournement au rendu est
 * `faceGauche (état) !== !faceDroiteParDefaut (table)` — aucun asset miroir
 * cuit (D2). Types absents = `false` (art regardant à gauche / de face —
 * neutre). Table dressée par inspection des cuites (planche
 * devtmp/orientation-planche-unites.png) — 🔶 CALIBRAGE À L'ŒIL D'ERIK :
 * corriger ici, sans code.
 */
export const FACES_NATIVES: Readonly<Record<string, boolean>> = Object.freeze({  // Personnages de face / profil gauche
  // (guerrier : art natif à DROITE — regard + hache à droite, verdict Erik
  // 18/10 sur prod ; classé à gauche par erreur au premier passage de table.)
  colon: false,
  piquier: false,
  espion: false,
  catapulte: false,
  canon: false,
  infanterie_moderne: false,
  galere: false,
  chasseur: false,
  bombardier: false,
  icbm: false,
  batisseur: false,
  // Profils droits
  guerrier: true,
  artiste_penseur: true,
  archer: true,
  cavalier: true,
  legion: true,
  chevalier: true,
  fusilier: true,
  char_d_assaut: true,
  artillerie: true,
  caravane: true,
  galion: true,
  croiseur: true,
  cuirasse: true,
  sous_marin: true,
  milice: true,
  savant: true,
  explorateur: true,
  humanitaire: true,
  leader: true,
});

/** faceDroiteParDefaut d'un type (défaut : art regardant à gauche / neutre). */
export function faceDroiteParDefaut(type: string): boolean {
  return FACES_NATIVES[type] ?? false;
}

/**
 * Le sprite doit-il être RETOURNÉ (scale.x = −1) pour que l'art regarde dans
 * la direction voulue (`faceGauche` de l'état — absent = droite, D1) ?
 */
export function flipUnite(type: string, faceGauche: boolean | undefined): boolean {
  return (faceGauche === true) === faceDroiteParDefaut(type);
}

/**
 * Orientation AFFICHÉE d'une unité : si un mouvement est PROGRAMMÉ (aperçu
 * optimiste — scenePreviews), elle se tourne dès la planification vers le
 * côté du PREMIER pas prévu (miroir du moteur : `faceGauche` n'est écrit qu'à
 * la résolution) ; sans ordre de mouvement, l'état fait foi. Pur, testé.
 */
export function faceGaucheAffichee(
  unit: { q: number; r: number; faceGauche?: boolean },
  cheminPrevu: readonly { q: number; r: number }[] | null | undefined,
  largeur: number,
  directionOrientante: (o: { q: number; r: number }, d: { q: number; r: number }, l: number) => 'gauche' | 'droite' | null,
): boolean {
  const premierPas = cheminPrevu?.[0];
  if (premierPas) {
    const o = directionOrientante({ q: unit.q, r: unit.r }, premierPas, largeur);
    if (o) return o === 'gauche';
  }
  return unit.faceGauche === true;
}
