/**
 * Tests Phase 7o — Artefacts / reliques (RULES.md §7.10, R-151..R-156).
 *
 * Chaque test cite la règle R-xx ou la ligne du doc
 * [`Artefacts Dans Civilization Revolution.md`](../../Artefacts%20Dans%20Civilization%20Revolution.md)
 * (elle fait foi : tirage 3–6 sans remise, unicité, disparition définitive,
 * placement insulaire + Atlantide en haute mer à activation navale adjacente,
 * 6 effets du jeu de base, détection canon).
 */
import { describe, expect, it } from 'vitest';
import { makeState, pathBetween } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order } from '../src/state.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateState } from '../src/state.js';
import {
  ARTEFACTS,
  HUT_REWARDS,
  createRng,
} from '../src/index.js';
import {
  angkorEligibleWonders,
  applyAngkorChoice,
  applyArtefactIndiceReward,
  artefactDataOf,
  artefactsForMap,
  drawArtefacts,
  wonderGrantIssue,
} from '../src/artefacts.js';
import { createInitialState, loadBuiltinMapSync, parseMap } from '../src/map.js';
import type { MapData } from '../src/map.js';
import { generateProceduralMap } from '../src/progen/index.js';
import { creditScience } from '../src/research.js';
import { getFilteredState } from '../src/fog.js';
import { TECHS } from '../src/techs.js';
import { MapValidationError } from '../src/map.js';
import { hexDistance, tileKeyOf } from '../src/hex.js';

const SEED = 20260904;

function eventTypes(events: ReturnType<typeof resolveTurn>['events']): string[] {
  return events.map((e) => e.type);
}

// ---------------------------------------------------------------------------
// Données — intégrité R-156 (artefacts.json) + extension huttes R-155
// ---------------------------------------------------------------------------

