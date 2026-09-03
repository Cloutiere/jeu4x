/**
 * Tests Phase 7e — arbre technologique complet & contenu terrestre.
 * RULES.md §8.1bis (R-109 Premier découvrir, R-110 Obsolescence,
 * R-111 Remplacement d'infrastructures, R-112 Colon à 2 population),
 * R-59 (unités à distance — première implémentation réelle) et effets de
 * bâtiments (§8.4 : Remparts, Aqueduc, Marché/Banque, Usine, Palais).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { applySetResearch } from '../src/research.js';
import { conversionGains } from '../src/conversion.js';
import type { GameState } from '../src/state.js';
import { makeState } from '../src/fixtures.js';
import { hexDistance } from '../src/hex.js';

/** Ville p1 à science garantie : 2 citoyens sur prairies (2 N chacun), pop 3. */
function scienceCity(): GameState {
  return makeState({
    cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 3, workedTiles: ['1,0', '0,1', '0,2'] }],
  });
}

describe('R-109 · Premier découvrir (7e)', () => {
  it('le premier à compléter est enregistré dans firstBy et reçoit son unité gratuite', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['travail_du_bronze'];
    state.players['p1']!.scienceStored = 30; // coût exact de Travail du fer
    const result = applySetResearch(state, 'p1', 'travail_du_fer');
    expect(result.ok).toBe(true);
    const st = (result as { state: GameState }).state;
    expect(st.firstBy['travail_du_fer']).toBe('p1');
    // Récompense : une Légion gratuite (implémentée) — posée près de la ville.
    const legion = Object.values(st.units).find((u) => u.type === 'legion');
    expect(legion).toBeDefined();
    expect(legion!.owner).toBe('p1');
    const events = (result as { events: Array<{ type: string }> }).events;
    expect(events.some((e) => e.type === 'FirstDiscovered')).toBe(true);
  });

  it('le second à compléter NE reçoit PAS la récompense (firstBy déjà posé)', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['travail_du_bronze'];
    state.players['p1']!.scienceStored = 30;
    state.firstBy = { travail_du_fer: 'p2' }; // p2 a déjà été premier
    const result = applySetResearch(state, 'p1', 'travail_du_fer');
    expect(result.ok).toBe(true);
    const st = (result as { state: GameState }).state;
    expect(st.firstBy['travail_du_fer']).toBe('p2'); // inchangé
    expect(Object.values(st.units).some((u) => u.type === 'legion')).toBe(false);
  });

  it('récompense or (Banque : 100 pièces) et population instantanée (Irrigation : +1 pop partout)', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['monnaie', 'code_des_lois', 'litteratie'];
    state.players['p1']!.scienceStored = 190;
    const result = applySetResearch(state, 'p1', 'banque');
    expect(result.ok).toBe(true);
    const st = (result as { state: GameState }).state;
    expect(st.players['p1']!.gold).toBe(100);
    const events = (result as { events: Array<{ type: string; gold?: number }> }).events;
    expect(events.find((e) => e.type === 'FirstDiscovered')?.gold).toBe(100);

    const state2 = scienceCity();
    state2.players['p1']!.techsUnlocked = ['poterie', 'maconnerie'];
    state2.players['p1']!.scienceStored = 60;
    const r2 = applySetResearch(state2, 'p1', 'irrigation');
    expect(r2.ok).toBe(true);
    const st2 = (r2 as { state: GameState }).state;
    expect(st2.cities['c1']!.pop).toBe(4); // 3 + 1 (récompense)
  });

  it('bonus perCity : +5 Or dans toutes les villes (Industrialisation), chaque tour', () => {
    const state = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true },
        { id: 'c2', owner: 'p1', q: 4, r: 4 },
      ],
    });
    state.firstBy = { industrialisation: 'p1' }; // récompense perCity {gold: 5}
    const { newState } = resolveTurn(state, {}, 1);
    // 2 villes × (5 or de récompense + 1 or du commerce de la case de ville).
    expect(newState.players['p1']!.gold).toBe(12);
  });
});

