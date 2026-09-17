/**
 * R-159 rév. B (décision d'Erik du 17/09, dictée au labo) — dispute de
 * destination amie, retenue d'entrée, renfort défensive et dispersion de pile.
 *
 * Contrat :
 *  - co-destination amie LÉGALE si un ennemi sera sur la case à l'entrée
 *    (présent ou y arrivant) ; l'ennemi qui part fait perdre le droit d'entrée
 *    — au plus une amie y entre (les autres avancent au max et s'arrêtent) ;
 *  - entrée conditionnelle à la mort du défenseur (amis SEULEMENT — les
 *    ennemis entrent toujours, sans combattre qui que ce soit d'autre) ;
 *  - renfort défensive : entre après l'échange si l'ennemi est physiquement
 *    entré (H2 : le tir à distance ne compte pas), même si le défenseur meurt ;
 *  - fin de R-179 : la pile amie n'est plus expulsée au tour de formation —
 *    elle persiste (résidu légal) et n'est DISPERGÉE qu'en Phase E d'un tour
 *    sans entrée physique ennemie (le restant se stabilise, R-173).
 */
import { describe, expect, it } from 'vitest';
import { makeState, resolveTurn } from '@game/rules';
import type { GameState, Order, PlayerId } from '@game/rules';

function etat(): GameState {
  return makeState({ width: 9, height: 9, fill: 'prairie', players: ['p1', 'p2'], rngSeed: 20260917 });
}

function move(unitId: string, path: Array<{ q: number; r: number }>): Order {
  return { type: 'Move', unitId, path };
}

function event(events: ReturnType<typeof resolveTurn>['events'], type: string): unknown {
  return events.find((e) => e.type === type);
}

describe('R-159 rév. B — co-destination amie avec ennemi présent', () => {
  it('deux amies entrent sur le défenseur stabilisé, attaquent en séquence, mêlée reportée (pas de dispersion)', () => {
    const s = etat();
    // u1/u2 J1 adjacentes de (4,3) ; u3 J2 seule → stabilisée.
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u1', [{ q: 4, r: 3 }]), move('u2', [{ q: 4, r: 3 }])],
      p2: [],
    };
    const { newState, events } = resolveTurn(s, ordres, s.rngSeed);
    // Les deux amies sont sur la case du défenseur (co-destination légale).
    expect(newState.units['u1']!.q).toBe(4);
    expect(newState.units['u1']!.r).toBe(3);
    expect(newState.units['u2']!.q).toBe(4);
    expect(newState.units['u2']!.r).toBe(3);
    // Le défenseur a encaissé 2 attaques (3 PV, max −2) : vivant.
    expect(newState.units['u3']).toBeTruthy();
    expect(events.filter((e) => e.type === 'Attack')).toHaveLength(2);
    // Défenseur stabilisé attaqué → mêlée reportée, PAS de mêlée immédiate ni de dispersion.
    expect(event(events, 'MeleeResolved')).toBeUndefined();
    expect(event(events, 'UnitDispersed')).toBeUndefined();
    expect(event(events, 'UnitExpelled')).toBeUndefined();
  });

  it('tour suivant : la mêlée à 3 participants tombe (report R-178 rév. A)', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 1, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const { events } = resolveTurn(s, {}, s.rngSeed);
    const melee = event(events, 'MeleeResolved') as { participants: string[] } | undefined;
    expect(melee).toBeTruthy();
    expect(melee!.participants.sort()).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('R-159 rév. B — entrée conditionnelle à la mort du défenseur', () => {
  it('la première amie tue : la deuxième est retenue (refus — aucun ennemi ne demeure), les ennemis ne sont jamais retenus', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 1, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    // Graine calée (sonde) : la première activée par le tie R-177 tue u3
    // (1 PV), la deuxième est retenue — défenseur mort, aucun ennemi ne reste.
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u1', [{ q: 4, r: 3 }]), move('u2', [{ q: 4, r: 3 }])],
      p2: [],
    };
    const { newState, events } = resolveTurn(s, ordres, 2);
    const destruction = events.find((e) => e.type === 'UnitDestroyed' && e.unitId === 'u3') as { byUnitId?: string } | undefined;
    expect(destruction).toBeTruthy(); // la graine donne le kill à la première activée
    const tueuse = destruction!.byUnitId!;
    const retenue = tueuse === 'u2' ? 'u1' : 'u2';
    expect(newState.units[tueuse]!.q).toBe(4); // la tueuse sur la case
    // L'autre amie est retenue : défenseur mort, aucun ennemi ne demeure → refus.
    expect(newState.units[retenue]!.q).toBe(retenue === 'u1' ? 3 : 5);
    expect(events.filter((e) => e.type === 'Attack')).toHaveLength(1); // une seule attaque
  });

  it('le défenseur meurt mais d’autres ennemis demeurent : la deuxième amie ENTRE sans combattre (P1)', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 1, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    s.units['u4'] = { id: 'u4', type: 'guerrier', owner: 'p2', q: 4, r: 2, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    // u4 (ennemi) entre AUSSI sur (4,3) : les ennemis ne sont jamais retenus.
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u1', [{ q: 4, r: 3 }]), move('u2', [{ q: 4, r: 3 }])],
      p2: [move('u4', [{ q: 4, r: 3 }])],
    };
    const { newState, events } = resolveTurn(s, ordres, 3);
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'u3')).toBe(true);
    // u4 ennemie est entrée (jamais retenue) et u2 amie entre : ennemi présent (P1).
    expect(newState.units['u4']!.q).toBe(4);
    expect(newState.units['u2']!.q).toBe(4);
    expect(events.filter((e) => e.type === 'Attack')).toHaveLength(1); // u2 n'attaque pas u4
  });
});

