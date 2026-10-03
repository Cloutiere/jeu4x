/**
 * EMBARQUEMENT-PROGRAMME — décisions d'Erik du 03/10 (D1-B..D7).
 *
 * Le moteur connaît les CHEMINS PROGRAMMÉS des navires pendant la résolution :
 * passe navale d'abord (R-41 amendée), ramassage en marche, dépose au premier
 * pas d'où elle est possible (le navire poursuit), embarquer/débarquer termine
 * le tour de l'unité (D4), la ville portuaire n'est JAMAIS une destination
 * d'embarquement (D5), capacité de charge infinie (D7).
 *
 * Carte de référence : 8×7 — rangées 0-2 terre (nord), 3-4 eau, 5-6 terre (sud)
 * (même repère que phase7g.test.ts ; adjacences vérifiées au repère col,row).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import { registerTestUnitType } from '../src/data.js';
import { createTraceCollector } from '../src/trace.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';
import type { GameEvent } from '../src/events.js';

const H = (col: number, row: number) => colRowToHex(col, row);

function coastalState(extra: Parameters<typeof makeState>[0] = {}): GameState {
  const overrides: Record<string, TerrainId> = {};
  for (let col = 0; col < 8; col++) {
    overrides[tileKeyOf(colRowToHex(col, 3))] = 'eau';
    overrides[tileKeyOf(colRowToHex(col, 4))] = 'eau';
  }
  return makeState({ width: 8, height: 7, terrainOverrides: overrides, ...extra });
}

function eventsOf(events: GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

// Attaquant de test surpuissant (même convention que phase7g).
registerTestUnitType({
  id: 'assaut-test',
  name: 'Assaut (test)',
  attack: 99,
  defense: 3,
  movement: 1,
  hpMax: 3,
  cost: 10,
  visionRadius: 2,
  canAttack: true,
  canFoundCity: false,
  isRanged: false,
});

// Transport de test à 3 PM (le Galion canon a 3 PM mais on isole le calibre) :
// même convention que « assaut-test » de phase7g.
registerTestUnitType({
  id: 'transport-test',
  name: 'Transport (test)',
  attack: 1,
  defense: 2,
  movement: 3,
  hpMax: 3,
  cost: 20,
  visionRadius: 1,
  canAttack: false,
  canFoundCity: false,
  isRanged: false,
  aquatic: true,
  navalAccess: 'ocean',
  cargoCapacity: 1,
});

describe('EMBARQUEMENT-PROGRAMME · D1-B — embarquement à la volée', () => {
  it('scénario de la capture : galère ville→eau programmée, guerrier sur la case d’arrêt → à bord, PM 0, chemin annulé', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(1, 5).q, r: H(1, 5).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    // La galère est programmée ville→eau (arrêt (1,4)) ; le guerrier marche
    // sur la case d'arrêt — il embarque là où le navire SE TROUVE.
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 4), H(1, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(1, 4)] },
        ],
      },
      1,
    );
    const embark = eventsOf(result.events, 'Embark');
    expect(embark).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({
      aboard: 'u2',
      q: H(1, 4).q,
      r: H(1, 4).r, // miroir du transport
      order: null, // D4 : chemin annulé
    });
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(1, 4).q, r: H(1, 4).r, cargo: 'u1' });
  });

  it('ramassage en marche : le navire programmé ENTRE sur une case où une amie est debout → il la ramasse (ordres annulés)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true }],
    });
    // La galère entre dans sa ville portuaire (ramassage) puis repart en mer ;
    // le guerrier avait un ordre — annulé (D4).
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 2), H(0, 3)] },
          { type: 'Move', unitId: 'u1', path: [H(1, 2)] },
        ],
      },
      1,
    );
    expect(eventsOf(result.events, 'Embark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({
      aboard: 'u2',
      q: H(0, 3).q,
      r: H(0, 3).r, // miroir — le navire a poursuivi après le ramassage
      order: null,
    });
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' });
  });
});

describe('EMBARQUEMENT-PROGRAMME · D2-A/D3-A — la dépose n’arrête pas le navire', () => {
  it('dépose au 2e pas d’un navire 3 PM : il finit sur son arrêt, la cargaison PM 0, ZÉRO attaque malgré un ennemi adjacent', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'transport-test', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
        { id: 'u9', type: 'guerrier', owner: 'p2', q: H(2, 5).q, r: H(2, 5).r }, // adjacent à la cible, hors chemin
      ],
    });
    // Cible (1,5) : terrestre libre, adjacente à (1,4) — le 2e pas — mais ni
    // au départ (0,3) ni au 1er pas (0,4). Le navire dépose LÀ et poursuit
    // jusqu'à (2,4) ; la déposée n'attaque PAS l'ennemi adjacent (D4).
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 4), H(1, 4), H(2, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(1, 5)] },
        ],
      },
      1,
    );
    const dis = eventsOf(result.events, 'Disembark');
    expect(dis).toHaveLength(1);
    expect(dis[0]).toMatchObject({ unitId: 'u1', at: { q: H(1, 5).q, r: H(1, 5).r } });
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(1, 5).q, r: H(1, 5).r, aboard: null, order: null });
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(2, 4).q, r: H(2, 4).r, cargo: null });
    // D4 : ZÉRO attaque ce tour — l'ennemi adjacent (2,5) est intact, aucun combat.
    expect(getUnit(result.newState, 'u9')).toMatchObject({ q: H(2, 5).q, r: H(2, 5).r, hp: 3 });
    expect(eventsOf(result.events, 'CombatExchange')).toHaveLength(0);
  });

  it('dépose au contrôle initial : navire sans ordre, cible adjacente à sa position de départ', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
      ],
    });
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 2)] }] }, 1);
    expect(eventsOf(result.events, 'Disembark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r, aboard: null, order: null });
    expect(getUnit(result.newState, 'u2').cargo).toBeNull();
  });

  it('dépose impossible (cible jamais adjacente au chemin) → ignorée proprement, la cargaison reste à bord (journal)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
      ],
    });
    const trace = createTraceCollector(state);
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 4), H(1, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(5, 6)] }, // loin de tout pas du navire
        ],
      },
      1,
      trace,
    );
    expect(getUnit(result.newState, 'u1')).toMatchObject({ aboard: 'u2', order: null });
    expect(getUnit(result.newState, 'u2').cargo).toBe('u1');
    // Consignation dans le journal (trace de résolution).
    const lignes = JSON.stringify(trace.trace);
    expect(lignes).toContain('depose-impossible');
  });
});

describe('EMBARQUEMENT-PROGRAMME · D4 — embarquer/débarquer termine le tour', () => {
  it('embarquement : PM 0, chemin restant annulé (réécriture du test 7g historique, motif R-62)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 3)] }] }, 1);
    expect(eventsOf(result.events, 'Embark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ aboard: 'u2', order: null });
  });

  it('débarquement : aucune poursuite, aucune attaque après la dépose', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'assaut-test', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
        { id: 'u9', type: 'guerrier', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r }, // adjacent à la cible (0,2)… non : (1,2)~(0,2)
      ],
    });
    // La déposée (assaut-test, attaque 99) sort ADJACENTE à un ennemi — D4 :
    // aucune attaque planifiée, l'ennemi survit au tour.
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 2)] }] }, 1);
    expect(eventsOf(result.events, 'Disembark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u9').hp).toBe(3);
    expect(eventsOf(result.events, 'CombatExchange')).toHaveLength(0);
  });
});

describe('EMBARQUEMENT-PROGRAMME · D5 — la ville portuaire n’est jamais un embarquement', () => {
  it('entrer dans la ville où le transport est amarré = tentative de garnison, AUCUN embarquement', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 1).q, r: H(0, 1).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true }],
    });
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 2)] }] }, 1);
    expect(eventsOf(result.events, 'Embark')).toHaveLength(0);
    expect(getUnit(result.newState, 'u1').aboard).toBeNull();
    // R-30 : la ville n'accepte qu'UNE entité de défense — le guerrier est
    // refusé (il s'arrête devant), le transport reste le défenseur.
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r, cargo: null });
  });
});

describe('EMBARQUEMENT-PROGRAMME · limites du modèle programmé', () => {
  it('bateau bloqué avant son terme (océan interdit à la Galère) → l’unité qui visait l’arrêt ne rencontre rien', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(1, 5).q, r: H(1, 5).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(1, 3).q, r: H(1, 3).r },
      ],
    });
    // Le pas vers l'OCÉAN (case (2,4) surchargée) est invalide pour la
    // Galère (côte seule) : le chemin s'efface, le navire reste au départ ;
    // l'arrêt programmé n'est jamais atteint.
    (state.map[tileKeyOf(H(2, 4))] as { terrain: TerrainId }).terrain = 'ocean';
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(2, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(2, 4)] },
        ],
      },
      1,
    );
    expect(eventsOf(result.events, 'Embark')).toHaveLength(0);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(1, 5).q, r: H(1, 5).r, aboard: null });
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(1, 3).q, r: H(1, 3).r, cargo: null });
  });

  it('unité vers un pas INTERMÉDIAIRE déjà franchi → elle embarque sur le navire là où il se trouve (rev. Erik 03/10, rendez-vous virtuel)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(1, 5).q, r: H(1, 5).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    // La galère franchit (0,4) (intermédiaire) et s'arrête à (1,4) ; le
    // guerrier visait (0,4) — la case a été TRAVERSÉE ce tour : il embarque
    // (position miroir de l'arrêt du navire).
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 4), H(1, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(0, 4)] },
        ],
      },
      1,
    );
    expect(eventsOf(result.events, 'Embark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ aboard: 'u2', q: H(1, 4).q, r: H(1, 4).r, order: null });
    expect(getUnit(result.newState, 'u2').cargo).toBe('u1');
  });

  it('unité vers la case de DÉPART du navire déjà quittée → embarquement (rev. Erik 03/10)', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r },
      ],
    });
    // La galère part de (0,3) vers (0,4) ; le guerrier visait le DÉPART (0,3),
    // déjà quitté — la route du tour l'inclut : embarquement.
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u2', path: [H(0, 4)] },
          { type: 'Move', unitId: 'u1', path: [H(0, 3)] },
        ],
      },
      1,
    );
    expect(eventsOf(result.events, 'Embark')).toHaveLength(1);
    expect(getUnit(result.newState, 'u1')).toMatchObject({ aboard: 'u2', q: H(0, 4).q, r: H(0, 4).r });
  });

  it('naufrage après dépose : la déposée a quitté le bord, elle SURVIT au naufrage du transport', () => {
    let state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u1' },
        { id: 'u9', type: 'assaut-test', owner: 'p2', q: H(1, 2).q, r: H(1, 2).r },
      ],
    });
    // Tour 1 : dépose au contrôle initial sur (0,2) ; l'assaut ennemi coule
    // la galère en 3 échanges (1 PV/tour, p ≈ 1) — la déposée est déjà sur
    // la rive et SURVIT aux deux tours suivants.
    let result = resolveTurn(
      state,
      {
        p1: [{ type: 'Move', unitId: 'u1', path: [H(0, 2)] }],
        p2: [{ type: 'Attack', unitId: 'u9', target: H(0, 3) }],
      },
      1,
    );
    expect(eventsOf(result.events, 'Disembark')).toHaveLength(1);
    const attaque: Record<string, Order[]> = { p2: [{ type: 'Attack', unitId: 'u9', target: H(0, 3) }] };
    for (let t = 0; t < 3 && result.newState.units['u2']; t++) {
      result = { ...result, newState: resolveTurn(result.newState, attaque, 1).newState };
    }
    expect(result.newState.units['u2']).toBeUndefined();
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r, aboard: null });
  });
});

describe('EMBARQUEMENT-PROGRAMME · D6 — passe navale d’abord (R-41 amendée)', () => {
  it('le navire quitte la ville AVANT que le guerrier (unitId inférieur) n’y entre — garnison libre', () => {
    const state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 1).q, r: H(0, 1).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true }],
    });
    // unitId croissant traiterait u1 AVANT u2 : il trouverait la galère en
    // ville (refus D5 ou embarquement interdit) — la passe navale d'abord
    // libère la case : le guerrier y garnisonne.
    const result = resolveTurn(
      state,
      {
        p1: [
          { type: 'Move', unitId: 'u1', path: [H(0, 2)] },
          { type: 'Move', unitId: 'u2', path: [H(0, 3)] },
        ],
      },
      1,
    );
    expect(getUnit(result.newState, 'u2')).toMatchObject({ q: H(0, 3).q, r: H(0, 3).r });
    expect(getUnit(result.newState, 'u1')).toMatchObject({ q: H(0, 2).q, r: H(0, 2).r, aboard: null });
    expect(eventsOf(result.events, 'Embark')).toHaveLength(0);
  });
});

describe('EMBARQUEMENT-PROGRAMME · D7 — capacité de chargement infinie', () => {
  it('le ramassage embarque TOUTE la pile debout : le passager déjà à bord reste, la nouvelle unité embarque', () => {
    const state = coastalState({
      units: [
        { id: 'u0', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r },
        { id: 'u2', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'u0' },
      ],
      cities: [{ id: 'c1', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r, capital: true }],
    });
    const result = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u2', path: [H(0, 2)] }] }, 1);
    expect(getUnit(result.newState, 'u0')).toMatchObject({ aboard: 'u2', q: H(0, 2).q, r: H(0, 2).r });
    expect(getUnit(result.newState, 'u1')).toMatchObject({ aboard: 'u2', q: H(0, 2).q, r: H(0, 2).r });
    // `cargo` garde le PREMIER passager (compat schéma) ; la pile se lit par `aboard`.
    expect(getUnit(result.newState, 'u2').cargo).toBe('u0');
  });
});

describe('EMBARQUEMENT-PROGRAMME · reprise d’une partie en cours (chemins gelés)', () => {
  it('chemin gelé du navire (priorité 0) et chemin gelé de la cargaison : traversée + dépose au terme', () => {
    let state = coastalState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'u2' },
        {
          id: 'u2',
          type: 'galere',
          owner: 'p1',
          q: H(0, 3).q,
          r: H(0, 3).r,
          cargo: 'u1',
          order: { type: 'Move', unitId: 'u2', path: [H(0, 4), H(1, 4)] } as Extract<Order, { type: 'Move' }>,
        },
      ],
    });
    // Tour 1 — aucun ordre frais : le navire reprend son chemin gelé ; la
    // cargaison porte un chemin gelé terrestre dont le premier pas (0,5)…
    // inaccessible ce tour-ci : dépose impossible, il reste à bord.
    const t1 = resolveTurn(state, {}, 1);
    expect(getUnit(t1.newState, 'u2')).toMatchObject({ q: H(1, 4).q, r: H(1, 4).r });
    expect(getUnit(t1.newState, 'u1').aboard).toBe('u2');
    // Tour 2 — le chemin gelé de la cargaison vise (1,5), adjacent à l'arrêt.
    state = {
      ...t1.newState,
      units: {
        ...t1.newState.units,
        u1: { ...t1.newState.units['u1']!, order: { type: 'Move', unitId: 'u1', path: [H(1, 5)] } },
      },
    } as GameState;
    const t2 = resolveTurn(state, {}, 1);
    expect(eventsOf(t2.events, 'Disembark')).toHaveLength(1);
    expect(getUnit(t2.newState, 'u1')).toMatchObject({ q: H(1, 5).q, r: H(1, 5).r, aboard: null });
  });
});
