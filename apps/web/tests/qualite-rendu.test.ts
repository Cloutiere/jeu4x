/**
 * FULLSCREEN-PERF · L2 (c) — « Qualité de rendu » : plafond du DPR effectif.
 * 'auto' = statu quo PLEIN-ECRAN-NET (DPR suivi, borne 4) ; sinon le curseur
 * plafonne le DPR réel. Pur : dprEffectif / qualiteDepuisValeur.
 */
import { describe, expect, it } from 'vitest';
import { QUALITES, dprEffectif, qualiteDepuisValeur } from '../src/lib/qualiteRendu.js';

describe('dprEffectif (plafond Qualité de rendu)', () => {
  it('auto = PLEIN-ECRAN-NET : DPR réel suivi, borné à 4', () => {
    expect(dprEffectif('auto', 1)).toBe(1);
    expect(dprEffectif('auto', 1.5)).toBe(1.5);
    expect(dprEffectif('auto', 2)).toBe(2);
    expect(dprEffectif('auto', 3.2)).toBe(3.2);
    expect(dprEffectif('auto', 8)).toBe(4);
  });

  it('le curseur plafonne le DPR réel (et ne l\'augmente jamais)', () => {
    expect(dprEffectif(1, 2)).toBe(1);
    expect(dprEffectif(1.5, 2)).toBe(1.5);
    expect(dprEffectif(2, 2)).toBe(2);
    expect(dprEffectif(2, 1)).toBe(1);
    expect(dprEffectif(1.5, 0.75)).toBe(0.75);
  });

  it('dpr 0/indefini → 1 (défaut historique)', () => {
    expect(dprEffectif('auto', 0)).toBe(1);
    expect(dprEffectif(2, 0)).toBe(1);
  });
});

describe('qualiteDepuisValeur (attribut DOM / localStorage)', () => {
  it('accepte les valeurs du curseur', () => {
    expect(qualiteDepuisValeur('auto')).toBe('auto');
    expect(qualiteDepuisValeur('1')).toBe(1);
    expect(qualiteDepuisValeur('1.5')).toBe(1.5);
    expect(qualiteDepuisValeur('2')).toBe(2);
  });

  it('rejette l inconnu vers auto (jamais de valeur parasite persistée)', () => {
    expect(qualiteDepuisValeur('3')).toBe('auto');
    expect(qualiteDepuisValeur(null)).toBe('auto');
    expect(qualiteDepuisValeur('')).toBe('auto');
    expect(qualiteDepuisValeur('poubelle')).toBe('auto');
  });
});

describe('curseur', () => {
  it('les positions data-driven restent ordonnées de la plus fluide à la plus nette', () => {
    expect(QUALITES).toEqual(['auto', 1, 1.5, 2]);
  });
});
