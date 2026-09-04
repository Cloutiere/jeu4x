/**
 * 7o · Artefacts (reliques) — RULES.md §7.10 (R-151..R-156).
 *
 * Base documentaire : la spécification d'Erik « Artefacts Dans Civilization
 * Revolution.md » — elle fait foi. Les artefacts sont la dernière entité de
 * carte manquante : tirage seedé sans remise à la création de carte (R-151),
 * placement insulaire + Atlantide en haute mer (R-152), activation au pas de
 * mouvement (miroir huttes R-98 — R-153), six effets data-driven (R-154),
 * détection canon (survol / indice de hutte / Vol Spatial — R-155).
 *
 * Fonctions PURES et déterministes (R-80/R-81/R-82) : aucun Math.random(),
 * tris explicites partout. Le tirage de génération utilise un RNG DÉDIÉ dérivé
 * du seed de partie (même seed → même carte et mêmes artefacts, rejouable) et
 * ne consomme JAMAIS le RNG de résolution.
 */
import { hexDistance, inRectangle, neighbors, tileKeyOf } from './hex.js';
import type { Hex } from './hex.js';
import { ARTEFACTS, TERRAINS, artefact, unitType } from './data.js';
import type { ArtefactData, TechEra } from './types.js';
import { allKnownTechs, compareIds, isBarbarian, nextId } from './state.js';
import type { Artefact, GameState, PlayerId } from './state.js';
import type { GameEvent } from './events.js';
import { createRng } from './rng.js';
import type { SeededRng } from './rng.js';
import type { LoadedMap, MapPlayerSpawn } from './map.js';
import type { MapArtefact } from './map.js';
import { TECHS, WONDERS, isUnitObsolete } from './techs.js';
import { greatPersonClassFor } from './culture.js';
import { civHutGoldMultOf, civVeteranUnitsOf, uniqueReplacing } from './civilizations.js';
import { freeSpawnTiles } from './barbares.js';

/** Omit distributif (miroir turn.ts) : préserve l'union typée des événements. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Graine dédiée du tirage d'artefacts (XOR avec le seed de partie) — le
 *  tirage est indépendant du RNG de résolution (R-80, R-151). */
const ARTEFACT_SEED_SALT = 0x5f3759df;

/** Entrée minimale pour le tirage (une LoadedMap adaptée la satisfait ; progen
 *  construit la même forme depuis sa grille). */
export interface ArtefactMapInput {
  terrain: Record<string, string>;
  width: number;
  height: number;
  spawns: MapPlayerSpawn[];
  villages: Array<{ q: number; r: number }>;
  huts: Array<{ q: number; r: number }>;
}

/** 7o · R-154 · Merveilles NON choisibles via Angkor Wat 🔶 : leurs verrous
 *  dynamiques (jalons R-116, trésorerie R-137, unicité stratégique R-138)
 *  seraient contournés par un octroi gratuit. Liste fermée documentée. */
const WONDERS_NOT_GRANTABLE = new Set(['nations_unies', 'banque_mondiale', 'projet_manhattan']);

// ---------------------------------------------------------------------------
// R-151/R-152 · Tirage sans remise + placement (îles / Atlantide haute mer)
// ---------------------------------------------------------------------------

interface LandComponentInfo {
  size: number;
}

/** Composantes connexes de terre (BFS sur cases passables) — clé → taille. */
function landComponents(terrain: Record<string, string>, width: number, height: number): Map<string, LandComponentInfo> {
  const compKey = new Map<string, number>();
  const components: Array<{ keys: string[] }> = [];
  for (const key of Object.keys(terrain).sort()) {
    if (compKey.has(key)) continue;
    const t = TERRAINS[terrain[key] ?? 'eau'];
    if (!t || !t.passable) continue;
    const comp = components.length;
    const keys: string[] = [];
    compKey.set(key, comp);
    const queue = [key];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      keys.push(cur);
      const [q, r] = cur.split(',').map(Number) as [number, number];
      for (const n of neighbors({ q: q!, r: r! })) {
        if (!inRectangle(n, width, height)) continue;
        const nk = tileKeyOf(n);
        if (compKey.has(nk)) continue;
        const nt = TERRAINS[terrain[nk] ?? 'eau'];
        if (!nt || !nt.passable) continue;
        compKey.set(nk, comp);
        queue.push(nk);
      }
    }
    components.push({ keys });
  }
  const out = new Map<string, LandComponentInfo>();
  for (const comp of components) {
    for (const key of comp.keys) out.set(key, { size: comp.keys.length });
  }
  return out;
}

