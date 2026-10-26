/**
 * BOT-P7-CIVS (décisions Erik 26/10) — L1 test-first : le tirage de civs du
 * banc d'observation est DÉTERMINISTE (même seed ⇒ même paire, miroir du
 * tirage seedé lobby R-80/R-81), les deux civs d'une partie sont DISTINCTES,
 * le corpus de 40 seeds couvre les 16 civs, et aucune paire n'apparaît deux
 * fois. Aucun changement de comportement — le banc seul porte des civs réelles.
 */
import { describe, expect, it } from 'vitest';
import { tiragePaireCivs } from '../src/bancObservation.js';
import { corpusBanc } from '../src/bancBotTd.js';
import { CIVILIZATIONS } from '@game/rules';

describe('BOT-P7-CIVS — tirage de paires de civs', () => {
  it('déterministe : même seed ⇒ même paire', () => {
    const a = tiragePaireCivs(12345);
    const b = tiragePaireCivs(12345);
    expect(b).toEqual(a);
  });

  it('civs valides et DISTINCTES dans la paire', () => {
    for (const seed of corpusBanc(40)) {
      const paire = tiragePaireCivs(seed);
      expect(Object.keys(CIVILIZATIONS.civs)).toContain(paire.p1);
      expect(Object.keys(CIVILIZATIONS.civs)).toContain(paire.p2);
      expect(paire.p1).not.toBe(paire.p2);
    }
  });

  it('couverture : les 16 civs apparaissent sur le corpus 40', () => {
    const vues = new Set<string>();
    for (const seed of corpusBanc(40)) {
      const { p1, p2 } = tiragePaireCivs(seed);
      vues.add(p1);
      vues.add(p2);
    }
    expect([...vues].sort()).toEqual(Object.keys(CIVILIZATIONS.civs).sort());
  });

  it('jamais deux fois la même paire (ordonnée p1,p2) sur le corpus', () => {
    const paires = corpusBanc(40).map((s) => tiragePaireCivs(s));
    const cles = paires.map((p) => `${p.p1}|${p.p2}`);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
