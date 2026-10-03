/**
 * HANDOFF-CHRONIQUES · L1 (test-first) — mapping des événements du moteur
 * vers la Chronique unifiée. Couvre : catégories (D2), exclusions (§3),
 * ZÉRO coordonnée (D3), rumeur artefact adverse sans position (D4),
 * merveille adverse masquée à la nation (D4), agrégation des combats (D5),
 * persistance/rechargement (D7) et plafond 500 (D7).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '@game/shared';
import {
  CHRONIQUE_MAX,
  chargerChronique,
  chronique,
  entreesChronique,
  pousserEntrees,
  resetChronique,
} from '../src/lib/chronique.js';
import type { ContexteChronique } from '../src/lib/chronique.js';
import { get } from 'svelte/store';

/** Polyfill localStorage minimal (environnement vitest node). */
const memoire = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage ??= {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => void memoire.set(k, v),
  removeItem: (k: string) => void memoire.delete(k),
};

/** Contexte de test : p1 = moi, p2 = Espagnols, ville2 de p2. */
function ctx(): ContexteChronique {
  return {
    moi: 'p1',
    nomJoueur: (id) => (id === 'p1' ? 'Alice' : id === 'p2' ? 'Bot' : id),
    civDe: (id) => (id === 'p2' ? 'espagne' : null),
    ville: (cityId) =>
      cityId === 'v1'
        ? { nom: 'Ville1', q: 2, r: 2, owner: 'p1' }
        : cityId === 'v2'
          ? { nom: 'Madrid', q: 8, r: 8, owner: 'p2' }
          : null,
    villes: () => [
      { nom: 'Ville1', q: 2, r: 2, owner: 'p1' },
      { nom: 'Madrid', q: 8, r: 8, owner: 'p2' },
    ],
    unite: (unitId) =>
      unitId.startsWith('u1')
        ? { type: 'guerrier', owner: 'p1' }
        : unitId.startsWith('u2')
          ? { type: 'guerrier', owner: 'p2' }
          : unitId.startsWith('ub')
            ? { type: 'guerrier', owner: 'barbare' }
            : null,
    visible: (hex) => hex.q <= 4 && hex.r <= 4, // la zone espagnole est hors vision
  };
}

const seq = (() => {
  let s = 0;
  return () => ++s;
})();

function e(ev: Omit<GameEvent, 'seq'> & { seq?: number }): GameEvent {
  return { ...ev, seq: ev.seq ?? seq() } as GameEvent;
}

/** Zéro coordonnée : aucun « (q,r) » ni champ q= dans le texte. */
const REGEX_COORD = /(-?\d+\s*,\s*-?\d+)|(\bq\s*[=:])|(\br\s*[=:])/;

describe('chronique — mapping (§3)', () => {
  it('exclusions : Move, TurnResolved, CombatExchange, PopulationGrew ne produisent rien seuls', () => {
    const evts: GameEvent[] = [
      e({ type: 'Move', unitId: 'u1a', owner: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }),
      e({ type: 'TurnResolved', turn: 5 }),
      e({ type: 'CombatExchange', attackerId: 'u1a', defenderId: 'u2a', at: { q: 1, r: 0 }, attackerHpAfter: 2, defenderHpAfter: 1 }),
      e({ type: 'PopulationGrew', cityId: 'v1', owner: 'p1', pop: 3, at: { q: 2, r: 2 } }),
    ];
    expect(entreesChronique(evts, ctx(), 5)).toHaveLength(0);
  });

  it('table de catégories : chaque type mappé dans la bonne catégorie (D2)', () => {
    const evts: GameEvent[] = [
      e({ type: 'Attack', attackerId: 'u1a', defenderId: 'ub1', at: { q: 1, r: 1 } }),
      e({ type: 'CityFounded', cityId: 'v1', owner: 'p1', at: { q: 2, r: 2 }, capital: true, byUnitId: null }),
      e({ type: 'TechResearched', player: 'p1', tech: 'poterie' }),
      e({ type: 'WonderCompleted', cityId: 'v1', owner: 'p1', wonder: 'grande_pyramide', at: { q: 2, r: 2 } }),
      e({ type: 'ArtifactActivated', artefactId: 'a1', artefact: 'arche', name: 'Arche', effect: 'orParEre', gold: 50, byPlayer: 'p1', byUnitId: 'u1a', at: { q: 3, r: 3 } }),
      e({ type: 'BarbarianSpawned', unitId: 'ub1', villageId: 'vil1', owner: 'barbare', at: { q: 3, r: 0 } }),
      e({ type: 'PlayerDefeated', player: 'p2', byPlayer: null, cause: 'attrition' }),
    ];
    const cats = entreesChronique(evts, ctx(), 3).map((x) => x.cat);
    expect(cats).toContain('combats');
    expect(cats).toContain('empire');
    expect(cats).toContain('decouvertes');
    expect(cats).toContain('merveilles');
    expect(cats).toContain('artefacts');
    expect(cats).toContain('menaces');
    expect(cats).toContain('monde');
  });

  it('Empire : les événements des AUTRES joueurs ne produisent pas d\'entrée Empire', () => {
    const evts: GameEvent[] = [
      e({ type: 'UnitProduced', unitId: 'u2a', cityId: 'v2', owner: 'p2', unitType: 'guerrier', at: { q: 8, r: 8 } }),
      e({ type: 'BuildingCompleted', cityId: 'v2', owner: 'p2', building: 'temple', at: { q: 8, r: 8 } }),
    ];
    expect(entreesChronique(evts, ctx(), 3)).toHaveLength(0);
  });
});

