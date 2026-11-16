/**
 * DECLARATION-OPPORTUNISTE (canon Erik 16/11) — tests de la mission L4 :
 * D1 contact obligatoire (cas aveugle abrogé — reproduction ZGFV42 dans
 * jev-port.test.ts), D4 opportuneConquete C1-C4, ligne d'analyse au
 * condensé, miroir harnais ⇄ port bit à bit.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import {
  cibleEcrasement as cibleEcrasementTs,
  cibleGuerreTotale as cibleGuerreTotaleTs,
  declarationMechanique as declarationMechaniqueTs,
  opportuneConquete as opportuneConqueteTs,
} from '../src/jev/joueur.js';
import {
  cibleEcrasement as cibleEcrasementMjs,
  cibleGuerreTotale as cibleGuerreTotaleMjs,
  declarationMechanique as declarationMechaniqueMjs,
  opportuneConquete as opportuneConqueteMjs,
  condenseJoueur as condenseJoueurMjs,
} from '../../sableuse/src/joueur.mjs';
import { condenseJoueur as condenseJoueurTs, construireQuestionsJoueur as construireTs } from '../src/jev/joueur.js';
import { readFileSync } from 'node:fs';
const { condenseJoueur: condenseJoueurMjs, construireQuestionsJoueur: construireMjs } = await import('../../../sableuse/src/joueur.mjs');
const configJev = JSON.parse(
  readFileSync(new URL("../src/jev/questions-joueur.json", import.meta.url), "utf8"),
);

type AnyEtat = any;

/** Fixture 1v1 synthétique : p2 (moi) forte à (5,5), ville p1 à `qAdv,rAdv`
 * VUE (vision explicite), défenseurs p1 optionnels SUR la ville, garnisons
 * p1 additionnelles à `qRes,rRes` (pour la survivabilité C4). */
