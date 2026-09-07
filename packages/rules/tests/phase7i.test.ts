/**
 * Phase 7i — Alignement du moteur de ville sur Civ Revolution
 * (doc d'Erik « Moteur Ville Civilization Revolution », HANDOFF-PHASE7I).
 *
 * D1 · R-63 (rév.) : la nourriture se CONSOMME (surplus = récolte − pop).
 * D2 · R-63 (rév.) : seuils de croissance NON LINÉAIRES (growth.json), cap 31.
 * D3 · R-64 (rév.) : villes fondées à pop 2/3/4/5 selon l'ÈRE de l'empire.
 * D4 · R-60bis    : citoyens intérieurs au centre-ville (table par tranche).
 * D5 · R-64 (rév.) : fonder sur une ressource la DÉTRUIT (ResourceDestroyed).
 * + R-66 (rév.)   : centre-ville min 1 P, commerce par tranche.
 */
import { describe, expect, it } from 'vitest';
import { makeState, cityAt } from '../src/fixtures.js';
import { resolveTurn } from '../src/turn.js';
import {
  growthThresholdFor,
  foundingPopFor,
  interiorCitizenFor,
  interiorCountOf,
  populationCap,
  GROWTH,
} from '../src/growth.js';
import { tileYield, autoAssignWorkedTiles } from '../src/economy.js';

describe('D1 · R-63 (rév.) — la nourriture se consomme', () => {
  it('surplus = récolte − population : une ville pop 3 sans surplus ne grandit plus', () => {
    // anneau 1 en plaine (1 N) : récolte = 1 (centre — POLISSAGE-1 C1) + 5 × 1 = 6 → surplus faible
    const state = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'plaine', '0,1': 'plaine', '-1,0': 'plaine',
        '0,-1': 'plaine', '1,-1': 'plaine', '-1,1': 'plaine',
      },
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 5,
          workedTiles: ['1,0', '0,1', '-1,0', '0,-1', '1,-1'],
        },
      ],
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    // récolte 1 (centre — POLISSAGE-1 C1) + 5 plaines = 6 ; consommation 5 → surplus +1
    expect(city.foodStored).toBe(1);
    expect(city.pop).toBe(5); // pas de croissance
  });

  it('déficit : la réserve se vide, à 0 la croissance s’arrête — PAS de famine (interprétation 🔶)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'desert', '0,1': 'desert', '-1,0': 'desert',
        '0,-1': 'desert', '1,-1': 'desert', '-1,1': 'desert',
      },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 8, foodStored: 3 }],
    });
    const { newState, events } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    // récolte 2 (centre) ; consommation 8 → déficit −6 : réserve vidée, personne ne meurt
    expect(city.foodStored).toBe(0);
    expect(city.pop).toBe(8);
    expect(events.some((e) => e.type === 'UnitDestroyed')).toBe(false);
  });
});

describe('D2 · R-63 (rév.) — seuils non linéaires (growth.json) et cap 31', () => {
  it('la table est exponentielle : seuils croissants, très bas au début', () => {
    const t = (n: number) => growthThresholdFor(n)!;
    expect(t(1)).toBe(GROWTH.growthThresholds['2']);
    expect(t(1)).toBeLessThan(t(2));
    expect(t(2)).toBeLessThan(t(5));
    expect(t(5)).toBeLessThan(t(10));
    expect(t(10)).toBeLessThan(t(20));
    expect(t(20)).toBeLessThan(t(30));
  });

  it('plafond absolu : population 31 — croissance bloquée au-delà', () => {
    expect(populationCap()).toBe(31);
    expect(growthThresholdFor(30)).not.toBeNull();
    expect(growthThresholdFor(31)).toBeNull();
    const state = makeState({
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 31, foodStored: 99999, workedTiles: [] }],
    });
    const { newState, events } = resolveTurn(state, {}, 1);
    expect(cityAt(newState, 0, 0)!.pop).toBe(31);
    expect(events.some((e) => e.type === 'PopulationGrew')).toBe(false);
  });
});