/** Distance de chaque case à la terre la plus proche (0 pour la terre ;
 *  BFS multi-sources — une case d'eau côtière vaut 1). */
function distanceToLand(terrain: Record<string, string>, width: number, height: number): Map<string, number> {
  const dist = new Map<string, number>();
  let current: string[] = [];
  for (const key of Object.keys(terrain).sort()) {
    const t = TERRAINS[terrain[key] ?? 'eau'];
    if (t && t.passable) {
      dist.set(key, 0);
      current.push(key);
    }
  }
  let d = 0;
  while (current.length > 0) {
    const next: string[] = [];
    for (const key of current) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      for (const n of neighbors({ q: q!, r: r! })) {
        if (!inRectangle(n, width, height)) continue;
        const nk = tileKeyOf(n);
        if (dist.has(nk)) continue;
        dist.set(nk, d + 1);
        next.push(nk);
      }
    }
    current = next;
    d += 1;
  }
  return dist;
}

/**
 * R-151/R-152 · Tirage et placement des artefacts d'une carte. PUR et
 * DÉTERMINISTE (R-80) : même carte + même seed → même résultat. Le tirage est
 * sans remise (chaque artefact au plus une fois) ; l'Atlantide fait partie du
 * tirage 🔶 (défaut : toujours) ; le placement privilégie les îles isolées /
 * atolls, l'Atlantide en océan profond (R-152).
 */
