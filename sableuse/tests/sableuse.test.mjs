/**
 * Tests de la sableuse (HANDOFF-JEV-POC L1) — 100 % avec le FAUX client Jev
 * (déterministe, zéro appel réseau, zéro budget). RUN-80 : même seed → même fin.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.mjs';
import { jouerPartie } from '../src/partie.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import { rejouerDepuisJournal } from '../src/rejouer.mjs';
import config from '../questions.json';

const SEED = 1234;

function nouveauJournal() {
  const dir = mkdtempSync(join(tmpdir(), 'sableuse-'));
  return new Journal(join(dir, 'test.jsonl'));
}

function lignes(journal) {
  return readFileSync(journal.chemin, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('harnais de partie (faux client)', () => {
  it('joue une partie complète déterministe — même seed → même fin (R-80)', async () => {
    const j1 = nouveauJournal();
    const j2 = nouveauJournal();
    const r1 = await jouerPartie({ client: creerFauxJev({ graine: SEED }), config, seed: SEED, plafondTours: 30, journal: j1 });
    const r2 = await jouerPartie({ client: creerFauxJev({ graine: SEED }), config, seed: SEED, plafondTours: 30, journal: j2 });
    expect(JSON.stringify(r1.etat)).toBe(JSON.stringify(r2.etat));
    expect(r1.etat.turn).toBeGreaterThan(1);
  });

  it('la partie se termine par victoire ou plafond de tours', async () => {
    const j = nouveauJournal();
    const r = await jouerPartie({ client: creerFauxJev({ graine: 7 }), config, seed: 7, plafondTours: 12, journal: j });
    expect(r.etat.winner === null || typeof r.etat.winner === 'string').toBe(true);
    expect(r.etat.turn).toBeLessThanOrEqual(13);
  });

  it('le garde-fou budget (D8) coupe la partie au plafond', async () => {
    const j = nouveauJournal();
    const r = await jouerPartie({ client: creerFauxJev({ graine: 5 }), config, seed: 5, plafondTours: 50, journal: j, budgetUsd: 1e-8 });
    expect(r.coupeParBudget).toBe(true);
    expect(j.appels).toBe(1); // coupé dès le premier appel au-delà du plafond
  });
});

describe('journal JSONL (D7)', () => {
  it('est bien formé : meta en tête, fin en queue, décisions complètes', async () => {
    const j = nouveauJournal();
    await jouerPartie({ client: creerFauxJev({ graine: 9 }), config, seed: 9, plafondTours: 6, journal: j });
    const l = lignes(j);
    expect(l[0].type).toBe('meta');
    expect(l[0].seed).toBe(9);
    expect(l[l.length - 1].type).toBe('fin');
    expect(l[l.length - 1].coutTotalUsd).toBeGreaterThanOrEqual(0);
    const decisions = l.filter((x) => x.type === 'decision');
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d).toHaveProperty('tour');
      expect(d).toHaveProperty('condense');
      expect(d).toHaveProperty('questions');
      expect(d).toHaveProperty('reponses');
      expect(typeof d.jetonsEntree).toBe('number');
    }
    // chaque ligne est un objet JSON avec un type connu
    const types = new Set(['meta', 'tour', 'decision', 'evenement', 'motif', 'rejets', 'rejet_action', 'fin']);
    for (const x of l) expect(types.has(x.type)).toBe(true);
  });
});

describe('traduction des décisions (D4)', () => {
  it('fonder ≥ 0,7 produit un ordre Move/FoundCity sur le colon', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED);
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const clientStub = {
      async systemOne({ questions }) {
        return {
          model: 'stub',
          answers: {
            posture: { type: 'choice', choice: 'economique', confidence: 0.9, probabilities: { economique: 0.9 } },
            menace: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: {} },
            fonder: { type: 'noul', noul: 0.9 },
            attaquer: { type: 'noul', noul: 0.1 },
          },
          usage: { input_tokens: 100 },
        };
      },
    };
    const d = await tourJev(clientStub, config, getFilteredState(etat, jev), jev);
    expect(d.repli).toBe(false);
    expect(d.ordres.length).toBeGreaterThan(0);
    expect(d.ordres.some((o) => o.type === 'Move' || o.type === 'FoundCity')).toBe(true);
  });

  it('config v1 : confiance < 0,65 → repli bot complet, aucun ordre Jev (sémantique POC)', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { readFileSync } = await import('node:fs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED);
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const configV1 = JSON.parse(readFileSync(new URL('../questions.v1.json', import.meta.url), 'utf8'));
    const clientStub = {
      async systemOne() {
        return {
          model: 'stub',
          answers: {
            posture: { type: 'choice', choice: 'militaire', confidence: 0.4, probabilities: {} },
            menace: { type: 'score', score: 3, confidence: 0.9, legend: {}, probabilities: {} },
            fonder: { type: 'noul', noul: 0.99 },
            attaquer: { type: 'noul', noul: 0.99 },
          },
          usage: { input_tokens: 100 },
        };
      },
    };
    const d = await tourJev(clientStub, configV1, getFilteredState(etat, jev), jev);
    expect(d.repli).toBe(true);
    expect(d.ordres).toHaveLength(0);
  });

  it('config v2 : posture indécise mais domaine confiant → la décision de domaine passe (routage par domaine)', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED);
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const clientStub = {
      async systemOne() {
        return {
          model: 'stub',
          answers: {
            posture: { type: 'choice', choice: 'militaire', confidence: 0.4, probabilities: {} },
            menace: { type: 'score', score: 3, confidence: 0.9, legend: {}, probabilities: {} },
            fonder: { type: 'noul', noul: 0.99 },
            attaquer: { type: 'noul', noul: 0.99 },
          },
          usage: { input_tokens: 100 },
        };
      },
    };
    const d = await tourJev(clientStub, config, getFilteredState(etat, jev), jev);
    // fonder 0,99 ≥ 0,7 : la fondation est traduite malgré la posture faible
    expect(d.ordres.some((o) => o.type === 'FoundCity' || o.type === 'Move')).toBe(true);
    expect(d.repli).toBe(false);
  });
});

describe('rejouabilité depuis le journal (L3)', () => {
  it('rejouer les motifs du journal reproduit la même fin', async () => {
    const j = nouveauJournal();
    const r = await jouerPartie({ client: creerFauxJev({ graine: 21 }), config, seed: 21, plafondTours: 20, journal: j });
    const rejoue = await rejouerDepuisJournal(j.chemin);
    expect(rejoue.identique).toBe(true);
    expect(rejoue.gagnantRejoue).toBe(r.etat.winner);
  });
});