describe('D3 · R-64 (rév.) — fondation : pop par ÈRE de l’empire', () => {
  it('ère = la plus avancée des techs débloquées → pop initiale 2/3/4/5', () => {
    expect(foundingPopFor([])).toBe(2); // Antique
    expect(foundingPopFor(['feudalite'])).toBe(3); // Médiévale
    expect(foundingPopFor(['feudalite', 'machine_a_vapeur'])).toBe(4); // Industrielle
    expect(foundingPopFor(['feudalite', 'machine_a_vapeur', 'theorie_atomique'])).toBe(5); // Moderne
  });

  it('e2e : une ville fondée à l’ère Moderne démarre à pop 5, 5 citoyens auto-assignés', () => {
    const state = makeState({
      width: 10,
      height: 10,
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    state.players['p1']!.techsUnlocked = ['theorie_atomique'];
    state.players['p1']!.era = 'moderne'; // 7n · R-147 : ère persistée (compage, transition au tour suivant)
    const { newState } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    const city = cityAt(newState, 5, 5)!;
    expect(city.pop).toBe(5);
    expect(city.workedTiles).toHaveLength(5);
  });
});

describe('D4 · R-60bis — citoyens intérieurs (tranches démographiques)', () => {
  it('table des tranches : Ouvrier → Exportateur', () => {
    const tier = (p: number) => {
      const t = interiorCitizenFor(p);
      return { label: t.label, production: t.production, commerce: t.commerce };
    };
    expect(tier(1)).toEqual({ label: 'Ouvrier', production: 1, commerce: 0 });
    expect(tier(6)).toEqual({ label: 'Ouvrier', production: 1, commerce: 0 });
    expect(tier(7)).toEqual({ label: 'Vendeur', production: 1, commerce: 1 });
    expect(tier(13)).toEqual({ label: 'Commerçant', production: 1, commerce: 2 });
    expect(tier(19)).toEqual({ label: 'Marchand', production: 1, commerce: 3 });
    expect(tier(25)).toEqual({ label: 'Importateur', production: 1, commerce: 4 });
    expect(tier(31)).toEqual({ label: 'Exportateur', production: 1, commerce: 5 });
    expect(interiorCountOf(7, 3)).toBe(4);
  });

  it('pop 7 sans cases assignées : 7 Vendeurs (+1 P +1 C) — le commerce explose', () => {
    // anneau 1 en montagne : rien d'exploitable de nourrissant, workedTiles vides
    const state = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'montagne', '0,1': 'montagne', '-1,0': 'montagne',
        '0,-1': 'montagne', '1,-1': 'montagne', '-1,1': 'montagne',
      },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7, workedTiles: [] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    // aucune case assignée (pas de re-remplissage hors pendingFill) →
    // 7 citoyens intérieurs : commerce = 1 (socle R-66 rév.) + 1 (tranche
    // 7-12) + 7 × 1 (intérieurs) — R-66 (rév. 06/09)
    const city = cityAt(newState, 0, 0)!;
    expect(city.workedTiles).toHaveLength(0);
    expect(newState.players['p1']!.treasury).toBe(9);
  });

  it('Tribunal : les citoyens intérieurs redeviennent travailleurs de terrain (priorité extérieure)', () => {
    const state = makeState({
      width: 10,
      height: 10,
      fill: 'desert', // tout en désert (0/0/1) : la montagne à distance 2
      // (0/1/0) devient la meilleure case une fois le rayon étendu
      terrainOverrides: { '3,5': 'montagne' },
      cities: [{ id: 'c1', owner: 'p1', q: 5, r: 5, capital: true, pop: 7, workedTiles: [] }],
    });
    state.players['p1']!.techsUnlocked = ['litteratie'];
    // Le Tribunal est posé puis la ville se remplit (pendingFill — R-60bis).
    state.cities['c1']!.buildings = ['tribunal'];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'granary_unused' as never }, progress: 0 };
    state.cities['c1']!.production = null;
    // La re-validation + le remplissage se produisent au prochain tour où la
    // ville est marquée pendingFill (complétion Tribunal) — on pose directement
    // le bâtiment PUIS on résout : la réintégration passe par la croissance.
    state.cities['c1']!.buildings = [];
    state.cities['c1']!.production = { item: { kind: 'building', id: 'tribunal' }, progress: 79 };
    // Le Tribunal est complété en fin de Phase C : le remplissage des
    // citoyens intérieurs s'effectue à la résolution SUIVANTE (pendingFill).
    let r = resolveTurn(state, {}, 1);
    expect(cityAt(r.newState, 5, 5)!.buildings).toContain('tribunal');
    r = resolveTurn(r.newState, {}, 1);
    const city = cityAt(r.newState, 5, 5)!;
    // rayon 2 : assez de cases pour tous les citoyens → plus d'intérieurs
    expect(city.workedTiles).toHaveLength(city.pop);
    expect(city.workedTiles).toContain('3,5'); // montagne à distance 2 (Tribunal)
  });
});