describe('7o · R-156 · Données artefacts.json (doc fait foi)', () => {
  it('pool : 6 artefacts du jeu de base + 6 DLC (dlcOnly, jamais générés)', () => {
    const base = Object.values(ARTEFACTS.pool).filter((a) => !a.dlcOnly);
    const dlc = Object.values(ARTEFACTS.pool).filter((a) => a.dlcOnly);
    expect(base).toHaveLength(6);
    expect(dlc).toHaveLength(6);
    expect(base.map((a) => a.id).sort()).toEqual([
      'angkor_wat', 'arche_alliance', 'atlantide', 'chevaliers_templiers', 'ecole_confucius', 'sept_cites_or',
    ]);
    // Canon doc : Camelot, Sphinx, Aiguille, Terracotte, Tesla, Babel.
    expect(dlc.map((a) => a.id).sort()).toEqual([
      'aiguille_pharaon', 'armee_terracotte', 'cour_camelot', 'grand_sphinx', 'rayon_paix_tesla', 'tour_babel',
    ]);
  });

  it('effets fermés + activation : Atlantide = navale adjacente, les autres = entrée sur la case (R-153/R-154)', () => {
    const effects = ['merveilleGratuiteAuChoix', 'templesVersCathedrales', 'orParEre', 'personnagesGratuits', 'uniteMilitaireParEre', 'troisTechsLesMoinsCheres'];
    for (const a of Object.values(ARTEFACTS.pool)) {
      if (a.dlcOnly) {
        expect(a.effect).toBe('dlc');
        continue;
      }
      expect(effects, `${a.id} : effet inattendu`).toContain(a.effect);
    }
    expect(ARTEFACTS.pool['atlantide']!.activation).toBe('oceanAdjacent');
    for (const a of Object.values(ARTEFACTS.pool)) {
      if (a.id !== 'atlantide' && !a.dlcOnly) expect(a.activation).toBe('terre');
    }
  });

  it('T-38..T-43 : count 4 (canon 3–6), Atlantide toujours tirée, tables or/unités/GP/techs', () => {
    const p = ARTEFACTS.params;
    expect(p.count).toBe(4);
    expect(p.countMin).toBe(3);
    expect(p.countMax).toBe(6);
    expect(p.atlantisAlwaysDrawn).toBe(true);
    expect(p.septCitesOrByEra).toEqual({ ancienne: 200, medievale: 250, industrielle: 300, moderne: 400 });
    expect(p.templiersUnitByEra).toEqual({
      ancienne: 'chevalier', medievale: 'chevalier', industrielle: 'canon', moderne: 'char_d_assaut',
    });
    expect(p.confuciusGpCount).toBe(3);
    expect(p.atlantideTechCount).toBe(3);
    expect(p.volSpatialTech).toBe('vol_spatial');
  });

  it('R-155 : huttes.json porte la récompense artefact_indice (table fermée tenue à jour)', () => {
    const entry = HUT_REWARDS.rewards.find((r) => r.kind === 'artefact_indice');
    expect(entry).toBeDefined();
    expect(entry!.weight).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// R-151/R-152 · Tirage & placement
// ---------------------------------------------------------------------------

describe('7o · R-151 · Tirage sans remise, seedé, rejouable', () => {
  it('3–6 artefacts, Atlantide toujours tirée, aucun doublon (défaut 4)', () => {
    const map = loadBuiltinMapSync('variee-40');
    for (const seed of [1, 2, 42, 999, 123456]) {
      const drawn = artefactsForMap(map, seed);
      expect(drawn.length).toBeGreaterThanOrEqual(ARTEFACTS.params.countMin);
      expect(drawn.length).toBeLessThanOrEqual(ARTEFACTS.params.countMax);
      // Le défaut 🔶 est 4 ; une carte sans îles candidates peut retomber à 3
      // (cap continental maxMainland, R-152) — le canon « 3 à 6 » tient.
      const ids = drawn.map((a) => a.artefactId);
      expect(new Set(ids).size).toBe(ids.length); // tirage SANS remise
      expect(ids).toContain('atlantide'); // 🔶 toujours dans le tirage
      // ids 'a1'… affectés par (q, r) croissant (R-81)
      const sorted = [...drawn].sort((a, b) => a.q - b.q || a.r - b.r);
      expect(drawn.map((a) => a.id)).toEqual(sorted.map((_, i) => `a${i + 1}`));
    }
  });

  it('même seed → même tirage et même placement (rejouable R-80) ; un autre seed varie', () => {
    const map = loadBuiltinMapSync('variee-40');
    const a = artefactsForMap(map, 777);
    const b = artefactsForMap(map, 777);
    expect(a).toEqual(b);
    const others = [778, 779, 780].map((s) => JSON.stringify(artefactsForMap(map, s)));
    expect(others.some((x) => x !== JSON.stringify(a))).toBe(true);
  });

  it('les DLC ne sont jamais générés (R-151)', () => {
    const map = loadBuiltinMapSync('pangee-40');
    for (let seed = 0; seed < 8; seed++) {
      const drawn = artefactsForMap(map, seed);
      for (const a of drawn) {
        expect(ARTEFACTS.pool[a.artefactId]!.dlcOnly).toBe(false);
      }
    }
  });
});

describe('7o · R-152 · Placement insulaire + Atlantide en haute mer', () => {
  it('carte procédurale : Atlantide sur océan profond (≥ 2 de toute terre), artefacts éloignés des départs', () => {
    const { map, report } = generateProceduralMap(4242);
    expect(report.counts.artefacts).toBeGreaterThanOrEqual(ARTEFACTS.params.countMin);
    expect(report.counts.artefacts).toBeLessThanOrEqual(ARTEFACTS.params.countMax);
    // La carte porte sa liste (posée à la génération — R-152).
    expect(map.artefacts).toHaveLength(report.counts.artefacts);

    // Distance de chaque case à la terre : recalcul indépendant (BFS simple).
    const landDist = landDistance(map.terrain, map.data.width, map.data.height);
    for (const a of map.artefacts) {
      const data = artefactDataOf(a.artefactId)!;
      const key = tileKeyOf(a);
      if (data.activation === 'oceanAdjacent') {
        expect(map.terrain[key]).toBe('ocean');
        expect(landDist.get(key) ?? 0).toBeGreaterThanOrEqual(ARTEFACTS.params.atlantisMinLandDistance);
      } else {
        const t = map.terrain[key];
        expect(t).not.toBe('ocean');
        expect(t).not.toBe('eau');
      }
      for (const spawn of map.spawns) {
        expect(hexDistance(a, spawn.capital)).toBeGreaterThanOrEqual(ARTEFACTS.params.minDistanceToCapitals);
      }
      // Jamais sur une case de village/hutte (au plus une entité — parseMap).
      expect(map.villages.some((v) => v.q === a.q && v.r === a.r)).toBe(false);
      expect(map.huts.some((h) => h.q === a.q && h.r === a.r)).toBe(false);
    }
  });

  it('priorité aux îles isolées / atolls (composantes ≤ islandMaxSize) sur une carte archipel', () => {
    const { map } = generateProceduralMap(77);
    const comp = componentSizes(map.terrain, map.data.width, map.data.height);
    let islandArtifacts = 0;
    for (const a of map.artefacts) {
      const data = artefactDataOf(a.artefactId)!;
      if (data.activation === 'oceanAdjacent') continue;
      const size = comp.get(tileKeyOf(a)) ?? Number.MAX_SAFE_INTEGER;
      if (size <= ARTEFACTS.params.islandMaxSize) islandArtifacts += 1;
    }
    // Canon : le placement « privilégie très largement » les îles isolées —
    // sur archipel, les artefacts terrestres sont majoritairement insulaires
    // (continente possible mais rare, R-152).
    expect(islandArtifacts).toBeGreaterThanOrEqual(1);
  });

  it('carte préfabriquée : tirage par seed à la création (positions candidates dérivées du terrain commis — R-152)', () => {
    const map = loadBuiltinMapSync('pedagogique-40');
    const state = createInitialState(map, 31337);
    expect(state.artefacts.length).toBeGreaterThanOrEqual(3);
    for (const a of state.artefacts) {
      const key = tileKeyOf(a);
      expect(state.map[key]).toBeDefined();
      const data = artefactDataOf(a.artefactId)!;
      if (data.activation === 'oceanAdjacent') {
        expect(state.map[key]!.terrain).toBe('ocean');
      } else {
        expect(state.map[key]!.terrain).not.toMatch(/eau|ocean/);
      }
    }
    // Aucun artefact sur une capitale.
    for (const c of Object.values(state.cities)) {
      expect(state.artefacts.some((a) => a.q === c.q && a.r === c.r)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// parseMap — validations R-152 (artefacts)
// ---------------------------------------------------------------------------

describe('7o · parseMap · validations des artefacts portés par une carte', () => {
  // 20×3 : capitales (−1,2) et (16,2) — distance 17 ≥ 12 (MIN_SPAWN_DISTANCE).
  const base: MapData = {
    id: 't',
    name: 'Test',
    width: 20,
    height: 3,
    legend: { '.': 'prairie', '~': 'eau', O: 'ocean' },
    rows: ['~~~~~~OOOO~~~~~~~~~~', '....................', '....................'],
    players: [
      { id: 'p1', capital: { q: -1, r: 2 }, units: [{ type: 'guerrier', q: 0, r: 2 }] },
      { id: 'p2', capital: { q: 16, r: 2 }, units: [{ type: 'guerrier', q: 17, r: 2 }] },
    ],
  };
  const TERRE = { q: 5, r: 1 }; // col 5, rangée 1 — prairie
  const OCEAN = { q: 7, r: 0 }; // col 7, rangée 0 — océan
  const EAU = { q: 2, r: 0 }; // col 2, rangée 0 — côte

  it('artefact terrestre sur terre + Atlantide sur océan : valides (R-152)', () => {
    const ok = parseMap({ ...base, artefacts: [
      { artefactId: 'sept_cites_or', q: TERRE.q, r: TERRE.r },
      { artefactId: 'atlantide', q: OCEAN.q, r: OCEAN.r },
    ] });
    expect(ok.artefacts).toHaveLength(2);
  });

  it('id inconnu, DLC, Atlantide hors océan, terrestre sur l’eau, capitale : refus (R-152)', () => {
    expect(() => parseMap({ ...base, artefacts: [{ artefactId: 'inconnu', ...TERRE }] })).toThrow(MapValidationError);
    expect(() => parseMap({ ...base, artefacts: [{ artefactId: 'cour_camelot', ...TERRE }] })).toThrow(MapValidationError);
    expect(() => parseMap({ ...base, artefacts: [{ artefactId: 'atlantide', ...TERRE }] })).toThrow(MapValidationError);
    expect(() => parseMap({ ...base, artefacts: [{ artefactId: 'sept_cites_or', ...EAU }] })).toThrow(MapValidationError);
    expect(() => parseMap({ ...base, artefacts: [{ artefactId: 'sept_cites_or', q: -1, r: 2 }] })).toThrow(MapValidationError);
  });
});

// ---------------------------------------------------------------------------
// Migration 17 → 18 (R-156)
// ---------------------------------------------------------------------------

describe('7o · Migration v17 → v18 (R-156 — additive, idempotente)', () => {
  it('artefacts [] et pendingArtefactChoices [] ; idempotent ; CURRENT_SCHEMA_VERSION = 18', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(18);
    expect(MIGRATIONS[18]).toBeDefined();
    const v17 = {
      schemaVersion: 17,
      players: {
        p1: { techsUnlocked: ['alphabet'] },
        p2: { techsUnlocked: [] },
      },
    };
    const once = migrateState(v17);
    expect(once.schemaVersion).toBe(18);
    expect(once.artefacts).toEqual([]);
    expect(once.pendingArtefactChoices).toEqual([]);
    const twice = migrateState(once as unknown as Record<string, unknown>);
    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// R-153 · Activation (miroir huttes R-98) — entrée de case / Atlantide navale
// ---------------------------------------------------------------------------

describe('7o · R-153 · Activation au pas de mouvement', () => {
  function buildArtefactState(extra: Parameters<typeof makeState>[0] = {}): GameState {
    return makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      ...extra,
    });
  }

  it('entrée sur la case = activation : artefact retiré, événement, or versé (miroir R-98)', () => {
    const state = buildArtefactState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }], p2: [] };
    const { newState, events } = resolveTurn(state, orders, SEED);
    expect(newState.artefacts).toHaveLength(0); // disparition définitive (doc §unicité)
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated).toBeDefined();
    expect(activated && activated.type === 'ArtifactActivated' && activated.gold).toBe(200); // ère Antique (T-41)
    expect(newState.players['p1']!.treasury).toBe(200);
  });

  it('sans entrée : aucun effet ; une fois activé, plus rien à activer (unicité)', () => {
    const state = buildArtefactState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 3 }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 4 }] }], p2: [] };
    const { newState } = resolveTurn(state, orders, SEED);
    expect(newState.artefacts).toHaveLength(1); // intact
    expect(newState.players['p1']!.treasury).toBe(0);

    // Deuxième entrée après activation : aucun second événement.
    const second = buildArtefactState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 5 },
      ],
    });
    const orders2: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 5, r: 5 }] }], // R-42 : collision
    };
    const { newState: s2, events: e2 } = resolveTurn(second, orders2, SEED);
    expect(s2.artefacts).toHaveLength(0);
    expect(e2.filter((e) => e.type === 'ArtifactActivated')).toHaveLength(1);
  });

  it('Atlantide : une unité navale ADJACENTE suffit (aucun débarquement) — entrée comprise', () => {
    // L'Atlantide est sur un océan (7,5) ; un Galion navigue sur la côte (6,5) → (6,6) adjacente.
    const state = makeState({
      width: 12,
      height: 10,
      terrainOverrides: { '7,5': 'ocean', '6,5': 'eau', '6,6': 'eau' },
      artefacts: [{ artefactId: 'atlantide', q: 7, r: 5 }],
      units: [{ id: 'u1', type: 'galion', owner: 'p1', q: 6, r: 5 }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 6, r: 6 }] }], p2: [] };
    const { newState, events } = resolveTurn(state, orders, SEED);
    expect(newState.artefacts).toHaveLength(0);
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated' && activated.artefact).toBe('atlantide');
    // 3 techs les moins chères accordées (effet R-154).
    expect(activated && activated.type === 'ArtifactActivated' && activated.techs).toHaveLength(3);
  });

  it('Atlantide : entrer SUR la case océane déclenche aussi (distance 0 ≤ 1) ; une unité terrestre adjacente n’active PAS', () => {
    const state = makeState({
      width: 12,
      height: 10,
      terrainOverrides: { '7,5': 'ocean', '6,5': 'eau' },
      artefacts: [{ artefactId: 'atlantide', q: 7, r: 5 }],
      units: [{ id: 'u1', type: 'galion', owner: 'p1', q: 6, r: 5 }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 7, r: 5 }] }], p2: [] };
    const { newState } = resolveTurn(state, orders, SEED);
    expect(newState.artefacts).toHaveLength(0);

    // Guerrier terrestre SUR une case de terre adjacente (6,4) : pas d'activation.
    const land = makeState({
      width: 12,
      height: 10,
      terrainOverrides: { '7,5': 'ocean', '6,4': 'prairie' },
      artefacts: [{ artefactId: 'atlantide', q: 7, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const landOrders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 6, r: 4 }] }], p2: [] };
    const landResult = resolveTurn(land, landOrders, SEED);
    expect(landResult.newState.artefacts).toHaveLength(1); // intact
  });

  it('les barbares n’activent pas (R-95 transposé)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      units: [{ id: 'b1', type: 'guerrier', owner: 'barbarien', q: 5, r: 4 }],
    });
    const { newState } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.artefacts).toHaveLength(1);
  });

  it('déterminisme : même entrée → même sortie (résolution avec activation rejouable, R-80)', () => {
    const state = buildArtefactState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }], p2: [] };
    const a = resolveTurn(state, orders, SEED);
    const b = resolveTurn(state, orders, SEED);
    expect(a.newState).toEqual(b.newState);
    expect(a.events).toEqual(b.events);
  });
});

