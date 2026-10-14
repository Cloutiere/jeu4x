import { describe, expect, it } from 'vitest';
import { arretsCanvas, CALIBRAGE_ZONE_CULTURELLE, profilAlpha } from '../src/lib/render/zone-culturelle.js';

/** L1 — profil d'alpha PUR du dégradé continu (HANDOFF-ZONE-CULTURELLE-DEGRADE). */
describe('ZONE-CULTURELLE-DEGRADE — profil d\'alpha', () => {
  it('respecte le dictionnaire de calibrage (valeurs dans leurs bornes)', () => {
    const c = CALIBRAGE_ZONE_CULTURELLE;
    expect(c.alphaExt).toBeGreaterThan(0);
    expect(c.alphaExt).toBeLessThanOrEqual(1);
    expect(c.alphaVoile).toBeGreaterThan(0);
    expect(c.alphaVoile).toBeLessThan(c.alphaExt);
    expect(c.porteePente).toBeGreaterThan(0);
    expect(c.porteePente).toBeLessThanOrEqual(1);
    expect(c.resolutionTexture).toBeGreaterThanOrEqual(64);
  });

  it('voile = valeur de fond EXACTE sous la pente (D2)', () => {
    const c = CALIBRAGE_ZONE_CULTURELLE;
    const deb = 1 - c.porteePente;
    for (let t = 0; t <= deb + 1e-9; t += 0.01) {
      expect(profilAlpha(t, c)).toBeCloseTo(c.alphaVoile, 12);
    }
  });

  it('alphaExt exact au bord extérieur (t = 1, au liseré)', () => {
    expect(profilAlpha(1, CALIBRAGE_ZONE_CULTURELLE)).toBeCloseTo(CALIBRAGE_ZONE_CULTURELLE.alphaExt, 12);
  });

  it('monotone croissant du centre vers le bord (décroissant vers l\'intérieur)', () => {
    let prev = -1;
    for (let t = 0; t <= 1 + 1e-9; t += 0.001) {
      const a = profilAlpha(t, CALIBRAGE_ZONE_CULTURELLE);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = a;
    }
  });

  it('continuité : pas de saut > epsilon entre pas voisins (D1 — aucune marche)', () => {
    const pas = 0.001;
    for (let t = 0; t < 1; t += pas) {
      const delta = profilAlpha(t + pas, CALIBRAGE_ZONE_CULTURELLE) - profilAlpha(t, CALIBRAGE_ZONE_CULTURELLE);
      expect(Math.abs(delta)).toBeLessThan(0.001);
    }
  });

  it('continuité aux RACCORDS de la pente (t = 1 − portee) : dérivée nulle (smoothstep)', () => {
    const c = CALIBRAGE_ZONE_CULTURELLE;
    const deb = 1 - c.porteePente;
    const e = 1e-4;
    // justes avant et après le raccord bas : la pente démarre plate
    expect(profilAlpha(deb + e, c) - profilAlpha(deb - e, c)).toBeLessThan(0.0005);
    // raccord haut (t = 1) : la pente arrive plate au liseré
    expect(profilAlpha(1, c) - profilAlpha(1 - e, c)).toBeLessThan(0.0005);
  });

  it('les arrêts canvas couvrent [0,1] et suivent le profil', () => {
    const arrets = arretsCanvas(CALIBRAGE_ZONE_CULTURELLE);
    expect(arrets[0]![0]).toBe(0);
    expect(arrets[arrets.length - 1]![0]).toBe(1);
    for (const [t, a] of arrets) {
      expect(a).toBeCloseTo(profilAlpha(t, CALIBRAGE_ZONE_CULTURELLE), 12);
    }
  });
});