export function drawArtefacts(map: ArtefactMapInput, seed: number): MapArtefact[] {
  const p = ARTEFACTS.params;
  const rng = createRng((seed ^ ARTEFACT_SEED_SALT) >>> 0);
  const capitals = map.spawns.map((s) => s.capital);

  // Cases interdites (au plus une entité par case — R-152).
  const occupied = new Set<string>(capitals.map(tileKeyOf));
  for (const v of map.villages) occupied.add(tileKeyOf(v));
  for (const h of map.huts) occupied.add(tileKeyOf(h));

  const minDistToCapitals = (h: Hex): number =>
    capitals.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...capitals.map((c) => hexDistance(c, h)));

  // ---- Tirage (R-151) -----------------------------------------------------
  const poolIds = Object.keys(ARTEFACTS.pool)
    .filter((id) => !ARTEFACTS.pool[id]!.dlcOnly)
    .sort();
  const count = Math.min(p.countMax, Math.max(p.countMin, p.count));
  const others = poolIds.filter((id) => id !== 'atlantide');
  // Mélange de Fisher-Yates seedé — l'ordre du tirage détermine l'ordre de
  // prise des cases (R-80 : tout aléa passe par le RNG seedé).
  const shuffled = [...others];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  const atlantisIn = poolIds.includes('atlantide') && p.atlantisAlwaysDrawn;
  const drawn: string[] = atlantisIn ? ['atlantide', ...shuffled.slice(0, Math.max(0, count - 1))] : shuffled.slice(0, count);

  // ---- Candidats (R-152) --------------------------------------------------
  const landComp = landComponents(map.terrain, map.width, map.height);
  const landDist = distanceToLand(map.terrain, map.width, map.height);
  const passableLand = (key: string): boolean => {
    const t = TERRAINS[map.terrain[key] ?? 'eau'];
    return !!t && t.passable;
  };

  // Îles / atolls : composantes de taille ≤ islandMaxSize ; continent : le
  // reste. Jamais sur une case interdite (capitale, village, hutte).
  const islandSlots: Hex[] = [];
  const mainlandSlots: Hex[] = [];
  for (const key of Object.keys(map.terrain).sort()) {
    if (!passableLand(key) || occupied.has(key)) continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    const hex = { q: q!, r: r! };
    const comp = landComp.get(key);
    if (comp && comp.size <= p.islandMaxSize) {
      // R-152 : les îles candidates sont ÉLOIGNÉES des deux départs.
      if (minDistToCapitals(hex) >= p.minDistanceToCapitals) islandSlots.push(hex);
    } else mainlandSlots.push(hex);
  }
  // Classement par ÉQUIDISTANCE (min-distance aux deux départs, décroissante)
  // puis (q, r) — R-81. Interprétation 🔶 (R-152) : l'équité du miroir 6b
  // porte sur le CHOIX des cases (aucun déséquilibre structurel entre les
  // joueurs), les artefacts restant uniques et disputés (deux Atlantides
  // violeraient l'unicité R-151).
  const byEquidistance = (a: Hex, b: Hex): number => {
    const da = minDistToCapitals(a);
    const db = minDistToCapitals(b);
    if (da !== db) return db - da; // le plus éloigné des deux départs d'abord
    return a.q - b.q || a.r - b.r;
  };
  islandSlots.sort(byEquidistance);
  mainlandSlots.sort(byEquidistance);

  // Atlantide : océan profond (distance à toute terre ≥ atlantisMinLandDistance).
  const atlantisSlots: Hex[] = [];
  for (const key of Object.keys(map.terrain).sort()) {
    if (map.terrain[key] !== 'ocean' || occupied.has(key)) continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    const hex = { q: q!, r: r! };
    if ((landDist.get(key) ?? 0) < p.atlantisMinLandDistance) continue;
    atlantisSlots.push(hex);
  }
  atlantisSlots.sort(byEquidistance);
  // Repli 🔶 (carte sans océan profond) : la case d'eau la plus éloignée de
  // la terre, puis des départs. Aucune eau du tout : l'Atlantide n'est pas
  // posée (le canon « presque systématiquement » est alors inapplicable).
  if (atlantisSlots.length === 0) {
    const anyWater: Hex[] = [];
    for (const key of Object.keys(map.terrain).sort()) {
      const t = map.terrain[key];
      if (t !== 'ocean' && t !== 'eau') continue;
      if (occupied.has(key)) continue;
      const [q, r] = key.split(',').map(Number) as [number, number];
      anyWater.push({ q: q!, r: r! });
    }
    anyWater.sort((a, b) => {
      const la = landDist.get(tileKeyOf(a)) ?? 0;
      const lb = landDist.get(tileKeyOf(b)) ?? 0;
      if (la !== lb) return lb - la;
      return byEquidistance(a, b);
    });
    atlantisSlots.push(...anyWater);
  }

  // ---- Pose (R-152) -------------------------------------------------------
  const placed: MapArtefact[] = [];
  const farEnough = (h: Hex): boolean => placed.every((a) => hexDistance(a, h) >= p.spacing);
  const takeSlot = (slots: Hex[]): Hex | null => {
    const spaced = slots.filter(farEnough);
    return (spaced[0] ?? slots[0]) ?? null;
  };
  const takeFrom = (slots: Hex[], slot: Hex): void => {
    const idx = slots.findIndex((h) => h.q === slot.q && h.r === slot.r);
    if (idx >= 0) slots.splice(idx, 1);
  };

  for (const id of drawn) {
    const data = ARTEFACTS.pool[id]!;
    if (data.activation === 'oceanAdjacent') {
      // Atlantide : sa propre liste (haute mer — R-152).
      const slot = atlantisSlots.shift();
      if (slot) placed.push({ artefactId: id, q: slot.q, r: slot.r });
      continue;
    }
    // Terrestre : îles d'abord ; continent en dernier recours (rare — canon),
    // au plus maxMainland SAUF si le nombre minimal canon l'exige (countMin
    // prime : 3–6 artefacts par carte est un critère d'acceptation).
    let slot = takeSlot(islandSlots);
    if (slot) {
      takeFrom(islandSlots, slot);
    } else {
      const mainlandPlaced = placed.filter((a) => passableLand(tileKeyOf(a))).length;
      const mustReachMinimum = placed.length + islandSlots.length < p.countMin;
      if (mainlandPlaced < p.maxMainland || mustReachMinimum) {
        slot = takeSlot(mainlandSlots);
        if (slot) takeFrom(mainlandSlots, slot);
      }
    }
    if (slot) placed.push({ artefactId: id, q: slot.q, r: slot.r });
    // Aucune case du tout : artefact non posé (documenté R-152 — rare).
  }

  return placed.sort((a, b) => a.q - b.q || a.r - b.r);
}

// ---------------------------------------------------------------------------
// R-153/R-154 · Activation (Phase A — miroir huttes R-98)
// ---------------------------------------------------------------------------

/** Contexte d'activation fourni par le moteur (turn.ts) — l'émission des
 *  événements (seq, R-73) et l'attribution d'ids restent de sa responsabilité. */
export interface ArtefactActivationContext {
  /** État de TRAVAIL de la résolution (copie mutable — jamais l'état diffusé). */
  st: GameState;
  emit(event: DistributiveOmit<GameEvent, 'seq'>): void;
  /** Case adjacente libre pour un engendrement (tri R-81, artefacts exclus). */
  freeSpawnTile(center: Hex): Hex | null;
  /** Une unité occupe-t-elle la case ? */
  occupiedByUnit(hex: Hex): boolean;
}

