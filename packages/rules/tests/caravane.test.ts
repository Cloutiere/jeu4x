/**
 * CARAVANE (décisions Erik 19/10, HANDOFF-CARAVANE) — commerce forfaitaire
 * entre nations :
 *  - D1 : livraison AUTOMATIQUE à l'entrée sur une ville étrangère (défenseur
 *    en place compris — jamais de capture, jamais de cohabitation) ;
 *  - D2 : facteurs d'ère caravane (base Ancienne = 1 ; Médiévale ×2 =
 *    +160/+100 — critère #1), ère du LIVREUR, arrondi au plus proche ;
 *  - D3 : capture d'une caravane → le capteur encaisse 80 × ère du
 *    PROPRIÉTAIRE, le propriétaire rien (amendement R-43) ;
 *  - D4 : R-43 inchangée pour le Colon (butin 10) ; ville détruite en route =
 *    pas de paiement ; embarquement → dépose sur ville étrangère = livraison ;
 *  - R-109 : le bonus Monnaie « Une Caravane et un Marché gratuits » s'active
 *    (test couvert dans bonus-decouverte.test.ts — implemented: true) ;
 *  - déterminisme : deux résolutions identiques → mêmes trésoreries/événements.
 */
import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/turn.js';
import { makeState, unit as getUnit } from '../src/fixtures.js';
import { unitType } from '../src/data.js';
import { colRowToHex } from '../src/hex.js';
import { SETTLER_BOOTY_GOLD } from '../src/constants.js';
import { facteurCaravane, montantsLivraison, montantCapture } from '../src/caravane.js';
import type { GameState, Order } from '../src/state.js';
import type { TerrainId } from '../src/types.js';

const SEED = 20261019;
const H = (col: number, row: number) => colRowToHex(col, row);

/** p1 (caravane) à (1,2) ; ville étrangère p2 à (3,2) avec défenseur. */
function etatLivraison(opts: { eraLivreur?: GameState['players'][string]['era'] } = {}): GameState {
  const st = makeState({
    width: 8,
    height: 5,
    units: [
      { id: 'c1', type: 'caravane', owner: 'p1', q: H(1, 2).q, r: H(1, 2).r },
      { id: 'g1', type: 'guerrier', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r },
    ],
    cities: [{ id: 'ville2', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r, pop: 3 }],
  });
  st.players.p1!.treasury = 100;
  st.players.p2!.treasury = 100;
  if (opts.eraLivreur) st.players.p1!.era = opts.eraLivreur;
  return st;
}

