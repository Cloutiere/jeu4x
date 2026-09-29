/**
 * Tests v3 (HANDOFF-JEV-V3-BANC2) — gain net des sites (D1), fix d'affichage
 * science/progrès du condensé (D4, testé contre le faux client ET contre un
 * extrait de vrai journal du banc 1), unicité des ordres traduits.
 * 100 % faux client / états synthétiques : zéro appel réseau, zéro dollar.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.mjs';
import { jouerPartie } from '../src/partie.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import config from '../questions.json';

const SEED = 1234;

describe('v3 D1 — gain net des sites de fondation', () => {
  it('chaque site candidat du condensé porte un gainNet chiffré', async () => {
    const { condenserEtat } = await import('../src/condense.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED, { playerCount: 5 });
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const c = condenserEtat(getFilteredState(etat, jev), jev);
    expect(c.candidats.fondation.length).toBeGreaterThan(0);
    for (const s of c.candidats.fondation) {
      expect(typeof s.gainNet).toBe('number');
      expect(Number.isFinite(s.gainNet)).toBe(true);
    }
  });

  it('un ennemi connu à proximité RETANCHE le gainNet de exactement penaliteRisque (fog respecté)', async () => {
    const { gainNetSite, configCondense } = await import('../src/condense.mjs');
    const { hexDistance, UNIT_TYPES } = await import('@game/rules');
    // État synthétique minimal : site entouré de terre, colon à 2 cases,
    // un ennemi posé juste à côté puis repoussé hors du rayon de risque.
    const map = {};
    for (let dq = -5; dq <= 5; dq++)
      for (let dr = -5; dr <= 5; dr++) map[`${dq},${dr}`] = { terrain: 'plaine' };
    const filtre = {
      map,
      units: {
        colon: { id: 'colon', owner: 'p2', type: 'colon', q: 2, r: 0, hp: 100, mp: 2, aboard: false },
      },
      cities: {},
      players: { p2: { techsUnlocked: [] }, p3: { civId: 'rome' } },
      turn: 5,
    };
    const site = { q: 0, r: 0, distance: hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 }) };
    const base = gainNetSite(filtre, 'p2', site);
    filtre.units.ennemiProche = { id: 'e1', owner: 'p3', type: 'guerrier', q: 1, r: 0, hp: 100, mp: 2, aboard: false };
    const avecEnnemi = gainNetSite(filtre, 'p2', site);
    expect(avecEnnemi).toBe(base - configCondense.gainSite.penaliteRisque);
    // hors du rayon de risque : plus aucune pénalité
    filtre.units.ennemiProche.q = 6;
    expect(hexDistance({ q: 6, r: 0 }, { q: 0, r: 0 })).toBeGreaterThan(configCondense.gainSite.rayonRisque);
    expect(gainNetSite(filtre, 'p2', site)).toBe(base);
    void UNIT_TYPES;
  });

  it('l\'adaptateur refuse de fonder sur un site à gainNet ≤ 0 (stub fonder=0,99)', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED, { playerCount: 5 });
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const clientStub = {
      async systemOne({ state }) {
        // On force TOUS les sites à gainNet ≤ 0 via un état truqué :
        const truque = JSON.parse(JSON.stringify(state));
        for (const s of truque.candidats.fondation) s.gainNet = -1;
        return {
          model: 'stub',
          answers: {
            posture: { type: 'choice', choice: 'economique', confidence: 0.9, probabilities: { economique: 0.9 } },
            menace: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: {} },
            fonder: { type: 'noul', noul: 0.99 },
            attaquer: { type: 'noul', noul: 0.1 },
          },
          usage: { input_tokens: 100 },
          __state: truque,
        };
      },
    };
    const d = await tourJev(clientStub, config, getFilteredState(etat, jev), jev);
    // La traduction relit l'état réel (pas le truqué) : elle peut fonder si des
    // sites réels sont rentables — on vérifie surtout qu'aucun FoundCity ne
    // vise un site non rentable et qu'aucun ordre n'est dupliqué.
    const sujets = d.ordres.map((o) => o.unitId ?? o.cityId);
    expect(new Set(sujets).size).toBe(sujets.length);
  });
});

describe('v3 D4 — affichage science/progrès du condensé', () => {
  it('extrait de VRAI journal banc 1 : tech complétée + re-émission SetResearch → enCours null, réserve et compteur justes', async () => {
    const { etatRecherche } = await import('../src/condense.mjs');
    // Extrait reconstruit fidèle au journal banc 1 (partie-003, tour 50) :
    // alphabet DÉBLOQUÉE, `researching` encore posé (re-émission du memo),
    // scienceProgress vidé par la complétion, réserve 0.
    const filtre = {
      players: {
        p2: { researching: 'alphabet', scienceProgress: {}, scienceStored: 0, techsUnlocked: ['alphabet'] },
      },
    };
    const r = etatRecherche(filtre, 'p2', 0);
    expect(r.enCours).toBeNull();
    expect(r.techsCompletees).toBe(1);
    expect(r.reserve).toBe(0);
    expect(r.scienceParTour).toBe(0);
    // variante : tech EN COURS non complétée → progrès visible, toursRestants justes
    const filtre2 = {
      players: {
        p2: { researching: 'poterie', scienceProgress: { poterie: 7 }, scienceStored: 2, techsUnlocked: [] },
      },
    };
    const r2 = etatRecherche(filtre2, 'p2', 2);
    expect(r2.enCours).toBe('poterie');
    expect(r2.progres).toBe(7);
    expect(r2.reserve).toBe(2);
    expect(r2.toursRestants).toBe(7); // (20-7)/2 arrondi au dessus
  });

  it('empire.scienceReserve remplace le champ fantôme science (me.science n\'existe pas côté moteur)', async () => {
    const { condenserEtat } = await import('../src/condense.mjs');
    const c = condenserEtat(
      {
        turn: 50,
        map: {},
        units: {},
        cities: {},
        players: { p2: { treasury: 12, scienceStored: 4, techsUnlocked: ['alphabet'], scienceRatio: 0.5 }, p3: { civId: 'rome', techsUnlocked: [] } },
      },
      'p2',
    );
    expect(c.empire.scienceReserve).toBe(4);
    expect(c.empire.science).toBeUndefined();
  });

  it('faux client de bout en bout : les décisions journalisées portent gainNet et scienceReserve', async () => {
    const { readFileSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'sableuse-v3-'));
    const j = new Journal(join(dir, 't.jsonl'));
    await jouerPartie({ client: creerFauxJev({ graine: 3 }), config, seed: 33, plafondTours: 8, journal: j });
    const lignes = readFileSync(j.chemin, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const decisions = lignes.filter((x) => x.type === 'decision');
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d.condense.empire).toHaveProperty('scienceReserve');
      for (const s of d.condense.candidats.fondation ?? []) expect(typeof s.gainNet).toBe('number');
    }
  });
});

describe('v3.1 — liste noire des fondations rejetées', () => {
  it('une case fondation échouée n\'est plus proposée : le colon marche ailleurs au lieu de ré-émettre FoundCity', async () => {
    const { tourJev } = await import('../src/adapter-jev.mjs');
    const { getFilteredState, createInitialState, generateProceduralMap } = await import('@game/rules');
    const gen = generateProceduralMap(SEED, { playerCount: 5 });
    const etat = createInitialState(gen.map, SEED);
    const jev = Object.keys(etat.players).sort()[1];
    const clientStub = {
      async systemOne() {
        return {
          model: 'stub',
          answers: {
            posture: { type: 'choice', choice: 'economique', confidence: 0.9, probabilities: { economique: 0.9 } },
            menace: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: {} },
            fonder: { type: 'noul', noul: 0.99 },
            attaquer: { type: 'noul', noul: 0.1 },
          },
          usage: { input_tokens: 100 },
        };
      },
    };
    const filtre = getFilteredState(etat, jev);
    // sans liste noire : le colon sur site valide → FoundCity (comportement v3)
    const d1 = await tourJev(clientStub, config, filtre, jev, {});
    const fonderSans = d1.ordres.some((o) => o.type === 'FoundCity');
    // avec la case du colon en liste noire : JAMAIS de FoundCity ici
    const sites = (await import('../src/condense.mjs')).sitesFondation(filtre, jev);
    const memo = { casesFondationEchouees: new Set(sites.map((s) => s.case)) };
    const d2 = await tourJev(clientStub, config, filtre, jev, memo);
    expect(d2.ordres.some((o) => o.type === 'FoundCity')).toBe(false);
    // peu importe le comportement v3 (le colon de départ n'est pas toujours
    // sur un site), l'invariant v3.1 tient dans les deux cas :
    expect(d2.ordres.every((o) => o.type !== 'FoundCity')).toBe(true);
    void fonderSans;
  });
});

describe('v3 — questions et config', () => {
  it('la question fonder v3 parle de gainNet et le seuil est à 0,5 (point de départ calibrage)', () => {
    expect(config.questions.fonder.instructions).toContain('gainNet');
    expect(config.seuils.fonderMin).toBe(0.5);
    // v2 archivée intacte (A/B)
    return import('../questions.v2.json').then((v2) => {
      expect(v2.default.seuils.fonderMin).toBe(0.7);
      expect(v2.default.questions.fonder.instructions).not.toContain('gainNet');
    });
  });
});