/** Payload de `ArtifactActivated` sans seq (l'appelant séquence). */
export type ArtifactActivatedPayload = DistributiveOmit<Extract<GameEvent, { type: 'ArtifactActivated' }>, 'seq'>;

/**
 * R-153 · Activation au pas de mouvement. À appeler après CHAQUE pas exécuté
 * (miroir openHutAt) : entrée sur la case pour un artefact terrestre ;
 * Atlantide — unité navale à distance ≤ 1 (entrée de la case comprise). Les
 * barbares n'activent pas (R-95). Un artefact n'est activé qu'une fois (retiré
 * de l'état avant l'application de l'effet).
 */
export function activateArtefactAt(
  ctx: ArtefactActivationContext,
  unit: { id: string; owner: PlayerId; type: string; q: number; r: number },
  hex: Hex,
): void {
  if (isBarbarian(unit.owner)) return; // R-95 transposé
  const st = ctx.st;
  const here = st.artefacts.find((a) => a.q === hex.q && a.r === hex.r);
  if (here) {
    applyActivation(ctx, here, unit);
    return;
  }
  // Atlantide : une unité NAVALE adjacente suffit (aucun débarquement — R-153).
  if (!unitType(unit.type).aquatic) return;
  const pos = { q: unit.q, r: unit.r };
  const adjacent = st.artefacts
    .filter((a) => artefact(a.artefactId).activation === 'oceanAdjacent' && hexDistance(a, pos) <= 1)
    .sort((a, b) => a.q - b.q || a.r - b.r)[0];
  if (adjacent) applyActivation(ctx, adjacent, unit);
}

function firstCityAnchorOf(st: GameState, owner: PlayerId): { hex: Hex; cityId: string } | null {
  // Capitale d'abord, puis cités par id croissant (R-81) — case de ville libre
  // (R-30 : au plus une entité de défense) sinon première adjacente libre.
  const cities = Object.values(st.cities)
    .filter((c) => c.owner === owner)
    .sort((a, b) => (a.capital === b.capital ? compareIds(a.id, b.id) : a.capital ? -1 : 1));
  for (const c of cities) {
    const hex = { q: c.q, r: c.r };
    if (!isUnitOnTile(st, hex)) return { hex, cityId: c.id };
    const tile = freeSpawnTiles(st, hex, 1)[0];
    if (tile) return { hex: tile, cityId: c.id };
  }
  return null;
}

function isUnitOnTile(st: GameState, hex: Hex): boolean {
  return Object.values(st.units).some((u) => u.q === hex.q && u.r === hex.r && !u.aboard);
}

/** R-154 · Application de l'effet de l'artefact. Aucun RNG : tous les effets
 *  sont déterministes. L'artefact est retiré de l'état ici (R-153). */
