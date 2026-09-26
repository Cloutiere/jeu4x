/**
 * LOBBY-5 · D5 — la palette CHOISIE par chaque joueur pilote l'accent en jeu.
 * Sans override (labos, parties anciennes) : défaut par index de siège.
 * ASSETS-6COULEURS (26/09) : 6 palettes actives — violet/cyan retirées,
 * repli Ardoise (D6).
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

  it('p6/p7 (parties anciennes) : repli Ardoise (D6)', () => {
    expect(ORDRE_JOUEURS4).toHaveLength(6);
    expect(paletteDe('p6')).toBe('ardoise');
    expect(paletteDe('p7')).toBe('ardoise');
    expect(PLAYER_COLORS.p6).toBe(hexEnNombre(FACTIONS4['ardoise']!.base));
    expect(PLAYER_COLORS.p7).toBe(hexEnNombre(FACTIONS4['ardoise']!.base));
  });

  it('override par partie : la palette choisie remplace l\'index de siège', () => {
    definirPalettesJoueurs({ p1: 'ardoise', p2: 'jaune-dor' });
    expect(paletteDe('p1')).toBe('ardoise');
    expect(playerColor('p1')).toBe(hexEnNombre(FACTIONS4['ardoise']!.base));
    expect(playerColor('p2')).toBe(hexEnNombre(FACTIONS4['jaune-dor']!.base));
    // Sièges sans choix : défaut inchangé.
    expect(paletteDe('p3')).toBe(ORDRE_JOUEURS4[2]);
  });

  it('réinitialisation (null) → défaut par siège', () => {
    definirPalettesJoueurs({ p1: 'ardoise' });
    definirPalettesJoueurs(null);
    expect(playerColor('p1')).toBe(PLAYER_COLORS.p1);
  });

  it('REPLI D6 : un override vers une palette RETIRÉE (violet/cyan) tombe sur Ardoise', () => {
    definirPalettesJoueurs({ p1: 'violet-amethyste', p2: 'cyan-celeste' });
    expect(paletteDe('p1')).toBe('ardoise');
    expect(paletteDe('p2')).toBe('ardoise');
    expect(playerColor('p1')).toBe(hexEnNombre(FACTIONS4['ardoise']!.base));
  });

  it('playerColor est DYNAMIQUE (consommateurs : barres PV, anneaux, frontières)', () => {
    const avant = playerColor('p1');
    definirPalettesJoueurs({ p1: 'cuivre-ardent' });
    expect(playerColor('p1')).not.toBe(avant);
    expect(playerColor('p1')).toBe(hexEnNombre(FACTIONS4['cuivre-ardent']!.base));
  });

  it('suffixeCuitPalette : paletteId → jN selon ordre_joueurs4', () => {
    expect(suffixeCuitPalette(ORDRE_JOUEURS4[0]!)).toBe('j1');
    expect(suffixeCuitPalette(ORDRE_JOUEURS4[5]!)).toBe('j6');
    expect(suffixeCuitPalette('inconnue')).toBe('j1'); // repli sûr
    // Palette retirée : repli avant résolution (ardoise → j6).
    expect(suffixeCuitPalette('cyan-celeste')).toBe('j6');
  });

  it('couleurBaseJoueur et PLAYER_COLORS : mêmes bases 4 tons', () => {
    expect(couleurBaseJoueur('p2')).toBe(PLAYER_COLORS.p2);
  });
});
