// HANDOFF-JEV-CROISSANCE L2 — calibrage DATA `configCondense.gainSite`
// (fenêtre de fondation rouverte : pd 2→1, parts de couronne ×1,5).
// Verrou de valeur + preuve fonctionnelle de la fenêtre ouverte. AUCUNE
// logique touchée (D1 : data seulement ; D2 : tout le reste INTACT).
import { describe, expect, it } from 'vitest';
import { createInitialState, generateProceduralMap, getFilteredState, UNIT_TYPES } from '@game/rules';

const { configCondense, gainNetSite } = await import('../src/condense.mjs');
const { sitesCorrects } = await import('../src/joueur.mjs');

describe('croissance — verrou de valeur gainSite (data D1)', () => {
  it('les valeurs calibrées sont celles du recalcuL L1 (V2)', () => {
    expect(configCondense.gainSite.penaliteDistance).toBe(1);
    expect(configCondense.gainSite.partCouronne1).toBe(0.75);
    expect(configCondense.gainSite.partCouronne2).toBe(0.375);
    // D1 : le risque est INCHANGÉ au premier passage
    expect(configCondense.gainSite.penaliteRisque).toBe(3);
    expect(configCondense.gainSite.rayonRisque).toBe(4);
    expect(configCondense.gainSite.seuilRentable).toBe(2);
    // la maturité V4 reste gelée (levier distinct)
    expect(configCondense.gainSite.facteurMaturite).toBe(0.65);
    expect(configCondense.gainSite.actifMaturite).toBe(true);
  });

  it('la logique est intouchée : seuil de sitesCorrects toujours gainNet > 0', () => {
    // garde anti-dérive : le seuil « rentable » n'est PAS relevé, c'est la
    // formule data qui rend les sites moyens positifs.
    expect(configCondense.gainSite.seuilRentable).toBeLessThanOrEqual(2);
  });
});

describe('croissance — fenêtre de fondation ouverte', () => {
  // Carte minimale : plaine partout, un site « moyen » à distance 3 du colon,
  // couronnes modestes (rendements de plaine 2+1+0=3/tuile — sans ressource).
  function etatPlaine() {
    const map = {};
    for (let q = -8; q <= 8; q++) {
      for (let r = -8; r <= 8; r++) {
        map[`${q},${r}`] = { terrain: 'plaine' };
      }
    }
    return map;
  }
  const filtre = {
    map: etatPlaine(),
    units: { u1: { id: 'u1', owner: 'p1', type: 'colons', q: 0, r: 0 } },
    cities: {},
  };

  it('un site moyen à distance 3 a un gainNet > 0 (fenêtre ouverte à t100+)', () => {
    // plaine = 1 rendement/tuile : couronne1 = 6, couronne2 = 12
    // gainNet = 0,65 × (0,75×6 + 0,375×12) − 1×d = 0,65×9 − d = 5,85 − d
    // → positif jusqu'à distance 5 (fenêtre longue)
    expect(gainNetSite(filtre, 'p1', { q: 3, r: 0, distance: 3 })).toBeGreaterThan(0);
    expect(gainNetSite(filtre, 'p1', { q: 5, r: 0, distance: 5 })).toBeGreaterThan(0);
  });

  it('l’ancien calibrage rendait CE MÊME site négatif dès distance 2 (justification du levier)', () => {
    const sauvegarde = { ...configCondense.gainSite };
    try {
      configCondense.gainSite = { ...sauvegarde, penaliteDistance: 2, partCouronne1: 0.5, partCouronne2: 0.25 };
      // ancien : 0,65 × (0,5×6 + 0,25×12) − 2×d = 0,65×6 − 2d = 3,9 − 2d
      // → positif SEULEMENT à distance 1 (fenêtre quasi fermée — le verrou
      // chiffré du banc stratege, reproduit)
      expect(gainNetSite(filtre, 'p1', { q: 2, r: 0, distance: 2 })).toBeLessThan(0);
    } finally {
      configCondense.gainSite = sauvegarde;
    }
  });

  it('sitesCorrects compte le site plaine lointain (compteur d’espace v9 réaliste)', () => {
    const etat = createInitialState(generateProceduralMap(3538506724).map, 3538506724, {
      p1: { civId: 'neutre' }, p2: { civId: 'neutre' },
    });
    const f = getFilteredState(etat, 'p1');
    const sites = sitesCorrects(f, 'p1');
    // au tour 1, la fenêtre doit être LARGE (≥ 3 candidats)
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });
});