function applyActivation(ctx: ArtefactActivationContext, entity: Artefact, unit: { id: string; owner: PlayerId }): void {
  const st = ctx.st;
  st.artefacts = st.artefacts.filter((a) => a.id !== entity.id);
  const player = st.players[unit.owner]!;
  const data = artefact(entity.artefactId);
  const at: Hex = { q: entity.q, r: entity.r };
  const payload: ArtifactActivatedPayload = {
    type: 'ArtifactActivated',
    artefactId: entity.id,
    artefact: entity.artefactId,
    name: data.name,
    effect: data.effect,
    byPlayer: unit.owner,
    byUnitId: unit.id,
    at,
  };

  switch (data.effect) {
    case 'merveilleGratuiteAuChoix': {
      // Angkor Wat : le choix (merveille + ville) est une ACTION IMMÉDIATE du
      // serveur (`ChooseWonder`) — le droit est mis en attente (R-154).
      st.pendingArtefactChoices = [...st.pendingArtefactChoices, { player: unit.owner, artefactId: entity.artefactId }];
      break;
    }
    case 'templesVersCathedrales': {
      // Arche d'Alliance : Temple gratuit partout, Temples → Cathédrales
      // (remplacement R-111). Une entrée de journal par ville touchée.
      for (const cityId of Object.keys(st.cities).sort()) {
        const c = st.cities[cityId]!;
        if (c.owner !== unit.owner) continue;
        if (c.buildings.includes('cathedrale')) continue;
        if (c.buildings.includes('temple')) {
          c.buildings = c.buildings.filter((b) => b !== 'temple');
          c.buildings.push('cathedrale');
          c.buildings.sort();
          ctx.emit({ type: 'BuildingCompleted', cityId: c.id, owner: c.owner, building: 'cathedrale', at: { q: c.q, r: c.r } });
        } else {
          c.buildings = [...c.buildings, 'temple'].sort();
          ctx.emit({ type: 'BuildingCompleted', cityId: c.id, owner: c.owner, building: 'temple', at: { q: c.q, r: c.r } });
        }
      }
      break;
    }
    case 'orParEre': {
      // Sept Cités d'Or : or selon l'Ère de l'EMPIRE (T-41) — ×2 Espagne
      // (`tresorsDouble`, hook R-146 — même multiplicateur que les huttes).
      const era: TechEra = player.era ?? 'ancienne';
      const base = ARTEFACTS.params.septCitesOrByEra[era] ?? ARTEFACTS.params.septCitesOrByEra['ancienne'] ?? 200;
      const amount = base * civHutGoldMultOf(player);
      player.treasury += amount;
      payload.gold = amount;
      break;
    }
    case 'personnagesGratuits': {
      // École de Confucius : 3 GP par ROTATION R-127 (indices successifs),
      // posés à la capitale (sinon première cité — case libre adjacente),
      // sans jalon (miroir C2) ; l'escalade T-27/T-30 s'applique.
      const ids: string[] = [];
      for (let i = 0; i < ARTEFACTS.params.confuciusGpCount; i++) {
        const cls = greatPersonClassFor(null, player.greatPersonsObtained);
        const anchor = firstCityAnchorOf(st, unit.owner);
        if (!anchor) break; // aucune case : GP perdu (miroir R-114 🔶)
        const stats = unitType(cls);
        const unitId = nextId(st.units, 'u');
        st.units[unitId] = {
          id: unitId,
          type: cls,
          owner: unit.owner,
          q: anchor.hex.q,
          r: anchor.hex.r,
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
        player.greatPersonsByType = { ...player.greatPersonsByType, [cls]: (player.greatPersonsByType[cls] ?? 0) + 1 };
        player.greatPersonsObtained += 1;
        ids.push(unitId);
        ctx.emit({ type: 'GreatPersonSpawned', unitId, unitType: cls, cityId: anchor.cityId, owner: unit.owner, at: anchor.hex });
      }
      payload.unitIds = ids;
      break;
    }
    case 'uniteMilitaireParEre': {
      // Chevaliers Templiers : unité selon l'Ère (T-42), remplacement par
      // l'unique de la civ (R-148), posée sur la case de l'artefact (occupée
      // par l'activateur → première adjacente libre — perdu si aucune).
      const era: TechEra = player.era ?? 'ancienne';
      const baseType =
        ARTEFACTS.params.templiersUnitByEra[era] ?? ARTEFACTS.params.templiersUnitByEra['ancienne'] ?? 'chevalier';
      const effectiveType = uniqueReplacing(player.civId, baseType, player.techsUnlocked) ?? baseType;
      const stats = unitType(effectiveType);
      const anchor = !isUnitOnTile(st, at) ? at : (ctx.freeSpawnTile(at) ?? null);
      if (anchor) {
        const unitId = nextId(st.units, 'u');
        st.units[unitId] = {
          id: unitId,
          type: effectiveType,
          owner: unit.owner,
          q: anchor.q,
          r: anchor.r,
          hp: stats.hpMax,
          mp: stats.movement,
          veteran: civVeteranUnitsOf(player).has(baseType) || civVeteranUnitsOf(player).has(effectiveType),
          isArmy: false,
          order: null,
          detainedBy: null,
          fortified: false,
          aboard: null,
          cargo: null,
        };
        payload.unitIds = [unitId];
        payload.unitType = effectiveType;
      }
      break;
    }
    case 'troisTechsLesMoinsCheres': {
      // Atlantide : les 3 technologies les moins coûteuses NON débloquées —
      // octroi direct (ni firstBy ni Premier découvrir), tri coût puis id
      // (R-81). La « manipulation » du doc (chercher les techs bon marché
      // avant d'approcher l'artefact) est un comportement canon préservé.
      const techs = Object.values(TECHS)
        .filter((t) => !player.techsUnlocked.includes(t.id))
        .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, ARTEFACTS.params.atlantideTechCount);
      const granted: string[] = [];
      for (const t of techs) {
        if (!player.techsUnlocked.includes(t.id)) player.techsUnlocked.push(t.id);
        if (player.researching === t.id) {
          // La tech en cours fait partie du pool : sa complétion libère le
          // choix de recherche (aucun surplus — octroi direct, documenté).
          player.researching = null;
          delete player.scienceProgress[t.id];
        }
        player.techsUnlockedThisTurn = [...(player.techsUnlockedThisTurn ?? []), t.id];
        granted.push(t.id);
        ctx.emit({ type: 'TechResearched', player: unit.owner, tech: t.id });
      }
      player.techsUnlocked.sort();
      payload.techs = granted;
      break;
    }
    case 'dlc':
      // Inatteignable : les DLC ne sont jamais générés (R-151).
      break;
  }

  ctx.emit(payload);
}

