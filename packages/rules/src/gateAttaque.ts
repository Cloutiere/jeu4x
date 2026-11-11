/**
 * BOT-GATE-ATTAQUE (canon Erik 10/11, prod D3UUQJ) — le gate d'ESPÉRANCE.
 *
 * Le bogue déclencheur : au t5 de D3UUQJ, la couche tactique bot a fait
 * attaquer le guerrier Jev (3 PV, force 1) par le gardien barbare FORTIFIÉ
 * du camp (force ~1,5) : p ≈ 0,31, mort du guerrier, gardien intact — sur une
 * simple règle positionnelle, sans JAMAIS évaluer l'issue ni la valeur des
 * unités. Depuis ORACLE-VERDICT, l'issue d'une bataille mêlée est calculable
 * au planning ; le matériel existe, il manquait la DÉCISION.
 *
 * Canon (validé Erik 10/11) : une attaque se décide à l'espérance de gain
 *
 *     P(victoire) × valeur(gain) ≥ k × P(défaite) × valeur(perte)   (k = 2)
 *
 * pondérée par la VALEUR TACTIQUE des unités — base par rôle (colon sans
 * site = très élevé, gardien de capitale = élevé, ère dépassée = faible),
 * dernière combattante majorée, vétéran +50 %, PV blessés proportionnels,
 * position critique bonifiée — et qualifiée par Jev via une CATÉGORIE
 * bornée ×0,5–×2 (jamais un float libre).
 *
 * Zéro formule parallèle : les forces viennent du moteur (forcesProspectives
 * — combatStrengthsOf, socle ARMEE-STRENGTH) et la probabilité d'assaut de
 * combatOdds (R-125, la même formule que le dérivé). Le gate ne décide QUE
 * d'attaquer ou non : l'issue d'une bataille lancée reste celle du dérivé
 * ORACLE-VERDICT (déterminisme bit à bit intact).
 *
 * Tables : bot.json `gateAttaque` (toute table éditable, zéro durcissement).
 */
import { BOT_SETTINGS, UNIT_TYPES } from './data.js';
import { isBarbarian } from './state.js';
import { hexDistanceW } from './hex.js';
import { combatOdds } from './combat.js';
import { forcesProspectives } from './turn.js';
// Ré-export : le consommateur du gate n'importe qu'un seul module.
export { forcesProspectives } from './turn.js';
import type { GameState, PlayerId, Unit } from './state.js';

/** Catégorie tactique rendue par Jev (L3) — énumération fermée, défaut neutre. */
export type CategorieTactique = 'jeGarde' | 'sacrifiable' | 'positionDecisive';

/** Table du gate (bot.json `gateAttaque`). */
export function gateAttaqueDuBot() {
  return BOT_SETTINGS.gateAttaque;
}

/**
 * Le gate PUR : l'attaque passe si P(victoire) × gain ≥ k × P(défaite) × perte.
 * Aversion au risque k = 2 (tunable bot.json). Pur, déterministe (aucun tir).
 */
export function gateAttaque(p: number, gain: number, perte: number, k: number): boolean {
  return p * gain >= k * (1 - p) * perte;
}

/** Multiplicateur Jev borné (défaut neutre ×1 — réponse absente/illisible). */
export function multiplicateurCategorie(categorie?: string): number {
  const d = gateAttaqueDuBot();
  if (!categorie) return 1;
  const brut = (d.categoriesJev as Record<string, number | undefined>)[categorie];
  if (brut === undefined) return 1;
  return Math.min(d.categorieMax, Math.max(d.categorieMin, brut));
}

/** Unité de COMBAT déployée (peut attaquer, non embarquée) du joueur. */
function combattantesDe(state: GameState, joueurId: PlayerId): Unit[] {
  return Object.values(state.units).filter(
    (u) => u.owner === joueurId && !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false),
  );
}

/** La capitale du joueur (case), sinon null. */
function capitaleDe(state: GameState, joueurId: PlayerId): { q: number; r: number } | null {
  const c = Object.values(state.cities).find((v) => v.owner === joueurId && v.capital);
  return c ? { q: c.q, r: c.r } : null;
}

