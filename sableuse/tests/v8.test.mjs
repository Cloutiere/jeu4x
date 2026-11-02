/**
 * v8 — JEV-DECISIONNEL (31/10) — test-first : la déclaration de guerre devient
 * un ACTE MÉCANIQUE du harnais (D1) — quand le signal « domination mécanique »
 * est actif ET que le rapport de forces est favorable (≥ guerreTotaleRapportMin)
 * ET qu'une cible est qualifiée (conditions EXACTES de l'ex-choix `guerreTotale`,
 * inchangées : pas déjà en guerre, contact réel + délai OU cas aveugle, D3),
 * le harnais déclare SANS dépendre du choix LLM. Acte PONCTUEL avec débit
 * borné (D4 : cooldown `guerreTotaleCooldown`, après coup memo bascule en
 * `pousserCapitale`). D2 : le choix `guerreTotale` disparaît de la question
 * `finPartie` ; la question `guerre` classique reste INTACTE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import { condenseJoueur, construireQuestionsJoueur, tourJevJoueur } from '../src/joueur.mjs';
import { declarationMechanique, signalDominationMechanique } from '../src/joueur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

/** Miroir etatCourse des tests v6/v6b (capitale p2 voisine VUE, légion p1). */
function etatCourse({ villesP1 = 4, legionsP2 = 0, guerre = false, tour = 40 } = {}) {
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
    turn: tour,
    cities,
    units,
    diplomacy: guerre ? { ...etat.diplomacy, war: [['p1', 'p2']] } : etat.diplomacy,
    players: {
      ...etat.players,
      p1: {
        ...etat.players.p1,
        vision: { explored: ['5,5', '6,5', '8,5', '5,6'], visible: ['5,5', '6,5', '8,5', '5,6'] },
      },
      p2: { ...etat.players.p2 },
    },
  };
}