// ---------------------------------------------------------------------------
// R-154 · Angkor Wat — action immédiate ChooseWonder (miroir SetGovernment)
// ---------------------------------------------------------------------------

/** Merveilles choixables via Angkor (UI + validation — R-154) : non construites
 *  n'importe où, non obsolètes (R-128, union des techs), implémentées, hors
 *  victoire/stratégique 🔶. Tri par id (R-81). */
export function angkorEligibleWonders(state: GameState): string[] {
  const known = allKnownTechs(state);
  const built = new Set<string>();
  for (const c of Object.values(state.cities)) for (const w of c.wonders) built.add(w);
  return Object.keys(WONDERS)
    .filter((id) => {
      const w = WONDERS[id]!;
      if (w.implemented === false) return false;
      if (WONDERS_NOT_GRANTABLE.has(id)) return false;
      if (built.has(id)) return false;
      if (w.obsoleteBy && known.includes(w.obsoleteBy)) return false;
      return true;
    })
    .sort();
}

export type AngkorChoiceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: string };

/**
 * R-154 · Choix Angkor Wat (action IMMÉDIATE du serveur, hors ordres de tour —
 * miroir applySetResearch/applySetGovernment). Pose la merveille choisie dans
 * la ville amie désignée avec la complétion canonique (jalon R-131, effets de
 * complétion R-132 — Jardins compris) ; les chantiers concurrents du même
 * édifice basculent en récupération R-130. Pure : l'état d'entrée n'est pas
 * muté.
 */
export function applyAngkorChoice(input: GameState, playerId: PlayerId, cityId: string, wonderId: string): AngkorChoiceResult {
  const st: GameState = structuredClone(input);
  const player = st.players[playerId];
  if (!player) return { ok: false, reason: `joueur inconnu : ${playerId}` };
  const pendingIdx = st.pendingArtefactChoices.findIndex((c) => c.player === playerId);
  if (pendingIdx === -1) return { ok: false, reason: 'aucune merveille gratuite en attente (Angkor Wat)' };
  const city = st.cities[cityId];
  if (!city || city.owner !== playerId) return { ok: false, reason: 'ville inconnue ou non possédée' };
  const issue = wonderGrantIssue(st, wonderId);
  if (issue) return { ok: false, reason: issue };

  st.pendingArtefactChoices.splice(pendingIdx, 1);
  const events: GameEvent[] = [];
  let seq = st.lastEventSeq;
  const emit = (e: DistributiveOmit<GameEvent, 'seq'>) => {
    seq += 1;
    events.push({ ...e, seq } as GameEvent);
  };
  grantWonderInCity(st, cityId, wonderId, emit);
  st.lastEventSeq = seq;
  return { ok: true, state: st, events };
}

/** Raison de refus d'une merveille pour l'octroi Angkor (null = OK). */
export function wonderGrantIssue(state: GameState, wonderId: string): string | null {
  const w = WONDERS[wonderId];
  if (!w) return 'merveille inconnue';
  if (w.implemented === false) return 'merveille non implémentée';
  if (WONDERS_NOT_GRANTABLE.has(wonderId)) return 'merveille non choisible (victoire/stratégique)';
  if (Object.values(state.cities).some((c) => c.wonders.includes(wonderId))) return 'merveille déjà construite quelque part (R-129)';
  if (w.obsoleteBy && allKnownTechs(state).includes(w.obsoleteBy)) return 'merveille obsolète (R-128)';
  return null;
}

/**
 * Complétion canonique d'une merveille HORS résolution (miroir completeWonder
 * de turn.ts, sur état cloné) : unicité mondiale re-vérifiée, jalon R-131,
 * effets de complétion R-132 (Jardins, Oxford seedé sur rngSeed, Apollo,
 * Léonard), chantiers concurrents → récupération R-130. Les merveilles à
 * victoire sont exclues de la liste Angkor — aucune voie de victoire ici.
 */
