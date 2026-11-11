/**
 * BOT-GATE-ATTAQUE (canon Erik 10/11, prod D3UUQJ) — tests FIRST.
 *
 * Le canon : une attaque se décide à l'ESPÉRANCE DE GAIN —
 *   P(victoire) × valeur(gain) ≥ k × P(défaite) × valeur(perte), k = 2 —
 * pondérée par la VALEUR TACTIQUE des unités (base par rôle + modificateurs,
 * tables bot.json `gateAttaque`). Le cas déclencheur : au t5 de D3UUQJ, le
 * guerrier Jev (3 PV, force 1) a attaqué le gardien barbare FORTIFIÉ du camp
 * (force ~1,5) : p ≈ 0,31, mort du guerrier, gardien intact. Jev restait sans
 * escorte. Le gate doit REFUSER cette attaque.
 *
 * L'évaluation des chances passe par les FORCES DU MOTEUR (combatStrengthsOf
 * via forcesProspectives — zéro formule parallèle) et la formule canon
 * combatOdds (R-125, la même que le dérivé). Le gate NE DÉCIDE QUE de
 * l'attaque : l'issue reste celle du dérivé ORACLE-VERDICT (déterminisme
 * bit à bit — 30 seeds).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/fixtures.js';
import { BARBARIAN_ID, UNIT_TYPES } from '../src/data.js';
import {
  deciderAttaqueUnitaire,
  forcesProspectives,
  gateAttaque,
  gateAttaqueDuBot,
  kEffectif,
  valeurTactique,
  type CategorieTactique,
} from '../src/gateAttaque.js';
import { barbarianOrders } from '../src/barbares.js';
import type { GameState, Unit } from '../src/state.js';

/** D3UUQJ reconstitué : le guerrier Jev (u1, 3 PV) adjacent au gardien
 *  barbare FORTIFIÉ (g1) posé sur la case du camp v1 (2,2). */
function etatD3UUQJ(seed = 42): { state: GameState; guerrier: Unit; gardien: Unit } {
  const state = makeState({
    players: ['jev', 'p2'],
    rngSeed: seed,
    villages: [{ q: 2, r: 2 }],
    units: [
      { id: 'u1', type: 'guerrier', owner: 'jev', q: 2, r: 3, hp: 3 },
      { id: 'g1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 2, hp: 3, fortified: true },
    ],
  });
  state.villages[0]!.spawnedUnits = ['g1'];
  return { state, guerrier: state.units['u1']!, gardien: state.units['g1']! };
}

describe('BOT-GATE-ATTAQUE · forcesProspectives (miroir combatStrengthsOf)', () => {
  it('le gardien fortifié défend à 1,5 — les bonus T-17 comptent', () => {
    const { state, guerrier, gardien } = etatD3UUQJ();
    const { sAtt, sDef } = forcesProspectives(state, guerrier, gardien);
    expect(sAtt).toBe(1); // guerrier plein, aucun trait (NEUTRAL_CIV)
    expect(sDef).toBeCloseTo(1.1, 5); // 1 × (1 + 0,1 fortification T-17, demeure) — la force « ~1,1 » du diagnostic D3UUQJ
  });

  it('une armée attaque à la somme des membres (R-31 — socle ARMEE-STRENGTH)', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      units: [
        { id: 'a1', type: 'guerrier', owner: 'jev', q: 1, r: 1, hp: 9, isArmy: true },
        { id: 'u2', type: 'guerrier', owner: 'p2', q: 1, r: 2, hp: 3 },
      ],
    });
    const { sAtt } = forcesProspectives(state, state.units['a1']!, state.units['u2']!);
    expect(sAtt).toBe(3); // 1 × 3 (R-31)
  });
});

