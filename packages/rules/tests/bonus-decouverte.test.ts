/**
 * BONUS-DECOUVERTE — placement des bonus « Premier découvrir » + Milice de
 * bord (décisions d'Erik du 07/10, D1-D6 ; RULES.md §8.1bis R-109 rév.).
 *
 * D1 — spawn naval JAMAIS sur terre : ville au tri (pop ↓, capitale, seedé)
 *      ayant une case d'eau LIBRE praticable dans le rayon cultivable ; repli
 *      case de ville (port R-117) ; épuisée → annulé + chronique (D5).
 * D2 — Milice à bord de tout spawn naval SAUF sous-marin, barbares EXCLUS.
 * D3 — bâtiment à terrain (Comptoir=désert, Atelier=colline) : ville au plus
 *      de cases du terrain (rayon actuel, sinon rayon 2 potentiel Tribunal) ;
 *      jamais bénéficiaire → annulé + chronique.
 * D4 — bâtiment sans terrain (Marché, Remparts) : ville la plus peuplée.
 * D5 — toute annulation est annoncée (event FirstDiscovered.notGranted).
 * D6 — terrestres (capitale → adjacente) et bonus d'empire inchangés.
 */
import { describe, expect, it } from 'vitest';
import { applyFirstToDiscover } from '../src/firstDiscovery.js';
import { siteSpawnNaval, trieVillesCandidates, embarqueMilice } from '../src/bonusPlacement.js';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { colRowToHex, tileKeyOf, hexDistanceW, neighbors } from '../src/hex.js';
import { registerTestUnitType, unitType, BARBARIAN_ID, isWaterTerrain } from '../src/data.js';
import type { GameState, PlayerId } from '../src/state.js';
import type { TerrainId } from '../src/types.js';
import type { FirstDiscoveredPayload } from '../src/events.js';

const K = (col: number, row: number): string => tileKeyOf(colRowToHex(col, row));
const H = (col: number, row: number) => colRowToHex(col, row);

/** Carte côtière 8×7 : rangées 3-4 eau, océan à l'est (colonnes 7). */
function cotes(): Record<string, TerrainId> {
  const o: Record<string, TerrainId> = {};
  for (let col = 0; col < 8; col++) {
    o[K(col, 3)] = 'eau';
    o[K(col, 4)] = 'eau';
  }
  o[K(7, 3)] = 'ocean';
  o[K(7, 4)] = 'ocean';
  return o;
}

function etatCotier(extra: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({ width: 8, height: 7, terrainOverrides: cotes(), ...extra });
}

/** Applique la récompense Premier découvrir en captant le payload. */
function decouvre(st: GameState, techId: string, playerId: PlayerId = 'p1'): FirstDiscoveredPayload {
  let payload!: FirstDiscoveredPayload;
  applyFirstToDiscover(st, playerId, techId, (p) => {
    payload = p;
  });
  return payload;
}

function parType(st: GameState, type: string) {
  return Object.values(st.units).filter((u) => u.type === type && !u.aboard);
}

/** Assaillant naval surpuistant (p ≈ 1) — la mort du défenseur ne dépend plus de la graine. */
registerTestUnitType({
  id: 'assaut-naval-test',
  name: 'Assaut naval (test)',
  attack: 99,
  defense: 3,
  movement: 3,
  hpMax: 3,
  cost: 10,
  visionRadius: 2,
  canAttack: true,
  canFoundCity: false,
  isRanged: false,
  aquatic: true,
  navalAccess: 'ocean',
});

/** Navire-cible 1 PV : un seul assaut suffit, le naufrage est déterministe. */
registerTestUnitType({
  id: 'navire-cible-test',
  name: 'Navire cible (test)',
  attack: 0,
  defense: 1,
  movement: 2,
  hpMax: 1,
  cost: 10,
  visionRadius: 2,
  canAttack: false,
  canFoundCity: false,
  isRanged: false,
  aquatic: true,
  navalAccess: 'ocean',
});

