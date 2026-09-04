/**
 * 7n · Civilisations & traits — RULES.md §8.12 (R-145..R-150), données
 * civilizations.json + eras.json (calibrage sans code — même philosophie
 * R-99/R-113). Base documentaire : la spécification d'Erik « Guide
 * Civilisations Civilization Revolution.md » — ELLE FAIT FOI (16 civilisations,
 * avantage de départ, 4 bonus d'ère CUMULATIFS, unités uniques).
 *
 * Fonctions PURES et déterministes (R-80/R-81/R-82), source unique partagée
 * par le moteur (Phase C, combat, setup) et l'UI (sélection de civ, tooltips
 * des traits, menus de production) — même philosophie que economyOr (R-134).
 *
 * R-146 : catalogue FERMÉ de clés de traits ; chaque trait porte ses
 * paramètres en données. Les traits `inactif` sont affichés mais ignorés par
 * le moteur (routes, caravanes, élite/Loyauté — mécaniques inexistantes).
 */
import civsJson from './data/civilizations.json' with { type: 'json' };
import erasJson from './data/eras.json' with { type: 'json' };
import { UNIT_TYPES } from './data.js';
import type {
  CivilizationData,
  CivTrait,
  CivilizationsData,
  ErasData,
  TechEra,
  TerrainId,
  Yields,
} from './types.js';

export const CIVILIZATIONS: CivilizationsData = civsJson as unknown as CivilizationsData;
export const ERAS: ErasData = erasJson as unknown as ErasData;

/** 7n · R-147 · Civilisation « neutre » : défaut des parties existantes et
 *  des fixtures — AUCUN trait, aucune unité unique (migration 17). */
export const NEUTRAL_CIV: string = CIVILIZATIONS.params.civNeutre;

const ERA_ORDER: TechEra[] = ['ancienne', 'medievale', 'industrielle', 'moderne'];

/** Ordre croissant des ères (index 0 = ancienne). */
export function eraIndexOf(era: TechEra): number {
  return ERA_ORDER.indexOf(era);
}

/**
 * R-147 · T-36 🔶 · Ère d'un joueur par COMPAGE de technologies découvertes
 * (indifférent à la branche — doc d'Erik, défaut canon à veto) : Médiévale à
 * 5, Industrielle à 14, Moderne à 24 (eras.json). REMPLACE la définition 7i
 * « tech la plus avancée » (`techEraOf`) — utilisée partout (pop de fondation,
 * facteurs de rush, injection Explorateur, bonus de civ, overrun).
 */
export function eraOfTechCount(techCount: number): TechEra {
  const t = ERAS.thresholds;
  if (techCount >= t.moderne) return 'moderne';
  if (techCount >= t.industrielle) return 'industrielle';
  if (techCount >= t.medievale) return 'medievale';
  return 'ancienne';
}

/** R-147 : ère d'un joueur (champ persisté `era` — transition AU TOUR SUIVANT,
 *  appliquée en fin de résolution avec événement EraChanged). */
export function eraOfPlayer(player: { era: TechEra } | undefined): TechEra {
  return player?.era ?? 'ancienne';
}

/** R-145 : données de la civilisation (null si neutre ou inconnue — défaut
 *  défensif : une civ inconnue se comporte comme neutre). */
export function civDataOf(civId: string | undefined | null): CivilizationData | null {
  if (!civId) return null;
  return CIVILIZATIONS.civs[civId] ?? null;
}

/** R-145 : id de civilisation d'un joueur (neutre par défaut). */
export function civIdOf(player: { civId?: string } | undefined): string {
  return player?.civId ?? NEUTRAL_CIV;
}

/**
 * R-145 · Traits ACTIFS d'un joueur : avantage de départ + bonus d'ère
 * « ancienne » (actifs dès le setup — le joueur commence dans l'ère Antique)
 * puis bonus de chaque ère ATTEINTE (Médiévale à 5 techs, Industrielle à 14,
 * Moderne à 24). CUMULATIVITÉ INTÉGRALE (doc : « un bonus débloqué ne
 * s'éteint jamais ») — une civ en ère Moderne a ses 5 groupes actifs.
 */
export function activeTraitsOf(player: { civId?: string; era: TechEra } | undefined): CivTrait[] {
  const civ = civDataOf(civIdOf(player));
  if (!civ || !player) return [];
  const maxIndex = eraIndexOf(player.era ?? 'ancienne');
  const out: CivTrait[] = [...civ.start];
  for (const era of ERA_ORDER) {
    if (eraIndexOf(era) > maxIndex) break;
    out.push(...civ.eras[era]);
  }
  return out;
}

