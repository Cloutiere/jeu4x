/**
 * BOT-MARCHE (décisions Erik 28/10) — L3 sonde de MARCHE sur le corpus banc
 * (40 seeds × 3 difficultés, civs réelles P7) : par guerre, la fusion canon
 * R-31 est-elle émise (ArmyFormed), l'effectif au rayon de ralliement est-il
 * atteint, et la distMin du déclarant vers sa cible de campagne décroît-elle
 * de façon MONOTONE (D1) ?
 *
 * Le tableau D5 (percée/captures/écrasement/ρ) vient du banc horloge
 * (tests-banc/banc-horloge-distance.test.ts, ré-exécuté APRÈS — avant
 * conservé : devtmp/banc-horloge-AVANT-marche.json). Artefact sonde :
 * devtmp/banc-bot-marche.json. HORS CI (gate BANC_BOT_TD).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import {
  applyDeclareWar,
  applyProposePeace,
  createInitialState,
  createRng,
  generateProceduralMap,
  hexDistanceW,
  resolveTurn,
} from '@game/rules';
import type { GameState, Order } from '@game/rules';
import {
  assignerArmee,
  botPolicy,
  botTurnSeed,
  cibleCampagne,
  deciderPaix,
  profileDuBot,
} from '../src/botPolicy.js';
import { corpusBanc } from '../src/bancBotTd.js';
import { tiragePaireCivs } from '../src/bancObservation.js';

const TAILLE = 40;
const TOURS = 150;
const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;

interface SondeGuerre {
  seed: number;
  difficulte: string;
  declarant: string;
  tourDeclaration: number;
  duree: number;
  distCible: number;
  /** ArmyFormed reçus par le déclarant pendant la guerre (fusion R-31). */
  armeesFormees: number;
  formArmyEmis: number;
  maxEffectif: number;
  maxRequis: number;
  /** Augmentations de distMin d'un tour à l'autre (> +1 : mort du membre le
   *  plus proche puis recomposition — comptées sinon). */
  regressionsDistMin: number;
  distMin: number | null;
  capturesDeclarant: number;
}

