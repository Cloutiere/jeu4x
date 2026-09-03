/**
 * Scénario de bout en bout (critère d'acceptation n°2, HANDOFF §6) :
 * depuis une fixture, simuler plusieurs tours (ordres → résolution ×N)
 * incluant un combat, une fondation de ville et une capture de colon.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { tileYield } from '../src/economy.js';
import { filterEventsForPlayer, getFilteredState } from '../src/fog.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent } from '../src/events.js';

/** Fixture de campagne : deux capitales, unités des deux côtés, carte 14×8. */
function campagne(): GameState {
  return makeState({
    width: 14,
    height: 8,
    terrainOverrides: { '6,1': 'foret', '5,2': 'colline' },
    cities: [
      { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
      { id: 'c2', owner: 'p2', q: 13, r: 1, capital: true },
    ],
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }, // défend la capitale
      { id: 'u2', type: 'colon', owner: 'p1', q: 1, r: 0 },
      { id: 'u5', type: 'colon', owner: 'p1', q: 2, r: 1 },
      { id: 'u3', type: 'guerrier', owner: 'p2', q: 6, r: 1 }, // en forêt
      { id: 'u4', type: 'guerrier', owner: 'p2', q: 13, r: 1 }, // défend la capitale
    ],
  });
}

/** Invariants vérifiés après chaque tour de campagne. */
function checkInvariants(state: GameState): void {
  expect(state.phase).toBe('orders');
  const seen = new Set<string>();
  for (const u of Object.values(state.units)) {
    const key = `${u.q},${u.r}`;
    expect(seen.has(key)).toBe(false); // R-30 : non-empilement
    seen.add(key);
    expect(state.map[key]).toBeDefined(); // jamais hors carte
  }
  for (const seq of state.units ? [] : []) void seq;
  const seqs = new Set<number>();
  void seqs;
}

