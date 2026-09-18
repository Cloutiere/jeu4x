/**
 * FIN-DE-TOUR-PRODUCTION — prédicat pur `blocagesFinDeTour` (spécification
 * d'Erik du 18/09) : impossible de terminer le tour sans production ni
 * recherche sélectionnée (résiduels compris). R-134 confirmée : le surplus de
 * recherche à la complétion reste converti en or — le résiduel de fin de tour
 * est la réserve `scienceStored` (bonus de hutte sans recherche sélectionnée).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { TECHS } from '../src/techs.js';
import { creditScience } from '../src/research.js';
import {
  arbreRechercheEpuise,
  blocagesFinDeTour,
  formatBlocagesFinDeTour,
  libelleBlocageFinDeTour,
} from '../src/finDeTour.js';
import type { GameState } from '../src/state.js';

/** Ville pop 1 sans case travaillée : citoyen intérieur Ouvrier → 1 marteau/tour. */
function villeProductive(st: GameState): void {
  st.cities['c1'] = {
    id: 'c1',
    q: 0,
    r: 0,
    owner: 'p1',
    pop: 1,
    capital: true,
    foodStored: 0,
    production: null,
    workedTiles: [],
    buildings: [],
    conversion: 'gold',
    wonders: [],
    pendingSalvage: 0,
    settledGreatPersons: [],
    wasCaptured: false,
    cultureCumulee: 0,
  };
}

/** Ville pop 1 travaillant une case déserte (2 commerce) focus Science →
 *  science/tour > 0, production 0 (aucun citoyen intérieur). */
function villeScientifique(st: GameState, id = 'c1'): void {
  st.cities[id] = {
    id,
    q: 0,
    r: 0,
    owner: 'p1',
    pop: 1,
    capital: true,
    foodStored: 0,
    production: null,
    workedTiles: ['1,0'],
    buildings: [],
    conversion: 'science',
    wonders: [],
    pendingSalvage: 0,
    settledGreatPersons: [],
    wasCaptured: false,
    cultureCumulee: 0,
  };
  st.map['1,0'] = { terrain: 'desert', resource: null };
}

describe('FIN-DE-TOUR · blocage PRODUCTION (ville sans file)', () => {
  it('production/tour > 0 sans production sélectionnée → blocage', () => {
    const st = makeState();
    villeProductive(st);
    const blocages = blocagesFinDeTour(st, 'p1');
    expect(blocages).toEqual([{ kind: 'production', cityId: 'c1', reason: '1 marteaux/tour' }]);
  });

  it('réserve C7 (pendingSalvage) sans production sélectionnée → blocage, même à 0 marteaux/tour', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.workedTiles = ['1,0']; // citoyen affecté : production 0
    st.map['1,0'] = { terrain: 'prairie', resource: null };
    st.cities['c1']!.pendingSalvage = 40;
    const blocages = blocagesFinDeTour(st, 'p1');
    expect(blocages).toEqual([{ kind: 'production', cityId: 'c1', reason: '40 marteaux en réserve (C7)' }]);
  });

  it('ville à 0 marteaux sans réserve → jamais bloquée', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.workedTiles = ['1,0']; // citoyen affecté (prairie 0/0) : production 0
    st.map['1,0'] = { terrain: 'prairie', resource: null };
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });

  it('production sélectionnée (état) → ville débloquée', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });

  it('production BROUILLON (SetProduction en file, pas encore résolu) → ville débloquée', () => {
    const st = makeState();
    villeProductive(st);
    expect(
      blocagesFinDeTour(st, 'p1', [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }]),
    ).toEqual([]);
  });

  it('la ville du RIVAL ne bloque pas MON tour', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.owner = 'p2';
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });
});

describe('FIN-DE-TOUR · blocage RECHERCHE', () => {
  it('science/tour > 0 sans recherche sélectionnée → blocage', () => {
    const st = makeState();
    villeScientifique(st);
    const blocages = blocagesFinDeTour(st, 'p1');
    expect(blocages).toEqual([{ kind: 'recherche', reason: '1 science/tour sans technologie sélectionnée', points: 0 }]);
  });

  it('hutte recherche (+20 scienceStored) sans recherche sélectionnée → blocage même sans science/tour', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.workedTiles = ['1,0']; // production 0
    st.map['1,0'] = { terrain: 'prairie', resource: null };
    st.players['p1']!.scienceStored = 20;
    const blocages = blocagesFinDeTour(st, 'p1');
    expect(blocages).toEqual([
      { kind: 'recherche', reason: '20 point(s) de recherche en attente', points: 20 },
    ]);
    expect(libelleBlocageFinDeTour(st, blocages[0]!)).toBe(
      'Recherche : sélectionnez une technologie (+20 points en attente — 20 point(s) de recherche en attente)',
    );
  });

  it('recherche sélectionnée → pas de blocage (le résiduel se versera sur la tech)', () => {
    const st = makeState();
    villeScientifique(st);
    st.players['p1']!.scienceStored = 20;
    st.players['p1']!.researching = 'alphabet';
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });

  it('arbre de recherche ÉPUISÉ → le blocage recherche est levé (même résiduel > 0)', () => {
    const st = makeState();
    villeScientifique(st);
    st.players['p1']!.scienceStored = 20;
    st.players['p1']!.techsUnlocked = Object.keys(TECHS);
    expect(arbreRechercheEpuise(st.players['p1']!)).toBe(true);
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });

  it('aucune science et aucun résiduel → pas de blocage recherche', () => {
    const st = makeState();
    expect(blocagesFinDeTour(st, 'p1')).toEqual([]);
  });
});

/** (supprimé — l'arbre épuisé se construit en débloquant TECHS entier) */

describe('FIN-DE-TOUR · cumul et libellés', () => {
  it('plusieurs villes bloquées : une entrée par ville, id croissant', () => {
    const st = makeState();
    villeProductive(st);
    st.cities['c1']!.name = 'Athènes';
    villeScientifique(st, 'c2');
    st.cities['c2']!.owner = 'p1';
    st.cities['c2']!.q = 3;
    st.cities['c2']!.r = 0;
    const blocages = blocagesFinDeTour(st, 'p1');
    expect(blocages.map((b) => b.kind)).toEqual(['production', 'recherche']);
    expect(formatBlocagesFinDeTour(st, blocages)).toBe(
      'fin de tour bloquée — Athènes : sélectionnez une production (1 marteaux/tour) ; ' +
        'Recherche : sélectionnez une technologie (+0 points en attente — 1 science/tour sans technologie sélectionnée)',
    );
  });
});

describe('R-134 confirmée (Erik 18/09) : le SURPLUS de complétion reste converti en or', () => {
  it('creditScience : débordement → trésorerie, JAMAIS scienceStored', () => {
    const st = makeState();
    st.players['p1']!.researching = 'alphabet'; // coût 20 (canon)
    st.players['p1']!.treasury = 0;
    creditScience(st, 'p1', 25);
    expect(st.players['p1']!.techsUnlocked).toContain('alphabet');
    expect(st.players['p1']!.treasury).toBe(5); // surplus 1:1 en or
    expect(st.players['p1']!.scienceStored).toBe(0);
    expect(st.players['p1']!.researching).toBeNull();
  });
});
