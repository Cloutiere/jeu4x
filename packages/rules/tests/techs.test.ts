/**
 * Tests Phase 7a — base relationnelle des technologies (RULES.md §8.1, R-86)
 * et couche de requête (techs.ts). Les tests d'intégrité référentielle sont
 * le cœur de la « base relationnelle embarquée » : ils tournent à chaque
 * push (CI) — le calibrage = édition des JSON.
 */
import { describe, expect, it } from 'vitest';
import units from '../src/data/units.json' with { type: 'json' };
import buildings from '../src/data/buildings.json' with { type: 'json' };
import techs from '../src/data/techs.json' with { type: 'json' };
import wonders from '../src/data/wonders.json' with { type: 'json' };
import type { BuildingData, TechData, UnitTypeData, WonderData } from '../src/types.js';
import {
  TECHS,
  WONDERS,
  availableTechs,
  isUnlocked,
  lockedTechs,
  prereqsMet,
  productionDataOf,
  researchable,
  techUnlocked,
} from '../src/techs.js';

const unitTable = units as Record<string, UnitTypeData>;
const buildingTable = buildings as Record<string, BuildingData>;
const techTable = techs as Record<string, TechData>;
const wonderTable = wonders as Record<string, WonderData>;

describe('R-86 · intégrité référentielle de la base technologique', () => {
  it('contient exactement les 9 technologies de la table R-86', () => {
    expect(Object.keys(techTable).sort()).toEqual([
      'alphabet',
      'code_des_lois',
      'ecriture',
      'equitation',
      'lettres',
      'navigation',
      'poterie',
      'travail_du_bronze',
      'travail_du_fer',
    ]);
  });

  it('coûts 🔶 de la table R-86 (calibrage = édition du JSON)', () => {
    expect(techTable['alphabet']!.cost).toBe(20);
    expect(techTable['travail_du_bronze']!.cost).toBe(20);
    expect(techTable['poterie']!.cost).toBe(20);
    expect(techTable['equitation']!.cost).toBe(20);
    expect(techTable['travail_du_fer']!.cost).toBe(30);
    expect(techTable['ecriture']!.cost).toBe(30);
    expect(techTable['lettres']!.cost).toBe(40);
    expect(techTable['code_des_lois']!.cost).toBe(40);
    expect(techTable['navigation']!.cost).toBe(50);
  });

  it('coût > 0 pour toute technologie', () => {
    for (const t of Object.values(techTable)) expect(t.cost).toBeGreaterThan(0);
  });

  it('tout prereq existe et le graphe est sans cycle (tri topologique complet)', () => {
    for (const t of Object.values(techTable)) {
      for (const p of t.prereqs) {
        expect(techTable[p], `${t.id} → prereq ${p}`).toBeDefined();
      }
    }
    // Kahn : on retire itérativement les techs dont les prérequis sont satisfaits.
    const remaining = new Set(Object.keys(techTable));
    let progressed = true;
    while (remaining.size > 0 && progressed) {
      progressed = false;
      for (const id of [...remaining].sort()) {
        const t = techTable[id]!;
        if (t.prereqs.every((p) => !remaining.has(p))) {
          remaining.delete(id);
          progressed = true;
        }
      }
    }
    expect([...remaining].sort(), 'cycle détecté parmi ces techs').toEqual([]);
  });

  it('tout `tech` référencé par une unité ou un bâtiment existe', () => {
    for (const u of Object.values(unitTable)) {
      if (u.tech !== null && u.tech !== undefined) expect(techTable[u.tech], `${u.id} → ${u.tech}`).toBeDefined();
    }
    for (const b of Object.values(buildingTable)) {
      if (b.tech !== null && b.tech !== undefined) expect(techTable[b.tech], `${b.id} → ${b.tech}`).toBeDefined();
    }
  });

  it('index inverse cohérent : tech.unlocks ↔ tables d’items (units, buildings, wonders)', () => {
    const unlockedUnits = new Set<string>();
    const unlockedBuildings = new Set<string>();
    for (const t of Object.values(techTable)) {
      for (const id of t.unlocks.units) {
        expect(unitTable[id], `${t.id} débloque l’unité ${id}`).toBeDefined();
        expect(unitTable[id]!.tech).toBe(t.id); // réciprocité
        unlockedUnits.add(id);
      }
      for (const id of t.unlocks.buildings) {
        expect(buildingTable[id], `${t.id} débloque le bâtiment ${id}`).toBeDefined();
        expect(buildingTable[id]!.tech).toBe(t.id);
        unlockedBuildings.add(id);
      }
      for (const id of t.unlocks.wonders) {
        expect(wonderTable[id], `${t.id} débloque la merveille ${id}`).toBeDefined();
      }
    }
    // toute unité/bâtiment avec une tech est bien référencé par cette tech
    for (const u of Object.values(unitTable)) {
      if (u.tech) expect(unlockedUnits.has(u.id), `${u.id} dans unlocks de ${u.tech}`).toBe(true);
    }
    for (const b of Object.values(buildingTable)) {
      if (b.tech) expect(unlockedBuildings.has(b.id), `${b.id} dans unlocks de ${b.tech}`).toBe(true);
    }
  });

  it('les merveilles sont en données, non implémentées (non constructibles en 7a)', () => {
    expect(Object.keys(wonderTable).sort()).toEqual(['colosse_de_rhodes', 'jardins_suspendus', 'oracle_de_delphes']);
    for (const w of Object.values(wonderTable)) expect(w.implemented).toBe(false);
  });

  it('R-87 · au départ, seuls Guerrier et Colon sont constructibles (règle d’Erik)',
    () => {
      const none: string[] = [];
      for (const u of Object.values(unitTable)) {
        const producible = u.implemented !== false && techUnlocked(u.tech ?? null, none);
        if (['guerrier', 'colon'].includes(u.id)) expect(producible, u.id).toBe(true);
        else expect(producible, u.id).toBe(false);
      }
      for (const b of Object.values(buildingTable)) {
        expect(techUnlocked(b.tech ?? null, none), `${b.id} verrouillé au départ`).toBe(false);
      }
    });

  it('Espion et Galère : données seules, non constructibles même débloquée', () => {
    expect(isUnlocked({ tech: 'ecriture', implemented: false }, ['ecriture'])).toBe(false);
    expect(isUnlocked({ tech: 'navigation', implemented: false }, ['navigation'])).toBe(false);
    expect(productionDataOf({ kind: 'unit', id: 'espion' })!.implemented).toBe(false);
    expect(productionDataOf({ kind: 'unit', id: 'galere' })!.implemented).toBe(false);
  });

  it('nouvelles unités 7a : Archer 1/2/1 (15), Cavalier 2/1/2 (20), Légion 2/1/1 (10)', () => {
    expect(unitTable['archer']).toMatchObject({ attack: 1, defense: 2, movement: 1, cost: 15, tech: 'travail_du_bronze' });
    expect(unitTable['cavalier']).toMatchObject({ attack: 2, defense: 1, movement: 2, cost: 20, tech: 'equitation' });
    expect(unitTable['legion']).toMatchObject({ attack: 2, defense: 1, movement: 1, cost: 10, tech: 'travail_du_fer' });
  });
});