describe('D5 · R-64 (rév.) — fonder sur une ressource la DÉTRUIT', () => {
  it('ResourceDestroyed émis, la ressource disparaît de la carte', () => {
    const state = makeState({
      width: 10,
      height: 10,
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    state.map['5,5'] = { terrain: 'prairie', resource: 'fer' };
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    expect(newState.map['5,5']).toEqual({ terrain: 'ville', resource: null });
    const evt = events.find((e) => e.type === 'ResourceDestroyed');
    expect(evt).toBeDefined();
    expect(evt).toMatchObject({ resource: 'fer', at: { q: 5, r: 5 } });
  });

  it('fonder à côté préserve la ressource voisine (pas d’événement)', () => {
    const state = makeState({
      width: 10,
      height: 10,
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    state.map['5,4'] = { terrain: 'prairie', resource: 'fer' };
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    expect(newState.map['5,4']).toEqual({ terrain: 'prairie', resource: 'fer' });
    expect(events.some((e) => e.type === 'ResourceDestroyed')).toBe(false);
  });
});

describe('R-66 (rév.) — centre-ville : min 1 Production, commerce par tranche', () => {
  it('le centre garantit 1 marteau même entouré de déserts ; commerce de tranche à pop ≤ 6 = 0', () => {
    const state = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'desert', '0,1': 'desert', '-1,0': 'desert',
        '0,-1': 'desert', '1,-1': 'desert', '-1,1': 'desert',
      },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, workedTiles: [] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    // production = 1 (centre, socle R-66 rév.) + 2 × 1 (2 intérieurs Ouvriers)
    // → la ville produit des marteaux malgré le désert ; commerce = socle 1 C
    // + tranche 0 (pop ≤ 6) — R-66 (rév. 06/09)
    expect(newState.players['p1']!.treasury).toBe(1);
    // la file progresse : preuve de production du centre
    const s2 = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'desert', '0,1': 'desert', '-1,0': 'desert',
        '0,-1': 'desert', '1,-1': 'desert', '-1,1': 'desert',
      },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [], production: { item: { kind: 'unit', id: 'guerrier' }, progress: 9 } }],
    });
    const r2 = resolveTurn(s2, {}, 1);
    expect(r2.events.some((e) => e.type === 'UnitProduced')).toBe(true); // 9 + 1 ≥ 10
  });
});

describe('7i · La pompe à colons (doc §Impact Économique)', () => {
  it('République : colon produit (−1 pop) → la ville repousse en quelques tours', () => {
    const state = makeState({
      width: 10,
      height: 10,
      cities: [
        {
          id: 'c1', owner: 'p1', q: 5, r: 5, capital: true, pop: 2,
          workedTiles: ['5,4', '4,5'],
          production: { item: { kind: 'unit', id: 'colon' }, progress: 19 },
        },
      ],
    });
    state.players['p1']!.government = 'republique'; // R-121 : coût pop 1
    let s = state;
    // Tour 1 : le colon est produit → pop 2 − 1 = 1.
    const r1 = resolveTurn(s, {}, 42);
    s = r1.newState;
    expect(r1.events.some((e) => e.type === 'UnitProduced' && e.unitType === 'colon')).toBe(true);
    expect(Object.values(s.cities)[0]!.pop).toBe(1);
    // Tours suivants : surplus alimentaire → pop 2 retrouvée en ≤ 5 tours
    // (POLISSAGE-1 C1 : centre 1 N → récolte 3, surplus 2, seuil 10).
    let tours = 0;
    while (Object.values(s.cities)[0]!.pop < 2 && tours < 7) {
      s = resolveTurn(s, {}, 42).newState;
      tours += 1;
    }
    expect(Object.values(s.cities)[0]!.pop).toBe(2);
    expect(tours).toBeLessThanOrEqual(5);
  });
});