describe('Campagne multi-tours (critère 2)', () => {
  it('5 tours : fondation de ville + capture d’un colon, état cohérent à chaque tour', () => {
    let state = campagne();
    const allEvents: GameEvent[] = [];
    const step = (orders: Record<string, Order[]>, seed: number) => {
      const r = resolveTurn(state, orders, seed);
      expect(r.newState.turn).toBe(state.turn + 1);
      state = r.newState;
      allEvents.push(...r.events);
      checkInvariants(state);
      return r;
    };

    // Tour 1 : u2 (colon) file fonder une ville ; u5 avance ; u3 (p2) avance.
    step(
      {
        p1: [{ type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }, { q: 3, r: 0 }] }],
        p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 5, r: 1 }] }],
      },
      11,
    );
    expect(unitPos(state, 'u2')).toEqual({ q: 3, r: 0 });

    // Tour 2 : fondation de ville — distance à c1 : (3,0)↔(0,0) = 3 ≥ T-09.
    step({ p1: [{ type: 'FoundCity', unitId: 'u2' }] }, 12);
    expect(allEvents.some((e) => e.type === 'CityFounded')).toBe(true);
    expect(state.units['u2']).toBeUndefined(); // colon consommé (R-64)
    const newCity = Object.values(state.cities).find((c) => c.q === 3 && c.r === 0)!;
    // 7i · D3 : fondation à pop 2 (ère Antique) — 2 citoyens auto-assignés
    expect(newCity).toMatchObject({ owner: 'p1', capital: false, pop: 2 });
    expect(state.map['3,0']!.terrain).toBe('ville');

    // Tour 3 : u5 marche vers le guerrier ennemi ; u3 avance aussi.
    // Ordre de traitement (R-41) : u3 (id 3) avant u5 (id 5) → u3 prend (4,1),
    // puis u5 aboutit sur ce mover ennemi → collision → pacifique capturé (R-53/R-43).
    step(
      {
        p1: [{ type: 'Move', unitId: 'u5', path: [{ q: 3, r: 1 }, { q: 4, r: 1 }] }],
        p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 4, r: 1 }] }],
      },
      13,
    );
    expect(allEvents.some((e) => e.type === 'Captured' && e.outcome === 'destroyed')).toBe(true);
    expect(allEvents.some((e) => e.type === 'BootyGold' && e.player === 'p2' && e.amount === 10)).toBe(true);
    expect(state.units['u5']).toBeUndefined();
    // T-12 : butin 10. 7i · R-66 (rév.) : le commerce du centre suit la
    // tranche démographique (0 pour pop ≤ 6) — c2 ne génère plus d'or de centre.
    expect(state.players['p2']!.gold).toBe(10);

    // Tour 4 : le guerrier p1 se met en marche (chemin multi-tours).
    step({ p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }] }, 14);
    expect(unitPos(state, 'u1')).toEqual({ q: 1, r: 0 });

    // Tour 5 : production dans la ville neuve + reprise du chemin gelé de u1.
    step(
      {
        p1: [
          { type: 'SetProduction', cityId: newCity.id, item: { kind: 'unit', id: 'guerrier' } },
          // pas de nouvel ordre Move pour u1 : son chemin gelé reprend
        ],
      },
      15,
    );
    expect(state.cities[newCity.id]!.production).toMatchObject({ item: { kind: 'unit', id: 'guerrier' } });
    expect(unitPos(state, 'u1')).toEqual({ q: 2, r: 0 }); // reprise multi-tours

    // Bilan de campagne.
    expect(state.winner).toBeNull();
    expect(state.turn).toBe(5);
    // Le journal reste filtrable par brouillard ; u1 (distance 3 de u3) est
    // hors de vue de p2 : il ne doit pas apparaître dans son état filtré.
    const seenByP1 = filterEventsForPlayer(state, 'p1', allEvents);
    expect(seenByP1.length).toBeGreaterThan(0);
    const foggedForP2 = getFilteredState(state, 'p2');
    expect(foggedForP2.units['u1']).toBeUndefined();
  });

  it('combat explicite entre guerriers au fil de la campagne (CombatExchange présent)', () => {
    let state = campagne();
    const allEvents: GameEvent[] = [];
    const step = (orders: Record<string, Order[]>, seed: number) => {
      const r = resolveTurn(state, orders, seed);
      state = r.newState;
      allEvents.push(...r.events);
      checkInvariants(state);
    };

    // t1 : u1 se dégage de sa capitale (u2 s'écarte), u3 descend vers le centre.
    step(
      {
        p1: [
          { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] },
          { type: 'Move', unitId: 'u2', path: [{ q: 1, r: 1 }] },
        ],
        p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 5, r: 1 }] }],
      },
      21,
    );
    expect(unitPos(state, 'u1')).toEqual({ q: 0, r: 0 }); // bloqué par u2 (R-30), chemin gelé
    // t2 : u1 reprend automatiquement son chemin ; u3 continue.
    step({ p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 4, r: 1 }] }] }, 22);
    expect(unitPos(state, 'u1')).toEqual({ q: 1, r: 0 });
    // t3 : u1 → (2,0) ; u3 → (4,0).
    step({ p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 4, r: 0 }] }] }, 23);
    expect(unitPos(state, 'u1')).toEqual({ q: 2, r: 0 });
    // t4 : u1 → (3,0), adjacent à u3 (4,0).
    step({}, 24);
    expect(unitPos(state, 'u1')).toEqual({ q: 3, r: 0 });
    // t5 : attaque explicite (I-2 : PM frais requis — u1 n'a pas bougé ce tour).
    step({ p1: [{ type: 'Attack', unitId: 'u1', target: { q: 4, r: 0 } }] }, 25);

    const exchanges = allEvents.filter((e) => e.type === 'CombatExchange');
    expect(exchanges.length).toBe(1);
    // l'échange retire exactement 1 PV au total (T-03 = 1) entre 3 et 3 PV
    const ex = exchanges[0] as Extract<GameEvent, { type: 'CombatExchange' }>;
    expect(ex.attackerHpAfter + ex.defenderHpAfter).toBe(5);
    const u1 = state.units['u1']!;
    const u3 = state.units['u3']!;
    expect(u1.hp + u3.hp).toBe(5);
    expect(state.winner).toBeNull();
    expect(state.turn).toBe(5);
  });
});

