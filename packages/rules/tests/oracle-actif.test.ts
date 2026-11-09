import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { oracleActif } from '../src/oracle.js';
import { allKnownTechs } from '../src/state.js';

/**
 * ORACLE-VERDICT · L2 — la gate d'activité de la révélation (D2).
 * Data-driven (battleForeknowledge) + obsolescence GLOBALE R-128.
 */

function avecOracle(): ReturnType<typeof makeState> {
  const st = makeState({ cities: [{ id: 'cd', q: 2, r: 2, owner: 'p1', capital: true }] });
  st.cities.cd!.wonders = ['oracle_de_delphes'];
  return st;
}

describe('ORACLE-VERDICT · oracleActif', () => {
  it('actif quand MON empire contrôle l\'Oracle non obsolète', () => {
    const st = avecOracle();
    expect(oracleActif(st, 'p1')).toBe(true);
    expect(oracleActif(st, 'p2')).toBe(false); // l'adversaire n'a pas la révélation
  });

  it('inactif sans la merveille', () => {
    const st = makeState({ cities: [{ id: 'cd', q: 2, r: 2, owner: 'p1', capital: true }] });
    expect(oracleActif(st, 'p1')).toBe(false);
  });

  it('obsolescence GLOBALE (R-128) : l\'Oracle meurt si QUI QUE CE SOIT découvre la Religion', () => {
    const st = avecOracle();
    st.players.p2!.techsUnlocked = ['religion'];
    expect(allKnownTechs(st)).toContain('religion');
    expect(oracleActif(st, 'p1')).toBe(false);
  });
});
