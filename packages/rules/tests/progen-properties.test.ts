/**
 * Phase 6b L5 — Propriétés transverses du générateur procédural (fast-check).
 *
 * Le handoff 6b exige 50+ seeds sans carte invalide : on balaye 60 graines
 * arbitraires uint32 et on vérifie à chaque fois (R-80/R-101..R-105) :
 *  - la carte passe la validation intégrale `parseMap` (porte commune aux
 *    cartes préfabriquées — aucun changement du loader) ;
 *  - spawns symétriques par miroir (rotation 180°) et à distance ≥ 12 ;
 *  - connexion terrestre entre les deux spawns (BFS cases praticables) ;
 *  - équité : delta de fertilité = 0 (miroir), fertilité absolue ≥ seuil ;
 *  - villages/huttes/ressources posés, reflétés, uniques, à distance
 *    réglementaire des spawns.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_PROGEN_SETTINGS,
  generateProceduralMap,
  landConnected,
  resolveProgenSettings,
} from '../src/progen/index.js';
import { mirroredHex } from '../src/progen/mirror.js';
import { hexDistance, tileKeyOf } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';

const W = 40;
const H = 40;
const MIN_RUNS = 60; // handoff : 50+ seeds

describe('Phase 6b · Propriétés du générateur procédural (fast-check, 60+ seeds)', () => {
  it('R-101..R-105 : toute graine uint32 produit une carte valide, symétrique, connectée et équitable', () => {
    const property = fc.property(fc.uint32Array({ minLength: 1, maxLength: 1 }), (seeds) => {
      const seed = seeds[0]!;
      const { map, report } = generateProceduralMap(seed);
      const s = resolveProgenSettings();

      // Carte valide (format + validations parseMap déjà passés) — structure.
      expect(map.data.width).toBe(W);
      expect(map.data.height).toBe(H);
      expect(map.spawns).toHaveLength(2);

      // Spawns symétriques (l'un est l'image exacte de l'autre) et ≥ 12.
      const [p1, p2] = map.spawns;
      expect(p2!.capital).toEqual(mirroredHex(p1!.capital, W));
      expect(hexDistance(p1!.capital, p2!.capital)).toBeGreaterThanOrEqual(s.minSpawnDistance);
      for (const sp of map.spawns) {
        expect(sp.units).toHaveLength(1);
        expect(sp.units[0]!.type).toBe('guerrier');
        expect(hexDistance(sp.capital, sp.units[0]!)).toBe(1);
      }

      // Terrains : symétrie miroir exacte (rows[r][c] === rows[39-r][39-c]).
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          if (map.data.rows[r]![c] !== map.data.rows[H - 1 - r]![W - 1 - c]) {
            throw new Error(`symétrie brisée en (${c},${r}) — seed ${seed}`);
          }
        }
      }

      // Connexité terrestre (BFS sur cases praticables).
      expect(landConnected(map, p1!.capital, p2!.capital)).toBe(true);

      // Équité : delta de fertilité nul par miroir ; fertilité absolue ≥ seuil.
      expect(report.fertility.delta).toBe(0);
      expect(report.fertility.p1).toBeGreaterThanOrEqual(report.fertility.threshold);

      // Contenu : villages/huttes/ressources posés, reflétés, uniques.
      expect(map.villages.length).toBeGreaterThanOrEqual(2 * DEFAULT_PROGEN_SETTINGS.villagesPerHalf);
      expect(map.huts.length).toBeGreaterThanOrEqual(2 * DEFAULT_PROGEN_SETTINGS.hutsPerHalf);
      const seenVillages = new Set<string>();
      const seenHuts = new Set<string>();
      const seenResources = new Set<string>();
      for (const v of map.villages) {
        const key = tileKeyOf(v);
        expect(seenVillages.has(key)).toBe(false);
        seenVillages.add(key);
        expect(TERRAINS[map.terrain[key]!]!.passable).toBe(true);
      }
      for (const h of map.huts) {
        const key = tileKeyOf(h);
        expect(seenHuts.has(key)).toBe(false);
        seenHuts.add(key);
        expect(TERRAINS[map.terrain[key]!]!.passable).toBe(true);
      }
      for (const res of map.resources) {
        const key = tileKeyOf(res);
        expect(seenResources.has(key)).toBe(false);
        seenResources.add(key);
      }
      // Reflet : chaque village/hutte a son image.
      for (const v of map.villages) {
        expect(seenVillages.has(tileKeyOf(mirroredHex(v, W)))).toBe(true);
      }
      for (const h of map.huts) {
        expect(seenHuts.has(tileKeyOf(mirroredHex(h, W)))).toBe(true);
      }
      // Distances réglementaires aux deux spawns (leçon calibrage 7d).
      for (const v of map.villages) {
        for (const sp of map.spawns) {
          expect(hexDistance(v, sp.capital)).toBeGreaterThanOrEqual(s.minVillageDistance);
        }
      }
      for (const h of map.huts) {
        for (const sp of map.spawns) {
          expect(hexDistance(h, sp.capital)).toBeGreaterThanOrEqual(s.minHutDistance);
        }
      }
    });
    fc.assert(property, { numRuns: MIN_RUNS, verbose: true });
  });
});
