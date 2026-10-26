/**
 * BOT-TC-OBSERVATION (décisions Erik 25/10) — L1 test-first : l'extracteur de
 * chronologies est correct sur une FIXTURE à guerre connue (déclaration →
 * batailles → paix refusée → paix acceptée), les métriques agrégées (D3)
 * tombent juste, et le banc observé est DÉTERMINISTE (rejeu bit à bit,
 * motif CI-FLAKY). Aucun changement de comportement — module d'observation
 * seulement.
 */
import { describe, expect, it } from 'vitest';
import {
  extraireChronologies,
  metriquesParCiv,
  metriquesParDifficulte,
  simulerPartieObservee,
} from '../src/bancObservation.js';
import type { TourObserve } from '../src/bancObservation.js';
import { corpusBanc } from '../src/bancBotTd.js';

/** Fixture à guerre connue : p1 déclare contre p2 au tour 12 (forces 10 vs 8),
 *  2 batailles + 1 perte p2, paix refusée t18 (p2 perdant), paix acceptée t24.
 *  Défaite de p2 à t30 (élimination d'une deuxième guerre non résolue). */
function fixture(): TourObserve[] {
  const tour = (t: number, extra: Partial<TourObserve> = {}): TourObserve => ({
    tour: t,
    largeur: 40,
    forces: { p1: 10, p2: 8 },
    civs: { p1: 'neutre', p2: 'neutre' },
    capitale: { p1: { q: 5, r: 5 }, p2: { q: 10, r: 5 } },
    ownerOf: { u1: 'p1', u2: 'p2' },
    posOf: { u1: { q: 8, r: 5 }, u2: { q: 10, r: 5 } },
    paires: t >= 12 && t < 24 ? ['p1|p2'] : [],
    eres: { p1: 'ancienne', p2: 'ancienne' },
    distancesCible: t >= 12 ? { 'p1,p2': 5 } : {},
    evenements: [],
    winner: null,
    defaits: [],
    ...extra,
  });
  return [
    tour(11),
    tour(12, {
      evenements: [
        { type: 'WarDeclared', from: 'p1', on: 'p2', forcesDeclarant: 10, forcesCible: 8 },
        { type: 'CombatExchange', attackerId: 'u1', defenderId: 'u2' },
        { type: 'UnitDestroyed', owner: 'p2' },
      ],
    }),
    tour(13, { evenements: [{ type: 'CombatExchange', attackerId: 'u2', defenderId: 'u1' }] }),
    tour(18, { evenements: [{ type: 'PeaceRefused', from: 'p2', on: 'p1', forcesFrom: 6, forcesOn: 10 }] }),
    tour(24, {
      evenements: [{ type: 'PeaceAccepted', from: 'p2', on: 'p1', forcesFrom: 5, forcesOn: 10 }],
    }),
    tour(30, {
      defaits: ['p2'],
      winner: 'p1',
      evenements: [
        { type: 'WarDeclared', from: 'p1', on: 'p2', forcesDeclarant: 12, forcesCible: 4 },
        { type: 'CityCaptured', cityId: 'c2', fromOwner: 'p2', toOwner: 'p1' },
        { type: 'PlayerDefeated', player: 'p2', byPlayer: 'p1', cause: 'capitalCaptured' },
      ],
    }),
  ];
}

