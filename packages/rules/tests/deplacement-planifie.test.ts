/**
 * DEPLACEMENT-PLANIFIE — tests moteur (R-158..R-161, décisions D1..D6 d'Erik
 * du 06/09). Voir HANDOFF-DEPLACEMENT-PLANIFIE.md et RULES.md §4bis.
 *
 *  - R-158 (D5) : ordre composite MultiStep — déplacement(s) puis UNE action
 *    finale, dans la limite des PM ; échec partiel = exécution partielle.
 *  - R-159 (D2/D3) : priorité de destination = chronologie de programmation ;
 *    repli sur la dernière case libre avant la destination.
 *  - R-160 (D1) : aperçu optimiste + cases disputées (previewPrograms).
 *  - R-161 (D6) : limite de pénétration du fog — 1 case inconnue par tour.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateState } from '../src/state.js';
import type { GameState, Order } from '../src/state.js';
import { DEPLACEMENT } from '../src/data.js';
import { disputedTilesOf, previewPrograms } from '../src/preview.js';

function unit(state: GameState, id: string) {
  return state.units[id]!;
}

/** Marque comme explorées toutes les cases du rectangle (0..w, 0..h). */
function exploreAll(state: GameState, player: string, w: number, h: number): void {
  const explored: string[] = [];
  for (let q = 0; q <= w; q++) for (let r = 0; r <= h; r++) explored.push(`${q},${r}`);
  state.players[player]!.vision.explored = explored;
}

describe('R-158 · forme d\'ordre composite MultiStep (D5)', () => {
  it('Colon 2 PM = bouger 1 case PUIS fonder dans le même tour', () => {
    const state = makeState({ units: [{ id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 }] });
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }], final: 'foundCity' }],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    expect(Object.values(newState.cities).some((c) => c.q === 1 && c.r === 0)).toBe(true);
    expect(unit(newState, 'col')).toBeUndefined(); // le Colon est consommé (R-64)
    expect(events.some((e) => e.type === 'CityFounded' && e.owner === 'p1')).toBe(true);
  });

  it('PM insuffisants au terme du chemin → action finale ANNULÉE, mouvement conservé', () => {
    const state = makeState({ units: [{ id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 }] });
    exploreAll(state, 'p1', 6, 6);
    // Colon 2 PM, chemin de 2 cases : il arrive à (2,0) avec 0 PM → pas de fondation.
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], final: 'foundCity' }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(newState.cities && Object.keys(newState.cities).length === 0).toBe(true);
    expect(unit(newState, 'col')).toMatchObject({ q: 2, r: 0 }); // le mouvement, lui, a eu lieu
  });

  it('Chemin bloqué en cours d\'étapes → l\'exécutable est fait, l\'action finale annulée', () => {
    const state = makeState({
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'bloc', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      ],
    });
    exploreAll(state, 'p1', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], final: 'foundCity' }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'col')).toMatchObject({ q: 1, r: 0 }); // arrêt devant l'ami (R-30/R-42)
    expect(Object.keys(newState.cities).length === 0 || !Object.values(newState.cities).some((c) => c.q === 2 && c.r === 0)).toBe(true);
    // chemin gelé conservé SOUS forme composite (R-158)
    expect(unit(newState, 'col')!.order?.type).toBe('MultiStep');
  });

  it('D4 : un composite dont le dernier pas entre sur un ENNEMI = attaque (combat existant, aucun nouveau duel)', () => {
    const state = makeState({
      units: [
        { id: 'att', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'def', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
      ],
    });
    unit(state, 'att').mp = 2; // 2 pas : (1,0) puis entrée chez l'ennemi
    exploreAll(state, 'p1', 6, 6);
    exploreAll(state, 'p2', 6, 6);
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'att', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    // Le combat EXISTANT se déclenche (échange, ou issue directe selon le tir
    // seedé R-80) — aucun nouveau mécanisme : l'entrée = attaque (R-42/D4).
    const combat = events.some((e) => ['CombatExchange', 'UnitDestroyed', 'Retreat'].includes(e.type));
    expect(combat || unit(newState, 'def')!.hp < 3 || !unit(newState, 'def')).toBe(true);
    expect(events.some((e) => e.type === 'Move' && e.unitId === 'att' && e.to.q === 1)).toBe(true); // le déplacement a eu lieu
  });

  it('deplacement.json : limite de PM de l\'action finale et actions finales data-driven', () => {
    expect(DEPLACEMENT.mpCostOfFinalAction).toBe(1);
    expect(DEPLACEMENT.multiStepFinalActions).toContain('foundCity');
  });
});