describe('R-66 (rév. 06/09) — socle garanti 1N / 1P / 1C du centre-ville', () => {
  // Terrains fondables (passables, hors cratère — R-64/C15).
  const FONDABLES = ['prairie', 'plaine', 'foret', 'colline', 'desert'] as const;

  it('multi-terrains : fondé sur N\'IMPORTE QUEL terrain, le centre produit ≥ 1N / 1P / 1C', () => {
    for (const terrain of FONDABLES) {
      const state = makeState({
        width: 8,
        height: 8,
        terrainOverrides: {
          '0,0': terrain,
          '1,0': terrain, '0,1': terrain, '-1,0': terrain,
          '0,-1': terrain, '1,-1': terrain, '-1,1': terrain,
        },
        cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [] }],
      });
      // La fondation transforme la case en terrain `ville` (R-64) ; le socle
      // R-66 (rév.) garantit le plancher 1/1/1 par ressource (tileYield —
      // source unique moteur/UI/3D).
      const y = tileYield(state.map, [], '0,0')!;
      expect(y.food, `nourriture sur ${terrain}`).toBeGreaterThanOrEqual(1);
      expect(y.production, `production sur ${terrain}`).toBeGreaterThanOrEqual(1);
      expect(y.commerce, `commerce sur ${terrain}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('centre sur désert, pop 1 : commerce du socle = 1 dès la fondation (tranche R-60bis = 0)', () => {
    const state = makeState({
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'desert', '0,1': 'desert', '-1,0': 'desert',
        '0,-1': 'desert', '1,-1': 'desert', '-1,1': 'desert',
      },
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [] }],
    });
    const { newState } = resolveTurn(state, {}, 1);
    // Socle 1 C (conversion Or par défaut) ; la tranche démographique ajoute 0.
    expect(newState.players['p1']!.treasury).toBe(1);
  });

  it('la tranche démographique s\'ajoute AU-DESSUS du socle : pop 7 → 1 C (socle) + 1 C (Vendeur)', () => {
    const state = makeState({
      width: 10,
      height: 10,
      fill: 'prairie',
      // la carte fixture couvre les coordonnées non négatives : on pose
      // explicitement les 7 cases travaillées (anneau 1 + 1 case à distance 2).
      terrainOverrides: {
        '1,0': 'prairie', '0,1': 'prairie', '-1,0': 'prairie',
        '0,-1': 'prairie', '1,-1': 'prairie', '-1,1': 'prairie', '2,0': 'prairie',
      },
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 7,
          buildings: ['tribunal'],
          workedTiles: ['1,0', '0,1', '-1,0', '0,-1', '1,-1', '-1,1', '2,0'],
        },
      ],
    });
    const { newState } = resolveTurn(state, {}, 1);
    // 7 travailleurs (rayon 2 — Tribunal) → 0 intérieur ;
    // commerce du centre = socle 1 C + tranche Vendeur 1 C = 2 → trésorerie 2.
    expect(newState.players['p1']!.treasury).toBe(2);
  });

  it('le socle est un PLANCHER, pas un plafond : Égypte (désert, ère Antique) dépasse le socle', () => {
    // Trait Égypte Antique : +1 N / +1 C sur chaque case de DÉSERT (R-146) —
    // le plancher du centre ne plafonne pas les rendements.
    const desert = { '0,0': { terrain: 'desert' as const } };
    const y = tileYield(desert, [], '0,0', [], [], undefined, { civId: 'egypte', era: 'ancienne' })!;
    expect(y.food).toBe(1); // 0 (désert) + 1 (trait) — jamais raboté vers le socle
    expect(y.commerce).toBe(2); // 1 (désert) + 1 (trait)
    // Le centre (terrain ville) donne 1 N (POLISSAGE-1 C1) : pile le socle —
    // le plancher reste en garantie (cas futurs type cratère), il ne plafonne rien.
    const centre = tileYield({ '0,0': { terrain: 'ville' as const } }, [], '0,0')!;
    expect(centre.food).toBe(1);
  });

  it('non-régression D5 : fonder sur une ressource la détruit toujours (ResourceDestroyed)', () => {
    const state = makeState({
      width: 10,
      height: 10,
      units: [{ id: 'u1', type: 'colon', owner: 'p1', q: 5, r: 5 }],
    });
    state.map['5,5'] = { terrain: 'colline', resource: 'fer' };
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'FoundCity', unitId: 'u1' }] }, 1);
    expect(newState.map['5,5']).toEqual({ terrain: 'ville', resource: null });
    expect(events.some((e) => e.type === 'ResourceDestroyed' && e.resource === 'fer')).toBe(true);
    // …et le centre fraîchement fondé respecte le socle 1/1/1.
    const y = tileYield(newState.map, [], '5,5')!;
    expect(y.food).toBeGreaterThanOrEqual(1);
    expect(y.production).toBeGreaterThanOrEqual(1);
    expect(y.commerce).toBeGreaterThanOrEqual(1);
  });

  it('bot/assignation non perturbés : l\'auto-assignation R-60 ne déplace jamais le citoyen du centre', () => {
    const state = makeState({
      width: 8,
      height: 8,
      cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, workedTiles: [] }],
    });
    const assigned = autoAssignWorkedTiles(state.map, [], { q: 0, r: 0, pop: 1, buildings: [] });
    expect(assigned).not.toContain('0,0'); // le centre est travaillé d'office, non assignable
    expect(assigned).toHaveLength(1);
  });
});
