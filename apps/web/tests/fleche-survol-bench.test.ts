/**
 * FLECHE-MOUVEMENT · M4 — bench du pathfinding de survol : le recalcul au
 * déplacement du curseur passe par `creeCacheChemins` (une entrée BFS par
 * unité×case cible, purgé à chaque vue serveur). Sans régression = le cache
 * rend les déplacements de curseur répétés quasi gratuits et le BFS à froid
 * reste négligeable à l'échelle d'une carte.
 */
import { describe, expect, it } from 'vitest';
import { makeState, tileKey } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import { creeCacheChemins, pathTo } from '../src/lib/render/interaction.js';

function grandeCarte(): GameState {
  const state = makeState({
    width: 24,
    height: 24,
    units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 12, r: 12 }],
  });
  const explored: string[] = [];
  for (let q = 0; q < 24; q++) for (let r = 0; r < 24; r++) explored.push(`${q},${r}`);
  state.players['p1']!.vision.explored = explored;
  return state;
}

/** 120 cases cibles réparties autour de l'unité (portée réelle de survol). */
function cibles(nb: number): Hex[] {
  const out: Hex[] = [];
  for (let i = 1; out.length < nb && i < 12; i++) {
    for (let dq = -i; dq <= i && out.length < nb; dq++) {
      for (let dr = -i; dr <= i && out.length < nb; dr++) {
        const h = { q: 12 + dq, r: 12 + dr };
        if (h.q < 0 || h.r < 0 || h.q >= 24 || h.r >= 24) continue;
        if (dq === 0 && dr === 0) continue;
        out.push(h);
      }
    }
  }
  return out;
}

describe('FLECHE-MOUVEMENT · bench survol (M4)', () => {
  it('à froid : 120 BFS distincts en temps négligeable (< 500 ms)', () => {
    const state = grandeCarte();
    const targets = cibles(120);
    const t0 = performance.now();
    let atteignables = 0;
    for (const c of targets) if (pathTo(state, state.units['u1']!, c)) atteignables++;
    const duree = performance.now() - t0;
    expect(atteignables).toBe(targets.length); // plaine partout : tout est atteignable
    expect(duree).toBeLessThan(500);
  });

  it('au déplacement du curseur : le cache ne relance PAS le BFS (identité du résultat réutilisée)', () => {
    const state = grandeCarte();
    const cache = creeCacheChemins();
    const targets = cibles(40);
    const premiers = targets.map((c) => cache.chemin(state, state.units['u1']!, c));
    // 500 « mouvements de curseur » rebalayant les mêmes cases : aucune
    // relance de BFS — le même tableau (identité) est rendu.
    for (let i = 0; i < 500; i++) {
      const c = targets[i % targets.length]!;
      expect(cache.chemin(state, state.units['u1']!, c)).toBe(premiers[i % premiers.length]);
    }
    expect(cache.taille()).toBe(new Set(targets.map((c) => `${c.q},${c.r}`)).size); // une entrée par case cible, pas plus
    cache.purge();
    expect(cache.taille()).toBe(0);
    // Après purge (nouvelle vue serveur), le recalcul est correct (valeur égale).
    expect(cache.chemin(state, state.units['u1']!, targets[0]!)).toEqual(premiers[0]);
  });

  it('une nouvelle vue purge : une case devenue inconnue est recalculée (fog évoluté)', () => {
    const state = grandeCarte();
    const cache = creeCacheChemins();
    const c: Hex = { q: 11, r: 12 };
    expect(cache.chemin(state, state.units['u1']!, c)).toEqual([{ q: 11, r: 12 }]);
    delete (state.map as Record<string, unknown>)[tileKey(11, 12)]; // retombe dans le fog
    state.players['p1']!.vision.explored = state.players['p1']!.vision.explored.filter((k) => k !== '11,12');
    cache.purge(); // ce que fait onNewView
    expect(cache.chemin(state, state.units['u1']!, c)).toEqual([{ q: 11, r: 12 }]); // toujours 1 pas (R-161)
  });
});
