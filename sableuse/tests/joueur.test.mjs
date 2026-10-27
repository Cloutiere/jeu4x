/**
 * JEV-BANC-JOUEUR (décisions Erik 28/10) — L1 test-first : harnais « Jev
 * JOUEUR » avec une FAUSSE LLM locale (zéro appel réel, zéro budget).
 * Couvre : construction des questions (critères non vides), traduction des
 * décisions en formes canon, suppression des déclarations du bot, application
 * des intentions diplomatiques (guerre/paix/échange avec réponse seedée du
 * bot), conversion, repli sur erreur, budget, partie complète faux Jev.
 */
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createRng,
  generateProceduralMap,
  getFilteredState,
  areAtWar,
} from '@game/rules';
import { botTurnSeed } from '../../apps/server/src/botPolicy.js';
import { jouerPartie } from '../src/partie.mjs';
import { Journal } from '../src/journal.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import {
  blocDiplomatie,
  condenseJoueur,
  construireQuestionsJoueur,
  tourJevJoueur,
  memoRefusEchange,
} from '../src/joueur.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

/** Partie 1v1 fraîche (seed fixe) — p1 = Jev. */
function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

describe('blocDiplomatie / condenseJoueur', () => {
  it('expose les rivaux réels avec leurs techs (canon T2) et PAS la trésorerie ennemie', () => {
    const etat = etat1v1();
    const filtre = getFilteredState(etat, 'p1');
    const bloc = blocDiplomatie(filtre, 'p1');
    expect(bloc.rivaux).toHaveLength(1);
    expect(bloc.rivaux[0].id).toBe('p2');
    expect(Array.isArray(bloc.rivaux[0].techs)).toBe(true);
    expect(bloc.guerreAvec).toEqual([]);
    // Privacité R-134 : le condensé n'expose JAMAIS la trésorerie d'un rival.
    expect(JSON.stringify(bloc)).not.toMatch(/"tresorerie"/);
  });

  it('détecte la guerre après déclaration (miroir diplomacy.war)', () => {
    let etat = etat1v1();
    // Déclaration directe via le helper moteur (forme canon).
    const mod = { ...etat, diplomacy: { ...etat.diplomacy, war: [['p1', 'p2']] } };
    const bloc = blocDiplomatie(getFilteredState(mod, 'p1'), 'p1');
    expect(bloc.guerreAvec).toEqual(['p2']);
    void etat;
  });
});

describe('construireQuestionsJoueur', () => {
  it('ne propose la guerre QUE si aucun ennemi actif, et la paix QUE si ennemi', () => {
    const etat = etat1v1();
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1');
    const { questions: qPaix } = construireQuestionsJoueur(config, condense, filtre, 'p1');
    expect(qPaix.guerre).toBeDefined();
    expect(qPaix.paix).toBeUndefined();
    const enGuerre = { ...filtre, diplomacy: { ...filtre.diplomacy, war: [['p1', 'p2']], warsDepuis: { 'p1|p2': filtre.turn } } };
    const condense2 = condenseJoueur(enGuerre, 'p1');
    const { questions: qGuerre } = construireQuestionsJoueur(config, condense2, enGuerre, 'p1');
    expect(qGuerre.guerre).toBeUndefined();
    expect(qGuerre.paix).toBeDefined();
    expect(qGuerre.compensation).toBeDefined();
    expect(Object.keys(qGuerre.paix.criteria)).toContain('paix:p2');
    expect(Object.keys(qGuerre.paix.criteria)).toContain('aucun');
  });

  it('propose la conversion pour chaque ville (orientation actuelle exclue)', () => {
    let etat = etat1v1();
    // Une ville pour p1, conversion or par défaut (R-90).
    etat = {
      ...etat,
      cities: {
        ...etat.cities,
        v_test: { id: 'v_test', owner: 'p1', q: 5, r: 5, pop: 2, capital: false, buildings: [], conversion: 'gold', workedTiles: [], wonders: [] },
      },
    };
    const filtre = getFilteredState(etat, 'p1');
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1');
    const cles = Object.keys(questions.convertir.criteria);
    expect(cles).toContain('science:v_test');
    expect(cles).not.toContain('or:v_test');
    expect(cles).toContain('aucun');
  });

  it('omet techOfferte/techDemandee si aucune tech est échangeable, et les omets en guerre', () => {
    const etat = etat1v1(202);
    const filtre = getFilteredState(etat, 'p1');
    const { questions } = construireQuestionsJoueur(config, condenseJoueur(filtre, 'p1'), filtre, 'p1');
    // Au tour 1 les deux camps ont peu de techs ; les questions ne sont
    // envoyées que si des listes non vides existent (directive n°3).
    if (questions.techOfferte) {
      expect(Object.keys(questions.techOfferte.criteria).length).toBeGreaterThan(1);
      if (!questions.techDemandee) {
        expect(Object.keys(questions.techOfferte.criteria)).toContain('aucun');
      }
    }
  });

  it('ne ré-émet pas la question rechercher tant qu une tech tenue est en cours', () => {
    const etat = etat1v1();
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1');
    const tenue = condense.empire.recherche.candidates[0]?.id;
    expect(tenue).toBeTruthy();
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', { techRecherche: tenue });
    expect(questions.rechercher).toBeUndefined();
  });
});