describe('R-159 · destinations disputées entre amies (D2/D3)', () => {
  function threeUnits(): GameState {
    return makeState({
      width: 12,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
        { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
      ],
    });
  }

  it('3 unités vers la même case : la première programmée gagne, les autres restent sur place (repli à 0 case)', () => {
    const state = threeUnits();
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u2', path: [{ q: 1, r: 1 }] },
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 1 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 1, r: 1 }] },
      ],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 1 }); // gagnante
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 });
    expect(unit(newState, 'u3')).toMatchObject({ q: 2, r: 2 });
  });

  it('Repli à mi-chemin avec PM restants : la perdante avance au maximum et s\'arrête avant la destination', () => {
    const state = makeState({
      width: 12,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 0, r: 4 },
      ],
    });
    unit(state, 'u1').mp = 2;
    unit(state, 'u2').mp = 2;
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u2', path: [{ q: 0, r: 3 }] }, // programmée en premier → gagne (0,3)
        { type: 'Move', unitId: 'u1', path: [{ q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 }] }, // tronquée avant (0,3)
      ],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u2')).toMatchObject({ q: 0, r: 3 }); // destination disputée
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 2 }); // dernière case libre avant la destination
    // NB : le MP lu en fin de tour est régénéré au max (R-72) — la
    // consommation des PM est vérifiée par la position (2 pas sur chemin 3).
  });

  it('Un chemin gelé (programmé au tour précédent) a la priorité la plus ancienne (R-159/D3)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      ],
    });
    unit(state, 'u1').order = { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }; // gelé (tour antérieur)
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
    expect(unit(newState, 'u2')).toMatchObject({ q: 2, r: 0 });
  });

  it('Les membres d\'un FormArmy ne sont PAS soumis à la troncature de dispute (R-44)', () => {
    const state = makeState({
      width: 12,
      units: [
        { id: 'a1', type: 'guerrier', owner: 'p1', q: 0, r: 1 },
        { id: 'a2', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'a3', type: 'guerrier', owner: 'p1', q: 2, r: 1 },
      ],
    });
    const rally = { q: 1, r: 1 };
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'a1', path: [rally] },
        { type: 'Move', unitId: 'a2', path: [rally] },
        { type: 'Move', unitId: 'a3', path: [rally] },
        { type: 'FormArmy', members: ['a1', 'a2', 'a3'], rally },
      ],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    expect(events.some((e) => e.type === 'ArmyFormed')).toBe(true);
    expect(Object.values(newState.units).some((u) => u.isArmy)).toBe(true);
  });
});

describe('R-161 · limite de pénétration du fog (D6)', () => {
  function fogState(): GameState {
    const state = makeState({ width: 20, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    unit(state, 'u1').mp = 5;
    return state;
  }

  it('Une unité à 5 PM entre sur la PREMIÈRE case inconnue et s\'y arrête', () => {
    const state = fogState();
    // exploré : (0,0) et (1,0) uniquement — (2,0) et au-delà sont inconnus.
    state.players['p1']!.vision.explored = ['0,0', '1,0'];
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 }] }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 2, r: 0 }); // première inconnue, arrêt
    expect(unit(newState, 'u1')!.order).toBeNull(); // le reste du chemin est ignoré
  });

  it('Case inconnue INFRACHISSABLE → arrêt AVANT le fog (aucune entrée)', () => {
    const state = fogState();
    state.players['p1']!.vision.explored = ['0,0', '1,0', '2,0'];
    state.map['3,0'] = { terrain: 'montagne', resource: null }; // inconnue et infranchissable
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 2, r: 0 });
  });

  it('Un composite qui entre dans le fog → action finale ANNULÉE (R-161 × R-158)', () => {
    const state = makeState({ width: 20, units: [{ id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 }] });
    unit(state, 'col').mp = 5;
    state.players['p1']!.vision.explored = ['0,0', '1,0']; // (2,0) inconnue
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }], final: 'foundCity' }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'col')).toMatchObject({ q: 2, r: 0 });
    expect(Object.keys(newState.cities).length === 0 || !Object.values(newState.cities).some((c) => c.q === 2 && c.r === 0)).toBe(true);
  });

  it('deplacement.json : la limite est data-driven (1 case inconnue par tour)', () => {
    expect(DEPLACEMENT.fogUnknownEntriesPerTurn).toBe(1);
  });
});

