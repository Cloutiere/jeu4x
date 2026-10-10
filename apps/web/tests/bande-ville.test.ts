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
import type { DetailTooltip } from '../src/lib/render/bande-ville.js';
import { lignesTooltipCroissance, lignesTooltipProduction } from '../src/lib/render/bande-ville.js';

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
  it('prodPerTurn = ⌊prodTuiles × bonusBâtiments × bonusCitoyens⌋ — bonus des citoyens NON AFFECTÉS (R-63 rév. 10/10)', () => {
    const st = makeState({
      width: 8,
      height: 8,
      terrainOverrides: { [tileKey(2, 0)]: 'foret' },
      cities: [{ id: 'cA', owner: 'p1', q: 2, r: 1, pop: 2, workedTiles: [tileKey(2, 0)] }],
    });
    const cA = st.cities.cA!; // pop 2, 1 forêt (2 marteaux) → intérieur 1 → ×1,25
    expect(rendementsVille(st, cA, cA.workedTiles, []).prodPerTurn).toBe(Math.floor(2 * 1 * 1.25));
  });
  it('Usine (productionMult 2) double les TUILES avant le bonus citoyens', () => {
    const st = makeState({
      width: 8,
      height: 8,
      terrainOverrides: { [tileKey(2, 0)]: 'foret' },
      cities: [{ id: 'cA', owner: 'p1', q: 2, r: 1, pop: 2, workedTiles: [tileKey(2, 0)] }],
    });
    const usine = { ...st.cities.cA!, buildings: ['usine'] }; // intérieur 1 → ×1,25
    expect(rendementsVille(st, usine, usine.workedTiles, []).prodPerTurn).toBe(Math.floor(2 * 2 * 1.25));
  });
  it('citoyen intérieur ne produit PLUS de marteaux directs (R-60bis rév. 10/10) : tuile sans production → 0', () => {
    const st = etatAvecVilles();
    const cA = st.cities.cA!; // pop 2, 1 prairie (0 marteau) → intérieur 1 mais prodTuiles 0
    expect(rendementsVille(st, cA, cA.workedTiles, []).prodPerTurn).toBe(0);
  });
  it('tuile travaillée en Forêt sans intérieur : ×1 (la case ville ne rapporte rien — R-66 rév.)', () => {
    const st = makeState({
      width: 8,
      height: 8,
      terrainOverrides: { [tileKey(2, 0)]: 'foret' },
      cities: [{ id: 'cA', owner: 'p1', q: 2, r: 1, pop: 1, workedTiles: [tileKey(2, 0)] }],
    });
    const cA = st.cities.cA!; // pop 1, 1 travaillée → intérieur 0 ; tuiles = forêt 2
    expect(rendementsVille(st, cA, cA.workedTiles, []).prodPerTurn).toBe(2);
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

// ---------------------------------------------------------------------------
// BANDE-DETAIL (decisions Erik 07/10 ; rev. 10/10 — nourriture, bonus
// citoyens non affectes R-63) — infobulles "pourquoi tant de tours"
// ---------------------------------------------------------------------------

describe('BANDE-DETAIL : constructeurs d infobulles (D1/D2/D6)', () => {
  const detail = (over: Partial<ImportDetail> = {}): ImportDetail => ({
    pop: 3,
    foodStored: 10,
    recolte: 8,
    consommation: 0,
    gainNet: 8,
    seuil: 29,
    prodTuiles: 6,
    bonusBatimentsMult: 2,
    bonusBatimentsNom: 'Usine',
    citoyensNonAffectes: 2,
    bonusCitoyensMult: 1.5,
    prodPerTurn: 18,
    itemNom: 'Bibliotheque',
    cout: 55,
    progression: 12,
    eta: 3,
    croissanceAffichee: 3,
    ...over,
  });
  type ImportDetail = DetailTooltip;

  it('D1 croissance : "10 / 29 nourriture" + ligne de calcul nommee + delai', () => {
    const lignes = lignesTooltipCroissance(detail());
    expect(lignes[0]).toContain('10 / 29');
    expect(lignes[0]).toContain('nourriture');
    const calc = lignes.find((l) => l.includes('Récolte'))!;
    expect(calc).toContain('8');
    expect(calc).toContain('−');
    expect(calc).toContain('+8');
    expect(lignes.some((l) => l.includes('Nouveau citoyen dans 3 tours'))).toBe(true);
  });

  it('D1 croissance : pluriel et stagnation a zero (surplus nul -> jamais)', () => {
    // 28/29 a +1/tour -> 1 tour exactement.
    expect(lignesTooltipCroissance(detail({ gainNet: 1, recolte: 1, foodStored: 28 }))).toContainEqual(
      expect.stringContaining('Nouveau citoyen dans 1 tour'),
    );
    const lignes = lignesTooltipCroissance(detail({ recolte: 0, gainNet: 0 }));
    expect(lignes.join('\n')).toContain('Jamais');
  });

  it('D1 croissance : plafond de population -> nourriture masquee, plafond nomme', () => {
    const lignes = lignesTooltipCroissance(detail({ seuil: null }));
    expect(lignes[0]).toContain('plafond de population');
    expect(lignes.join('\n')).toContain('Plus jamais de croissance');
  });

  it('D2 production : nom, cout avec progression, marteaux detailles (tuiles x Usine x citoyens non affectes), achevement', () => {
    const lignes = lignesTooltipProduction(detail());
    expect(lignes[0]).toContain('Bibliotheque');
    expect(lignes.some((l) => l.includes('55') && l.includes('12'))).toBe(true);
    const marteaux = lignes.find((l) => l.includes('Marteaux'))!;
    expect(marteaux).toContain('6 des tuiles');
    expect(marteaux).toContain('Usine ×2');
    expect(marteaux).toContain('2 citoyens non affectés ×1,5');
    expect(marteaux).toContain('18');
    expect(lignes.some((l) => l.includes('Achèvement dans 3 tours'))).toBe(true);
  });

  it('D2 production : sans Usine (omis si absent) ; infini = jamais ; coût inconnu masqué', () => {
    const simple = lignesTooltipProduction(detail({ bonusBatimentsMult: 1, bonusBatimentsNom: null, bonusCitoyensMult: 1, citoyensNonAffectes: 0, prodPerTurn: 6 }));
    const m = simple.find((l) => l.includes('Marteaux'))!;
    expect(m).not.toContain('Usine');
    expect(m).toContain('0 citoyen non affecté ×1');
    expect(lignesTooltipProduction(detail({ eta: Infinity })).join('\n')).toContain('aucun marteau');
    expect(lignesTooltipProduction(detail({ cout: null, eta: null })).join('\n')).not.toContain('Achèvement');
  });

  it('D2 production : ETA 0 → « à la prochaine résolution » (miroir de la bannière qui affiche 0)', () => {
    expect(lignesTooltipProduction(detail({ eta: 0 })).join('\n')).toContain('prochaine résolution');
  });
});