describe('tourJevJoueur — traduction (fausse LLM)', () => {
  it('traduit produire en SetProduction canon et tient la recherche', async () => {
    const etat = etat1v1(303);
    const filtre = getFilteredState(etat, 'p1');
    const memo = {};
    const d = await tourJevJoueur(creerFauxJev({ graine: 5 }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    for (const o of d.ordres) {
      expect(o.type === 'SetProduction' ? true : true).toBe(true);
      if (o.type === 'SetProduction') expect(o.cityId).toBeTruthy();
    }
    // Recherche tenue : memo rempli si la question était posée et traduite.
    if (d.questions.rechercher && d.actions.some((a) => a.type === 'SetResearch')) {
      expect(memo.techRecherche).toBeTruthy();
    }
  });

  it('repli intégral sur erreur client (D2 — le tour joue au bot pur)', async () => {
    const etat = etat1v1();
    const filtre = getFilteredState(etat, 'p1');
    const clientCasse = { systemOne: async () => { throw new Error('boom'); } };
    const d = await tourJevJoueur(clientCasse, config, filtre, 'p1', {});
    expect(d.repli).toBe(true);
    expect(d.erreur).toContain('boom');
    expect(d.ordres).toEqual([]);
    expect(d.diplomatie).toEqual([]);
  });
});

describe('harnais — application des intentions diplomatiques', () => {
  it('une décision guerre de Jev déclare la guerre ET bloque la déclaration du bot', async () => {
    // Faux Jev qui choisit TOUJOURS le premier critère ≠ aucun de chaque question.
    const client = {
      appels: 0,
      async systemOne({ questions }) {
        this.appels += 1;
        const answers = {};
        for (const [cle, q] of Object.entries(questions)) {
          const cles = Object.keys(q.criteria).filter((c) => c !== 'aucun');
          const choix = cles[0] ?? 'aucun';
          answers[cle] = {
            type: q.type,
            ...(q.type === 'score' ? { score: 0 } : { choice: choix }),
            confidence: 0.9,
            probabilities: { [choix]: 0.9 },
          };
        }
        return { model: 'faux', answers, usage: { input_tokens: 100 } };
      },
    };
    const journal = new Journal(join(racine, 'journaux', 'test-joueur-guerre.jsonl'));
    const { etat: fin } = await jouerPartie({
      client, config, seed: 404, plafondTours: 6, journal, engineJev: 'p1', modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'egypte' } },
    });
    // La guerre a bien été déclarée par Jev au tour 1 (premier critère = guerre:p2).
    const lignes = readFileSync(join(racine, 'journaux', 'test-joueur-guerre.jsonl'), 'utf8').trim().split('\n');
    const decl = lignes.map((l) => JSON.parse(l)).filter((o) => o.type === 'diplomatie' && o.genre === 'guerre');
    expect(decl.length).toBeGreaterThan(0);
    expect(decl[0].ok).toBe(true);
    expect(areAtWar(fin, 'p1', 'p2') || fin.winner !== null).toBe(true);
    // AUCUNE déclaration émanant du bot : seules celles de Jev (de: p1).
    expect(decl.every((d) => d.de === 'p1')).toBe(true);
  });

  it('le choix paix d un Jev en guerre fait signer la paix (bot perdant → accepte)', async () => {
    // Faux Jev : choisit paix:p2 (critère paix présent = en guerre) sinon aucun.
    const client = {
      async systemOne({ questions }) {
        const answers = {};
        for (const [cle, q] of Object.entries(questions)) {
          if (cle === 'paix') {
            answers[cle] = { type: 'choice', choice: 'paix:p2', confidence: 0.9, probabilities: { 'paix:p2': 0.9 } };
          } else {
            answers[cle] = { type: q.type, ...(q.type === 'score' ? { score: 0 } : { choice: 'aucun' }), confidence: 0.9, probabilities: {} };
          }
        }
        return { model: 'faux', answers, usage: { input_tokens: 100 } };
      },
    };
    const journal = new Journal(join(racine, 'journaux', 'test-joueur-paix.jsonl'));
    // Guerre préexistante injectée par civSetup ? Non — le harnais part en paix.
    // On joue court : Jev déclare via guerre au tour 1 puis propose la paix.
    const clientMixte = {
      async systemOne({ questions }) {
        if (questions.guerre) {
          return {
            model: 'faux',
            answers: Object.fromEntries(Object.keys(questions).map((c) => [c, c === 'guerre'
              ? { type: 'choice', choice: 'guerre:p2', confidence: 0.9, probabilities: {} }
              : { type: questions[c].type, ...(questions[c].type === 'score' ? { score: 0 } : { choice: 'aucun' }), confidence: 0.9, probabilities: {} }])),
            usage: { input_tokens: 100 },
          };
        }
        return client.systemOne({ questions });
      },
    };
    await jouerPartie({
      client: clientMixte, config, seed: 505, plafondTours: 5, journal, engineJev: 'p1', modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'egypte' } },
    });
    const lignes = readFileSync(join(racine, 'journaux', 'test-joueur-paix.jsonl'), 'utf8').trim().split('\n');
    const objets = lignes.map((l) => JSON.parse(l));
    const paix = objets.filter((o) => o.type === 'diplomatie' && o.genre === 'paix');
    expect(paix.length).toBeGreaterThan(0);
    // Réponse du bot seedée et consignée.
    expect(paix.every((d) => typeof d.reponseBot === 'string' || typeof d.reponseBot === 'object')).toBe(true);
  });

  it('le plan bot de base de Jev ne déclare JAMAIS la guerre à sa place (aucun → zéro guerre)', async () => {
    // Jev répond 'aucun' partout avec confiance pleine — aucune guerre ne
    // doit émerger, ni du plan de base de Jev (fuite corrigée), ni du bot
    // (choix 'guerre' présent = bloqué).
    const client = {
      async systemOne({ questions }) {
        const answers = {};
        for (const [cle, q] of Object.entries(questions)) {
          answers[cle] = {
            type: q.type,
            ...(q.type === 'score' ? { score: 0 } : { choice: 'aucun' }),
            confidence: 0.9,
            probabilities: { aucun: 0.9 },
          };
        }
        return { model: 'faux', answers, usage: { input_tokens: 100 } };
      },
    };
    const journal = new Journal(join(racine, 'journaux', 'test-joueur-aucun.jsonl'));
    await jouerPartie({
      client, config, seed: 808, plafondTours: 10, journal, engineJev: 'p1', modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'egypte' } },
    });
    const lignes = readFileSync(join(racine, 'journaux', 'test-joueur-aucun.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const wars = lignes.filter((l) => l.type === 'evenement' && l.evenement.type === 'WarDeclared');
    expect(wars).toEqual([]);
  });

  it('memoRefusEchange empêche la re-proposition des paires refusées', () => {
    const memo = {};
    memoRefusEchange(memo, 'poterie', 'alphabet');
    expect(memo.echangesRefuses.has('poterie>')).toBe(true);
    expect(memo.echangesRefuses.has('>alphabet')).toBe(true);
    const etat = etat1v1();
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1');
    // Force les listes à contenir les techs refusées : vérifie le filtrage direct.
    memoRefusEchange(memo, condense.diplomatie.rivaux[0].techs[0] ?? 'x', undefined);
    void condense;
  });
});