describe('R-159 rév. B — l’ennemi qui part (Q1)', () => {
  it('l’ennemi quitte la case avant l’entrée : une seule amie y entre, l’autre s’arrête', () => {
    const s = etat();
    // u1 = ennemi (part le premier, unitId croissant) ; u2/u3 amies co-destinées.
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u2', [{ q: 4, r: 3 }]), move('u3', [{ q: 4, r: 3 }])],
      p2: [move('u1', [{ q: 4, r: 2 }])],
    };
    const { newState } = resolveTurn(s, ordres, s.rngSeed);
    expect(newState.units['u1']!.q).toBe(4);
    expect(newState.units['u1']!.r).toBe(2); // partie
    // La première programmée (u2) entre ; u3 s'arrête avant la case.
    expect(newState.units['u2']!.q).toBe(4);
    expect(newState.units['u2']!.r).toBe(3);
    expect(newState.units['u3']!.q).toBe(5);
    expect(newState.units['u3']!.r).toBe(3);
  });
});

describe('R-159 rév. B — cohabitation amie hors attaque : illégale', () => {
  it('entrer sur une case d’une amie stabilisée sans menace ennemie est refusé', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const ordres: Record<PlayerId, Order[]> = { p1: [move('u2', [{ q: 4, r: 3 }])], p2: [] };
    const { newState } = resolveTurn(s, ordres, s.rngSeed);
    expect(newState.units['u2']!.q).toBe(5); // refusée, reste sur place
    expect(newState.units['u1']!.stabilized).toBe(true);
  });
});

describe('R-159 rév. B — renfort défensive (P3)', () => {
  function base(): GameState {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    return s;
  }
  it('l’ennemi entre et attaque : la renfort entre APRÈS l’échange et cohabite (mêlée reportée)', () => {
    const s = base();
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 2, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u2', [{ q: 4, r: 3 }])],
      p2: [move('u3', [{ q: 4, r: 3 }])],
    };
    const { newState, events } = resolveTurn(s, ordres, s.rngSeed);
    expect(newState.units['u2']!.q).toBe(4); // renfort entrée après l'échange
    expect(newState.units['u3']!.q).toBe(4); // ennemi entré
    expect(event(events, 'MeleeResolved')).toBeUndefined(); // reportée (défenseur attaqué)
  });
  it('aucune attaque ennemie : la renfort n’entre pas', () => {
    const s = base();
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 2, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const ordres: Record<PlayerId, Order[]> = { p1: [move('u2', [{ q: 4, r: 3 }])], p2: [] };
    const { newState } = resolveTurn(s, ordres, s.rngSeed);
    expect(newState.units['u2']!.q).toBe(5); // refusée
  });
  it('le défenseur meurt : la renfort entre et cohabite avec l’ennemi vainqueur', () => {
    const s = base();
    s.units['u1']!.hp = 1; // défenseur à 1 PV
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 2, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const ordres: Record<PlayerId, Order[]> = {
      p1: [move('u2', [{ q: 4, r: 3 }])],
      p2: [move('u3', [{ q: 4, r: 3 }])],
    };
    const { newState, events } = resolveTurn(s, ordres, 3); // graine : l'attaquant gagne
    expect(events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'u1')).toBe(true);
    expect(newState.units['u2']!.q).toBe(4); // la renfort entre quand même (P3)
    expect(newState.units['u3']!.q).toBe(4);
  });
});

