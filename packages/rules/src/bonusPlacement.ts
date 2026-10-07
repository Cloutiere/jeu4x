/**
 * BONUS-DECOUVERTE — placement des bonus « Premier découvrir » (décisions
 * d'Erik du 07/10, D1-D6 ; RULES.md §8.1bis, R-109 rév.). Helper partagé de
 * choix de ville : déterministe (R-81/R-82), réutilisable, JAMAIS Math.random.
 *
 * D1 — spawn naval : JAMAIS sur terre. Candidates = villes ayant des cases
 *      d'eau dans le rayon cultivable (miroir Port/production navale) ; tri
 *      population ↓ → capitale d'abord → tirage SEEDÉ (RNG dédié, miroir
 *      R-154) ; première ville avec une case d'eau LIBRE praticable par le
 *      type (Galère : côte seule — R-107) gagne ; toutes occupées → repli sur
 *      la CASE VILLE (port R-117 — ville côtière, case libre) ; épuisée →
 *      annulé (l'appelant annonce, D5).
 * D2 — Milice de bord : tout spawn naval SAUF le Sous-marin embarque une
 *      Milice (type `milice` — non productible, implemented:false) ; les
 *      barbares sont EXCLUS 🔶 ; naufrage/capture = R-117 standard (la
 *      cargaison coule avec le transport — kill récursif existant).
 * D3 — bâtiment à terrain (Comptoir=désert, Atelier=colline) : ville au PLUS
 *      de cases du terrain dans le rayon cultivable ACTUEL ; sinon décompte au
 *      rayon POTENTIEL Tribunal (2 — même sans Tribunal construit) ; jamais
 *      bénéficiaire ⇒ null (annulé, D5). Départage des ex-aequo : population ↓
 *      → capitale → seedé (détail tranché, consigné au rapport).
 * D4 — bâtiment sans terrain (Marché, Remparts) : ville la plus peuplée →
 *      capitale → seedé.
 *
 * Pur et déterministe : même graine ⇒ mêmes choix.
 */