function grantWonderInCity(
  st: GameState,
  cityId: string,
  wonderId: string,
  emit: (e: DistributiveOmit<GameEvent, 'seq'>) => void,
): void {
  const city = st.cities[cityId]!;
  const player = st.players[city.owner]!;
  const wonderData = WONDERS[wonderId]!;
  if (!wonderData || Object.values(st.cities).some((c) => c.wonders.includes(wonderId))) return; // no-op R-129

  city.wonders.push(wonderId);
  player.cultureMilestones += 1; // R-131 : merveille = 1 jalon
  emit({ type: 'WonderCompleted', cityId: city.id, owner: city.owner, wonder: wonderId, at: { q: city.q, r: city.r } });
  emit({ type: 'CultureMilestone', player: city.owner, delta: 1, total: player.cultureMilestones, reason: 'wonderBuilt' });

  // R-130 : les chantiers concurrents du même édifice basculent en réserve.
  for (const otherId of Object.keys(st.cities).sort()) {
    const other = st.cities[otherId]!;
    if (other.production?.item.kind !== 'wonder' || other.production.item.id !== wonderId) continue;
    const lost = other.production.progress;
    other.production = null;
    if (lost > 0) {
      other.pendingSalvage += lost;
      emit({ type: 'HammerSalvage', cityId: other.id, owner: other.owner, wonder: wonderId, amount: lost, outcome: 'available' });
    }
  }

  // R-116 · Jardins suspendus : +50 % de population immédiat (arrondi au plus
  // proche) — citoyens remplis en append-only (miroir recherche.ts).
  if (wonderData.populationGainPct) {
    const gain = Math.round(city.pop * wonderData.populationGainPct);
    if (gain > 0) {
      city.pop += gain;
      appendFillWorkedTiles(st, city.id);
      emit({ type: 'PopulationGrew', cityId: city.id, owner: city.owner, pop: city.pop, at: { q: city.q, r: city.r } });
    }
  }

  // R-132 · Oxford : une technologie aléatoire — RNG DÉDIÉ dérivé de rngSeed
  // (lecture seule : la graine de résolution n'est PAS consommée, R-80).
  if (wonderData.randomTechOnComplete) {
    const rng = createRng(st.rngSeed ^ ARTEFACT_SEED_SALT);
    const candidates = Object.values(TECHS)
      .filter((t) => !player.techsUnlocked.includes(t.id))
      .map((t) => t.id)
      .sort();
    const pick = candidates[rng.nextInt(candidates.length)];
    if (pick) grantTechPure(st, city.owner, pick, emit);
  }
  // R-132 · Apollo : l'ensemble de l'arbre (octroi direct — événements
  // TechResearched conservés, miroir C12).
  if (wonderData.allTechsOnComplete) {
    for (const id of Object.keys(TECHS).sort()) grantTechPure(st, city.owner, id, emit);
  }
  // R-132 · Léonard : mise à niveau des unités obsolètes (chaîne upgradeTo).
  if (wonderData.upgradeObsoleteUnits) {
    const upgrades: Array<{ unitId: string; from: string; to: string }> = [];
    for (const id of Object.keys(st.units).sort(compareIds)) {
      const u = st.units[id]!;
      if (u.owner !== city.owner) continue;
      let type = u.type;
      let changed = false;
      while (isUnitObsolete(type, player.techsUnlocked)) {
        const next = unitType(type).upgradeTo;
        if (!next) break;
        type = next;
        changed = true;
      }
      if (changed) {
        upgrades.push({ unitId: id, from: u.type, to: type });
        u.type = type;
      }
    }
    if (upgrades.length > 0) emit({ type: 'UnitsUpgraded', player: city.owner, upgrades });
  }
}

function grantTechPure(st: GameState, playerId: PlayerId, techId: string, emit: (e: DistributiveOmit<GameEvent, 'seq'>) => void): void {
  const player = st.players[playerId]!;
  if (player.techsUnlocked.includes(techId)) return;
  player.techsUnlocked.push(techId);
  player.techsUnlocked.sort();
  player.techsUnlockedThisTurn = [...(player.techsUnlockedThisTurn ?? []), techId];
  emit({ type: 'TechResearched', player: playerId, tech: techId });
}

/** Remplissage append-only des citoyens (miroir recherche.ts
 *  appendFillWorkedTiles — action immédiate, hors Board de résolution). */