// ---------------------------------------------------------------------------
// D1 · Spawn naval — jamais sur terre
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · D1 — spawn naval', () => {
  it('le Galion spawn dans la ville côtière au tri (plus grande pop avec case d\'eau libre), jamais sur terre', () => {
    // c1 capitale INTÉRIEURE pop 5 (pas d'eau dans le rayon) ; c2 côtière pop 3.
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 1).q, r: H(1, 1).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
      ],
    });
    const payload = decouvre(st, 'navigation');
    const galions = parType(st, 'galion');
    expect(galions).toHaveLength(1);
    const g = galions[0]!;
    expect(g.owner).toBe('p1');
    const terrain = st.map[tileKeyOf(g)]!.terrain;
    expect(isWaterTerrain(terrain)).toBe(true); // JAMAIS sur terre (bug actuel : capitale intérieure)
    expect(hexDistanceW({ q: st.cities['c2']!.q, r: st.cities['c2']!.r }, g, st.mapWidth)).toBeLessThanOrEqual(1);
    expect(payload.unitType).toBe('galion');
    expect(payload.unitIds![0]).toBe(g.id); // le navire, puis sa Milice (D2)
    expect(payload.unitIds).toHaveLength(2);
  });

  it('égalité de population → la capitale d\'abord', () => {
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
      ],
    });
    decouvre(st, 'navigation');
    const g = parType(st, 'galion')[0]!;
    expect(hexDistanceW({ q: st.cities['c1']!.q, r: st.cities['c1']!.r }, g, st.mapWidth)).toBeLessThanOrEqual(1);
  });

  it('égalité sans capitale → tirage SEEDÉ reproductible (même seed ⇒ même choix)', () => {
    const fab = (seed: number) =>
      etatCotier({
        rngSeed: seed,
        cities: [
          { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
          { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
        ],
      });
    const a = fab(42);
    const b = fab(42);
    decouvre(a, 'navigation');
    decouvre(b, 'navigation');
    const ga = parType(a, 'galion')[0]!;
    const gb = parType(b, 'galion')[0]!;
    expect({ q: ga.q, r: ga.r }).toEqual({ q: gb.q, r: gb.r }); // même seed ⇒ même case
  });

  it('toutes les cases d\'eau occupées → spawn sur la CASE VILLE (port, R-117)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
      units: [
        { id: 'u10', type: 'galere', owner: 'p2', q: H(0, 3).q, r: H(0, 3).r },
        { id: 'u11', type: 'galere', owner: 'p2', q: H(1, 3).q, r: H(1, 3).r },
      ],
    });
    decouvre(st, 'navigation');
    const g = parType(st, 'galion')[0]!;
    const c1 = st.cities['c1']!;
    expect({ q: g.q, r: g.r }).toEqual({ q: c1.q, r: c1.r }); // sur le port
  });

  it('port occupé aussi → ville suivante ; une seule ville au total', () => {
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
      ],
      units: [
        { id: 'u10', type: 'galere', owner: 'p2', q: H(0, 3).q, r: H(0, 3).r }, // eau c1
        { id: 'u11', type: 'galere', owner: 'p2', q: H(1, 3).q, r: H(1, 3).r }, // eau c1
        { id: 'u12', type: 'galere', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r }, // port c1 (case ville)
        { id: 'u13', type: 'galere', owner: 'p2', q: H(3, 3).q, r: H(3, 3).r }, // eau c2
        { id: 'u14', type: 'galere', owner: 'p2', q: H(4, 3).q, r: H(4, 3).r }, // eau c2
      ],
    });
    decouvre(st, 'navigation');
    const g = parType(st, 'galion')[0]!;
    const c2 = st.cities['c2']!;
    expect({ q: g.q, r: g.r }).toEqual({ q: c2.q, r: c2.r }); // port de c2 (c1 épuisée)
  });

  it('toutes les cases d\'eau ET les ports occupés → annulé + chronique nommée (D5)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
      units: [
        { id: 'u10', type: 'galere', owner: 'p2', q: H(0, 3).q, r: H(0, 3).r },
        { id: 'u11', type: 'galere', owner: 'p2', q: H(1, 3).q, r: H(1, 3).r },
        { id: 'u12', type: 'galere', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r },
      ],
    });
    const payload = decouvre(st, 'navigation');
    expect(parType(st, 'galion')).toHaveLength(0);
    expect(payload.unitType).toBeUndefined();
    expect(payload.notGranted).toMatch(/aucun port valide/);
    expect(payload.notGranted).toMatch(/Galion/);
  });

  it('aucune ville avec cases d\'eau → annulé + chronique nommée (D5)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 1).q, r: H(1, 1).r, capital: true, pop: 3 }],
    });
    const payload = decouvre(st, 'navigation');
    expect(parType(st, 'galion')).toHaveLength(0);
    expect(payload.notGranted).toMatch(/aucun port valide — Galion non accordé/);
  });

  it('helper : la Galère (côte seule) ignore l\'océan — port R-117 en repli ; le Galion y spawn en eau', () => {
    // Ville dont la SEULE eau du rayon est de l'OCÉAN.
    const o: Record<string, TerrainId> = { [K(0, 3)]: 'ocean', [K(1, 3)]: 'ocean' };
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: o,
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
    });
    const galere = siteSpawnNaval(st, 'p1', 'galere', (st.rngSeed ^ 0x517) >>> 0);
    expect(galere).not.toBeNull();
    expect(galere!.mode).toBe('port'); // l'océan ne lui est pas accessible
    const galion = siteSpawnNaval(st, 'p1', 'galion', (st.rngSeed ^ 0x517) >>> 0);
    expect(galion!.mode).toBe('eau'); // le Galion entre en océan (R-107)
  });
});