describe('CARAVANE · D1 — livraison automatique', () => {
  it('Ère Ancienne : +80 livreur / +50 hôte, caravane consommée, défenseur intact', () => {
    const st = etatLivraison();
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'c1', path: [H(2, 2), H(3, 2)] }],
    };
    const { newState, events } = resolveTurn(st, orders, SEED);
    expect(newState.players.p1!.treasury).toBe(180); // 100 + 80
    expect(newState.players.p2!.treasury).toBe(150); // 100 + 50
    expect(newState.units['c1']).toBeUndefined(); // consommée
    const liv = events.find((e) => e.type === 'CaravanDelivered');
    expect(liv).toMatchObject({ livreur: 'p1', hote: 'p2', montantLivreur: 80, montantHote: 50, villeId: 'ville2' });
    // défenseur en place : ni attaqué ni capturé, aucune cohabitation
    expect(getUnit(newState, 'g1')).toMatchObject({ q: H(3, 2).q, r: H(3, 2).r, hp: 3 });
    expect(events.some((e) => e.type === 'CombatExchange')).toBe(false);
    expect(events.some((e) => e.type === 'Captured' && e.unitId === 'c1')).toBe(false);
  });

  it('critère #1 — Ère Médiévale (×2) : +160/+100 aux bonnes trésoreries', () => {
    const st = etatLivraison({ eraLivreur: 'medievale' });
    const orders: Record<string, Order[]> = {
      p1: [{ type: 'Move', unitId: 'c1', path: [H(2, 2), H(3, 2)] }],
    };
    const { newState, events } = resolveTurn(st, orders, SEED);
    expect(newState.players.p1!.treasury).toBe(260); // 100 + 160
    expect(newState.players.p2!.treasury).toBe(200); // 100 + 100
    const liv = events.find((e) => e.type === 'CaravanDelivered');
    expect(liv).toMatchObject({ montantLivreur: 160, montantHote: 100 });
  });

  it('D2 — l\'ère de référence est celle du LIVREUR (pas de l\'hôte)', () => {
    expect(montantsLivraison('ancienne')).toEqual({ livreur: 80, hote: 50 });
    expect(montantsLivraison('medievale')).toEqual({ livreur: 160, hote: 100 });
    expect(montantsLivraison('industrielle')).toEqual({ livreur: 240, hote: 150 });
    expect(montantsLivraison('moderne')).toEqual({ livreur: 400, hote: 250 });
    expect(facteurCaravane('ancienne')).toBe(1);
  });

  it('ville détruite en route : plus de paiement — la caravane arrive vivante', () => {
    const st = makeState({
      width: 8,
      height: 5,
      units: [{ id: 'c1', type: 'caravane', owner: 'p1', q: H(0, 2).q, r: H(0, 2).r }],
      // production BÂTIMENT : la fixture produirait un Colon (garnison de
      // fait sur le chemin) qui capturerait la caravane — scénario contaminé.
      cities: [{ id: 'ville2', owner: 'p2', q: H(4, 2).q, r: H(4, 2).r, pop: 3, production: { item: { kind: 'building', id: 'grenier' }, progress: 0 } }],
    });
    st.players.p1!.treasury = 100;
    st.players.p2!.treasury = 100;
    // tour 1 : 3 pas sur 4 — la ville est RASÉE entre les deux tours
    const t1 = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'c1', path: [H(1, 2), H(2, 2), H(3, 2), H(4, 2)] }] }, SEED);
    expect(events0(t1.events, 'CaravanDelivered')).toBe(false);
    delete t1.newState.cities['ville2'];
    delete t1.newState.units['u1']; // colon du palier 100 or / production — hors scénario
    const t2 = resolveTurn(t1.newState, {}, SEED);
    expect(events0(t2.events, 'CaravanDelivered')).toBe(false);
    expect(t2.newState.players.p1!.treasury).toBe(100);
    expect(t2.newState.players.p2!.treasury).toBe(100);
    expect(getUnit(t2.newState, 'c1')).toBeDefined();
  });
});

describe('CARAVANE · D3 — capture d\'une caravane (amendement R-43)', () => {
  function etatCapture(eraProprietaire?: GameState['players'][string]['era']): GameState {
    const st = makeState({
      width: 8,
      height: 5,
      units: [
        { id: 'c1', type: 'caravane', owner: 'p1', q: H(2, 2).q, r: H(2, 2).r },
        { id: 'g2', type: 'guerrier', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r },
      ],
    });
    st.players.p1!.treasury = 100;
    st.players.p2!.treasury = 100;
    if (eraProprietaire) st.players.p1!.era = eraProprietaire;
    return st;
  }

  it('capteur en guerre : +80 (ère Ancienne du propriétaire), propriétaire rien', () => {
    const st = etatCapture();
    const { newState, events } = resolveTurn(st, { p2: [{ type: 'Move', unitId: 'g2', path: [H(2, 2)] }] }, SEED);
    expect(newState.players.p2!.treasury).toBe(180); // 100 + 80
    expect(newState.players.p1!.treasury).toBe(100); // RIEN
    expect(newState.units['c1']).toBeUndefined();
    const cap = events.find((e) => e.type === 'Captured' && e.unitId === 'c1');
    expect(cap).toMatchObject({ outcome: 'destroyed', caravanGold: 80 });
    const butin = events.find((e) => e.type === 'BootyGold');
    expect(butin).toMatchObject({ player: 'p2', amount: 80 });
  });

  it('propriétaire en Ère Médiévale : le capteur encaisse 160', () => {
    const st = etatCapture('medievale');
    const { newState } = resolveTurn(st, { p2: [{ type: 'Move', unitId: 'g2', path: [H(2, 2)] }] }, SEED);
    expect(newState.players.p2!.treasury).toBe(260); // 100 + 160
    expect(montantCapture(st, 'p1')).toBe(160);
  });

  it('en PAIX (rév. DIPLOMATIE-T1 D2) : capturer la caravane exige la guerre — refus nommé, aucun or', () => {
    const st = makeState({
      width: 8,
      height: 5,
      warPairs: [],
      units: [
        { id: 'c1', type: 'caravane', owner: 'p1', q: H(2, 2).q, r: H(2, 2).r },
        { id: 'g2', type: 'guerrier', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r },
      ],
    });
    st.players.p2!.treasury = 100;
    // RÉVISION DIPLOMATIE-T1 : la capture R-43 par un MARCHEUR exige la guerre ;
    // en Paix le guerrier s'arrête devant (AttackRefused), la caravane est
    // intacte et RICHE (elle livre à la prochaine occasion).
    const { newState, events } = resolveTurn(st, { p2: [{ type: 'Move', unitId: 'g2', path: [H(2, 2)] }] }, SEED);
    expect(events.some((e) => e.type === 'AttackRefused')).toBe(true);
    expect(getUnit(newState, 'c1').detainedBy ?? null).toBeNull();
    expect(newState.players.p2!.treasury).toBe(100);
    expect(events.some((e) => e.type === 'BootyGold')).toBe(false);
    expect(events.some((e) => e.type === 'Captured')).toBe(false);
  });
});

