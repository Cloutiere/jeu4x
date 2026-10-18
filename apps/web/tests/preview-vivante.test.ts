/**
 * PREVIEW-VIVANTE (décisions Erik 19/10) — préview de trajet au survol.
 *
 * L1 test-first : la préview vivante réutilise STRICTEMENT le calcul de la
 * préview maintenue (aucune règle nouvelle), le rendu passe par le bloc de
 * style D3 (calibrage sans code), le throttle D4 limite le recalcul à une
 * décision par frame et les exclusions D5 sont codées dans un prédicat pur.
 * Le rendu Pixi/Three n'est pas rejouable en vitest : le câblage est vérifié
 * sur la source (convention fleche-couche).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STYLE_PREVIEW_VIVANTE, coupeTourCourant, previewVivanteAutorisee } from '../src/lib/render/preview-vivante.js';

const SRC = resolve(import.meta.dirname, '../src/lib/render/GameCanvas.svelte');

describe('PREVIEW-VIVANTE — coupe tour courant / suite (D3)', () => {
  it('le tour courant porte les mp premières cases, la suite le reste', () => {
    const path = ['0,0', '1,0', '2,0', '3,0', '4,0'].map((k) => {
      const [q, r] = k.split(',').map(Number);
      return { q: q!, r: r! };
    });
    const { courant, reste } = coupeTourCourant(path, 2);
    expect(courant).toHaveLength(2);
    expect(reste).toHaveLength(3);
    expect(courant[courant.length - 1]).toEqual({ q: 1, r: 0 });
    expect(reste[0]).toEqual({ q: 2, r: 0 });
  });

  it('un chemin plus court que les PM reste intégralement au tour courant', () => {
    const path = [{ q: 1, r: 0 }];
    expect(coupeTourCourant(path, 3)).toEqual({ courant: path, reste: [] });
  });

  it('au moins UNE case au tour courant (un chemin affiché avance toujours)', () => {
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }];
    expect(coupeTourCourant(path, 0).courant).toHaveLength(1);
  });

  it('chemin vide = coupe vide', () => {
    expect(coupeTourCourant([], 2)).toEqual({ courant: [], reste: [] });
  });
});

describe('PREVIEW-VIVANTE — exclusions D5 (prédicat pur)', () => {
  const ok = { editable: true, playback: false, vueVille: false, uniteAmie: true };
  it('cas nominal autorisé', () => {
    expect(previewVivanteAutorisee(ok)).toBe(true);
  });
  it.each([
    ['relecture', { ...ok, playback: true }],
    ['vue ville', { ...ok, vueVille: true }],
    ['ordres non modifiables', { ...ok, editable: false }],
    ['unité ennemie sélectionnée', { ...ok, uniteAmie: false }],
  ])('%s → pas de préview vivante', (_nom, etat) => {
    expect(previewVivanteAutorisee(etat as typeof ok)).toBe(false);
  });
});

describe('PREVIEW-VIVANTE — bloc de style D3 (calibrage data-driven)', () => {
  it('toutes les dimensions du style sont paramétrées (aucun littéral éparillé)', () => {
    for (const cle of [
      'couleurTourCourant',
      'alphaTourCourant',
      'largeurTourCourant',
      'couleurSuite',
      'alphaSuite',
      'largeurSuite',
      'tiretSuite',
      'trouSuite',
      'couleurContour',
      'alphaContour',
      'surplusContour',
      'couleurPointe',
      'taillePointeCase',
      'taillePointeArrivee',
      'couleurBadge',
    ] as const) {
      expect(STYLE_PREVIEW_VIVANTE[cle]).toBeDefined();
    }
    expect(STYLE_PREVIEW_VIVANTE.largeurTourCourant).toBeGreaterThan(STYLE_PREVIEW_VIVANTE.largeurSuite);
  });
});

describe('PREVIEW-VIVANTE — câblage GameCanvas (L2)', () => {
  const src = readFileSync(SRC, 'utf8');

  it('la préview complète est dessinée au SURVOL (le gate droitMaintenu a disparu du dessin)', () => {
    // dessinerSurvol ne consulte plus droitMaintenu : même dessin survol vs
    // clic droit maintenu (D1) — la préview vivante EST la préview maintenue.
    expect(src).not.toMatch(/if \(droitMaintenu\)/);
    // Le relâchement confirme toujours l'ordre (D2 — geste inchangé).
    expect(src).toMatch(/droitTraite = true/);
  });

  it('le rendu passe par le bloc de style et la coupe tour courant (D3)', () => {
    expect(src).toMatch(/STYLE_PREVIEW_VIVANTE/);
    expect(src).toMatch(/coupeTourCourant\(hoverPath/);
  });

  it('throttle D4 : le pointermove planifie AU PLUS UN recalcul par frame (rAF)', () => {
    expect(src).toMatch(/survolPlanifie/);
    expect(src).toMatch(/requestAnimationFrame/);
  });

  it('les exclusions D5 passent par le prédicat pur (même source de vérité que le test)', () => {
    expect(src).toMatch(/previewVivanteAutorisee/);
  });

  it('MÊME calcul que la préview maintenue : un seul appel au cache de chemins (hoverCache.chemin)', () => {
    // Le survol et le maintien partagent recalculerSurvol — le chemin vient
    // du MÊME cache (BFS pathTo), aucune règle nouvelle côté survol.
    expect(src.match(/hoverCache\.chemin/g)?.length).toBe(1);
  });
});
