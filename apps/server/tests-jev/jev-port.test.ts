/**
 * JEV-FUMEE-LOBBY · L1 — tests croisés harnais ⇄ serveur (D2) : le port TS du
 * pipeline Jev v3 FIGÉ doit produire, sur les mêmes états filtrés et les
 * mêmes réponses LLM, les MÊMES condensés, questions, décisions (ordres,
 * actions, diplomatie) que le harnais sableuse. Plus les gardes D3/D4 :
 * budget plafonné, échecs consécutifs → désactivation, repli silencieux.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';

import { condenserEtat as condenserEtatTs } from '../src/jev/condense.js';
import { condenseJoueur as condenseJoueurTs, construireQuestionsJoueur as construireTs, prixPaixSuggere as prixTs, tourJevJoueur as tourTs } from '../src/jev/joueur.js';
import { enregistrerAppel, jevActif, jevEtatInitial, coutAppelUsd } from '../src/jev/etat.js';
import { planifierJev, PLAN_JEV_VIDE } from '../src/jev/orchestre.js';

// Harnais sableuse (la VÉRITÉ v3 figée) — comparaison croisée bit à bit.
const { condenserEtat: condenserEtatMjs } = await import('../../../sableuse/src/condense.mjs');
const { condenseJoueur: condenseJoueurMjs, construireQuestionsJoueur: construireMjs, prixPaixSuggere: prixMjs, tourJevJoueur: tourMjs } = await import('../../../sableuse/src/joueur.mjs');

const configJev = JSON.parse(
  readFileSync(new URL('../../../sableuse/questions-joueur.json', import.meta.url), 'utf8'),
);

/** La copie servie au GameDO est IDENTIQUE à la config figée du harnais. */
it('questions-joueur.json : la copie serveur est identique au harnais v3 figé', () => {
  const copie = JSON.parse(readFileSync(new URL('../src/jev/questions-joueur.json', import.meta.url), 'utf8'));
  expect(copie).toEqual(configJev);
});

/** Fixture : état filtré réel (carte procédurale, p2 = nation pilotée). */
function fixture(tour = 1) {
  const seed = 42;
  const gen = generateProceduralMap(seed);
  let etat = createInitialState(gen.map, seed, {});
  // La p2 doit avoir des réserves/techs plausibles dès le tour 1 — l'état
  // initial suffit (capitale + colon). Avance de quelques tours simulés en
  // réglant turn pour varier (le condensé porte turn).
  etat = { ...etat, turn: tour };
  return getFilteredState(etat, 'p2');
}

/** Normalise un memo (le harnais utilise des Set, le port des arrays). */
function memoCanon(memo: any): any {
  return JSON.parse(
    JSON.stringify(memo, (_k, v) => (v instanceof Set ? [...v] : v), 2),
  );
}