// ---------------------------------------------------------------------------
// R-154 · Les 6 effets
// ---------------------------------------------------------------------------

describe('7o · R-154 · Sept Cités d’Or — or selon l’ère, ×2 Espagne (hook R-146)', () => {
  function build(era: 'ancienne' | 'moderne', civId?: string): GameState {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    state.players['p1']!.era = era;
    if (civId) state.players['p1']!.civId = civId;
    return state;
  }
  const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }], p2: [] };

  it('ère Antique 200, ère Moderne 400 (T-41)', () => {
    expect(resolveTurn(build('ancienne'), orders, SEED).newState.players['p1']!.treasury).toBe(200);
    expect(resolveTurn(build('moderne'), orders, SEED).newState.players['p1']!.treasury).toBe(400);
  });

  it('Espagne (tresorsDouble, ère Antique active dès le départ) : ×2 → 400', () => {
    const { newState } = resolveTurn(build('ancienne', 'espagne'), orders, SEED);
    expect(newState.players['p1']!.treasury).toBe(400);
  });
});

describe('7o · R-154 · Arche d’Alliance — Temples gratuits, Temples → Cathédrales (R-111)', () => {
  it('ville sans Temple reçoit un Temple ; ville avec Temple devient Cathédrale ; Cathédrale intacte', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'arche_alliance', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
      cities: [
        { id: 'c1', owner: 'p1', q: 1, r: 1, capital: true }, // sans Temple
        { id: 'c2', owner: 'p1', q: 9, r: 1, buildings: ['temple'] }, // Temple → Cathédrale
        { id: 'c3', owner: 'p1', q: 9, r: 8, buildings: ['cathedrale'] }, // inchangée
        { id: 'c4', owner: 'p2', q: 1, r: 8 }, // adverse : rien
      ],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }], p2: [] };
    const { newState, events } = resolveTurn(state, orders, SEED);
    expect(newState.cities['c1']!.buildings).toContain('temple');
    expect(newState.cities['c2']!.buildings).toContain('cathedrale');
    expect(newState.cities['c2']!.buildings).not.toContain('temple');
    expect(newState.cities['c3']!.buildings).toEqual(['cathedrale']);
    expect(newState.cities['c4']!.buildings).toEqual([]);
    const built = events.filter((e) => e.type === 'BuildingCompleted');
    expect(built).toHaveLength(2); // c1 (temple) + c2 (cathedrale)
  });
});