describe('CARAVANE · D4 — R-43 inchangée ailleurs, embarquement, déterminisme', () => {
  it('capture d\'un COLON : butin standard 10 or (jamais le tarif caravane)', () => {
    const st = makeState({
      width: 8,
      height: 5,
      units: [
        { id: 'col1', type: 'colon', owner: 'p1', q: H(2, 2).q, r: H(2, 2).r },
        { id: 'g2', type: 'guerrier', owner: 'p2', q: H(3, 2).q, r: H(3, 2).r },
      ],
    });
    st.players.p2!.treasury = 100;
    const { newState, events } = resolveTurn(st, { p2: [{ type: 'Move', unitId: 'g2', path: [H(2, 2)] }] }, SEED);
    expect(newState.players.p2!.treasury).toBe(100 + SETTLER_BOOTY_GOLD);
    const cap = events.find((e) => e.type === 'Captured' && e.unitId === 'col1');
    expect(cap && cap.type === 'Captured' && cap.caravanGold).toBeUndefined();
  });

  it('embarquement → dépose SUR une ville étrangère défendue = livraison', () => {
    const st = makeState({
      width: 8,
      height: 7,
      terrainOverrides: (() => {
        const o: Record<string, TerrainId> = {};
        for (let col = 0; col < 8; col++) {
          o[`${H(col, 3).q},${H(col, 3).r}`] = 'eau';
        }
        return o;
      })(),
      units: [
        { id: 'c1', type: 'caravane', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, aboard: 'n1' },
        { id: 'n1', type: 'galere', owner: 'p1', q: H(0, 3).q, r: H(0, 3).r, cargo: 'c1' },
        { id: 'g2', type: 'guerrier', owner: 'p2', q: H(1, 4).q, r: H(1, 4).r },
      ],
      cities: [{ id: 'port2', owner: 'p2', q: H(1, 4).q, r: H(1, 4).r, pop: 3 }],
    });
    st.players.p1!.treasury = 100;
    st.players.p2!.treasury = 100;
    const { newState, events } = resolveTurn(
      st,
      {
        p1: [
          { type: 'Move', unitId: 'n1', path: [H(1, 3)] },
          { type: 'Move', unitId: 'c1', path: [H(1, 4)] },
        ],
      },
      SEED,
    );
    expect(newState.units['c1']).toBeUndefined(); // livrée et consommée
    expect(newState.players.p1!.treasury).toBe(180);
    expect(newState.players.p2!.treasury).toBe(150);
    expect(events.find((e) => e.type === 'CaravanDelivered')).toMatchObject({ villeId: 'port2' });
    expect(getUnit(newState, 'g2')).toBeDefined(); // défenseur intact
  });

  it('déterminisme : deux résolutions identiques → mêmes trésoreries et événements', () => {
    const run = () => {
      const st = etatLivraison({ eraLivreur: 'medievale' });
      const r = resolveTurn(st, { p1: [{ type: 'Move', unitId: 'c1', path: [H(2, 2), H(3, 2)] }] }, SEED);
      return {
        t1: r.newState.players.p1!.treasury,
        t2: r.newState.players.p2!.treasury,
        events: r.events.map((e) => e.type),
      };
    };
    expect(run()).toEqual(run());
  });

  it('la caravane n\'attaque jamais et ne fonde pas (données D4/D6)', () => {
    const car = unitType('caravane');
    expect(car.canAttack).toBe(false);
    expect(car.canFoundCity).toBe(false);
    expect(car.implemented).toBe(true);
  });
});

function events0(events: Array<{ type: string }>, type: string): boolean {
  return events.some((e) => e.type === type);
}