describe('Tests croisés condensé (D2)', () => {
  it('condenserEtat : même état filtré ⇒ même condensé bit à bit', () => {
    for (const tour of [1, 2]) {
      const filtre = fixture(tour);
      expect(JSON.parse(JSON.stringify(condenserEtatTs(filtre, 'p2')))).toEqual(
        JSON.parse(JSON.stringify(condenserEtatMjs(filtre, 'p2'))),
      );
    }
  });

  it('condenseJoueur : bloc diplomatie identique', () => {
    const filtre = fixture(1);
    expect(JSON.parse(JSON.stringify(condenseJoueurTs(filtre, 'p2')))).toEqual(
      JSON.parse(JSON.stringify(condenseJoueurMjs(filtre, 'p2'))),
    );
  });

  it('JEV-IT4 : bloc victoire identique (partie calme = bloc neutre ; en course = chiffres exacts)', () => {
    // Partie calme : bloc présent, zéros.
    const calme = fixture(1);
    const cTs = condenseJoueurTs(calme, 'p2');
    const cMjs = condenseJoueurMjs(calme, 'p2');
    expect(cTs.victoire).toEqual(cMjs.victoire);
    expect(cTs.victoire.cibles).toEqual({ jalons: 20, composants: 4, or: 20000 });
    expect(cTs.victoire.mien.jalons).toBe(0);
    // En course : jalons + trésorerie + chantier — port bit à bit.
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    etat = {
      ...etat,
      turn: 40,
      players: {
        ...etat.players,
        p2: { ...etat.players.p2, cultureMilestones: 13 },
        p1: { ...etat.players.p1, cultureMilestones: 8, treasury: 1732 },
      },
    };
    const course = getFilteredState(etat, 'p2');
    expect(condenserEtatTs(course, 'p2').victoire).toEqual(condenserEtatMjs(course, 'p2').victoire);
    expect(condenseJoueurTs(course, 'p2').victoire.rivaux[0].jalons).toBe(8);
  });

  it('T3 · muraille : bloc victoire muraille identique (port bit à bit) + sémantique', () => {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    // p1 tient la Muraille, vue depuis p1 (une ville ennemie hors vision réelle
    // resterait masquée par la brume — le condensé ne trahit pas R-73).
    etat = {
      ...etat,
      cities: {
        ...etat.cities,
        cap1: {
          id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 2, capital: true,
          buildings: [], workedTiles: [], wonders: ['grande_muraille'],
        },
      },
    };
    const filtre = getFilteredState(etat, 'p1');
    expect(condenserEtatTs(filtre, 'p1').victoire).toEqual(condenserEtatMjs(filtre, 'p1').victoire);
    expect(condenserEtatTs(filtre, 'p1').victoire.muraille).toEqual({
      civ: etat.players.p1.civId,
      estMoi: true,
    });
    // sans Muraille : null dans les deux ports.
    const filtre2 = getFilteredState({ ...etat, cities: { ...etat.cities, cap1: { ...etat.cities.cap1!, wonders: [] } } }, 'p1');
    expect(condenserEtatTs(filtre2, 'p1').victoire.muraille).toBeNull();
    expect(condenserEtatMjs(filtre2, 'p1').victoire.muraille).toBeNull();
  });

  it('JEV-IT4 · D3 : partie calme ⇒ AUCUNE question victoire (non-régression v4)', () => {
    const filtre = fixture(1);
    const condense = condenseJoueurTs(filtre, 'p2');
    const { questions, meta } = construireTs(configJev, condense, filtre, 'p2', {});
    expect(questions.finPartie).toBeUndefined();
    expect(questions.productionVictoire).toBeUndefined();
    expect(questions.protegerCapitale).toBeUndefined();
    expect(meta.finPartie).toBeUndefined();
    // Identique côté harnais (port bit à bit des questions).
    const b = construireMjs(configJev, condenseJoueurMjs(filtre, 'p2'), filtre, 'p2', {});
    expect(JSON.parse(JSON.stringify(questions))).toEqual(JSON.parse(JSON.stringify(b.questions)));
  });

  it('JEV-IT4 : en course, questions finPartie/productionVictoire identiques harnais ⇄ serveur', () => {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    // Capitale p2 SYNTHÉTIQUE (createInitialState ne pose pas de villes).
    const cap: any = { id: 'cap2', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] };
    etat = {
      ...etat,
      turn: 40,
      cities: {
        ...etat.cities,
        [cap.id]: { ...cap, buildings: ['vaisseau_habitation'] },
      },
      players: {
        ...etat.players,
        p2: { ...etat.players.p2, cultureMilestones: 13, techsUnlocked: [...(etat.players.p2?.techsUnlocked ?? []), 'vol_spatial'] },
        p1: { ...etat.players.p1, cultureMilestones: 11 },
      },
    };
    const filtre = getFilteredState(etat, 'p2');
    const memoTs: any = { finPartie: { mode: 'science' } };
    const memoMjs: any = { finPartie: { mode: 'science' } };
    const a = construireTs(configJev, condenseJoueurTs(filtre, 'p2', memoTs), filtre, 'p2', memoTs);
    const b = construireMjs(configJev, condenseJoueurMjs(filtre, 'p2', memoMjs), filtre, 'p2', memoMjs);
    expect(a.questions.finPartie).toBeDefined(); // signal (13 jalons ≥ 10)
    expect(JSON.parse(JSON.stringify(a.questions.productionVictoire))).toEqual(
      JSON.parse(JSON.stringify(b.questions.productionVictoire)),
    );
    expect(JSON.parse(JSON.stringify(a.questions.finPartie))).toEqual(
      JSON.parse(JSON.stringify(b.questions.finPartie)),
    );
  });
});

