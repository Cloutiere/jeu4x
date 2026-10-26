/**
 * BOT-ARMEE · D5 — la défense du JOUEUR doit rester viable : une capitale
 * garnisonnée tient encore une attaque MINEURE (3 guerriers isolés, sans
 * soutien) après le rééquilibrage des données défensives (D4).
 *
 * Scénario scripté déterministe : capitale p1 (palais, 2 guerriers qui se
 * fortifient et ne bougent plus) assiégée par 3 guerriers p2 qui attaquent
 * chacun leur tour. Critère : au bout de 6 tours d'assaut, la ville est
 * TOUJOURS à p1 et il reste au moins un défenseur.
 */
import { describe, expect, it } from 'vitest';
import { createRng, makeState, resolveTurn } from '@game/rules';
import type { GameState, Order } from '@game/rules';

const DEF = 'p1';
const ATT = 'p2';

function scenario(): GameState {
  return makeState({
    width: 12,
    height: 12,
    players: [DEF, ATT],
    warPairs: [[DEF, ATT]],
    units: [
      { id: 'd1', type: 'guerrier', owner: DEF, q: 4, r: 2 },
      { id: 'd2', type: 'guerrier', owner: DEF, q: 4, r: 2 },
      { id: 'a1', type: 'guerrier', owner: ATT, q: 6, r: 2 },
      { id: 'a2', type: 'guerrier', owner: ATT, q: 6, r: 3 },
      { id: 'a3', type: 'guerrier', owner: ATT, q: 6, r: 1 },
    ],
    cities: [
      { id: 'c1', owner: DEF, q: 4, r: 2, pop: 3, capital: true, workedTiles: [], buildings: ['palais'] },
    ],
    rngSeed: 1234,
  }) as GameState;
}

describe('BOT-ARMEE · D5 — défense du joueur viable (scénario scripté)', () => {
  it('une capitale garnisonnée (2 fortifiés + palais) tient une attaque mineure', () => {
    let s = scenario();
    for (let t = 0; t < 6 && s.winner === null; t++) {
      const orders: Record<string, Order[]> = { [DEF]: [], [ATT]: [] };
      orders[DEF] = [
        { type: 'Fortify', unitId: 'd1' },
        { type: 'Fortify', unitId: 'd2' },
      ];
      // Les attaquants vivants frappent la case de la ville (combat d'entrée).
      for (const a of ['a1', 'a2', 'a3']) {
        if (s.units[a] && s.units[a]!.hp > 0) {
          orders[ATT]!.push({ type: 'Attack', unitId: a, target: { q: 4, r: 2 } });
        }
      }
      s = resolveTurn(s, orders, s.rngSeed).newState;
    }
    const ville = s.cities['c1']!;
    expect(ville.owner).toBe(DEF); // la capitale N'A PAS TOMBÉ
    const defenseurs = Object.values(s.units).filter((u) => u.owner === DEF && u.hp > 0);
    expect(defenseurs.length).toBeGreaterThanOrEqual(1); // la garnison tient
    // Et les attaquants ont PAYÉ (au moins un tué ou bien deux défenseurs vivants).
    const attaquants = Object.values(s.units).filter((u) => u.owner === ATT && u.hp > 0);
    expect(attaquants.length < 3 || defenseurs.length >= 2).toBe(true);
  });

  it('déterminisme : le scénario rejoué donne le même état', () => {
    let a = scenario();
    let b = scenario();
    for (let t = 0; t < 3; t++) {
      const orders: Record<string, Order[]> = { [DEF]: [], [ATT]: [] };
      orders[DEF] = [
        { type: 'Fortify', unitId: 'd1' },
        { type: 'Fortify', unitId: 'd2' },
      ];
      for (const x of ['a1', 'a2', 'a3']) orders[ATT]!.push({ type: 'Attack', unitId: x, target: { q: 4, r: 2 } });
      a = resolveTurn(a, JSON.parse(JSON.stringify(orders)), a.rngSeed).newState;
      b = resolveTurn(b, JSON.parse(JSON.stringify(orders)), b.rngSeed).newState;
    }
    void createRng;
    expect(JSON.stringify(a.units)).toBe(JSON.stringify(b.units));
  });
});
