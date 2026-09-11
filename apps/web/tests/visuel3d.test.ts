/**
 * Tests de la spec visuelle 3D data-driven (chantier V1, L1b) : le JSON
 * `visuel3d.json` est validé au chargement par spec3d.ts — couverture des
 * terrains du moteur, calibrage 68f6f5a, cohérence des glyphes.
 */
import { describe, expect, it } from 'vitest';
import { TERRAINS3D, NEON, BAS, LONG_BUS, MATERIAU_DEFAUT, voiesBus, empreintesCpu, validerUniteGuerrier, ECLAIRAGE, validerEclairage } from '../src/lib/render3d/spec3d.js';
import visuelBrut from '../src/lib/render3d/visuel3d.json';

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

describe('rig d\u2019éclairage — §eclairage (handoff ECLAIRAGE)', () => {
  it('charge le rig candidat du JSON (ACES, ambiant baissé, clé remontée, IBL, néon conservé)', () => {
    expect(ECLAIRAGE.exposition).toBe(1.3);
    expect(ECLAIRAGE.toneMapping).toBe('aces');
    expect(ECLAIRAGE.hemispherique.intensite).toBeLessThan(0.95);
    expect(ECLAIRAGE.hemispherique.ciel).toBe(0x2c4a5a);
    expect(ECLAIRAGE.directionnelle.intensite).toBeGreaterThan(0.85);
    expect(ECLAIRAGE.directionnelle.position).toEqual([-4, 10, 2]);
    // accent néon conservé (langage du jeu) — même intensité que l'historique
    expect(ECLAIRAGE.haloNeon.intensite).toBe(0.45);
    expect(ECLAIRAGE.ibl.intensite).toBeGreaterThan(0);
  });

  it('section absente = rig HISTORIQUE (valeurs de référence du rig historique)', () => {
    // le contrat « absent = historique » est porté par spec3d.ts au chargement ;
    // on le vérifie via les valeurs historiques codées :
    expect(validerEclairage({
      exposition: 1,
      toneMapping: 'none',
      hemispherique: { intensite: 0.95, ciel: '#2C4A5A', sol: '#0A1420' },
      directionnelle: { intensite: 0.85, couleur: '#E8FFF6', position: [-5, 9, 3] },
      haloNeon: { intensite: 0.45, portee: 18, decay: 2 },
      ibl: { intensite: 0 },
    })).toEqual({
      exposition: 1,
      toneMapping: 'none',
      hemispherique: { intensite: 0.95, ciel: 0x2c4a5a, sol: 0x0a1420 },
      directionnelle: { intensite: 0.85, couleur: 0xe8fff6, position: [-5, 9, 3] },
      haloNeon: { intensite: 0.45, portee: 18, decay: 2 },
      ibl: { intensite: 0 },
    });
  });

  it('refuse les entrées invalides avec une erreur explicite', () => {
    const base = {
      exposition: 1.3,
      toneMapping: 'aces',
      hemispherique: { intensite: 0.6, ciel: '#2C4A5A', sol: '#0A1420' },
      directionnelle: { intensite: 1.6, couleur: '#E8FFF6', position: [-4, 10, 2] },
      haloNeon: { intensite: 0.45, portee: 18, decay: 2 },
      ibl: { intensite: 0.4 },
    };
    expect(() => validerEclairage({ ...base, exposition: 0 })).toThrow(/exposition/);
    expect(() => validerEclairage({ ...base, exposition: 99 })).toThrow(/exposition/);
    expect(() => validerEclairage({ ...base, hemispherique: { ...base.hemispherique, ciel: 'mint' } }))
      .toThrow(/couleur invalide/);
    expect(() => validerEclairage({ ...base, directionnelle: { ...base.directionnelle, position: [1, 2] } }))
      .toThrow(/vecteur/);
    expect(() => validerEclairage({ ...base, haloNeon: { ...base.haloNeon, portee: -3 } }))
      .toThrow(/négative/);
    expect(() => validerEclairage({ ...base, ibl: {} })).toThrow(/ibl\.intensite/);
    expect(() => validerEclairage({ ...base, toneMapping: 'filmique' })).toThrow(/toneMapping/);
  });
});

describe('gabarit humanoïde du Guerrier — chargeur strict (atelier GUERRIER-3D)', () => {
  const brut = structuredClone(
    (visuelBrut as { structures: { uniteGuerrier: Record<string, unknown> } }).structures.uniteGuerrier,
  );

  function retirer(obj: Record<string, unknown>, chemin: string[]): void {
    let c = obj;
    for (const k of chemin.slice(0, -1)) c = c[k] as Record<string, unknown>;
    delete c[chemin[chemin.length - 1]!];
  }

  it('accepte le spec livré : humanoïde complet (casque/visière, torse, bras, jambes, cœur, lame à fil)', () => {
    const spec = validerUniteGuerrier(brut);
    expect(spec.echelle).toBeGreaterThan(0);
    expect(spec.casque.visiere.hauteur).toBeGreaterThan(0);
    expect(spec.torse.plastron.largeur).toBeLessThan(spec.torse.largeur);
    expect(spec.arme.lame.fil.emissif).toBeGreaterThan(0);
    expect(spec.coeur.hauteurRelative).toBeGreaterThan(0);
  });

  it('refuse un spec INCOMPLET — champ manquant à n’importe quel niveau', () => {
    const chemins = [
      ['echelle'], ['couleurs', 'plaques'], ['materiau', 'opacite'], ['materiau', 'aretes'],
      ['casque'], ['casque', 'visiere'], ['casque', 'crete', 'largeur'],
      ['torse', 'plastron'], ['torse', 'abdomen', 'hauteur'],
      ['epaulieres'], ['bras', 'angleAvBras'], ['jambes', 'tibiaLongueur'],
      ['bottes'], ['coeur'], ['arme', 'lame', 'fil'], ['arme', 'garde'], ['arme', 'poignee'],
    ];
    for (const chemin of chemins) {
      const copie = structuredClone(brut);
      retirer(copie, chemin);
      expect(() => validerUniteGuerrier(copie), `sans ${chemin.join('.')}`).toThrow(/visuel3d\.json/);
    }
  });

  it('refuse les valeurs corrompues (couleur, dimension, fraction hors bornes)', () => {
    const couleurKo = structuredClone(brut) as { coeur: { couleur: string } };
    couleurKo.coeur.couleur = 'vert';
    expect(() => validerUniteGuerrier(couleurKo)).toThrow(/couleur/);

    const dimKo = structuredClone(brut) as { jambes: { epaisseur: number } };
    dimKo.jambes.epaisseur = -0.02;
    expect(() => validerUniteGuerrier(dimKo)).toThrow(/non positive/);

    const fracKo = structuredClone(brut) as { coeur: { hauteurRelative: number } };
    fracKo.coeur.hauteurRelative = 1.4;
    expect(() => validerUniteGuerrier(fracKo)).toThrow(/fraction/);

    const echelleKo = structuredClone(brut) as { echelle: number };
    echelleKo.echelle = 9;
    expect(() => validerUniteGuerrier(echelleKo)).toThrow(/echelle/);
  });
});
