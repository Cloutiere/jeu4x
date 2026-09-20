/**
 * Tests de la palette officielle des accents (HANDOFF-ACCENTS-7-FACTIONS,
 * décision Erik 20/09) : schéma du fichier source unique (7 joueurs + barbare,
 * hex valides, teintes distinctes), mapping moteur (tonalité BASE, clé
 * « barbarien ») et suffixes des variantes cuites.
 */
import { describe, expect, it } from 'vitest';
import donnees from '../src/lib/render/accents.json';
import {
  FACTIONS,
  CLES_JOUEURS,
  CLE_BARBARE,
  LISTE_FACTIONS,
  PLAYER_COLORS,
  clePalette,
  couleurAccent,
  factionDe,
  hexEnNombre,
  suffixeCuit,
} from '../src/lib/render/accents.js';

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe('accents — palette officielle 7 factions + barbare', () => {
  it('porte exactement 7 joueurs (p1..p7) + le barbare', () => {
    expect(Object.keys(donnees.factions).sort()).toEqual([...CLES_JOUEURS, CLE_BARBARE].sort());
    expect(CLES_JOUEURS).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('chaque faction a des hex valides et 3 teintes distinctes (table Erik)', () => {
    for (const [cle, f] of Object.entries(FACTIONS)) {
      for (const ton of ['reflet', 'base', 'ombre'] as const) {
        expect(HEX_RE.test(f[ton]), `${cle}.${ton}=${f[ton]}`).toBe(true);
      }
      expect(new Set([f.reflet, f.base, f.ombre].map((h) => h.toLowerCase())).size, cle).toBe(3);
    }
  });

  it('reproduit la table canonique du handoff, réordonnée par Erik (20/09) — échantillon : J1, J4, J7, barbare', () => {
    expect(FACTIONS.p1).toEqual({ nom: 'Bleu Acier', reflet: '#567894', base: '#3B5B75', ombre: '#233B4E' });
    expect(FACTIONS.p4!.base).toBe('#44484E');
    expect(FACTIONS.p5!.base).toBe('#B84239');
    expect(FACTIONS.p7!.base).toBe('#8A3343');
    expect(FACTIONS.barbare).toEqual({ nom: 'Rouge Sang', reflet: '#DF424A', base: '#B81D24', ombre: '#7A0E13' });
  });

  it('les 8 bases sont deux à deux distinctes (factions lisibles entre elles)', () => {
    const bases = LISTE_FACTIONS.map((f) => f.base.toLowerCase());
    expect(new Set(bases).size).toBe(8);
  });

  it('couleurAccent donne la tonalité demandée (BASE par défaut, reflet/ombre utiles)', () => {
    expect(couleurAccent('p5')).toBe(0xb84239);
    expect(couleurAccent('p1', 'reflet')).toBe(0x567894);
    expect(couleurAccent('p1', 'ombre')).toBe(0x233b4e);
    // La clé moteur du camp barbare est « barbarien » (BARBARIAN_ID).
    expect(couleurAccent('barbarien')).toBe(0xb81d24);
    expect(factionDe('inconnu')).toEqual(FACTIONS.p1);
  });

  it('PLAYER_COLORS (table plate du moteur) = bases p1..p7 + barbarien', () => {
    expect(PLAYER_COLORS).toEqual({
      p1: 0x3b5b75,
      p2: 0xc98a32,
      p3: 0x4f7053,
      p4: 0x44484e,
      p5: 0xb84239,
      p6: 0x2d6a68,
      p7: 0x8a3343,
      barbarien: 0xb81d24,
    });
  });

  it('suffixeCuit : p1→j1 … p7→j7, barbare→barbare (stems import_svg)', () => {
    for (const cle of CLES_JOUEURS) expect(suffixeCuit(cle)).toBe(`j${cle.slice(1)}`);
    expect(suffixeCuit('barbare')).toBe('barbare');
    expect(clePalette('barbarien')).toBe('barbare');
    expect(hexEnNombre('#DF424A')).toBe(0xdf424a);
    expect(LISTE_FACTIONS).toHaveLength(8);
  });
});
