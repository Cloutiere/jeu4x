/**
 * L3 — Cartes préfabriquées : format JSON + loader validé.
 *
 * Format (disposition rectangulaire axiale, hex.ts) :
 *  - `rows[r]` : chaîne de `width` caractères, la colonne c de la rangée r
 *    correspond à la case axiale (q = c − ⌊r/2⌋, r) ;
 *  - `legend` : caractère → identifiant de terrain (doit exister dans terrain.json) ;
 *  - `players` : exactement 2 en v1, chaque joueur a sa capitale et son unité
 *    de départ — 1 Guerrier sur une case adjacente praticable de la capitale
 *    (décision d'Erik du 01/09 : plus de Colon au départ) ;
 *  - `resources` (optionnel, R-94/Phase 7c) : placements explicites
 *    `[{id, q, r}]` — données commises, calibrage par édition.
 *
 * Validations testées : dimensions, terrains connus, spawns dans la carte et
 * praticables, capitales à distance ≥ 12, types d'unités connus, au plus une
 * unité par case, pas de chevauchement capitale/unité adverse, et pour les
 * ressources (R-94) : id connu, terrain de la case ∈ `terrains` de la
 * ressource, au plus une par case, jamais sur une case de capitale.
 */
import { colRowToHex, hexDistance, inRectangle, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { ARTEFACTS, BARBARIANS, RESOURCES, TERRAINS, unitType } from './data.js';
import type { PlayerId, Tile, GameState, City, BarbarianVillage, Hut, Artefact } from './state.js';
import { CURRENT_SCHEMA_VERSION } from './state.js';
import type { ResourceId } from './types.js';
import { SCIENCE_RATIO_DEFAULT, VISION_RADIUS_CITY } from './constants.js';
import { CONVERSION_DEFAULT } from './conversion.js';
import { autoAssignWorkedTiles } from './economy.js';
import { hexesWithinRadius } from './hex.js';
import { artefactsForMap } from './artefacts.js';
import {
  eraOfTechCount,
  civStartTechs,
  civStartGovernment,
  civStartBuildings,
  civStartGold,
  civStartsFreeGp,
  civStartRevealRadius,
  civVeteranUnitsOf,
  civUnitStatBonusOf,
  uniqueReplacing,
  isEgyptWonderChoiceValid,
  civDataOf,
} from './civilizations.js';
import { greatPersonClassFor } from './culture.js';

export interface MapPlayerSpawn {
  id: PlayerId;
  capital: Hex;
  units: Array<{ type: string; q: number; r: number }>;
}

/** R-94 : placement explicite d'une ressource sur la carte. */
export interface MapResource {
  id: ResourceId;
  q: number;
  r: number;
}

/** R-96/Phase 7d : placement d'un village barbare (id affecté à la pose). */
export interface MapVillage {
  q: number;
  r: number;
}

/** R-98/Phase 7d : placement d'une hutte bonus. */
export interface MapHut {
  q: number;
  r: number;
}

/** 7o · R-151/R-152 : artefact posé sur la carte (tirage seedé — génération
 *  procédurale ou cartes fixes ; les ids 'a1'… sont affectés à la pose). */
export interface MapArtefact {
  artefactId: string;
  q: number;
  r: number;
}

/** Cartes commises (chargées statiquement — migration/enrichissement synchrones). */
export type BuiltinMapId = 'pedagogique-40' | 'pangee-40' | 'variee-40';

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  legend: Record<string, string>;
  rows: string[];
  players: MapPlayerSpawn[];
  /** R-94 : tableau optionnel (absent = carte sans ressource). */
  resources?: MapResource[];
  /** R-96/Phase 7d : villages barbares (3 par carte 40×40 — placements équitables). */
  villages?: MapVillage[];
  /** R-98/Phase 7d : huttes bonus (2 par carte). */
  huts?: MapHut[];
  /** 7o · R-151/R-152 : artefacts tirés par seed (posés par le générateur
   *  procédural ; les cartes préfabriquées sont tirées à la création d'état —
   *  R-151 — et ne portent rien en JSON). */
  artefacts?: MapArtefact[];
  /** Phase 6c (demande d'Erik) : mode de démarrage — 'capital' (défaut : la
   *  ville existe dès l'initialisation) ou 'colon' : AUCUNE ville au départ,
   *  un Colon occupe le site réservé (`capital`, qui ne devient une ville que
   *  par FoundCity R-64) + un Guerrier adjacent. */
  start?: 'capital' | 'colon';
}