/** R-146 · Le joueur possède-t-il ce trait (actif, non inactif) ? Réimplémente
 *  le stub 7l (economyOr) — intérêts 2 % et rush ×0,5 s'activent ici. */
export function playerHasTrait(player: { civId?: string; era: TechEra } | undefined, key: string): boolean {
  return activeTraitsOf(player).some((t) => t.key === key && !t.inactif);
}

/** R-146 · Entrées ACTIVES d'une clé de trait donnée (paramètres compris). */
export function traitEntriesOf(player: { civId?: string; era: TechEra } | undefined, key: string): CivTrait[] {
  return activeTraitsOf(player).filter((t) => t.key === key && !t.inactif);
}

// ---------------------------------------------------------------------------
// R-149 · Effets de traits par mécanique — helpers purs utilisés par le
// moteur (Phase C, combat) et l'UI (menus, tooltips).
// ---------------------------------------------------------------------------

/** terrainBonus : bonus de rendement par TERRAIN (Amérique/Russie plaine,
 *  Égypte désert, Allemagne forêt, Mongolie montagne, Grèce/Japon maritime). */
export function civTerrainBonusesOf(
  player: { civId?: string; era: TechEra } | undefined,
): Partial<Record<TerrainId, Partial<Yields>>> {
  const out: Partial<Record<TerrainId, Partial<Yields>>> = {};
  for (const t of traitEntriesOf(player, 'terrainBonus')) {
    const terrain = t.terrain as TerrainId | undefined;
    if (!terrain) continue;
    const acc = (out[terrain] ??= {});
    acc.food = (acc.food ?? 0) + (t.food ?? 0);
    acc.production = (acc.production ?? 0) + (t.production ?? 0);
    acc.commerce = (acc.commerce ?? 0) + (t.commerce ?? 0);
  }
  return out;
}

/** popFondation : +X population aux villes fondées (Chine Antique, Rome Moderne). */
export function foundingPopBonusOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'popFondation').reduce((s, t) => s + (t.amount ?? 0), 0);
}

/** coutUniteMoitie : coût de production des unités listées ×0,5 (multiplicatif
 *  si plusieurs traits — Inde Colons, Russie Fusiliers/Espions). */
export function civUnitCostMultOf(player: { civId?: string; era: TechEra } | undefined, unitId: string): number {
  let m = 1;
  for (const t of traitEntriesOf(player, 'coutUniteMoitie')) {
    if (t.units?.includes(unitId)) m *= 0.5;
  }
  return m;
}

/** coutBuildingMoitie : coût des bâtiments listés ×0,5 (Bibliothèques,
 *  Casernes, Tribunaux). */
export function civBuildingCostMultOf(
  player: { civId?: string; era: TechEra } | undefined,
  buildingId: string,
): number {
  let m = 1;
  for (const t of traitEntriesOf(player, 'coutBuildingMoitie')) {
    if (t.buildings?.includes(buildingId)) m *= 0.5;
  }
  return m;
}

/** coutMerveilleMoitie : coût des merveilles ×0,5 (Rome Médiévale). */
export function civWonderCostMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'coutMerveilleMoitie').length > 0 ? 0.5 : 1;
}

/** buildingProductionMult : surcharge du multiplicateur de production d'un
 *  bâtiment (Amérique Moderne : Usine ×3 au lieu de ×2). */
export function civBuildingProductionMultOf(
  player: { civId?: string; era: TechEra } | undefined,
  buildingId: string,
): number | null {
  for (const t of traitEntriesOf(player, 'buildingProductionMult')) {
    if (t.building === buildingId) return t.mult ?? 2;
  }
  return null;
}

/** templeScience : science fixe par tour si la ville possède le bâtiment
 *  (Aztèques Médiévale : Temple +3). */
export function civBuildingScienceOf(
  player: { civId?: string; era: TechEra } | undefined,
  buildings: readonly string[],
): number {
  let s = 0;
  for (const t of traitEntriesOf(player, 'templeScience')) {
    if (t.building && buildings.includes(t.building)) s += t.science ?? 0;
  }
  return s;
}

/** empireGoldMult : ×X la production d'or de l'EMPIRE (Aztèques/Espagne/
 *  Zoulous Industrielle — multiplicatif entre traits et avec les merveilles
 *  Internet/Troyes, miroir C10). */
export function civEmpireGoldMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'empireGoldMult').reduce((m, t) => m * (t.mult ?? 1), 1);
}

/** commerceCaptures : ×X le commerce des villes CAPTURÉES (Mongolie). */
export function civCommerceCaptureMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'commerceCaptures').reduce((m, t) => m * (t.mult ?? 1), 1);
}

