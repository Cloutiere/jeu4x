/**
 * DIPLOMATIE-T1 (Erik 19/10) — côté serveur :
 *  - D3 : la forme de DeclareWar est validée EN PREMIER (orderShapeError,
 *    leçon 7f — même contrat que SetGovernment) ;
 *  - D4 : la politique des bots ne propose JAMAIS DeclareWar (T1 minimal —
 *    l'initiative de guerre des bots est T2/T3).
 */
import { describe, expect, it } from 'vitest';
import { orderShapeError } from '../src/game.js';
import { botPolicy, botTurnSeed, type BotPlan } from '../src/botPolicy.js';
import { createRng } from '@game/rules';
import { createInitialState, loadBuiltinMapSync, type GameState, type Order } from '@game/rules';

describe('orderShapeError · DeclareWar (DIPLOMATIE-T1 D3)', () => {
  it('exige une nation cible (chaîne), refuse tout le reste', () => {
    expect(orderShapeError({ type: 'DeclareWar', player: 'p2' })).toBeNull();
    expect(orderShapeError({ type: 'DeclareWar', player: 42 })).not.toBeNull();
    expect(orderShapeError({ type: 'DeclareWar' })).not.toBeNull();
  });
});

describe('botPolicy · D4 — les bots ne déclarent pas la guerre', () => {
  it('aucun plan de bot ne porte une action DeclareWar (union BotAction)', () => {
    const carte = loadBuiltinMapSync('pedagogique-40');
    const etat: GameState = createInitialState(carte, 1234);
    const plans: BotPlan[] = [];
    for (const engineId of Object.keys(etat.players)) {
      for (let turn = 0; turn < 5; turn++) {
        const plan = botPolicy(etat, engineId, createRng(botTurnSeed(1234, turn, engineId)));
        plans.push(plan);
      }
    }
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      for (const action of plan.actions) {
        expect((action as { type: string }).type).not.toBe('DeclareWar');
      }
      for (const order of plan.orders as Order[]) {
        expect((order as { type: string }).type).not.toBe('DeclareWar');
      }
    }
  });
});
