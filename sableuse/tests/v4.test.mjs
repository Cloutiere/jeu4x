/**
 * Tests V4 (HANDOFF-JEV-V4) — D1 règle de conversion (regle:conversion),
 * D2 facteur de maturité du gainNet, D3 score d'empire, D4 scénarios de
 * faisabilité par victoire. 100 % faux client / états synthétiques /
 * moteur pur : zéro appel réseau, zéro dollar.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from '../src/journal.mjs';
import { jouerPartie, changementsConversion } from '../src/partie.mjs';
import { creerFauxJev } from '../src/faux-jev.mjs';
import { scoreEmpire } from '../src/score.mjs';
import config from '../questions.json';

const SEED = 4321;

describe('V4 D3 — score d\'empire (calcul pur)', () => {
  const etat = {
    cities: {
      c1: { id: 'c1', owner: 'p1', pop: 4, wonder: 'pyramides' },
      c2: { id: 'c2', owner: 'p1', pop: 2, wonder: null },
      c3: { id: 'c3', owner: 'p2', pop: 9, wonder: null },
    },
    players: {
      p1: { treasury: 250, techsUnlocked: ['alphabet', 'poterie'] },
      p2: { treasury: -5, techsUnlocked: [] },
    },
  };

  it('score = villes×10 + pop×2 + techs×30 + merveilles×100 + trésorerie/10 (défauts)', () => {
    const s = scoreEmpire(etat, 'p1');
    expect(s.composantes).toEqual({ villes: 2, pop: 6, techs: 2, merveilles: 1, tresorerie: 250 });
    expect(s.total).toBe(20 + 12 + 60 + 100 + 25);
    expect(scoreEmpire(etat, 'p2').total).toBe(10 + 18 + 0 + 0 + 0); // trésorerie négative ignorée
  });

  it('les pondérations sont data-driven (config.score de questions.json)', () => {
    const s = scoreEmpire(etat, 'p1', { villes: 1, pop: 0, techs: 1, merveilles: 0, divTresorerie: 100 });
    expect(s.total).toBe(2 + 0 + 2 + 0 + 2);
    expect(config.score).toMatchObject({ villes: 10, pop: 2, techs: 30, merveilles: 100, divTresorerie: 10 });
  });
});

describe('V4 D1 — règle de conversion (regle:conversion)', () => {
  const regle = config.regles.conversion;
  it('la config V4 est en place', () => {
    expect(regle.actif).toBe(true);
    expect(regle.source).toBe('regle:conversion');
  });

  it('une ville avec Bibliothèque (ou la produisant) passe en science ; les autres restent en or', () => {
    const etat = {
      players: { p1: {} },
      cities: {
        c1: { id: 'c1', owner: 'p1', capital: false, conversion: 'gold', buildings: ['bibliotheque'], production: null },
        c2: { id: 'c2', owner: 'p1', capital: false, conversion: 'gold', buildings: [], production: { item: { kind: 'building', id: 'bibliotheque' }, progress: 10 } },
        c3: { id: 'c3', owner: 'p1', capital: false, conversion: 'gold', buildings: ['universite'], production: null }, // remplace la bibliothèque
        c4: { id: 'c4', owner: 'p1', capital: true, conversion: 'gold', buildings: [], production: null }, // capitale SANS colon produit : or
      },
      units: {},
    };
    const ch = changementsConversion(etat, new Set(), regle);
    const vers = Object.fromEntries(ch.map((c) => [c.ville, c.vers]));
    expect(vers).toEqual({ c1: 'science', c2: 'science', c3: 'science' });
    // idempotent : plus rien à changer après application
    etat.cities.c1.conversion = 'science';
    etat.cities.c2.conversion = 'science';
    etat.cities.c3.conversion = 'science';
    expect(changementsConversion(etat, new Set(), regle)).toEqual([]);
  });

  it('la capitale passe en science APRÈS le premier colon produit', () => {
    const etat = {
      players: { p1: {} },
      cities: [{ id: 'c1', owner: 'p1', capital: true, conversion: 'gold', buildings: [], production: null }],
      units: {},
    };
    etat.cities = { c1: etat.cities[0] };
    expect(changementsConversion(etat, new Set(), regle)).toEqual([]);
    const ch = changementsConversion(etat, new Set(['p1']), regle);
    expect(ch).toEqual([{ joueur: 'p1', ville: 'c1', capitale: true, de: 'gold', vers: 'science' }]);
  });

  it('partie e2e (faux client) : conversions journalisées regle:conversion + scores dans la ligne fin', async () => {
    const { readFileSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'sableuse-v4-'));
    const j = new Journal(join(dir, 't.jsonl'));
    await jouerPartie({ client: creerFauxJev({ graine: 9 }), config, seed: SEED, plafondTours: 30, journal: j });
    const lignes = readFileSync(j.chemin, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const conversions = lignes.filter((x) => x.type === 'regle_conversion');
    expect(conversions.length).toBeGreaterThan(0);
    for (const c of conversions) expect(c.source).toBe('regle:conversion');
    const fin = lignes.find((x) => x.type === 'fin');
    expect(fin.scores).toBeDefined();
    for (const s of Object.values(fin.scores)) {
      expect(s.total).toBeGreaterThan(0);
      expect(s.composantes.villes).toBeGreaterThan(0);
    }
    expect(fin.regleConversion).toBe('regle:conversion');
  });
});

describe('V4 D2 — facteur de maturité du gainNet', () => {
  it('maturité 0,5 : les couronnes pèsent la moitié, distance et risque inchangés', async () => {
    const { gainNetSite, configCondense } = await import('../src/condense.mjs');
    const map = {};
    for (let dq = -5; dq <= 5; dq++)
      for (let dr = -5; dr <= 5; dr++) map[`${dq},${dr}`] = { terrain: 'plaine' };
    const filtre = {
      map,
      units: { colon: { id: 'colon', owner: 'p2', type: 'colon', q: 0, r: 0, hp: 100, mp: 2, aboard: false } },
      cities: {},
      players: { p2: { techsUnlocked: [] } },
      turn: 3,
    };
    const site = { q: 0, r: 0, distance: 0 };
    const avec = gainNetSite(filtre, 'p2', site);
    configCondense.gainSite.actifMaturite = false;
    const sans = gainNetSite(filtre, 'p2', site);
    configCondense.gainSite.actifMaturite = true;
    // avec = 0,5×positif − distance×2 ; sans = positif − distance×2 (ici distance 0)
    const positif = sans + configCondense.gainSite.penaliteDistance * site.distance;
    expect(avec).toBe(Math.round(0.5 * positif * 10) / 10);
    // l'ordre est conservé : un bon site reste motivant (> 0) après maturité
    expect(avec).toBeGreaterThan(0);
    site.distance = 2;
    const avecDist = gainNetSite(filtre, 'p2', site);
    expect(avecDist).toBe(avec - configCondense.gainSite.penaliteDistance * 2);
  });

  it('le condensé expose l\'orientation de conversion de chaque ville', async () => {
    const { condenserEtat } = await import('../src/condense.mjs');
    const c = condenserEtat(
      {
        turn: 30,
        firstBy: {},
        map: { '0,0': { terrain: 'plaine' }, '1,0': { terrain: 'plaine' } },
        units: {},
        cities: {
          c1: { id: 'c1', owner: 'p2', q: 0, r: 0, pop: 1, buildings: [], workedTiles: [], wonders: [], conversion: 'science' },
          c2: { id: 'c2', owner: 'p2', q: 1, r: 0, pop: 1, buildings: [], workedTiles: [], wonders: [], conversion: 'gold' },
        },
        players: { p2: { treasury: 5, techsUnlocked: [] }, p3: { techsUnlocked: [] } },
      },
      'p2',
    );
    expect(c.empire.villes.map((v) => v.conversion)).toEqual(['science', 'or']);
  });
});

describe('V4 D4 — scénarios de faisabilité par victoire', () => {
  it('les 4 types de victoire sont atteints, détectés et journalisés (injections, ≤ 20 tours, sans Jev)', async () => {
    const { jouerScenarioVictoire } = await import('../src/scenarios-victoire.mjs');
    const attendus = { economique: 'economique', scientifique: 'science', culturel: 'culture', domination: 'domination' };
    for (const [type, raison] of Object.entries(attendus)) {
      const r = await jouerScenarioVictoire(type, { seed: 2026 });
      expect(r.ok, `scénario ${type} : gagnant ${r.gagnant} (${r.raison})`).toBe(true);
      expect(r.raison).toBe(raison);
      expect(r.tours).toBeLessThanOrEqual(20);
    }
  }, 240_000);
});
