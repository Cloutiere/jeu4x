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
});