/** Carte validée : terrain par case axiale + spawns + ressources + villages/huttes. */
export interface LoadedMap {
  data: MapData;
  terrain: Record<string, string>; // clé "q,r" → TerrainId
  spawns: MapPlayerSpawn[];
  resources: MapResource[];
  villages: MapVillage[];
  huts: MapHut[];
  /** 7o · R-151 : artefacts portés par la carte (génération procédurale ;
   *  absent/vide pour les cartes préfabriquées — tirage à la création d'état). */
  artefacts: MapArtefact[];
}

export class MapValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Carte invalide (${issues.length} problème(s)) :\n- ${issues.join('\n- ')}`);
    this.issues = issues;
  }
}

/** Rendements minimaux attendus des unités de départ (décision #7). */
const MIN_SPAWN_DISTANCE = 12;

export function parseMap(raw: unknown): LoadedMap {
  const issues: string[] = [];
  const data = raw as MapData;

  if (!data || typeof data !== 'object') throw new MapValidationError(['JSON non objet']);
  if (typeof data.id !== 'string' || data.id.length === 0) issues.push('id manquant');
  if (!Number.isInteger(data.width) || (data.width ?? 0) < 1) issues.push('width invalide');
  if (!Number.isInteger(data.height) || (data.height ?? 0) < 1) issues.push('height invalide');
  if (issues.length) throw new MapValidationError(issues);

  const { width, height } = data;

  if (!Array.isArray(data.rows) || data.rows.length !== height) {
    issues.push(`rows doit contenir ${height} ligne(s)`);
  }
  const legend = data.legend ?? {};
  for (const [ch, t] of Object.entries(legend)) {
    if (!TERRAINS[t]) issues.push(`légende : terrain inconnu "${t}" (caractère "${ch}")`);
  }
  if (!Array.isArray(data.players) || data.players.length !== 2) {
    issues.push('v1 : exactement 2 joueurs requis');
  }

  const terrain: Record<string, string> = {};
  if (!issues.some((i) => i.startsWith('rows') || i.startsWith('légende'))) {
    for (let row = 0; row < height; row++) {
      const line = data.rows[row] ?? '';
      if (line.length !== width) {
        issues.push(`rangée ${row} : ${line.length} caractères au lieu de ${width}`);
        continue;
      }
      for (let col = 0; col < width; col++) {
        const ch = line[col]!;
        const t = legend[ch];
        if (!t) {
          issues.push(`caractère inconnu "${ch}" en (col ${col}, rangée ${row})`);
          continue;
        }
        terrain[tileKeyOf(colRowToHex(col, row))] = t;
      }
    }
  }

  if (data.players?.length === 2) {
    const seenUnits = new Set<string>();
    const capitals: Hex[] = [];
    data.players.forEach((p, i) => {
      if (typeof p.id !== 'string' || !p.id) issues.push(`joueur #${i} : id manquant`);
      const cap = p.capital as Hex | undefined;
      if (!cap || typeof cap.q !== 'number' || typeof cap.r !== 'number') {
        issues.push(`joueur #${i} : capitale invalide`);
        return;
      }
      capitals.push(cap);
      if (!inRectangle(cap, width, height)) {
        issues.push(`capitale de ${p.id} hors carte`);
      } else {
        const t = terrain[tileKeyOf(cap)];
        if (t && !TERRAINS[t]!.passable) issues.push(`capitale de ${p.id} sur terrain infranchissable (${t})`);
      }
      // Phase 6c : démarrage 'colon' (Erik) — Colon SUR le site réservé +
      // Guerrier adjacent ; démarrage 'capital' (défaut) — 1 Guerrier adjacent.
      const colonStart = data.start === 'colon';
      const expectedUnits = colonStart ? 2 : 1;
      if (!Array.isArray(p.units) || p.units.length !== expectedUnits) {
        issues.push(
          `joueur ${p.id} : démarrage non conforme — exactement ${expectedUnits} unité(s) attendue(s) ` +
          (colonStart ? "(Colon sur le site + Guerrier adjacent)" : "(décision d'Erik du 01/09 : 1 Guerrier à côté de la ville)"),
        );
      }
      let seenColon = false;
      let seenGuerrier = false;
      for (const u of p.units ?? []) {
        const hex = { q: u.q, r: u.r };
        const d = cap && typeof cap.q === 'number' && typeof cap.r === 'number' ? hexDistance(cap, hex) : -1;
        if (colonStart) {
          if (u.type === 'colon') {
            if (seenColon) issues.push(`joueur ${p.id} : plus d'un Colon de départ`);
            seenColon = true;
            if (d !== 0) {
              issues.push(`joueur ${p.id} : le Colon de départ occupe le site réservé (distance ${d})`);
            }
          } else if (u.type === 'guerrier') {
            if (seenGuerrier) issues.push(`joueur ${p.id} : plus d'un Guerrier de départ`);
            seenGuerrier = true;
            if (d !== 1) {
              issues.push(`joueur ${p.id} : le Guerrier de départ doit être adjacent au site (distance ${d})`);
            }
          } else {
            issues.push(`joueur ${p.id} : unité de départ inattendue "${u.type}" (Colon + Guerrier attendus)`);
          }
        } else {
          if (u.type !== 'guerrier') {
            issues.push(`joueur ${p.id} : l'unité de départ doit être un Guerrier (reçu "${u.type}")`);
          }
          if (d !== 1) {
            issues.push(`joueur ${p.id} : le Guerrier de départ doit être adjacent à la capitale (distance ${d})`);
          }
        }
        if (!inRectangle(hex, width, height)) {
          issues.push(`unité ${u.type} de ${p.id} hors carte`);
        } else {
          const t = terrain[tileKeyOf(hex)];
          if (t && !TERRAINS[t]!.passable) {
            issues.push(`unité ${u.type} de ${p.id} sur terrain infranchissable (${t})`);
          }
        }
        const key = tileKeyOf(hex);
        if (seenUnits.has(key)) issues.push(`plus d'une unité sur la case ${key}`);
        seenUnits.add(key);
      }
    });
    // Distance minimale entre capitales (décision #7 : spawns ≥ 12).
    if (capitals.length === 2) {
      const d = hexDistance(capitals[0]!, capitals[1]!);
      if (d < MIN_SPAWN_DISTANCE) {
        issues.push(`capitales à distance ${d} < ${MIN_SPAWN_DISTANCE}`);
      }
    }
  }

  // R-94 : validations des placements de ressources (id connu, terrain
  // autorisé, unicité par case, jamais sur une capitale).
  const resources = data.resources ?? [];
  if (issues.every((i) => !i.startsWith('rows') && !i.startsWith('légende'))) {
    const capitalKeys = new Set((data.players ?? []).map((p) => tileKeyOf(p.capital)));
    const seenResourceTiles = new Set<string>();
    for (const res of resources) {
      const data2 = RESOURCES[res.id];
      if (!data2) {
        issues.push(`ressource inconnue : "${res.id}"`);
        continue;
      }
      const key = tileKeyOf({ q: res.q, r: res.r });
      const t = terrain[key];
      if (t === undefined) {
        issues.push(`ressource ${res.id} hors carte (${key})`);
        continue;
      }
      if (!(data2.terrains as readonly string[]).includes(t)) {
        issues.push(`ressource ${res.id} sur terrain non autorisé (${t} ∈ [${data2.terrains.join(', ')}]) en ${key}`);
      }
      if (seenResourceTiles.has(key)) {
        issues.push(`plus d'une ressource sur la case ${key}`);
      }
      seenResourceTiles.add(key);
      if (capitalKeys.has(key)) {
        issues.push(`ressource ${res.id} sur une case de capitale (${key})`);
      }
    }
  }

  // R-96/R-98 : validations des villages barbares et des huttes — dans la
  // carte, terrain praticable (un village sur l'eau serait injoignable),
  // jamais sur une case de capitale, au plus une entité (village/hutte) par
  // case. Les ressources, elles, sont AUTORISÉES sous un village (CivRev :
  // « villages always on top of a resource »).
  const entities = [
    ...(data.villages ?? []).map((v) => ({ kind: 'village' as const, ...v })),
    ...(data.huts ?? []).map((h) => ({ kind: 'hut' as const, ...h })),
    ...(data.artefacts ?? []).map((a) => ({ kind: 'artefact' as const, ...a })),
  ];
  if (issues.every((i) => !i.startsWith('rows') && !i.startsWith('légende'))) {
    const capitalKeys = new Set((data.players ?? []).map((p) => tileKeyOf(p.capital)));
    const seenEntities = new Set<string>();
    for (const e of entities) {
      const label = e.kind === 'village' ? 'village' : e.kind === 'hut' ? 'hutte' : 'artefact';
      const key = tileKeyOf(e);
      if (!inRectangle(e, width, height)) {
        issues.push(`${label} hors carte (${key})`);
        continue;
      }
      const t = terrain[key];
      if (t === undefined) {
        issues.push(`${label} hors carte (${key})`);
        continue;
      }
      // 7o · R-153 : un artefact terrestre exige une case praticable ;
      // l'Atlantide (activation navale) exige l'OCÉAN profond.
      if (e.kind === 'artefact') {
        const artefactData = ARTEFACTS.pool[(e as { artefactId?: string }).artefactId ?? ''];
        if (!artefactData) {
          issues.push(`artefact inconnu : "${(e as { artefactId?: string }).artefactId ?? ''}" (${key})`);
          continue;
        }
        if (artefactData.dlcOnly) {
          issues.push(`artefact DLC jamais généré : "${artefactData.id}" (${key})`);
          continue;
        }
        const expectsOcean = artefactData.activation === 'oceanAdjacent';
        if (expectsOcean && t !== 'ocean') {
          issues.push(`artefact ${artefactData.id} hors océan profond (${t} en ${key})`);
        }
        if (!expectsOcean && !TERRAINS[t]!.passable) {
          issues.push(`artefact ${artefactData.id} sur terrain infranchissable (${t} en ${key})`);
        }
      } else if (!TERRAINS[t]!.passable) {
        issues.push(`${label} sur terrain infranchissable (${t}) en ${key}`);
      }
      if (capitalKeys.has(key)) {
        issues.push(`${label} sur une case de capitale (${key})`);
      }
      if (seenEntities.has(key)) {
        issues.push(`plus d'un village/hutte/artefact sur la case ${key}`);
      }
      seenEntities.add(key);
    }
  }

  if (issues.length) throw new MapValidationError(issues);
  return {
    data,
    terrain,
    spawns: data.players,
    resources,
    villages: data.villages ?? [],
    huts: data.huts ?? [],
    artefacts: data.artefacts ?? [],
  };
}