// ---------------------------------------------------------------------------
// D2 · Milice à bord
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · D2 — Milice de bord', () => {
  it('le Galion bonus embarque une Milice (miroir de position, cargo posé)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
    });
    decouvre(st, 'navigation');
    const g = parType(st, 'galion')[0]!;
    const milices = Object.values(st.units).filter((u) => u.type === 'milice');
    expect(milices).toHaveLength(1);
    const m = milices[0]!;
    expect(m.aboard).toBe(g.id);
    expect({ q: m.q, r: m.r }).toEqual({ q: g.q, r: g.r }); // position miroir
    expect(g.cargo).toBe(m.id);
    expect(m.owner).toBe('p1');
  });

  it('le Sous-marin (Électricité) NE embarque PAS de Milice', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
    });
    decouvre(st, 'electricite');
    expect(parType(st, 'sous_marin')).toHaveLength(1);
    expect(Object.values(st.units).some((u) => u.type === 'milice')).toBe(false);
  });

  it('production en ville : la Galère produite embarque une Milice', () => {
    const st = etatCotier({
      cities: [
        {
          id: 'c1',
          owner: 'p1',
          q: H(1, 2).q,
          r: H(1, 2).r,
          capital: true,
          pop: 1,
          production: { item: { kind: 'unit', id: 'galere' }, progress: 29 },
        },
      ],
    });
    // R-63 rév. Erik 10/10 : plus de +1 du citoyen intérieur — la ville
    // travaille une colline VOISINE pour produire 1 marteau et compléter
    // la Galère (29 + 1 = 30).
    const voisin = neighbors(H(1, 2))[0]!;
    const kVoisin = tileKeyOf(voisin);
    st.map[kVoisin] = { terrain: 'colline', resource: null };
    st.cities['c1']!.workedTiles = [kVoisin];
    const result = resolveTurn(st, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'galere' } }] }, 1);
    const galere = Object.values(result.newState.units).find((u) => u.type === 'galere');
    expect(galere).toBeDefined();
    const milice = Object.values(result.newState.units).find((u) => u.type === 'milice');
    expect(milice).toBeDefined();
    expect(milice!.aboard).toBe(galere!.id);
    expect(galere!.cargo).toBe(milice!.id);
  });

  it('barbares EXCLUS : aucun Milice sur un navire barbare', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
      units: [{ id: 'ub', type: 'galion', owner: BARBARIAN_ID as PlayerId, q: H(0, 3).q, r: H(0, 3).r }],
    });
    const navire = st.units['ub']!;
    expect(embarqueMilice(st, navire)).toBeNull();
    expect(Object.values(st.units).some((u) => u.type === 'milice')).toBe(false);
  });

  it('naufrage : la Milice coule avec son navire (R-117 standard)', () => {
    const eau = H(1, 3);
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
      units: [
        { id: 'u1', type: 'navire-cible-test', owner: 'p1', q: eau.q, r: eau.r },
        { id: 'u2', type: 'milice', owner: 'p1', q: eau.q, r: eau.r, aboard: 'u1' },
        { id: 'u3', type: 'assaut-naval-test', owner: 'p2', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    expect(st.units['u2']!.aboard).toBe('u1');
    const result = resolveTurn(st, { p2: [{ type: 'Attack', unitId: 'u3', target: eau }] }, 1);
    expect(result.newState.units['u1']).toBeUndefined();
    expect(result.newState.units['u2']).toBeUndefined(); // la cargaison sombre
    const causes = result.events.filter((e) => e.type === 'UnitDestroyed') as Array<{ unitId: string; cause?: string }>;
    expect(causes.find((e) => e.unitId === 'u2')?.cause).toBe('sunk');
  });
});

