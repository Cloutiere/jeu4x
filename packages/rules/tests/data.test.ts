import { describe, expect, it } from 'vitest';
import units from '../src/data/units.json';
import terrains from '../src/data/terrain.json';
import type { TerrainData, UnitTypeData } from '../src/types.js';

const unitTable = units as Record<string, UnitTypeData>;
const terrainTable = terrains as Record<string, TerrainData>;

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

  it('bonus défensifs croissants : forêt < colline', () => {
    expect(terrainTable['foret']!.defenseBonus).toBeLessThan(terrainTable['colline']!.defenseBonus);
  });
});