function fixture({ qAdv = 8, rAdv = 5, defVille = 0, reservesAdv = 0, tour = 40 } = {}) {
  const gen = generateProceduralMap(42);
  let etat: AnyEtat = createInitialState(gen.map, 42, {});
  const units: AnyEtat = {};
  for (let i = 0; i < 4; i++) {
    units[`u_moi_${i}`] = { id: `u_moi_${i}`, owner: 'p2', type: 'legion', q: 6, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  for (let i = 0; i < defVille; i++) {
    units[`u_adv_${i}`] = { id: `u_adv_${i}`, owner: 'p1', type: 'legion', q: qAdv, r: rAdv, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  for (let i = 0; i < reservesAdv; i++) {
    // Réserves p1 à UNE case de la ville ciblée — dans la vision RÉELLE des
    // combattantes p2 (computeVisibleTiles), jamais sur la case de la ville.
    units[`u_adv_r_${i}`] = { id: `u_adv_r_${i}`, owner: 'p1', type: 'legion', q: qAdv - 1, r: rAdv + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  etat = {
    ...etat,
    turn: tour,
    cities: {
      ...etat.cities,
      cap2: { id: 'cap2', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
      v1: { id: 'v1', owner: 'p1', q: qAdv, r: rAdv, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
    },
    units,
    players: {
      ...etat.players,
      p2: {
        ...etat.players.p2,
        vision: {
          explored: ['5,5', `${qAdv},${rAdv}`, ...Array.from({ length: reservesAdv }, (_, i) => `${qAdv},${rAdv + 1 + i}`)],
          visible: ['5,5', `${qAdv},${rAdv}`, ...Array.from({ length: reservesAdv }, (_, i) => `${qAdv},${rAdv + 1 + i}`)],
        },
      },
    },
  };
  return { etat, filtre: getFilteredState(etat, 'p2') };
}

describe('DECLARATION-OPPORTUNISTE · opportuneConquete (C1-C4)', () => {
  it('C3+C4 passés : opportunité qualifiée (ville visible, marche ≤ 5, esperance > 0,5, survivabilité ≥ 1)', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    const opp = opportuneConqueteTs(cond, filtre, 'p2', memo, {});
    expect(opp).not.toBeNull();
    expect(opp.cible).toBe('p1');
    expect(opp.villeId).toBe('v1');
    expect(opp.case).toBe('8,5');
    expect(opp.marcheTours).toBeLessThanOrEqual(5);
    expect(opp.esperanceAssaut).toBeGreaterThan(0.5);
    expect(opp.survivabilite).toBeGreaterThanOrEqual(1);
    // Miroir harnais bit à bit.
    const oppM = opportuneConqueteMjs(cond, JSON.parse(JSON.stringify(filtre)), 'p2', JSON.parse(JSON.stringify(memo)), {});
    expect(oppM).toEqual(opp);
  });

  it('C1 : rencontre sous le délai (10 tours) ⇒ null', () => {
    const { filtre } = fixture({ tour: 35 });
    const memo = { rencontres: { p1: 30 } }; // 35 - 30 = 5 < 10
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    expect(opportuneConqueteTs(cond, filtre, 'p2', memo, {})).toBeNull();
  });

  it('C1 : jamais rencontré ⇒ null (abrogation du cas aveugle)', () => {
    const { filtre } = fixture();
    const cond = condenseJoueurTs(filtre, 'p2', {});
    expect(opportuneConqueteTs(cond, filtre, 'p2', {}, {})).toBeNull();
  });

  it('C3 : marche de guerre éclair dépassée (> 5 tours) ⇒ null', () => {
    const { etat, filtre } = fixture({ qAdv: 14, rAdv: 5 });
    // Défenseurs réserves p1 proches de leur ville : la marche depuis mes
    // combattantes dépasse eclairMarcheTours.
    etat.players.p2.vision.explored.push('14,5');
    const filtre2 = getFilteredState(etat, 'p2');
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre2, 'p2', memo);
    expect(opportuneConqueteTs(cond, filtre2, 'p2', memo, {})).toBeNull();
  });

  it('C4 : survivabilité sous 1,0 (réserves p1 visibles massives) ⇒ null', () => {
    const { filtre } = fixture({ reservesAdv: 20 });
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    const opp = opportuneConqueteTs(cond, filtre, 'p2', memo, {});
    expect(opp).toBeNull();
  });

  it('C3 : défenseur fortifié solide ⇒ espérance ≤ 0,5 ⇒ null', () => {
    // 4 défenseurs légion SUR la ville : l'assaut frontal n'est pas positif.
    const { filtre } = fixture({ defVille: 4 });
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    expect(opportuneConqueteTs(cond, filtre, 'p2', memo, {})).toBeNull();
  });
});

describe('DECLARATION-OPPORTUNISTE · declarationMechanique (D1/D4/D5)', () => {
  it('domination + signal + opportunité ⇒ déclaration AVEC ville (snapshot journal)', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 }, finPartie: { mode: 'domination' } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    const d = declarationMechaniqueTs(cond, filtre, 'p2', memo, {}, true);
    expect(d).not.toBeNull();
    expect(d.motif).toBe('domination');
    expect(d.cible).toBe('p1');
    expect(d.ville).toBe('8,5');
    expect(d.opportunite.survivabilite).toBeGreaterThanOrEqual(1);
    // Miroir harnais bit à bit.
    const dM = declarationMechaniqueMjs(cond, JSON.parse(JSON.stringify(filtre)), 'p2', JSON.parse(JSON.stringify(memo)), {}, true);
    expect(dM).toEqual(d);
  });

  it('domination + signal SANS opportunité (jamais rencontré) ⇒ null (D4 — le mode attend)', () => {
    const { filtre } = fixture();
    const memo = { finPartie: { mode: 'domination' } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    expect(declarationMechaniqueTs(cond, filtre, 'p2', memo, {}, true)).toBeNull();
  });

  it('écrasement : rapport ≥ 3 sans mode ⇒ motif ecrasement sur la même opportunité', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    const d = declarationMechaniqueTs(cond, filtre, 'p2', memo, {}, false);
    expect(d?.motif).toBe('ecrasement');
    const dM = declarationMechaniqueMjs(cond, JSON.parse(JSON.stringify(filtre)), 'p2', JSON.parse(JSON.stringify(memo)), {}, false);
    expect(dM).toEqual(d);
  });

  it('cibleGuerreTotale / cibleEcrasement : plus AUCUN chemin aveugle (D1)', () => {
    const { filtre } = fixture();
    // Rival jamais rencontré : refusé par les DEUX qualificateurs.
    expect(cibleGuerreTotaleTs(condenseJoueurTs(filtre, 'p2', {}), filtre, 'p2', 1.2)).toBeNull();
    expect(cibleEcrasementTs(condenseJoueurTs(filtre, 'p2', {}), filtre, 'p2', {})).toBeNull();
    // Rencontré + délai : cible qualifiée — miroir bit à bit.
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo);
    expect(cibleGuerreTotaleTs(cond, filtre, 'p2', 1.2)?.id).toBe('p1');
    expect(cibleGuerreTotaleMjs(cond, JSON.parse(JSON.stringify(filtre)), 'p2', 1.2))
      .toEqual(cibleGuerreTotaleTs(cond, filtre, 'p2', 1.2));
    expect(cibleEcrasementMjs(cond, JSON.parse(JSON.stringify(filtre)), 'p2', {}))
      .toEqual(cibleEcrasementTs(cond, filtre, 'p2', {}));
  });
});

describe('DECLARATION-OPPORTUNISTE · question guerre gate (D4 — contact seul insuffisant)', () => {
  const construire = async () => ({}) as any;
  it('rencontre + délai MAIS sans opportunité ⇒ PAS de question guerre (les deux ports)', () => {
    // Jev FORT (rapport 3×) mais AUCUNE ville ennemie visible à portée :
    // la ville p1 est hors vision — pas d'opportunité ⇒ pas de question.
    const gen = generateProceduralMap(42);
    let etat: AnyEtat = createInitialState(gen.map, 42, {});
    etat = {
      ...etat,
      turn: 40,
      cities: {
        ...etat.cities,
        cap2: { id: 'cap2', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
        // ville p1 jamais vue (hors vision).
        v1: { id: 'v1', owner: 'p1', q: 20, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
      },
      units: {
        u_moi_0: { id: 'u_moi_0', owner: 'p2', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
        u_moi_1: { id: 'u_moi_1', owner: 'p2', type: 'legion', q: 6, r: 6, hp: 100, mp: 0, fortified: false, aboard: false },
      },
    };
    const filtre = getFilteredState(etat, 'p2');
    const memo = { rencontres: { p1: 30 } };
    const a = construireTs(configJev, condenseJoueurTs(filtre, 'p2', memo, configJev.seuils), filtre, 'p2', memo);
    const b = construireMjs(configJev, condenseJoueurMjs(JSON.parse(JSON.stringify(filtre)), 'p2', JSON.parse(JSON.stringify(memo)), configJev.seuils), filtre, 'p2', memo);
    expect(a.questions.guerre).toBeUndefined();
    expect(b.questions.guerre).toBeUndefined();
  });
  it('opportunité qualifiée ⇒ question guerre posée SUR LA VILLE (miroir bit à bit)', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 } };
    const cond = condenseJoueurTs(filtre, 'p2', memo, configJev.seuils);
    expect(cond.opportuniteConquete).toBeDefined();
    const a = construireTs(configJev, cond, JSON.parse(JSON.stringify(filtre)), 'p2', memo);
    const b = construireMjs(configJev, JSON.parse(JSON.stringify(cond)), JSON.parse(JSON.stringify(filtre)), 'p2', memo);
    expect(a.questions.guerre).toBeDefined();
    expect(Object.keys(a.questions.guerre.criteria)).toContain('guerre:p1');
    expect(a.questions.guerre.criteria['guerre:p1']).toContain('8,5');
    expect(JSON.parse(JSON.stringify(a.questions.guerre)))
      .toEqual(JSON.parse(JSON.stringify(b.questions.guerre)));
  });
});

describe('DECLARATION-OPPORTUNISTE · ligne d\'analyse au condensé', () => {
  it('opportunité ⇒ UNE entrée opportuniteConquete (miroir bit à bit) ; sinon absente', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 } };
    const cTs = condenseJoueurTs(filtre, 'p2', memo, {});
    const cMjs = condenseJoueurMjs(JSON.parse(JSON.stringify(filtre)), 'p2', JSON.parse(JSON.stringify(memo)), {});
    expect(cTs.opportuniteConquete).toBeDefined();
    expect(cTs.opportuniteConquete.esperanceAssaut).toBeGreaterThan(0.5);
    expect(JSON.parse(JSON.stringify(cMjs.opportuniteConquete))).toEqual(cTs.opportuniteConquete);
    // Sans rencontre : pas d'opportunité ⇒ pas d'entrée.
    const c0Ts = condenseJoueurTs(filtre, 'p2', {}, {});
    const c0Mjs = condenseJoueurMjs(JSON.parse(JSON.stringify(filtre)), 'p2', {}, {});
    expect(c0Ts.opportuniteConquete).toBeUndefined();
    expect(c0Mjs.opportuniteConquete).toBeUndefined();
  });

  it('D2/D3 : après rencontre — ère/techsConnues/forces présents, JAMAIS la liste techs ni la trésorerie', () => {
    const { filtre } = fixture();
    const memo = { rencontres: { p1: 30 } };
    const c = condenseJoueurTs(filtre, 'p2', memo);
    const r = c.diplomatie.rivaux.find((x: AnyEtat) => x.id === 'p1');
    expect(r.rencontreTour).toBe(30);
    expect(r.forces).toBeDefined();
    expect(r.techs).toBeUndefined();
    expect(r.techsConnues).toBeDefined();
    expect(c.victoire.rivaux.find((x: AnyEtat) => x.id === 'p1').tresorerieApprox).toBeUndefined();
  });
});
