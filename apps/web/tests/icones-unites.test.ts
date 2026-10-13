/**
 * ICONES-UNITES · L1 — tests du module pur (décisions Erik 07/10) :
 * mapping type → icône data-driven (D4, guerrier = icône, les autres =
 * initiale), bannière (D1 : cercle unité → icône, bâtiment → initiale),
 * géométrie icône+barre (D2 : largeur totale ≤ barre historique), garnison
 * compacte (D3 : sprite masqué, icône+barre, pile ×N).
 */
import { describe, expect, it } from 'vitest';
import {
  ICONES_UNITES,
  iconeBannierePour,
  geometrieBarre,
  modeGarnison,
  nomIconeUnite,
  typeBaseIcone,
} from '../src/lib/render/icones-unites.js';
import { construireBanniere } from '../src/lib/render/bande-ville.js';

describe('mapping D4 — nomIconeUnite / typeBaseIcone', () => {
  it('guerrier → icone_unite_guerrier', () => {
    expect(nomIconeUnite('guerrier')).toBe('icone_unite_guerrier');
  });
  it('unité unique sans art : icône de l\'unité REMPLACÉE (alias R-148)', () => {
    expect(typeBaseIcone('guerrier_jaguar')).toBe('guerrier');
    expect(nomIconeUnite('guerrier_jaguar')).toBe('icone_unite_guerrier');
    expect(nomIconeUnite('hoplite')).toBe('icone_unite_piquier');
  });
  it('val (Japon, non implémenté) : suit le bombardier (replaces)', () => {
    expect(nomIconeUnite('val')).toBe('icone_unite_bombardier');
  });
  it('type sans alias : son propre nom', () => {
    expect(typeBaseIcone('archer')).toBe('archer');
    expect(nomIconeUnite('archer')).toBe('icone_unite_archer');
  });
});

describe('D1 — iconeBannierePour (cercle production)', () => {
  const dispo = ['icone_unite_guerrier'];
  it('unité AVEC art chargé → nom d\'icône', () => {
    expect(iconeBannierePour({ kind: 'unit', id: 'guerrier' }, dispo)).toBe('icone_unite_guerrier');
  });
  it('unité SANS art (les autres) → null = initiale en repli', () => {
    expect(iconeBannierePour({ kind: 'unit', id: 'archer' }, dispo)).toBeNull();
  });
  it('bâtiment → JAMAIS d\'icône (initiale), même si un nom coïncide', () => {
    expect(iconeBannierePour({ kind: 'building', id: 'grenier' }, dispo)).toBeNull();
  });
  it('unité unique → icône via alias quand l\'art de la base est chargé', () => {
    expect(iconeBannierePour({ kind: 'unit', id: 'guerrier_jaguar' }, dispo)).toBe('icone_unite_guerrier');
  });
});

describe('D1 — construireBanniere porte l\'icône (repli initiale intact)', () => {
  it('item unité avec icône : initiale ET iconeItem portés (le rendu choisit)', () => {
    const b = construireBanniere({ nom: 'V', pop: 2, capitale: false, mienne: true, croissance: 3, itemNom: 'Guerrier', eta: 4, itemIcone: 'icone_unite_guerrier' });
    expect(b.iconeItem).toBe('icone_unite_guerrier');
    expect(b.initiale).toBe('G');
  });
  it('item bâtiment : iconeItem null, initiale affichée', () => {
    const b = construireBanniere({ nom: 'V', pop: 2, capitale: false, mienne: true, croissance: 3, itemNom: 'Grenier', eta: 6 });
    expect(b.iconeItem).toBeNull();
    expect(b.initiale).toBe('G');
  });
  it('D3 — ville ennemie : icône JAMAIS affichée (même si candidate)', () => {
    const b = construireBanniere({ nom: 'E', pop: 1, capitale: false, mienne: false, croissance: null, itemNom: 'Guerrier', eta: 2, itemIcone: 'icone_unite_guerrier' });
    expect(b.iconeItem).toBeNull();
    expect(b.initiale).toBeNull();
  });
  it('D4 — file vide : ni icône ni initiale', () => {
    const b = construireBanniere({ nom: 'V', pop: 1, capitale: false, mienne: true, croissance: 2, itemNom: null, eta: null });
    expect(b.iconeItem).toBeNull();
    expect(b.initiale).toBeNull();
  });
});

describe('D2 — geometrieBarre (largeur totale ≤ barre historique)', () => {
  it('sans icône : géométrie historique EXACTE (fond 80 à x −40, intérieur 76, cellule 70/3)', () => {
    const g = geometrieBarre(false);
    expect(g.xCarre).toBe(-40);
    expect(g.xFond).toBe(-40);
    expect(g.largeurFond).toBe(80);
    expect(g.largeurInterieure).toBe(76);
    expect(g.xCellule).toBe(-38);
    expect(g.largeurCellule).toBeCloseTo(70 / 3);
  });
  it('avec icône : carré à gauche, barre APRÈS le carré, empreinte totale invariante', () => {
    const g = geometrieBarre(true);
    // empreinte horizontale invariante : carré (−40 → −20) + gap + barre = 80
    expect(g.xCarre).toBe(-40);
    expect(g.xFond).toBe(-18); // la barre commence APRÈS le carré (jamais dessus)
    expect(g.largeurFond).toBe(58);
    expect(ICONES_UNITES.coteCarre + ICONES_UNITES.gapCarreBarre + g.largeurFond).toBe(ICONES_UNITES.largeurTotale);
    expect(g.xCellule).toBe(-16);
    expect(g.largeurCellule).toBeGreaterThan(0);
    expect(g.largeurCellule).toBeLessThan(70 / 3); // la barre cède la place au carré
  });
});

describe('D3 — modeGarnison (ville compacte, pile ×N)', () => {
  const base = { ville: true, anim: false, modele3d: false, fondationArt: false, index: 0, total: 1 };
  it('unité seule en ville : compacte, visible, sans badge', () => {
    expect(modeGarnison(base)).toEqual({ actif: true, visible: true, badge: null });
  });
  it('pile de 3 : première unité = icône + « ×3 », les suivantes masquées', () => {
    expect(modeGarnison({ ...base, total: 3 })).toEqual({ actif: true, visible: true, badge: '×3' });
    expect(modeGarnison({ ...base, index: 1, total: 3 }).visible).toBe(false);
    expect(modeGarnison({ ...base, index: 2, total: 3 }).badge).toBeNull();
  });
  it('hors ville : sprite complet inchangé', () => {
    expect(modeGarnison({ ...base, ville: false })).toEqual({ actif: false, visible: true, badge: null });
  });
  it('anim de déplacement : jamais compacte en vol', () => {
    expect(modeGarnison({ ...base, anim: true }).actif).toBe(false);
  });
  it('modèle 3D / fondation : hors périmètre (rendus existants primant)', () => {
    expect(modeGarnison({ ...base, modele3d: true }).actif).toBe(false);
    expect(modeGarnison({ ...base, fondationArt: true }).actif).toBe(false);
  });
});