describe('BOT-GATE-ATTAQUE · le cas D3UUQJ (rouge avant fix)', () => {
  it('REFUSE le suicide du t5 : guerrier 3 PV vs gardien fortifié', () => {
    const { state, guerrier, gardien } = etatD3UUQJ();
    const verdict = deciderAttaqueUnitaire(state, guerrier, gardien);
    // p(victoire) ≈ 0,31 : une attaque à p 0,48 pour un gain faible ne passe JAMAIS k=2.
    expect(verdict.p).toBeLessThan(0.5);
    expect(verdict.k).toBe(2);
    expect(verdict.passe).toBe(false);
  });

  it('AUTORISE l’armée 9 PV ×3 vs satellite 3 PV plein (p ≈ 0,9, gain fort)', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      villages: [{ q: 5, r: 5 }],
      units: [
        { id: 'a1', type: 'guerrier', owner: 'jev', q: 5, r: 4, hp: 9, isArmy: true },
        { id: 's1', type: 'guerrier', owner: BARBARIAN_ID, q: 5, r: 5, hp: 3 },
      ],
    });
    state.villages[0]!.spawnedUnits = ['s1'];
    const verdict = deciderAttaqueUnitaire(state, state.units['a1']!, state.units['s1']!);
    expect(verdict.p).toBeGreaterThan(0.8);
    expect(verdict.passe).toBe(true);
  });
});

describe('BOT-GATE-ATTAQUE · valeurTactique (base par rôle + modificateurs)', () => {
  it('le colon SANS site de fondation en réserve vaut très cher', () => {
    // Carte tout montagne : aucune case de fondation en réserve.
    const state = makeState({
      players: ['jev', 'p2'],
      fill: 'montagne',
      units: [{ id: 'c1', type: 'colon', owner: 'jev', q: 1, r: 1 }],
    });
    const v = valeurTactique(state, state.units['c1']!, 'jev');
    expect(v).toBeGreaterThan(150); // baseRole.colonSansSite
  });

  it('la dernière combattante vaut plus que la 4e (1 sur 1 > 1 sur 4)', () => {
    const seule = makeState({ players: ['jev', 'p2'], units: [{ id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1 }] });
    const quatre = makeState({
      players: ['jev', 'p2'],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1 },
        { id: 'u2', type: 'guerrier', owner: 'jev', q: 2, r: 1 },
        { id: 'u3', type: 'guerrier', owner: 'jev', q: 3, r: 1 },
        { id: 'u4', type: 'guerrier', owner: 'jev', q: 4, r: 1 },
      ],
    });
    const vSeule = valeurTactique(seule, seule.units['u1']!, 'jev');
    const vQuatre = valeurTactique(quatre, quatre.units['u1']!, 'jev');
    expect(vSeule).toBeGreaterThan(vQuatre);
    expect(vQuatre / vSeule).toBeCloseTo(0.5, 5); // n = 4 : 1 + 2/4 = 1,5 vs ×3 à n = 1
  });

  it('le gardien de capitale vaut plus qu’une unité standard', () => {
    const avec = makeState({
      players: ['jev', 'p2'],
      cities: [{ id: 'c1', owner: 'jev', q: 1, r: 1, capital: true }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1 }],
    });
    const ailleurs = makeState({
      players: ['jev', 'p2'],
      cities: [{ id: 'c1', owner: 'jev', q: 1, r: 1, capital: true }],
      units: [{ id: 'u1', type: 'guerrier', owner: 'jev', q: 4, r: 4 }],
    });
    const vCapitale = valeurTactique(avec, avec.units['u1']!, 'jev');
    const vStandard = valeurTactique(ailleurs, ailleurs.units['u1']!, 'jev');
    expect(vCapitale).toBeGreaterThan(vStandard);
  });

  it('l’unité d’ère dépassée vaut peu (upgrade disponible à la tech débloquée)', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1 },
        { id: 'u2', type: 'guerrier', owner: 'jev', q: 2, r: 1 },
      ],
    });
    // guerrier.upgradeTo = legion, tech requise = bronze_working (cost data) —
    // on débloque la tech de l'upgrade : le guerrier est dépassé.
    const techUpgrade = UNIT_TYPES['guerrier']!.upgradeTo;
    expect(techUpgrade).toBeTruthy();
    const tech = UNIT_TYPES[techUpgrade!]!.tech;
    expect(tech).toBeTruthy();
    state.players['jev']!.techsUnlocked = [tech!];
    const vDepassee = valeurTactique(state, state.units['u1']!, 'jev');
    state.players['jev']!.techsUnlocked = [];
    const vNormale = valeurTactique(state, state.units['u1']!, 'jev');
    expect(vDepassee).toBeLessThan(vNormale);
  });

  it('vétéran +50 %, PV blessés en réduction proportionnelle', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1, veteran: true },
        { id: 'u2', type: 'guerrier', owner: 'jev', q: 2, r: 1, hp: 1 },
        { id: 'u3', type: 'guerrier', owner: 'jev', q: 3, r: 1 },
      ],
    });
    const base = valeurTactique(state, state.units['u3']!, 'jev');
    expect(valeurTactique(state, state.units['u1']!, 'jev')).toBeCloseTo(base * 1.5, 5);
    expect(valeurTactique(state, state.units['u2']!, 'jev')).toBeCloseTo(base / 3, 5); // hp 1/3
  });

  it('la position critique (seule combattante entre un ennemi et la ville) est bonifiée', () => {
    const critique = makeState({
      players: ['jev', 'p2'],
      warPairs: [['jev', 'p2']],
      cities: [{ id: 'c1', owner: 'jev', q: 1, r: 1, capital: true }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 2 },
        { id: 'e1', type: 'guerrier', owner: 'p2', q: 1, r: 3 },
      ],
    });
    const libre = makeState({
      players: ['jev', 'p2'],
      warPairs: [['jev', 'p2']],
      cities: [{ id: 'c1', owner: 'jev', q: 1, r: 1, capital: true }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 5, r: 5 },
        { id: 'e1', type: 'guerrier', owner: 'p2', q: 1, r: 3 },
      ],
    });
    const vCritique = valeurTactique(critique, critique.units['u1']!, 'jev');
    const vLibre = valeurTactique(libre, libre.units['u1']!, 'jev');
    expect(vCritique).toBeGreaterThan(vLibre);
  });
});

