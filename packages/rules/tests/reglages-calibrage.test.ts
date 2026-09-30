/**
 * REGLAGES-CALIBRAGE (Erik 29/09) — trois réglages de calibrage :
 *  1. GP gratuit Amérique : TIRAGE SEEDÉ UNIFORME sur les 6 classes (RNG
 *     dédié `rngSeed ^ AMERICA_GP_SEED_SALT` — même seed ⇒ même classe).
 *  2. Vision +1 sur colline pour une unité terrestre non embarquée
 *     (`TerrainData.bonusVision`, data-driven — barbares exclus).
 *  3. (client) boutons Voir / Suivant du menu « unités sans ordre » —
 *     testé côté web (zoom préservé = centerOnHex, cf. apps/web/tests).
 */
import { describe, expect, it } from 'vitest';
import { computeVisibleTiles, getFilteredState, visionRadiusOf } from '../src/fog.js';
import { AMERICA_GP_SEED_SALT } from '../src/civStartBonus.js';
import { GP_CLASSES } from '../src/culture.js';
import { createInitialState, loadBuiltinMapSync } from '../src/map.js';
import { makeState } from '../src/fixtures.js';
import { UNIT_TYPES } from '../src/data.js';
import { colRowToHex, tileKeyOf } from '../src/hex.js';
import { createRng } from '../src/rng.js';

// ---------------------------------------------------------------------------
// Réglage 1 · GP gratuit Amérique — tirage seedé uniforme
// ---------------------------------------------------------------------------

/** Classe du GP gratuit Amérique au SETUP pour un seed donné. */
function gpClasseSetup(seed: number): string {
  const st = createInitialState(loadBuiltinMapSync('pedagogique-40'), seed, {
    p1: { civId: 'amerique' },
    p2: { civId: 'zoulous' },
  });
  const gp = Object.values(st.units).find((u) => u.owner === 'p1' && UNIT_TYPES[u.type]!.greatPerson);
  expect(gp).toBeDefined();
  const player = st.players['p1']!;
  expect(player.greatPersonsObtained).toBe(1); // compte d'octroi mis à jour
  expect(player.greatPersonsByType[gp!.type]).toBe(1);
  return gp!.type;
}

describe('REGLAGES-CALIBRAGE · GP Amérique tiré au sort (Erik 29/09)', () => {
  it('déterminisme : même seed → même classe', () => {
    expect(gpClasseSetup(7)).toBe(gpClasseSetup(7));
    expect(gpClasseSetup(1234)).toBe(gpClasseSetup(1234));
  });

  it('distribution : les 6 classes sortent sur N seeds (uniforme, aucun écrasement)', () => {
    // Pur (créer 400 états complets serait trop lent) — la correspondance
    // tirage ⇄ formule pure est éprouvée par le test suivant.
    const vues = new Set<string>();
    for (let seed = 0; seed < 2000; seed++) {
      const rng = createRng((seed ^ AMERICA_GP_SEED_SALT) >>> 0);
      vues.add(GP_CLASSES[rng.nextInt(GP_CLASSES.length)]!);
    }
    expect([...vues].sort()).toEqual([...GP_CLASSES].sort());
  });

  it('le tirage ne consomme PAS le RNG de résolution (seed ^ sel dédié, miroir Égypte)', () => {
    // Le résultat est une fonction pure du seed salé, recalculable à la main.
    for (const seed of [0, 1, 42, 9999]) {
      const rng = createRng((seed ^ AMERICA_GP_SEED_SALT) >>> 0);
      const attendu = GP_CLASSES[rng.nextInt(GP_CLASSES.length)]!;
      expect(gpClasseSetup(seed)).toBe(attendu);
    }
  });

  it('les autres civs ne reçoivent AUCUN GP gratuit (trait gpGratuit seul)', () => {
    const st = createInitialState(loadBuiltinMapSync('pedagogique-40'), 5, {
      p1: { civId: 'zoulous' },
      p2: { civId: 'grece' },
    });
    expect(Object.values(st.units).filter((u) => UNIT_TYPES[u.type]!.greatPerson)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Réglage 2 · Vision +1 sur colline (unités terrestres non embarquées)
// ---------------------------------------------------------------------------

describe('REGLAGES-CALIBRAGE · vision +1 sur colline (Erik 29/09)', () => {
  const base = { width: 12, height: 12, terrainOverrides: { '2,0': 'colline' } } as const;

  it('une unité terrestre sur colline voit une case de plus (rayon effectif 3)', () => {
    const state = makeState({ ...base, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0 }] });
    const visible = computeVisibleTiles(state, 'p1');
    const hex = colRowToHex(2, 0);
    // visionRadius 2 : (5,0) est hors de portée sans le bonus ; (6,0) aussi.
    expect(visible.has(tileKeyOf({ q: 5, r: 0 }))).toBe(true); // distance 3 — BONUS
    expect(visible.has(tileKeyOf({ q: 6, r: 0 }))).toBe(false); // distance 4 — toujours hors
    expect(visionRadiusOf(state, state.units['u1']!)).toBe(3);
  });

  it('pas de bonus sur les autres terrains (prairie, forêt, montagne)', () => {
    for (const t of ['prairie', 'foret', 'montagne'] as const) {
      const state = makeState({ ...base, terrainOverrides: { '2,0': t }, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0 }] });
      expect(visionRadiusOf(state, state.units['u1']!)).toBe(UNIT_TYPES['guerrier']!.visionRadius);
    }
  });

  it('pas de bonus embarquée (transport naval = vision du navire)', () => {
    const state = makeState({
      ...base,
      units: [
        { id: 'galion', type: 'galion', owner: 'p1', q: 2, r: 0 },
        { id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0, aboard: 'galion' },
      ],
    });
    expect(visionRadiusOf(state, state.units['u1']!)).toBe(UNIT_TYPES['guerrier']!.visionRadius);
  });

  it('pas de bonus pour les barbares (leurs spawns ne changent pas)', () => {
    const state = makeState({ ...base, players: ['p1'], units: [{ id: 'b1', type: 'guerrier', owner: 'barbarien', q: 2, r: 0 }] });
    expect(visionRadiusOf(state, state.units['b1']!)).toBe(UNIT_TYPES['guerrier']!.visionRadius);
  });

  it('les villes ne bénéficient pas du bonus (rayon ville inchangé)', () => {
    const state = makeState({
      ...base,
      cities: [{ id: 'c1', owner: 'p1', q: 2, r: 0, capital: true }],
    });
    // Re-trancher la case de la ville en colline ne change pas son rayon (3).
    const visible = computeVisibleTiles(state, 'p1');
    expect(visible.has(tileKeyOf({ q: 6, r: 0 }))).toBe(false); // distance 4
    expect(visible.has(tileKeyOf({ q: 5, r: 0 }))).toBe(true); // distance 3 — rayon ville
  });

  it('fog serveur et état diffusé cohérents (visible/explored intègrent le bonus)', () => {
    const state = makeState({ ...base, units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 2, r: 0 }] });
    const fogged = getFilteredState(state, 'p1');
    expect(fogged.map[tileKeyOf({ q: 5, r: 0 })]).toBeDefined(); // révélée PAR le bonus
    expect(fogged.players['p1']!.vision.visible).toContain('5,0');
  });
});
