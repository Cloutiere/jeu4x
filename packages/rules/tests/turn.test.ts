import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { createRng } from '../src/rng.js';
import { makeState, unit, unitAt, cityAt } from '../src/fixtures.js';
import { registerTestUnitType } from '../src/data.js';
import type { GameState, Order } from '../src/state.js';
import type { GameEvent } from '../src/events.js';

/** R-59 : unité à distance de test (aucune en v1, règles normatives). */
registerTestUnitType({
  id: 'catapulte-test',
  name: 'Catapulte (test)',
  attack: 4,
  defense: 1,
  movement: 1,
  hpMax: 3,
  cost: 20,
  visionRadius: 2,
  canAttack: true,
  canFoundCity: false,
  isRanged: true,
});

function eventsOf(result: { events: GameEvent[] }): GameEvent[] {
  return result.events;
}

/** Graine dont le premier tir fait perdre 1 PV au défenseur (p = 0.5 entre égaux). */
function seedWhereDefenderIsHit(): number {
  for (let s = 0; s < 1000; s++) {
    if (createRng(s).next() < 0.5) return s;
  }
  throw new Error('pas de graine trouvée');
}
/** Graine dont le premier tir fait perdre 1 PV à l'attaquant. */
function seedWhereAttackerIsHit(): number {
  for (let s = 0; s < 1000; s++) {
    if (createRng(s).next() >= 0.5) return s;
  }
  throw new Error('pas de graine trouvée');
}

describe('Phase A · R-40/R-41 · mouvement garanti, ordre déterministe', () => {
  it('R-40 : un déplacement vers une case vide s’exécute toujours', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
    expect(newState.units['u1']!.order).toBeNull(); // chemin consommé
    // R-72 : les PM sont régénérés en Phase D, après avoir été consommés ici
    expect(unit(newState, 'u1').mp).toBe(1);
    expect(events.some((e) => e.type === 'Move' && e.unitId === 'u1')).toBe(true);
  });

  it('R-41 : deux movers vers la même case — le plus petit unitId passe d’abord', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] },
        { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
      ],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
    expect(unit(newState, 'u2')).toMatchObject({ q: 2, r: 0 }); // bloqué par l’ami
  });

  it('R-42 : occupé par un ami → arrêt sur la case précédente, chemin restant conservé', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 2, r: 0 },
      ],
    });
    const { newState } = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }] },
      1,
    );
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
    expect(newState.units['u1']!.order).toEqual({
      type: 'Move',
      unitId: 'u1',
      path: [{ q: 2, r: 0 }],
    });
  });

  it('R-42 : terrain infranchissable / hors carte → chemin invalide, effacé', () => {
    const state = makeState({
      terrainOverrides: { '1,0': 'montagne' },
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    });
    const { newState } = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }] },
      1,
    );
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 });
    expect(newState.units['u1']!.order).toBeNull();

    const state2 = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const r2 = resolveTurn(state2, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: -9, r: -9 }] }] }, 1);
    expect(unit(r2.newState, 'u1')).toMatchObject({ q: 0, r: 0 });
  });

  it('R-42 (halte) : un ennemi qui DEVIENT visible gèle le reste du chemin', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 }, // vision 2, PM 2
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 3, r: 0 }, // distance 3 au départ
      ],
    });
    const { newState } = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] }] },
      1,
    );
    // après 1 pas, u2 (distance 2) devient visible → halte sur (1,0)
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
    expect(newState.units['u1']!.order).toEqual({
      type: 'Move',
      unitId: 'u1',
      path: [{ q: 2, r: 0 }, { q: 3, r: 0 }],
    });
  });

  it('le chemin gelé reprend au tour suivant (ordre multi-tours)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 3, r: 0 },
      ],
    });
    const r1 = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] }] },
      1,
    );
    // tour 2 : aucun nouvel ordre, u2 s'est éloigné → le chemin repris s'exécute
    const r1State = r1.newState;
    r1State.units['u2']!.q = 10;
    r1State.units['u2']!.r = 10;
    const r2 = resolveTurn(r1State, {}, 1);
    expect(unit(r2.newState, 'u1').q).toBeGreaterThan(1);
  });
});

