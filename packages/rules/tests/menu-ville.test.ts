/**
 * MENU-VILLE (décisions d'Erik du 13/09) — noms des villes fondées.
 * « Ville1, Ville2… » avec un compteur PAR JOUEUR (le Ville1 d'Erik et le
 * Ville1 du bot coexistent), table data-driven `NOMS_PAR_CIVILISATION` en
 * réserve (vide = fallback VilleN), migration schemaVersion 20 → 21 (champ
 * additif `City.name`, backfill « VilleN » déterministe, idempotent).
 */
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, makeState, migrateState, prochainNomVille, NOMS_PAR_CIVILISATION, resolveTurn } from '../src/index.js';
import type { City, GameState } from '../src/index.js';

function villePartielle(id: string, owner: string, name?: string): City {
  return {
    id, q: 0, r: 0, owner, pop: 1, capital: false, foodStored: 0, production: null,
    workedTiles: [], buildings: [], conversion: 'gold', cultureCumulee: 0,
    wonders: [],
    pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
    ...(name !== undefined ? { name } : {}),
  };
}

describe('prochainNomVille — compteur PAR JOUEUR (fallback VilleN)', () => {
  it('Ville1 d\'Erik et Ville1 du bot coexistent ; le compteur avance par joueur', () => {
    const cities = {
      c1: villePartielle('c1', 'p1', 'Ville1'),
      c2: villePartielle('c2', 'p1', 'Ville2'),
      c3: villePartielle('c3', 'p2', 'Ville1'),
    };
    expect(prochainNomVille(cities, 'p1')).toBe('Ville3');
    expect(prochainNomVille(cities, 'p2')).toBe('Ville2');
    expect(prochainNomVille({}, 'p1')).toBe('Ville1'); // aucune ville : Ville1
  });

  it('une ville sans nom (état ancien) compte dans le nombre de villes du joueur', () => {
    const cities = {
      c1: villePartielle('c1', 'p1'), // ville ancienne sans nom
      c2: villePartielle('c2', 'p1', 'Ville1'),
    };
    expect(prochainNomVille(cities, 'p1')).toBe('Ville3'); // 2 villes du joueur → Ville3
  });

  it('table data-driven NOMS_PAR_CIVILISATION : vide = fallback ; remplie = premier nom libre, puis fallback', () => {
    expect(Object.keys(NOMS_PAR_CIVILISATION).length).toBe(0); // en réserve — Erik remplira sans code
    const backup: string[] | undefined = NOMS_PAR_CIVILISATION.testciv;
    NOMS_PAR_CIVILISATION.testciv = ['Lutèce', 'Rome'];
    try {
      const cities = { c1: villePartielle('c1', 'p1', 'Lutèce') };
      expect(prochainNomVille(cities, 'p1', 'testciv')).toBe('Rome');
      const cites2 = { c1: villePartielle('c1', 'p1', 'Lutèce'), c2: villePartielle('c2', 'p1', 'Rome') };
      expect(prochainNomVille(cites2, 'p1', 'testciv')).toBe('Ville3'); // liste épuisée → fallback
    } finally {
      if (backup === undefined) delete NOMS_PAR_CIVILISATION.testciv;
      else NOMS_PAR_CIVILISATION.testciv = backup;
    }
  });
});

describe('fondation (R-64) — la ville fondée porte son nom VilleN', () => {
  it('le premier Colon fondé nomme « Ville1 » ; le second du MÊME joueur « Ville2 » ; les joueurs comptent séparément', () => {
    const state = makeState({
      units: [
        { id: 'u1', type: 'colon', owner: 'p1', q: 0, r: 0 },
        { id: 'u2', type: 'colon', owner: 'p1', q: 1, r: 4 },
        { id: 'u3', type: 'colon', owner: 'p2', q: 6, r: 1 },
      ],
    });
    const { newState } = resolveTurn(state, {
      p1: [
        { type: 'FoundCity', unitId: 'u1' },
        { type: 'FoundCity', unitId: 'u2' },
      ],
      p2: [{ type: 'FoundCity', unitId: 'u3' }],
    }, 1);
    const fondees = Object.values(newState.cities).filter((c) => !c.capital || c.owner);
    const noms = fondees.map((c) => c.name).sort();
    expect(noms).toEqual(['Ville1', 'Ville1', 'Ville2']); // Ville1 par joueur coexistent
  });
});

describe('Migration schemaVersion 20 → 21 (champ additif City.name)', () => {
  it('CURRENT_SCHEMA_VERSION = 25 ; MIGRATIONS[21] existe ; backfill VilleN déterministe PAR JOUEUR (id de ville croissant)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(26);
    expect(typeof MIGRATIONS[21]).toBe('function');
    const base = makeState({
      cities: [
        { id: 'c1', owner: 'p2', q: 0, r: 0, capital: true, pop: 2, workedTiles: [], buildings: ['palais'] },
        { id: 'c2', owner: 'p1', q: 2, r: 0, capital: true, pop: 2, workedTiles: [], buildings: ['palais'] },
        { id: 'c3', owner: 'p2', q: 4, r: 0, capital: false, pop: 1, workedTiles: [], buildings: [] },
      ],
    });
    const v20 = structuredClone(base) as unknown as Record<string, unknown>;
    v20.schemaVersion = 20;
    for (const c of Object.values(v20.cities as Record<string, Record<string, unknown>>)) delete c.name;
    const out = migrateState(v20) as unknown as GameState;
    expect(out.schemaVersion).toBe(26);
    expect(out.cities['c2']!.name).toBe('Ville1'); // p1 d'abord (aucune autre ville p1)
    expect(out.cities['c1']!.name).toBe('Ville1'); // compteur PAR JOUEUR — c2 de p1 n'a pas d'effet
    expect(out.cities['c3']!.name).toBe('Ville2'); // id croissant dans p2
  });

  it('un nom déjà porté est conservé (idempotent) ; une ville SANS nom au passage reçoit le fallback', () => {
    const base = makeState({
      cities: [
        { id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [], buildings: ['palais'] },
        { id: 'c2', owner: 'p1', q: 2, r: 0, capital: false, pop: 1, workedTiles: [], buildings: [] },
      ],
    });
    const v20 = structuredClone(base) as unknown as Record<string, unknown>;
    v20.schemaVersion = 20;
    const villes = v20.cities as Record<string, Record<string, unknown>>;
    villes['c1']!.name = 'Lutèce'; // nom déjà porté (ex. ville préfabriquée nommée)
    const out = migrateState(v20) as unknown as GameState;
    expect(out.cities['c1']!.name).toBe('Lutèce'); // intact
    expect(out.cities['c2']!.name).toBe('Ville1'); // le compteur ne voit que les sans-noms de p1
    expect(migrateState(structuredClone(out) as unknown as Record<string, unknown>)).toEqual(out);
  });
});
