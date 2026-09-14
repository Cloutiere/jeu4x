/**
 * COLON-FONDATION (chantier 2D, décisions Erik 13/09) — décision PURE de
 * rendu de l'état « en train de fonder » (le rendu Pixi n'est pas rejouable
 * en vitest — même split que correctifs-selection) :
 *   M2.1 état fondation — art data-driven `colonFondation`, badge provisoire
 *        tant que le PNG est absent, bascule à l'annulation (fondateurs vide) ;
 *   M2.3 interactions intactes — le badge ne touche ni le picking ni les
 *        autres unités (guerrier jamais actif).
 */
import { describe, expect, it } from 'vitest';
import { etatFondationColon, BADGE_FONDATION } from '../src/lib/render/fondation.js';

const COLON = { type: 'colon', unitId: 'col', fondateurs: new Set(['col']), artPresent: false, modele3d: false };

describe('etatFondationColon · M2 (état « en train de fonder »)', () => {
  it('ordre posé, art absent → badge provisoire seul (le sprite de base reste)', () => {
    expect(etatFondationColon(COLON)).toEqual({ actif: true, art: false, badge: true });
  });

  it('art `unite_colonFondation` présent → art seul, badge éteint (sans changement de code)', () => {
    expect(etatFondationColon({ ...COLON, artPresent: true })).toEqual({ actif: true, art: true, badge: false });
  });

  it('annulation / consommation (fondateurs vide) → tout éteint, aucun état résiduel', () => {
    const eteint = { type: 'colon', unitId: 'col', fondateurs: new Set<string>(), artPresent: false, modele3d: false };
    expect(etatFondationColon(eteint)).toEqual({ actif: false, art: false, badge: false });
    expect(etatFondationColon({ ...eteint, artPresent: true })).toEqual({ actif: false, art: false, badge: false });
  });

  it('une autre unité (guerrier) ne bascule jamais — seul le Colon à action finale foundCity change', () => {
    expect(etatFondationColon({ ...COLON, type: 'guerrier' }).actif).toBe(false);
    expect(etatFondationColon({ ...COLON, unitId: 'autre' }).actif).toBe(false);
  });

  it('en 3D avec modèle, l\'art 2D se cache (badge conservé si l\'art 2D manque)', () => {
    expect(etatFondationColon({ ...COLON, artPresent: true, modele3d: true })).toEqual({ actif: true, art: false, badge: false });
    expect(etatFondationColon({ ...COLON, modele3d: true })).toEqual({ actif: true, art: false, badge: true });
  });

  it('constantes 🔶 du badge : au-dessus de l\'écu de fortification (-178), hors du picking sprite', () => {
    expect(Math.min(...BADGE_FONDATION.losange.map(([, y]) => y))).toBeLessThan(-178);
    expect(BADGE_FONDATION.losange).toHaveLength(4);
  });
});
