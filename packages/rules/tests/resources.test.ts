/**
 * Tests Phase 7c — ressources (RULES.md §8.3, R-91/R-92/R-93).
 *
 * Tests d'intégrité référentielle de resources.json (miroir exact des techs,
 * R-86/techs.test.ts) + couche de requête (resources.ts) + intégration
 * moteur/e2e. Le calibrage = édition du JSON ; le CI vérifie.
 *
 * Interprétation documentée (test « bonus cohérent ») : Encens/Soie n'ont
 * officiellement AUCUN rendement N/P/C — leur bonus est la culture (D2,
 * ignorée du moteur). La contrainte « au moins un bonus » admet donc :
 *   un rendement > 0  OU  culture > 0.
 */
import { describe, expect, it } from 'vitest';
import resources from '../src/data/resources.json' with { type: 'json' };
import techs from '../src/data/techs.json' with { type: 'json' };
import terrainJson from '../src/data/terrain.json' with { type: 'json' };
import type { ResourceData, TechData } from '../src/types.js';
import { RESOURCE_UNKNOWN } from '../src/types.js';
import { RESOURCES, TERRAINS } from '../src/data.js';
import { filteredResource, resourceAccessible, resourceBonus, resourceIdentified, resourcesRevealedBy } from '../src/resources.js';
import { tileYield, autoAssignWorkedTiles } from '../src/economy.js';
import { getFilteredState } from '../src/fog.js';
import { grassMap, makeState } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import { tileKeyOf } from '../src/hex.js';

const resourceTable = resources as Record<string, ResourceData>;
const techTable = techs as Record<string, TechData>;

/** Les 22 ids de la table fermée R-91 (recherche §2, tri lexicographique). */
const EXPECTED_IDS = [
  'aluminium',
  'baleine',
  'betail',
  'ble',
  'boeufs',
  'caoutchouc',
  'charbon',
  'chene',
  'encens',
  'epices',
  'fer',
  'gemmes',
  'gibier',
  'marbre',
  'or',
  'petrole',
  'poisson',
  'soie',
  'soufre',
  'teinture',
  'uranium',
  'vin',
].sort();