describe('Phase A · R-43 · unités pacifiques', () => {
  it('un Colon qui aboutit sur un ennemi est détruit + butin T-12 (I-3/I-4)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 1);
    expect(newState.units['u1']).toBeUndefined();
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0 }); // le Guerrier ne bouge pas
    expect(newState.players['p2']!.gold).toBe(10); // T-12
    const captured = events.find((e) => e.type === 'Captured');
    expect(captured).toMatchObject({ unitId: 'u1', byPlayer: 'p2', outcome: 'destroyed' });
    expect(events.some((e) => e.type === 'BootyGold' && e.amount === 10)).toBe(true);
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.cause === 'capture')).toBe(true);
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(false); // jamais de combat
  });

  it('un ennemi qui entre sur la case d’un Colon le capture (R-57)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] }] }, 1);
    expect(newState.units['u1']).toBeUndefined();
    expect(newState.players['p2']!.gold).toBe(10);
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0 }); // avancée sur la case
    expect(events.some((e) => e.type === 'Captured' && e.outcome === 'destroyed')).toBe(true);
  });
});

describe('Phase A · R-44/R-31 · formation d’armées', () => {
  function threeGuerriers(): GameState {
    return makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 0 },
        { id: 'u3', type: 'guerrier', owner: 'p1', q: 2, r: 1 },
      ],
    });
  }
  const form: Order = { type: 'FormArmy', members: ['u1', 'u2', 'u3'], rally: { q: 2, r: 0 } };

  it('3 mêmes types au rendez-vous → fusion (stats sommées, PV ≤ 9)', () => {
    // les membres doivent ATTEINDRE le rendez-vous : ordres Move + FormArmy (R-31/R-44)
    const orders: Record<string, Order[]> = {
      p1: [
        form,
        { type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] },
        { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] },
        { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 0 }] },
      ],
    };
    const { newState, events } = resolveTurn(threeGuerriers(), orders, 1);
    const formed = events.find((e) => e.type === 'ArmyFormed');
    expect(formed).toBeDefined();
    const armyId = (formed as Extract<GameEvent, { type: 'ArmyFormed' }>).unitId;
    expect(newState.units[armyId]).toMatchObject({
      q: 2, r: 0, isArmy: true, hp: 9, owner: 'p1',
    });
    for (const m of ['u1', 'u2', 'u3']) expect(newState.units[m]).toBeUndefined();
    // R-30 : une seule entité sur la case
    expect(unitAt(newState, 2, 0)?.id).toBe(armyId);
  });

  it('membres incomplets → pas de fusion, R-30 rétablie par éparpillement', () => {
    const state = threeGuerriers();
    delete state.units['u3']; // u3 n'existe plus : formation impossible
    const { newState, events } = resolveTurn(
      state,
      { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] }, { type: 'Move', unitId: 'u2', path: [{ q: 2, r: 0 }] }] },
      1,
    );
    expect(events.some((e) => e.type === 'ArmyFormed')).toBe(false);
    // les deux membres co-localisés ont été éparpillés : une entité par case
    const positions = Object.values(newState.units).map((u) => `${u.q},${u.r}`);
    expect(new Set(positions).size).toBe(Object.keys(newState.units).length);
  });
});