// ---------------------------------------------------------------------------
// D3 · Bâtiments à terrain — Comptoir (désert), Atelier (colline)
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · D3 — bâtiments à terrain', () => {
  it('Comptoir : la ville au PLUS de cases de désert gagne (pas la capitale)', () => {
    const o = cotes();
    o[K(3, 1)] = 'desert'; // 1 désert pour c1
    o[K(0, 3)] = 'desert'; // 2 déserts pour c2
    o[K(1, 3)] = 'desert';
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: o,
      cities: [
        { id: 'c1', owner: 'p1', q: H(4, 0).q, r: H(4, 0).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
      ],
    });
    const payload = decouvre(st, 'code_des_lois');
    expect(st.cities['c2']!.buildings).toContain('comptoir_commercial');
    expect(st.cities['c1']!.buildings).not.toContain('comptoir_commercial');
    expect(payload.cityId).toBe('c2');
  });

  it('aucun désert au rayon actuel → rayon POTENTIEL Tribunal (rayon 2)', () => {
    const o = cotes();
    o[K(2, 3)] = 'desert'; // à distance 2 de c1 — aucun désert au rayon 1
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: o,
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 1).q, r: H(1, 1).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(6, 0).q, r: H(6, 0).r, pop: 3 },
      ],
    });
    const payload = decouvre(st, 'code_des_lois');
    expect(st.cities['c1']!.buildings).toContain('comptoir_commercial');
    expect(st.cities['c2']!.buildings).not.toContain('comptoir_commercial');
    expect(payload.cityId).toBe('c1');
  });

  it('jamais bénéficiaire (aucun désert nulle part) → Comptoir NON construit + chronique (D5)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
    });
    const payload = decouvre(st, 'code_des_lois');
    expect(Object.values(st.cities).some((c) => c.buildings.includes('comptoir_commercial'))).toBe(false);
    expect(payload.building).toBeUndefined();
    expect(payload.cityId).toBeUndefined();
    expect(payload.notGranted).toMatch(/Désert — Comptoir commercial non accordé/);
  });

  it('Atelier : miroir sur les collines', () => {
    const o = cotes();
    o[K(3, 1)] = 'colline'; // 1 colline pour c1
    o[K(0, 3)] = 'colline'; // 2 collines pour c2
    o[K(1, 3)] = 'colline';
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: o,
      cities: [
        { id: 'c1', owner: 'p1', q: H(4, 0).q, r: H(4, 0).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
      ],
    });
    const payload = decouvre(st, 'construction');
    expect(st.cities['c2']!.buildings).toContain('atelier');
    expect(st.cities['c1']!.buildings).not.toContain('atelier');
    expect(payload.cityId).toBe('c2');
  });

  it('ville choisie déjà dotée → non accordé + chronique (pas de re-choix)', () => {
    const o = cotes();
    o[K(0, 3)] = 'desert';
    o[K(1, 3)] = 'desert';
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: o,
      cities: [
        { id: 'c1', owner: 'p1', q: H(4, 0).q, r: H(4, 0).r, capital: true, pop: 5 },
        { id: 'c2', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3, buildings: ['comptoir_commercial'] },
      ],
    });
    const payload = decouvre(st, 'code_des_lois');
    expect(st.cities['c1']!.buildings).not.toContain('comptoir_commercial'); // pas de re-choix
    expect(payload.notGranted).toMatch(/déjà dotée/);
    expect(payload.notGranted).toMatch(/Comptoir commercial/);
  });
});