/** Un site de fondation est-il en réserve près du colon (dist ≤ 2) :
 *  case praticable, sans ville ni village. Approximation géométrique 🔶
 *  documentée (la réserve réelle est le memo Jev/bot — le moteur juge la
 *  place, pas la qualité 🔶). */
function siteFondationDisponible(state: GameState, colon: Unit): boolean {
  for (const [key, tile] of Object.entries(state.map)) {
    const stats = UNIT_TYPES[colon.type];
    if (stats?.aquatic) continue; // 🔶 colon naval hors périmètre
    const terr = tile.terrain;
    const passable = terr !== 'eau' && terr !== 'montagne';
    if (!passable) continue;
    const parts = key.split(',');
    const hex = { q: Number(parts[0]), r: Number(parts[1]) };
    if (Object.values(state.cities).some((c) => c.q === hex.q && c.r === hex.r)) continue;
    if ((state.villages ?? []).some((v) => v.q === hex.q && v.r === hex.r)) continue;
    if (hexDistanceW({ q: colon.q, r: colon.r }, hex, state.mapWidth) <= 2) return true;
  }
  return false;
}

/** Position critique : la seule combattante entre un ennemi et une de mes
 *  villes (dist ≤ 2 des deux, aucune autre combattante au rayon), ou escorte
 *  effective d'un colon (adjacente). Pur, déterministe. */
function positionCritique(state: GameState, unit: Unit, joueurId: PlayerId): boolean {
  const moi = combattantesDe(state, joueurId);
  const distance = (a: { q: number; r: number }, b: { q: number; r: number }) =>
    hexDistanceW(a, b, state.mapWidth);
  // Escorte effective d'un colon adjacent.
  const escorte = Object.values(state.units).some(
    (u) => u.owner === joueurId && u.id !== unit.id && UNIT_TYPES[u.type]?.canFoundCity &&
      !u.aboard && distance(u, unit) === 1,
  );
  if (escorte) return true;
  // Seule combattante entre un ennemi et une ville.
  const ennemisIds = new Set<PlayerId>();
  for (const [a, b] of state.diplomacy.war) {
    if (a === joueurId) ennemisIds.add(b);
    if (b === joueurId) ennemisIds.add(a);
  }
  const estEnnemi = (owner: PlayerId) => isBarbarian(owner) || ennemisIds.has(owner);
  for (const ville of Object.values(state.cities)) {
    if (ville.owner !== joueurId) continue;
    if (distance(ville, unit) > 2) continue;
    const menaceProche = Object.values(state.units).some(
      (u) => !u.aboard && estEnnemi(u.owner) && distance(u, ville) <= 2,
    );
    if (!menaceProche) continue;
    const autres = moi.filter((u) => u.id !== unit.id && distance(u, ville) <= 2);
    if (autres.length === 0) return true;
  }
  return false;
}

/**
 * VALEUR TACTIQUE (D2) d'une unité pour son propriétaire — base par rôle +
 * modificateurs, toute table éditable (bot.json `gateAttaque`). Pur,
 * déterministe. La même monnaie juge les DEUX camps (côté gain comme côté
 * perte — D3).
 */
export function valeurTactique(
  state: GameState,
  unit: Unit,
  joueurId: PlayerId,
  categorie?: string,
): number {
  const d = gateAttaqueDuBot();
  const stats = UNIT_TYPES[unit.type];
  if (!stats) return 0;

  // Base par rôle.
  let base = d.baseRole.standard;
  if (stats.canFoundCity) {
    base = siteFondationDisponible(state, unit) ? d.baseRole.colonAvecSite : d.baseRole.colonSansSite;
  } else {
    const joueur = state.players[joueurId];
    const techs = joueur?.techsUnlocked ?? [];
    const upgrade = stats.upgradeTo ? UNIT_TYPES[stats.upgradeTo] : undefined;
    const depassee = !!upgrade?.tech && techs.includes(upgrade.tech);
    if (depassee) base = d.baseRole.eraDepassee;
    else {
      const capitale = capitaleDe(state, joueurId);
      if (capitale && capitale.q === unit.q && capitale.r === unit.r) base = d.baseRole.gardienCapitale;
    }
  }

  // Dernière(s) combattante(s) : 1 sur 1 vaut plus que 1 sur 4 (n = 0 —
  // l'unité n'est pas combattante : pas de majoration).
  const n = combattantesDe(state, joueurId).length;
  let valeur = n >= 1 ? base * (1 + (d.multDerniereCombattante - 1) / n) : base;

  // Modificateurs.
  if (unit.veteran) valeur *= 1 + d.bonusVeteran;
  valeur *= unit.hp / (stats.hpMax || 1); // PV blessés : réduction proportionnelle
  if (positionCritique(state, unit, joueurId)) valeur *= d.bonusPositionCritique;

  // Jev qualifie, le moteur calcule (D4) — multiplicateur BORNÉ.
  valeur *= multiplicateurCategorie(categorie);
  return valeur;
}

