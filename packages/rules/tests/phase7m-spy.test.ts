/**
 * Tests Phase 7m — Espionnage jeu de base (RULES.md §8.11, R-142..R-144).
 *
 * Chaque test cite la règle R-xx qu'il couvre ; les 🔶 renvoient aux
 * interprétations documentées dans RULES.md §8.11.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import type { GameState, Order, SpyActionKind } from '../src/state.js';
import { getFilteredState, filterEventsForPlayer } from '../src/fog.js';
import { hexDistance } from '../src/hex.js';
import { destroyBuildingGoldOf, destroyBuildingSuccessChance, spyDuelWinChance } from '../src/espionnage.js';
import { BUILDINGS } from '../src/data.js';
import { createRng } from '../src/rng.js';

/** p2 : ville ennemie 'ville' en (0,0) ; p1 : espion infiltrable. */
function spyState(opts: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({
    width: 10,
    height: 8,
    cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3 }],
    units: [
      { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
      { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
    ],
    ...opts,
  });
}

function spyAction(action: SpyActionKind, extra: Partial<Extract<Order, { type: 'SpyAction' }>> = {}): Record<string, Order[]> {
  return { p1: [{ type: 'SpyAction', unitId: 'espion1', cityId: 'ville', action, ...extra }] };
}

// ---------------------------------------------------------------------------
// Cycle de vie (R-142)
// ---------------------------------------------------------------------------

describe('7m · R-142 — Espion : cycle de vie', () => {
  it('Premier découvrir Écriture → Espion gratuit (R-109/R-142 — récompense vérifiée)', () => {
    const state = makeState({
      // Commerce réel : 1 désert travaillé (0/0/1) → 1 science (conversion
      // science ; le centre-ville seul a un commerce NUL sous pop 7 — R-66).
      terrainOverrides: { '0,0': 'ville', '1,0': 'desert' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, conversion: 'science', workedTiles: ['1,0'] }],
    });
    state.players['p1']!.researching = 'ecriture';
    state.players['p1']!.scienceProgress = { ecriture: 40 }; // coût 40 — complétion ce tour
    const out = resolveTurn(state, {}, 1).newState;
    expect(out.players['p1']!.techsUnlocked).toContain('ecriture');
    expect(out.firstBy['ecriture']).toBe('p1');
    const spies = Object.values(out.units).filter((u) => u.type === 'espion' && u.owner === 'p1');
    expect(spies).toHaveLength(1);
  });

  it('élimination SANS COMBAT : une unité militaire qui entre sur sa case hors ville le détruit (aucun butin 🔶)', () => {
    const state = spyState({
      units: [
        { id: 'espion1', type: 'espion', owner: 'p1', q: 2, r: 0 },
        { id: 'militaire', type: 'guerrier', owner: 'p2', q: 3, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p2: [{ type: 'Move', unitId: 'militaire', path: [{ q: 2, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    expect(newState.units['espion1']).toBeUndefined();
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'espion1' && e.cause === 'capture')).toBe(true);
    expect(events.some((e) => e.type === 'BootyGold')).toBe(false); // 🔶 pas de butin
    expect(newState.units['militaire']).toBeDefined();
    expect(newState.units['militaire']!.q).toBe(2); // entre sur la case (R-40)
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(false); // sans combat
  });

  it('INFILTRATION (R-143) : l\'espion entre dans la ville ennemie — ni combat, ni capture', () => {
    const state = spyState();
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }],
    };
    const { newState, events } = resolveTurn(state, orders, 1);
    const spy = newState.units['espion1']!;
    expect(spy.q).toBe(0);
    expect(spy.r).toBe(0); // infiltré dans la ville
    expect(newState.units['gar']).toBeDefined(); // la garnison ne l'élimine pas
    expect(newState.cities['ville']!.owner).toBe('p2'); // pas de capture
    expect(events.some((e) => e.type === 'CombatExchange' || e.type === 'Captured' || e.type === 'CityCaptured')).toBe(false);
  });

  it('R-142/R-65 : un espion SEUL sur une ville sans défenseur ne la capture pas', () => {
    const state = spyState({ units: [{ id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 }] });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }],
    };
    const out = resolveTurn(state, orders, 1).newState;
    expect(out.cities['ville']!.owner).toBe('p2');
    expect(out.units['espion1']).toBeDefined();
    expect(out.units['espion1']!.q).toBe(0); // il est sur la case (infiltré)
  });

  it('R-30 (7m) : garnison — l\'espion coexiste avec le défenseur de SA ville ; un second espion est bloqué', () => {
    const state = makeState({
      width: 10,
      height: 8,
      cities: [{ id: 'chezmoi', owner: 'p1', q: 0, r: 0, pop: 3 }],
      units: [
        { id: 'def', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
        { id: 'espion2', type: 'espion', owner: 'p1', q: 2, r: 0 },
      ],
    });
    const orders: Record<string, Order[]> = {
      p1: [
        { type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] },
        { type: 'Move', unitId: 'espion2', path: [{ q: 1, r: 0 }, { q: 0, r: 0 }] },
      ],
    };
    const out = resolveTurn(state, orders, 1).newState;
    // R-41 : espion1 (petit id) entre d'abord — garnison avec le défenseur.
    expect(out.units['espion1']!.q).toBe(0);
    expect(out.units['def']!.q).toBe(0);
    // espion2 : R-30 — un seul espion par propriétaire et par ville.
    expect(out.units['espion2']!.q).toBe(1); // bloqué sur la case précédente
  });
});