/** unitAttack / unitDefense / unitMovement : bonus de stats par TYPE d'unité
 *  (Arabie cavaliers+chevaliers, Angleterre archers longs, Mongolie cavalerie,
 *  Zoulous guerriers, France canons, Égypte/France fusiliers — les ids
 *  d'unités UNIQUES y figurent quand le doc les vise). */
export function civUnitStatBonusOf(
  player: { civId?: string; era: TechEra } | undefined,
  key: 'unitAttack' | 'unitDefense' | 'unitMovement',
  typeId: string,
): number {
  return traitEntriesOf(player, key).reduce((s, t) => (t.units?.includes(typeId) ? s + (t.amount ?? 0) : s), 0);
}

/** uniteVeteran : types produits VÉTÉRANS dès la sortie (Allemagne Guerriers). */
export function civVeteranUnitsOf(player: { civId?: string; era: TechEra } | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  for (const t of traitEntriesOf(player, 'uniteVeteran')) {
    for (const u of t.units ?? []) out.add(u);
  }
  return out;
}

/** navalAttack : +X attaque des unités NAVALES (Angleterre/Espagne Médiévale). */
export function civNavalAttackBonusOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'navalAttack').reduce((s, t) => s + (t.amount ?? 0), 0);
}

/** soutienNavalDouble : ×2 le soutien naval R-118 (Angleterre Moderne). */
export function civNavalSupportMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'soutienNavalDouble').reduce((m) => m * 2, 1);
}

/** overrun : ratio d'ÉCRASEMENT (Zoulous 4 — base canon 6, params). Le
 *  mécanisme Overrun (attaque instantanée si S_att ≥ S_def × ratio) s'applique
 *  à TOUS les joueurs (canon CivRev) ; le trait abaisse seulement le ratio. */
export function civOverrunRatioOf(player: { civId?: string; era: TechEra } | undefined): number {
  for (const t of traitEntriesOf(player, 'overrun')) {
    if (typeof t.ratio === 'number') return t.ratio;
  }
  return CIVILIZATIONS.params.overrunBaseRatio;
}

/** croissanceAcceleree : réduction du seuil de croissance (Zoulous Médiévale —
 *  « type Aqueduc », s'ajoute à celui de l'Aqueduc, plafonné par l'appelant). */
export function civGrowthReductionOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'croissanceAcceleree').reduce((s, t) => s + (t.reduction ?? 0), 0);
}

/** gpFrequents : multiplicateur des seuils d'obtention des GP (Grèce/Rome —
 *  canal culture T-27 ET accumulateurs T-30 🔶). */
export function civGpThresholdMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'gpFrequents').length > 0 ? CIVILIZATIONS.params.gpThresholdMult : 1;
}

/** tresorsDouble : ×X l'or des HUTTES (Espagne Ancienne — les artefacts sont
 *  une phase suivante ; mapping trésors → huttes documenté 🔶). */
export function civHutGoldMultOf(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'tresorsDouble').reduce((m, t) => m * (t.mult ?? 1), 1);
}

/** villagesVilles : ouvrir une hutte FONDE une ville pop 1 (Mongolie — tranche
 *  du handoff 🔶 : « ouvrir une hutte fonde une ville pop 1 »). */
export function civVillagesBecomeCities(player: { civId?: string; era: TechEra } | undefined): boolean {
  return traitEntriesOf(player, 'villagesVilles').length > 0;
}

/** immuniteAnarchie : transitions SANS Anarchie (Chine Moderne, Inde Antique,
 *  Japon Industrielle). */
export function civAnarchyImmunity(player: { civId?: string; era: TechEra } | undefined): boolean {
  return traitEntriesOf(player, 'immuniteAnarchie').length > 0;
}

/** soinVictoire : l'unité revient à ses PV max après une victoire de combat
 *  (Aztèques Ancienne). */
export function civHealAfterVictory(player: { civId?: string; era: TechEra } | undefined): boolean {
  return traitEntriesOf(player, 'soinVictoire').length > 0;
}

/** toutesRessources : accès aux bonus de ressources SANS technologie (Inde —
 *  R-92/R-93 : `revealedByTech` court-circuité pour le propriétaire). */
export function civToutesRessources(player: { civId?: string; era: TechEra } | undefined): boolean {
  return traitEntriesOf(player, 'toutesRessources').length > 0;
}

/** carteRevelee : rayon révélé autour du départ au setup (Russie). 0 = aucun. */
export function civStartRevealRadius(player: { civId?: string; era: TechEra } | undefined): number {
  return traitEntriesOf(player, 'carteRevelee').length > 0 ? CIVILIZATIONS.params.startRevealRadius : 0;
}

