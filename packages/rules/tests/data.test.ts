import { describe, expect, it } from 'vitest';
import units from '../src/data/units.json' with { type: 'json' };
import terrains from '../src/data/terrain.json' with { type: 'json' };
import buildings from '../src/data/buildings.json' with { type: 'json' };
import resources from '../src/data/resources.json' with { type: 'json' };
import { isWaterTerrain } from '../src/data.js';
import type { BuildingData, ResourceData, TerrainData, TerrainId, UnitTypeData } from '../src/types.js';

const unitTable = units as Record<string, UnitTypeData>;
const terrainTable = terrains as Record<string, TerrainData>;
const buildingTable = buildings as Record<string, BuildingData>;
const resourceTable = resources as Record<string, ResourceData>;

describe('Données v1 (RULES.md §2-3)', () => {
  it('contient le roster terrestre complet 7e + données seules (naval, aérien, spéciaux)', () => {
    expect(Object.keys(unitTable).sort()).toEqual([
      'archer', 'artillerie', 'bombardier', 'canon', 'caravane', 'catapulte', 'cavalier', 'char_d_assaut',
      'chasseur', 'chevalier', 'colon', 'croiseur', 'cuirasse', 'espion', 'fusilier', 'galere', 'galion',
      'guerrier', 'icbm', 'infanterie_moderne', 'legion', 'milice', 'piquier', 'sous_marin',
    ]);
  });

  it('Guerrier 1/1/1, Colon 0/0/2 (référence Civ Rev)', () => {
    expect(unitTable['guerrier']).toMatchObject({ attack: 1, defense: 1, movement: 1 });
    expect(unitTable['colon']).toMatchObject({ attack: 0, defense: 0, movement: 2 });
  });

  it('le Colon est non-combattant et fonde des villes (R-43)', () => {
    expect(unitTable['colon']!.canAttack).toBe(false);
    expect(unitTable['colon']!.canFoundCity).toBe(true);
    expect(unitTable['guerrier']!.canAttack).toBe(true);
  });

  it('7e : les unités à distance existent (R-59) — Catapulte, Canon, Artillerie, seules', () => {
    const ranged = Object.values(unitTable).filter((u) => u.isRanged).map((u) => u.id).sort();
    expect(ranged).toEqual(['artillerie', 'canon', 'catapulte']);
    // R-87 : le Colon porte le coût en population officiel (2 — Erik 02/09).
    expect(unitTable['colon']!.populationCost).toBe(2);
    // 7e : soutien naval en données (mécanique 7g) — Galion 15, Croiseur 35, Cuirassé 65.
    expect(unitTable['galion']!.navalSupport).toBe(15);
    expect(unitTable['croiseur']!.navalSupport).toBe(35);
    expect(unitTable['cuirasse']!.navalSupport).toBe(65);
  });

  it('chaque unité a des stats cohérentes', () => {
    for (const u of Object.values(unitTable)) {
      expect(u.hpMax).toBeGreaterThan(0);
      expect(u.movement).toBeGreaterThan(0);
      expect(u.cost).toBeGreaterThan(0);
      expect(u.attack).toBeGreaterThanOrEqual(0);
    }
  });

  it('montagne et eau sont infranchissables en v1 (T-11)', () => {
    expect(terrainTable['montagne']!.passable).toBe(false);
    expect(terrainTable['eau']!.passable).toBe(false);
  });

  it('bonus défensifs §2 révisé (30/08) : forêt +50 % = colline, ville +50 %', () => {
    expect(terrainTable['foret']!.defenseBonus).toBe(0.5);
    expect(terrainTable['colline']!.defenseBonus).toBe(0.5);
    expect(terrainTable['ville']!.defenseBonus).toBe(0.5);
  });
});