import pedagogiqueJson from './data/maps/pedagogique-40.json' with { type: 'json' };
import pangeeJson from './data/maps/pangee-40.json' with { type: 'json' };
import varieeJson from './data/maps/variee-40.json' with { type: 'json' };

/** Charge une des cartes commises (source des données : src/data/maps). */
export async function loadBuiltinMap(id: BuiltinMapId): Promise<LoadedMap> {
  return loadBuiltinMapSync(id);
}

/**
 * Variante SYNCHRONE (Phase 7d) : les trois cartes sont importées
 * statiquement — indispensable à `applyMapEntities` pour l'enrichissement des
 * états migrés v7 (le serveur connaît le `mapId` de la partie, le moteur pur
 * doit pouvoir l'appliquer sans IO asynchrone).
 */
export function loadBuiltinMapSync(id: BuiltinMapId): LoadedMap {
  const mod =
    id === 'pangee-40' ? pangeeJson : id === 'variee-40' ? varieeJson : pedagogiqueJson;
  return parseMap(mod as unknown as MapData);
}

/**
 * État initial : capitales fondées (pop 1), unités de départ placées,
 * vision initiale calculée, guerre permanente entre les deux joueurs (R-58).
 * 7n · R-150 : `civSetup` porte la civilisation de chaque joueur (choix au
 * lobby) — les AVANTAGES DE DÉPART sont appliqués de façon déterministe
 * (techs, gouvernement, bâtiments/merveille gratuits, or, GP, révélation,
 * unités de départ remplacées par les uniques disponibles — R-148).
 */