describe('R-158 · migration schemaVersion 18 → 19', () => {
  it('les chemins gelés Move deviennent des composites à une étape (sans perte), idempotent', () => {
    const v18 = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] }) as unknown as Record<string, unknown>;
    v18.schemaVersion = 18;
    (v18.units as Record<string, Record<string, unknown>>)['u1']!.order = {
      type: 'Move',
      unitId: 'u1',
      path: [{ q: 1, r: 0 }],
    };
    const migrated = migrateState(v18);
    expect(migrated.schemaVersion).toBe(19);
    expect(CURRENT_SCHEMA_VERSION).toBe(19);
    const order = migrated.units['u1']!.order;
    expect(order?.type).toBe('MultiStep');
    if (order?.type === 'MultiStep') {
      expect(order.path).toEqual([{ q: 1, r: 0 }]);
      expect(order.final).toBeUndefined();
    }
    // idempotent : re-migrer un état 19 ne change rien
    expect(migrateState(migrated as unknown as Record<string, unknown>).units['u1']!.order).toEqual(order);
  });

  it('la migration 19 existe dans la chaîne', () => {
    expect(MIGRATIONS[19]).toBeDefined();
  });

  it('une partie pré-19 dont l\'unité a un chemin gelé reprend et le chemin s\'exécute', () => {
    const v18 = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] }) as unknown as Record<string, unknown>;
    v18.schemaVersion = 18;
    (v18.units as Record<string, Record<string, unknown>>)['u1']!.order = {
      type: 'Move',
      unitId: 'u1',
      path: [{ q: 1, r: 0 }],
    };
    const resumed = migrateState(v18);
    const { newState } = resolveTurn(resumed, {}, 1);
    expect(newState.units['u1']).toMatchObject({ q: 1, r: 0 });
  });
});

describe('R-160 · aperçu optimiste (D1) — previewPrograms', () => {
  it('chemin prévu, destination, action finale ; cases disputées surlignées et gagnant R-159', () => {
    const state = makeState({
      width: 12,
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 2 },
      ],
    });
    exploreAll(state, 'p1', 12, 12);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] },
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
        { type: 'MultiStep', unitId: 'col', path: [{ q: 1, r: 2 }], final: 'foundCity' },
      ],
    };
    const previews = previewPrograms(state, orders);
    const u2 = previews.find((p) => p.unitId === 'u2')!;
    const u1 = previews.find((p) => p.unitId === 'u1')!;
    const col = previews.find((p) => p.unitId === 'col')!;
    expect(u1.destination).toEqual({ q: 1, r: 0 });
    expect(u1.disputed).toBe(true);
    expect(u1.disputedWinner).toBe(false); // programmée après u2
    expect(u2.disputed).toBe(true);
    expect(u2.disputedWinner).toBe(true);
    expect(col.final).toBe('foundCity');
    expect(col.disputed).toBe(false);
    expect(disputedTilesOf(previews)).toEqual(['1,0']);
  });

  it('le fog tronque l\'aperçu : flèche au bord du visible + un pas, jamais au-delà (D6)', () => {
    const state = makeState({ width: 12, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    state.players['p1']!.vision.explored = ['0,0', '1,0'];
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] }],
    };
    const previews = previewPrograms(state, orders);
    expect(previews[0]!.path).toEqual([{ q: 1, r: 0 }, { q: 2, r: 0 }]); // + un pas dans l'inconnu, le reste est tu
    expect(previews[0]!.destination).toEqual({ q: 2, r: 0 });
  });

  it('l\'aperçu sur ÉTAT FILTRÉ ne révèle rien au-delà du visible (pas de fuite fog)', () => {
    // Cas limite : même si un état complet était passé, la troncature fog
    // borne le chemin au premier pas inconnu — l'identité du reste n'existe
    // nulle part dans l'aperçu.
    const state = makeState({ width: 12, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    state.players['p1']!.vision.explored = ['0,0'];
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }] }],
    };
    const previews = previewPrograms(state, orders);
    // (1,0) est le premier pas inconnu : l'aperçu s'arrête dessus.
    expect(previews[0]!.path).toEqual([{ q: 1, r: 0 }]);
    expect(previews[0]!.destination).toEqual({ q: 1, r: 0 });
  });
});