describe('Données Phase 6 (RULES.md §2 révisé + R-66)', () => {
  it('rendements §2 révisés : plaine 1/0/0, forêt 0/2/0, colline 0/1/0, prairie 2/0/0, ville 2/1/1', () => {
    expect(terrainTable['prairie']!.yields).toEqual({ food: 2, production: 0, commerce: 0 });
    expect(terrainTable['plaine']!.yields).toEqual({ food: 1, production: 0, commerce: 0 });
    expect(terrainTable['foret']!.yields).toEqual({ food: 0, production: 2, commerce: 0 });
    expect(terrainTable['colline']!.yields).toEqual({ food: 0, production: 1, commerce: 0 });
    expect(terrainTable['ville']!.yields).toEqual({ food: 2, production: 1, commerce: 1 });
  });

  it('le champ de rendement est `commerce` (pas `gold`) — C réparti or/science (R-61)', () => {
    for (const t of Object.values(terrainTable)) {
      if (t.yields) expect(Object.keys(t.yields).sort()).toEqual(['commerce', 'food', 'production']);
    }
  });

  it('désert (nouveau) : praticable, 0/0/1', () => {
    expect(terrainTable['desert']).toMatchObject({
      passable: true,
      defenseBonus: 0,
      yields: { food: 0, production: 0, commerce: 1 },
    });
  });

  it('« eau » garde son id mais devient la Mer productive 0/0/2 (travaillable, non praticable)', () => {
    expect(terrainTable['eau']!.id).toBe('eau');
    expect(terrainTable['eau']!.name).toBe('Mer');
    expect(terrainTable['eau']!.passable).toBe(false);
    expect(terrainTable['eau']!.yields).toEqual({ food: 0, production: 0, commerce: 2 });
  });

  it('montagne : infranchissable mais travaillable (rendements 0/1/0)', () => {
    expect(terrainTable['montagne']!.passable).toBe(false);
    expect(terrainTable['montagne']!.yields).toEqual({ food: 0, production: 1, commerce: 0 });
  });

  it('buildings.json 7e : 22 bâtiments — coûts exacts (Temple 40 … Aqueduc 120) + Palais/Usine/SDI/Vaisseau', () => {
    expect(Object.keys(buildingTable).sort()).toEqual([
      'aqueduc', 'atelier', 'banque', 'bibliotheque', 'caserne', 'cathedrale', 'comptoir_commercial', 'grenier',
      'marche', 'mine_de_fer', 'palais', 'port', 'remparts', 'sdi', 'temple', 'tribunal', 'universite', 'usine',
      'vaisseau_carburant', 'vaisseau_habitation', 'vaisseau_propulsion', 'vaisseau_support_vie',
    ]);
    // Coûts exacts du document « Technologies et Déblocages » (amendement 7e).
    expect(buildingTable['palais']!.cost).toBe(0);
    expect(buildingTable['caserne']!.cost).toBe(40);
    expect(buildingTable['grenier']!.cost).toBe(40);
    expect(buildingTable['bibliotheque']!.cost).toBe(40);
    expect(buildingTable['temple']!.cost).toBe(40);
    expect(buildingTable['comptoir_commercial']!.cost).toBe(60);
    expect(buildingTable['atelier']!.cost).toBe(60);
    expect(buildingTable['marche']!.cost).toBe(60);
    expect(buildingTable['tribunal']!.cost).toBe(80);
    expect(buildingTable['mine_de_fer']!.cost).toBe(80);
    expect(buildingTable['port']!.cost).toBe(100);
    expect(buildingTable['remparts']!.cost).toBe(100);
    expect(buildingTable['aqueduc']!.cost).toBe(120);
    expect(buildingTable['banque']!.cost).toBe(120);
    expect(buildingTable['cathedrale']!.cost).toBe(160);
    expect(buildingTable['universite']!.cost).toBe(160);
    expect(buildingTable['usine']!.cost).toBe(200);
  });

  it('effets R-66 révisés 7e : Grenier +2 N plaine (point ouvert 6c résolu), effets de ville structurés', () => {
    expect(buildingTable['grenier']!.tileBonus).toEqual({ terrain: 'plaine', food: 2, production: 0, commerce: 0 });
    expect(buildingTable['atelier']!.tileBonus).toEqual({ terrain: 'colline', food: 0, production: 2, commerce: 0 });
    expect(buildingTable['mine_de_fer']!.tileBonus).toEqual({ terrain: 'montagne', food: 0, production: 4, commerce: 0 });
    expect(buildingTable['comptoir_commercial']!.tileBonus).toEqual({ terrain: 'desert', food: 0, production: 0, commerce: 2 });
    expect(buildingTable['port']!.tileBonus).toEqual({ terrain: 'eau', food: 1, production: 0, commerce: 0 });
    expect(buildingTable['tribunal']!.tileBonus).toBeNull();
    expect(buildingTable['tribunal']!.workRadiusBonus).toBe(1);
  });

  it('7e : effets de ville — défense (Palais/Remparts), multiplicateurs (Marché/Banque/Université/Usine), Aqueduc', () => {
    expect(buildingTable['palais']!.cityDefenseBonus).toBe(0.5);
    expect(buildingTable['palais']!.fixed).toBe(true);
    expect(buildingTable['remparts']!.cityDefenseBonus).toBe(1.0);
    expect(buildingTable['marche']!.goldMult).toBe(2);
    expect(buildingTable['banque']!.goldMult).toBe(4);
    expect(buildingTable['bibliotheque']!.scienceMult).toBe(1.5);
    expect(buildingTable['universite']!.scienceMult).toBe(4);
    expect(buildingTable['usine']!.productionMult).toBe(2);
    expect(buildingTable['aqueduc']!.growthThresholdReduction).toBe(0.33);
  });

  it('7e : remplacements d’infrastructures — Banque ← Marché, Université ← Bibliothèque, Cathédrale ← Temple', () => {
    expect(buildingTable['banque']).toMatchObject({ requiresBuilding: 'marche', replaces: 'marche' });
    expect(buildingTable['universite']).toMatchObject({ requiresBuilding: 'bibliotheque', replaces: 'bibliotheque' });
    expect(buildingTable['cathedrale']).toMatchObject({ requiresBuilding: 'temple', replaces: 'temple' });
    // Effets culturels : décrits en données, inactifs jusqu’à la 7f.
    expect(buildingTable['temple']!.culturePerCitizen).toBe(1);
    expect(buildingTable['cathedrale']!.culturePerCitizen).toBe(2);
  });
});