describe('BOT-GATE-ATTAQUE · le gate espérance (k = 2)', () => {
  it('gateAttaque pur : P×gain ≥ k×(1−P)×perte', () => {
    expect(gateAttaque(0.9, 100, 50, 2)).toBe(true);
    expect(gateAttaque(0.31, 96, 75, 2)).toBe(false); // le cas D3UUQJ
  });

  it('le colon seul est refusé MÊME à p élevé (valeur très élevée côté perte)', () => {
    // p = 0,9, gain d'une cible standard 25 → 22,5 < 2 × 0,1 × 200 = 40.
    expect(gateAttaque(0.9, 25, 200, 2)).toBe(false);
  });

  it('la catégorie Jev jeGarde bascule une attaque autorisée en refus', () => {
    // Autorisée sans catégorie : 0,6×100 = 60 ≥ 2×0,4×50 = 40.
    expect(gateAttaque(0.6, 100, 50, 2)).toBe(true);
    // jeGarde double la valeur de l'attaquant : 60 < 2×0,4×100 = 80 → refus.
    expect(gateAttaque(0.6, 100, 100, 2)).toBe(false);
  });

  it('la catégorie Jev sacrificable bascule un refus en autorisation (bornage ×0,5)', () => {
    // Refusée sans catégorie : 0,55×50 = 27,5 < 2×0,45×40 = 36.
    expect(gateAttaque(0.55, 50, 40, 2)).toBe(false);
    // sacrificable divise par 2 : 27,5 ≥ 2×0,45×20 = 18 → autorisée.
    expect(gateAttaque(0.55, 50, 20, 2)).toBe(true);
  });

  it('les multiplicateurs Jev sont BORNÉS (×0,5 à ×2), catégorie inconnue = neutre', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      units: [{ id: 'u1', type: 'guerrier', owner: 'jev', q: 1, r: 1 }],
    });
    const neutre = valeurTactique(state, state.units['u1']!, 'jev');
    expect(valeurTactique(state, state.units['u1']!, 'jev', 'jeGarde')).toBeCloseTo(neutre * 2, 5);
    expect(valeurTactique(state, state.units['u1']!, 'jev', 'sacrifiable')).toBeCloseTo(neutre * 0.5, 5);
    expect(valeurTactique(state, state.units['u1']!, 'jev', 'positionDecisive')).toBeCloseTo(neutre * 2, 5);
    expect(valeurTactique(state, state.units['u1']!, 'jev', 'nimportequoi' as CategorieTactique)).toBeCloseTo(neutre, 5);
  });

  it('quatre guerriers : l’unité jeGarde est épargnée, la sacrifiable attaque', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      villages: [{ q: 6, r: 6 }],
      units: [
        { id: 'u1', type: 'guerrier', owner: 'jev', q: 6, r: 5, hp: 3 },
        { id: 'u2', type: 'guerrier', owner: 'jev', q: 7, r: 5, hp: 3 },
        { id: 'u3', type: 'guerrier', owner: 'jev', q: 8, r: 5, hp: 3 },
        { id: 'u4', type: 'guerrier', owner: 'jev', q: 5, r: 5, hp: 3 },
        { id: 'g1', type: 'guerrier', owner: BARBARIAN_ID, q: 6, r: 6, hp: 3, fortified: false },
      ],
    });
    state.villages[0]!.spawnedUnits = ['g1'];
    const gardien = state.units['g1']!;
    // Forces égales → p = 0,5 ; gain = valeur gardien + butin du camp.
    const neutre = deciderAttaqueUnitaire(state, state.units['u2']!, gardien);
    const garde = deciderAttaqueUnitaire(state, state.units['u1']!, gardien, 'jeGarde');
    const sacrifiable = deciderAttaqueUnitaire(state, state.units['u3']!, gardien, 'sacrifiable');
    expect(sacrifiable.passe).toBe(true);
    expect(garde.passe).toBe(false);
    // Le gate préfère risquer l'unité sacrifiable : son espérance nette est la meilleure.
    const esperance = (v: { p: number; gain: number; perte: number }) => v.p * v.gain - (1 - v.p) * v.perte;
    expect(esperance(sacrifiable)).toBeGreaterThan(esperance(garde));
    void neutre;
  });
});

