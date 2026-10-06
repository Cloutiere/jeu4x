/**
 * Tests 7f — validation structurelle des ordres (GameDO) : la production de
 * MERVEILLES (kind 'wonder', R-116) doit passer la validation de forme —
 * régression du e2e GUI (Stonehenge refusé à la soumission avant correction).
 */
import { describe, expect, it } from 'vitest';
import { orderShapeError, upsertOrderPreservingPriority } from '../src/game.js';
import type { Order } from '@game/rules';


describe('orderShapeError · SetProduction (7f, merveilles)', () => {
  it('accepte un item de production de type merveille (kind wonder)', () => {
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'stonehenge' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'wonder', id: 'nations_unies' } }),
    ).toBeNull();
  });

  it('accepte toujours unités et bâtiments, refuse les kinds inconnus', () => {
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'building', id: 'temple' } }),
    ).toBeNull();
    expect(
      orderShapeError({ type: 'SetProduction', cityId: 'c1', item: { kind: 'spaceship', id: 'x' } }),
    ).not.toBeNull();
  });

  it('accepte l\'ordre InstallPerson (R-115) et refuse les champs manquants', () => {
    expect(orderShapeError({ type: 'InstallPerson', unitId: 'u10', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'InstallPerson', unitId: 'u10' })).not.toBeNull();
    expect(orderShapeError({ type: 'InstallPerson', cityId: 'c1' })).not.toBeNull();
  });

  it('7j · R-126 : accepte GreatPersonAction (consume/settle + ville) et refuse action invalide', () => {
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'consume', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'settle', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'both', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', action: 'settle', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'GreatPersonAction', unitId: 'u10', action: 'settle' })).not.toBeNull();
  });

  it('7l · R-135 : accepte RushBuy (ville) et refuse la forme invalide — leçon 7f : forme validée EN PREMIER', () => {
    expect(orderShapeError({ type: 'RushBuy', cityId: 'c1' })).toBeNull();
    expect(orderShapeError({ type: 'RushBuy' })).not.toBeNull();
    expect(orderShapeError({ type: 'RushBuy', cityId: 42 })).not.toBeNull();
  });

  it('7g · R-119 : accepte SpyMission (vol de GP) et refuse mission/champs invalides', () => {
    expect(
      orderShapeError({ type: 'SpyMission', unitId: 'u3', cityId: 'c2', mission: 'stealGreatPerson' }),
    ).toBeNull();
    expect(orderShapeError({ type: 'SpyMission', unitId: 'u3', cityId: 'c2', mission: 'assassinate' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyMission', unitId: 'u3', mission: 'stealGreatPerson' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyMission', cityId: 'c2', mission: 'stealGreatPerson' })).not.toBeNull();
  });

  it('7m · R-139 : accepte Launch (ICBM + cible hex) et refuse la forme invalide — forme validée EN PREMIER', () => {
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: { q: 3, r: -2 } })).toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9' })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', target: { q: 3, r: -2 } })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: { q: 1.5, r: 0 } })).not.toBeNull();
    expect(orderShapeError({ type: 'Launch', unitId: 'u9', target: '0,0' })).not.toBeNull();
  });

  it('7m · R-143 : accepte SpyAction (6 actions) et refuse action inconnue / buildingId manquant', () => {
    for (const action of ['stealGold', 'kidnapGreatPerson', 'sabotageProduction', 'destroyFortifications', 'leave']) {
      expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action })).toBeNull();
    }
    expect(
      orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'destroyBuilding', buildingId: 'temple' }),
    ).toBeNull();
    // destroyBuilding EXIGE buildingId (choix du tireur 🔶) ; action inconnue refusée.
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'destroyBuilding' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', cityId: 'c2', action: 'assassinate' })).not.toBeNull();
    expect(orderShapeError({ type: 'SpyAction', unitId: 'u3', action: 'stealGold' })).not.toBeNull();
  });
});