describe('R-91 · intégrité référentielle de resources.json', () => {
  it('table fermée : exactement les 22 ressources de la recherche §2', () => {
    expect(Object.keys(resourceTable).sort()).toEqual(EXPECTED_IDS);
    expect(Object.keys(resourceTable)).toHaveLength(22);
  });

  it('chaque entrée de `terrains` existe dans terrain.json et ≠ ville', () => {
    for (const r of Object.values(resourceTable)) {
      expect(r.terrains.length, `${r.id} : au moins un terrain`).toBeGreaterThan(0);
      for (const t of r.terrains) {
        expect(terrainJson[t as keyof typeof terrainJson], `${r.id} → terrain ${t}`).toBeDefined();
        expect(t, `${r.id} → terrain ${t}`).not.toBe('ville');
      }
    }
  });

  it('bonus cohérent : yields ≥ 0 et (un rendement > 0 OU culture > 0)', () => {
    for (const r of Object.values(resourceTable)) {
      const y = r.yields;
      expect(y.food, `${r.id}.food`).toBeGreaterThanOrEqual(0);
      expect(y.production, `${r.id}.production`).toBeGreaterThanOrEqual(0);
      expect(y.commerce, `${r.id}.commerce`).toBeGreaterThanOrEqual(0);
      const hasYield = y.food > 0 || y.production > 0 || y.commerce > 0;
      // Interprétation documentée : Encens (+2 culture) et Soie (+3 culture)
      // n'ont aucun rendement N/P/C officiel — leur bonus est le champ culture.
      // 7l · R-134 : Gemmes/Or versent de l'or DIRECT à la trésorerie
      // (canon — correction du canal commerce D3 de 7c).
      expect(hasYield || (r.culture ?? 0) > 0 || (r.directGold ?? 0) > 0, `${r.id} apporte un bonus`).toBe(true);
    }
  });

  it('tout revealedByTech non null existe dans techs.json (et officialTech existe pour les D4)', () => {
    for (const r of Object.values(resourceTable)) {
      if (r.revealedByTech !== null) {
        expect(techTable[r.revealedByTech], `${r.id} → ${r.revealedByTech}`).toBeDefined();
      }
      if (r.revealedByTech === null && r.officialTech !== null) {
        // D4 : les 13 ressources à tech absente portent leur tech officielle
        // en documentaire — cohérent avec les 9 techs de notre base.
        expect(typeof r.officialTech).toBe('string');
      }
    }
  });

  it('cohérence visibilité : hiddenUntilRevealed: true ⇒ revealedByTech non null', () => {
    for (const r of Object.values(resourceTable)) {
      if (r.hiddenUntilRevealed) {
        expect(r.revealedByTech, `${r.id}`).not.toBeNull();
      }
    }
  });

  it('culture résiduelle (D2) : seules encens (2) et soie (3) portent un culture non null', () => {
    for (const r of Object.values(resourceTable)) {
      if (r.id === 'encens') expect(r.culture).toBe(2);
      else if (r.id === 'soie') expect(r.culture).toBe(3);
      else expect(r.culture, r.id).toBeNull();
    }
  });

  it('spawnWeight réservé 6b : null ou > 0 (aucun poids en v1)', () => {
    for (const r of Object.values(resourceTable)) {
      if (r.spawnWeight !== null) expect(r.spawnWeight, r.id).toBeGreaterThan(0);
    }
  });

  it('7l · R-134 : Gemmes +2 et Or +3 versent de l\'or DIRECT à la trésorerie (canon — corrige le canal commerce D3 de 7c)', () => {
    expect(resourceTable['gemmes']!.yields).toEqual({ food: 0, production: 0, commerce: 0 });
    expect(resourceTable['gemmes']!.directGold).toBe(2);
    expect(resourceTable['or']!.yields).toEqual({ food: 0, production: 0, commerce: 0 });
    expect(resourceTable['or']!.directGold).toBe(3);
  });

  it('les 7 ressources « vivantes » v1 portent leur tech de techs.json (D4/D6)', () => {
    expect(resourceTable['poisson']!.revealedByTech).toBe('travail_du_bronze');
    expect(resourceTable['fer']!.revealedByTech).toBe('travail_du_fer');
    expect(resourceTable['soie']!.revealedByTech).toBe('litteratie');
    expect(resourceTable['baleine']!.revealedByTech).toBe('navigation');
    expect(resourceTable['boeufs']!.revealedByTech).toBe('equitation');
    expect(resourceTable['betail']!.revealedByTech).toBe('code_des_lois');
    expect(resourceTable['vin']!.revealedByTech).toBe('poterie');
  });
});

describe('R-91 · index inverse resourcesRevealedBy (miroir de tech.unlocks)', () => {
  it('chaque ressource à tech est retournée par sa tech, réciprocité vérifiée', () => {
    for (const r of Object.values(resourceTable)) {
      if (r.revealedByTech === null) continue;
      const revealed = resourcesRevealedBy(r.revealedByTech).map((x) => x.id);
      expect(revealed, `resourcesRevealedBy(${r.revealedByTech}) contient ${r.id}`).toContain(r.id);
    }
    // et réciproquement, chaque retour a bien cette tech
    for (const t of Object.keys(techTable)) {
      for (const r of resourcesRevealedBy(t)) {
        expect(r.revealedByTech, `${r.id} ↔ ${t}`).toBe(t);
      }
    }
  });

  it('tri déterministe par id (R-81) et tech sans ressource → []', () => {
    const byBronze = resourcesRevealedBy('travail_du_bronze').map((x) => x.id);
    expect(byBronze).toEqual([...byBronze].sort());
    expect(byBronze).toEqual(['poisson']);
    expect(resourcesRevealedBy('alphabet')).toEqual([]);
    // la table RESOURCES chargée par le moteur est bien la même
    expect(Object.keys(RESOURCES).sort()).toEqual(EXPECTED_IDS);
  });
});