describe('extraireChronologies — fixture à guerre connue', () => {
  const partie = extraireChronologies(fixture(), { seed: 1, difficulte: 'normal' });

  it('extrait les DEUX guerres avec les bonnes forces et le bon ratio', () => {
    expect(partie.guerres).toHaveLength(2);
    const [g1 = null!, g2 = null!] = partie.guerres;
    expect(g1.declarant).toBe('p1');
    expect(g1.cible).toBe('p2');
    expect(g1.tourDeclaration).toBe(12);
    expect(g1.forcesDeclarant).toBe(10);
    expect(g1.forcesCible).toBe(8);
    expect(g1.ratioDeclaration).toBeCloseTo(1.25);
    expect(g2.tourDeclaration).toBe(30);
    expect(g2.ratioDeclaration).toBe(3);
  });

  it('attribue batailles et pertes à la bonne guerre', () => {
    const [g1 = null!, g2 = null!] = partie.guerres;
    expect(g1.batailles).toBe(2);
    expect(g1.pertes).toEqual({ declarant: 0, cible: 1 });
    expect(g2.batailles).toBe(0);
  });

  it('mesure la progression vers la capitale cible (dist min du déclarant)', () => {
    const [g1 = null!] = partie.guerres;
    // u1 à (8,5) face à capitale p2 (10,5) — dist 2 pendant toute la guerre.
    expect(g1.progressionCapitale).toBe(2);
  });

  it('enregistre la paix refusée (perdant) puis la paix acceptée (fin de guerre)', () => {
    const [g1 = null!, g2 = null!] = partie.guerres;
    expect(g1.paixProposees).toEqual([
      { tour: 18, par: 'cible', rapportForces: 0.6, acceptee: false },
      { tour: 24, par: 'cible', rapportForces: 0.5, acceptee: true },
    ]);
    expect(g1.issue).toBe('paix');
    expect(g1.tourFin).toBe(24);
    expect(g1.duree).toBe(12);
    expect(g2.issue).toBe('elimination-cible');
  });

  it('consigne captures et éliminations', () => {
    expect(partie.captures).toEqual([{ tour: 30, cityId: 'c2', de: 'p2', vers: 'p1', ere: 'ancienne' }]);
    expect(partie.eliminations).toEqual([
      { tour: 30, joueur: 'p2', par: 'p1', cause: 'capitalCaptured' },
    ]);
    expect(partie.winner).toBe('p1');
  });
});

describe('métriques agrégées (D3) — fixture de 2 parties', () => {
  const a = extraireChronologies(fixture(), { seed: 1, difficulte: 'normal' });
  // 2e partie : une guerre stérile qui finit en paix, 40 tours joués.
  const b = extraireChronologies(
    fixture().map((t) => ({ ...t, evenements: t.evenements.filter((e) => e.type !== 'CombatExchange' && e.type !== 'UnitDestroyed') })),
    { seed: 2, difficulte: 'normal' },
  );
  const m = metriquesParDifficulte([a, b])[0]!;

  it('fréquence : guerres par partie et par 30 tours', () => {
    expect(m.parties).toBe(2);
    expect(m.guerres).toBe(4);
    expect(m.guerresParPartie).toBeCloseTo(2);
    expect(m.guerresPar30Tours).toBeCloseTo((4 / (30 + 30)) * 30);
  });

  it('tour de première guerre : moyenne des parties qui déclarent', () => {
    expect(m.tourPremiereGuerre).toBe(12);
  });

  it('cible : ratio moyen et part de déclarants plus forts', () => {
    expect(m.ratioDeclarationMoyen).toBeCloseTo((1.25 + 1.25 + 3 + 3) / 4);
    expect(m.declarantFort).toBe(1);
  });

  it('conduite : guerres stériles = 3 sur 4 (g2 de chaque partie + g1 sans bataille)', () => {
    expect(m.tauxSteriles).toBeCloseTo(0.75);
  });

  it('paix : 4 propositions (2 refusées, 2 acceptées), toutes perdantes', () => {
    expect(m.paixProposees).toBe(4);
    expect(m.paixAcceptees).toBe(2);
    expect(m.tauxAcceptePerdant).toBe(0.5);
    expect(m.tauxAccepteGagnant).toBe(0);
  });

  it('écrasement : les 2 parties finies t30 (< t50, pas < t30), captures/éliminations comptées', () => {
    expect(m.finiesAvantT50).toBe(2);
    expect(m.finiesAvantT30).toBe(0);
    expect(m.captures).toBe(2);
    expect(m.eliminations).toBe(2);
  });
});

describe('métriques par civ (D3) — agressivité observée vs déclarée', () => {
  it('compte déclarations et guerres subies par civId', () => {
    const partie = extraireChronologies(fixture(), { seed: 1, difficulte: 'normal' });
    const m = metriquesParCiv([partie]);
    const neutre = m.find((x) => x.civId === 'neutre')!;
    expect(neutre.agressiviteDeclaree).toBe(0.5);
    // p1 ET p2 sont 'neutre' dans la même partie — 2 lignes joueur.
    expect(neutre.partiesJouees).toBe(2);
    expect(neutre.declarations).toBe(2);
    expect(neutre.subies).toBe(2);
    expect(neutre.declarationsParPartie).toBeCloseTo(1);
  });
});

describe('déterminisme du banc observé (motif CI-FLAKY)', () => {
  it('rejouer la même (difficulté, seed) donne la même chronologie bit à bit', () => {
    const seed = corpusBanc(1)[0]!;
    expect(simulerPartieObservee('difficile', seed, 30)).toEqual(
      simulerPartieObservee('difficile', seed, 30),
    );
  });
});
