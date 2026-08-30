import { describe, expect, it } from 'vitest';
import units from '../src/data/units.json' with { type: 'json' };
import terrains from '../src/data/terrain.json' with { type: 'json' };
import buildings from '../src/data/buildings.json' with { type: 'json' };
import type { BuildingData, TerrainData, UnitTypeData } from '../src/types.js';

const unitTable = units as Record<string, UnitTypeData>;
const terrainTable = terrains as Record<string, TerrainData>;
const buildingTable = buildings as Record<string, BuildingData>;

describe('Données v1 (RULES.md §2-3)', () => {
  it('contient exactement Guerrier et Colon en v1', () => {
    expect(Object.keys(unitTable).sort()).toEqual(['colon', 'guerrier']);
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

  it('aucune unité à distance en v1 (R-59 arrive en Phase 7)', () => {
    for (const u of Object.values(unitTable)) {
      expect(u.isRanged).toBe(false);
    }
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

  it('buildings.json : 6 bâtiments aux coûts R-66 (20/30/40/30/30/40)', () => {
    expect(Object.keys(buildingTable).sort()).toEqual([
      'atelier', 'comptoir_commercial', 'grenier', 'mine_de_fer', 'port', 'tribunal',
    ]);
    expect(buildingTable['grenier']!.cost).toBe(20);
    expect(buildingTable['atelier']!.cost).toBe(30);
    expect(buildingTable['mine_de_fer']!.cost).toBe(40);
    expect(buildingTable['comptoir_commercial']!.cost).toBe(30);
    expect(buildingTable['port']!.cost).toBe(30);
    expect(buildingTable['tribunal']!.cost).toBe(40);
  });

  it('effets R-66 : Grenier +1 N plaine, Atelier +2 P colline, Mine +4 P montagne, Comptoir +2 C désert, Port +1 N mer, Tribunal rayon', () => {
    expect(buildingTable['grenier']!.tileBonus).toEqual({ terrain: 'plaine', food: 1, production: 0, commerce: 0 });
    expect(buildingTable['atelier']!.tileBonus).toEqual({ terrain: 'colline', food: 0, production: 2, commerce: 0 });
    expect(buildingTable['mine_de_fer']!.tileBonus).toEqual({ terrain: 'montagne', food: 0, production: 4, commerce: 0 });
    expect(buildingTable['comptoir_commercial']!.tileBonus).toEqual({ terrain: 'desert', food: 0, production: 0, commerce: 2 });
    expect(buildingTable['port']!.tileBonus).toEqual({ terrain: 'eau', food: 1, production: 0, commerce: 0 });
    expect(buildingTable['tribunal']!.tileBonus).toBeNull();
    expect(buildingTable['tribunal']!.workRadiusBonus).toBe(1);
  });
});
