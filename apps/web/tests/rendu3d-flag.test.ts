import { describe, it, expect, afterEach } from 'vitest';
import { config, rendu3dAutorise, bascule3dAutorisee } from '../src/lib/config.js';

// Pivot du 11/09 (MISE-DE-COTE-3D) : le drapeau unique `config.rendu3d` coupe
// tout accès au 3D en jeu ; à true, le comportement historique est inchangé.
const sauvegarde = config.rendu3d;
afterEach(() => {
  config.rendu3d = sauvegarde;
});

describe('drapeau unique rendu3d', () => {
  it('est à false par défaut (3D mis de côté en production)', () => {
    expect(config.rendu3d).toBe(false);
  });

  describe('drapeau à false (production)', () => {
    it('la vue 3D est refusée quelle que soit la préférence locale', () => {
      config.rendu3d = false;
      expect(rendu3dAutorise(null)).toBe(false);
      expect(rendu3dAutorise(undefined)).toBe(false);
      expect(rendu3dAutorise('0')).toBe(false);
      // localStorage dit « 3D » (partie où la vue 3D avait été activée) : ignoré.
      expect(rendu3dAutorise('1')).toBe(false);
    });

    it('la bascule 2D↔3D est inerte', () => {
      config.rendu3d = false;
      expect(bascule3dAutorisee()).toBe(false);
    });
  });

  describe('drapeau à true (reprise 3D — non-régression)', () => {
    it('comportement historique : la préférence locale décide', () => {
      config.rendu3d = true;
      expect(rendu3dAutorise('1')).toBe(true);
      expect(rendu3dAutorise('0')).toBe(false);
      expect(rendu3dAutorise(null)).toBe(false);
      expect(rendu3dAutorise(undefined)).toBe(false);
    });

    it('la bascule 2D↔3D est active (bouton « 3D » rendu)', () => {
      config.rendu3d = true;
      expect(bascule3dAutorisee()).toBe(true);
    });
  });
});