describe('R-92 · accès et identité (couche de requête, D1 révisée)', () => {
  const fer = resourceTable['fer']!;
  const gemmes = resourceTable['gemmes']!;

  it('une ressource à tech est inaccessible tant que la tech manque (bonus nul)', () => {
    expect(resourceAccessible(fer, [])).toBe(false);
    expect(resourceAccessible(fer, ['travail_du_bronze'])).toBe(false); // prereq seule ne suffit pas
    expect(resourceAccessible(fer, ['travail_du_fer'])).toBe(true);
    expect(resourceBonus(fer, [])).toBeNull();
    expect(resourceBonus(fer, ['travail_du_fer'])).toEqual({ food: 0, production: 2, commerce: 0 });
  });

  it('une ressource sans tech (D4) est accessible pour tous', () => {
    expect(resourceAccessible(gemmes, [])).toBe(true);
    expect(resourceBonus(gemmes, [])).toEqual({ food: 0, production: 0, commerce: 0 }); // 7l : or direct, plus de commerce
  });

  it('identité D1 : masquée (« inconnue ») tant que la tech manque, réelle après', () => {
    expect(filteredResource(fer, [])).toBe(RESOURCE_UNKNOWN);
    expect(resourceIdentified(fer, [])).toBe(false);
    expect(filteredResource(fer, ['travail_du_fer'])).toBe('fer');
    // sans tech exigée : identité réelle pour tous
    expect(filteredResource(gemmes, [])).toBe('gemmes');
    // cas CivRev-fidèle (icône réelle avant la tech) — aucun cas en v1, sémantique testée
    expect(filteredResource({ ...fer, hiddenUntilRevealed: false }, [])).toBe('fer');
  });
});

describe('R-93 · bonus de rendement dans tileYield', () => {
  const map = {
    ...grassMap(8, 8),
    '1,0': { terrain: 'colline', resource: 'fer' },
    '2,0': { terrain: 'colline', resource: 'charbon' },
    '0,1': { terrain: 'montagne', resource: 'gemmes' },
  } as never;

  it('le bonus du Fer s’ajoute à la colline seulement si la tech est débloquée', () => {
    expect(tileYield(map, [], '1,0', [])).toEqual({ food: 0, production: 1, commerce: 0 });
    expect(tileYield(map, [], '1,0', ['travail_du_fer'])).toEqual({ food: 0, production: 3, commerce: 0 });
  });

  it('7e (D4 achevé) : le Charbon exige Machine à vapeur ; 7l : les Gemmes versent de l\'or DIRECT (plus de commerce)', () => {
    // 7e : le Charbon est désormais révélé par machine_a_vapeur (arbre complet).
    expect(tileYield(map, [], '2,0', [])).toEqual({ food: 0, production: 1, commerce: 0 });
    expect(tileYield(map, [], '2,0', ['machine_a_vapeur'])).toEqual({ food: 0, production: 4, commerce: 0 });
    // 7l · R-134 : les Gemmes ne portent plus de commerce — leur or direct est
    // crédité à la trésorerie par le moteur (testé en phase7l).
    expect(tileYield(map, [], '0,1', [])).toEqual({ food: 0, production: 1, commerce: 0 });
  });

  it('le bonus se cumule avec les bonus de bâtiments (Atelier sur colline + Fer)', () => {
    expect(tileYield(map, ['atelier'], '1,0', ['travail_du_fer'])).toEqual({
      food: 0,
      production: 5,
      commerce: 0,
    });
  });

  it('le marqueur « inconnue » n’apporte jamais de bonus (et n’est pas une donnée)', () => {
    // l'UI passe l'état filtré : une case à marqueur doit rester au rendement
    // de base, exactement comme une ressource à tech non débloquée (R-92/R-93)
    const m = {
      '1,0': { terrain: 'colline', resource: RESOURCE_UNKNOWN },
      '2,0': { terrain: 'colline', resource: 'fer' },
    } as never;
    expect(tileYield(m, [], '1,0', ['travail_du_fer'])).toEqual({ food: 0, production: 1, commerce: 0 });
    expect(tileYield(m, [], '2,0', ['travail_du_fer'])).toEqual({ food: 0, production: 3, commerce: 0 });
    // le marqueur n'est pas une entrée de resources.json (table fermée à 22)
    expect(RESOURCES[RESOURCE_UNKNOWN]).toBeUndefined();
  });

  it('R-60 : l’auto-assignation valorise les cases à ressource accessibles (déterminisme R-81)', () => {
    const m = {
      '0,0': { terrain: 'ville', resource: null },
      '1,0': { terrain: 'colline', resource: 'fer' }, // 1 P (+2 P si tech)
      '-1,0': { terrain: 'colline', resource: null }, // 1 P
      '0,1': { terrain: 'prairie', resource: null }, // 2 N — prioritaire (R-60 : N > P)
    } as never;
    // pop 1 : la prairie (2 N) gagne dans tous les cas (priorité nourriture)
    const foodFirst = autoAssignWorkedTiles(m, [], { q: 0, r: 0, pop: 1, buildings: [] }, new Set(), []);
    expect(foodFirst).toEqual(['0,1']);
    // pop 2 sans tech : les deux collines sont à égalité (1 P) → tie-break (q, r)
    const without = autoAssignWorkedTiles(m, [], { q: 0, r: 0, pop: 2, buildings: [] }, new Set(), []);
    expect(without).toEqual(['0,1', '-1,0']);
    // pop 2 avec Travail du fer : la colline à Fer (3 P) devance la colline nue
    const withTech = autoAssignWorkedTiles(
      m,
      [],
      { q: 0, r: 0, pop: 2, buildings: [] },
      new Set(),
      ['travail_du_fer'],
    );
    expect(withTech).toEqual(['0,1', '1,0']);
  });
});