describe('Tests croisés questions (D2)', () => {
  it('construireQuestionsJoueur : mêmes questions et méta', () => {
    const filtre = fixture(1);
    const condenseTs = condenseJoueurTs(filtre, 'p2');
    const condenseMjs = condenseJoueurMjs(filtre, 'p2');
    const a = construireTs(configJev, condenseTs, filtre, 'p2', {});
    const b = construireMjs(configJev, condenseMjs, filtre, 'p2', {});
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('construireQuestionsJoueur avec memo (fondation en cours, échecs) : identique', () => {
    const filtre = fixture(3);
    const memoMjs: any = {
      fondationEnCours: { case: '5,7', tour: 2, unitId: null },
      casesFondationEchouees: new Set(['2,2']),
      techRecherche: 'alphabet',
    };
    const memoTs: any = {
      fondationEnCours: { case: '5,7', tour: 2, unitId: null },
      casesFondationEchouees: ['2,2'],
      techRecherche: 'alphabet',
    };
    const condenseTs = condenseJoueurTs(filtre, 'p2');
    const condenseMjs = condenseJoueurMjs(filtre, 'p2');
    const a = construireTs(configJev, condenseTs, filtre, 'p2', memoTs);
    const b = construireMjs(configJev, condenseMjs, filtre, 'p2', memoMjs);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('prixPaixSuggere : mêmes fourchettes', () => {
    const negoc = { prixPaixBase: 15, facteurFierte: 1.4, plancherRapportForces: 0.5, plafondRapportForces: 2 };
    for (const [agressivite, rapport, treso] of [[1, 1, 100], [1.5, 3, 40], [0.8, 0.3, 0], [2, 1.2, 7]] as const) {
      expect(prixTs(negoc, agressivite, rapport, treso)).toEqual(prixMjs(negoc, agressivite, rapport, treso));
    }
  });
});

/** Faux client LLM : réponses CANNÉES identiques pour les deux pipelines. */
function fauxClient(reponses: Record<string, unknown>) {
  return {
    async systemOne() {
      const answers: any = {};
      for (const [k, v] of Object.entries(reponses)) {
        answers[k] = typeof v === 'string' ? { choice: v, confidence: 0.9 } : v;
      }
      return { answers, usage: { input_tokens: 1000 } };
    },
  };
}

describe('Tests croisés décisions (D2) — mêmes réponses ⇒ mêmes ordres', () => {
  it('réponses confiantes : production + recherche traduites à l’identique', async () => {
    const filtre = fixture(1);
    const condenseTs = condenseJoueurTs(filtre, 'p2');
        const { questions } = construireTs(configJev, condenseTs, filtre, 'p2', {});
    const produire = Object.keys(questions.produire?.criteria ?? {})[0] ?? 'aucun';
    const rechercher = Object.keys(questions.rechercher?.criteria ?? {})[0];
    const reponses: Record<string, unknown> = {
      produire,
      ...(rechercher ? { rechercher } : {}),
      fonder: 'aucun',
      convertir: 'aucun',
      guerre: 'aucun',
    };
    const a = await tourTs(fauxClient(reponses), configJev, filtre, 'p2', {});
    const memoMjs: any = {};
    const b = await tourMjs(fauxClient(reponses), configJev, filtre, 'p2', memoMjs);
    expect(a.ordres).toEqual(b.ordres);
    expect(a.actions).toEqual(b.actions);
    expect(a.diplomatie).toEqual(b.diplomatie);
    expect(a.bloqueGuerreBot).toBe(b.bloqueGuerreBot);
    expect(a.plate).toBe(b.plate);
  });

  it('guerre + fondation : intentions et MultiStep identiques', async () => {
    const filtre = fixture(3);
    const condenseTs = condenseJoueurTs(filtre, 'p2');
        const { questions } = construireTs(configJev, condenseTs, filtre, 'p2', {});
    const cleGuerre = Object.keys(questions.guerre?.criteria ?? {}).find((k) => k.startsWith('guerre:'));
    const cleFonder = Object.keys(questions.fonder?.criteria ?? {}).find((k) => k.startsWith('fonder:'));
    // Un choix guerre bloque le bot même confidentiel ; fondation si un site existe.
    const reponses: Record<string, unknown> = {
      fonder: cleFonder ?? 'aucun',
      guerre: cleGuerre ?? 'aucun',
      produire: 'aucun',
      convertir: 'aucun',
    };
    const memoTs: any = {};
    const a = await tourTs(fauxClient(reponses), configJev, filtre, 'p2', memoTs);
    const memoMjs: any = {};
    const b = await tourMjs(fauxClient(reponses), configJev, filtre, 'p2', memoMjs);
    expect(a.ordres).toEqual(b.ordres);
    expect(a.diplomatie).toEqual(b.diplomatie);
    expect(a.bloqueGuerreBot).toBe(b.bloqueGuerreBot);
    // Les deux mémos portent la même programmation de fondation.
    expect(memoCanon(memoTs).fondationEnCours ?? null).toEqual(memoCanon(memoMjs).fondationEnCours ?? null);
  });

  it('réponses indécises : repli de conversion appliqué à l’identique', async () => {
    const filtre = fixture(1);
    const reponses: Record<string, unknown> = {
      produire: 'aucun',
      fonder: 'aucun',
      guerre: 'aucun',
      convertir: { choice: 'aucun', confidence: 0.3 }, // sous le seuil dialogue 0,5
    };
    const a = await tourTs(fauxClient(reponses), configJev, filtre, 'p2', {});
    const b = await tourMjs(fauxClient(reponses), configJev, filtre, 'p2', {});
    expect(a.actions).toEqual(b.actions);
  });

  it('JEV-IT4 : finPartie domination ⇒ mêmes ordres et mêmes mémos', async () => {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    etat = {
      ...etat,
      turn: 40,
      players: {
        ...etat.players,
        p2: { ...etat.players.p2, cultureMilestones: 12 },
        p1: { ...etat.players.p1, cultureMilestones: 9 },
      },
    };
    const filtre = getFilteredState(etat, 'p2');
    const reponses: Record<string, unknown> = { finPartie: 'viserMaVictoire:domination' };
    const memoTs: any = {};
    const a = await tourTs(fauxClient(reponses), configJev, filtre, 'p2', memoTs);
    const memoMjs: any = {};
    const b = await tourMjs(fauxClient(reponses), configJev, filtre, 'p2', memoMjs);
    expect(a.ordres).toEqual(b.ordres);
    expect(a.attentes).toEqual(b.attentes);
    expect(memoCanon(memoTs).finPartie ?? null).toEqual(memoCanon(memoMjs).finPartie ?? null);
    expect(memoTs.finPartie).toEqual({ mode: 'domination' });
    // L'ordre poussé est un candidat DÉJÀ listé (jamais d'ordre hors liste).
    const item = a.ordres.find((o) => o.type === 'SetProduction')?.item;
    if (item) {
      expect((a.condense.candidats.productionCapitale ?? []).some((c: any) => c.cle === `${item.kind}:${item.id}`)).toBe(true);
    }
  });

  it('JEV-DECISIONNEL v8 : choix guerreTotale RETIRÉ — questions et refus identiques harnais ⇄ serveur', async () => {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    // Capitale p1 SYNTHÉTIQUE voisine (vue de p2) + légion p2 (rapport > 1,2)
    // + signal de gate (12 jalons p2). Miroir etatCourse des tests v6b.
    etat = {
      ...etat,
      turn: 40,
      cities: {
        ...etat.cities,
        cap1: { id: 'cap1', owner: 'p1', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
        cap2: { id: 'cap2', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
      },
      units: {
        ...etat.units,
        u_moi: { id: 'u_moi', owner: 'p2', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
        // v9 D-B : 2 légions p1 visibles — le rapport passe SOUS l'écrasement
        // (≥ 3) pour que ce test reste un test de REFUS de la forme retirée.
        u_adv0: { id: 'u_adv0', owner: 'p1', type: 'legion', q: 8, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
        u_adv1: { id: 'u_adv1', owner: 'p1', type: 'legion', q: 8, r: 6, hp: 100, mp: 0, fortified: false, aboard: false },
      },
      players: {
        ...etat.players,
        p2: {
          ...etat.players.p2,
          cultureMilestones: 12,
          vision: { explored: ['5,5', '6,5', '8,5'], visible: ['5,5', '6,5', '8,5'] },
        },
        p1: { ...etat.players.p1, cultureMilestones: 3 },
      },
    };
    const filtre = getFilteredState(etat, 'p2');
    const memoTs: any = { finPartie: { mode: 'domination' } };
    const memoMjs: any = { finPartie: { mode: 'domination' } };
    const a = construireTs(configJev, condenseJoueurTs(filtre, 'p2', memoTs), filtre, 'p2', memoTs);
    const b = construireMjs(configJev, condenseJoueurMjs(filtre, 'p2', memoMjs), filtre, 'p2', memoMjs);
    expect(a.questions.finPartie).toBeDefined();
    // v8 D2 : PLUS AUCUN critère guerreTotale dans la question (les deux côtés).
    expect(Object.keys(a.questions.finPartie!.criteria)).not.toContain('guerreTotale:p1');
    expect(a.questions.finPartie).toEqual(JSON.parse(JSON.stringify(b.questions.finPartie)));
    // Décision : la réponse résiduelle est IGNORÉE à l'identique (aucune
    // intention de guerre, mémo inchangé — l'acte mécanique seul émet).
    const reponses: Record<string, unknown> = { finPartie: 'guerreTotale:p1' };
    const dTs = await tourTs(fauxClient(reponses), configJev, filtre, 'p2', memoTs);
    const dMjs = await tourMjs(fauxClient(reponses), configJev, filtre, 'p2', memoMjs);
    expect(dTs.diplomatie).toEqual(dMjs.diplomatie);
    expect(dTs.diplomatie).not.toContainEqual({ genre: 'guerre', cible: 'p1' });
    expect(dTs.diplomatie).toEqual([]);
    expect(memoCanon(memoTs).finPartie).toEqual({ mode: 'domination' });
    expect(memoCanon(memoMjs).finPartie).toEqual({ mode: 'domination' });
    // Cible invalide : même refus silencieux des deux côtés.
    const dTs2 = await tourTs(fauxClient({ finPartie: 'guerreTotale:zz' }), configJev, filtre, 'p2', memoTs);
    const dMjs2 = await tourMjs(fauxClient({ finPartie: 'guerreTotale:zz' }), configJev, filtre, 'p2', memoMjs);
    expect(dTs2.diplomatie).toEqual([]);
    expect(dTs2.diplomatie).toEqual(dMjs2.diplomatie);
  });

  it('JEV-IT4B · amendement aveugle : rival jamais rencontré + domination mécanique ⇒ questions/décision identiques', async () => {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    etat = {
      ...etat,
      turn: 40,
      cities: {
        ...etat.cities,
        cap1: { id: 'cap1', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
        v1: { id: 'v1', owner: 'p2', q: 6, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] },
        v2: { id: 'v2', owner: 'p2', q: 7, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] },
        v3: { id: 'v3', owner: 'p2', q: 6, r: 4, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] },
        // cap p1 REPoussée hors du rayon de vision (canon fog) → jamais vue.
        cap1adv: { id: 'cap1adv', owner: 'p1', q: 20, r: 5, pop: 1, capital: true, buildings: [], workedTiles: [], wonders: [] },
      },
      units: {
        ...etat.units,
        u_moi: { id: 'u_moi', owner: 'p2', type: 'legion', q: 4, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
      },
      players: {
        ...etat.players,
        p2: { ...etat.players.p2, cultureMilestones: 0 },
        p1: { ...etat.players.p1, cultureMilestones: 0 },
      },
    };
    const filtre = getFilteredState(etat, 'p2');
    const memoTs: any = { finPartie: { mode: 'domination' } };
    const memoMjs: any = { finPartie: { mode: 'domination' } };
    const a = construireTs(configJev, condenseJoueurTs(filtre, 'p2', memoTs), filtre, 'p2', memoTs);
    const b = construireMjs(configJev, condenseJoueurMjs(filtre, 'p2', memoMjs), filtre, 'p2', memoMjs);
    expect(a.questions.finPartie).toBeDefined(); // signal D-B (4 villes, rapport ≥ 2)
    expect(Object.keys(a.questions.finPartie!.criteria).some((k) => k.startsWith('guerreTotale:'))).toBe(false);
    expect(a.questions.finPartie).toEqual(JSON.parse(JSON.stringify(b.questions.finPartie)));
    // v8 D1 : l'acte MÉCANIQUE — la déclaration part SANS choix LLM
    // (réponse 'continuer' ici), bit-à-bit des deux côtés, bascule memo D4.
    const dTs = await tourTs(fauxClient({ finPartie: 'continuer' }), configJev, filtre, 'p2', memoTs);
    const dMjs = await tourMjs(fauxClient({ finPartie: 'continuer' }), configJev, filtre, 'p2', memoMjs);
    expect(dTs.diplomatie).toEqual(dMjs.diplomatie);
    expect(dTs.diplomatie).toEqual([{ genre: 'guerre', cible: 'p1', mecanique: true, motif: 'domination' }]);
    expect(memoCanon(memoTs).finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p1' });
    expect(memoCanon(memoMjs).finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p1' });
    expect(memoTs.guerreMecaniqueTour).toBe(40);
    expect(memoMjs.guerreMecaniqueTour).toBe(40);
  });

  it('erreur API : repli + erreur consignés à l’identique', async () => {    const filtre = fixture(1);
    const mauvaisClient = {
      async systemOne() {
        throw new Error('panne API');
      },
    };
    const a = await tourTs(mauvaisClient as any, configJev, filtre, 'p2', {});
    const b = await tourMjs(mauvaisClient as any, configJev, filtre, 'p2', {});
    expect(a.repli).toBe(true);
    expect(b.repli).toBe(true);
    expect(a.erreur).toBe(b.erreur);
    expect(a.ordres).toEqual(b.ordres);
  });
});

describe('Budget et replis (D3/D4)', () => {
  it('3 échecs consécutifs → désactivation (bot pur pour la partie)', () => {
    const etat = jevEtatInitial();
    expect(jevActif(etat)).toBe(true);
    enregistrerAppel(etat, false, 0);
    enregistrerAppel(etat, false, 0);
    expect(jevActif(etat)).toBe(true); // 2 échecs : encore actif
    enregistrerAppel(etat, false, 0);
    expect(etat.desactive).toBe('echecs');
    expect(jevActif(etat)).toBe(false);
    // Un succès ultérieur ne réactive PAS Jev (désactivation pour la partie).
    enregistrerAppel(etat, true, 500);
    expect(jevActif(etat)).toBe(false);
  });

  it('plafond budget 0,25 $ → Jev devient bot pur', () => {
    const etat = jevEtatInitial();
    enregistrerAppel(etat, true, 3_000_000); // 3M jetons × 0,042/M = 0,126 $
    expect(jevActif(etat)).toBe(true);
    enregistrerAppel(etat, true, 3_000_000);
    expect(etat.budgetUsd).toBeGreaterThanOrEqual(0.25);
    expect(etat.desactive).toBe('budget');
    expect(jevActif(etat)).toBe(false);
  });

  it('un succès remet les échecs consécutifs à zéro', () => {
    const etat = jevEtatInitial();
    enregistrerAppel(etat, false, 0);
    enregistrerAppel(etat, true, 1000);
    expect(etat.echecsConsecutifs).toBe(0);
    expect(etat.desactive).toBe('non');
  });

  it('coutAppelUsd : formule du harnais (jetons × 0,042/M)', () => {
    expect(coutAppelUsd(1_000_000)).toBeCloseTo(0.042, 6);
    expect(coutAppelUsd(3426)).toBeCloseTo((3426 * 0.042) / 1e6, 9);
  });
});

describe('fusionnerPlan — les ordres Jev remplacent les ordres bot par sujet', () => {
  it('SetProduction Jev remplace le SetProduction bot de la même ville ; les autres ordres bot sont conservés', async () => {
    const { fusionnerPlan } = await import('../src/jev/joueur.js');
    const bot = [
      { type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'grande_muraille' } },
      { type: 'SetProduction', cityId: 'c2', item: { kind: 'unit', id: 'guerrier' } },
      { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 1 }] },
    ];
    const jev = [{ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }];
    const fusion = fusionnerPlan(bot, jev);
    expect(fusion.filter((o) => o.type === 'SetProduction' && (o as any).cityId === 'c1')).toEqual(jev);
    expect(fusion.some((o) => (o as any).cityId === 'c2')).toBe(true); // les autres villes : bot
    expect(fusion.some((o) => (o as any).unitId === 'u1')).toBe(true); // tactique : bot
  });

  it('MultiStep Jev remplace tout ordre bot portant le même colon', async () => {
    const { fusionnerPlan } = await import('../src/jev/joueur.js');
    const bot = [
      { type: 'Move', unitId: 'u9', path: [{ q: 2, r: 2 }] },
      { type: 'FoundCity', unitId: 'u9' },
    ];
    const jev = [{ type: 'MultiStep', unitId: 'u9', path: [{ q: 5, r: 5 }], final: 'foundCity' }];
    const fusion = fusionnerPlan(bot, jev);
    expect(fusion).toEqual(jev);
  });
});

describe('planifierJev (orchestre GameDO)', () => {
  const seed = 42;
  const etatMoteur = (() => {
    const gen = generateProceduralMap(seed);
    return createInitialState(gen.map, seed, {});
  })();

  it('client absent (pas de clé) → plan vide, aucune erreur', async () => {
    const plan = await planifierJev({
      client: null,
      game: etatMoteur,
      seed,
      seat: 'p2',
      config: configJev,
      etat: jevEtatInitial(),
    });
    expect(plan).toEqual(PLAN_JEV_VIDE);
  });

  it('Jev désactivé (3 échecs) → plan vide sans appel LLM', async () => {
    const etat = jevEtatInitial();
    enregistrerAppel(etat, false, 0);
    enregistrerAppel(etat, false, 0);
    enregistrerAppel(etat, false, 0);
    let appels = 0;
    const plan = await planifierJev({
      client: {
        async systemOne() {
          appels += 1;
          return { answers: {} };
        },
      },
      game: etatMoteur,
      seed,
      seat: 'p2',
      config: configJev,
      etat,
    });
    expect(appels).toBe(0);
    expect(plan.ordres).toEqual([]);
  });

  it('erreur API → repli silencieux + échec compté ; au 3e, désactivé', async () => {
    const etat = jevEtatInitial();
    const mauvais = { async systemOne() { throw new Error('panne'); } };
    const plan1 = await planifierJev({ client: mauvais as any, game: etatMoteur, seed, seat: 'p2', config: configJev, etat });
    expect(plan1.ordres).toEqual([]);
    expect(plan1.intentions).toEqual([]);
    expect(etat.echecsConsecutifs).toBe(1);
    await planifierJev({ client: mauvais as any, game: etatMoteur, seed, seat: 'p2', config: configJev, etat });
    const plan3 = await planifierJev({ client: mauvais as any, game: etatMoteur, seed, seat: 'p2', config: configJev, etat });
    expect(etat.desactive).toBe('echecs');
    expect(plan3.entreeJournal?.erreur).toContain('panne');
  });

  it('décision réussie → budget crédité + entrée de journal complète', async () => {
    const etat = jevEtatInitial();
    const filtre = getFilteredState(etatMoteur, 'p2');
        const condenseTs = condenseJoueurTs(filtre, 'p2');
    const { questions } = construireTs(configJev, condenseTs, filtre, 'p2', {});
    const produire = Object.keys(questions.produire?.criteria ?? {})[0] ?? 'aucun';
    const plan = await planifierJev({
      client: fauxClient({ produire, fonder: 'aucun', guerre: 'aucun', convertir: 'aucun' }) as any,
      game: etatMoteur,
      seed,
      seat: 'p2',
      config: configJev,
      etat,
    });
    expect(etat.budgetUsd).toBeGreaterThan(0);
    expect(plan.entreeJournal).not.toBeNull();
    expect(plan.entreeJournal!.condense).toBeDefined();
    expect(plan.entreeJournal!.jetonsEntree).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// JEV-CALIBRAGE-OFFENSIF (31/10) — v6c : théâtre, marche, D-B, D-C
// ---------------------------------------------------------------------------
import { calculerTheatre as theatreTs } from '../src/jev/joueur.js';
const { calculerTheatre: theatreMjs } = await import('../../../sableuse/src/joueur.mjs');

function etatGuerreV6c({ guerre = true, theatre = true } = {}) {
  const seed = 101;
  const gen = generateProceduralMap(seed);
  let etat = createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
    cap2: { id: 'cap2', owner: 'p2', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
    v1_1: { id: 'v1_1', owner: 'p1', q: 6, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] },
    v1_2: { id: 'v1_2', owner: 'p1', q: 7, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] },
  };
  const units = {
    ...etat.units,
    u_moi_0: { id: 'u_moi_0', owner: 'p1', type: 'legion', q: 6, r: 5, hp: 100, mp: 2, fortified: false, aboard: false },
    u_moi_1: { id: 'u_moi_1', owner: 'p1', type: 'legion', q: 5, r: 6, hp: 100, mp: 2, fortified: false, aboard: false },
  };
  etat = {
    ...etat,
    turn: 40,
    cities,
    units,
    diplomacy: guerre ? { ...etat.diplomacy, war: [['p1', 'p2']] } : etat.diplomacy,
    players: {
      ...etat.players,
      p1: { ...etat.players.p1, vision: { explored: ['5,5', '6,5', '5,6', '8,5'], visible: ['5,5', '6,5', '5,6', '8,5'] } },
      p2: { ...etat.players.p2 },
    },
  };
  const memo = { finPartie: { mode: 'domination' } };
  const filtre = getFilteredState(etat, 'p1');
  if (theatre) filtre.theatre = theatreMjs(etat, 'p1', memo);
  return { etat, filtre, memo };
}

describe('JEV-CALIBRAGE-OFFENSIF · v6c croisé (théâtre, marche, D-B, D-C)', () => {
  it('calculerTheatre : harnais ⇄ port bit à bit (guerre, domination, vide)', () => {
    const { etat } = etatGuerreV6c({ guerre: true });
    const memo = { finPartie: { mode: 'domination' } };
    expect(theatreTs(etat, 'p1', memo)).toEqual(theatreMjs(etat, 'p1', memo));
    expect(theatreTs(etat, 'p1', {})).toEqual(theatreMjs(etat, 'p1', {}));
    const calme = etatGuerreV6c({ guerre: false }).etat;
    expect(theatreTs(calme, 'p1', {})).toEqual(theatreMjs(calme, 'p1', {}));
  });

  it('condenseJoueur avec théâtre : rivaux capitolent direction/distance identiques', () => {
    const { etat, filtre, memo } = etatGuerreV6c();
    filtre.theatre = theatreMjs(etat, 'p1', memo);
    const cTs = JSON.parse(JSON.stringify(condenseJoueurTs(filtre, 'p1', memo)));
    const cMjs = JSON.parse(JSON.stringify(condenseJoueurMjs(filtre, 'p1', memo)));
    expect(cTs.diplomatie.rivaux[0].capitaleDirection).toBe('E');
    expect(cTs).toEqual(cMjs);
  });

  it('D-C : paix/compensation absentes en domination (rapport ≥ 1) — questions identiques', () => {
    const { filtre, memo } = etatGuerreV6c();
    const cTs = condenseJoueurTs(filtre, 'p1', memo);
    const cMjs = JSON.parse(JSON.stringify(condenseJoueurMjs(filtre, 'p1', memo)));
    expect(cTs.diplomatie.rivaux[0].rapportForces).toBe(cMjs.diplomatie.rivaux[0].rapportForces);
    const qTs = construireTs(configJev, cTs, filtre, 'p1', memo);
    const qMjs = construireMjs(configJev, JSON.parse(JSON.stringify(cTs)), JSON.parse(JSON.stringify(filtre)), 'p1', memo);
    expect(qTs.questions.paix).toBeUndefined();
    expect(qMjs.questions.paix).toBeUndefined();
    expect(JSON.parse(JSON.stringify(qTs.questions))).toEqual(JSON.parse(JSON.stringify(qMjs.questions)));
  });

  it('marche (D-E2) : mêmes réponses ⇒ mêmes MultiStep bit à bit', async () => {
    const { filtre, memo } = etatGuerreV6c();
    const condense = condenseJoueurTs(filtre, 'p1', memo);
    const faux = () => ({ async systemOne() { return { answers: {}, usage: { input_tokens: 100 } }; } });
    const dTs = await tourTs(faux() as any, configJev, JSON.parse(JSON.stringify(filtre)), 'p1', { ...memo });
    const dMjs = await tourMjs(faux(), configJev, JSON.parse(JSON.stringify(filtre)), 'p1', { ...memo });
    const marcheTs = dTs.ordres.filter((o: any) => o.type === 'MultiStep');
    const marcheMjs = dMjs.ordres.filter((o: any) => o.type === 'MultiStep');
    expect(marcheTs.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(marcheTs))).toEqual(JSON.parse(JSON.stringify(marcheMjs)));
  });
});

describe('JEV-STRATEGE v9 — tests croisés (bit à bit)', () => {
  /** Fixture 1v1 : Jev (p2) fort, voisine p1 vue — purge des unités de
   * départ pour des rapports DÉTERMINISTES (2/légion). */
  function fixtureStratege({ legionsMoi = 4, legionsAdv = 0, tour = 40 } = {}) {
    const gen = generateProceduralMap(42);
    let etat = createInitialState(gen.map, 42, {});
    const units: any = {};
    for (let i = 0; i < legionsMoi; i++) {
      units[`u_moi_${i}`] = { id: `u_moi_${i}`, owner: 'p2', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false };
    }
    for (let i = 0; i < legionsAdv; i++) {
      units[`u_adv_${i}`] = { id: `u_adv_${i}`, owner: 'p1', type: 'legion', q: 7, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
    }
    etat = {
      ...etat,
      turn: tour,
      cities: {
        ...etat.cities,
        cap1: { id: 'cap1', owner: 'p1', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
        cap2: { id: 'cap2', owner: 'p2', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
      },
      units,
      players: {
        ...etat.players,
        p2: { ...etat.players.p2, vision: { explored: ['5,5', '6,5', '8,5'], visible: ['5,5', '6,5', '8,5'] } },
      },
    };
    return getFilteredState(etat, 'p2');
  }

  it('D-B écrasement : rapport ≥ 3 SANS mode ⇒ déclaration mécanique identique (motif ecrasement)', async () => {
    const filtre = fixtureStratege();
    const faux = () => ({ async systemOne() { return { answers: {}, usage: { input_tokens: 100 } }; } });
    const memoTs: any = {};
    const memoMjs: any = {};
    const dTs = await tourTs(faux() as any, configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoTs);
    const dMjs = await tourMjs(faux(), configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoMjs);
    expect(dTs.diplomatie).toEqual(dMjs.diplomatie);
    expect(dTs.diplomatie).toEqual([{ genre: 'guerre', cible: 'p1', mecanique: true, motif: 'ecrasement' }]);
    expect(memoCanon(memoTs).finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p1' });
    expect(memoCanon(memoTs).finPartie).toEqual(memoCanon(memoMjs).finPartie);
    expect(memoTs.guerreMecaniqueTour).toBe(40);
  });

  it('D-A opportunité : questions finPartie (opportuniste) identiques ; choix de voie ⇒ memo identique', async () => {
    // rapport 2 (≥ 2 — opportunité domination) mais < 3 (pas d'écrasement).
    const filtre = fixtureStratege({ legionsMoi: 1, tour: 40 });
    const a = construireTs(configJev, condenseJoueurTs(filtre, 'p2', {}, configJev.seuils), filtre, 'p2', {});
    const b = construireMjs(configJev, condenseJoueurMjs(filtre, 'p2', {}, configJev.seuils), filtre, 'p2', {});
    expect(JSON.parse(JSON.stringify(a.questions))).toEqual(JSON.parse(JSON.stringify(b.questions)));
    // choix de voie : memo persisté à l'identique.
    const faux = () => ({ async systemOne() { return { answers: { finPartie: { choice: 'viserMaVictoire:domination', confidence: 0.9 } }, usage: { input_tokens: 100 } }; } });
    const memoTs: any = {};
    const memoMjs: any = {};
    await tourTs(faux() as any, configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoTs);
    await tourMjs(faux(), configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoMjs);
    expect(memoCanon(memoTs).finPartie).toEqual({ mode: 'domination' });
    expect(memoTs.decisionVoieTour).toBe(memoMjs.decisionVoieTour);
  });

  it('C2 espace : bloc espace identique + liste blanche (jamais de position ni de plan adverse)', () => {
    const filtre = fixtureStratege({ legionsMoi: 1 });
    const cTs = condenseJoueurTs(filtre, 'p2', {}, configJev.seuils);
    const cMjs = condenseJoueurMjs(filtre, 'p2', {}, configJev.seuils);
    expect(cTs.espace).toEqual(cMjs.espace);
    expect(Object.keys(cTs.espace).sort()).toEqual(['sature', 'sitesCorrects']);
    expect(JSON.stringify(cTs.espace)).not.toMatch(/"(q|r)":/);
  });

  it('C2 conquête d\'espace : question + traduction identiques (cible LLM, déclaration mécanique)', async () => {
    const filtre = fixtureStratege({ legionsMoi: 1 });
    const cTs = condenseJoueurTs(filtre, 'p2', {}, configJev.seuils);
    const a = construireTs(configJev, cTs, filtre, 'p2', {});
    const b = construireMjs(configJev, JSON.parse(JSON.stringify(cTs)), JSON.parse(JSON.stringify(filtre)), 'p2', {});
    expect(JSON.parse(JSON.stringify(a.questions.conqueteEspace ?? null)))
      .toEqual(JSON.parse(JSON.stringify(b.questions.conqueteEspace ?? null)));
    if (a.questions.conqueteEspace) {
      const cle = Object.keys(a.questions.conqueteEspace.criteria)[0];
      const faux = (c: string) => ({ async systemOne() { return { answers: { conqueteEspace: { choice: c, confidence: 0.9 } }, usage: { input_tokens: 100 } }; } });
      const memoTs: any = {};
      const memoMjs: any = {};
      const dTs = await tourTs(faux(cle) as any, configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoTs);
      const dMjs = await tourMjs(faux(cle), configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoMjs);
      expect(dTs.diplomatie).toEqual(dMjs.diplomatie);
      expect(dTs.diplomatie).toEqual([{ genre: 'guerre', cible: 'p1', mecanique: true, motif: 'espace' }]);
      expect(memoTs.guerreMecaniqueTour).toBe(memoMjs.guerreMecaniqueTour);
      // forme invalide : ignorée à l'identique
      const memoTs2: any = {};
      const memoMjs2: any = {};
      const eTs = await tourTs(faux('guerre:p1') as any, configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoTs2);
      const eMjs = await tourMjs(faux('guerre:p1'), configJev, JSON.parse(JSON.stringify(filtre)), 'p2', memoMjs2);
      expect(eTs.diplomatie).toEqual(eMjs.diplomatie);
      expect(eTs.diplomatie).toEqual([]);
      expect(memoTs2.guerreMecaniqueTour).toBeUndefined();
    }
  });
});

describe('JEV-CROISSANCE — parité config gainSite (harnais ⇄ serveur)', () => {
  it('configCondense.gainSite est bit à bit des deux côtés (calibrage data JEV-CROISSANCE)', async () => {
    const { configCondense: configTs } = await import('../src/jev/condense.js');
    const { configCondense: configMjs } = await import('../../../sableuse/src/condense.mjs');
    expect(configTs.gainSite).toEqual(configMjs.gainSite);
    // verrou de valeurs (recalcul L1 : fenêtre ≥ 3 sites jusqu'à t300, 3 seeds)
    expect(configMjs.gainSite.penaliteDistance).toBe(1);
    expect(configMjs.gainSite.partCouronne1).toBe(0.75);
    expect(configMjs.gainSite.partCouronne2).toBe(0.375);
    expect(configMjs.gainSite.penaliteRisque).toBe(3); // risque INCHANGÉ (D1)
  });
});