export interface CivSetup {
  civId: string;
  /** 7n 🔶 : choix de la Merveille Antique de l'Égypte (params
   *  `egypteWonderChoices` — validé par isEgyptWonderChoiceValid). */
  wonderId?: string;
}

export function createInitialState(
  map: LoadedMap,
  rngSeed: number,
  civSetup: Record<string, CivSetup> = {},
): GameState {
  const terrainById = map.terrain;
  const mapRecord: Record<string, Tile> = {};
  for (const [key, t] of Object.entries(terrainById)) {
    mapRecord[key] = { terrain: t as Tile['terrain'], resource: null };
  }
  // R-94 : recopie des placements de ressources de la carte dans l'état
  // (validés par parseMap : terrain autorisé, unicité, pas de capitale).
  for (const res of map.resources) {
    const tile = mapRecord[tileKeyOf(res)];
    if (tile) tile.resource = res.id;
  }

  const players: GameState['players'] = {};
  for (const spawn of map.spawns) {
    const setup = civSetup[spawn.id];
    const civId = setup?.civId ?? 'neutre'; // 7n · R-145
    players[spawn.id] = {
      id: spawn.id,
      civId,
      era: 'ancienne', // 7n · R-147 (recalculé après les techs de départ)
      // 7l · R-134 : la trésorerie remplace l'ancien champ or (R-134).
      treasury: 0,
      economyMilestonesClaimed: 0,
      nukesLaunched: 0, // 7m · R-139 (migration 16)
      science: 0,
      scienceRatio: SCIENCE_RATIO_DEFAULT,
      researching: null,
      scienceProgress: {},
      techsUnlocked: [],
      scienceStored: 0,
      cultureMilestones: 0, // 7f · R-115
      greatPersonsObtained: 0, // 7f · R-114
      government: 'despotisme', // 7h · R-121
      anarchyUntil: null, // 7h · R-122
      greatPersonsByType: {}, // 7h · R-123
      combatVictories: 0, // 7h · T-31
      techsUnlockedThisTurn: [], // 7h · R-122
      vision: { explored: [], visible: [] },
      missedTurns: 0,
    };
  }

  const cities: Record<string, City> = {};
  // Phase 6c (Erik) : démarrage 'colon' — AUCUNE ville à l'initialisation ;
  // le Colon occupe le site réservé et fondera via FoundCity (R-64, la
  // première ville devient capitale). L'ancre garde son terrain d'origine.
  const colonStart = map.data.start === 'colon';
  map.spawns.forEach((spawn, i) => {
    if (colonStart) return;
    const id = `c${i + 1}`;
    cities[id] = {
      id,
      q: spawn.capital.q,
      r: spawn.capital.r,
      owner: spawn.id,
      // 7i · D3 · R-64 (rév.) : les capitales préfabriquées démarrent à pop 2
      // (proposal 🔶 confirmée au handoff 7i — ère Antique) avec leurs 2
      // citoyens auto-assignés (R-60).
      pop: 2,
      capital: true,
      foodStored: 0,
      production: null,
      workedTiles: [],
      buildings: ['palais'], // 7e : le Palais ne vit que dans la capitale
      conversion: CONVERSION_DEFAULT, // R-90 : défaut Or
      cultureStored: 0, // 7f · R-113
      wonders: [], // 7f · R-115
      gpAccumGold: 0, // 7h · R-123
      gpAccumScience: 0,
      gpAccumProd: 0,
      gpAccumFood: 0, // 7j (7k · C1 : DORMANT — canal Humanitaire = culture)
      pendingSalvage: 0, // 7k · R-130 (M3)
      settledGreatPersons: [], // 7j · R-126
      wasCaptured: false, // 7n · R-149 (trait Mongol commerceCaptures)
    };
    // La case de capitale devient une case de ville (RULES.md §2).
    mapRecord[tileKeyOf(spawn.capital)] = { terrain: 'ville', resource: null };
    // 7i · D3 · R-60 : les 2 citoyens initiaux sont auto-assignés dès la
    // création (meilleures cases libres, priorité N > P > C — R-81).
    cities[id]!.workedTiles = autoAssignWorkedTiles(mapRecord, Object.values(cities), {
      ...cities[id]!,
      q: spawn.capital.q,
      r: spawn.capital.r,
    });
  });

  const units: GameState['units'] = {};
  let n = 0;
  for (const spawn of map.spawns) {
    // 7n · R-148 : les unités de départ d'une civ sont remplacées par leurs
    // uniques disponibles (le Guerrier d'un Zoulou naît Impi — techs de
    // départ déjà connues, l'unique sans tech est toujours disponible).
    const civId = civSetup[spawn.id]?.civId ?? 'neutre';
    const startTechs = civStartTechs(civId);
    const veterans = civVeteranUnitsOf({ civId, era: 'ancienne' });
    for (const spec of spawn.units) {
      n += 1;
      const effectiveType = uniqueReplacing(civId, spec.type, startTechs) ?? spec.type;
      const stats = unitType(effectiveType);
      units[`u${n}`] = {
        id: `u${n}`,
        type: effectiveType,
        owner: spawn.id,
        q: spec.q,
        r: spec.r,
        hp: stats.hpMax,
        // 7n · R-149 : PM max incluant le bonus de mouvement civilisationnel
        // (Zoulous guerriers/Impi — le bonus d'ère est actif dès le départ).
        mp: stats.movement + civUnitStatBonusOf({ civId, era: 'ancienne' }, 'unitMovement', effectiveType),
        veteran: veterans.has(spec.type) || veterans.has(effectiveType), // 7n · R-149 (Allemagne Guerriers vétérans)
        isArmy: false,
        order: null,
        detainedBy: null,
        fortified: false,
        aboard: null, // 7g · R-117
        cargo: null,
      };
    }
  }

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    turn: 0,
    phase: 'orders',
    rngSeed,
    lastEventSeq: 0,
    winner: null,
    mapWidth: map.data.width,
    mapHeight: map.data.height,
    map: mapRecord,
    players,
    units,
    cities,
    settings: { turnTimerMinutes: null },
    diplomacy: { war: [[map.spawns[0]!.id, map.spawns[1]!.id]] },
    // Villages/huttes réellement posés par applyMapEntities ci-dessous (R-96/R-98).
    villages: [],
    huts: [],
    // 7o · R-151 : artefacts tirés ci-dessous (création de carte).
    artefacts: [],
    pendingArtefactChoices: [],
    mapId: map.data.id,
    firstBy: {}, // 7e : Premier découvrir (aucun au départ)
  };

  // 7o · R-151/R-152 : tirage et placement des artefacts (déterministe — même
  // seed → mêmes artefacts, cartes procédurales ET préfabriquées). Une carte
  // procédurale porte déjà sa liste (posée à la génération, même seed) : elle
  // fait foi ; les cartes préfabriquées sont tirées ici.
  const artefacts: Artefact[] =
    map.artefacts.length > 0
      ? [...map.artefacts].sort((a, b) => a.q - b.q || a.r - b.r).map((a, i) => ({ id: `a${i + 1}`, artefactId: a.artefactId, q: a.q, r: a.r }))
      : artefactsForMap(map, rngSeed);
  state.artefacts = artefacts;

  // Vision initiale : rayon des unités (T-07, data-driven) + des villes (T-08).
  for (const spawn of map.spawns) {
    const visible = new Set<string>();
    for (const unit of Object.values(state.units)) {
      if (unit.owner !== spawn.id) continue;
      const radius = unitType(unit.type).visionRadius;
      for (const h of hexesWithinRadius(unit, radius)) visible.add(tileKeyOf(h));
    }
    for (const city of Object.values(state.cities)) {
      if (city.owner !== spawn.id) continue;
      for (const h of hexesWithinRadius(city, VISION_RADIUS_CITY)) visible.add(tileKeyOf(h));
    }
    state.players[spawn.id]!.vision = {
      explored: [...visible].sort(),
      visible: [...visible].sort(),
    };
  }

  // ---- 7n · R-150 : AVANTAGES DE DÉPART des civilisations (déterministes) --
  for (const spawn of map.spawns) {
    const setup = civSetup[spawn.id];
    const civId = setup?.civId ?? 'neutre';
    const civ = civDataOf(civId);
    if (!civ) continue;
    const player = state.players[spawn.id]!;
    // 1. Technologies gratuites (départ + ère Antique — Grèce Démocratie,
    //    Arabie Religion, Chine Écriture, Rome Code des lois…). Aucun
    //    événement ni `firstBy` (octroi direct, miroir Apollo R-132).
    for (const tech of civStartTechs(civId)) {
      if (!player.techsUnlocked.includes(tech)) player.techsUnlocked.push(tech);
    }
    player.techsUnlocked.sort();
    // 2. Gouvernement de départ (Rome République, Arabie Fondamentalisme) —
    //    sans Anarchie (setup, pas une transition).
    const gov = civStartGovernment(civId);
    if (gov) player.government = gov;
    // 3. Bâtiments gratuits dans la capitale (France Cathédrale, Grèce
    //    Tribunal) — posés directement, prérequis R-111 non exigés au setup.
    const capital = Object.values(state.cities).find((c) => c.owner === spawn.id && c.capital);
    if (capital) {
      for (const b of civStartBuildings(civId)) {
        if (!capital.buildings.includes(b)) capital.buildings.push(b);
      }
      capital.buildings.sort();
      // 4. Merveille Antique de l'Égypte (choix du joueur au setup 🔶 —
      //    validé par isEgyptWonderChoiceValid ; invalide = ignoré).
      if (setup?.wonderId && isEgyptWonderChoiceValid(civId, setup.wonderId)) {
        capital.wonders.push(setup.wonderId);
      }
    }
    // 5. Or de départ (Aztèques — 🔶 +25, params).
    player.treasury += civStartGold(civId);
    // 6. Personnage illustre gratuit (Amérique) — posé sur la capitale (sinon
    //    adjacente libre), classe déterministe R-127 (rotation index 0) 🔶.
    if (civStartsFreeGp(civId) && capital) {
      const gpType = greatPersonClassFor(player.researching, player.greatPersonsObtained);
      const stats = unitType(gpType);
      const anchor = { q: capital.q, r: capital.r };
      const occupied = Object.values(state.units).some((u) => u.q === anchor.q && u.r === anchor.r);
      const spot = !occupied ? anchor : hexesWithinRadius(anchor, 1).find((h) => {
        const t = mapRecord[tileKeyOf(h)];
        if (!t || !TERRAINS[t.terrain]!.passable) return false;
        return !Object.values(state.units).some((u) => u.q === h.q && u.r === h.r);
      });
      if (spot) {
        const gpId = `u${(Object.keys(state.units).length + 1)}`;
        state.units[gpId] = {
          id: gpId,
          type: gpType,
          owner: spawn.id,
          q: spot.q,
          r: spot.r,
          hp: stats.hpMax,
          mp: stats.movement,
          veteran: false,
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          aboard: null,
          cargo: null,
        };
      }
    }
    // 7. Révélation de carte (Russie) — rayon params autour du départ
    //    (capitale, sinon site du Colon) ajouté à `explored` (pas `visible`).
    const revealRadius = civStartRevealRadius({ civId, era: 'ancienne' });
    if (revealRadius > 0) {
      const anchor = capital ?? spawn.capital;
      const explored = new Set(player.vision.explored);
      for (const h of hexesWithinRadius(anchor, revealRadius)) {
        if (mapRecord[tileKeyOf(h)]) explored.add(tileKeyOf(h));
      }
      player.vision.explored = [...explored].sort();
    }
    // 8. Ère de départ (compage T-36) — les techs gratuites comptent (canon).
    player.era = eraOfTechCount(player.techsUnlocked.length);
  }

  // R-96/R-98 : villages barbares et huttes portés de la carte vers l'état
  // (ids affectés par (q, r) croissant — déterminisme R-81 ; compteurs à zéro).
  return applyMapEntities(state, map);
}

/**
 * R-96/R-98 · Porte les villages et huttes d'une carte validée dans l'état,
 * compteurs à zéro, et mémorise l'`mapId`. Utilisé par `createInitialState`
 * ET par le serveur pour ENRICHIR les états v7 migrés (la migration moteur ne
 * connaît pas la carte — le serveur, lui, a `meta.settings.mapId`).
 * Pure : retourne un nouvel état, l'entrée n'est pas mutée.
 */
export function applyMapEntities(state: GameState, map: LoadedMap): GameState {
  const villages: BarbarianVillage[] = [...map.villages]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((v, i) => ({
      id: `v${i + 1}`,
      q: v.q,
      r: v.r,
      hp: BARBARIANS.villageHP,
      spawnCountdown: BARBARIANS.spawnInterval,
      spawnedUnits: [],
    }));
  const huts: Hut[] = [...map.huts]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((h, i) => ({ id: `h${i + 1}`, q: h.q, r: h.r }));
  return { ...state, mapId: map.data.id, villages, huts };
}
