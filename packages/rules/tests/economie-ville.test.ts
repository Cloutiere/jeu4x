/**
 * BANDE-DETAIL (decisions Erik 07/10, D4 ; REV. Erik 10/10 — le bonus de
 * production vient des citoyens NON AFFECTES, R-63) — helper PARTAGE
 * moteur/UI : composantes NOMMEES de l'economie de ville pour les
 * infobulles "pourquoi tant de tours" de la banniere. Miroir exact des
 * formules d'affichage (PanneauVille / bande-ville.rendementsVille) —
 * tests de PROPRIETE : somme = total.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { cityEconomyInputs } from '../src/turn.js';
import { economieVilleDetail } from '../src/economie-ville.js';

describe('economieVilleDetail - proprietes (BANDE-DETAIL D4, rev. R-63 10/10)', () => {
  function etat() {
    return makeState({
      cities: [
        {
          id: 'c1',
          owner: 'p1',
          q: 0,
          r: 0,
          capital: true,
          pop: 3,
          foodStored: 10,
          workedTiles: ['0,1', '1,0'],
          buildings: ['usine'],
        },
      ],
    });
  }

  it('propriete : recolte - consommation = gain net', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, []);
    expect(d.recolte - d.consommation).toBe(d.gainNet);
  });

  it('propriete : floor(prodTuiles x bonusBatiments x bonusCitoyens) = marteaux/tour', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, st.cities['c1']!.workedTiles);
    expect(Math.floor(d.prodTuiles * d.bonusBatimentsMult * d.bonusCitoyensMult)).toBe(d.prodPerTurn);
  });

  it('miroir : marteaux/tour et nourriture = moteur (cityEconomyInputs, cas simple sans regime ni bonus empire de production)', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, st.cities['c1']!.workedTiles);
    const e = cityEconomyInputs(st, st.cities['c1']!, []);
    // Composantes de base identiques (la Phase C applique Anarchie /
    // bonus empire / gouvernements par-dessus - absents du cas simple).
    expect(d.recolte).toBe(e.food);
    expect(d.prodPerTurn).toBe(e.production);
  });

  it('detail nomme : l Usine porte le multiplicateur x2 avec son nom', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, []);
    expect(d.bonusBatimentsMult).toBe(2);
    expect(d.bonusBatimentsNom).toBe('Usine');
  });

  it('R-63 rev. 10/10 : le bonus vient des citoyens NON AFFECTES (1 -> x1,25), plus jamais de la population', () => {
    const st = etat();
    const ville = { ...st.cities['c1']!, buildings: [] };
    // pop 2 = toutes les tuiles affectees : 0 non affecte -> x1.
    const plein = economieVilleDetail(st, { ...ville, pop: 2 }, ville.workedTiles);
    expect(plein.citoyensNonAffectes).toBe(0);
    expect(plein.bonusCitoyensMult).toBe(1);
    // Un citoyen non affecte (pop 3, 2 tuiles) -> x1,25 (mecanique d Erik :
    // 7 pop / 6 tuiles serait identique — 1 non affecte).
    const sur = { ...ville, pop: 3 };
    const dSur = economieVilleDetail(st, sur, sur.workedTiles);
    expect(dSur.citoyensNonAffectes).toBe(1);
    expect(dSur.bonusCitoyensMult).toBe(1.25);
  });

  it('sans batiment multiplicateur : mult 1, nom null ; consommation 0 (7i D1 abrogee)', () => {
    const st = etat();
    const ville = { ...st.cities['c1']!, buildings: [] };
    const d = economieVilleDetail(st, ville, []);
    expect(d.bonusBatimentsMult).toBe(1);
    expect(d.bonusBatimentsNom).toBeNull();
    expect(d.consommation).toBe(0);
  });
});
