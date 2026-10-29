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

  it('erreur API : repli + erreur consignés à l’identique', async () => {
    const filtre = fixture(1);
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
