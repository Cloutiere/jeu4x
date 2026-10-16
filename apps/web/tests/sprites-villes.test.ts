/**
 * ASSETS-VILLES-ERRES · L1 — tests du module pur (décisions Erik 15/10) :
 * mapping (type, ère) → sprite (D2 : ère du propriétaire), repli (D3),
 * clé de rebuild EraChanged, unicité des 8 entrées.
 */
import { describe, expect, it } from 'vitest';
import {
  ERRES_VILLE,
  cleSpriteVille,
  nomSpriteVille,
  REPLI_CAPITALE,
  REPLI_VILLE,
} from '../src/lib/render/sprites-villes.js';

describe('mapping D2 — nomSpriteVille (type × ère)', () => {
  it('les 4 ères de la ville → 4 stems settlement distincts', () => {
    expect(ERRES_VILLE.map((e) => nomSpriteVille(false, e))).toEqual([
      'ville_settlement_ancienne',
      'ville_settlement_medievale',
      'ville_settlement_industrielle',
      'ville_settlement_moderne',
    ]);
  });
  it('les 4 ères de la capitale → 4 stems capitale distincts', () => {
    expect(ERRES_VILLE.map((e) => nomSpriteVille(true, e))).toEqual([
      'ville_capitale_ancienne',
      'ville_capitale_medievale',
      'ville_capitale_industrielle',
      'ville_capitale_moderne',
    ]);
  });
  it('capitale vs ville : jamais le même stem à ère égale', () => {
    for (const e of ERRES_VILLE) {
      expect(nomSpriteVille(true, e)).not.toBe(nomSpriteVille(false, e));
    }
  });
});

describe('repli D3 — ère absente', () => {
  it('ère indéfinie → sprite actuel (27/09)', () => {
    expect(nomSpriteVille(false, undefined)).toBe(REPLI_VILLE);
    expect(nomSpriteVille(true, undefined)).toBe(REPLI_CAPITALE);
  });
  it('ère inconnue → sprite actuel (jamais de trou)', () => {
    expect(nomSpriteVille(false, 'galactique')).toBe(REPLI_VILLE);
    expect(nomSpriteVille(true, '')).toBe(REPLI_CAPITALE);
  });
});

describe('clé de rebuild D2 — cleSpriteVille', () => {
  it('distincte par ère (le changement d\'ère force un rebuild)', () => {
    const cles = ERRES_VILLE.map((e) => cleSpriteVille(false, e));
    expect(new Set(cles).size).toBe(4);
    expect(cles[0]).toContain('@ville_settlement_ancienne');
  });
  it('distincte capitale/ville à ère égale', () => {
    expect(cleSpriteVille(true, 'ancienne')).not.toBe(cleSpriteVille(false, 'ancienne'));
  });
  it('ère inconnue et undefined → MÊME clé (pas de rebuild inutile)', () => {
    expect(cleSpriteVille(false, 'zzz')).toBe(cleSpriteVille(false, undefined));
  });
});