describe('R-159 rév. B — dispersion de pile amie (fin de R-179)', () => {
  it('pile amie posée sans combat : dispersée dès la Phase E, le restant se stabilise', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    const { newState, events } = resolveTurn(s, {}, s.rngSeed);
    expect(event(events, 'UnitDispersed')).toBeTruthy();
    // La mieux fondée reste (égalité → unitId) : u1 demeure et stabilise.
    expect(newState.units['u1']!.q).toBe(4);
    expect(newState.units['u1']!.r).toBe(3);
    expect(newState.units['u1']!.stabilized).toBe(true);
    expect(newState.units['u2']).toBeTruthy();
    expect(newState.units['u2']!.q !== 4 || newState.units['u2']!.r !== 3).toBe(true);
  });

  it('résidu de combat (les deux attaquantes ont tué) : la pile PERSISTE au tour 1, dispersée au tour 2 (P2)', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 4, r: 3, hp: 1, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    // Graine calée (sonde : 14) — les DEUX attaques touchent : défenseur 1 PV
    // + 2 × (−1) → morte ; les deux amies demeurent ensemble (résidu, P2).
    const r1 = resolveTurn(s, { p1: [move('u1', [{ q: 4, r: 3 }]), move('u2', [{ q: 4, r: 3 }])], p2: [] }, 14);
    expect(r1.newState.units['u3']).toBeUndefined(); // morte (2 × −1)
    // Pile résiduelle : u1 et u2 demeurent ENSEMBLE au début du tour 2.
    expect(r1.newState.units['u1']!.q).toBe(4);
    expect(r1.newState.units['u2']!.q).toBe(4);
    expect(event(r1.events, 'UnitDispersed')).toBeUndefined(); // pas de dispersion au tour du combat
    const r2 = resolveTurn(r1.newState, {}, r1.newState.rngSeed);
    expect(event(r2.events, 'UnitDispersed')).toBeTruthy(); // tour sans attaque → dispersion
    const apres = r2.newState;
    expect(apres.units['u1']!.q === 4 && apres.units['u2']!.q === 4).toBe(false);
  });

  it('H3 : l’ennemi entre sur la pile → pas de dispersion, mêlée immédiate avec étau amical', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'guerrier', owner: 'p2', q: 5, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    const { events } = resolveTurn(s, { p1: [], p2: [move('u3', [{ q: 4, r: 3 }])] }, s.rngSeed);
    expect(event(events, 'UnitDispersed')).toBeUndefined();
    const melee = event(events, 'MeleeResolved') as { participants: string[] } | undefined;
    expect(melee).toBeTruthy(); // mêlée immédiate (pas de défenseur stabilisé)
    expect(melee!.participants.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('H2 : le tir de catapulte ne suspend pas la dispersion — la cible subit, l’autre est dispersée', () => {
    const s = etat();
    s.units['u1'] = { id: 'u1', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u2'] = { id: 'u2', type: 'guerrier', owner: 'p1', q: 4, r: 3, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false };
    s.units['u3'] = { id: 'u3', type: 'catapulte', owner: 'p2', q: 4, r: 2, hp: 3, mp: 1, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: true };
    const { newState, events } = resolveTurn(s, { p1: [], p2: [{ type: 'Attack', unitId: 'u3', target: { q: 4, r: 3 } }] }, s.rngSeed);
    // Le tir touche la cible mieux fondée (u1, égalité → unitId) — à distance
    // sans riposte : −1 PV. La pile est QUAND MÊME dispersée, sans mêlée.
    expect(newState.units['u1']!.hp).toBe(2);
    expect(event(events, 'MeleeResolved')).toBeUndefined();
    expect(event(events, 'UnitDispersed')).toBeTruthy();
    // La mieux fondée APRÈS dégâts reste : u2 (3 PV) ; u1 (blessée) est dispersée.
    expect(newState.units['u2']!.q).toBe(4);
    expect(newState.units['u2']!.r).toBe(3);
    expect(newState.units['u2']!.hp).toBe(3); // indemne
    expect(newState.units['u1']!.q !== 4 || newState.units['u1']!.r !== 3).toBe(true);
  });
});
