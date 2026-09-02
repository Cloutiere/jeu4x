/**
 * Phase 6b — Partie « procedural-40 » de bout en bout (DO).
 *
 * La mission : createGame avec la carte aléatoire → les deux joueurs
 * démarrent (Guerrier adjacent, pas de Colon — décision du 01/09),
 * barbares/huttes/ressources présents et SYMÉTRIQUES, et le rapport de
 * génération (seed, ratio terre, checksum de fertilité) consigné dans le
 * dump admin. La carte est régénérée depuis `meta.seed` au réveil à froid :
 * le dump reste cohérent après hibernation.
 */
import { expect, test } from 'vitest';
import { adminDump, createGame, joinGame } from './helpers.js';

const ALICE = { id: 'dev:alice', name: 'Alice' };
const BOB = { id: 'dev:bob', name: 'Bob' };

test('procedural-40 : création, join, dump admin complet et symétrique', async () => {
  const code = await createGame(ALICE, { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false });
  await joinGame(BOB, code);

  const dump = await adminDump(code);
  expect(dump.meta?.status).toBe('active');
  expect(dump.meta?.settings?.mapId).toBe('procedural-40');
  expect(typeof dump.meta?.seed).toBe('number');

  // Rapport de génération consigné (handoff L1-5 / L3-3) : seed, ratio terre,
  // checksum d'équité.
  const progen = dump.meta?.progen;
  expect(progen).toBeDefined();
  expect(progen!.seed).toBe(dump.meta!.seed);
  expect(progen!.strategy).toBe('mirror1v1');
  // Archipel (défaut 6c) : ratio terre effectif ≈ 55 % × 0.7 ≈ 38.5 %.
  expect(progen!.landRatio).toBeGreaterThan(0.33);
  expect(progen!.landRatio).toBeLessThan(0.45);
  expect(progen!.fertility.delta).toBe(0); // équité parfaite par miroir
  expect(progen!.fertility.p1).toBeGreaterThanOrEqual(progen!.fertility.threshold);
  // Archipel (défaut 6c) : connexité terrestre non requise (îles) — la
  // valeur du rapport est informative (peut être true par hasard).

  // État moteur : villages 2×3, huttes 2×2, villes c1/c2, 1 Guerrier chacun.
  const state = dump.state!;
  expect(state.mapId).toBe('procedural-40');
  // Phase 6c : 6 villages + 6 huttes par moitié miroir → 12/12.
  expect(state.villages).toHaveLength(12);
  expect(state.huts).toHaveLength(12);
  // Phase 6c (Erik) : démarrage Colon + Guerrier sans capitale.
  expect(Object.keys(state.cities)).toEqual([]);
  // Colon + Guerrier par joueur : u1 colon p1, u2 guerrier p1, u3 colon p2, u4 guerrier p2.
  expect(Object.keys(state.units)).toEqual(['u1', 'u2', 'u3', 'u4']);
  // (le type Snapshot du dump ne porte pas `type` — cast local pour l'assertion)
  const unitTypes = state.units as unknown as Record<string, { type: string; owner: string }>;
  expect(unitTypes.u1!.type).toBe('colon');
  expect(unitTypes.u1!.owner).toBe('p1');
  expect(unitTypes.u3!.type).toBe('colon');
  expect(unitTypes.u3!.owner).toBe('p2');

  // Phase 6c (Erik) : sans capitale, la symétrie se vérifie sur les COLONS
  // (u1 = site p1, u3 = site p2 — l'un est l'image de l'autre, distance ≥ 12).
  const units = state.units as unknown as Record<string, { q: number; r: number; type: string }>;
  const colon1 = units.u1!;
  const colon2 = units.u3!;
  expect(colon2.q).toBe(20 - colon1.q);
  expect(colon2.r).toBe(39 - colon1.r);
  const dq = colon2.q - colon1.q;
  const dr = colon2.r - colon1.r;
  expect((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2).toBeGreaterThanOrEqual(12);
});

test('procedural-40 : le seed détermine la carte (même seed → même rapport)', async () => {
  // Deux parties créées via le flux réel : le seed est aléatoire, on vérifie
  // donc la DÉTERMINISTE du rapport re-généré par le moteur depuis meta.seed.
  const code = await createGame(ALICE, { mapId: 'procedural-40', turnTimerMinutes: null, isPublic: false });
  await joinGame(BOB, code);
  const dump = await adminDump(code);
  const progen = dump.meta!.progen!;

  const { generateProceduralMap } = await import('@game/rules');
  const regenerated = generateProceduralMap(dump.meta!.seed!);
  expect(regenerated.report.landRatio).toBe(progen.landRatio);
  expect(regenerated.report.fertility.p1).toBe(progen.fertility.p1);
  expect(regenerated.map.data.id).toBe('procedural-40');
});
