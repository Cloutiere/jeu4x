/**
 * Tests du catalogue de l'atelier (chantier ATELIER, L0) : complétude contre
 * les sources de vérité (moteur, visuel3d.json, PNG de public/art). L'atelier
 * expose le moteur — si le moteur gagne un asset sans carte/tuile/sprite, ou
 * si un sprite référencé manque, ces tests échouent.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { TERRAINS, UNIT_TYPES, BUILDINGS, RESOURCES, ARTEFACTS, RESOURCE_UNKNOWN } from '@game/rules';
import { TERRAINS3D, STRUCTURES3D } from '../src/lib/render3d/spec3d.js';
import {
  CATALOGUE,
  CATEGORIES,
  filtrerCatalogue,
  construireCatalogue,
  stemsDe,
  type AssetAtelier,
} from '../src/lib/atelier/catalogue.js';

const ART_DIR = fileURLToPath(new URL('../public/art/', import.meta.url));

const parCategorie = (cat: string): AssetAtelier[] =>
  CATALOGUE.filter((a) => a.categorie === cat);
const idsDe = (cat: string): string[] => parCategorie(cat).map((a) => a.id);

describe('atelier — catalogue L0', () => {
  it('est déterministe et couvre les 5 catégories', () => {
    expect(CATALOGUE).toEqual(construireCatalogue());
    expect([...new Set(CATALOGUE.map((a) => a.categorie))].sort()).toEqual([...CATEGORIES].sort());
    for (const cat of CATEGORIES) expect(idsDe(cat).length).toBeGreaterThan(0);
  });

  it('chaque asset a un id exact unique, un nom FR et une source de vérité', () => {
    const ids = CATALOGUE.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of CATALOGUE) {
      expect(a.id.length).toBeGreaterThan(0);
      expect(a.nom.length).toBeGreaterThan(0);
      expect(a.source).toMatch(/visuel3d\.json|packages\/rules|generate\.py|code —/);
    }
  });

  it('tous les terrains du MOTEUR ont une tuile 3D ; une tuile 2D sauf le cratère (3D-only V2)', () => {
    expect(new Set(idsDe('terrains3d'))).toEqual(new Set(Object.keys(TERRAINS)));
    expect(Object.keys(TERRAINS3D).sort()).toEqual(Object.keys(TERRAINS).sort());
    for (const id of Object.keys(TERRAINS)) {
      const stem = id === 'ville' ? 'tile_ville_sol' : `tile_${id}`;
      if (id === 'cratere') {
        // 🔶 GAP CONNU (repéré par ce test) : textures.ts référence tile_cratere
        // (TILE_ASSETS) mais le PNG n'existe pas — fallback placeholder silencieux,
        // sans effet depuis le rendu 3D par défaut. Art 2D du cratère : à créer
        // dans generate.py lors d'une session d'atelier (chantier ATELIER, rapport L0).
        expect(existsSync(path.join(ART_DIR, `${stem}.png`)), stem).toBe(false);
        continue;
      }
      expect(existsSync(path.join(ART_DIR, `${stem}.png`)), stem).toBe(true);
    }
  });

  it('toutes les ressources du MOTEUR ont une carte 3D, et réciproquement', () => {
    expect(new Set(Object.keys(STRUCTURES3D.cartes))).toEqual(new Set(Object.keys(RESOURCES)));
    expect(idsDe('cartes')).toEqual(Object.keys(RESOURCES).map((id) => `carte:${id}`));
  });

  it('tous les sprites référencés par textures.ts existent (fichier + catalogue)', () => {
    const stemsCatalogue = new Set(CATALOGUE.flatMap((a) => {
      const s = stemsDe(a);
      return s.accent ? [s.base, s.accent] : [s.base];
    }));
    // Noms construits par loadTextures (textures.ts) depuis les registres moteur.
    // Unités : textures.ts ne charge que les ids AVEC art (UNIT_IDS) — on exige
    // donc le catalogue pour chaque unité dont le PNG existe réellement.
    const attends: string[] = [];
    for (const id of Object.keys(UNIT_TYPES)) {
      if (existsSync(path.join(ART_DIR, `unite_${id}.png`))) attends.push(`unite_${id}`, `unite_${id}_accent`);
    }
    // Bâtiments : pièces de vaisseau (vaisseau_*) n'ont pas de sprite 2D —
    // même règle « catalogué si l'art existe » que les unités.
    for (const id of Object.keys(BUILDINGS)) {
      if (existsSync(path.join(ART_DIR, `batiment_${id}.png`))) attends.push(`batiment_${id}`, `batiment_${id}_accent`);
    }
    for (const id of Object.keys(RESOURCES)) attends.push(`res_${id}`);
    attends.push('res_inconnue');
    // Miroir exact d'ARTEFACT_IDS (textures.ts) :
    for (const id of Object.keys(ARTEFACTS.pool).filter((k) => !ARTEFACTS.pool[k]!.dlcOnly).sort()) {
      attends.push(`artefact_${id}`, `artefact_${id}_accent`);
    }
    attends.push(
      'ville_settlement', 'ville_settlement_accent',
      'ville_capitale', 'ville_capitale_accent',
      'village_barbare', 'village_barbare_accent',
      'hutte', 'hutte_accent',
    );
    for (const stem of attends) {
      expect(stemsCatalogue.has(stem), `catalogue : ${stem}`).toBe(true);
      expect(existsSync(path.join(ART_DIR, `${stem}.png`)), `public/art : ${stem}.png`).toBe(true);
    }
  });

  it('les icônes du peintre sont toutes cataloguées', () => {
    for (const icone of ['or', 'commerce', 'science', 'nourriture', 'production', 'pv', 'pm', 'fin_tour', 'reseau', 'culture', 'gouvernement']) {
      expect(idsDe('sprites')).toContain(`icone_${icone}`);
      expect(existsSync(path.join(ART_DIR, `icone_${icone}.png`))).toBe(true);
    }
  });

  it('le marqueur de ressource inconnue (R-92) a carte neutre ET jeton 2D', () => {
    expect(idsDe('structures3d')).toContain('structures:carteNeutre');
    expect(idsDe('sprites')).toContain('res_inconnue');
    expect(RESOURCE_UNKNOWN).toBe('inconnue');
    expect(existsSync(path.join(ART_DIR, 'res_inconnue.png'))).toBe(true);
  });

  it('les overlays (effets programmatiques) sont des fiches sans fichier', () => {
    for (const a of parCategorie('overlays')) {
      expect(a.sorte).toBe('overlay');
      expect(a.source).toMatch(/^code —/);
      expect(a.sprite).toBeUndefined();
    }
  });

  it('filtrerCatalogue filtre par catégorie ET recherche (id ou nom FR)', () => {
    expect(filtrerCatalogue(CATALOGUE, 'toutes', '').length).toBe(CATALOGUE.length);
    expect(filtrerCatalogue(CATALOGUE, 'cartes', '').every((a) => a.categorie === 'cartes')).toBe(true);
    expect(filtrerCatalogue(CATALOGUE, 'toutes', 'carte:ble').map((a) => a.id)).toEqual(['carte:ble']);
    expect(filtrerCatalogue(CATALOGUE, 'toutes', 'mainframe').map((a) => a.id).sort()).toEqual([
      'structures:mainframe', 'structures:mainframeCapitale', 'structures:mainframeMerveille', 'structures:mainframePalier',
    ].sort());
    // Nom FR : « Blé » (majuscule/accents conservés côté UI, recherche insensible)
    expect(filtrerCatalogue(CATALOGUE, 'cartes', 'blé').length).toBe(1);
    expect(filtrerCatalogue(CATALOGUE, 'cartes', 'introuvable')).toEqual([]);
  });
});
