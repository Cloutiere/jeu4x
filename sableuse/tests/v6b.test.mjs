/**
 * v6b — JEV-IT4B-DECLARATION (31/10) — test-first : le choix `guerreTotale:<id>`
 * DANS la question `finPartie` (levier A du verdict Erik sur l'it4) — proposé
 * en mode domination/pousserCapitale quand le rapport de forces est favorable
 * (≥ 1,2) et qu'on n'est PAS déjà en guerre avec la cible ; traduit en
 * intention de guerre EXISTANTE (DeclareWar côté harnais), acte PONCTUEL
 * (jamais de mode persisté). Gate D-B : 5e signal « domination mécanique »
 * (rapport ≥ 2 ET ≥ 3 villes de plus que le leader) — le seul amendement de
 * gate permis, pour ouvrir finPartie dans les parties stériles.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import { condenseJoueur, construireQuestionsJoueur, signalVictoire, tourJevJoueur } from '../src/joueur.mjs';
import { signalDominationMechanique, cibleGuerreTotale } from '../src/joueur.mjs';
import { COMPOSANTS_VAISSEAU } from '../src/condense.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

/** Miroir etatCourse des tests v6 : capitale p1 synthétique + capitale p2
 * voisine VUE (vision 8,5) + un légion p1 (rapport de forces ≥ 1). */
function etatCourse({ jalonsMoi = 0, villesP1 = 1, legionsP2 = 0, guerre = false } = {}) {
  const etat = etat1v1(101);
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
    cap2: { id: 'cap2', owner: 'p2', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  for (let i = 1; i < villesP1; i++) {
    cities[`v1_${i}`] = { id: `v1_${i}`, owner: 'p1', q: 5 + i, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] };
  }
  const units = {
    ...etat.units,
    u_moi: { id: 'u_moi', owner: 'p1', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
  };
  for (let i = 0; i < legionsP2; i++) {
    units[`u_p2_${i}`] = { id: `u_p2_${i}`, owner: 'p2', type: 'legion', q: 7, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  return {
    ...etat,
    turn: 40,
    cities,
    units,
    diplomacy: guerre ? { ...etat.diplomacy, war: [['p1', 'p2']] } : etat.diplomacy,
    players: {
      ...etat.players,
      p1: {
        ...etat.players.p1,
        cultureMilestones: jalonsMoi,
        vision: { explored: ['5,5', '6,5', '8,5', '5,6'], visible: ['5,5', '6,5', '8,5', '5,6'] },
      },
      p2: { ...etat.players.p2 },
    },
  };
}

function questionsPour(etat, memo = {}) {
  const filtre = getFilteredState(etat, 'p1');
  const condense = condenseJoueur(filtre, 'p1', memo);
  const { questions, meta } = construireQuestionsJoueur(config, condense, filtre, 'p1', memo);
  return { questions, meta, condense, filtre };
}

function fauxClient(reponses) {
  return {
    async systemOne() {
      const answers = {};
      for (const [k, v] of Object.entries(reponses)) {
        answers[k] = typeof v === 'string' ? { choice: v, confidence: 0.9 } : v;
      }
      return { answers, usage: { input_tokens: 100 } };
    },
  };
}

describe('v6b · D-A — le choix guerreTotale dans finPartie (REVERSÉ v8 JEV-DECISIONNEL)', () => {
  // v8 · D2 (verdict Erik 31/10, banc bataille) : le choix `guerreTotale`
  // disparaît de la question — la déclaration devient un ACTE MÉCANIQUE du
  // harnais (tests v8). Les conditions d'éligibilité restent verrouillées
  // par cibleGuerreTotale (ci-dessous) et declarationMechanique (tests v8).
  it('mode domination + rapport favorable + pas en guerre ⇒ guerreTotale:p2 PLUS proposé', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12 }), { finPartie: { mode: 'domination' } });
    expect(questions.finPartie).toBeDefined();
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('mode pousserCapitale ⇒ PLUS proposé non plus (cible de la poussée)', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12 }), { finPartie: { mode: 'pousserCapitale', cible: 'p2' } });
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('SANS mode courant (memo vide) ⇒ PAS de guerreTotale', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12 }), {});
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('mode culture/science ⇒ PAS de guerreTotale (voie non-domination)', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12 }), { finPartie: { mode: 'culture' } });
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('déjà en guerre avec la cible ⇒ PAS de guerreTotale', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12, guerre: true }), { finPartie: { mode: 'domination' } });
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('rapport de forces insuffisant (< 1,2) ⇒ PAS de guerreTotale', () => {
    // 3 légions p2 visibles vs 1 légion p1 → rapport 1/3 < 1,2.
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12, legionsP2: 3 }), { finPartie: { mode: 'domination' } });
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('cibleGuerreTotale : la cible pré-qualifiée a une capitale CONNUE (distance < 99)', () => {
    const { condense, filtre } = questionsPour(etatCourse({ jalonsMoi: 12 }));
    const c = cibleGuerreTotale(condense, filtre, 'p1', 1.2);
    expect(c).not.toBeNull();
    expect(c.id).toBe('p2');
    expect(c.distanceCapitale).toBeLessThan(99);
    expect(c.villes).toBeGreaterThan(0);
  });
});

