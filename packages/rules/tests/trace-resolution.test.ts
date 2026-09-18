/**
 * HANDOFF-TRACE-RESOLUTION — tests de la trace de résolution (instrumentation
 * passive). Verrous :
 *  - ZÉRO GAMEPLAY : résolution avec trace = résolution sans trace BIT À BIT
 *    (état + événements) — la trace ne consomme, n'ajoute ni n'influence rien ;
 *  - DÉTERMINISME : même résolution + même seed = même trace JSON bit à bit ;
 *  - COMPLÉTUDE : chaque phase (A, B, C, E) couverte avec snapshots d'entrée
 *    ET de sortie ;
 *  - MÊLÉE VÉRIFIÉE VALEUR PAR VALEUR : poids, étau, tirage w/Σw, rolls
 *    consommés, dégâts appliqués (R-180/T-54) ;
 *  - JSON VALIDE et AUTO-CONSISTANT (chaque décision cite sa règle).
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { createTraceCollector, formaterTrace } from '../src/trace.js';
import type { ResolutionTrace } from '../src/trace.js';
import { makeState } from '../src/fixtures.js';
import type { GameState, Order } from '../src/state.js';

const AUCUN: Record<string, Order[]> = {};

function etatMelee(): GameState {
  // Deux guerriers ennemis co-localisés (pile instable) : mêlée Phase E.
  return makeState({
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, stabilized: false },
      { id: 'u2', type: 'guerrier', owner: 'p2', q: 3, r: 3, stabilized: false },
      { id: 'u3', type: 'guerrier', owner: 'p1', q: 6, r: 6 },
    ],
  });
}

describe('TRACE · zéro gameplay — avec/sans trace = état bit à bit', () => {
  it('état + événements identiques bit à bit, avec et sans collecteur', () => {
    const s0 = etatMelee();
    const ordres = { p1: [{ type: 'Move', unitId: 'u3', path: [{ q: 5, r: 6 }] }] } as unknown as Record<string, Order[]>;
    const sans = resolveTurn(s0, ordres, 42);
    const avec = resolveTurn(s0, ordres, 42, createTraceCollector(s0));
    expect(JSON.stringify(avec.newState)).toBe(JSON.stringify(sans.newState));
    expect(JSON.stringify(avec.events)).toBe(JSON.stringify(sans.events));
    // La graine sortante (compte de seed) est inchangée par la trace.
    expect(avec.newState.rngSeed).toBe(sans.newState.rngSeed);
  });

  it('la trace elle-même est déterministe : même entrée = même JSON bit à bit', () => {
    const s0 = etatMelee();
    const t1 = createTraceCollector(s0);
    const t2 = createTraceCollector(s0);
    resolveTurn(s0, AUCUN, 42, t1);
    resolveTurn(s0, AUCUN, 42, t2);
    expect(JSON.stringify(t1.trace)).toBe(JSON.stringify(t2.trace));
  });
});

describe('TRACE · complétude — chaque phase couverte, snapshots entrée/sortie', () => {
  it('phases A, B, C, E présentes avec snapshots entrée ET sortie', () => {
    const s0 = etatMelee();
    const t = createTraceCollector(s0);
    resolveTurn(s0, AUCUN, 42, t);
    const phases = t.trace.phases.map((p) => p.phase);
    expect(phases).toEqual(['A', 'B', 'C', 'E']);
    for (const p of t.trace.phases) {
      expect(p.entree.length).toBeGreaterThan(0);
      expect(p.sortie.length).toBeGreaterThan(0);
      for (const snap of [...p.entree, ...p.sortie]) {
        expect(snap).toHaveProperty('hp');
        expect(snap).toHaveProperty('mp');
        expect(snap).toHaveProperty('stabilized');
        expect(snap).toHaveProperty('fortified');
      }
    }
  });

  it('les rolls rapportés portent un usage et la mêlée consomme exactement 2 rolls', () => {
    const s0 = etatMelee();
    const t = createTraceCollector(s0);
    resolveTurn(s0, AUCUN, 42, t);
    const melee = t.trace.phases.flatMap((p) => p.decisions).filter((d) => d.kind === 'mêlée');
    expect(melee).toHaveLength(1);
    for (const r of t.trace.rolls) {
      expect(r.usage.length).toBeGreaterThan(0);
      expect(r.valeur).toBeGreaterThanOrEqual(0);
      expect(r.valeur).toBeLessThan(1);
    }
    // R-180 : tirage gagnant + tirage perdant = 2 rolls consommés par la mêlée.
    const rollsMelee = t.trace.rolls.filter((r) => r.usage.includes('mêlée'));
    expect(rollsMelee).toHaveLength(2);
  });
});

describe('TRACE · mêlée vérifiée valeur par valeur (R-180/T-54)', () => {
  it('poids = eff² × étau, tirage w/Σw, dégâts perdante −2 / intermédiaire −1', () => {
    const s0 = etatMelee();
    const t = createTraceCollector(s0);
    const { newState } = resolveTurn(s0, AUCUN, 42, t);
    const d = t.trace.phases.flatMap((p) => p.decisions).find((x) => x.kind === 'mêlée')!;
    expect(d.rule).toBe('R-180');
    const parts = d.detail.participants as Array<{ id: string; eff: number; tau: number; poids: number }>;
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      // Guerrier non vétéran sur prairie : attaque effective 1, étau 1 (un allié chacun).
      expect(p.eff).toBeCloseTo(1, 6);
      expect(p.tau).toBeCloseTo(1, 6);
      expect(p.poids).toBeCloseTo(1, 6);
    }
    expect(d.detail.sommePoids).toBeCloseTo(2, 6);
    const roles = d.detail.roles as Array<{ id: string; role: string }>;
    expect(roles).toHaveLength(2);
    expect(roles.map((r) => r.role).sort()).toEqual(['loser', 'winner']);
    // Dégâts : gagnante 0, perdante −2 (PV 3 → 1).
    const gagnante = roles.find((r) => r.role === 'winner')!;
    const perdante = roles.find((r) => r.role === 'loser')!;
    expect(newState.units[gagnante.id]!.hp).toBe(3);
    expect(newState.units[perdante.id]!.hp).toBe(1);
    // La décision cite le tirage w/Σw dans son libellé humain.
    expect(d.ligne).toContain('w/Σw=0.50');
  });

  it('étau T-54 : +0,25 par allié au-delà du premier, plafonné à 0,50', () => {
    const s0 = makeState({
      units: [
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, stabilized: false },
        { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 3, stabilized: false },
        { id: 'u3', type: 'guerrier', owner: 'p2', q: 3, r: 3, stabilized: false },
        { id: 'u4', type: 'guerrier', owner: 'p2', q: 3, r: 3, stabilized: false },
        { id: 'u5', type: 'guerrier', owner: 'p2', q: 3, r: 3, stabilized: false },
      ],
    });
    const t = createTraceCollector(s0);
    resolveTurn(s0, AUCUN, 42, t);
    const d = t.trace.phases.flatMap((p) => p.decisions).find((x) => x.kind === 'mêlée')!;
    const parts = d.detail.participants as Array<{ id: string; tau: number }>;
    for (const p of parts) {
      const attends = p.id === 'u1' || p.id === 'u2' ? 1.25 : 1.5;
      expect(p.tau).toBeCloseTo(attends, 6);
    }
  });
});

describe('TRACE · JSON valide et auto-consistant', () => {
  it('la trace est sérialisable, rejouable et chaque décision cite sa règle', () => {
    const s0 = etatMelee();
    const t = createTraceCollector(s0);
    resolveTurn(s0, AUCUN, 42, t);
    const json = JSON.stringify(t.trace, null, 2);
    const relu = JSON.parse(json) as ResolutionTrace;
    expect(relu.tour).toBe(s0.turn);
    expect(relu.seed).toBe(s0.rngSeed);
    expect(relu.phases).toHaveLength(4);
    for (const p of relu.phases) {
      for (const d of p.decisions) {
        expect(d.rule).toMatch(/^(R-\d+|X-\d+)/);
        expect(d.ligne.length).toBeGreaterThan(0);
        expect(typeof d.detail).toBe('object');
      }
    }
    // Journal lisible : une ligne par section, mêlée et compte de seed inclus.
    const lignes = formaterTrace(t.trace);
    expect(lignes.some((l) => l.includes('Phase A'))).toBe(true);
    expect(lignes.some((l) => l.includes('Phase E'))).toBe(true);
    expect(lignes.some((l) => l.includes('R-180'))).toBe(true);
    expect(lignes.some((l) => l.includes('Rolls consommés'))).toBe(true);
  });
});