describe('Données Phase 6c — côte vs océan (décisions d\'Erik du 02/09)', () => {
  it('ocean : nouveau terrain infranchissable, rendements 0/0/2 (identiques à la côte), navalAccess "ocean"', () => {
    expect(terrainTable['ocean']).toMatchObject({
      id: 'ocean',
      name: 'Océan',
      defenseBonus: 0,
      passable: false,
      navalAccess: 'ocean',
      yields: { food: 0, production: 0, commerce: 2 },
    });
  });

  it('eau = mer côtière : rendements 0/0/2 inchangés, navalAccess "coast" (hook naval Phase 7)', () => {
    expect(terrainTable['eau']).toMatchObject({
      id: 'eau',
      name: 'Mer',
      passable: false,
      navalAccess: 'coast',
      yields: { food: 0, production: 0, commerce: 2 },
    });
  });

  it('isWaterTerrain : exactement les terrains portant navalAccess (aucun terrain terrestre inclus)', () => {
    for (const [id, t] of Object.entries(terrainTable)) {
      expect(isWaterTerrain(id as TerrainId), `terrain ${id}`).toBe(t.navalAccess !== undefined);
    }
    expect(isWaterTerrain('eau')).toBe(true);
    expect(isWaterTerrain('ocean')).toBe(true);
    expect(isWaterTerrain('prairie')).toBe(false);
    expect(isWaterTerrain('montagne')).toBe(false);
    expect(isWaterTerrain('ville')).toBe(false);
  });

  it("R-94 révisé (océan stérile — Erik, 02/09) : marines sur la côte seule, AUCUNE ressource sur l'océan", () => {
    const marines = ['baleine', 'poisson', 'teinture'];
    for (const id of marines) {
      expect(resourceTable[id]!.terrains, `ressource ${id}`).toEqual(['eau']);
    }
    for (const r of Object.values(resourceTable)) {
      expect(r.terrains, `ressource ${r.id} : jamais sur l'océan`).not.toContain('ocean');
    }
  });

  it('le Port garde son bonus sur la côte uniquement (recalibrage attendu avec le naval, Phase 7)', () => {
    expect(buildingTable['port']!.tileBonus).toEqual({ terrain: 'eau', food: 1, production: 0, commerce: 0 });
  });
});