describe('7o · R-154 · École de Confucius — 3 GP, rotation R-127, sans jalon', () => {
  it('3 GP posés à la capitale (rotation des classes), compteurs d’escalade +3, aucun jalon', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'ecole_confucius', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
      cities: [{ id: 'c1', owner: 'p1', q: 1, r: 1, capital: true }],
    });
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }], p2: [] };
    const { newState, events } = resolveTurn(state, orders, SEED);
    const spawned = events.filter((e) => e.type === 'GreatPersonSpawned');
    expect(spawned).toHaveLength(3);
    for (const e of spawned) {
      expect(e.type === 'GreatPersonSpawned' && e.cityId).toBe('c1');
    }
    // Premier GP sur la case de la capitale ; les suivants adjacents libres
    // (R-30 : pas d'empilement — miroir R-114 « sinon adjacente libre »).
    expect(spawned[0] && spawned[0].type === 'GreatPersonSpawned' && spawned[0].at).toEqual({ q: 1, r: 1 });
    for (const e of spawned) {
      expect(e.type === 'GreatPersonSpawned' && hexDistance(e.at, { q: 1, r: 1 })).toBeLessThanOrEqual(1);
    }
    const classes = spawned.map((e) => (e.type === 'GreatPersonSpawned' ? e.unitType : ''));
    expect(new Set(classes).size).toBe(3); // rotation : classes distinctes
    expect(newState.players['p1']!.greatPersonsObtained).toBe(3);
    expect(newState.players['p1']!.cultureMilestones).toBe(0); // sans jalon (miroir C2)
    const totalByType = Object.values(newState.players['p1']!.greatPersonsByType).reduce((a, b) => a + b, 0);
    expect(totalByType).toBe(3);
    const gpUnits = Object.values(newState.units).filter((u) => u.owner === 'p1' && classes.includes(u.type));
    expect(gpUnits.length).toBe(3);
  });
});