describe('Phase B · R-52/R-54 · attaque d’un défenseur stationnaire', () => {
  it('survie mutuelle : le défenseur garde sa case, l’attaquant replie à son origine (R-54-1)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 5);
    // échange unique : 1 PV perdu au total (3 PV chacun, T-03 = 1)
    const u1 = unit(newState, 'u1');
    const u2 = unit(newState, 'u2');
    expect(u1.hp + u2.hp).toBe(5);
    expect(u1).toMatchObject({ q: 0, r: 0 }); // repli à l’origine
    expect(u2).toMatchObject({ q: 1, r: 0 }); // défenseur conserve
    expect(events.some((e) => e.type === 'Retreat' && e.unitId === 'u1')).toBe(true);
    expect(events.filter((e) => e.type === 'CombatExchange')).toHaveLength(1);
  });

  it('défenseur à 0 PV → mort, avancée de l’attaquant + vétéran (R-32, I-2)', () => {
    const seed = seedWhereDefenderIsHit();
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0, hp: 1 },
      ],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, seed);
    expect(newState.units['u2']).toBeUndefined();
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0, veteran: true });
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.cause === 'combat' && e.byUnitId === 'u1')).toBe(true);
  });

  it('attaquant à 0 PV → mort, le défenseur devient vétéran (R-32)', () => {
    const seed = seedWhereAttackerIsHit();
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 1 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, seed);
    expect(newState.units['u1']).toBeUndefined();
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0, veteran: true });
  });

  it('origine occupée → repli vers la case adjacente libre la plus proche de l’origine (R-54-2)', () => {
    const state = makeState({
      units: [
        { id: 'u5', type: 'guerrier', owner: 'p1', q: 5, r: 0 }, // attaquant
        { id: 'u7', type: 'guerrier', owner: 'p1', q: 4, r: 0 }, // prend l'origine pendant que u5 attaque
        { id: 'u9', type: 'guerrier', owner: 'p2', q: 6, r: 0 },
      ],
    });
    // u5 (traité avant u7) quitte (5,0) vers (6,0) (occupé par u9) → attaque
    // planifiée ; u7 occupe ensuite l'origine (5,0). Survie mutuelle garantie
    // (1 échange, 3 PV) → repli : origine occupée par u7 → adjacente libre à
    // (6,0) la plus proche de (5,0) : (5,1).
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'u5', path: [{ q: 6, r: 0 }] },
        { type: 'Move', unitId: 'u7', path: [{ q: 5, r: 0 }] },
      ],
    };
    const { newState } = resolveTurn(state, orders, 11);
    const u5 = unit(newState, 'u5');
    expect(u5).toMatchObject({ q: 5, r: 1 }); // au plus proche de son origine
    expect(unit(newState, 'u7')).toMatchObject({ q: 5, r: 0 });
    expect(unit(newState, 'u9')).toMatchObject({ q: 6, r: 0 });
  });

  it('aucun repli possible → attaques répétées jusqu’à élimination (R-55)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        // u3 suit u1 pour occuper son origine (0,0) dès qu'il l'a quittée
        { id: 'u3', type: 'guerrier', owner: 'p2', q: 0, r: -1 },
        // encerclement : toutes les cases adjacentes à la case de combat (1,0)
        { id: 'u6', type: 'guerrier', owner: 'p2', q: 0, r: 1 },
        { id: 'u7', type: 'guerrier', owner: 'p2', q: 1, r: 1 },
        { id: 'u8', type: 'guerrier', owner: 'p2', q: 2, r: 0 },
        { id: 'u9', type: 'guerrier', owner: 'p2', q: 1, r: -1 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }],
      p2: [{ type: 'Move', unitId: 'u3', path: [{ q: 0, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 3);
    // origine (0,0) prise par u3, toutes les cases adjacentes à (1,0) occupées :
    // u1 n'a aucun repli → attaques répétées jusqu'à l'élimination d'un des deux.
    const dead = newState.units['u1'] === undefined || newState.units['u2'] === undefined;
    expect(dead).toBe(true);
    const exchanges = events.filter((e) => e.type === 'CombatExchange');
    expect(exchanges.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase B · R-53 · collisions', () => {
  it('aucun dégât : la plus haute PV demeure, l’autre replie à son origine', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 3 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0, hp: 2 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0, hp: 3 }); // demeure, a bougé → pas de soin
    // u2 n'a ni bougé (collision sans pas) ni combattu (aucun dégât, R-53)
    // → R-71 s'applique : +1 PV (2 → 3)
    expect(unit(newState, 'u2')).toMatchObject({ q: 2, r: 0, hp: 3 });
    expect(events.some((e) => e.type === 'Retreat' && e.unitId === 'u2')).toBe(true);
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(false);
  });

  it('égalité de PV : demeure celle qui a parcouru le moins de cases ce tour', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 3 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 2, r: 0, hp: 3 },
      ],
    });
    // u1 parcourt 1 case pour arriver à (1,0) ; u2 (déjà adjacent) vise (1,0) sans bouger
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] }],
    };
    // u2 est traité après u1 (R-41) : (1,0) occupé par le mover u1 → collision.
    // Égalité de PV impossible ici (3-3) : u2 a parcouru 0 case → u2 demeure (prend la case).
    const { newState } = resolveTurn(state, orders, 1);
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0 });
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 }); // replié à son origine
  });

  it('collision avec un pacifique : capture, pas de comparaison de PV (R-43)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'colon', owner: 'p2', q: 2, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }],
      p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 1, r: 0 }] }],
    };
    const { newState } = resolveTurn(state, orders, 1);
    expect(newState.units['u2']).toBeUndefined(); // colon capturé
    expect(newState.players['p1']!.gold).toBe(10);
    expect(unit(newState, 'u1')).toMatchObject({ q: 1, r: 0 });
  });
});