describe('v6b · D-A — traduction (REVERSÉE v8 : forme retirée, réponse résiduelle ignorée)', () => {
  it('guerreTotale:p2 ⇒ IGNORÉE (aucune intention, memo INCHANGÉ — v8 D2)', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12, legionsP2: 3 }), 'p1'); // rapport < 1,2 (v9 D-B : sinon l'écrasement tire)
    const condense = condenseJoueur(filtre, 'p1', {});
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'guerreTotale:p2' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    expect(d.diplomatie).not.toContainEqual({ genre: 'guerre', cible: 'p2' });
    // le mode courant est préservé (jamais réécrit par la forme retirée).
    expect(memo.finPartie).toEqual({ mode: 'domination' });
  });

  it('cible invalide ⇒ ignorée sans panne (aucune diplomatie, repli compté)', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12, legionsP2: 3 }), 'p1'); // rapport < 1,2 (v9 D-B)
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'guerreTotale:zz' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    expect(d.diplomatie).toEqual([]);
  });

  it('déjà en guerre avec la cible ⇒ la traduction REFUSE aussi (double garde)', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12, guerre: true }), 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'guerreTotale:p2' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toEqual([]);
  });

  it('ACTE PONCTUEL : le tour suivant (en guerre), finPartie retrouve ses choix habituels', async () => {
    const etat = etatCourse({ jalonsMoi: 12, guerre: true });
    const { questions } = questionsPour(etat, { finPartie: { mode: 'domination' } });
    const cles = Object.keys(questions.finPartie.criteria);
    expect(cles).not.toContain('guerreTotale:p2');
    expect(cles.some((k) => k.startsWith('pousserCapitale:'))).toBe(true);
  });
});

describe('v6b · D-B — 5e signal de gate « domination mécanique »', () => {
  it('rapport ≥ 2 ET ≥ 3 villes de plus que le leader ⇒ signal VRAI (gate ouverte)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 4 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalVictoire(condense)).toBe(false); // les 4 signaux it4 sont muets
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(true);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeDefined();
  });

  it('écart de villes insuffisant (< 3) ⇒ PAS de signal (partie calme muette — v9 : ni signal ni opportunité)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 2, legionsP2: 5 }), 'p1'); // rapport < 2 — pas d'opportunité domination non plus
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeUndefined();
  });

  it('rapport < 2 ⇒ PAS de signal même avec 3 villes de plus', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 4, legionsP2: 5 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(condense.monde.puissance.rapport).toBeLessThan(2);
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
  });

  it('les 4 signaux it4 restent la porte d\'entrée (non-régression v6)', () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalVictoire(condense)).toBe(true);
  });
});