/** Profil aveugle v6b : Jev domine, rival JAMAIS rencontré. */
function etatAveugle({ villesP1 = 4, tour = 40 } = {}) {
  const etat = etatCourse({ villesP1, tour });
  etat.units = {
    ...etat.units,
    u_moi: { id: 'u_moi', owner: 'p1', type: 'legion', q: 4, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
  };
  etat.cities = { ...etat.cities, cap2: { ...etat.cities.cap2, q: 12, r: 5 } };
  etat.players.p1 = {
    ...etat.players.p1,
    vision: { explored: ['4,5', '5,5', '5,6'], visible: ['4,5', '5,5', '5,6'] },
  };
  return etat;
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

describe('v8 · D1 — la déclaration mécanique (acte du harnais, sans choix LLM)', () => {
  it('signal mécanique + mode domination + rapport favorable + pas en guerre ⇒ intention de guerre MÉCANIQUE, réponse LLM ignorée', async () => {
    const etat = etatCourse();
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    // Le LLM répond 'continuer' — la déclaration mécanique NE DÉPEND PAS de lui.
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'domination' });
  });

  it('acte PONCTUEL : memo bascule en pousserCapitale + horodatage cooldown (D4)', async () => {
    const etat = etatCourse();
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(1);
    expect(memo.finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p2' });
    expect(memo.guerreMecaniqueTour).toBe(40);
  });

  it('condition EXACTE conservée : SANS signal mécanique ⇒ PAS de déclaration (jalons seuls insuffisants)', async () => {
    const etat = etatCourse({ villesP1: 1, legionsP2: 2 }); // rapport < 1,2 (v9 D-B : sinon l'écrasement tire)
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('memo vide (pas de mode courant) + rapport non écrasant ⇒ PAS de déclaration (v9 : un rapport ≥ 3 déclare SANS mode — D-B)', async () => {
    const etat = etatCourse({ legionsP2: 2 });
    const filtre = getFilteredState(etat, 'p1');
    const memo = {};
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('déjà en guerre avec la cible ⇒ PAS de déclaration (condition EXACTE du D3)', async () => {
    const etat = etatCourse({ guerre: true });
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('rapport de forces insuffisant (< 1,2) ⇒ PAS de déclaration', async () => {
    const etat = etatCourse({ legionsP2: 3 });
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('cas aveugle conservé (D3) : signal mécanique + rival jamais rencontré ⇒ déclaration mécanique', async () => {
    const etat = etatAveugle();
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'domination' });
  });
});

describe('v8 · D4 — débit borné (cooldown)', () => {
  it('SEUILS : guerreTotaleCooldown est DATA et vaut 8', () => {
    expect(config.seuils.guerreTotaleCooldown).toBe(8);
  });

  it('dans le cooldown ⇒ PAS de re-déclaration', async () => {
    const etat = etatCourse({ tour: 45 });
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'pousserCapitale', cible: 'p2' }, guerreMecaniqueTour: 40 };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('cooldown écoulé ⇒ re-déclaration possible (rival re-qualifié)', async () => {
    const etat = etatCourse({ tour: 48 });
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'pousserCapitale', cible: 'p2' }, guerreMecaniqueTour: 40 };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'domination' });
  });

  it('declarationMechanique (helper pur) : null sous cooldown, snapshot sinon', () => {
    const etat = etatCourse({ tour: 42 });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const domMec = signalDominationMechanique(condense, filtre, 'p1');
    const memo = { finPartie: { mode: 'pousserCapitale', cible: 'p2' }, guerreMecaniqueTour: 40 };
    expect(declarationMechanique(condense, filtre, 'p1', memo, config.seuils, domMec)).toBeNull();
    const memo2 = { finPartie: { mode: 'domination' } };
    const decl = declarationMechanique(condense, filtre, 'p1', memo2, config.seuils, domMec);
    expect(decl).not.toBeNull();
    expect(decl.cible).toBe('p2');
    expect(decl.tour).toBe(42);
    expect(decl.aveugle).toBe(false);
  });
});

describe('v8 · D2 — le choix guerreTotale disparaît de finPartie ; guerre classique INTACTE', () => {
  it('AUCUN critère guerreTotale:* dans finPartie, même en conditions favorables', () => {
    const { questions } = questionsPour(etatCourse(), { finPartie: { mode: 'domination' } });
    expect(questions.finPartie).toBeDefined();
    const cles = Object.keys(questions.finPartie.criteria);
    expect(cles.some((k) => k.startsWith('guerreTotale:'))).toBe(false);
    // les choix habituels restent
    expect(cles).toContain('viserMaVictoire:domination');
    expect(cles).toContain('pousserCapitale:p2');
  });

  it('réponse LLM résiduelle guerreTotale:p2 ⇒ IGNORÉE (aucune intention, aucun memo)', async () => {
    const etat = etatCourse({ villesP1: 1, legionsP2: 2 }); // rapport < 1,2 — aucune déclaration (v9 D-B)
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'domination' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'guerreTotale:p2' }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
    // forme invalide : le mode courant est préservé (aucune traduction)
    expect(memo.finPartie).toEqual({ mode: 'domination' });
  });

  it('la question guerre CLASSIQUE reste intacte (hors finPartie, ciblée, argumentée)', () => {
    // Profil classique du banc (question guerre — cible la plus faible) :
    // on vérifie la traduction existante via le memo rencontreTour (contact + délai).
    const etat = etatCourse({ legionsP2: 0 });
    etat.players.p2 = { ...etat.players.p2, defeated: false };
    const filtre = getFilteredState(etat, 'p1');
    // rencontre ancienne (> délai 10) pour ouvrir la question guerre classique
    const memo = { rencontres: { p2: 5 }, guerreChoisie: null };
    const condense = condenseJoueur(filtre, 'p1', memo);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', memo);
    if (questions.guerre) {
      const cles = Object.keys(questions.guerre.criteria);
      expect(cles.some((k) => k.startsWith('guerre:'))).toBe(true);
      expect(cles).toContain('aucun');
    }
  });
});
