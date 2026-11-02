/**
 * vanilla — HANDOFF-BANC-VANILLA (01/11) — test-first : le mode VANILLA du
 * banc neutralise TOUTES les données de civilisation des deux camps (P2) en
 * jouant `civId: 'neutre'` (R-147 — la civ par défaut SANS traits, SANS
 * unités uniques, agressivité au défaut canon). Data-driven par construction :
 * le moteur lit CIVILIZATIONS.civs[civId] → null pour « neutre » ; RIEN ne
 * change en prod (la variante n'existe que côté banc — plan.json).
 *
 * L2 : la fin de partie consigne la RAISON de la victoire (événement `Victory`
 * du moteur : domination / razedCapital / culture / science / économique).
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, generateProceduralMap, agressiviteDe, civDataOf, civStartTechs, civStartGold, civStartBuildings, activeTraitsOf, uniqueReplacing, UNIT_TYPES } from '@game/rules';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { civsVanilla, construirePlan, raisonVictoireDe } from '../src/vanilla.mjs';

const racineProjet = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('HANDOFF-BANC-VANILLA · P2 — mode vanilla = civs neutres', () => {
  it('civsVanilla retourne neutre/neutre', () => {
    expect(civsVanilla()).toEqual({ p1: { civId: 'neutre' }, p2: { civId: 'neutre' } });
  });

  it('une partie créée en vanilla porte des civs neutres SANS aucun trait', () => {
    const gen = generateProceduralMap(101);
    const etat = createInitialState(gen.map, 101, civsVanilla());
    for (const id of ['p1', 'p2']) {
      const p = etat.players[id];
      expect(p.civId).toBe('neutre');
      // civDataOf : aucune donnée de civ (source unique de TOUS les effets).
      expect(civDataOf(p.civId)).toBeNull();
      // Aucun avantage de départ (techs, or, bâtiments, traits actifs).
      expect(civStartTechs(p.civId)).toEqual([]);
      expect(civStartGold(p.civId)).toBe(0);
      expect(civStartBuildings(p.civId)).toEqual([]);
      expect(activeTraitsOf(p)).toEqual([]);
      // Agressivité au DÉFAUT canon (0,5) — fini les guerres t10-17 de civ.
      expect(agressiviteDe(p.civId)).toBe(0.5);
    }
  });

  it('aucune unité unique ne fuit : rien ne remplace les unités standard, rien n\'est uniqueTo neutre', () => {
    for (const unitId of Object.keys(UNIT_TYPES).filter((u) => UNIT_TYPES[u].uniqueTo === undefined)) {
      expect(uniqueReplacing('neutre', unitId, ['agriculture', 'poterie'])).toBeNull();
    }
    expect(Object.values(UNIT_TYPES).filter((u) => u.uniqueTo === 'neutre')).toEqual([]);
  });

  it('CONTRASTE : une civ réelle (rome) a des données — le test ci-dessus n\'est pas vide', () => {
    expect(civDataOf('rome')).not.toBeNull();
    expect(agressiviteDe('rome')).not.toBe(0.5);
  });

  it('construirePlan vanilla : 5 parties, civs neutres, plafond 600, vanilla flag posé', () => {
    const plan = construirePlan({ n: 5, vanilla: true, plafondTours: 600 });
    expect(plan.nParties).toBe(5);
    expect(plan.plafondTours).toBe(600);
    expect(plan.vanilla).toBe(true);
    expect(plan.parties).toHaveLength(5);
    for (const p of plan.parties) {
      expect(p.civs.p1).toBe('neutre');
      expect(p.civs.p2).toBe('neutre');
    }
  });

  it('construirePlan SANS vanilla : civs P7 du seed, plafond du banc standard — le prod-path est inchangé', () => {
    const plan = construirePlan({ n: 3, vanilla: false, plafondTours: 150 });
    expect(plan.vanilla).toBeUndefined();
    expect(plan.plafondTours).toBe(150);
    for (const p of plan.parties) {
      expect(p.civs.p1).not.toBe('neutre');
      expect(p.civs.p2).not.toBe('neutre');
    }
  });

  it('TEST NÉGATIF : la variante vanilla n\'existe QUE côté banc — rien dans le serveur (prod)', () => {
    const serveur = join(racineProjet, 'apps', 'server', 'src');
    const fichiers = (function* walk(d) {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) yield* walk(join(d, f.name));
        else if (f.name.endsWith('.ts') || f.name.endsWith('.tsx')) yield join(d, f.name);
      }
    })(serveur);
    for (const f of fichiers) {
      expect(readFileSync(f, 'utf8').toLowerCase()).not.toContain('vanilla');
    }
  });
});

describe('HANDOFF-BANC-VANILLA · L2 — raison de victoire au journal de fin', () => {
  it('raisonVictoireDe lit la raison de l\'événement Victory du gagnant', () => {
    const events = [
      { seq: 1, type: 'CityCaptured', fromOwner: 'p2', toOwner: 'p1' },
      { seq: 2, type: 'Victory', winner: 'p1', reason: 'domination' },
    ];
    expect(raisonVictoireDe(events, 'p1')).toBe('domination');
  });

  it('retourne null sans événement Victory (partie au plafond = indécise)', () => {
    expect(raisonVictoireDe([{ seq: 1, type: 'TurnEnded' }], 'p1')).toBeNull();
    expect(raisonVictoireDe([], null)).toBeNull();
  });
});
