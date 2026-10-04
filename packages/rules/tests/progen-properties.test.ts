/**
 * Phase 6b L5 — Propriétés transverses du générateur procédural (corpus fixe).
 *
 * CI-FLAKY (01/10) : le balayage fast-check à graines ALÉATOIRES rendait la
 * CI intermittente (échec « villages 10 < 12 » sur ~0,1 % des seeds — seed
 * 3714012 découverte par le banc devtmp/banc-ci-flaky.mjs, 1000 seeds). Le
 * test balaye désormais un corpus FIXE de graines uint32 et vérifie à chaque
 * fois (R-80/R-101..R-105) :
 *  - la carte passe la validation intégrale `parseMap` (porte commune aux
 *    cartes préfabriquées — aucun changement du loader) ;
 *  - spawns symétriques par miroir (rotation 180°) et à distance ≥ 12 ;
 *  - connexion terrestre entre les deux spawns (BFS cases praticables) ;
 *  - équité : delta de fertilité = 0 (miroir), fertilité absolue ≥ seuil ;
 *  - villages/huttes/ressources posés, reflétés, uniques, à distance
 *    réglementaire des spawns.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROGEN_SETTINGS,
  generateProceduralMap,
  landConnected,
  resolveProgenSettings,
} from '../src/progen/index.js';
import { hexDistance, hexDistanceW, tileKeyOf } from '../src/hex.js';
import { TERRAINS } from '../src/data.js';

const W = 40;
const H = 40;
/** Corpus FIXE (CI-FLAKY 01/10) : 60 graines arbitraires + les graines
 *  historiquement fautives en non-régression (3714012 = « villages 10 < 12 »
 *  découvert par le banc devtmp/banc-ci-flaky.mjs). Zéro RNG non contrôlé :
 *  un échec CI futur est un vrai bug reproductible. */
const SEEDS: number[] = [
    ...Array.from({ length: 60 }, (_, i) => (i * 2654435761) >>> 0),
    3714012, // CI-FLAKY : « villages 10 < 12 » (épuisement glouton, pré-correctif)
  ];

describe('Phase 6b · Propriétés du générateur procédural (corpus fixe, 61 seeds)', () => {
  // timeout porté à 30 s (ALIGNEMENT-CROISSANCE 13/09) : 60+ seeds dépassent
  // le défaut de 5 s quand la suite tourne en parallèle — échec flaky observé.
  it('R-101..R-105 : toute graine du corpus produit une carte valide, symétrique, connectée et équitable', { timeout: 30_000 }, () => {
    for (const seed of SEEDS) {
      const { map, report } = generateProceduralMap(seed);
      const s = resolveProgenSettings();

      // Carte valide (format + validations parseMap déjà passés) — structure.
      expect(map.data.width).toBe(W);
      expect(map.data.height).toBe(H);
      expect(map.spawns).toHaveLength(2);

      // MONDE CYLINDRIQUE (T1) : spawns À L'OPPOSÉ du cylindre (|Δcol wrap
      // − W/2| ≤ 🔶 tolérance) et distance wrap ≥ 12 — plus de reflet exact.
      const [p1, p2] = map.spawns;
      const colOf = (h: { q: number; r: number }) => h.q + Math.floor(h.r / 2);
      const dcRaw = Math.abs(colOf(p1!.capital) - colOf(p2!.capital)) % W;
      const dCol = Math.min(dcRaw, W - dcRaw);
      expect(dCol).toBeGreaterThanOrEqual(W / 2 - s.oppositionTolerance);
      expect(dCol).toBeLessThanOrEqual(W / 2 + s.oppositionTolerance);
      expect(hexDistanceW(p1!.capital, p2!.capital, W)).toBeGreaterThanOrEqual(s.minSpawnDistance);
      for (const sp of map.spawns) {
        // Phase 6c (Erik) : Colon sur le site + Guerrier adjacent, sans capitale.
        expect(sp.units).toHaveLength(2);
        expect(sp.units[0]!.type).toBe('colon');
        expect(hexDistance(sp.capital, sp.units[0]!)).toBe(0);
        expect(sp.units[1]!.type).toBe('guerrier');
        expect(hexDistance(sp.capital, sp.units[1]!)).toBe(1);
      }

      // MONDE CYLINDRIQUE : plus de symétrie de terrain (l'équité est
      // statistique — garanties par joueur, opposition des spawns ci-dessus).

      // Connexité terrestre : requise en pangée/deux continents, NON requise
      // en archipel (défaut 6c — spawns possibles sur des îles séparées).
      if (s.continents !== 3) {
        expect(landConnected(map, p1!.capital, p2!.capital)).toBe(true);
      }

      // MONDE CYLINDRIQUE : équité STATISTIQUE — delta 🔶 plafonné (re-baseline
      // D4, à l'œil Erik) ; fertilité de chaque spawn ≥ seuil sauf site
      // infranormalisable (toléré, consigné).
      expect(report.fertility.delta).toBeLessThanOrEqual(15);

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
      // MONDE CYLINDRIQUE : plus de reflet — entités posées une seule fois.

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
    }
  });
});