describe('7o · R-154 · Chevaliers Templiers — unité selon l’ère, unique R-148', () => {
  const mkOrders = (unitId: string): Record<string, Order[]> => ({
    p1: [{ type: 'Move', unitId, path: [{ q: 5, r: 5 }] }],
    p2: [],
  });

  it('ère Antique → Chevalier, posé sur une case adjacente libre', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'chevaliers_templiers', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const { newState, events } = resolveTurn(state, mkOrders('u1'), SEED);
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated' && activated.unitType).toBe('chevalier');
    const granted = Object.values(newState.units).find((u) => u.type === 'chevalier' && u.owner === 'p1');
    expect(granted).toBeDefined();
    expect(hexDistance(granted!, { q: 5, r: 5 })).toBe(1); // la case de l'artefact est occupée par l'activateur
  });

  it('ère Moderne → Char d’assaut ; Espagne (Feudalité connue) → Conquistador (R-148)', () => {
    const moderne = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'chevaliers_templiers', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    moderne.players['p1']!.era = 'moderne';
    const r1 = resolveTurn(moderne, mkOrders('u1'), SEED);
    const activated1 = r1.events.find((e) => e.type === 'ArtifactActivated');
    expect(activated1 && activated1.type === 'ArtifactActivated' && activated1.unitType).toBe('char_d_assaut');

    const espagne = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'chevaliers_templiers', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    espagne.players['p1']!.civId = 'espagne';
    espagne.players['p1']!.era = 'medievale';
    espagne.players['p1']!.techsUnlocked = ['feudalite'];
    const r2 = resolveTurn(espagne, mkOrders('u1'), SEED);
    const activated2 = r2.events.find((e) => e.type === 'ArtifactActivated');
    expect(activated2 && activated2.type === 'ArtifactActivated' && activated2.unitType).toBe('conquistador');
  });
});