describe('couche de requête (availableTechs / researchable / isUnlocked)', () => {
  it('R-85 : au départ, les 4 techs racines sont disponibles', () => {
    const ids = availableTechs({ techsUnlocked: [], researching: null }).map((t) => t.id);
    expect(ids).toEqual(['alphabet', 'equitation', 'poterie', 'travail_du_bronze']);
    expect(researchable({ techsUnlocked: [], researching: null })).toEqual(availableTechs({ techsUnlocked: [], researching: null }));
  });

  it('R-86 : Travail du fer exige le Travail du bronze', () => {
    expect(prereqsMet(TECHS['travail_du_fer']!, ['alphabet'])).toBe(false);
    expect(prereqsMet(TECHS['travail_du_fer']!, ['travail_du_bronze'])).toBe(true);
    const after = availableTechs({ techsUnlocked: ['travail_du_bronze'], researching: null }).map((t) => t.id);
    expect(after).toContain('travail_du_fer');
    expect(after).not.toContain('travail_du_bronze'); // déjà débloquée
    expect(after).not.toContain('lettres'); // prérequis Écriture manquant
  });

  it('lockedTechs : les teches non disponibles et non débloquées sont listées', () => {
    const locked = lockedTechs({ techsUnlocked: [], researching: null }).map((t) => t.id);
    expect(locked).toContain('travail_du_fer');
    expect(locked).toContain('navigation');
    expect(locked).not.toContain('alphabet');
  });

  it('R-87 : isUnlocked reflète techsUnlocked et implemented', () => {
    expect(isUnlocked({ tech: null }, [])).toBe(true);
    expect(isUnlocked({ tech: 'alphabet' }, [])).toBe(false);
    expect(isUnlocked({ tech: 'alphabet' }, ['alphabet'])).toBe(true);
  });
});