describe('R-158..R-161 · déterminisme', () => {
  it('même (state, orders, seed) → même résultat bit à bit (R-80)', () => {
    const state = makeState({
      width: 12,
      units: [
        { id: 'col', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
        { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 2 },
      ],
    });
    exploreAll(state, 'p1', 12, 12);
    exploreAll(state, 'p2', 12, 12);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'MultiStep', unitId: 'u2', path: [{ q: 1, r: 1 }], final: 'foundCity' },
        { type: 'Move', unitId: 'u3', path: [{ q: 1, r: 1 }] },
      ],
    };
    const a = resolveTurn(structuredClone(state), structuredClone(orders), 42);
    const b = resolveTurn(structuredClone(state), structuredClone(orders), 42);
    expect(a.newState).toEqual(b.newState);
    expect(a.events).toEqual(b.events);
  });
});

describe('FLECHE-MOUVEMENT · persistance de la flèche entre les tours (M3)', () => {
  function solo(): GameState {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    exploreAll(state, 'p1', 8, 8);
    return state;
  }

  const longChemin = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];

  it('mouvement INACHEVÉ (PM épuisés) : la flèche persiste — chemin gelé = chemin restant, montré par l\'aperçu du tour suivant', () => {
    const state = solo();
    unit(state, 'u1').mp = 2; // 2 pas sur 3 : il restera (3,0)
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: longChemin }] };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 2, r: 0 });
    // La flèche demeure : le chemin gelé contient le RESTE (miroir moteur, pas un état UI inventé).
    const gelé = unit(newState, 'u1')!.order;
    expect(gelé).toMatchObject({ path: [{ q: 3, r: 0 }] }); // forme de l'ordre source (Move), chemin restant
    // L'aperçu du tour suivant (aucun nouvel ordre) montre ce chemin restant.
    const previews = previewPrograms(newState, { p1: [] });
    expect(previews.find((p) => p.unitId === 'u1')).toMatchObject({ path: [{ q: 3, r: 0 }], destination: { q: 3, r: 0 } });
  });

  it('mouvement ACHÉVÉ : la flèche disparaît — ordre consommé (unit.order null)', () => {
    const state = solo();
    unit(state, 'u1').mp = 3;
    const orders: Record<string, Order[]> = { p1: [{ type: 'Move', unitId: 'u1', path: longChemin }] };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 3, r: 0 });
    expect(unit(newState, 'u1')!.order).toBeNull();
    const previews = previewPrograms(newState, { p1: [] });
    expect(previews.find((p) => p.unitId === 'u1')).toBeUndefined();
  });

  it('mouvement INTERROMPU (conflit de destination R-159, repli à 0) : pas de flèche fantôme — la position réelle fait foi', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      ],
    });
    exploreAll(state, 'p1', 8, 8);
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u2', path: [{ q: 1, r: 1 }] }, // première programmée : gagne
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 1 }] }, // perdante : reste sur place
      ],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 });
    expect(unit(newState, 'u1')!.order).toBeNull(); // aucun chemin gelé résiduel
    const previews = previewPrograms(newState, { p1: [] });
    expect(previews.find((p) => p.unitId === 'u1')).toBeUndefined();
  });
});