function appendFillWorkedTiles(st: GameState, cityId: string): void {
  const city = st.cities[cityId];
  if (!city) return;
  const radius = 1 + (city.buildings.includes('tribunal') ? 1 : 0);
  const cityHex = { q: city.q, r: city.r };
  const taken = new Set<string>();
  for (const c of Object.values(st.cities)) {
    for (const key of c.workedTiles) taken.add(key);
    taken.add(`${c.q},${c.r}`);
  }
  const candidates: Array<{ key: string; f: number; p: number; c: number }> = [];
  for (const h of hexesWithinRadiusLocal(cityHex, radius)) {
    const key = tileKeyOf(h);
    if (hexDistance(cityHex, h) < 1) continue;
    const tile = st.map[key];
    if (!tile || !TERRAINS[tile.terrain]!.passable) continue;
    if (taken.has(key) || city.workedTiles.includes(key)) continue;
    const y = TERRAINS[tile.terrain]!.yields;
    candidates.push({ key, f: y?.food ?? 0, p: y?.production ?? 0, c: y?.commerce ?? 0 });
  }
  candidates.sort((a, b) => b.f - a.f || b.p - a.p || b.c - a.c || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const c of candidates) {
    if (city.workedTiles.length >= city.pop) break;
    city.workedTiles.push(c.key);
    taken.add(c.key);
  }
}

/** Cases dans un rayon hexagonal (miroir local de hexesWithinRadius, hex.ts). */
function hexesWithinRadiusLocal(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R-155 · Détection — indice de hutte & Vol Spatial
// ---------------------------------------------------------------------------

/**
 * R-155 · Récompense de hutte `artefact_indice` : RNG 50/50 🔶 entre le
 * NOMBRE d'artefacts restants (sur la carte) et la POSITION d'un artefact (le
 * plus proche de la hutte, tie R-81) — la case est ajoutée à `explored`
 * (l'artefact devient visible comme tout artefact exploré). Mute l'état de
 * travail (hutte ouverte en Phase A). Sans artefact restant : l'indice se
 * réduit au nombre (0).
 */
export function applyArtefactIndiceReward(
  st: GameState,
  playerId: PlayerId,
  hut: Hex,
  rng: SeededRng,
): { remaining: number; position?: { q: number; r: number } } {
  const out: { remaining: number; position?: { q: number; r: number } } = { remaining: st.artefacts.length };
  if (rng.next() >= ARTEFACTS.params.indicePositionChance || st.artefacts.length === 0) return out;
  const sorted = [...st.artefacts].sort(
    (a, b) => hexDistance(a, hut) - hexDistance(b, hut) || a.q - b.q || a.r - b.r,
  );
  const target = sorted[0]!;
  out.position = { q: target.q, r: target.r };
  const player = st.players[playerId];
  if (player) {
    const explored = new Set(player.vision.explored);
    const key = tileKeyOf(target);
    if (st.map[key]) explored.add(key);
    player.vision = { explored: [...explored].sort(), visible: player.vision.visible };
  }
  return out;
}

/**
 * R-155 · Vol Spatial : la complétion de la technologie révèle la carte
 * ENTIÈRE au chercheur (miroir de la révélation Premier découvrir R-109) —
 * les artefacts restants deviennent visibles par le filtrage standard. Mute
 * l'état de travail (appelé par creditScience à la complétion).
 */
export function revealWholeMapOnTech(st: GameState, playerId: PlayerId, techId: string): void {
  if (techId !== ARTEFACTS.params.volSpatialTech) return;
  const player = st.players[playerId];
  if (!player) return;
  const explored = new Set([...player.vision.explored, ...Object.keys(st.map)]);
  player.vision = { explored: [...explored].sort(), visible: player.vision.visible };
}

// ---------------------------------------------------------------------------
// Aides d'intégration (création d'état, progen, dump admin)
// ---------------------------------------------------------------------------

/** R-151 · Liste des artefacts posés pour une carte + seed (création d'état,
 *  progen, dump admin). Ids 'a1'… affectés par (q, r) croissant (R-81). */
export function artefactsForMap(map: LoadedMap, seed: number): Artefact[] {
  return drawArtefacts(
    {
      terrain: map.terrain,
      width: map.data.width,
      height: map.data.height,
      spawns: map.spawns,
      villages: map.villages,
      huts: map.huts,
    },
    seed,
  ).map((a, i) => ({ id: `a${i + 1}`, artefactId: a.artefactId, q: a.q, r: a.r }));
}

/** Données d'un artefact du pool (libellés UI — null si id inconnu). */
export function artefactDataOf(artefactId: string): ArtefactData | null {
  return ARTEFACTS.pool[artefactId] ?? null;
}
