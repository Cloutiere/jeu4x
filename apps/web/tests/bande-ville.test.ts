/**
 * BANDE-VILLE · L1 — tests du constructeur de bannière (décisions Erik 07/10).
 * Pure function : données de ville → segments affichés (nom, pop, capitale,
 * croissance si mien, item+ETA si mien, RIEN si fog ennemi — D3) + fallback
 * initiale + file vide masquée (D4). Les calculs de rendement sont des
 * MIROIRS des formules d'affichage de PanneauVille (yields, prodPerTurn,
 * growthEta, etas[0]) — mêmes sources de vérité moteur (@game/rules,
 * coutItem), zéro donnée nouvelle.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS, growthThresholdFor, makeState, tileKey, unitType } from '@game/rules';
import type { GameState } from '@game/rules';
import {
  BANDE_VILLE,
  construireBanniere,
  etaProductionBanniere,
  initialeDe,
  rectBanniereLocale,
  rendementsVille,
  toursCroissanceBanniere,
} from '../src/lib/render/bande-ville.js';

/** État : cA (p1, capitale, pop 2, 1 prairie travaillée, 6 nourriture) et
 *  cB (p2, ennemie — production nourrie dans l'état, getFilteredState garde
 *  les villes visibles entières : le masquage est un choix d'AFFICHAGE). */
function etatAvecVilles(): GameState {
  return makeState({
    width: 8,
    height: 8,
    cities: [
      { id: 'cA', owner: 'p1', q: 2, r: 1, pop: 2, capital: true, foodStored: 6, workedTiles: [tileKey(2, 0)] },
      {
        id: 'cB',
        owner: 'p2',
        q: 5,
        r: 1,
        pop: 1,
        foodStored: 9,
        production: { item: { kind: 'unit', id: 'guerrier' }, progress: 3 },
      },
    ],
  });
}

describe('initialeDe (fallback initiale — D1)', () => {
  it('première lettre du NOM, majuscule', () => {
    expect(initialeDe('Granary')).toBe('G');
    expect(initialeDe('grenier')).toBe('G');
  });
  it('accents : premier graphème, pas le premier octet', () => {
    expect(initialeDe('Écurie')).toBe('É');
    expect(initialeDe('école')).toBe('É');
  });
  it('nom vide : repli honnête (chaîne vide, jamais un crash)', () => {
    expect(initialeDe('')).toBe('');
    expect(initialeDe('   ')).toBe('');
  });
});

describe('construireBanniere (segments D1-D4)', () => {
  it('ville à moi : segments complets — nom, pop, capitale (D2), croissance, initiale, ETA', () => {
    const b = construireBanniere({ nom: 'Ville 1', pop: 3, capitale: true, mienne: true, croissance: 4, itemNom: 'Grenier', eta: 6 });
    expect(b).toEqual({ nom: 'Ville 1', pop: 3, capitale: true, croissance: 4, initiale: 'G', eta: 6 });
  });
  it('D3 — ville ENNEMIE : croissance/item/ETA JAMAIS affichés même si les candidats existent (getFilteredState garde les villes visibles entières)', () => {
    const b = construireBanniere({ nom: 'Ville 2', pop: 5, capitale: false, mienne: false, croissance: 2, itemNom: 'Guerrier', eta: 1 });
    expect(b).toEqual({ nom: 'Ville 2', pop: 5, capitale: false, croissance: null, initiale: null, eta: null });
  });
  it('D3 — nom, pop et capitale restent publics pour une ville ennemie', () => {
    const b = construireBanniere({ nom: 'Thèbes', pop: 7, capitale: true, mienne: false, croissance: null, itemNom: null, eta: null });
    expect(b.nom).toBe('Thèbes');
    expect(b.pop).toBe(7);
    expect(b.capitale).toBe(true);
  });
  it('D4 — file vide (itemNom null) : cercle production + ETA masqués, croissance inchangée', () => {
    const b = construireBanniere({ nom: 'V', pop: 1, capitale: false, mienne: true, croissance: 3, itemNom: null, eta: null });
    expect(b.croissance).toBe(3);
    expect(b.initiale).toBeNull();
    expect(b.eta).toBeNull();
  });
  it("item sans ETA mesurable (à l'arrêt) : initiale affichée, ETA masqué (pas de zéro)", () => {
    const b = construireBanniere({ nom: 'V', pop: 1, capitale: false, mienne: true, croissance: 3, itemNom: 'Grenier', eta: null });
    expect(b.initiale).toBe('G');
    expect(b.eta).toBeNull();
  });
});

describe('toursCroissanceBanniere (miroir growthEta de PanneauVille)', () => {
  it('cas normal : ceil((seuil − réserve) / surplus)', () => {
    const st = etatAvecVilles();
    const cA = st.cities.cA!; // pop 2 → seuil 20, réserve 6
    expect(toursCroissanceBanniere(cA, 2)).toBe(Math.ceil((20 - 6) / 2));
  });
  it('surplus nul : Infinity (Erik 10/10 — la croissance n’arrivera jamais, rendu « ∞ »)', () => {
    const st = etatAvecVilles();
    expect(toursCroissanceBanniere(st.cities.cA!, 0)).toBe(Infinity);
  });
  it('réserve déjà au seuil : null (miroir du panneau — croissance à la prochaine résolution)', () => {
    const st = etatAvecVilles();
    const pleine = { ...st.cities.cA!, foodStored: 20 };
    expect(toursCroissanceBanniere(pleine, 2)).toBeNull();
  });
  it('plafond de population (31) : Infinity (plus jamais de croissance — Erik 10/10)', () => {
    const st = etatAvecVilles();
    const plafond = { ...st.cities.cA!, pop: 31 };
    expect(toursCroissanceBanniere(plafond, 2)).toBe(Infinity);
  });
  it('réduction Aqueduc lue des bâtiments (miroir growthReduction du panneau)', () => {
    const st = etatAvecVilles();
    const avecAqueduc = { ...st.cities.cA!, buildings: ['aqueduc'] };
    const seuil = growthThresholdFor(2, BUILDINGS.aqueduc!.growthThresholdReduction ?? 0)!;
    expect(toursCroissanceBanniere(avecAqueduc, 2)).toBe(Math.ceil((seuil - 6) / 2));
  });
});

