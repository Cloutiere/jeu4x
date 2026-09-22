import { describe, expect, it } from 'vitest';
import { computeLetterbox } from '../src/letterbox';

describe('computeLetterbox — ratio de la base 16:9 (1280×720)', () => {
  it('écran 16:9 : plein cadre, aucune bande, échelle = rapport exact', () => {
    const lb = computeLetterbox({ width: 1920, height: 1080 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(1.5);
    expect(lb.rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(lb.bandeGauche).toBe(0);
    expect(lb.bandeHaut).toBe(0);
  });

  it('écran 16:9 plus grand : mise à l\'échelle maximale (2560×1440 → ×2)', () => {
    const lb = computeLetterbox({ width: 2560, height: 1440 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(2);
    expect(lb.rect).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
  });

  it('écran 16:10 (1920×1200) : bandes noires en haut/bas, jamais d\'étirement', () => {
    const lb = computeLetterbox({ width: 1920, height: 1200 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(1.5); // limité par la largeur
    expect(lb.rect).toEqual({ x: 0, y: 60, width: 1920, height: 1080 });
    expect(lb.bandeHaut).toBe(60);
    expect(lb.rect.y + lb.rect.height).toBeLessThanOrEqual(1200);
  });

  it('écran 21:9 (2560×1080) : bandes noires à gauche/droite', () => {
    const lb = computeLetterbox({ width: 2560, height: 1080 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(1.5); // limité par la hauteur
    expect(lb.rect).toEqual({ x: 320, y: 0, width: 1920, height: 1080 });
    expect(lb.bandeGauche).toBe(320);
  });

  it('écran portrait (720×1280) : contenu réduit, centré, ratio préservé', () => {
    const lb = computeLetterbox({ width: 720, height: 1280 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBeCloseTo(720 / 1280, 12);
    expect(lb.rect.width).toBe(720);
    expect(lb.rect.height).toBe(Math.floor(720 * (720 / 1280))); // 405
    expect(lb.rect.x).toBe(0);
    expect(lb.rect.y).toBe(Math.floor((1280 - 405) / 2));
  });

  it('contenant plus petit que la base : échelle < 1, contenu entier visible', () => {
    const lb = computeLetterbox({ width: 800, height: 600 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(800 / 1280); // limité par la largeur
    expect(lb.rect.width).toBeLessThanOrEqual(800);
    expect(lb.rect.height).toBeLessThanOrEqual(600);
    expect(lb.rect.x + lb.rect.width).toBeLessThanOrEqual(800);
    expect(lb.rect.y + lb.rect.height).toBeLessThanOrEqual(600);
  });

  it('arrondis : le rect ne dépasse jamais le contenant (dimensions impaires)', () => {
    const lb = computeLetterbox({ width: 1367, height: 769 }, { largeur: 1280, hauteur: 720 });
    expect(lb.rect.width).toBeLessThanOrEqual(1367);
    expect(lb.rect.height).toBeLessThanOrEqual(769);
    expect(lb.rect.x + lb.rect.width).toBeLessThanOrEqual(1367);
    expect(lb.rect.y + lb.rect.height).toBeLessThanOrEqual(769);
    expect(lb.rect.x).toBe(Math.floor((1367 - lb.rect.width) / 2));
  });
});

describe('computeLetterbox — base FENETRE-GRANDE 16:9 (1920×1080)', () => {
  it('écran 16:9 de la taille de la base : plein cadre, aucune bande', () => {
    const lb = computeLetterbox({ width: 1920, height: 1080 }, { largeur: 1920, hauteur: 1080 });
    expect(lb.echelle).toBe(1);
    expect(lb.rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(lb.bandeGauche).toBe(0);
    expect(lb.bandeHaut).toBe(0);
  });

  it('écran 16:9 plus grand (2560×1440 → ×4/3), aucune bande', () => {
    const lb = computeLetterbox({ width: 2560, height: 1440 }, { largeur: 1920, hauteur: 1080 });
    expect(lb.echelle).toBe(2560 / 1920);
    expect(lb.rect).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
  });

  it('écran 16:10 (1920×1200) : bandes 60 px haut/bas, ratio préservé', () => {
    const lb = computeLetterbox({ width: 1920, height: 1200 }, { largeur: 1920, hauteur: 1080 });
    expect(lb.echelle).toBe(1); // limité par la largeur
    expect(lb.rect).toEqual({ x: 0, y: 60, width: 1920, height: 1080 });
    expect(lb.bandeHaut).toBe(60);
  });

  it('ancienne base 1280×720 toujours exprimable (échelle ×1,5 sur écran 1920×1080)', () => {
    const lb = computeLetterbox({ width: 1920, height: 1080 }, { largeur: 1280, hauteur: 720 });
    expect(lb.echelle).toBe(1.5);
    expect(lb.rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