describe('chronique — D3 zéro coordonnée', () => {
  it('aucune entrée ne porte de coordonnée, localisation par noms', () => {
    const evts: GameEvent[] = [
      e({ type: 'Attack', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 } }),
      e({ type: 'CombatExchange', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 }, attackerHpAfter: 2, defenderHpAfter: 0 }),
      e({ type: 'UnitDestroyed', unitId: 'ub1', owner: 'barbare', at: { q: 3, r: 3 }, cause: 'combat', byUnitId: 'u1a' }),
      e({ type: 'CityFounded', cityId: 'v1', owner: 'p1', at: { q: 2, r: 2 }, capital: false, byUnitId: 'u1b' }),
      e({ type: 'BuildingCompleted', cityId: 'v1', owner: 'p1', building: 'temple', at: { q: 2, r: 2 } }),
      e({ type: 'Disembark', unitId: 'u1c', owner: 'p1', transportId: 'u1d', at: { q: 3, r: 2 } }),
    ];
    for (const entree of entreesChronique(evts, ctx(), 4)) {
      expect(entree.texte).not.toMatch(REGEX_COORD);
    }
  });
});

describe('chronique — D4 fog (masquages client)', () => {
  it('artefact adverse : rumeur SANS position et NON cliquable', () => {
    const evts: GameEvent[] = [
      e({ type: 'ArtifactActivated', artefactId: 'a1', artefact: 'arche', name: 'Arche de Noé', effect: 'orParEre', gold: 100, byPlayer: 'p2', byUnitId: 'u2a', at: { q: 9, r: 9 } }),
    ];
    const entrees = entreesChronique(evts, ctx(), 3);
    expect(entrees).toHaveLength(1);
    expect(entrees[0]!.cat).toBe('artefacts');
    expect(entrees[0]!.texte).toContain('Espagnols');
    expect(entrees[0]!.texte).toMatch(/relique/);
    expect(entrees[0]!.texte).not.toMatch(REGEX_COORD);
    expect(entrees[0]!.hex).toBeNull();
  });

  it('merveille adverse : nom de la nation, PAS de ville ni de case cliquable', () => {
    const evts: GameEvent[] = [
      e({ type: 'WonderCompleted', cityId: 'v2', owner: 'p2', wonder: 'grande_pyramide', at: { q: 8, r: 8 } }),
    ];
    const entrees = entreesChronique(evts, ctx(), 3);
    expect(entrees).toHaveLength(1);
    expect(entrees[0]!.cat).toBe('merveilles');
    expect(entrees[0]!.texte).toContain('Espagnols');
    expect(entrees[0]!.texte).toContain('Grande Pyramide');
    expect(entrees[0]!.texte).not.toContain('Madrid'); // position adverse masquée
    expect(entrees[0]!.hex).toBeNull();
  });

  it('case hors vision : entrée NON cliquable (recentrage impossible)', () => {
    const evts: GameEvent[] = [
      e({ type: 'CityCaptured', cityId: 'v2', fromOwner: 'p2', toOwner: 'p1', at: { q: 8, r: 8 } }),
    ];
    const entrees = entreesChronique(evts, ctx(), 3);
    expect(entrees[0]!.hex).toBeNull();
    expect(entrees[0]!.texte).not.toMatch(REGEX_COORD);
  });
});