import { hexesWithinRadiusW, hexDistanceW, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { createRng } from './rng.js';
import type { SeededRng } from './rng.js';
import { BARBARIAN_ID, BUILDINGS, TERRAINS, isWaterTerrain, unitType } from './data.js';
import { workRadiusOf } from './economy.js';
import { canEnterTerrain, isCoastalCityHex } from './naval.js';
import { nextId } from './state.js';
import type { City, CityId, GameState, Unit, UnitId } from './state.js';

/** Sel du RNG dédié aux choix de ville (miroir R-154 — R-80 : jamais Math.random). */
export const BONUS_PLACEMENT_SEED_SALT = 0xb0ad5d1e;

/** D2 · type de la Milice de bord (non productible — `implemented: false`). */
export const TYPE_MILICE = 'milice';

/**
 * Tri des villes candidates (D1/D3/D4) : population décroissante → capitale
 * d'abord → tirage SEEDÉ (la clé aléatoire ne départage que les égalités).
 * Les clés sont tirées dans l'ordre R-81 des cityIds pour la reproductibilité.
 */
export function trieVillesCandidates<T extends City>(cities: T[], seed: number): T[] {
  const ord = [...cities].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rng = createRng(seed);
  const cle = new Map<string, number>(ord.map((c) => [c.id, rng.next()]));
  return ord.sort(
    (a, b) =>
      b.pop - a.pop ||
      Number(b.capital) - Number(a.capital) ||
      (cle.get(a.id)! - cle.get(b.id)!) ||
      (a.id < b.id ? -1 : 1),
  );
}

/** Villes du joueur possédant AU MOINS une case d'eau dans le rayon cultivable. */
function villesAvecEau(st: GameState, playerId: string): City[] {
  return Object.values(st.cities).filter((c) => c.owner === playerId && casesEauDansRayon(st, c).length > 0);
}

/** Cases d'eau (côte/océan — isWaterTerrain) dans le rayon cultivable de la ville. */
function casesEauDansRayon(st: GameState, city: City): Hex[] {
  const centre = { q: city.q, r: city.r };
  const radius = workRadiusOf(city.buildings);
  return hexesWithinRadiusW(centre, radius, st.mapWidth).filter((h) => {
    if (hexDistanceW(centre, h, st.mapWidth) < 1) return false;
    const t = st.map[tileKeyOf(h)]?.terrain;
    return !!t && isWaterTerrain(t);
  });
}

/** Occupant posé sur la case (les unités À BORD ne comptent pas — miroir occupants). */
function occupantDe(st: GameState, hex: Hex): boolean {
  for (const u of Object.values(st.units)) {
    if (u.aboard === null && u.q === hex.q && u.r === hex.r) return true;
  }
  return false;
}

/** Cases d'eau LIBRES praticables par le type naval, dans le rayon cultivable (tri R-81). */
export function casesEauLibres(st: GameState, city: City, unitTypeId: string): Hex[] {
  const stats = unitType(unitTypeId);
  // R-152/R-153 : une case d'artefact n'est jamais un site d'engendrement
  // (miroir freeSpawnTiles — une unité qui y APPARAÎT n'active pas).
  const artefacts = new Set((st.artefacts ?? []).map((a) => tileKeyOf(a)));
  return casesEauDansRayon(st, city).filter((h) => {
    const key = tileKeyOf(h);
    if (artefacts.has(key)) return false;
    const t = st.map[key]!.terrain;
    if (!canEnterTerrain(stats, t, false)) return false; // Galère : côte seule (R-107)
    return !occupantDe(st, h);
  });
}

export interface SiteNaval {
  hex: Hex;
  cityId: CityId;
  /** 'eau' = case d'eau libre du rayon ; 'port' = case de ville (repli R-117). */
  mode: 'eau' | 'port';
}

/**
 * D1 · Site de spawn naval pour une récompense — null = annulé (aucun port
 * valide). Voir l'en-tête du module pour la politique complète.
 */
export function siteSpawnNaval(st: GameState, playerId: string, unitTypeId: string, seed: number): SiteNaval | null {
  if (!unitType(unitTypeId).aquatic) return null; // garde : terrestres hors périmètre
  const candidates = trieVillesCandidates(villesAvecEau(st, playerId), seed);
  // Passe 1 — première ville du tri ayant une case d'eau LIBRE praticable.
  for (const city of candidates) {
    const libre = casesEauLibres(st, city, unitTypeId)[0];
    if (libre) return { hex: libre, cityId: city.id, mode: 'eau' };
  }
  // Passe 2 — toutes les cases d'eau sont occupées : repli sur la CASE VILLE
  // (port R-117 — la ville doit être côtière et sa case libre).
  const stats = unitType(unitTypeId);
  for (const city of candidates) {
    const hex = { q: city.q, r: city.r };
    if (occupantDe(st, hex)) continue;
    if (!canEnterTerrain(stats, 'ville', isCoastalCityHex(st.map, hex, st.mapWidth))) continue;
    return { hex, cityId: city.id, mode: 'port' };
  }
  return null; // épuisée → annulé (D5 : l'appelant annonce)
}

export interface VilleBatimentTerrain {
  city: City;
  /** 'actuel' = rayon cultivable courant ; 'potentiel' = rayon 2 (Tribunal). */
  portee: 'actuel' | 'potentiel';
}

/** Nombre de cases du terrain ciblé par le tileBonus, dans le rayon donné. */
function compterTerrain(st: GameState, city: City, terrain: string, radius: number): number {
  const centre = { q: city.q, r: city.r };
  return hexesWithinRadiusW(centre, radius, st.mapWidth).filter((h) => {
    if (hexDistanceW(centre, h, st.mapWidth) < 1) return false;
    return st.map[tileKeyOf(h)]?.terrain === terrain;
  }).length;
}

/**
 * D3 · Ville au plus de cases du terrain du tileBonus — rayon ACTUEL, sinon
 * rayon POTENTIEL Tribunal (2) ; jamais bénéficiaire ⇒ null (annulé).
 */
export function villePourBatimentTerrain(
  st: GameState,
  playerId: string,
  buildingId: string,
  seed: number,
): VilleBatimentTerrain | null {
  const terrain = BUILDINGS[buildingId]?.tileBonus?.terrain;
  if (!terrain) return null; // garde : sans terrain → D4
  const owns = Object.values(st.cities).filter((c) => c.owner === playerId);
  if (owns.length === 0) return null;
  for (const portee of ['actuel', 'potentiel'] as const) {
    const comptees = owns.map((city) => ({
      city,
      n: compterTerrain(st, city, terrain, portee === 'actuel' ? workRadiusOf(city.buildings) : 2),
    }));
    const max = Math.max(...comptees.map((c) => c.n));
    if (max <= 0) continue; // personne au rayon actuel → potentiel
    const gagnantes = comptees.filter((c) => c.n === max).map((c) => c.city);
    return { city: trieVillesCandidates(gagnantes, seed)[0]!, portee };
  }
  return null; // jamais bénéficiaire (D5 : l'appelant annonce)
}

/** D4 · Ville la plus peuplée (capitale d'abord, seedé en dernier recours). */
export function villePlusPeuplee(st: GameState, playerId: string, seed: number): City | null {
  const owns = Object.values(st.cities).filter((c) => c.owner === playerId);
  if (owns.length === 0) return null;
  return trieVillesCandidates(owns, seed)[0]!;
}

/**
 * D2 · Embarque une Milice à bord du navire (R-117 : position miroir, `cargo`
 * pose le premier passager). No-op (retour null) si le type n'est pas
 * aquatique, si c'est un Sous-marin (décision d'Erik) ou si le propriétaire
 * est le joueur barbare (EXCLU 🔶) ; idempotent (une Milice max par navire).
 * L'appelant émet l'événement `Embark` existant s'il veut tracer l'embarquement.
 */
export function embarqueMilice(
  st: Pick<GameState, 'units'>,
  transport: Unit,
): UnitId | null {
  const stats = unitType(transport.type);
  if (!stats.aquatic || transport.type === 'sous_marin') return null;
  if (transport.owner === BARBARIAN_ID) return null; // barbares EXCLUS 🔶
  const deja = Object.values(st.units).some((u) => u.aboard === transport.id && u.type === TYPE_MILICE);
  if (deja) return null;
  const milice = unitType(TYPE_MILICE);
  const unitId = nextId(st.units, 'u');
  st.units[unitId] = {
    id: unitId,
    type: TYPE_MILICE,
    owner: transport.owner,
    q: transport.q,
    r: transport.r,
    hp: milice.hpMax,
    mp: milice.movement,
    veteran: false,
    isArmy: false,
    order: null,
    detainedBy: null,
    fortified: false,
    aboard: transport.id,
    cargo: null,
    stabilized: false, // ENGAGEMENT · R-173 (à bord = jamais stabilisée)
  };
  if (!transport.cargo) transport.cargo = unitId;
  return unitId;
}

/** Nom français du terrain (chronique D5) — repli sur l'id brute. */
export function nomTerrain(terrainId: string): string {
  return TERRAINS[terrainId]?.name ?? terrainId;
}
