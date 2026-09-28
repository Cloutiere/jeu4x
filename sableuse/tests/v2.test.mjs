/**
 * Tests v2 (HANDOFF-JEV-QUESTIONS-V2) — condensé enrichi (D1), questions v2 +
 * adapter avec tenue de la recherche (D2), scénario contact forcé (D3).
 * 100 % faux client / stubs : zéro appel réseau, zéro budget.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.mjs';
import { jouerPartie, injecterMenace, trouverSeedsContact } from '../src/partie.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import { construireQuestions } from '../src/adapter-jev.mjs';
import { condenserEtat, valeurSite } from '../src/condense.mjs';
import config from '../questions.json';

const SEED = 1234;

function nouveauJournal() {
  const dir = mkdtempSync(join(tmpdir(), 'sableuse-'));
  return new Journal(join(dir, 'test.jsonl'));
}

function stubJev(constructeur) {
  let questionsRecues = null;
  return {
    get questions() {
      return questionsRecues;
    },
    async systemOne({ state, questions }) {
      questionsRecues = questions;
      return { model: 'stub', answers: constructeur(state), usage: { input_tokens: 100 } };
    },
  };
}

const REPONSES_V2 = () => ({
  posture: { type: 'choice', choice: 'economique', confidence: 0.9, probabilities: {} },
  menace: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: {} },
  fonder: { type: 'noul', noul: 0.1 },
  attaquer: { type: 'noul', noul: 0.1 },
  produire: { type: 'choice', choice: 'unit:colon', confidence: 0.9, probabilities: {} },
  rechercher: { type: 'choice', choice: 'alphabet', confidence: 0.9, probabilities: {} },
});

describe('condensé v2 (D1)', () => {
  it('les questions dynamiques sont alignées sur le condensé ; produire et rechercher sont honorés', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState } = await import('@game/rules');
    // État avancé de 3 tours : au tour 0 aucune ville n'existe (fondation en
    // fin de tour 1) — les candidats de production n'existeraient pas.
    const j0 = nouveauJournal();
    const { etat: avance } = await jouerPartie({ client: creerFauxJev({ graine: 3 }), config, seed: SEED, plafondTours: 3, journal: j0 });
    const jev = Object.keys(avance.players).sort()[1];
    const client = stubJev(() => REPONSES_V2());
    const memo = {};
    const d = await tourJev(client, config, getFilteredState(avance, jev), jev, memo);
    expect(client.questions.produire).toBeDefined();
    expect(Object.keys(client.questions.produire.criteria)).toContain('unit:colon');
    expect(Object.keys(client.questions.rechercher.criteria).length).toBeGreaterThan(0);
    expect(d.ordres.some((o) => o.type === 'SetProduction' && o.item.id === 'colon')).toBe(true);
    expect(d.actions.some((a) => a.type === 'SetResearch' && a.techId === 'alphabet')).toBe(true);
    expect(memo.techRecherche).toBe('alphabet');
    // la taille du condensé reste bornée (cible D1 ≤ ~3000 jetons ≈ 12 000 octets)
    expect(JSON.stringify(d.condense).length).toBeLessThan(12000);
  });

  it('après quelques tours : rendements par ville, marteaux, recherche, puissance, coûts et valeurs présents', async () => {
    const { getFilteredState } = await import('@game/rules');
    const j = nouveauJournal();
    const { etat: fin } = await jouerPartie({ client: creerFauxJev({ graine: 3 }), config, seed: SEED, plafondTours: 3, journal: j });
    const jev = Object.keys(fin.players).sort()[1];
    const c = condenserEtat(getFilteredState(fin, jev), jev);
    expect(c.empire.villes.length).toBeGreaterThan(0);
    for (const v of c.empire.villes) {
      expect(v.rendements).toHaveProperty('nourriture');
      expect(v.rendements).toHaveProperty('production');
      expect(typeof v.marteaux).toBe('number');
    }
    expect(c.empire.recherche).toHaveProperty('toursRestants');
    expect(c.empire.recherche.candidates.length).toBeGreaterThan(0);
    expect(c.monde.puissance).toHaveProperty('rapport');
    expect(c.candidats.productionCapitale.length).toBeGreaterThan(0);
    for (const cp of c.candidats.productionCapitale) expect(typeof cp.cout).toBe('number');
    for (const s of c.candidats.fondation) expect(typeof s.valeurSite).toBe('number');
  });

  it('valeurSite suit la formule consignée (couronne 1 + 0,5×couronne 2 − 2×distance, plancher 0)', () => {
    const map = {};
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) map[`${q},${r}`] = { terrain: 'plaine' };
    // plaine = 1/0/0 → valeurTerrain 1 ; couronne 1 : 6 tuiles = 6 ;
    // couronne 2 : 12 tuiles × 0,5 = 6 → 12 à distance 0.
    expect(valeurSite(map, 0, 0, 0)).toBe(12);
    expect(valeurSite(map, 0, 0, 3)).toBe(6);
    expect(valeurSite(map, 0, 0, 99)).toBe(0);
  });
});

describe('questions v2 + tenue de la recherche (D2)', () => {
  it('les critères dynamiques sont injectés depuis le condensé ; question absente sans candidat', () => {
    const condense = {
      candidats: { productionCapitale: [{ cle: 'unit:guerrier', cout: 10, nom: 'guerrier', attaque: 1, colon: false, toursEst: 2 }] },
      empire: { recherche: { candidates: [{ id: 'poterie', cout: 20 }] } },
    };
    const q = construireQuestions(config, condense);
    expect(Object.keys(q.produire.criteria)).toEqual(['unit:guerrier']);
    expect(Object.keys(q.rechercher.criteria)).toEqual(['poterie']);
    const qVide = construireQuestions(config, { candidats: { productionCapitale: [] }, empire: { recherche: { candidates: [] } } });
    expect(qVide.produire).toBeUndefined();
    expect(qVide.rechercher).toBeUndefined();
  });

  it('la recherche est TENUE : la tech mémorisée prime même si Jev répond autre chose', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED);
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    let reponse = 'alphabet';
    const client = stubJev(() => ({
      posture: { type: 'choice', choice: 'tech', confidence: 0.9, probabilities: {} },
      menace: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: {} },
      fonder: { type: 'noul', noul: 0.1 },
      attaquer: { type: 'noul', noul: 0.1 },
      rechercher: { type: 'choice', choice: reponse, confidence: 0.9, probabilities: {} },
    }));
    const memo = {};
    await tourJev(client, config, getFilteredState(etat, jev), jev, memo);
    expect(memo.techRecherche).toBe('alphabet');
    reponse = 'poterie'; // Jev « change d'avis » — la tenue doit primer
    const d2 = await tourJev(client, config, getFilteredState(etat, jev), jev, memo);
    expect(d2.actions.some((a) => a.type === 'SetResearch' && a.techId === 'alphabet')).toBe(true);
    expect(memo.techRecherche).toBe('alphabet');
  });
});

describe('scénario contact forcé (D3)', () => {
  it("l'injection de menace place un ennemi FICTIF dans le condensé mais JAMAIS dans le moteur", async () => {
    const { getFilteredState } = await import('@game/rules');
    // État avancé de 3 tours : une capitale existe (au tour 0, non).
    const j0 = nouveauJournal();
    const { etat: avance } = await jouerPartie({ client: creerFauxJev({ graine: 3 }), config, seed: SEED, plafondTours: 3, journal: j0 });
    const jev = Object.keys(avance.players).sort()[1];
    const f = getFilteredState(avance, jev);
    const avant = JSON.stringify(avance);
    expect(injecterMenace(f, jev)).toBe(true);
    const c = condenserEtat(f, jev);
    expect(c.menaces.length).toBeGreaterThan(0);
    expect(c.menaces[0].distanceVilleLaPlusProche).toBeLessThanOrEqual(3);
    expect(c.monde.puissance.ennemieVisible).toBeGreaterThan(0);
    expect(JSON.stringify(avance)).toBe(avant); // moteur intact
    // et une partie complète avec injection ne fuit AUCUNE unité 'test'
    const j = nouveauJournal();
    const { etat: fin } = await jouerPartie({ client: creerFauxJev({ graine: 4 }), config, seed: SEED, plafondTours: 8, journal: j, scenario: { contact: true, injectionMenace: true } });
    for (const u of Object.values(fin.units)) expect(u.owner).not.toBe('test');
    expect(readFileSync(j.chemin, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x))[0].scenario).toBe('scenario:test');
  });

  it('trouverSeedsContact retourne des seeds à spawns relativement proches (🔶 mirror1v1 : jamais < ~17)', () => {
    const seeds = trouverSeedsContact({ n: 2, depart: 1, distanceMax: 20, plafond: 100 });
    expect(seeds.length).toBeGreaterThan(0);
    for (const s of seeds) expect(s.distanceCapitales).toBeLessThanOrEqual(20);
  });
});
