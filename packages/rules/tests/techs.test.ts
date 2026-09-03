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
  buildingCostDiscount,
  canSetProduction,
  isProducible,
  isUnitObsolete,
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

describe('R-86 · intégrité référentielle de la base technologique (7e : arbre complet)', () => {
  it('contient exactement les 46 technologies de l’arbre CivRev (source « Technologies et Déblocages »)', () => {
    expect(Object.keys(techTable)).toHaveLength(46);
    // Les 4 racines sont bien sans prérequis ; Superconductor clôt l’arbre.
    expect(techTable['alphabet']!.prereqs).toEqual([]);
    expect(techTable['travail_du_bronze']!.prereqs).toEqual([]);
    expect(techTable['equitation']!.prereqs).toEqual([]);
    expect(techTable['poterie']!.prereqs).toEqual([]);
    expect(techTable['supraconducteur']!.prereqs).toEqual(['production_de_masse', 'vol_spatial']);
  });

  it('coûts exacts 7e (20 → 6740) : écarts document/civfanatics arbitrés (Écriture 40, Irrigation 60, Industrialisation 710)', () => {
    expect(techTable['alphabet']!.cost).toBe(20);
    expect(techTable['travail_du_fer']!.cost).toBe(30);
    expect(techTable['ecriture']!.cost).toBe(40); // 🔶 document « 30-40 » → CivFanatics 40
    expect(techTable['irrigation']!.cost).toBe(60); // 🔶 document « 50-60 » → CivFanatics 60
    expect(techTable['navigation']!.cost).toBe(110);
    expect(techTable['industrialisation']!.cost).toBe(710); // 🔶 document « 530-710 » → CivFanatics 710
    expect(techTable['vol_spatial']!.cost).toBe(5860);
    expect(techTable['supraconducteur']!.cost).toBe(6740);
  });

  it('chaque tech porte son ère, et les 4 ères sont présentes (UI de l’arbre)', () => {
    for (const t of Object.values(techTable)) expect(['ancienne', 'medievale', 'industrielle', 'moderne']).toContain(t.era);
    for (const era of ['ancienne', 'medievale', 'industrielle', 'moderne']) {
      expect(Object.values(techTable).some((t) => t.era === era), era).toBe(true);
    }
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
        expect(wonderTable[id]!.tech, `merveille ${id} ↔ tech ${t.id}`).toBe(t.id);
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

  it('7e : 21 merveilles en données, coût + tech + obsolescence documentés — 4 ACTIVÉES en 7f', () => {
    expect(Object.keys(wonderTable)).toHaveLength(21);
    const active = Object.values(wonderTable)
      .filter((w) => w.implemented)
      .map((w) => w.id)
      .sort();
    // 7f (R-116) : Stonehenge, Colosse de Rhodes, Jardins suspendus et les
    // Nations Unies sont constructibles ; les autres attendent 7h.
    expect(active).toEqual(['colosse_de_rhodes', 'jardins_suspendus', 'nations_unies', 'stonehenge']);
    for (const w of Object.values(wonderTable)) {
      expect(w.cost).toBeGreaterThan(0);
    }
    // Merveilles sans tech : conditions spéciales ou disponible d'office.
    expect(wonderTable['nations_unies']!.tech).toBeNull();
    expect(wonderTable['banque_mondiale']!.tech).toBeNull();
    // T-28 🔶 : coût des Nations Unies (calibrage 7f, tranche pilotage).
    expect(wonderTable['nations_unies']!.cost).toBe(300);
    expect(wonderTable['nations_unies']!.cultureVictory).toBe(true);
    // Obsolescence : la tech qui rend la merveille obsolète existe.
    for (const w of Object.values(wonderTable)) {
      if (w.obsoleteBy) expect(techTable[w.obsoleteBy], `${w.id} obsolète par ${w.obsoleteBy}`).toBeDefined();
    }
  });

  it('7e · Premier découvrir : récompenses décrites (Travail du fer → Légion, Banque → 100 or)', () => {
    expect(techTable['travail_du_fer']!.firstToDiscover).toMatchObject({ unit: 'legion' });
    expect(techTable['maconnerie']!.firstToDiscover).toMatchObject({ building: 'remparts' });
    expect(techTable['banque']!.firstToDiscover).toMatchObject({ gold: 100 });
    expect(techTable['litteratie']!.firstToDiscover).toMatchObject({ perCity: { science: 1 } });
    expect(techTable['irrigation']!.firstToDiscover).toMatchObject({ population: 1 });
    expect(techTable['monarchie']!.firstToDiscover!.implemented).toBe(false); // Personnage illustre (7h)
    expect(techTable['alphabet']!.firstToDiscover).toBeUndefined();
  });

  it('7e · Obsolescence : Guerrier après Travail du fer, Archer après Démocratie, etc. (données)', () => {
    expect(techTable['travail_du_fer']!.obsoleteUnits).toEqual(['guerrier']);
    expect(techTable['democratie']!.obsoleteUnits).toEqual(['archer']);
    expect(techTable['navigation']!.obsoleteUnits).toEqual(['galere']);
    expect(techTable['poudre_a_canon']!.obsoleteUnits).toEqual(['piquier']);
    expect(techTable['combustion']!.obsoleteUnits).toEqual(['chevalier']);
    expect(techTable['automobile']!.obsoleteUnits).toEqual(['canon']);
    // Les unités obsolètes référencées existent.
    for (const t of Object.values(techTable)) {
      for (const id of t.obsoleteUnits ?? []) expect(unitTable[id], `${t.id} rend ${id} obsolète`).toBeDefined();
      for (const id of t.obsoleteWonders ?? []) expect(wonderTable[id], `${t.id} rend ${id} obsolète`).toBeDefined();
    }
  });

  it('R-87 · au départ, seuls Guerrier, Colon et Galère sont constructibles (7g : tech null) (règle d’Erik)',
    () => {
      const none: string[] = [];
      for (const u of Object.values(unitTable)) {
        // 7f : isProducible exclut aussi les GP (artiste/penseur — R-114).
        const producible = isProducible(
          { tech: u.tech ?? null, implemented: u.implemented, greatPerson: u.greatPerson },
          none,
          [],
        );
        if (['guerrier', 'colon', 'galere'].includes(u.id)) expect(producible, u.id).toBe(true); // 7g : Galère sans tech
        else expect(producible, u.id).toBe(false);
      }
      for (const b of Object.values(buildingTable)) {
        // 7e : le Palais est `fixed` (posé par le moteur dans la capitale).
        if (b.id === 'palais') continue;
        expect(techUnlocked(b.tech ?? null, none), `${b.id} verrouillé au départ`).toBe(false);
      }
    });

  it('7g : Espion et navales ACTIVÉS ; Caravane reste une donnée seule (isUnlocked)', () => {
    expect(isUnlocked({ tech: 'ecriture', implemented: false }, ['ecriture'])).toBe(false);
    expect(isUnlocked({ tech: null, implemented: false }, [])).toBe(false);
    expect(productionDataOf({ kind: 'unit', id: 'espion' })!.implemented).toBe(true);
    expect(productionDataOf({ kind: 'unit', id: 'espion' })!.spy).toBe(true); // R-119
    expect(productionDataOf({ kind: 'unit', id: 'galere' })!.implemented).toBe(true);
    expect(productionDataOf({ kind: 'unit', id: 'galere' })!.cargoCapacity).toBe(1); // R-117 (Galion aussi)
    expect(productionDataOf({ kind: 'unit', id: 'galion' })!.cargoCapacity).toBe(1);
    expect(productionDataOf({ kind: 'unit', id: 'caravane' })!.implemented).toBe(false); // 7h
  });

  it('nouvelles unités terrestres 7e (Appendice A) : Archer 1/2/1 (10), Piquier 1/3/1, Catapulte à distance, Chevalier, Fusilier, Canon, Tank, Artillerie, Infanterie moderne', () => {
    expect(unitTable['archer']).toMatchObject({ attack: 1, defense: 2, movement: 1, cost: 10, tech: 'travail_du_bronze' });
    expect(unitTable['piquier']).toMatchObject({ attack: 1, defense: 3, movement: 1, cost: 15, tech: 'democratie' });
    expect(unitTable['catapulte']).toMatchObject({ attack: 4, defense: 1, movement: 1, cost: 20, isRanged: true, tech: 'mathematiques' });
    expect(unitTable['chevalier']).toMatchObject({ attack: 4, defense: 2, movement: 2, cost: 25, tech: 'feudalite' });
    expect(unitTable['fusilier']).toMatchObject({ attack: 3, defense: 5, movement: 1, cost: 20, tech: 'poudre_a_canon' });
    expect(unitTable['canon']).toMatchObject({ attack: 6, defense: 2, movement: 1, cost: 30, isRanged: true, tech: 'metallurgie' });
    expect(unitTable['char_d_assaut']).toMatchObject({ attack: 10, defense: 6, movement: 3, cost: 50, tech: 'combustion' });
    expect(unitTable['artillerie']).toMatchObject({ attack: 16, defense: 2, movement: 2, cost: 50, isRanged: true, tech: 'automobile' });
    expect(unitTable['infanterie_moderne']).toMatchObject({ attack: 4, defense: 8, movement: 1, cost: 30, tech: 'production_de_masse' });
  });
});

describe('couche de requête 7e (obsolescence, producibilité, Premier découvrir)', () => {
  const first = (tech: string): string[] => [tech];

  it('obsoleteUnitsFor : le Guerrier devient obsolète après Travail du fer (données, pas de retrait des unités existantes)', () => {
    expect(isUnitObsolete('guerrier', [])).toBe(false);
    expect(isUnitObsolete('guerrier', first('travail_du_fer'))).toBe(true);
    expect(isUnitObsolete('colon', first('travail_du_fer'))).toBe(false); // jamais obsolète
  });

  it('isProducible : unité obsolète non productible, bâtiment à prérequis manquant refusé', () => {
    expect(isProducible({ tech: 'travail_du_fer' }, first('travail_du_fer'))).toBe(true);
    // Banque exige un Marché dans la ville.
    expect(isProducible({ tech: 'banque', requiresBuilding: 'marche' }, first('banque'), [])).toBe(false);
    expect(isProducible({ tech: 'banque', requiresBuilding: 'marche' }, first('banque'), ['marche'])).toBe(true);
    // Palais : fixed, jamais productible.
    expect(isProducible({ tech: null, fixed: true }, [])).toBe(false);
  });

  it('canSetProduction : chaîne complète (tech + obsolescence + doublon + prérequis de bâtiment)', () => {
    expect(canSetProduction({ kind: 'unit', id: 'guerrier' }, first('travail_du_fer'), [])).toBe(false);
    expect(canSetProduction({ kind: 'unit', id: 'legion' }, first('travail_du_fer'), [])).toBe(true);
    expect(canSetProduction({ kind: 'building', id: 'banque' }, first('banque'), ['marche'])).toBe(true);
    expect(canSetProduction({ kind: 'building', id: 'banque' }, first('banque'), [])).toBe(false);
    expect(canSetProduction({ kind: 'building', id: 'marche' }, first('banque'), ['banque'])).toBe(false);
  });

  it('buildingCostDiscount : Communisme −33 % Usines, Réseautage −50 % Universités, plafond 90 %', () => {
    const firstBy = { communisme: 'p1', reseautage: 'p2' };
    expect(buildingCostDiscount('usine', firstBy, 'p1')).toBe(0.33);
    expect(buildingCostDiscount('usine', firstBy, 'p2')).toBe(0);
    expect(buildingCostDiscount('universite', firstBy, 'p2')).toBe(0.5);
    expect(buildingCostDiscount('marche', firstBy, 'p1')).toBe(0);
  });
});

describe('couche de requête (availableTechs / researchable / isUnlocked)', () => {
  it('R-85 : au départ, les 4 techs racines sont disponibles', () => {
    const ids = availableTechs({ techsUnlocked: [], researching: null }).map((t) => t.id);
    expect(ids).toEqual(['alphabet', 'equitation', 'poterie', 'travail_du_bronze']);
    expect(researchable({ techsUnlocked: [], researching: null })).toEqual(availableTechs({ techsUnlocked: [], researching: null }));
  });

  it('R-86 (révisé 7e) : Travail du fer exige le Travail du bronze ; Mathématiques exige Écriture + Maçonnerie', () => {
    expect(prereqsMet(TECHS['travail_du_fer']!, ['alphabet'])).toBe(false);
    expect(prereqsMet(TECHS['travail_du_fer']!, ['travail_du_bronze'])).toBe(true);
    const after = availableTechs({ techsUnlocked: ['travail_du_bronze'], researching: null }).map((t) => t.id);
    expect(after).toContain('travail_du_fer');
    expect(after).not.toContain('travail_du_bronze'); // déjà débloquée
    expect(prereqsMet(TECHS['mathematiques']!, ['ecriture'])).toBe(false);
    expect(prereqsMet(TECHS['mathematiques']!, ['ecriture', 'maconnerie'])).toBe(true);
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