describe('7o · R-154 · Cité Perdue d’Atlantide — les 3 techs les moins chères (tri déterministe)', () => {
  const mkOrders = (): Record<string, Order[]> => ({
    p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 6, r: 6 }] }],
    p2: [],
  });
  function atlantisState(techs: string[]): GameState {
    const state = makeState({
      width: 12,
      height: 10,
      terrainOverrides: { '7,5': 'ocean', '6,5': 'eau', '6,6': 'eau' },
      artefacts: [{ artefactId: 'atlantide', q: 7, r: 5 }],
      units: [{ id: 'u1', type: 'galion', owner: 'p1', q: 6, r: 5 }],
    });
    state.players['p1']!.techsUnlocked = [...techs];
    return state;
  }

  it('tri coût croissant puis id : alphabet+travail_du_bronze connus → equitation, poterie, maconnerie', () => {
    const { newState, events } = resolveTurn(atlantisState(['alphabet', 'travail_du_bronze']), mkOrders(), SEED);
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated' && activated.techs).toEqual(['equitation', 'poterie', 'maconnerie']);
    for (const t of ['equitation', 'poterie', 'maconnerie']) {
      expect(newState.players['p1']!.techsUnlocked).toContain(t);
    }
    expect(newState.firstBy['equitation']).toBeUndefined(); // octroi direct : ni firstBy ni Premier découvrir
    expect(events.filter((e) => e.type === 'FirstDiscovered')).toHaveLength(0);
  });

  it('la tech EN COURS fait partie du pool : sa complétion libère la recherche (sans surplus)', () => {
    const base = atlantisState(['alphabet', 'travail_du_bronze']);
    const player = base.players['p1']!;
    player.researching = 'equitation';
    player.scienceProgress['equitation'] = 10;
    const { newState } = resolveTurn(base, mkOrders(), SEED);
    expect(newState.players['p1']!.researching).toBeNull();
    expect(newState.players['p1']!.scienceProgress['equitation']).toBeUndefined();
    expect(newState.players['p1']!.techsUnlocked).toContain('equitation');
  });

  it('aucune tech à accorder (arbre complet) : aucun événement TechResearched, artefact consommé quand même', () => {
    const all = Object.keys(TECHS);
    const { newState, events } = resolveTurn(atlantisState(all), mkOrders(), SEED);
    expect(newState.artefacts).toHaveLength(0);
    expect(events.some((e) => e.type === 'ArtifactActivated')).toBe(true);
    expect(events.filter((e) => e.type === 'TechResearched' && (e as { player?: string }).player === 'p1')).toHaveLength(0);
  });
});

