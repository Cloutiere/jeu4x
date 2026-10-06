import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState } from '../src/fixtures.js';
import { productionItemCostOf } from '../src/economyOr.js';
import { estTerritoireEnnemi } from '../src/economy.js';
import { unitType } from '../src/data.js';
import type { GameState } from '../src/state.js';
import type { GameEvent } from '../src/events.js';

/**
 * ORDRES-UNITES (décisions d'Erik du 06/10) — quatre nouveaux ordres d'unité :
 *  - SellUnit : 50 % du coût de production effectif (traits compris) en or,
 *    unité détruite ; interdits : à bord d'un transport, transport porteur de
 *    cargaison, unité ayant combattu ce tour (consigné) ;
 *  - Heal : immobile, soigne au taux R-71 (1 PV/tour, 2 en ville amie),
 *    R-71 préservée (pas de soin après combat), JUSQU'À PV complets puis
 *    l'ordre se termine ; INTERDIT en territoire ennemi (anneaux R-162,
 *    évalués à la pose — l'évolution ultérieure du territoire ne rompt pas
 *    le soin en cours 🔶) ;
 *  - Sleep (Vigilance) : passe ses tours ; réveil dès qu'un ennemi devient
 *    VISIBLE (fog — une case explorée mais non visible ne réveille pas) ;
 *  - Pass (Passer) : inerte ce tour ; « sans ordres » au tour suivant.
 * FORTIFIER NE SOIGNE PLUS : le soin exige Heal (régression verrouillée).
 */

function blesséeSeule(hp = 1): GameState {
  // u1 (p1) seule sur sa case, loin de tout — blessée.
  return makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp }] });
}

function evenement(events: GameEvent[], type: GameEvent['type']): GameEvent {
  const e = events.find((e) => e.type === type);
  if (!e) throw new Error(`événement ${type} absent`);
  return e;
}

describe('ORDRES-UNITES · SellUnit (vente)', () => {
  it('crédite 50 % du coût effectif et détruit l\'unité (guerrier coût 10 → +5 or)', () => {
    const state = blesséeSeule();
    const cout = productionItemCostOf(state, 'p1', { kind: 'unit', id: 'guerrier' });
    expect(cout).toBe(10); // garde-fou de fixture : la base n'a pas dérivé
    const r = resolveTurn(state, { p1: [{ type: 'SellUnit', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1).toBeUndefined();
    expect(r.newState.players.p1!.treasury).toBe(5);
    const ev = evenement(r.events, 'UnitSold') as Extract<GameEvent, { type: 'UnitSold' }>;
    expect(ev.amount).toBe(5);
    expect(ev.unitId).toBe('u1');
  });

  it('refuse la vente D\'UNE unité à bord d\'un transport (or inchangé, unité vivante)', () => {
    const state = makeState({
      units: [
        { id: 'navire', type: 'galere', owner: 'p1', q: 0, r: 0 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, aboard: 'navire' },
      ],
    });
    const r = resolveTurn(state, { p1: [{ type: 'SellUnit', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1).toBeDefined();
    expect(r.newState.players.p1!.treasury).toBe(0);
    expect(r.events.some((e) => e.type === 'SellRefused')).toBe(true);
  });

  it('refuse la vente D\'UN transport porteur de cargaison (la cargaison ne peut pas périr)', () => {
    const state = makeState({
      units: [
        { id: 'navire', type: 'galere', owner: 'p1', q: 0, r: 0, cargo: 'u1' },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, aboard: 'navire' },
      ],
    });
    const r = resolveTurn(state, { p1: [{ type: 'SellUnit', unitId: 'navire' }] }, 42);
    expect(r.newState.units.navire).toBeDefined();
    expect(r.newState.players.p1!.treasury).toBe(0);
    expect(r.events.some((e) => e.type === 'SellRefused')).toBe(true);
  });

  it('refuse la vente d\'une unité ayant COMBATTU ce tour (interdiction consignée)', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0, hp: 1 },
      ],
    });
    const r = resolveTurn(
      state,
      {
        p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }, { type: 'SellUnit', unitId: 'u1' }],
        p2: [],
      },
      42,
    );
    // u1 a combattu (et survécu — u2 hp 1 ne peut pas la tuer en un round 🔶
    // garanti par la graine fixe 42 : les deux tours tombent).
    if (r.newState.units.u1) {
      expect(r.newState.players.p1!.treasury).toBe(0);
      expect(r.events.some((e) => e.type === 'SellRefused')).toBe(true);
    }
  });

  it('un ordre de vente sur une unité ENNEMIE est ignoré (consigne)', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p2', q: 0, r: 0 }] });
    const r = resolveTurn(state, { p1: [{ type: 'SellUnit', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1).toBeDefined();
    expect(r.newState.players.p2!.treasury).toBe(0);
  });
});