describe('R-110 · Obsolescence des unités (7e)', () => {
  it('SetProduction d’un Guerrier refusé après Travail du fer ; la Légion reste productible', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['travail_du_bronze', 'travail_du_fer'];
    const ko = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }] }, 1);
    expect(ko.newState.cities['c1']!.production).toBeNull(); // obsolète
    const ok = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'legion' } }] }, 1);
    expect(ok.newState.cities['c1']!.production?.item).toEqual({ kind: 'unit', id: 'legion' });
  });

  it('les unités existantes obsolètes sont CONSERVÉES (retrait du menu seulement)', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 2 }],
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['1,0', '0,1'] }],
    });
    state.players['p1']!.techsUnlocked = ['travail_du_bronze', 'travail_du_fer'];
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.units['u1']!.type).toBe('guerrier'); // toujours en jeu
  });
});

describe('R-112 · Colon : coût en population officiel (2 — décision d’Erik, 02/09)', () => {
  it('la production d’un Colon consomme 2 population (et retire les citoyens excédentaires)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 3, workedTiles: ['1,0', '0,1'], production: { item: { kind: 'unit', id: 'colon' }, progress: 19 } }],
    });
    const { newState, events } = resolveTurn(state, {}, 1);
    const city = newState.cities['c1']!;
    expect(city.pop).toBe(1); // 3 − 2
    expect(city.workedTiles).toHaveLength(1); // citoyen excédentaire retiré
    expect(Object.values(newState.units).some((u) => u.type === 'colon')).toBe(true);
    expect(events.some((e) => e.type === 'PopulationConsumed')).toBe(true);
  });

  it('pop insuffisante (pop 1) : le Colon reste en attente (progression conservée)', () => {
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, production: { item: { kind: 'unit', id: 'colon' }, progress: 20 } }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = newState.cities['c1']!;
    expect(city.pop).toBe(1);
    expect(city.production?.item).toEqual({ kind: 'unit', id: 'colon' });
    expect(city.production?.progress).toBe(20); // en attente 🔶
    expect(Object.values(newState.units).some((u) => u.type === 'colon')).toBe(false);
  });
});

describe('R-111 · Marché/Banque : multiplicateurs d’or et REMPLACEMENT (7e)', () => {
  it('conversionGains : Marché ×2 or, Banque ×4 or, Université ×4 science (data-driven)', () => {
    expect(conversionGains(5, 'gold', ['marche'])).toEqual({ gold: 10, science: 0 });
    expect(conversionGains(5, 'gold', ['banque'])).toEqual({ gold: 20, science: 0 });
    expect(conversionGains(12, 'science', ['universite'])).toEqual({ gold: 0, science: 48 });
    expect(conversionGains(12, 'science', ['bibliotheque'])).toEqual({ gold: 0, science: 18 }); // R-88 inchangée
    expect(conversionGains(12, 'science', [])).toEqual({ gold: 0, science: 12 });
  });

  it('la Banque RETIRE le Marché de la ville à sa complétion (remplacement R-111)', () => {
    const state = makeState({
      cities: [{
        id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: ['1,0', '0,1'],
        buildings: ['marche'],
        production: { item: { kind: 'building', id: 'banque' }, progress: 120 },
      }],
    });
    state.players['p1']!.techsUnlocked = ['monnaie', 'banque', 'code_des_lois', 'litteratie'];
    const { newState } = resolveTurn(state, {}, 1);
    expect(newState.cities['c1']!.buildings).toEqual(['banque']); // le Marché a disparu
  });

  it('Banque sans Marché dans la ville : SetProduction refusé (prérequis de bâtiment)', () => {
    const state = scienceCity();
    state.players['p1']!.techsUnlocked = ['monnaie', 'banque', 'code_des_lois', 'litteratie'];
    const { newState } = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'banque' } }] }, 1);
    expect(newState.cities['c1']!.production).toBeNull();
  });
});

