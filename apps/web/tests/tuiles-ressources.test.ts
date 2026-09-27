/**
 * TUILES-RESSOURCES (Erik 26/09, mission TUILES-RESSOURCES) : la table
 * data-driven des tuiles pleines par ressource — ids valides de
 * resources.json, art `tile_ressource_<id>`, sélection de texture pure
 * (révélée avec art → tuile-ressource ; inconnue/sans art → tuile de terrain).
 * Le cachage lui-même est moteur (R-92, filtrage — tests existants intacts) :
 * ici on ne teste QUE le rendu.
 */
import { describe, expect, it } from 'vitest';
import { RESOURCES, RESOURCE_UNKNOWN, TERRAINS } from '@game/rules';
import { TUILES_RESSOURCES, TUILES_CACHER, nomTuilePour } from '../src/lib/render/textures.js';

describe('TUILES-RESSOURCES — table data-driven (D1/D4)', () => {
  it('couvre les 22 ressources de resources.json (aluminium inclus — SVG fourni après rédaction du handoff)', () => {
    expect(Object.keys(TUILES_RESSOURCES).sort()).toEqual(Object.keys(RESOURCES).sort());
  });

  it('ne contient JAMAIS le marqueur « inconnue » (le cachage reste jeton)', () => {
    expect(RESOURCE_UNKNOWN in TUILES_RESSOURCES).toBe(false);
  });

  it('chaque entrée vise le PNG cuit tile_ressource_<id>', () => {
    for (const [id, art] of Object.entries(TUILES_RESSOURCES)) {
      expect(art, `art de ${id}`).toBe(`tile_ressource_${id}`);
    }
  });

  it('cohérence terrains : chaque ressource de la table spawn sur des terrains connus (D4 — l’art couvre TOUS ses terrains)', () => {
    for (const [id] of Object.entries(TUILES_RESSOURCES)) {
      const res = RESOURCES[id as keyof typeof RESOURCES];
      expect(res, `ressource ${id}`).toBeDefined();
      for (const t of res.terrains) {
        expect(TERRAINS[t as keyof typeof TERRAINS], `${id} sur ${t}`).toBeDefined();
      }
    }
  });
});

describe('TUILES-RESSOURCES — sélection de texture (nomTuilePour)', () => {
  it('ressource révélée avec art → tuile-ressource pleine', () => {
    expect(nomTuilePour('prairie', 'ble')).toBe('tile_ressource_ble');
    expect(nomTuilePour('montagne', 'or')).toBe('tile_ressource_or');
  });

  it('D4 : blé remplace la tuile sur TOUS ses terrains (art prairie seul, propre sol inclus)', () => {
    expect(nomTuilePour('prairie', 'ble')).toBe('tile_ressource_ble');
    expect(nomTuilePour('plaine', 'ble')).toBe('tile_ressource_ble');
  });

  it('vague 3 : ressource inconnue (avant tech) → variante « cacher » du terrain (brume)', () => {
    expect(nomTuilePour('prairie', RESOURCE_UNKNOWN)).toBe('tile_cacher_prairie');
    expect(nomTuilePour('eau', RESOURCE_UNKNOWN)).toBe('tile_cacher_eau');
  });

  it('TUILES_CACHER couvre les 7 terrains à ressources, pas l\'océan (aucune ressource n\'y spawn)', () => {
    expect(Object.keys(TUILES_CACHER).sort()).toEqual(['colline', 'desert', 'eau', 'foret', 'montagne', 'plaine', 'prairie']);
    for (const terrain of Object.keys(TUILES_CACHER) as Array<keyof typeof TUILES_CACHER>) {
      expect(TERRAINS[terrain], terrain).toBeDefined();
      expect(TUILES_CACHER[terrain]).toBe(`tile_cacher_${terrain === 'foret' ? 'foret' : terrain === 'eau' ? 'eau' : terrain}`);
    }
  });

  it('pas de ressource → tuile de terrain (affichage actuel)', () => {
    expect(nomTuilePour('colline', null)).toBe('tile_colline');
    expect(nomTuilePour('foret', null)).toBe('tile_foret');
  });
});