describe('Phase B · R-59 · unités à distance (aucune en v1, règles normatives)', () => {
  it('R-59-a/b : la catapulte attaque de sa case, n’avance pas, ne subit aucune riposte', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'catapulte-test', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] }, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0, hp: 3 }); // pas d'avance, zéro riposte
    expect(unit(newState, 'u2')).toMatchObject({ q: 1, r: 0, hp: 2 }); // touché (S_att élevée)
  });

  it('R-59-d : le défenseur à distance en survie mutuelle cède sa case', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'catapulte-test', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] }, 1);
    const u2 = unit(newState, 'u2');
    expect(u2).not.toMatchObject({ q: 1, r: 0 }); // repli systématique
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 }); // l'attaquant ne prend pas la case
  });
});

describe('Phase B · R-57 · bonus défensif de la case de ville (T-02)', () => {
  it('un défenseur sur case de ville reçoit +50 % → l’attaquant perd le round en (0.31 ; 0.49)', () => {
    // graine dont le premier tir t ∈ (p_ville, p_plaine) : p_ville = 1/(1+1.5²) ≈ 0.3077
    let seed = -1;
    for (let s = 0; s < 5000; s++) {
      const t = createRng(s).next();
      if (t > 0.32 && t < 0.48) { seed = s; break; }
    }
    expect(seed).toBeGreaterThanOrEqual(0);
    const state = makeState({
      terrainOverrides: { '1,0': 'ville' },
      cities: [{ id: 'c1', owner: 'p2', q: 1, r: 0, capital: true }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] }, seed);
    // S_att = 1, S_def = 1.5 → t ≥ p ⇒ c'est l'attaquant qui encaisse le PV
    expect(unit(newState, 'u1').hp).toBe(2);
    expect(unit(newState, 'u2').hp).toBe(3);
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0 }); // repli sur place (origine)
  });
});

describe('Phase C · R-60/R-61 · case travaillée et commerce', () => {
  it('R-60 : auto-assignation à la meilleure case du rayon T-08b', () => {
    const state = makeState({
      terrainOverrides: { '2,0': 'foret' }, // score 3 > prairie (2)
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    expect(cityAt(newState, 0, 0)!.workedTile).toBe('2,0');
  });

  it('R-61 : répartition science/or au curseur (reste entier à l’or)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }],
    });
    // commerce v1 = 1 (case de ville) + 0 (prairie) → 50/50 : 0 science, 1 or
    const r = resolveTurn(state, {}, 1);
    expect(r.newState.players['p1']!.science).toBe(0);
    expect(r.newState.players['p1']!.gold).toBe(1);
    // curseur 100 % science
    const state2 = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }],
    });
    state2.players['p1']!.scienceRatio = 1;
    const r2 = resolveTurn(state2, {}, 1);
    expect(r2.newState.players['p1']!.science).toBe(1);
    expect(r2.newState.players['p1']!.gold).toBe(0);
  });
});

describe('Phase C · R-62/R-63 · production et croissance', () => {
  function cityState(): GameState {
    return makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, production: { item: 'guerrier', progress: 9 } }],
    });
  }

  it('R-62 : production complétée → l’unité apparaît sur la case de ville', () => {
    const { newState, events } = resolveTurn(cityState(), {}, 1);
    // production du tour = 1 (case ville 1 + prairie 0) → 9 + 1 = 10 ≥ coût 10
    const produced = events.find((e) => e.type === 'UnitProduced');
    expect(produced).toBeDefined();
    expect(unitAt(newState, 0, 0)?.type).toBe('guerrier');
    expect(cityAt(newState, 0, 0)!.production).toBeNull();
  });

  it('R-62 : case de ville occupée → en attente, progression plafonnée (🔶)', () => {
    const state = cityState();
    state.units['u0'] = {
      id: 'u0', type: 'colon', owner: 'p1', q: 0, r: 0, hp: 3, mp: 2,
      veteran: false, isArmy: false, order: null, detainedBy: null,
    };
    const { newState, events } = resolveTurn(state, {}, 1);
    expect(events.some((e) => e.type === 'UnitProduced')).toBe(false);
    expect(cityAt(newState, 0, 0)!.production).toEqual({ item: 'guerrier', progress: 10 });
  });

  it('R-62 : SetProduction remplace l’item en conservant la progression', () => {
    const state = cityState();
    state.cities['c1']!.production = { item: 'colon', progress: 5 };
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: 'guerrier' }] }, 1);
    expect(cityAt(newState, 0, 0)!.production).toEqual({ item: 'guerrier', progress: 6 });
  });

  it('R-63 : croissance au seuil du palier (base × pop 🔶)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, foodStored: 8 }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    // nourriture du tour = 2 (ville) + 2 (prairie travaillée) = 4 → 8 + 4 = 12 ≥ 10
    const city = cityAt(newState, 0, 0)!;
    expect(city.pop).toBe(2);
    expect(city.foodStored).toBe(2);
  });
});