describe('7e · Effets de bâtiments actifs', () => {
  it('Aqueduc : seuil de croissance réduit d’un tiers (12+4 nourriture fait croître avec Aqueduc, pas sans)', () => {
    const withAqueduct = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 12, buildings: ['aqueduc'], workedTiles: ['1,0', '0,1'] }],
    });
    const without = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 12, workedTiles: ['1,0', '0,1'] }],
    });
    const grown = resolveTurn(withAqueduct, {}, 1).newState;
    const notGrown = resolveTurn(without, {}, 1).newState;
    // Seuil sans Aqueduc : 10×2 = 20 → 16 < 20, pas de croissance.
    expect(notGrown.cities['c1']!.pop).toBe(2);
    // Seuil avec Aqueduc 🔶 : round(20 × 0,67) = 13 → 16 ≥ 13, croissance.
    expect(grown.cities['c1']!.pop).toBe(3);
  });

  it('Usine : production de la ville ×2 (progression doublée à rendements égaux)', () => {
    const base = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, production: { item: { kind: 'unit', id: 'guerrier' }, progress: 0 } }] });
    const withFactory = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, buildings: ['usine'], production: { item: { kind: 'unit', id: 'guerrier' }, progress: 0 } }] });
    const rBase = resolveTurn(base, {}, 1).newState;
    const rFactory = resolveTurn(withFactory, {}, 1).newState;
    expect(rFactory.cities['c1']!.production!.progress).toBe(2 * rBase.cities['c1']!.production!.progress);
  });
});

describe('R-59 · Première implémentation réelle : Catapulte (unité à distance)', () => {
  /** Catapulte p1 en (0,0) face à un Guerrier p2 en (1,0), guerre v1. */
  function catapultVsWarrior(): GameState {
    return makeState({
      units: [
        { id: 'u1', type: 'catapulte', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 },
      ],
    });
  }

  it('attaque depuis sa case : aucun dégât en retour de mêlée, l’attaquant reste en place (R-59-a/R-59-b)', () => {
    const state = catapultVsWarrior();
    const { newState } = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] },
      1,
    );
    const cat = newState.units['u1']!;
    const war = newState.units['u2']!;
    // Riposte de mêlée impossible : le Guerrier perd 1 PV par échange (X-5),
    // la Catapulte ressort pleine vie, TOUTES les positions sont inchangées.
    expect(cat.q).toBe(0);
    expect(cat.r).toBe(0);
    expect(cat.hp).toBe(3);
    expect(war.hp).toBe(2);
    expect(war.q).toBe(1);
    expect(war.r).toBe(0);
  });

  it('victoire à distance : la Catapulte n’avance JAMAIS sur la case libérée (R-59-a, 3 tours)', () => {
    let state = catapultVsWarrior();
    for (let turn = 0; turn < 3 && state.units['u2']; turn++) {
      const { newState } = resolveTurn(
        state,
        { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 1, r: 0 } }] },
        1 + turn,
      );
      state = newState;
    }
    expect(state.units['u2']).toBeUndefined(); // Guerrier détruit par usure
    const cat = state.units['u1']!;
    expect(cat.q).toBe(0); // jamais avancée — R-59-a
    expect(cat.r).toBe(0);
  });

  it('R-59-d : le défenseur à distance qui ne vainc pas cède systématiquement sa case (rôles inversés)', () => {
    // Catapulte p2 en défense, Guerrier p1 attaque depuis l'adjacent.
    const state = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'catapulte', owner: 'p2', q: 0, r: 0 },
      ],
    });
    const { newState, events } = resolveTurn(
      state,
      { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 0, r: 0 } }] },
      1,
    );
    const cat = newState.units['u2']!;
    // Survie mutuelle → le DÉFENSEUR à distance se replie (Retreat) : la
    // catapulte n'est plus sur sa case ; le Guerrier garde la sienne.
    expect(cat.q === 0 && cat.r === 0).toBe(false);
    expect(events.some((e) => e.type === 'Retreat' && e.unitId === 'u2')).toBe(true);
    expect(newState.units['u1']!.q).toBe(1);
    expect(newState.units['u1']!.r).toBe(0);
    expect(hexDistance(newState.units['u1']!, cat)).toBeGreaterThanOrEqual(0);
  });
});