// ---------------------------------------------------------------------------
// D4 · Bâtiments sans terrain — Marché, Remparts
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · D4 — bâtiments sans terrain', () => {
  it('Marché : ville la plus peuplée ; la Caravane (non implémentée) reste ignorée', () => {
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 2 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 7 },
      ],
    });
    const payload = decouvre(st, 'monnaie');
    expect(st.cities['c2']!.buildings).toContain('marche');
    expect(st.cities['c1']!.buildings).not.toContain('marche');
    expect(payload.cityId).toBe('c2');
    expect(Object.values(st.units).some((u) => u.type === 'caravane')).toBe(false);
  });

  it('Remparts : égalité de population → la capitale', () => {
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
      ],
    });
    const payload = decouvre(st, 'maconnerie');
    expect(st.cities['c1']!.buildings).toContain('remparts');
    expect(payload.cityId).toBe('c1');
  });

  it('égalité sans capitale → tirage seedé reproductible', () => {
    const fab = (seed: number) =>
      etatCotier({
        rngSeed: seed,
        cities: [
          { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
          { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
        ],
      });
    const a = fab(42);
    const b = fab(42);
    decouvre(a, 'maconnerie');
    decouvre(b, 'maconnerie');
    expect(a.cities['c1']!.buildings.includes('remparts')).toBe(b.cities['c1']!.buildings.includes('remparts'));
    expect(a.cities['c2']!.buildings.includes('remparts')).toBe(b.cities['c2']!.buildings.includes('remparts'));
  });
});

// ---------------------------------------------------------------------------
// D6 · Inchangés — terrestres et bonus d'empire
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · D6 — inchangés', () => {
  it('unité TERRESTRE : capitale d\'abord, sinon adjacente libre (comportement historique)', () => {
    const st = etatCotier({
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 1).q, r: H(1, 1).r, capital: true, pop: 3 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 7 },
      ],
    });
    const payload = decouvre(st, 'travail_du_fer');
    const legions = parType(st, 'legion');
    expect(legions).toHaveLength(1);
    const l = legions[0]!;
    const capitale = { q: st.cities['c1']!.q, r: st.cities['c1']!.r };
    expect(hexDistanceW(capitale, l, st.mapWidth)).toBeLessThanOrEqual(1); // capitale → adjacente
    expect(payload.unitType).toBe('legion');
  });

  it('bonus d\'empire inchangés : or immédiat (Banque 100)', () => {
    const st = etatCotier({
      cities: [{ id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, capital: true, pop: 3 }],
    });
    const payload = decouvre(st, 'banque');
    expect(st.players['p1']!.treasury).toBe(100);
    expect(payload.gold).toBe(100);
    expect(payload.notGranted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Déterminisme et tri
// ---------------------------------------------------------------------------

describe('BONUS-DECOUVERTE · déterminisme', () => {
  it('même seed ⇒ état identique après une récompense navale (unités ET choix)', () => {
    const fab = (seed: number) =>
      etatCotier({
        rngSeed: seed,
        cities: [
          { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 3 },
          { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 3 },
        ],
      });
    const a = fab(42);
    const b = fab(42);
    decouvre(a, 'navigation');
    decouvre(b, 'navigation');
    expect(JSON.stringify(a.units)).toBe(JSON.stringify(b.units));
  });

  it('trieVillesCandidates : pop décroissante, capitale d\'abord, tirage seedé reproductible', () => {
    const st = etatCotier({
      rngSeed: 7,
      cities: [
        { id: 'c1', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r, pop: 2 },
        { id: 'c2', owner: 'p1', q: H(4, 2).q, r: H(4, 2).r, pop: 9 },
        { id: 'c3', owner: 'p1', q: H(6, 1).q, r: H(6, 1).r, pop: 2 },
      ],
    });
    const villes = ['c1', 'c2', 'c3'].map((id) => st.cities[id]!);
    const [premier, ...reste] = trieVillesCandidates(villes, (st.rngSeed ^ 0x1234) >>> 0);
    expect(premier!.id).toBe('c2'); // pop 9
    const deux = trieVillesCandidates(villes, (st.rngSeed ^ 0x1234) >>> 0);
    expect(deux.map((c) => c.id)).toEqual([premier!.id, ...reste.map((c) => c.id)]); // reproductible
    expect(unitType('milice').implemented).toBe(false); // jamais productible (garde)
  });
});