describe('v6b · amendement aveugle (verdict Erik, banc v1) — rival jamais rencontré', () => {
  /** Profil EXACT des parties stériles du banc v1 : Jev domine (rapport ≥ 2,
   * ≥ 3 villes) mais n'a JAMAIS vu le rival (aucune ville ni unité p2 dans la
   * vision — la légion est éloignée de cap2, distanceCapitale 99). */
  function etatAveugle({ villesP1 = 4, jalonsMoi = 0 } = {}) {
    const etat = etatCourse({ villesP1, jalonsMoi });
    etat.units = {
      ...etat.units,
      u_moi: { id: 'u_moi', owner: 'p1', type: 'legion', q: 4, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
    };
    // cap2 REPoussée hors du rayon de vision de la capitale/légion (canon fog :
    // vision = disque des entités amies) → p2 invisible.
    etat.cities = { ...etat.cities, cap2: { ...etat.cities.cap2, q: 12, r: 5 } };
    etat.players.p1 = {
      ...etat.players.p1,
      vision: { explored: ['4,5', '5,5', '5,6'], visible: ['4,5', '5,5', '5,6'] },
    };
    return etat;
  }

  it('signal D-B actif + rival jamais rencontré ⇒ la cible aveugle reste QUALIFIÉE (mécanique v8 — cibleGuerreTotale)', () => {
    const filtre = getFilteredState(etatAveugle(), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(true);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', { finPartie: { mode: 'domination' } });
    // plus aucun choix guerreTotale dans la question (v8 D2)
    expect(Object.keys(questions.finPartie.criteria).some((k) => k.startsWith('guerreTotale:'))).toBe(false);
    // ... mais la cible pré-qualifiée existe toujours pour l'acte mécanique
    expect(cibleGuerreTotale(condense, filtre, 'p1', 1.2, true)?.id).toBe('p2');
    expect(cibleGuerreTotale(condense, filtre, 'p1', 1.2, true)?.aveugle).toBe(true);
  });

  it('SANS domination mécanique (signal jalons seulement) ⇒ PAS de guerreTotale aveugle (non-régression D-A)', () => {
    // 12 jalons ouvrent le gate, mais écart de villes < 3 → pas de signal D-B.
    const filtre = getFilteredState(etatAveugle({ villesP1: 1, jalonsMoi: 12 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', { finPartie: { mode: 'domination' } });
    expect(questions.finPartie).toBeDefined(); // le gate s'ouvre par les jalons
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });

  it('traduction aveugle : guerreTotale:p2 ⇒ IGNORÉE (v8 D2 — l\'acte mécanique prend le relais, tests v8)', async () => {
    const filtre = getFilteredState(etatAveugle(), 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'guerreTotale:p2' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    // la réponse résiduelle ne déclenche RIEN en DOUBLE : l'acte mécanique
    // (même tour, ici déclenché par le signal + memo domination) est le SEUL
    // émetteur d'intention de guerre — un seul élément, mecanique:true.
    expect(d.diplomatie).toEqual([{ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'domination' }]);
  });

  it('rival jamais rencontré, écart de villes < 2 (D-B muet au seuil v7) ⇒ toujours inoffrable', () => {
    // v6c · D-B : le seuil passe 3 → 2 (dominationEcartVilles) — l'écart 2
    // OFFRE maintenant la guerreTotale (profil du seed 786078703) ; l'écart
    // 1 reste muet. (Test v6b mis à jour — il verrouillait le seuil 3.)
    const filtre = getFilteredState(etatAveugle({ villesP1: 1, jalonsMoi: 12 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', { finPartie: { mode: 'domination' } });
    expect(questions.finPartie).toBeDefined(); // gate ouvert par les jalons
    expect(Object.keys(questions.finPartie.criteria)).not.toContain('guerreTotale:p2');
  });
});

describe('v6b · intégrité', () => {
  it('le seuil guerreTotaleRapportMin est DATA (config v6) et vaut 1,2', () => {
    expect(config.seuils.guerreTotaleRapportMin).toBe(1.2);
  });

  it('question finPartie : AUCUN critère guerreTotale, quelle que soit la situation (v8 D2)', () => {
    const { questions } = questionsPour(etatCourse({ jalonsMoi: 12 }), { finPartie: { mode: 'domination' } });
    const cles = Object.keys(questions.finPartie.criteria);
    expect(cles.some((k) => k.startsWith('guerreTotale:'))).toBe(false);
    expect(cles.length).toBeGreaterThan(2);
  });
});
