/**
 * Tests de la spec visuelle 3D data-driven (chantier V1, L1b) : le JSON
 * `visuel3d.json` est validé au chargement par spec3d.ts — couverture des
 * terrains du moteur, calibrage 68f6f5a, cohérence des glyphes.
 */
import { describe, expect, it } from 'vitest';
import { TERRAINS3D, NEON, BAS, LONG_BUS, MATERIAU_DEFAUT, voiesBus, empreintesCpu } from '../src/lib/render3d/spec3d.js';

describe('visuel3d — spec data-driven', () => {
  it('couvre exactement les 10 ids de terrain du moteur', () => {
    expect(Object.keys(TERRAINS3D).sort()).toEqual(
      ['colline', 'cratere', 'desert', 'eau', 'foret', 'montagne', 'ocean', 'plaine', 'prairie', 'ville'].sort(),
    );
  });

  it('garde le calibrage 68f6f5a : désert sable délavé, mat quasi non émissif', () => {
    const desert = TERRAINS3D['desert']!;
    expect(desert.haut).toBe(0x8b8166);
    expect(desert.bas).toBe(0x4c4738);
    expect(desert.materiau).toEqual({ emissive: 0.12, roughness: 0.95, metalness: 0 });
  });

  it('applique la matière par défaut (« légère lueur ») aux autres terrains', () => {
    const prairie = TERRAINS3D['prairie']!;
    expect(prairie.materiau).toBeUndefined();
    expect(MATERIAU_DEFAUT).toEqual({ emissive: 0.45, roughness: 0.6, metalness: 0.12 });
  });

  it('respecte les élévations sémantiques (eau < base < colline < montagne)', () => {
    const eau = TERRAINS3D['eau']!.elev;
    const base = TERRAINS3D['prairie']!.elev;
    const colline = TERRAINS3D['colline']!.elev;
    const montagne = TERRAINS3D['montagne']!.elev;
    expect(eau).toBeLessThan(base);
    expect(base).toBe(0);
    expect(colline).toBeGreaterThan(base);
    expect(montagne).toBeGreaterThan(colline);
  });

  it('affiche le potentiel correct par terrain (plaine 3 bus — Grenier +2)', () => {
    expect(TERRAINS3D['prairie']!.glyphe).toEqual({ famille: 'bus', total: 2, actifs: 2 });
    expect(TERRAINS3D['plaine']!.glyphe).toEqual({ famille: 'bus', total: 3, actifs: 1 });
    expect(TERRAINS3D['montagne']!.glyphe).toEqual({ famille: 'cpu', total: 5, actifs: 1 });
    expect(TERRAINS3D['eau']!.glyphe).toEqual({ famille: 'ram', total: 2, actifs: 2 });
    expect(TERRAINS3D['eau']!.glypheSecond).toEqual({ famille: 'bus', total: 1, actifs: 0 });
  });

  it('laisse ville et cratère sans glyphes (structures, calque L2)', () => {
    expect(TERRAINS3D['ville']!.glyphe).toBeNull();
    expect(TERRAINS3D['cratere']!.glyphe).toBeNull();
  });

  it('garde les constantes du prototype (néon unique, dessous, longueur de bus)', () => {
    expect(NEON).toBe(0x3dffce);
    expect(BAS).toBe(-0.85);
    expect(LONG_BUS).toBe(1.6);
    expect(voiesBus(2)).toEqual([-0.25, 0.25]);
    // quincunx écarté à ±0.30 (calibrage 68f6f5a)
    expect(empreintesCpu(5)).toContainEqual([-0.3, -0.3]);
  });
});