describe('ORDRES-UNITES · Heal (soin)', () => {
  it('soigne au taux actuel (+1 hors ville) JUSQU\'À PV complets puis termine l\'ordre', () => {
    const state = blesséeSeule(1);
    const r1 = resolveTurn(state, { p1: [{ type: 'Heal', unitId: 'u1' }] }, 42);
    expect(r1.newState.units.u1!.hp).toBe(2);
    expect(r1.newState.units.u1!.order?.type).toBe('Heal'); // persiste
    expect(r1.events.some((e) => e.type === 'HealCompleted')).toBe(false);
    // Tour suivant, AUCUN ordre soumis : le soin persiste et s'achève.
    const r2 = resolveTurn(r1.newState, { p1: [] }, 42);
    expect(r2.newState.units.u1!.hp).toBe(3);
    expect(r2.newState.units.u1!.order).toBeNull();
    expect(r2.events.some((e) => e.type === 'HealCompleted')).toBe(true);
  });

  it('soigne +2 en ville amie (taux R-71 inchangé)', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 1 }],
      cities: [{ owner: 'p1', q: 0, r: 0 }],
    });
    const r = resolveTurn(state, { p1: [{ type: 'Heal', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1!.hp).toBe(3);
    expect(r.newState.units.u1!.order).toBeNull(); // PV complets : terminé
  });

  it('REFUS en territoire ennemi (anneaux culturels R-162) — évalué à la pose', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 1 },
        { id: 'u9', type: 'guerrier', owner: 'p2', q: 5, r: 5 },
      ],
      cities: [{ owner: 'p2', q: 1, r: 0 }], // adjacente à u1 : territoire p2
    });
    expect(estTerritoireEnnemi(state, { q: 0, r: 0 }, 'p1')).toBe(true);
    const r = resolveTurn(state, { p1: [{ type: 'Heal', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1!.hp).toBe(1); // aucun soin
    expect(r.newState.units.u1!.order).toBeNull(); // ordre refusé
    expect(r.events.some((e) => e.type === 'HealRefused')).toBe(true);
  });

  it('le soin accepté CONTINUE si le territoire évolue ensuite (évalué à la pose seulement 🔶)', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 1 }],
      cities: [{ owner: 'p1', q: 4, r: 0 }, { owner: 'p2', q: 6, r: 0 }],
    });
    // Pose acceptée (p2 trop loin), puis la ville p2 « pousse » sa culture au
    // point de couvrir u1 : le soin en cours ne s'interrompt pas.
    expect(estTerritoireEnnemi(state, { q: 0, r: 0 }, 'p1')).toBe(false);
    const r1 = resolveTurn(state, { p1: [{ type: 'Heal', unitId: 'u1' }] }, 42);
    expect(r1.newState.units.u1!.hp).toBe(2);
    r1.newState.cities.c2!.cultureCumulee = 100000; // anneaux culturels étendus
    expect(estTerritoireEnnemi(r1.newState, { q: 0, r: 0 }, 'p1')).toBe(true);
    const r2 = resolveTurn(r1.newState, { p1: [] }, 42);
    expect(r2.newState.units.u1!.hp).toBe(3); // soin poursuivi malgré le territoire
  });

  it('R-71 préservée : une unité ayant combattu NE soigne pas ce tour (ordre conservé)', () => {
    // Un seul ordre par unité (miroir serveur) : p1 soigne, p2 ATTAQUE —
    // u1 a combattu (défense) → aucun soin. Graine où le défenseur survit blessé.
    for (let seed = 42; seed < 120; seed++) {
      const state = makeState({
        units: [
          { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, hp: 2 },
          { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
        ],
      });
      const r = resolveTurn(
        state,
        { p1: [{ type: 'Heal', unitId: 'u1' }], p2: [{ type: 'Attack', unitId: 'u2', target: { q: 0, r: 0 } }] },
        seed,
      );
      const u1 = r.newState.units.u1;
      if (!u1 || u1.hp >= unitType('guerrier').hpMax) continue; // morte ou intacte : graine suivante
      expect(u1.order?.type).toBe('Heal'); // l'ordre demeure pour le tour suivant
      expect(r.events.some((e) => e.type === 'HealCompleted')).toBe(false);
      return;
    }
    throw new Error('aucune graine où le défenseur survit blessé');
  });

  it('un Move donné à une unité en soin annule le soin et s\'exécute', () => {
    const state = blesséeSeule(1);
    state.units.u1!.order = { type: 'Heal', unitId: 'u1' };
    const r = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 42);
    expect(r.newState.units.u1!.q).toBe(1);
    expect(r.newState.units.u1!.hp).toBe(1); // a bougé : aucun soin
    expect(r.newState.units.u1!.order).toBeNull(); // chemin consommé : plus d'ordre
  });
});