describe('chronique — D5 agrégation des combats', () => {
  it('Attack + 2 échanges + destruction = UNE seule entrée avec issue et pertes', () => {
    const evts: GameEvent[] = [
      e({ type: 'Attack', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 } }),
      e({ type: 'CombatExchange', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 }, attackerHpAfter: 2, defenderHpAfter: 1 }),
      e({ type: 'CombatExchange', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 }, attackerHpAfter: 2, defenderHpAfter: 0 }),
      e({ type: 'UnitDestroyed', unitId: 'ub1', owner: 'barbare', at: { q: 3, r: 3 }, cause: 'combat', byUnitId: 'u1a' }),
    ];
    const entrees = entreesChronique(evts, ctx(), 6);
    const combats = entrees.filter((x) => x.cat === 'combats');
    expect(combats).toHaveLength(1);
    expect(combats[0]!.texte).toContain('ton Guerrier attaque');
    expect(combats[0]!.texte).toContain('Barbare');
    expect(combats[0]!.combatHex).toEqual({ q: 3, r: 3 });
    expect(combats[0]!.ton).toBe('good'); // ennemi détruit, rien à moi
  });

  it('deux cases de combat distinctes = deux entrées', () => {
    const evts: GameEvent[] = [
      e({ type: 'Attack', attackerId: 'u1a', defenderId: 'ub1', at: { q: 3, r: 3 } }),
      e({ type: 'Attack', attackerId: 'u1b', defenderId: 'ub2', at: { q: 2, r: 3 } }),
    ];
    expect(entreesChronique(evts, ctx(), 6).filter((x) => x.cat === 'combats')).toHaveLength(2);
  });
});

describe('chronique — D7 persistance et plafond', () => {
  beforeEach(() => {
    memoire.clear();
    resetChronique();
  });

  it('rechargement de page : la Chronique survit (chargerChronique)', () => {
    chargerChronique('abc');
    pousserEntrees([{ id: 'c3-0', tour: 3, cat: 'empire', texte: 'Temple achevé à Ville1', ton: 'good', hex: null, combatHex: null }]);
    // « rechargement » : nouveau chargement depuis le stockage.
    chargerChronique('abc');
    const list = get(chronique);
    expect(list).toHaveLength(1);
    expect(list[0]!.texte).toBe('Temple achevé à Ville1');
  });

  it('plafond FIFO à 500 entrées', () => {
    chargerChronique('xyz');
    const lot = Array.from({ length: CHRONIQUE_MAX + 50 }, (_, i) => ({
      id: `x${i}`,
      tour: 1,
      cat: 'empire' as const,
      texte: `e${i}`,
      ton: 'info' as const,
      hex: null,
      combatHex: null,
    }));
    pousserEntrees(lot);
    const list = get(chronique);
    expect(list).toHaveLength(CHRONIQUE_MAX);
    expect(list[0]!.texte).toBe('e50'); // les 50 plus anciennes éjectées
    expect(list[list.length - 1]!.texte).toBe(`e${CHRONIQUE_MAX + 49}`);
  });

  it('resetChronique vide le store ET le stockage', () => {
    chargerChronique('rst');
    pousserEntrees([{ id: 'c1-0', tour: 1, cat: 'monde', texte: 'test', ton: 'info', hex: null, combatHex: null }]);
    resetChronique();
    chargerChronique('rst');
    expect(get(chronique)).toHaveLength(0);
  });

  it('rechargement : les missedEvents rejoués régénèrent les MÊMES ids — aucun doublon', () => {
    chargerChronique('dup');
    const evts: GameEvent[] = [
      e({ type: 'BuildingCompleted', cityId: 'v1', owner: 'p1', building: 'temple', at: { q: 2, r: 2 } }),
    ];
    pousserEntrees(entreesChronique(evts, ctx(), 9));
    const premier = get(chronique).map((x) => x.id);
    expect(premier.length).toBeGreaterThan(0);
    expect(premier.every((id) => id.startsWith('e'))).toBe(true); // ids dérivés du seq
    // « rechargement » : le serveur rejoue les mêmes événements (mêmes seq).
    chargerChronique('dup');
    pousserEntrees(entreesChronique(evts, ctx(), 9));
    expect(get(chronique).map((x) => x.id)).toEqual(premier); // pas de doublon
  });
});
