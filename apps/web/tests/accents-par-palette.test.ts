/**
 * LOBBY-5 · D5 — la palette CHOISIE par chaque joueur pilote l'accent en jeu.
 * Sans override (labos, parties anciennes) : défaut par index de siège.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { FACTIONS4, ORDRE_JOUEURS4, definirPalettesJoueurs, paletteDe, couleurBaseJoueur, suffixeCuitPalette, PLAYER_COLORS } from '../src/lib/render/accents.js';
import { playerColor } from '../src/lib/render/textures.js';

const hexEnNombre = (hex: string): number => parseInt(hex.slice(1), 16);

afterEach(() => {
  definirPalettesJoueurs(null);
});

describe('LOBBY-5 · accents par paletteId', () => {
  it('défaut : p1..p5 suivent ordre_joueurs4 (comportement historique)', () => {
    expect(paletteDe('p1')).toBe(ORDRE_JOUEURS4[0]);
    expect(paletteDe('p2')).toBe(ORDRE_JOUEURS4[1]);
    expect(paletteDe('p5')).toBe(ORDRE_JOUEURS4[4]);
    expect(paletteDe('barbarien')).toBe('rouge-royal');
  });

  it('override par partie : la palette choisie remplace l\'index de siège', () => {
    definirPalettesJoueurs({ p1: 'cyan-celeste', p2: 'jaune-dor' });
    expect(paletteDe('p1')).toBe('cyan-celeste');
    expect(playerColor('p1')).toBe(hexEnNombre(FACTIONS4['cyan-celeste']!.base));
    expect(playerColor('p2')).toBe(hexEnNombre(FACTIONS4['jaune-dor']!.base));
    // Sièges sans choix : défaut inchangé.
    expect(paletteDe('p3')).toBe(ORDRE_JOUEURS4[2]);
  });

  it('réinitialisation (null) → défaut par siège', () => {
    definirPalettesJoueurs({ p1: 'cyan-celeste' });
    definirPalettesJoueurs(null);
    expect(playerColor('p1')).toBe(PLAYER_COLORS.p1);
  });

  it('playerColor est DYNAMIQUE (consommateurs : barres PV, anneaux, frontières)', () => {
    const avant = playerColor('p1');
    definirPalettesJoueurs({ p1: 'violet-amethyste' });
    expect(playerColor('p1')).not.toBe(avant);
    expect(playerColor('p1')).toBe(hexEnNombre(FACTIONS4['violet-amethyste']!.base));
  });

  it('suffixeCuitPalette : paletteId → jN selon ordre_joueurs4', () => {
    expect(suffixeCuitPalette(ORDRE_JOUEURS4[0]!)).toBe('j1');
    expect(suffixeCuitPalette(ORDRE_JOUEURS4[6]!)).toBe('j7');
    expect(suffixeCuitPalette('inconnue')).toBe('j1'); // repli sûr
  });

  it('couleurBaseJoueur et PLAYER_COLORS : mêmes bases 4 tons', () => {
    expect(couleurBaseJoueur('p2')).toBe(PLAYER_COLORS.p2);
  });
});
