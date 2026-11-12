/**
 * JEV-ESCORTE (canon Erik 12/11, prod D3UUQJ) — branchement L2 côté
 * botPolicy PARTAGÉ (le veto s'applique au-dessus du choix de production,
 * bot classique ET Jev — même philosophie que le gate R-190).
 *
 * Le cas D3UUQJ reconstitué À L'ARBITRAGE : pop au seuil, 0 combattante,
 * camp barbare connu à dist ≤ 3 du site par défaut → l'arbitre émet le
 * PIVOT guerrier au lieu du colon. Risque faible → le colon passe (canon :
 * pas un interdit — un pari).
 */
import { describe, expect, it } from 'vitest';
import { BARBARIAN_ID, BOT_SETTINGS, makeState } from '@game/rules';
import type { GameState, TerrainId } from '@game/rules';
import { arbitrerProduction, ecoDuBot } from '../src/botPolicy.js';

const BOT = 'p2';
const ECO = BOT_SETTINGS.economie;

function state(opts: {
  villages?: Array<{ q: number; r: number }>;
  units?: Array<{ id: string; type: string; owner: string; q: number; r: number; hp?: number }>;
  terrainOverrides?: Record<string, TerrainId>;
}): GameState {
  const s = makeState({
    width: 12,
    height: 12,
    players: ['p1', BOT],
    units: (opts.units ?? []).map((u) => ({ ...u, aboard: null, cargo: null })),
    cities: [
      { id: 'c1', owner: BOT, q: 3, r: 3, pop: ECO.seuilPopColonne, capital: true, workedTiles: [], buildings: [] },
    ],
    ...(opts.terrainOverrides ? { terrainOverrides: opts.terrainOverrides } : {}),
    ...(opts.villages ? { villages: opts.villages } : {}),
    rngSeed: 42,
  }) as GameState;
  return s;
}

describe('JEV-ESCORTE · arbitrage production bot partagé (D1/D2)', () => {
  it('D3UUQJ reconstitué : 0 combattante + camp à dist ≤ 3 du site → PIVOT guerrier (rouge avant fix)', () => {
    // Camp à dist 1 du site par défaut attendu (le plus proche case libre
    // autour de la capitale) — le site (4,3) est à dist 1 du camp (4,4).
    const s = state({ villages: [{ q: 4, r: 4 }] });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'unit', id: 'guerrier' });
  });

  it('risque faible (aucun camp, aucun ennemi) → le colon passe (canon : un pari bon)', () => {
    const s = state({});
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'unit', id: 'colon' });
  });

  it('risque élevé MAIS combattante disponible (escorte en place) → le colon passe (D3)', () => {
    const s = state({
      villages: [{ q: 4, r: 4 }],
      units: [{ id: 'g1', type: 'guerrier', owner: BOT, q: 8, r: 8 }], // hors garnison
    });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'unit', id: 'colon' });
  });

  it('risque élevé, combattante FORTIFIÉE en garnison → ATTENDRE (retombée ③ bâtiment)', () => {
    const s = state({
      villages: [{ q: 4, r: 4 }],
      units: [{ id: 'g1', type: 'guerrier', owner: BOT, q: 3, r: 3, hp: 3 }],
    });
    // La garnison est sur (3,3) = la capitale : on la fortifie après coup.
    s.units['g1']!.fortified = true;
    s.players[BOT]!.techsUnlocked = ['poterie']; // un bâtiment ③ disponible
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item?.kind).toBe('building'); // ③ bâtiment économique — pas le colon
  });

  it('satellite barbare ENGENDRÉ (unité connue à portée de marche du site) → pivot aussi', () => {
    // (4,4) est à portée 3 des DEUX cases candidates dist 1 de la capitale
    // ((2,3) : dist 3 ; (4,3) : dist 1) — le verdict ne dépend pas du tie-break.
    const s = state({
      units: [{ id: 'sat', type: 'guerrier', owner: BARBARIAN_ID, q: 4, r: 4 }],
    });
    const item = arbitrerProduction(s.cities['c1']!, s.players[BOT]!, [s.cities['c1']!], s, ecoDuBot(), false, false);
    expect(item).toEqual({ kind: 'unit', id: 'guerrier' });
  });
});