function unitPos(state: GameState, id: string): { q: number; r: number } {
  const u = state.units[id]!;
  return { q: u.q, r: u.r };
}

// ---------------------------------------------------------------------------
// Phase 6 — scénario économique de bout en bout (HANDOFF-PHASE6 §L5)
// Fonder une ville → pop 2 par les vrais rendements (jauge R-63) → assigner
// un citoyen à une plaine → construire le Grenier (+1 N sur la case) →
// réassigner → construire le Tribunal → rayon 2 (cases à distance 2).
// ---------------------------------------------------------------------------

describe('Phase 6 · scénario économique de bout en bout', () => {
  function ecoMap(): GameState {
    return makeState({
      width: 12,
      height: 12,
      // 7i : anneau 1 en plaine (1 N) — la consommation D1 rend la croissance
      // moins triviale et rend le scénario lisible.
      terrainOverrides: {
        '4,5': 'plaine', '4,6': 'plaine', '5,4': 'plaine',
        '5,6': 'plaine', '6,4': 'plaine', '6,5': 'plaine', '3,5': 'montagne',
      },
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
  }

  it('fondation → croissance → Grenier (+1 N) → réassignation → Tribunal (rayon 2)', () => {
    let state = ecoMap();
    // Phase 7a (R-87) : Grenier et Tribunal sont désormais verrouillés par
    // Poterie / Lettres — le scénario économique les débloque en amont.
    state.players['p1']!.techsUnlocked = ['poterie', 'lettres'];
    const allEvents: GameEvent[] = [];
    const step = (orders: Record<string, Order[]>): void => {
      const r = resolveTurn(state, orders, 42);
      state = r.newState;
      allEvents.push(...r.events);
    };

    // Tour 1 : fondation. 7i · D3 : pop 2 → 2 citoyens auto-assignés
    // (plaines 1 N) ; réserve = SURPLUS = (2+1+1) récolte − 2 citoyens = 2
    // (7i · D1 · R-63 rév.).
    step({ p1: [{ type: 'FoundCity', unitId: 'u1' }] });
    const cityId = Object.keys(state.cities)[0]!;
    expect(state.cities[cityId]!.pop).toBe(2);
    expect(state.cities[cityId]!.workedTiles.length).toBe(2);
    expect(state.cities[cityId]!.foodStored).toBe(2);

    // Tours 2-3 : surplus 2/tour → réserve 6 = seuil vers pop 3 (growth.json)
    // → croissance au tour 3.
    step({});
    step({});
    expect(state.cities[cityId]!.pop).toBe(3);
    expect(allEvents.some((e) => e.type === 'PopulationGrew')).toBe(true);
    expect(state.cities[cityId]!.workedTiles.length).toBe(3); // +1 citoyen auto-assigné (R-60)

    // Tour 4 : ville pleine (pop 3, 3 citoyens) → on désassigne d'abord
    // (règle d'Erik : pas d'échange automatique) + Grenier en file.
    // Le citoyen intérieur (7i · R-60bis) produit : 1 (centre) + 1 (intérieur)
    // → floor(2 × 1,5) = 3 marteaux/tour (bonus pop R-63).
    step({
      p1: [
        { type: 'SetWorkedTile', cityId, tile: null },
        { type: 'SetProduction', cityId, item: { kind: 'building', id: 'grenier' } },
      ],
    });
    expect(state.cities[cityId]!.workedTiles).toHaveLength(2);
    expect(state.cities[cityId]!.production!.progress).toBe(3); // production du tour : centre 1 + intérieur 1 (R-60bis) × bonus pop

    // Tour 5 : le citoyen libéré est assigné à la plaine (5,6).
    step({ p1: [{ type: 'SetWorkedTile', cityId, tile: '5,6' }] });
    expect(state.cities[cityId]!.workedTiles).toContain('5,6');

    // Le Grenier s'achève quand la progression atteint son coût (R-62/R-66) :
    // on amène la file au bord (la progression est conservée tour à tour).
    state.cities[cityId]!.production!.progress = 39;
    step({}); // 39 + production du tour → complété (coût exact 7e : 40)
    // 7e : la ville fondée est capitale → le Palais y est posé par le moteur.
    expect(state.cities[cityId]!.buildings).toEqual(['palais', 'grenier']);
    expect(allEvents.some((e) => e.type === 'BuildingCompleted' && e.building === 'grenier')).toBe(true);

    // R-66 : le Grenier donne +1 N sur la plaine travaillée — le gain de
    // nourriture du tour suivant intègre le bonus (centre + Σ rendements
    // effectifs des cases travaillées, Grenier compris).
    const tiles = [...state.cities[cityId]!.workedTiles];
    // stock remis à zéro + population forcée à 4 pour isoler la mesure d'un
    // tour (sinon la croissance R-63 rév. se déclencherait : le surplus du
    // Grenier atteint pile le seuil de la table)
    state.cities[cityId]!.foodStored = 0;
    state.cities[cityId]!.pop = 4;
    // 7i · D1 : la réserve reçoit le SURPLUS (récolte − population).
    const expectedFood =
      2 + tiles.reduce((acc, key) => acc + tileYield(state.map, ['grenier'], key)!.food, 0) -
      state.cities[cityId]!.pop;
    step({});
    expect(state.cities[cityId]!.foodStored).toBe(expectedFood);
    expect(expectedFood).toBeGreaterThan(
      2 + tiles.reduce((a, k) => a + tileYield(state.map, [], k)!.food, 0) - state.cities[cityId]!.pop,
    ); // le bonus du Grenier se sent vraiment

    // 7i : stock et population recadrés pour garder le scénario déterministe
    // (la consommation D1 + la table de croissance feraient pousser la ville
    // pendant les tours suivants).
    state.cities[cityId]!.foodStored = 0;
    state.cities[cityId]!.pop = 3;
    // Tribunal en file (40 🔶), achevé au tour suivant.
    state.cities[cityId]!.production = { item: { kind: 'building', id: 'tribunal' }, progress: 79 };
    step({}); // 79 + production du tour → complété (coût exact 7e : 80)
    expect(state.cities[cityId]!.buildings).toEqual(['palais', 'grenier', 'tribunal']);

    // Rayon 2 (T-08b + Tribunal) : la montagne (3,5) — distance 2 — devient
    // travaillable (R-60/R-66). Ville pleine : il faut d'abord DÉSASSIGNER un
    // citoyen (tour A), puis l'assigner au tour B (règle d'Erik : pas
    // d'échange automatique).
    step({ p1: [{ type: 'SetWorkedTile', cityId, tile: null }] });
    step({ p1: [{ type: 'SetWorkedTile', cityId, tile: '3,5' }] });
    expect(state.cities[cityId]!.workedTiles).toContain('3,5');
    // length ≤ pop : la croissance (R-63) peut ajouter un citoyen entre-temps
    expect(state.cities[cityId]!.workedTiles.length).toBeLessThanOrEqual(state.cities[cityId]!.pop);
    // Sans Tribunal, ce même ordre aurait été refusé (couvert par economy.test.ts).

    // Propriété transversale : chaque case travaillée l'est par une seule ville.
    const seen = new Set<string>();
    for (const c of Object.values(state.cities)) {
      for (const key of c.workedTiles) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
});