describe('7o · R-154 · Angkor Wat — merveille gratuite au choix du joueur', () => {
  function angkorState(): GameState {
    return makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'angkor_wat', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
      cities: [{ id: 'c1', owner: 'p1', q: 1, r: 1, capital: true }],
    });
  }
  const mkOrders = (): Record<string, Order[]> => ({
    p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }],
    p2: [],
  });

  it('l’activation met le choix EN ATTENTE (aucun effet immédiat) — R-154', () => {
    const { newState } = resolveTurn(angkorState(), mkOrders(), SEED);
    expect(newState.pendingArtefactChoices).toEqual([{ player: 'p1', artefactId: 'angkor_wat' }]);
    expect(Object.values(newState.cities).every((c) => c.wonders.length === 0)).toBe(true);
  });

  it('ChooseWonder : la merveille est posée avec la complétion canonique (jalon R-131, événement)', () => {
    const { newState } = resolveTurn(angkorState(), mkOrders(), SEED);
    const result = applyAngkorChoice(newState, 'p1', 'c1', 'stonehenge');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cities['c1']!.wonders).toContain('stonehenge');
    expect(result.state.players['p1']!.cultureMilestones).toBe(1); // R-131
    expect(result.state.pendingArtefactChoices).toEqual([]);
    const types = result.events.map((e) => e.type);
    expect(types).toContain('WonderCompleted');
    expect(types).toContain('CultureMilestone');
    expect(result.state.lastEventSeq).toBeGreaterThan(newState.lastEventSeq);
  });

  it('refus : ONU (victoire 🔶), merveille déjà bâtie, obsolète (R-128), ville ennemie, sans attente', () => {
    const { newState } = resolveTurn(angkorState(), mkOrders(), SEED);
    expect(wonderGrantIssue(newState, 'nations_unies')).toMatch(/victoire|stratégique/);
    expect(wonderGrantIssue(newState, 'merveille_inconnue')).toMatch(/inconnue/);

    const built = structuredClone(newState);
    built.cities['c1']!.wonders.push('stonehenge');
    expect(wonderGrantIssue(built, 'stonehenge')).toMatch(/déjà construite/);

    // Obsolescence GLOBALE : p2 connaît Littératie → Stonehenge obsolète (R-128).
    const obsolete = structuredClone(newState);
    obsolete.players['p2']!.techsUnlocked = ['litteratie'];
    expect(wonderGrantIssue(obsolete, 'stonehenge')).toMatch(/obsolète/);

    expect(applyAngkorChoice(newState, 'p2', 'c1', 'stonehenge').ok).toBe(false); // ville ennemie
    const noPending = structuredClone(newState);
    noPending.pendingArtefactChoices = [];
    expect(applyAngkorChoice(noPending, 'p1', 'c1', 'stonehenge').ok).toBe(false);
  });

  it('liste UI : non construites, non obsolètes, implémentées, hors victoire/stratégique — tri par id', () => {
    const { newState } = resolveTurn(angkorState(), mkOrders(), SEED);
    const eligible = angkorEligibleWonders(newState);
    expect(eligible).not.toContain('nations_unies');
    expect(eligible).not.toContain('banque_mondiale');
    expect(eligible).not.toContain('projet_manhattan');
    expect(eligible).not.toContain('hollywood'); // implemented: false
    expect(eligible).toContain('stonehenge');
    expect([...eligible].sort()).toEqual(eligible);
  });
});

// ---------------------------------------------------------------------------
// R-155 · Détection — indice de hutte, Vol Spatial, survol
// ---------------------------------------------------------------------------

