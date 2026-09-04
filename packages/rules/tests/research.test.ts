/**
 * Tests Phase 7a — recherche technologique (RULES.md §8.1, R-85/R-87) et
 * migration du schéma v4 → v5.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrateState } from '../src/state.js';
import type { GameState } from '../src/state.js';
import { applySetResearch, creditScience } from '../src/research.js';

describe('migration v4 → v5 (R-85 : champs de recherche additifs)', () => {
  const v4: Record<string, unknown> = {
    schemaVersion: 4,
    turn: 3,
    phase: 'orders',
    players: {
      p1: { id: 'p1', gold: 5, science: 7, scienceRatio: 0.5, vision: { explored: [], visible: [] }, missedTurns: 0 },
      p2: { id: 'p2', gold: 0, science: 0, scienceRatio: 0.5, vision: { explored: [], visible: [] }, missedTurns: 1 },
    },
  };

  it('défauts vides : researching null, progression {}, techsUnlocked [], scienceStored 0', () => {
    const out = MIGRATIONS[5]!(v4) as unknown as GameState;
    expect(out.players['p1']!.researching).toBeNull();
    expect(out.players['p1']!.scienceProgress).toEqual({});
    expect(out.players['p1']!.techsUnlocked).toEqual([]);
    expect(out.players['p1']!.scienceStored).toBe(0);
    // champs v4 préservés (7l : `gold` devient `treasury` en v15 — la
    // migration unitaire v4→v5 conserve l'ancien champ tel quel)
    expect((out.players['p1'] as unknown as { gold: number }).gold).toBe(5);
    expect(out.players['p1']!.science).toBe(7);
  });

  it('idempotente : appliquer deux fois ne change rien', () => {
    const once = MIGRATIONS[5]!(v4);
    const twice = MIGRATIONS[5]!(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it('migrateState applique toute la chaîne de migrations jusqu’à la version courante', () => {
    const out = migrateState<GameState>(structuredClone(v4));
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(18); // 7m : nukesLaunched (R-139)
    expect(out.players['p2']!.techsUnlocked).toEqual([]);
    // 7l · R-134 : au bout de la chaîne, l'or v4 devient la trésorerie (report).
    expect(out.players['p1']!.treasury).toBe(5);
  });
});

describe('R-85 · SetResearch (action immédiate) et accumulation', () => {
  it('validation : tech inconnue / déjà débloquée / prérequis manquants → refus', () => {
    const state = makeState();
    expect(applySetResearch(state, 'p1', 'inconnue').ok).toBe(false);
    const withAlphabet = structuredClone(state);
    withAlphabet.players['p1']!.techsUnlocked = ['alphabet'];
    expect(applySetResearch(withAlphabet, 'p1', 'alphabet').ok).toBe(false);
    expect(applySetResearch(state, 'p1', 'travail_du_fer').ok).toBe(false); // exige le bronze
    expect(applySetResearch(state, 'inconnu', 'alphabet').ok).toBe(false);
  });

  it('choix valide : researching posé ; changement libre, progression conservée PAR tech', () => {
    const state = makeState();
    // 7 points sur Alphabet
    const st1 = structuredClone(state);
    st1.players['p1']!.researching = 'alphabet';
    creditScience(st1, 'p1', 7);
    expect(st1.players['p1']!.scienceProgress['alphabet']).toBe(7);
    // changement vers Poterie : la progression d'Alphabet est conservée
    const r = applySetResearch(st1, 'p1', 'poterie');
    expect(r.ok).toBe(true);
    const st2 = (r as { state: GameState }).state;
    expect(st2.players['p1']!.researching).toBe('poterie');
    expect(st2.players['p1']!.scienceProgress['alphabet']).toBe(7);
    // retour à Alphabet : on repart de 7
    const st3 = (applySetResearch(st2, 'p1', 'alphabet') as { state: GameState }).state;
    creditScience(st3, 'p1', 3);
    expect(st3.players['p1']!.scienceProgress['alphabet']).toBe(10);
    expect(st3.players['p1']!.techsUnlocked).toEqual([]); // coût 20
  });

  it('sans choix, la science s’accumule en réserve et se verse au premier choix (R-85)', () => {
    const state = makeState();
    const st = structuredClone(state);
    creditScience(st, 'p1', 12);
    expect(st.players['p1']!.scienceStored).toBe(12);
    const r = applySetResearch(st, 'p1', 'alphabet');
    expect(r.ok).toBe(true);
    const out = (r as { state: GameState }).state;
    expect(out.players['p1']!.scienceStored).toBe(0);
    expect(out.players['p1']!.scienceProgress['alphabet']).toBe(12);
  });

  it('complétion immédiate (réserve ≥ coût) : déblocage + événement TechResearched + débordement en OR (R-134 rév. 7l)', () => {
    const state = makeState();
    const st = structuredClone(state);
    creditScience(st, 'p1', 25); // réserve 25
    const r = applySetResearch(st, 'p1', 'alphabet'); // coût 20
    expect(r.ok).toBe(true);
    const ok = r as { ok: true; state: GameState; events: Array<{ type: string; tech: string; player: string }> };
    const out = ok.state;
    const events = ok.events;
    expect(out.players['p1']!.techsUnlocked).toEqual(['alphabet']);
    expect(out.players['p1']!.researching).toBeNull();
    expect(out.players['p1']!.treasury).toBe(5); // 7l · R-134 : débordement converti 1:1 en or
    expect(out.players['p1']!.scienceStored).toBe(0); // plus de report (canon)
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('TechResearched');
    expect(events[0]!.tech).toBe('alphabet');
    expect(events[0]!.player).toBe('p1');
  });

  it('Phase C (R-85) : la science des villes alimente la tech courante ; complétion à coût atteint', () => {
    // ville pop 2 sur mer : commerce = 1 (centre) + 2 + 2 = 5 → science 2/tour (ratio 0.5)
    let state = makeState({
      fill: 'eau',
      terrainOverrides: { '0,0': 'ville' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['1,0', '0,1'], conversion: 'science' }],
    });
    const r = applySetResearch(state, 'p1', 'alphabet');
    expect(r.ok).toBe(true);
    state = (r as { state: GameState }).state;
    // 10 tours : 2 science/tour → 20 (coût Alphabet) au tour 10
    for (let i = 0; i < 10; i++) {
      state = resolveTurn(state, {}, state.rngSeed).newState;
    }
    const p1 = state.players['p1']!;
    expect(p1.techsUnlocked).toEqual(['alphabet']);
    expect(p1.researching).toBeNull();
  });

  it('Phase C : l’événement TechResearched est émis à la complétion (journal de résolution)', () => {
    let state = makeState({
      fill: 'eau',
      terrainOverrides: { '0,0': 'ville' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['1,0', '0,1'], conversion: 'science' }],
    });
    state = (applySetResearch(state, 'p1', 'alphabet') as { state: GameState }).state;
    let found = 0;
    for (let i = 0; i < 10 && found === 0; i++) {
      const result = resolveTurn(state, {}, state.rngSeed);
      state = result.newState;
      found = result.events.filter((e) => e.type === 'TechResearched').length;
    }
    expect(found).toBeGreaterThanOrEqual(1);
  });
});

describe('R-87 · déblocage des items de production', () => {
  function scienceCity(): GameState {
    return makeState({
      fill: 'eau',
      terrainOverrides: { '0,0': 'ville' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['1,0', '0,1'], conversion: 'science' }],
    });
  }

  it('SetProduction sur un item verrouillé → refusé par le moteur (aucune file)', () => {
    const state = scienceCity();
    const result = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'archer' } }] }, state.rngSeed);
    expect(result.newState.cities['c1']!.production).toBeNull();
  });

  it('item implémenté mais tech débloquée → accepté ; item non implémenté (Caravane, 7h) → refusé ; Espion activé (7g)', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['travail_du_bronze', 'ecriture'];
    const ok = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'archer' } }] }, state.rngSeed);
    expect(ok.newState.cities['c1']!.production?.item).toEqual({ kind: 'unit', id: 'archer' });
    const ko = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'caravane' } }] }, state.rngSeed);
    expect(ko.newState.cities['c1']!.production).toBeNull(); // caravane : implemented false (7h)
    // 7g : l'Espion est maintenant implémenté et son tech est débloqué — la file EST posée.
    const spy = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'espion' } }] }, state.rngSeed);
    expect(spy.newState.cities['c1']!.production?.item).toEqual({ kind: 'unit', id: 'espion' });
  });

  it('bâtiment déjà en file au moment du déblocage : la file ne change pas (validité préservée)', () => {
    // Grenier est verrouillé (Poterie) : une file posée AVANT le déblocage reste en l'état.
    const state = scienceCity();
    state.cities['c1']!.production = { item: { kind: 'building', id: 'grenier' }, progress: 10 };
    // sans déblocage, la résolution continue la production (file préexistante non re-filtrée — R-87 porte sur SetProduction)
    const result = resolveTurn(state, {}, state.rngSeed);
    // production 1/tour ×1 (pop 2, bonus 0.25) sur prairie-eau : progress avance ou reste — l'important est que la file reste
    expect(result.newState.cities['c1']!.production?.item).toEqual({ kind: 'building', id: 'grenier' });
  });

  it('scénario R-85/R-87 : réserve → Alphabet → Bibliothèque constructible → Travail du bronze → Archer produit et jouable', () => {
    let state = scienceCity();
    // réserve 20 → choix Alphabet → complétion immédiate
    creditScience(state, 'p1', 20);
    const r = applySetResearch(state, 'p1', 'alphabet');
    expect(r.ok).toBe(true);
    state = (r as { state: GameState }).state;
    expect(state.players['p1']!.techsUnlocked).toEqual(['alphabet']);
    // Bibliothèque (alphabet) : SetProduction accepté
    const biblio = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'bibliotheque' } }] }, state.rngSeed);
    expect(biblio.newState.cities['c1']!.production?.item).toEqual({ kind: 'building', id: 'bibliotheque' });
    // Travail du bronze : racine, toujours cherchable
    const r2 = applySetResearch(state, 'p1', 'travail_du_bronze');
    expect(r2.ok).toBe(true);
    state = (r2 as { state: GameState }).state;
    state.players['p1']!.scienceStored = 20;
    const done = applySetResearch(state, 'p1', 'travail_du_bronze'); // changement : la réserve verse sur bronze
    expect(done.ok).toBe(true);
    state = (done as { state: GameState }).state;
    expect(state.players['p1']!.techsUnlocked.sort()).toEqual(['alphabet', 'travail_du_bronze']);
    // Archer : posé en file, produit quand la progression atteint 15
    state.cities['c1']!.production = { item: { kind: 'unit', id: 'archer' }, progress: 14 };
    const produced = resolveTurn(state, {}, state.rngSeed);
    const archer = Object.values(produced.newState.units).find((u) => u.type === 'archer');
    expect(archer).toBeDefined();
    expect(archer!.owner).toBe('p1');
    expect(archer!.mp).toBeGreaterThan(0); // jouable (PM régénérés, R-72)
    expect(produced.events.some((e) => e.type === 'UnitProduced')).toBe(true);
  });
});
