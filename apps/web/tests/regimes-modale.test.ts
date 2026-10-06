/**
 * REGIMES-MODALE (handoff 05/10, D1-D5) — logique pure côté client :
 * détection « tech de régime complétée cette tour », états des 6 régimes dans
 * la modale, refus pendant l'anarchie, badge du panneau, mapping icônes
 * (Despotisme = repli générique). R-122 intouchée (moteur non importé ici
 * au-delà des helpers purs déjà testés dans rules).
 */
import { describe, expect, it } from 'vitest';
import type { Player } from '@game/rules';
import {
  fenetreRegimeActive,
  iconeRegime,
  lignesRegimes,
  refusAnarchie,
  regimesDebloquesCeTour,
} from '../src/lib/regimesModale.js';

function joueur(partiel: Partial<Player>): Player {
  return {
    id: 'p1',
    civId: 'rome',
    era: 'ancienne',
    techsUnlocked: [],
    techsUnlockedThisTurn: [],
    government: 'despotisme',
    culturePaliers: 0,
    ...partiel,
  } as unknown as Player;
}

describe('regimes-modale — détection fenêtre R-122', () => {
  it('une tech de régime complétée ce tour ouvre la fenêtre', () => {
    const p = joueur({ techsUnlockedThisTurn: ['monarchie'] });
    expect(regimesDebloquesCeTour(p)).toEqual(['monarchie']);
    expect(fenetreRegimeActive(p)).toBe(true);
  });

  it('une tech non-gouvernement complétée ce tour n’ouvre rien', () => {
    const p = joueur({ techsUnlockedThisTurn: ['alphabet'] });
    expect(regimesDebloquesCeTour(p)).toEqual([]);
    expect(fenetreRegimeActive(p)).toBe(false);
  });

  it('la complétion d’un tour PRÉCÉDENT (liste vide) ne compte plus', () => {
    const p = joueur({ techsUnlocked: ['monarchie'], techsUnlockedThisTurn: [] });
    expect(fenetreRegimeActive(p)).toBe(false);
  });
});

describe('regimes-modale — états des 6 régimes (D1)', () => {
  it('6 lignes, ordre governments.json, régimes verrouillés sans tech', () => {
    const lignes = lignesRegimes(joueur(), { hasPyramid: false, turn: 5 });
    expect(lignes).toHaveLength(6);
    expect(lignes.map((l) => l.etat)).toEqual([
      'actif', // despotisme par défaut
      'verrouille',
      'verrouille',
      'verrouille',
      'verrouille',
      'verrouille',
    ]);
  });

  it('le régime fraîchement débloqué est GRATUIT (surlignage or, sans anarchie)', () => {
    const p = joueur({ techsUnlocked: ['monarchie'], techsUnlockedThisTurn: ['monarchie'] });
    const monarchie = lignesRegimes(p, { hasPyramid: false, turn: 5 }).find((l) => l.id === 'monarchie')!;
    expect(monarchie.etat).toBe('gratuit');
    expect(monarchie.coutAnarchie).toBeNull();
    // Une autre tech payante complétée plus tôt reste PAYANTE.
    const republique = lignesRegimes(p, { hasPyramid: false, turn: 5 }).find((l) => l.id === 'republique')!;
    expect(republique.etat).toBe('verrouille');
  });

  it('tech débloquée hors fenêtre → PAYANT avec coût affiché', () => {
    const p = joueur({ techsUnlocked: ['monarchie'], techsUnlockedThisTurn: [] });
    const monarchie = lignesRegimes(p, { hasPyramid: false, turn: 5 }).find((l) => l.id === 'monarchie')!;
    expect(monarchie.etat).toBe('payant');
    expect(monarchie.coutAnarchie).toBe('Coût : 1 tour d’anarchie');
  });

  it('D4 · immunité anarchie (R-149) : JAMAIS de coût affiché', () => {
    const p = joueur({ techsUnlocked: ['monarchie', 'democratie'], civId: 'chine', era: 'moderne' });
    const monarchie = lignesRegimes(p, { hasPyramid: false, turn: 5 }).find((l) => l.id === 'monarchie')!;
    expect(monarchie.etat).toBe('gratuit');
    expect(monarchie.coutAnarchie).toBeNull();
    expect(monarchie.immunite).toBe(true);
  });

  it('régime actif marqué, même si sa tech est fraîche', () => {
    const p = joueur({
      government: 'monarchie',
      techsUnlocked: ['monarchie'],
      techsUnlockedThisTurn: ['monarchie'],
    });
    const monarchie = lignesRegimes(p, { hasPyramid: false, turn: 5 }).find((l) => l.id === 'monarchie')!;
    expect(monarchie.etat).toBe('actif');
  });

  it('sans joueur (chargement) : fenêtre fermée, aucune ligne', () => {
    expect(fenetreRegimeActive(null)).toBe(false);
    expect(lignesRegimes(null, { hasPyramid: false, turn: 1 })).toEqual([]);
  });
});

describe('regimes-modale — refus pendant l’anarchie (D2)', () => {
  it('anarchie en cours → message de refus', () => {
    const p = joueur({ anarchyUntil: 6 });
    expect(refusAnarchie(p, 5)).toContain('Anarchie');
  });

  it('hors anarchie → aucun refus', () => {
    expect(refusAnarchie(joueur({ anarchyUntil: null }), 5)).toBeNull();
    expect(refusAnarchie(joueur({ anarchyUntil: 5 }), 5)).toBeNull();
  });
});

describe('regimes-modale — icônes (D5)', () => {
  it('Despotisme = repli générique or (icone_gouvernement)', () => {
    expect(iconeRegime('despotisme')).toBe('/art/icone_gouvernement.png');
  });

  it('les 5 autres régimes mappent l’image cuite TECHTREE de leur tech', () => {
    expect(iconeRegime('monarchie')).toBe('/art/techtree/tech_monarchie.jpg');
    expect(iconeRegime('republique')).toBe('/art/techtree/tech_code_des_lois.jpg');
    expect(iconeRegime('democratie')).toBe('/art/techtree/tech_democratie.jpg');
    expect(iconeRegime('communisme')).toBe('/art/techtree/tech_communisme.jpg');
    expect(iconeRegime('fondamentalisme')).toBe('/art/techtree/tech_religion.jpg');
  });

  it('régime inconnu → repli générique (jamais l’icône science)', () => {
    expect(iconeRegime('inconnu')).toBe('/art/icone_gouvernement.png');
  });
});