describe('7o · R-155 · Indice de hutte (artefact_indice)', () => {
  const state = () =>
    makeState({
      width: 12,
      height: 10,
      artefacts: [
        { artefactId: 'sept_cites_or', q: 8, r: 5 }, // distance 3 de la hutte (5,5)
        { artefactId: 'arche_alliance', q: 6, r: 5 }, // distance 1 — le plus proche
      ],
      huts: [{ q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });

  it('variante NOMBRE : nombre d’artefacts restants (RNG ≥ chance position)', () => {
    const st = state();
    const rng = { next: () => 0.9, nextInt: () => 0, state: 0 }; // 0,9 ≥ 0,5 → nombre
    const hint = applyArtefactIndiceReward(st, 'p1', { q: 5, r: 5 }, rng);
    expect(hint.remaining).toBe(2);
    expect(hint.position).toBeUndefined();
    expect(st.players['p1']!.vision.explored).toHaveLength(0); // rien de révélé
  });

  it('variante POSITION : l’artefact le plus proche de la hutte, sa case est révélée (explored)', () => {
    const st = state();
    const rng = { next: () => 0.1, nextInt: () => 0, state: 0 }; // 0,1 < 0,5 → position
    const hint = applyArtefactIndiceReward(st, 'p1', { q: 5, r: 5 }, rng);
    expect(hint.position).toEqual({ q: 6, r: 5 });
    expect(st.players['p1']!.vision.explored).toContain('6,5');
  });

  it('aucun artefact restant : l’indice se réduit au nombre (0)', () => {
    const st = state();
    st.artefacts = [];
    const hint = applyArtefactIndiceReward(st, 'p1', { q: 5, r: 5 }, { next: () => 0.1, nextInt: () => 0, state: 0 });
    expect(hint).toEqual({ remaining: 0 });
  });
});

describe('7o · R-155 · Vol Spatial — révélation complète (tech existante)', () => {
  it('compléter vol_spatial explore TOUTE la carte ; les artefacts deviennent visibles dans l’état filtré', () => {
    const st = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 7, r: 9 }], // col 11, rangée 9
    });
    st.players['p1']!.researching = 'vol_spatial';
    expect(st.players['p1']!.vision.explored).toHaveLength(0);
    creditScience(st, 'p1', 99999, () => {});
    expect(st.players['p1']!.techsUnlocked).toContain('vol_spatial');
    expect(st.players['p1']!.vision.explored.sort()).toEqual(Object.keys(st.map).sort());
    const filtered = getFilteredState(st, 'p1');
    expect(filtered.artefacts.some((a) => a.artefactId === 'sept_cites_or' && a.q === 7 && a.r === 9)).toBe(true);
  });
});

describe('7o · R-153/R-155 · Brouillard — un artefact inexploré n’existe pas côté client', () => {
  it('filtrage : artefact exploré visible ; inexploré absent (ping de présence seul) ; choix Angkor privés', () => {
    const st = makeState({
      width: 12,
      height: 10,
      artefacts: [
        { artefactId: 'sept_cites_or', q: 1, r: 1 }, // explorée (vision départ)
        { artefactId: 'arche_alliance', q: 7, r: 9 }, // inexplorée (col 11, rangée 9)
      ],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 }],
    });
    st.pendingArtefactChoices = [
      { player: 'p1', artefactId: 'angkor_wat' },
      { player: 'p2', artefactId: 'angkor_wat' },
    ];
    const filtered = getFilteredState(st, 'p1');
    expect(filtered.artefacts.map((a) => a.artefactId)).toEqual(['sept_cites_or']);
    expect(filtered.artifactPings).toEqual([{ q: 7, r: 9 }]); // présence SANS identité
    expect(filtered.pendingArtefactChoices).toEqual([{ player: 'p1', artefactId: 'angkor_wat' }]);
  });
});

// ---------------------------------------------------------------------------
// Aides locales (BFS indépendants pour les assertions de placement)
// ---------------------------------------------------------------------------

function landDistance(terrain: Record<string, string>, width: number, height: number): Map<string, number> {
  const dist = new Map<string, number>();
  let current: string[] = [];
  for (const key of Object.keys(terrain)) {
    const t = terrain[key]!;
    if (t !== 'eau' && t !== 'ocean') {
      dist.set(key, 0);
      current.push(key);
    }
  }
  let d = 0;
  while (current.length > 0) {
    const next: string[] = [];
    for (const key of current) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) {
        const nq = q! + dq;
        const nr = r! + dr;
        if (nq < 0 || nr < 0 || nq >= width + 20 || nr >= height) continue;
        const nk = `${nq},${nr}`;
        if (dist.has(nk) || terrain[nk] === undefined) continue;
        dist.set(nk, d + 1);
        next.push(nk);
      }
    }
    current = next;
    d += 1;
  }
  return dist;
}

function componentSizes(terrain: Record<string, string>, width: number, height: number): Map<string, number> {
  void width;
  void height;
  const comp = new Map<string, number>();
  const sizes: number[] = [];
  for (const key of Object.keys(terrain).sort()) {
    if (comp.has(key)) continue;
    const t = terrain[key]!;
    if (t === 'eau' || t === 'ocean') continue;
    let size = 0;
    const queue = [key];
    comp.set(key, sizes.length);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      size += 1;
      const [q, r] = cur.split(',').map(Number) as [number, number];
      for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) {
        const nk = `${q! + dq},${r! + dr}`;
        if (comp.has(nk) || terrain[nk] === undefined) continue;
        const nt = terrain[nk]!;
        if (nt === 'eau' || nt === 'ocean') continue;
        comp.set(nk, sizes.length);
        queue.push(nk);
      }
    }
    sizes.push(size);
  }
  const out = new Map<string, number>();
  for (const [key, c] of comp) out.set(key, sizes[c] ?? 0);
  return out;
}
