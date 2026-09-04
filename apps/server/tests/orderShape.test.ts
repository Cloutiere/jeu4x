/**
 * Tests 7f — validation structurelle des ordres (GameDO) : la production de
 * MERVEILLES (kind 'wonder', R-116) doit passer la validation de forme —
 * régression du e2e GUI (Stonehenge refusé à la soumission avant correction).
 */
import { describe, expect, it } from 'vitest';
import { orderShapeError } from '../src/game.js';

describe('orderShapeError · SetProduction (7f, merveilles)', () => {
  it('accepte un item de production de type merveille (kind wonder)', () => {
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'stonehenge' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }),
    ).toBeNull();
  });

  it('accepte toujours unités et bâtiments, refuse les kinds inconnus', () => {
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'temple' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'spaceship', id: 'x' } }),
    ).not.toBeNull();
  });

  it('accepte l\'ordre InstallPerson (R-115) et refuse les champs manquants', () => {
    expect(orderShapeError({ type: 'InstallPerson', unitId: 'u10', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'InstallPerson', unitId: 'u10' })).not.toBeNull();
    expect(orderShapeError({ type: 'InstallPerson', cityId: 'c1' })).not.toBeNull();
  });

  it('7j · R-126 : accepte GreatPersonAction (consume/settle + ville) et refuse action invalide', () => {
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'consume', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'settle', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'both', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', action: 'settle', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'settle' })).not.toBeNull();
  });

  it('7l · R-135 : accepte RushBuy (ville) et refuse la forme invalide — leçon 7f : forme validée EN PREMIER', () => {
    expect(orderShapeError({ type: 'RushBuy', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'RushBuy' })).not.toBeNull();
    expect(orderShapeError({ type: 'RushBuy', cityId: 42 })).not.toBeNull();
  });

  it('7g · R-119 : accepte SpyMission (vol de GP) et refuse mission/champs invalides', () => {
    expect(
      orderShapeError({ type: 'SpyMission', unitId: 'u3', cityId: 'c2', mission: 'stealGreatPerson' }),
    ).toBeNull();
    expect(orderShapeError({ type: 'SpyMission', unitId: 'u3', cityId: 'c2', mission: 'assassinate' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyMission', unitId: 'u3', mission: 'stealGreatPerson' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyMission', cityId: 'c2', mission: 'stealGreatPerson' })).not.toBeNull();
  });

  it('7m · R-139 : accepte Launch (ICBM + cible hex) et refuse la forme invalide — forme validée EN PREMIER', () => {
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: { q: 3, r: -2 } })).toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9' })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', target: { q: 3, r: -2 } })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: { q: 1.5, r: 0 } })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: '0,0' })).not.toBeNull();
  });

  it('7m · R-143 : accepte SpyAction (6 actions) et refuse action inconnue / buildingId manquant', () => {
    for (const action of ['stealGold', 'kidnapGreatPerson', 'sabotageProduction', 'destroyFortifications', 'leave']) {
      expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action })).toBeNull();
    }
    expect(
      orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'destroyBuilding', buildingId: 'temple' }),
    ).toBeNull();
    // destroyBuilding EXIGE buildingId (choix du tireur 🔶) ; action inconnue refusée.
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'destroyBuilding' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'assassinate' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', action: 'stealGold' })).not.toBeNull();
  });
});
