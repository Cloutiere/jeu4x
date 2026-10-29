/**
 * v5 — JEV-CONTACT-GUERRE (décisions Erik 29/10) — L1 test-first : Jev ne
 * déclare la guerre qu'après un CONTACT RÉEL (unité/ville adverse vue au
 * moins une fois — état de rencontre construit par le harnais à partir de la
 * vision fog) ET un DÉLAI MINIMAL de coexistence depuis la rencontre (10
 * tours par défaut). La question guerre intègre l'ARC de la relation (âge de
 * la rencontre, provocations). Couvre : état de rencontre, masquage de la
 * question avant rencontre, délai, arc au condensé, fausse LLM, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import { getFilteredState } from '@game/rules';
import { jouerPartie } from '../src/partie.mjs';
import { Journal } from '../src/journal.mjs';
import {
  blocDiplomatie,
  condenseJoueur,
  construireQuestionsJoueur,
  tourJevJoueur,
  majRencontres,
} from '../src/joueur.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));
const DELAI = config.seuils.delaiGuerreApresRencontre ?? 10;

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}
import { createInitialState, generateProceduralMap } from '@game/rules';

/** Fixture : état 1v1 avec une capitale synthétique p1 et des unités p2
 * VISIBLES à côté (miroir de etatAvecForces des tests v2). */