describe('7e · Remparts et Palais : défense de ville (S_def, §7.4)', () => {
  /** PV (attaquant, défenseur) après un échange contre la ville défendue, même graine. */
  function hpAfter(withWalls: boolean): { attacker: number; defender: number } {
    const state = makeState({
      terrainOverrides: { '0,0': 'ville' },
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 1, r: 0 },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 0, r: 0 }, // garnison (R-57)
      ],
      cities: [{ id: 'c1', owner: 'p2', q: 0, r: 0, capital: false, buildings: withWalls ? ['remparts'] : [] }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'Attack', unitId: 'u1', target: { q: 0, r: 0 } }] }, 29);
    return { attacker: newState.units['u1']!.hp, defender: newState.units['u2']!.hp };
  }

  it('les Remparts (+100 %) durcissent la ville : même graine, le défenseur encaisse mieux (graine 29 : p 0,307 → 0,138)', () => {
    const bare = hpAfter(false);
    const walled = hpAfter(true);
    // Graine 29 (roll 0,2106) : le défenseur d'une ville NUE (S_def 1,5 →
    // p_att 0,307) est touché ; avec Remparts (S_def 2,5 → p_att 0,138) le
    // roll ne suffit plus et c'est l'ATTAQUANT qui perd 1 PV.
    expect(bare.defender).toBe(2);
    expect(bare.attacker).toBe(3);
    expect(walled.defender).toBe(3); // encaisse mieux à même graine
    expect(walled.attacker).toBe(2); // …et le durcissement se voit sur l'assaillant
  });

  it('le Palais (+50 %) est posé à la FONDATION de la capitale (moteur)', () => {
    const state = makeState({
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 3, r: 3 }],
    });
    const { newState } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    const capitals = Object.values(newState.cities).filter((c) => c.capital);
    expect(capitals).toHaveLength(1);
    expect(capitals[0]!.buildings).toContain('palais');
  });
});

describe('7e · e2e : recherche → Catapulte produite → tir sans avancer → Remparts', () => {
  it('scénario complet terrestre (R-85/R-87/R-59/R-111)', () => {
    let state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 4, workedTiles: ['1,0', '0,1', '0,2', '1,2'] }],
      units: [{ id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 0 }],
    });
    // 1. Recherche de Mathématiques (Écriture + Maçonnerie prérequis, avec
    //    l'arbre racine) — la science des villes paie la complétion.
    state.players['p1']!.techsUnlocked = ['alphabet', 'ecriture', 'poterie', 'maconnerie'];
    state.players['p1']!.scienceStored = 70; // coût exact de Mathématiques
    const r = applySetResearch(state, 'p1', 'mathematiques');
    expect(r.ok).toBe(true);
    state = (r as { state: GameState }).state;
    expect(state.players['p1']!.techsUnlocked).toContain('mathematiques');
    // Premier découvrir Mathématiques : une Catapulte gratuite !
    const freeCat = Object.values(state.units).find((u) => u.type === 'catapulte');
    expect(freeCat).toBeDefined();

    // 2. Remparts (Maçonnerie) : posés en file et complétés (coût 100).
    const prod = resolveTurn(state, { p1: [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'remparts' } }] }, 2);
    state = prod.newState;
    expect(state.cities['c1']!.production?.item).toEqual({ kind: 'building', id: 'remparts' });
    state.cities['c1']!.production!.progress = 100; // avance de file directe (production testée ailleurs)
    const built = resolveTurn(state, {}, 3);
    state = built.newState;
    expect(state.cities['c1']!.buildings).toContain('remparts');

    // 3. La Catapulte (gratuite) tire sur le Guerrier : sans avancer, sans riposte.
    const catId = Object.keys(state.units).find((id) => state.units[id]!.type === 'catapulte')!;
    const catBefore = { ...state.units[catId]! };
    let fired = resolveTurn(state, { p1: [{ type: 'Attack', unitId: catId, target: { q: 1, r: 0 } }] }, 4);
    state = fired.newState;
    const war = state.units['u2']!;
    expect(war.hp).toBe(2); // 1 PV perdu, aucune riposte
    expect(state.units[catId]!.hp).toBe(3);
    expect(state.units[catId]!.q).toBe(catBefore.q);
    expect(state.units[catId]!.r).toBe(catBefore.r);
    void fired;
  });
});