describe('R-93 · e2e : déblocage de tech → bonus dans les rendements de ville', () => {
  function stateAvecFer(): ReturnType<typeof makeState> {
    const st = makeState({
      terrainOverrides: { '1,0': 'colline' },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, conversion: 'gold' }],
    });
    // le citoyen travaille la colline à Fer (1 P) — assignation manuelle fixe
    st.cities['c1']!.workedTiles = ['1,0'];
    st.map['1,0']!.resource = 'fer';
    return st;
  }

  it('avant déblocage : la ville ne perçoit pas le bonus du Fer (production 1)', () => {
    const st = stateAvecFer();
    const { newState } = resolveTurn(st, {}, 7);
    // production du tour = centre 1 P + colline 1 P = 2 — mais sans production
    // en file la mesure passe par les rendements : Grenier non posé, on mesure
    // via tileYield + le moteur (la file est vide, donc production stockée 0).
    // Mesure directe : le tour produit 1 P de moins qu'avec la tech (test suivant).
    expect(newState.cities['c1']!.workedTiles).toEqual(['1,0']);
    expect(tileYield(newState.map, [], '1,0', newState.players['p1']!.techsUnlocked)!.production).toBe(1);
  });

  it('après déblocage de Travail du fer : le bonus +2 P entre dans le tour suivant', () => {
    const st = stateAvecFer();
    st.players['p1']!.techsUnlocked = ['travail_du_fer'];
    // file de production (Guerrier 10) pour mesurer la production effectivement perçue
    st.cities['c1']!.production = { item: { kind: 'unit', id: 'guerrier' }, progress: 0 };
    const base = resolveTurn(structuredClone(st), {}, 7).newState.cities['c1']!.production!.progress;
    // Tour de référence sans ressource : on retire le Fer pour isoler sa contribution
    const sansRes = structuredClone(st);
    sansRes.map['1,0']!.resource = null;
    const noRes = resolveTurn(sansRes, {}, 7).newState.cities['c1']!.production!.progress;
    expect(base).toBe(noRes + 2); // R-93 : +2 P du Fer perçus au tour du déblocage
  });

  it('R-92 : le Fer non débloqué est diffusé « inconnue », identité réelle après déblocage', () => {
    const st = stateAvecFer();
    // p1 voit la case (capitale au centre, colline adjacente)
    st.players['p1']!.vision.explored = [tileKeyOf({ q: 1, r: 0 })];
    st.players['p1']!.vision.visible = [tileKeyOf({ q: 1, r: 0 })];
    const before = resolveTurn(st, {}, 7).newState;
    // la tech manque : la présence est diffusée, PAS l'identité (marqueur)
    expect(before.map['1,0']!.resource).toBe('fer'); // l'état serveur garde l'id réel
    expect(getFilteredResource(before)).toBe(RESOURCE_UNKNOWN);
    // la tech est débloquée : l'identité réelle est diffusée
    before.players['p1']!.techsUnlocked = ['travail_du_fer'];
    expect(getFilteredResource(before)).toBe('fer');
  });

  function getFilteredResource(state: ReturnType<typeof makeState>): string | null {
    return getFilteredState(state, 'p1').map['1,0']!.resource ?? null;
  }
});