/** Le défenseur est-il un GARDIEN de camp barbare (sur la case d'un village,
 *  inscrit dans ses spawnedUnits) ? → le gain inclut le butin du camp (D3). */
export function estGardienCamp(state: GameState, defenseur: Unit): boolean {
  if (!isBarbarian(defenseur.owner)) return false;
  return (state.villages ?? []).some(
    (v) => v.q === defenseur.q && v.r === defenseur.r && v.spawnedUnits.includes(defenseur.id),
  );
}

export interface VerdictAttaque {
  /** P(victoire d'un assaut) — formule canon combatOdds (R-125). */
  p: number;
  gain: number;
  perte: number;
  k: number;
  passe: boolean;
}

/**
 * DÉCISION unitaire : l'attaque de `attaquant` sur `defenseur` (adjacent)
 * passe-t-elle le gate d'espérance ? Forces = combatStrengthsOf (zéro
 * formule parallèle), p = combatOdds, valeurs = valeurTactique. Pur,
 * déterministe (aucun tir — l'issue d'une bataille LANCÉE reste au dérivé).
 */
export function deciderAttaqueUnitaire(
  state: GameState,
  attaquant: Unit,
  defenseur: Unit,
  categorieAttaquant?: string,
): VerdictAttaque {
  const d = gateAttaqueDuBot();
  const { sAtt, sDef } = forcesProspectives(state, attaquant, defenseur);
  const p = combatOdds(sAtt, sDef);
  let gain = valeurTactique(state, defenseur, defenseur.owner);
  if (estGardienCamp(state, defenseur)) gain += d.valeurButinCamp;
  // Sécurité locale (D3) : la cible est évaluée par la même monnaie — tuer un
  // ennemi EN GUERRE DÉCLARÉE fait vivre la guerre (sinon le gate k=2 rend
  // toute guerre à forces égales stérile — banc horloge 10/11) ; un ennemi
  // qui menace une de mes villes (dist ≤ 2) vaut encore plus à abattre. Les
  // barbares ne sont jamais en guerre déclarée — D3UUQJ reste refusé.
  if (!isBarbarian(defenseur.owner)) {
    const enGuerreDeclaree = state.diplomacy.war.some(
      (w) => (w[0] === attaquant.owner && w[1] === defenseur.owner) ||
        (w[1] === attaquant.owner && w[0] === defenseur.owner),
    );
    if (enGuerreDeclaree) gain += d.bonusSecuriteGuerre;
    const menaceVille = Object.values(state.cities).some(
      (v) => v.owner === attaquant.owner &&
        hexDistanceW({ q: defenseur.q, r: defenseur.r }, v, state.mapWidth) <= 2,
    );
    if (menaceVille) gain += d.bonusSecuriteVille;
  }
  // « Ennemi écrasant = gain quasi nul » : rien à gagner contre une force
  // qui écrase la nôtre (la cible est évaluée par la même monnaie — D3).
  if (sDef >= d.gainNulRatio * sAtt) gain *= d.gainNulFacteur;
  const perte = valeurTactique(state, attaquant, attaquant.owner, categorieAttaquant);
  return { p, gain, perte, k: d.k, passe: gateAttaque(p, gain, perte, d.k) };
}