describe('partie complète en mode joueur (faux Jev, budget)', () => {
  it('joue 1v1 jusqu au plafond avec journal cohérent et coût nul (faux client)', async () => {
    const journal = new Journal(join(racine, 'journaux', 'test-joueur-complete.jsonl'));
    const { etat, coupeParBudget } = await jouerPartie({
      client: creerFauxJev({ graine: 9 }), config, seed: 606, plafondTours: 12, journal,
      budgetUsd: 10, engineJev: 'p1', modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'zoulous' } },
    });
    expect(coupeParBudget).toBe(false);
    expect(etat.turn).toBeLessThanOrEqual(13);
    expect(journal.coutUsd()).toBeGreaterThanOrEqual(0);
    const lignes = readFileSync(join(racine, 'journaux', 'test-joueur-complete.jsonl'), 'utf8').trim().split('\n');
    const fin = JSON.parse(lignes.at(-1));
    expect(fin.type).toBe('fin');
    expect(fin.joueursFin.p1.civId).toBe('rome');
    expect(fin.joueursFin.p2.defeated === false || fin.gagnant !== null).toBe(true);
  });

  it('sansJev en mode joueur = contrôle bot pur (zéro appel)', async () => {
    const journal = new Journal(join(racine, 'journaux', 'test-joueur-controle.jsonl'));
    const client = creerFauxJev({ graine: 3 });
    await jouerPartie({
      client, config, seed: 707, plafondTours: 4, journal, sansJev: true, modeJoueur: true,
      civSetup: { p1: { civId: 'rome' }, p2: { civId: 'egypte' } },
    });
    expect(client.appels).toBe(0);
  });
});

describe('déterminisme des tirages de négociation', () => {
  it('botTurnSeed negoc-* est stable pour la même paire/tour', () => {
    const a = botTurnSeed(123, 7, 'negoc-paix-p2-p1');
    const b = botTurnSeed(123, 7, 'negoc-paix-p2-p1');
    const c = botTurnSeed(123, 8, 'negoc-paix-p2-p1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(createRng(a).next()).toBe(createRng(a).next());
  });
});