describe('orderShapeError · MultiStep (DEPLACEMENT-PLANIFIE, R-158)', () => {
  it('accepte un ordre composite : chemin + action finale foundCity', () => {
    expect(
      orderShapeError({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'foundCity' }),
    ).toBeNull();
  });

  it('accepte un composite SANS action finale (déplacement en forme composite)', () => {
    expect(orderShapeError({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }, { q: 2, r: 0 }] })).toBeNull();
  });

  it('refuse la forme invalide : chemin vide, chemins non hex, action finale inconnue', () => {
    expect(orderShapeError({ type: 'MultiStep', unitId: 'u1', path: [] })).not.toBeNull();
    expect(orderShapeError({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1.5, r: 0 }] })).not.toBeNull();
    expect(orderShapeError({ type: 'MultiStep', unitId: 'u1', path: '0,0' })).not.toBeNull();
    expect(
      orderShapeError({ type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'raidTreasury' }),
    ).not.toBeNull();
    expect(orderShapeError({ type: 'MultiStep', path: [{ q: 1, r: 0 }] })).not.toBeNull();
  });
});

describe('upsertOrderPreservingPriority (R-159 · D3)', () => {
  const existing: Order[] = [
    { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
    { type: 'Hold', unitId: 'u2' },
    { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 0 }] },
  ];

  it('re-programmer une unité REMPLACE son ordre EN PLACE (priorité conservée)', () => {
    const out = upsertOrderPreservingPriority(existing, { type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] });
    expect(out.map((o) => ('unitId' in o ? o.unitId : null))).toEqual(['u1', 'u2', 'u3']);
    expect(out[0]).toEqual({ type: 'Move', unitId: 'u1', path: [{ q: 5, r: 5 }] });
  });

  it('un nouvel ordre (après annulation) est ajouté EN FIN de file', () => {
    const withoutU3: Order[] = [
      { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] },
      { type: 'Hold', unitId: 'u2' },
    ];
    const out = upsertOrderPreservingPriority(withoutU3, { type: 'Move', unitId: 'u3', path: [{ q: 2, r: 0 }] });
    expect(out.map((o) => ('unitId' in o ? o.unitId : null))).toEqual(['u1', 'u2', 'u3']);
  });
});

// ---------------------------------------------------------------------------
// COLON-FONDATION — orderOwnerErreur : le composite MultiStep (R-158) exige la
// même possession d'unité que Move. Régression : la case manquante rejetait
// tout ordre composite en « ordre inconnu » (bouton « 1. Déplacer → 2. Fonder »
// muet depuis DEPLACEMENT-PLANIFIE — découvert à la validation GUI de
// COLON-FONDATION, dont l'état visuel est adossé à cet ordre).
// ---------------------------------------------------------------------------
import { orderOwnerErreur } from '../src/game.js';

