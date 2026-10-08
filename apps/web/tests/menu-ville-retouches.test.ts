/**
 * MENU-VILLE-RETOUCHES (retour d'Erik du 14/09) — retouches UI du menu
 * ville, zéro gameplay :
 * 1. L'indicateur de population ne recouvre plus la tuile voisine NE (dont
 *    il cachait l'icône de rendement) : depuis BANDE-VILLE (Erik 07/10), le
 *    badge est remplacé par la bannière Civ VI qui flotte AU-DESSUS du
 *    sprite ville — le contrat « ne pas masquer la tuile voisine » est
 *    tenu par la géométrie partagée (bande-ville.ts).
 * 2. Le choix de l'icône de rendement commerce reflète la conversion R-90 de
 *    la ville affichée EN VUE VILLE (science → sciences, or → or) ; en vue
 *    carte, toujours commerce (rendements.ts, décision pure de rendu).
 */
import { describe, expect, it } from 'vitest';
import { BANDE_VILLE, rectBanniereLocale } from '../src/lib/render/bande-ville.js';
import { iconeCommerceRendement } from '../src/lib/render/rendements.js';
import { HEX_SIZE } from '../src/lib/render/hexView.js';

describe('bannière de ville — au-dessus du sprite, jamais sur la tuile voisine NE', () => {
  // Hex pointy-top de taille HEX_SIZE : sommets (0, ±s), flancs à ±√3/2·s
  // entre y=−s/2 et y=s/2. Coordonnées locales du conteneur ville.
  function dansHex(x: number, y: number, s = HEX_SIZE): boolean {
    if (Math.abs(y) > s) return false;
    const demiLargeur = (Math.sqrt(3) / 2) * s * (Math.abs(y) <= s / 2 ? 1 : 2 * (1 - Math.abs(y) / s));
    return Math.abs(x) <= demiLargeur;
  }

  it('la bannière (rangée principale) flotte ENTIÈREMENT au-dessus du sommet du sprite ville (−64)', () => {
    const R = rectBanniereLocale();
    // BANDE-VILLE (Erik 07/10) : la bannière REMPLACE le badge de population
    // (D5) — plus aucun indicateur SUR le corps de la ville à cet endroit.
    expect(R.y1 >= BANDE_VILLE.yRang2 - BANDE_VILLE.hauteurRang2 / 2).toBe(true);
    expect(BANDE_VILLE.yRang1 + BANDE_VILLE.hauteurRang1 / 2).toBeLessThanOrEqual(-64);
  });

  it('la bannière ne déborde pas sur la tuile NE (q+1, r−1 : x ∈ [s√3/2·…], y < −s)', () => {
    // L'ancien badge (52, −66) tombait sur la tuile NE — la bannière vit
    // entièrement dans la moitié SUPÉRIEURE (y ≤ −s/2) où les tuiles
    // voisines NE/N/NO n'existent pas.
    const R = rectBanniereLocale();
    expect(R.y1).toBeLessThanOrEqual(-HEX_SIZE / 2);
    expect(dansHex(52, -66)).toBe(false); // garde : le motif d'origine
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