function etatAvecContact({ tour = 1, seed = 404, unitesModule = true, villeP2 = false } = {}) {
  const etat = etat1v1(seed);
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 1, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  const units = { ...etat.units };
  if (unitesModule) {
    units.u2_0 = { id: 'u2_0', owner: 'p2', type: 'guerrier', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  if (villeP2) {
    cities.v2 = { id: 'v2', owner: 'p2', q: 7, r: 5, pop: 1, capital: true, buildings: [], workedTiles: [], wonders: [] };
  }
  return {
    ...etat,
    turn: tour,
    units,
    cities,
    players: {
      ...etat.players,
      p1: { ...etat.players.p1, vision: { explored: ['5,5', '6,5', '7,5'], visible: ['5,5', '6,5', '7,5'] } },
    },
  };
}

/** Faux client qui répond 'guerre:<cible>' dès que la question existe. */
function clientGuerre() {
  return {
    async systemOne({ state, questions }) {
      const answers = {};
      for (const [cle, q] of Object.entries(questions)) {
        if (cle === 'guerre') {
          const cible = state.diplomatie.rivaux.find((r) => Object.keys(q.criteria).includes(`guerre:${r.id}`));
          const choix = cible ? `guerre:${cible.id}` : 'aucun';
          answers[cle] = { type: 'choice', choice: choix, confidence: 0.9, probabilities: { [choix]: 0.9 } };
        } else {
          answers[cle] = { type: q.type, ...(q.type === 'score' ? { score: 0 } : { choice: 'aucun' }), confidence: 0.9, probabilities: {} };
        }
      }
      return { model: 'faux-v5', answers, usage: { input_tokens: 100 } };
    },
  };
}

describe('v5 D1 — état de rencontre depuis la vision', () => {
  it('majRencontres : un rival vu (unité OU ville) est enregistré au tour courant', () => {
    const memo = {};
    const filtre = getFilteredState(etatAvecContact({ tour: 7 }), 'p1');
    majRencontres(filtre, 'p1', memo);
    expect(memo.rencontres.p2).toBe(7);
  });

  it('majRencontres : rien de vu → aucune rencontre ; la première rencontre est conservée', () => {
    const memo = {};
    const sansContact = getFilteredState(etatAvecContact({ tour: 3, unitesModule: false, villeP2: false }), 'p1');
    majRencontres(sansContact, 'p1', memo);
    expect(memo.rencontres ?? {}).toEqual({});
    // Contact au tour 7, puis unité plus visible au tour 9 — la rencontre du tour 7 tient.
    const vu = getFilteredState(etatAvecContact({ tour: 7 }), 'p1');
    majRencontres(vu, 'p1', memo);
    const plusVu = getFilteredState(etatAvecContact({ tour: 9, unitesModule: false }), 'p1');
    majRencontres(plusVu, 'p1', memo);
    expect(memo.rencontres.p2).toBe(7);
  });

  it('majRencontres : une ville vue suffit ; le barbare n est jamais un rival rencontré', () => {
    const memo = {};
    const filtre = getFilteredState(etatAvecContact({ tour: 4, unitesModule: false, villeP2: true }), 'p1');
    filtre.units.u_barb = { id: 'u_barb', owner: 'barbarien', type: 'guerrier', q: 6, r: 6, hp: 100, mp: 0, fortified: false, aboard: false };
    majRencontres(filtre, 'p1', memo);
    expect(memo.rencontres.p2).toBe(4);
    expect(memo.rencontres.barbarien).toBeUndefined();
  });
});

describe('v5 D1 — la question guerre est masquée avant contact + délai', () => {
  it('tour 1 sans rencontre : PAS de question guerre (zéro déclaration possible)', () => {
    const filtre = getFilteredState(etatAvecContact({ tour: 1, unitesModule: false }), 'p1');
    const memo = {};
    majRencontres(filtre, 'p1', memo);
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1', memo);
    expect(questions.guerre).toBeUndefined();
  });

  it('rencontré MAIS délai non écoulé : toujours pas de question guerre', () => {
    const filtre = getFilteredState(etatAvecContact({ tour: 1 + (DELAI - 1) }), 'p1');
    const memo = { rencontres: { p2: 1 } };
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1', memo);
    expect(questions.guerre).toBeUndefined();
  });

  it('rencontré + délai écoulé : la question guerre REVIENT (Jev reste belliqueux)', () => {
    const filtre = getFilteredState(etatAvecContact({ tour: 1 + DELAI }), 'p1');
    const memo = { rencontres: { p2: 1 } };
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1', memo), filtre, 'p1', memo);
    expect(questions.guerre).toBeDefined();
    const cles = Object.keys(questions.guerre.criteria).filter((c) => c.startsWith('guerre:'));
    expect(cles).toEqual(['guerre:p2']);
  });
});

describe('v5 D2 — l arc de la relation au condensé et aux critères', () => {
  it('blocDiplomatie expose rencontreTour et toursDepuisRencontre (null sans rencontre)', () => {
    const filtreVu = getFilteredState(etatAvecContact({ tour: 12 }), 'p1');
    const memo = { rencontres: { p2: 4 } };
    const bloc = blocDiplomatie(filtreVu, 'p1', memo);
    expect(bloc.rivaux[0].rencontreTour).toBe(4);
    expect(bloc.rivaux[0].toursDepuisRencontre).toBe(8);
    const blocFrais = blocDiplomatie(filtreVu, 'p1', {});
    expect(blocFrais.rivaux[0].rencontreTour).toBeNull();
    expect(blocFrais.rivaux[0].toursDepuisRencontre).toBeNull();
  });

  it('les critères de guerre portent l âge de la relation et les provocations', () => {
    const filtre = getFilteredState(etatAvecContact({ tour: 1 + DELAI }), 'p1');
    const memo = { rencontres: { p2: 1 } };
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1', memo), filtre, 'p1', memo);
    const libelle = Object.values(questions.guerre.criteria).join(' ');
    expect(libelle).toMatch(/rencontré depuis/i);
    expect(libelle).toMatch(/provocation/i);
  });
});

describe('v5 — tour de décision avec fausse LLM et harnais', () => {
  it('la fausse LLM « oui-guerre » ne peut PAS déclarer avant contact + délai', async () => {
    const client = clientGuerre();
    const memo = {};
    // Tour 1 : rien de vu — aucune guerre.
    const filtre1 = getFilteredState(etatAvecContact({ tour: 1, unitesModule: false }), 'p1');
    const d1 = await tourJevJoueur(client, config, filtre1, 'p1', memo);
    expect(d1.diplomatie.some((x) => x.genre === 'guerre')).toBe(false);
    // Tour 5 : rencontré (l'unité p2 devient visible) — délai non écoulé, aucune guerre.
    const filtre5 = getFilteredState(etatAvecContact({ tour: 5 }), 'p1');
    const d5 = await tourJevJoueur(client, config, filtre5, 'p1', memo);
    expect(d5.diplomatie.some((x) => x.genre === 'guerre')).toBe(false);
    expect(memo.rencontres.p2).toBe(5);
    // Tour 15 : délai écoulé (15 − 5 = 10) — la guerre redevient possible (et la fausse LLM dit oui).
    const filtre15 = getFilteredState(etatAvecContact({ tour: 15 }), 'p1');
    const d15 = await tourJevJoueur(client, config, filtre15, 'p1', memo);
    expect(d15.diplomatie.some((x) => x.genre === 'guerre' && x.cible === 'p2')).toBe(true);
  });

  it('déterminisme : mêmes entrées → mêmes questions (JSON identique)', () => {
    const filtre = getFilteredState(etatAvecContact({ tour: 1 + DELAI }), 'p1');
    const memo = { rencontres: { p2: 1 } };
    const a = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1', { ...memo });
    const b = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1', { ...memo });
    expect(JSON.stringify(a.questions)).toBe(JSON.stringify(b.questions));
  });

  it('partie complète : aucune déclaration de guerre avant rencontre + délai (métrique du banc à 0)', async () => {
    const journal = new Journal(join(racine, 'journaux', 'test-v5-contact.jsonl'));
    await jouerPartie({
      client: clientGuerre(), config, seed: 808, plafondTours: 12, journal, engineJev: 'p1', modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'egypte' } },
    });
    const lignes = readFileSync(join(racine, 'journaux', 'test-v5-contact.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const wars = lignes.filter((l) => l.type === 'diplomatie' && l.genre === 'guerre' && l.ok);
    // Toute déclaration doit être postérieure de ≥ DELAI tours à la rencontre.
    for (const w of wars) {
      const decision = lignes.find((l) => l.type === 'decision' && l.tour === w.tour);
      const r = decision?.condense?.diplomatie?.rivaux?.find((x) => x.id === w.cible);
      expect(r?.rencontreTour).not.toBeNull();
      expect(w.tour - r.rencontreTour).toBeGreaterThanOrEqual(DELAI);
    }
    expect(wars.length).toBe(0); // 12 tours < contact plausible + délai sur ce seed
  });
});