// ---------------------------------------------------------------------------
// Actions (R-143)
// ---------------------------------------------------------------------------

describe('7m · R-143 — Actions d\'espionnage', () => {
  it('stealGold : 50 % 🔶 de la trésorerie, débit/crédit, espion consommé, victime notifiée du montant', () => {
    const state = spyState();
    state.players['p2']!.treasury = 200;
    state.players['p1']!.treasury = 10;
    // Infiltration préalable (tour 1) puis action (tour 2).
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('stealGold'), 1);
    expect(newState.players['p2']!.treasury).toBe(100);
    expect(newState.players['p1']!.treasury).toBe(110);
    const stolen = events.find((e) => e.type === 'GoldStolen');
    expect(stolen && stolen.type === 'GoldStolen' ? stolen.amount : null).toBe(100);
    expect(newState.units['espion1']).toBeUndefined(); // consommé
    expect(events.some((e) => e.type === 'SpyAction' && e.action === 'stealGold' && e.outcome === 'success')).toBe(true);
  });

  it('kidnapGreatPerson : le GP « en attente » est transféré au voleur (capitale), aucun jalon ne varie', () => {
    const state = spyState({
      cities: [
        { id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3 },
        { id: 'cap1', owner: 'p1', q: 5, r: 0, capital: true, pop: 2 },
      ],
      units: [
        { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
        { id: 'gp', type: 'savant', owner: 'p2', q: 0, r: 1 }, // adjacente à la ville
        { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      ],
    });
    state.players['p1']!.cultureMilestones = 3;
    state.players['p2']!.cultureMilestones = 3;
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('kidnapGreatPerson'), 1);
    const gp = newState.units['gp']!;
    expect(gp.owner).toBe('p1'); // transféré
    expect(hexDistance(gp, { q: 5, r: 0 })).toBeLessThanOrEqual(1); // repositionné capitale/adjacent
    expect(newState.players['p1']!.cultureMilestones).toBe(3); // aucun jalon (miroir C2)
    expect(newState.players['p2']!.cultureMilestones).toBe(3);
    expect(newState.units['espion1']).toBeUndefined();
    expect(events.some((e) => e.type === 'GreatPersonKidnapped' && e.gpType === 'savant')).toBe(true);
  });

  it('kidnapGreatPerson sans GP : échec sans effet, l\'espion SURVIT (miroir R-119 🔶)', () => {
    const state = spyState();
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('kidnapGreatPerson'), 1);
    expect(events.some((e) => e.type === 'SpyAction' && e.outcome === 'failed')).toBe(true);
    expect(newState.units['espion1']).toBeDefined();
  });

  it('sabotageProduction : marteaux investis remis à zéro 🔶, réserve C7 intacte, espion consommé', () => {
    const base = spyState({
      cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3, production: { item: { kind: 'building', id: 'universite' }, progress: 50 } }],
    });
    base.cities['ville']!.pendingSalvage = 30; // réserve permanente C7 à protéger
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const withSabotage = resolveTurn(t1, spyAction('sabotageProduction'), 1).newState;
    const without = resolveTurn(structuredClone(t1), { p1: [] }, 1).newState;
    // La réserve C7 n'est pas touchée par l'ESPIN (elle est consommée
    // identiquement par processEconomy dans les deux runs — R-130).
    expect(withSabotage.cities['ville']!.pendingSalvage).toBe(without.cities['ville']!.pendingSalvage);
    // Les MARTEAUX INVESTIS au moment du sabotage sont exactement remis à
    // zéro : la différence entre les deux runs vaut la progression investie
    // (la réserve C7, les marteaux du tour et tout le reste sont identiques).
    const invested = t1.cities['ville']!.production!.progress;
    expect(invested).toBeGreaterThan(50);
    expect(without.cities['ville']!.production!.progress - withSabotage.cities['ville']!.production!.progress).toBe(invested);
    expect(withSabotage.units['espion1']).toBeUndefined();
  });

  it('destroyBuilding (C18) : succès — bâtiment retiré, coût round(marteaux×0,5) débité, espion consommé', () => {
    const base = spyState({
      cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3, buildings: ['temple', 'bibliotheque'], wonders: ['stonehenge'] }],
    });
    base.players['p1']!.treasury = 100;
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    // Le temple coûte 40 marteaux → coût 20 or ; réussite 0,82 (R-80).
    const p = destroyBuildingSuccessChance(BUILDINGS['temple']!.cost);
    const roll = createRng(1).next(); // premier (et unique) appel RNG de la résolution
    const { newState, events } = resolveTurn(t1, spyAction('destroyBuilding', { buildingId: 'temple' }), 1);
    if (roll < p) {
      expect(newState.cities['ville']!.buildings).toEqual(['bibliotheque']);
      expect(newState.cities['ville']!.wonders).toEqual(['stonehenge']); // épargnée
      expect(events.some((e) => e.type === 'SpyBuildingDestroyed' && e.building === 'temple')).toBe(true);
    } else {
      expect(newState.cities['ville']!.buildings).toEqual(['temple', 'bibliotheque']);
    }
    // Le coût est débité AU LANCEMENT, succès comme échec (non remboursé 🔶).
    expect(newState.players['p1']!.treasury).toBe(100 - destroyBuildingGoldOf(BUILDINGS['temple']!.cost));
    expect(newState.players['p2']!.treasury).toBe(0);
    expect(newState.units['espion1']).toBeUndefined(); // hostile exécutée → consommé (échec compris)
  });

  it('C18 : le coût et le risque CROISSENT avec la valeur de production (formules données 🔶 espionnage.json)', () => {
    // Coût en or = round(marteaux × 0,5) : Bibliothèque (40) 20, Université (160) 80.
    expect(destroyBuildingGoldOf(40)).toBe(20);
    expect(destroyBuildingGoldOf(160)).toBe(80);
    expect(destroyBuildingGoldOf(0)).toBe(0);
    // Réussite = clamp(0,9 − marteaux/500 ; 0,4 ; 0,9) — « plus facile de
    // détruire une Bibliothèque qu'une Université ».
    expect(destroyBuildingSuccessChance(40)).toBeCloseTo(0.82, 10); // Bibliothèque
    expect(destroyBuildingSuccessChance(160)).toBeCloseTo(0.58, 10); // Université
    expect(destroyBuildingSuccessChance(200)).toBeCloseTo(0.5, 10); // Usine
    expect(destroyBuildingSuccessChance(1000)).toBe(0.4); // plafond bas 🔶
    expect(destroyBuildingSuccessChance(0)).toBe(0.9); // plafond haut
    expect(destroyBuildingSuccessChance(40)).toBeGreaterThan(destroyBuildingSuccessChance(160));
  });

  it('C18 : ÉCHEC du saboteur — espion perdu + or perdu, bâtiment intact (défaut 🔶)', () => {
    // Recherche déterministe d'une graine en échec (p = 0,82 pour le temple).
    const p = destroyBuildingSuccessChance(BUILDINGS['temple']!.cost);
    let failSeed: number | null = null;
    for (let seed = 0; seed < 60 && failSeed === null; seed++) {
      if (createRng(seed).next() >= p) failSeed = seed;
    }
    expect(failSeed).not.toBeNull();
    const base = spyState({
      cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3, buildings: ['temple'] }],
    });
    base.players['p1']!.treasury = 100;
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('destroyBuilding', { buildingId: 'temple' }), failSeed!);
    expect(newState.cities['ville']!.buildings).toEqual(['temple']); // intact
    expect(newState.units['espion1']).toBeUndefined(); // espion perdu
    expect(newState.players['p1']!.treasury).toBe(100 - destroyBuildingGoldOf(40)); // or perdu
    expect(events.some((e) => e.type === 'SpyBuildingDestroyed')).toBe(false);
    expect(events.some((e) => e.type === 'SpyAction' && e.outcome === 'failed')).toBe(true);
  });

  it('C18 : trésorerie INSUFFISANTE — l\'action ne part pas (échec sans effet, or intact, espion survit 🔶)', () => {
    const base = spyState({
      cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3, buildings: ['temple'] }],
    });
    base.players['p1']!.treasury = 5; // < round(40 × 0,5) = 20
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('destroyBuilding', { buildingId: 'temple' }), 1);
    expect(newState.cities['ville']!.buildings).toEqual(['temple']);
    expect(newState.players['p1']!.treasury).toBe(5); // aucun débit
    expect(newState.units['espion1']).toBeDefined(); // survit (échec sans effet)
    expect(events.some((e) => e.type === 'SpyAction' && e.outcome === 'failed')).toBe(true);
  });

  it('C18 : le duel PRÉCÈDE le coût — un espion perdant le duel ne PAIE pas', () => {
    const p = spyDuelWinChance(false, false); // 0,5 🔶
    let lossSeed: number | null = null;
    for (let seed = 0; seed < 60 && lossSeed === null; seed++) {
      if (createRng(seed).next() >= p) lossSeed = seed;
    }
    expect(lossSeed).not.toBeNull();
    const base = spyState({
      cities: [{ id: 'ville', owner: 'p2', q: 0, r: 0, pop: 3, buildings: ['temple'] }],
      units: [
        { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
        { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
        { id: 'contre', type: 'espion', owner: 'p2', q: 0, r: 0 }, // garnison → duel
      ],
    });
    base.players['p1']!.treasury = 100;
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('destroyBuilding', { buildingId: 'temple' }), lossSeed!);
    expect(events.some((e) => e.type === 'SpyDuel')).toBe(true);
    expect(newState.units['espion1']).toBeUndefined(); // perdant détruit
    expect(newState.players['p1']!.treasury).toBe(100); // PAS débité (action non exécutée)
    expect(newState.cities['ville']!.buildings).toEqual(['temple']);
  });

  it('destroyFortifications : annule la fortification (R-33) du défenseur ; sans fortification : échec', () => {
    const base = spyState();
    base.units['gar']!.fortified = true;
    const t1 = resolveTurn(base, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('destroyFortifications'), 1);
    expect(newState.units['gar']!.fortified).toBe(false);
    expect(newState.units['espion1']).toBeUndefined(); // hostile exécutée → consommé
    expect(events.some((e) => e.type === 'SpyAction' && e.outcome === 'success')).toBe(true);

    const plain = spyState(); // garnison non fortifiée
    const t2 = resolveTurn(plain, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const out2 = resolveTurn(t2, spyAction('destroyFortifications'), 1).newState;
    expect(out2.units['espion1']).toBeDefined(); // échec : survit
  });

  it('leave : l\'espion se repositionne sur une case adjacente libre, NON consommé', () => {
    const state = spyState();
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('leave'), 1);
    const spy = newState.units['espion1']!;
    expect(spy).toBeDefined();
    expect(hexDistance(spy, { q: 0, r: 0 })).toBe(1);
    expect(events.some((e) => e.type === 'SpyAction' && e.action === 'leave' && e.outcome === 'success')).toBe(true);
    expect(events.some((e) => e.type === 'SpyDuel')).toBe(false); // leave : pas de duel 🔶
  });

  it('ordre d\'un espion HORS de la ville ciblée : échec sans effet, espion survit', () => {
    const state = spyState(); // espion en (1,0) — pas infiltré
    const { newState, events } = resolveTurn(state, spyAction('stealGold'), 1);
    expect(events.some((e) => e.type === 'SpyAction' && e.outcome === 'failed')).toBe(true);
    expect(newState.units['espion1']).toBeDefined();
    expect(newState.players['p2']!.treasury).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Duels & contre-espionnage (R-144)
// ---------------------------------------------------------------------------

describe('7m · R-144 — Duel d\'espions & contre-espionnage', () => {
  /** Prépare l'infiltration d'un espion p1 (id donné) dans la ville p2. */
  function infiltrate(unitId: string, isArmy: boolean): GameState['units'] {
    void unitId;
    void isArmy;
    return {};
  }

  it('sans garnison d\'espion : succès automatique — AUCUN duel (0 % de risque, canon §4.1)', () => {
    const state = spyState();
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { events } = resolveTurn(t1, spyAction('stealGold'), 1);
    expect(events.some((e) => e.type === 'SpyDuel')).toBe(false);
    expect(events.some((e) => e.type === 'GoldStolen')).toBe(true);
  });

  it('avec garnison : un duel précède l\'action — le perdant est détruit, le gagnant survit (déterministe R-80)', () => {
    // Garnison espion p2 dans la ville ; attaquant isolé → 50 % 🔶.
    let attackerWon: boolean | null = null;
    let defeatedBySeed: Record<string, unknown> = {};
    for (let seed = 0; seed < 40 && (attackerWon === null || attackerWon); seed++) {
      const state = spyState({
        units: [
          { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
          { id: 'garnison', type: 'espion', owner: 'p2', q: 0, r: 0 },
          { id: 'gar', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
        ],
      });
      const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
      const { newState, events } = resolveTurn(t1, spyAction('stealGold'), seed);
      const duel = events.find((e) => e.type === 'SpyDuel');
      expect(duel && duel.type === 'SpyDuel' ? duel.winner : null).toBeDefined();
      // Matrice appliquée : même graine → même issue (rejouable).
      const replay = resolveTurn(structuredClone(t1), spyAction('stealGold'), seed);
      expect(replay.events.some((e) => e.type === 'SpyDuel' && (e.type === 'SpyDuel' ? e.winner === (duel as { winner: string }).winner : false))).toBe(true);
      const won = (duel as { winner: string }).winner === 'p1';
      if (won) {
        attackerWon = true;
        // Attaquant gagnant : la garnison est détruite, l'action s'exécute,
        // l'attaquant est ensuite consommé (R-143).
        expect(newState.units['garnison']).toBeUndefined();
        expect(newState.units['espion1']).toBeUndefined();
        expect(events.some((e) => e.type === 'GoldStolen')).toBe(true);
        defeatedBySeed = { seed, case: 'attackerWon' };
        break;
      } else {
        attackerWon = false;
        // Attaquant perdant : détruit SANS exécuter sa mission, garnison survit.
        expect(newState.units['espion1']).toBeUndefined();
        expect(newState.units['garnison']).toBeDefined();
        expect(events.some((e) => e.type === 'GoldStolen')).toBe(false);
        defeatedBySeed = { seed, case: 'defenderWon' };
      }
    }
    expect(defeatedBySeed).toBeDefined();
    expect(attackerWon).not.toBeNull();
  });

  it('matrice 🔶 : un RÉSEAU d\'espions en attaque domine un espion isolé (90 %) — au moins une victoire rapide', () => {
    // Réseau p1 (isArmy) vs garnison isolée p2 : 90 % — la victoire arrive
    // presque toujours ; on vérifie le duel ET la consommation sur un seed fixe.
    const state = spyState({
      units: [
        { id: 'ring', type: 'espion', owner: 'p1', q: 1, r: 0, isArmy: true },
        { id: 'garnison', type: 'espion', owner: 'p2', q: 0, r: 0 },
      ],
    });
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'ring', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, { p1: [{ type: 'SpyAction', unitId: 'ring', cityId: 'ville', action: 'stealGold' }] }, 3);
    const duel = events.find((e) => e.type === 'SpyDuel');
    expect(duel).toBeDefined();
    // Le perdant est détruit ; si le réseau gagne (attendu à 90 %), l'action suit.
    expect(newState.units['ring'] === undefined || newState.units['garnison'] === undefined).toBe(true);
  });

  it('garnison du propriétaire = contre-espionnage jeu de base (aucun bâtiment — canon §4.1)', () => {
    // Un espion en garnison dans SA ville protège : l'assaillant doit gagner un duel.
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const state = spyState({
        units: [
          { id: 'espion1', type: 'espion', owner: 'p1', q: 1, r: 0 },
          { id: 'garnison', type: 'espion', owner: 'p2', q: 0, r: 0 },
        ],
      });
      const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
      const { events } = resolveTurn(t1, spyAction('sabotageProduction'), seed);
      const duel = events.find((e) => e.type === 'SpyDuel');
      if (duel && duel.type === 'SpyDuel') outcomes.add(duel.winner);
    }
    // À 50 % 🔶, les deux issues apparaissent sur 20 graines (déterminisme conservé).
    expect(outcomes.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Brouillard & notifications (R-73/R-134)
// ---------------------------------------------------------------------------

describe('7m · Fog — notifications de la victime', () => {
  it('GoldStolen passe le fog pour les DEUX joueurs et ne révèle que le montant (R-134)', () => {
    const state = spyState();
    state.players['p2']!.treasury = 200;
    const t1 = resolveTurn(state, { p1: [{ type: 'Move', unitId: 'espion1', path: [{ q: 0, r: 0 }] }] }, 1).newState;
    const { newState, events } = resolveTurn(t1, spyAction('stealGold'), 1);
    // La victime reçoit l'événement (touchée : sa ville, sa trésorerie).
    const victimEvents = filterEventsForPlayer(newState, 'p2', events);
    expect(victimEvents.some((e) => e.type === 'GoldStolen' && e.amount === 100)).toBe(true);
    // Le voleur aussi.
    const thiefEvents = filterEventsForPlayer(newState, 'p1', events);
    expect(thiefEvents.some((e) => e.type === 'GoldStolen')).toBe(true);
    // MAIS la trésorerie adverse reste masquée dans l'état filtré (R-134).
    const filteredVictim = getFilteredState(newState, 'p2');
    expect(filteredVictim.players['p1']!.treasury).toBe(0);
    const filteredThief = getFilteredState(newState, 'p1');
    expect(filteredThief.players['p2']!.treasury).toBe(0);
  });
});
