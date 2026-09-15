/**
 * MENU-VILLE-RETOUCHES (retour d'Erik du 14/09) — deux retouches UI du menu
 * ville, zéro gameplay :
 * 1. Le badge de population est posé SUR la case de la ville (il ne déborde
 *    plus sur la tuile voisine NE dont il cachait l'icône de rendement).
 * 2. Le choix de l'icône de rendement commerce reflète la conversion R-90 de
 *    la ville affichée EN VUE VILLE (science → sciences, or → or) ; en vue
 *    carte, toujours commerce (rendements.ts, décision pure de rendu).
 */
import { describe, expect, it } from 'vitest';
import { BADGE_POPULATION } from '../src/lib/render/badge-population.js';
import { iconeCommerceRendement } from '../src/lib/render/rendements.js';
import { HEX_SIZE } from '../src/lib/render/hexView.js';

describe('badge de population — posé sur la case de la ville', () => {
  // Hex pointy-top de taille HEX_SIZE : sommets (0, ±s), flancs à ±√3/2·s
  // entre y=−s/2 et y=s/2. Coordonnées locales du conteneur ville.
  function dansHex(x: number, y: number, s = HEX_SIZE): boolean {
    if (Math.abs(y) > s) return false;
    const demiLargeur = (Math.sqrt(3) / 2) * s * (Math.abs(y) <= s / 2 ? 1 : 2 * (1 - Math.abs(y) / s));
    return Math.abs(x) <= demiLargeur;
  }

  it('le disque entier (contour compris) tient dans l\'hex de la ville', () => {
    const { x, y, rayon } = BADGE_POPULATION;
    const marge = BADGE_POPULATION.contour.largeur / 2 + 1;
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = (angle * Math.PI) / 180;
      expect(dansHex(x + Math.cos(rad) * (rayon + marge), y + Math.sin(rad) * (rayon + marge))).toBe(true);
    }
  });

  it('le badge n\'est plus décalé sur la tuile voisine (centré sur la case, pas de débord hors hex)', () => {
    // Retour d'Erik : l'ancienne position (52, −66) tombait sur la tuile NE.
    expect(BADGE_POPULATION.x).toBe(0);
    expect(Math.abs(BADGE_POPULATION.y)).toBeLessThan(HEX_SIZE);
  });
});

describe('icône de rendement commerce — reflet de la conversion R-90', () => {
  it('vue ville en conversion science → icône sciences', () => {
    expect(iconeCommerceRendement('science')).toBe('science');
  });

  it('vue ville en conversion or → icône or', () => {
    expect(iconeCommerceRendement('gold')).toBe('or');
  });

  it('vue carte du monde (hors rayon d\'une ville affichée) → toujours commerce', () => {
    expect(iconeCommerceRendement(null)).toBe('commerce');
  });
});