const dIt = process.env.BANC_BOT_TD ? it : it.skip;
dIt('banc BOT-MARCHE — sonde de marche (corpus 40×3, civs réelles)', () => {
  const corpus = corpusBanc(TAILLE);
  const sondes: SondeGuerre[] = [];

  for (const difficulte of DIFFICULTES) {
    const prof = profileDuBot(difficulte);
    for (const seed of corpus) {
      const paire = tiragePaireCivs(seed);
      const { map } = generateProceduralMap(seed, { playerCount: 2 });
      let state: GameState = createInitialState(map, seed, {
        p1: { civId: paire.p1 },
        p2: { civId: paire.p2 },
      });
      const seedPartie = state.rngSeed;
      const courantes: Record<string, SondeGuerre | undefined> = {};
      const distMinPrec: Record<string, number | undefined> = {};
      for (let t = 0; t < TOURS && state.winner === null; t++) {
        const orders: Record<string, Order[]> = { p1: [], p2: [] };
        for (const id of ['p1', 'p2'] as const) {
          if (state.players[id]?.defeated === true) continue;
          const rng = createRng(botTurnSeed(seedPartie, state.turn, id));
          const plan = botPolicy(state, id, rng, difficulte);
          orders[id] = plan.orders;
          if (courantes[id]) courantes[id]!.formArmyEmis += plan.orders.filter((o) => o.type === 'FormArmy').length;
          for (const a of plan.actions) {
            if (a.type === 'DeclareWar') {
              const r = applyDeclareWar(state, id, a.player);
              if (r.ok) {
                state = r.state;
                const capCible = Object.values(state.cities).find((c) => c.owner === a.player && c.capital)
                  ?? Object.values(state.cities).find((c) => c.owner === a.player);
                const capMe = Object.values(state.cities).find((c) => c.owner === id && c.capital)
                  ?? Object.values(state.cities).find((c) => c.owner === id);
                courantes[id] = {
                  seed,
                  difficulte,
                  declarant: id,
                  tourDeclaration: state.turn,
                  duree: 0,
                  distCible: capCible && capMe ? hexDistanceW(capMe, capCible, state.mapWidth) : 0,
                  armeesFormees: 0,
                  formArmyEmis: 0,
                  maxEffectif: 0,
                  maxRequis: 0,
                  regressionsDistMin: 0,
                  distMin: null,
                  capturesDeclarant: 0,
                };
                distMinPrec[id] = undefined;
              }
            } else if (a.type === 'ProposePeace') {
              const acc = deciderPaix(state, a.player, id, prof);
              const r2 = applyProposePeace(state, id, a.player, acc);
              if (r2.ok) state = r2.state;
            }
          }
        }
        const res = resolveTurn(state, orders, state.rngSeed);
        for (const e of res.events) {
          if (e.type === 'CityCaptured') {
            const vers = e.toOwner;
            if (courantes[vers]) courantes[vers]!.capturesDeclarant += 1;
          }
          if (e.type === 'ArmyFormed') {
            if (courantes[e.owner]) courantes[e.owner]!.armeesFormees += 1;
          }
        }
        state = res.newState;
        for (const id of ['p1', 'p2'] as const) {
          const g = courantes[id];
          if (!g) continue;
          g.duree = state.turn - g.tourDeclaration;
          const camp = cibleCampagne(state, id, prof);
          if (camp) {
            const armee = assignerArmee(state, id, prof, camp);
            const membres = Object.values(state.units).filter((u) => u.owner === id && armee.has(u.id) && !u.aboard);
            const effectif = membres.filter((m) => hexDistanceW(m, camp, state.mapWidth) <= prof.rayonRalliement).length;
            g.maxEffectif = Math.max(g.maxEffectif, effectif);
            g.maxRequis = Math.max(g.maxRequis, Math.min(prof.tailleArmee, membres.length));
            if (membres.length > 0) {
              const dm = Math.min(...membres.map((m) => hexDistanceW(m, camp, state.mapWidth)));
              g.distMin = g.distMin === null ? dm : Math.min(g.distMin, dm);
              const prec = distMinPrec[id];
              if (prec !== undefined && dm > prec + 1) g.regressionsDistMin += 1;
              distMinPrec[id] = dm;
            }
          }
        }
      }
      for (const id of ['p1', 'p2'] as const) {
        if (courantes[id]) sondes.push(courantes[id]!);
      }
    }
  }

  console.log('\n=== BANC BOT-MARCHE — sonde de marche par difficulté ===');
  console.log('| Diff | Guerres | ArmyFormed | FormArmy émis | effectif/requis | distMin moy | régressions/guerre | captures |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const difficulte of DIFFICULTES) {
    const gs = sondes.filter((s) => s.difficulte === difficulte);
    const moy = (f: (s: SondeGuerre) => number) => (gs.length ? gs.reduce((a, s) => a + f(s), 0) / gs.length : 0);
    const dmMoy = (() => {
      const vals = gs.map((s) => s.distMin).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : -1;
    })();
    console.log(
      `| ${difficulte} | ${gs.length} | ${gs.reduce((a, s) => a + s.armeesFormees, 0)} | ${gs.reduce((a, s) => a + s.formArmyEmis, 0)} | ` +
      `${(moy((s) => (s.maxRequis > 0 ? s.maxEffectif / s.maxRequis : 0)) * 100).toFixed(0)}% | ${dmMoy.toFixed(1)} | ${moy((s) => s.regressionsDistMin).toFixed(2)} | ${gs.reduce((a, s) => a + s.capturesDeclarant, 0)} |`,
    );
  }

  const dest = resolve(dirname(fileURLToPath(import.meta.url)), '../../../devtmp');
  mkdirSync(dest, { recursive: true });
  const chemin = join(dest, 'banc-bot-marche.json');
  writeFileSync(chemin, JSON.stringify({ sondes }, null, 1));
  console.log(`\nartefact: ${chemin}`);
});
