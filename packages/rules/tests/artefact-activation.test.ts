/**
 * ARTEFACT-ARCHE-BUG (signalement Erik 03/10) — l'activation d'un artefact
 * vaut pour toute POSE d'unité sur sa case, pas seulement les pas de
 * mouvement (R-153 amendée) :
 *  - D1 : balayage de début de résolution — toute unité (civilisations)
 *    debout sur la case d'un artefact l'active (couvre les poses passées,
 *    présentes et futures) ;
 *  - D2 : câblage des poses non-step — dépose programmée (tenterDepose) et
 *    régularisation des arrivantes (regulariserArrivantes) activent aussi,
 *    l'événement portant le bon tour et la bonne unité ;
 *  - D3 : les barbares n'activent jamais (R-95 inchangée).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';

const SEED = 20261003;
const H = (col: number, row: number) => colRowToHex(col, row);

/** Carte côtière 8×7 (repère embarquement-programme) : rangées 3-4 eau. */
function coastalState(extra: Parameters<typeof makeState>[0] = {}): GameState {
  const overrides: Record<string, TerrainId> = {};
  for (let col = 0; col < 8; col++) {
    overrides[tileKeyOf(colRowToHex(col, 3))] = 'eau';
    overrides[tileKeyOf(colRowToHex(col, 4))] = 'eau';
  }
  return makeState({ width: 8, height: 7, terrainOverrides: overrides, ...extra });
}

describe('ARTEFACT-ARCHE · D2 — dépose programmée sur l\u2019Arche d\u2019Alliance', () => {
  it('scénario d\u2019Erik : galère → dépose du guerrier sur l\u2019îlot de l\u2019Arche → activation AU TOUR de la dépose', () => {
    const state = coastalState({
      artefacts: [{ artefactId: 'arche_alliance', q: H(0, 5).q, r: H(0, 5).r }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'n1', cargo: null },
        { id: 'n1', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: H(2, 0).q, r: H(2, 0).r, capital: true }],
    });
    // Le navire est programmé vers (0,4) ; la cargaison vise l'Arche (0,5),
    // adjacente terrestre — dépose au premier pas d'où elle est possible.
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'n1', path: [H(0, 4)] },
        { type: 'Move', unitId: 'u1', path: [H(0, 5)] },
      ],
    };
    const { newState, events } = resolveTurn(state, orders, SEED);
    const depose = getUnit(newState, 'u1');
    expect(depose).toMatchObject({ aboard: null, q: H(0, 5).q, r: H(0, 5).r });
    expect(events.some((e) => e.type === 'Disembark')).toBe(true);
    // Activation au tour de la dépose — l'artefact est consommé.
    expect(newState.artefacts).toHaveLength(0);
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated').toBe(true);
    expect(activated && activated.type === 'ArtifactActivated' && activated.byUnitId).toBe('u1');
    expect(activated && activated.type === 'ArtifactActivated' && activated.artefact).toBe('arche_alliance');
    // Effet Arche : Temple gratuit dans la ville sans Temple + entrées journal.
    expect(newState.cities['c1']!.buildings).toContain('temple');
    expect(events.filter((e) => e.type === 'BuildingCompleted')).toHaveLength(1);
  });
});

describe('ARTEFACT-ARCHE · D2 — unité posée par régularisation des arrivantes', () => {
  /** Ville (0,0) occupée par une amie ; SEULE case terrestre adjacente = (0,1)
   *  portant l'artefact — la régularisation D3 (SUR-OCCUPATION-POSE) n'a
   *  pas le choix, l'arrivante y est posée. */
  function etatIsole(): GameState {
    const voisines: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const overrides: Record<string, TerrainId> = {};
    for (const [q, r] of voisines) {
      if (q === 0 && r === 1) continue; // la case de l'artefact reste prairie
      overrides[tileKeyOf(H(q, r))] = 'eau';
    }
    return makeState({
      width: 8,
      height: 8,
      terrainOverrides: overrides,
      artefacts: [{ artefactId: 'sept_cites_or', q: H(0, 1).q, r: H(0, 1).r }],
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, workedTiles: [], production: { item: { kind: 'unit', id: 'colon' }, progress: 20 } }],
      units: [{ id: 'u0', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
  }

  it('tour 1 : pose en arrivante, artefact intact ; tour 2 : la régularisation pose sur l\u2019artefact → activation', () => {
    const r1 = resolveTurn(etatIsole(), {}, SEED);
    const arrivante = Object.values(r1.newState.units).find((u) => u.arrivanteSurCase);
    expect(arrivante).toBeDefined();
    expect(r1.newState.artefacts).toHaveLength(1); // encore à côté, pas dessus

    const r2 = resolveTurn(r1.newState, {}, SEED);
    expect(r2.newState.artefacts).toHaveLength(0);
    const activated = r2.events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated' && activated.byPlayer).toBe('p1');
    expect(activated && activated.type === 'ArtifactActivated' && activated.gold).toBe(200);
    expect(r2.newState.players['p1']!.treasury).toBe(r1.newState.players['p1']!.treasury + 200);
  });
});

describe('ARTEFACT-ARCHE · D1 — balayage de début de résolution', () => {
  it('unité DÉJÀ debout sur un artefact sans y être entrée par un pas → activation au tour suivant (rattrapage)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 }], // posée SANS pas
    });
    const { newState, events } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.artefacts).toHaveLength(0);
    const activated = events.find((e) => e.type === 'ArtifactActivated');
    expect(activated && activated.type === 'ArtifactActivated' && activated.byUnitId).toBe('u1');
    expect(newState.players['p1']!.treasury).toBe(200);
  });

  it('Angkor Wat debout dessous : droit de merveille en attente (miroir du pas de mouvement)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'angkor_wat', q: 5, r: 5 }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 }],
    });
    const { newState, events } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.artefacts).toHaveLength(0);
    expect(events.some((e) => e.type === 'ArtifactActivated')).toBe(true);
    expect(newState.pendingArtefactChoices).toHaveLength(1);
    expect(newState.pendingArtefactChoices[0]).toMatchObject({ player: 'p1', artefactId: 'angkor_wat' });
  });

  it('barbare debout sur l\u2019artefact → JAMAIS d\u2019activation (R-95)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      units: [{ id: 'b1', type: 'guerrier', owner: 'barbarien', q: 5, r: 5 }],
    });
    const { newState } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.artefacts).toHaveLength(1);
  });

  it('deux unités dessus : UNE SEULE activation, la première au tri unitId croissant (R-81)', () => {
    const state = makeState({
      width: 12,
      height: 10,
      artefacts: [{ artefactId: 'sept_cites_or', q: 5, r: 5 }],
      units: [
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 5 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p1: [], p2: [] }, SEED);
    expect(newState.artefacts).toHaveLength(0);
    const activations = events.filter((e) => e.type === 'ArtifactActivated');
    expect(activations).toHaveLength(1);
    expect(activations[0] && activations[0].type === 'ArtifactActivated' && activations[0].byUnitId).toBe('u1');
    expect(newState.players['p1']!.treasury).toBe(200); // une seule fois 200
  });
});
