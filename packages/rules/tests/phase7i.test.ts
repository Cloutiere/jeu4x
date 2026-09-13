/**
 * Phase 7i — Alignement du moteur de ville sur Civ Revolution
 * (doc d'Erik « Moteur Ville Civilization Revolution », HANDOFF-PHASE7I),
 * RÉVISÉ par ALIGNEMENT-CROISSANCE (partie réelle d'Erik du 13/09 — valeurs
 * faites foi) :
 *
 * A1 · R-63 (rév. 13/09) : AUCUN citoyen ne consomme de nourriture —
 *      surplus = nourriture produite (la consommation 7i D1 est abrogée).
 * A2 · R-63 (rév. 13/09) : seuils LINÉAIRES 10 × population ACTUELLE
 *      (ancres Erik : 2→3 = 20, 3→4 = 30), cap 31.
 * A3 · R-66 abrogé : la CASE DE VILLE rapporte 0/0/0.
 * D3 · R-64 (rév.) : villes fondées à pop 2/3/4/5 selon l'ÈRE de l'empire.
 * D4 · R-60bis    : citoyens intérieurs au centre-ville (table par tranche).
 * D5 · R-64 (rév.) : fonder sur une ressource la DÉTRUIT (ResourceDestroyed).
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

describe('A1 · R-63 (rév. 13/09) — aucun citoyen ne consomme de nourriture', () => {
  it('surplus = nourriture produite : la réserve gagne TOUTE la récolte', () => {
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
    // récolte = 5 plaines × 1 N ; la case de ville rapporte 0 (A3) et RIEN
    // n'est consommé (A1) → la réserve gagne la récolte entière
    expect(city.foodStored).toBe(5);
    expect(city.pop).toBe(5); // pas de croissance
  });

  it('une ville sans récolte ne perd RIEN de sa réserve — personne ne meurt', () => {
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
    // récolte 0 (désert + centre 0/0/0) ; aucune consommation → la réserve
    // reste intacte, la croissance s'arrête faute de surplus, personne ne meurt
    expect(city.foodStored).toBe(3);
    expect(city.pop).toBe(8);
    expect(events.some((e) => e.type === 'UnitDestroyed')).toBe(false);
  });
});

describe('A2 · R-63 (rév. 13/09) — seuils 10 × population ACTUELLE, cap 31', () => {
  it('ancres Erik : 2→3 = 20, 3→4 = 30 ; table LINÉAIRE 10 × pop actuelle', () => {
    const t = (n: number) => growthThresholdFor(n)!;
    expect(t(2)).toBe(20);
    expect(t(3)).toBe(30);
    expect(t(2)).toBe(GROWTH.growthThresholds['2']);
    expect(t(1)).toBe(10);
    expect(t(5)).toBe(50);
    expect(t(10)).toBe(100);
    expect(t(30)).toBe(300);
  });

  it('croissance 2→3 exige 20 nourriture — 10 tours à +2/tour (vérifié en jeu par Erik)', () => {
    const base = {
      width: 8,
      height: 8,
      terrainOverrides: {
        '1,0': 'desert' as const, '0,1': 'desert' as const, '-1,0': 'desert' as const,
        '0,-1': 'desert' as const, '1,-1': 'desert' as const, '-1,1': 'desert' as const,
      },
    };
    // 19 stockés : seuil 20 non atteint
    const r19 = resolveTurn(makeState({ ...base, cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 19, workedTiles: [] }] }), {}, 1);
    expect(cityAt(r19.newState, 0, 0)!.pop).toBe(2);
    expect(cityAt(r19.newState, 0, 0)!.foodStored).toBe(19);
    // 20 stockés : seuil atteint → pop 3 (jauge soustraite du seuil)
    const r20 = resolveTurn(makeState({ ...base, cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 2, foodStored: 20, workedTiles: [] }] }), {}, 1);
    expect(cityAt(r20.newState, 0, 0)!.pop).toBe(3);
    expect(cityAt(r20.newState, 0, 0)!.foodStored).toBe(0);
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
    // 7 citoyens intérieurs : commerce = 0 (centre 0/0/0 — A3) + 1 (tranche
    // 7-12) + 7 × 1 (intérieurs)
    const city = cityAt(newState, 0, 0)!;
    expect(city.workedTiles).toHaveLength(0);
    expect(newState.players['p1']!.treasury).toBe(8);
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

describe('A3 · La ville fraîchement fondée ne produit que par ses citoyens (R-60/R-60bis)', () => {
  it('entourée de déserts : production = 0 (centre) + intérieurs ; commerce de tranche à pop ≤ 6 = 0', () => {
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
    // production = 0 (centre 0/0/0 — A3) + 2 × 1 (2 intérieurs Ouvriers) ;
    // commerce = 0 (centre) + tranche 0 (pop ≤ 6) → trésorerie 0
    expect(newState.players['p1']!.treasury).toBe(0);
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
    expect(r2.events.some((e) => e.type === 'UnitProduced')).toBe(true); // 9 + 1 (intérieur Ouvrier) ≥ 10
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
          // centre 0/0/0 (A3) : les marteaux viennent de la forêt travaillée
          workedTiles: ['4,5', '5,4'],
          production: { item: { kind: 'unit', id: 'colon' }, progress: 19 },
        },
      ],
    });
    state.players['p1']!.government = 'republique'; // R-121 : coût pop 1
    state.map['5,4'] = { terrain: 'foret', resource: null }; // 0/2/0
    state.map['4,5'] = { terrain: 'prairie', resource: null }; // 2/0/0
    let s = state;
    // Tour 1 : le colon est produit → pop 2 − 1 = 1.
    const r1 = resolveTurn(s, {}, 42);
    s = r1.newState;
    expect(r1.events.some((e) => e.type === 'UnitProduced' && e.unitType === 'colon')).toBe(true);
    expect(Object.values(s.cities)[0]!.pop).toBe(1);
    // Tours suivants : surplus alimentaire → pop 2 retrouvée en ≤ 5 tours
    // (récolte d'1 prairie = 2 N, aucune consommation — seuil 1→2 = 10).
    let tours = 0;
    while (Object.values(s.cities)[0]!.pop < 2 && tours < 7) {
      s = resolveTurn(s, {}, 42).newState;
      tours += 1;
    }
    expect(Object.values(s.cities)[0]!.pop).toBe(2);
    expect(tours).toBeLessThanOrEqual(5);
  });
});

describe('A3 · ALIGNEMENT-CROISSANCE — la case de ville rapporte 0/0/0 (socle R-66 abrogé)', () => {
  // Terrains fondables (passables, hors cratère — R-64/C15).
  const FONDABLES = ['prairie', 'plaine', 'foret', 'colline', 'desert'] as const;

  it('multi-terrains : N\'IMPORTE QUEL terrain fondé, la case de ville rapporte 0 N / 0 P / 0 C', () => {
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
      // La fondation transforme la case en terrain `ville` (R-64) ; elle ne
      // rapporte RIEN (tileYield — source unique moteur/UI).
      const y = tileYield(state.map, [], '0,0')!;
      expect(y.food, `nourriture sur ${terrain}`).toBe(0);
      expect(y.production, `production sur ${terrain}`).toBe(0);
      expect(y.commerce, `commerce sur ${terrain}`).toBe(0);
    }
  });

  it('centre sur désert, pop 1 : aucune recette — trésorerie 0', () => {
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
    // centre 0 C ; la tranche démographique ajoute 0 à pop 1.
    expect(newState.players['p1']!.treasury).toBe(0);
  });

  it('la tranche démographique s\'ajoute par-dessus le zéro : pop 7 → 1 C (Vendeur)', () => {
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
    // commerce du centre = 0 (A3) + tranche Vendeur 1 C = 1 → trésorerie 1.
    expect(newState.players['p1']!.treasury).toBe(1);
  });

  it('les traits de civ sur les TERRAINS normaux sont intacts : Égypte (désert) garde son bonus', () => {
    // Trait Égypte Antique : +1 N / +1 C sur chaque case de DÉSERT (R-146) —
    // l'abrogation du socle ne touche pas les rendements des autres terrains.
    const desert = { '0,0': { terrain: 'desert' as const } };
    const y = tileYield(desert, [], '0,0', [], [], undefined, { civId: 'egypte', era: 'ancienne' })!;
    expect(y.food).toBe(1); // 0 (désert) + 1 (trait)
    expect(y.commerce).toBe(2); // 1 (désert) + 1 (trait)
    // La case de ville, elle, rapporte 0 même avec un trait de civ.
    const centre = tileYield({ '0,0': { terrain: 'ville' as const } }, [], '0,0', [], [], undefined, { civId: 'egypte', era: 'ancienne' })!;
    expect(centre.food).toBe(0);
    expect(centre.production).toBe(0);
    expect(centre.commerce).toBe(0);
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
    // …et le centre fraîchement fondé ne rapporte RIEN (A3).
    const y = tileYield(newState.map, [], '5,5')!;
    expect(y.food).toBe(0);
    expect(y.production).toBe(0);
    expect(y.commerce).toBe(0);
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