describe('Phase C · R-64/R-65 · fondation et capture de ville', () => {
  it('R-64 : FoundCity consomme le Colon, capitale si première ville', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    expect(newState.units['u1']).toBeUndefined();
    const city = cityAt(newState, 5, 5)!;
    expect(city).toMatchObject({ owner: 'p1', pop: 1, capital: true });
    expect(newState.map['5,5']!.terrain).toBe('ville');
    expect(events.some((e) => e.type === 'CityFounded' && e.capital === true)).toBe(true);
  });

  it('R-64 : distance < T-09 d’une ville existante → ordre invalide, le Colon reste', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 5, r: 4, capital: true }],
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    expect(unit(newState, 'u1')).toBeDefined();
    expect(cityAt(newState, 5, 5)).toBeNull();
    expect(events.some((e) => e.type === 'CityFounded')).toBe(false);
  });

  it('R-65 : ville sans défenseur investie → capture, pop −1, file effacée ; capitale = victoire', () => {
    const state = makeState({
      width: 12,
      height: 12,
      terrainOverrides: { '5,5': 'ville' },
      cities: [{ id: 'c1', owner: 'p2', q: 5, r: 5, capital: true, pop: 2, production: { item: 'guerrier', progress: 5 } }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 }],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, 1);
    const city = cityAt(newState, 5, 5)!;
    expect(city).toMatchObject({ owner: 'p1', pop: 1, production: null });
    expect(newState.winner).toBe('p1'); // domination (R-65)
    expect(events.some((e) => e.type === 'CityCaptured')).toBe(true);
    expect(events.some((e) => e.type === 'Victory' && e.winner === 'p1')).toBe(true);
  });

  it('R-65 : une ville défendue n’est pas capturée par simple entrée', () => {
    const state = makeState({
      width: 12,
      height: 12,
      terrainOverrides: { '5,5': 'ville' },
      cities: [{ id: 'c1', owner: 'p2', q: 5, r: 5, capital: true }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 5, r: 4 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 5, r: 5 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] }] }, 5);
    expect(cityAt(newState, 5, 5)!.owner).toBe('p2');
    expect(newState.winner).toBeNull();
  });
});

describe('Phase D · R-70/R-71/R-72 · vision, soins, PM', () => {
  it('R-71 : +1 PV si l’unité n’a ni bougé ni combattu, +2 en ville amie', () => {
    const state = makeState({
      width: 12,
      height: 12,
      terrainOverrides: { '6,6': 'ville' },
      cities: [{ id: 'c1', owner: 'p1', q: 6, r: 6, capital: true }],
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 3, r: 3, hp: 1 },
        { id: 'u2', type: 'colon', owner: 'p1', q: 6, r: 6, hp: 1 },
        { id: 'u3', type: 'colon', owner: 'p1', q: 7, r: 7, hp: 1 },
      ],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u3', path: [{ q: 7, r: 8 }] }] }, 1);
    expect(unit(newState, 'u1').hp).toBe(2); // +1
    expect(unit(newState, 'u2').hp).toBe(3); // +2 en ville amie
    expect(unit(newState, 'u3').hp).toBe(1); // a bougé : rien
  });

  it('R-72 : PM régénérés au maximum après la résolution', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 1);
    expect(unit(newState, 'u1')).toMatchObject({ mp: 1 });
  });

  it('R-70 : la vision est recalculée et mémorisée (3 états)', () => {
    const state = makeState({ width: 12, height: 12, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }] });
    // tour 1 sans ordre : la vision autour de (2,2) est calculée et mémorisée
    const r1 = resolveTurn(state, {}, 1);
    expect(r1.newState.players['p1']!.vision.visible).toContain('0,2');
    // tour 2 : u1 s'éloigne → (0,2) reste exploré mais n'est plus visible
    const { newState } = resolveTurn(r1.newState, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 3, r: 2 }] }] }, 1);
    const vision = newState.players['p1']!.vision;
    expect(vision.visible).toContain('4,2'); // rayon 2 autour de la nouvelle position
    expect(vision.explored).toContain('0,2'); // mémorisé autour de l'ancienne position
    expect(vision.visible).not.toContain('0,2'); // … mais plus visible (distance 3)
  });
});