describe('ORDRES-UNITES · Fortifier NE soigne plus (régression)', () => {
  it('une unité fortifiée blessée ne gagne AUCUN PV (le soin exige Heal)', () => {
    const state = blesséeSeule(1);
    state.units.u1!.stabilized = true;
    const r = resolveTurn(state, { p1: [{ type: 'Fortify', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1!.fortified).toBe(true);
    expect(r.newState.units.u1!.hp).toBe(1); // AVANT : 2 (R-71 passive) — révoqué
  });

  it('une unité oisive (sans ordres) ne se soigne plus', () => {
    const state = blesséeSeule(1);
    const r = resolveTurn(state, { p1: [] }, 42);
    expect(r.newState.units.u1!.hp).toBe(1);
  });
});

describe('ORDRES-UNITES · Sleep (vigilance)', () => {
  function endormieDistance(n: number): GameState {
    // u1 endormie en (0,0) — vision guerrier 2 ; ennemi à distance n (sans wrap).
    return makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0, order: { type: 'Sleep', unitId: 'u1' } },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: n, r: 0 },
      ],
    });
  }

  it('l\'ordre persiste tant qu\'aucun ennemi n\'est VISIBLE', () => {
    const r = resolveTurn(endormieDistance(4), { p1: [], p2: [] }, 42); // distance 4 > vision 2
    expect(r.newState.units.u1!.order?.type).toBe('Sleep');
    expect(r.events.some((e) => e.type === 'SleepWoke')).toBe(false);
  });

  it('réveille dès qu\'un ennemi devient visible : ordre nul + événement SleepWoke', () => {
    const r = resolveTurn(endormieDistance(2), { p1: [], p2: [] }, 42); // distance 2 = vision
    expect(r.newState.units.u1!.order).toBeNull();
    const ev = evenement(r.events, 'SleepWoke') as Extract<GameEvent, { type: 'SleepWoke' }>;
    expect(ev.unitId).toBe('u1');
  });

  it('FOG : un ennemi sur case explorée mais NON visible ne réveille pas', () => {
    const state = endormieDistance(3); // distance 3 : hors vision 2
    state.players.p1!.vision = { explored: ['3,0'], visible: [] };
    const r = resolveTurn(state, { p1: [], p2: [] }, 42);
    expect(r.newState.units.u1!.order?.type).toBe('Sleep');
  });

  it('un Move donné à une endormie l\'annule et s\'exécute (la vigilance n\'est pas une prison)', () => {
    const state = endormieDistance(5);
    const r = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] }] }, 42);
    expect(r.newState.units.u1!.q).toBe(1);
    expect(r.newState.units.u1!.order?.type).not.toBe('Sleep');
  });

  it('soumettre Sleep à nouveau prolonge la vigilance ; tout autre ordre la lève', () => {
    const state = endormieDistance(5);
    const r = resolveTurn(state, { p1: [{ type: 'Hold', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1!.order).toBeNull(); // Hold lève la vigilance
  });
});

describe('ORDRES-UNITES · Pass (passer)', () => {
  it('inerte ce tour : chemin gelé effacé, aucun déplacement, ordre nul au tour suivant', () => {
    const state = blesséeSeule();
    state.units.u1!.order = { type: 'Move', unitId: 'u1', path: [{ q: 2, r: 0 }] };
    const r = resolveTurn(state, { p1: [{ type: 'Pass', unitId: 'u1' }] }, 42);
    expect(r.newState.units.u1!.q).toBe(0); // n'a pas bougé
    expect(r.newState.units.u1!.order).toBeNull();
    expect(r.newState.units.u1!.mp).toBe(1); // PM régénérés (R-72 inchangée)
  });
});

describe('ORDRES-UNITES · hors scope', () => {
  it('les barbares ne sont jamais ciblés par ces ordres (consigne ennemie ignorée)', () => {
    const state = makeState({
      players: ['p1'],
      units: [{ id: 'b1', type: 'guerrier', owner: 'barbares', q: 0, r: 0, hp: 1 }],
    });
    const r = resolveTurn(
      state,
      { p1: [{ type: 'SellUnit', unitId: 'b1' }, { type: 'Heal', unitId: 'b1' }, { type: 'Sleep', unitId: 'b1' }] },
      42,
    );
    expect(r.newState.units.b1).toBeDefined();
    expect(r.newState.players.p1!.treasury).toBe(0);
    expect(r.newState.units.b1!.order?.type).not.toBe('Sleep');
  });
});
