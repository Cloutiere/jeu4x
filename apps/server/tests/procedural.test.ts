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
  expect(progen!.landRatio).toBeGreaterThan(0.5);
  expect(progen!.landRatio).toBeLessThan(0.6);
  expect(progen!.fertility.delta).toBe(0); // équité parfaite par miroir
  expect(progen!.fertility.p1).toBeGreaterThanOrEqual(progen!.fertility.threshold);
  expect(progen!.connected).toBe(true);

  // État moteur : villages 2×3, huttes 2×2, villes c1/c2, 1 Guerrier chacun.
  const state = dump.state!;
  expect(state.mapId).toBe('procedural-40');
  expect(state.villages).toHaveLength(6);
  expect(state.huts).toHaveLength(4);
  expect(Object.keys(state.cities)).toEqual(['c1', 'c2']);
  expect(Object.keys(state.units)).toEqual(['u1', 'u2']);

  // Symétrie miroir des capitales : p2 = image de p1 (q2 = 20 − q1, r2 = 39 − r1).
  const cities = state.cities as Record<string, { q: number; r: number }>;
  expect(cities.c2!.q).toBe(20 - cities.c1!.q);
  expect(cities.c2!.r).toBe(39 - cities.c1!.r);
  // Distance entre capitales ≥ 12 (validation parseMap côté moteur).
  const dq = cities.c2!.q - cities.c1!.q;
  const dr = cities.c2!.r - cities.c1!.r;
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