describe('BOT-GATE-ATTAQUE · déterminisme (30 seeds)', () => {
  it('même état → même verdict, quelle que soit la graine (le gate ne tire JAMAIS le dé)', () => {
    const premier = deciderAttaqueUnitaire(etatD3UUQJ(1).state, etatD3UUQJ(1).guerrier, etatD3UUQJ(1).gardien);
    for (let seed = 2; seed <= 30; seed++) {
      const { state, guerrier, gardien } = etatD3UUQJ(seed);
      const v = deciderAttaqueUnitaire(state, guerrier, gardien);
      expect(v.passe).toBe(premier.passe);
      expect(v.p).toBeCloseTo(premier.p, 10);
      expect(v.gain).toBeCloseTo(premier.gain, 10);
      expect(v.perte).toBeCloseTo(premier.perte, 10);
    }
  });
});

describe('BOT-GATE-PRESSION-CAMPAGNE (canon Erik 11/11) · k décroissant avec la durée de guerre', () => {
  /** Deux guerriers de part et d'autre, n = 1 combattante chacun (valeur
   *  ×3 = 75 de chaque côté — le bonus de sécurité 50 fait le seul écart).
   *  `duree` = tours depuis la DÉCLARATION (warsDepuis + turn). */
  function accrochage(opts: { guerre: boolean; duree?: number }): { state: GameState; a: Unit; d: Unit } {
    const state = makeState({
      players: ['jev', 'p2'],
      ...(opts.guerre ? {} : { warPairs: [] as Array<[string, string]> }),
      turn: 20,
      units: [
        { id: 'a1', type: 'guerrier', owner: 'jev', q: 1, r: 1 },
        { id: 'd1', type: 'guerrier', owner: 'p2', q: 1, r: 2 },
      ],
    });
    if (opts.guerre) {
      state.diplomacy.warsDepuis = { 'jev,p2': 20 - (opts.duree ?? 0) };
    }
    return { state, a: state.units['a1']!, d: state.units['d1']! };
  }

  it('la courbe k(t) : 2 à t=0, 1,3 à t=7, 1,1 à t=9, plancher 1,1 ensuite', () => {
    const d = gateAttaqueDuBot();
    expect(kEffectif(d, 0, true)).toBe(2);
    expect(kEffectif(d, 7, true)).toBeCloseTo(1.3, 10);
    expect(kEffectif(d, 9, true)).toBeCloseTo(1.1, 10);
    expect(kEffectif(d, 20, true)).toBeCloseTo(1.1, 10); // plancher
    expect(kEffectif(d, 15, false)).toBe(2); // hors guerre : jamais la courbe
  });

  it('le MÊME accrochage p 0,5 : REFUS en guerre fraîche (t=2, k≈1,8) / AUTORISÉ en guerre longue (t=9, plancher)', () => {
    const fraiche = accrochage({ guerre: true, duree: 2 });
    const vF = deciderAttaqueUnitaire(fraiche.state, fraiche.a, fraiche.d);
    expect(vF.p).toBeCloseTo(0.5, 5);
    expect(vF.passe).toBe(false);

    const longue = accrochage({ guerre: true, duree: 9 });
    const vL = deciderAttaqueUnitaire(longue.state, longue.a, longue.d);
    expect(vL.k).toBeCloseTo(1.1, 10);
    expect(vL.passe).toBe(true);
  });

  it('le suicide pur (p 0,4525 symétrique) reste fermé à t=20 aussi (plancher 1,1)', () => {
    expect(gateAttaque(0.4525, 75, 75, 1.1)).toBe(false);
    expect(gateAttaque(0.524, 75, 75, 1.1)).toBe(true); // le contact canon p ≥ 0,524
  });

  it('NON-RÉGRESSION D3UUQJ : les barbares restent à kHorsGuerre, courbe jamais applicable', () => {
    const { state, guerrier, gardien } = etatD3UUQJ();
    const verdict = deciderAttaqueUnitaire(state, guerrier, gardien);
    expect(verdict.k).toBe(2);
    expect(verdict.passe).toBe(false);
    expect(verdict.p).toBeCloseTo(0.4525, 3);
  });

  it('la table est lisible dans bot.json (kHorsGuerre 2 / kPente 0,1 / kPlancher 1,1)', () => {
    const d = gateAttaqueDuBot();
    expect(d.kHorsGuerre).toBe(2);
    expect(d.kPente).toBe(0.1);
    expect(d.kPlancher).toBe(1.1);
  });

  it('déterminisme 30 seeds : le verdict d’accrochage long est identique (aucun tir)', () => {
    const temoin = accrochage({ guerre: true, duree: 9 });
    const premier = deciderAttaqueUnitaire(temoin.state, temoin.a, temoin.d);
    for (let seed = 2; seed <= 30; seed++) {
      const { state, a, d } = accrochage({ guerre: true, duree: 9 });
      const v = deciderAttaqueUnitaire(state, a, d);
      expect(v.passe).toBe(premier.passe);
      expect(v.p).toBeCloseTo(premier.p, 10);
    }
  });
});

