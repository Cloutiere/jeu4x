/** TEMP — sonde L1 BOT-MARCHE : pourquoi les membres d'armée ne marchent pas. */
import { describe, it } from 'vitest';
import {
  applyDeclareWar,
  applyProposePeace,
  createRng,
  createInitialState,
  generateProceduralMap,
  hexDistanceW,
  resolveTurn,
} from '@game/rules';
import {
  assignerArmee,
  botPolicy,
  botTurnSeed,
  cibleCampagne,
  deciderPaix,
  poolExcedentaire,
  profileDuBot,
  assignerObjectifs,
} from '../src/botPolicy.js';
import { tiragePaireCivs } from '../src/bancObservation.js';

const dIt = process.env.BANC_BOT_TD ? it : it.skip;
dIt('sonde marche', () => {
  const diff = 'difficile';
  const seed = 2896796234;
  const { map } = generateProceduralMap(seed, { playerCount: 2 });
  const civs = tiragePaireCivs(seed);
  let state = createInitialState(map, seed, { p1: { civId: civs.p1 }, p2: { civId: civs.p2 } });
  const seedPartie = state.rngSeed;
  const prof = profileDuBot(diff);
  for (let t = 0; t < 120 && state.winner === null; t++) {
    const orders: Record<string, any[]> = { p1: [], p2: [] };
    for (const id of ['p1', 'p2'] as const) {
      if (state.players[id]?.defeated) continue;
      const rng = createRng(botTurnSeed(seedPartie, state.turn, id));
      const plan = botPolicy(state, id, rng, diff);
      orders[id] = plan.orders;
      for (const a of plan.actions) {
        if (a.type === 'DeclareWar') {
          const r = applyDeclareWar(state, id, a.player);
          if (r.ok) { state = r.state; console.log(`t${state.turn} GUERRE ${id} -> ${a.player}`); }
        } else if (a.type === 'ProposePeace') {
          const acc = deciderPaix(state, a.player, id, prof);
          const r2 = applyProposePeace(state, id, a.player, acc);
          if (r2.ok) { state = r2.state; console.log(`t${state.turn} PAIX ${id} -> ${a.player} (acc=${acc})`); }
        }
      }
    }
    const enGuerre = (state.diplomacy.war?.length ?? 0) > 0;
    if (enGuerre) {
      const camp = cibleCampagne(state, 'p1', prof);
      if (camp) {
        const armee = assignerArmee(state, 'p1', prof, camp);
        const pool = poolExcedentaire(state, 'p1', prof);
        const membres = Object.values(state.units).filter((u) => u.owner === 'p1' && armee.has(u.id) && !u.aboard);
        const objs = assignerObjectifs(state, 'p1', prof);
        const det = membres
          .map((u) => {
            const o = objs.get(u.id);
            const d = hexDistanceW(u, camp, state.mapWidth);
            const ordre = orders.p1.find((x: any) => x.unitId === u.id)?.type ?? '?';
            return `${u.id}${u.isArmy ? '*' : ''}:d${d}:${o?.kind}:${ordre}`;
          })
          .join(' ');
        console.log(`t${state.turn} camp=(${camp.q},${camp.r}) pool=${pool.length} armee=${membres.length} requis=${Math.min(prof.tailleArmee, membres.length)} | ${det}`);
      }
    }
    state = resolveTurn(state, orders, state.rngSeed).newState;
  }
});