// ---------------------------------------------------------------------------
// R-150 · Avantages de DÉPART (setup déterministe — createInitialState)
// ---------------------------------------------------------------------------

/** Technologies gratuites du SETUP (avantage de départ + bonus d'ère Antique,
 *  actif dès le début — Grèce Démocratie, Arabie Religion…). */
export function civStartTechs(civId: string | undefined): string[] {
  const civ = civDataOf(civId);
  if (!civ) return [];
  const out: string[] = [];
  for (const t of [...civ.start, ...civ.eras.ancienne]) {
    if (t.key === 'techGratuite' && t.tech && !t.inactif) out.push(t.tech);
  }
  return [...new Set(out)].sort();
}

/** Gouvernement de départ (Rome République, Arabie Fondamentalisme) — null si
 *  aucun (Despotisme par défaut). */
export function civStartGovernment(civId: string | undefined): string | null {
  const civ = civDataOf(civId);
  if (!civ) return null;
  for (const t of [...civ.start, ...civ.eras.ancienne]) {
    if (t.key === 'gouvernementGratuit' && t.government && !t.inactif) return t.government;
  }
  return null;
}

/** Bâtiments gratuits dans la capitale au setup (France Cathédrale, Grèce
 *  Tribunal) — posés DIRECTEMENT (prérequis R-111 non exigés au setup). */
export function civStartBuildings(civId: string | undefined): string[] {
  const civ = civDataOf(civId);
  if (!civ) return [];
  const out: string[] = [];
  for (const t of [...civ.start, ...civ.eras.ancienne]) {
    if (t.key === 'batimentDepart' && t.building && !t.inactif) out.push(t.building);
  }
  return [...new Set(out)].sort();
}

/** La civ commence-t-elle avec un Personnage illustre gratuit (Amérique) ? */
export function civStartsFreeGp(civId: string | undefined): boolean {
  const civ = civDataOf(civId);
  if (!civ) return false;
  return [...civ.start, ...civ.eras.ancienne].some((t) => t.key === 'gpGratuit' && !t.inactif);
}

/** Or de départ (Aztèques — `orDepart` amount, défaut params 🔶). */
export function civStartGold(civId: string | undefined): number {
  const civ = civDataOf(civId);
  if (!civ) return 0;
  for (const t of [...civ.start, ...civ.eras.ancienne]) {
    if (t.key === 'orDepart' && !t.inactif) return t.amount ?? CIVILIZATIONS.params.orDepartDefault;
  }
  return 0;
}

/** Le choix de merveille Antique de l'Égypte est-il VALIDE (params — liste
 *  fermée, éditable en données) ? */
export function isEgyptWonderChoiceValid(civId: string | undefined, wonderId: string | null | undefined): boolean {
  const civ = civDataOf(civId);
  if (!civ) return wonderId == null;
  const wants = [...civ.start, ...civ.eras.ancienne].some((t) => t.key === 'merveilleAntiqueDepart' && !t.inactif);
  if (!wants) return wonderId == null;
  return typeof wonderId === 'string' && CIVILIZATIONS.params.egypteWonderChoices.includes(wonderId);
}

// ---------------------------------------------------------------------------
// R-148 · Unités uniques — remplacement (pattern R-111)
// ---------------------------------------------------------------------------

/**
 * R-148 · L'unité unique de `civId` qui REMPLACE `unitId` (null si aucune) :
 * proposée à la production dès que sa tech est débloquée ; l'unité standard
 * est RETIRÉE du menu de production de cette civilisation (R-111 transposé).
 * Déterministe : première entrée par id croissant (une seule par construction
 * — testé).
 */
export function uniqueReplacing(civId: string | undefined, unitId: string, techsUnlocked: readonly string[]): string | null {
  if (!civId || civId === NEUTRAL_CIV) return null;
  const candidates = Object.keys(UNIT_TYPES)
    .filter((id) => {
      const u = UNIT_TYPES[id]!;
      return u.uniqueTo === civId && u.replaces === unitId;
    })
    .sort();
  for (const id of candidates) {
    const u = UNIT_TYPES[id]!;
    if (u.tech === null || u.tech === undefined || techsUnlocked.includes(u.tech)) return id;
  }
  return null;
}

/** R-148 : l'unité est-elle une unité unique (quelconque) ? */
export function isUniqueUnit(unitId: string): boolean {
  return UNIT_TYPES[unitId]?.uniqueTo !== undefined;
}

/** R-148 : les unités uniques accessibles d'une civ (menus d'UI, tri par id). */
export function uniqueUnitsOf(civId: string | undefined): string[] {
  return Object.keys(UNIT_TYPES)
    .filter((id) => UNIT_TYPES[id]!.uniqueTo === civId)
    .sort();
}