describe('BOT-GATE-ATTAQUE · barbares (R-97 gated, garde et camp intacts)', () => {
  it('le gardien FORTIFIE toujours (BARBARES-GARDE-FORTIFIE 412d7d0 inchangé)', () => {
    const { state } = etatD3UUQJ();
    const orders = barbarianOrders(state);
    expect(orders).toContainEqual({ type: 'Fortify', unitId: 'g1' });
    // La garde n'attaque JAMAIS (elle est servie en Fortify avant tout).
    expect(orders.some((o) => o.type === 'Attack' && (o as { unitId: string }).unitId === 'g1')).toBe(false);
  });

  it('un satellite ARMÉE attaque le civil voisin (espérance passe)', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      villages: [{ q: 2, r: 2 }],
      units: [
        { id: 's1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 3, hp: 9, isArmy: true },
        { id: 'victime', type: 'guerrier', owner: 'p2', q: 2, r: 4, hp: 3 },
      ],
    });
    state.villages[0]!.spawnedUnits = ['s1'];
    const orders = barbarianOrders(state);
    expect(orders).toContainEqual({ type: 'Attack', unitId: 's1', target: { q: 2, r: 4 } });
  });

  it('un satellite refusé par le gate TIENT (Hold — jamais le suicide, jamais inactif)', () => {
    const state = makeState({
      players: ['jev', 'p2'],
      villages: [{ q: 2, r: 2 }],
      units: [
        { id: 's1', type: 'guerrier', owner: BARBARIAN_ID, q: 2, r: 3, hp: 3 },
        { id: 'victime', type: 'guerrier', owner: 'p2', q: 2, r: 4, hp: 3 },
      ],
    });
    state.villages[0]!.spawnedUnits = ['s1'];
    const orders = barbarianOrders(state).filter((o) => (o as { unitId: string }).unitId === 's1');
    // Refus → TIENT (Hold) : ni attaque, ni marche d'aggro vers la cible.
    expect(orders).toEqual([{ type: 'Hold', unitId: 's1' }]);
  });
});