describe('etaProductionBanniere (miroir etas[0] de PanneauVille)', () => {
  it('cas normal : ceil((coût − progression) / marteaux-par-tour)', () => {
    const cout = unitType('guerrier').cost;
    expect(etaProductionBanniere({ kind: 'unit', id: 'guerrier' }, 3, 1)).toBe(Math.ceil((cout - 3) / 1));
  });
  it('marteaux-par-tour nul : Infinity (Erik 08/10 — le drapeau reste, rendu « ∞ »)', () => {
    expect(etaProductionBanniere({ kind: 'unit', id: 'guerrier' }, 3, 0)).toBe(Infinity);
  });
  it('item inconnu des données : null (repli honnête — pas d\'« Infinity »)', () => {
    expect(etaProductionBanniere({ kind: 'building', id: 'batiment_inconnu' }, 0, 5)).toBeNull();
  });
});

describe('rendementsVille (miroir yields/prodPerTurn de PanneauVille)', () => {
  it('nourriture = centre (case ville 0) + tuiles travaillées ; citoyen intérieur ne mange rien', () => {
    const st = etatAvecVilles();
    const cA = st.cities.cA!; // pop 2, 1 prairie travaillée (2 nourriture)
    expect(rendementsVille(st, cA, cA.workedTiles, []).food).toBe(2);
  });
  it('prodPerTurn = ⌊brut × multiplicateur bâtiments × (1 + 0,25×(pop−1))⌋ — citoyen intérieur +1', () => {
    const st = etatAvecVilles();
    const cA = st.cities.cA!; // pop 2, 1 travaillée → intérieur 1 (tranche Ouvrier +1) ; brut 1
    expect(rendementsVille(st, cA, cA.workedTiles, []).prodPerTurn).toBe(Math.floor(1 * 1 * 1.25));
  });
  it('Usine (productionMult 2) double le brut avant le facteur de pop', () => {
    const st = etatAvecVilles();
    const usine = { ...st.cities.cA!, buildings: ['usine'] };
    expect(rendementsVille(st, usine, usine.workedTiles, []).prodPerTurn).toBe(Math.floor(1 * 2 * 1.25));
  });
  it('tuile travaillée en Forêt : +2 marteaux bruts (la case ville ne rapporte rien — R-66 rév.)', () => {
    const st = makeState({
      width: 8,
      height: 8,
      terrainOverrides: { [tileKey(2, 0)]: 'foret' },
      cities: [{ id: 'cA', owner: 'p1', q: 2, r: 1, pop: 1, workedTiles: [tileKey(2, 0)] }],
    });
    const cA = st.cities.cA!; // pop 1, 1 travaillée → intérieur 0 ; brut = forêt 2
    expect(rendementsVille(st, cA, cA.workedTiles, []).prodPerTurn).toBe(Math.floor(2 * 1 * 1));
  });
});

describe('géométrie partagée (dessin + picking D6)', () => {
  it('rectBanniereLocale couvre la bande ET les drapeaux, largeur = bande', () => {
    const R = rectBanniereLocale();
    expect(R.x0).toBe(-BANDE_VILLE.largeur / 2);
    expect(R.x1).toBe(BANDE_VILLE.largeur / 2);
    expect(R.y0).toBe(BANDE_VILLE.yBande - BANDE_VILLE.hauteurBande / 2);
    expect(R.y1).toBe(BANDE_VILLE.yDrapeaux + BANDE_VILLE.hauteurDrapeaux / 2);
  });
  it('UNE SEULE bande : les drapeaux pendent sous elle, sans la recouvrir', () => {
    // Retour d'Erik 08/10 : plus de rangée 2 encadrée — plaquettes nues.
    expect(BANDE_VILLE.yDrapeaux - BANDE_VILLE.hauteurDrapeaux / 2).toBeGreaterThanOrEqual(
      BANDE_VILLE.yBande + BANDE_VILLE.hauteurBande / 2,
    );
    // Le trio « Tours / croissance / production » tient sous la largeur bande.
    const gauche = BANDE_VILLE.xDrapeauTours - BANDE_VILLE.largeurDrapeauEtiquette / 2;
    const droite = BANDE_VILLE.xDrapeauProd + BANDE_VILLE.largeurDrapeauNombre / 2;
    expect(gauche).toBeGreaterThanOrEqual(-BANDE_VILLE.largeur / 2);
    expect(droite).toBeLessThanOrEqual(BANDE_VILLE.largeur / 2);
  });
  it('cercles pop et production côte à côte DANS la bande, sans chevauchement', () => {
    const bordPop = BANDE_VILLE.xPop + BANDE_VILLE.rayonPop;
    const bordProd = BANDE_VILLE.xProdCercle - BANDE_VILLE.rayonProd;
    expect(bordProd).toBeGreaterThanOrEqual(bordPop);
    expect(BANDE_VILLE.xProdCercle + BANDE_VILLE.rayonProd).toBeLessThanOrEqual(BANDE_VILLE.largeur / 2 - 2);
  });
  it('la bande flotte AU-DESSUS du sommet du sprite ville (−64)', () => {
    expect(BANDE_VILLE.yBande + BANDE_VILLE.hauteurBande / 2).toBeLessThanOrEqual(-64);
  });
});