describe('R-58 · points d’accroche diplomatie (inactifs en v1)', () => {
  it('R-58-a : ordre Attack contre une nation en paix → rejeté', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
      warPairs: [],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] }, 1);
    expect(unit(newState, 'u1')).toMatchObject({ q: 0, r: 0, hp: 3 });
    expect(unit(newState, 'u2')).toMatchObject({ hp: 3 });
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(false);
  });

  it('R-58-b : collision en paix → repli mutuel si possible, sans dégât ni incident', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
      warPairs: [],
    });
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 1);
    expect(unit(newState, 'u1').hp).toBe(3);
    expect(unit(newState, 'u2').hp).toBe(3);
    expect(events.some((e) => e.type === 'DiplomaticIncident')).toBe(false);
    // chacun est replié sur des cases distinctes, personne sur (1,0)… sauf repli légal
    const positions = Object.values(newState.units).map((u) => `${u.q},${u.r}`);
    expect(new Set(positions).size).toBe(2);
  });

  it('R-43/§7.7-c : capture d’un pacifique en paix → détention, pas de butin', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 6, r: 5 },
      ],
      warPairs: [],
    });
    const { newState, events } = resolveTurn(state, { p2: [{ type: 'Move', unitId: 'u2', path: [{ q: 5, r: 5 }] }] }, 1);
    const colon = unit(newState, 'u1');
    expect(colon.detainedBy).toBe('p2');
    expect(newState.players['p2']!.gold).toBe(0);
    expect(events.some((e) => e.type === 'Captured' && e.outcome === 'detained')).toBe(true);
  });
});

describe('R-80/R-82 · déterminisme et pureté de resolveTurn', () => {
  const state = makeState({
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      { id: 'u3', type: 'colon', owner: 'p1', q: 4, r: 4 },
    ],
  });
  const orders: Record<string, Order[]> = {
    p1: [
      { type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } },
      { type: 'Move', unitId: 'u3', path: [{ q: 4, r: 5 }] },
    ],
  };

  it('même (state, orders, seed) → même (newState, events) bit à bit', () => {
    const a = resolveTurn(state, orders, 99);
    const b = resolveTurn(state, orders, 99);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('l’état d’entrée n’est jamais muté (immuabilité)', () => {
    const before = JSON.stringify(state);
    resolveTurn(state, orders, 99);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('R-80 : la graine n’avance qu’en Phase B — tour sans combat ⇒ graine inchangée', () => {
    const quiet = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const { newState } = resolveTurn(quiet, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 42);
    expect(newState.rngSeed).toBe(42);
    const { newState: fought } = resolveTurn(state, orders, 42);
    expect(fought.rngSeed).not.toBe(42);
  });

  it('les seq d’événements sont consécutifs et persistent (lastEventSeq)', () => {
    const r1 = resolveTurn(state, orders, 99);
    const seqs = r1.events.map((e) => e.seq);
    expect(seqs).toHaveLength(new Set(seqs).size);
    expect(r1.newState.lastEventSeq).toBe(Math.max(...seqs));
    // tour suivant : les seq continuent
    const r2 = resolveTurn(r1.newState, {}, 99);
    const minSeq2 = Math.min(...r2.events.map((e) => e.seq));
    expect(minSeq2).toBe(r1.newState.lastEventSeq + 1);
  });
});

/** Distance hexagonale locale pour les assertions. */
function hexDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
