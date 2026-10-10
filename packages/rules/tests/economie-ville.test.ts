/**
 * BANDE-DETAIL (décisions Erik 07/10, D4) — helper PARTAGÉ moteur/UI :
 * composantes NOMMÉES de l'économie de ville (gain net de nourriture,
 * marteaux/tour) pour les infobulles « pourquoi tant de tours » de la
 * bannière. Miroir exact des formules d'affichage (PanneauVille /
 * bande-ville.rendementsVille) — tests de PROPRIÉTÉ : somme = total.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { cityEconomyInputs } from '../src/turn.js';
import { economieVilleDetail } from '../src/economie-ville.js';

describe('economieVilleDetail · propriétés (BANDE-DETAIL D4)', () => {
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

  it('propriété : récolte − consommation = gain net', () => {
    const d = economieVilleDetail(etat(), etat().cities['c1']!, []);
    expect(d.recolte - d.consommation).toBe(d.gainNet);
  });

  it('propriété : ⌊prodBrut × bonusBâtiments × bonusPop⌋ = marteaux/tour', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, []);
    expect(Math.floor(d.prodBrut * d.bonusBatimentsMult * d.bonusPopMult)).toBe(d.prodPerTurn);
  });

  it('miroir : marteaux/tour et nourriture = moteur (cityEconomyInputs, cas simple sans régime ni bonus empire de production)', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, st.cities['c1']!.workedTiles);
    const e = cityEconomyInputs(st, st.cities['c1']!, []);
    // Composantes de base identiques (la phase C applique Anarchie /
    // bonus empire / gouvernements par-dessus — absents du cas simple).
    expect(d.recolte).toBe(e.food);
    expect(d.prodPerTurn).toBe(e.production);
  });

  it('détail nommé : l’Usine porte le multiplicateur ×2 avec son nom', () => {
    const st = etat();
    const d = economieVilleDetail(st, st.cities['c1']!, []);
    expect(d.bonusBatimentsMult).toBe(2);
    expect(d.bonusBatimentsNom).toBe('Usine');
  });

  it('sans bâtiment multiplicateur : mult 1, nom null ; consommation 0 (7i D1 abrogée)', () => {
    const st = etat();
    const ville = { ...st.cities['c1']!, buildings: [] };
    const d = economieVilleDetail(st, ville, []);
    expect(d.bonusBatimentsMult).toBe(1);
    expect(d.bonusBatimentsNom).toBeNull();
    expect(d.consommation).toBe(0);
    expect(d.bonusPopMult).toBe(1 + 0.25 * (ville.pop - 1));
  });
});