describe('orderOwnerErreur · MultiStep (correctif COLON-FONDATION)', () => {
  const units = { u1: { owner: 'p1' }, u2: { owner: 'p2' } };
  const cities = { c1: { owner: 'p1' } };

  it('MultiStep sur une unité possédée → accepté (null)', () => {
    expect(
      orderOwnerErreur(units, cities, 'p1', { type: 'MultiStep', unitId: 'u1', path: [{ q: 1, r: 0 }], final: 'foundCity' }),
    ).toBeNull();
  });

  it('MultiStep sur une unité ENNEMIE → rejeté (possession, pas la forme)', () => {
    expect(
      orderOwnerErreur(units, cities, 'p1', { type: 'MultiStep', unitId: 'u2', path: [{ q: 1, r: 0 }], final: 'foundCity' }),
    ).not.toBeNull();
  });

  it('Move/FoundCity inchangés (miroir exact de l\'ancien comportement)', () => {
    expect(orderOwnerErreur(units, cities, 'p1', { type: 'Move', unitId: 'u1', path: [{ q: 1, r: 0 }] })).toBeNull();
    expect(orderOwnerErreur(units, cities, 'p1', { type: 'FoundCity', unitId: 'u1' })).toBeNull();
    expect(orderOwnerErreur(units, cities, 'p1', { type: 'FoundCity', unitId: 'u2' })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MENU-VILLE-QUEUE · D1/D2 — formes des opérations de file (validées EN
// PREMIER, avant tout handler — leçon 7f).
// ---------------------------------------------------------------------------
describe('orderShapeError · opérations de file (MENU-VILLE-QUEUE)', () => {
  const ITEM = { kind: 'unit', id: 'guerrier' };

  it('QueueProduction : item valide accepté ; ville/item/index invalides refusés', () => {
    expect(orderShapeError({ type: 'QueueProduction', cityId: 'c1', item: ITEM })).toBeNull();
    expect(orderShapeError({ type: 'QueueProduction', cityId: 'c1', item: { kind: 'wonder', id: 'stonehenge' } })).toBeNull();
    expect(orderShapeError({ type: 'QueueProduction', item: ITEM })).not.toBeNull();
    expect(orderShapeError({ type: 'QueueProduction', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'QueueProduction', cityId: 'c1', item: { kind: 'bidule', id: 'x' } })).not.toBeNull();
  });

  it('RemoveFromQueue : index entier exigé ; ReorderQueue : from/to entiers exigés', () => {
    expect(orderShapeError({ type: 'RemoveFromQueue', cityId: 'c1', index: 0 })).toBeNull();
    expect(orderShapeError({ type: 'RemoveFromQueue', cityId: 'c1', index: 1.5 })).not.toBeNull();
    expect(orderShapeError({ type: 'RemoveFromQueue', cityId: 'c1' })).not.toBeNull();
    expect(orderShapeError({ type: 'ReorderQueue', cityId: 'c1', from: 0, to: 1 })).toBeNull();
    expect(orderShapeError({ type: 'ReorderQueue', cityId: 'c1', from: 0 })).not.toBeNull();
    expect(orderShapeError({ type: 'ReorderQueue', cityId: 'c1', to: 1 })).not.toBeNull();
    expect(orderShapeError({ type: 'ReorderQueue', cityId: 'c1', from: 'a', to: 1 })).not.toBeNull();
  });

  it('les opérations de file ne se REMPLACENT PAS entre elles (upsert sans dédoublonnage — miroir SetWorkedTile)', () => {
    const list: Order[] = [];
    list.push(...upsertOrderPreservingPriority(list, { type: 'QueueProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } }));
    const deux = upsertOrderPreservingPriority(list, { type: 'QueueProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } });
    expect(deux.filter((o) => o.type === 'QueueProduction')).toHaveLength(2); // appended, pas remplacé
    const trois = upsertOrderPreservingPriority(deux, { type: 'RemoveFromQueue', cityId: 'c1', index: 0 });
    expect(trois).toHaveLength(3);
  });

  it('SetProduction (forme historique bot) se remplace TOUJOURS par ville, même face à une op de file', () => {
    const list: Order[] = [{ type: 'QueueProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } }];
    const out = upsertOrderPreservingPriority(list, { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'guerrier' } });
    expect(out).toHaveLength(2); // la file n'écrase pas le SetProduction du bot
    const out2 = upsertOrderPreservingPriority(out, { type: 'SetProduction', cityId: 'c1', item: { kind: 'unit', id: 'colon' } });
    expect(out2.filter((o) => o.type === 'SetProduction')).toHaveLength(1);
  });
});

describe('orderShapeError · ORDRES-UNITES (décisions d\'Erik du 06/10)', () => {
  it('accepte les quatre nouvelles formes (SellUnit / Heal / Sleep / Pass) avec unitId', () => {
    expect(orderShapeError({ type: 'SellUnit', unitId: 'u1' })).toBeNull();
    expect(orderShapeError({ type: 'Heal', unitId: 'u1' })).toBeNull();
    expect(orderShapeError({ type: 'Sleep', unitId: 'u1' })).toBeNull();
    expect(orderShapeError({ type: 'Pass', unitId: 'u1' })).toBeNull();
  });

  it('refuse les formes incomplètes — leçon 7f : forme validée EN PREMIER', () => {
    for (const type of ['SellUnit', 'Heal', 'Sleep', 'Pass'] as const) {
      expect(orderShapeError({ type })).not.toBeNull();
      expect(orderShapeError({ type, unitId: 42 })).not.toBeNull();
    }
    expect(orderShapeError({ type: 'OrdreInconnu', unitId: 'u1' })).not.toBeNull();
  });
});

describe('orderOwnerErreur · ORDRES-UNITES (décisions d\'Erik du 06/10)', () => {
  const units = { u1: { owner: 'p1' }, uX: { owner: 'p2' } };
  const cities = { c1: { owner: 'p1' } };
  it('exige la possession de l\'unité pour les quatre nouveaux ordres', () => {
    for (const type of ['SellUnit', 'Heal', 'Sleep', 'Pass'] as const) {
      expect(orderOwnerErreur(units, cities, 'p1', { type, unitId: 'u1' } as Order)).toBeNull();
      expect(orderOwnerErreur(units, cities, 'p1', { type, unitId: 'uX' } as Order)).not.toBeNull();
      expect(orderOwnerErreur(units, cities, 'p1', { type, unitId: 'zz' } as Order)).not.toBeNull();
    }
  });
});
